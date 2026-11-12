from pathlib import Path
import re,json
d=Path(__file__).parent;study=json.loads((d/'study.json').read_text());enc=lambda v:json.dumps(v,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
s=(Path.home()/'Downloads/Gallery Pocket - Fable.html').read_text()
old=json.loads(re.search(r'const initialExhibit=(.*);',s)[1])
board={k:v for k,v in old.items() if k in ('cam','composer','updated','viewport')}
board.update(id='mod-restore-study',title='MOD WORK',renamed=True,nodes=[],edges=[],adopted={},selected='claim1',stage=1,drafts={},turns=[]);board['composer']={'pos':None,'folded':False}
def node(id,mw,x,y,title,text,**more):board['nodes'].append(dict(id=id,type='idea',mw=mw,x=x,y=y,title=title,text=text,**more))
def edge(a,b):board['edges'].append(dict(from_=a,to=b,kind='derive',role='参考'));board['edges'][-1]['from']=board['edges'][-1].pop('from_')
for i,z in enumerate(study['sources']):node(z['id'],'record',345,82+i*198,z['title'],z['excerpt'],kindLabel=z['kind'],originRecord=z)
s2=study['sources'][1];claim=study['claim'];basis=study['reason']
snap=dict(claim=claim,reason=basis,sources=[s2])
node('claim1','claim',740,254,claim,basis,version=1,snapshot=snap,fixed=True);edge('S2','claim1')
for i,b in enumerate(study['branches']):
 src=[s2] if i==0 else study['sources']
 node(b['id']+'1','branch',1180,145+i*280,b['title'],b['plan'],branch=b['id'],version=1,fixed=True,snapshot={**snap,'sources':src,'plan':b['plan'],'test':b['test']});edge('claim1',b['id']+'1')
 if i:edge('S1',b['id']+'1');edge('S3',b['id']+'1')
s=re.sub('const initialExhibit=.*?;\nconst exhibitFiles=.*?;\n',lambda _: 'const study='+enc(study)+';\nconst initialExhibit='+enc(board)+';\nconst exhibitFiles={};\n',s,count=1,flags=re.S)
s=s.replace('gallery-pocket.fable.v1','mod-work.fable.restore.v1').replace('Gallery Pocket · Fable edition','MOD WORK · Decision canvas').replace('>Fable edition<','>Decision study<').replace('+" · Fable edition"','+" · Decision study"')
s=s.replace('function bodyHTML(n){','function bodyHTML(n){\n  if(n.mw)return mwCard(n);')
s=s.replace("const kind=n.type+","const kind=(n.mw?'mw-node mw-'+n.mw+' ':'')+n.type+")
s=s.replace('function paintTrace(){','''function paintTrace(){
 if(openPanel==='trace'&&picked()?.mw){
 const n=picked();$("sideTitle").textContent="Trace";
 if(mwPending&&n.id===mwPending.claimId){mwImpact();return}
 const down=board.edges.filter(e=>e.from===n.id).map(e=>byId(e.to)).filter(Boolean);
 $("traceBody").innerHTML='<div class="tr-lead"><small>'+esc(n.kindLabel||('Version '+n.version))+'</small><h3>'+esc(n.title)+'</h3></div>'+(n.snapshot?mwSnapshot(n):mwEvidence([n.originRecord]))+(down.length?'<div class="mw-reader"><h3>Goes on to</h3>'+down.map(t=>'<button class="src-chip" data-action="trace-pick" data-target="'+t.id+'">'+esc(t.title)+'</button>').join(' ')+'</div>':'');
 return;}''')
s=s.replace('function composerMode(){','''function composerMode(){
 if(picked()?.mw==='claim'&&picked()===mwCurrent('claim'))return {label:"Challenge",place:"What would change this conclusion?",enabled:true};
 if(picked()?.mw)return {label:"Trace",place:"Follow the evidence for this card…",enabled:true};''')
s=s.replace('async function send(){','''async function send(){
 if(picked()?.mw){const n=picked();if(n===mwCurrent('claim')){const q=draftText().trim();mwReview(n);if(q)await mwGenerate(n,q,false);else $("mwAsk").focus()}else traceNode(n);return;}''')
s=s.replace('case "trace":closeDialog();','case "mw-challenge":mwReview(n);break;\n      case "trace":closeDialog();')
s=s.replace('function editAllowed(n){return n&&','function editAllowed(n){return n&&!n.mw&&')
s=s.replace('function removeNode(n){','function removeNode(n){if(n?.mw){showToast("Versioned study records are retained.");return;}')
s=s.replace('const target=n?.type==="direction"?','const target=n?.mw?(n.mw==="claim"?"Working hypothesis":n.title):n?.type==="direction"?',1)
s=s.replace('surface.setPointerCapture?.(e.pointerId);return;\n  }\n  if(pendingLink){','el.setPointerCapture?.(e.pointerId);return;\n  }\n  if(pendingLink){')
s=s.replace('surface.addEventListener("dblclick",e=>{','''surface.addEventListener("dblclick",e=>{
 if(e.target.closest(".node")&&!e.target.closest("button,a,input,textarea,select")){const n=byId(e.target.closest(".node").dataset.node);if(n){mwDetail(n);return}}''')
s=s.replace('else{selectNode(n);repaintSelection();}}return;}','else{selectNode(n);repaintSelection();mwDetail(n);}}return;}')
s=s.replace('function firstView(){', (d/'interaction.js').read_text()+'\nfunction firstView(){if(board.id===initialExhibit.id){selectNode(byId("claim1"));render();focusNodes(surface.clientWidth<700?[picked()]:[byId("S1"),byId("S3"),...mwNext()],1);return;}')
s=s.replace('installB();\nif(firstExhibit)', 'if(firstExhibit)')
s=s.replace('Collect what you caught','Project evidence').replace('Build each one','Research branches').replace('Split into two directions','Working hypothesis').replace('Release and play','Archive')
s=s.replace('</style>', '''.mw-node .card-head{display:none}.mw-plate{padding:17px 19px 11px}.mw-label,.mw-ver,.mw-option small{font:10px var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--ink-2)}.mw-ver{float:right}.mw-plate h3{font:500 23px/1.1 var(--serif);margin:12px 0 7px}.mw-plate p{font-size:13px;line-height:1.5;margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.mw-claim .mw-plate h3{font-size:30px}.mw-claim{border-top:2px solid var(--copper,#ad795c)}.mw-reader,.mw-option{padding:15px 18px}.mw-reader h3,.mw-reader label{display:block;font:600 14px var(--sans);margin:11px 0 5px}.mw-reader p{margin:5px 0 13px;line-height:1.55}.mw-reader textarea{box-sizing:border-box;width:100%;padding:9px;background:var(--bg);color:var(--ink);border:1px solid var(--line);font:inherit}.mw-reader pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto}.mw-reader code{overflow-wrap:anywhere}.mw-evidence{border-top:1px solid var(--line);padding:7px 0}.mw-evidence summary,.mw-option summary{cursor:pointer}.mw-evidence small{color:var(--ink-2);font-size:10px}.mw-actions{display:flex;gap:6px;justify-content:space-between;align-items:center}.mw-primary{padding:7px 11px;background:var(--ink);color:var(--bg);border-radius:5px}.mw-option{border-top:1px solid var(--line);padding:14px 0}.mw-option h4{font:500 22px var(--serif);margin:5px 0}.mw-option details{margin:7px 0}.mw-impact{outline:2px dashed var(--s1)!important}.mw-detail{width:min(650px,94vw)}.mw-detail .mw-reader{padding:0}.mw-node{cursor:grab}#exampleMenu{display:none} </style>''',1)
s=s.replace("function syncCards(){","function syncCards(){\n nodesEl.querySelectorAll('.mw-impact').forEach(el=>el.classList.remove('mw-impact'));")
s=s.replace('  const strip=$("composeContext");strip.hidden=!n;', '  const strip=$("composeContext");strip.hidden=!n||!!n.mw;')
s=s.replace("function firstView(){if(board.id", "function firstView(){if(board.id")
from media_build import integrate
s=integrate(s,d)
from material_build import integrate as add_materials
s=add_materials(s,d)
name='MOD WORK - Fable Decision Canvas.html'
for p in [Path.cwd()/name,Path('/Users/jordan/Documents/Codex/2026-11-11/wo/outputs')/name]:p.write_text(s)
