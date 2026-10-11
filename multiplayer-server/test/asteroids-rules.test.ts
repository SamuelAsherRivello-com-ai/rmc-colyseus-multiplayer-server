import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TUNING,
  createWorld,
  setConnected,
  applyInput,
  stepWorld,
  hitAsteroid,
  loseLife,
  overlaps,
  waveTuning,
  snapshot,
} from "../packages/client/asteroids-rules.js";
test("introductory wave is exactly three parents, six terminal children, nine hits for every roster", () => {
  for (let count = 1; count <= 4; count++) {
    const s = createWorld();
    for (let i = 0; i < count; i++) setConnected(s, "p" + i, true, i + 1);
    assert.equal(s.asteroids.length, 3);
    let hits = 0;
    while (s.asteroids.length) {
      hitAsteroid(s, s.asteroids[0]!.id);
      hits++;
    }
    assert.equal(hits, 9);
    stepWorld(s);
    assert.equal(s.phase, "intermission");
  }
});
test("finite seeded later waves obey health and entity caps", () => {
  for (let w = 2; w <= 80; w++) {
    const s = createWorld(w);
    s.wave = w;
    const t = waveTuning(w, 4);
    s.asteroids.forEach((a) => {
      a.hp = a.maxHp = t.hp;
      a.depth = t.depth;
    });
    let hits = 0;
    while (s.asteroids.length) {
      hitAsteroid(s, s.asteroids[0]!.id);
      assert.ok(s.asteroids.length <= TUNING.maxAsteroids);
      assert.ok(++hits < 1000);
    }
    assert.ok(t.hp <= 5);
    assert.ok(t.roots <= 8);
  }
});
test("wrapped collision and projectile consumes at most one hit", () => {
  assert.ok(overlaps({ x: 639, y: 100 }, { x: 1, y: 100 }, 3));
  const s = createWorld();
  const p = setConnected(s, "a", true)!;
  p.protectedUntil = 999;
  s.asteroids = [
    {
      id: 100,
      x: 10,
      y: 10,
      vx: 0,
      vy: 0,
      radius: 20,
      hp: 3,
      maxHp: 3,
      depth: 0, shape: 0,
    },
    {
      id: 101,
      x: 10,
      y: 10,
      vx: 0,
      vy: 0,
      radius: 20,
      hp: 3,
      maxHp: 3,
      depth: 0, shape: 0,
    },
  ];
  s.bullets = [{ id: 200, x: 10, y: 10, vx: 0, vy: 0, owner: "a", until: 9 }];
  stepWorld(s);
  assert.deepEqual(
    s.asteroids.map((a) => a.hp),
    [2, 3],
  );
  assert.equal(s.bullets.length, 0);
});
test("personal three lives persist across waves and returning identity; spectators reset together after five seconds", () => {
  const s = createWorld();
  const a = setConnected(s, "a", true)!,
    b = setConnected(s, "b", true, 2)!;
  for (let i = 0; i < 3; i++) {
    a.protectedUntil = 0;
    a.respawn = 0;
    assert.ok(loseLife(s, a));
    s.wave++;
  }
  assert.equal(a.lives, 0);
  setConnected(s, "a", false);
  setConnected(s, "a", true);
  assert.equal(a.lives, 0);
  stepWorld(s);
  assert.equal(s.phase, "playing");
  for (let i = 0; i < 3; i++) {
    b.protectedUntil = 0;
    b.respawn = 0;
    loseLife(s, b);
  }
  stepWorld(s);
  assert.equal(s.phase, "defeat");
  const run = s.runId;
  for (let i = 0; i < 301; i++) stepWorld(s);
  assert.equal(s.runId, run + 1);
  assert.equal(s.wave, 1);
  assert.deepEqual(
    s.players.map((p) => p.lives),
    [3, 3],
  );
  assert.equal(s.asteroids.length, 3);
});
test("stale/replayed/old-run inputs are rejected or neutralized and no friendly damage exists", () => {
  const s = createWorld();
  const p = setConnected(s, "a", true)!,
    q = setConnected(s, "b", true, 2)!;
  Object.assign(q, { x: p.x, y: p.y });
  assert.ok(
    applyInput(s, "a", { runId: 1, seq: 1, turn: 1, thrust: true, fire: true }),
  );
  assert.equal(
    applyInput(s, "a", {
      runId: 1,
      seq: 1,
      turn: 0,
      thrust: false,
      fire: false,
    }),
    false,
  );
  assert.equal(
    applyInput(s, "a", {
      runId: 0,
      seq: 2,
      turn: 0,
      thrust: false,
      fire: false,
    }),
    false,
  );
  for (let i = 0; i < 30; i++) stepWorld(s);
  const angle = p.angle;
  for (let i = 0; i < 10; i++) stepWorld(s);
  assert.equal(p.angle, angle);
  assert.equal(q.lives, 3);
});
test("wave two samples living roster once; respawning included; joining leaves current roots alone", () => {
  const s = createWorld();
  const a = setConnected(s, "a", true)!,
    b = setConnected(s, "b", true, 2)!;
  a.lives = 0;
  b.respawn = 99;
  s.asteroids = [];
  stepWorld(s);
  for (let i = 0; i < 181; i++) stepWorld(s);
  assert.equal(s.wave, 2);
  assert.equal(s.roster, 1);
  const roots = s.asteroids.length;
  setConnected(s, "c", true, 3);
  assert.equal(s.asteroids.length, roots);
  assert.equal(s.roster, 1);
});
test("identical seed and inputs replay identically; frame fits transport", () => {
  const a = createWorld(42),
    b = createWorld(42);
  for (const s of [a, b]) {
    setConnected(s, "same-id", true);
    applyInput(s, "same-id", {
      runId: 1,
      seq: 1,
      turn: 1,
      thrust: true,
      fire: true,
    });
    for (let i = 0; i < 600; i++) stepWorld(s);
  }
  assert.deepEqual(a, b);
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot(a, 1))) < 12288);
});
test("roster scaling covers 1/2/3/4 players and remains frozen through hot drop", () => {
  for (let n = 1; n <= 4; n++) {
    const s = createWorld();
    for (let i = 0; i < n; i++) setConnected(s, "p" + i, true, i + 1);
    s.asteroids = [];
    stepWorld(s);
    for (let i = 0; i < 181; i++) stepWorld(s);
    assert.equal(s.roster, n);
    assert.equal(s.asteroids.length, 2 + n);
    setConnected(s, "p0", false);
    assert.equal(s.roster, n);
  }
});
test("defeat has priority when last fragment and last ship vanish together", () => {
  const s = createWorld();
  const p = setConnected(s, "host", true)!;
  p.lives = 0;
  s.asteroids = [];
  stepWorld(s);
  assert.equal(s.phase, "defeat");
});
test("a spectator host remains host-side simulation owner; surviving guest continues", () => {
  const s = createWorld();
  const host = setConnected(s, "host", true)!,
    guest = setConnected(s, "guest", true, 2)!;
  host.lives = 0;
  const x = s.asteroids[0]!.x;
  stepWorld(s);
  assert.equal(s.phase, "playing");
  assert.notEqual(s.asteroids[0]!.x, x);
  assert.equal(guest.lives, 3);
});
test("simultaneous hits charge one life, safe respawn protects, spectators cannot shoot", () => {
  const s = createWorld();
  const p = setConnected(s, "host", true)!;
  p.protectedUntil = 0;
  assert.ok(loseLife(s, p));
  assert.equal(loseLife(s, p), false);
  assert.equal(p.lives, 2);
  for (let i = 0; i < 121; i++) stepWorld(s);
  assert.ok(p.protectedUntil > s.time);
  p.lives = 0;
  applyInput(s, "host", {
    runId: 1,
    seq: 10,
    turn: 1,
    thrust: true,
    fire: true,
  });
  stepWorld(s);
  assert.equal(s.bullets.length, 0);
});
test("automatic results countdown resets every connected seat including arrivals for each capacity", () => {
  for (let n = 1; n <= 4; n++) {
    const s = createWorld();
    for (let i = 0; i < n; i++) setConnected(s, "p" + i, true, i + 1)!.lives = 0;
    stepWorld(s);
    assert.equal(s.phase, "defeat");
    if (n < 4) setConnected(s, "new", true, n + 1);
    for (let i = 0; i < 299; i++) stepWorld(s);
    assert.equal(s.phase, "defeat");
    for (let i = 0; i < 3; i++) stepWorld(s);
    assert.equal(s.runId, 2);
    assert.ok(s.players.every((p) => p.lives === 3));
    assert.equal(
      applyInput(s, "p0", {
        runId: 1,
        seq: 99,
        turn: 1,
        thrust: true,
        fire: true,
      }),
      false,
    );
  }
});
test("worst-case compact full snapshot fits with four UUID players, 72 rocks and 32 shots", () => {
  const s = createWorld();
  for (let i = 0; i < 4; i++)
    setConnected(s, `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee${i}`, true, i + 1);
  const rock = {
    ...s.asteroids[0],
    x: 639.99,
    y: 359.99,
    vx: -109.99,
    vy: -109.99,
    radius: 7.15,
    hp: 3,
    maxHp: 3,
    depth: 0,
    shape: 3,
  };
  s.asteroids = Array.from({ length: 72 }, (_, i) => ({
    ...rock,
    id: 100000 + i,
  }));
  s.bullets = Array.from({ length: 32 }, (_, i) => ({
    id: 200000 + i,
    owner: s.players[i % 4]!.id,
    x: 639.99,
    y: 359.99,
    vx: -455.99,
    vy: -455.99,
    until: 99999.99,
  }));
  const bytes = Buffer.byteLength(JSON.stringify(snapshot(s, 9999)));
  assert.ok(bytes < 12288, `${bytes} bytes exceeds frame budget`);
});

test("movement-only prediction tracks host integration through wrapped thrust and rotation", async () => {
  const { predictShip } = await import("../packages/client/asteroids-rules.js");
  const world = createWorld(77);
  const host = setConnected(world, "prediction", true)!;
  host.x = 639;
  host.y = 359;
  world.asteroids = [];
  world.phase = "intermission";
  world.until = 9999;
  const predicted = structuredClone(host)!;
  for (let tick = 1; tick <= 240; tick++) {
    const input = {
      runId: world.runId,
      seq: tick,
      turn: tick < 120 ? 1 : -1,
      thrust: true,
      fire: false,
    };
    applyInput(world, host.id, input);
    stepWorld(world);
    predictShip(predicted, input);
    for (const key of (["x", "y", "vx", "vy", "angle"] as const))
      assert.equal(predicted[key], host[key]);
  }
  assert.equal(predicted.lives, 3);
  assert.equal(predicted.score, 0);
});
