#!/usr/bin/env python3
"""Connect the MOD WORK canvas to the Windows image service."""
import base64
import json
import sys
import uuid

import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent / "studio" / "windows-comfy"
sys.path.insert(0, str(ROOT))
from backend import generate, fetch, JOBS, BASE
from sampling import Sampling
observers = {}
from inventory import MODELS,inventory,assets,graph
PORT = 59639
MODEL = "Z-Image Turbo BF16 · Windows ComfyUI"
generation = threading.Lock()

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
                return self.reply(200,json.dumps({"connected":True,"models":inventory(fetch)}).encode())
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
        if self.path != "/image" or not self.permitted() or self.headers.get("X-Studio-Client") != "canvas":
            return self.reply(403)
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
            return self.error(429, "An image is already generating. Try again when it finishes.")
        try:
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
            generation.release()

if __name__ == "__main__":
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError as err:
        raise SystemExit(f"Could not start the image service on port {PORT}: {err}")
    print(f"MOD WORK image generation ready at 127.0.0.1:{PORT}. Leave this window open.", flush=True)
    server.serve_forever()
