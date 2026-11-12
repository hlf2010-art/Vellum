Object.assign(ICON_PATHS,{
  Copilot:'<path d="M4 4h13a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H9l-5 4z"/><path d="M8 8h8M8 12h5"/>',
  History:'<path d="M3 11a9 9 0 1 1 2.6 7M3 5v6h6m3-4v5l3 2"/>',
  Undo2:'<path d="m8 4-5 5 5 5M4 9h9a7 7 0 0 1 7 7v3"/>',
  Redo2:'<path d="m16 4 5 5-5 5m4-5h-9a7 7 0 0 0-7 7v3"/>',
  Sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  Moon:'<path d="M20.7 14a8.7 8.7 0 0 1-11-11A9.3 9.3 0 1 0 20.7 14Z"/>',
  List:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1"/>'
});
const themeKey="idea-canvas.studio.theme";
const themeMedia=matchMedia("(prefers-color-scheme: dark)");
function themePreference(){try{return localStorage.getItem(themeKey)||"system";}catch{return "system";}}
function setAppearance(value,persistChoice=false){
  if(!["system","light","dark"].includes(value))value="system";
  const dark=value==="system"?themeMedia.matches:value==="dark";
  document.documentElement.dataset.theme=dark?"dark":"light";
  if(persistChoice)try{localStorage.setItem(themeKey,value);}catch{}
  const btn=$("themeBtn");btn.innerHTML=ic(dark?"Sun":"Moon");btn.title=btn.ariaLabel=dark?choose("切换到浅色","Switch to light mode"):choose("切换到深色","Switch to dark mode");
  $("themeChoice").value=value;
}
function editableArtifact(n){return n?.type==="artifact"&&!n.frozen;}
function studioChrome(){
  $("openAI").lastElementChild.textContent=choose("AI 助手","Copilot");
  $("openAI").title=$("openAI").ariaLabel=choose("打开 AI 助手","Open AI Copilot");$("openHistory").title=$("openHistory").ariaLabel=choose("操作历史","History");
  $("exampleMenu").textContent=choose("推演展览示例","Run exhibition example");
  $("themeText").textContent=choose("外观","Appearance");
  ["system","light","dark"].forEach((v,i)=>{$("themeChoice").options[i].textContent=[choose("跟随系统","System"),choose("浅色","Light"),choose("深色","Dark")][i];});
  setAppearance(themePreference());
  const pan=$("handBtn");pan.title=pan.ariaLabel=choose("平移工具（H）","Pan tool (H)");pan.setAttribute("aria-pressed",String(handTool));
  $("desk").dataset.pan=handTool?"on":"off";
  $("inlineAI").textContent=choose("和 AI 梳理","Ask Copilot");$("inlineAI").hidden=!!board.nodes.length||!draftText().trim();
  $("aiTurns").ariaLabel=choose("助手对话","Copilot conversation");
  $("returnComposer").title=choose("找回输入框","Bring back the composer");
  const selected=picked(),strip=$("composeContext");
  if(selected&&!strip.querySelector("[data-studio=stage-ai]")){
    const b=document.createElement("button");b.type="button";b.dataset.studio="stage-ai";
    b.textContent=selected.type==="idea"?choose("AI 探索两个方向","Explore A/B with AI"):selected.type==="direction"?choose("AI 生成网页","Build with AI"):selected.type==="asset"?choose("AI 读素材","Read with AI"):editableArtifact(selected)?choose("AI 改稿","Revise with AI"):choose("和 AI 迭代","Iterate with AI");
    strip.append(b);
  }
  loadAiDraft();
  if(openPanel==="ai")paintControls();
  if(openPanel==="history")paintHistory();
}
async function storeStudioBoard(b=board){
  clearTimeout(saveTimer);
  if(b===board){flushJournal();b.viewport={w:surface.clientWidth,h:surface.clientHeight};}
  b.updated=Date.now();
  const key=prefix+".board."+b.id,localChanged=savedMarks.get(b.id)!==journalMark(b);
  const latest=stored(".board."+b.id,null);
  if(latest?.saveVersion&&latest.saveVersion!==b.saveVersion){
    // Preserve concurrent histories. An idle tab closing must never replace a newer board.
    if(!localChanged)return;
    const other=await readBoardRecord(latest);
    if(other?.journal){
      const union=(a,c)=>[...new Map([...a,...c].map(item=>[item.id,item])).values()].sort((x,y)=>x.at-y.at);
      b.journal.steps=union(other.journal.steps,b.journal.steps);
      b.visits=union(other.visits||[],b.visits||[]);
      if(b===board)showToast(choose("另一窗口也有修改。两个版本都已保留在历史中。","Another window edited this canvas. Both versions are in History."));
    }
  }
  if(localChanged||!b.saveVersion)b.saveVersion=uid();
  const savedMark=journalMark(b),encoded=JSON.stringify(b);
  // Normal-sized boards save synchronously, including when the user closes a file tab.
  // Large boards switch to IndexedDB; the directory pointer changes only after its transaction commits.
  try{
    let large=false;
    try{localStorage.setItem(key,encoded);}catch{large=true;}
    if(large){
      const seq=(archiveSequence.get(b.id)||0)+1;archiveSequence.set(b.id,seq);
      await archiveBoard(encoded,b.id);
      if(archiveSequence.get(b.id)!==seq)return;
      localStorage.setItem(key,JSON.stringify({archived:true,id:b.id,saveVersion:b.saveVersion}));
    }else archiveSequence.set(b.id,(archiveSequence.get(b.id)||0)+1);
    if(b===board)localStorage.setItem(prefix+".active",JSON.stringify(b.id));
    const list=stored(".list",[]).filter(i=>i.id!==b.id);
    list.unshift({id:b.id,title:b.title,renamed:b.renamed,updated:b.updated});localStorage.setItem(prefix+".list",JSON.stringify(list));
    savedMarks.set(b.id,savedMark);storageOkay=true;
    if(b===board)statusLabel(mediaOkay?choose("已保存","Saved"):"部分素材仅本次可用");
  }catch{storageOkay=false;statusLabel("本次会话");}
}
const archiveSequence=new Map();
function setupWorkbench(){
  $("aiFormat").innerHTML=Object.keys(formatNames).map(f=>'<option value="'+f+'">'+formatLabel(f)+'</option>').join("");
  $("themeChoice").onchange=e=>setAppearance(e.target.value,true);
  themeMedia.addEventListener("change",()=>{if(themePreference()==="system")setAppearance("system");});
  window.addEventListener("storage",e=>{if(e.key===themeKey)setAppearance(themePreference());});
  $("aiForm").onsubmit=e=>{e.preventDefault();runAI();};
  $("aiPrompt").oninput=()=>{rememberAiDraft();$("aiSend").disabled=!selectedSources().length&&!$("aiPrompt").value.trim();};
  $("aiPrompt").onkeydown=e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)&&!e.isComposing){e.preventDefault();e.stopPropagation();runAI();}};
  $("aiScope").onchange=e=>{scopeMode=e.target.value;excludedSources.clear();paintControls();};
  $("aiFormat").onchange=e=>{aiFormat=e.target.value;};
  $("sourceChoices").onchange=e=>{if(e.target.dataset.sourceId){if(e.target.checked)excludedSources.delete(e.target.dataset.sourceId);else excludedSources.add(e.target.dataset.sourceId);paintControls();}};
  document.addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b)return;
    if(b.dataset.mode){aiIntent=b.dataset.mode;paintControls();return;}
    if(b.hasAttribute("data-restore")){jumpToStep(b.dataset.restore||null);return;}
    if(b.dataset.evidence){inspectSource(b.dataset.evidence,b.dataset.key);return;}
    if(b.dataset.turnApply){applyTurn(b.dataset.turnApply);return;}
    if(b.dataset.turnRetry){runAI(board.turns.find(t=>t.id===b.dataset.turnRetry));return;}
    switch(b.dataset.studio){
      case "theme":setAppearance(document.documentElement.dataset.theme==="dark"?"light":"dark",true);break;
      case "ai":openSide("ai");break;
      case "history":openSide("history");break;
      case "close":closeSide();break;
      case "undo":undo();break;
      case "redo":redoChange();break;
      case "history-more":historyPage+=50;paintHistory();break;
      case "stop":activeRun?.controller.abort();break;
      case "ai-example":closeMore();exhibitionExample().catch(()=>showToast(choose("未能载入示例","Could not load the example")));break;
      case "stage-ai":{
        const n=picked();if(!n)break;
        if(openPanel!=="ai")openSide("ai");
        aiIntent=n.type==="asset"?"suggest":editableArtifact(n)?"edit":"create";
        aiFormat=n.type==="idea"?"branches":n.format||"web";paintControls();
        $("aiPrompt").focus({preventScroll:true});break;
      }
      case "hand":setTool(handTool?"select":"pan");break;
      case "ask-draft":if(openPanel!=="ai")openSide("ai");$("aiPrompt").value=draftText();rememberAiDraft();paintControls();$("aiPrompt").focus();break;
    }
  });
  $("artClose").onclick=()=>$("artDialog").close();
  $("artDialog").addEventListener("close",()=>{$("artStage").replaceChildren();artView=null;});
  document.addEventListener("keydown",e=>{
    if(document.querySelector("dialog[open]")||e.isComposing)return;
    if(e.key==="Escape"&&openPanel){closeSide();return;}
    if(e.target.closest("textarea,input,select,[contenteditable=true],#studioSide")||e.metaKey||e.ctrlKey||e.altKey)return;
    const pan=96,keys={ArrowDown:[0,-pan],ArrowUp:[0,pan],ArrowLeft:[pan,0],ArrowRight:[-pan,0]};
    if(e.key in keys){e.preventDefault();const [dx,dy]=keys[e.key];board.cam.x+=dx;board.cam.y+=dy;board.cameraTouched=true;cameraPaint();scheduleSave();}
    if(["+","=","-","0"].includes(e.key)){e.preventDefault();zoomAt(e.key==="0"?1:board.cam.s*(e.key==="-"?1/1.2:1.2));}
  });
  let safariPinch=null;
  surface.addEventListener("gesturestart",e=>{e.preventDefault();const r=surface.getBoundingClientRect();safariPinch={s:board.cam.s,x:e.clientX-r.left,y:e.clientY-r.top};},{passive:false});
  surface.addEventListener("gesturechange",e=>{e.preventDefault();if(safariPinch&&!pinch)zoomAt(safariPinch.s*e.scale,safariPinch.x,safariPinch.y);},{passive:false});
  surface.addEventListener("gestureend",e=>{e.preventDefault();safariPinch=null;},{passive:false});
}
