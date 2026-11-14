/* Glass Studio presentation. The existing board, drafts, evidence and transactions remain the source of truth. */
const glassCopy = {
  more:['More','更多','Más','その他'], context:['Canvas','画布','Lienzo','キャンバス'],
  message:['Message…','输入…','Escribe…','メッセージ…'], ask:['Ask about {T}…','询问 {T}…','Pregunta sobre {T}…','{T}について質問…'],
  preview:['Preview','预览','Vista previa','プレビュー'], test:['Test','验证','Prueba','検証'],
  sources:['sources','份来源','fuentes','件のソース'], pending:['Pending','待定','Pendiente','保留中'],
  review:['Review on canvas','在画布查看','Ver en el lienzo','キャンバスで確認'],
  copilot:['Copilot','Copilot','Copilot','Copilot'], theme:['Appearance','外观','Apariencia','外観'],
  timeline:['Timeline','时间线','Cronología','タイムライン'], fit:['Fit canvas','适应画布','Ajustar lienzo','全体を表示'],
  detach:['Canvas','画布','Lienzo','キャンバス'], adopted:['Adopted','已采纳','Adoptado','採用済み']
};
function glassText(key,vars={}) {let value=glassCopy[key]?.[({'zh-CN':1,es:2,ja:3})[lang]||0]||key;for(const [k,v] of Object.entries(vars))value=value.replace('{'+k+'}',v);return value;}

const glassHeader=document.querySelector('.top-right');
const glassMore=document.createElement('button');glassMore.type='button';glassMore.className='glass-more-button';glassMore.id='glassMore';
glassMore.setAttribute('aria-controls','glassMoreMenu');glassMore.setAttribute('aria-expanded','false');glassMore.innerHTML=ic('Ellipsis');
const glassMenu=document.createElement('div');glassMenu.id='glassMoreMenu';glassMenu.className='glass-more-menu';glassMenu.hidden=true;glassMenu.setAttribute('role','group');
glassHeader.append($('sideCopilotTab'),glassMore,glassMenu);
const glassUtilities=Array.from(glassHeader.children).filter(el=>el!==glassMore&&el!==glassMenu&&el.id!=='saveState');
const glassMenuQuery=matchMedia('(max-width:1100px)');
const glassPhoneQuery=matchMedia('(max-width:760px)');
function glassCloseMenu(focus=false){glassMenu.hidden=true;glassMore.setAttribute('aria-expanded','false');if(focus)glassMore.focus({preventScroll:true});}
function glassArrangeUtilities(){
  const compact=glassMenuQuery.matches;
  for(const el of glassUtilities)(compact?glassMenu:glassHeader).insertBefore(el,compact?null:glassMore);
  (glassPhoneQuery.matches?glassMenu:surface).append($('zoomDock'));
  glassMore.hidden=!compact;glassCloseMenu();
}
glassMore.onclick=()=>{glassMenu.hidden=!glassMenu.hidden;glassMore.setAttribute('aria-expanded',String(!glassMenu.hidden));if(!glassMenu.hidden)glassMenu.querySelector('button:not([hidden]),select')?.focus({preventScroll:true});};
glassMenuQuery.addEventListener('change',glassArrangeUtilities);glassPhoneQuery.addEventListener('change',glassArrangeUtilities);glassArrangeUtilities();
const glassInstallTimeline=installTimeline;installTimeline=function(...args){const result=glassInstallTimeline.apply(this,args),button=document.querySelector('.top-right [data-tl="title"]');if(button&&!glassUtilities.includes(button))glassUtilities.unshift(button);glassArrangeUtilities();paintGlassOwner();return result;};
document.addEventListener('pointerdown',e=>{if(!glassMenu.hidden&&!glassMenu.contains(e.target)&&!glassMore.contains(e.target))glassCloseMenu();});
glassMenu.addEventListener('click',e=>{const button=e.target.closest('button');if(button&&!button.classList.contains('glass-picker-trigger'))glassCloseMenu();});
glassMenu.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();glassCloseMenu(true);}});
const glassProjectIcon=document.createElement('span');glassProjectIcon.className='glass-app-icon';glassProjectIcon.setAttribute('aria-hidden','true');glassProjectIcon.innerHTML=ic('Layers');document.querySelector('.project').prepend(glassProjectIcon);
const glassFormat=document.querySelector('#composerHandle .fmt-wrap');if(glassFormat)document.querySelector('.composer-actions').prepend(glassFormat);
const glassModelRow=document.querySelector('#composerHandle .model-row');if(glassModelRow)$('composerBody').append(glassModelRow);
const glassContext=document.createElement('div');glassContext.id='glassContext';composer.prepend(glassContext);
const glassScope=document.createElement('span');glassScope.id='glassPanelScope';document.querySelector('.copilot-title-group').append(glassScope);
const glassComposerSize=new ResizeObserver(()=>{document.documentElement.style.setProperty('--glass-composer-h',composer.offsetHeight+'px');});glassComposerSize.observe(composer);
let glassSeedFit=null;
const glassSeed=seedMod;seedMod=function(){glassSeed();glassSeedFit={owner:board,cam:JSON.stringify(board.cam)};};
function paintGlassMaterial(){
  for(const el of document.querySelectorAll('.project,.phases,.board-tools,.glass-more-button,.glass-more-menu,#composer,#copilotPanel,.top-right>.icon-btn,.top-right>.language-control,.top-right>#sideCopilotTab')){
    el.classList.add('g-material');
    if(!el.querySelector(':scope>.glass-rim')){const rim=document.createElement('span');rim.className='glass-rim';rim.setAttribute('aria-hidden','true');el.prepend(rim);}
    if(!el.dataset.glassShine){el.dataset.glassShine='true';el.addEventListener('pointermove',e=>{if(calm())return;const r=el.getBoundingClientRect();el.style.setProperty('--shine-x',(e.clientX-r.left)+'px');el.style.setProperty('--shine-y',(e.clientY-r.top)+'px');},{passive:true});}
  }
}

function paintGlassOwner(){
  const n=picked(),multi=selectedNodes().length>1;
  const title=multi?t('synthLabel',{N:selectedNodes().length}):n?titleOf(n):glassText('context');
  const count=n?refsFor(n.id).length:0;
  const resume=returnTarget();
  glassContext.innerHTML=ic(n?'CornerDownRight':'Layers')+'<span>'+esc(clipText(title,46))+(count?' · '+count+' '+glassText('sources'):'')+'</span>'+(resume?'<button type="button" data-action="return-edit" aria-label="'+esc((lang==='zh-CN'?'继续草稿 · ':'Resume draft · ')+returnName(resume.id))+'" title="'+esc(returnName(resume.id))+'">'+ic('SquarePen')+'</button>':'')+(n?'<button type="button" data-action="detach" aria-label="'+esc(glassText('detach'))+'">'+ic('X')+'</button>':'');
  glassScope.textContent=clipText(title,32);glassScope.title=title;
  const heading=document.querySelector('.copilot-title-group h3');if(heading)heading.textContent=glassText('copilot');
  const medium=dockMedium(),chat=(!medium||medium==='text')&&selectedNodes().length<2;
  promptBox.placeholder=chat?(n?glassText('ask',{T:lineageOf(n)||clipText(title,25)}):glassText('message')):composerMode().place;
  glassMore.title=glassMore.ariaLabel=glassText('more');glassMenu.setAttribute('aria-label',glassText('more'));
  for(const [el,key] of [[$('appearanceToggle'),'theme'],[glassHeader.querySelector('[data-tl]')||glassMenu.querySelector('[data-tl]'),'timeline'],[$('sideCopilotTab'),'copilot']]){
    if(!el)continue;let label=el.querySelector('.glass-utility-label');if(!label){label=document.createElement('span');label.className='glass-utility-label';el.append(label);}label.textContent=glassText(key);
  }
  paintGlassMaterial();
}

// Move the one real composer; never duplicate its input, attachment tray or event handlers.
dockComposer=function(){
  const parent=copilotOpen?$('copilotPanel'):surface;
  document.body.classList.toggle('composer-docked',copilotOpen);
  if(composer.parentElement!==parent)parent.append(composer);
  composer.classList.remove('open','folded');$('returnComposer').hidden=true;
  sizePrompt();paintGlassOwner();
};
placeComposer=function(){sizePrompt();};
const glassPaintDock=paintDockAction;
paintDockAction=function(){glassPaintDock();
  const text=draftOf(draftKey()),medium=dockMedium();
  if((!medium||medium==='text')&&selectedNodes().length<2){$('send').title=dw('ask');$('send').setAttribute('aria-label',dw('ask'));$('send').disabled=liveDockBusy||!text.trim();}
  if(selectedNodes().length>1){const mode=composerMode();$('send').title=mode.label;$('send').setAttribute('aria-label',mode.label);$('send').disabled=!mode.enabled;}
  paintGlassOwner();
};
const glassSetAppearance=setAppearance;setAppearance=function(mode){glassSetAppearance(mode);paintGlassOwner();};
const glassSend=send;
send=async function(){
  const medium=dockMedium(),text=draftOf(draftKey());
  if(selectedNodes().length>1)return sendCanvasContent();
  if(!copilotOpen&&text.trim()&&(!medium||medium==='text')&&selectedNodes().length<2)toggleCopilot(true,false);
  return glassSend();
};

// Card summaries expose the decision and test; the original interactive preview remains one click away.
function paintGlassCards(){
  for(const el of nodesEl.querySelectorAll('.node.direction')){
    const n=byId(el.dataset.node);if(!n||inlineEditId===n.id)continue;
    const portal=el.querySelector('.portal'),foot=el.querySelector('.card-foot'),body=el.querySelector('.card-body');
    if(portal&&foot){portal.classList.add('glass-preview');portal.innerHTML=ic('Play')+'<span>'+glassText('preview')+'</span>';portal.title=glassText('preview')+' · '+titleOf(n);foot.prepend(portal);}
    const state=canvasProposalApi?.workflow.state,version=state?.versions.find(v=>v.id===state.tips[n.studyId]);
    const test=version?.test||n.test||n.creatorTest;
    if(test&&body&&!body.querySelector('.glass-test')){const box=document.createElement('div');box.className='glass-test';box.innerHTML='<b>'+glassText('test')+'</b><span>'+esc(test)+'</span>';box.title=test;body.append(box);}
    const stateLabel=el.querySelector('.state');if(stateLabel&&board.adopted[n.group]===n.id)stateLabel.textContent=glassText('adopted');
  }
  paintGlassOwner();
}
const glassRender=render;render=function(){glassRender();paintGlassCards();drawWires();};
const glassRepaint=repaint;repaint=function(){glassRepaint();paintGlassOwner();};
const glassRenderProposals=renderCanvasProposals;renderCanvasProposals=function(){glassRenderProposals();const records=cpRecords();if(records.length)glassMore.dataset.count=records.length;else delete glassMore.dataset.count;};

// Explicit Fit uses the unobscured canvas area. Opening a panel does not change the user's camera.
camFor=function(ns,stage=board.stage,all=false){
  const sw=surface.clientWidth,sh=surface.clientHeight;if(!sw||!sh)return null;
  const mobile=sw<=760,panel=copilotOpen&&!mobile?Math.min(360,sw-32)+24:0;
  if(mobile&&!all&&picked()&&ns.some(n=>n.id===picked().id))ns=[picked()];
  const pad=mobile?20:64,top=mobile?92:102;
  const bottom=copilotOpen?84:Math.max(140,composer.offsetHeight+32);
  const area={l:mobile?20:(sw<=1340?82:pad),t:top,w:sw-panel-(mobile?40:(sw<=1340?110:128)),h:Math.max(120,sh-top-bottom)};
  const boxes=ns.map(n=>({x:n.x,y:n.y,w:nodeWidth(n),h:nodeHeight(n)}));
  if(all)for(const card of canvasProposalLayer.children)boxes.push({x:parseFloat(card.style.left),y:parseFloat(card.style.top),w:card.offsetWidth,h:card.offsetHeight});
  if(!boxes.length)boxes.push({x:stage*LANE+LANE/2-160,y:80,w:320,h:180});
  const x0=Math.min(...boxes.map(b=>b.x)),y0=Math.min(...boxes.map(b=>b.y)),x1=Math.max(...boxes.map(b=>b.x+b.w)),y1=Math.max(...boxes.map(b=>b.y+b.h));
  const s=clamp(Math.min(area.w/Math.max(1,x1-x0),area.h/Math.max(1,y1-y0),all?.94:1),.16,1);
  return {s,x:area.l+(area.w-(x1-x0)*s)/2-x0*s,y:area.t+Math.max(0,(area.h-(y1-y0)*s)*.4)-y0*s};
};
const glassTogglePanel=togglePanelState;
togglePanelState=function(open){glassTogglePanel(open);const tab=$('sideCopilotTab');tab.hidden=false;tab.setAttribute('aria-expanded',String(copilotOpen));tab.setAttribute('aria-pressed',String(copilotOpen));};

function paintGlassStatus(api){
  for(const id of ['askStatus','objectStatus']){const status=api.document.getElementById(id);if(!status)continue;const text=status.textContent;
    if(text==='Reading only the listed evidence…')status.textContent=lang==='zh-CN'?'读取中…':'Reading…';
    status.hidden=['Answer ready. Review before proposing any change.','Ready','就绪'].includes(text);
  }
}
function paintGlassStudy(api){
  const doc=api.document,state=api.workflow.state;
  const answer=doc.querySelector('#conversation .desk-answer');
  const p=state.proposal,record=p&&cpRecords().find(v=>v.turn.base===p.base);
  doc.querySelector('.glass-proposal-summary')?.remove();
  answer?.classList.toggle('glass-redundant-proposal',!!record);
  if(record&&answer){
    const summary=doc.createElement('div');summary.className='glass-proposal-summary';
    summary.innerHTML='<strong>'+esc(record.node+' v'+record.base.num+' → v'+record.next)+' · '+glassText('pending')+'</strong><button type="button">'+glassText('review')+'</button>';
    summary.querySelector('button').onclick=()=>{if(innerWidth<=760)toggleCopilot(false);cpSchedule();requestAnimationFrame(()=>cpFocus(record.key));};answer.before(summary);
  }
  const heading=doc.querySelector('#conversation .desk-answer h3');if(heading?.textContent==='What the evidence supports')heading.textContent=lang==='zh-CN'?'建议':'Suggestion';
  const target=doc.querySelector('#targetBar');if(target)target.hidden=true;
  paintGlassStatus(api);
  const sourceLabel=doc.getElementById('sourcesLabel'),count=sourceLabel?.textContent.match(/^\s*(\d+) evidence/);if(count)sourceLabel.textContent=(lang==='zh-CN'?'来源':'Sources')+' · '+count[1];
  paintGlassCards();
}
function paintGlassTrace(api){
  const doc=api.document,root=doc.getElementById('traceContent');if(!root)return;
  const times=root.querySelector(':scope>.time-facts');if(times){const details=doc.createElement('details');details.className='glass-times';const summary=doc.createElement('summary');summary.textContent=lang==='zh-CN'?'时间':'Times';details.append(summary);times.before(details);details.append(times);}
  const notice=root.querySelector(':scope>.notice');if(notice)notice.hidden=true;
  for(const evidence of root.querySelectorAll(':scope>.evidence')){const details=doc.createElement('details');details.className='glass-evidence';const summary=doc.createElement('summary');summary.textContent=evidence.querySelector('h4')?.textContent||glassText('sources');details.append(summary);evidence.before(details);details.append(evidence);}
}
function installGlassStudy(api){
  if(api.document.getElementById('glassStudyStyle'))return;
  const style=api.document.createElement('style');style.id='glassStudyStyle';style.textContent=GLASS_STUDY_CSS;api.document.head.append(style);
  const previous=api.renderCopilot;api.renderCopilot=function(...args){const result=previous.apply(this,args);paintGlassStudy(api);return result;};
  const previousTrace=api.renderTrace;api.renderTrace=function(...args){const result=previousTrace.apply(this,args);paintGlassTrace(api);return result;};
  const statusObserver=new api.MutationObserver(()=>paintGlassStatus(api));for(const id of ['askStatus','objectStatus']){const status=api.document.getElementById(id);if(status)statusObserver.observe(status,{childList:true,subtree:true,characterData:true});}
  paintGlassStudy(api);
  paintGlassTrace(api);
  if(glassSeedFit?.owner===board&&glassSeedFit.cam===JSON.stringify(board.cam)){focusNodes(innerWidth<=760&&picked()?[picked()]:board.nodes,board.stage,innerWidth>760,0);scheduleSave();}glassSeedFit=null;
}
new MutationObserver(()=>{paintGlassCards();if(canvasProposalApi)paintGlassStudy(canvasProposalApi);}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
promptBox.addEventListener('input',paintGlassOwner);
// New sessions start with the canvas and composer. Existing panel preferences and board drafts are respected.
if(!localStorage.getItem(prefix+'.copilotOpen'))copilotOpen=false;
paintGlassOwner();
