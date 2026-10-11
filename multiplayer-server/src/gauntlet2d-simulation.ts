// Seat palette and BFS queue assertions use capacity and loop bounds; coordinate pairs are tuples.
export const CLASSES = {
  warrior: { speed: 3.5, damage: 28, interval: .48, range: 7, projectile: 8 },
  valkyrie: { speed: 3.9, damage: 21, interval: .36, range: 8, projectile: 10 },
  wizard: { speed: 3.4, damage: 35, interval: .62, range: 9, projectile: 7 },
  elf: { speed: 4.5, damage: 13, interval: .22, range: 10, projectile: 12 },
} as const;
export type Hero = keyof typeof CLASSES;
export const COLORS = ['#54d9ff', '#ffbc57', '#ec82ff', '#91ed8e'];
export const MAP = [
 '###################',
 '#.................#',
 '#.................#',
 '#...##.......##...#',
 '#...##.......##...#',
 '#.................#',
 '#.................#',
 '###..####.####..###',
 '#.................#',
 '#.................#',
 '#...#.........#...#',
 '#...#.........#...#',
 '#.................#',
 '#.................#',
 '####..###.###..####',
 '#.................#',
 '#.................#',
 '#...##.......##...#',
 '#...##.......##...#',
 '#.................#',
 '#.................#',
 '###..####.####..###',
 '#.................#',
 '#.................#',
 '#...##.......##...#',
 '#.................#',
 '#.................#',
 '#.................#',
 '###################',
];
type Input = { x: number; y: number; ax: number; ay: number; attack: boolean; at: number };
type Actor = { id: string; x: number; y: number; hp: number };
type Player = Actor & { number: number; name: string; color: string; hero: Hero; cooldown: number; shield: number; revive: number; facing: number; kills: number; input: Input };
type Enemy = Actor & { kind: string; cooldown: number; phase: boolean };
type Generator = Actor & { kind: string; spawn: number };
type Shot = { id: number; owner: string; x: number; y: number; dx: number; dy: number; damage: number; life: number; hostile: boolean; kind: string };
type Item = { id: string; kind: string; x: number; y: number };
export function wall(x: number, y: number) { return MAP[Math.floor(y)]?.[Math.floor(x)] !== '.'; }
const distance = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x,a.y-b.y);
const emptyInput = (): Input => ({x:0,y:0,ax:0,ay:0,attack:false,at:-100});
export class Gauntlet2DSimulation {
  players = new Map<string, Player>();
  enemies: Enemy[] = []; generators: Generator[] = []; shots: Shot[] = []; items: Item[] = [];
  time = 0; round = 0; serial = 0; keys = 0; treasure = 0; status = 'playing'; restartIn = 0;
  event = 'Welcome to the Embervault'; exit = {x:9.5,y:1.8};
  constructor() { this.reset(); }
  reset() {
    this.round++; this.keys=0; this.treasure=0; this.status='playing'; this.restartIn=0; this.shots=[]; this.enemies=[];
    this.generators = [ ['ghost',3.5,19.5], ['grunt',15.5,16.5], ['demon',3.5,9.5], ['sorcerer',15.5,4.5] ].map(([kind,x,y],i) => ({id:'nest'+i,kind:String(kind),x:Number(x),y:Number(y),hp:100,spawn:4+i}));
    this.items = [['key',2.5,12.5],['key',16.5,8.5],['food',5.5,23.5],['food',13.5,19.5],['food',8.5,13.5],['food',12.5,6.5],['treasure',2.5,24.5],['treasure',16.5,23.5],['treasure',8.5,17.5],['treasure',9.5,5.5]].map(([kind,x,y],i)=>({id:'item'+i,kind:String(kind),x:Number(x),y:Number(y)}));
    for(const g of this.generators) this.spawn(g);
    for(const p of this.players.values()) {p.x=8+(p.number-1);p.y=26.5;p.hp=100;p.shield=3;p.cooldown=0;p.revive=0;p.kills=0;p.input=emptyInput();}
    this.event='Break 4 generators • collect 2 keys • find the exit';
  }
  add(id:string) {
    if(this.players.has(id)||this.players.size>=4) return;
    const occupied=new Set([...this.players.values()].map(p=>p.number));let number=1;while(occupied.has(number))number++;
    this.players.set(id,{id,number,name:'Player '+number,color:COLORS[number-1]!,hero:'warrior',x:8+number-1,y:26.5,hp:100,cooldown:0,shield:3,revive:0,facing:-Math.PI/2,kills:0,input:emptyInput()});
  }
  remove(id:string){this.players.delete(id);this.shots=this.shots.filter(s=>s.owner!==id);}
  select(id:string,hero:unknown){if(typeof hero==='string'&&Object.hasOwn(CLASSES,hero)){const p=this.players.get(id);if(p)p.hero=hero as Hero;}}
  input(id:string,data:unknown){
    if(!data||typeof data!=='object')return;const d=data as Record<string,unknown>;
    if(!['x','y','ax','ay'].every(k=>typeof d[k]==='number'&&Number.isFinite(d[k])&&Math.abs(d[k] as number)<=1)||typeof d.attack!=='boolean')return;
    const p=this.players.get(id);if(p)p.input={x:d.x as number,y:d.y as number,ax:d.ax as number,ay:d.ay as number,attack:d.attack,at:this.time};
  }
  move(a:Actor,dx:number,dy:number,ghost=false){
    const free=(x:number,y:number)=>x>.3&&y>.3&&x<18.7&&y<28.7&&(ghost||([[-.25,-.25],[.25,-.25],[-.25,.25],[.25,.25]] as const).every(([ox,oy])=>!wall(x+ox,y+oy)));
    if(free(a.x+dx,a.y))a.x+=dx;if(free(a.x,a.y+dy))a.y+=dy;
  }
  spawn(g:Generator){if(this.enemies.length>=28)return; this.enemies.push({id:'enemy'+(++this.serial),x:g.x,y:g.y+.6,hp:g.kind==='grunt'?55:30,kind:g.kind,cooldown:1.5,phase:false});}
  fire(p:Player){
    const c=CLASSES[p.hero];let {ax,ay}=p.input;
    if(Math.hypot(ax,ay)<.1){const targets=[...this.enemies.filter(e=>!e.phase),...this.generators.filter(g=>g.hp>0)].filter(e=>distance(e,p)<c.range&&this.visible(p,e)).sort((a,b)=>distance(a,p)-distance(b,p));const t=targets[0];if(t){ax=t.x-p.x;ay=t.y-p.y;}else {ax=Math.cos(p.facing);ay=Math.sin(p.facing);}}
    const length=Math.hypot(ax,ay)||1;p.facing=Math.atan2(ay,ax);p.cooldown=c.interval;
    this.shots.push({id:++this.serial,owner:p.id,x:p.x,y:p.y,dx:ax/length*c.projectile,dy:ay/length*c.projectile,damage:c.damage,life:c.range/c.projectile,hostile:false,kind:p.hero});
  }
  visible(a:{x:number;y:number},b:{x:number;y:number}){const d=distance(a,b);for(let n=.25;n<d;n+=.25)if(wall(a.x+(b.x-a.x)*n/d,a.y+(b.y-a.y)*n/d))return false;return true;}
  hurt(p:Player,amount:number){if(p.shield>0||p.hp<=0)return;p.hp=Math.max(0,p.hp-amount);p.shield=.55;if(!p.hp)this.event=`Player ${p.number} is down — stand nearby to revive`;}
  // Breadth-first grid steering lets enemies navigate authored walls without tunnelling.
  direction(e:Actor,p:Actor){
    if(this.visible(e,p))return {x:p.x-e.x,y:p.y-e.y};
    const start: [number,number]=[Math.floor(e.x),Math.floor(e.y)],target=Math.floor(p.y)*19+Math.floor(p.x),seen=new Set<number>([start[1]*19+start[0]]);
    const queue=[{x:start[0],y:start[1],first:null as null|{x:number;y:number}}];
    for(let i=0;i<queue.length;i++){const n=queue[i]!;if(n.y*19+n.x===target&&n.first)return {x:n.first.x+.5-e.x,y:n.first.y+.5-e.y};for(const [dx,dy]of ([[0,-1],[1,0],[0,1],[-1,0]] as const)){const x=n.x+dx,y=n.y+dy,key=y*19+x;if(wall(x+.5,y+.5)||seen.has(key))continue;seen.add(key);queue.push({x,y,first:n.first||{x,y}});}}
    return {x:0,y:0};
  }
  step(dt:number){
    this.time+=dt;if(!this.players.size)return;
    if(this.status!=='playing'){this.restartIn-=dt;if(this.restartIn<=0)this.reset();return;}
    const alive=[...this.players.values()].filter(p=>p.hp>0);
    for(const p of this.players.values()){
      p.cooldown=Math.max(0,p.cooldown-dt);p.shield=Math.max(0,p.shield-dt);
      if(p.hp<=0){if(alive.some(a=>distance(a,p)<1.4)){p.revive+=dt;if(p.revive>=2.5){p.hp=45;p.shield=3;p.revive=0;this.event=`Player ${p.number} revived`;}}else p.revive=0;continue;}
      p.hp=Math.max(0,p.hp-dt*.18);
      const input=this.time-p.input.at<.3?p.input:emptyInput();const len=Math.max(1,Math.hypot(input.x,input.y));
      this.move(p,input.x/len*CLASSES[p.hero].speed*dt,input.y/len*CLASSES[p.hero].speed*dt);
      if(input.x||input.y)p.facing=Math.atan2(input.y,input.x);
      if(input.attack&&p.cooldown<=0)this.fire(p);
      for(const item of [...this.items])if(distance(p,item)<.7){if(item.kind==='food'&&p.hp>=99)continue;this.items=this.items.filter(i=>i!==item);if(item.kind==='key'){this.keys++;this.event=`Vault key found • ${this.keys}/2`;}else if(item.kind==='food'){p.hp=Math.min(100,p.hp+45);this.event='Food restores 45 health';}else {this.treasure+=100;this.event='Treasure +100';}}
      if(this.keys===2&&this.generators.every(g=>g.hp<=0)&&distance(p,this.exit)<.85){this.status='victory';this.restartIn=10;this.event='The Embervault is conquered!';return;}
    }
    for(const g of this.generators)if(g.hp>0){g.spawn-=dt;if(g.spawn<=0){g.spawn=9;this.spawn(g);}}
    for(const e of this.enemies){
      const p=alive.filter(p=>p.hp>0).sort((a,b)=>distance(e,a)-distance(e,b))[0];if(!p)break;
      const d=distance(e,p);e.cooldown-=dt;e.phase=e.kind==='sorcerer'&&Math.floor(this.time*1.2)%5===0;
      if(d>12)continue;
      if(d>.65){const v=this.direction(e,p),n=Math.hypot(v.x,v.y)||1,s=e.kind==='ghost'?1.65:e.kind==='grunt'?1.1:1.25;this.move(e,v.x/n*s*dt,v.y/n*s*dt);}
      if(d<.8&&e.cooldown<=0){this.hurt(p,e.kind==='grunt'?14:8);e.cooldown=1;}
      if((e.kind==='demon'||e.kind==='sorcerer')&&d<7&&d>1&&e.cooldown<=0&&this.visible(e,p)){this.shots.push({id:++this.serial,owner:e.id,x:e.x,y:e.y,dx:(p.x-e.x)/d*4,dy:(p.y-e.y)/d*4,damage:9,life:2,hostile:true,kind:e.kind});e.cooldown=2.2;}
    }
    for(const s of this.shots){s.x+=s.dx*dt;s.y+=s.dy*dt;s.life-=dt;if(wall(s.x,s.y)){s.life=0;continue;}
      if(s.hostile){for(const p of alive)if(p.hp>0&&distance(s,p)<.4){this.hurt(p,s.damage);s.life=0;break;}}
      else {const target=[...this.enemies.filter(e=>!e.phase),...this.generators.filter(g=>g.hp>0)].find(e=>distance(s,e)<.55);if(target){target.hp-=s.damage;s.life=0;if(target.hp<=0){const p=this.players.get(s.owner);if(p)p.kills++;this.treasure+=25;if(target.id.startsWith('nest'))this.event=`Generator destroyed • ${this.generators.filter(g=>g.hp<=0).length}/4`;}
        if(s.kind==='wizard')for(const e of this.enemies)if(e!==target&&distance(e,target)<1.5)e.hp-=s.damage*.5;
      }}
    }
    this.shots=this.shots.filter(s=>s.life>0).slice(-160);this.enemies=this.enemies.filter(e=>e.hp>0);
    if([...this.players.values()].every(p=>p.hp<=0)){this.status='defeat';this.restartIn=10;this.event='The vault claims the party. A new expedition begins soon.';}
  }
  snapshot(){return {round:this.round,time:this.time,map:MAP,players:[...this.players.values()].map(({input,...p})=>({...p})),enemies:this.enemies.map(e=>({...e})),generators:this.generators.map(g=>({...g})),shots:this.shots.map(s=>({...s})),items:this.items.map(i=>({...i})),keys:this.keys,treasure:this.treasure,status:this.status,restartIn:this.restartIn,event:this.event,exit:this.exit};}
}

