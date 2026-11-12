from pathlib import Path
import json,urllib.request
root=Path('../ModWork/audit-fixes')
src=[('S1','Write feedback','Reported friction','docs/agent-history/2026-11-03-write-result-redesign.md','The creator reported that write results blended into the background and actions were mixed with outcomes. A revised receipt separates them; partial failures and retry remain visible.'),('S2','Restore scope','Design proposal','docs/2026-11-10-undo-model-proposal.md','The proposal distinguishes undoing a stroke, clearing a layer and restoring a package backup. Its example asks to preserve a later skin-tone change. This is a proposed scenario, not a recorded creator mistake.'),('S3','Hot-load guidance','Reported friction','docs/agent-history/interaction-flow-five-fixes-2026-10-09.md','The user reported conflicting guidance in four places about writing while the game was running. The record describes a shared explanation and per-file lock checks.')];sources=[dict(id=i,title=t,kind=k,path=p,excerpt=e,original=(root/p).read_text()[:1250]) for i,t,k,p,e in src]
system='You review MOD WORK creator research. Source excerpts are the only evidence. Return short editorial English. Judge the strength of the inference, distinguishing historical reports, repairs and hypotheses. Do not claim you ran a test. Output fields: claim (one plain sentence, maximum 15 words), reason (one or two sentences), decision (specific research priority, 12 words), test (one concrete creator task with observable success, 20 words), sources (IDs actually used).'
schema={'type':'object','properties':{**{k:{'type':'string'} for k in ['claim','reason','decision','test']},'sources':{'type':'array','items':{'type':'string','enum':['S1','S2','S3']},'minItems':1,'maxItems':3}},'required':['claim','reason','decision','test','sources'],'additionalProperties':False}
def run(prompt):
 body={'messages':[{'role':'system','content':system},{'role':'user','content':json.dumps([s['excerpt']+' ['+s['id']+']' for s in sources])+prompt}],'response_format':{'type':'json_schema','json_schema':{'name':'revision','schema':schema}},'max_tokens':650}
 req=urllib.request.Request('http://127.0.0.1:59631/studio/generate',data=json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Studio-Client':'canvas'})
 ans=''
 for line in urllib.request.urlopen(req,timeout=110):
  if line.startswith(b'data: {'):ans+=json.loads(line[6:])['choices'][0]['delta'].get('content') or ''
 return json.loads(ans)
base=run('Make the strongest defensible opening working hypothesis that creators MAY STRUGGLE to predict which edits survive a restore. Use only S2 for this inference. Attribute it to proposal scope. Recommend a scoped recovery study, not a product fix. Avoid numeric priority or generic labels.')
challenge='Which part was actually observed, and which part are we assuming?'
sample=run(json.dumps(base)+challenge+' Distinguish the directly reported write-receipt issue in S1 from the hypothetical restore scenario in S2. Recommend testing the revised receipt first. Ask a creator to explain a partial write and identify exactly which change to retry. Use S1 and S2 only; use plain natural English in full sentences.')
Path('studio/mod-review/seed.json').write_text(json.dumps(dict(system=system,schema=schema,sources=sources,base=base,example=sample,challenge=challenge),ensure_ascii=False))
