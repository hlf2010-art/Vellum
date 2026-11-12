"""Forward a canvas image job to the verified Windows workflow."""
import base64
import hashlib
import json
import time
import uuid
from inventory import MODELS, graph, assets, inventory
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, build_opener, ProxyHandler

BASE = "http://10.0.11.55:8188"
ROOT = Path(__file__).resolve().parent
JOBS = ROOT / "jobs"
JOBS.mkdir(exist_ok=True)
http = build_opener(ProxyHandler({}))

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
