const ENGINE_URL="http://127.0.0.1:59631";
const MODEL="Qwen3-VL-4B-Instruct";
const excludedSources=new Set();
function reachableContext(target,whole){
  if(whole||!target)return [...board.nodes].reverse();
  const nodes=[],seen=new Set(),queue=[target];
  for(let i=0;i<queue.length;i++){
    const node=queue[i];if(!node||seen.has(node.id))continue;
    seen.add(node.id);nodes.push(node);
    for(const edge of incoming(node))queue.push(byId(edge.from));
  }
  return nodes;
}
function sourceText(n){
  if(n.type==="asset")return n.text||"";
  if(n.type==="idea")return n.text;
  if(n.type==="direction")return [directionDesc(n),n.pageIntro,...(n.requirements||[])].filter(Boolean).join("\n");
  if(n.type==="artifact")return artifactText(n.format,n.payload);
  const spec=n.spec;
  return spec?[spec.subtitle,...spec.items.map(i=>i.title+" — "+i.text),...(spec.refs||[]).map(r=>r.name)].join("\n"):"";
}
function stamp(n){return n?JSON.stringify([titleOf(n),sourceText(n),n.mode,n.payload,n.requirements]):"";}
function parseTable(text,delimiter){
  const rows=[];let row=[],cell="",quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===delimiter&&!quoted){row.push(cell.trim());cell="";}
    else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell="";}
    else cell+=c;
  }
  row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows;
}
function tableDigest(text,name){
  const rows=parseTable(text,text.split("\n")[0].includes("\t")?"\t":",");
  if(rows.length<2)return text;
  const [header,...data]=rows;
  const ranges=header.map((h,col)=>{
    const cells=data.map(r=>r[col]||"").filter(Boolean);
    if(!cells.length||!cells.every(s=>/^-?[\d,]+(?:\.\d+)?%?$/.test(s)))return "";
    const nums=cells.map(s=>Number(s.replace(/[,%]/g,""))).filter(Number.isFinite);
    if(!nums.length)return "";
    return h+" min="+Math.min(...nums)+" max="+Math.max(...nums)+" sum="+Number(nums.reduce((a,b)=>a+b,0).toFixed(4))+" mean="+(nums.reduce((a,b)=>a+b,0)/nums.length).toFixed(2)+(cells[0].endsWith("%")?" (%)":"");
  }).filter(Boolean);
  return ["File: "+name,"Parsed rows in excerpt: "+data.length,"Columns: "+header.join(" | "),ranges.join("; "),
    ...data.slice(0,10).map(r=>r.join(" | "))].filter(Boolean).join("\n");
}
async function sheetExcerpt(blob){
  try{
    const zip=await (await zipLib()).loadAsync(blob),parse=txt=>new DOMParser().parseFromString(txt,"application/xml");
    const strings=zip.file("xl/sharedStrings.xml"),ss=strings?[...parse(await strings.async("string")).getElementsByTagNameNS("*","si")].map(x=>x.textContent):[];
    const sheet=Object.keys(zip.files).filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))[0];
    if(!sheet)return {text:"",reading:choose("空工作表","Empty sheet")};
    const rows=[...parse(await zip.file(sheet).async("string")).getElementsByTagNameNS("*","row")].slice(0,201);
    const lines=rows.map(row=>{
      const values=[];
      for(const cell of row.getElementsByTagNameNS("*","c")){
        const address=(cell.getAttribute("r")||"").match(/^[A-Z]+/);
        let col=0;for(const ch of address?.[0]||"A")col=col*26+ch.charCodeAt(0)-64;
        if(col>80)continue;
        const type=cell.getAttribute("t"),v=cell.getElementsByTagNameNS("*","v")[0]?.textContent||"";
        values[col-1]=(type==="s"?ss[Number(v)]:type==="inlineStr"?cell.getElementsByTagNameNS("*","is")[0]?.textContent:v)||"";
      }
      return values.map(v=>v.replace(/[\t\n]/g," ")).join("\t");
    });
    return {text:lines.join("\n").slice(0,30000),reading:choose("首张工作表 · 最多 200 行","First sheet · up to 200 rows")};
  }catch{return {text:"",reading:choose("未能读取工作表","Sheet unavailable")};}
}
function jpgFrame(source,width,height){
  const scale=Math.min(1,768/Math.max(width,height)),c=document.createElement("canvas");
  c.width=Math.max(1,Math.round(width*scale));c.height=Math.max(1,Math.round(height*scale));
  const ctx=c.getContext("2d");ctx.fillStyle="#f4f2eb";ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(source,0,0,c.width,c.height);
  return c.toDataURL("image/jpeg",.76);
}
function waitMedia(el,event,trigger){
  return new Promise((resolve,reject)=>{
    const clean=()=>{clearTimeout(timer);el.removeEventListener(event,ok);el.removeEventListener("error",bad);};
    const ok=()=>{clean();resolve();},bad=()=>{clean();reject(new Error("media unavailable"));};
    const timer=setTimeout(bad,8000);el.addEventListener(event,ok);el.addEventListener("error",bad);trigger();
  });
}
async function visualFrames(n,limit){
  const blob=await findBlob(n.id);if(!blob||!limit)return [];
  if(n.kind==="pdf"){
    const lib=await pdfLib(),doc=await lib.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,useWorkerFetch:false}).promise;
    try{const page=await doc.getPage(1),base=page.getViewport({scale:1}),view=page.getViewport({scale:768/Math.max(base.width,base.height)}),c=document.createElement("canvas");c.width=Math.ceil(view.width);c.height=Math.ceil(view.height);
      await page.render({canvasContext:c.getContext("2d"),viewport:view}).promise;
      return [{url:c.toDataURL("image/jpeg",.75),label:"page 1"}];}finally{await doc.destroy();}
  }
  const url=URL.createObjectURL(blob);
  try{
    if(n.kind==="image"){
      const img=new Image();await waitMedia(img,"load",()=>{img.src=url;});
      return [{url:jpgFrame(img,img.naturalWidth,img.naturalHeight),label:"image"}];
    }
    const video=document.createElement("video");video.muted=true;video.playsInline=true;video.preload="auto";
    try{await waitMedia(video,"loadeddata",()=>{video.src=url;});
      if(!Number.isFinite(video.duration)){
        // Browser-recorded WebM may omit its duration. A seek to the end resolves the seekable range.
        try{await waitMedia(video,"seeked",()=>{video.currentTime=1e7;});}catch{}
      }
      const frames=[],duration=Number.isFinite(video.duration)?video.duration:(video.seekable.length?video.seekable.end(video.seekable.length-1):0);
      for(const frac of (duration>0?[.15,.52,.85]:[0]).slice(0,limit)){
        const at=duration*frac;if(at>0.01)await waitMedia(video,"seeked",()=>{video.currentTime=at;});
        frames.push({url:jpgFrame(video,video.videoWidth,video.videoHeight),label:at.toFixed(1)+"s"});
      }
      return frames;
    }finally{video.removeAttribute("src");video.load();}
  }finally{URL.revokeObjectURL(url);}
}
async function transcribeAudio(n,signal){
  const blob=await findBlob(n.id);if(!blob)throw new Error("missing");
  const ctx=new AudioContext();let decoded;
  try{decoded=await ctx.decodeAudioData(await blob.arrayBuffer());}finally{await ctx.close();}
  const seconds=Math.min(decoded.duration,90),length=Math.max(1,Math.ceil(seconds*16000));
  const offline=new OfflineAudioContext(1,length,16000),node=offline.createBufferSource();
  node.buffer=decoded;node.connect(offline.destination);node.start();const samples=(await offline.startRendering()).getChannelData(0);
  const data=new ArrayBuffer(44+samples.length*2),view=new DataView(data);
  function word(off,s){for(let i=0;i<s.length;i++)view.setUint8(off+i,s.charCodeAt(i));}
  word(0,"RIFF");view.setUint32(4,data.byteLength-8,true);word(8,"WAVE");word(12,"fmt ");view.setUint32(16,16,true);
  view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);
  view.setUint16(32,2,true);view.setUint16(34,16,true);word(36,"data");view.setUint32(40,samples.length*2,true);
  samples.forEach((v,i)=>view.setInt16(44+i*2,Math.max(-1,Math.min(1,v))*32767,true));
  const res=await fetch(ENGINE_URL+"/studio/transcribe",{method:"POST",headers:{"Content-Type":"audio/wav","X-Studio-Client":"canvas"},body:data,signal});
  if(!res.ok)throw new Error("speech unavailable");
  return (await res.json()).text;
}
async function collectSources(nodes,signal){
  const sources=[],pictures=[];let budget=13300,visualBudget=4;
  for(const n of nodes){
    signal.throwIfAborted();
    if(assetTasks.has(n.id))await assetTasks.get(n.id);
    const key="S"+(sources.length+1);let content=sourceText(n),read="";
    if(n.type==="asset"){
      if(/\.(csv|tsv|xlsx)$/i.test(n.name))content=tableDigest(content,n.name);
      if(n.kind==="audio"){
        try{content=await transcribeAudio(n,signal);read=choose("前 90 秒语音转写","First 90s of speech");}
        catch{read=choose("语音未能转写","Speech unavailable");}
      }
      if(["image","video"].includes(n.kind)||(n.kind==="pdf"&&!content.trim())){
        try{const frames=await visualFrames(n,visualBudget);
          for(const f of frames)pictures.push({key,label:f.label,url:f.url});
          visualBudget-=frames.length;read=frames.length?choose("已读画面 × ","Frames read × ")+frames.length:choose("仅文件信息","Metadata only");
        }catch{read=choose("画面未能读取","Image unavailable");}
      }
    }
    const limit=Math.max(0,Math.min(n===nodes[0]&&n.type==="artifact"?9200:n===nodes[0]?5600:2400,budget));
    const excerpt=String(content||"").slice(0,limit);
    budget-=excerpt.length;
    sources.push({key,id:n.id,title:titleOf(n),type:n.type,kind:n.kind||n.format||n.type,
      excerpt,read:(read||(excerpt?choose("文字节选","Text excerpt"):choose("仅文件信息","Metadata only")))+(String(content||"").length>limit?choose(" · 已截取"," · truncated"):""),
      ...(n.type==="direction"?{direction:n.letter,adopted:board.adopted[n.group]===n.id}:{})});
  }
  return {sources,pictures};
}
