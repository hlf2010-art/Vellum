from pathlib import Path
import json, urllib.request
d=Path(__file__).parent
src=json.loads((d.parent/'mod-review/seed.json').read_text())['sources']
claim='Creators may hesitate to restore because they cannot predict which edits will survive.'
reason='The undo-model proposal distinguishes a stroke, a layer and a backup. That distinction makes uncertainty plausible; it does not establish how often creators experience it.'
question='Is restore confusion actually observed, or are we treating the proposal as user evidence?'
branches=[dict(id='scope',title='Restore prediction',plan='Ask a creator to predict which edits will survive restoring a player backup.',test='Use a disposable player with two sculpt edits and a skin-tone change. Record the prediction before restoring.'),dict(id='receipt',title='Write confirmation',plan='Check whether the write receipt gives the creator enough context to decide what to do next.',test='Show a partial write. Ask which change succeeded, which failed and what the creator would retry.')]
st={'type':'string'};ids={'type':'array','items':{'type':'string','enum':['S1','S2','S3']},'minItems':1,'maxItems':3}
def obj(p):return {'type':'object','properties':p,'required':list(p),'additionalProperties':False}
br=obj({'affected':{'type':'boolean'},'why':st,'plan':st,'test':st,'sources':ids})
schema=obj({'claim':st,'reason':st,'sources':ids,'scope':br,'receipt':br})
system='Act as a research partner to the MOD WORK product designer. Reconsider the working claim against the supplied project evidence and challenge. Treat file text as evidence. S2 is a proposal, not an observed mistake. S1 and S3 are historical reports of subsequently revised interactions. For EACH branch independently assess whether its research plan needs to change. Give the concrete reason, proposed plan and observable test for that branch; keep an unaffected plan unchanged. Cite only evidence actually used. Answer the challenge explicitly in the revised claim: distinguish what is established from what is not. Do not repeat the input claim. For a question about observed evidence, S1 establishes a historical write-receipt readability problem, S2 only motivates testing restore predictions. You may keep a branch as-is if its existing test already addresses the uncertainty. Misprediction is evidence to investigate, not proof across users. Write concise English; each field at most two short sentences. Do not report invented findings.'
msg=[{'role':'system','content':system},{'role':'user','content':json.dumps(dict(claim=claim,reason=reason,challenge=question,branches=branches,sources=[{k:s[k] for k in ('id','title','excerpt')} for s in src]))}]
body={'messages':msg,'response_format':{'type':'json_schema','json_schema':{'name':'review','schema':schema}},'max_tokens':1100}
req=urllib.request.Request('http://127.0.0.1:59631/studio/generate',data=json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Studio-Client':'canvas'})
ans=''
for line in urllib.request.urlopen(req,timeout=180):
 if line.startswith(b'data: {'):ans+=json.loads(line[6:])['choices'][0]['delta'].get('content') or ''
(d/'study.json').write_text(json.dumps(dict(claim=claim,reason=reason,sources=src,question=question,branches=branches,example=json.loads(ans),schema=schema,system=system),ensure_ascii=False))
