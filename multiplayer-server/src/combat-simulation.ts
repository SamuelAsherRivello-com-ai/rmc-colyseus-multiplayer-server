import type { Position, Tank, Shell, Control } from '../packages/client/combat-rules.js';
export interface CombatPerson {id: string;slot: number;connected: boolean;ready: boolean;waiting: boolean;seq: number;ack: number;input: Control;received: number}
export interface CombatTank extends Tank {score: number;protection: number;cooldown: number;ack: number;ackTick: number}
export interface CombatShell extends Shell {id: number;seq: number}
type Difficulty = "low" | "medium" | "high";
type CombatEvent = {id: number;tick: number;type: string} & Record<string, unknown>;
import { ARENAS,TUNING,neutral,moveTank,advanceShell,navigation,rayRect } from '../packages/client/combat-rules.js';
const wrap=(a: number)=>(a+Math.PI*3)%(Math.PI*2)-Math.PI;
export class CombatBrain {
 seed: number;next: number;controls: Control;last: Position | null;stuck: number;nav: ReturnType<typeof navigation> | null;aim?: number;wantFire?: boolean;arena?: string;
 constructor(seed=1){this.seed=seed>>>0;this.next=0;this.controls=neutral();this.last=null;this.stuck=0;this.nav=null;}
 steer(t: Tank){if(this.aim===undefined)return this.controls;const error=wrap(this.aim-t.angle);this.controls.turn=Math.abs(error)>.045?Math.sign(error):0;this.controls.fire=!!this.wantFire&&Math.abs(error)<.09;return this.controls;}
 random(){let x=this.seed||1;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x>>>0;return this.seed/4294967296;}
 decide(t: Tank,world: CombatSimulation,level: Difficulty){
  if(world.clock<this.next)return this.steer(t);
  const period={low:.5,medium:.22,high:.12}[level];this.next=world.clock+period;
  const arena=ARENAS[world.arena]!;if(this.arena!==world.arena){this.arena=world.arena;this.nav=navigation(arena);}
  const targets=world.tanks.filter(o=>o.slot!==t.slot&&o.dead<=0).sort((a,b)=>Math.hypot(a.x-t.x,a.y-t.y)-Math.hypot(b.x-t.x,b.y-t.y));
  if(!targets.length)return this.controls=neutral();
  const target=targets[0]!,direct=Math.atan2(target.y-t.y,target.x-t.x);
  const visible=!arena.walls.some(w=>rayRect(t.x,t.y,target.x-t.x,target.y-t.y,w,2));
  let aim=direct,canShoot=visible;
  if(!visible&&level==='high'&&world.mode==='ricochet'){
   const candidates=[direct];
   for(const w of arena.walls.slice(0,6)){
    candidates.push(Math.atan2(target.y-t.y,2*w.x-target.x-t.x),Math.atan2(target.y-t.y,2*(w.x+w.w)-target.x-t.x),Math.atan2(2*w.y-target.y-t.y,target.x-t.x),Math.atan2(2*(w.y+w.h)-target.y-t.y,target.x-t.x));
   }
   for(const a of candidates.slice(0,25)){
    const s={x:t.x+Math.cos(a)*9,y:t.y+Math.sin(a)*9,vx:Math.cos(a)*TUNING.shellSpeed,vy:Math.sin(a)*TUNING.shellSpeed,owner:t.slot,bounces:0,life:TUNING.shotLife};
    let bank=false;
    for(let i=0;i<40;i++){const hit=advanceShell(s,.1,arena,world.tanks,'ricochet');if(hit){bank=hit.victim===target.slot&&s.bounces>0;break;}}
    if(bank){aim=a;canShoot=true;break;}
   }
  }
  let drive=1;
  if(!canShoot){const route=this.nav!.route(t,target);const next=route.find(p=>Math.hypot(p.x-t.x,p.y-t.y)>10)||target;aim=Math.atan2(next.y-t.y,next.x-t.x);}
  else if(Math.hypot(target.x-t.x,target.y-t.y)<68)drive=0;
  const noise={low:.22,medium:.07,high:.02}[level]*(this.random()*2-1);
  const error=wrap(aim+noise-t.angle);let turn=Math.abs(error)>.08?Math.sign(error):0;
  if(Math.abs(error)>1.2)drive=0;
  if(this.last&&Math.hypot(t.x-this.last.x,t.y-this.last.y)<1&&this.controls.drive!==0)this.stuck+=period;else this.stuck=0;
  this.last={x:t.x,y:t.y};
  if(this.stuck>.7){drive=-1;turn=t.slot%2?1:-1;aim=t.angle+turn*.8;canShoot=false;if(this.stuck>1.6)this.stuck=0;}
  if(level!=='low')for(const s of world.shells){if(s.owner===t.slot&&s.bounces===0)continue;const dx=t.x-s.x,dy=t.y-s.y,near=dx*s.vx+dy*s.vy>0&&Math.hypot(dx,dy)<(level==='high'?48:28);if(near){drive=1;turn=Math.sign(Math.cos(t.angle)*dy-Math.sin(t.angle)*dx)||1;aim=t.angle+turn*.8;canShoot=false;break;}}
  this.aim=aim+noise;this.wantFire=canShoot;this.controls={drive,turn,fire:canShoot&&Math.abs(error)<(level==='low'?.2:.11)};return this.steer(t);
 }
}
export class CombatSimulation {
 code: string;players: Map<string, CombatPerson>;phase: string;mode: string;arena: string;difficulty: Difficulty;clock: number;tick: number;remaining: number;countdown: number;shotId: number;match: number;winners: number[];shells: CombatShell[];events: CombatEvent[];eventId: number;tanks: CombatTank[];brains: CombatBrain[];
 constructor(code='',seed=1741){
  this.code=code;this.players=new Map();this.phase='lobby';this.mode='classic';this.arena='open-yard';this.difficulty='medium';this.clock=0;this.tick=0;this.remaining=TUNING.matchSeconds;this.countdown=0;this.shotId=0;this.match=0;this.winners=[];this.shells=[];this.events=[];this.eventId=0;
  this.tanks=Array.from({length:4},(_,slot)=>this.newTank(slot));this.brains=this.tanks.map(t=>new CombatBrain(seed+t.slot*713));
 }
 newTank(slot: number): CombatTank {return {slot,...ARENAS[this.arena]!.spawns[slot]!,score:0,dead:0,protection:0,cooldown:0,ack:-1,ackTick:0};}
 get hostId(){return [...this.players.values()].find(p=>p.connected)?.id??null;}
 add(id: string){if(this.players.has(id))return true;const slot=[0,1,2,3].find(n=>![...this.players.values()].some(p=>p.slot===n));if(slot===undefined)return false;this.players.set(id,{id,slot,connected:true,ready:false,waiting:this.phase==='playing'||this.phase==='countdown',seq:-1,ack:-1,input:neutral(),received:-Infinity});return true;}
 remove(id: string){this.players.delete(id);this.checkReady();}
 connected(id: string,value: boolean){const p=this.players.get(id);if(p){p.connected=value;p.input=neutral();p.received=-Infinity;if(!value)p.ready=false;}this.checkReady();}
 configure(id: string,value: unknown){const data=value && typeof value==='object' ? value as Record<string, unknown> : null;if(id!==this.hostId||!['lobby','results'].includes(this.phase)||!data||typeof data!=='object')return false;let changed=false;
  if(typeof data.mode==='string' && ['classic','ricochet'].includes(data.mode)){this.mode=data.mode;changed=true;}
  if(typeof data.arena==='string' && Object.hasOwn(ARENAS,data.arena)){this.arena=data.arena;changed=true;}
  if(typeof data.difficulty==='string' && ['low','medium','high'].includes(data.difficulty)){this.difficulty=data.difficulty as Difficulty;changed=true;}
  if(changed){for(const p of this.players.values())p.ready=false;if(this.phase==='lobby')this.tanks=this.tanks.map(t=>this.newTank(t.slot));}return changed;
 }
 ready(id: string){const p=this.players.get(id);if(!p?.connected||!['lobby','results'].includes(this.phase))return;p.ready=!p.ready;this.checkReady();}
 checkReady(){const people=[...this.players.values()].filter(p=>p.connected);if(['lobby','results'].includes(this.phase)&&people.length&&people.every(p=>p.ready))this.reset();}
 reset(){this.match++;this.phase='countdown';this.countdown=TUNING.countdown;this.remaining=TUNING.matchSeconds;this.winners=[];this.shells=[];this.events=[];this.tanks=this.tanks.map(t=>this.newTank(t.slot));
  for(const p of this.players.values()){p.waiting=false;p.ready=false;p.input=neutral();p.received=-Infinity;p.ack=p.seq;}
 }
 input(id: string,value: unknown){const data=value && typeof value==='object' ? value as Record<string, unknown> : null;const p=this.players.get(id);if(!p?.connected||p.waiting||this.phase!=='playing'||!data||typeof data!=='object')return false;
  if(typeof data.seq!=='number'||typeof data.drive!=='number'||typeof data.turn!=='number'||!Number.isSafeInteger(data.seq)||data.seq<0||data.seq>0x7fffffff||data.seq<=p.seq||![-1,0,1].includes(data.drive)||![-1,0,1].includes(data.turn)||typeof data.fire!=='boolean')return false;
  p.seq=data.seq;p.input={drive:data.drive,turn:data.turn,fire:data.fire};p.received=this.clock;return true;
 }
 emit(type: string,data: Record<string, unknown>){this.events.push({id:++this.eventId,tick:this.tick,type,...data});if(this.events.length>48)this.events.shift();}
 spawn(t: CombatTank){const arena=ARENAS[this.arena]!;const options=[...arena.spawns,...navigation(arena).open].map(p=>typeof p==='number'?{x:p%20*16+8,y:Math.floor(p/20)*16+8,angle:0}:p);
  const available=options.filter(p=>this.tanks.every(o=>o===t||o.dead>0||Math.hypot(p.x-o.x,p.y-o.y)>=TUNING.radius*2+2));
  if(!available.length){t.dead=1/TUNING.hz;return;}
  const best=available.reduce((a,b)=>{const score=(p: Position)=>Math.min(...this.tanks.filter(o=>o!==t&&o.dead<=0).map(o=>Math.hypot(p.x-o.x,p.y-o.y)),1000);return score(b)>score(a)?b:a;},available[0]!);
  t.x=best.x;t.y=best.y;t.angle=best.angle;t.dead=0;t.protection=TUNING.protection;this.emit('respawn',{slot:t.slot});
 }
 step(){
  if(![...this.players.values()].some(p=>p.connected))return;
  const dt=1/TUNING.hz;this.tick++;this.clock+=dt;
  if(this.phase==='countdown'){this.countdown=Math.max(0,this.countdown-dt);if(this.countdown<1e-8){this.phase='playing';this.emit('start',{});}return;}
  if(this.phase!=='playing')return;
  const arena=ARENAS[this.arena]!;
  for(const t of this.tanks){
   if(t.dead>0){t.dead=Math.max(0,t.dead-dt);if(t.dead<1e-8)this.spawn(t);continue;}
   t.protection=Math.max(0,t.protection-dt);t.cooldown=Math.max(0,t.cooldown-dt);
   const person=[...this.players.values()].find(p=>p.slot===t.slot&&p.connected&&!p.waiting);
   const controls=person?(this.clock-person.received<TUNING.inputExpiry?person.input:neutral()):this.brains[t.slot]!.decide(t,this,this.difficulty);
   moveTank(t,controls,dt,arena,this.tanks);
   if(person){person.ack=person.seq;t.ack=person.ack;t.ackTick=this.tick;}
   if(controls.fire&&t.cooldown<1e-8&&this.shells.filter(s=>s.owner===t.slot).length<TUNING.shotCap){
    const x=t.x+Math.cos(t.angle)*9,y=t.y+Math.sin(t.angle)*9;t.cooldown=TUNING.cooldown;t.protection=0;
    // A muzzle inside a wall consumes the shot instead of spawning beyond solid cover.
    const muzzleHit=arena.walls.some(w=>rayRect(t.x,t.y,x-t.x,y-t.y,w,TUNING.shellRadius));
    const shot={id:++this.shotId,owner:t.slot,seq:person?.seq??-1,x,y,vx:Math.cos(t.angle)*TUNING.shellSpeed,vy:Math.sin(t.angle)*TUNING.shellSpeed,bounces:0,life:TUNING.shotLife};
    if(!muzzleHit)this.shells.push(shot);this.emit('fire',{slot:t.slot,shot:shot.id,seq:shot.seq});
   }
  }
  const impacts: {victim: number;time: number;shot: CombatShell}[]=[],removed=new Set<number>();
  for(const s of this.shells){const before=s.bounces,hit=advanceShell(s,dt,arena,this.tanks,this.mode);if(s.bounces>before)this.emit('bounce',{shot:s.id,x:s.x,y:s.y});if(hit){removed.add(s.id);if(hit.victim!==undefined)impacts.push({...hit,shot:s});}}
  impacts.sort((a,b)=>a.time-b.time||a.shot.id-b.shot.id);const destroyed=new Set();
  for(const hit of impacts){const t=this.tanks[hit.victim]!;if(t.protection>0||destroyed.has(t.slot))continue;destroyed.add(t.slot);t.dead=TUNING.respawn;
   const owner=this.tanks[hit.shot.owner]!;owner.score=owner.slot===t.slot?Math.max(0,owner.score-1):owner.score+1;this.emit('destroy',{slot:t.slot,owner:owner.slot,x:t.x,y:t.y});
  }
  this.shells=this.shells.filter(s=>!removed.has(s.id)&&!destroyed.has(s.owner));
  this.remaining=Math.max(0,this.remaining-dt);
  if(this.remaining<1e-7){this.remaining=0;this.phase='results';const top=Math.max(...this.tanks.map(t=>t.score));this.winners=this.tanks.filter(t=>t.score===top).map(t=>t.slot);for(const p of this.players.values())p.ready=false;this.emit('result',{winners:this.winners});}
 }
 snapshot(){return {protocol:1,rules:1,code:this.code,hostId:this.hostId,phase:this.phase,mode:this.mode,arena:this.arena,difficulty:this.difficulty,tick:this.tick,serverTime:this.clock,match:this.match,remaining:this.remaining,countdown:this.countdown,winners:[...this.winners],people:[...this.players.values()].map(({input,received,seq,...p})=>({...p})),tanks:this.tanks.map(t=>({...t,cpu:![...this.players.values()].some(p=>p.slot===t.slot&&p.connected&&!p.waiting)})),shells:this.shells.map(s=>({...s})),events:this.events.map(e=>({...e}))};}
}

