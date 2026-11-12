from pathlib import Path
import re,subprocess
w=Path(__file__).resolve().parent
project=w.parent
s=(project/'Infinite Canvas - P0.html').read_text()
def sub(a,b,count=1):
 global s
 assert s.count(a)==count,(a[:80],s.count(a));s=s.replace(a,b)
def section(a,b,v):
 global s
 x=s.index(a);y=s.index(b,x);s=s[:x]+v+s[y:]
s=s.replace('idea-canvas.p0','idea-canvas.studio')
sub('</style>\n</head>',(w/'lanes.css').read_text()+'</style>\n</head>')
section('    <div class="identity">','  <main id="surface"', '''    <div class="brand-group"><span class="brand-mark" data-icon="Infinity" aria-label="Infinite Canvas"></span><button type="button" id="projectMenu" class="project-menu" data-action="projects" aria-haspopup="dialog"><span id="projectName">未命名画布</span><i data-icon="ChevronDown"></i></button></div>
    <nav id="phases" class="phases" aria-label="四个设计阶段"></nav>
    <div class="mast-right"><span id="saveState" class="save-state" role="status"><b></b><span>本机画布</span></span><div class="more-wrap"><button id="moreBtn" type="button" class="plain-icon" data-action="more" aria-expanded="false" aria-controls="morePanel"><i data-icon="Ellipsis"></i></button><div id="morePanel" class="more-panel" hidden><label class="language-control"><i data-icon="Languages"></i><select id="language" aria-label="系统语言"><option value="zh-CN">中文</option><option value="en">English</option></select></label><button type="button" class="plain-icon help" data-action="help"><i data-icon="CircleHelp"></i><span id="helpLabel"></span></button></div></div></div>
  </header>
''')
sub('<textarea id="prompt"','<button type="button" data-action="files" class="new-brief" id="briefDrop"></button><textarea id="prompt"')
sub('<button type="button" data-action="send"','<button type="button" class="example-btn" id="trySample" data-action="start-sample" hidden></button><button type="button" data-action="send"')
section('      <button type="button" data-action="select"', '      <button type="button" data-action="zoomout"', '''      <button type="button" data-action="studio-note"><i data-icon="SquarePen"></i><span>Note</span></button><button type="button" data-action="studio-asset"><i data-icon="FilePlus2"></i><span>File</span></button><button type="button" data-action="studio-link" aria-pressed="false"><i data-icon="Cable"></i><span>Link</span></button>
    </div>
    <div id="zoomTools" class="board-tools" aria-label="Zoom">
''')
sub('function phasesHTML(){',(w/'lanes.js').read_text()+'\nfunction phasesHTML(){')
section('    return \'<button type="button" class="phase"', '  }).join("");', '''    const num=String(i+1).padStart(2,"0"), label=[choose("收集","Collect"),choose("对比","Compare"),choose("构建","Build"),choose("发布","Release")][i];
    return '<button type="button" class="phase" data-phase="'+i+'" aria-label="'+label+'" title="'+label+'" style="--phase:'+p.color+'" '+(board.stage===i?'aria-current="step"':'')+'><strong data-num="'+num+'">'+label+'</strong><i class="rail"></i></button>';
''')
section('  $("lanes").innerHTML=PHASES.map','\n}\nfunction locationOf','''  const width=LANE*v.s,empty=!board.nodes.length;
  surface.style.setProperty("--lane-width",width+"px");
  $("lanes").innerHTML=PHASES.map((p,i)=>{
    const x=i*width+v.x,num=String(i+1).padStart(2,"0"),segment=$("phases").children[i];
    if(segment){const start=clamp(-x/width,0,1),end=clamp((surface.clientWidth-x)/width,0,1);segment.style.setProperty("--seen-l",start*100+"%");segment.style.setProperty("--seen-w",Math.max(0,end-start)*100+"%");}
    return '<div class="lane-mark '+(empty?'vacant':'')+'" style="left:'+x+'px;width:'+width+'px;--phase:'+p.color+'"><div class="lane-head"><small>'+num+' / '+ui(p.cn)+'</small>'+(empty?'<h2>'+stageJobs()[i]+'</h2>':'')+'</div>'+(empty?ghost(i):'')+'</div>';
  }).join("");
  if(empty)placeComposer();''')
sub('if(!sw||!sh)return;', 'if(!sw||!sh)return;\n  if(!board.nodes.length){emptyOverview(stage);cameraPaint();return;}')
sub('else if(!board.nodes.length){x=(w-cw)/2;y=(h-ch)/2-Math.min(35,h*.035);}', 'else if(!board.nodes.length){x=board.cam.x+16;y=Math.min(164,Math.max(106,h*.22));composer.style.left=x+"px";composer.style.top=y+"px";surface.style.setProperty("--source-y",(y+ch+18)+"px");return;}')
sub('if(!n)return {label:ui("放上画布")','if(!n)return {label:board.nodes.length?ui("放上画布"):choose("创建","Create")')
sub('ui("你想做点什么？"),enabled:!!draft','choose("写下你的想法…","Write your brief…"),enabled:!!draft')
sub('  $("composerLabel").textContent=target;', '  studioLabels();$("composerLabel").textContent=board.nodes.length?target:choose("新想法","New idea");')
sub('const mobile=sw<730,top=43;', 'const mobile=sw<730,top=51;')
sub('if(e.target.closest("#composer,.board-tools,.composer-return"))return;', 'if(e.target.closest("#composer,.board-tools,.composer-return"))return;')
sub('  if((handTool||spaceHeld', '''  if(linkSourceMode&&n){e.preventDefault();linkSourceMode=false;$("tools").querySelector('[data-action="studio-link"]').setAttribute("aria-pressed","false");wireStart(n);suppressTrailingClick(e);return;}
  if((handTool||spaceHeld''')
section('function setTool(mode){','document.addEventListener("click",async', '''function setTool(mode){handTool=mode==="pan";surface.classList.toggle("pan-mode",handTool);}
function closeMore(){ $("morePanel").hidden=true;$("moreBtn").setAttribute("aria-expanded","false"); }
document.addEventListener("click",e=>{if(!e.target.closest(".more-wrap"))closeMore();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){if(!$("morePanel").hidden){closeMore();$("moreBtn").focus();}linkSourceMode=false;$("tools").querySelector('[data-action="studio-link"]').setAttribute("aria-pressed","false");}});
''')
sub('case "example":writeDraft', '''case "more":{const p=$("morePanel");p.hidden=!p.hidden;$("moreBtn").setAttribute("aria-expanded",String(!p.hidden));break;}
      case "studio-note":setTool("select");navigate(0);dropSelection();board.stage=0;board.composer.pos=null;board.composer.folded=false;render();promptBox.focus();persist();break;
      case "studio-asset":fileInputTarget=null;$("importFiles").click();break;
      case "studio-link":{
        setTool("select");
        if(pendingLink||linkSourceMode){pendingLink=null;linkSourceMode=false;wireHint();drawWires();}
        else if(board.nodes.length<2){showToast(choose("添加两个节点后即可连线","Add two objects to connect them"));}
        else if(picked()){wireStart(picked());}
        else{linkSourceMode=true;$("wireHint").hidden=false;$("wireHint").textContent=choose("选择来源，再选择目标","Choose a source, then its target");}
        button.setAttribute("aria-pressed",String(linkSourceMode||!!pendingLink));break;
      }
      case "example":trailShown=!trailShown;render();break;
      case "start-sample":if(draftText().trim()){showToast(choose("先创建当前想法，再尝试示例","Create your current idea before starting the example"));break;}writeDraft''')
sub('board.pendingSample=true;paintComposer();promptBox.focus();scheduleSave();break;', 'board.pendingSample=true;trailShown=false;await send();break;')
sub('case "help":help();','case "help":closeMore();help();')
sub('function clearTransient(){','function clearTransient(){trailShown=false;linkSourceMode=false;')
sub('function wireHint(){const h=', '''function wireHint(){$("tools").querySelector('[data-action="studio-link"]').setAttribute("aria-pressed",String(linkSourceMode||!!pendingLink));const h=''')
sub('const reframe=board.nodes.length&&', 'if(!board.nodes.length){emptyOverview(board.stage);lastWidth=w;lastHeight=h;cameraPaint();return;}\n  const reframe=board.nodes.length&&')
sub('statusLabel(mediaOkay?"已存本机":"部分素材仅本次可用");','statusLabel(mediaOkay?choose("已保存","Saved"):"部分素材仅本次可用");')
sub('  board.stage=phase;pendingLink=null;', '  board.stage=phase;linkSourceMode=false;pendingLink=null;')
sub('    if(!n||n.type==="asset"){await makeIdea();return;}', '    if(!n||n.type==="asset"){trailShown=false;await makeIdea();return;}')
sub('  if(empty)placeComposer();', """  if(empty){
    placeComposer();
    const cards=[...$("lanes").querySelectorAll(".ghost-card")];
    if(cards.length===4){
      const area=surface.getBoundingClientRect();
      const rect=el=>{const r=el.getBoundingClientRect();return {l:r.left-area.left,r:r.right-area.left,y:r.top-area.top+r.height/2};};
      const [a,b,build,release]=cards.map(rect),src=rect(composer);
      const path=(p,q,lift=0)=>{const x=p.r+1,end=q.l-2;
        if(lift){const y=Math.min(p.y,q.y)-lift;return "M"+x+" "+p.y+" Q"+(x+6)+" "+p.y+" "+(x+6)+" "+(p.y-8)+" V"+(y+5)+" Q"+(x+6)+" "+y+" "+(x+12)+" "+y+" H"+(end-9)+" Q"+(end-3)+" "+y+" "+(end-3)+" "+(y+7)+" V"+(q.y-5)+" Q"+(end-3)+" "+q.y+" "+end+" "+q.y;}
        return "M"+x+" "+p.y+" C"+((x+end)/2)+" "+p.y+" "+((x+end)/2)+" "+q.y+" "+end+" "+q.y;};
      const d=[path(src,a),path(src,b,60),path(b,build),path(build,release)];
      $("lanes").insertAdjacentHTML("afterbegin",'<svg class="ghost-wires" aria-hidden="true">'+d.map(v=>'<path d="'+v+'"/>').join("")+'</svg>');
    }
  }""")
sub('const idea=startIdea(text,source?.type==="asset"?source:null);','const idea=startIdea(text,source?.type==="asset"?source:null,null,board.nodes.length?board.stage:0);')
sub('if(pendingLink&&pendingLink.id!==n.id)completeWire(n);else{selectNode(n);repaintSelection();}', 'if(linkSourceMode){linkSourceMode=false;wireStart(n);}else if(pendingLink&&pendingLink.id!==n.id)completeWire(n);else{selectNode(n);repaintSelection();}')
sub('id="lanes" aria-hidden="true"', 'id="lanes" aria-label="Canvas lanes"')
sub('if(empty)placeComposer();','if(empty)placeComposer();') if False else None
sub('board.composer.pos={x:clamp((x-8)/Math.max(1,w-cw-16),0,1),y:clamp((y-8)/Math.max(1,h-ch-16),0,1)};placeComposer();', 'board.composer.pos={x:clamp((x-8)/Math.max(1,w-cw-16),0,1),y:clamp((y-8)/Math.max(1,h-ch-16),0,1)};if(board.nodes.length)placeComposer();else cameraPaint();')
sub('$("trySample").hidden=!trailShown||!!board.nodes.length;', '$("trySample").hidden=!trailShown||!!board.nodes.length||!!draftText().trim();$("send").hidden=!$("trySample").hidden;')
sub('aria-label="Zoom"', 'aria-label="缩放"')
sub('  $("helpLabel").textContent=ui("使用帮助");','  $("helpLabel").textContent=ui("使用帮助");$("lanes").setAttribute("aria-label",choose("阶段分区","Canvas lanes"));$("zoomTools").setAttribute("aria-label",choose("缩放","Zoom"));')
# Keep direction controls anchored when instructions are saved.
sub("+instructionList(n)+", "+")
sub("  const edit=n.type", """  const count=dir?n.requirements?.length||0:0;
  const notes=count?btn("show-instructions",String(count),"List","instruction-count",
    choose("设计要求 · "+count,"Design instructions · "+count)):"";
  const edit=n.type""")
sub("+adopted+edit+", "+adopted+notes+edit+")
sub('case "adopt":adopt(n);break;', """case "show-instructions":
        dialog(choose("方向 "+n.letter+" · 设计要求","Direction "+n.letter+" · Design instructions"),
          "<ol>"+n.requirements.map(text=>"<li>"+esc(text)+"</li>").join("")+"</ol>");break;
      case "adopt":adopt(n);break;""")
section('function instructionList(n){','async function buildFrom','')
import shutil
from integrate import upgrade
s=upgrade(s)
(project/'Infinite Canvas - Studio.html').write_text(s)
launcher=project/'Start Studio AI.command'
shutil.copyfile(w/'engine.py',launcher)
launcher.chmod(0o755)
