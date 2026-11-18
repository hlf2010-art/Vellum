#!/usr/bin/env python3
"""Static and cutout HTTP server for the bundled Vellum macOS app."""
import argparse
import atexit
import contextlib
import html as html_lib
import ipaddress
import json
import os
import re
import signal
import socket
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen

APP_DIR = Path(__file__).resolve().parents[2]
CUTOUT = APP_DIR / "studio" / "cutout" / "foreground.swift"
cutout_slot = threading.Lock()

# Studio AI launcher: lets the page's Start button open the bundled local model service.
STUDIO_PORT = 59631
STUDIO_SCRIPT = Path(os.environ.get("VELLUM_STUDIO_SCRIPT") or (APP_DIR / "Start Studio AI.command"))
studio_lock = threading.Lock()
studio_proc = None


def port_in_use(port: int) -> bool:
    with contextlib.suppress(OSError), socket.create_connection(("127.0.0.1", port), timeout=0.3):
        return True
    return False


def launch_studio() -> dict:
    """Start Studio AI once; never with arguments from the request."""
    global studio_proc
    if not STUDIO_SCRIPT.is_file():
        return {"ok": False, "error": "missing"}
    with studio_lock:
        if port_in_use(STUDIO_PORT) or (studio_proc and studio_proc.poll() is None):
            return {"ok": True, "started": False}
        studio_proc = subprocess.Popen(
            [sys.executable, str(STUDIO_SCRIPT), "--serve"],
            cwd=str(STUDIO_SCRIPT.parent),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
        )
        return {"ok": True, "started": True}


def stop_launched_studio():
    proc = studio_proc
    if proc and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()


# Automatic board backups. Vellum keeps a board in the browser's (or the app's) own storage, and clearing site data
# or moving between the browser and the Mac app loses it. The page posts a full .vellum.json bundle here (the same
# file Export Board downloads, so Import Board restores it) and the server keeps a thinned history of them in a plain
# folder that is easy to find. It is in the home folder, not Documents, so macOS does not ask for permission.
BACKUP_MAX_BYTES = 250_000_000
BACKUP_RECENT = 10        # always keep the newest few
BACKUP_DAILY_DAYS = 30    # and the last backup of each day for this long
BACKUP_STAMP = re.compile(r"^(\d{4})-(\d{2})-(\d{2})_(\d{6})\.vellum\.json$")


def backup_root():
    return Path(os.environ.get("VELLUM_BACKUP_DIR") or (Path.home() / "Vellum Backups"))


def backup_slug(title):
    slug = re.sub(r"[^\w\-]+", "-", str(title or ""), flags=re.UNICODE).strip("-_")[:40]
    return slug or "board"


def prune_backups(folder, now=None):
    """Keep the newest BACKUP_RECENT files, plus the last file of each day for BACKUP_DAILY_DAYS days. Returns how many were removed."""
    now = now or time.localtime()
    today = time.mktime(now) // 86400
    files = sorted((f for f in folder.iterdir() if BACKUP_STAMP.match(f.name)), key=lambda f: f.name, reverse=True)
    keep = set(files[:BACKUP_RECENT])
    seen_days = set()
    for f in files:  # newest first, so the first one seen for a day is that day's last backup
        m = BACKUP_STAMP.match(f.name)
        day = m.group(1) + m.group(2) + m.group(3)
        if day in seen_days:
            continue
        seen_days.add(day)
        try:
            age = today - time.mktime(time.strptime(day, "%Y%m%d")) // 86400
        except ValueError:
            continue
        if age <= BACKUP_DAILY_DAYS:
            keep.add(f)
    removed = 0
    for f in files:
        if f not in keep:
            with contextlib.suppress(OSError):
                f.unlink()
                removed += 1
    return removed


def save_backup(board_id, title, body, now=None):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", board_id or ""):
        return {"ok": False, "error": "bad_board"}
    if not body.lstrip().startswith(b"{") or b'"vellum-board.v1"' not in body[:400]:
        return {"ok": False, "error": "not_a_board"}
    folder = backup_root() / f"{backup_slug(title)}-{board_id}"
    try:
        folder.mkdir(parents=True, exist_ok=True)
        name = time.strftime("%Y-%m-%d_%H%M%S", now or time.localtime()) + ".vellum.json"
        tmp = folder / (name + ".part")
        tmp.write_bytes(body)
        tmp.replace(folder / name)  # a half-written backup never has a real name
        removed = prune_backups(folder, now)
        home = str(Path.home())
        shown = str(folder).replace(home, "~", 1) if str(folder).startswith(home + os.sep) else str(folder)
        return {"ok": True, "file": name, "dir": str(folder), "display": shown, "kept": sum(1 for f in folder.iterdir() if BACKUP_STAMP.match(f.name)), "removed": removed}
    except OSError:
        return {"ok": False, "error": "write_failed"}


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

    def same_origin(self):
        origin = self.headers.get("Origin", "")
        host = self.headers.get("Host", "")
        return bool(origin) and urlsplit(origin).netloc == host and host.split(":")[0] in ("127.0.0.1", "localhost")

    def send_json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if self.path != "/cutout" or not self.cutout_allowed():
            return self.send_error(403)
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        if self.path == "/launch/studio-ai":
            # Custom header + exact same origin: other sites can't trigger this (their preflight is refused).
            if not self.same_origin() or self.headers.get("X-Studio-Client") != "canvas":
                return self.send_error(403)
            try:
                return self.send_json(200, launch_studio())
            except OSError:
                return self.send_json(503, {"ok": False, "error": "spawn_failed"})
        if self.path == "/backup/board":
            # Only this page may write here (custom header + exact same origin), and only into the backup folder.
            if not self.same_origin() or self.headers.get("X-Studio-Client") != "canvas":
                return self.send_error(403)
            try:
                size = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self.send_json(400, {"ok": False, "error": "bad_request"})
            if not 0 < size <= BACKUP_MAX_BYTES:
                return self.send_json(413 if size > 0 else 400, {"ok": False, "error": "too_large" if size > 0 else "bad_request"})
            body = self.rfile.read(size)
            return self.send_json(200, save_backup(self.headers.get("X-Vellum-Board", ""), unquote(self.headers.get("X-Vellum-Title", "")), body))
        if self.path == "/notion/database":
            # The page's Notion token is posted here, so only this page may call it (custom header + same origin).
            if not self.same_origin() or self.headers.get("X-Studio-Client") != "canvas":
                return self.send_error(403)
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 16_000:
                    raise ValueError
                body = json.loads(self.rfile.read(size))
                if not isinstance(body, dict):
                    raise ValueError
            except (ValueError, json.JSONDecodeError):
                return self.send_json(400, {"ok": False, "error": "bad_request"})
            return self.send_json(200, notion_database(str(body.get("ref") or ""), str(body.get("token") or "")))
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
        elif req_path == "/launch/studio-ai":
            return self.send_json(200, {"available": STUDIO_SCRIPT.is_file()})
        elif req_path == "/fetch-data":
            # Raw CSV/TSV/JSON for the page's "table from an address" (sites that block cross-origin reads).
            if not self.cutout_allowed():
                return self.send_error(403)
            qs = parse_qs(parsed.query)
            return self.send_json(200, fetch_data((qs.get("url") or [""])[0].strip()))
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


DATA_MAX_BYTES = 8_000_000


class _PublicRedirects(HTTPRedirectHandler):
    """Follow redirects only to public hosts, so a public address can't bounce the fetch into the local network."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urlsplit(newurl)
        if target.scheme.lower() not in ("http", "https") or not target.hostname or not _is_public_host(target.hostname):
            raise ValueError("redirect_to_private_url")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_data(raw_url: str) -> dict:
    try:
        u = urlsplit(raw_url)
        if u.scheme.lower() not in ("http", "https") or not u.hostname or not _is_public_host(u.hostname):
            return {"ok": False, "error": "invalid_or_private_url"}
        req = Request(raw_url, headers={"User-Agent": "Vellum/1.0 (+table import)", "Accept": "text/csv,text/tab-separated-values,application/json,text/plain;q=0.9,*/*;q=0.5"})
        with build_opener(_PublicRedirects()).open(req, timeout=12) as resp:
            ctype = (resp.headers.get("Content-Type") or "").lower()
            if "html" in ctype:
                return {"ok": False, "error": "web_page_not_data"}
            raw = resp.read(DATA_MAX_BYTES + 1)
        if len(raw) > DATA_MAX_BYTES:
            return {"ok": False, "error": "too_large"}
        charset = re.search(r"charset=([\w-]+)", ctype)
        text = raw.decode(charset.group(1) if charset else "utf-8", errors="replace")
        return {"ok": True, "text": text, "type": ctype}
    except ValueError as exc:
        return {"ok": False, "error": str(exc)[:80] or "invalid"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:120]}


# Notion database -> table rows, through Notion's REST API with the integration token saved in MCP Sources.
NOTION_API = os.environ.get("VELLUM_NOTION_API", "https://api.notion.com").rstrip("/")
NOTION_MAX_ROWS = 500


def notion_db_id(ref: str):
    """Database id from an id or a notion.so link (the id is in the path; ?v= is the view, not the database)."""
    ref = (ref or "").strip()
    path = urlsplit(ref).path if "://" in ref else re.split(r"[?#]", ref)[0]  # the ?v= view id is never the database
    hits = re.findall(r"[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}", path, re.I)
    if not hits:
        return None
    h = hits[-1].replace("-", "").lower()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:]}"


def _notion_call(path, token, body=None):
    req = Request(f"{NOTION_API}/v1/{path}", data=json.dumps(body).encode() if body is not None else None,
                  method="POST" if body is not None else "GET",
                  headers={"Authorization": f"Bearer {token}", "Notion-Version": "2022-06-28",
                           "Content-Type": "application/json", "User-Agent": "Vellum/1.0 (+table import)"})
    try:
        with build_opener(_NoRedirects()).open(req, timeout=15) as resp:  # never forward the token elsewhere
            return json.loads(resp.read(DATA_MAX_BYTES))
    except HTTPError as err:
        try:
            info = json.loads(err.read(4000) or b"{}")
        except ValueError:
            info = {}
        code, msg = info.get("code", ""), str(info.get("message", ""))
        if err.code == 401:
            raise ValueError("bad_token")
        if err.code in (403, 404) or code in ("object_not_found", "restricted_resource"):
            raise ValueError("not_shared")
        if "is a page" in msg:
            raise ValueError("is_page")
        if err.code == 429:
            raise ValueError("rate_limited")
        raise ValueError(msg[:120] or f"HTTP {err.code}")


class _NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("unexpected_redirect")


def _rt(items):
    return "".join(x.get("plain_text", "") for x in (items or []) if isinstance(x, dict))


def _ndate(v):
    def one(x):
        x = str(x or "")
        return x[:10] + (" " + x[11:16] if len(x) > 10 and x[11:16] != "00:00" else "")
    if isinstance(v, str):
        return one(v)
    if not isinstance(v, dict) or not v.get("start"):
        return ""
    return one(v["start"]) + (" → " + one(v["end"]) if v.get("end") else "")


def _nnum(n):
    if n is None:
        return ""
    return str(int(n)) if isinstance(n, float) and n.is_integer() else str(n)


CURRENCY = {"dollar": "$", "euro": "€", "pound": "£", "yen": "¥", "yuan": "¥", "won": "₩", "rupee": "₹", "franc": "CHF ",
            "canadian_dollar": "CA$", "australian_dollar": "A$", "hong_kong_dollar": "HK$", "singapore_dollar": "S$"}


def _nfmt(n, fmt):
    """A number the way Notion shows it, so percent and currency columns are recognised as such."""
    if n is None:
        return ""
    if fmt == "percent":
        return _nnum(round(n * 100, 6)) + "%"
    if fmt == "number_with_commas":
        return f"{n:,}".rstrip("0").rstrip(".") if isinstance(n, float) else f"{n:,}"
    sym = CURRENCY.get(fmt or "")
    if sym:
        return ("-" if n < 0 else "") + sym + f"{abs(n):,.2f}".removesuffix(".00")
    return _nnum(n)


def notion_cell(p, fmt=None) -> str:
    """One property value as the text a person would read in Notion."""
    if not isinstance(p, dict):
        return ""
    t = p.get("type")
    v = p.get(t)
    if t in ("title", "rich_text"):
        return _rt(v)
    if t == "number":
        return _nfmt(v, fmt)
    if t in ("select", "status"):
        return (v or {}).get("name", "")
    if t == "multi_select":
        return ", ".join(o.get("name", "") for o in v or [])
    if t == "date":
        return _ndate(v)
    if t in ("created_time", "last_edited_time"):
        return _ndate(v)
    if t == "checkbox":
        return "Yes" if v else "No"
    if t in ("people",):
        return ", ".join(x.get("name", "") for x in v or [] if x.get("name"))
    if t in ("created_by", "last_edited_by"):
        return (v or {}).get("name", "")
    if t in ("url", "email", "phone_number"):
        return v or ""
    if t == "files":
        return ", ".join(f.get("name", "") for f in v or [])
    if t == "relation":
        return str(len(v)) if v else ""
    if t == "unique_id":
        return f"{(v or {}).get('prefix') + '-' if (v or {}).get('prefix') else ''}{(v or {}).get('number', '')}"
    if t == "formula":
        ft = (v or {}).get("type")
        fv = (v or {}).get(ft)
        return ("Yes" if fv else "No") if ft == "boolean" else _ndate(fv) if ft == "date" else _nnum(fv) if ft == "number" else str(fv or "")
    if t == "rollup":
        rt = (v or {}).get("type")
        if rt == "number":
            return _nnum(v.get("number"))
        if rt == "date":
            return _ndate(v.get("date"))
        if rt == "array":
            return ", ".join(x for x in (notion_cell(i) for i in v.get("array") or []) if x)
    return ""


def notion_database(ref: str, token: str) -> dict:
    db = notion_db_id(ref)
    if not db:
        return {"ok": False, "error": "no_id"}
    if not token.strip():
        return {"ok": False, "error": "no_token"}
    try:
        meta = _notion_call(f"databases/{db}", token.strip())
        props = meta.get("properties") or {}
        # Title column first. Notion's API doesn't give the view's column order, so the rest keep the API's order.
        names = sorted(props, key=lambda k: props[k].get("type") != "title")
        fmts = [((props[n].get("number") or {}).get("format") if props[n].get("type") == "number" else None) for n in names]
        rows, cursor, more = [], None, False
        started = time.monotonic()
        while len(rows) < NOTION_MAX_ROWS:
            if time.monotonic() - started > 30:  # stay well inside the page's wait; show what arrived
                more = True
                break
            page = _notion_call(f"databases/{db}/query", token.strip(),
                                {"page_size": 100, **({"start_cursor": cursor} if cursor else {})})
            for r in page.get("results") or []:
                rp = r.get("properties") or {}
                rows.append([notion_cell(rp.get(n), f) for n, f in zip(names, fmts)])
            cursor = page.get("next_cursor")
            if not page.get("has_more") or not cursor:
                break
        else:
            more = True
        if len(rows) > NOTION_MAX_ROWS:
            rows, more = rows[:NOTION_MAX_ROWS], True
        # Columns empty in every row add nothing to read (the title column always stays).
        keep = [i for i, n in enumerate(names) if i == 0 or any(r[i] for r in rows)]
        return {"ok": True, "id": db, "title": _rt(meta.get("title")) or "Notion database", "url": meta.get("url", ""),
                "columns": [names[i] for i in keep], "rows": [[r[i] for i in keep] for r in rows], "more": more}
    except ValueError as exc:
        return {"ok": False, "error": str(exc)[:80]}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:120] or "failed"}


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
    atexit.register(stop_launched_studio)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))  # run atexit when the app quits us
    server = ThreadingHTTPServer(("127.0.0.1", args.port), VellumHandler)
    print(f"Vellum UI ready at http://127.0.0.1:{args.port}/Vellum-Lumen.html", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
