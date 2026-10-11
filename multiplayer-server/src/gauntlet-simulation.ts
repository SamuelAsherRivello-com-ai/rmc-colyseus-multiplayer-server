// Palette indexes use a free seat selected from 0..3 after the capacity check.
export const CLASSES = {
  warrior: { speed: 3.5, damage: 36, rate: .42, health: 160, armor: 1, range: 6 },
  valkyrie: { speed: 3.8, damage: 25, rate: .36, health: 140, armor: .6, range: 7 },
  wizard: { speed: 3.5, damage: 30, rate: .46, health: 110, armor: 1, range: 8 },
  elf: { speed: 4.5, damage: 19, rate: .23, health: 100, armor: 1, range: 9 },
} as const;
export type ClassName = keyof typeof CLASSES;
export const COLORS = ['#49d9ff', '#ff719c', '#ffcf5a', '#a995ff'];
export const LEVEL = [
 '#####################',
 '#...................#',
 '#...................#',
 '#.....#.......#.....#',
 '#.....#.......#.....#',
 '#.....#.......#.....#',
 '#.....###...###.....#',
 '#...................#',
 '#...................#',
 '####...#######...####',
 '#...................#',
 '#...................#',
 '#....###.....###....#',
 '#...................#',
 '#...................#',
 '####...#######...####',
 '#...................#',
 '#...................#',
 '#.....###...###.....#',
 '#.....#.......#.....#',
 '#.....#.......#.....#',
 '#...................#',
 '#...................#',
 '#...................#',
 '#####################',
];
type Input = { x: number; z: number; attack: boolean; magic: boolean; at: number };
type Player = { id: string; number: number; name: string; color: string; className: ClassName; x: number; z: number; angle: number; hp: number; maxHp: number; cooldown: number; magicCooldown: number; shield: number; score: number; input: Input };
type Enemy = { id: string; kind: string; x: number; z: number; hp: number; maxHp: number; cooldown: number; angle: number };
type Shot = { id: number; owner: string; x: number; z: number; vx: number; vz: number; life: number; damage: number; hostile: boolean; kind: string };
const distance = (a: {x:number;z:number}, b: {x:number;z:number}) => Math.hypot(a.x-b.x,a.z-b.z);
export class GauntletSimulation {
  players = new Map<string, Player>(); enemies: Enemy[] = []; shots: Shot[] = [];
  generators: {id:string;kind:string;x:number;z:number;hp:number;maxHp:number;cooldown:number}[] = [];
  pickups: {id:string;kind:string;x:number;z:number}[] = [];
  blasts: {id:number;x:number;z:number;time:number;hostile:boolean}[] = [];
  time=0; serial=0; match=1; key=false; phase='playing'; event={serial:0,text:'Break four summoning altars. Find the key. Reach the north gate.'};
  constructor() { this.resetLevel(); }
  note(text:string) { this.event={serial:++this.serial,text}; }
  resetLevel() {
    this.enemies=[];this.shots=[];this.blasts=[];this.key=false;this.phase='playing';
    this.generators=[['ghost',3,18],['grunt',17,18],['demon',3,5],['lobber',17,5]].map(([kind,x,z],i)=>({id:'altar-'+i,kind:String(kind),x:Number(x),z:Number(z),hp:150,maxHp:150,cooldown:7}));
    for(const g of this.generators) {this.spawnEnemy(g.kind,g.x,g.z-1.4);this.spawnEnemy(g.kind,g.x+.8,g.z+1.3);}
    this.pickups=[['key',10,11],['food',4,13],['food',16,13],['food',10,20],['food',10,6],['treasure',2,10],['treasure',18,10],['treasure',10,3]].map(([kind,x,z],i)=>({id:'item-'+i,kind:String(kind),x:Number(x),z:Number(z)}));
  }
  add(id:string) {
    if(this.players.has(id))return this.players.get(id)!;
    if(this.players.size>=4)throw new Error('Room full');
    const seat=[0,1,2,3].find(n=>![...this.players.values()].some(p=>p.number===n+1))!;
    const p:Player={id,number:seat+1,name:'Player '+(seat+1),color:COLORS[seat]!,className:'warrior',x:8.5+seat,z:22,angle:Math.PI,hp:160,maxHp:160,cooldown:0,magicCooldown:0,shield:3,score:0,input:{x:0,z:0,attack:false,magic:false,at:-10}};
    this.players.set(id,p);return p;
  }
  remove(id:string) {this.players.delete(id);}
  choose(id:string,value:unknown) {
    const p=this.players.get(id);if(!p||typeof value!=='string'||!Object.hasOwn(CLASSES,value)||p.hp<=0)return false;
    const fraction=p.hp/p.maxHp;p.className=value as ClassName;p.maxHp=CLASSES[p.className].health;p.hp=p.maxHp*fraction;return true;
  }
  input(id:string,data:unknown) {
    const p=this.players.get(id);if(!p||!data||typeof data!=='object')return false;
    const d=data as Record<string,unknown>;
    if(typeof d.x!=='number'||typeof d.z!=='number'||!Number.isFinite(d.x)||!Number.isFinite(d.z)||Math.abs(d.x)>1||Math.abs(d.z)>1||typeof d.attack!=='boolean'||typeof d.magic!=='boolean')return false;
    p.input={x:d.x,z:d.z,attack:d.attack,magic:d.magic,at:this.time};return true;
  }
  restart(id:string) {
    const leader=[...this.players.values()].sort((a,b)=>a.number-b.number)[0];
    if(this.phase==='playing'||leader?.id!==id)return false;
    this.match++;this.resetLevel();for(const p of this.players.values()){p.x=7.5+p.number;p.z=22;p.hp=p.maxHp;p.score=0;p.cooldown=0;p.magicCooldown=0;p.shield=3;p.input.at=-10;}
    this.note('A new descent begins.');return true;
  }
  walkable(x:number,z:number,r=.28) {
    for(const dx of [-r,r])for(const dz of [-r,r])if(LEVEL[Math.floor(z+dz+.5)]?.[Math.floor(x+dx+.5)]!=='.')return false;
    return true;
  }
  move(p:{x:number;z:number},dx:number,dz:number,r=.28) {if(this.walkable(p.x+dx,p.z,r))p.x+=dx;if(this.walkable(p.x,p.z+dz,r))p.z+=dz;}
  visible(a:{x:number;z:number},b:{x:number;z:number}) {const n=Math.ceil(distance(a,b)*5);for(let i=1;i<n;i++)if(!this.walkable(a.x+(b.x-a.x)*i/n,a.z+(b.z-a.z)*i/n,.04))return false;return true;}
  spawnEnemy(kind:string,x:number,z:number){const hp=kind==='grunt'?65:kind==='demon'?45:32;this.enemies.push({id:'enemy-'+(++this.serial),kind,x,z,hp,maxHp:hp,cooldown:1,angle:0});}
  fire(p:{id:string;x:number;z:number},target:{x:number;z:number},damage:number,range:number,hostile:boolean,kind:string){const d=distance(p,target)||1;this.shots.push({id:++this.serial,owner:p.id,x:p.x,z:p.z,vx:(target.x-p.x)/d*10,vz:(target.z-p.z)/d*10,life:range/10,damage,hostile,kind});}
  hurt(p:Player,damage:number){if(p.shield>0||p.hp<=0)return;p.hp=Math.max(0,p.hp-damage*CLASSES[p.className].armor);p.shield=.3;if(!p.hp)this.note(p.name+' has fallen.');}
  step(dt:number) {
    this.time+=dt;if(this.phase!=='playing'||!this.players.size)return;
    const living=[...this.players.values()].filter(p=>p.hp>0);
    for(const p of living){
      const c=CLASSES[p.className];p.cooldown=Math.max(0,p.cooldown-dt);p.magicCooldown=Math.max(0,p.magicCooldown-dt);p.shield=Math.max(0,p.shield-dt);
      const input=this.time-p.input.at<.3?p.input:{x:0,z:0,attack:false,magic:false};const len=Math.max(1,Math.hypot(input.x,input.z));
      this.move(p,input.x/len*c.speed*dt,input.z/len*c.speed*dt);if(input.x||input.z)p.angle=Math.atan2(input.x,input.z);
      if(input.attack&&p.cooldown===0){
        const targets=[...this.enemies,...this.generators].filter(e=>e.hp>0&&distance(p,e)<c.range&&this.visible(p,e)).sort((a,b)=>distance(p,a)-distance(p,b));
        const target=targets[0]||{x:p.x+Math.sin(p.angle)*c.range,z:p.z+Math.cos(p.angle)*c.range};p.angle=Math.atan2(target.x-p.x,target.z-p.z);this.fire(p,target,c.damage,c.range,false,p.className);p.cooldown=c.rate;
      }
      if(input.magic&&p.magicCooldown===0){p.magicCooldown=10;this.blasts.push({id:++this.serial,x:p.x,z:p.z,time:.3,hostile:false});const power=p.className==='wizard'?110:65;
        for(const e of [...this.enemies,...this.generators])if(distance(p,e)<4&&this.visible(p,e)){const before=e.hp;e.hp-=power;if(before>0&&e.hp<=0)p.score+=100;}
      }
      for(const item of [...this.pickups])if(distance(p,item)<.8){if(item.kind==='food'&&p.hp>=p.maxHp)continue;
        if(item.kind==='food'){p.hp=Math.min(p.maxHp,p.hp+65);this.note(p.name+' found food.');}if(item.kind==='key'){this.key=true;this.note('The gate key is yours. Destroy the remaining altars!');}if(item.kind==='treasure'){p.score+=250;this.note(p.name+' found treasure.');}this.pickups=this.pickups.filter(v=>v!==item);
      }
      if(this.key&&this.generators.every(g=>g.hp<=0)&&distance(p,{x:10,z:1.5})<1.2){this.phase='victory';this.note('Dungeon cleared. The party escapes!');return;}
    }
    for(const g of this.generators)if(g.hp>0){g.cooldown-=dt;if(g.cooldown<=0){g.cooldown=8;if(this.enemies.length<24)this.spawnEnemy(g.kind,g.x,g.z+1);}}
    for(const e of this.enemies){if(e.hp<=0)continue;const target=living.filter(p=>p.hp>0).sort((a,b)=>distance(e,a)-distance(e,b))[0];if(!target)continue;
      const d=distance(e,target);if(d>11)continue;e.cooldown-=dt;e.angle=Math.atan2(target.x-e.x,target.z-e.z);
      const ranged=e.kind==='demon'||e.kind==='lobber';if(d>(ranged?4:.7)){const speed=e.kind==='ghost'?1.5:e.kind==='grunt'?1.05:.8;this.move(e,(target.x-e.x)/d*speed*dt,(target.z-e.z)/d*speed*dt,.23);}
      if(e.cooldown<=0){if(d<.9){this.hurt(target,e.kind==='grunt'?14:9);e.cooldown=.85;}
        else if(ranged&&d<7&&this.visible(e,target)){e.cooldown=e.kind==='lobber'?3:1.8;if(e.kind==='lobber')this.blasts.push({id:++this.serial,x:target.x,z:target.z,time:1.3,hostile:true});else this.fire(e,target,12,8,true,e.kind);}}
    }
    for(const s of this.shots){s.life-=dt;s.x+=s.vx*dt;s.z+=s.vz*dt;if(!this.walkable(s.x,s.z,.04))s.life=0;
      if(s.life<=0)continue;
      if(s.hostile){const p=living.find(p=>p.hp>0&&distance(p,s)<.45);if(p){this.hurt(p,s.damage);s.life=0;}}
      else{const e=[...this.enemies,...this.generators].find(e=>e.hp>0&&distance(e,s)<('kind'in e&&e.id.startsWith('altar')?.65:.5));if(e){e.hp-=s.damage;s.life=0;const owner=this.players.get(s.owner);if(e.hp<=0&&owner){owner.score+=100;if(e.id.startsWith('altar'))this.note('Summoning altar destroyed!');}}}
    }
    for(const b of this.blasts){b.time-=dt;if(b.hostile&&b.time<=0)for(const p of living)if(distance(p,b)<1.4)this.hurt(p,24);}
    this.blasts=this.blasts.filter(b=>b.time>0);this.shots=this.shots.filter(s=>s.life>0);this.enemies=this.enemies.filter(e=>e.hp>0);
    if([...this.players.values()].every(p=>p.hp<=0)){this.phase='defeat';this.note('The party has fallen. Try another descent.');}
  }
  snapshot(){return {time:this.time,match:this.match,phase:this.phase,key:this.key,event:this.event,level:LEVEL,exit:{x:10,z:1.5},players:[...this.players.values()].map(({input,...p})=>p),enemies:this.enemies,generators:this.generators,pickups:this.pickups,shots:this.shots,blasts:this.blasts};}
}
