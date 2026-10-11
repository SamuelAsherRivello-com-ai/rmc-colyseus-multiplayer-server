import { Client, type Room } from "@colyseus/sdk";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const endpoint = process.env.SERVER_URL || "http://127.0.0.1:2567";
const deadline = setTimeout(() => { console.error("FAIL: probe timed out"); process.exit(1); }, 45000);
const rooms: Room<unknown, unknown>[] = [];
try {
  const first = await new Client(endpoint).joinOrCreate("feasibility");
  rooms.push(first);
  const second = await new Client(endpoint).joinOrCreate("feasibility");
  rooms.push(second);
  assert.equal(first.roomId, second.roomId, "Peers must join the same room");
  const nonce = randomUUID();
  const received = rooms.map(room => new Promise<{instance: string;nonce: string}>(resolve => {
    room.onMessage("probe", event => { if (event.nonce === nonce) resolve(event); });
  }));
  first.send("probe", nonce);
  const events = await Promise.all(received);
  assert.equal(events[0]!.instance, events[1]!.instance);
  console.log(JSON.stringify({ result: "PASS", clients: 2, room: first.roomId, instance: events[0]!.instance, endpoint }));
} catch (error) {
  console.error("FAIL:", (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  await Promise.allSettled(rooms.map(room => room.leave()));
  clearTimeout(deadline);
}


if (!process.exitCode) await import('./music-probe.js');
