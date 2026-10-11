import test from 'node:test';
import assert from 'node:assert/strict';
import {ARENAS,TUNING,moveTank,neutral,blocked,advanceShell,navigation,validControl} from '../packages/client/combat-rules.js';
import {CombatSimulation,CombatBrain} from '../src/combat-simulation.js';
function world(){const s=new CombatSimulation('TEST');for(let i=0;i<4;i++)s.add('p'+i);s.phase='playing';return s;}
function shell(id: number,owner: number,x: number,y: number,vx: number,vy=0,bounces=0){return {id,owner,x,y,vx,vy,bounces,life:4,seq:1};}
function ticks(s: CombatSimulation,n: number){for(let i=0;i<n;i++)s.step();}
function ready(s: CombatSimulation){for(const p of s.players.values())s.ready(p.id);}
test('all arenas have valid distinct spawns and a connected tank-clearance graph',()=>{
 for(const a of Object.values(ARENAS)){for(const p of a.spawns)assert.equal(blocked(p.x,p.y,a.walls),false);const nav=navigation(a);for(const p of a.spawns)assert.ok(nav.route(a.spawns[0]!,p).length);for(const n of nav.open)assert.ok(nav.route(a.spawns[0]!,{x:n%20*16+8,y:Math.floor(n/20)*16+8}).length);}
});
test('humans and CPUs share forward/reverse, turning, solid wall and tank contact rules',()=>{
 const arena=ARENAS['open-yard']!,a={slot:0,x:32,y:32,angle:0,dead:0},b={...a};
 for(let i=0;i<120;i++){const input={drive:1,turn:1,fire:false};moveTank(a,input,1/60,arena);moveTank(b,input,1/60,arena);}assert.deepEqual(a,b);
 const reverse={slot:0,x:32,y:32,angle:0,dead:0};moveTank(reverse,{drive:-1,turn:0},.1,arena);assert.equal(reverse.x,28.8);
 const wall={slot:0,x:16,y:32,angle:Math.PI,dead:0};for(let i=0;i<120;i++)moveTank(wall,{drive:1,turn:0},1/60,arena);assert.ok(wall.x>=14);
 const stop={slot:0,x:50,y:32,angle:0,dead:0},other={slot:1,x:63,y:32,dead:0};for(let i=0;i<60;i++)moveTank(stop,{drive:1,turn:0},1/60,arena,[stop,other]);assert.ok(other.x-stop.x>=12);
});
test('swept fast shells hit tanks and thin walls; classic stops and ricochet reflects corners',()=>{
 const arena=ARENAS['open-yard']!;const s=shell(1,0,100,32,2000),target={slot:1,x:130,y:32,dead:0};assert.equal(advanceShell(s,.05,arena,[target],'classic')!.victim,1);
 assert.equal(advanceShell(shell(2,0,100,80,2000),.1,arena,[],'classic')!.remove,true);
 const corner=shell(3,0,20,20,-100,-100);assert.equal(advanceShell(corner,.2,arena,[],'ricochet'),null);assert.equal(corner.bounces,1);assert.ok(corner.vx>0&&corner.vy>0);
 const exhausted=shell(4,0,20,32,-100,0,TUNING.bounces);assert.equal(advanceShell(exhausted,.2,arena,[],'ricochet')!.remove,true);
 const life=shell(5,0,100,32,100);life.life=.01;assert.equal(advanceShell(life,.02,arena,[],'classic')!.remove,true);
});
test('one hit destroys, scores once, clears shots, safely respawns with protection ending on fire',()=>{
 const s=world();s.tanks[0]!.x=80;s.tanks[0]!.y=32;s.tanks[1]!.x=100;s.tanks[1]!.y=32;
 s.shells=[shell(1,0,91,32,134),shell(2,0,91,32,134),shell(3,1,200,200,20)];s.shotId=3;s.step();
 assert.equal(s.tanks[0]!.score,1);assert.equal(s.tanks[1]!.dead,.6);assert.equal(s.shells.filter(p=>p.owner===1).length,0);
 ticks(s,36);assert.equal(s.tanks[1]!.dead,0);assert.ok(s.tanks[1]!.protection>0);assert.equal(s.tanks[1]!.score,0);
 const t=s.tanks[1]!;s.shells=[shell(8,0,t.x,t.y,134)];s.step();assert.equal(t.dead,0);assert.equal(s.shells.length,0);
 s.input('p1',{seq:1,drive:0,turn:0,fire:true});s.step();assert.equal(t.protection,0);
});
test('mutual impacts survive shot cleanup and repeated victim impacts use deterministic attribution',()=>{
 const s=world();Object.assign(s.tanks[0]!,{x:80,y:32});Object.assign(s.tanks[1]!,{x:100,y:32});
 s.shells=[shell(1,0,91,32,134),shell(2,1,89,32,-134)];s.step();assert.equal(s.tanks[0]!.score,1);assert.equal(s.tanks[1]!.score,1);assert.ok(s.tanks[0]!.dead>0&&s.tanks[1]!.dead>0);
 const m=world();Object.assign(m.tanks[1]!,{x:100,y:32});m.shells=[shell(20,0,91,32,134),shell(10,2,91,32,134)];m.step();assert.equal(m.tanks[2]!.score,1);assert.equal(m.tanks[0]!.score,0);
});
test('owner immunity before bounce and reflected self-hit penalties floor at zero',()=>{
 for(const score of [0,2]){const s=world();const t=s.tanks[0]!;t.score=score;s.mode='ricochet';s.shells=[shell(1,0,t.x,t.y,134,0,1)];s.step();assert.equal(t.score,Math.max(0,score-1));assert.ok(t.dead>0);assert.equal(s.tanks[1]!.score,0);}
 const s=shell(2,0,50,32,134);assert.equal(advanceShell(s,.01,ARENAS['open-yard']!,[{slot:0,x:50,y:32,dead:0}],'classic'),null);
});
test('136-second clock, final tick impacts, unique winner, ties, frozen outcomes and ready rematch reset',()=>{
 const s=world();ticks(s,8159);assert.equal(s.phase,'playing');Object.assign(s.tanks[1]!,{x:100,y:32});s.shells=[shell(1,0,91,32,134)];s.step();assert.equal(s.phase,'results');assert.equal(s.remaining,0);assert.deepEqual(s.winners,[0]);const scores=s.tanks.map(t=>t.score);ticks(s,10);assert.deepEqual(s.tanks.map(t=>t.score),scores);
 s.ready('p0');assert.equal(s.phase,'results');for(const id of ['p1','p2','p3'])s.ready(id);assert.equal(s.phase,'countdown');assert.ok(s.tanks.every(t=>t.score===0));assert.equal(s.shells.length,0);assert.equal(s.remaining,136);ticks(s,180);assert.equal(s.phase,'playing');assert.equal(s.remaining,136);
 const draw=world();draw.remaining=1/60;draw.step();assert.equal(draw.phase,'results');assert.deepEqual(draw.winners,[0,1,2,3]);
});
test('sequenced controls expire in 300ms, invalid authority ignored, bounded firing population',()=>{
 const s=world();assert.equal(s.input('p0',{seq:1,drive:1,turn:0,fire:false}),true);assert.equal(s.input('p0',{seq:1,drive:-1,turn:0,fire:true}),false);assert.equal(s.input('p0',{seq:2,drive:7,turn:0,fire:false}),false);assert.equal(validControl({seq:3,drive:0,turn:0,fire:'yes'}),false);
 ticks(s,20);const x=s.tanks[0]!.x,y=s.tanks[0]!.y;ticks(s,60);assert.equal(s.tanks[0]!.x,x);assert.equal(s.tanks[0]!.y,y);assert.equal(s.tanks[0]!.ack,1);
 for(let i=0;i<600;i++){for(let n=0;n<4;n++)s.input('p'+n,{seq:i+10,drive:0,turn:0,fire:true});s.step();for(let n=0;n<4;n++)assert.ok(s.shells.filter(p=>p.owner===n).length<=3);}
});
test('population matrix, host settings lock, queued handoff, disconnect takeover and no-human suspension',()=>{
 for(let n=1;n<=4;n++){const s=new CombatSimulation();for(let i=0;i<n;i++)s.add('p'+i);assert.equal(s.snapshot().tanks.filter(t=>t.cpu).length,4-n);assert.equal(s.add('extra'),n<4);}
 const s=new CombatSimulation();s.add('a');s.add('b');assert.equal(s.configure('b',{mode:'ricochet'}),false);assert.equal(s.configure('a',{mode:'ricochet'}),true);ready(s);assert.equal(s.configure('a',{mode:'classic'}),false);ticks(s,180);s.add('c');assert.equal(s.players.get('c')!.waiting,true);assert.equal(s.snapshot().tanks[2]!.cpu,true);
 const before={...s.tanks[0]};s.connected('a',false);assert.equal(s.snapshot().tanks[0]!.cpu,true);assert.equal(s.hostId,'b');s.connected('a',true);assert.deepEqual(s.tanks[0],before);assert.equal(s.snapshot().tanks[0]!.cpu,false);
 s.phase='results';ready(s);assert.equal(s.players.get('c')!.waiting,false);assert.equal(s.snapshot().tanks[2]!.cpu,false);for(const p of s.players.values())s.connected(p.id,false);const tick=s.tick;ticks(s,100);assert.equal(s.tick,tick);
});
test('CPU seeded decisions reproduce and all difficulty/arena combinations finish with bounded cost',()=>{
 const a=new CombatBrain(12),b=new CombatBrain(12),s=world();assert.deepEqual(a.decide(s.tanks[0]!,s,'high'),b.decide(s.tanks[0]!,s,'high'));
 const start=performance.now();let steps=0;
 for(const arena of Object.keys(ARENAS))for(const difficulty of (['low','medium','high'] as const)){const w=new CombatSimulation();w.add('human');w.players.get('human')!.waiting=true;w.arena=arena;w.difficulty=difficulty;w.phase='playing';w.tanks=w.tanks.map(t=>w.newTank(t.slot));for(let i=0;i<8160;i++){w.step();steps++;assert.ok(w.shells.length<=12);}assert.equal(w.phase,'results');assert.ok(w.tanks.some(t=>t.score>0),`${arena}/${difficulty} produced no hits`);assert.ok(w.tanks.every(t=>Number.isFinite(t.x)&&!blocked(t.x,t.y,ARENAS[arena]!.walls)));}
 console.log(`Combat sustained: ${steps} steps in ${(performance.now()-start).toFixed(0)} ms (${((performance.now()-start)/steps).toFixed(3)} ms/tick)`);
});


test('High evaluates a covered Ricochet bank shot and every CPU level escapes a wall',()=>{
 const s=world();s.mode='ricochet';Object.assign(s.tanks[0]!,{x:100,y:80,angle:0});Object.assign(s.tanks[1]!,{x:200,y:80});
 const brain=new CombatBrain(1);brain.decide(s.tanks[0]!,s,'high');assert.equal(brain.wantFire,true);assert.ok(Math.abs(brain.aim!)>.3,'bank aim differs from blocked direct shot');
 const a=brain.aim,p=shell(1,0,100+Math.cos(a!)*9,80+Math.sin(a!)*9,Math.cos(a!)*134,Math.sin(a!)*134);let hit;
 for(let i=0;i<240;i++){hit=advanceShell(p,1/60,ARENAS['open-yard']!,s.tanks,'ricochet');if(hit)break;}
 assert.equal(hit!.victim,1);assert.ok(p.bounces>0);
 for(const difficulty of (['low','medium','high'] as const)){const w=world();w.difficulty=difficulty;w.players.get('p0')!.waiting=true;Object.assign(w.tanks[0]!,{x:14.1,y:120,angle:Math.PI});ticks(w,360);assert.ok(Math.hypot(w.tanks[0]!.x-14.1,w.tanks[0]!.y-120)>8,`${difficulty} escape`);}
});
