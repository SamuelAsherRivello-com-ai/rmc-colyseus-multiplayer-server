export interface Position {x: number;y: number}
export interface Wall extends Position {w: number;h: number}
export interface Arena {name: string;walls: Wall[];spawns: (Position & {angle: number})[]}
export interface Tank extends Position {slot: number;angle: number;dead: number}
export interface Shell extends Position {vx: number;vy: number;owner: number;bounces: number;life: number}
export interface Control {drive: number;turn: number;fire: boolean}
export interface SequencedControl extends Control {seq: number}
export type ShellImpact = {remove: true;victim?: never;time?: never} | {remove: true;victim: number;time: number};
type Collision = {time: number;wall: true;nx: number;ny: number;tank?: never} | {time: number;tank: Pick<Tank, "x" | "y" | "slot" | "dead">;wall?: never;nx?: never;ny?: never};
/** Combat rules v1. Browser-safe, pixels/seconds, continuous simulation coordinates. */
export const RULES_VERSION = 1;
export const TUNING = Object.freeze({ width:320,height:240,hz:60,radius:6,speed:47,reverseSpeed:32,turnSpeed:2.7,shellSpeed:134,shellRadius:1.5,cooldown:.48,shotCap:3,shotLife:4,bounces:3,matchSeconds:136,respawn:.6,protection:1,inputExpiry:.3,countdown:3 });
const rect=(x: number,y: number,w: number,h: number)=>({x,y,w,h});
const border=[rect(0,0,320,8),rect(0,232,320,8),rect(0,8,8,224),rect(312,8,8,224)];
const spawns=[{x:32,y:32,angle:Math.PI/4},{x:288,y:208,angle:-3*Math.PI/4},{x:288,y:32,angle:3*Math.PI/4},{x:32,y:208,angle:-Math.PI/4}];
export const ARENAS: Readonly<Record<string, Arena>> = Object.freeze({
 'open-yard':{name:'Open Yard',walls:[...border,rect(144,64,32,32),rect(144,144,32,32)],spawns},
 crossroads:{name:'Crossroads',walls:[...border,rect(64,56,64,16),rect(192,56,64,16),rect(64,168,64,16),rect(192,168,64,16),rect(152,96,16,48)],spawns},
 switchback:{name:'Switchback',walls:[...border,rect(72,48,16,96),rect(232,96,16,96),rect(120,96,80,16),rect(120,160,48,16),rect(152,48,48,16)],spawns}
});
export const neutral = () => ({drive:0,turn:0,fire:false});
export function validControl(value: unknown): value is SequencedControl { const v=value && typeof value==='object' ? value as Record<string, unknown> : null; return !!v && typeof v==='object' && typeof v.seq==='number' && typeof v.drive==='number' && typeof v.turn==='number' && Number.isSafeInteger(v.seq) && v.seq>=0 && v.seq<=0x7fffffff && [-1,0,1].includes(v.drive) && [-1,0,1].includes(v.turn) && typeof v.fire==='boolean'; }
export function blocked(x: number,y: number,walls: readonly Wall[],r: number=TUNING.radius) {return walls.some(w=>x>w.x-r&&x<w.x+w.w+r&&y>w.y-r&&y<w.y+w.h+r);}
export function moveTank(t: Tank,input: Pick<Control, "drive" | "turn">,dt: number,arena: Arena,tanks: readonly Pick<Tank, "x" | "y" | "slot" | "dead">[]=[]) {
 if(t.dead>0)return;
 t.angle=(t.angle+input.turn*TUNING.turnSpeed*dt+Math.PI*3)%(Math.PI*2)-Math.PI;
 const speed=input.drive*(input.drive<0?TUNING.reverseSpeed:TUNING.speed);
 const dx=Math.cos(t.angle)*speed*dt,dy=Math.sin(t.angle)*speed*dt;
 const occupied=(x: number,y: number)=>blocked(x,y,arena.walls)||tanks.some(o=>o!==t&&o.slot!==t.slot&&o.dead<=0&&Math.hypot(x-o.x,y-o.y)<TUNING.radius*2);
 if(!occupied(t.x+dx,t.y))t.x+=dx;
 if(!occupied(t.x,t.y+dy))t.y+=dy;
}
/** Swept point against inflated AABB. Ties flip both axes at corners. */
export function rayRect(x: number,y: number,dx: number,dy: number,w: Wall,r=0) {
 let enter=-Infinity,exit=Infinity,nx=0,ny=0;
 for(const axis of ['x','y'] as const) {
  const p=axis==='x'?x:y,d=axis==='x'?dx:dy,lo=w[axis]-r,hi=lo+(axis==='x'?w.w:w.h)+2*r;
  if(Math.abs(d)<1e-10){if(p<lo||p>hi)return null;continue;}
  let a=(lo-p)/d,b=(hi-p)/d,normal=d>0?-1:1;
  if(a>b)[a,b]=[b,a];
  if(a>enter+1e-9){enter=a;nx=axis==='x'?normal:0;ny=axis==='y'?normal:0;}
  else if(Math.abs(a-enter)<1e-9){if(axis==='x')nx=normal;else ny=normal;}
  exit=Math.min(exit,b);if(enter>exit)return null;
 }
 if(exit<0||enter>1||enter< -1e-7)return null;
 return {time:Math.max(0,enter),nx,ny};
}
function rayCircle(x: number,y: number,dx: number,dy: number,t: Position,r: number) {
 const a=dx*dx+dy*dy;if(a<1e-12)return null;
 const ox=x-t.x,oy=y-t.y,c=ox*ox+oy*oy-r*r;if(c<=0)return 0;
 const b=2*(ox*dx+oy*dy),disc=b*b-4*a*c;if(disc<0)return null;
 const v=(-b-Math.sqrt(disc))/(2*a);return v>=0&&v<=1?v:null;
}
/** Advance bounded segments. Returns an impact; the simulation applies all hits together. */
export function advanceShell(s: Shell,dt: number,arena: Arena,tanks: readonly Pick<Tank, "x" | "y" | "slot" | "dead">[],mode: string): ShellImpact | null {
 s.life-=dt;if(s.life<=0)return {remove:true};
 let left=dt,elapsed=0;
 for(let segment=0;segment<8&&left>1e-8;segment++) {
  const dx=s.vx*left,dy=s.vy*left;let hit: Collision | null=null;
  for(const wall of arena.walls){const v=rayRect(s.x,s.y,dx,dy,wall,TUNING.shellRadius);if(v){if(!hit||v.time<hit.time-1e-9)hit={...v,wall:true};else if(hit.wall&&Math.abs(v.time-hit.time)<1e-9){hit.nx ||= v.nx;hit.ny ||= v.ny;}};}
  for(const t of tanks){if(t.dead>0||(t.slot===s.owner&&s.bounces===0))continue;
   const time=rayCircle(s.x,s.y,dx,dy,t,TUNING.radius+TUNING.shellRadius);
   if(time!==null&&(!hit||time<hit.time))hit={time,tank:t};
  }
  if(!hit){s.x+=dx;s.y+=dy;return null;}
  s.x+=dx*hit.time;s.y+=dy*hit.time;elapsed+=left*hit.time;left*=1-hit.time;
  if(hit.tank)return {remove:true,victim:hit.tank.slot,time:elapsed};
  if(!hit.wall) return null;
  if(mode==='classic'||s.bounces>=TUNING.bounces)return {remove:true};
  if(hit.nx)s.vx=-s.vx;if(hit.ny)s.vy=-s.vy;s.bounces++;
  s.x+=hit.nx*.001;s.y+=hit.ny*.001;
 }
 return left>1e-8?{remove:true}:null;
}
/** Grid BFS over tank-clearance cells: finite 20x15 graph. */
export function navigation(arena: Arena) {
 const cells: number[]=[];for(let y=0;y<15;y++)for(let x=0;x<20;x++)if(!blocked(x*16+8,y*16+8,arena.walls,7))cells.push(y*20+x);
 const open=new Set(cells);
 return {open,route(from: Position,to: Position){
  const nearest=(p: Position)=>cells.reduce((a,b)=>Math.hypot(b%20*16+8-p.x,Math.floor(b/20)*16+8-p.y)<Math.hypot(a%20*16+8-p.x,Math.floor(a/20)*16+8-p.y)?b:a,cells[0]!); // Every supported arena has navigable cells.
  const start=nearest(from),goal=nearest(to),queue=[start],prev=new Map<number, number | null>([[start,null]]);
  for(let i=0;i<queue.length&&queue.length<=300;i++){const n=queue[i]!;if(n===goal)break;
   for(const m of [n-20,n+20,...(n%20>0?[n-1]:[]),...(n%20<19?[n+1]:[])])if(open.has(m)&&!prev.has(m)){prev.set(m,n);queue.push(m);}
  }
  if(!prev.has(goal))return [];
  const path=[];for(let n=goal;n!==null;n=prev.get(n)!)path.unshift({x:n%20*16+8,y:Math.floor(n/20)*16+8});return path;
 }};
}

