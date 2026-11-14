"""Forward a canvas image job to the verified Windows workflow."""
import base64
import hashlib
import json
import os
import threading
import time
import uuid
from inventory import MODELS, VIDEO_MODELS, graph, video_graph, assets, inventory, video_inventory
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, build_opener, ProxyHandler

BASE = os.environ.get("COMFY_BASE_URL", "http://10.0.11.55:8188")
STOP_URL = os.environ.get("WINDOWS_STOP_URL", "http://10.0.11.55:8189/stop")
ROOT = Path(__file__).resolve().parent
JOBS = ROOT / "jobs"
JOBS.mkdir(exist_ok=True)
TOKEN_FILE = Path(os.environ.get("STUDIO_CTRL_TOKEN_FILE", ROOT / ".ctrl_token"))
http = build_opener(ProxyHandler({}))
_stop_lock = threading.Lock()
_service_stopped = False


class ServiceStoppedError(RuntimeError):
    pass


def is_service_stopped():
    with _stop_lock:
        return _service_stopped


def set_service_stopped(val: bool):
    global _service_stopped
    with _stop_lock:
        _service_stopped = bool(val)


def _ctrl_token():
    tok = os.environ.get("STUDIO_CTRL_TOKEN", "").strip()
    if tok:
        return tok
    if TOKEN_FILE.exists():
        return TOKEN_FILE.read_text(encoding="utf-8").strip()
    return ""


def stop_windows_service():
    # Authenticate before any remote operation; stopping must never interrupt work.
    tok = _ctrl_token()
    if not tok:
        raise RuntimeError("Missing STUDIO_CTRL_TOKEN / .ctrl_token for authenticated Windows stop.")
    req = Request(
        STOP_URL,
        data=b"{}",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {tok}"},
        method="POST",
    )
    with http.open(req, timeout=8) as resp:
        res = json.load(resp)
    if not isinstance(res, dict) or res.get("stopped") is not True:
        raise RuntimeError("Windows did not acknowledge a completed stop.")
    set_service_stopped(True)
    return res

def fetch(path, payload=None, timeout=12):
    request = Request(BASE + path, data=json.dumps(payload).encode() if payload is not None else None,
                      headers={"Content-Type":"application/json"} if payload is not None else {})
    with http.open(request, timeout=timeout) as response:
        return response.read()

def store(path, value):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value))
    tmp.replace(path)

def upload_png(data, name):
    boundary = "Canvas"+uuid.uuid4().hex
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{name}"\r\nContent-Type: image/png\r\n\r\n'.encode()
            +data+f'\r\n--{boundary}--\r\n'.encode())
    req=Request(BASE+"/upload/image",data=body,headers={"Content-Type":"multipart/form-data; boundary="+boundary})
    with http.open(req,timeout=45) as res: info=json.load(res)
    return "/".join(filter(None,[info.get("subfolder"),info["name"]]))

def generate(prompt, request_id, image=None, guide=None, model="zimage", variation_seed=None, aspect_ratio=None, output_edge=1024, reference=None, cfg=1):
    if (reference and (model!="qwen21" or image)) or type(cfg) is not int or cfg not in (1,2) or (cfg!=1 and model!="qwen21"):raise ValueError("Unsupported reference or CFG")
    sizes={"4:3":(1024,768),"3:4":(768,1024),"1:1":(1024,1024),"16:9":(1024,576),"9:16":(576,1024)}
    if type(output_edge) is not int or output_edge not in (512,1024,1536) or (image and output_edge!=1024):raise ValueError("Unsupported output size")
    if aspect_ratio is not None and (aspect_ratio not in sizes or guide):raise ValueError("Unsupported generation ratio")
    if model not in MODELS:raise ValueError("Unknown image model")
    if variation_seed is not None and (type(variation_seed) is not int or not 0 <= variation_seed < 2**32):raise ValueError("Invalid variation seed")
    spec=MODELS[model]; node,field=spec["positive"]
    if image and not spec["edit"]:raise ValueError("No verified edit workflow for this model.")
    path = JOBS / (str(uuid.UUID(request_id)) + ".json")
    digest = hashlib.sha256(prompt.encode()).hexdigest()
    if image:
        digest = hashlib.sha256(bytes.fromhex(digest)+image+(guide or b"")).hexdigest()
    if reference or cfg!=1:
        digest=hashlib.sha256(bytes.fromhex(digest)+bytes([cfg])+(reference or b"")).hexdigest()
    if path.exists():
        record = json.loads(path.read_text())
        if record.get("output_edge",1024)!=output_edge or record["hash"] != digest or record.get("model","zimage") != model or record.get("variation_seed") != variation_seed or (record.get("aspect_ratio") or (None if image else "4:3"))!=(aspect_ratio or (None if image else "4:3")):
            raise ValueError("Request ID has different prompt text.")
    else:
        row=next(r for r in inventory(fetch) if r["id"]==model)
        if not row["available"]:raise ValueError(row["reason"])
        workflow=graph(model);workflow[node]["inputs"][field]=prompt
        if (aspect_ratio or output_edge!=1024) and not image:
            latent=next(n for n in workflow.values() if n['class_type'] in ('EmptyLatentImage','EmptySD3LatentImage'))
            width,height=sizes[aspect_ratio or '4:3'];latent['inputs'].update(width=width*output_edge//1024,height=height*output_edge//1024)
        if model=="qwen21":workflow["458"]["inputs"]["cfg"]=cfg
        if reference:
            filename=upload_png(reference,"modwork-reference-"+request_id+".png")
            workflow["1001"]={"class_type":"LoadImage","inputs":{"image":filename}}
            workflow[node]["inputs"].update({"vae":["454",0],"images.image_1":["1001",0],"resolution":1024})
        if variation_seed is not None:
            sampler=next(n for n in workflow.values() if n["class_type"]=="KSampler");sampler["inputs"]["seed"]=variation_seed
        if image:
            filename=upload_png(image, "modwork-"+request_id+".png")
            workflow["1001"]={"class_type":"LoadImage","inputs":{"image":filename}}
            source_node="1001"
            if guide:
                guided=upload_png(guide,"modwork-guide-"+request_id+".png")
                workflow["1003"]={"class_type":"LoadImage","inputs":{"image":guided}}
                source_node="1003"
            if model=="qwen21":
                workflow["452"]["inputs"].update({"vae":["454",0],"images.image_1":[source_node,0],"resolution":0})
                workflow["458"]["inputs"]["latent_image"]=["452",2]
                if not guide and not aspect_ratio:
                    workflow["1002"]={"class_type":"VAEEncode","inputs":{"pixels":[source_node,0],"vae":["454",0]}}
                    workflow["458"]["inputs"].update(latent_image=["1002",0],denoise=0.35)
                del workflow["456"]
            else:
                workflow["1002"]={"class_type":"VAEEncode","inputs":{"pixels":[source_node,0],"vae":["57:29",0]}}
                workflow["57:3"]["inputs"].update(latent_image=["1002",0],denoise=0.19 if guide else 0.60)
            if aspect_ratio:
                import struct, math
                ow,oh=struct.unpack(">II",image[16:24]);rw,rh=map(int,aspect_ratio.split(":"))
                scale=math.ceil(max(ow/rw,oh/rh));fw,fh=rw*scale,rh*scale
                if fw*fh>20000000:raise ValueError("Extended image exceeds 20 megapixels.")
                tw,th=sizes[aspect_ratio];fit=min(tw/ow,th/oh)
                iw=max(8,min(tw,round(ow*fit/8)*8));ih=max(8,min(th,round(oh*fit/8)*8))
                left=((tw-iw)//16)*8;top=((th-ih)//32)*8
                x=round((fw-ow)*left/max(1,tw-iw)) if tw!=iw else (fw-ow)//2
                y=round((fh-oh)*top/max(1,th-ih)) if th!=ih else (fh-oh)//2
                sampler,vae=(("458","454") if model=="qwen21" else ("57:3","57:29"))
                def add(key,kind,**inputs):workflow[key]={"class_type":kind,"inputs":inputs}
                add("1100","ImageScale",image=["1001",0],width=iw,height=ih,upscale_method="lanczos",crop="disabled")
                add("1101","ImagePadForOutpaint",image=["1100",0],left=left,right=tw-iw-left,top=top,bottom=th-ih-top,feathering=12)
                add("1102","VAEEncode",pixels=["1101",0],vae=[vae,0])
                add("1103","SetLatentNoiseMask",samples=["1102",0],mask=["1101",1])
                workflow[sampler]["inputs"].update(latent_image=["1103",0],denoise=1.0)
                if model=="qwen21":workflow["452"]["inputs"]["images.image_1"]=["1100",0]
                rendered=workflow[spec["output"]]["inputs"]["images"]
                add("1104","ImageScale",image=rendered,width=fw,height=fh,upscale_method="lanczos",crop="disabled")
                add("1105","ImageCompositeMasked",destination=["1104",0],source=["1001",0],x=x,y=y,resize_source=False)
                workflow[spec["output"]]["inputs"]["images"]=["1105",0]
        record = {"hash":digest,"client_id":request_id,"output_edge":output_edge,"variation_seed":variation_seed,"aspect_ratio":aspect_ratio,"model":model,"started":time.time(),"phase":"Submitting"}
        store(path, record)
        try:
            result = json.loads(fetch("/prompt", {"prompt":workflow,"client_id":request_id}))
        except HTTPError as e:
            if 400 <= e.code < 500:
                path.unlink(missing_ok=True)
                raise RuntimeError("Windows rejected the workflow (HTTP %s)." % e.code) from e
            raise
        record["prompt_id"] = result["prompt_id"];record["phase"]="Queued"
        store(path,record)
    if not record.get("prompt_id"):
        # A submit may have reached Windows before its acknowledgment reached us.
        queue = json.loads(fetch("/queue"))
        rows = queue.get("queue_running",[]) + queue.get("queue_pending",[])
        rows += [v["prompt"] for v in json.loads(fetch("/history?max_items=100")).values() if "prompt" in v]
        matches = [row[1] for row in rows if len(row)>3 and row[3].get("client_id")==request_id]
        if not matches:
            raise RuntimeError("Submission status uncertain. No new job was queued. Check the Windows queue.")
        record["prompt_id"]=matches[0]
        store(path,record)
    pid=record["prompt_id"]
    deadline=time.monotonic()+900
    while time.monotonic()<deadline:
        record_out=json.loads(fetch("/history/"+pid)).get(pid)
        if record_out:
            if record_out.get("status",{}).get("status_str")=="error":
                raise RuntimeError("Windows could not render job "+pid)
            images=record_out.get("outputs",{}).get(spec["output"],{}).get("images",[])
            if images:
                if record_out["prompt"][2][node]["inputs"][field]!=prompt or assets(record_out["prompt"][2])!=assets(graph(model)):
                    raise RuntimeError("Windows prompt did not match the accepted text.")
                location={k:images[0][k] for k in ("filename","subfolder","type")}
                data=fetch("/view?"+urlencode(location),timeout=45)
                if not data.startswith(b"\x89PNG\r\n\x1a\n"):raise RuntimeError("Windows did not return PNG data.")
                record.update(phase="Complete",completed=time.time(),files=assets(record_out["prompt"][2]),output=location,png_sha256=hashlib.sha256(data).hexdigest())
                store(path,record)
                return data
        if record.get("phase")!="Generating":
            queue=json.loads(fetch("/queue"))
            if any(r[1]==pid for r in queue.get("queue_running",[])):
                record["phase"]="Generating";store(path,record)
        time.sleep(2)
    raise RuntimeError("Windows job "+pid+" is still pending. Retry to check the same job.")


def _video_job_path(request_id: str) -> Path:
    return JOBS / (str(uuid.UUID(request_id)) + ".video.json")


def _video_asset_path(request_id: str) -> Path:
    return JOBS / (str(uuid.UUID(request_id)) + ".mp4")


def _extract_mp4_location(outputs: dict, preferred_node: str):
    nodes = [outputs.get(preferred_node)] if preferred_node in outputs else []
    nodes.extend(v for k, v in outputs.items() if k != preferred_node)
    for out in nodes:
        if not isinstance(out, dict):
            continue
        for bucket in ("videos", "gifs", "images"):
            for item in out.get(bucket) or []:
                fn = str(item.get("filename", ""))
                if fn.lower().endswith(".mp4"):
                    return {k: item[k] for k in ("filename", "subfolder", "type") if k in item}
    return None


def submit_video(prompt: str, request_id: str, model: str = "h3", seed=None, image=None, tail_frame=None):
    if is_service_stopped():
        raise ServiceStoppedError("服务已停止，请先在 Windows 手动启动模型服务")
    if image is not None or tail_frame is not None:
        raise ValueError("v1 supports text-to-video only")
    if model not in VIDEO_MODELS:
        raise ValueError("Unknown video model")
    if seed is not None and (type(seed) is not int or not 0 <= seed < 2**32):
        raise ValueError("Invalid seed")
    spec = VIDEO_MODELS[model]
    vspec = spec.get("spec", {"width": 864, "height": 480, "fps": 24, "frames": 121, "duration_sec": 5, "steps": 8})
    rid = str(uuid.UUID(request_id))
    digest = hashlib.sha256(json.dumps({"model": model, "prompt": prompt, "seed": seed, "spec": vspec}, sort_keys=True).encode()).hexdigest()
    jpath = _video_job_path(rid)
    if jpath.exists():
        rec = json.loads(jpath.read_text())
        if rec.get("hash") != digest:
            raise ValueError("Request ID reused with different video parameters.")
        return rec, False
    row = next((r for r in video_inventory(fetch) if r["id"] == model), None)
    if not row or not row["available"]:
        raise ValueError(row["reason"] if row else "Video model unavailable")
    rec = {
        "job_id": rid,
        "kind": "video",
        "model": model,
        "model_name": spec["name"],
        "prompt": prompt,
        "seed": seed,
        "spec": vspec,
        "hash": digest,
        "status": "queued",
        "phase": "Queued",
        "progress": 0,
        "created": time.time(),
    }
    store(jpath, rec)
    return rec, True


def execute_video_job(request_id: str, gpu_lock: threading.Lock, observers: dict):
    rid = str(uuid.UUID(request_id))
    jpath = _video_job_path(rid)
    if not jpath.exists():
        return
    rec = json.loads(jpath.read_text())
    if rec.get("status") in ("completed", "failed", "cancelled"):
        return
    with gpu_lock:
        if is_service_stopped():
            rec.update(status="cancelled", phase="Cancelled", error="Service stopped")
            store(jpath, rec)
            return
        spec = VIDEO_MODELS[rec["model"]]
        wf = video_graph(rec["model"])
        pnode, pfield = spec["positive"]
        wf[pnode]["inputs"][pfield] = rec["prompt"]
        if rec.get("seed") is not None and spec.get("seed_node"):
            sn, sf = spec["seed_node"]
            if sn in wf:
                wf[sn]["inputs"][sf] = rec["seed"]
        out_node = spec.get("output")
        if out_node and out_node in wf and "filename_prefix" in wf[out_node].get("inputs", {}):
            wf[out_node]["inputs"]["filename_prefix"] = f"vellum-h3/{rid[:8]}"
        from sampling import Sampling
        try:
            with Sampling(BASE, rid, wf) as observer:
                observers[rid] = observer
                if not rec.get("prompt_id"):
                    res = json.loads(fetch("/prompt", {"prompt": wf, "client_id": rid}))
                    rec["prompt_id"] = res["prompt_id"]
                rec.update(status="generating", phase="Generating", started=time.time())
                store(jpath, rec)
                pid = rec["prompt_id"]
                deadline = time.monotonic() + 1800
                while time.monotonic() < deadline:
                    if is_service_stopped():
                        rec.update(status="cancelled", phase="Cancelled", error="Service stopped")
                        store(jpath, rec)
                        return
                    hist = json.loads(fetch("/history/" + pid)).get(pid)
                    if hist:
                        if hist.get("status", {}).get("status_str") == "error":
                            raise RuntimeError("Windows ComfyUI video render error for " + pid)
                        loc = _extract_mp4_location(hist.get("outputs", {}), spec.get("output", ""))
                        if loc:
                            mp4 = fetch("/view?" + urlencode(loc), timeout=120)
                            if len(mp4) < 128:
                                raise RuntimeError("Windows returned empty MP4.")
                            apath = _video_asset_path(rid)
                            tmp = apath.with_suffix(".mp4.tmp")
                            tmp.write_bytes(mp4)
                            tmp.replace(apath)
                            rec.update(
                                status="completed",
                                phase="Complete",
                                progress=100,
                                completed=time.time(),
                                output=loc,
                                mp4_sha256=hashlib.sha256(mp4).hexdigest(),
                                asset_url=f"/media/assets/{rid}.mp4",
                                mime="video/mp4",
                                duration_sec=rec["spec"].get("duration_sec", 5),
                            )
                            store(jpath, rec)
                            return
                    obs = observer.by_prompt.get(pid, {})
                    if obs:
                        step, total = obs.get("step"), obs.get("total")
                        pct = round(step * 100 / total) if isinstance(step, int) and isinstance(total, int) and total > 0 else rec.get("progress", 0)
                        rec.update(progress=pct, step=step, steps=total)
                        store(jpath, rec)
                    time.sleep(2)
                raise RuntimeError("Video job timed out waiting for Windows render.")
        except Exception as err:
            rec.update(status="failed", phase="Failed", error=str(err), completed=time.time())
            store(jpath, rec)
        finally:
            observers.pop(rid, None)


def get_video_job(request_id: str, observers: dict):
    rid = str(uuid.UUID(request_id))
    jpath = _video_job_path(rid)
    if not jpath.exists():
        return None
    rec = json.loads(jpath.read_text())
    pid = rec.get("prompt_id")
    if rec.get("status") in ("queued", "generating"):
        obs = observers.get(rid)
        if obs and pid and pid in obs.by_prompt:
            o = obs.by_prompt[pid]
            step, total = o.get("step"), o.get("total")
            if isinstance(step, int) and isinstance(total, int) and total > 0:
                rec["progress"] = round(step * 100 / total)
                rec["step"] = step
                rec["steps"] = total
            if o.get("phase"):
                rec["phase"] = o["phase"]
        elif pid and not is_service_stopped():
            try:
                hist = json.loads(fetch("/history/" + pid, timeout=2)).get(pid)
                if hist and hist.get("status", {}).get("status_str") == "error":
                    rec.update(status="failed", phase="Failed", error="Windows ComfyUI execution error")
                    store(jpath, rec)
            except Exception:
                pass
    return {k: rec.get(k) for k in ("job_id", "kind", "model", "model_name", "status", "phase", "progress", "step", "steps", "asset_url", "mime", "duration_sec", "error", "spec") if rec.get(k) is not None or k in ("job_id", "status", "progress")}


def get_video_asset_path(request_id: str):
    p = _video_asset_path(request_id)
    return p if p.exists() else None
