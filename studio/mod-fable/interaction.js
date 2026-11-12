let mwPending=null,mwRun=null,lastCardTap=null;
surface.addEventListener('pointerup',e=>{
 if(e.pointerType!=='touch'||e.target.closest('button,a,input,textarea')||gesture?.moved||pinch){lastCardTap=null;return}
 const el=e.target.closest('[data-node]');if(!el)return;
 const t=performance.now();if(lastCardTap?.id===el.dataset.node&&t-lastCardTap.at<380&&Math.hypot(e.clientX-lastCardTap.x,e.clientY-lastCardTap.y)<14){lastCardTap=null;mwDetail(byId(el.dataset.node))}else lastCardTap={at:t,id:el.dataset.node,x:e.clientX,y:e.clientY};
});
const mwCurrent=(kind,branch)=>board.nodes.filter(n=>n.mw===kind&&(!branch||n.branch===branch)).sort((a,b)=>b.version-a.version)[0];
const mwNext=()=>['scope','receipt'].map(k=>mwCurrent('branch',k)).filter(Boolean);
function mwSources(ids){return ids.map(id=>study.sources.find(s=>s.id===id)).filter(Boolean).map(s=>structuredClone(s))}
function mwEvidence(ss){return ss.map(s=>'<details class="mw-evidence"><summary>'+esc(s.title)+' <small>'+esc(s.kind)+'</small></summary><p>'+esc(s.excerpt)+'</p><code>'+esc(s.path)+'</code><pre>'+esc(s.original)+'</pre></details>').join('')}
function mwSnapshot(n){
 const s=n.snapshot;
 return '<div class="mw-reader"><p class="mw-label">Captured with v'+n.version+'</p><h3>Working claim</h3><p>'+esc(s.claim)+'</p><h3>Basis</h3><p>'+esc(s.reason)+'</p>'+(s.branchReason?'<p>'+esc(s.branchReason)+'</p>':'')+''+(s.question?'<h3>Challenge</h3><p>'+esc(s.question)+'</p>':'')+(s.plan?'<h3>Research plan</h3><p>'+esc(s.plan)+'</p><h3>Creator test</h3><p>'+esc(s.test)+'</p>':'')+'<h3>Evidence at this revision</h3>'+mwEvidence(s.sources)+'</div>';
}
function mwCard(n){
 let label=n.mw==='claim'?'Working hypothesis':n.mw==='branch'?('Research branch '+(n.branch==='scope'?'A':'B')):n.kindLabel;
 const badge=n.version?'<span class="mw-ver">'+(n.fixed?'Frozen · ':'')+'v'+n.version+'</span>':'';
 return '<div class="mw-plate"><div class="mw-label">'+esc(label)+' '+badge+'</div><h3>'+esc(n.title)+'</h3><p>'+esc(n.mw==='claim'?n.snapshot.reason:n.text)+'</p></div><div class="card-foot">'+btn("trace","Trace","Route")+(n.mw==='claim'&&n===mwCurrent('claim')?btn("mw-challenge","Challenge","CornerDownRight","primary-link"):'')+'</div>';
}
function mwDetail(n){
 if($("dialog").open)return;const el=nodeEl(n.id),r=el.getBoundingClientRect();
 dialog(n.title,n.snapshot?mwSnapshot(n):'<div class="mw-reader"><p>'+esc(n.text||directionDescSafe(n))+'</p>'+(n.originRecord?mwEvidence([n.originRecord]):'')+'</div>');
 function directionDescSafe(v){return v.desc||v.payload?.content||v.name||''}
 const d=$('dialog');d.classList.add('mw-detail');
 if(!matchMedia('(prefers-reduced-motion:reduce)').matches){
 const v=d.getBoundingClientRect(),dx=r.left+r.width/2-v.left-v.width/2,dy=r.top+r.height/2-v.top-v.height/2;
 d.animate([{transform:'translate('+dx*.35+'px,'+dy*.35+'px) scale(.88)',opacity:.25},{transform:'none',opacity:1}],{duration:220,easing:'cubic-bezier(.2,.75,.2,1)'})}
 d.addEventListener('close',()=>{d.classList.remove('mw-detail');nodeEl(n.id)?.focus({preventScroll:true})},{once:true});
}
function mwOpenTrace(n){selectNode(n);if(openPanel!=='trace')openSide('trace');render();focusNodes(surface.clientWidth<650?[n]:[n,...mwNext()],1)}
function mwReview(n){
 mwOpenTrace(n);
 const box=$('traceBody');
 box.innerHTML='<div class="tr-lead"><small>Challenge · v'+n.version+'</small><h3>'+esc(n.title)+'</h3><p>'+esc(n.snapshot.reason)+'</p></div><div class="mw-reader">'+mwEvidence(n.snapshot.sources)+'<form id="mwForm"><label for="mwAsk">Challenge this inference</label><textarea id="mwAsk" rows="3" required placeholder="What do the reports actually establish?"></textarea><div class="mw-actions"><button type="button" id="mwExample">Try the evidence question</button><button class="mw-primary">Reconsider ↗</button></div></form><p role="status" id="mwStatus"></p></div>';
 $('mwAsk').value=draftText(n.id);$('mwAsk').oninput=e=>{writeDraft(n.id,e.target.value);displayDraft();scheduleSave()};
 $('mwForm').onsubmit=e=>{e.preventDefault();mwGenerate(n,$('mwAsk').value.trim(),false)};
 $('mwExample').onclick=()=>{$('mwAsk').value=study.question;mwGenerate(n,study.question,n.version===1)};
}
function mwFingerprint(){return JSON.stringify([mwCurrent('claim')?.id,...mwNext().map(n=>[n.id,n.text,n.snapshot])])}
async function mwGenerate(n,q,sample){
 if(!q||n!==mwCurrent('claim'))return;
 mwRun?.abort();const ctrl=new AbortController();mwRun=ctrl;const fingerprint=mwFingerprint(),owner=board;
 const status=$('mwStatus');if(status)status.textContent='Reading the three project records…';
 const timer=setTimeout(()=>ctrl.abort(),140000);
 try{
 const result=sample?structuredClone(study.example):await modelJSON([{role:'system',content:study.system},{role:'user',content:JSON.stringify({claim:n.title,basis:n.snapshot.reason,challenge:q,branches:mwNext().map(b=>({id:b.branch,plan:b.text,test:b.snapshot.test})),sources:study.sources.map(s=>({id:s.id,title:s.title,excerpt:s.excerpt}))})}],study.schema,1100,'Reviewing branches',ctrl.signal);
 if(!result.claim||!result.scope?.plan||!result.receipt?.test)throw Error('Incomplete response.');
 if(board!==owner||mwRun!==ctrl||mwFingerprint()!==fingerprint)return;
 mwPending={result,q,fingerprint,claimId:n.id,sample};mwOpenTrace(n);mwImpact();
 }catch(e){if(status)status.textContent=ctrl.signal.aborted?'Request stopped.':'Could not generate a revision. Start the local Studio AI helper and retry.'}
 finally{clearTimeout(timer);if(mwRun===ctrl)mwRun=null}
}
function mwImpact(){
 const p=mwPending;if(!p)return;const r=p.result;
 $('traceBody').innerHTML='<div class="tr-lead"><small>'+(p.sample?'Recorded local-model review':'Local-model review')+'</small><h3>'+esc(r.claim)+'</h3><p>'+esc(r.reason)+'</p></div><div class="mw-reader"><h3>Branch impact</h3><p>Choose one branch to revise.</p>'+mwNext().map(n=>{const b=r[n.branch];return '<section class="mw-option"><small>'+ (b.affected?'Reconsider':'May stand')+' · v'+n.version+'</small><h4>'+esc(n.title)+'</h4><p>'+esc(b.why)+'</p><details><summary>Compare plans</summary><small>Current</small><p>'+esc(n.text)+'</p><small>Proposed</small><p>'+esc(b.plan)+'</p><p>'+esc(b.test)+'</p></details><button class="mw-primary" data-commit="'+n.branch+'">Revise '+(n.branch==='scope'?'A':'B')+' only ↗</button></section>'}).join('')+'<button id="mwDiscard">Discard proposal</button></div>';
 $('traceBody').querySelectorAll('[data-commit]').forEach(b=>b.onclick=()=>mwCommit(b.dataset.commit));$('mwDiscard').onclick=()=>{mwPending=null;render()};
 for(const n of mwNext())nodeEl(n.id)?.classList.toggle('mw-impact',!!r[n.branch].affected)
}
function mwCommit(k){
 const p=mwPending;if(!p||p.fingerprint!==mwFingerprint()){mwPending=null;render();showToast('The board changed. Recheck this inference.');return}
 const old=mwCurrent('claim'),prev=mwCurrent('branch',k),r=p.result,b=r[k];checkpoint('apply','Revise '+prev.title+' only','ai');
 const create=(from,props)=>newNode('idea',laneOf(from.x),props,freeSpot(from.x,from.y+nodeHeight(from)+52,nodeWidth(from),220));
 const snap={claim:r.claim,reason:r.reason,question:p.q,sources:mwSources(r.sources)};
 const c=create(old,{mw:'claim',version:old.version+1,title:r.claim,text:r.reason,snapshot:structuredClone(snap)});
 for(const id of r.sources)if(byId(id))edge(id,c.id,'ref','参考');
 const draft=create(prev,{mw:'branch',branch:k,version:prev.version+1,title:prev.title,text:b.plan,snapshot:{...snap,plan:b.plan,test:b.test,branchReason:b.why,sources:mwSources([...new Set([...r.sources,...b.sources])])}});
 edge(c.id,draft.id,'derive');edge(prev.id,draft.id,'revise');writeDraft(old.id,'');mwPending=null;finish(draft,[prev,draft,c]);showToast('Created v'+draft.version+' · '+draft.title+'. Earlier versions are preserved.');
}
