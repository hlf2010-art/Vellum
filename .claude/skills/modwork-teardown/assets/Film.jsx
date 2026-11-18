import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import {makeStage,DURATION} from './film-scene.js';
import {CUT_START,gearName,fitResult,hasFittedView,isHeadband,sources} from './fit-result.js';
import {snapshot} from './snapshot-api.js';

// The start follows the edit; the landing shows the finished action on a single click.
const chapters=[
  {label:'佩戴',start:0,land:0},
  {label:'分离',start:4.4,land:8},
  {label:'剖切',start:CUT_START,land:14},
  {label:'测量',start:16.8,land:19}
];
const neutral=()=>({yaw:0,pitch:0,zoom:1,panX:0,panY:0});
const bound=(n,a,b)=>Math.max(a,Math.min(b,n));
const clock=t=>String(Math.floor(t)).padStart(2,'0');
const chapter=t=>chapters.reduce((a,c,i)=>t>=c.start?i:a,0);
const scenes=[
  [null,'从佩戴到剖切，沿着护具边缘看它如何贴合身体。'],
  ['离开体表','护具抬起，留在体表的线框标出原位。'],
  ['切开表层','护具复位后，剖切面扫过身体。两条截线分别描出身体和护具的轮廓。']
];
function GearSelect({id,onSelect}){
  return <label className="film-select"><span>观察对象</span><select aria-label="导览护具" value={id} onChange={e=>onSelect(e.target.value)}>{snapshot.gears.map(g=><option key={g.id} value={g.id} title={g.id}>{gearName(g.id)}</option>)}</select></label>;
}
export function Film({gear,onSelect,onInspect,initialPlayback,inspectButton}){
  const canvas=useRef(null),diagram=useRef(null),figure=useRef(null),drag=useRef(null),stage=useRef(null);
  const time=useRef(initialPlayback.time),playing=useRef(initialPlayback.playing);
  const [now,setNow]=useState(time.current),[running,setRunning]=useState(playing.current),[error,setError]=useState('');
  const gallery=useRef(false),[immersive,setImmersive]=useState(false);
  const camera=useRef(initialPlayback.camera||neutral()),pointers=useRef(new Map()),surface=useRef(null);
  const [manual,setManual]=useState(Boolean(initialPlayback.camera&&Object.keys(neutral()).some(k=>initialPlayback.camera[k]!==neutral()[k])));
  const mark=useRef(null),liftGuide=useRef(null);
  const fit=hasFittedView(gear)?gear.fit:null;
  const result=useMemo(()=>fitResult(fit),[fit]);
  const step=chapter(now),measuring=step===3;
  const headband=isHeadband(snapshot,gear);
  const geometryLabel=step<2||!hasFittedView(gear)?'原始发带':'贴合结果';
  const seamNote=gear.maxSeamGapMm>=.1?'贴合后接缝两侧顶点最大错位 '+gear.maxSeamGapMm.toFixed(1)+' mm。':'';
  const setPlay=v=>{playing.current=v;setRunning(v);};
  const inspect=()=>onInspect({time:time.current,playing:playing.current,camera:{...camera.current}});
  function draw(t){
    time.current=Math.max(0,Math.min(DURATION,t));
    const view=stage.current?.render(time.current,camera.current,gallery.current);
    if(view){
      if(figure.current){figure.current.dataset.traced=String(view.hasSection);figure.current.dataset.shared=String(view.shared);}
      if(mark.current){const pt=view.mark;mark.current.style.opacity=pt?Math.max(0,Math.min(1,(time.current-15.3)/1.35)):0;
        if(pt)mark.current.setAttribute('transform','translate('+pt[0]+' '+pt[1]+')');}
      if(liftGuide.current){const [x,y]=view.origin,[xx,yy]=view.raised;
        liftGuide.current.style.opacity=view.lift*.72;
        liftGuide.current.setAttribute('d','M '+x+' '+y+' L '+xx+' '+yy);}
    }
    setNow(time.current);
  }
  function seek(t){setPlay(false);draw(t);}
  function toggle(){if(playing.current){setPlay(false);return;}if(time.current>=DURATION)draw(0);setPlay(true);}
  function changeCamera(yaw=0,pitch=0,factor=1,x=0,y=0){
    setPlay(false);const c=camera.current;
    camera.current={yaw:(c.yaw+yaw)%(Math.PI*2),pitch:bound(c.pitch+pitch,-1.42,1.42),zoom:bound(c.zoom*factor,.52,3.8),panX:bound(c.panX+x,-1.7,1.7),panY:bound(c.panY+y,-1.7,1.7)};
    setManual(true);draw(time.current);
  }
  function showGallery(value){gallery.current=value;setImmersive(value);}
  useLayoutEffect(()=>{draw(time.current);if(!immersive)return;
    const escape=e=>{if(e.key==='Escape')showGallery(false);};document.addEventListener('keydown',escape);return ()=>document.removeEventListener('keydown',escape);
  },[immersive]);
  function resetCamera(){camera.current=neutral();setManual(false);draw(time.current);}
  function jump(t){resetCamera();seek(t);}
  function gesture(){const a=[...pointers.current.values()];if(!a.length)return null;
    if(a.length===1)return {...a[0],n:1};const [p,q]=a;return {n:2,x:(p.x+q.x)/2,y:(p.y+q.y)/2,d:Math.hypot(p.x-q.x,p.y-q.y)};}
  function down(e){
    if(error||e.target.closest('button')||e.button>2)return;
    e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);setPlay(false);
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY,pan:e.shiftKey||e.button===2||e.button===1});drag.current=gesture();
  }
  function move(e){const map=pointers.current;if(!map.has(e.pointerId))return;
    const before=drag.current;map.set(e.pointerId,{...map.get(e.pointerId),x:e.clientX,y:e.clientY});const next=gesture();drag.current=next;
    if(!before||before.n!==next.n)return;const dx=next.x-before.x,dy=next.y-before.y;
    const z=1.8/(Math.max(160,surface.current.clientHeight)*camera.current.zoom);
    if(next.n===2||next.pan)changeCamera(0,0,next.n===2?next.d/Math.max(1,before.d):1,-dx*z,dy*z);else changeCamera(-dx*.008,dy*.006);}
  function up(e){pointers.current.delete(e.pointerId);drag.current=gesture();}
  function keys(e){if(e.target!==surface.current)return;
    const actions={ArrowLeft:()=>changeCamera(-.12),ArrowRight:()=>changeCamera(.12),ArrowUp:()=>changeCamera(0,.1),ArrowDown:()=>changeCamera(0,-.1),
      '+':()=>changeCamera(0,0,1.13),'=':()=>changeCamera(0,0,1.13),'-':()=>changeCamera(0,0,1/1.13),Home:resetCamera,' ':toggle};
    if(actions[e.key]){e.preventDefault();actions[e.key]();}}
  useLayoutEffect(()=>{const el=surface.current;const wheel=e=>{if(error)return;e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?el.clientHeight:1);changeCamera(0,0,Math.exp(-bound(delta,-300,300)*.0015));};
    el.addEventListener('wheel',wheel,{passive:false});return ()=>el.removeEventListener('wheel',wheel);},[error]);
  useLayoutEffect(()=>{
    let raf,last=null;
    setError('');
    try{stage.current=makeStage(canvas.current,diagram.current,snapshot,gear);}
    catch(e){setError(e.message);setPlay(false);return;}
    draw(time.current);
    function tick(ts){
      if(playing.current && !document.hidden){
        const delta=last===null?0:(ts-last)/1000;
        draw(time.current+Math.min(.12,delta));
        if(time.current>=DURATION)setPlay(false);
      }
      last=ts;raf=requestAnimationFrame(tick);
    }
    const observer=new ResizeObserver(()=>draw(time.current));observer.observe(canvas.current);observer.observe(diagram.current);
    // Frame-accurate capture uses the same public state changes as the transport.
    window.modworkFilm={seek,duration:DURATION,get time(){return time.current;}};
    const hide=()=>{last=null;};
    document.addEventListener('visibilitychange',hide);
    raf=requestAnimationFrame(tick);
    return ()=>{cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('visibilitychange',hide);
      delete window.modworkFilm;stage.current?.dispose();stage.current=null;};
  },[gear]);
  // On a direct jump the diagram may just have become visible; draw in its new layout before paint.
  useLayoutEffect(()=>{draw(time.current);},[step]);
  return <section className="film" data-immersive={immersive} aria-label="护具拆解导览">
    <div className="film-top"><div className="film-brand"><img src={snapshot.logo} alt=""/>MOD WORK<span>物件研究</span></div>
      <div className="film-tools"><GearSelect id={gear.id} onSelect={onSelect}/><button ref={inspectButton} className="inspect-link" onClick={inspect}>自由复查 <span aria-hidden="true">→</span></button></div></div>
    <div className="film-set">
      <div className="film-visual" ref={surface} tabIndex={0} role="group" aria-label="三维展台：拖动旋转，滚轮缩放，按住 Shift 拖动平移。键盘方向键旋转，加减号缩放，Home 复位。"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
        onContextMenu={e=>e.preventDefault()} onDoubleClick={e=>{if(!e.target.closest('button'))resetCamera();}} onKeyDown={keys}>
        <canvas ref={canvas} role="img" aria-label="当前护具与身体的三维剖析"/>
        <svg className="film-overlay" aria-hidden="true"><path ref={liftGuide} className="lift-guide"/>
          <g ref={mark} className="film-mark"><circle r="14"/><circle r="3" className="pin-center"/><path d="M 11 -9 l 25 -23 h 24"/></g></svg>
        <div className="stage-caption"><span className="desktop-hint">拖动旋转　·　滚轮缩放　·　Shift 平移</span><span className="touch-hint">拖动旋转 · 双指缩放</span>
          <button aria-pressed={immersive} onClick={()=>showGallery(!immersive)}>{immersive?'显示导览':'纯画面'}</button>
          {immersive&&<button onClick={toggle}>{running?'暂停':now>=DURATION?'重播':'播放'}</button>}
          {manual&&<button onClick={resetCamera} onPointerDown={e=>e.stopPropagation()}>视角复位</button>}</div>
        {error && <div className="film-error" role="alert">{error}<button onClick={inspect}>查看复查数据</button></div>}
      </div>
      <div className="film-copy" data-measure={measuring} data-level={measuring?result.level:undefined}>
        <div className="film-sub"><span className="phase-dash"/> {measuring?'静态贴合判定':headband?geometryLabel:chapters[step].label} <b>/</b> {snapshot.player||gear.id}</div>
        {measuring?<><h1>{result.title}</h1>
          <h2 className="result-reason">{fit?result.reason:hasFittedView(gear)?'未记录单件贴合结果':'仅有原始几何'}</h2>
          {fit&&<p className="result-source">数据来源：{sources[fit.heatSource]||fit.heatSource||'来源未记录'}</p>}
          <p className="result-evidence">{fit?result.surface:'这份快照可查看几何，无法确认贴合风险。'}</p>
          {fit&&<dl className="result-metrics"><dt>嵌入顶点 / 受检</dt><dd>{result.vertices}</dd>
            <dt>顶点最小有向距离</dt><dd>{result.distance}</dd></dl>}
          {fit&&<p className="result-note">{gear.focusVertex?'圆点标出最深嵌入顶点。':fit.surface?.inside>0&&fit.embedded===0?'未记录面边穿入位置。':''}
            {fit.calibrated===false&&<span>身体未标定。</span>}{seamNote&&<span>{seamNote}</span>}</p>}</>:
          <><h1>{step===0?<>{snapshot.part==='head'&&gear.id.startsWith('headband')?'纤维场':(snapshot.gearLabel||'护具')+'剖析'}</>:scenes[step][0]}</h1>{step===0&&<div className="film-edition">{snapshot.gearLabel||'护具'}贴合研究 <i>/</i> 材质演绎</div>}<p>{headband&&step===2&&seamNote?'剖切显示贴合后的实际网格。'+seamNote:scenes[step][1]}</p></>}
        <figure ref={figure} className="section-readout" data-active={step>=2}>
          <figcaption>实时截线 <span><i/>身体 <i/>护具</span></figcaption>
          <canvas ref={diagram} aria-label="身体和护具在当前剖切平面上的真实截线"/>
          <p className="section-empty" role="status">这件护具与身体没有共同截面，无法绘制截线。</p>
        </figure>
        {!measuring&&<div className="film-stat"><span>{step===1?'显示状态':step===2?'剖切对象':'当前配件'}</span>
          <strong className="film-asset">{step===1?'分离示意':step===2?'身体表层':gearName(gear.id)}</strong></div>}
      </div>
    </div>
    <div className="film-transport"><button className="film-play" onClick={toggle} disabled={!!error} aria-label={running?'暂停导览':now>=DURATION?'重播导览':'播放导览'}>{running?'Ⅱ':now>=DURATION?'↺':'▶'}</button>
      <div className="timeline"><div className="film-chapters">{chapters.map(({label,land},i)=><button key={label} aria-current={step===i?'step':undefined} onClick={()=>jump(land)}><i aria-hidden="true">0{i+1}</i>{label}</button>)}</div>
        <input aria-label="导览进度" aria-valuetext={chapters[step].label+'，'+Math.floor(now)+' 秒，共 '+DURATION+' 秒'} type="range" min="0" max={DURATION} step=".01" value={now}
          onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();seek(time.current+(e.key==='ArrowRight'?1:-1));}}}
          onChange={e=>seek(+e.target.value)} style={{'--played':(100*now/DURATION)+'%'}}/></div>
      <output className="film-clock">00:{clock(now)} <i>/ 00:{clock(DURATION)}</i></output></div>
  </section>;
}
