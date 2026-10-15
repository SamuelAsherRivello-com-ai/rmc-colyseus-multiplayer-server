import type {AsteroidsAdmission, AsteroidsCallbacks, AsteroidsFrame} from '../multiplayer-server/packages/client/asteroids-types.js';
import { WebSocket as ProbeWebSocket } from "ws";
globalThis.WebSocket = ProbeWebSocket as unknown as typeof WebSocket; // Node probe uses only the shared browser-compatible socket methods/events.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { connectSharedAsteroids } from "../multiplayer-server/packages/client/asteroids-shared-connection.js";
import {
  createWorld,
  setConnected,
  snapshot,
  applyInput,
} from "../multiplayer-server/packages/client/asteroids-rules.js";

export async function verifyAsteroidsSession(endpoint: string, seconds = 8) {
  const base = endpoint.replace(/\/$/, ""),
    world = createWorld(6026),
    connections = [];
  let serial = 0,
    renewals = 0,
    frames = 0,
    previousTick = -1;
  const observed: {latest?: AsteroidsFrame;ended?: string;failure?: unknown} = {};
  async function admission(body: Record<string, unknown>, expected = 200) {
    const response = await fetch(base + "/api/join/asteroids-coop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data: AsteroidsAdmission & {error?: string;transport?: string} = await response.json();
    assert.equal(
      response.status,
      expected,
      data.error || "Unexpected admission response",
    );
    return data;
  }
  async function until(fn: () => unknown, label: string, ms = 15000) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (observed.failure) throw observed.failure;
      if (fn()) return;
      await delay(40);
    }
    throw new Error(label);
  }
  console.log("Asteroids live probe: create host");
  const hostData = await admission({ create: true });
  assert.equal(hostData.transport, "asteroids-shared-v1");
  await admission({ create: true, code: hostData.code }, 409);
  await admission({ code: "BAD" }, 400);
  await admission({ code: hostData.code, identityToken: hostData.id }, 403);
  console.log("Asteroids live probe: connect host");
  const host = await connectSharedAsteroids(base, hostData, {
    onPresence: (p) => {
      if (p.serial === serial) return;
      serial = p.serial;
      for (const old of world.players) setConnected(world, old.id, false);
      for (const member of p.players)
        setConnected(world, member.id, true, member.number);
    },
    onInput: (input) => applyInput(world, input.id, input),
    onEnded: (reason) => {
      observed.ended = reason;
    },
    onStatus: (status) => {
      if (status?.startsWith("Refreshing")) renewals++;
    },
  });
  connections.push(host);
  world.wave = 3;
  world.asteroids[0]!.hp = 2;
  world.asteroids[0]!.maxHp = 3;
  const publish = setInterval(() => {
    world.tick++;
    world.time += 0.05;
    host.publish(snapshot(world, serial));
  }, 50);
  const guestData = await admission({ code: hostData.code });
  function callbacks(): AsteroidsCallbacks {
    return {
      onState: (frame) => {
        try {
          if (frame.membership < serial) return;
          assert.equal(frame.wave, 3);
          assert.equal(frame.asteroids[0]![6], 2);
          assert.ok(frame.tick >= previousTick);
          previousTick = frame.tick;
          observed.latest = frame;
          frames++;
        } catch (error) {
          observed.failure = error;
        }
      },
      onEnded: (reason) => {
        observed.ended = reason;
      },
      onStatus: (status) => {
        if (status?.startsWith("Refreshing")) renewals++;
      },
    };
  }
  console.log("Asteroids live probe: connect guest");
  let guest = await connectSharedAsteroids(base, guestData, callbacks());
  connections.push(guest);
  try {
    await until(
      () => observed.latest?.players.length === 2,
      "Two-client damaged baseline missing",
    );
    guest.input({
      runId: 1,
      seq: Date.now(),
      turn: 1,
      thrust: true,
      fire: false,
    });
    await until(
      () => world.players.find((p) => p.id === guestData.id)?.ack! > 0,
      "Guest input did not reach creator",
    );
    world.players.find((p) => p.id === guestData.id)!.lives = 0;
    await until(
      () => observed.latest?.players.find((p) => p[0] === guestData.id)?.[2] === 0,
      "Eliminated guest state missing",
    );
    guest.leave();
    await until(
      () => world.players.filter((p) => p.connected).length === 1,
      "Hot drop did not free the seat",
    );
    const recovered = await admission({
      code: guestData.code,
      identityToken: guestData.token,
    });
    assert.equal(recovered.id, guestData.id);
    guest = await connectSharedAsteroids(base, recovered, callbacks());
    connections.push(guest);
    await until(
      () =>
        observed.latest?.players.length === 2 &&
        observed.latest!.players.find((p) => p[0] === guestData.id)?.[2] === 0,
      "Guest recovery reset lives",
    );
    const extras = [];
    for (let i = 0; i < 2; i++) {
      const data = await admission({ code: hostData.code });
      console.log("Asteroids live probe: connect extra participant", i+3);
      const extra = await connectSharedAsteroids(base, data, {
        onEnded: () => {},
      });
      extras.push(extra);
      connections.push(extra);
    }
    await until(
      () => world.players.filter((p) => p.connected).length === 4,
      "Four-player capacity did not synchronize",
    );
    await admission({ code: hostData.code }, 409);
    await Promise.all(extras.map((extra) => extra.leave()));
    await until(
      () => world.players.filter((p) => p.connected).length === 2,
      "Guest drops did not release extra seats",
    );
    const start = Date.now();
    let lastLog = start;
    while (Date.now() - start < seconds * 1000) {
      if (observed.failure) throw observed.failure;
      if (observed.ended) throw new Error(observed.ended);
      assert.ok(Date.now() - lastLog < 65000);
      await delay(500);
      if (Date.now() - lastLog >= 30000) {
        console.log(
          JSON.stringify({
            asteroids: "continuity",
            elapsedSeconds: Math.floor((Date.now() - start) / 1000),
            tick: observed.latest?.tick,
            frames,
            renewals,
          }),
        );
        lastLog = Date.now();
      }
    }
    assert.ok(frames > seconds * 3, "Insufficient live snapshots");
    if (seconds >= 600)
      assert.ok(
        renewals >= 4,
        "Two planned connection windows were not exercised for both participants",
      );
    assert.equal(observed.latest!.players.find((p) => p[0] === guestData.id)![2], 0);
    assert.equal(observed.latest!.wave, 3);
    assert.equal(observed.latest!.asteroids[0]![6], 2);
    host.leave();
    await until(() => observed.ended, "Host closure was not terminal");
    await admission({ code: hostData.code }, 404);
    const result = {
      asteroids: "passed",
      endpoint: base,
      durationSeconds: seconds,
      frames,
      renewals,
      guestRecovery: true,
      hostLossTerminal: true,
    };
    console.log(JSON.stringify(result));
    return result;
  } finally {
    clearInterval(publish);
    for (const c of connections) c.leave();
  }
}
if (process.argv[1]?.endsWith("asteroids-live-session.ts"))
  await verifyAsteroidsSession(
    process.env.SERVER_URL ?? (() => {throw new Error("SERVER_URL required");})(),
    Number(process.env.LONG_SESSION_SECONDS || 600),
  );


