// Periodic knitted yarn tile: height gradients and strand colour share one mipmapped atlas.
export function yarnTexture(gl){
  const n=256,h=new Float32Array(n*n),fiber=new Float32Array(n*n),pix=new Uint8Array(n*n*4);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const x=i/n*8,y=j/n*8,k=j*n+i,TAU=2*Math.PI;
    const yarn=(offset,sign)=>{const v=y+offset,lane=x+offset*.88+sign*.21*Math.sin(TAU*v);
      const d=2*Math.abs(lane-Math.round(lane));
      const shape=Math.sqrt(Math.max(0,1-Math.pow(d/.71,2)));
      const twist=.5+.5*Math.cos(TAU*(3*lane+8*v));
      return [shape*(.71+.29*Math.sin(TAU*v*1.0))+.055*shape*twist,twist];};
    const a=yarn(0,1),b=yarn(.5,-1);h[k]=Math.max(a[0],b[0]);fiber[k]=(a[0]>b[0]?a:b)[1];
  }
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const k=y*n+x,b=k*4;pix[b]=128+Math.max(-124,Math.min(124,(h[y*n+((x+1)%n)]-h[y*n+((x+n-1)%n)])*230));
    pix[b+1]=128+Math.max(-124,Math.min(124,(h[((y+1)%n)*n+x]-h[((y+n-1)%n)*n+x])*230));
    pix[b+2]=Math.min(255,255*(.12+.73*h[k]+.15*fiber[k]));pix[b+3]=255;
  }
  const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,n,n,0,gl.RGBA,gl.UNSIGNED_BYTE,pix);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.generateMipmap(gl.TEXTURE_2D);
  const ext=gl.getExtension('EXT_texture_filter_anisotropic');if(ext)gl.texParameterf(gl.TEXTURE_2D,ext.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(4,gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));return tex;
}
export const material=`
precision highp float;
varying vec3 pos,nrm;varying float edgeBand;
uniform vec3 eyeAxis,center,sliceAxis;uniform sampler2D yarn,shadowMap;
uniform float kind,span,cut,section,wire,opacity,liftRatio,trim,baseY;
const vec3 light=vec3(-.48224,.74669,.45812);
vec3 shadowUV(vec3 p){return vec3(dot(p,vec3(.68875,0.,.725)),
 dot(p,vec3(.54137,.66512,-.51429)),-dot(p,light))*.44+.5;}
float shadow(vec3 p){
 vec3 s=shadowUV(p);if(min(s.x,s.y)<0.||max(s.x,s.y)>1.)return 1.;
 float sum=0.;float r=(1.+liftRatio*3.)/512.;
 for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){sum+=step(s.z-.006,texture2D(shadowMap,s.xy+vec2(float(x),float(y))*r).r);}
 return .49+.51*sum/9.;
}
// Stable object-space grain, independent of the fabric weave and camera.
float skinNoise(vec3 p) {
 vec3 cell=floor(p), f=fract(p);f=f*f*(3.-2.*f);
 vec4 n=dot(cell,vec3(1.,57.,113.))+vec4(0.,57.,113.,170.);
 vec4 a=fract(sin(n)*4375.5),b=fract(sin(n+1.)*4375.5);
 vec4 x=mix(a,b,f.x);
 return mix(mix(x.x,x.y,f.y),mix(x.z,x.w,f.y),f.z);
}
void main(){
 vec3 p=(pos-center)/span;float plane=dot(p,sliceAxis)-cut;
 if(kind<.5&&p.y<baseY)discard;
 if(section>.001&&plane>0.&&wire<.5)discard;
 if(wire>.5&&kind<.5&&plane<0.)discard;
 if(wire>.5){gl_FragColor=vec4(mix(vec3(.40,.69,.74),vec3(1.,.69,.33),kind),opacity);return;}
 vec3 N=normalize(nrm);bool inside=dot(N,eyeAxis)<0.;if(inside)N=-N;

 float nv=max(0.,dot(N,eyeAxis)),rim=pow(1.-nv,3.);
 float key=max(0.,dot(N,light)),oc=1.;
 vec3 c;
 if(kind<.5){
   oc=shadow(p);
   float diffuse=clamp((dot(N,light)+.28)/1.28,0.,1.);
   float fill=max(0.,dot(N,normalize(vec3(.66,.24,.61))));
   float variation=skinNoise(p*24.)-.5;
   vec3 pigment=vec3(.69,.448,.338)+variation*vec3(.035,.022,.017);
   vec3 shade=vec3(.196,.116,.098);
   c=mix(shade,pigment,diffuse*.87+.08)*mix(.68,1.,oc);
   c+=vec3(.092,.075,.060)*fill;
   float softHighlight=pow(max(0.,dot(N,normalize(light+eyeAxis))),20.);
   c+=vec3(.052,.040,.033)*softHighlight*oc;
   c+=vec3(.053,.033,.025)*rim;
   if(inside)c=mix(c,vec3(.14,.082,.069),.42);
   c*=mix(.82,1.,smoothstep(-.81,-.35,p.y));
   float edge=(1.-smoothstep(.001,.009,abs(plane)))*section;
   c=mix(c,vec3(1.,.69,.30),edge);
 }else if(kind>1.5){
   float bevel=1.-smoothstep(.001,.005,abs(p.y-baseY+.018));
   c=vec3(.073,.081,.084)+vec3(.11,.12,.12)*key+vec3(.19,.15,.09)*rim;
   c=mix(c,vec3(.62,.39,.16)*(.43+.57*key),bevel*.9);
 }else{
   vec3 q=p-vec3(0.,liftRatio,0.);float theta=atan(q.x,q.z)/6.2831853;
   vec2 uv=vec2(theta*31.,(q.y-.12*q.z)*11.);vec3 tex=texture2D(yarn,uv).rgb;
   vec3 tangent=normalize(vec3(q.z+.0001,0.,-q.x));vec3 up=normalize(cross(N,tangent)+.0001);
   vec3 fn=normalize(N+.75*(tex.r-.5)*tangent+.66*(tex.g-.5)*up);float lit=max(0.,dot(fn,light));
   float edge=min(edgeBand,1.-edgeBand);
   float piping=(1.-smoothstep(.009,.026,abs(edge-.086)))*trim;
   float hem=(1.-smoothstep(.055,.085,edge))*trim;
   vec3 dye=mix(vec3(.75,.225,.075),vec3(.47,.147,.049),hem);
   dye=mix(dye,vec3(.94,.64,.33),piping*(.66+.27*tex.b));
   c=dye*(.23+.69*lit+.47*tex.b)+vec3(.20,.11,.052)*pow(1.-nv,1.7);
   c+=vec3(.30,.22,.135)*pow(max(0.,dot(fn,normalize(light+eyeAxis))),17.)*(.24+tex.b);
 }
 gl_FragColor=vec4(clamp(c,0.,1.),1.);
}`;
