import test from 'node:test';
import assert from 'node:assert/strict';
import { RingRivalsSimulation } from '../src/ring-rivals-simulation.js';

function start() {
  const simulation = new RingRivalsSimulation();
  simulation.join(0); simulation.join(1); simulation.ready(0); simulation.ready(1);
  for (let i = 0; i < 90; i++) simulation.step(1 / 30);
  assert.equal(simulation.phase, 'round');
  return simulation;
}

test('Ring Rivals validates seats, boxer selections, sequence and action state', () => {
  const s = new RingRivalsSimulation();
  assert.equal(s.join(0), true); assert.equal(s.join(0), false); assert.equal(s.join(2), false);
  assert.equal(s.select(0, 'unknown'), false); assert.equal(s.select(0, 'flash'), true);
  assert.equal(s.input(0, { action: 'jab-head', sequence: 1 }), false);
  s.join(1); s.ready(0); s.ready(1);
  for (let i = 0; i < 90; i++) s.step(1 / 30);
  assert.equal(s.input(0, { action: 'jab-head', sequence: 1 }), true);
  assert.equal(s.players[0]!.stamina, 92);
  assert.equal(s.input(0, { action: 'cross-head', sequence: 1 }), false);
  assert.equal(s.input(0, { action: 'admin', sequence: 2 }), false);
  s.players[0]!.stamina = 5; s.players[0]!.action = 'idle';
  assert.equal(s.input(0, { action: 'cross-body', sequence: 2 }), false);
});

test('head and body guard reduce matching attacks and evasion avoids a timed hit', () => {
  const s = start();
  s.input(1, { action: 'guard-high', sequence: 1 });
  s.input(0, { action: 'jab-head', sequence: 1 });
  for (let i = 0; i < 9; i++) s.step(1 / 30);
  assert.equal(s.players[1]!.health, 98);
  for (let i = 0; i < 11; i++) s.step(1 / 30);
  s.players[0]!.action = 'idle'; s.players[0]!.actionFrame = 0;
  s.input(1, { action: 'neutral', sequence: 2 });
  s.input(1, { action: 'dodge-right', sequence: 3 });
  s.input(0, { action: 'jab-body', sequence: 2 });
  for (let i = 0; i < 10; i++) s.step(1 / 30);
  assert.equal(s.players[1]!.health, 98);
  const bodyGuard = start();
  bodyGuard.input(1, { action: 'guard-low', sequence: 1 });
  bodyGuard.input(0, { action: 'jab-body', sequence: 1 });
  for (let i = 0; i < 11; i++) bodyGuard.step(1 / 30);
  assert.equal(bodyGuard.players[1]!.health, 98);
});

test('knockout ends a round, best-of-three resolves, and equal timer health draws without a point', () => {
  const s = start();
  s.players[1]!.health = 8;
  s.input(0, { action: 'jab-head', sequence: 1 });
  for (let i = 0; i < 9; i++) s.step(1 / 30);
  assert.equal(s.rounds[0], 1); assert.equal(s.phase, 'intermission');
  s.round = 3; s.phase = 'round'; s.players[0]!.health = 42; s.players[1]!.health = 42; s.roundSeconds = 1 / 30;
  s.step(1 / 30);
  assert.deepEqual(s.rounds, [1, 0]); assert.equal(s.phase, 'matchover'); assert.equal(s.winner, 0);
  const draw = start(); draw.players.forEach(p => { p!.health = 55; }); draw.roundSeconds = 1 / 30; draw.step(1 / 30);
  assert.deepEqual(draw.rounds, [0, 0]); assert.equal(draw.phase, 'intermission');
  const decision = start(); decision.players[0]!.health = 70; decision.players[1]!.health = 80; decision.roundSeconds = 1 / 30; decision.step(1 / 30);
  assert.deepEqual(decision.rounds, [0, 1]);
  const clinch = start(); clinch.rounds = [1, 0]; clinch.endRound(0, 'Knockout');
  assert.equal(clinch.phase, 'matchover'); assert.equal(clinch.winner, 0);
  const matchDraw = start(); matchDraw.phase = 'round'; matchDraw.round = 3; matchDraw.roundSeconds = 1 / 30;
  matchDraw.players.forEach(p => { p!.health = 55; }); matchDraw.step(1 / 30);
  assert.equal(matchDraw.phase, 'matchover'); assert.equal(matchDraw.winner, null);
});

test('disconnect suspends the clock and a forfeit ends the match', () => {
  const s = start(); const remaining = s.roundSeconds;
  s.connected(1, false); for (let i = 0; i < 60; i++) s.step(1 / 30); assert.equal(s.roundSeconds, remaining);
  s.connected(1, true); assert.equal(s.forfeit(1), true);
  assert.equal(s.phase, 'matchover'); assert.equal(s.winner, 0);
});
