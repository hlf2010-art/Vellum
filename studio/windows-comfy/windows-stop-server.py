#!/usr/bin/env python3
"""Authenticated private-LAN control endpoint for stopping Windows ComfyUI cleanly."""
import hmac
import json
import os
import secrets
import base64
import threading
import time
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import build_opener, ProxyHandler

BIND_HOST = os.environ.get("WINDOWS_STOP_BIND", "10.0.11.55")
BIND_PORT = int(os.environ.get("WINDOWS_STOP_PORT", "8189"))
COMFY_BASE = os.environ.get("COMFY_LOCAL_BASE", "http://127.0.0.1:8188")
TOKEN_FILE = Path(os.environ.get("STUDIO_CTRL_TOKEN_FILE", Path(__file__).resolve().parent / ".ctrl_token"))

http = build_opener(ProxyHandler({}))


def load_or_create_token() -> str:
    env_tok = os.environ.get("STUDIO_CTRL_TOKEN", "").strip()
    if env_tok:
        return env_tok
    if TOKEN_FILE.exists():
        tok = TOKEN_FILE.read_text(encoding="utf-8").strip()
        if tok:
            return tok
    tok = secrets.token_urlsafe(32)
    TOKEN_FILE.write_text(tok + "\n", encoding="utf-8")
    return tok


TOKEN = None  # Initialized only when serving; importing tests creates no credential.
STOP_LOCK = threading.Lock()


# Exact values must be configured from a reviewed live process before deployment.
EXPECTED_EXE = os.environ.get("COMFY_EXPECTED_EXE", "")
EXPECTED_COMMAND = os.environ.get("COMFY_EXPECTED_COMMAND", "")


def powershell(script, extra=None):
    if os.name != "nt":
        raise RuntimeError("Windows control is only supported on Windows")
    env = os.environ.copy()
    env.update(extra or {})
    encoded = base64.b64encode(script.encode("utf-16le")).decode("ascii")
    r = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
                       capture_output=True, text=True, timeout=12, env=env)
    if r.returncode:
        raise RuntimeError("Windows process inspection/termination failed")
    return json.loads(r.stdout)


SNAPSHOT = r"""
$ErrorActionPreference='Stop'
$all=@(Get-NetTCPConnection -State Listen -ErrorAction Stop)
$ls=@($all|Where-Object {$_.LocalPort -eq 8188})
if(!$ls.Count){'null';exit 0}
$ids=@($ls.OwningProcess|Sort-Object -Unique)
if($ids.Count -ne 1){throw 'Ambiguous listener'}
if(@($ls|Where-Object {$_.LocalAddress -notin @('127.0.0.1','10.0.11.55')}).Count){throw 'Unexpected bind'}
$p=Get-CimInstance Win32_Process -Filter "ProcessId=$($ids[0])"
$proc=Get-Process -Id $ids[0] -ErrorAction Stop
@{pid=[int]$p.ProcessId;exe=$p.ExecutablePath;command=$p.CommandLine;ticks=$proc.StartTime.ToUniversalTime().Ticks.ToString()}|ConvertTo-Json -Compress
"""


def inspect_target():
    if COMFY_BASE != "http://127.0.0.1:8188":
        raise RuntimeError("Unreviewed Comfy endpoint")
    info = powershell(SNAPSHOT)
    if info is None:
        return None
    if not EXPECTED_EXE or not EXPECTED_COMMAND:
        raise RuntimeError("Exact expected executable and command are not configured")
    if (not isinstance(info, dict) or type(info.get("pid")) is not int or info["pid"] <= 1
            or not info.get("ticks") or info.get("exe", "").casefold() != EXPECTED_EXE.casefold()
            or info.get("command") != EXPECTED_COMMAND):
        raise RuntimeError("Listener identity mismatch")
    return info


def require_idle():
    with http.open(COMFY_BASE + "/queue", timeout=3) as r:
        q = json.load(r)
    if not isinstance(q, dict) or any(type(q.get(k)) is not list for k in ("queue_running", "queue_pending")):
        raise RuntimeError("Queue state unknown")
    if q["queue_running"] or q["queue_pending"]:
        raise RuntimeError("Comfy queue is busy; refusing stop")


def terminate_verified(info):
    # Hold a .NET process handle: never taskkill a PID or an unverified process tree.
    script = r"""
$ErrorActionPreference='Stop'
$p=Get-Process -Id ([int]$env:CTRL_PID) -ErrorAction Stop
$handle=$p.Handle
if($p.StartTime.ToUniversalTime().Ticks.ToString() -ne $env:CTRL_TICKS){throw 'PID reused'}
$c=Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)"
if($c.ExecutablePath -ine $env:CTRL_EXE -or $c.CommandLine -cne $env:CTRL_COMMAND){throw 'Identity changed'}
$ls=@(Get-NetTCPConnection -State Listen -ErrorAction Stop|Where-Object {$_.LocalPort -eq 8188})
if(!$ls.Count -or @($ls|Where-Object {$_.OwningProcess -ne $p.Id -or $_.LocalAddress -notin @('127.0.0.1','10.0.11.55')}).Count){throw 'Listener changed'}
$q=Invoke-RestMethod -Uri 'http://127.0.0.1:8188/queue' -TimeoutSec 3
if($null -eq $q.queue_running -or $null -eq $q.queue_pending -or $q.queue_running -isnot [array] -or $q.queue_pending -isnot [array]){throw 'Unknown queue'}
if($q.queue_running.Count -or $q.queue_pending.Count){throw 'Queue busy'}
if($p.HasExited){throw 'Target exited before stop'}
$p.Kill()
if(!$p.WaitForExit(5000)){throw 'Process did not exit'}
'{"exited":true}'
"""
    r = powershell(script, {"CTRL_PID": str(info["pid"]), "CTRL_TICKS": str(info["ticks"]),
                           "CTRL_EXE": info["exe"], "CTRL_COMMAND": info["command"]})
    if r != {"exited": True}:
        raise RuntimeError("Termination was not confirmed")


def stop_comfy_process():
    # Serializes control calls only. Comfy /prompt admission is NOT locked:
    # a residual queue-to-kill race exists; deploy only with submission quiesced.
    with STOP_LOCK:
        try:
            target = inspect_target()
            if target is None:
                return 200, {"stopped": True, "terminated": False, "detail": "Already stopped", "auto_restart": False}
            require_idle()
            if inspect_target() != target:
                raise RuntimeError("Target identity changed")
            require_idle()
            terminate_verified(target)
            for _ in range(10):
                if inspect_target() is None:
                    return 200, {"stopped": True, "terminated": True, "pid": target["pid"], "auto_restart": False}
                time.sleep(0.2)
            raise RuntimeError("Listener remains or was restarted")
        except Exception:
            # Never leak commands, tokens or exception contents into HTTP responses.
            return 409, {"stopped": False, "terminated": False, "detail": "Stop refused or could not be verified; inspect identity and queue", "auto_restart": False}


class StopHandler(BaseHTTPRequestHandler):
    def _authorized(self) -> bool:
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return False
        supplied = auth[7:].strip()
        return bool(TOKEN) and hmac.compare_digest(supplied.encode("utf-8"), TOKEN.encode("utf-8"))

    def _reply(self, status: int, body: dict):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self._authorized():
            return self._reply(401, {"error": "Unauthorized"})
        if self.path != "/status":
            return self._reply(404, {"error": "Not found"})
        try:
            info = inspect_target()
            return self._reply(200, {"pid": info["pid"] if info else None, "running": info is not None})
        except Exception:
            return self._reply(503, {"error": "Process identity unavailable or unverified"})

    def do_POST(self):
        if not self._authorized():
            return self._reply(401, {"error": "Unauthorized"})
        if self.path != "/stop":
            return self._reply(404, {"error": "Not found"})
        status, result = stop_comfy_process()
        return self._reply(status, result)

    def log_message(self, fmt, *args):
        print(f"[windows-stop] {fmt % args}", flush=True)


if __name__ == "__main__":
    TOKEN = load_or_create_token()
    print(f"[windows-stop] Token file: {TOKEN_FILE}", flush=True)
    print(f"[windows-stop] Listening on http://{BIND_HOST}:{BIND_PORT} (POST /stop only)", flush=True)
    ThreadingHTTPServer((BIND_HOST, BIND_PORT), StopHandler).serve_forever()
