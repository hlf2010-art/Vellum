// Exhibition scenery in object space. These filaments never enter the fit report.
const quadVS=`attribute vec2 xy;varying vec2 uv;void main(){uv=xy;gl_Position=vec4(xy,1.,1.);}`;
const quadFS=`precision highp float;varying vec2 uv;uniform vec4 lens;uniform float t;
float h(vec2 x){return fract(sin(dot(x,vec2(127.1,311.7)))*4375.545);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
void main(){
 vec2 q=(uv-vec2(lens.x,.10))*vec2(lens.y,1.);q.x+=.08*sin(lens.z);q.y+=.035*sin(lens.w);
 vec2 r=mat2(.96,.28,-.28,.96)*q;
 float d=length(vec2(r.x*.84,(r.y-.12)*1.13)), a=atan(r.y-.12,r.x);
 float cloud=.45*noise(r*3.+vec2(t*.015,0))+.34*noise(r*7.2-vec2(0,t*.012))+.21*noise(r*17.);
 float arc=.23+.77*pow(.5+.5*cos(a-.55),2.);
 vec3 c=vec3(.022,.031,.042)+vec3(.038,.066,.084)*exp(-.66*dot(q,q))*(.45+cloud);
 c+=vec3(.29,.18,.072)*exp(-6.8*abs(d-.79))*arc*(.35+.85*cloud);
 c+=vec3(.62,.39,.16)*exp(-82.*abs(d-.79))*arc*cloud;
 c+=vec3(.14,.20,.22)*exp(-10.*abs(d-.81))*(1.-arc)*cloud;
 float beam=exp(-4.8*abs(r.x*.51+r.y-.56))*exp(-.45*dot(q,q));
 c+=vec3(.096,.12,.12)*beam*(.3+cloud);
 float grain=h(mod(gl_FragCoord.xy,vec2(193.,179.)))-.5;c+=grain*.013;
 gl_FragColor=vec4(c,1.);
}`;
const fieldVS=`precision highp float;attribute vec3 seed;uniform vec3 target,side,up,eye;uniform vec2 scale;uniform float shift,t,lift,mode,pixel,depthRatio,quiet;varying vec4 ink;
void main(){
 float u=seed.x,v=seed.y,k=seed.z;vec3 p;
 if(mode<.5){
   float x=(u-.5)*5.6;float family=step(.5,k);float lane=v-.5;
   float wave=sin(x*1.46+t*.12+family*2.1);float twist=x*2.05+t*.14+family*2.2;
   p=vec3(x,.12+.56*wave+lane*(.53+.14*lift)*cos(twist)+family*.13,
     -.88+.41*sin(x*1.3+.55*t*.10)+lane*.55*sin(twist)-.20*family);
   p.y+=.035*sin(x*4.5+v*3.3+t*.17)+lift*.22*(.4+wave);
   float glint=pow(.5+.5*cos(twist*1.8+v*4.),7.);
   ink=vec4(mix(vec3(.34,.51,.58),vec3(1.,.65,.31),family),(.075+.15*glint+.095*lift)*(.55+.45*sin(u*3.1416))*quiet);
 }else{
   float phi=u*6.2831;float rad=.70+v*1.85;float drift=t*.045*(.35+k);
   p=vec3(cos(phi+drift)*rad,(fract(k+.009*t)-.5)*2.5,sin(phi+drift)*rad-.35);
   float near=clamp(.4+.32*dot(p,eye),0.,1.);gl_PointSize=pixel*(1.4+3.8*near*near+1.2*v);
   ink=vec4(mix(vec3(.50,.75,.81),vec3(1.,.76,.45),v),(.14+.38*v)*quiet);
 }
 vec3 rel=p-target;float z=dot(rel,eye);
 gl_Position=vec4(vec2(dot(rel,side),dot(rel,up))*scale+vec2(shift,0.),-z*depthRatio,1.);
}`;
const fieldFS=`precision highp float;varying vec4 ink;uniform float mode;void main(){float a=ink.a;if(mode>.5){vec2 p=gl_PointCoord*2.-1.;a*=exp(-3.8*dot(p,p))*(1.-smoothstep(.6,1.,length(p)));}gl_FragColor=vec4(ink.rgb,a);}`;
export function fiberField(gl,compile){
  const shaders=[],programs=[],buffers=[];
  function program(v,f){const p=gl.createProgram();for(const [k,s] of [[gl.VERTEX_SHADER,v],[gl.FRAGMENT_SHADER,f]]){const sh=compile(gl,k,s);gl.attachShader(p,sh);shaders.push(sh);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));programs.push(p);return p;}
  function buffer(a){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(a),gl.STATIC_DRAW);buffers.push(b);return b;}
  const back=program(quadVS,quadFS),field=program(fieldVS,fieldFS);
  const quad=buffer([-1,-1,3,-1,-1,3]),pos=gl.getAttribLocation(back,'xy'),seed=gl.getAttribLocation(field,'seed');
  const loc=(p,names)=>Object.fromEntries(names.map(n=>[n,gl.getUniformLocation(p,n)]));
  const bg=loc(back,['lens','t']),u=loc(field,['target','side','up','eye','scale','shift','t','lift','mode','pixel','depthRatio','quiet']);
  const waves=[];for(let family=0;family<2;family++)for(let row=0;row<46;row++)for(let i=0;i<96;i++)waves.push(i/96,row/45,family,(i+1)/96,row/45,family);
  let state=137217;const random=()=>((state=(Math.imul(1664525,state)+1013904223)>>>0)/4294967296);
  const specks=Array.from({length:480*3},random),lines=buffer(waves),dust=buffer(specks);
  function attr(i,b,n){gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,n,gl.FLOAT,false,0,0);}
  return {sky(shift,aspect,yaw,pitch,t){
    gl.useProgram(back);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.depthMask(false);
    attr(pos,quad,2);gl.uniform4f(bg.lens,shift,aspect,yaw,pitch);gl.uniform1f(bg.t,t);gl.drawArrays(gl.TRIANGLES,0,3);gl.disableVertexAttribArray(pos);
  },draw(target,side,up,eye,scale,shift,t,lift,dpr,depthRatio,quiet){
    gl.useProgram(field);gl.enable(gl.DEPTH_TEST);gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
    for(const [n,v] of Object.entries({target,side,up,eye}))gl.uniform3fv(u[n],v);
    gl.uniform2fv(u.scale,scale);for(const [n,v] of Object.entries({shift,t,lift,pixel:dpr,depthRatio,quiet}))gl.uniform1f(u[n],v);
    attr(seed,lines,3);gl.uniform1f(u.mode,0);gl.drawArrays(gl.LINES,0,waves.length/3);
    attr(seed,dust,3);gl.uniform1f(u.mode,1);gl.drawArrays(gl.POINTS,0,specks.length/3);
    gl.disableVertexAttribArray(seed);gl.depthMask(true);gl.disable(gl.BLEND);
  },dispose(){buffers.forEach(b=>gl.deleteBuffer(b));programs.forEach(p=>gl.deleteProgram(p));shaders.forEach(s=>gl.deleteShader(s));}};
}
