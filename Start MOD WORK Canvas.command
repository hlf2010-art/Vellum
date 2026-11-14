#!/usr/bin/env python3
"""Serve the latest MOD WORK canvas on this Mac."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote
ROOT=Path(__file__).resolve().parent
import subprocess, threading
CUTOUT=ROOT / "studio" / "cutout" / "foreground.swift"
cutout_slot=threading.Lock()
class Canvas(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT),**kwargs)
    def cutout_allowed(self):
        origin=self.headers.get("Origin","")
        return self.headers.get("Host","") in ("127.0.0.1:8766","localhost:8766") and (origin in ("","null") or (urlsplit(origin).scheme in ("http","https") and urlsplit(origin).hostname in ("localhost","127.0.0.1")))
    def do_OPTIONS(self):
        if self.path!="/cutout" or not self.cutout_allowed():return self.send_error(403)
        self.send_response(204);self.end_headers()
    def do_POST(self):
        if self.path!="/cutout" or not self.cutout_allowed() or self.headers.get("X-Studio-Client")!="canvas":return self.send_error(403)
        try:size=int(self.headers.get("Content-Length","0"))
        except ValueError:return self.send_error(400)
        if not 0<size<=48000000:return self.send_error(413)
        if not cutout_slot.acquire(False):return self.send_error(429)
        try:
            result=subprocess.run(["/usr/bin/swift",str(CUTOUT)],input=self.rfile.read(size),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=90)
            if result.returncode or not result.stdout.startswith(b"\x89PNG"):return self.send_error(422)
            self.send_response(200);self.send_header("Content-Type","image/png");self.send_header("Content-Length",str(len(result.stdout)));self.end_headers();self.wfile.write(result.stdout)
        except (OSError,subprocess.TimeoutExpired):self.send_error(503)
        finally:cutout_slot.release()
    def do_GET(self):
        path=unquote(urlsplit(self.path).path)
        if path=='/': self.path='/MOD%20WORK%20-%20Redesign.html'
        elif '/' in path.lstrip('/') or not path.startswith('/MOD WORK - ') or not path.endswith(('.html','.png')):
            self.send_error(404);return
        super().do_GET()
    def end_headers(self):
        if self.path=="/cutout" and self.cutout_allowed():
            self.send_header("Access-Control-Allow-Origin",self.headers.get("Origin","null"))
            self.send_header("Access-Control-Allow-Methods","POST, OPTIONS");self.send_header("Access-Control-Allow-Headers","Content-Type, X-Studio-Client")
        self.send_header('Cache-Control','no-cache')
        super().end_headers()
print('Latest MOD WORK canvas: http://127.0.0.1:8766/',flush=True)
ThreadingHTTPServer(('127.0.0.1',8766),Canvas).serve_forever()
