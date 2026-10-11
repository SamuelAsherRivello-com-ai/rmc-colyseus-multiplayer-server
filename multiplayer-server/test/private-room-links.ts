import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoomLink, readRoomCode, suggestRoomCode, MultiplayerClient } from '../packages/client/index.js';

test('private room link helpers generate suggestions, read codes and preserve page parameters', () => {
  assert.match(suggestRoomCode(), /^[A-Z0-9]{4}$/);
  assert.equal(readRoomCode('?mode=online&room=ab9z'), 'AB9Z');
  const link = new URL(buildRoomLink('ab9z', 'https://game.example/play?mode=online&theme=dark#lobby'));
  assert.equal(link.searchParams.get('room'), 'AB9Z');
  assert.equal(link.searchParams.get('mode'), 'online');
  assert.equal(link.searchParams.get('theme'), 'dark');
  assert.equal(link.hash, '#lobby');
  const previousLocation = globalThis.location;
  globalThis.location = { search: '?room=qwer' } as Location; // Only search is read by the link helper.
  try {
    assert.deepEqual(new MultiplayerClient('https://example.test', 'bomberman').options, { code: 'QWER', create: false });
    assert.deepEqual(new MultiplayerClient('https://example.test', 'bomberman', { create: true }).options, { create: true });
  } finally {
    if (previousLocation === undefined) Reflect.deleteProperty(globalThis, "location");
    else globalThis.location = previousLocation;
  }
});
