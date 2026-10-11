import test from 'node:test';
import assert from 'node:assert/strict';
import {BombermanSimulation} from '../src/bomberman-simulation.js';
test('four battle seats admit four humans and replace departed humans with CPUs',()=>{
 const s=new BombermanSimulation();
 for(let n=1;n<=4;n++){assert.equal(s.add(`h${n}`),true);assert.equal(s.players.size,4);assert.equal([...s.players.values()].filter(p=>p.cpu).length,4-n);}
 assert.equal(s.add('fifth'),false);s.remove('h2');assert.equal(s.players.size,4);assert.ok(s.players.get('cpu:1')!.cpu);
});
test('one human starts with three CPUs and only host can select valid options',()=>{
 const s=new BombermanSimulation();s.add('host');
 assert.equal(s.configure('guest',{map:'HIGH'}),false);assert.equal(s.configure('host',{map:'INVALID'}),false);
 assert.equal(s.configure('host',{map:'HIGH',cpu:'HARD',plant:true}),true);
 s.ready('host');s.step();assert.equal(s.phase,'countdown');assert.equal(s.game.width,23);assert.equal(s.game.plants.length,1);assert.equal(s.game.players.length,4);
 const actor=s.game.players.find(p=>p.id==='cpu:1')!;actor.alive=false;s.add('guest');assert.equal(actor.id,'guest');assert.equal(actor.alive,false);
 s.connected('guest',false);assert.equal(s.players.get('guest')!.cpu,false);s.remove('guest');assert.equal(actor.id,'cpu:1');
});
test('CPU opponents generate real authoritative explosions',()=>{
 const s=new BombermanSimulation();s.add('host');s.ready('host');s.step();for(let n=0;n<180;n++)s.step();assert.equal(s.phase,'playing');
 let explosions=0;for(let n=0;n<1000&&s.phase==='playing';n++){s.step();explosions+=s.game.events.filter(e=>e.type==='explosion').length;}assert.ok(explosions>0);
});

test('host can enable Chain Reaction for the next match', () => {
  const s = new BombermanSimulation();
  s.add('host');
  assert.equal(s.options.chainReaction, false);
  assert.equal(s.configure('guest', { chainReaction: true }), false);
  assert.equal(s.configure('host', { chainReaction: 'yes' }), false);
  assert.equal(s.configure('host', { chainReaction: true }), true);
  s.ready('host');
  s.step();
  assert.equal(s.game.chainReaction, true);
  assert.equal(s.snapshot().options.chainReaction, true);
});
