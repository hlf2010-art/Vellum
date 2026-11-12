from pathlib import Path
import base64,json,re
def integrate(s,d):
 root=Path('../ModWork')
 files={'V1':(root/'发带判定对照.png','image/png'),'V2':(root/'发带贴合剖析.mp4','video/mp4'),'V2poster':(d/'motion-poster.jpg','image/jpeg'),'V3':(root/'audit-fixes/fit-studio/implementation-pass1.png','image/png')}
 nodes=[]
 for k,title,desc,x,y in [('V1','Two fit verdicts','Two headband configurations on the same player show different sampled fit verdicts. This image documents the inspection surface.','15',80),('V2','Fit in motion','A 22-second project visualization of the headband inspection. Scrub to choose a frame.','15',395),('V3','Fitting workspace','An implementation capture of the player, garment mesh and fitting controls.','345',690)]:
  f,m=files[k];nodes.append(dict(id=k,title=title,name=f.name,mw='visual',type='asset',kind='video' if k=='V2' else 'image',mime=m,size=f.stat().st_size,text=desc,reading='Project reference',x=int(x),y=y,poster='V2poster' if k=='V2' else k))
 packed={k:{'bytes':base64.b64encode(f.read_bytes()).decode(),'mime':m} for k,(f,m) in files.items()}
 s=s.replace('let mwPending=', 'const PACKED_MEDIA='+json.dumps(packed,separators=(',',':'))+';const MEDIA_NODES='+json.dumps(nodes)+';\n'+(d/'visual.js').read_text()+'\nlet mwPending=',1)
 # register source media with the inherited importer and general Copilot
 s=s.replace('async function findBlob(id){','async function findBlob(id){if(["V1","V2","V3"].includes(id))return (await fetch(mwMediaURL(id))).blob();')
 s=s.replace('if(firstExhibit)firstView();','mwInstallMedia();if(firstExhibit)firstView();')
 s=s.replace('[byId("S1"),byId("S3"),...mwNext()]','[byId("V1"),byId("V2"),byId("S3"),...mwNext()]')
 s=s.replace('function mwCard(n){','function mwCard(n){if(n.mw==="visual")return mwVisualCard(n);')
 s=s.replace('if($("dialog").open)return;const el=nodeEl(n.id)', 'if($("dialog").open)return;if(n.type==="asset"&&["image","video"].includes(n.kind)){mwInspectMedia(n);return}const el=nodeEl(n.id)')
 s=s.replace("if(openPanel==='trace'&&picked()?.mw){","if(openPanel==='trace'&&picked()?.mw==='visual'){const n=picked();$('sideTitle').textContent='Trace';$('traceBody').innerHTML='<div class=\"mw-reader\">'+mwVisualCard(n)+'<p>'+esc(n.text)+'</p><code>'+esc(n.name)+'</code></div>';return;}\n if(openPanel==='trace'&&picked()?.mw){")
 s=s.replace("return '<div class=\"mw-reader\"><p class=\"mw-label\">Captured with v'","return '<div class=\"mw-reader\">'+(s.visual?mwFrame(s.visual):'')+'<p class=\"mw-label\">Captured with v'")
 s=s.replace(" $('mwAsk').value=draftText(n.id);", """ const vis=mwAttachments.get(n.id);if(vis){$('mwForm').insertAdjacentHTML('afterbegin',mwFrame(vis)+'<button type="button" id="mwDetach">Remove visual</button>');$('mwDetach').onclick=()=>{mwAttachments.delete(n.id);mwReview(n)};$('mwExample').hidden=true;}
 $('mwAsk').value=draftText(n.id);""")
 a=s.index(' const result=sample?structuredClone(study.example)');b=s.index(' if(!result.claim',a)
 s=s[:a]+''' const visual=mwAttachments.get(n.id),sources=study.sources.map(s=>({id:s.id,title:s.title,excerpt:s.excerpt})),schema=structuredClone(study.schema);
 if(visual){sources.push({id:'Visual',title:visual.title,time:visual.at});for(const props of [schema.properties,schema.properties.scope.properties,schema.properties.receipt.properties])props.sources.items.enum.push('Visual');}
 const prompt=JSON.stringify({claim:n.title,basis:n.snapshot.reason,challenge:q,branches:mwNext().map(b=>({id:b.branch,plan:b.text,test:b.snapshot.test})),sources});
 const content=visual?[{type:'text',text:prompt},{type:'image_url',image_url:{url:visual.jpeg}}]:prompt;
 const result=sample&&!visual?structuredClone(study.example):await modelJSON([{role:'system',content:study.system+' If a visual is supplied, identify concrete visible details. A product capture can establish what was displayed; do not infer user behavior, restore outcomes or runtime safety from pixels. Cite Visual only for visible evidence.'},{role:'user',content}],schema,1400,'Reviewing evidence',ctrl.signal);
'''+s[b:]
 s=s.replace('mwPending={result,q,fingerprint,claimId:n.id,sample}', 'mwPending={result,q,fingerprint,claimId:n.id,sample,visual}')
 s=s.replace("question:p.q,sources:mwSources(r.sources)", "question:p.q,visual:p.visual?structuredClone(p.visual):null,sources:mwSources(r.sources)")
 s=s.replace("for(const id of r.sources)if(byId(id))", "if(p.visual&&byId(p.visual.node))edge(p.visual.node,c.id,'ref','参考');for(const id of r.sources)if(byId(id))")
 s=s.replace('<h3>Branch impact</h3>',"""'+(p.visual?mwFrame(p.visual):'')+'<h3>Branch impact</h3>""")
 s=s.replace('</style>', '''.mw-still,.mw-frame{margin:0;position:relative}.mw-still img{width:100%;height:168px;object-fit:cover;object-position:center 36%;display:block}.mw-still span{position:absolute;bottom:8px;right:8px;background:#161918cc;color:#fff;padding:2px 6px;font:10px var(--mono)}.mw-caption{padding:10px 15px 12px}.mw-caption small,.mw-frame figcaption,.mw-mediafoot small{font:10px var(--mono);color:var(--ink-2)}.mw-caption h3{font:500 21px var(--serif);margin:3px 0 0}.mw-media-open{width:min(920px,94vw);max-height:94dvh}.mw-lightbox img,.mw-lightbox video{width:100%;max-height:64vh;object-fit:contain;background:#151a19;display:block}.mw-mediafoot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0}.mw-mediafoot p{max-width:60ch;margin:.35em 0}.mw-mediafoot button{flex:none}.mw-frame img{width:100%;max-height:220px;object-fit:contain;background:#171a18}.mw-frame figcaption{padding:4px 0 8px}#mwDetach{font-size:12px;text-decoration:underline;margin-bottom:12px} </style>''',1)
 s=s.replace("+'</h3><p>'+esc(n.mw==='claim'", "+'</h3>'+(n.mw==='branch'?mwSketch(n,false):'')+'<p>'+esc(n.mw==='claim'")
 s=s.replace("dialog(n.title,n.snapshot?mwSnapshot(n)","dialog(n.title,n.snapshot?(n.mw==='branch'?mwSketch(n,true):'')+mwSnapshot(n)")
 s=s.replace(" const d=$('dialog');d.classList.add('mw-detail');"," mwWireSketch(n);const d=$('dialog');d.classList.add('mw-detail');")
 s=s.replace(" const vis=mwAttachments.get(n.id);", """ $('mwForm').insertAdjacentHTML('beforebegin','<details class="mw-pick"><summary>Choose a visual reference</summary><div>'+MEDIA_NODES.map(v=>'<button data-media="'+v.id+'"><img src="'+mwMediaURL(v.poster||v.id)+'" alt=""><span>'+esc(v.title)+'</span></button>').join('')+'</div></details>');
 $('traceBody').querySelectorAll('[data-media]').forEach(b=>b.onclick=()=>{const v=byId(b.dataset.media);if(v)mwInspectMedia(v);});
 const vis=mwAttachments.get(n.id);""")
 s=s.replace('</style>', """.mw-sketch{background:var(--bg);border-block:1px solid var(--line);padding:8px 10px;margin:9px 0;color:var(--ink)}.mw-sketch small{font:9px var(--mono);text-transform:uppercase;letter-spacing:.08em}.mw-sketch label{display:flex;align-items:center;gap:7px;margin:3px 0;font:12px var(--sans)}.mw-sketch i{color:var(--s2);font-style:normal}.mw-sketch em{margin-left:auto;font:10px var(--mono)}.mw-sketch button,.mw-pick button{padding:4px 7px;border:1px solid var(--line)}.mw-sketch output{display:block;font-size:13px}.mw-pick{margin:6px 0 12px}.mw-pick div{display:flex;gap:4px;padding:5px 0}.mw-pick button{flex:1;min-width:0;padding:2px;font-size:10px}.mw-pick img{width:100%;height:42px;object-fit:cover}.mw-still img{height:154px} </style>""",1)
 return s
