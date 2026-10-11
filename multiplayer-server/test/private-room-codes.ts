import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateRoomCode, normalizePrivateRoomCode, PrivateRoomCodeRateLimiter } from '../src/private-room-codes.ts';

test('private room codes normalize input and use four uppercase alphanumeric characters', () => {
  assert.equal(normalizePrivateRoomCode(' ab9z '), 'AB9Z');
  assert.equal(normalizePrivateRoomCode('ABC'), undefined);
  assert.equal(normalizePrivateRoomCode('ABC123'), undefined);
  assert.equal(normalizePrivateRoomCode('AB!2'), undefined);
  const code = generatePrivateRoomCode(candidate => candidate === 'AB9Z');
  assert.match(code, /^[A-Z0-9]{4}$/);
  assert.notEqual(code, 'AB9Z');
  assert.equal(normalizePrivateRoomCode(' ab1234 ', [4, 6]), 'AB1234');
  assert.equal(normalizePrivateRoomCode('AB1234'), undefined);
  assert.match(generatePrivateRoomCode(() => false, 6), /^[A-Z0-9]{6}$/);
});

test('room code attempt limiter resets after its window', () => {
  const limiter = new PrivateRoomCodeRateLimiter(2, 100);
  assert.equal(limiter.take('client-a', 1000), true);
  assert.equal(limiter.take('client-a', 1001), true);
  assert.equal(limiter.take('client-a', 1002), false);
  assert.equal(limiter.take('client-b', 1002), true);
  assert.equal(limiter.take('client-a', 1100), true);
});
