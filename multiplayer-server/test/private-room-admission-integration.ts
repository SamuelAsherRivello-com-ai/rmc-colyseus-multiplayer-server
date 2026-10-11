interface RecoveryPlayer {id?: string | null;number?: number;seat?: number;connected?: boolean;boxer?: string;health?: number;fighter?: string;color?: string | number;name?: string;weapon?: string;x?: number;y?: number}
interface RecoveryState {players: (RecoveryPlayer | null)[];people: RecoveryPlayer[]}
type RecoveryClient = MultiplayerClient<RecoveryState>;
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { MultiplayerClient, type JoinOptions } from '../packages/client/index.js';

const endpoint = process.env.SERVER_URL || 'http://127.0.0.1:2686';
const clients: RecoveryClient[] = [];
const uniqueCode = (prefix: string) => `${prefix}${Date.now().toString(36).slice(-3)}`.toUpperCase();
async function until(fn: () => unknown, label: string, ms = 20000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error(label); await delay(40); }
}
async function join(game: string|undefined, options: JoinOptions|undefined) {
  const client = new MultiplayerClient<RecoveryState>(endpoint, game, options);
  clients.push(client); void client.connect();
  await until(() => ['connected', 'full', 'error'].includes(client.state.status), 'join ' + client.state.error);
  return client;
}
async function dropAbruptly(client: RecoveryClient, settleMs = 200) {
  client.stopped = true;
  client.room!.reconnection.enabled = false;
  client.room!.connection.close();
  if (settleMs > 0) await delay(settleMs);
}
function persistentPlayer(game: string|undefined, client: RecoveryClient) {
  if (!client.state.gameState) return undefined;
  const id = client.state.sessionId;
  if (game === 'ring-rivals') {
    const seat = client.state.players.find(player => player.id === id)?.seat;
    return client.state.gameState.players[seat!];
  }
  const list = game === 'bomberman' ? client.state.gameState.people : client.state.gameState.players;
  return list.find((player) => player?.id === id);
}
function persistentFields(game: string | undefined, player: RecoveryPlayer | null | undefined) {
  assert.ok(player);
  if (game === 'ring-rivals') return { boxer: player.boxer, health: player.health };
  if (game === 'street-fighter-ii') return { number: player.number, fighter: player.fighter };
  if (game === 'bomberman') return { number: player.number, color: player.color, name: player.name };
  return { number: player.number, weapon: player.weapon, x: player.x, y: player.y };
}
async function waitForDisconnect(game: string, observer: RecoveryClient, sessionId: string|null, playerNumber?: number) {
  await until(() => {
    if (game === 'street-fighter-ii') return observer.state.gameState?.players.find((player) => player!.number === playerNumber)?.connected === false;
    if (game === 'ring-rivals') {
      const seat = observer.state.players.find(player => player.id === sessionId)?.seat;
      return seat !== undefined && observer.state.gameState?.players[seat!]?.connected === false;
    }
    return observer.state.players.find(player => player.id === sessionId)?.connected === false;
  }, `${game} broadcasts a dropped seat`);
}

test('private room creation accepts custom codes, rejects collisions, normalizes joins and throttles guesses', { timeout: 60000 }, async () => {
  let server;
  try {
    if (!process.env.SERVER_URL) {
      server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { env: { ...process.env, PORT: '2686' }, stdio: 'ignore', windowsHide: true });
      let ready = false;
      for (let i = 0; i < 100; i++) { try { ready = (await fetch(endpoint + '/api/health')).ok; } catch {} if (ready) break; await delay(100); }
      assert.ok(ready, 'local server starts');
    } else {
      const health = await fetch(endpoint + '/api/health');
      assert.ok(health.ok, 'configured server is healthy');
    }

    const primaryCode = uniqueCode('T');
    const host = await join('gungeon', { create: true, code: primaryCode });
    assert.equal(host.state.status, 'connected', host.state.error);
    assert.equal(host.state.code, primaryCode);
    const guest = await join('gungeon', { code: primaryCode.toLowerCase() });
    assert.equal(guest.state.roomId, host.state.roomId);

    const droppedSession = guest.state.sessionId;
    guest.send('weapon', 'carbine');
    await until(() => persistentPlayer('gungeon', guest)?.weapon === 'carbine', 'Gungeon weapon selection syncs before refresh');
    const beforeGungeonRejoin = persistentFields('gungeon', persistentPlayer('gungeon', guest));
    await dropAbruptly(guest);
    await waitForDisconnect('gungeon', host, droppedSession);
    await delay(15_100);
    const refreshed = await join('gungeon', { code: primaryCode });
    assert.equal(refreshed.state.roomId, host.state.roomId, 'the room survives a dropped connection');
    assert.notEqual(refreshed.state.sessionId, droppedSession, 'code recovery creates a fresh identity');
    await until(() => host.state.players.some(player => player.id === refreshed.state.sessionId), 'replacement presence is broadcast');
    await until(() => persistentPlayer('gungeon', refreshed)?.weapon === 'carbine', 'replacement retains Gungeon state');
    assert.deepEqual(persistentFields('gungeon', persistentPlayer('gungeon', refreshed)), beforeGungeonRejoin);

    for (const [game, code] of ([['bomberman', `${uniqueCode('B')}12`], ['ring-rivals', uniqueCode('R')], ['street-fighter-ii', uniqueCode('F')]] as const)) {
      const first = await join(game, { create: true, code });
      assert.equal(first.state.status, 'connected', `${game} host: ${first.state.error}`);
      if (game === 'bomberman') assert.match(first.state.code!, /^[A-Z0-9]{6}$/, 'legacy Bomberman invite stays six characters');
      const second = await join(game, { code });
      assert.equal(second.state.status, 'connected', `${game} guest: ${second.state.error}`);
      await until(() => persistentPlayer(game, second) !== undefined, `${game} initial game state is present`);
      if (game === 'bomberman') {
        for (let index = 0; index < 2; index++) assert.equal((await join(game, { code })).state.status, 'connected');
      }
      const roomId = first.state.roomId;
      if (game === 'ring-rivals') second.send('select', { boxer: 'rook' });
      if (game === 'street-fighter-ii') second.send('select', { fighter: 'kaida' });
      const selectedValue = { 'bomberman': undefined, 'ring-rivals': 'rook', 'street-fighter-ii': 'kaida' }[game];
      if (selectedValue !== undefined) {
        const field = game === 'ring-rivals' ? 'boxer' : 'fighter';
        await until(() => persistentPlayer(game, second)?.[field] === selectedValue, `${game} selection syncs before refresh`);
      }
      const beforeRejoin = persistentFields(game, persistentPlayer(game, second));
      const blocked = await join(game, { code });
      assert.equal(blocked.state.status, 'full', `${game} does not replace a connected seat`);
      const oldSessionId = second.state.sessionId;
      await dropAbruptly(second, 0);
      const replacement = await join(game, { code });
      assert.equal(replacement.state.status, 'connected', `${game} replacement: ${replacement.state.error}`);
      assert.equal(replacement.state.roomId, roomId, `${game} keeps the same coded room`);
      assert.notEqual(replacement.state.sessionId, oldSessionId, `${game} rejoin uses a fresh identity`);
      await until(() => first.state.players.some(player => player.id === replacement.state.sessionId), `${game} replacement presence is broadcast`);
      await until(() => persistentPlayer(game, replacement) !== undefined, `${game} replacement game state is present`);
      assert.deepEqual(persistentFields(game, persistentPlayer(game, replacement)), beforeRejoin, `${game} replacement preserves its seat state`);
    }

    const fourCharacterBomberman = await join('bomberman', { create: true, code: uniqueCode('L') });
    assert.equal(fourCharacterBomberman.state.status, 'connected', fourCharacterBomberman.state.error);
    assert.match(fourCharacterBomberman.state.code!, /^[A-Z0-9]{4}$/, 'recent four-character Bomberman callers stay accepted');

    const emptyCode = uniqueCode('E');
    const empty = await join('gungeon', { create: true, code: emptyCode });
    const emptyRoomId = empty.state.roomId;
    const emptySessionId = empty.state.sessionId;
    await dropAbruptly(empty);
    await delay(250);
    const reclaimedEmpty = await join('gungeon', { code: emptyCode });
    assert.equal(reclaimedEmpty.state.roomId, emptyRoomId, 'a gracefully emptied room survives its refresh grace');
    assert.notEqual(reclaimedEmpty.state.sessionId, emptySessionId, 'refresh into an empty room gets a fresh identity');
    await dropAbruptly(reclaimedEmpty);
    await delay(250);
    await delay(15_100);
    const expired = await fetch(endpoint + '/api/join/gungeon', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.43' }, body: JSON.stringify({ code: emptyCode }) });
    assert.equal(expired.status, 404, 'an unreclaimed empty room expires after its recovery grace');

    const conflict = await fetch(endpoint + '/api/join/gungeon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ create: true, code: primaryCode }) });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).errorCode, 'code_in_use');

    const malformed = await fetch(endpoint + '/api/join/gungeon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'BAD' }) });
    assert.equal(malformed.status, 400);

    const generated = await join('gungeon', { create: true });
    assert.match(generated.state.code!, /^[A-Z0-9]{4}$/);
    assert.notEqual(generated.state.code, host.state.code);

    let attemptsBeforeLimit = 0;
    let limited;
    // A live proxy may count earlier joins from the runner's IP despite the supplied forwarded address.
    for (let attempt = 0; attempt < 31; attempt++) {
      const response = await fetch(endpoint + '/api/join/gungeon', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.42' }, body: JSON.stringify({ code: 'ZZZZ' }) });
      if (response.status === 429) { limited = response; break; }
      assert.equal(response.status, 404);
      attemptsBeforeLimit++;
    }
    assert.ok(limited, 'repeated guesses are throttled');
    if (!process.env.SERVER_URL) assert.equal(attemptsBeforeLimit, 30, 'a fresh local source gets exactly 30 attempts');
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '60');
    assert.equal((await limited.json()).errorCode, 'rate_limited');
  } finally {
    clients.forEach(client => client.disconnect());
    await delay(250);
    server?.kill();
  }
});
