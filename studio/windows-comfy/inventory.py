import json
from pathlib import Path
from urllib.parse import quote

ROOT=Path(__file__).resolve().parent
MODELS=json.loads((ROOT/'models.json').read_text())
LOADERS={'UNETLoader':('unet_name','diffusion_models'),'CLIPLoader':('clip_name','text_encoders'),'VAELoader':('vae_name','vae')}
def graph(key):
    return json.loads((ROOT/MODELS[key]['graph']).read_text())
def assets(workflow):
    return {folder:n['inputs'][field] for n in workflow.values() if n['class_type'] in LOADERS for field,folder in [LOADERS[n['class_type']]]}
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
