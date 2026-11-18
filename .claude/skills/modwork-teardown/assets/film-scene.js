import {sectionMesh,sectionDiagram} from './section-view.js';
import {neckMount} from './exhibit.js';
import {fiberField} from './fiber-field.js';
import {material,yarnTexture} from './studio-material.js';
import {CUT_START,hasFittedView,isHeadband} from './fit-result.js';
// Orthographic stage for the film. Geometry stays in source units throughout.
// A single time value drives the camera, display-only lift, section and annotations.
const vertex = `
attribute vec3 position, normal;attribute float edgeAttr;varying float edgeBand;uniform float shift;
uniform vec3 target, rightAxis, upAxis, eyeAxis, offset;
uniform vec2 scale;
uniform float depthRange;
varying vec3 pos, nrm;
void main(){
  vec3 world = position + offset, v = world - target;
  edgeBand=edgeAttr;gl_Position=vec4(shift+dot(v,rightAxis)*scale.x,dot(v,upAxis)*scale.y,-dot(v,eyeAxis)/depthRange,1.);
  nrm=normal;pos=world;
}`;
const clamp = x=>Math.max(0,Math.min(1,x));
const smooth = (a,b,t)=>{const x=clamp((t-a)/(b-a));return x*x*(3-2*x);};
const mix=(a,b,t)=>a+(b-a)*t;
const blend=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const decode=x=>Array.isArray(x)?new Float32Array(x):new Float32Array(Uint8Array.from(atob(x.__f32),c=>c.charCodeAt(0)).buffer);
function bounds(v){
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<v.length;i++){const k=i%3;lo[k]=Math.min(lo[k],v[i]);hi[k]=Math.max(hi[k],v[i]);}
  return {center:blend(lo,hi,.5), size:sub(hi,lo)};
}
function shader(gl,type,source){
  const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));
  return s;
}

export const DURATION=22;
export function makeStage(canvas,diagramCanvas,data,gear){
  const gl=canvas.getContext('webgl',{antialias:true,alpha:true,premultipliedAlpha:true});
  if(!gl)throw new Error('此浏览器未启用 WebGL。');
  const program=gl.createProgram();
  const shaders=[shader(gl,gl.VERTEX_SHADER,vertex),shader(gl,gl.FRAGMENT_SHADER,material)];
  shaders.forEach(s=>gl.attachShader(program,s));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const names=['target','rightAxis','upAxis','eyeAxis','offset','depthRange','scale','center','sliceAxis','kind','span','cut','section','wire','opacity','shift','liftRatio','yarn','shadowMap','trim','baseY'];
  const u=Object.fromEntries(names.map(n=>[n,gl.getUniformLocation(program,n)]));
  const aPos=gl.getAttribLocation(program,'position'), aNorm=gl.getAttribLocation(program,'normal');
  const buffers=[];
  const edgeAttr=gl.getAttribLocation(program,'edgeAttr');
  gl.activeTexture(gl.TEXTURE0);const yarn=yarnTexture(gl);
  // From the fixed studio key, record only the accessory's depth: it casts a real moving shadow on the body.
  const shadowVS=shader(gl,gl.VERTEX_SHADER,`attribute vec3 pos;uniform vec3 origin;uniform float size,raised;void main(){
    vec3 p=(pos-origin)/size+vec3(0.,raised,0.);gl_Position=vec4(.88*dot(p,vec3(.68875,0.,.725)),.88*dot(p,vec3(.54137,.66512,-.51429)),-.88*dot(p,vec3(-.48224,.74669,.45812)),1.);}`);
  const shadowFS=shader(gl,gl.FRAGMENT_SHADER,'precision highp float;void main(){gl_FragColor=vec4(vec3(gl_FragCoord.z),1.);}');
  const shadowProgram=gl.createProgram();gl.attachShader(shadowProgram,shadowVS);gl.attachShader(shadowProgram,shadowFS);gl.linkProgram(shadowProgram);
  if(!gl.getProgramParameter(shadowProgram,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(shadowProgram));
  const sm=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,sm);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,512,512,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,gl.NEAREST);
  const fb=gl.createFramebuffer(),rb=gl.createRenderbuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,sm,0);gl.bindRenderbuffer(gl.RENDERBUFFER,rb);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,512,512);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,rb);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('无法初始化展示光照。');gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  const sa=gl.getAttribLocation(shadowProgram,'pos'),su=Object.fromEntries(['origin','size','raised'].map(k=>[k,gl.getUniformLocation(shadowProgram,k)]));let prevShadow=-1,shadowCaster=null;
  function buffer(target,array){
    const b=gl.createBuffer();buffers.push(b);gl.bindBuffer(target,b);gl.bufferData(target,array,gl.STATIC_DRAW);return b;
  }
  function mesh(positions,normals,indices){
    const verts=decode(positions), ids=new Uint16Array(indices), lines=new Uint16Array(ids.length*2);
    for(let i=0;i<ids.length;i+=3){const [a,b,c]=ids.subarray(i,i+3);lines.set([a,b,b,c,c,a],2*i);}
    return {positions:verts,indices:ids,bounds:bounds(verts),v:buffer(gl.ARRAY_BUFFER,verts),n:buffer(gl.ARRAY_BUFFER,decode(normals)),idx:buffer(gl.ELEMENT_ARRAY_BUFFER,ids),len:ids.length,lines:buffer(gl.ELEMENT_ARRAY_BUFFER,lines),edges:lines.length};
  }
  const fitted=hasFittedView(gear);
  const skin=mesh(data.body.positions,data.body.normals,data.body.indices);
  const piece=mesh(fitted?gear.fitted:gear.rest,fitted?gear.fittedNormals:gear.restNormals,gear.indices);
  const span=Math.max(.001,...piece.bounds.size);
  const center=piece.bounds.center;
  const trim=isHeadband(data,gear);
  const original=trim&&fitted?mesh(gear.rest,gear.restNormals,gear.indices):piece;
  // The knitted hem follows the actual upper/lower silhouette around each angular sector.
  const edge=new Float32Array(piece.positions.length/3);
  if(trim){
    const v=original.positions,n=40,lo=new Float32Array(n).fill(Infinity),hi=new Float32Array(n).fill(-Infinity);
    const sector=i=>((Math.atan2(v[i]-center[0],v[i+2]-center[2])/(2*Math.PI)+1)*n)%n;
    for(let i=0;i<v.length;i+=3){const j=Math.floor(sector(i));lo[j]=Math.min(lo[j],v[i+1]);hi[j]=Math.max(hi[j],v[i+1]);}
    for(let i=0;i<v.length;i+=3){const s=sector(i);let low=0,high=0,weights=0;for(let d=-2;d<=2;d++){const j=(Math.floor(s)+d+n)%n;if(!Number.isFinite(lo[j]))continue;
      const w=Math.exp(-.65*(Math.floor(s)+d+.5-s)**2);low+=w*lo[j];high+=w*hi[j];weights+=w;}
      edge[i/3]=clamp((v[i+1]-low/weights)/Math.max(.01,(high-low)/weights));}}
  const eb=buffer(gl.ARRAY_BUFFER,edge);
  const baseHeight=Math.min(center[1]-piece.bounds.size[1]/2-.12*span,skin.bounds.center[1]-skin.bounds.size[1]*.41);
  const mountData=trim&&neckMount(skin.positions,skin.indices,baseHeight,span),mount=mountData?mesh(...mountData):null;
  const field=fiberField(gl,shader);
  const contextDistance=Math.hypot(...sub(center,skin.bounds.center));
  const subject=blend(center,skin.bounds.center,Math.min(.35,.25*span/Math.max(.001,contextDistance)));
  const pin=fitted?gear.focusVertex:null;
  const targetPoint=pin||center;
  const heading=pin?Math.atan2(pin[0]-center[0],pin[2]-center[2]):.48;
  const sliceAxis=[Math.sin(heading),0,Math.cos(heading)];
  const localPin=pin?sub(pin,center):null;
  const sectionPin=localPin?[localPin[0]*sliceAxis[2]-localPin[2]*sliceAxis[0],localPin[1],dot(localPin,sliceAxis)]:null;
  const diagram=sectionDiagram(diagramCanvas,
    sectionMesh(skin.positions,skin.indices,sliceAxis,center),sectionMesh(piece.positions,piece.indices,sliceAxis,center),span,sectionPin);
  function draw(m,kind,lift,isWire=false,opacity=1){
    gl.uniform3f(u.offset,0,lift,0);gl.uniform1f(u.kind,kind);gl.uniform1f(u.wire,isWire?1:0);gl.uniform1f(u.opacity,opacity);
    for(const [loc,b] of [[aPos,m.v],[aNorm,m.n]]){gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);}
    if(kind===1){gl.bindBuffer(gl.ARRAY_BUFFER,eb);gl.enableVertexAttribArray(edgeAttr);gl.vertexAttribPointer(edgeAttr,1,gl.FLOAT,false,0,0);}
    else{gl.disableVertexAttribArray(edgeAttr);gl.vertexAttrib1f(edgeAttr,.5);}
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,isWire?m.lines:m.idx);
    gl.drawElements(isWire?gl.LINES:gl.TRIANGLES,isWire?m.edges:m.len,gl.UNSIGNED_SHORT,0);
  }
  function render(t,cam={yaw:0,pitch:0,zoom:1,panX:0,panY:0},gallery=false){
    const displayed=t<CUT_START?original:piece;
    const width=canvas.clientWidth,height=canvas.clientHeight;
    if(!width||!height)return null;
    const dpr=Math.min(2,window.devicePixelRatio||1);
    const w=Math.round(width*dpr),h=Math.round(height*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}

    gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.depthMask(true);
    const lift=smooth(3.6,7.6,t)*(1-smooth(8.9,CUT_START,t));
    const zoom=smooth(12.3,18.6,t);
    const yaw=mix(mix(.90,.50,smooth(0,4.5,t)),-.78,smooth(4.2,11.8,t));
    const az=mix(yaw,heading+.18,zoom)+cam.yaw, pitch=Math.max(-1.44,Math.min(1.44,.02+.32*lift+.14*zoom+cam.pitch));
    const eye=[Math.sin(az)*Math.cos(pitch),Math.sin(pitch),Math.cos(az)*Math.cos(pitch)];
    const right=[Math.cos(az),0,-Math.sin(az)];
    const up=[-Math.sin(az)*Math.sin(pitch),Math.cos(pitch),-Math.cos(az)*Math.sin(pitch)];
    const lifted=span*.67*lift;
    const target=blend(subject,targetPoint,zoom*(pin ? .88 : .35));target[1]+=lift*span*.23;
    for(let i=0;i<3;i++)target[i]+=span*(right[i]*cam.panX+up[i]*cam.panY);
    const frame=mix(1.68+.51*lift,pin ? .78 : 1.40,zoom)*span/cam.zoom;
    const shift=!gallery&&window.innerWidth>700?.32:0,aspect=width/height,depthRange=Math.max(data.radius*5,span*4);
    const sy=2/Math.max(frame,frame*.83/(width/height)),sx=sy*height/width;
    const section=smooth(CUT_START,13,t);
    const endCut=pin ? dot(sub(pin,center),sliceAxis)/span : .025;
    // Traverse the interior before settling on the evidenced plane at the pin.
    const sweep=mix(.85,-.12,smooth(10.,14.9,t));
    const cut=mix(sweep,endCut,smooth(14.9,18.3,t));
    if(lift!==prevShadow||shadowCaster!==displayed){
      gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.viewport(0,0,512,512);gl.clearColor(1,1,1,1);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.useProgram(shadowProgram);gl.bindBuffer(gl.ARRAY_BUFFER,displayed.v);gl.enableVertexAttribArray(sa);gl.vertexAttribPointer(sa,3,gl.FLOAT,false,0,0);
      gl.uniform3fv(su.origin,center);gl.uniform1f(su.size,span);gl.uniform1f(su.raised,lifted/span);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,displayed.idx);gl.drawElements(gl.TRIANGLES,displayed.len,gl.UNSIGNED_SHORT,0);gl.disableVertexAttribArray(sa);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);prevShadow=lift;shadowCaster=displayed;
    }
    gl.viewport(0,0,w,h);gl.depthMask(true);gl.clearColor(.025,.036,.047,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    field.sky(shift,aspect,az,pitch,t);
    gl.useProgram(program);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,yarn);gl.uniform1i(u.yarn,0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,sm);gl.uniform1i(u.shadowMap,1);
    gl.uniform1f(u.liftRatio,lifted/span);gl.uniform1f(u.trim,trim?1:0);gl.uniform1f(u.baseY,mount?(baseHeight-center[1])/span:-100000.);gl.uniform1f(u.shift,shift);
    gl.uniform3fv(u.target,target);gl.uniform3fv(u.eyeAxis,eye);gl.uniform3fv(u.upAxis,up);gl.uniform3fv(u.rightAxis,right);
    gl.uniform3fv(u.center,center);gl.uniform3fv(u.sliceAxis,sliceAxis);gl.uniform2f(u.scale,sx,sy);
    gl.uniform1f(u.depthRange,Math.max(data.radius*5,span*4));gl.uniform1f(u.span,span);gl.uniform1f(u.cut,cut);
    gl.uniform1f(u.section,section); draw(skin,0,0);
    gl.uniform1f(u.section,0);if(mount)draw(mount,2,0);draw(displayed,1,lifted);
    gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
    if(lift>.02)draw(displayed,1,0,true,.13*lift);
    if(section>.01)draw(skin,0,0,true,.085*section);
    gl.disableVertexAttribArray(aPos);gl.disableVertexAttribArray(aNorm);gl.disableVertexAttribArray(edgeAttr);
    field.draw(sub(target,center).map(v=>v/span),right,up,eye,[sx*span,sy*span],shift,t,lift,dpr,span/depthRange,1.-.76*zoom);
    const hasSection=t>=CUT_START&&diagram(cut*span,lifted,zoom);
    function project(p){const v=sub(p,target);return [(dot(v,right)*sx+shift+1)*width/2,(1-dot(v,up)*sy)*height/2];}
    return {mark:pin?project(pin):null,origin:project(center),raised:project([center[0],center[1]+lifted,center[2]]),lift,zoom,hasSection};
  }
  return {render,dispose(){
    field.dispose();gl.deleteFramebuffer(fb);gl.deleteRenderbuffer(rb);gl.deleteTexture(sm);gl.deleteTexture(yarn);gl.deleteShader(shadowVS);gl.deleteShader(shadowFS);gl.deleteProgram(shadowProgram);
    buffers.forEach(b=>gl.deleteBuffer(b));shaders.forEach(s=>gl.deleteShader(s));gl.deleteProgram(program);
  }};
}
