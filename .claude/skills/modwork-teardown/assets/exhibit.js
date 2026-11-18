// Gallery mount below a head-only exhibit. Derive its outline from the real neck section.
// This presentation geometry is not part of the asset, section diagram or measurements.
export function neckMount(v,ix,height,span){
  const points=[];
  for(let i=0;i<ix.length;i+=3)for(let j=0;j<3;j++){
    const a=3*ix[i+j],b=3*ix[i+(j+1)%3];
    if((v[a+1]<height)===(v[b+1]<height))continue;
    const t=(height-v[a+1])/(v[b+1]-v[a+1]);
    points.push([v[a]+(v[b]-v[a])*t,v[a+2]+(v[b+2]-v[a+2])*t]);
  }
  points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const hull=pts=>{const h=[];for(const p of pts){
    while(h.length>1){const [a,b]=h.slice(-2);if((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])>1e-6)break;h.pop();}
    h.push(p);}h.pop();return h;};
  const ring=[...hull(points),...hull(points.reverse())];if(ring.length<3)return null;
  const cx=ring.reduce((s,p)=>s+p[0],0)/ring.length,cz=ring.reduce((s,p)=>s+p[1],0)/ring.length;
  const vs=[],ns=[],ids=[];
  const profile=[[.98,-.003],[1.015,0],[1.055,-.016],[1.055,-.051],[1.030,-.063],[.975,-.064]];
  for(let k=0;k<profile.length;k++)for(let i=0;i<ring.length;i++){
    const [x,z]=ring[i],[mul,dy]=profile[k],prev=ring[(i+ring.length-1)%ring.length],next=ring[(i+1)%ring.length];
    let nx=next[1]-prev[1],nz=prev[0]-next[0],d=Math.hypot(nx,nz)||1;nx/=d;nz/=d;
    const ny=[1,.7,.18,0,-.7,-1][k];vs.push(cx+(x-cx)*mul,height+span*dy,cz+(z-cz)*mul);ns.push(nx,ny,nz);
    if(k){const a=(k-1)*ring.length+i,b=(k-1)*ring.length+(i+1)%ring.length;ids.push(a,a+ring.length,b,b,a+ring.length,b+ring.length);}
  }
  for(const [k,ny] of [[0,1],[profile.length-1,-1]]){
    const idx=vs.length/3;vs.push(cx,height+span*profile[k][1],cz);ns.push(0,ny,0);
    for(let i=0;i<ring.length;i++)ids.push(idx,k*ring.length+i,k*ring.length+(i+1)%ring.length);
  }return [vs,ns,ids];
}
