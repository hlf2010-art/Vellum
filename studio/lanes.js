let trailShown=false,linkSourceMode=false;
const stageJobs=()=>[choose("收集","Collect"),choose("比较两个方向","Compare two directions"),choose("构建","Build"),choose("发布","Release")];
function emptyOverview(phase=0){
  const w=surface.clientWidth,lane=Math.max(278,w/4);
  board.cam={s:lane/LANE,x:-Math.min(phase*lane,Math.max(0,lane*4-w)),y:0};
}
function ghostCard(label,title,kind){
  const visual=kind==="file"?'<div class="ghost-stamp">'+ic("Check")+' HTML · v1</div>':kind==="web"?'<div class="ghost-page"><header></header><main><b></b><i></i></main></div>':kind==="list"?'<div class="ghost-list"><i></i><i></i><i></i></div>':trailShown?'<img src="'+SAMPLE_IMAGE+'" alt="">':'<div class="ghost-hero"></div>';
  return '<div class="ghost-card '+(kind==="file"?'ghost-file ghost-web':kind==="web"?'ghost-web':'')+'"><label>'+label+'</label>'+visual+(title?'<strong>'+title+'</strong>':'')+'</div>';
}
function ghost(i){
  const tide=choose("潮汐手记","Tide Notes"),on=trailShown;
  if(i===0)return on?'<div class="ghost-source">'+esc(tide)+' →</div>':'';
  let content=i===1?ghostCard("A",on?choose("连续导览","Guided tour"):"","story")+ghostCard("B",on?choose("自由探索","Explorer"):"","list"):ghostCard(i===2?choose("网页原型","Prototype"):choose("交付版本","Release"),on?tide:"",i===2?"web":"file");
  return '<div class="lane-ghost '+(on?'on':'')+'"><div class="ghost-row">'+content+'</div></div>';
}
function studioLabels(){
  $("briefDrop").textContent=choose("拖入收集的素材，或写下简报。","Drop what you’ve collected, or write the brief.");
  $("example").lastElementChild.textContent=trailShown?choose("隐藏示例","Hide example"):ui("试用示例");
  $("example").title=choose("查看示例路径","Show example trail");
  $("trySample").hidden=!trailShown||!!board.nodes.length;
  $("trySample").textContent=choose("使用此示例","Use example");
  for(const [key,zh,en] of [["note","笔记","Note"],["asset","文件","File"],["link","连线","Link"]]){
    const b=$("tools").querySelector('[data-action="studio-'+key+'"]');b.lastElementChild.textContent=choose(zh,en);b.title=choose(zh,en);
  }
  $("moreBtn").ariaLabel=choose("更多选项","More options");
  $("helpLabel").textContent=ui("使用帮助");
}
