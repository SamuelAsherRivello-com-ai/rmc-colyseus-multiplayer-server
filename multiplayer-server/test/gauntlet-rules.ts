import test from 'node:test';
import assert from 'node:assert/strict';
import {GauntletSimulation,CLASSES} from '../src/gauntlet-simulation.ts';
test('classes preserve health, cooldown, position and identity; input rejects forgery and expires',()=>{
 const s=new GauntletSimulation(),p=s.add('a');p.hp=80;p.cooldown=.4;
 for(const c of Object.keys(CLASSES)){assert.ok(s.choose('a',c));assert.equal(p.hp/p.maxHp,.5);assert.equal(p.cooldown,.4);assert.equal(p.color,'#49d9ff');}
 assert.equal(s.choose('a','__proto__'),false);assert.equal(s.input('a',{x:Infinity,z:0,attack:true,magic:false}),false);
 assert.equal(s.input('b',{x:1,z:0,attack:false,magic:false}),false);
 const x=p.x;s.input('a',{x:1,z:0,attack:false,magic:false});for(let i=0;i<30;i++)s.step(1/30);
 assert.ok(p.x>x&&p.x-x<1.5);const stopped=p.x;s.step(.1);assert.equal(p.x,stopped);
 p.x=1;p.z=22;s.input('a',{x:-1,z:0,attack:false,magic:false});for(let i=0;i<9;i++)s.step(1/30);assert.ok(p.x>=.78);
});
test('four enemies, server combat, food, key, terminal conditions and leader replay',()=>{
 const s=new GauntletSimulation(),p=s.add('a');const b=s.add('b');
 assert.equal(new Set(s.enemies.map(e=>e.kind)).size,4);
 p.x=3;p.z=20;p.shield=100;s.input('a',{x:0,z:0,attack:true,magic:true});s.step(1/30);assert.ok(s.generators[0]!.hp<150);assert.equal(p.magicCooldown,10);
 p.hp=20;p.x=10;p.z=20;s.step(1/30);assert.equal(p.hp,85);
 p.x=10;p.z=11;s.step(1/30);assert.ok(s.key);assert.ok(!s.pickups.some(i=>i.kind==='key'));
 p.x=10;p.z=1.5;s.step(1/30);assert.equal(s.phase,'playing');
 s.generators.forEach(g=>g.hp=0);s.step(1/30);assert.equal(s.phase,'victory');assert.equal(s.restart('b'),false);assert.ok(s.restart('a'));assert.equal(s.match,2);assert.equal(s.key,false);assert.equal(p.hp,p.maxHp);
 p.hp=b.hp=0;s.step(1/30);assert.equal(s.phase,'defeat');assert.ok(s.restart('a'));assert.equal(s.phase,'playing');
});
test('enemy damage, projectile walls, spawn cap and seat reuse',()=>{
 const s=new GauntletSimulation(),p=s.add('a');p.x=3;p.z=17;p.shield=0;const e=s.enemies[0]!;e.x=p.x;e.z=p.z+.1;e.cooldown=0;s.step(1/30);assert.ok(p.hp<p.maxHp);
 const b=s.add('b'),c=s.add('c'),d=s.add('d');assert.throws(()=>s.add('e'));s.remove('b');const replacement=s.add('e');assert.equal(replacement.color,b.color);assert.equal(c.number,3);assert.equal(d.number,4);
 s.enemies=[];s.fire(p,{x:-10,z:17},50,30,false,'warrior');for(let i=0;i<40;i++)s.step(1/30);assert.equal(s.shots.length,0);
 for(let i=0;i<1000;i++)s.step(1/30);assert.ok(s.enemies.length<=24);
});
