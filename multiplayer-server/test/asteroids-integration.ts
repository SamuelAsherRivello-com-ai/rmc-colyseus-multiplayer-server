import type {Room} from '@colyseus/sdk';
import type {AsteroidsFrame} from '../packages/client/asteroids-types.js';
import { verifyAsteroidsSession } from "../../scripts/asteroids-live-session.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@colyseus/sdk";
import {
  createWorld,
  setConnected,
  snapshot,
  applyInput,
  stepWorld,
} from "../packages/client/asteroids-rules.js";
import type { ISeatReservation } from "@colyseus/sdk/Client";
const endpoint = process.env.SERVER_URL || "http://127.0.0.1:2698";
async function until(fn: () => unknown, label: string) {
  for (let i = 0; i < 150; i++) {
    if (fn()) return;
    await delay(50);
  }
  throw new Error(label);
}
test(
  "Asteroids fixed host: four seats, damaged-state late join, identity recovery, spoof rejection and terminal host loss",
  { timeout: 60000 },
  async () => {
    if (process.env.SERVER_URL) { await verifyAsteroidsSession(endpoint, 8); return; }
    let server;
    const rooms: Room<unknown,unknown>[] = [];
    let host!: Room<unknown,unknown>;
    let serial = 0;
    let members = [];
    const world = createWorld();
    async function admission(body: Record<string, unknown>) {

      const response = await fetch(endpoint + "/api/join/asteroids-coop", {
        signal: AbortSignal.timeout(10000),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, ...(await response.json()) };
    }
    async function consume(data: { status: unknown; reservation: ISeatReservation; }) {
      assert.equal(data.status, 200, JSON.stringify(data));
      const room = await new Client(endpoint).consumeSeatReservation(
        data.reservation,
      );
      room.reconnection.enabled = false;
      rooms.push(room);
      room.onMessage("identity", () => {});
      room.onMessage("presence", (p) => {
        if (room === host) {
          serial = p.serial;
          members = p.players;
          for (const old of world.players) setConnected(world, old.id, false);
          for (const p of members) setConnected(world, p.id, true, p.number);
        }
      });
      room.onMessage("input", (input) => applyInput(world, input.id, input));
      room.onMessage("sessionEnded", () => {});
      room.onMessage("gameState", () => {});
      return room;
    }
    function publish() {
      world.tick++;
      host.send("hostSnapshot", snapshot(world, serial));
    }
    try {
      if (!process.env.SERVER_URL) {
        server = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
          env: { ...process.env, PORT: "2698" },
          stdio: "ignore",
          windowsHide: true,
        });
        for (let i = 0; i < 100; i++) {
          try {
            if ((await fetch(endpoint + "/api/health")).ok) break;
          } catch {}
          await delay(100);
        }
      }
      const h = await admission({ create: true });
      host = await consume(h);
      host.send("snapshot");
      await until(() => serial > 0, "host presence");
      assert.notEqual(
        h.id,
        h.token,
        "recovery bearer must not be public identity",
      );
      world.asteroids[0]!.hp = 2;
      world.asteroids[0]!.maxHp = 3;
      publish();
      await delay(100);
      const g = await admission({ code: h.code });
      const guest = await consume(g);
      let frame!: AsteroidsFrame;
      guest.onMessage("gameState", (s) => (frame = s));
      guest.send("snapshot");
      await until(
        () => frame?.asteroids[0]![6] === 2,
        "late join damaged state",
      );
      await until(() => members.length === 2, "guest membership");
      publish();
      await delay(80);
      const tick = frame!.tick;
      guest.send("hostSnapshot", { ...frame, tick: tick + 10000 });
      await delay(100);
      assert.equal(frame!.tick, tick, "guest forged host frame");
      guest.send("input", {
        runId: 1,
        seq: 1,
        turn: 1,
        thrust: true,
        fire: false,
      });
      await until(
        () => world.players.find((p) => p.id === g.id)?.ack === 1,
        "guest input",
      );
      const p = world.players.find((p) => p.id === g.id)!;
      p.lives = 0;
      publish();
      await guest.leave();
      await until(() => members.length === 1, "guest hot drop");
      const r = await admission({ code: h.code, identityToken: g.token });
      assert.equal(r.id, g.id);
      const returned = await consume(r);
      await until(() => members.length === 2, "return membership");
      assert.equal(world.players.find((p) => p.id === g.id)!.lives, 0);
      publish();
      assert.equal(
        (await admission({ code: h.code, identityToken: g.id })).status,
        403,
        "public id cannot recover bearer",
      );
      await consume(await admission({ code: h.code }));
      await consume(await admission({ code: h.code }));
      assert.equal((await admission({ code: h.code })).status, 409);
      let ended = false;
      returned.onMessage("sessionEnded", () => (ended = true));
      await host.leave();
      await until(() => ended, "host loss terminal");
      assert.equal((await admission({ code: h.code })).status, 404);
    } finally {
      for (const room of rooms)
        try {
          void room.leave();
        } catch {}
      server?.kill();
    }
  },
);

