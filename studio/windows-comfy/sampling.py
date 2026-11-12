"""Observe one ComfyUI request without controlling its execution."""
import json
import sys
import threading
from contextlib import closing
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent / "vendor"))
import websocket


class Sampling:
    def __init__(self, base, client, workflow):
        self.url = base.replace("http://", "ws://", 1) + "/ws?clientId=" + client
        self.host = urlsplit(base).hostname
        self.nodes = {str(k): n["class_type"] for k, n in workflow.items()}
        self.by_prompt = {}
        self.stop = threading.Event()
        self.ready = threading.Event()
        self.thread = threading.Thread(target=self.read, daemon=True)

    def __enter__(self):
        self.thread.start()
        self.ready.wait(2)
        return self

    def __exit__(self, *exc):
        self.stop.set()
        self.thread.join(2)

    def read(self):
        while not self.stop.is_set():
            try:
                with closing(websocket.create_connection(self.url, timeout=2, suppress_origin=True,
                                                  http_no_proxy=[self.host])) as connection:
                    self.ready.set()
                    while not self.stop.is_set():
                        try:
                            raw = connection.recv()
                        except websocket.WebSocketTimeoutException:
                            continue
                        if isinstance(raw, str) and raw:
                            self.event(json.loads(raw))
            except (OSError, ValueError, websocket.WebSocketException):
                self.by_prompt.clear()
                self.stop.wait(0.5)

    def event(self, message):
        kind = message.get("type")
        data = message.get("data") or {}
        pid = data.get("prompt_id")
        if not pid:
            return
        node = str(data.get("node"))
        op = self.nodes.get(node)
        if kind == "progress" and op == "KSampler":
            step, total = data.get("value"), data.get("max")
            if type(step) is int and type(total) is int and 0 <= step <= total and total > 0:
                self.by_prompt[pid] = dict(phase="Sampling", step=step, total=total)
        elif kind == "executing":
            phase = {"KSampler":"Sampling", "VAEDecode":"Decoding image", "SaveImage":"Saving image"}.get(op, "Preparing image")
            self.by_prompt[pid] = dict(phase=phase if data.get("node") is not None else "Receiving image")
        elif kind == "execution_success":
            self.by_prompt[pid] = dict(phase="Receiving image")
