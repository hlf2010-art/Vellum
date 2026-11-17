#!/usr/bin/env python3
"""Checks serve_vellum.py's /fetch-data (table from an address) with a local stand-in for "the internet".

Run: python3 studio/macos-app/test_serve_fetch.py
"""
import importlib.util
import json
import sys
import threading
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("serve_vellum", HERE / "serve_vellum.py")
sv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sv)

fails = 0


def check(name, ok, detail=""):
    global fails
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok else f"  — {detail}"))
    fails += not ok


class Data(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/sales.csv":
            body, ctype = b"region,q1\nNorth,120\nSouth,90\n", "text/csv; charset=utf-8"
        elif self.path == "/page":
            body, ctype = b"<!doctype html><title>Sign in</title>", "text/html"
        elif self.path == "/big.csv":
            body, ctype = b"a,b\n" + b"1,2\n" * 2_100_000, "text/csv"
        elif self.path == "/bounce":
            self.send_response(302)
            self.send_header("Location", f"http://localhost:{self.server.server_port}/sales.csv")
            self.end_headers()
            return
        else:
            self.send_response(404); self.end_headers(); return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


def serve(handler):
    srv = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


data = serve(Data)
app = serve(sv.VellumHandler)
D, A = f"http://127.0.0.1:{data.server_port}", f"http://127.0.0.1:{app.server_port}"


def fetch(url, origin=None):
    req = urllib.request.Request(f"{A}/fetch-data?url={urllib.parse.quote(url, safe='')}", headers={"Origin": origin} if origin else {})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, None


real_public = sv._is_public_host
check("a private address is refused", fetch(f"{D}/sales.csv")[1] == {"ok": False, "error": "invalid_or_private_url"})
check("another site cannot use the endpoint", fetch(f"{D}/sales.csv", origin="https://example.com")[0] == 403)
sv._is_public_host = lambda h: h == "127.0.0.1"  # the stand-in "internet"; localhost stays private
st, body = fetch(f"{D}/sales.csv")
check("a public CSV comes back as text", st == 200 and body["ok"] and body["text"].startswith("region,q1") and "csv" in body["type"], body)
check("a web page is refused (not data)", fetch(f"{D}/page")[1].get("error") == "web_page_not_data")
check("files over 8 MB are refused", fetch(f"{D}/big.csv")[1].get("error") == "too_large")
check("a public address redirecting into the local network is refused", fetch(f"{D}/bounce")[1].get("error") == "redirect_to_private_url")
sv._is_public_host = real_public
app.shutdown(); data.shutdown()
print("all passed" if not fails else f"{fails} failed")
sys.exit(1 if fails else 0)
