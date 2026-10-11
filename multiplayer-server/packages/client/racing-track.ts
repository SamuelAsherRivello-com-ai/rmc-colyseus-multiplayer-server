// Indexed route samples are bounded by fixed track indices or modulo route length.
export interface TrackPoint { x: number; z: number }
// Copper Basin v1. Units are meters; x/z is the ground plane, +y is up.
export const COLORS = ['#f05b42', '#42c9e0', '#f4cb4c', '#a594ed'];
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a-b), Math.cos(a-b));
const anchors: [number, number][] = [[-27,-20],[-8,-21],[14,-20],[29,-17],[32,-5],[26,4],[14,5],[10,14],[25,17],[27,23],[9,25],[-7,24],[-24,20],[-29,10],[-18,3],[-9,1],[-12,-7],[-26,-6],[-33,-11],[-33,-18]];
const cat = (a: number,b: number,c: number,d: number,t: number) => .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
export const route = anchors.flatMap((p,i) => Array.from({length:10}, (_,j) => {
  const a=anchors[(i+anchors.length-1)%anchors.length]!,c=anchors[(i+1)%anchors.length]!,d=anchors[(i+2)%anchors.length]!,t=j/10;
  return {x:cat(a[0],p[0],c[0],d[0],t),z:cat(a[1],p[1],c[1],d[1],t)};
}));
export const gateIndices = [0,40,80,120,160];
export const gates = gateIndices.map(index => {const p=route[index]!,n=route[(index+1)%route.length]!,length=Math.hypot(n.x-p.x,n.z-p.z);return {...p,index,tx:(n.x-p.x)/length,tz:(n.z-p.z)/length};});
export const shortcut = [route[122]!,{x:-14,z:10},route[157]!];
export const TRACK = {version:1,name:'Copper Basin',width:9,route,gates,shortcut,shortcutWidth:5.2, laps:3,timeout:120};
export function nearestOn(points: readonly TrackPoint[],x: number,z: number,closed=true) {
  let best={distance:Infinity,x:0,z:0,index:0,t:0,tx:0,tz:1};
  for(let i=0;i<points.length-(closed?0:1);i++) {const a=points[i]!,b=points[(i+1)%points.length]!,dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/l2,0,1),px=a.x+dx*t,pz=a.z+dz*t,distance=Math.hypot(x-px,z-pz);if(distance<best.distance)best={distance,x:px,z:pz,index:i,t,tx:dx/Math.sqrt(l2),tz:dz/Math.sqrt(l2)};}
  return best;
}
export function roadAt(x: number,z: number) {const main=nearestOn(route,x,z),branch=nearestOn(shortcut,x,z,false);return branch.distance-2.6<main.distance-4.5?{...branch,width:2.6,branch:true,main}:{...main,width:4.5,branch:false,main};}
export function terrainAt(x: number,z: number) {
  const r=roadAt(x,z),s=r.main.index+r.main.t;
  let height=0,kind='dirt';
  if(!r.branch && s>=44 && s<60 && r.distance<5)height=s<49?(s-44)*.4:s<53?2:Math.max(0,2-(s-53)*.29);
  if(!r.branch && s>=92 && s<105 && r.distance<5){height=.14+.13*Math.sin(s*3);kind='wash';}
  if(!r.branch && s>=135 && s<145 && r.distance<5)kind='mud';
  if(r.branch && r.distance<2.8)height=Math.max(0,1.3-Math.abs(r.t-.5)*4)*(r.index===0?1:0);
  return {height,kind,road:r};
}
export const pickupSpawns = [25,70,110,150,180].map((index,i)=>({id:i,kind:i%2?'traction':'nitro',x:route[index]!.x,z:route[index]!.z}));
export function gridPose(number: number) {const g=gates[0]!,back=number>2?7:3,side=number%2?-1.7:1.7;return {x:g.x-g.tx*back+g.tz*side,z:g.z-g.tz*back-g.tx*side,angle:Math.atan2(g.tx,g.tz)};}
