import type {NeonBreakerSimulation as SnapshotSimulation} from "../src/neon-breaker-simulation.js";
type TestGameState = ReturnType<SnapshotSimulation["snapshot"]> & {serverTime: number};
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { MultiplayerClient } from '../packages/client/index.js';

const endpoint = process.env.SERVER_URL || 'http://127.0.0.1:2684';
const clients: MultiplayerClient<TestGameState>[] = [];

async function until(fn: () => unknown, message: string, timeout = 15000) {
  const end = Date.now() + timeout;
  while (!fn()) {
    if (Date.now() > end) throw Error(message);
    await delay(30);
  }
}

async function join(game = 'neon-breaker-duo') {
  const client = new MultiplayerClient<TestGameState>(endpoint, game);
  clients.push(client);
  void client.connect();
  await until(() => ['connected', 'full', 'error'].includes(client.state.status), `join: ${client.state.error}`);
  return client;
}

function assertWaveOneBrickRows(gameState: TestGameState, label: string) {
  const rows = new Map<number,number>();
  for (const brick of gameState.bricks) rows.set(brick.y, (rows.get(brick.y) ?? 0) + 1);
  assert.deepEqual([...rows].sort(([a], [b]) => a - b), [[74, 11], [94, 11], [114, 11], [134, 7]], `${label} contains every first-wave brick row`);
}

test('Neon Breaker synchronizes actions, admits two, snapshots late joins, frees seats, and isolates games', { timeout: 90000 }, async t => {
  let server;
  try {
    if (!process.env.SERVER_URL) {
      server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
        env: { ...process.env, PORT: '2684' }, stdio: 'ignore', windowsHide: true,
      });
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try { ready = (await fetch(`${endpoint}/api/health`)).ok; } catch { /* Wait for startup. */ }
        if (ready) break;
        await delay(100);
      }
      assert.ok(ready, 'local server starts');
    }

    const health = await (await fetch(`${endpoint}/api/health`)).json();
    assert.ok(health.games.includes('neon-breaker-duo'));
    const a = await join();
    // The public playtest has one intentionally shared room. Leave it alone if
    // a person is already playing, or if the room fills while this smoke check joins.
    if (a.state.status === 'full') return t.skip('public playtest room is already full');
    assert.equal(a.state.status, 'connected', a.state.error);
    const seatA = a.state.players.find(player => player.id === a.state.sessionId)?.seat;
    assert.ok(Number.isInteger(seatA), 'joined seat is present in the room snapshot');
    if (a.state.players.some(player => player.id !== a.state.sessionId)) {
      return t.skip('public playtest room already has a player; avoiding changes to their match');
    }

    assert.equal(a.state.gameState!.lives, 3);
    assert.deepEqual(a.state.gameState!.paddles.map(({ y }) => y), [490, 440]);
    assertWaveOneBrickRows(a.state.gameState!, 'host snapshot');
    const initialServerTime = a.state.gameState!.serverTime;
    assert.ok(Number.isFinite(initialServerTime), 'snapshots include the authoritative server clock');
    await until(() => a.state.gameState!.serverTime > initialServerTime, 'server clock advances with game snapshots');
    a.send('input', { x: .98 });
    await until(() => a.state.gameState!.paddles[seatA!]!.x > 280, 'full-width input sync');
    assert.ok(a.state.gameState!.paddles[seatA!]!.x <= 301);
    a.send('launch');
    await until(() => a.state.gameState!.balls.some(ball => !ball.attached), 'launch sync');

    const b = await join();
    if (b.state.status === 'full') return t.skip('another player filled the public playtest during verification');
    assert.equal(b.state.status, 'connected', b.state.error);
    assert.equal(a.state.roomId, b.state.roomId);
    const seatB = b.state.players.find(player => player.id === b.state.sessionId)?.seat;
    assert.ok(Number.isInteger(seatB) && seatB !== seatA);
    await until(() => b.state.gameState!.balls.some(ball => !ball.attached), 'late join snapshot');
    await until(() => a.state.gameState!.paddles?.length === 2 && b.state.gameState!.paddles?.length === 2, 'complete game snapshots');
    assert.deepEqual(a.state.gameState!.paddles.map(({ y }) => y), [490, 440]);
    assert.deepEqual(b.state.gameState!.paddles.map(({ y }) => y), [490, 440]);
    assertWaveOneBrickRows(a.state.gameState!, 'host live state');
    assertWaveOneBrickRows(b.state.gameState!, 'late-join snapshot');
    assert.deepEqual(a.state.gameState!.bricks, b.state.gameState!.bricks, 'both seats observe the same authoritative brick rows and hit points');
    b.send('input', { x: .98 });
    a.send('input', { x: .98 });
    await until(() => Math.abs(a.state.gameState!.paddles[seatA!]!.x - a.state.gameState!.paddles[seatB!]!.x) < 1, 'paddles can overlap');
    await until(() => JSON.stringify(a.state.gameState!.paddles) === JSON.stringify(b.state.gameState!.paddles), 'same full state reaches both players');

    const c = await join();
    assert.equal(c.state.status, 'full');
    const isolated = await join('sumo-battle');
    assert.notEqual(isolated.state.roomId, a.state.roomId);
    assert.equal(isolated.state.gameState?.paddles, undefined);

    a.disconnect();
    await until(() => b.state.players.length === 1 && Math.abs(b.state.gameState!.paddles[seatA!]!.x - 160) < 1, 'departure centers the freed paddle');
    const retry = await join();
    assert.equal(retry.state.status, 'connected');
    assert.equal(retry.state.roomId, b.state.roomId);
  } finally {
    clients.splice(0).forEach(client => client.disconnect());
    await delay(300);
    server?.kill();
  }
});
