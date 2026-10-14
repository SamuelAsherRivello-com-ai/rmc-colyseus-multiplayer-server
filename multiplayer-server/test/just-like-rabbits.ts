import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { MultiplayerClient } from "../packages/client/index.js";
import { advance, botCountForHumans, initialHabitatState, plant, reconcileBotRabbits, setTimeScale, type HabitatState } from "../src/just-like-rabbits-simulation.ts";

type Actions = { action: { type: "plant"; payload: { x: number; z: number } } | { type: "speed"; payload: 0.5 | 1 | 2 | 4 | 10 } };
const endpoint = process.env.SERVER_URL || "http://127.0.0.1:2694";
const clients: MultiplayerClient<HabitatState, Actions>[] = [];

async function until(predicate: () => unknown, label: string, timeout = 15000) {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > end) throw Error(label);
    await delay(30);
  }
}

async function join() {
  const client = new MultiplayerClient<HabitatState, Actions>(endpoint, "just-like-rabbits");
  clients.push(client);
  void client.connect();
  await until(() => ["connected", "full"].includes(client.state.status), `join ${client.state.error}`);
  return client;
}

test("authoritative habitat advances deterministic state in fixed ticks", () => {
  const state = initialHabitatState();
  assert.equal(plant(state, { x: 2, y: 2 }), true);
  advance(state, 0.1);
  assert.equal(state.elapsed, 0.1);
  setTimeScale(state, 2);
  advance(state, 0.1);
  assert.equal(state.elapsed, 0.3);
});

test("cultivated dirt carries a carrot through four frames to a harvest object", () => {
  const state = initialHabitatState();
  assert.equal(plant(state, { x: 2, y: 2 }), true);
  assert.deepEqual(state.cultivated, [{ x: 2, y: 2 }]);
  for (const [seconds, stage] of [[14.9, 0], [0.1, 1], [15, 2], [15, 3]] as const) { advance(state, seconds); assert.equal(state.plots[0]?.stage, stage); }
  advance(state, 15);
  assert.equal(state.plots.length, 0);
  assert.deepEqual(state.carrots, [{ x: 2, y: 2 }]);
  assert.equal(plant(state, { x: 2, y: 2 }), false);
  state.carrots = [];
  assert.equal(plant(state, { x: 2, y: 2 }), true);
});

test("authoritative habitat keeps resident rabbits and reconciles one to three deterministic bots", () => {
  const state = initialHabitatState();
  for (const [humans, expected] of [[1, 3], [4, 3], [5, 2], [8, 2], [9, 1], [12, 1]] as const) {
    reconcileBotRabbits(state, humans);
    assert.equal(botCountForHumans(humans), expected);
    assert.equal(state.rabbits.filter(rabbit => rabbit.kind === "resident").map(rabbit => rabbit.id).join(","), "hazel,poppy");
    assert.equal(state.rabbits.filter(rabbit => rabbit.kind === "bot").length, expected);
  }
  const before = structuredClone(state.rabbits);
  advance(state, 1);
  assert.equal(state.rabbits.filter(rabbit => rabbit.kind === "bot").length, 1);
  assert.notDeepEqual(state.rabbits, before);
});

test("Just Like Rabbits shares server-owned state across twelve seats and rejects a thirteenth", { timeout: 90000 }, async () => {
  let server: ReturnType<typeof spawn> | undefined;
  try {
    if (!process.env.SERVER_URL) {
      server = spawn(process.execPath, ["--import", "tsx", "server.ts"], { env: { ...process.env, PORT: "2694" }, stdio: "ignore", windowsHide: true });
      for (let attempt = 0; attempt < 100; attempt++) {
        try { if ((await fetch(`${endpoint}/api/health`)).ok) break; } catch {}
        await delay(100);
      }
    }
    const first = await join();
    const second = await join();
    assert.equal(first.state.roomId, second.state.roomId);
    assert.equal(first.state.capacity, 12);
    first.send("action", { type: "plant", payload: { x: 2, z: 2 } });
    await until(() => second.state.gameState?.plots.some(plot => plot.x === 2 && plot.y === 2), "server did not broadcast planted plot");
    second.send("action", { type: "speed", payload: 10 });
    await until(() => first.state.gameState?.timeScale === 10, "server did not broadcast time scale");
    second.send("action", { type: "plant", payload: { x: 2, z: 2 } });
    await delay(150);
    assert.equal(first.state.gameState?.plots.filter(plot => plot.x === 2 && plot.y === 2).length, 1, "duplicate plot was accepted");
    second.send("action", { type: "plant", payload: { x: 99, z: 0 } });
    await delay(150);
    assert.equal(first.state.gameState?.plots.length, 1, "invalid plot was accepted");
    const additional = await Promise.all(Array.from({ length: 10 }, () => join()));
    await until(() => first.state.players.length === 12, "twelve players were not admitted");
    assert.ok(additional.every(client => client.state.status === "connected"));
    const thirteenth = await join();
    assert.equal(thirteenth.state.status, "full");
    first.disconnect();
    await until(() => second.state.players.length === 11, "departure was not broadcast");
    const replacement = await join();
    assert.equal(replacement.state.status, "connected", "a released seat was not reusable");
  } finally {
    for (const client of clients) client.disconnect();
    await delay(250);
    server?.kill();
  }
});
