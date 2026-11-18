#!/usr/bin/env python3
"""Checks serve_vellum.py's /backup/board: automatic board backups into a plain folder, kept as a thinned history.

Run: python3 studio/macos-app/test_serve_backup.py
"""
import importlib.util
import json
import os
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
fails = 0


def check(name, ok, detail=""):
    global fails
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok else f"  — {detail}"))
    fails += not ok


tmp = Path(tempfile.mkdtemp(prefix="vellum-backup-test-"))
os.environ["VELLUM_BACKUP_DIR"] = str(tmp)
spec = importlib.util.spec_from_file_location("serve_vellum", HERE / "serve_vellum.py")
sv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sv)
app = ThreadingHTTPServer(("127.0.0.1", 0), sv.VellumHandler)
threading.Thread(target=app.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{app.server_port}"


def bundle(extra="", notes=3):
    board = {"id": "b1", "title": "My plan", "nodes": [{"id": "n1", "text": "Why I chose B"}], "changes": [{"op": "adopt", "id": "d1"}] * notes, "log": []}
    return json.dumps({"format": "vellum-board.v1", "exportedAt": 1, "board": board, "blobs": {"u:1": "data:image/png;base64,AAAA" + extra}}).encode()


def post(body, board="b1", title="My plan", origin=None, header=True, path="/backup/board"):
    req = urllib.request.Request(base + path, data=body, method="POST",
                                 headers={"Content-Type": "application/json", "Origin": origin or base, "X-Vellum-Board": board,
                                          "X-Vellum-Title": urllib.parse.quote(title), **({"X-Studio-Client": "canvas"} if header else {})})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except json.JSONDecodeError:
            return e.code, {}


code, d = post(bundle())
folder = Path(d.get("dir", "/nonexistent"))
files = sorted(folder.glob("*.vellum.json")) if folder.is_dir() else []
check("a backup is written to a folder named for the board, as a .vellum.json the page can import",
      code == 200 and d.get("ok") and folder.parent == tmp and folder.name == "My-plan-b1" and len(files) == 1
      and json.loads(files[0].read_bytes())["board"]["nodes"][0]["text"] == "Why I chose B", json.dumps(d))
check("the whole bundle is kept byte for byte, including the change log and media",
      files and files[0].read_bytes() == bundle() and not list(folder.glob("*.part")), "")

check("another site, or a request without the custom header, is refused",
      post(bundle(), origin="http://evil.example")[0] == 403 and post(bundle(), header=False)[0] == 403 and len(list(folder.glob("*.vellum.json"))) == 1, "")
check("a board id cannot walk out of the backup folder", post(bundle(), board="../../etc")[1].get("error") == "bad_board" and not (tmp.parent / "etc").exists(), "")
check("something that is not a board is refused", post(b'{"hello": 1}')[1].get("error") == "not_a_board" and post(b"not json")[1].get("error") == "not_a_board", "")
check("an empty body is refused", post(b"")[0] == 400, "")
check("a title with odd characters still gets a safe folder name",
      post(bundle(), title="../../x/ 创业 plan?")[1].get("dir", "").startswith(str(tmp)) and sv.backup_slug("../../x/ 创业 plan?") == "x-创业-plan", sv.backup_slug("../../x/ 创业 plan?"))

# thinning: newest 10 stay, plus the last backup of each day for 30 days, and the rest go
old = tmp / "old"
old.mkdir()
now = time.strptime("2026-11-18 12:00:00", "%Y-%m-%d %H:%M:%S")
names = [f"2026-11-18_{h:02d}0000.vellum.json" for h in range(1, 13)]                      # 12 today
names += [f"2026-11-{d:02d}_{h:02d}0000.vellum.json" for d in (17, 16) for h in (9, 15)]   # 2 per day on two earlier days
names += ["2026-09-01_090000.vellum.json", "2026-09-01_150000.vellum.json"]                # older than 30 days
for n in names:
    (old / n).write_text("{}")
(old / "notes.txt").write_text("not a backup")
removed = sv.prune_backups(old, now)
left = sorted(f.name for f in old.iterdir())
check("thinning keeps the newest 10, the last backup of each recent day, and nothing older than 30 days",
      "2026-11-18_120000.vellum.json" in left and "2026-11-18_030000.vellum.json" in left and "2026-11-18_020000.vellum.json" not in left
      and "2026-11-17_150000.vellum.json" in left and "2026-11-17_090000.vellum.json" not in left
      and "2026-11-16_150000.vellum.json" in left and not any(n.startswith("2026-09") for n in left) and "notes.txt" in left,
      f"removed {removed}: {left}")

# many saves in a row, a minute apart: the folder stays bounded and the newest is always there
t0 = time.mktime(time.strptime("2026-11-18 09:00:00", "%Y-%m-%d %H:%M:%S"))
for i in range(14):
    sv.save_backup("b2", "Busy", bundle(extra=str(i)), now=time.localtime(t0 + i * 60))
busy = sorted((tmp / "Busy-b2").glob("*.vellum.json"))
check("saving again and again keeps the newest 10; the last one saved is the newest file",
      len(busy) == 10 and b'AAAA13"' in busy[-1].read_bytes() and b'AAAA4"' in busy[0].read_bytes(),
      f"{len(busy)} files, {[f.name[-24:-12] for f in busy]}")

app.shutdown()
print(f"\n{'all passed' if not fails else str(fails) + ' failed'}")
raise SystemExit(1 if fails else 0)
