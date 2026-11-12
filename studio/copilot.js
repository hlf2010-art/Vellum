let openPanel="",aiIntent="suggest",aiFormat="brief",scopeMode="selection",activeRun=null,health="checking";
let threadSignature="",sourceSignature="",lastTarget,healthTimer,progressText="",submitting=false,aiDraftOwner="";

const modeNames={suggest:["给建议","Advise"],create:["生成","Create"],edit:["编辑","Edit"]};
const str={type:"string"},obj=properties=>({type:"object",properties,required:Object.keys(properties),additionalProperties:false});
const array=(items,minItems,maxItems)=>({type:"array",items,minItems,maxItems});
const formatSpecs={
  brief:"Write a working creative brief: audience and real problem, evidence, unresolved assumption, design decision, and an ordered first prototype and acceptance test.",
  branches:"Propose exactly two genuinely different design strategies for this brief. Give each a concrete interaction, visual treatment and a discriminating user test. The first will use a guided story, the second an open collection.",
  graphic:"Art-direct a finished typographic poster. Choose the headline (short and specific, preserve explicitly requested display text), a short editorial kicker, one supporting line of finished copy, three distinct six-digit hex colors, a typeface and one composition. Choose the motif that expresses the subject: plate for metal with an edge highlight, fold for architectural planes, orbit for radial forms, contour for layered lines, bars for rhythm. Set image to an actual image source ID (S1 etc.) if the design should feature an uploaded image, else empty. For palette assignments: background is the ground; accent is the actual subject material (for copper an aged warm brown, for example #AC7254); edge is the requested contrasting highlight (silver e.g. #D5D8D2); ink is legible type. Use an ink-green ground like #19382F when that color is requested. Match the actual brief, including explicit capitalization. Keep all production reasoning in basis.",
  video:"Design a shootable sequence of 3–6 shots. For each shot specify duration in seconds, composition and lighting, on-screen copy, sound direction, camera movement, a six-digit hex background color, and a matching supplied image ID such as S2 or an empty string. Build a visual progression. Sound is a production note. Design each shot as an actual composition with 2–4 vector layers for its keyframe: x,y,w,h are percentages. Use block, ellipse, path, rule, or photo. Place a real image source ID in photo values if relevant. Use six-digit hex ink.",
  copy:"Write finished audience-facing copy appropriate to the request, with a clear voice, headline and specific call to action when appropriate. Put reasoning outside the copy.",
  web:"Design a self-contained webpage with no libraries or network. The markup, styles and behavior will be assembled into one runnable HTML file. Build one fully working core interaction, responsive and keyboard-usable. Reflect the evidence and requested design direction. For supplied photos use <img src='studio-image:S2'> with the real source ID. Keep every element purposeful and compact. Complete all HTML tags. Do not put internal requirements, research notes or source IDs in visible public copy.",
  product:"Develop an actionable business/product plan. Identify the customer and job, evidence, a narrow first offer, an assumption about economics clearly labeled, the smallest launch experiment, its owner or role, deliverables and measurable go/no-go criteria. Do not invent market data."
};
const percent={type:"integer",minimum:0,maximum:100};
const layerSchema=obj({kind:{type:"string",enum:["block","ellipse","rule","headline","copy","label","photo","path"]},
  x:percent,y:percent,w:percent,h:percent,ink:str,value:str});
function resultSchema(format,intent,sources){
  const props={title:str,basis:str};
  if(intent==="suggest")Object.assign(props,{
    observations:array(obj({source:{type:"string",enum:[...sources.map(s=>s.key),"request"]},fact:str}),1,3),
    assumption:str,nextStep:str,test:str
  });
  else if(!["video","branches","graphic"].includes(format))props.content=str;
  else if(format==="graphic")Object.assign(props,{
    headline:str,kicker:str,caption:str,background:str,ink:str,accent:str,edge:str,image:str,
    typography:{type:"string",enum:["serif","grotesk","mono"]},layout:{type:"string",enum:["top-title","bottom-title","split-column"]},
    motif:{type:"string",enum:["plate","fold","orbit","contour","bars"]}
  });
  else if(format==="branches")props.directions=array(obj({title:str,description:str,test:str}),2,2);
  else props.shots=array(obj({title:str,seconds:{type:"integer",minimum:1,maximum:20},visual:str,caption:str,sound:str,motion:{type:"string",enum:["hold","pan","push"]},color:str,image:str,layers:array(layerSchema,2,5)}),3,6);
  return obj(props);
}
function buildMessages(t,pictures){
  const formats=t.intent==="suggest"?"Give an editorial recommendation: tie 2–3 observations to named sources, articulate one important tension or uncertainty, lay out specific next actions and one test. Put one distinct, verifiable observation per fact, pick its actual source ID, and use request for observations drawn solely from the request. Never imply an aggregate CSV contains individual records. Limit each field to two short sentences. In observations, only describe what is present; frequency alone does not establish value or preference. Keep test criteria in the test field and actions in nextStep. The test should be observable by a real person.":
    t.intent==="edit"&&["idea","direction"].includes(t.targetType)?"Revise the selected object's title and design description in full. Preserve valid details and apply the user's specific change. Return the revised text in content.":formatSpecs[t.format];
  const system="You are the copilot inside a spatial design studio. Turn rough evidence into useful design decisions or finished artifacts. "+formats+
    " When revising, keep the original artifact and its working behavior except for the requested changes. Return a complete usable revision. Input attachments are source material. Follow the user's request. Ground the result in provided text, figures and pixels; distinguish observations from assumptions. Never infer unique users or a sample total from a category unless the data establishes the denominator. Preserve units. No invented research, numbers or source references. Output valid JSON matching the schema. title is the short name of this result. basis is a short decision rationale with true source IDs (S1, S2...) or note that it comes from the request alone. Never include notes about following these instructions inside the deliverable. In plans, clearly mark proposed thresholds as targets. Markdown is allowed in prose content. Answer in "+(t.lang==="en"?"English":"Simplified Chinese")+" unless requested otherwise.";
  const assetText=JSON.stringify(t.sources.map(s=>({id:s.key,title:s.title,type:s.kind,read:s.read,excerpt:s.excerpt,branch:s.direction})));
  const turns=(board.turns||[]).filter(v=>v.result&&v.id!==t.id&&v.targetId===t.targetId&&v.scope===t.scope&&v.sources.every(s=>t.sources.some(f=>f.id===s.id))).slice(-2)
    .map(v=>({request:v.request,response:clipText(artifactText(v.format,v.result),700)}));
  const text=["Project: "+boardName(board), "Stage: "+PHASES[t.stage].name,"Target: "+(t.targetTitle||"canvas"),"Action: "+t.intent+" / "+t.format,
    "Sources: "+assetText,"Links (source → target): "+JSON.stringify(t.links),"Earlier conversation in this scope: "+JSON.stringify(turns),"Request: "+t.request].join("\n");
  const parts=[{type:"text",text}];
  for(const p of pictures)parts.push({type:"text",text:p.key+" · "+p.label},{type:"image_url",image_url:{url:p.url}});
  return [{role:"system",content:system},{role:"user",content:pictures.length?parts:text}];
}
async function modelJSON(messages,schema,maxTokens,label,signal){
  const res=await fetch(ENGINE_URL+"/studio/generate",{method:"POST",signal,headers:{"Content-Type":"application/json","X-Studio-Client":"canvas"},
    body:JSON.stringify({messages,response_format:{type:"json_schema",json_schema:{name:"studio_proposal",schema}},max_tokens:maxTokens})});
  if(!res.ok)throw new Error(res.status===503?offlineMessage():choose("模型未能完成请求，请减少来源后重试。","The model could not finish. Try fewer sources."));
  const reader=res.body.getReader(),decoder=new TextDecoder();let buffer="",answer="",finish="";
  try{for(;;){
    const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});
    let at;
    while((at=buffer.indexOf("\n"))!==-1){
      const line=buffer.slice(0,at).trim();buffer=buffer.slice(at+1);
      if(!line.startsWith("data:")||line.includes("[DONE]"))continue;
      const part=JSON.parse(line.slice(5)),choice=part.choices?.[0];
      answer+=choice?.delta?.content||"";if(choice?.finish_reason)finish=choice.finish_reason;
    }
    progressText=label+" · "+answer.length.toLocaleString()+choose(" 字符"," characters");
    const status=$("aiProgress");if(status)status.textContent=progressText;
  }}finally{reader.releaseLock();}
  if(finish==="length"){
    const err=new Error(choose("输出超出单次长度，可缩小任务再试。","The output reached the response limit. Try a smaller task."));
    err.code="length";throw err;
  }
  return JSON.parse(answer);
}
async function streamProposal(t,pictures,signal){
  if(t.format==="web"&&t.intent!=="suggest")return generateWeb(t,pictures,signal);
  const result=await modelJSON(buildMessages(t,pictures),resultSchema(t.format,t.intent,t.sources),["video","graphic"].includes(t.format)?3400:2200,choose("正在生成","Generating"),signal);
  if(!result.title?.trim()||!result.basis?.trim())throw new Error(choose("模型返回了不完整的提案，可重试。","The proposal was incomplete. Retry this request."));
  if(t.intent==="suggest"){
    const title=(zh,en)=>t.lang==="en"?en:zh;
    result.content=["## "+title("观察依据","Evidence"),...result.observations.map(o=>"- "+o.fact+" ["+o.source+"]"),
      "## "+title("待验证的假设","Assumption"),result.assumption,"## "+title("下一步","Next step"),result.nextStep,
      "## "+title("验收办法","How to test it"),result.test].join("\n");
  }
  if(t.format==="graphic"&&t.intent!=="suggest")result.content=posterArtwork(result);
  if(t.format==="video"&&t.intent!=="suggest")result.shots.forEach(s=>{s.color=safeColor(s.color);s.seconds=clamp(Number(s.seconds)||3,1,20);});
  return result;
}
function offlineMessage(){return choose("请打开随 Studio 提供的「Start Studio AI.command」，待本机模型就绪后重试。","Open the included Start Studio AI.command, then retry when the local model is ready.");}
async function checkHealth(){
  try{const res=await fetch(ENGINE_URL+"/studio/health",{signal:AbortSignal.timeout(3200)});const data=await res.json();health=data.service==="infinite-canvas"?data.status:"offline";}
  catch{health="offline";}
  paintEngine();
}
function paintEngine(){
  const status=$("engineStatus");if(!status)return;
  status.dataset.health=health;
  status.title=MODEL;
  status.textContent=health==="ready"?choose("本机 · Qwen3-VL","Local · Qwen3-VL"):health==="loading"?choose("模型加载中","Loading model"):health==="checking"?choose("连接中","Connecting"):choose("模型未连接","Model offline");
}
function haltRequest(){
  if(activeRun){activeRun.controller.abort();activeRun=null;}
  submitting=false;progressText="";
}
function editAllowed(n){return n&&["idea","direction","artifact"].includes(n.type)&&!n.frozen;}
function selectedSources(){
  const target=picked(),pool=reachableContext(target,scopeMode==="all").filter(n=>!excludedSources.has(n.id));
  if(aiIntent==="edit"&&target)return [target,...pool.filter(x=>x!==target)].slice(0,12);
  return pool.slice(0,12);
}
function turnSources(t){
  if(!t.sources.length)return "";
  return '<details class="source-disclosure"><summary>'+choose("读取来源","Sources read")+' · '+t.sources.length+'</summary>'+t.sources.map(s=>'<div><b>'+s.key+' · '+esc(s.title)+'</b><small>'+esc(s.read)+'</small>'+(s.excerpt?'<p>'+esc(clipText(s.excerpt,250))+'</p>':'')+'</div>').join("")+'</details>';
}
function proposalPreview(t){
  const p=t.result;
  if(!p.observations)return textPreview(t.format==="graphic"||t.format==="web"?p.basis:clipText(artifactText(t.format,p),650));
  const evidence=p.observations.map(o=>{
    const src=t.sources.find(s=>s.key===o.source);
    const chip=src?'<button type="button" class="evidence-link" data-evidence="'+t.id+'" data-key="'+src.key+'">'+esc(src.key+" · "+clipText(src.title,22))+'</button>':
      '<small class="input-source">'+choose("你的输入","Your input")+'</small>';
    return '<div class="observation">'+chip+'<p>'+esc(o.fact)+'</p></div>';
  }).join("");
  return evidence+'<h4>'+choose("待验证的假设","Assumption")+'</h4><p>'+esc(p.assumption)+'</p><h4>'+choose("下一步","Next step")+'</h4><p>'+esc(p.nextStep)+'</p><h4>'+choose("验收办法","How to test it")+'</h4><p>'+esc(p.test)+'</p>';
}
async function inspectSource(turnId,key){
  const s=board.turns?.find(t=>t.id===turnId)?.sources.find(v=>v.key===key);if(!s)return;
  const url=s.kind==="image"?await mediaUrl(s.id):"";
  dialog(s.key+" · "+s.title,'<p class="subtext">'+esc(s.read)+'</p>'+(url?'<img class="media-inspect" alt="'+esc(s.title)+'" src="'+esc(url)+'">':'')+(s.excerpt?'<pre class="text-inspect">'+esc(s.excerpt)+'</pre>':''));
}
function renderTurns(){
  const turns=board.turns||[],key=JSON.stringify([language,board.id,!!board.nodes.length,turns.map(t=>[t.id,t.status,t.applied,t.error]),activeRun?.id]);
  if(threadSignature===key)return;threadSignature=key;
  const list=$("aiTurns"),atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<100;
  if(!turns.length){
    list.innerHTML='<div class="ai-empty"><div class="empty-graph" aria-hidden="true"><i></i><i></i><b></b><span></span></div><h3>'+choose("从碎片开始","Start with fragments")+'</h3><p>'+choose("选一张卡，或直接写下想法。助手可以整理线索、修改内容，也可以和你做出第一版。","Select a card or write a rough idea. Turn your sources into a brief, a revision, or a first working version.")+'</p>'+'<button class="demo-link" data-studio="ai-example">'+choose("在新画布推演一个展览示例","Try an exhibition brief on a new canvas")+' ↗</button></div>';return;
  }
  list.innerHTML=turns.map(t=>{
    const p=t.result,busy=t.status==="pending"&&activeRun?.id===t.id;
    let result="";
    if(p){
      const original=t.intent==="edit"?t.sources.find(s=>s.id===t.targetId):null;
      const before=original?'<details><summary>'+choose("对照修改前","Compare with original")+'</summary><pre>'+esc(original.excerpt)+'</pre></details>':"";
      const applyLabel=t.intent==="edit"?choose("应用修改","Apply revision"):choose("放上画布","Add to canvas");
      const action=t.applied?'<span class="applied">'+ic("Check")+choose("已应用","Applied")+'</span>':
        '<button class="proposal-apply" data-turn-apply="'+t.id+'" title="'+esc(t.targetTitle?applyLabel+" · "+t.targetTitle:applyLabel)+'">'+ic("Plus")+applyLabel+'</button>';
      result='<div class="proposal"><div class="proposal-top"><small>'+esc(choose(...modeNames[t.intent]))+' / '+esc(formatLabel(t.format))+'</small>'+action+'</div><h3>'+esc(p.title)+'</h3><div class="proposal-copy">'+proposalPreview(t)+'</div>'+before+'<details><summary>'+choose("完整提案与依据","Full proposal & rationale")+'</summary><p>'+esc(p.basis)+'</p><pre>'+esc(artifactText(t.format,p))+'</pre></details>'+turnSources(t)+'</div>';
    }else if(busy){result='<div class="ai-pending"><span class="pulse"></span><span id="aiProgress">'+esc(progressText||choose("正在读取来源…","Reading sources…"))+'</span></div>';}
    else{result='<p class="ai-error">'+esc(t.error||(t.status==="stopped"?choose("已停止","Stopped"):choose("生成已中断","Generation interrupted")))+'</p><button class="retry" data-turn-retry="'+t.id+'">'+choose("重试","Retry")+'</button>';}
    return '<section class="turn" data-turn="'+t.id+'"><div class="turn-request"><small>'+choose("你","You")+(t.targetTitle?' · '+esc(t.targetTitle):'')+'</small><p>'+esc(t.request)+'</p></div>'+result+'</section>';
  }).join("");
  if(atBottom){
    const latest=turns.at(-1),proposal=list.lastElementChild?.querySelector(".proposal");
    if(proposal&&latest?.result&&!latest.applied)list.scrollTop+=proposal.getBoundingClientRect().top-list.getBoundingClientRect().top-6;
    else list.scrollTop=list.scrollHeight;
  }
}
function paintControls(){
  const n=picked(),target=n?.id||"";
  if(lastTarget!==target){excludedSources.clear();scopeMode="selection";lastTarget=target;if(aiIntent==="edit"&&!editAllowed(n))aiIntent="suggest";}
  if(aiIntent==="edit"&&!editAllowed(n))aiIntent="suggest";
  $("sideTitle").textContent=choose("AI 助手","AI Copilot");
  $("aiScopeLabel").textContent=choose("上下文","Context");
  const scope=$("aiScope");scope.options[0].textContent=n?clipText((n.letter?n.letter+" · ":"")+titleOf(n),35):choose("画布素材","Canvas sources");
  scope.options[1].textContent=choose("整张画布","Entire canvas");scope.options[1].hidden=!n;scope.value=scopeMode;
  const available=reachableContext(n,scopeMode==="all"),sources=selectedSources(),list=$("sourceChoices");
  const sig=JSON.stringify([language,aiIntent,target,available.map(x=>[x.id,titleOf(x)]),[...excludedSources]]);
  $("aiSourceCount").textContent=choose("来源 ","Sources ")+sources.length+(available.length>12?" / "+available.length:"");
  if(sig!==sourceSignature){sourceSignature=sig;
    list.innerHTML=available.length?available.map(x=>'<label><input type="checkbox" data-source-id="'+x.id+'" '+(aiIntent==="edit"&&x===n?"checked disabled":!excludedSources.has(x.id)?"checked":"")+'><span>'+esc(titleOf(x))+'</span></label>').join("")+(available.length>12?'<small>'+choose("每次按顺序读取前 12 个勾选来源。","Reads the first 12 checked sources per request.")+'</small>':''):'<small>'+choose("这次仅使用你的输入。","This request uses your input only.")+'</small>';
  }
  for(const b of $("aiModes").children){const m=b.dataset.mode;b.textContent=choose(...modeNames[m]);b.disabled=m==="edit"&&!editAllowed(n);b.setAttribute("aria-pressed",String(aiIntent===m));}
  $("aiFormatRow").hidden=aiIntent!=="create";$("aiFormatLabel").textContent=choose("产出","Output");
  const fmt=$("aiFormat");for(const opt of fmt.options)opt.textContent=formatLabel(opt.value);fmt.value=aiFormat;
  $("aiPrompt").placeholder=aiIntent==="edit"?choose("想怎样修改这张卡？","What would you change about this card?"):
    aiIntent==="create"?choose("描述你想做的东西…","Describe what you want to make…"):choose("把不确定的地方告诉我…","What would you like to figure out?");
  $("aiPrompt").ariaLabel=choose("给 AI 助手的请求","Copilot request");
  const busy=!!activeRun;
  $("aiSend").hidden=busy;$("aiStop").hidden=!busy;$("aiStop").textContent=choose("停止","Stop");
  $("aiSend").textContent=aiIntent==="edit"?choose("生成修改稿","Draft revision"):aiIntent==="create"?choose("生成初稿","Generate draft"):choose("获取建议","Get advice");
  $("aiSend").disabled=!sources.length&&!$("aiPrompt").value.trim();
  $("inputHint").textContent=choose("仅在应用后修改画布","Changes appear when you apply");
  paintEngine();renderTurns();
}
function openSide(which){
  if(which===openPanel){closeSide();return;}
  openPanel=which;$("studioSide").hidden=false;$("desk").classList.add("side-open");
  $("aiBody").hidden=which!=="ai";$("historyBody").hidden=which!=="history";
  $("openAI").setAttribute("aria-expanded",String(which==="ai"));$("openHistory").setAttribute("aria-expanded",String(which==="history"));
  $("closeSide").ariaLabel=choose("收起侧栏","Close panel");
  clearInterval(healthTimer);
  if(which==="ai"){paintControls();checkHealth();healthTimer=setInterval(checkHealth,20000);$("aiPrompt").focus({preventScroll:true});}
  else{flushJournal();paintHistory();$("sideTitle").focus({preventScroll:true});}
}
function closeSide(){
  const was=openPanel;openPanel="";clearInterval(healthTimer);$("studioSide").hidden=true;$("desk").classList.remove("side-open");
  $("openAI").setAttribute("aria-expanded","false");$("openHistory").setAttribute("aria-expanded","false");
  if(was)$(was==="ai"?"openAI":"openHistory").focus({preventScroll:true});
}
function defaultRequest(intent,fmt,target){
  if(intent==="suggest")return choose("整理这些线索，指出最值得验证的假设，并给我一个可以开始做的下一步。","Synthesize these fragments, identify the most important assumption, and give me a concrete next step.");
  if(intent==="edit")return choose("保留意图，把当前内容改得更具体、更容易执行。","Keep the intent and revise this into something specific and actionable.");
  return choose("用当前来源做一版","Use the current sources to create a first ")+formatLabel(fmt)+(language==="en"?".":"。");
}
async function runAI(retry=null){
  if(submitting||activeRun)return;
  const owner=board,n=retry?.targetId?byId(retry.targetId):picked(),intent=retry?.intent||aiIntent;
  if(intent==="edit"&&!editAllowed(n)){showToast(choose("请选择可编辑的想法、方向或作品。","Select an editable idea, direction, or artifact."));return;}
  const format=retry?.format||(intent==="suggest"?"brief":intent==="edit"?(n.format||"brief"):aiFormat);
  const ids=retry?.requestedIds;
  if(ids&&ids.some(id=>!byId(id))){showToast(choose("原来源已变化，请重新选择上下文。","Sources have changed. Select the context again."));return;}
  const nodes=ids?ids.map(byId):selectedSources(),typed=retry?.request||$("aiPrompt").value.trim();
  if(!nodes.length&&!typed)return;
  const request=typed||defaultRequest(intent,format,n);
  const t={id:uid(),at:Date.now(),lang:language,stage:board.stage,intent,format,request,scope:retry?.scope||scopeMode,
    targetId:n?.id||null,targetType:n?.type||"",targetTitle:n?titleOf(n):"",targetStamp:intent==="edit"?stamp(n):"",requestedIds:nodes.map(v=>v.id),
    sources:[],links:[],status:"pending",model:MODEL};
  const run={id:t.id,controller:new AbortController()};submitting=true;activeRun=run;progressText=choose("正在读取来源…","Reading sources…");
  checkpoint("ask",clipText(request,100));(board.turns??=[]).push(t);if(!retry){$("aiPrompt").value="";rememberAiDraft();}persist();paintControls();
  const timer=setTimeout(()=>run.controller.abort("timeout"),270000);
  const alive=()=>board===owner&&activeRun===run;
  try{
    const {sources,pictures}=await collectSources(nodes,run.controller.signal);
    if(!alive())return;
    const lookup=new Map(sources.map(s=>[s.id,s.key]));
    const links=board.edges.filter(e=>lookup.has(e.from)&&lookup.has(e.to)).map(e=>[lookup.get(e.from),lookup.get(e.to),e.kind]);
    const result=await streamProposal({...t,sources,links},pictures,run.controller.signal);
    if(!alive())return;
    checkpoint("answer",result.title,"ai");Object.assign(t,{sources,links,result,status:"done"});health="ready";
  }catch(err){
    if(!alive())return;
    const stopped=run.controller.signal.aborted;
    checkpoint(stopped?"stop":"error",clipText(request,80),stopped?"user":"system");
    t.status=stopped?"stopped":"error";
    if(run.controller.signal.reason==="timeout")t.error=choose("生成超时，可缩短输入后重试。","Generation timed out. Try a shorter request.");
    else if(!stopped)t.error=err instanceof TypeError?offlineMessage():err instanceof SyntaxError?choose("返回内容不完整，可重试。","The reply was incomplete. Please retry."):err.message;
    checkHealth();
  }finally{
    clearTimeout(timer);
    if(alive()){activeRun=null;submitting=false;progressText="";persist();paintControls();}
  }
}
function applyTurn(id){
  const t=board.turns?.find(v=>v.id===id);
  if(!t?.result||t.applied)return;
  const target=byId(t.targetId),p=t.result;
  if(t.requestedIds.some(id=>!byId(id))){showToast(choose("来源已移除。请用当前素材重新生成。","A source was removed. Regenerate with the current sources."));return;}
  if(t.intent==="edit"&&(!target||t.targetStamp!==stamp(target))){showToast(choose("原节点已有新修改，请重试以更新提案。","The target has changed. Retry against its current version."));return;}
  checkpoint("apply",p.title,"ai");
  const inputs=t.requestedIds.map(byId),connect=(dest,from=inputs)=>{for(const src of from)if(src.id!==dest.id&&!hasPath(dest.id,src.id)&&!hasPath(src.id,dest.id))edge(src.id,dest.id,src.type==="asset"?"ref":"derive",defaultRole(src));};
  let node,focus;
  if(t.intent==="edit"){
    node=target;
    if(node.type==="direction"){Object.assign(node,{title:p.title,edited:true,desc:p.content,customText:p.content});}
    else if(node.type==="idea"){node.text=p.content;node.title=p.title;}
    else{node.payload=structuredClone(p);node.title=p.title;node.ver++;}
    connect(node);
  }else if(t.format==="branches"){
    let idea=target?.type==="idea"?target:null;
    if(!idea){idea=startIdea(t.request,null,null,0);idea.title=p.title;connect(idea);}
    const group=uid(),stack=surface.clientWidth<620;
    focus=p.directions.map((d,i)=>{
      const pos=freeSpot(LANE+(i&&!stack?406:78),90,276,300);
      const dir=newNode("direction",1,{title:d.title,desc:d.description,customText:d.description,edited:true,letter:i?"B":"A",mode:i?"desk":"story",idea:idea.id,origin:{title:idea.title,text:idea.text},group,requirements:[d.test],turnId:t.id},pos);
      edge(idea.id,dir.id,"derive");connect(dir);return dir;
    });
    node=focus[0];
  }else if(t.format==="brief"){
    node=startIdea(p.content,null,null,t.intent==="suggest"&&target?laneOf(target.x):0);node.title=p.title;
    if(!board.renamed&&board.nodes.filter(x=>x.type==="idea").length===1)board.title=p.title;
    connect(node);
  }else{
    node=newNode("artifact",2,{title:p.title,format:t.format,payload:structuredClone(p),ver:1});
    if(!board.renamed&&board.title==="未命名画布")board.title=p.title;
    connect(node);
  }
  node.turnId=t.id;node.sourceList=t.sources.map(({key,id,title,kind})=>({key,id,title,kind}));
  t.applied=node.id;finish(node,focus||[node]);paintControls();showToast(choose("已应用，可在历史中回退","Applied. You can undo this in History."));
}
function rememberAiDraft(){
  const id=board.selected||"canvas",drafts=board.assistantDrafts??={};
  if($("aiPrompt").value)drafts[id]=$("aiPrompt").value;else delete drafts[id];
  aiDraftOwner=board.id+"/"+id;scheduleSave();
}
function loadAiDraft(){
  const id=board.selected||"canvas",key=board.id+"/"+id,value=board.assistantDrafts?.[id]||"";
  if(aiDraftOwner===key&&$("aiPrompt").value===value)return;
  $("aiPrompt").value=value;aiDraftOwner=key;
}

let exampleLoading=false;
async function exhibitionExample(){
  if(exampleLoading||activeRun)return;
  exampleLoading=true;
  try{
    await switchBoard(newBoard());
    const brief=choose("想做《展边手记》。看展时只来得及记住一个细节，回家后想把零散印象变成可以继续做设计的素材。",'Create “Gallery Pocket”. During a gallery visit there is only time to capture one detail. Back home I want to turn those fragments into material for my next design.');
    checkpoint("add",choose("展边手记","Gallery Pocket"));const idea=startIdea(brief,null,null,0);
    finish(idea,[idea]);
    const note=new File([choose("有铜锈的灯罩。值得记住的是它边缘的一道反光。","Patinated copper lampshade. What's worth remembering is the reflection along its edge.")],choose("灯罩笔记.txt","Exhibition note.txt"),{type:"text/plain"});
    const data=new File([choose("记录内容,示例次数\n反光等视觉细节,18\n展品标签,4","Capture,Example observations\nReflections and visual details,18\nExhibition labels,4")],choose("示例观察.csv","Sample observations.csv"),{type:"text/csv"});
    await addFiles([note,data],{target:idea.id});selectNode(idea);repaintSelection();
    if(openPanel!=="ai")openSide("ai");
    aiIntent="suggest";scopeMode="selection";excludedSources.clear();
    $("aiPrompt").value=choose("用这句展览笔记和示例数据整理设计机会。分清观察和假设，再给出一个今天能做的原型和验收办法。","Use the exhibition note and sample data to identify a design opportunity. Separate observations from assumptions, then propose a prototype I can make today and a concrete test.");
    rememberAiDraft();paintControls();await runAI();
  }finally{exampleLoading=false;}
}
