const formatNames={
  brief:["创意简报","Creative brief"],branches:["两个方向","Two directions"],graphic:["平面设计","Graphic design"],
  video:["视频分镜","Video storyboard"],copy:["文案","Copy"],web:["前端网页","Web prototype"],product:["商业产品方案","Product plan"]
};
const formatLabel=f=>choose(...(formatNames[f]||formatNames.brief));
function artifactText(f,p){
  if(!p)return "";
  if(f==="video")return p.shots.map((s,i)=>(i+1)+". "+s.title+" ("+s.seconds+"s)\n"+s.visual+"\n"+s.caption+"\n"+s.sound).join("\n\n");
  if(f==="branches")return p.directions.map(d=>d.title+"\n"+d.description+"\n"+d.test).join("\n\n");
  return p.content||"";
}
function textPreview(value){
  return String(value).split(/\n+/).map(row=>{
    const line=row.trim();if(!line)return "";
    const rich=v=>esc(v).replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/`([^`]+)`/g,"<code>$1</code>");
    if(/^#{1,6}\s/.test(line))return "<h3>"+rich(line.replace(/^#+\s*/,""))+"</h3>";
    if(/^[-*•]\s/.test(line))return '<p class="doc-bullet">'+rich(line.replace(/^[-*•]\s/,""))+"</p>";
    return "<p>"+rich(line)+"</p>";
  }).join("");
}
function svgDocument(raw,images=new Map()){
  const parser=new DOMParser(),doc=parser.parseFromString(String(raw).trim().replace(/^```(?:svg|xml)?\s*|\s*```$/g,""),"image/svg+xml");
  const root=doc.documentElement;
  if(root.localName!=="svg"||doc.querySelector("parsererror"))throw new Error(choose("图稿未生成完整，可再生成一次。","The artwork is incomplete. Generate it again."));
  const allowed=new Set("svg g defs desc title rect path line circle ellipse polyline polygon text tspan linearGradient radialGradient stop clipPath mask pattern image".split(" "));
  const attr=new Set("xmlns x y dx dy x1 x2 y1 y2 width height d cx cy r rx ry points fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray fill-opacity stroke-opacity opacity viewBox preserveAspectRatio transform gradientTransform gradientUnits offset stop-color stop-opacity font-family font-size font-weight font-style letter-spacing text-anchor dominant-baseline id clip-path mask clipPathUnits patternUnits patternTransform href".split(" "));
  for(const el of [root,...root.querySelectorAll("*")]){
    if(!allowed.has(el.localName)){el.remove();continue;}
    for(const a of [...el.attributes]){
      const value=a.value.trim();
      if(a.localName==="href"){
        const key=value.match(/^studio-image:(S\d+)$/)?.[1],src=key&&images.get(key);
        el.removeAttributeNode(a);if(src&&el.localName==="image")el.setAttribute("href",src);continue;
      }
      if(!attr.has(a.name)||(/url\s*\(/i.test(value)&&!/^url\(#[\w.-]+\)$/.test(value)))el.removeAttributeNode(a);
    }
  }
  root.setAttribute("xmlns","http://www.w3.org/2000/svg");
  if(!root.hasAttribute("viewBox"))root.setAttribute("viewBox","0 0 720 900");
  return new XMLSerializer().serializeToString(root);
}
const artifactCSP="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; media-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'";
function safeWeb(raw,images){
  const html=String(raw).trim().replace(/^```html\s*|\s*```$/g,"");
  const doc=new DOMParser().parseFromString(html,"text/html");
  doc.querySelectorAll("base,meta[http-equiv],iframe,object,embed,link[rel=preload],link[rel=prefetch],script[src]").forEach(el=>el.remove());
  for(const img of doc.querySelectorAll("img")){
    const src=images.get((img.getAttribute("src")||"").replace(/^studio-image:/,""));
    if(src)img.setAttribute("src",src);else if(!/^data:image\//i.test(img.getAttribute("src")||""))img.removeAttribute("src");
    img.removeAttribute("srcset");
  }
  const csp=doc.createElement("meta");csp.httpEquiv="Content-Security-Policy";csp.content=artifactCSP;doc.head.prepend(csp);
  if(!doc.querySelector('meta[name="viewport"]')){const m=doc.createElement("meta");m.name="viewport";m.content="width=device-width,initial-scale=1";doc.head.append(m);}
  return "<!doctype html>\n"+doc.documentElement.outerHTML;
}
function saveFile(name,data,type){
  const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement("a");
  a.href=url;a.download=name.replace(/[\\/:*?"<>|]/g,"-");a.click();setTimeout(()=>URL.revokeObjectURL(url),20000);
}
// This function also runs inside the downloaded storyboard, with no connection to Studio.
function playStoryboard(shots,images,labels){
  const c=document.querySelector("canvas"),ctx=c.getContext("2d"),play=document.querySelector("#play"),seek=document.querySelector("input"),clock=document.querySelector("output"),save=document.querySelector("#record");
  const photos=new Map(),duration=shots.reduce((s,f)=>s+f.seconds,0);
  let frame=0,start=0,t=0,playing=false,recorder,stream;
  Object.entries(images).forEach(([key,src])=>{const img=new Image();img.onload=()=>{photos.set(key,img);draw();};img.src=src;});
  const rows=[...document.querySelectorAll("li")];
  function wrap(text,x,y,width,size,max){
    ctx.font="500 "+size+"px system-ui";let line="",count=0;
    for(const ch of text){if(ctx.measureText(line+ch).width>width&&line){ctx.fillText(line,x,y);y+=size*1.32;line="";if(++count>=max)return;}line+=ch;}
    if(line)ctx.fillText(line,x,y);
  }
  function draw(){
    let from=0,i=0;while(i<shots.length-1&&t>=from+shots[i].seconds)from+=shots[i++].seconds;
    const s=shots[i],p=Math.min(1,(t-from)/s.seconds),w=c.width,h=c.height;
    ctx.fillStyle=s.color;ctx.fillRect(0,0,w,h);
    const img=photos.get(s.image);
    if(img){const z=Math.max(w/img.width,h/img.height)*(s.motion==="push"?1+p*.16:1.12);
      ctx.drawImage(img,(w-img.width*z)*(s.motion==="pan"?p:.5),(h-img.height*z)/2,img.width*z,img.height*z);
    }else{
      ctx.save();ctx.globalAlpha=.3;ctx.strokeStyle="#fff";ctx.lineWidth=3;
      const offset=s.motion==="hold"?0:p*100;for(let j=0;j<7;j++){ctx.beginPath();ctx.arc(w*.76+offset,h*.44,40+j*(51+(s.motion==="push"?p*6:0)),0,Math.PI*2);ctx.stroke();}ctx.restore();
    }
    const grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,"#0004");grad.addColorStop(.55,"#0004");grad.addColorStop(1,"#000d");ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
    ctx.fillStyle="#fff";ctx.font="20px monospace";ctx.fillText(String(i+1).padStart(2,"0")+" / "+String(shots.length).padStart(2,"0"),42,48);
    wrap(s.title,40,h*.63,w*.9,45,2);wrap(s.caption,42,h*.85,w*.9,26,2);
    rows.forEach((el,n)=>el.classList.toggle("on",n===i));seek.value=t;clock.textContent=t.toFixed(1)+" / "+duration.toFixed(1)+" s";
  }
  function stop(){cancelAnimationFrame(frame);playing=false;play.textContent=labels.play;if(recorder?.state==="recording")recorder.stop();}
  function tick(now){t=Math.min(duration,(now-start)/1000);draw();if(t>=duration)stop();else frame=requestAnimationFrame(tick);}
  function go(){if(t>=duration)t=0;start=performance.now()-t*1000;playing=true;play.textContent=labels.pause;frame=requestAnimationFrame(tick);}
  play.onclick=()=>playing?stop():go();seek.max=duration;seek.oninput=()=>{stop();t=Number(seek.value);draw();};
  rows.forEach((el,i)=>el.querySelector("button").onclick=()=>{stop();t=shots.slice(0,i).reduce((a,s)=>a+s.seconds,0);draw();});
  const mime=window.MediaRecorder&&["video/webm;codecs=vp9","video/webm;codecs=vp8","video/mp4","video/webm"].find(m=>MediaRecorder.isTypeSupported(m));
  save.hidden=!(mime&&c.captureStream);save.onclick=()=>{
    stop();t=0;draw();const chunks=[];stream=c.captureStream(25);recorder=new MediaRecorder(stream,{mimeType:mime});
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onstop=()=>{stream.getTracks().forEach(track=>track.stop());save.disabled=false;play.disabled=false;seek.disabled=false;
      const url=URL.createObjectURL(new Blob(chunks,{type:mime})),a=document.createElement("a");a.href=url;a.download=document.title+(mime.includes("mp4")?".mp4":".webm");a.click();setTimeout(()=>URL.revokeObjectURL(url),15000);};
    save.disabled=play.disabled=seek.disabled=true;recorder.start();go();
  };
  draw();
}
function storyboardDoc(p,images){
  const l={play:choose("播放","Play"),pause:choose("暂停","Pause")},json=v=>JSON.stringify(v).replace(/</g,"\\u003c");
  const stills=new Map(images),timed=p.shots.map((s,i)=>{
    if(stills.has(s.image)||!s.layers)return s;
    const key="frame-"+i,svg=svgDocument(layerArtwork(s.layers,s.color,960,540),images);
    stills.set(key,"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg));return {...s,image:key};
  });
  const rows=p.shots.map((s,i)=>'<li><button><b>'+String(i+1).padStart(2,"0")+'</b> '+esc(s.title)+' <small>'+s.seconds+' s</small></button><p>'+esc(s.visual)+'</p><small>'+esc(s.sound)+'</small></li>').join("");
  return '<!doctype html><html lang="'+language+'"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+artifactCSP+'"><title>'+esc(p.title)+'</title><style>*{box-sizing:border-box}body{margin:0 auto;max-width:1000px;background:#18201f;color:#edf2eb;font:15px/1.5 system-ui;padding:20px}h1{font:normal 34px Georgia,serif;margin:0 0 14px}canvas{width:100%;display:block}section{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 0}input{flex:1;min-width:80px}button{background:#dce5d9;color:#18201f;border:0;padding:7px 10px;cursor:pointer}small,output{font:12px monospace}ol{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:10px}li{border-top:1px solid #64716a;padding:8px}li.on{border-top:3px solid #cadd84}li button{background:transparent;color:inherit;text-align:left;padding:0}p{margin:5px 0}</style><h1>'+esc(p.title)+'</h1><canvas width="960" height="540"></canvas><section><button id="play">'+l.play+'</button><input aria-label="'+choose("时间","Time")+'" type="range" min="0" step=".05"><output></output><button id="record">'+choose("导出动态分镜","Export animatic")+'</button></section><ol>'+rows+'</ol><script>('+playStoryboard.toString()+')('+json(timed)+','+json(Object.fromEntries(stills))+','+json(l)+');<\/script></html>';
}
async function imageMap(turn){
  const map=new Map();
  for(const s of turn?.sources||[]){
    if(s.kind!=="image")continue;
    const frames=await visualFrames({id:s.id,kind:"image"},1).catch(()=>[]);
    if(frames[0])map.set(s.key,frames[0].url);
  }
  return map;
}
function artifactCard(n){
  const p=n.payload,kind=n.format;
  let visual="";
  if(kind==="graphic"){
    try{visual='<div class="art-swatch"><img alt="" src="data:image/svg+xml;charset=utf-8,'+esc(encodeURIComponent(svgDocument(p.content)))+'"></div>';}catch{}
  }else if(kind==="video")visual='<div class="art-film">'+p.shots.slice(0,5).map((s,i)=>'<span style="background:'+safeColor(s.color)+'">'+String(i+1).padStart(2,"0")+'</span>').join("")+'</div>';
  const caption=kind==="web"?formatLabel(kind)+" · HTML":kind==="graphic"?formatLabel(kind)+" · SVG":kind==="video"?p.shots.length+choose(" 个镜头"," shots"):clipText((p.content||"").replace(/[#*]/g,""),104);
  return visual+'<div class="card-body"><h3 class="card-title">'+esc(n.title)+'</h3><p class="card-caption">'+esc(caption)+'</p><p class="node-detail">'+(n.frozen?choose("定版","Release"):formatLabel(kind))+' · v'+n.ver+'</p></div><div class="card-foot">'+linkedBtn(n)+btn("art-open",choose("打开","Open"),"Eye","primary-link")+(n.frozen?btn("art-export",choose("导出","Export"),"Download"):btn("art-release",choose("定版","Finalize"),"PackageCheck"))+'</div>';
}
function safeColor(value){return /^#[a-f\d]{6}$/i.test(value)?value:"#45554b";}
function finalizeArtifact(n){
  if(n.frozen)return;
  const previous=board.nodes.find(v=>v.frozen&&v.source===n.id&&v.ver===n.ver);
  if(previous){finish(previous,[previous]);return;}
  checkpoint("release",n.title);
  const r=newNode("artifact",3,{title:n.title,format:n.format,payload:structuredClone(n.payload),ver:n.ver,frozen:true,source:n.id,turnId:n.turnId,sourceList:structuredClone(n.sourceList||[])});
  edge(n.id,r.id,"release");finish(r,[r]);
}
let artView=null;
async function inspectArtifact(n,exportOnly=false){
  const p=n.payload,f=n.format,images=await imageMap({sources:n.sourceList}),doc=f==="web"?safeWeb(p.content,images):f==="video"?storyboardDoc(p,images):"",svg=f==="graphic"?svgDocument(p.content,images):"";
  const raw=svg||doc||p.content,ext=svg?"svg":doc?"html":"md",mime=svg?"image/svg+xml":doc?"text/html":"text/markdown";
  const exportFile=()=>{saveFile(n.title+"-v"+n.ver+"."+ext,raw,mime);recordVisit("download",n.title+" · v"+n.ver+" ."+ext);};
  if(exportOnly){exportFile();return;}
  artView=n.id;const win=$("artDialog"),stage=$("artStage");
  $("artTitle").textContent=n.title;$("artMeta").textContent=formatLabel(f)+" · v"+n.ver;
  $("artExport").textContent=choose("导出","Export")+" ."+ext;$("artExport").onclick=exportFile;
  $("artSource").textContent=choose("查看源内容","View source");$("artSource").hidden=!doc&&!svg;
  $("artClose").ariaLabel=choose("关闭","Close");
  let showSource=false;
  const draw=()=>{
    stage.replaceChildren();
    if(showSource){const pre=document.createElement("pre");pre.textContent=artifactText(f,p);stage.append(pre);}
    else if(doc){const frame=document.createElement("iframe");frame.title=n.title;frame.setAttribute("sandbox","allow-scripts allow-forms allow-downloads");frame.srcdoc=doc;stage.append(frame);}
    else if(svg){const img=new Image();img.alt=n.title;img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg);stage.append(img);}
    else stage.innerHTML='<article class="doc">'+textPreview(raw)+'</article>';
  };
  $("artSource").onclick=()=>{showSource=!showSource;$("artSource").textContent=showSource?choose("查看预览","Preview"):choose("查看源内容","View source");draw();};
  draw();if(!win.open)win.showModal();recordVisit("preview",n.title+" · v"+n.ver);
}
function layerArtwork(layers,background,w,h){
  const ctx=document.createElement("canvas").getContext("2d");
  const parts=['<rect width="'+w+'" height="'+h+'" fill="'+safeColor(background)+'"/>'];
  for(const l of layers||[]){
    const x=clamp(l.x,0,100)*w/100,y=clamp(l.y,0,100)*h/100,bw=Math.max(1,Math.min(w-x,l.w*w/100)),bh=Math.max(1,Math.min(h-y,l.h*h/100)),color=safeColor(l.ink),value=String(l.value||"");
    if(l.kind==="block"||l.kind==="rule")parts.push('<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+(l.kind==="rule"?Math.min(5,bh):bh)+'" fill="'+color+'"/>');
    else if(l.kind==="ellipse")parts.push('<ellipse cx="'+(x+bw/2)+'" cy="'+(y+bh/2)+'" rx="'+bw/2+'" ry="'+bh/2+'" fill="'+color+'"/>');
    else if(l.kind==="photo"&&/^S\d+$/.test(value))parts.push('<image href="studio-image:'+value+'" x="'+x+'" y="'+y+'" width="'+bw+'" height="'+bh+'" preserveAspectRatio="xMidYMid slice"/>');
    else if(l.kind==="path"&&/^[ MmLlHhVvCcSsQqTtAaZz\d.,+\-e\s]+$/.test(value))parts.push('<path transform="translate('+x+' '+y+') scale('+bw/100+' '+bh/100+')" d="'+esc(value)+'" fill="'+color+'"/>');
    else if(["headline","copy","label"].includes(l.kind)){
      const family=l.kind==="headline"?"Georgia, serif":l.kind==="label"?"monospace":"Arial, sans-serif";
      let size=Math.max(8,Math.min(l.kind==="headline"?160:l.kind==="label"?30:58,bh*.83)),lines;
      for(let attempt=0;attempt<18;attempt++){
        ctx.font=size+"px "+family;lines=[""];
        // Preserve whole Latin words while permitting natural CJK line breaks.
        for(const token of value.match(/[^\S\n]+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}]+|[^\s]|\n/gu)||[]){
          const last=lines.length-1;
          if(token==="\n"){lines.push("");continue;}
          if(lines[last]&&ctx.measureText(lines[last]+token).width>bw){lines.push(token.trimStart());}else lines[last]+=token;
        }
        if((lines.length*size*1.13<=bh&&lines.every(v=>ctx.measureText(v).width<=bw+1))||size<=8)break;
        size*=.88;
      }
      parts.push('<text fill="'+color+'" font-family="'+family+'" font-size="'+size.toFixed(1)+'">'+lines.map((line,i)=>'<tspan x="'+x+'" y="'+(y+size*(.9+i*1.13))+'">'+esc(line.trim())+'</tspan>').join("")+'</text>');
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'">'+parts.join("")+'</svg>';
}
function rgbLuma(hex){
  const values=hex.match(/[\da-f]{2}/gi).map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  return values[0]*.2126+values[1]*.7152+values[2]*.0722;
}
function posterInk(bg,pref){
  const a=rgbLuma(bg),b=rgbLuma(pref);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>4.5?pref:a>.28?"#17211c":"#f4f0e3";
}
function posterCopy(text,x,y,w,h,initial,family,ink,weight){
  const ctx=document.createElement("canvas").getContext("2d"),tokens=String(text).trim().match(/[\p{Script=Han}]|[\p{Script=Latin}\p{N}]+|[^\s]|\s+/gu)||[];
  let size=initial,lines=[];
  for(let attempt=0;attempt<40;attempt++){
    ctx.font=weight+" "+size+"px "+family;lines=[""];
    for(const token of tokens){
      const i=lines.length-1;
      if(token.includes("\n")){lines.push("");continue;}
      if(lines[i]&&ctx.measureText(lines[i]+token).width>w){lines.push(token.trimStart());}else lines[i]+=token;
    }
    if(lines.length*size*1.075<=h&&lines.every(v=>ctx.measureText(v.trim()).width<=w))break;
    size*=.93;
  }
  return '<text fill="'+ink+'" font-family="'+family+'" font-size="'+size.toFixed(1)+'" font-weight="'+weight+'">'+lines.map((s,i)=>'<tspan x="'+x+'" y="'+(y+size*(.86+1.075*i)).toFixed(1)+'">'+esc(s.trim())+'</tspan>').join("")+'</text>';
}
function posterArtwork(p){
  const w=720,h=900,bg=safeColor(p.background),ink=posterInk(bg,safeColor(p.ink)),accent=safeColor(p.accent),edge=safeColor(p.edge);
  const family=p.typography==="serif"?"Georgia, serif":p.typography==="mono"?"monospace":"Arial, sans-serif";
  const side=p.layout==="split-column",bottom=p.layout==="bottom-title";
  const box=side?{x:365,y:101,w:313,h:618}:bottom?{x:40,y:94,w:640,h:420}:{x:40,y:330,w:640,h:400};
  const titleBox=side?[40,121,300,400,85]:bottom?[40,548,640,185,113]:[40,101,640,205,119];
  const bx=box.x,by=box.y,bw=box.w,bh=box.h;
  let shape="";
  if(p.motif==="plate"){
    shape='<g transform="rotate(-17 50 50)"><ellipse cx="49" cy="58" rx="62" ry="32" fill="'+edge+'"/><ellipse cx="47" cy="55.8" rx="63" ry="32" fill="url(#metal)"/><path d="M-8 72 Q46 106 105 54" fill="none" stroke="'+edge+'" stroke-width=".65"/></g>';
  }else if(p.motif==="fold"){
    shape='<path d="M-8 85 32 6 59 67 109 16 79 102z" fill="url(#metal)"/><path d="M32 6 59 67 22 92z" fill="'+edge+'" opacity=".78"/><path d="m59 67 50-51" stroke="'+ink+'" stroke-width=".7"/>';
  }else if(p.motif==="orbit"){
    shape='<ellipse cx="58" cy="54" rx="47" ry="36" fill="url(#metal)"/>'+Array.from({length:6},(_,i)=>'<ellipse cx="53" cy="50" rx="'+(25+i*6)+'" ry="'+(9+i*2)+'" transform="rotate(-29 53 50)" fill="none" stroke="'+edge+'" stroke-width="'+(i===2?.65:.23)+'"/>').join("");
  }else if(p.motif==="contour"){
    shape=Array.from({length:21},(_,i)=>'<path d="M-12 '+(83+i*1.5)+' C19 '+(80-i*2.2)+' 22 '+(3+i*.5)+' 50 '+(20+i*1.9)+' S91 '+(117-i*2)+' 111 '+(28+i*1.4)+'" fill="none" stroke="'+(i%6===0?edge:accent)+'" stroke-width="'+(i%6===0?.65:1.35)+'"/>').join("");
  }else{
    shape=Array.from({length:9},(_,i)=>'<path d="M'+(i*12-6)+' 104 l20 -'+(42+(i*17)%51)+' 6 -3 -19 '+(45+(i*17)%51)+'z" fill="'+(i%3===1?edge:accent)+'"/>').join("");
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 900" width="720" height="900"><defs><clipPath id="crop"><rect x="'+bx+'" y="'+by+'" width="'+bw+'" height="'+bh+'"/></clipPath><linearGradient id="metal" x1="0%" y1="0%" x2="92%" y2="69%"><stop offset="0" stop-color="'+accent+'"/><stop offset=".58" stop-color="'+accent+'"/><stop offset=".90" stop-color="'+edge+'"/><stop offset="1" stop-color="'+accent+'"/></linearGradient></defs><rect width="'+w+'" height="'+h+'" fill="'+bg+'"/>'+
    posterCopy(p.kicker,40,39,640,23,16,"monospace",ink,500)+'<path d="M40 77H680 M40 763H680" stroke="'+ink+'" opacity=".45"/>'+
    '<g clip-path="url(#crop)"><rect x="'+bx+'" y="'+by+'" width="'+bw+'" height="'+bh+'" fill="'+ink+'" opacity=".075"/><g transform="translate('+bx+' '+by+') scale('+bw/100+' '+bh/100+')">'+shape+'</g>'+
    (/^S\d+$/.test(p.image)?'<image href="studio-image:'+p.image+'" x="'+bx+'" y="'+by+'" width="'+bw+'" height="'+bh+'" preserveAspectRatio="xMidYMid slice"/>':'')+'</g>'+
    posterCopy(p.headline||p.title,...titleBox,family,ink,p.typography==="serif"?500:650)+posterCopy(p.caption,40,792,603,77,26,"Arial, sans-serif",ink,400)+'</svg>';
}
