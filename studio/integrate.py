from pathlib import Path

SRC = Path(__file__).resolve().parent


def upgrade(html):
    def sub(old, new, count=1):
        nonlocal html
        assert html.count(old) == count, (old[:90], html.count(old))
        html = html.replace(old, new)

    def section(start, end, replacement):
        nonlocal html
        left = html.index(start)
        right = html.index(end, left)
        html = html[:left] + replacement + html[right:]

    sub('<style>', '''<script>try{const p=localStorage.getItem("idea-canvas.studio.theme");document.documentElement.dataset.theme=(p==="dark"||((!p||p==="system")&&matchMedia("(prefers-color-scheme:dark)").matches))?"dark":"light"}catch{}</script>
<style>''', count=1)
    sub('</style>\n</head>', (SRC/'workbench.css').read_text()+'</style>\n</head>')
    sub('<div class="more-wrap">','''<button type="button" id="openAI" data-studio="ai" aria-expanded="false" aria-controls="studioSide"><i data-icon="Copilot"></i><span></span></button>
<button type="button" class="plain-icon" id="openHistory" data-studio="history" aria-expanded="false" aria-controls="studioSide"><i data-icon="History"></i></button>
<button type="button" class="plain-icon" id="themeBtn" data-studio="theme"></button><div class="more-wrap">''')
    sub('<label class="language-control">','<label class="theme-setting"><span id="themeText"></span><select id="themeChoice"><option value="system"></option><option value="light"></option><option value="dark"></option></select></label><label class="language-control">')
    sub('<main id="surface"', '<div id="desk"><main id="surface"')
    sub('  </main>\n</div>', '  </main>'+ (SRC/'panel.html').read_text()+'</div>\n</div>')
    sub('<div id="tools" class="board-tools" aria-label="画布工具">','<div id="tools" class="board-tools" aria-label="画布工具"><button type="button" id="handBtn" data-studio="hand" class="pan-tool" aria-pressed="false"><i data-icon="Hand"></i></button>')
    sub('<button type="button" class="example-btn" id="trySample"', '<button type="button" id="inlineAI" data-studio="ask-draft" class="example-btn" hidden></button><button type="button" class="example-btn" id="trySample"')
    sub('<dialog id="dialog"', '''<dialog id="artDialog" aria-labelledby="artTitle"><header class="art-head"><div><h2 id="artTitle"></h2><small id="artMeta"></small></div><button type="button" id="artSource"></button><button type="button" id="artExport"></button><button type="button" id="artClose" class="plain-icon"><i data-icon="X"></i></button></header><div id="artStage"></div></dialog>
<dialog id="dialog"''')
    sub('if(localStorage.getItem("idea-canvas.studio.language")==="zh-CN")language="zh-CN";','const saved=localStorage.getItem("idea-canvas.studio.language");language=saved==="zh-CN"||(!saved&&navigator.language.startsWith("zh"))?"zh-CN":"en";')
    sub('document.addEventListener("DOMContentLoaded",()=>{\nconst $','document.addEventListener("DOMContentLoaded",async()=>{\nconst $')
    sub('const prefix="idea-canvas.studio.v1"', 'let archivePromise;\nconst prefix="idea-canvas.studio.v1"')
    sub('function loadCurrent(){const last=stored(".active",null),b=last&&stored(".board."+last,null);','async function loadCurrent(){const last=stored(".active",null),b=last&&await readBoardRecord(stored(".board."+last,null));')
    sub('let board=loadCurrent()', 'let board=await loadCurrent()')
    sub('let undoStack=[],storageOkay=true','let storageOkay=true')
    section('function checkpoint(){','function showToast(', '')
    section('function persist(b=board){','function scheduleSave()', 'function persist(b=board){return storeStudioBoard(b);}\n')
    section('function undo(){','function clearTransient()', '')
    sub('if(!isBoard(next))return;persist();board=next;undoStack=[];clearTransient();closeDialog();','''next=await readBoardRecord(next);if(!isBoard(next))return;
  haltRequest();await persist();board=next;beginJournal();clearTransient();closeDialog();sourceSignature=threadSignature="";''')
    sub('if(err){undoStack.pop();', 'if(err){pendingAction=null;')
    sub('if(opts.checkpoint!==false)checkpoint();','if(opts.checkpoint!==false)checkpoint("import",files.map(f=>f.name).join(", "));')
    for old,new in [
        ('checkpoint();const sample=', 'checkpoint("add",clipText(text,85));const sample='),
        ('checkpoint();\n  const drafts=', 'checkpoint("branch",titleOf(idea));\n  const drafts='),
        ('checkpoint();\n  board.adopted','checkpoint("adopt",n.letter+" · "+titleOf(n));\n  board.adopted'),
        ('checkpoint();\n  n.requirements','checkpoint("instruction",n.letter+" · "+clipText(text,80));\n  n.requirements'),
        ('checkpoint();const id=uid(),ver=', 'checkpoint("build",titleOf(n));const id=uid(),ver='),
        ('checkpoint();const v=1+', 'checkpoint("release",titleOf(n));const v=1+'),
        ('checkpoint();const feedback=', 'checkpoint("feedback",clipText(text,85));const feedback='),
        ('checkpoint();const err=edge(from,to','checkpoint("link",titleOf(source)+" → "+titleOf(target));const err=edge(from,to'),
        ('checkpoint();const ed=board.edges','checkpoint("role",titleOf(n));const ed=board.edges'),
        ('checkpoint();if(n.type==="direction")','checkpoint("edit",t);if(n.type==="direction")'),
        ('checkpoint();board.title=t;', 'checkpoint("rename",t);board.title=t;'),
        ('checkpoint();writeDraft(n.id,"");board.nodes','checkpoint("remove",titleOf(n));writeDraft(n.id,"");board.nodes'),
        ('if(g.kind==="node")checkpoint();','if(g.kind==="node")checkpoint("move",titleOf(g.node));'),
        ('if(!n)return;checkpoint();board.edges=', 'if(!n)return;checkpoint("unlink",titleOf(n));board.edges='),
    ]: sub(old,new)
    sub('if(target){\n      n.x=g.x;', 'if(target){\n      pendingAction={op:"link",detail:titleOf(n)+" → "+titleOf(target),actor:"user"};n.x=g.x;')
    sub('function fileKind(f){','function fileKind(f){\n  if(/\\.xlsx$/i.test(f.name))return "sheet";')
    sub('async function excerpt(file,kind){','async function excerpt(file,kind){\n  if(kind==="sheet")return sheetExcerpt(file);')
    sub('const fileGlyph={image:', 'const fileGlyph={sheet:"FileText",image:')
    sub('const labels={asset:', 'const labels={artifact:"作品",asset:')
    sub('const glyph={asset:', 'const glyph={artifact:"PanelsTopLeft",asset:')
    sub('return {asset:228,idea:259,', 'return {artifact:300,asset:228,idea:259,')
    sub('const defaults={asset:65,', 'const defaults={artifact:215,asset:65,')
    sub('function bodyHTML(n){','function bodyHTML(n){\n  if(n.type==="artifact")return artifactCard(n);')
    sub('const tag=dir?ui("方向 ")','const tag=n.type==="artifact"?(n.frozen?ui("交付版本"):formatLabel(n.format)):dir?ui("方向 ")')
    sub('if(!n)return {label:board.nodes.length?', '''if(n?.type==="artifact")return {label:draft?choose("交给 AI 编辑","Revise with AI"):choose("打开作品","Open artifact"),place:choose("描述下一版的改动…","Describe the next revision…"),enabled:true};
  if(!n)return {label:board.nodes.length?''')
    sub('ui(pr.cn)+(n?" / "+ui(labels[n.type]):"")','ui(pr.cn)+(n?" / "+(n.type==="artifact"?formatLabel(n.format):ui(labels[n.type])):"")')
    sub('    if(!n||n.type==="asset"){trailShown=false;', '''    if(n?.type==="artifact"){
      if(!text){await inspectArtifact(n);return;}
      if(openPanel!=="ai")openSide("ai");aiIntent=n.frozen?"create":"edit";aiFormat=n.format;$("aiPrompt").value=text;rememberAiDraft();paintControls();await runAI();return;
    }
    if(!n||n.type==="asset"){trailShown=false;''')
    sub('case "help":closeMore();','''case "art-open":await inspectArtifact(n);break;
      case "art-export":await inspectArtifact(n,true);break;
      case "art-release":finalizeArtifact(n);break;
      case "help":closeMore();''')
    sub('["try-direction","preview","inspect","download"].includes(act)','["try-direction","preview","inspect","download","art-open","art-export"].includes(act)')
    sub('  const width=LANE*v.s,empty=!board.nodes.length;','''  const width=LANE*v.s,empty=!board.nodes.length,homeLane=Math.max(278,surface.clientWidth/4),ratio=width/homeLane;
  surface.style.setProperty("--home-lane",homeLane+"px");surface.style.setProperty("--empty-scale",ratio);
  surface.style.setProperty("--ghost-top",(v.y+171*ratio)+"px");''')
    sub('  if(empty){\n    placeComposer();','''  if(empty){
    placeComposer();
    const comp=composer.getBoundingClientRect(),bounds=surface.getBoundingClientRect();
    surface.classList.toggle("show-return",comp.bottom<bounds.top+20||comp.top>bounds.bottom-40||comp.right<bounds.left+30||comp.left>bounds.right-30);''')
    sub('if(!w||!h)return;\n  const rangeX=', '''if(!w||!h)return;
  const ratio=board.cam.s*LANE/Math.max(278,w/4);
  composer.style.transform=(!board.nodes.length&&!board.composer.pos)?"scale("+ratio+")":"";
  const rangeX=''')
    sub('x=board.cam.x+16;y=Math.min(164,Math.max(106,h*.22));','x=board.cam.x+16*ratio;y=board.cam.y+Math.min(164,Math.max(106,h*.22))*ratio;')
    sub('(y+ch+18)+"px"','(y+(ch+18)*ratio)+"px"')
    sub('newScale=clamp(scale,.16,1.9)','newScale=clamp(scale,.05,8)')
    sub('  v.x=x-(x-v.x)*newScale','  board.cameraTouched=true;v.x=x-(x-v.x)*newScale')
    sub('s=clamp(pinch.scale*p.d/pinch.d,.16,1.9);','s=clamp(pinch.scale*p.d/pinch.d,.05,8);board.cameraTouched=true;')
    sub('const scale=clamp(fit(area),.16,1);','const scale=clamp(fit(area),.05,1);')
    sub('if(g.kind==="pan"){board.cam.x=', 'if(g.kind==="pan"){board.cameraTouched=true;board.cam.x=')
    sub('if(e.target.closest("textarea,select,dialog"))return;e.preventDefault();','''if(e.target.closest("select,dialog"))return;
  const field=e.target.closest("textarea");
  if(field&&!e.ctrlKey&&!e.metaKey&&field.scrollHeight>field.clientHeight+1&&((e.deltaY>0&&field.scrollTop+field.clientHeight<field.scrollHeight-1)||(e.deltaY<0&&field.scrollTop>0)))return;
  e.preventDefault();board.cameraTouched=true;''')
    sub('  board.cam={s:lane/LANE,','  board.cameraTouched=false;board.cam={s:lane/LANE,')
    sub('if(!board.nodes.length){emptyOverview(board.stage);lastWidth=w;', 'if(!board.nodes.length){if(!board.cameraTouched)emptyOverview(board.stage);lastWidth=w;')
    sub('case "return":board.composer.pos=null;', 'case "return":if(!board.nodes.length){emptyOverview(0);cameraPaint();}board.composer.pos=null;')
    sub('surface.classList.toggle("pan-mode",handTool);}', 'surface.classList.toggle("pan-mode",handTool);$("handBtn").setAttribute("aria-pressed",String(handTool));}')
    sub('  placeComposer();\n}\nfunction wireHint()', '  placeComposer();studioChrome();\n}\nfunction wireHint()')
    sub('if($("dialog").open||$("viewer").open)return;', 'if(document.querySelector("dialog[open]"))return;')
    sub('e.preventDefault();undo();return;', 'e.preventDefault();if(e.shiftKey)redoChange();else undo();return;')
    sub('if(e.isComposing||e.keyCode===229)return;', 'if(e.isComposing||e.keyCode===229||e.target.closest("#aiForm"))return;')
    section('function help(){','function projects(){','''function help(){
  const lines=language==="en"?["Scroll to pan vertically. Shift-scroll moves sideways. Pinch or ⌘/Ctrl-scroll to zoom at the pointer. Press F to fit the board, or use the hand to pan.",
  "Drop a file on a card to link it. Open Copilot to read this card and its incoming sources. Choose Advise, Create, or Edit. Apply a proposal to place it on the canvas.",
  "History records user requests, model proposals and canvas edits. Undo, redo, or restore any recorded step. Your existing board is the starting point.",
  "The local model reads source excerpts, images and video frames. PDF text uses the first three pages, spreadsheets the first sheet, and audio the first 90 seconds. Preview and export finished artifacts from their cards."]:
  ["滚动或拖动空白处平移。按住 Shift 滚轮横移；双指捏合或按住 ⌘ / Ctrl 滚动，以指针为中心缩放。按 F 找回整张画布。",
  "文件拖到节点上即可连入。打开 AI 助手，选择建议、生成或编辑。默认读取所选节点及上游来源，应用提案后作品会出现在画布上。",
  "历史记录请求、模型提案和画布修改。支持撤销、重做和恢复任一步骤；升级前的画布作为初始状态。",
  "本机模型可读文字节选、图片和视频抽帧。PDF 默认取前三页，表格取首张工作表，语音最多转写前 90 秒。在作品卡上可以预览和导出。"];
  dialog(ui("在画布上工作"),'<ol class="help-list">'+lines.map(l=>"<li>"+esc(l)+"</li>").join("")+"</ol>");
}
''')
    sub('  $("viewStage").replaceChildren(frame);','  $("viewStage").replaceChildren(frame);recordVisit("preview",trial?n.letter+" · "+presentSpec(n.spec).label:n.spec.title+" · v"+n.ver);')
    sub('a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);','a.click();a.remove();recordVisit("download",a.download);setTimeout(()=>URL.revokeObjectURL(url),30000);')
    sub('  $("dialogBody").querySelector("#chooseRef")','''  if(n.turnId){
    const t=board.turns?.find(v=>v.id===n.turnId);
    if(t){const box=$("dialogBody");box.querySelector("p.subtext")?.remove();
      box.insertAdjacentHTML("afterbegin",'<div class="proposal"><strong>'+choose("生成依据","Generation rationale")+'</strong><p>'+esc(t.result?.basis||"")+'</p>'+turnSources(t)+'</div>');}
  }
  $("dialogBody").querySelector("#chooseRef")''')
    sub('  if(board===owning&&opts.draw!==false){render();persist();','''  if(board!==owning&&board.id===owning.id){
    for(const source of created){const current=byId(source.id);if(current?.reading==="正在读取")Object.assign(current,{text:source.text,reading:source.reading,tone:source.tone});}
    render();persist();
  }
  if(board===owning&&opts.draw!==false){render();persist();''')
    sub('btn("directions",ui("试两个方向"),','btn("directions",choose("快速试两个方向","Quick A/B"),')
    sub('if(n.type==="idea")return {label:ui("试两个方向"),','if(n.type==="idea")return {label:choose("快速试两个方向","Quick A/B"),')
    sub('btn("build",ui("生成网页"),','btn("build",choose("快速生成网页","Quick prototype"),')
    sub('board.adopted[n.group]===n.id?ui("生成网页"):useLabel(n)','board.adopted[n.group]===n.id?choose("快速生成网页","Quick prototype"):useLabel(n)')
    sub('<button type="button" class="plain-icon help"','<button type="button" data-studio="ai-example" id="exampleMenu"></button><button type="button" class="plain-icon help"')
    files = ['history.js','context.js','artifacts.js','copilot.js','webgen.js','workbench.js']
    features = '\n'.join((SRC/n).read_text() for n in files).replace('let archivePromise;\nfunction archiveDB','function archiveDB')
    sub('let lastWidth=surface.clientWidth,lastHeight=surface.clientHeight;', features+'\nbeginJournal();setupWorkbench();\nlet lastWidth=surface.clientWidth,lastHeight=surface.clientHeight;')
    sub('if(!board.nodes.length)focusNodes([],0);\nelse if', 'if(!board.nodes.length&&!board.cameraTouched)focusNodes([],0);\nelse if')
    return html
