#!/usr/bin/env python3
"""Loopback inference for Infinite Canvas Studio. Double-click the .command copy on macOS."""
import atexit
import contextlib
import hashlib
import json
import os
from pathlib import Path
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
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

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
                with urlopen(f"http://127.0.0.1:{MODEL_PORT}/health", timeout=2) as res:
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


def start_model(force=False):
    global MODEL_THREAD, START_ERROR, SWITCH_GEN, PROGRESS_TEXT
    with MODEL_LOCK:
        if not force:
            if MODEL_THREAD and MODEL_THREAD.is_alive():
                return
            if READY.is_set() and ENGINE and ENGINE.poll() is None:
                return
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
                "status": "ready" if ready else "error" if START_ERROR or READY.is_set() else "loading",
                "progress": live_progress(),
                "error": START_ERROR,
                "models": model_inventory(),
            })
        elif path == "/studio/models":
            self.reply(200, {"active": ACTIVE_ID, "models": model_inventory()})
        elif path in {"/", "/index.html"} and SITE.is_file():
            html = SITE.read_bytes()
            self.headers_for(200, "text/html; charset=utf-8", len(html))
            self.end_headers()
            self.wfile.write(html)
        else:
            self.reply(404, {"error": "Not found"})

    def do_POST(self):
        global ACTIVE_ID
        path = self.path.split("?")[0]
        if path not in {"/studio/generate", "/studio/transcribe", "/studio/start", "/studio/model", "/studio/model/delete"} or not self.origin_allowed() or self.headers.get("X-Studio-Client") != "canvas":
            return self.reply(403, {"error": "Local Studio only"})
        if path == "/studio/start":
            start_model()
            return self.reply(200, {"service": "infinite-canvas", "active": ACTIVE_ID, "models": model_inventory()})
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
            args = {"model": active_spec()["model"], "messages": body["messages"], "response_format": body["response_format"],
                    "stream": True, "temperature": 0.45, "max_tokens": min(4600, int(body.get("max_tokens", 2400)))}
            if not isinstance(args["messages"], list) or not 1 <= len(args["messages"]) <= 8:
                raise ValueError("Invalid request")
            request = Request(f"http://127.0.0.1:{MODEL_PORT}/v1/chat/completions", data=json.dumps(args).encode(),
                              headers={"Authorization": "Bearer " + MODEL_KEY, "Content-Type": "application/json"})
            with urlopen(request, timeout=240) as upstream:
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
            with urlopen(f"http://127.0.0.1:{PORT}/studio/health", timeout=2) as res:
                health = json.load(res)
                if health.get("service") == "infinite-canvas":
                    if health.get("status") == "error":
                        wake = Request(f"http://127.0.0.1:{PORT}/studio/start", data=b"", headers={"X-Studio-Client": "canvas"})
                        with urlopen(wake, timeout=3):
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
