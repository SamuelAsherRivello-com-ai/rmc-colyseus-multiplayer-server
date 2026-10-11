import test from 'node:test';
import assert from 'node:assert/strict';
import { GungeonSimulation } from '../src/gungeon-simulation.ts';
const input=(s: GungeonSimulation,id: string,patch={})=>s.input(id,{x:0,y:0,ax:1,ay:0,shoot:false,roll:false,...patch});
const run=(s: GungeonSimulation,n: number,fn=()=>{})=>{for(let i=0;i<n;i++){fn();s.step(1/30);}};
test('readiness, seats, input bounds, stale movement, dodge and cover',()=>{
 const s=new GungeonSimulation(()=>.2);for(let i=0;i<5;i++)s.add('p'+i);assert.equal(s.players.size,4);assert.equal(new Set([...s.players.values()].map(p=>p.color)).size,4);
 for(const p of s.players.values())s.ready(p.id);assert.equal(s.phase,'combat');const p=s.players.get('p0')!;s.enemies=[{id:1,kind:'gunner',x:2,y:2,hp:100,maxHp:100,cooldown:100,angle:0}];
 const x=p.x;input(s,p.id,{x:999,hp:999});s.step(1/30);assert.equal(p.x,x);input(s,p.id,{x:1,y:1});s.step(1/30);assert.ok(Math.hypot(p.x-x,p.y-8)<=5/30+.001);
 run(s,12);const stopped=p.x;s.step(1/30);assert.equal(p.x,stopped);
 input(s,p.id,{x:1,roll:true});s.step(1/30);assert.ok(p.rolling>0);p.shield=0;const hp=p.hp;s.hurt(p,20);assert.equal(p.hp,hp);assert.ok(p.rollCooldown>1);
 p.x=1.4;p.y=8;run(s,20,()=>input(s,p.id,{x:-1}));assert.ok(p.x>=1.32);assert.ok(s.blocked(8,5));
});
test('three weapon patterns, upgrades, friendly fire and destructible props',()=>{
 const counts=[];for(const weapon of ['pistol','scatter','carbine']){const s=new GungeonSimulation(()=>.2);s.add('a');s.add('b');s.select('a',weapon);const p=s.players.get('a')!;s.fire(p);counts.push(s.shots.length);if(weapon==='carbine'){s.phase='combat';s.enemies=[{id:1,kind:'gunner',x:2,y:2,hp:100,maxHp:100,cooldown:100,angle:0}];run(s,7);assert.ok(s.shots.length>=3);}}
 assert.deepEqual(counts,[1,5,1]);const s=new GungeonSimulation();s.add('a');s.add('b');s.phase='combat';const a=s.players.get('a')!,b=s.players.get('b')!;a.x=12;a.y=b.y=8;b.x=13;b.shield=0;s.shot(a.id,12,8,0,23,100,false);s.enemies=[{id:1,kind:'gunner',x:2,y:2,hp:100,maxHp:100,cooldown:100,angle:0}];run(s,4);assert.equal(b.hp,100);
 s.shot(a.id,4,8,0,23,100,false);run(s,3);assert.ok(!s.props.some(p=>p.id===1));s.phase='break';a.credits=1;s.upgrade('a','damage');assert.equal(a.damage,1.2);s.upgrade('a','damage');assert.equal(a.damage,1.2);
});
test('enemy patterns, scaled waves, boss cadence, loot, revive, defeat and leader replay',()=>{
 const s=new GungeonSimulation(()=>.2);s.add('a');s.add('b');s.ready('a');s.ready('b');assert.equal(new Set(s.enemies.map(e=>e.kind)).size,3);const count=s.enemies.length;const solo=new GungeonSimulation(()=>.2);solo.add('a');solo.ready('a');assert.ok(count>solo.enemies.length);
 const a=s.players.get('a')!,b=s.players.get('b')!;a.hp=0;b.x=a.x;b.y=a.y;s.enemies.forEach(e=>e.cooldown=100);run(s,62);assert.ok(a.hp>0);
 s.enemies=[];s.step(1/30);assert.equal(s.phase,'break');assert.equal(a.credits,1);s.wave=4;s.nextWave();assert.ok(s.enemies.some(e=>e.kind==='boss'));s.enemies.forEach(e=>e.cooldown=0);s.step(1/30);assert.ok(s.shots.filter(s=>s.enemy).length>=16);
 s.loot=[{id:100,x:b.x,y:b.y}];a.hp=50;b.hp=50;s.step(1/30);assert.equal(s.loot.length,0);assert.ok(a.hp>=52);
 a.hp=b.hp=0;s.step(1/30);assert.equal(s.phase,'defeat');s.restart('b');assert.equal(s.phase,'defeat');s.restart('a');assert.equal(s.phase,'lobby');assert.equal(s.wave,0);assert.equal(s.round,2);
});

