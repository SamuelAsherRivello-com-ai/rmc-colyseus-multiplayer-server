export interface RacingControl { steer: number; throttle: number; brake: boolean; boost: boolean; recover: boolean }
export interface Truck extends RacingControlPosition { id: string; number: number; name: string; color: string; bot: boolean; vx: number; vz: number; y: number; vy: number; grounded: boolean; nitro: number; traction: number; boosting: boolean; laps: number; nextGate: number; checkpointCount: number; finish: number | null; recovery: number; recoverAt: number; lastGround: number; input: RacingControl; inputAt: number; ack: number; penalty: number }
interface RacingControlPosition { x: number; z: number; angle: number }
export interface RacingPerson { id: string; number: number; name: string; color: string; ready: boolean }
import {TRACK,COLORS,route,gates,gateIndices,pickupSpawns,clamp,angleDelta,nearestOn,terrainAt,gridPose} from './racing-track.js';
export const NEUTRAL = Object.freeze({steer:0,throttle:0,brake:false,boost:false,recover:false});
export function makeTruck(id: string,number: number,bot=false,name=`Racer ${number}`): Truck {return {id,number,name,color:COLORS[number-1]!,bot,...gridPose(number),vx:0,vz:0,y:0,vy:0,grounded:true,nitro:3,traction:0,boosting:false,laps:0,nextGate:1,checkpointCount:0,finish:null,recovery:0,recoverAt:-10,lastGround:0,input:{...NEUTRAL},inputAt:-10,ack:-1,penalty:0};}
export function driveTruck(p: Truck,input: RacingControl,dt: number) {
  const speed=Math.hypot(p.vx,p.vz),ground=terrainAt(p.x,p.z),mud=ground.kind==='mud'&&p.traction<=0;
  p.traction=Math.max(0,p.traction-dt);p.recovery=Math.max(0,p.recovery-dt);
  if(p.recovery>0){p.vx=0;p.vz=0;return;}
  const forward=p.vx*Math.sin(p.angle)+p.vz*Math.cos(p.angle),back=forward<-.3?-1:1;
  p.angle+=input.steer*2.5*clamp(speed/5,.2,1)*back*dt;
  p.boosting=input.boost&&p.nitro>0&&input.throttle>0&&p.grounded;
  if(p.boosting)p.nitro=Math.max(0,p.nitro-dt);
  let acceleration=input.throttle*16+(p.boosting?22:0);
  if(input.brake)acceleration=forward>1?-25:-8;
  if(mud)acceleration*=.55;
  p.vx+=Math.sin(p.angle)*acceleration*dt;p.vz+=Math.cos(p.angle)*acceleration*dt;
  const lateral=p.vx*Math.cos(p.angle)-p.vz*Math.sin(p.angle),grip=p.grounded?(p.traction>0?12:mud?2.5:5.4):.3;
  p.vx-=Math.cos(p.angle)*lateral*(1-Math.exp(-grip*dt));p.vz+=Math.sin(p.angle)*lateral*(1-Math.exp(-grip*dt));
  const drag=Math.exp(-(mud?1.2:.65)*dt);p.vx*=drag;p.vz*=drag;
  const v=Math.hypot(p.vx,p.vz),max=p.boosting?24:mud?10:17;if(v>max){p.vx*=max/v;p.vz*=max/v;}
  p.x+=p.vx*dt;p.z+=p.vz*dt;
  const after=terrainAt(p.x,p.z),r=after.road,limit=r.width-.75;
  if(r.distance>limit){const nx=(p.x-r.x)/(r.distance||1),nz=(p.z-r.z)/(r.distance||1);p.x=r.x+nx*limit;p.z=r.z+nz*limit;const impact=p.vx*nx+p.vz*nz;if(impact>0){p.vx-=nx*impact*1.35;p.vz-=nz*impact*1.35;}}
  if(p.grounded){if(p.lastGround>after.height+.08&&speed>9){p.grounded=false;p.vy=3.3;p.y=p.lastGround;}else p.y=after.height;}
  if(!p.grounded){p.vy-=10*dt;p.y+=p.vy*dt;if(p.y<=after.height){p.y=after.height;p.vy=0;p.grounded=true;}}
  p.lastGround=after.height;
}
export function aiInput(p: Truck) {const n=nearestOn(route,p.x,p.z),target=route[(n.index+6)%route.length]!,desired=Math.atan2(target.x-p.x,target.z-p.z),diff=angleDelta(desired,p.angle);return {steer:clamp(diff*1.8,-1,1),throttle:Math.abs(diff)>1.1?.35:.9,brake:false,boost:Math.abs(diff)<.12&&p.nitro>1,recover:false};}
export class RacingSimulation {
  time: number; phase: string; round: number; until: number; raceTime: number; finishAt: number;
  people: Map<string, RacingPerson>; trucks: Truck[]; pickups: (typeof pickupSpawns[number] & {respawn: number})[]; event: {serial: number; text: string};
  constructor(){this.time=0;this.phase='waiting';this.round=1;this.until=0;this.raceTime=0;this.finishAt=120;this.people=new Map();this.trucks=[];this.pickups=pickupSpawns.map(p=>({...p,respawn:0}));this.event={serial:0,text:'Ready up for Copper Basin'};}
  emit(text: string){this.event={serial:this.event.serial+1,text};}
  add(id: string){if(this.people.size>=4)return null;let number=1;while([...this.people.values()].some(p=>p.number===number))number++;const p={id,number,name:`Racer ${number}`,color:COLORS[number-1]!,ready:false};this.people.set(id,p);return p;}
  remove(id: string){this.people.delete(id);const t=this.trucks.find(p=>p.id===id);if(t){t.bot=true;t.name=`AI ${t.number}`;t.input={...NEUTRAL};}if(!this.people.size){this.phase='waiting';this.trucks=[];}}
  ready(id: string,value: unknown){const p=this.people.get(id);if(this.phase!=='waiting'||!p||typeof value!=='boolean')return false;p.ready=value;return true;}
  start(id: string){const list=[...this.people.values()].sort((a,b)=>a.number-b.number);if(this.phase!=='waiting'||!list.length||list[0]!.id!==id||list.some(p=>!p.ready))return false;this.trucks=Array.from({length:4},(_,i)=>{const person=list.find(p=>p.number===i+1);return makeTruck(person?.id||`ai-${this.round}-${i+1}`,i+1,!person,person?.name||`AI ${i+1}`);});this.phase='countdown';this.until=this.time+3;this.raceTime=0;this.finishAt=120;this.pickups=pickupSpawns.map(p=>({...p,respawn:0}));this.emit('Engines ready — race starts in three');return true;}
  input(id: string,value: unknown){const data=value && typeof value === 'object' ? value as Record<string, unknown> : null;const p=this.trucks.find(p=>p.id===id&&!p.bot);if(!p||this.phase!=='racing'||!data||typeof data.seq!=='number'||typeof data.steer!=='number'||typeof data.throttle!=='number'||typeof data.brake!=='boolean'||typeof data.boost!=='boolean'||typeof data.recover!=='boolean'||!Number.isSafeInteger(data.seq)||data.seq<0||data.seq<=p.ack||!Number.isFinite(data.steer)||Math.abs(data.steer)>1||!Number.isFinite(data.throttle)||data.throttle<0||data.throttle>1||!['brake','boost','recover'].every(k=>typeof data[k]==='boolean'))return false;p.input={steer:data.steer,throttle:data.throttle,brake:data.brake,boost:data.boost,recover:data.recover};p.inputAt=this.time;p.ack=data.seq;return true;}
  recover(p: Truck){if(this.raceTime-p.recoverAt<4||p.finish!==null)return;const last=(p.nextGate+4)%5,g=gates[last]!;p.x=g.x+g.tx*2;p.z=g.z+g.tz*2;p.angle=Math.atan2(g.tx,g.tz);p.vx=0;p.vz=0;p.y=terrainAt(p.x,p.z).height;p.vy=0;p.grounded=true;p.recovery=1.25;p.penalty+=1.25;p.recoverAt=this.raceTime;this.emit(`${p.name} recovered`);}
  checkpoint(p: Truck,old: {x: number;z: number}){const g=gates[p.nextGate]!,before=(old.x-g.x)*g.tx+(old.z-g.z)*g.tz,after=(p.x-g.x)*g.tx+(p.z-g.z)*g.tz,side=Math.abs((p.x-g.x)*g.tz-(p.z-g.z)*g.tx);if(before<0&&after>=0&&side<5&&Math.hypot(p.x-old.x,p.z-old.z)<3){p.checkpointCount++;if(p.nextGate===0){p.laps++;if(p.laps>=3){p.finish=this.raceTime;this.finishAt=Math.min(this.finishAt,this.raceTime+15);this.emit(`${p.name} finished!`);}}p.nextGate=(p.nextGate+1)%5;}}
  step(dt: number){dt=clamp(dt,0,1/15);this.time+=dt;if(this.phase==='countdown'){if(this.time>=this.until){this.phase='racing';this.emit('GO!');}return;}if(this.phase==='results'){if(this.time>=this.until){this.phase='waiting';this.round++;for(const p of this.people.values())p.ready=false;this.trucks=[];this.emit('Ready for another race');}return;}if(this.phase!=='racing')return;this.raceTime+=dt;
    for(const p of this.trucks){if(p.finish!==null){p.vx*=.9;p.vz*=.9;p.boosting=false;continue;}let input=p.bot?aiInput(p):this.time-p.inputAt<.3?p.input:NEUTRAL;if(input.recover)this.recover(p);const old={x:p.x,z:p.z};driveTruck(p,input,dt);if(p.recovery<=0)this.checkpoint(p,old);}
    for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){const a=this.trucks[i],b=this.trucks[j];if(!a||!b||a.recovery>0||b.recovery>0||a.finish!==null||b.finish!==null||Math.abs(a.y-b.y)>1)continue;const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d<1.8){const nx=d?dx/d:1,nz=d?dz/d:0,overlap=(1.8-d)*.5;a.x-=nx*overlap;a.z-=nz*overlap;b.x+=nx*overlap;b.z+=nz*overlap;const impact=(a.vx-b.vx)*nx+(a.vz-b.vz)*nz;if(impact>0){a.vx-=nx*impact*.7;a.vz-=nz*impact*.7;b.vx+=nx*impact*.7;b.vz+=nz*impact*.7;}}}
    for(const item of this.pickups){item.respawn=Math.max(0,item.respawn-dt);if(item.respawn>0)continue;const p=this.trucks.find(t=>t.finish===null&&t.recovery<=0&&Math.hypot(t.x-item.x,t.z-item.z)<1.7&&Math.abs(t.y-terrainAt(item.x,item.z).height)<1.5);if(p){if(item.kind==='nitro')p.nitro=Math.min(5,p.nitro+1.5);else p.traction=5;item.respawn=8;this.emit(`${p.name} collected ${item.kind}`);}}
    if(this.raceTime>=this.finishAt||this.trucks.every(p=>p.finish!==null)){this.phase='results';this.until=this.time+8;this.emit('Race complete — results');}
  }
  ranking(){const progress=(p: Truck)=>{const n=nearestOn(route,p.x,p.z),last=(p.nextGate+4)%5,start=gateIndices[last]!,end=p.nextGate===0?200:gateIndices[p.nextGate]!,index=n.index+n.t;const normalized=index<start?index+200:index;return p.checkpointCount+clamp((normalized-start)/(end-start),0,.999);};return [...this.trucks].sort((a,b)=>a.finish!==null&&b.finish!==null?a.finish-b.finish||a.number-b.number:a.finish!==null?-1:b.finish!==null?1:progress(b)-progress(a)||a.number-b.number).map(p=>p.id);}
  snapshot(){return {trackVersion:TRACK.version,phase:this.phase,round:this.round,time:this.time,raceTime:this.raceTime,remaining:Math.max(0,this.finishAt-this.raceTime),countdown:Math.max(0,this.until-this.time),people:[...this.people.values()].map(p=>({...p})),trucks:this.trucks.map(({input,inputAt,...p})=>({...p})),pickups:this.pickups.map(p=>({...p})),ranking:this.ranking(),event:{...this.event}};}
}
