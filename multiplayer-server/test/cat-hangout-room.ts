import assert from "node:assert/strict";
import test from "node:test";
import type { Client } from "@colyseus/core";
import { CatHangoutRoom } from "../src/cat-hangout-room.ts";

const client = (sessionId: string) => ({ sessionId }) as Client;

test("Cat Hangout fills only the gap below four cats", () => {
  const room = new CatHangoutRoom();
  room.onJoin(client("one"));
  assert.equal(room.snapshot().players.length, 1);
  assert.equal(room.snapshot().cats.length, 4);
  room.onJoin(client("two")); room.onJoin(client("three")); room.onJoin(client("four"));
  assert.equal(room.snapshot().players.length, 4);
  assert.equal(room.snapshot().cats.filter((cat) => cat.bot).length, 0);
});

test("Cat Hangout accepts twelve humans without bots", () => {
  const room = new CatHangoutRoom();
  for (let index = 1; index <= 12; index++) room.onJoin(client(`human-${index}`));
  const snapshot = room.snapshot();
  assert.equal(snapshot.players.length, 12);
  assert.equal(snapshot.cats.length, 12);
  assert.equal(snapshot.cats.filter((cat) => cat.bot).length, 0);
  assert.deepEqual(snapshot.players.map((cat) => cat.number), Array.from({ length: 12 }, (_, index) => index + 1));
});

test("Cat Hangout validates movement and owns interaction state", () => {
  const room = new CatHangoutRoom(); const human = client("human"); room.onJoin(human);
  const beforeX = room.cats.get("human")!.x;
  assert.equal(room.receiveMove(human, { x: 3, z: 0 }), false);
  room.step(); assert.equal(room.cats.get("human")!.x, beforeX);
  assert.equal(room.receiveMove(human, { x: 1, z: 0 }), true);
  room.step(); assert.ok(room.cats.get("human")!.x > beforeX);
  assert.equal(room.receiveInteract(human), true);
  assert.equal(room.cats.get("human")!.activity, "social");
});
