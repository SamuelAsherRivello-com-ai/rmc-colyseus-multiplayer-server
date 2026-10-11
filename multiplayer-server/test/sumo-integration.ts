import type {SumoSimulation as SnapshotSimulation} from "../src/sumo-simulation.js";
type TestGameState = ReturnType<SnapshotSimulation["snapshot"]>;
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { MultiplayerClient } from '../packages/client/index.js';
const endpoint = process.env.SERVER_URL || 'http://127.0.0.1:2679';
const clients: MultiplayerClient<TestGameState>[] = [];
async function until(fn: () => unknown, message: string, timeout = 15000) { const end = Date.now() + timeout; while (!fn()) { if (Date.now() > end) throw new Error(message); await delay(30); } }
async function join(game = 'sumo-battle') { const c = new MultiplayerClient<TestGameState>(endpoint, game); clients.push(c); void c.connect(); await until(() => ['connected', 'full'].includes(c.state.status), 'join failed: ' + c.state.error); return c; }
test('sumo synchronization, authority, solo bot, late join, capacity, isolation and recovery', { timeout: 90000 }, async () => {
  let server;
  try {
    if (!process.env.SERVER_URL) {
      server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { env: { ...process.env, PORT: '2679' }, stdio: 'ignore' });
      let ready = false;
      for (let i = 0; i < 100; i++) { try { ready = (await fetch(endpoint + '/api/health')).ok; } catch {} if (ready) break; await delay(100); }
      assert.ok(ready);
    }
    const a = await join();
    assert.ok(a.state.gameState!.wrestlers.some(p => p.bot));
    const b = await join();
    assert.equal(a.state.roomId, b.state.roomId);
    await until(() => a.state.gameState!.wrestlers.length === 2 && !a.state.gameState!.wrestlers.some(p => p.bot), 'bot not removed');
    const id = a.state.sessionId, initial = b.state.gameState!.wrestlers.find((p: { id: string|null; }) => p.id === id)!.x;
    a.send('input', { x: -.4, z: .2, dash: false });
    await until(() => Math.abs(b.state.gameState!.wrestlers.find((p: { id: string|null; }) => p.id === id)!.x - initial) > .03, 'movement did not synchronize');
    a.send('input', { x: 0, z: 0, dash: false });
    a.send('input', { x: 999, z: 0, dash: true, score: 3, id: b.state.sessionId });
    await delay(200);
    assert.equal(b.state.gameState!.winner, null); assert.ok(b.state.gameState!.wrestlers.every((p: { x: unknown; score: number; }) => Number.isFinite(p.x) && p.score === 0));
    const c = await join(); assert.equal(c.state.gameState!.match, b.state.gameState!.match);
    const draw = await join('multiplayer-draw'); assert.notEqual(draw.state.roomId, a.state.roomId); assert.equal(draw.state.gameState, null);
    a.disconnect(); await until(() => !b.state.players.some(p => p.id === id), 'departure missing');
    const d = await join(); assert.notEqual(d.state.sessionId, id);
    for (let i = 0; i < 9; i++) assert.equal((await join()).state.status, 'connected');
    await until(() => b.state.players.length === 12, '12 seats missing');
    assert.equal(new Set(b.state.players.map(p => p.color)).size, 12);
    const extra = await join(); assert.equal(extra.state.status, 'full');
    d.disconnect(); await until(() => b.state.players.length === 11, 'seat not freed'); void extra.connect();
    await until(() => extra.state.status === 'connected', 'full retry failed');
    const old = b.state.sessionId; b.room!.connection.close();
    await until(() => b.state.status === 'connected' && b.state.sessionId !== old, 'fresh reconnect failed', 20000);
    const forbidden = await fetch(endpoint + '/matchmake/joinOrCreate/sumo-battle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(forbidden.status, 403);
  } finally { clients.forEach(c => c.disconnect()); await delay(250); server?.kill(); }
});
