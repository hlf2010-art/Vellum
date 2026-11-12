const mwMediaURLs=new Map(),mwAttachments=new Map();
function mwMediaURL(key){
 if(mwMediaURLs.has(key))return mwMediaURLs.get(key);
 const blob=PACKED_MEDIA[key];if(!blob)return '';
 const raw=atob(blob.bytes),bytes=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 const url=URL.createObjectURL(new Blob([bytes],{type:blob.mime}));mwMediaURLs.set(key,url);return url;
}
function mwVisualCard(n){
 return '<figure class="mw-still"><img draggable="false" alt="'+esc(n.title)+'" src="'+mwMediaURL(n.poster||n.id)+'">'+(n.kind==='video'?'<span>▶ &nbsp; 0:22</span>':'')+'</figure><div class="mw-caption"><small>'+esc(n.kind==='video'?'Motion study':'Interface capture')+'</small><h3>'+esc(n.title)+'</h3></div>';
}
async function mwInspectMedia(n){
 const packaged=!!PACKED_MEDIA[n.id],url=packaged?mwMediaURL(n.id):await mediaUrl(n.id);
 if(!url){showToast('Original media unavailable');return}
 const motion=n.kind==='video',tag=motion?'video':'img',claim=mwCurrent('claim');
 dialog(titleOf(n),'<div class="mw-lightbox">'+(motion?'<video controls playsinline preload="auto" id="mwVisual"></video>':'<img id="mwVisual" alt="'+esc(titleOf(n))+'">')+'<div class="mw-mediafoot"><div><small>'+esc(n.name||n.title)+'</small><p>'+esc(n.text||'Project reference')+'</p></div>'+(claim?'<button id="mwTake" class="mw-primary">'+(motion?'Use this frame':'Use this image')+' ↗</button>':'')+'</div></div>');
 const d=$('dialog');d.classList.add('mw-media-open');const media=$('mwVisual');media.src=url;if(!motion)media.draggable=false;
 if(claim)$('mwTake').onclick=()=>{
  if(motion)media.pause();const w=motion?media.videoWidth:media.naturalWidth,h=motion?media.videoHeight:media.naturalHeight;if(!w||!h)return showToast('Wait for the image to load.');
  const c=document.createElement('canvas'),ratio=Math.min(1,900/Math.max(w,h));c.width=Math.round(w*ratio);c.height=Math.round(h*ratio);c.getContext('2d').drawImage(media,0,0,c.width,c.height);
  const at=motion?Number(media.currentTime.toFixed(2)):null;
  const v={id:'Visual',node:n.id,title:titleOf(n),kind:motion?'Video frame':'Screenshot',path:n.name||n.title,excerpt:n.text||'Selected project reference',at,jpeg:c.toDataURL('image/jpeg',.79)};
  mwAttachments.set(claim.id,v);closeDialog();mwReview(claim);
  if(!$('mwAsk').value)$('mwAsk').value='What can this '+(motion?'frame':'screen')+' actually tell us, and what would still need a creator test?';
  $('mwAsk').focus();
 };
 d.addEventListener('close',()=>{if(motion)media.pause();media.removeAttribute('src');d.classList.remove('mw-media-open')},{once:true});
}
function mwFrame(v){
 return '<figure class="mw-frame"><img src="'+esc(v.jpeg)+'" alt="'+esc(v.title)+'"><figcaption>'+esc(v.title)+(v.at===null?'':' · '+v.at.toFixed(2)+' s')+'</figcaption></figure>';
}
function mwInstallMedia(){
 if(board.id!==initialExhibit.id||board.mediaStudy)return;
 for(const n of MEDIA_NODES)if(!byId(n.id))board.nodes.push(structuredClone(n));
 board.mediaStudy=true;render();if(!firstExhibit){focusNodes(surface.clientWidth<700?[mwCurrent('claim')]:[byId('V1'),...mwNext()],1)}persist();
}
function mwSketch(n,interactive){
 const scope=n.branch==='scope',items=scope?['Sculpt · stroke 1','Sculpt · stroke 2','Skin tone']:['Player appearance','Hair sync'];
 const caption=scope?'Predict what should survive undoing stroke 2.':'Which part should be retried after a partial write?';
 return '<section class="mw-sketch" aria-label="Research storyboard"><small>Study sketch</small>'+(interactive?'<p>'+caption+'</p>':'')+
 items.map((v,i)=>'<label>'+ (interactive?'<input type="checkbox" data-choice="'+i+'">':'<i aria-hidden="true">'+(scope?'▱':i?'○':'✓')+'</i>')+'<span>'+v+'</span>'+(!scope?'<em>'+(i?'Failed':'Written')+'</em>':'')+'</label>').join('')+
 (interactive?'<button type="button" id="mwTrySketch">Check prediction</button><output id="mwSketchResult" aria-live="polite"></output>':'')+'</section>';
}
function mwWireSketch(n){
 const btn=$('mwTrySketch');if(!btn)return;
 btn.onclick=()=>{const picked=[...$('dialogBody').querySelectorAll('[data-choice]:checked')].map(e=>e.dataset.choice).join(',');
 const expected=n.branch==='scope'?'0,2':'1';
 $('mwSketchResult').textContent=(picked===expected?'Matches the intended behavior. ':'Compare your prediction with the intended behavior. ')+(n.branch==='scope'?'Stroke 1 and skin tone survive.':'Only hair sync should be retried.')+' This is a design scenario.';};
}
