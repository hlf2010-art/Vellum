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

// Depths where the plane (normal `axis`, offset from `origin`) crosses both meshes, exactly:
// each mesh's triangle depth ranges are merged into intervals and the two interval lists intersected.
// `snap(c)` takes a depth in units of `span` and returns the nearest depth strictly inside a shared
// interval (c itself when it already is). `shared` is false when the meshes have no common section.
export function sharedSectionDepths(a,b,axis,origin,span){
  const none={shared:false,snap:c=>c};
  const intervals=m=>{
    const v=m.positions,ix=m.indices,n=ix.length/3,lo=new Float64Array(n),hi=new Float64Array(n);
    const depth=i=>(v[3*i]-origin[0])*axis[0]+(v[3*i+2]-origin[2])*axis[2];
    for(let t=0;t<n;t++){
      const x=depth(ix[3*t]),y=depth(ix[3*t+1]),z=depth(ix[3*t+2]);
      lo[t]=Math.min(x,y,z);hi[t]=Math.max(x,y,z);
    }
    const order=Array.from({length:n},(_,t)=>t).sort((p,q)=>lo[p]-lo[q]);
    const merged=[];
    for(const t of order){
      if(!(hi[t]>lo[t]))continue;
      const last=merged[merged.length-1];
      if(last&&lo[t]<=last[1])last[1]=Math.max(last[1],hi[t]);else merged.push([lo[t],hi[t]]);
    }
    return merged;
  };
  const A=intervals(a),B=intervals(b),common=[];
  for(let i=0,j=0;i<A.length&&j<B.length;){
    const l=Math.max(A[i][0],B[j][0]),h=Math.min(A[i][1],B[j][1]);
    if(h>l)common.push([l,h]);
    if(A[i][1]<B[j][1])i++;else j++;
  }
  if(!common.length)return none;
  return {shared:true,snap(c){
    const d=c*span;let best=d,gap=Infinity;
    for(const [l,h] of common){
      const inset=(h-l)*.01,p=Math.min(h-inset,Math.max(l+inset,d)),g=Math.abs(p-d);
      if(g<gap){gap=g;best=p;}
    }
    return best/span;
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
