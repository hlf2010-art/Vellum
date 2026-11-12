from pathlib import Path
def integrate(s,d):
 def rep(a,b):
  nonlocal s
  if a not in s:raise ValueError(a)
  s=s.replace(a,b,1)
 rep("const mwMediaURLs=new Map()", (d/'materials.js').read_text()+"\nconst mwMediaURLs=new Map()")
 rep('function bodyHTML(n){','function bodyHTML(n){if(n.type==="asset"&&!n.mw)return matThumb(n)+\'<div class="card-foot">\'+btn("mat-inspect","Connect","Cable")+\'</div>\';')
 a=s.index('async function mwInspectMedia(n){');b=s.index('function mwFrame(v){',a)
 s=s[:a]+'function mwInspectMedia(n){return inspectMaterial(n)}\n'+s[b:]
 rep('function mwDetail(n){','function mwDetail(n){if(n.type==="asset"){inspectMaterial(n);return}if(n.type==="artifact"){inspectArtifact(n);return;}')
 rep('async function transcribeAudio(n,signal){','async function transcribeAudio(n,signal,start=0,end=90){')
 rep('Math.min(decoded.duration,90)','Math.min(decoded.duration-start,end-start,90)')
 rep('node.connect(offline.destination);node.start();','node.connect(offline.destination);node.start(0,start,seconds);')
 rep('function composerMode(){','''function composerMode(){if(picked()?.mw==='branch'&&picked().snapshot.materials?.length)return {label:'Review '+directionLetter(picked()),place:'Ask about this direction’s material…',enabled:true};''')
 rep('async function send(){','''async function send(){if(picked()?.mw==='branch'&&picked().snapshot.materials?.length){const n=picked();await directionReview(n);if(draftText(n.id).trim()&&$("matAsk"))$("matAsk").value=draftText(n.id);return;}''')
 rep('case "mw-challenge":','case "mat-inspect":await inspectMaterial(n);break;case "mat-review":await directionReview(n);break;case "mw-challenge":')
 rep("function mwSnapshot(n){","function mwSnapshot(n){")
 rep("+'<h3>Evidence at this revision</h3>'","+citationList(n)+'<h3>Evidence at this revision</h3>'")
 rep("n.mw==='claim'?'Working hypothesis':n.mw==='branch'?('Research branch '","n.mw==='claim'?'Claim':n.mw==='branch'?('Direction '")
 rep(":'')+'</div>';\n}\nfunction mwDetail", """:'')+(n.mw==='branch'&&n.snapshot.materials?.length?btn("mat-review","Review "+directionLetter(n),"Route","primary-link"):'')+'</div>';
}
function mwDetail""")
 rep("+(n.mw==='branch'?mwSketch(n,false):'')","+(n.mw==='branch'&&n.snapshot.materials?.length?'<small class=\"mat-count\">'+n.snapshot.materials.length+' linked material'+(n.snapshot.materials.length===1?'':'s')+'</small>':'')")
 rep("n.snapshot?(n.mw==='branch'?mwSketch(n,true):'')+mwSnapshot(n)","n.snapshot?mwSnapshot(n)")
 rep("const tag=n.type===\"artifact\"", "const tag=n.type==='asset'?'Material · '+assetLabel(n):n.type===\"artifact\"")
 rep("const created=files.map", "const branchDrop=attached?.mw==='branch';\n  const created=files.map")
 rep('if(attached)edge(n.id,attached.id,"ref",defaultRole(n));','if(attached&&!branchDrop&&!attached.fixed)edge(n.id,attached.id,"ref",defaultRole(n));')
 rep('if(opts.select!==false&&!attached&&!picked())selectNode(created[0]);','if(opts.select!==false&&(!attached||branchDrop))selectNode(created[0]);')
 rep('if(!base||files.length>1)focusNodes','if(!base)focusNodes')
 rep('if(n.kind==="image")n.tone=await sampleColor(n.id);}catch{n.reading=', '''if(n.kind==="image")n.tone=await sampleColor(n.id);if(n.kind==="video"){const frames=await visualFrames(n,1);if(frames[0])n.posterFrame=frames[0].url;}}catch{n.reading=''')
 rep('if(board===owning&&opts.draw!==false){render();persist();showToast(attached?', '''if(board===owning&&opts.draw!==false&&branchDrop){render();persist();await inspectMaterial(created[0],attached);return created;}
  if(board===owning&&opts.draw!==false){render();persist();showToast(attached&&!attached.fixed?''')
 rep('checkpoint("link",titleOf(source)+" → "+titleOf(target));const err=', '''if(source.type==="asset"&&target.mw==="branch"){wireHint();drawWires();inspectMaterial(source,target);return;}
  if(target.fixed){render();showToast("This revision is frozen. Use Challenge to start a revision.");return;}
  checkpoint("link",titleOf(source)+" → "+titleOf(target));const err=''')
 rep('pendingAction={op:"link",detail:titleOf(n)', '''if(target.mw==="branch"){n.x=g.x;n.y=g.y;render();inspectMaterial(n,target);return;}
      if(target.fixed){n.x=g.x;n.y=g.y;render();showToast("This revision is frozen.");return;}
      pendingAction={op:"link",detail:titleOf(n)''')
 rep("if(p.visual&&byId(p.visual.node))", "if(p.visual&&byId(p.visual.node))")
 rep("snapshot:{...snap,plan:b.plan","snapshot:{...snap,materials:structuredClone(prev.snapshot.materials||[]),plan:b.plan")
 rep("branches:mwNext().map(b=>({id:b.branch,plan:b.text,test:b.snapshot.test}))","branches:mwNext().map(b=>b.snapshot.materials?.length?study.branches.find(v=>v.id===b.branch):({id:b.branch,plan:b.text,test:b.snapshot.test}))")
 rep("mwInstallMedia();if(firstExhibit)", "mwInstallMedia();installStudyArtifacts();if(firstExhibit)")
 rep("const mwMediaURLs=new Map()",'''function installStudyArtifacts(){
 if(board.id!==initialExhibit.id||board.studyArtifacts)return;
 checkpoint("add","Make the two study sketches playable");for(const b of study.branches){const n=byId(b.id+"1");if(!n)continue;
 const activate=mwWireSketch.toString().replaceAll("$('dialogBody')","document.body").replaceAll("$('mwTrySketch')","document.getElementById('mwTrySketch')").replaceAll("$('mwSketchResult')","document.getElementById('mwSketchResult')");
 const content='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(n.title)+'</title><style>body{background:#f6f4ed;color:#252a26;padding:7vw;max-width:680px;margin:auto;font:17px/1.65 system-ui}h1{font:normal 40px Georgia}label{display:flex;align-items:center;gap:12px;padding:8px 0;border-top:1px solid #b9c1b8}em{margin-left:auto;color:#475d50}button{background:#24342c;color:white;border:0;padding:10px 16px;margin:15px 0}output{display:block}</style><h1>'+esc(n.title)+'</h1>'+mwSketch(n,true)+'<script>('+activate+')('+JSON.stringify({branch:n.branch})+');<\\/script></html>';
 const a=newNode("artifact",3,{format:"web",title:n.title+" sketch",ver:1,payload:{title:n.title,content,basis:"Interactive research scenario derived from "+n.title+" v1."}},{x:1840,y:n.y});edge(n.id,a.id,"derive");}
 board.studyArtifacts=true;persist();render();
}
const mwMediaURLs=new Map()''')
 rep('</style>', '''.mat-preview img,.mat-preview video{width:100%;height:154px;object-fit:cover;display:block}.mat-preview blockquote{font:normal 18px/1.35 var(--serif);margin:16px;overflow-wrap:anywhere}.mat-table{overflow:auto;max-height:45vh}.mat-table table{border-collapse:collapse;font-size:13px}.mat-table th,.mat-table td{padding:6px 9px;border-bottom:1px solid var(--line);text-align:left;max-width:260px;overflow-wrap:anywhere}.mat-preview .mat-table{overflow:hidden;max-height:126px}.mat-view img,.mat-view video{width:100%;max-height:58vh;object-fit:contain;background:#151918;display:block}.mat-view audio{width:100%}.mat-view textarea{width:100%;min-height:170px;background:var(--bg);color:var(--ink);padding:12px}.mat-meta,.mat-range,.mat-count{font:11px var(--mono);color:var(--ink-2);margin:8px 0}.mat-range input{width:65px}.mat-connect{display:flex;align-items:center;gap:9px;justify-content:space-between;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:12px}.mat-connect select{max-width:100%;font:inherit}.mat-cite{display:flex;align-items:center;gap:9px;width:100%;text-align:left;border-block-start:1px solid var(--line);padding:8px 0}.mat-cite img{width:54px;height:38px;object-fit:cover}.mat-cite span{flex:1}.mat-cite small{display:block}.mat-selected{background:var(--patina-soft)}.mw-media-open [readonly]{user-select:text} .sound-card{padding:20px}.mw-node.mw-branch .card-foot{flex-wrap:wrap} </style>''')
 rep('if(e.target.closest("#composer,.board-tools,.composer-return,#journey"))return;', 'if(e.target.closest("#composer,.board-tools,.composer-return,#journey,video,audio"))return;')
 rep("const branchDrop=attached?.mw==='branch';", "const branchDrop=attached?.mw==='branch'||attached?.mw==='claim';")
 rep("if(source.type===\"asset\"&&target.mw===\"branch\")", "if(source.type===\"asset\"&&(target.mw===\"branch\"||target.mw===\"claim\"))")
 rep('if(target.mw==="branch"){n.x=', 'if(target.mw==="branch"||target.mw==="claim"){n.x=')
 rep('function mwFrame(v){',"""function mwFrame(v){if(!v.jpeg)return '<div class="mw-frame"><b>'+esc(v.title)+'</b><small> · '+esc(v.label)+'</small><p>'+esc(v.excerpt)+'</p></div>';""")
 rep("title:visual.title,time:visual.at","title:visual.title,time:visual.at,excerpt:visual.excerpt")
 rep("const content=visual?[","const content=visual?.jpeg?[")
 rep("if(n.kind===\"image\"||n.kind===\"video\")urlCache.set(n.id,URL.createObjectURL(f));","if([\"image\",\"video\",\"audio\"].includes(n.kind))urlCache.set(n.id,URL.createObjectURL(f));")
 rep('</style>','.mat-preview video,.mat-preview audio{width:100%;display:block}.mat-preview audio{margin:12px 0} </style>')
 rep('if(n.type==="asset"&&!n.mw)return matThumb','if(board.id===initialExhibit.id&&n.type==="asset"&&!n.mw)return matThumb')
 rep('function mwDetail(n){if(n.type==="asset"){inspectMaterial(n);return}', 'function mwDetail(n){if(n.type==="asset"){if(board.id===initialExhibit.id)inspectMaterial(n);else inspect(n);return}')
 rep('["asset","文件","File"]','["asset","素材","Material"]')
 rep("const tag=n.type==='asset'?",'const tag=n.mwArtifact?"Artifact · v"+n.ver:n.type==="asset"?')
 rep('format:"web",title:n.title+" sketch"', 'mwArtifact:true,format:"web",title:n.title+" sketch"')
 rep("+' linked material'+(n.snapshot.materials.length===1?'':'s')+'</small>'","+' linked material'+(n.snapshot.materials.length===1?'':'s')+'</small>'+citationList(n)")
 rep("const key=\"S\"+(sources.length+1);let content=", """const key="S"+(sources.length+1);
    const selectedCuts=scopeMode!=="all"&&picked()?.snapshot?.materials?.filter(c=>c.node===n.id);
    if(selectedCuts?.length){
      const lines=[];
      for(const c of selectedCuts){lines.push(c.label+" · "+c.excerpt);if(c.jpeg&&visualBudget){pictures.push({key,label:c.label,url:c.jpeg});visualBudget--;}}
      const excerpt=lines.join("\n").slice(0,Math.min(5000,budget));budget-=excerpt.length;
      sources.push({key,id:n.id,title:titleOf(n),type:n.type,kind:n.kind,excerpt,read:"Linked selection"});continue;
    }
    let content=""".replace('lines.join("\n")','lines.join("\\n")'))
 rep('</style>', '.mw-plate .mat-cite{padding:5px 0;min-width:0;max-width:100%}.mw-plate .mat-cite span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mw-plate .mat-cite img{width:48px;height:32px} </style>')
 rep("markup+='<path class=\"wire ", """markup+='<path data-mat-wire="'+esc(e.from+'/'+e.to)+'" class="wire """)
 return s
