#!/usr/bin/env python3
"""Static and cutout HTTP server for the bundled Vellum macOS app."""
import argparse
import html as html_lib
import ipaddress
import json
import os
import re
import socket
import subprocess
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit
from urllib.request import Request, urlopen

APP_DIR = Path(__file__).resolve().parents[2]
CUTOUT = APP_DIR / "studio" / "cutout" / "foreground.swift"
cutout_slot = threading.Lock()


class VellumHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def cutout_allowed(self):
        origin = self.headers.get("Origin", "")
        host = self.headers.get("Host", "").split(":")[0]
        return host in ("127.0.0.1", "localhost") and (
            origin in ("", "null")
            or (urlsplit(origin).scheme in ("http", "https") and urlsplit(origin).hostname in ("localhost", "127.0.0.1"))
        )

    def do_OPTIONS(self):
        if self.path != "/cutout" or not self.cutout_allowed():
            return self.send_error(403)
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        if self.path != "/cutout" or not self.cutout_allowed() or self.headers.get("X-Studio-Client") != "canvas":
            return self.send_error(403)
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.send_error(400)
        if not 0 < size <= 48_000_000:
            return self.send_error(413)
        if not CUTOUT.is_file():
            return self.send_error(404)
        if not cutout_slot.acquire(False):
            return self.send_error(429)
        try:
            result = subprocess.run(
                ["/usr/bin/swift", str(CUTOUT)],
                input=self.rfile.read(size),
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=90,
            )
            if result.returncode or not result.stdout.startswith(b"\x89PNG"):
                return self.send_error(422)
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(result.stdout)))
            self.end_headers()
            self.wfile.write(result.stdout)
        except (OSError, subprocess.TimeoutExpired):
            self.send_error(503)
        finally:
            cutout_slot.release()

    def do_GET(self):
        parsed = urlsplit(self.path)
        req_path = unquote(parsed.path)
        if req_path in ("/", "/index.html"):
            self.path = "/Vellum-Lumen.html"
        elif req_path == "/app-health":
            body = b'{"ok":true}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        elif req_path == "/fetch-link":
            if not self.cutout_allowed():
                return self.send_error(403)
            qs = parse_qs(parsed.query)
            raw_url = (qs.get("url") or [""])[0].strip()
            payload = json.dumps(fetch_link_summary(raw_url), ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def end_headers(self):
        if self.path == "/cutout" and self.cutout_allowed():
            self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "null"))
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Studio-Client")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format, *args):
        pass


def _is_public_host(host: str) -> bool:
    if not host or host.lower() in ("localhost", "ip6-localhost"):
        return False
    try:
        infos = socket.getaddrinfo(host, None)
        for info in infos:
            ip = ipaddress.ip_address(info[4][0].split("%")[0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
        return bool(infos)
    except OSError:
        return False


def fetch_link_summary(raw_url: str) -> dict:
    try:
        u = urlsplit(raw_url)
        if u.scheme.lower() not in ("http", "https") or not u.hostname or not _is_public_host(u.hostname):
            return {"ok": False, "error": "invalid_or_private_url"}
        req = Request(raw_url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36", "Accept": "text/html,application/xhtml+xml"})
        with urlopen(req, timeout=6) as resp:
            ctype = (resp.headers.get("Content-Type") or "").lower()
            if "html" not in ctype and "text" not in ctype:
                return {"ok": False, "error": "non_html"}
            raw = resp.read(524288)
        text = raw.decode("utf-8", errors="replace")
        def meta(prop):
            m = re.search(rf'<meta[^>]+(?:name|property)=["\']{prop}["\'][^>]+content=["\']([^"\']+)["\']', text, re.I)
            if not m:
                m = re.search(rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:name|property)=["\']{prop}["\']', text, re.I)
            return html_lib.unescape(m.group(1)).strip() if m else ""
        tm = re.search(r"<title[^>]*>(.*?)</title>", text, re.I | re.S)
        title = meta("og:title") or (html_lib.unescape(re.sub(r"\s+", " ", tm.group(1))).strip() if tm else "")
        desc = meta("og:description") or meta("description")
        cleaned = re.sub(r"<(script|style|noscript|svg|nav|footer|header)[^>]*>[\s\S]*?</\1>", " ", text, flags=re.I)
        cleaned = re.sub(r"<[^>]+>", " ", cleaned)
        cleaned = html_lib.unescape(re.sub(r"\s+", " ", cleaned)).strip()
        return {"ok": True, "title": title[:160], "description": desc[:400], "excerpt": cleaned[:2200]}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:120]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8791)
    args = parser.parse_args()
    os.chdir(APP_DIR)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), VellumHandler)
    print(f"Vellum UI ready at http://127.0.0.1:{args.port}/Vellum-Lumen.html", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
