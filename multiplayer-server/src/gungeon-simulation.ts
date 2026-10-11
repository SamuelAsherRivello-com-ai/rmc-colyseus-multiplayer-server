// Fixed palette/type indexes are bounded by selected seats and modulo-three enemy selection.
export const WEAPONS = ['pistol', 'scatter', 'carbine'] as const;
type Weapon = typeof WEAPONS[number];
type Input = { x:number;y:number;ax:number;ay:number;shoot:boolean;roll:boolean };
type Player = {id:string;number:number;name:string;color:string;x:number;y:number;hp:number;maxHp:number;weapon:Weapon;ready:boolean;cooldown:number;rollCooldown:number;rolling:number;shield:number;revive:number;damage:number;haste:number;speed:number;credits:number;kills:number;angle:number;burst:number;burstIn:number;lastInput:number;input:Input};
type Enemy = {id:number;kind:string;x:number;y:number;hp:number;maxHp:number;cooldown:number;angle:number};
type Shot = {id:number;owner:string;x:number;y:number;vx:number;vy:number;damage:number;enemy:boolean;life:number};
export const COVER = [{x:8,y:5,w:1.5,h:1.5},{x:22,y:5,w:1.5,h:1.5},{x:8,y:13,w:1.5,h:1.5},{x:22,y:13,w:1.5,h:1.5}];
const zero = ():Input => ({x:0,y:0,ax:1,ay:0,shoot:false,roll:false});
const distance = (a:{x:number;y:number},b:{x:number;y:number}) => Math.hypot(a.x-b.x,a.y-b.y);
export class GungeonSimulation {
  players=new Map<string,Player>(); enemies:Enemy[]=[]; shots:Shot[]=[];
  props:{id:number;x:number;y:number;hp:number}[]=[]; loot:{id:number;x:number;y:number}[]=[];
  phase='lobby'; wave=0; time=0; breakIn=0; serial=0; round=1; code='';
  event={serial:0,text:'Ready up to enter the vault'};
  constructor(public random:()=>number=Math.random){this.resetProps();}
  announce(text:string){this.event={serial:++this.serial,text};}
  resetProps(){this.props=[{id:1,x:5,y:8,hp:24},{id:2,x:25,y:10,hp:24},{id:3,x:14,y:4,hp:24},{id:4,x:16,y:14,hp:24}];}
  add(id:string){if(this.players.size>=4)return;const n=[1,2,3,4].find(n=>![...this.players.values()].some(p=>p.number===n))!;
    this.players.set(id,{id,number:n,name:['Copper','Mint','Violet','Gold'][n-1]!,color:['#ff8c64','#69e4c7','#bd9bff','#ffdb77'][n-1]!,x:14+(n%2)*2,y:8+Math.floor((n-1)/2)*2,hp:100,maxHp:100,weapon:'pistol',ready:this.phase!=='lobby',cooldown:0,rollCooldown:0,rolling:0,shield:3,revive:0,damage:1,haste:1,speed:1,credits:0,kills:0,angle:0,burst:0,burstIn:0,lastInput:-100,input:zero()});
  }
  remove(id:string){this.players.delete(id);this.shots=this.shots.filter(s=>s.owner!==id);if(this.phase==='combat'&&this.players.size&&![...this.players.values()].some(p=>p.hp>0)){this.phase='defeat';this.announce('The team has fallen');}}
  disconnect(id:string){const player=this.players.get(id);if(player){player.input=zero();player.lastInput=-100;}}
  replaceDisconnected(id:string,nextId:string){const player=this.players.get(id);if(!player||this.players.has(nextId))return false;this.players.delete(id);player.id=nextId;player.input=zero();player.lastInput=-100;this.players.set(nextId,player);for(const shot of this.shots)if(shot.owner===id)shot.owner=nextId;return true;}
  input(id:string,data:unknown){const p=this.players.get(id);const d=data as Input;if(!p||!d||typeof d!=='object'||!['x','y','ax','ay'].every(k=>typeof d[k as keyof Input]==='number'&&Number.isFinite(d[k as keyof Input])&&Math.abs(d[k as keyof Input] as number)<=1)||typeof d.shoot!=='boolean'||typeof d.roll!=='boolean')return;
    p.input={x:d.x,y:d.y,ax:d.ax,ay:d.ay,shoot:d.shoot,roll:d.roll};p.lastInput=this.time;
  }
  select(id:string,weapon:unknown){const p=this.players.get(id);if(p&&WEAPONS.includes(weapon as Weapon)&&this.phase==='lobby')p.weapon=weapon as Weapon;}
  ready(id:string){const p=this.players.get(id);if(!p||this.phase!=='lobby')return;p.ready=!p.ready;if(this.players.size&&[...this.players.values()].every(p=>p.ready))this.nextWave();}
  upgrade(id:string,kind:unknown){const p=this.players.get(id);if(!p||this.phase!=='break'||p.credits<=0||!['damage','haste','vitality','agility'].includes(kind as string))return;p.credits--;if(kind==='damage')p.damage=Math.min(3,p.damage+.2);if(kind==='haste')p.haste=Math.min(2,p.haste+.15);if(kind==='vitality'){p.maxHp=Math.min(200,p.maxHp+15);p.hp=Math.min(p.maxHp,p.hp+40);}if(kind==='agility')p.speed=Math.min(1.6,p.speed+.1);}
  restart(id:string){const leader=[...this.players.values()].sort((a,b)=>a.number-b.number)[0];if(this.phase!=='defeat'||leader?.id!==id)return;const old=[...this.players.values()].map(p=>({id:p.id,weapon:p.weapon}));this.players.clear();this.enemies=[];this.shots=[];this.loot=[];this.wave=0;this.round++;this.phase='lobby';this.resetProps();for(const p of old){this.add(p.id);this.players.get(p.id)!.weapon=p.weapon;}this.announce('Fresh run — ready up');}
  blocked(x:number,y:number,r=.32){return x<1+r||x>29-r||y<1+r||y>17-r||COVER.some(c=>Math.abs(x-c.x)<c.w/2+r&&Math.abs(y-c.y)<c.h/2+r)||this.props.some(c=>c.hp>0&&Math.abs(x-c.x)<.5+r&&Math.abs(y-c.y)<.5+r);}
  move(body:{x:number;y:number},dx:number,dy:number,r=.32){if(!this.blocked(body.x+dx,body.y,r))body.x+=dx;if(!this.blocked(body.x,body.y+dy,r))body.y+=dy;}
  nextWave(){this.wave++;this.phase='combat';this.shots=[];const count=Math.min(32,3+this.wave*2+(this.players.size-1)*3);const boss=this.wave%5===0;
    for(let i=0;i<count+(boss?1:0);i++){const kind=boss&&i===0?'boss':['chaser','gunner','radial'][i%3]!;const hp=kind==='boss'?240+80*this.players.size+20*this.wave:18+this.wave*3+this.players.size*3;let x=2+this.random()*26,y=this.random()>.5?2:16;for(let j=0;j<20&&this.blocked(x,y,.5);j++)x=2+this.random()*26;
      this.enemies.push({id:++this.serial,kind,x,y,hp,maxHp:hp,cooldown:1+this.random(),angle:0});}
    this.announce(boss?`Wave ${this.wave} — THE CLOCKWORK WARDEN`:`Wave ${this.wave} — hold the vault`);
  }
  shot(owner:string,x:number,y:number,angle:number,speed:number,damage:number,enemy:boolean){if(this.shots.length>=360)return;this.shots.push({id:++this.serial,owner,x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,damage,enemy,life:3});}
  fire(p:Player){const angle=p.angle;if(p.weapon==='scatter'){for(const spread of [-.22,-.11,0,.11,.22])this.shot(p.id,p.x,p.y,angle+spread,18,8*p.damage,false);p.cooldown=.65/p.haste;}else{this.shot(p.id,p.x,p.y,angle,23,(p.weapon==='pistol'?20:11)*p.damage,false);p.cooldown=(p.weapon==='pistol'?.28:.55)/p.haste;if(p.weapon==='carbine'){p.burst=2;p.burstIn=.07;}}}
  hurt(p:Player,damage:number){if(p.shield>0||p.rolling>0||p.hp<=0)return;p.hp=Math.max(0,p.hp-damage);p.shield=.7;if(p.hp===0){p.burst=0;p.revive=0;this.announce(`${p.name} is down — stand nearby to revive`);}}
  step(dt:number){dt=Math.max(0,Math.min(dt,.05));this.time+=dt;if(!this.players.size)return;
    if(this.phase==='break'){this.breakIn-=dt;if(this.breakIn<=0)this.nextWave();}if(this.phase!=='combat'&&this.phase!=='break')return;
    for(const p of this.players.values()){p.cooldown=Math.max(0,p.cooldown-dt);p.rollCooldown=Math.max(0,p.rollCooldown-dt);p.rolling=Math.max(0,p.rolling-dt);p.shield=Math.max(0,p.shield-dt);if(p.hp<=0)continue;const i=this.time-p.lastInput<=.3?p.input:zero();const norm=Math.max(1,Math.hypot(i.x,i.y));if(Math.hypot(i.ax,i.ay)>.01)p.angle=Math.atan2(i.ay,i.ax);
      if(i.roll&&p.rollCooldown===0&&this.phase==='combat'){p.rolling=.28;p.rollCooldown=1.4;}
      const speed=5*p.speed*(p.rolling>0?2.5:1);this.move(p,i.x/norm*speed*dt,i.y/norm*speed*dt);
      if(this.phase==='combat'){if(i.shoot&&p.cooldown===0&&p.rolling===0)this.fire(p);if(p.burst>0){p.burstIn-=dt;if(p.burstIn<=0){this.shot(p.id,p.x,p.y,p.angle,23,11*p.damage,false);p.burst--;p.burstIn=.07;}}}
    }
    for(const p of this.players.values()){if(p.hp>0)continue;const ally=[...this.players.values()].some(a=>a.hp>0&&distance(a,p)<1.35);p.revive=ally?p.revive+dt:0;if(p.revive>=2){p.hp=p.maxHp*.45;p.shield=2;p.revive=0;this.announce(`${p.name} is back in the fight`);}}
    const living=[...this.players.values()].filter(p=>p.hp>0);if(!living.length){this.phase='defeat';this.shots=[];this.announce(`Team down on wave ${this.wave}`);return;}
    if(this.phase==='combat')for(const e of this.enemies){const target=living.reduce((a,b)=>distance(e,a)<distance(e,b)?a:b);const angle=Math.atan2(target.y-e.y,target.x-e.x);e.angle=angle;e.cooldown-=dt;
      const speed=e.kind==='chaser'?2.5:e.kind==='boss'?1:1.2;if(distance(e,target)>(e.kind==='chaser'?.55:5))this.move(e,Math.cos(angle)*speed*dt,Math.sin(angle)*speed*dt,e.kind==='boss'?.65:.3);
      if(distance(e,target)<(e.kind==='boss'?1:.6))this.hurt(target,(e.kind==='boss'?24:12)+this.players.size*2);
      if(e.kind!=='chaser'&&e.cooldown<=0){if(e.kind==='radial'||e.kind==='boss'){const n=e.kind==='boss'?16:8;for(let k=0;k<n;k++)this.shot('enemy',e.x,e.y,k*Math.PI*2/n+this.time*.4,e.kind==='boss'?6:5,10+this.wave+this.players.size,true);}else this.shot('enemy',e.x,e.y,angle,8,12+this.wave,true);e.cooldown=Math.max(.5,2.2-this.wave*.04);}
    }
    for(const s of this.shots){const dx=s.vx*dt,dy=s.vy*dt;const steps=Math.ceil(Math.hypot(dx,dy)/.15);for(let n=0;n<steps&&s.life>0;n++){s.x+=dx/steps;s.y+=dy/steps;
        const prop=this.props.find(p=>p.hp>0&&Math.abs(s.x-p.x)<.55&&Math.abs(s.y-p.y)<.55);if(prop){prop.hp-=s.damage;s.life=0;continue;}if(this.blocked(s.x,s.y,.08)){s.life=0;continue;}
        if(s.enemy){const p=living.find(p=>distance(p,s)<.38);if(p){this.hurt(p,s.damage);s.life=0;}}else{const e=this.enemies.find(e=>e.hp>0&&distance(e,s)<(e.kind==='boss'?.8:.4));if(e){e.hp-=s.damage;s.life=0;if(e.hp<=0){const p=this.players.get(s.owner);if(p)p.kills++;this.loot.push({id:++this.serial,x:e.x,y:e.y});}}}
      }s.life-=dt;}
    this.shots=this.shots.filter(s=>s.life>0);this.enemies=this.enemies.filter(e=>e.hp>0);this.props=this.props.filter(p=>p.hp>0);
    this.loot=this.loot.filter(l=>{if(!living.some(p=>distance(p,l)<.9))return true;for(const p of living)p.hp=Math.min(p.maxHp,p.hp+2);return false;}).slice(-100);
    if(this.phase==='combat'&&!this.enemies.length){this.phase='break';this.breakIn=10;this.shots=[];for(const p of this.players.values()){p.credits++;p.hp=Math.max(p.hp,Math.min(p.maxHp,p.hp+15));p.shield=2;}this.announce('Vault secured — choose a shared reward');}
  }
  snapshot(){return {code:this.code,phase:this.phase,wave:this.wave,time:this.time,round:this.round,breakIn:this.breakIn,width:30,height:18,cover:COVER,players:[...this.players.values()].map(({input,lastInput,...p})=>({...p})),enemies:this.enemies.map(e=>({...e})),shots:this.shots.map(s=>({...s})),props:this.props.map(p=>({...p})),loot:this.loot.map(l=>({...l})),event:{...this.event}};}
}
