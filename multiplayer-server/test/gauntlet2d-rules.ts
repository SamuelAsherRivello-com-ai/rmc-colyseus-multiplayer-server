import test from 'node:test';
import assert from 'node:assert/strict';
import { Gauntlet2DSimulation, MAP, wall } from '../src/gauntlet2d-simulation.ts';
const input=(s: Gauntlet2DSimulation,id: string,x=0,y=0,attack=false)=>s.input(id,{x,y,ax:0,ay:0,attack});
test('four seats, duplicate classes, bounded authority and switching preserves health/cooldown',()=>{
 const s=new Gauntlet2DSimulation();for(let i=0;i<5;i++)s.add('p'+i);assert.equal(s.players.size,4);
 const p=s.players.get('p0')!;p.hp=51;p.cooldown=.5;s.select('p0','wizard');s.select('p1','wizard');
 assert.equal(p.hp,51);assert.equal(p.cooldown,.5);assert.equal(new Set([...s.players.values()].map(p=>p.color)).size,4);
 s.select('p0','constructor');assert.equal(p.hero,'wizard');s.input('p0',{x:50,y:0,ax:0,ay:0,attack:true,hp:1000});s.step(.1);assert.equal(p.x,8);
 input(s,'p0',1,1);const before={x:p.x,y:p.y};s.step(.1);assert.ok(Math.hypot(p.x-before.x,p.y-before.y)<.35);
 s.step(.4);const stopped=p.x;s.step(.1);assert.equal(p.x,stopped);
});
test('all objectives are reachable and walls block players',()=>{
 const s=new Gauntlet2DSimulation();s.add('a');const p=s.players.get('a')!;p.x=1.3;p.y=2;input(s,'a',-1,0);for(let i=0;i<20;i++)s.step(1/30);assert.ok(p.x>=1.25);
 const seen=new Set(['9,26']),q: [number,number][]=[[9,26]];for(let i=0;i<q.length;i++){const [x,y]=q[i]!;for(const [dx,dy]of ([[1,0],[-1,0],[0,1],[0,-1]] as const)){const k=`${x+dx},${y+dy}`;if(!seen.has(k)&&!wall(x+dx+.5,y+dy+.5)){seen.add(k);q.push([x+dx,y+dy]);}}}
 for(const t of [...s.items,...s.generators,s.exit])assert.ok(seen.has(`${Math.floor(t.x)},${Math.floor(t.y)}`));assert.ok(MAP.every(r=>r.length===19));
});
test('combat damage, pickup ownership, locked exit, victory and shared replay',()=>{
 const s=new Gauntlet2DSimulation();s.add('a');s.add('b');const p=s.players.get('a')!,b=s.players.get('b')!;
 p.x=s.exit.x;p.y=s.exit.y;s.step(.03);assert.equal(s.status,'playing');
 p.x=3.5;p.y=22;s.enemies=[];input(s,'a',0,0,true);for(let i=0;i<100;i++){input(s,'a',0,0,true);s.step(1/30);}assert.ok(s.generators[0]!.hp<=0);
 const key=s.items.find(i=>i.kind==='key')!;p.x=b.x=key.x;p.y=b.y=key.y;s.step(.03);assert.equal(s.keys,1);
 const key2=s.items.find(i=>i.kind==='key')!;p.x=key2.x;p.y=key2.y;s.step(.03);assert.equal(s.keys,2);
 for(const g of s.generators)g.hp=0;p.x=s.exit.x;p.y=s.exit.y;s.step(.03);assert.equal(s.status,'victory');
 const round=s.round;for(let i=0;i<301;i++)s.step(1/30);assert.equal(s.round,round+1);assert.equal(s.status,'playing');assert.equal(s.keys,0);
});
test('four enemy behaviors, revival, defeat and replay',()=>{
 const s=new Gauntlet2DSimulation();s.add('a');s.add('b');assert.equal(new Set(s.enemies.map(e=>e.kind)).size,4);
 const a=s.players.get('a')!,b=s.players.get('b')!;a.hp=0;b.x=a.x;b.y=a.y;s.generators=[];s.enemies=[];
 for(let i=0;i<80;i++)s.step(1/30);assert.ok(a.hp>40);
 a.hp=b.hp=0;s.step(.03);assert.equal(s.status,'defeat');for(let i=0;i<301;i++)s.step(1/30);assert.equal(s.status,'playing');assert.ok(a.hp>99);
});
