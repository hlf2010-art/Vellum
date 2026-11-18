import {useLayoutEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FitViewport} from 'modwork-viewport';
import {Film} from './Film.jsx';
import {snapshot} from './snapshot-api.js';
import {gearName,fitResult,hasFittedView,sources} from './fit-result.js';

const value = (n,suffix='') => Number.isFinite(n) ? n + suffix : '未记录';

function Inspection({gear}) {
  const canPreview = hasFittedView(gear);
  const [fitted, setFitted] = useState(canPreview);
  const [body,setBody] = useState('solid');
  const [info,setInfo] = useState(null);
  const [focus,setFocus] = useState(null);
  const [reset,setReset] = useState(0);
  const fit = fitted ? gear.fit : null;
  const result=fitResult(fit);
  return <div className="inspection">
    <div className={'stage ' + (fitted ? '' : 'original')}>
      <FitViewport part={snapshot.part} gear={gear.id} previewMode={fitted} bodyMode={body} theme="light" activeTool="orbit"
        showGrid={false} showAxes={false} showRuler={false} showTexture={false} clothFlutter={0}
        onMeshInfo={setInfo} focusRequest={focus} resetTick={reset} />
      {info?.error && <p role="alert">{info.error}</p>}
      <button className="reset" onClick={()=>setReset(n=>n+1)}>重置视角</button>
    </div>
    <aside>
      <label>几何状态<select value={fitted?'fitted':'rest'} onChange={e=>setFitted(e.target.value==='fitted')}>
        <option value="rest">原始护具</option>{canPreview && <option value="fitted">贴合结果</option>}
      </select></label>
      <label>观察方式<select value={body} onChange={e=>setBody(e.target.value)}>
        <option value="solid">身体与护具</option><option value="xray">身体半透明</option><option value="off">单独查看护具</option><option value="mesh">线框</option>
      </select></label>
      <h2>{fitted ? result.title : '原始几何'}</h2>
      {fit && <><p>{result.reason} · {sources[fit.heatSource] || '来源未记录'}</p>
        <dl><dt>顶点嵌入 / 检查</dt><dd>{value(fit.embedded)} / {value(fit.checked)}</dd>
        <dt>受检顶点最小有向距离</dt><dd>{value(fit.minSignedMm,' mm')}</dd>
        <dt>面边穿入 / 采样</dt><dd>{value(fit.surface?.inside)} / {value(fit.surface?.checked)}</dd></dl>
        {fit.surface?.inside > 0 && fit.embedded === 0 && <p>穿入发生在面或边的采样处。顶点定位无法标出这些采样位置。</p>}
        {fit.calibrated === false && <p>此记录使用未标定的身体。</p>}</>}
      {fit && info && !info.error && !info.clusters?.length && gear.focusVertex &&
        <button onClick={()=>{setBody('xray');setFocus(last=>({tick:(last?.tick||0)+1,center:gear.focusVertex,radius:1.2}));}}>定位最深嵌入顶点</button>}
      {fitted && info?.clusters?.map((c,i)=><button key={i} onClick={()=>setFocus(last=>({tick:(last?.tick||0)+1, center:c.center, radius:c.radiusMm/10}))}>定位{c.zone || '嵌入区域'} · {c.count} 点</button>)}
      <p className="note">拖动模型可旋转，滚轮可缩放。此页展示静态几何，动作效果需在游戏中确认。</p>
    </aside>
  </div>;
}
function Review() {
  const [id,setId] = useState(snapshot.gears[0].id);
  const gear = snapshot.gears.find(g=>g.id===id);
  const [mode,setMode]=useState('film');
  const [playback,setPlayback]=useState(()=>({time:0,playing:!matchMedia('(prefers-reduced-motion: reduce)').matches&&!window.__MW_CAPTURE}));
  const inspectButton=useRef(null),backButton=useRef(null),lastMode=useRef(mode);
  useLayoutEffect(()=>{
    if(mode!==lastMode.current)(mode==='film'?inspectButton:backButton).current?.focus();
    lastMode.current=mode;
  },[mode]);
  if(mode==='film') return <Film gear={gear} onSelect={setId} initialPlayback={playback} inspectButton={inspectButton}
    onInspect={position=>{setPlayback(position);setMode('inspect');}}/>;
  return <div className="review-shell"><header><div><button ref={backButton} className="back-film" onClick={()=>setMode('film')}>← 返回拆解导览</button><h1>{snapshot.gearLabel || snapshot.label || '护具'}贴合复查</h1></div>
    <label>护具<select value={id} onChange={e=>setId(e.target.value)}>{snapshot.gears.map(g=><option key={g.id} value={g.id} title={g.id}>{gearName(g.id)}</option>)}</select></label></header>
    <Inspection key={id} gear={gear}/><footer title={snapshot.sha256}>{snapshot.player || '球员未记录'} · 来源 {snapshot.source} · SHA-256 {snapshot.sha256.slice(0,12)}</footer></div>;
}
createRoot(document.getElementById('app')).render(<Review/>);
