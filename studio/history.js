// The journal stores only changed objects. Blobs stay in the existing media store.
const actionNames = {
  draft:["写草稿","Draft"], add:["添加想法","Add idea"], import:["导入素材","Import files"], read:["读取素材","Read file"],
  branch:["创建两个方向","Create two directions"], adopt:["采用方向","Adopt direction"], instruction:["保存设计要求","Save instruction"],
  build:["生成网页","Build webpage"], release:["定版","Finalize"], link:["连接节点","Connect nodes"], unlink:["移除连接","Remove connection"],
  role:["更改素材用途","Change source role"], move:["移动节点","Move object"], edit:["编辑节点","Edit object"],
  rename:["重命名画布","Rename canvas"], remove:["移除节点","Remove object"], feedback:["添加反馈","Add feedback"],
  ask:["提出请求","Ask Copilot"], answer:["完成提案","Generate proposal"], apply:["应用提案","Apply proposal"],
  undo:["撤销一步","Undo step"],redo:["重做一步","Redo step"],restore:["恢复版本","Restore version"],preview:["预览","Preview"],download:["导出文件","Export file"],stop:["停止生成","Stop generation"], error:["记录生成中断","Record interruption"], change:["更新画布","Update canvas"]
};
let priorState, pendingAction=null, savedBoardId=null;
const editingSession=uid(),savedMarks=new Map();
function journalMark(b){
  return [b.journal.head,b.journal.steps.length,b.visits?.at(-1)?.id||"",b.journal.redo.join(".")].join("|");
}
const labelAction = key => choose(...(actionNames[key]||actionNames.change));
function trackedState(b){
  const result={project:JSON.stringify([b.title,!!b.renamed,b.adopted,!!b.pendingSample])};
  for(const n of b.nodes) result["n/"+n.id]=JSON.stringify(n);
  for(const e of b.edges) result["e/"+e.from+"/"+e.to]=JSON.stringify(e);
  for(const [id,d] of Object.entries(b.drafts||{})) result["d/"+id]=JSON.stringify(d);
  for(const [id,text] of Object.entries(b.assistantDrafts||{})) result["a/"+id]=JSON.stringify(text);
  for(const t of b.turns||[]) result["t/"+t.id]=JSON.stringify(t);
  return result;
}
function beginJournal(){
  priorState=trackedState(board);savedBoardId=board.id;pendingAction=null;
  board.journal??={root:priorState,steps:[],head:null,redo:[]};
  if(!savedMarks.has(board.id))savedMarks.set(board.id,journalMark(board));
}
function checkpoint(op="change",detail="",actor="user"){
  flushJournal();
  pendingAction={op,detail,actor};
}
function flushJournal(){
  if(!priorState||savedBoardId!==board.id)beginJournal();
  const next=trackedState(board),changes={};
  for(const key of new Set([...Object.keys(priorState),...Object.keys(next)])){
    if(priorState[key]===next[key])continue;
    if(key.startsWith("d/")&&next[key]&&priorState[key]&&
      JSON.parse(priorState[key]).text===JSON.parse(next[key]).text)continue;
    changes[key]=next[key]??null;
  }
  const keys=Object.keys(changes);
  priorState=next;
  if(!keys.length){pendingAction=null;return;}
  const allDraft=keys.every(k=>k.startsWith("d/")||k.startsWith("a/")),allAssets=keys.every(k=>k.startsWith("n/")&&byId(k.slice(2))?.type==="asset");
  const keyNode=byId(keys[0].slice(2)),auto={op:allDraft?"draft":allAssets?"read":"change",
    detail:keyNode?titleOf(keyNode):boardName(board),actor:allAssets?"system":"user"};
  const meta=pendingAction||auto,j=board.journal,last=j.steps.at(-1),now=Date.now();
  if(meta.op==="draft"&&j.head===last?.id&&last.op==="draft"&&last.session===editingSession&&keys.length===1&&keys[0] in last.changes&&now-last.at<20000){
    const revised={...last,id:uid(),changes:{...last.changes,...changes},at:now};
    j.steps[j.steps.length-1]=revised;j.head=revised.id;
  }else{
    const step={id:uid(),parent:j.head,session:editingSession,at:now,selected:board.selected,stage:board.stage,changes,...meta};
    j.steps.push(step);j.head=step.id;j.redo=[];
  }
  pendingAction=null;
  if(openPanel==="history")paintHistory();
}
function stateAt(id){
  const j=board.journal,index=new Map(j.steps.map(s=>[s.id,s])),chain=[];
  for(let s=index.get(id);s;s=index.get(s.parent))chain.push(s);
  const values={...j.root};
  for(const step of chain.reverse())for(const [key,val] of Object.entries(step.changes)){
    if(val===null)delete values[key];else values[key]=val;
  }
  return values;
}
function restoreStep(id,redo,op="restore"){
  const j=board.journal,oldCam=board.cam,values=stateAt(id),step=j.steps.find(s=>s.id===id);
  haltRequest();
  const next={...board,nodes:[],edges:[],drafts:{},assistantDrafts:{},turns:[]};
  [next.title,next.renamed,next.adopted,next.pendingSample]=JSON.parse(values.project);
  for(const [key,val] of Object.entries(values)){
    if(key==="project")continue;
    const item=JSON.parse(val);
    if(key.startsWith("n/"))next.nodes.push(item);
    if(key.startsWith("e/"))next.edges.push(item);
    if(key.startsWith("d/"))next.drafts[key.slice(2)]=item;
    if(key.startsWith("t/"))next.turns.push(item);
    if(key.startsWith("a/"))next.assistantDrafts[key.slice(2)]=item;
  }
  const from=j.steps.find(s=>s.id===j.head);
  j.head=id;j.redo=redo;
  (next.visits??=[]).push({id:uid(),visit:true,actor:"user",op,head:id,at:Date.now(),detail:(op==="undo"?from:step)?.detail||boardName(next)});
  next.selected=step?.selected??null;next.stage=step?.stage??0;next.cam=oldCam;
  board=next;clearTransient();displayedDraft=null;
  beginJournal();closeView();closeDialog();render();persist();restoreMedia();
  if(openPanel==="history")paintHistory();
  showToast(choose("已回到所选步骤","Restored this step"));
}
function undo(){
  flushJournal();
  const j=board.journal,step=j.steps.find(s=>s.id===j.head);
  if(step)restoreStep(step.parent,[...j.redo,step.id],"undo");
  else showToast(ui("还没有可撤销的操作"));
}
function redoChange(){
  flushJournal();const j=board.journal;
  const id=j.redo.at(-1)||j.steps.findLast(s=>s.parent===j.head)?.id;
  if(id)restoreStep(id,j.redo.slice(0,-1),"redo");
}
function jumpToStep(id){
  flushJournal();const j=board.journal,index=new Map(j.steps.map(s=>[s.id,s])),redo=[];
  for(let s=index.get(j.head);s&&s.id!==id;s=index.get(s.parent)){redo.push(s.id);if(s.parent===id)break;}
  restoreStep(id,redo.length&&index.get(redo.at(-1)).parent===id?redo:[]);
}
function recordVisit(op,detail){
  flushJournal();
  const visits=board.visits??=[];
  visits.push({id:uid(),op,actor:"user",detail,at:Date.now(),head:board.journal.head,visit:true});
  persist();if(openPanel==="history")paintHistory();
}
function describeStep(s){
  if(s.visit)return "";
  const rows=[];
  for(const [key,val] of Object.entries(s.changes)){
    if(val===null){rows.push(choose("移除","Removed")+" · "+(s.detail||key.slice(0,1)));continue;}
    const v=JSON.parse(val);
    if(key.startsWith("n/"))rows.push((v.title||v.name||v.type)+" · "+clipText(v.text||v.desc||v.payload?.basis||v.reading||"",220));
    if(key.startsWith("a/"))rows.push("AI · "+clipText(v,220));
    if(key.startsWith("d/"))rows.push(choose("草稿","Draft")+" · "+clipText(v.text,220));
    if(key.startsWith("e/"))rows.push((byId(v.from)?titleOf(byId(v.from)):choose("来源","Source"))+" → "+(byId(v.to)?titleOf(byId(v.to)):choose("目标","Target")));
    if(key.startsWith("t/")){
      rows.push(clipText(v.request,220));if(v.result)rows.push(v.result.title+" · "+v.result.basis);
      if(v.sources.length)rows.push(v.sources.map(src=>src.key+" "+src.title).join(" / "));
    }
  }
  return rows.length?'<details class="activity-detail"><summary>'+choose("查看记录","Inspect step")+'</summary><pre>'+esc(rows.slice(0,12).join("\n"))+'</pre></details>':"";
}
let historyPage=50;
function paintHistory(){
  const j=board.journal;if(!j||openPanel!=="history")return;
  const active=new Set();const index=new Map(j.steps.map(s=>[s.id,s]));
  for(let s=index.get(j.head);s;s=index.get(s.parent))active.add(s.id);
  const actor=a=>a==="ai"?"AI":a==="system"?choose("系统","System"):choose("你","You");
  $("sideTitle").textContent=choose("操作历史","History");
  $("historyTop").innerHTML='<button data-studio="undo" '+(!j.head?"disabled":"")+'>'+ic("Undo2")+choose("撤销","Undo")+'</button><button data-studio="redo" '+(!j.redo.length&&!j.steps.some(s=>s.parent===j.head)?"disabled":"")+'>'+ic("Redo2")+choose("重做","Redo")+'</button>';
  const records=[...j.steps,...(board.visits||[])].sort((a,b)=>b.at-a.at);
  $("historyList").innerHTML=records.slice(0,historyPage).map(s=>{
    const current=s.id===j.head,time=new Date(s.at).toLocaleString(language==="en"?"en-US":"zh-CN",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
    return '<li class="history-row '+(current?"current":active.has(s.id)?"past":"alternate")+'"><div class="history-meta"><span>'+actor(s.actor)+'</span><time>'+esc(time)+'</time></div><strong>'+labelAction(s.op)+'</strong><p>'+esc(s.detail||"")+'</p>'+describeStep(s)+(s.visit?'<span class="visit">'+choose("操作记录","Activity")+'</span>':current?'<span class="here">'+choose("当前位置","Current")+'</span>':'<button data-restore="'+s.id+'">'+choose("回到这步","Restore here")+'</button>')+'</li>';
  }).join("")+(records.length>historyPage?'<li><button data-studio="history-more">'+choose("查看更多","Show earlier steps")+'</button></li>':'')+
    '<li class="history-row"><strong>'+choose("初始画布","Starting canvas")+'</strong>'+(j.head?'<button data-restore="">'+choose("恢复","Restore")+'</button>':'')+'</li>';
}
// For large boards keep the same journal and asset IDs when browser localStorage is full.
let archivePromise;
function archiveDB(){
  if(!archivePromise)archivePromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(prefix+".documents",1);
    req.onupgradeneeded=()=>req.result.createObjectStore("boards");
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  return archivePromise;
}
async function archiveBoard(serialized,id){
  const db=await archiveDB();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction("boards","readwrite");tx.objectStore("boards").put(serialized,id);
    tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);
  });
}
async function readBoardRecord(record){
  if(!record?.archived)return record;
  const db=await archiveDB();
  const data=await new Promise((resolve,reject)=>{
    const req=db.transaction("boards").objectStore("boards").get(record.id);
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  if(!data)throw new Error("Saved board missing");
  return JSON.parse(data);
}
