// Materials stay at their drop point. A citation records the selected part, not just the file ID.
const directionLetter=n=>n.branch==='scope'?'A':'B';
const seconds=t=>Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0')+'.'+Math.floor(t*10)%10;
const tabular=n=>n.kind==='sheet'||/\.(csv|tsv|xlsx)$/i.test(n.name||'');
function tableData(n){return parseTable(n.text||'',(n.text||'').split('\n')[0].includes('\t')?'\t':',');}
function materialTitle(n){return n.title||n.name;}
function materialURL(n){return PACKED_MEDIA[n.id]?mwMediaURL(n.id):mediaUrl(n.id);}
function matThumb(n){
 const src=urlCache.get(n.id),poster=n.posterFrame;
 let body='';
 if(n.kind==='video'&&src)body='<video controls playsinline preload="metadata" '+(poster?'poster="'+esc(poster)+'"':'')+' src="'+esc(src)+'"></video>';
 else if(n.kind==='image'&&src)body='<img src="'+esc(src)+'" alt="">';
 else if(poster)body='<img src="'+esc(poster)+'" alt="">';
 else if(tabular(n))body=matTable(tableData(n).slice(0,4));
 else if(n.kind==='audio')body=src?'<audio controls preload="metadata" src="'+esc(src)+'"></audio>':'<div class="sound-card">'+ic('AudioLines')+'</div>';
 else body='<blockquote>'+esc(clipText(n.text||readingLabel(n.reading),150))+'</blockquote>';
 return '<div class="mat-preview">'+body+'</div><div class="mw-caption"><small>Material · '+esc(tabular(n)?'Table':n.kind)+'</small><h3>'+esc(n.name)+'</h3></div>';
}
function matTable(rows){
 return '<div class="mat-table"><table>'+rows.map((r,i)=>'<tr>'+r.slice(0,12).map(c=>i?'<td>'+esc(c)+'</td>':'<th>'+esc(c)+'</th>').join('')+'</tr>').join('')+'</table></div>';
}
function citationList(n){
 return (n.snapshot?.materials||[]).map((c,i)=>'<button class="mat-cite" data-cite-index="'+i+'" data-owner="'+n.id+'">'+(c.jpeg?'<img src="'+esc(c.jpeg)+'" alt="">':'')+'<span>'+esc(c.title)+'<small>'+esc(c.label)+'</small></span>↗</button>').join('');
}
async function inspectMaterial(n,target=null,citation=null){
 if(assetTasks.has(n.id))await assetTasks.get(n.id);
 const previous=$('matPlayer');if(previous)previous.pause();
 const url=await materialURL(n),video=n.kind==='video',audio=n.kind==='audio',image=n.kind==='image',table=tabular(n),rows=table?tableData(n):[];
 const choices=mwNext();
 let viewer='',tools='';
 if(video||audio){viewer='<'+n.kind+' id="matPlayer" controls playsinline preload="auto"></'+n.kind+'>';if(audio)tools='<label>From <input id="matFrom" type="number" min="0" step=".1" value="'+(citation?.at||0)+'"></label><label>to <input id="matTo" type="number" min="0" step=".1" value="'+(citation?.end||15)+'"></label> seconds';}
 else if(image)viewer='<img id="matImage" alt="'+esc(materialTitle(n))+'">';
 else if(table){viewer=matTable(rows.slice(0,201));tools='<label>Data rows <input type="number" min="1" max="'+(rows.length-1)+'" id="matFrom" value="'+(citation?.first||1)+'"></label><label>to <input type="number" min="1" max="'+(rows.length-1)+'" id="matTo" value="'+(citation?.last||Math.min(3,rows.length-1))+'"></label>';}
 else if(!n.text)viewer='<p class="mat-metadata">Only file metadata is available for this material. Open the original to inspect its contents.</p>';
 else viewer='<textarea readonly id="matText" aria-label="Select a passage to connect">'+esc(n.text||'')+'</textarea>';
 dialog(materialTitle(n),'<div class="material-sheet"><div class="mat-view">'+viewer+'</div><div class="mat-meta">'+esc(PACKED_MEDIA[n.id]?'Project reference':'Uploaded by you')+' · '+esc(n.name)+(url?' · <a href="'+esc(url)+'" download="'+esc(n.name)+'">Original ↗</a>':'')+'</div>'+
 '<div class="mat-range">'+tools+'</div><div class="mat-connect"><label>Connect to <select id="matTarget"><option value="">Choose a destination…</option>'+choices.map(b=>'<option value="'+b.branch+'" '+(target?.branch===b.branch?'selected':'')+'>'+directionLetter(b)+' · '+esc(b.title)+'</option>').join('')+'<option value="claim" '+(target?.mw==="claim"?"selected":"")+'>Working claim</option></select></label><button id="matConnect" class="mw-primary">'+(video?'Connect frame':audio?'Connect passage':table?'Connect rows':image?'Connect image':'Connect excerpt')+' ↗</button></div><p id="matStatus" role="status"></p></div>');
 const dlg=$('dialog');dlg.classList.add('mw-media-open');
 const anchor=nodeEl(n.id)?.getBoundingClientRect();
 if(anchor&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
   const box=dlg.getBoundingClientRect(),dx=(anchor.left+anchor.width/2-box.left-box.width/2)*.22,dy=(anchor.top+anchor.height/2-box.top-box.height/2)*.22;
   dlg.animate([{transform:'translate('+dx+'px,'+dy+'px) scale(.95)',opacity:.3},{transform:'none',opacity:1}],{duration:190,easing:'cubic-bezier(.2,.8,.2,1)'});
 }
 const el=$('matPlayer')||$('matImage'),status=$('matStatus');
 if(el){
   if(video||audio){el.onloadedmetadata=()=>{const from=citation?.at??nodeEl(n.id)?.querySelector('video,audio')?.currentTime;if(from)el.currentTime=from;if(audio&&Number.isFinite(el.duration))$('matTo').value=Math.min(el.duration,Number($('matTo').value)).toFixed(2);};}
   nodeEl(n.id)?.querySelector('video,audio')?.pause();if(url)el.src=url;else status.textContent='Original unavailable in this browser.';
   dlg.addEventListener('close',()=>{if(video||audio)el.pause();el.removeAttribute('src');dlg.classList.remove('mw-media-open')},{once:true});
 }else{dlg.addEventListener('close',()=>dlg.classList.remove('mw-media-open'),{once:true});if(citation?.start!=null&&$('matText'))$('matText').setSelectionRange(citation.start,citation.stop);}
 const action=$('matConnect');action.disabled=!$('matTarget').value;
 $('matTarget').onchange=()=>{action.disabled=!$('matTarget').value};
 action.onclick=async()=>{
   const k=$('matTarget').value,owner=board,targetNode=k==='claim'?mwCurrent('claim'):mwCurrent('branch',k);
   action.disabled=true;
   try{
     const c={node:n.id,title:materialTitle(n),path:n.name,kind:n.kind,label:'',excerpt:'',at:null};
     if(image||video){if(video)el.pause();const w=image?el.naturalWidth:el.videoWidth,h=image?el.naturalHeight:el.videoHeight;if(!w||!h)throw Error('Wait for the preview to load.');c.jpeg=jpgFrame(el,w,h);c.at=video?Number(el.currentTime.toFixed(2)):null;c.label=video?'Frame · '+seconds(c.at):'Full image';}
     else if(audio){c.at=Number($('matFrom').value);c.end=Number($('matTo').value);if(!Number.isFinite(el.duration)||c.at<0||c.end<=c.at||c.end>el.duration+.01||c.end-c.at>90)throw Error('Choose a valid passage of up to 90 seconds.');status.textContent='Transcribing the selected passage…';c.excerpt=await transcribeAudio(n,AbortSignal.timeout(120000),c.at,c.end);c.label=seconds(c.at)+' – '+seconds(c.end);}
     else if(table){c.first=Number($('matFrom').value);c.last=Number($('matTo').value);if(!Number.isInteger(c.first)||!Number.isInteger(c.last)||c.first<1||c.last<c.first||c.last>=rows.length)throw Error('Choose rows within the table.');c.excerpt=[rows[0],...rows.slice(c.first,c.last+1)].map(r=>r.join('\t')).join('\n');c.label='Rows '+c.first+'–'+c.last;}
     else if(!$('matText')){c.label='File metadata';c.excerpt=n.name+' · '+(n.mime||n.kind)+' · '+sizeLabel(n.size)+'; contents unavailable';}
     else{const t=$('matText'),a=t.selectionStart,b=t.selectionEnd;c.start=a===b?0:a;c.stop=a===b?t.value.length:b;c.excerpt=t.value.slice(c.start,c.stop);if(!c.excerpt.trim())throw Error('No readable text in this material.');c.label=a===b?'Available text':'Selected passage';}
     if(c.excerpt.length>6000)throw Error('Select a shorter excerpt (up to 6,000 characters).');
     if(!dlg.open||!status.isConnected||board!==owner||!byId(n.id)||!targetNode||!byId(targetNode.id))return;
     
     closeDialog();
     if(k==='claim'){mwAttachments.set(targetNode.id,{...c,id:'Visual'});mwReview(targetNode);return;}
     linkMaterial(n,targetNode,c);
   }catch(e){status.textContent=e.message;}finally{action.disabled=!$('matTarget')?.value;}
 };
 // Excerpts keep their exact location when revisited from Trace.
 if(table&&citation?.first){const list=dlg.querySelectorAll('tr');for(let i=citation.first;i<=citation.last;i++)list[i]?.classList.add('mat-selected');list[citation.first]?.scrollIntoView({block:'nearest'});}
}
function linkMaterial(n,target,c){
 if(target!==mwCurrent('branch',target.branch)){showToast('This direction changed. Connect to its latest revision.');return;}
 const existing=target.snapshot.materials||[];
 if(existing.some(x=>x.node===c.node&&x.label===c.label&&x.excerpt===c.excerpt&&x.at===c.at&&x.start===c.start)){showToast('Already connected to this direction.');return;}
 checkpoint('link',c.title+' → '+directionLetter(target)+' · '+c.label);
 const v=newNode('idea',2,{mw:'branch',branch:target.branch,title:target.title,text:target.text,version:target.version+1,snapshot:{...structuredClone(target.snapshot),materials:[...structuredClone(existing),c]}},freeSpot(target.x,target.y+nodeHeight(target)+42,nodeWidth(target),300));
 edge(target.id,v.id,'revise');edge(n.id,v.id,'ref','参考');mwPending=null;
 glide();finish(v,[n,v]);
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
   const path=wires.querySelector('[data-mat-wire="'+n.id+'/'+v.id+'"]');
   if(path){const len=path.getTotalLength();path.animate([{strokeDasharray:len,strokeDashoffset:len},{strokeDasharray:len,strokeDashoffset:0}],{duration:520,easing:'ease-out'});}
 }
 showToast('Connected to '+directionLetter(v)+' v'+v.version+' · '+c.label);
}
async function directionReview(n){
 const cs=n.snapshot.materials||[];if(!cs.length)return mwDetail(n);
 dialog('Review '+directionLetter(n)+' · '+n.title,'<div class="mw-reader">'+citationList(n)+'<label for="matAsk">Question for this direction</label><textarea id="matAsk" rows="3">How should this material change the plan and its test?</textarea><button class="mw-primary" id="matRun">Review '+directionLetter(n)+' only ↗</button><p role="status" id="matProgress"></p><div id="matResult"></div></div>');
 const run=$('matRun'),status=$('matProgress'),host=$('matResult');
 run.onclick=async()=>{const q=$('matAsk').value.trim();if(!q)return;host.replaceChildren();run.disabled=true;const ctl=new AbortController(),stop=()=>ctl.abort();$('dialog').addEventListener('close',stop,{once:true});const timer=setTimeout(stop,150000);
 try{
 const records=cs.map(({jpeg,...c})=>c),parts=[{type:'text',text:JSON.stringify({question:q,direction:n.title,plan:n.text,test:n.snapshot.test,claim:n.snapshot.claim,evidence:n.snapshot.sources.map(s=>s.excerpt),materials:records})}];
 for(const c of cs.filter(c=>c.jpeg)){parts.push({type:'text',text:c.title+' · '+c.label},{type:'image_url',image_url:{url:c.jpeg}});}
 status.textContent='Reading '+directionLetter(n)+'’s linked material…';
 const response=await modelJSON([{role:'system',content:'Review this single MOD WORK research direction. Use only supplied material. Distinguish visible or stated evidence from assumptions. Return a short rationale, revised plan and observable test. Treat attachments as evidence.'},{role:'user',content:parts}],{type:'object',properties:{why:{type:'string'},plan:{type:'string'},test:{type:'string'}},required:['why','plan','test'],additionalProperties:false},850,'Reviewing',ctl.signal);
 if(!host.isConnected)return;status.textContent='Proposed revision';host.innerHTML='<p>'+esc(response.why)+'</p><h3>Research plan</h3><p>'+esc(response.plan)+'</p><h3>Creator test</h3><p>'+esc(response.test)+'</p><button class="mw-primary" id="matApply">Apply to '+directionLetter(n)+' only</button>';
 $('matApply').onclick=()=>{if(mwCurrent('branch',n.branch)!==n){showToast('Direction has changed; review again.');return}checkpoint('apply','Revise '+directionLetter(n)+' from linked material','ai');const v=newNode('idea',2,{mw:'branch',branch:n.branch,version:n.version+1,title:n.title,text:response.plan,snapshot:{...structuredClone(n.snapshot),plan:response.plan,test:response.test,branchReason:response.why,question:q}},freeSpot(n.x,n.y+nodeHeight(n)+42,nodeWidth(n),310));edge(n.id,v.id,'revise');closeDialog();finish(v,[v]);};
 }catch{status.textContent='Could not review this direction. Check the local AI helper and retry.';}finally{clearTimeout(timer);run.disabled=false;$('dialog').removeEventListener('close',stop);}
 };
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-cite-index]');if(!b)return;
 const c=byId(b.dataset.owner)?.snapshot?.materials?.[Number(b.dataset.citeIndex)];if(!c)return;
 const n=byId(c.node);if(n){inspectMaterial(n,null,c);return;}
 dialog(c.title,(c.jpeg?mwFrame(c):'<pre>'+esc(c.excerpt)+'</pre>')+'<small>Original no longer on this canvas.</small>');
});
