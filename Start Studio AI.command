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
MODEL_NAME = "Qwen3-VL-4B-Instruct"
MODEL_DIR = Path.home() / "Library/Caches/InfiniteCanvas/models"
MODEL_FILES = {
    "Qwen3VL-4B-Instruct-Q4_K_M.gguf": "66358cb18bb6b3b1b6675aa412c7a88ef01d228f481184d13668e5201c730a0a",
    "mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf": "30ba2c7dd3127a4561b6cba9d13d0f711c91bdb38742e2f56d73c8cb596bd06d",
}
BASE = "https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/1cd86afb9a95c410a6038ab3b40d8b578c892266/"
SITE_NAME = "Infinite Canvas - Studio.html"
SITE = Path(__file__).resolve().parent / SITE_NAME
if not SITE.exists():
    SITE = SITE.parent.parent / SITE_NAME
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
ENGINE = None
READY = threading.Event()
MODEL_KEY = secrets.token_urlsafe(32)
MODEL_PORT = 0
START_ERROR = ""
MODEL_LOCK = threading.Lock()
MODEL_THREAD = None
os.environ["PATH"] = "/opt/homebrew/bin:/usr/local/bin:" + os.environ.get("PATH", "")


def ensure_weights():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for name, digest in MODEL_FILES.items():
        dest = MODEL_DIR / name
        if dest.exists():
            continue
        partial = MODEL_DIR / (name + ".part")
        print("Preparing", name, flush=True)
        subprocess.run(["curl", "-fL", "--retry", "3", "-C", "-", "-o", str(partial), BASE + name], check=True)
        h = hashlib.sha256()
        with partial.open("rb") as src:
            for block in iter(lambda: src.read(8 << 20), b""):
                h.update(block)
        if h.hexdigest() != digest:
            partial.unlink(missing_ok=True)
            raise ValueError("Model download incomplete. Relaunch to download it again.")
        partial.replace(dest)


def model_server():
    global ENGINE, MODEL_PORT, START_ERROR
    try:
        tool = shutil.which("llama-server")
        if not tool:
            brew = shutil.which("brew")
            if not brew:
                raise RuntimeError("Install llama.cpp, then reopen Start Studio AI.command.")
            subprocess.run([brew, "install", "llama.cpp"], check=True)
            tool = shutil.which("llama-server")
        ensure_weights()
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            MODEL_PORT = sock.getsockname()[1]
        model, vision = [str(MODEL_DIR / f) for f in MODEL_FILES]
        opts = [tool, "-m", model, "--mmproj", vision, "--host", "127.0.0.1", "--port", str(MODEL_PORT),
                "--alias", MODEL_NAME, "--ctx-size", "16384", "--parallel", "1", "--cache-ram", "0",
                "--no-webui", "--jinja", "--api-key", MODEL_KEY]
        # Release GPU memory during long editing sessions when the installed runtime supports idle sleep.
        help_text = subprocess.run([tool, "--help"], capture_output=True, text=True).stdout
        if "--sleep-idle-seconds" in help_text:
            opts += ["--sleep-idle-seconds", "300"]
        ENGINE = subprocess.Popen(opts, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(180):
            if ENGINE.poll() is not None:
                raise RuntimeError("The local model stopped during startup. Reopen the launcher.")
            try:
                with urlopen(f"http://127.0.0.1:{MODEL_PORT}/health", timeout=2) as res:
                    if res.status == 200:
                        READY.set()
                        print("Studio AI ready ·", MODEL_NAME, flush=True)
                        return
            except (OSError, URLError):
                time.sleep(1)
        raise RuntimeError("The local model did not finish loading. Reopen the launcher.")
    except Exception as err:
        START_ERROR = str(err)
        stop_model()
        print(START_ERROR, file=sys.stderr, flush=True)


def start_model():
    global MODEL_THREAD, START_ERROR
    with MODEL_LOCK:
        if MODEL_THREAD and MODEL_THREAD.is_alive():
            return
        if READY.is_set() and ENGINE and ENGINE.poll() is None:
            return
        READY.clear()
        START_ERROR = ""
        MODEL_THREAD = threading.Thread(target=model_server, daemon=True)
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
        if self.path.split("?")[0] == "/studio/health":
            ready = READY.is_set() and ENGINE and ENGINE.poll() is None
            self.reply(200, {"service": "infinite-canvas", "model": MODEL_NAME,
                             "status": "ready" if ready else "error" if START_ERROR or READY.is_set() else "loading"})
        elif self.path.split("?")[0] in {"/", "/index.html"} and SITE.is_file():
            html = SITE.read_bytes()
            self.headers_for(200, "text/html; charset=utf-8", len(html))
            self.end_headers()
            self.wfile.write(html)
        else:
            self.reply(404, {"error": "Not found"})

    def do_POST(self):
        if self.path not in {"/studio/generate", "/studio/transcribe", "/studio/start"} or not self.origin_allowed() or self.headers.get("X-Studio-Client") != "canvas":
            return self.reply(403, {"error": "Local Studio only"})
        if self.path == "/studio/start":
            start_model()
            return self.reply(200, {"service": "infinite-canvas"})
        if not READY.is_set() or ENGINE.poll() is not None:
            return self.reply(503, {"error": "Local model is loading or offline"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 10 * 1024 * 1024:
                return self.reply(413, {"error": "Request too large"})
            if self.path == "/studio/transcribe":
                if size > 3000000 or self.headers.get("Content-Type") != "audio/wav":
                    return self.reply(400, {"error": "Expected a 90-second mono WAV excerpt"})
                return self.reply(200, {"text": transcribe(self.rfile.read(size))})
            body = json.loads(self.rfile.read(size))
            args = {"model": MODEL_NAME, "messages": body["messages"], "response_format": body["response_format"],
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
    if ENGINE and ENGINE.poll() is None:
        ENGINE.terminate()
        with contextlib.suppress(subprocess.TimeoutExpired):
            ENGINE.wait(timeout=4)


if __name__ == "__main__":
    def closing(signum, frame):
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, closing)
    signal.signal(signal.SIGHUP, closing)
    atexit.register(stop_model)
    main()
