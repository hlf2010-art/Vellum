#!/usr/bin/env python3
"""Checks serve_vellum.py's /notion/database (Notion database -> table) against a local stand-in for Notion's API.

Run: python3 studio/macos-app/test_serve_notion.py
"""
import importlib.util
import json
import os
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
fails = 0
seen = {}


def check(name, ok, detail=""):
    global fails
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok else f"  — {detail}"))
    fails += not ok


DB = "0123456789abcdef0123456789abcdef"
DB_DASHED = "01234567-89ab-cdef-0123-456789abcdef"


def row(i):
    return {"properties": {
        "Status": {"type": "status", "status": {"name": ["Done", "In progress", "Blocked"][i % 3]}},
        "Name": {"type": "title", "title": [{"plain_text": f"Task {i}"}]},
        "Points": {"type": "number", "number": float(i)},
        "Due": {"type": "date", "date": {"start": "2026-11-0%dT00:00:00.000Z" % (1 + i % 9)}},
        "Tags": {"type": "multi_select", "multi_select": [{"name": "ui"}, {"name": "data"}]},
        "Owner": {"type": "people", "people": [{"name": "Ada"}]},
        "Done": {"type": "checkbox", "checkbox": i % 2 == 0},
        "Links": {"type": "relation", "relation": [{"id": "x"}, {"id": "y"}]},
        "Score": {"type": "formula", "formula": {"type": "number", "number": 2.5}},
        "Notes": {"type": "rich_text", "rich_text": []},
        "Share": {"type": "number", "number": 0.25},
        "Budget": {"type": "number", "number": 1200.5},
    }}


FORMATS = {"Share": "percent", "Budget": "dollar"}


TOTAL = {"n": 230}


class Notion(BaseHTTPRequestHandler):
    def reply(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def auth(self):
        seen["auth"] = self.headers.get("Authorization")
        seen["version"] = self.headers.get("Notion-Version")
        if self.headers.get("Authorization") != "Bearer ntn_good":
            self.reply(401, {"code": "unauthorized", "message": "API token is invalid."})
            return False
        return True

    def do_GET(self):
        if not self.auth():
            return
        if self.path == f"/v1/databases/{DB_DASHED}":
            return self.reply(200, {"title": [{"plain_text": "Sprint board"}], "url": f"https://www.notion.so/{DB}",
                                    "properties": {k: {"type": v["type"], **({"number": {"format": FORMATS[k]}} if k in FORMATS else {})} for k, v in row(0)["properties"].items()}})
        if self.path.startswith("/v1/databases/bbbbbbbb"):
            return self.reply(403, {"code": "restricted_resource", "message": "Insufficient permissions."})
        if self.path.startswith("/v1/databases/cccccccc"):
            self.send_response(302); self.send_header("Location", "http://127.0.0.1:9/steal"); self.end_headers(); return
        if self.path.startswith("/v1/databases/aaaaaaaa"):
            return self.reply(400, {"code": "validation_error", "message": "Provided ID is a page, not a database."})
        return self.reply(404, {"code": "object_not_found", "message": "Could not find database."})

    def do_POST(self):
        if not self.auth():
            return
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
        start = int(body.get("start_cursor") or 0)
        end = min(start + body.get("page_size", 100), TOTAL["n"])
        self.reply(200, {"results": [row(i) for i in range(start, end)], "has_more": end < TOTAL["n"],
                         "next_cursor": str(end) if end < TOTAL["n"] else None})

    def log_message(self, *a):
        pass


def serve(handler):
    srv = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


notion = serve(Notion)
os.environ["VELLUM_NOTION_API"] = f"http://127.0.0.1:{notion.server_port}"
spec = importlib.util.spec_from_file_location("serve_vellum", HERE / "serve_vellum.py")
sv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sv)
app = serve(sv.VellumHandler)
base = f"http://127.0.0.1:{app.server_port}"


def post(payload, origin=None, header=True):
    req = urllib.request.Request(base + "/notion/database", data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Origin": origin or base,
                                          **({"X-Studio-Client": "canvas"} if header else {})})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, {}


link = f"https://www.notion.so/acme/Sprint-board-{DB}?v=fedcba9876543210fedcba9876543210"
check("a database id comes from the link path, not the ?v= view (with or without https://)",
      sv.notion_db_id(link) == DB_DASHED and sv.notion_db_id(link.split("://")[1]) == DB_DASHED, sv.notion_db_id(link.split("://")[1]))

code, d = post({"ref": link, "token": "ntn_good"})
check("reads a database: title column first, readable cells, empty columns dropped",
      code == 200 and d.get("ok") and d["title"] == "Sprint board" and d["columns"][0] == "Name" and "Notes" not in d["columns"]
      and dict(zip(d["columns"], d["rows"][3])) == {"Name": "Task 3", "Status": "Done", "Points": "3", "Due": "2026-11-04",
                                                    "Tags": "ui, data", "Owner": "Ada", "Done": "No", "Links": "2", "Score": "2.5",
                                                    "Share": "25%", "Budget": "$1,200.50"},
      json.dumps(d)[:400])
check("follows pages past 100 rows; sends the token and a pinned Notion-Version",
      len(d.get("rows", [])) == 230 and not d.get("more") and seen.get("auth") == "Bearer ntn_good" and seen.get("version") == "2022-06-28",
      f"{len(d.get('rows', []))} {seen}")

TOTAL["n"] = 640
code, d = post({"ref": DB, "token": "ntn_good"})
check("stops at 500 rows and says there are more", len(d.get("rows", [])) == 500 and d.get("more") is True, f"{len(d.get('rows', []))} {d.get('more')}")

errs = {k: post(v)[1].get("error") for k, v in {
    "bad_token": {"ref": DB, "token": "ntn_bad"},
    "no_token": {"ref": DB, "token": ""},
    "not_shared": {"ref": "ffffffffffffffffffffffffffffffff", "token": "ntn_good"},
    "is_page": {"ref": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "token": "ntn_good"},
    "no_id": {"ref": "https://www.notion.so/acme/Home", "token": "ntn_good"},
    "unexpected_redirect": {"ref": "cccccccccccccccccccccccccccccccc", "token": "ntn_good"},
}.items()}
errs["not_shared (403)"] = post({"ref": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "token": "ntn_good"})[1].get("error")
check("failures come back as reasons the page can explain; a redirect is refused so the token never leaves Notion",
      all(k.split(" ")[0] == v for k, v in errs.items()), json.dumps(errs))
req = urllib.request.Request(base + "/notion/database", data=b"[1]", method="POST", headers={"Origin": base, "X-Studio-Client": "canvas"})
try:
    bad = urllib.request.urlopen(req, timeout=5).status
except urllib.error.HTTPError as e:
    bad = e.code
check("a malformed body is a clean 400", bad == 400, bad)

check("other sites can't post a token here (origin and header both required)",
      post({"ref": DB, "token": "ntn_good"}, origin="https://evil.example")[0] == 403 and post({"ref": DB, "token": "ntn_good"}, header=False)[0] == 403)

app.shutdown()
notion.shutdown()
print("all passed" if not fails else f"{fails} failed")
raise SystemExit(1 if fails else 0)
