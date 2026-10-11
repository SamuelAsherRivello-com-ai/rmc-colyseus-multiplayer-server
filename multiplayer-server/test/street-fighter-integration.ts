import type {StreetFighterSimulation as SnapshotSimulation} from "../packages/client/street-fighter-simulation.js";
type TestGameState = ReturnType<SnapshotSimulation["snapshot"]>;
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";
import { MultiplayerClient, type JoinOptions } from "../packages/client/index.js";

const endpoint = process.env.SERVER_URL || "http://127.0.0.1:2689";
const clients: MultiplayerClient<TestGameState>[] = [];
async function until(fn: () => unknown, label: string, timeout = 20000) {
  const end = Date.now() + timeout;
  while (!fn()) { if (Date.now() > end) throw new Error(label); await delay(40); }
}
async function join(options: JoinOptions|undefined) {
  const client = new MultiplayerClient<TestGameState>(endpoint, "street-fighter-ii", options);
  clients.push(client); void client.connect();
  await until(() => ["connected", "full", "error"].includes(client.state.status), `join failed: ${client.state.error}`);
  return client;
}

test("private two-player duel synchronizes, enforces capacity, and restores the same seat", { timeout: 90000 }, async () => {
  let server;
  try {
    if (!process.env.SERVER_URL) {
      server = spawn(process.execPath, ["--import", "tsx", "server.ts"], { env: { ...process.env, PORT: "2689" }, stdio: "ignore", windowsHide: true });
      let ready = false;
      for (let i = 0; i < 100; i++) { try { ready = (await fetch(endpoint + "/api/health")).ok; } catch {} if (ready) break; await delay(100); }
      assert.ok(ready, "local server starts");
    }
    const a = await join({ create: true });
    assert.equal(a.state.status, "connected");
    const code = a.state.code; assert.match(code!, /^[A-Z0-9]{4}$/);
    const b = await join({ code });
    assert.equal(a.state.roomId, b.state.roomId);
    await until(() => a.state.gameState?.players?.length === 2 && b.state.gameState?.players?.length === 2, "both seats synchronize");
    assert.equal(a.state.gameState!.stage, b.state.gameState!.stage, "both fighters load the same room stage");

    a.send("select", { fighter: "kaida" }); b.send("select", { fighter: "chunLi" });
    await until(() => a.state.gameState!.players[0]!.fighter === "kaida" && a.state.gameState!.players[1]!.fighter === "chunLi", "fighter selection sync");
    a.send("ready", { ready: true }); b.send("ready", { ready: true });
    await until(() => a.state.gameState!.phase === "fight" && b.state.gameState!.phase === "fight", "ready countdown", 10000);
    const p1 = a.state.gameState!.fighters[0]!;
    b.send("input", { seq: 1, away: false, toward: true, up: false, down: false, jump: false, punch: false, kick: false });
    await until(() => a.state.gameState!.fighters[1]!.x < 700, "second-seat relative movement");
    // Vary client-side delivery delay to exercise the authoritative room under jitter.
    for (const [seq, latency] of [0, 65, 18, 92, 35].entries()) {
      if (latency) await delay(latency);
      a.send("input", { seq: seq + 2, away: false, toward: true, up: false, down: false, jump: false, punch: false, kick: false });
    }
    await until(() => b.state.gameState!.fighters[0]!.x > p1.x + 1, "authoritative movement sync");
    a.send("input", { seq: 2, away: false, toward: false, up: false, down: false, jump: false, punch: "heavy", kick: false, health: 0 });
    await delay(200);
    assert.ok(b.state.gameState!.fighters.every((fighter: { health: number; }) => fighter.health > 0), "forged health is ignored");
    const extra = await join({ code }); assert.equal(extra.state.status, "full");
    const invalid = await join({ code: "BAD" }); assert.equal(invalid.state.status, "error");
    const other = await join({ create: true }); assert.notEqual(other.state.roomId, a.state.roomId);

    const oldSeat = a.state.gameState!.players.find((player: { id: string|null; }) => player.id === a.state.sessionId)?.number;
    a.room!.connection.close();
    await until(() => a.state.status === "connected" && a.state.sessionId !== null && a.state.gameState?.phase === "fight", "automatic reconnect", 20000);
    assert.equal(a.state.roomId, b.state.roomId);
    assert.equal(a.state.gameState!.players.find((player: { id: string|null; }) => player.id === a.state.sessionId)?.number, oldSeat, "reconnect keeps the same seat");

    if (!process.env.SERVER_URL) {
      clients.forEach((client) => client.disconnect());
      await delay(250);
      server!.kill();
      await Promise.race([once(server!, "exit"), delay(3000)]);
      server = spawn(process.execPath, ["--import", "tsx", "server.ts"], { env: { ...process.env, PORT: "2689" }, stdio: "ignore", windowsHide: true });
      let ready = false;
      for (let i = 0; i < 100; i++) { try { ready = (await fetch(endpoint + "/api/health")).ok; } catch {} if (ready) break; await delay(100); }
      assert.ok(ready, "replacement process starts");
      const lost = await join({ code });
      assert.equal(lost.state.status, "error", "private invites expire with in-memory room loss");
    }
  } finally {
    clients.forEach((client) => client.disconnect());
    await delay(250);
    server?.kill();
  }
});
