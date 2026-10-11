import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { MultiplayerClient } from "../packages/client/index.js";

const endpoint = process.env.SERVER_URL || "http://127.0.0.1:2678";
const clients: MultiplayerClient<unknown,Record<string,unknown>,unknown,unknown,unknown>[] = [];
async function until(predicate: () => unknown, message: string, timeout = 12000) {
  const end = Date.now() + timeout;
  while (!predicate()) { if (Date.now() > end) throw new Error(message); await delay(30); }
}
async function join() {
  const client = new MultiplayerClient(endpoint);
  clients.push(client);
  void client.connect();
  await until(() => ["connected", "full"].includes(client.state.status), "Join failed: " + client.state.error);
  return client;
}
test("drawing ownership, late join, cleanup, stable seats, 12 capacity, and full-room retry", { timeout: 90000 }, async () => {
  let server;
  try {
    if (!process.env.SERVER_URL) {
      server = spawn(process.execPath, ["--import", "tsx", "server.ts"], { env: { ...process.env, PORT: "2678" }, stdio: "ignore" });
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try { ready = (await fetch(endpoint + "/api/health")).ok; } catch {}
        if (ready) break;
        await delay(100);
      }
      assert.ok(ready, "Local server did not start");
    }
    const a = await join(), b = await join();
    assert.equal(a.state.roomId, b.state.roomId);
    const owner = a.state.sessionId;
    a.send("stroke", { id: "first", offset: 0, points: [[0.1, 0.2], [0.3, 0.4]], complete: false });
    const id = owner + ":first";
    await until(() => b.state.strokes.has(id), "Stroke did not reach peer");
    const c = await join();
    assert.equal(c.state.strokes.get(id)!.points.length, 2, "Late join sees active stroke");
    b.send("erase", id);
    await delay(180);
    assert.ok(b.state.strokes.has(id), "Another player erased the owner's stroke");
    a.send("stroke", { id: "first", offset: 2, points: [[2, 0]], complete: true });
    await delay(150);
    assert.equal(b.state.strokes.get(id)!.points.length, 2, "Invalid point was accepted");
    a.send("stroke", { id: "first", offset: 2, points: [[0.5, 0.6]], complete: true });
    await until(() => b.state.strokes.get(id)?.complete, "Stroke completion missing");
    a.send("erase", id);
    await until(() => !b.state.strokes.has(id), "Own eraser failed");
    a.send("stroke", { id: "cleanup", offset: 0, points: [[0.2, 0.2]], complete: true });
    await until(() => b.state.strokes.size === 1, "Cleanup stroke missing");
    a.disconnect();
    await until(() => b.state.strokes.size === 0 && b.state.players.length === 2, "Departure did not clean up");
    const d = await join();
    assert.notEqual(d.state.sessionId, owner);
    assert.equal(d.state.players.find(p => p.id === d.state.sessionId)!.number, 1);
    assert.equal(d.state.players.find(p => p.id === b.state.sessionId)!.number, 2);
    for (let i = 0; i < 9; i++) assert.equal((await join()).state.status, "connected");
    await until(() => b.state.players.length === 12, "Expected 12 players");
    assert.equal(new Set(b.state.players.map(p => p.color)).size, 12, "Players need distinct colors");
    const extra = await join();
    assert.equal(extra.state.status, "full", "Thirteenth client created an overflow room");
    d.disconnect();
    await until(() => b.state.players.length === 11, "Seat not released");
    void extra.connect();
    await until(() => extra.state.status === "connected", "Retry did not fill freed seat");
    assert.equal(extra.state.roomId, b.state.roomId);
    const previousId = b.state.sessionId;
    b.room!.connection.close();
    await until(() => b.state.status === "connected" && b.state.sessionId !== previousId, "Automatic reconnect did not create a fresh identity", 20000);
    const forbidden = await fetch(endpoint + "/matchmake/joinOrCreate/multiplayer-draw", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(forbidden.status, 403, "Direct matchmaking must not create overflow rooms");
  } finally {
    for (const client of clients) client.disconnect();
    await delay(250);
    server?.kill();
  }
});


