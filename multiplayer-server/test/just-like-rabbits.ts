interface Transfer {state: {rabbits: {id: string}[]};sequence: number;random: unknown;clock: unknown}
interface HabitatState {transfer: Transfer}
interface HabitatAction {type: string;sender: string;sequence: number}
type HabitatClient = MultiplayerClient<HabitatState, Record<string, unknown>, Transfer, HabitatAction>;
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { MultiplayerClient } from "../packages/client/index.js";
import { ParticipantHostRelay } from "../src/participant-host-relay.ts";

const endpoint = process.env.SERVER_URL || "http://127.0.0.1:2694";
const clients: HabitatClient[] = [];
async function until(predicate: () => unknown, label: string, timeout = 15000) { const end = Date.now() + timeout; while (!predicate()) { if (Date.now() > end) throw Error(label); await delay(30); } }
async function join(game = "just-like-rabbits") { const client = new MultiplayerClient<HabitatState, Record<string, unknown>, Transfer, HabitatAction>(endpoint, game); clients.push(client); void client.connect(); await until(() => ["connected", "full"].includes(client.state.status), `join ${client.state.error}`); return client; }

test("participant host relay elects longest eligible host and keeps only host transfer", () => {
  const relay = new ParticipantHostRelay();
  assert.equal(relay.join("first", 0).hostId, "first");
  relay.join("second", 1);
  assert.equal(relay.host, "first");
  assert.equal(relay.publish("second", { state: {}, random: {}, clock: {} }, 2), null);
  assert.equal(relay.publish("first", { state: { rabbits: 2 }, random: { seed: 3 }, clock: { speed: 1 } }, 3)?.sequence, 1);
  assert.equal(relay.leave("first").hostId, "second");
  assert.deepEqual(relay.transfer?.state, {rabbits: 2});
  assert.equal(relay.leave("second").hostId, null);
});

test("Just Like Rabbits relays presence, ordered actions, host transfer, capacity, and isolation", { timeout: 90000 }, async () => {
  let server;
  try {
    if (!process.env.SERVER_URL) {
      server = spawn(process.execPath, ["--import", "tsx", "server.ts"], { env: { ...process.env, PORT: "2694" }, stdio: "ignore", windowsHide: true });
      for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(`${endpoint}/api/health`)).ok) break; } catch {} await delay(100); }
    }
    const a = await join(), b = await join();
    assert.equal(a.state.roomId, b.state.roomId);
    assert.equal(a.state.hostId, a.state.sessionId);
    a.send("hostSnapshot", { state: { rabbits: [{ id: "r1" }] }, random: { seed: 7 }, clock: { speed: 1, time: 3 } });
    await until(() => b.state.gameState?.transfer?.state?.rabbits?.[0]?.id === "r1", "host snapshot missing");
    const sequence = b.state.gameState!.transfer.sequence;
    b.send("hostSnapshot", { state: { rabbits: [{ id: "bad" }] }, random: {}, clock: {} });
    await delay(180); assert.equal(b.state.gameState!.transfer.sequence, sequence, "guest overwrote host transfer");
    b.send("action", { type: "speed", payload: 2 });
    await until(() => a.state.lastAction?.type === "speed" && a.state.lastAction?.sender === b.state.sessionId, "ordered guest action missing");
    b.send("action", { type: "plant", payload: { x: 99, z: 0 } });
    await delay(160); assert.equal(a.state.lastAction?.type, "speed", "out-of-bounds action accepted");
    b.send("cursor", [0.25, 0.75]);
    await until(() => a.state.players.find(player => player.id === b.state.sessionId)?.cursor?.[0] === 0.25, "cursor missing");
    const late = await join(); await until(() => late.state.gameState?.transfer?.sequence === sequence, "late join transfer missing");
    const drawing = await join("multiplayer-draw"); assert.notEqual(drawing.state.roomId, a.state.roomId, "game rooms must isolate");
    const firstId = a.state.sessionId; a.disconnect();
    await until(() => b.state.hostId === b.state.sessionId && b.state.transfer?.sequence === sequence, "longest connected successor missing");
    assert.notEqual(b.state.hostId, firstId);
    for (let i = 0; i < 10; i++) assert.equal((await join()).state.status, "connected");
    const full = await join(); assert.equal(full.state.status, "full", "thirteenth habitat participant joined");
  } finally { for (const client of clients) client.disconnect(); await delay(250); server?.kill(); }
});
