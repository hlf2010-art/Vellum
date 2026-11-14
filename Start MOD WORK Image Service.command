#!/usr/bin/env python3
"""Connect the MOD WORK canvas to the Windows image service."""
import base64
import json
import sys
import uuid

import threading
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent / "studio" / "windows-comfy"
sys.path.insert(0, str(ROOT))
from backend import (
    generate, fetch, JOBS, BASE,
    ServiceStoppedError, is_service_stopped, set_service_stopped, stop_windows_service,
    submit_video, execute_video_job, get_video_job, get_video_asset_path,
)
from sampling import Sampling
observers = {}
from inventory import MODELS, inventory, video_inventory, assets, graph
PORT = 59639
MODEL = "Z-Image Turbo BF16 · Windows ComfyUI"
generation = threading.Lock()
video_executor = ThreadPoolExecutor(max_workers=1)
active_jobs_lock = threading.Lock()
active_jobs = {}  # request_id -> kind ("image" | "video")


def _track_start(rid: str, kind: str):
    with active_jobs_lock:
        active_jobs[rid] = kind


def _track_end(rid: str):
    with active_jobs_lock:
        active_jobs.pop(rid, None)


def _active_snapshot():
    with active_jobs_lock:
        return dict(active_jobs)


def _run_video_worker(rid: str):
    try:
        execute_video_job(rid, generation, observers)
    finally:
        _track_end(rid)

class Handler(BaseHTTPRequestHandler):
    def permitted(self):
        origin = self.headers.get("Origin", "")
        return (self.headers.get("Host") in (f"localhost:{PORT}", f"127.0.0.1:{PORT}")
                and (origin in ("", "null") or urlsplit(origin).hostname in ("localhost", "127.0.0.1")))

    def reply(self, status, data=b"", mime="application/json"):
        self.send_response(status)
        if self.permitted():
            self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "null"))
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Studio-Client")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Expose-Headers", "X-Image-Model, X-Image-Job")
        if getattr(self,"model",None):
            self.send_header("X-Image-Model", MODELS[self.model]["name"])
            self.send_header("X-Image-Job", getattr(self,"job",""))
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def error(self, code, message):
        self.reply(code, json.dumps({"error":message}).encode())

    def do_OPTIONS(self):
        self.reply(204 if self.permitted() else 403)

    def do_GET(self):
        if not self.permitted(): return self.reply(403)
        try:
            if self.path in ("/health","/models"):
                if is_service_stopped():
                    return self.reply(200, json.dumps({
                        "connected": False,
                        "service_status": "stopped",
                        "shared_instance": True,
                        "auto_restart": False,
                        "models": [],
                        "video_models": [],
                    }).encode())
                act = _active_snapshot()
                return self.reply(200, json.dumps({
                    "connected": True,
                    "service_status": "busy" if (generation.locked() or act) else "ready",
                    "shared_instance": True,
                    "active_jobs": act,
                    "models": inventory(fetch),
                    "video_models": video_inventory(fetch),
                }).encode())
            if self.path.startswith("/media/jobs/"):
                rid = self.path.split("/")[-1]
                job = get_video_job(rid, observers)
                if not job:
                    return self.error(404, "Video job not found")
                return self.reply(200, json.dumps(job).encode())
            if self.path.startswith("/media/assets/") and self.path.endswith(".mp4"):
                rid = self.path[len("/media/assets/"):-4]
                apath = get_video_asset_path(rid)
                if not apath:
                    return self.error(404, "Video asset not ready")
                size = apath.stat().st_size
                rng = self.headers.get("Range")
                if rng and rng.startswith("bytes="):
                    start_s, _, end_s = rng[6:].partition("-")
                    start = int(start_s) if start_s else 0
                    end = int(end_s) if end_s else size - 1
                    end = min(end, size - 1)
                    if start > end or start >= size:
                        return self.reply(416)
                    chunk = apath.read_bytes()[start:end + 1]
                    self.send_response(206)
                    if self.permitted():
                        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "null"))
                        self.send_header("Vary", "Origin")
                        self.send_header("Access-Control-Allow-Private-Network", "true")
                    self.send_header("Accept-Ranges", "bytes")
                    self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
                    self.send_header("Content-Type", "video/mp4")
                    self.send_header("Content-Length", str(len(chunk)))
                    self.end_headers()
                    self.wfile.write(chunk)
                    return
                return self.reply(200, apath.read_bytes(), "video/mp4")
            if self.path.startswith("/seed/"):
                pid=str(uuid.UUID(self.path.split("/")[-1]))
                history=json.loads(fetch("/history/"+pid,timeout=2)).get(pid,{})
                graph_data=history.get("prompt",[None,None,{}])[2]
                seeds=[n["inputs"].get("seed") for n in graph_data.values() if n["class_type"]=="KSampler"]
                return self.reply(200,json.dumps({"seed":seeds[0] if len(seeds)==1 else None}).encode())
            if self.path.startswith("/jobs/"):
                path=JOBS/(str(uuid.UUID(self.path.split("/")[-1]))+".json")
                if not path.exists():return self.reply(200,b'{"phase":"Checking workflow"}')
                r=json.loads(path.read_text())
                state={k:r.get(k) for k in ("phase","prompt_id","started","completed")}
                observer=observers.get(path.stem)
                if observer and not state["completed"]:
                    state.update(observer.by_prompt.get(state["prompt_id"], {}))
                return self.reply(200,json.dumps(state).encode())
            self.reply(404)
        except (OSError,ValueError,KeyError):
            self.error(503,"Windows ComfyUI unavailable. Check the Windows service and E: drive.")

    def do_POST(self):
        if not self.permitted() or self.headers.get("X-Studio-Client") != "canvas":
            return self.reply(403)
        if self.path == "/service/stop":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length)) if length > 0 else {}
            except (ValueError, UnicodeError):
                body = {}
            # Same lock as image generation and video execution/admission.
            # Never wait behind another operation, even with confirm_interrupt.
            if not generation.acquire(blocking=False):
                return self.error(409, "Generation or service operation is busy; nothing was stopped.")
            try:
                act = _active_snapshot()
                if act:
                    return self.reply(409, json.dumps({
                        "busy": True, "active_jobs": act, "shared_instance": True,
                        "message": "Generation is active or queued; nothing was stopped.",
                    }).encode())
                res = stop_windows_service()
                return self.reply(200, json.dumps({
                    "status": "stopped", "shared_instance": True,
                    "auto_restart": False, "windows": res,
                }).encode())
            except Exception:
                return self.error(503, "Windows stop was not confirmed; check service status before retrying.")
            finally:
                generation.release()

        if self.path == "/media/video":
            if not generation.acquire(blocking=False):
                return self.error(429, "Windows GPU or service operation is busy. Try again later.")
            try:
                if is_service_stopped():
                    return self.reply(503, json.dumps({"error": "服务已停止，请先在 Windows 手动启动模型服务", "status": "stopped"}).encode())
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                    if not 0 < length <= 1000000:
                        raise ValueError("Invalid request length")
                    payload = json.loads(self.rfile.read(length))
                    prompt = payload.get("prompt")
                    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 12000:
                        raise ValueError("Enter a prompt between 1 and 12,000 characters.")
                    rid = str(uuid.UUID(payload["request_id"])) if "request_id" in payload else str(uuid.uuid4())
                    model = payload.get("model", "h3")
                    rec, is_new = submit_video(
                        prompt.strip(),
                        rid,
                        model=model,
                        seed=payload.get("seed"),
                        image=payload.get("image"),
                        tail_frame=payload.get("tail_frame"),
                    )
                    if is_new:
                        _track_start(rec["job_id"], "video")
                        video_executor.submit(_run_video_worker, rec["job_id"])
                except ServiceStoppedError as err:
                    return self.reply(503, json.dumps({"error": str(err), "status": "stopped"}).encode())
                except (ValueError, KeyError, UnicodeError) as err:
                    code = 409 if "different" in str(err).lower() else 400
                    return self.error(code, str(err) or "Invalid video request.")
                except (OSError,) as err:
                    return self.error(503, f"Windows ComfyUI unavailable: {err}")
                status_code = 200 if rec.get("status") == "completed" else 202
                return self.reply(status_code, json.dumps({
                    "job_id": rec["job_id"],
                    "status": rec["status"],
                    "model": rec.get("model_name", "MiniMax H3"),
                    "spec": rec.get("spec"),
                    "asset_url": rec.get("asset_url"),
                }).encode())
            finally:
                generation.release()

        if self.path != "/image":
            return self.reply(404)
        if is_service_stopped():
            return self.reply(503, json.dumps({"error": "服务已停止，请先在 Windows 手动启动模型服务", "status": "stopped"}).encode())
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 32000000:
                raise ValueError()
            payload = json.loads(self.rfile.read(length))
            prompt = payload.get("prompt")
            self.model=payload.get("model","zimage")
            if self.model not in MODELS:return self.error(400,"Unsupported model")
            def png(key):
                if not payload.get(key): return None
                data=base64.b64decode(payload[key],validate=True)
                if not data.startswith(b"\x89PNG\r\n\x1a\n"): raise ValueError()
                return data
            image,guide,reference=png("image"),png("guide"),png("reference")
            if guide and not image: raise ValueError()
            request_id = str(uuid.UUID(payload["request_id"])) if "request_id" in payload else str(uuid.uuid4())
            if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 12000:
                raise ValueError()
        except (ValueError, AttributeError, UnicodeError):
            return self.error(400, "Enter a prompt between 1 and 12,000 characters.")
        if not generation.acquire(blocking=False):
            return self.error(429, "Windows GPU is busy. Try again when the active job finishes.")
        _track_start(request_id, "image")
        try:
            if is_service_stopped():
                return self.reply(503, json.dumps({"error": "服务已停止，请先在 Windows 手动启动模型服务", "status": "stopped"}).encode())
            with Sampling(BASE,request_id,graph(self.model)) as observer:
                observers[request_id]=observer
                data=generate(prompt,request_id,image,guide,self.model,payload.get("variation_seed"),payload.get("aspect_ratio"),payload.get("output_edge",1024),reference,payload.get("cfg",1))
            self.job=json.loads((JOBS/(request_id+".json")).read_text())["prompt_id"]
            self.reply(200,data,"image/png")
        except (RuntimeError, ValueError, OSError, KeyError) as err:
            print("Image job",request_id,type(err).__name__,str(err),flush=True)
            if not isinstance(err,(BrokenPipeError,ConnectionResetError)):
                self.error(503,str(err))
        finally:
            observers.pop(request_id,None)
            _track_end(request_id)
            generation.release()

if __name__ == "__main__":
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError as err:
        raise SystemExit(f"Could not start the image service on port {PORT}: {err}")
    print(f"MOD WORK image generation ready at 127.0.0.1:{PORT}. Leave this window open.", flush=True)
    server.serve_forever()
