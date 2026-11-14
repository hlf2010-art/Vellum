/* Pending AI proposals · derived from the existing revision transaction. */
let canvasProposalApi = null, canvasProposalBusy = false, canvasProposalFrame = 0;
const canvasProposalLayer = document.createElement('div');
canvasProposalLayer.id = 'canvasProposals';
$('world').append(canvasProposalLayer);
const canvasProposalWires = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
canvasProposalWires.id = 'canvasProposalWires';
canvasProposalWires.setAttribute('aria-hidden', 'true');
$('world').insertBefore(canvasProposalWires, nodesEl);
const canvasProposalBadge = document.createElement('button');
canvasProposalBadge.type = 'button';
canvasProposalBadge.id = 'canvasProposalBadge';
canvasProposalBadge.hidden = true;
document.querySelector('.top-right').prepend(canvasProposalBadge);
const canvasProposalCopy = {
  pending: ['AI proposal', 'AI 提案', 'Propuesta de IA', 'AIの提案'],
  tentative: ['Pending', '待定', 'Pendiente', '保留中'],
  proposed: ['Proposed', '建议修改', 'Propuesto', '変更案'],
  current: ['Compare', '比较', 'Comparar', '比較'],
  test: ['Test', '验证', 'Prueba', '検証'],
  apply: ['Apply', '应用', 'Aplicar', '適用'],
  discard: ['Discard', '放弃', 'Descartar', '破棄'],
  shared: ['Include shared hypothesis · C', '包含共同假设 · C', 'Incluir hipótesis · C', '共通の仮説を含む · C'],
  only: ['Only this direction changes.', '只修改这个方向。', 'Solo cambia esta dirección.', 'この方向のみ変更します。'],
  together: ['Applied together with this direction.', '与这个方向一起应用。', 'Se aplica junto con esta dirección.', 'この方向と同時に適用します。'],
  unchanged: ['The current version stays until you apply.', '应用前，当前版本保持原样。', 'La versión actual se conserva hasta aplicar.', '適用するまで現在の版を保持します。'],
  stale: ['The question or version changed. Ask Copilot again before applying.', '问题或版本已改变，请重新询问 Copilot。', 'La pregunta o versión cambió. Consulta de nuevo.', '質問または版が変わりました。再度質問してください。'],
  review: ['Review proposal', '查看提案', 'Revisar propuesta', '提案を確認'],
  saved: ['Saved with Copilot', '已随 Copilot 保存', 'Guardado con Copilot', 'Copilotに保存済み'],
  evidence: ['sources', '份来源', 'fuentes', '件のソース'],
  recorded: ['Recorded example', '预录示例', 'Ejemplo grabado', '記録済みの例'],
  live: ['AI suggestion', 'AI 建议', 'Sugerencia de IA', 'AIの提案'],
  open: ['Open Copilot', '打开 Copilot', 'Abrir Copilot', 'Copilotを開く'],
  full: ['Full change', '完整修改', 'Cambio completo', '変更の全内容'],
  applied: ['Applied', '已应用', 'Aplicado', '適用済み'],
  discarded: ['Discarded', '已放弃', 'Descartado', '破棄済み']
};
function cpText(key) { return canvasProposalCopy[key][({'zh-CN': 1, es: 2, ja: 3})[lang] || 0]; }
function cpRecords() {
  const state = canvasProposalApi?.workflow.state;
  return canvasProposalEntries(state).filter(p => board.nodes.some(n => n.studyId === p.node));
}
function cpSource(key) { return board.nodes.find(n => n.studyId === key); }
function cpSchedule() {
  if (canvasProposalFrame) return;
  canvasProposalFrame = requestAnimationFrame(() => {canvasProposalFrame = 0; renderCanvasProposals();});
}
function installCanvasProposals(api) {
  if (canvasProposalApi === api) return;
  canvasProposalApi = api;
  const previous = api.renderCopilot;
  api.renderCopilot = function(...args) {const result = previous.apply(this, args); cpSchedule(); return result;};
  const previousPropose = api.propose;
  api.propose = function(...args) {
    const state=api.workflow.state;
    // The main composer clears after Send; Review still refers to the saved answer.
    if(state.turn&&!state.draft.text.trim())state.draft.text=state.turn.question;
    return previousPropose.apply(this,args);
  };
  cpSchedule();
}
function cpPosition(proposal, source, suffix = '') {
  const key = board.id + ':' + proposal.key + suffix;
  const state = canvasProposalApi.workflow.state;
  const positions = state.canvasProposalPositions ??= {};
  if (!positions[key]) {
    const occupied = [...board.nodes.map(n => ({x:n.x,y:n.y,w:nodeWidth(n),h:nodeHeight(n)})),
      ...Array.from(canvasProposalLayer.children).filter(el => el.dataset.positionKey !== key)
        .map(el => ({x:parseFloat(el.style.left),y:parseFloat(el.style.top),w:el.offsetWidth,h:el.offsetHeight}))];
    const x = source.x + nodeWidth(source) + 48;
    let y = source.y;
    while (occupied.some(r => x < r.x+r.w+24 && x+350+24 > r.x && y < r.y+r.h+24 && y+480+24 > r.y)) y += 80;
    positions[key] = {x, y};
    canvasProposalApi.save();
  }
  return {key, ...positions[key]};
}
function cpCard(p, shared = false) {
  const source = cpSource(shared ? 'C' : p.node);if (!source) return '';
  const pos = cpPosition(p, source, shared ? ':shared' : '');
  const state = canvasProposalApi.workflow.state;
  const base = shared ? state.versions.find(v => v.id === p.turn.claimBase) : p.base;
  const num = shared ? 1+Math.max(0,...state.versions.filter(v=>v.node==='C').map(v=>v.num)) : p.next;
  const title = shared ? p.claim : p.base.title;
  const color = shared ? 'var(--light)' : 'var(--'+p.node+')';
  return `<article class="canvas-proposal" tabindex="0" data-proposal-key="${esc(p.key)}" data-position-key="${esc(pos.key)}" data-source="${esc(source.id)}" style="left:${pos.x}px;top:${pos.y}px;--proposal-color:${color}" aria-label="${esc(cpText('pending')+' · '+(shared?'C':p.node)+' · '+cpText('tentative'))}">
    <header class="cp-handle"><span>${ic('Sparkles')} ${cpText('pending')}</span><b>${cpText('tentative')}</b></header>
    <div class="cp-content"><div class="cp-version">${shared?'C':p.node} v${base?.num||1} → v${num}</div><h3>${esc(title)}</h3>
    <details><summary>${cpText('current')} · v${base?.num||1}</summary><p>${esc(shared?base?.title:base?.plan)}</p></details>
    <span class="cp-label">${cpText('proposed')}</span><p class="cp-plan">${esc(shared?p.reason:p.plan)}</p>
    ${shared?'':`<span class="cp-label">${cpText('test')}</span><p class="cp-test-value">${esc(p.test)}</p>`}
    <details class="cp-full"><summary>${cpText('full')}</summary><p>${esc(shared?p.reason:p.plan)}</p>${shared?'':'<b>'+cpText('test')+'</b><p>'+esc(p.test)+'</p>'}</details>
    <div class="cp-evidence">${p.turn.evidence.length} ${cpText('evidence')} · ${cpText(p.turn.mode==='recorded'?'recorded':'live')}</div>
    ${shared?`<p class="cp-scope">${cpText('together')}</p>`:`<label class="cp-shared"><input type="checkbox" data-proposal-action="shared" ${p.shared?'checked':''} ${p.stale||canvasProposalBusy?'disabled':''}>${cpText('shared')}</label><p class="cp-scope">${p.shared?cpText('together'):cpText('only')} ${cpText('unchanged')}</p>`}
    ${p.stale?`<p class="cp-stale" role="status">${cpText('stale')}</p>`:''}</div>
    ${shared?'':`<footer><button type="button" class="cp-apply" data-proposal-action="apply" ${p.stale||canvasProposalBusy?'disabled':''}>${cpText('apply')} ${p.node}${p.shared?' + C':' v'+num}</button><button type="button" data-proposal-action="discard" ${canvasProposalBusy?'disabled':''}>${cpText('discard')}</button><button type="button" class="cp-open" data-proposal-action="open" aria-label="${cpText('open')}" title="${cpText('open')}">${ic('MessageSquare')}</button></footer>`}
    </article>`;
}
function cpDrawWires() {
  canvasProposalWires.innerHTML = Array.from(canvasProposalLayer.children).map(el => {
    const source=byId(el.dataset.source);if(!source)return '';
    const a={x:source.x+nodeWidth(source),y:source.y+nodeHeight(source)/2};
    const b={x:parseFloat(el.style.left),y:parseFloat(el.style.top)+Math.min(100,el.offsetHeight/2)};
    return `<path d="${curve(a,b)}" style="stroke:${el.style.getPropertyValue('--proposal-color')}"/>`;
  }).join('');
}
function renderCanvasProposals() {
  const records=cpRecords();
  const active=document.activeElement;
  const focusKey=active?.closest('.canvas-proposal')?.dataset.positionKey;
  const focusAction=active?.dataset.proposalAction;
  // Preserve expanded comparisons across language changes and source-card redraws.
  const expanded=new Set(Array.from(canvasProposalLayer.querySelectorAll('details[open]')).map(el=>el.closest('article').dataset.positionKey+':'+(el.className||'compare')));
  canvasProposalLayer.innerHTML=records.map(p=>cpCard(p)+(p.shared?cpCard(p,true):'')).join('');
  for(const el of canvasProposalLayer.children)for(const detail of el.querySelectorAll('details'))if(expanded.has(el.dataset.positionKey+':'+(detail.className||'compare')))detail.open=true;
  canvasProposalBadge.hidden=!records.length;
  canvasProposalBadge.textContent=records.map(p=>p.node).join(' + ')+' · '+cpText('tentative');
  canvasProposalBadge.setAttribute('aria-label',cpText('review')+' · '+records.map(p=>p.node).join(', '));
  if(focusKey)Array.from(canvasProposalLayer.children).find(el=>el.dataset.positionKey===focusKey)?.querySelector(`[data-proposal-action="${focusAction}"]`)?.focus({preventScroll:true});
  cpDrawWires();
}
function cpFocus(key, focus=true) {
  const cards=Array.from(canvasProposalLayer.children).filter(el=>!key||el.dataset.proposalKey===key);if(!cards.length)return;
  const source=byId(cards[0].dataset.source);
  if(source&&picked()?.id!==source.id){selectNode(source);render();scheduleSave();}
  if(innerWidth<=1100&&copilotOpen)toggleCopilot(false);
  const r=surface.getBoundingClientRect(),mobile=r.width<=760,visible=mobile?[cards[0]]:cards;
  const panel=$('copilotPanel'),panelWidth=copilotOpen?Math.max(0,r.right-panel.getBoundingClientRect().left):0;
  const x0=Math.min(!mobile&&source?source.x:Infinity,...visible.map(el=>parseFloat(el.style.left)))-(mobile?12:30);
  const x1=Math.max(!mobile&&source?source.x+nodeWidth(source):0,...visible.map(el=>parseFloat(el.style.left)+el.offsetWidth))+(mobile?12:30);
  const y0=Math.min(!mobile&&source?source.y:Infinity,...visible.map(el=>parseFloat(el.style.top)))-20;
  const y1=Math.max(!mobile&&source?source.y+nodeHeight(source):0,...visible.map(el=>parseFloat(el.style.top)+el.offsetHeight))+20;
  const left=mobile?16:70,top=mobile?88:100;
  const bottom=copilotOpen?84:composer.offsetHeight+(mobile?108:58);
  const w=Math.max(160,r.width-panelWidth-left-(mobile?16:36)),h=Math.max(160,r.height-top-bottom);
  const s=clamp(Math.min(w/(x1-x0),h/(y1-y0),1.05),.16,1.9);
  animateCam({s,x:left+(w-(x1-x0)*s)/2-x0*s,y:top+(h-(y1-y0)*s)/2-y0*s},calm()?0:450);
  if(focus)cards[0].focus({preventScroll:true});scheduleSave();
}
canvasProposalBadge.onclick=()=>cpFocus(cpRecords()[0]?.key);
async function cpAction(key, action, checked) {
  if(canvasProposalBusy)return;
  const p=cpRecords().find(p=>p.key===key);if(!p)return;
  const api=canvasProposalApi,state=api.workflow.state;
  if(action!=='discard'){const source=cpSource(p.node);if(source&&picked()?.id!==source.id){selectNode(source);render();scheduleSave();}}
  if(action==='open'){await openStudy(null,p.node,'ask');return;}
  if(action==='discard'){
    (state.canvasDismissedProposals??=[]).push(key);
    p.slot.proposal=null;api.renderCopilot();await api.save();renderCanvasProposals();
    showToast(cpText('discarded'));canvasProposalBadge.hidden?promptBox.focus({preventScroll:true}):canvasProposalBadge.focus();return;
  }
  if(p.stale){showToast(cpText('stale'));return;}
  // Restore the exact proposal owner, including its answer and selected evidence.
  api.canvasDock.select(p.node,p.turn.question);
  if(!state.proposal)api.propose();
  if(!state.proposal||state.turn?.base!==p.turn.base)return;
  if(action==='shared'){
    state.proposal.shared=checked;api.renderCopilot();await api.save();renderCanvasProposals();return;
  }
  if(action==='apply'){
    canvasProposalBusy=true;renderCanvasProposals();
    try{await api.apply();showToast(cpText('applied'));cpSource(p.node)&&nodeEl(cpSource(p.node).id)?.focus({preventScroll:true});}
    finally{canvasProposalBusy=false;renderCanvasProposals();}
  }
}
canvasProposalLayer.addEventListener('click',e=>{
  e.stopPropagation();const detail=e.target.closest('summary')?.parentElement;if(detail)requestAnimationFrame(()=>{cpDrawWires();if(detail.open)cpFocus(detail.closest('article').dataset.proposalKey,false);});
  const action=e.target.closest('[data-proposal-action]');if(!action||action.type==='checkbox')return;
  const card=action.closest('article');cpAction(card.dataset.proposalKey,action.dataset.proposalAction).catch(err=>showToast(err.message));
});
canvasProposalLayer.addEventListener('change',e=>{
  if(e.target.dataset.proposalAction==='shared')cpAction(e.target.closest('article').dataset.proposalKey,'shared',e.target.checked).catch(err=>showToast(err.message));
});
canvasProposalLayer.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){canvasProposalBadge.focus();}});
canvasProposalLayer.addEventListener('dblclick',e=>e.stopPropagation());
canvasProposalLayer.addEventListener('contextmenu',e=>{e.stopPropagation();e.preventDefault();});
canvasProposalLayer.addEventListener('pointerdown',e=>{
  e.stopPropagation();if(e.button!==0||!e.target.closest('.cp-handle'))return;e.preventDefault();
  const el=e.target.closest('article'),state=canvasProposalApi.workflow.state;
  const pos=state.canvasProposalPositions[el.dataset.positionKey],start={x:e.clientX,y:e.clientY,...pos};
  stopCam();el.setPointerCapture(e.pointerId);el.classList.add('cp-dragging');
  const move=event=>{pos.x=start.x+(event.clientX-start.x)/board.cam.s;pos.y=start.y+(event.clientY-start.y)/board.cam.s;el.style.left=pos.x+'px';el.style.top=pos.y+'px';cpDrawWires();};
  const end=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',end);el.removeEventListener('pointercancel',end);el.classList.remove('cp-dragging');canvasProposalApi.save();};
  el.addEventListener('pointermove',move);el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
});
new MutationObserver(cpSchedule).observe(nodesEl,{childList:true});
new MutationObserver(cpSchedule).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
