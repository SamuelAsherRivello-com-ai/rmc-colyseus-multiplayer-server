import type {RingRivalsSimulation as SnapshotSimulation} from "../src/ring-rivals-simulation.js";
type TestGameState = ReturnType<SnapshotSimulation["snapshot"]>;
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { MultiplayerClient } from '../packages/client/index.js';

const endpoint = process.env.SERVER_URL || 'http://127.0.0.1:2688';
const clients: MultiplayerClient<TestGameState>[] = [];
async function until(fn: () => unknown, message: string, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (!fn()) {
    if (Date.now() > deadline) throw new Error(message);
    await delay(30);
  }
}
async function connect(game = 'ring-rivals', options = {}) {
  const client = new MultiplayerClient<TestGameState>(endpoint, game, options);
  clients.push(client);
  void client.connect();
  await until(() => ['connected', 'full', 'error'].includes(client.state.status), `join failed: ${client.state.error}`);
  return client;
}
async function startServer() {
  if (process.env.SERVER_URL) return null;
  const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    env: { ...process.env, PORT: '2688' }, stdio: 'ignore', windowsHide: true,
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { ready = (await fetch(`${endpoint}/api/health`)).ok; } catch { /* Wait for startup. */ }
    if (ready) break;
    await delay(100);
  }
  assert.equal(ready, true, 'server did not start');
  return server;
}

test('Ring Rivals private room synchronizes the bout, enforces capacity, isolates games, and recovers the same seat', { timeout: 90000 }, async () => {
  let server;
  try {
    server = await startServer();
    const health = await (await fetch(`${endpoint}/api/health`)).json();
    assert.ok(health.games.includes('ring-rivals'));
    const a = await connect('ring-rivals', { create: true });
    assert.match(a.state.code!, /^[A-Z0-9]{4}$/);
    const b = await connect('ring-rivals', { code: a.state.code });
    assert.equal(a.state.roomId, b.state.roomId);
    const invalid = await connect('ring-rivals', { code: 'NOTREAL' });
    assert.equal(invalid.state.status, 'error');
    await until(() => a.state.gameState?.players?.filter(Boolean).length === 2, 'two-seat snapshot missing');
    a.send('select', { boxer: 'rook' }); b.send('select', { boxer: 'flash' });
    a.send('ready'); b.send('ready');
    await until(() => a.state.gameState?.phase === 'round', 'round did not start');
    const bHealth = b.state.gameState!.players[1]!.health;
    a.send('input', { action: 'jab-head', sequence: 1 });
    await until(() => b.state.gameState!.players[1]!.health < bHealth, 'authoritative attack did not synchronize');
    const sessionId = a.state.sessionId;
    a.room!.connection.close();
    await until(() => a.state.status === 'reconnecting', 'drop was not observed');
    await until(() => a.state.status === 'connected' && a.state.sessionId === sessionId, 'same-seat recovery failed', 18000);
    assert.equal(a.state.roomId, b.state.roomId);
    const full = await connect('ring-rivals', { code: a.state.code });
    assert.equal(full.state.status, 'full');
    const isolated = await connect('sumo-battle');
    assert.notEqual(isolated.state.roomId, a.state.roomId);
    assert.equal(isolated.state.gameState?.players, undefined);
    const previousIdentity = isolated.state.sessionId;
    isolated.room!.connection.close();
    await until(() => isolated.state.status === 'reconnecting', 'existing game drop was not observed');
    await until(() => isolated.state.status === 'connected' && isolated.state.sessionId !== previousIdentity, 'existing game did not retain fresh-identity reconnect behavior');
  } finally {
    clients.splice(0).forEach(client => client.disconnect());
    await delay(300);
    server?.kill();
  }
});

test('Ring Rivals awards a forfeit after the 15-second recovery window expires', { timeout: 45000 }, async () => {
  let server;
  try {
    server = await startServer();
    const a = await connect('ring-rivals', { create: true });
    const b = await connect('ring-rivals', { code: a.state.code });
    a.send('ready'); b.send('ready');
    await until(() => b.state.gameState?.phase === 'round', 'round did not start');
    const disconnectedSeat = a.state.sessionId;
    a.stopped = true;
    a.room!.reconnection.enabled = false;
    a.room!.connection.close();
    try { await until(() => b.state.gameState?.phase === 'matchover' && b.state.gameState?.winner === 1, 'forfeit not awarded after recovery expiry', 22000); }
    catch (error) { throw new Error(`${(error instanceof Error ? error.message : String(error))}; snapshot=${JSON.stringify(b.state.gameState)}; players=${JSON.stringify(b.state.players)}`); }
    assert.notEqual(disconnectedSeat, b.state.sessionId);
  } finally {
    clients.splice(0).forEach(client => client.disconnect());
    await delay(300);
    server?.kill();
  }
});
