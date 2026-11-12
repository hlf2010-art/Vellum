#!/usr/bin/env python3
"""Serve the latest MOD WORK canvas on this Mac."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote
ROOT=Path(__file__).resolve().parent
class Canvas(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT),**kwargs)
    def do_GET(self):
        path=unquote(urlsplit(self.path).path)
        if path=='/': self.path='/MOD%20WORK%20-%20Redesign.html'
        elif '/' in path.lstrip('/') or not path.startswith('/MOD WORK - ') or not path.endswith(('.html','.png')):
            self.send_error(404);return
        super().do_GET()
    def end_headers(self):
        self.send_header('Cache-Control','no-cache')
        super().end_headers()
print('Latest MOD WORK canvas: http://127.0.0.1:8766/',flush=True)
ThreadingHTTPServer(('127.0.0.1',8766),Canvas).serve_forever()
