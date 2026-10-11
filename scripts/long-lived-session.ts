import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Client, type Room } from "@colyseus/sdk";

const endpoint = process.env.SERVER_URL;
const duration = Number(process.env.LONG_SESSION_SECONDS || 360) * 1000;
if (!endpoint) throw new Error("SERVER_URL is required");
if (!Number.isFinite(duration) || duration < 1000) throw new Error("LONG_SESSION_SECONDS must be at least 1");

const clients = [new Client(endpoint), new Client(endpoint)];
const rooms: Room<unknown, unknown>[] = [];
const nonce = randomUUID();
let lastEcho = Date.now();
let disconnected = false;
let disconnectCode;
const started = Date.now();

try {
  rooms.push(await clients[0]!.joinOrCreate("feasibility"));
  rooms.push(await clients[1]!.joinOrCreate("feasibility"));
  assert.equal(rooms[0]!.roomId, rooms[1]!.roomId, "both sessions must share the same room");
  rooms[0]!.onMessage("probe", () => {});
  rooms[1]!.onMessage("probe", event => {
    if (event.nonce === nonce && event.sender === rooms[0]!.sessionId) lastEcho = Date.now();
  });
  for (const room of rooms) room.onLeave(code => { disconnected = true; disconnectCode = code; });

  while (Date.now() - started < duration) {
    if (disconnected) throw new Error(`WebSocket disconnected with code ${disconnectCode}`);
    rooms[0]!.send("probe", nonce);
    await delay(1000);
    if (Date.now() - lastEcho > 10000) throw new Error("Peer stopped receiving server-mediated messages");
  }
  if (disconnected) throw new Error(`WebSocket disconnected with code ${disconnectCode}`);
  console.log(JSON.stringify({ result: "PASS", clients: rooms.length, room: rooms[0]!.roomId, seconds: Math.round((Date.now() - started) / 1000) }));
} finally {
  await Promise.allSettled(rooms.map(room => room.leave()));
}
