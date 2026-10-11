import test from 'node:test';
import assert from 'node:assert/strict';
import { SumoSimulation } from '../src/sumo-simulation.ts';
test('bounded inputs, stale input and dash cooldown', () => {
  const s = new SumoSimulation(), p = s.add('a'); p.x = p.z = 0;
  assert.equal(s.input('a', { x: Infinity, z: 0, dash: false }), false);
  assert.equal(s.input('a', { x: 2, z: 0, dash: false }), false);
  assert.equal(s.input('other', { x: 1, z: 0, dash: false }), false);
  s.input('a', { x: 1, z: 0, dash: true }); s.step(1 / 30);
  assert.ok(p.x > 0); assert.equal(p.cooldown, 1.5);
  s.step(1 / 30); assert.ok(p.cooldown < 1.5);
  for (let i = 0; i < 80; i++) s.step(1 / 30);
  assert.ok(Math.abs(p.vx) < .01, 'expired input must stop movement');
});
test('collision credits ring-out, self-fall does not, first to three freezes then replays', () => {
  const s = new SumoSimulation(), a = s.add('a'), b = s.add('b');
  a.shield = b.shield = 0; a.x = 4.9; a.z = b.z = 0; b.x = 6; a.vx = 12;
  for (let i = 0; i < 10; i++) s.step(1 / 30);
  assert.equal(a.score, 1); assert.ok(b.out > 0);
  s.spawn(b); b.x = 7; s.step(1 / 30); assert.equal(a.score, 1);
  for (let i = 0; i < 2; i++) { s.spawn(b); b.x = 7; b.attacker = 'a'; b.hitAt = s.time; s.step(1 / 30); }
  assert.equal(s.winner, 'a'); assert.equal(a.score, 3);
  const x = a.x; s.input('a', { x: 1, z: 0, dash: true }); s.step(.1); assert.equal(a.x, x);
  for (let i = 0; i < 250; i++) s.step(1 / 30);
  assert.equal(s.winner, null); assert.equal(s.match, 2); assert.equal(a.score, 0);
  assert.ok(Math.hypot(a.x, a.z) < 6);
});
test('expired or departed attacker receives no point and late joins spawn safely', () => {
  const s = new SumoSimulation(), a = s.add('a'), b = s.add('b');
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 1.22);
  b.x = 7; b.attacker = 'a'; b.hitAt = -5; s.step(1 / 30); assert.equal(a.score, 0);
  s.spawn(b); b.x = 7; b.attacker = 'a'; b.hitAt = s.time; s.remove('a'); s.step(1 / 30);
  assert.equal(s.winner, null); assert.ok(b.out > 0);
});
