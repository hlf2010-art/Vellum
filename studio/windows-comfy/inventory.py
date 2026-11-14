import json
from pathlib import Path
from urllib.parse import quote

ROOT=Path(__file__).resolve().parent
MODELS=json.loads((ROOT/'models.json').read_text())
VIDEO_FILE=ROOT/'video_models.json'
VIDEO_MODELS=json.loads(VIDEO_FILE.read_text()) if VIDEO_FILE.exists() else {}
LOADERS={'UNETLoader':('unet_name','diffusion_models'),'CLIPLoader':('clip_name','text_encoders'),'VAELoader':('vae_name','vae')}
def graph(key):
    return json.loads((ROOT/MODELS[key]['graph']).read_text())
def video_graph(key):
    raw=json.loads((ROOT/VIDEO_MODELS[key]['graph']).read_text())
    return {k:v for k,v in raw.items() if isinstance(v,dict) and 'class_type' in v}
def assets(workflow):
    return {folder:n['inputs'][field] for n in workflow.values() if isinstance(n,dict) and n.get('class_type') in LOADERS for field,folder in [LOADERS[n['class_type']]]}
def inventory(fetch):
    disk={f:json.loads(fetch('/models/'+f,timeout=4)) for f in ('diffusion_models','text_encoders','vae')}
    nodes={}
    rows=[]
    for key,spec in MODELS.items():
        w=graph(key); files=assets(w);missing=[name for folder,name in files.items() if name not in disk[folder]]
        for node in {n['class_type'] for n in w.values()}:
            if node not in nodes:nodes[node]=node in json.loads(fetch('/object_info/'+quote(node),timeout=4))
            if not nodes[node]:missing.append(node)
        edit_ready=spec['edit'] and bool(json.loads(fetch('/object_info/LoadImage',timeout=4)))
        if key=='qwen21' and edit_ready:
            enc=json.loads(fetch('/object_info/TextEncodeQwenImage21',timeout=4)).get('TextEncodeQwenImage21',{});edit_ready='images' in enc.get('input',{}).get('required',{}) and 'vae' in enc.get('input',{}).get('optional',{}) and enc.get('output',[])[2:3]==['LATENT']
        rows.append(dict(id=key,name=spec['name'],available=not missing,reason='Missing: '+', '.join(missing) if missing else '',notice=spec.get('notice',''),edit=edit_ready,files=files))
    known={r['files']['diffusion_models'] for r in rows}
    for name in sorted(set(disk['diffusion_models'])-known):
        rows.append(dict(id='file:'+name,name=name,available=False,reason='No verified image workflow'))
    return rows
def video_inventory(fetch):
    rows=[]
    if not VIDEO_MODELS:return rows
    nodes={}
    for key,spec in VIDEO_MODELS.items():
        gpath=ROOT/spec['graph']
        raw=json.loads(gpath.read_text()) if gpath.exists() else {}
        if '_template_note' in raw:
            rows.append(dict(id=key,name=spec['name'],kind='video',t2v_only=True,spec=spec.get('spec',{}),available=False,reason='Awaiting verified E: drive workflow export (workflow-h3-t2v.json)'))
            continue
        w=video_graph(key)
        missing=[]
        for node in {n['class_type'] for n in w.values()}:
            if node not in nodes:
                try:nodes[node]=node in json.loads(fetch('/object_info/'+quote(node),timeout=4))
                except Exception:nodes[node]=False
            if not nodes[node]:missing.append(node)
        rows.append(dict(id=key,name=spec['name'],kind='video',t2v_only=bool(spec.get('t2v_only',True)),spec=spec.get('spec',{}),available=not missing,reason='Missing: '+', '.join(missing) if missing else ''))
    return rows
