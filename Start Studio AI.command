#!/usr/bin/env python3
"""Loopback inference for Infinite Canvas Studio. Double-click the .command copy on macOS."""
import atexit
import base64
import contextlib
import hashlib
import html as html_lib
import json
import os
from pathlib import Path
import re
import secrets
import signal
import shutil
import socket
import subprocess
import sys
import threading
import time
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import ProxyHandler, Request, build_opener, urlopen

_LOCAL_OPENER = build_opener(ProxyHandler({}))


def local_urlopen(target, timeout=5):
    return _LOCAL_OPENER.open(target, timeout=timeout)

PORT = 59631
MODEL_DIR = Path.home() / "Library/Caches/InfiniteCanvas/models"
ACTIVE_FILE = MODEL_DIR / "active_model.txt"
DEFAULT_MODEL_ID = "qwen3-vl-4b"
MODELS = {
    "qwen3-vl-4b": {
        "id": "qwen3-vl-4b",
        "label": "Qwen3-VL 4B",
        "model": "Qwen3-VL-4B-Instruct",
        "tier": "Fast",
        "vision": True,
        "base": "https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/1cd86afb9a95c410a6038ab3b40d8b578c892266/",
        "files": [
            {"name": "Qwen3VL-4B-Instruct-Q4_K_M.gguf", "sha256": "66358cb18bb6b3b1b6675aa412c7a88ef01d228f481184d13668e5201c730a0a", "size": 2497281664},
            {"name": "mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf", "sha256": "30ba2c7dd3127a4561b6cba9d13d0f711c91bdb38742e2f56d73c8cb596bd06d", "size": 453974304},
        ],
    },
    "qwen3-vl-8b": {
        "id": "qwen3-vl-8b",
        "label": "Qwen3-VL 8B",
        "model": "Qwen3-VL-8B-Instruct",
        "tier": "Quality",
        "vision": True,
        "base": "https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/f982a07559d4a2f6c8744d840bf6fccab30eea96/",
        "files": [
            {"name": "Qwen3VL-8B-Instruct-Q4_K_M.gguf", "sha256": "67d1659bfe71b89d50b45a4ad1a9e5b997e5bb16ce5da66a6a6167abd569e9e2", "size": 5027784800},
            {"name": "mmproj-Qwen3VL-8B-Instruct-Q8_0.gguf", "sha256": "c6ba85508d82f42590e6eb77d5340369ab6fecf107a7561d809523d8aa5f3bfd", "size": 752289728},
        ],
    },
}
SITE_NAME = "Infinite Canvas - Studio.html"
SITE = Path(__file__).resolve().parent / SITE_NAME
if not SITE.exists():
    SITE = SITE.parent.parent / SITE_NAME
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
ENGINE = None
DL_PROC = None
READY = threading.Event()
MODEL_KEY = secrets.token_urlsafe(32)
MODEL_PORT = 0
START_ERROR = ""
PROGRESS_TEXT = ""
SWITCH_GEN = 0
MODEL_LOCK = threading.Lock()
MODEL_THREAD = None
os.environ["PATH"] = "/opt/homebrew/bin:/usr/local/bin:" + os.environ.get("PATH", "")


def load_active_id():
    try:
        mid = ACTIVE_FILE.read_text().strip()
        if mid in MODELS:
            return mid
    except OSError:
        pass
    return DEFAULT_MODEL_ID


def save_active_id(mid):
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    ACTIVE_FILE.write_text(mid)


ACTIVE_ID = load_active_id()


def active_spec():
    return MODELS.get(ACTIVE_ID, MODELS[DEFAULT_MODEL_ID])


def is_cached(spec):
    return all((MODEL_DIR / f["name"]).exists() for f in spec["files"])


def live_progress():
    spec = active_spec()
    if START_ERROR or (READY.is_set() and ENGINE and ENGINE.poll() is None):
        return ""
    for f in spec["files"]:
        dest = MODEL_DIR / f["name"]
        part = MODEL_DIR / (f["name"] + ".part")
        if not dest.exists() and part.exists():
            with contextlib.suppress(OSError):
                got = part.stat().st_size
                tot = f["size"]
                pct = min(99, int(got * 100 / tot)) if tot else 0
                return f"Downloading {spec['label']} · {pct}% ({got / 1e9:.1f} / {tot / 1e9:.1f} GB)"
    return PROGRESS_TEXT


def model_inventory():
    items = []
    for mid, spec in MODELS.items():
        total_bytes = sum(f["size"] for f in spec["files"])
        cached = is_cached(spec)
        items.append({
            "id": mid,
            "label": spec["label"],
            "model": spec["model"],
            "tier": spec["tier"],
            "vision": spec["vision"],
            "bytes": total_bytes,
            "cached": cached,
            "active": mid == ACTIVE_ID,
        })
    return items


def stop_download():
    global DL_PROC
    if DL_PROC and DL_PROC.poll() is None:
        DL_PROC.terminate()
        with contextlib.suppress(subprocess.TimeoutExpired):
            DL_PROC.wait(timeout=3)
    DL_PROC = None


def ensure_weights(spec, gen):
    global DL_PROC, PROGRESS_TEXT
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for f in spec["files"]:
        if gen != SWITCH_GEN:
            return False
        name, digest = f["name"], f["sha256"]
        dest = MODEL_DIR / name
        if dest.exists():
            continue
        partial = MODEL_DIR / (name + ".part")
        PROGRESS_TEXT = f"Preparing {spec['label']}…"
        print("Preparing", name, flush=True)
        DL_PROC = subprocess.Popen(
            ["curl", "-fsSL", "--retry", "3", "-C", "-", "-o", str(partial), spec["base"] + name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
        rc = DL_PROC.wait()
        err_tail = (DL_PROC.stderr.read() if DL_PROC.stderr else "").strip()
        DL_PROC = None
        if gen != SWITCH_GEN:
            return False
        if rc != 0:
            raise RuntimeError(err_tail or f"Could not download {name}")
        PROGRESS_TEXT = f"Verifying {name}…"
        h = hashlib.sha256()
        with partial.open("rb") as src:
            for block in iter(lambda: src.read(8 << 20), b""):
                if gen != SWITCH_GEN:
                    return False
                h.update(block)
        if h.hexdigest() != digest:
            partial.unlink(missing_ok=True)
            raise ValueError("Model download incomplete. Retry to download it again.")
        partial.replace(dest)
    return gen == SWITCH_GEN


def model_server(spec, gen):
    global ENGINE, MODEL_PORT, START_ERROR, PROGRESS_TEXT
    try:
        if gen != SWITCH_GEN:
            return
        PROGRESS_TEXT = f"Checking runtime for {spec['label']}…"
        tool = shutil.which("llama-server")
        if not tool:
            brew = shutil.which("brew")
            if not brew:
                raise RuntimeError("Install llama.cpp, then reopen Start Studio AI.command.")
            subprocess.run([brew, "install", "llama.cpp"], check=True)
            tool = shutil.which("llama-server")
        if not ensure_weights(spec, gen):
            return
        PROGRESS_TEXT = f"Loading {spec['label']} into memory…"
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            MODEL_PORT = sock.getsockname()[1]
        model, vision = [str(MODEL_DIR / f["name"]) for f in spec["files"]]
        opts = [tool, "-m", model, "--mmproj", vision, "--host", "127.0.0.1", "--port", str(MODEL_PORT),
                "--alias", spec["model"], "--ctx-size", "16384", "--parallel", "1", "--cache-ram", "0",
                "--no-webui", "--jinja", "--api-key", MODEL_KEY]
        # Release GPU memory during long editing sessions when the installed runtime supports idle sleep.
        help_text = subprocess.run([tool, "--help"], capture_output=True, text=True).stdout
        if "--repeat-penalty" in help_text:
            opts += ["--repeat-penalty", "1.12", "--repeat-last-n", "128"]
        if "--presence-penalty" in help_text:
            opts += ["--presence-penalty", "0.35", "--frequency-penalty", "0.25"]
        if "--dry-multiplier" in help_text:
            opts += ["--dry-multiplier", "0.8", "--dry-allowed-length", "3", "--dry-penalty-last-n", "512"]
        if "--sleep-idle-seconds" in help_text:
            opts += ["--sleep-idle-seconds", "300"]
        proc = subprocess.Popen(opts, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        with MODEL_LOCK:
            if gen != SWITCH_GEN:
                proc.terminate()
                return
            ENGINE = proc
        for _ in range(180):
            if gen != SWITCH_GEN:
                return
            if ENGINE.poll() is not None:
                raise RuntimeError("The local model stopped during startup. Reopen the launcher.")
            try:
                with local_urlopen(f"http://127.0.0.1:{MODEL_PORT}/health", timeout=2) as res:
                    if res.status == 200 and gen == SWITCH_GEN:
                        PROGRESS_TEXT = ""
                        READY.set()
                        print("Studio AI ready ·", spec["model"], flush=True)
                        return
            except (OSError, URLError):
                time.sleep(1)
        raise RuntimeError("The local model did not finish loading. Reopen the launcher.")
    except Exception as err:
        if gen != SWITCH_GEN:
            return
        PROGRESS_TEXT = ""
        START_ERROR = str(err)
        stop_model()
        print(START_ERROR, file=sys.stderr, flush=True)


USER_STOPPED = False


def start_model(force=False):
    global MODEL_THREAD, START_ERROR, SWITCH_GEN, PROGRESS_TEXT, USER_STOPPED
    with MODEL_LOCK:
        if not force:
            if MODEL_THREAD and MODEL_THREAD.is_alive():
                return
            if READY.is_set() and ENGINE and ENGINE.poll() is None:
                return
        USER_STOPPED = False
        SWITCH_GEN += 1
        gen = SWITCH_GEN
        READY.clear()
        START_ERROR = ""
        stop_download()
        stop_model()
        spec = active_spec()
        PROGRESS_TEXT = f"Starting {spec['label']}…"
        MODEL_THREAD = threading.Thread(target=model_server, args=(spec, gen), daemon=True)
        MODEL_THREAD.start()


speech_lock = threading.Lock()


def transcribe(audio):
    with speech_lock:
        cli = shutil.which("whisper-cli")
        if not cli:
            brew = shutil.which("brew")
            if not brew:
                raise RuntimeError("Install whisper-cpp for audio transcription.")
            subprocess.run([brew, "install", "whisper-cpp"], check=True, timeout=420)
            cli = shutil.which("whisper-cli")
        weights = MODEL_DIR / "ggml-base-q5_1.bin"
        if not weights.exists():
            part = weights.with_suffix(".download")
            url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base-q5_1.bin"
            subprocess.run(["curl", "-fsSL", "--retry", "2", "-o", str(part), url], check=True, timeout=240)
            if hashlib.sha256(part.read_bytes()).hexdigest() != "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898":
                raise ValueError("Speech model download incomplete")
            part.replace(weights)
        with tempfile.TemporaryDirectory() as folder:
            wav = Path(folder) / "clip.wav"
            wav.write_bytes(audio)
            target = str(Path(folder) / "speech")
            subprocess.run([cli, "-m", str(weights), "-f", str(wav), "-l", "auto", "-nt", "-otxt", "-of", target],
                           cwd=folder, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180, check=True)
            return Path(target + ".txt").read_text().strip()


MCP_PROTOCOL_VERSION = "2024-11-05"


def _http_json(url, method="GET", body=None, headers=None, timeout=18):
    req_headers = {"Accept": "application/json, text/event-stream", "User-Agent": "Vellum-Lumen-MCP/1.0"}
    if headers:
        req_headers.update({str(k): str(v) for k, v in headers.items() if v is not None and str(v) != ""})
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        req_headers.setdefault("Content-Type", "application/json")
    req = Request(url, data=data, method=method, headers=req_headers)
    try:
        with urlopen(req, timeout=timeout) as res:
            raw = res.read().decode("utf-8", errors="replace")
            return res.status, dict(res.headers.items()), raw
    except HTTPError as err:
        raw = err.read().decode("utf-8", errors="replace") if err.fp else str(err)
        raise RuntimeError(f"HTTP {err.code}: {raw[:400]}") from err


def _parse_mcp_payload(raw, content_type=""):
    text = (raw or "").strip()
    if not text:
        return None
    if "text/event-stream" in (content_type or "").lower() or text.startswith("event:") or text.startswith("data:"):
        last = None
        for ln in text.splitlines():
            ln = ln.strip()
            if not ln.startswith("data:"):
                continue
            chunk = ln[5:].strip()
            if not chunk or chunk == "[DONE]":
                continue
            with contextlib.suppress(json.JSONDecodeError):
                obj = json.loads(chunk)
                if isinstance(obj, dict) and ("result" in obj or "error" in obj):
                    last = obj
        if last is not None:
            return last
    return json.loads(text)


def mcp_http_rpc(url, method, params=None, headers=None, timeout=20):
    parsed = urlsplit(url or "")
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Invalid MCP server URL")
    base_headers = dict(headers or {})
    init_req = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": MCP_PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {"name": "VellumLumen", "version": "1.0"},
        },
    }
    init_info = {}
    with contextlib.suppress(Exception):
        _, resp_h, raw1 = _http_json(url, "POST", init_req, base_headers, timeout=min(timeout, 10))
        sid = resp_h.get("Mcp-Session-Id") or resp_h.get("mcp-session-id")
        if sid:
            base_headers["Mcp-Session-Id"] = sid
        p1 = _parse_mcp_payload(raw1, resp_h.get("Content-Type", ""))
        if isinstance(p1, dict) and isinstance(p1.get("result"), dict):
            init_info = p1["result"]
        _http_json(url, "POST", {"jsonrpc": "2.0", "method": "notifications/initialized"}, base_headers, timeout=5)
    call_req = {"jsonrpc": "2.0", "id": 2, "method": method, "params": params if params is not None else {}}
    _, resp_h2, raw2 = _http_json(url, "POST", call_req, base_headers, timeout=timeout)
    p2 = _parse_mcp_payload(raw2, resp_h2.get("Content-Type", ""))
    if not isinstance(p2, dict):
        raise RuntimeError("Empty or non-JSON MCP response")
    if "error" in p2 and p2["error"]:
        err = p2["error"]
        msg = err.get("message") if isinstance(err, dict) else str(err)
        raise RuntimeError(msg or "MCP server returned error")
    return {"serverInfo": init_info.get("serverInfo") or {}, "capabilities": init_info.get("capabilities") or {}, "result": p2.get("result")}


def _read_stdio_message(proc, target_id, deadline):
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line:
            if proc.poll() is not None:
                break
            time.sleep(0.02)
            continue
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.lower().startswith(b"content-length:"):
            length = int(stripped.split(b":", 1)[1].strip())
            while True:
                h_line = proc.stdout.readline()
                if not h_line or h_line in {b"\r\n", b"\n"}:
                    break
            payload = proc.stdout.read(length)
            obj = json.loads(payload.decode("utf-8", errors="replace"))
        else:
            try:
                obj = json.loads(stripped.decode("utf-8", errors="replace"))
            except json.JSONDecodeError:
                continue
        if isinstance(obj, dict) and obj.get("id") == target_id:
            return obj
    raise TimeoutError(f"Stdio MCP server timed out waiting for id={target_id}")


def mcp_stdio_rpc(command, args, env_map, method, params=None, timeout=22):
    cmd_name = str(command or "").strip()
    if not cmd_name:
        raise ValueError("Missing MCP stdio command")
    resolved = shutil.which(cmd_name) or (cmd_name if os.path.isabs(cmd_name) and os.path.exists(cmd_name) else None)
    if not resolved:
        raise FileNotFoundError(f"Command not found on PATH: {cmd_name}")
    safe_args = [str(a) for a in (args or [])]
    merged_env = dict(os.environ)
    for k, v in (env_map or {}).items():
        if k and v is not None:
            merged_env[str(k)] = str(v)
    proc = subprocess.Popen(
        [resolved, *safe_args],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=merged_env,
    )
    try:
        deadline = time.time() + timeout
        def send(obj):
            proc.stdin.write((json.dumps(obj) + "\n").encode("utf-8"))
            proc.stdin.flush()
        send({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": "VellumLumen", "version": "1.0"},
            },
        })
        init_msg = _read_stdio_message(proc, 1, min(deadline, time.time() + 14))
        init_info = init_msg.get("result") or {}
        send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        send({"jsonrpc": "2.0", "id": 2, "method": method, "params": params if params is not None else {}})
        resp = _read_stdio_message(proc, 2, deadline)
        if "error" in resp and resp["error"]:
            err = resp["error"]
            raise RuntimeError(err.get("message") if isinstance(err, dict) else str(err))
        return {"serverInfo": init_info.get("serverInfo") or {}, "capabilities": init_info.get("capabilities") or {}, "result": resp.get("result")}
    except Exception as err:
        err_tail = ""
        with contextlib.suppress(Exception):
            if proc.poll() is not None and proc.stderr:
                err_tail = proc.stderr.read().decode("utf-8", errors="replace").strip()[:260]
        raise RuntimeError(f"{err}{(' · ' + err_tail) if err_tail else ''}") from err
    finally:
        with contextlib.suppress(Exception):
            proc.terminate()
            proc.wait(timeout=1.5)
        with contextlib.suppress(Exception):
            if proc.poll() is None:
                proc.kill()


def _mcp_extract_text(result):
    if isinstance(result, str):
        return result
    if isinstance(result, dict):
        if isinstance(result.get("content"), list):
            parts = [c.get("text") or json.dumps(c) for c in result["content"] if isinstance(c, dict)]
            if parts:
                return "\n".join(parts)
        if isinstance(result.get("contents"), list):
            parts = [c.get("text") or c.get("blob") or "" for c in result["contents"] if isinstance(c, dict)]
            if parts:
                return "\n".join(parts)
    return json.dumps(result, indent=2)[:4000]


def _github_pull(query, token=""):
    q = (query or "").strip()
    hdr = {"Accept": "application/vnd.github+json"}
    if token:
        hdr["Authorization"] = f"Bearer {token}"
    items = []
    # Match GitHub issue/PR URL
    m_ip = re.search(r"github\.com/([^/]+)/([^/]+)/(issues|pull)/(\d+)", q, re.I)
    m_file = re.search(r"github\.com/([^/]+)/([^/]+)/(?:blob|tree)/([^/]+)/(.+)", q, re.I)
    m_repo = re.search(r"(?:github\.com/)?([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:[/?#].*|$)", q)
    if m_ip:
        owner, repo, kind, num = m_ip.group(1), m_ip.group(2), m_ip.group(3), m_ip.group(4)
        _, _, raw = _http_json(f"https://api.github.com/repos/{owner}/{repo}/issues/{num}", headers=hdr)
        d = json.loads(raw)
        _, _, c_raw = _http_json(f"https://api.github.com/repos/{owner}/{repo}/issues/{num}/comments?per_page=8", headers=hdr)
        comments = json.loads(c_raw) if c_raw else []
        body = (d.get("body") or "")[:3000]
        ctext = "\n\n".join(f"- **{c.get('user', {}).get('login', 'user')}**: {(c.get('body') or '')[:350]}" for c in comments[:6])
        sec = ("\n\n### Comments\n" + ctext) if ctext else ""
        items.append({
            "id": f"gh-{owner}-{repo}-{num}",
            "provider": "github",
            "kind": "Pull Request" if kind.lower() == "pull" else "Issue",
            "title": f"{owner}/{repo}#{num} · {d.get('title', '')}",
            "subtitle": f"State: {d.get('state', '')} · Author: {d.get('user', {}).get('login', '')}",
            "url": d.get("html_url", q),
            "content": (body + sec).strip(),
        })
        return items
    if m_file:
        owner, repo, branch, fpath = m_file.group(1), m_file.group(2), m_file.group(3), m_file.group(4).split("?")[0]
        _, _, raw = _http_json(f"https://api.github.com/repos/{owner}/{repo}/contents/{quote(fpath)}?ref={quote(branch)}", headers=hdr)
        d = json.loads(raw)
        if isinstance(d, dict) and d.get("content"):
            text = base64.b64decode(d["content"]).decode("utf-8", errors="replace")[:5000]
            items.append({
                "id": f"gh-file-{d.get('sha', '')[:10]}",
                "provider": "github",
                "kind": "Code / Doc",
                "title": f"{owner}/{repo}/{d.get('path', fpath)}",
                "subtitle": f"Branch: {branch} · {d.get('size', 0)} bytes",
                "url": d.get("html_url", q),
                "content": text,
            })
            return items
    if m_repo and ("github.com" in q.lower() or ("/" in q and " " not in q)):
        owner, repo = m_repo.group(1), m_repo.group(2).removesuffix(".git")
        _, _, r_raw = _http_json(f"https://api.github.com/repos/{owner}/{repo}", headers=hdr)
        meta = json.loads(r_raw)
        readme_txt = meta.get("description") or ""
        with contextlib.suppress(Exception):
            _, _, rm_raw = _http_json(f"https://api.github.com/repos/{owner}/{repo}/readme", headers=hdr)
            rm = json.loads(rm_raw)
            if rm.get("content"):
                readme_txt = base64.b64decode(rm["content"]).decode("utf-8", errors="replace")[:4500]
        items.append({
            "id": f"gh-repo-{owner}-{repo}",
            "provider": "github",
            "kind": "Repository",
            "title": f"{owner}/{repo}",
            "subtitle": f"★ {meta.get('stargazers_count', 0)} · {meta.get('language') or 'Repo'} · {meta.get('default_branch', 'main')}",
            "url": meta.get("html_url", f"https://github.com/{owner}/{repo}"),
            "content": f"{meta.get('description') or ''}\n\n{readme_txt}".strip(),
        })
        with contextlib.suppress(Exception):
            _, _, iraw = _http_json(f"https://api.github.com/repos/{owner}/{repo}/issues?state=open&per_page=4", headers=hdr)
            for it in json.loads(iraw):
                items.append({
                    "id": f"gh-iss-{it.get('number')}",
                    "provider": "github",
                    "kind": "PR" if it.get("pull_request") else "Issue",
                    "title": f"#{it.get('number')} · {it.get('title', '')}",
                    "subtitle": f"{it.get('user', {}).get('login', '')} · {it.get('comments', 0)} comments",
                    "url": it.get("html_url", ""),
                    "content": (it.get("body") or it.get("title") or "")[:2400],
                })
        return items
    # Fallback: Search GitHub repositories
    search_q = urlencode({"q": q or "design system mcp", "per_page": 5})
    _, _, s_raw = _http_json(f"https://api.github.com/search/repositories?{search_q}", headers=hdr)
    for r in (json.loads(s_raw).get("items") or [])[:5]:
        items.append({
            "id": f"gh-s-{r.get('id')}",
            "provider": "github",
            "kind": "Repository",
            "title": r.get("full_name", "Repository"),
            "subtitle": f"★ {r.get('stargazers_count', 0)} · {r.get('language') or 'Code'}",
            "url": r.get("html_url", ""),
            "content": (r.get("description") or "") + (f"\nTopics: {', '.join(r.get('topics') or [])}" if r.get("topics") else ""),
        })
    return items


def _notion_rich_text(rt):
    return "".join(x.get("plain_text", "") for x in (rt or []) if isinstance(x, dict))


def _notion_pull(query, token):
    if not token:
        raise ValueError("Notion Integration Token (ntn_... or secret_...) or Notion MCP URL is required")
    hdr = {"Authorization": f"Bearer {token}", "Notion-Version": "2022-06-28"}
    q = (query or "").strip()
    m_id = re.search(r"([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", q, re.I)
    pages = []
    if m_id:
        pid = m_id.group(1)
        if len(pid) == 32:
            pid = f"{pid[:8]}-{pid[8:12]}-{pid[12:16]}-{pid[16:20]}-{pid[20:]}"
        _, _, raw = _http_json(f"https://api.notion.com/v1/pages/{pid}", headers=hdr)
        pages = [json.loads(raw)]
    else:
        _, _, raw = _http_json("https://api.notion.com/v1/search", "POST", {"query": q, "page_size": 5}, headers=hdr)
        pages = (json.loads(raw).get("results") or [])[:5]
    items = []
    for pg in pages:
        pid = pg.get("id", "")
        obj = pg.get("object", "page")
        props = pg.get("properties") or {}
        title = ""
        for p in props.values():
            if isinstance(p, dict) and p.get("type") == "title":
                title = _notion_rich_text(p.get("title"))
                break
        if not title and pg.get("title"):
            title = _notion_rich_text(pg.get("title"))
        lines = []
        if obj == "page" and pid:
            with contextlib.suppress(Exception):
                _, _, b_raw = _http_json(f"https://api.notion.com/v1/blocks/{pid}/children?page_size=40", headers=hdr)
                for b in (json.loads(b_raw).get("results") or []):
                    bt = b.get("type", "")
                    bd = b.get(bt) or {}
                    txt = _notion_rich_text(bd.get("rich_text"))
                    if txt:
                        pref = "## " if "heading" in bt else "- " if "list_item" in bt or bt == "to_do" else "> " if bt == "quote" else ""
                        lines.append(pref + txt)
        items.append({
            "id": f"notion-{pid}",
            "provider": "notion",
            "kind": "Database" if obj == "database" else "Page",
            "title": title or f"Notion {obj}",
            "subtitle": f"Edited {str(pg.get('last_edited_time', ''))[:10]} · {len(lines)} blocks",
            "url": pg.get("url", ""),
            "content": "\n".join(lines)[:4500] or f"Notion {obj} ({pid})",
        })
    return items


def _figma_collect(node, depth=0, lines=None, texts=None):
    if lines is None:
        lines, texts = [], []
    if not isinstance(node, dict) or depth > 4 or len(lines) > 60:
        return lines, texts
    nt = node.get("type", "")
    nm = node.get("name", "")
    if nt in {"CANVAS", "FRAME", "COMPONENT", "COMPONENT_SET", "SECTION"} and nm:
        lines.append(f"{'  ' * max(0, depth - 1)}- [{nt.lower()}] {nm}")
    if nt == "TEXT" and node.get("characters"):
        texts.append(f'"{node["characters"][:140]}"')
    for ch in (node.get("children") or [])[:24]:
        _figma_collect(ch, depth + 1, lines, texts)
    return lines, texts


def _figma_pull(query, token):
    if not token:
        raise ValueError("Figma Personal Access Token (figd_...) or Figma MCP Server is required")
    hdr = {"X-Figma-Token": token}
    q = (query or "").strip()
    m_key = re.search(r"figma\.com/(?:file|design|proto)/([A-Za-z0-9]+)", q, re.I) or re.match(r"^([A-Za-z0-9]{10,40})$", q)
    if not m_key:
        raise ValueError("Paste a Figma file URL (figma.com/design/<key>/...) or File Key")
    fkey = m_key.group(1)
    m_nid = re.search(r"node-id=([0-9]+[-:][0-9]+)", q, re.I)
    node_id = m_nid.group(1).replace("-", ":") if m_nid else ""
    items = []
    if node_id:
        _, _, raw = _http_json(f"https://api.figma.com/v1/files/{fkey}/nodes?ids={quote(node_id)}&depth=4", headers=hdr)
        d = json.loads(raw)
        fname = d.get("name", f"Figma {fkey}")
        for nid, wrap in (d.get("nodes") or {}).items():
            doc = (wrap or {}).get("document") or {}
            lines, texts = _figma_collect(doc)
            items.append({
                "id": f"figma-{fkey}-{nid}",
                "provider": "figma",
                "kind": "Frame / Node",
                "title": f"{fname} · {doc.get('name', nid)}",
                "subtitle": f"Node {nid} · {len(lines)} layers",
                "url": f"https://www.figma.com/design/{fkey}?node-id={nid.replace(':', '-')}",
                "content": ("\n".join(lines[:35]) + ("\n\nCopy:\n" + "\n".join(texts[:20]) if texts else "")).strip(),
            })
    else:
        _, _, raw = _http_json(f"https://api.figma.com/v1/files/{fkey}?depth=3", headers=hdr)
        d = json.loads(raw)
        lines, texts = _figma_collect(d.get("document") or {})
        styles = [s.get("name", "") for s in (d.get("styles") or {}).values() if isinstance(s, dict)][:15]
        items.append({
            "id": f"figma-{fkey}",
            "provider": "figma",
            "kind": "Design File",
            "title": d.get("name", f"Figma {fkey}"),
            "subtitle": f"v{d.get('version', '?')} · {len(lines)} frames/components",
            "url": f"https://www.figma.com/design/{fkey}",
            "content": (("\n".join(lines[:40])) + (f"\n\nStyles: {', '.join(styles)}" if styles else "") + (f"\n\nUI Copy:\n" + "\n".join(texts[:18]) if texts else "")).strip(),
        })
    with contextlib.suppress(Exception):
        _, _, craw = _http_json(f"https://api.figma.com/v1/files/{fkey}/comments", headers=hdr)
        cmts = [c for c in (json.loads(craw).get("comments") or []) if not c.get("resolved_at")][:8]
        if cmts:
            cbody = "\n".join(f"- **{c.get('user', {}).get('handle', 'Reviewer')}**: {c.get('message', '')[:240]}" for c in cmts)
            items.append({
                "id": f"figma-cmt-{fkey}",
                "provider": "figma",
                "kind": "Comments",
                "title": f"Unresolved Figma Comments ({len(cmts)})",
                "subtitle": f"File {fkey}",
                "url": f"https://www.figma.com/design/{fkey}",
                "content": cbody,
            })
    return items


def _mcp_tool_args_for_schema(pick, query):
    props = (pick.get("inputSchema") or {}).get("properties") or {}
    q = (query or "").strip()
    if not q or not isinstance(props, dict) or not props:
        return {"query": q} if q else {}
    out = {}
    for k in ("query", "question", "prompt", "url", "uri", "search", "q", "input", "text", "notebook_id", "page_id", "fileKey", "file_key", "nodeId", "repo"):
        if k in props:
            out[k] = q
            if k in {"query", "question", "prompt", "url", "search", "q", "input", "text"}:
                break
    if not out:
        first_key = next(iter(props))
        out[first_key] = q
    return out


def _mcp_auto_pull(prov, query, mcp_cfg, label="MCP"):
    q = (query or "").strip()
    params = mcp_cfg.get("toolArgs") if isinstance(mcp_cfg.get("toolArgs"), dict) else None
    tool_name = str(mcp_cfg.get("toolName") or "").strip()
    if tool_name:
        res = _call_configured_mcp(mcp_cfg, "tools/call", {"name": tool_name, "arguments": params or ({"query": q} if q else {})})
        return [{
            "id": f"{prov}-tool-{hashlib.sha1((q + tool_name).encode()).hexdigest()[:10]}",
            "provider": prov,
            "kind": f"MCP · {tool_name}",
            "title": f"{label} · {q or tool_name}",
            "subtitle": f"MCP tool `{tool_name}`",
            "url": q if q.startswith("http") else "",
            "content": _mcp_extract_text(res.get("result")),
        }]
    listed = _call_configured_mcp(mcp_cfg, "tools/list", {})
    tools = ((listed.get("result") or {}).get("tools")) or []
    pick = next((t for t in tools if re.search(r"query|ask|search|get|read|fetch|list|notebook|file|page|issue|repo|source", t.get("name", ""), re.I)), tools[0] if tools else None)
    if pick:
        args_payload = params or _mcp_tool_args_for_schema(pick, q)
        call_res = _call_configured_mcp(mcp_cfg, "tools/call", {"name": pick["name"], "arguments": args_payload})
        return [{
            "id": f"{prov}-{hashlib.sha1((q + pick['name']).encode()).hexdigest()[:10]}",
            "provider": prov,
            "kind": f"MCP · {pick['name']}",
            "title": f"{label} · {q or pick['name']}",
            "subtitle": f"Fetched via MCP tool `{pick['name']}`",
            "url": q if q.startswith("http") else "",
            "content": _mcp_extract_text(call_res.get("result")),
        }]
    with contextlib.suppress(Exception):
        res_list = _call_configured_mcp(mcp_cfg, "resources/list", {})
        resources = ((res_list.get("result") or {}).get("resources")) or []
        if resources:
            return [{"id": f"{prov}-res-{i}", "provider": prov, "kind": "MCP Resource", "title": r.get("name") or r.get("uri", "Resource"), "subtitle": r.get("uri", ""), "url": r.get("uri", ""), "content": r.get("description") or r.get("uri", "")} for i, r in enumerate(resources[:8])]
    return [{"id": f"{prov}-tools", "provider": prov, "kind": "MCP Tools", "title": f"{label} MCP Connected", "subtitle": f"{len(tools)} tools discovered", "url": "", "content": json.dumps([t.get("name") for t in tools])}]


def _notebooklm_pull(query, token="", mcp_cfg=None):
    q = (query or "").strip()
    if mcp_cfg and (mcp_cfg.get("url") or mcp_cfg.get("command")):
        return _mcp_auto_pull("notebooklm", q, mcp_cfg, label="Google Notebook")
    # Direct URL / Google Doc / Public Notebook preview fallback when URL is given
    if re.match(r"^https?://", q, re.I):
        hdr = {"Authorization": f"Bearer {token}"} if token else {}
        gdoc = re.search(r"docs\.google\.com/document/d/([A-Za-z0-9_-]+)", q)
        if gdoc and token:
            _, _, raw = _http_json(f"https://www.googleapis.com/drive/v3/files/{gdoc.group(1)}/export?mimeType=text/markdown", headers=hdr)
            return [{"id": f"nlm-gdoc-{gdoc.group(1)[:8]}", "provider": "notebooklm", "kind": "Google Doc Source", "title": "NotebookLM Google Doc Source", "subtitle": gdoc.group(1), "url": q, "content": raw[:5000]}]
        _, _, raw = _http_json(q, headers=hdr)
        m_t = re.search(r"<title[^>]*>([\s\S]*?)</title>", raw, re.I)
        title = html_lib.unescape(re.sub(r"\s+", " ", m_t.group(1)).strip()) if m_t else "Google Notebook Reference"
        clean = re.sub(r"<(script|style)[^>]*>[\s\S]*?</\1>", " ", raw, flags=re.I)
        clean = html_lib.unescape(re.sub(r"<[^>]+>", "\n", clean))
        clean = re.sub(r"\n{3,}", "\n\n", clean).strip()[:4500]
        return [{"id": f"nlm-url-{hashlib.sha1(q.encode()).hexdigest()[:8]}", "provider": "notebooklm", "kind": "Notebook URL", "title": title, "subtitle": urlsplit(q).netloc, "url": q, "content": clean or q}]
    raise ValueError("Configure a NotebookLM MCP server (URL or stdio e.g. `uvx notebooklm-mcp`) or paste a public source URL / briefing note.")


def _call_configured_mcp(cfg, method, params=None):
    transport = (cfg or {}).get("transport", "http").lower()
    if transport == "stdio" or ((cfg or {}).get("command") and not (cfg or {}).get("url")):
        return mcp_stdio_rpc(cfg.get("command"), cfg.get("args") or [], cfg.get("env") or {}, method, params)
    hdr = dict(cfg.get("headers") or {})
    tok = (cfg or {}).get("token") or ""
    if tok and "Authorization" not in hdr and "X-Figma-Token" not in hdr:
        hdr["Authorization"] = f"Bearer {tok}"
    return mcp_http_rpc(cfg.get("url"), method, params, hdr)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def origin_allowed(self):
        origin = self.headers.get("Origin", "")
        if self.headers.get("Host", "").split(":")[0] not in {"127.0.0.1", "localhost"}:
            return False
        if origin in {"", "null"}:
            return True
        parsed = urlsplit(origin)
        return parsed.scheme in {"http", "https"} and parsed.hostname in LOCAL_HOSTS

    def headers_for(self, status, mime, length=None):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if self.origin_allowed() and self.headers.get("Origin"):
            self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Private-Network", "true")
        if length is not None:
            self.send_header("Content-Length", str(length))

    def reply(self, code, payload):
        data = json.dumps(payload).encode()
        self.headers_for(code, "application/json", len(data))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        if not self.origin_allowed():
            return self.reply(403, {"error": "Local Studio only"})
        self.headers_for(204, "text/plain", 0)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Studio-Client")
        self.end_headers()

    def do_GET(self):
        if not self.origin_allowed():
            return self.reply(403, {"error": "Local Studio only"})
        path = self.path.split("?")[0]
        if path == "/studio/health":
            spec = active_spec()
            ready = READY.is_set() and ENGINE and ENGINE.poll() is None
            self.reply(200, {
                "service": "infinite-canvas",
                "model": spec["model"],
                "modelId": spec["id"],
                "vision": spec["vision"],
                "status": "ready" if ready else "stopped" if USER_STOPPED else "error" if START_ERROR or READY.is_set() else "loading",
                "progress": live_progress(),
                "error": START_ERROR,
                "models": model_inventory(),
            })
        elif path == "/studio/models":
            self.reply(200, {"active": ACTIVE_ID, "models": model_inventory()})
        elif path == "/studio/mcp/status":
            self.reply(200, {
                "mcp": True,
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "transports": ["http", "sse", "stdio", "direct-api"],
                "clis": {k: bool(shutil.which(k)) for k in ("npx", "uvx", "node", "python3", "gh")},
            })
        elif path in {"/", "/index.html"} and SITE.is_file():
            html = SITE.read_bytes()
            self.headers_for(200, "text/html; charset=utf-8", len(html))
            self.end_headers()
            self.wfile.write(html)
        else:
            self.reply(404, {"error": "Not found"})

    def do_POST(self):
        global ACTIVE_ID, USER_STOPPED, START_ERROR, PROGRESS_TEXT, SWITCH_GEN
        path = self.path.split("?")[0]
        allowed_posts = {
            "/studio/generate", "/studio/transcribe", "/studio/start", "/studio/stop",
            "/studio/model", "/studio/model/delete",
            "/studio/mcp/rpc", "/studio/connector/pull",
        }
        if path not in allowed_posts or not self.origin_allowed() or self.headers.get("X-Studio-Client") != "canvas":
            return self.reply(403, {"error": "Local Studio only"})
        if path == "/studio/mcp/rpc":
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 512 * 1024:
                    raise ValueError("Invalid MCP request size")
                body = json.loads(self.rfile.read(size))
                out = _call_configured_mcp(body, str(body.get("method") or "tools/list"), body.get("params") or {})
                return self.reply(200, {"ok": True, **out})
            except Exception as err:
                return self.reply(400, {"ok": False, "error": str(err)})
        if path == "/studio/connector/pull":
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 512 * 1024:
                    raise ValueError("Invalid connector pull size")
                body = json.loads(self.rfile.read(size))
                prov = str(body.get("provider") or "").lower().strip()
                query = str(body.get("query") or "")
                token = str(body.get("token") or "")
                mcp_cfg = body.get("mcp") if isinstance(body.get("mcp"), dict) else None
                via = "direct-api"
                items = []
                # Prefer configured live MCP server when explicitly requested or configured for custom/MCP mode
                use_mcp = bool(mcp_cfg and (mcp_cfg.get("url") or mcp_cfg.get("command")) and (body.get("mode") == "mcp" or prov in {"custom", "notebooklm"}))
                if use_mcp:
                    via = "mcp"
                    labels = {"github": "GitHub", "notebooklm": "Google Notebook", "notion": "Notion", "figma": "Figma", "custom": "MCP"}
                    items = _mcp_auto_pull(prov, query, mcp_cfg, label=labels.get(prov, prov.title()))
                elif prov == "github":
                    items = _github_pull(query, token)
                elif prov == "notion":
                    items = _notion_pull(query, token)
                elif prov == "figma":
                    items = _figma_pull(query, token)
                elif prov == "notebooklm":
                    items = _notebooklm_pull(query, token, mcp_cfg)
                else:
                    raise ValueError(f"Unsupported provider: {prov or 'unknown'}")
                return self.reply(200, {"ok": True, "provider": prov, "via": via, "items": items})
            except Exception as err:
                return self.reply(400, {"ok": False, "error": str(err)})
        if path == "/studio/start":
            start_model()
            return self.reply(200, {"service": "infinite-canvas", "active": ACTIVE_ID, "models": model_inventory()})
        if path == "/studio/stop":
            with MODEL_LOCK:
                USER_STOPPED = True
                SWITCH_GEN += 1
                READY.clear()
                START_ERROR = ""
                PROGRESS_TEXT = ""
                stop_download()
                stop_model()
            return self.reply(200, {"service": "infinite-canvas", "active": ACTIVE_ID, "status": "stopped", "models": model_inventory()})
        if path == "/studio/model":
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 4096:
                    raise ValueError("Invalid request size")
                body = json.loads(self.rfile.read(size))
                mid = str(body.get("id", "")).strip()
                if mid not in MODELS:
                    return self.reply(400, {"error": "Unknown local model"})
                if mid != ACTIVE_ID or START_ERROR or not (READY.is_set() and ENGINE and ENGINE.poll() is None):
                    ACTIVE_ID = mid
                    save_active_id(mid)
                    start_model(force=True)
                return self.reply(200, {"service": "infinite-canvas", "active": ACTIVE_ID, "status": "loading", "models": model_inventory()})
            except (ValueError, TypeError, KeyError, json.JSONDecodeError):
                return self.reply(400, {"error": "Invalid model switch request"})
        if path == "/studio/model/delete":
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 4096:
                    raise ValueError("Invalid request size")
                body = json.loads(self.rfile.read(size))
                mid = str(body.get("id", "")).strip()
                if mid not in MODELS:
                    return self.reply(400, {"error": "Unknown local model"})
                if mid == ACTIVE_ID:
                    return self.reply(409, {"error": "Switch away from this model before removing its files"})
                for f in MODELS[mid]["files"]:
                    (MODEL_DIR / f["name"]).unlink(missing_ok=True)
                    (MODEL_DIR / (f["name"] + ".part")).unlink(missing_ok=True)
                return self.reply(200, {"active": ACTIVE_ID, "models": model_inventory()})
            except (ValueError, TypeError, KeyError, json.JSONDecodeError):
                return self.reply(400, {"error": "Invalid delete request"})
        if not READY.is_set() or not ENGINE or ENGINE.poll() is not None:
            return self.reply(503, {"error": "Local model is loading or offline"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 10 * 1024 * 1024:
                return self.reply(413, {"error": "Request too large"})
            if path == "/studio/transcribe":
                if size > 3000000 or self.headers.get("Content-Type") != "audio/wav":
                    return self.reply(400, {"error": "Expected a 90-second mono WAV excerpt"})
                return self.reply(200, {"text": transcribe(self.rfile.read(size))})
            body = json.loads(self.rfile.read(size))
            is_json = isinstance(body.get("response_format"), dict) and body["response_format"].get("type") == "json_object"
            args = {
                "model": active_spec()["model"],
                "messages": body["messages"],
                "response_format": body["response_format"],
                "stream": True,
                "temperature": 0.35 if is_json else 0.65,
                "top_p": 0.9,
                "presence_penalty": 0.35,
                "frequency_penalty": 0.25,
                "max_tokens": min(4600, int(body.get("max_tokens", 2400))),
            }
            if not isinstance(args["messages"], list) or not 1 <= len(args["messages"]) <= 8:
                raise ValueError("Invalid request")
            request = Request(f"http://127.0.0.1:{MODEL_PORT}/v1/chat/completions", data=json.dumps(args).encode(),
                              headers={"Authorization": "Bearer " + MODEL_KEY, "Content-Type": "application/json"})
            with local_urlopen(request, timeout=240) as upstream:
                self.headers_for(200, "text/event-stream")
                self.end_headers()
                for line in upstream:
                    self.wfile.write(line)
                    self.wfile.flush()
        except (ConnectionResetError, BrokenPipeError):
            pass
        except HTTPError as err:
            self.reply(err.code, {"error": "Model could not complete this request"})
        except (ValueError, TypeError, KeyError):
            self.reply(400, {"error": "Invalid model request"})
        except (OSError, RuntimeError, subprocess.SubprocessError):
            self.reply(503, {"error": "Local model is unavailable"})


def open_studio():
    if SITE.is_file() and sys.platform == "darwin":
        subprocess.Popen(["open", str(SITE)])


def main():
    silent = "--serve" in sys.argv
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        with contextlib.suppress(Exception):
            with local_urlopen(f"http://127.0.0.1:{PORT}/studio/health", timeout=2) as res:
                health = json.load(res)
                if health.get("service") == "infinite-canvas":
                    if health.get("status") == "error":
                        wake = Request(f"http://127.0.0.1:{PORT}/studio/start", data=b"", headers={"X-Studio-Client": "canvas"})
                        with local_urlopen(wake, timeout=3):
                            pass
                    if not silent:
                        open_studio()
                    return
        raise
    start_model()
    print(f"Infinite Canvas · http://127.0.0.1:{PORT}/", flush=True)
    if not silent:
        open_studio()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def stop_model():
    global ENGINE
    if ENGINE and ENGINE.poll() is None:
        ENGINE.terminate()
        with contextlib.suppress(subprocess.TimeoutExpired):
            ENGINE.wait(timeout=4)
    ENGINE = None


if __name__ == "__main__":
    def closing(signum, frame):
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, closing)
    signal.signal(signal.SIGHUP, closing)
    atexit.register(stop_download)
    atexit.register(stop_model)
    main()
