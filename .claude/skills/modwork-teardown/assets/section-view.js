// Intersections of the same plane used by the stage shader with source triangles.
// The diagram is in the plane's local horizontal and vertical axes, in game units.
export function sectionMesh(vertices,indices,axis,origin){
  const projected=new Float32Array(vertices.length);
  for(let i=0;i<vertices.length;i+=3){
    const x=vertices[i]-origin[0], y=vertices[i+1]-origin[1], z=vertices[i+2]-origin[2];
    projected[i]=x*axis[2]-z*axis[0];
    projected[i+1]=y;
    projected[i+2]=x*axis[0]+z*axis[2];
  }
  return function trace(ctx,depth,dy){
    ctx.beginPath();
    let segments=0;
    for(let i=0;i<indices.length;i+=3){
      let points=0;
      for(let j=0;j<3;j++){
        const a=3*indices[i+j],b=3*indices[i+(j+1)%3];
        const da=projected[a+2]-depth, db=projected[b+2]-depth;
        if((da<0)===(db<0))continue;
        const f=da/(da-db);
        const u=projected[a]+(projected[b]-projected[a])*f;
        const v=projected[a+1]+(projected[b+1]-projected[a+1])*f+dy;
        if(points++===0)ctx.moveTo(u,v);else {ctx.lineTo(u,v);segments++;}
      }
    }
    ctx.stroke();
    return segments;
  };
}

// Depths along `axis` (relative to `origin`, in units of `span`) at which the plane crosses both meshes.
// `snap(c)` returns c when the plane at c crosses both, otherwise the nearest depth that does.
// `shared` is false when the two meshes have no common section at all.
export function sharedSectionDepths(a,b,axis,origin,span,steps=96){
  const none={shared:false,snap:c=>c};
  const prepare=m=>{
    const v=m.positions,d=new Float32Array(v.length/3);let lo=Infinity,hi=-Infinity;
    for(let i=0;i<d.length;i++){
      d[i]=(v[3*i]-origin[0])*axis[0]+(v[3*i+2]-origin[2])*axis[2];
      lo=Math.min(lo,d[i]);hi=Math.max(hi,d[i]);
    }
    return {d,lo,hi,ix:m.indices};
  };
  const A=prepare(a),B=prepare(b),lo=Math.max(A.lo,B.lo),hi=Math.min(A.hi,B.hi);
  if(!(hi>lo))return none;
  const step=(hi-lo)/steps;
  const marks=m=>{
    const hit=new Uint8Array(steps+1);
    for(let i=0;i<m.ix.length;i+=3){
      const x=m.d[m.ix[i]],y=m.d[m.ix[i+1]],z=m.d[m.ix[i+2]];
      const first=Math.max(0,Math.ceil((Math.min(x,y,z)-lo)/step)),last=Math.min(steps,Math.floor((Math.max(x,y,z)-lo)/step));
      for(let k=first;k<=last;k++)hit[k]=1;
    }
    return hit;
  };
  const ha=marks(A),hb=marks(B),ok=ha.map((v,i)=>v&hb[i]);
  if(!ok.some(Boolean))return none;
  const near=new Int16Array(steps+1);
  let last=-1;
  for(let i=0;i<=steps;i++){if(ok[i])last=i;near[i]=last;}
  last=-1;
  for(let i=steps;i>=0;i--){
    if(ok[i])last=i;
    const before=near[i];
    near[i]=before<0||(last>=0&&last-i<i-before)?last:before;
  }
  return {shared:true,snap(c){
    const raw=(c*span-lo)/step,k=Math.max(0,Math.min(steps,Math.round(raw)));
    return ok[k]&&Math.abs(raw-k)<=.5?c:(lo+near[k]*step)/span;
  }};
}

export function sectionDiagram(canvas,bodyTrace,gearTrace,span,anchor){
  const ctx=canvas.getContext('2d');
  let previous='',hasSection=false;
  return function draw(depth,lift,zoom){
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h)return false;
    const key=[depth,lift,zoom,w,h].join(',');
    if(key===previous)return hasSection;
    previous=key;
    const dpr=Math.min(2,window.devicePixelRatio||1);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    }
    const scale=Math.min(w/(span*(1.26-.45*zoom)),h/(span*(1.28-.6*zoom)));
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const x=w*.5-(anchor?anchor[0]*zoom*scale:0),y=h*.52+(anchor?anchor[1]*zoom*scale:0);
    ctx.translate(x,y);ctx.scale(scale,-scale);
    ctx.lineWidth=1.25/scale;ctx.strokeStyle='#bdd2d0';const body=bodyTrace(ctx,depth,0);
    ctx.lineWidth=1.7/scale;ctx.strokeStyle='#ff9454';const gear=gearTrace(ctx,depth,lift);
    if(anchor&&Math.abs(depth-anchor[2])<span*.001){
      ctx.lineWidth=1/scale;ctx.strokeStyle='#ffe7b6';ctx.beginPath();ctx.arc(anchor[0],anchor[1],4/scale,0,2*Math.PI);ctx.stroke();
    }
    hasSection=body>0&&gear>0;
    return hasSection;
  };
}
