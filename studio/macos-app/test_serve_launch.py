#!/usr/bin/env python3
"""Checks the Studio AI launch endpoint of serve_vellum.py with a stand-in script.

Run: python3 studio/macos-app/test_serve_launch.py
"""
import json
import os
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
tmp = Path(tempfile.mkdtemp())
marker = tmp / "started.txt"
fake = tmp / "fake-studio.py"
fake.write_text(f"import time,pathlib\npathlib.Path({str(marker)!r}).write_text('yes')\ntime.sleep(120)\n")

with socket.socket() as s:
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
base = f"http://127.0.0.1:{port}"
srv = subprocess.Popen([sys.executable, str(HERE / "serve_vellum.py"), "--port", str(port)],
                       env={**os.environ, "VELLUM_STUDIO_SCRIPT": str(fake)},
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
fails = 0


def check(name, ok):
    global fails
    print(("PASS  " if ok else "FAIL  ") + name)
    fails += not ok


def post(headers):
    req = urllib.request.Request(base + "/launch/studio-ai", data=b"", method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, None


try:
    for _ in range(50):
        try:
            urllib.request.urlopen(base + "/app-health", timeout=1)
            break
        except OSError:
            time.sleep(0.1)
    with urllib.request.urlopen(base + "/launch/studio-ai", timeout=5) as r:
        check("GET reports the launcher as available", json.loads(r.read()) == {"available": True})
    own = {"Origin": base, "X-Studio-Client": "canvas"}
    check("no Origin is refused", post({"X-Studio-Client": "canvas"})[0] == 403)
    check("another site is refused", post({"Origin": "https://example.com", "X-Studio-Client": "canvas"})[0] == 403)
    check("another local port is refused", post({"Origin": "http://127.0.0.1:1", "X-Studio-Client": "canvas"})[0] == 403)
    check("missing client header is refused", post({"Origin": base})[0] == 403)
    check("nothing was started by refused requests", not marker.exists())
    code, body = post(own)
    for _ in range(50):
        if marker.exists():
            break
        time.sleep(0.1)
    check("the page's own origin starts Studio AI", code == 200 and body == {"ok": True, "started": True} and marker.exists())
    code, body = post(own)
    check("a second press doesn't start a second copy", code == 200 and body == {"ok": True, "started": False})
    child = subprocess.run(["pgrep", "-f", str(fake)], capture_output=True, text=True).stdout.split()
    srv.send_signal(signal.SIGTERM)
    srv.wait(timeout=5)
    time.sleep(0.5)
    alive = [p for p in child if subprocess.run(["kill", "-0", p], capture_output=True).returncode == 0]
    check("quitting the server stops the Studio AI it started", bool(child) and not alive)
finally:
    if srv.poll() is None:
        srv.kill()
    subprocess.run(["pkill", "-f", str(fake)], capture_output=True)

print(f"{'all passed' if not fails else str(fails) + ' failed'}")
sys.exit(1 if fails else 0)
