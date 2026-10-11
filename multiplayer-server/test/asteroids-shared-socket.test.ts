import {tcpPort} from './tcp-port.js';
import type {AsteroidsFrame, AsteroidsPresence} from '../packages/client/asteroids-types.js';
import type {AsteroidsInput} from '../packages/client/asteroids-rules.js';
type RelayMessage = {type: 'gameState';value: AsteroidsFrame} | {type: 'presence';value: AsteroidsPresence} | {type: 'input';value: AsteroidsInput & {id: string}} | {type: 'identity';value: unknown} | {type: 'sessionEnded';value: {reason: string}};
import test from "node:test";
import assert from "node:assert/strict";
import { WebSocketServer, WebSocket } from "ws";
import {
  AsteroidsContinuity,
  MemoryContinuityStore,
} from "../src/asteroids-continuity.ts";
import { attachAsteroidsSocket } from "../src/asteroids-shared-socket.ts";
import {
  createWorld,
  setConnected,
  snapshot,
  applyInput,
} from "../packages/client/asteroids-rules.js";

async function waitFor(check: () => unknown, timeout = 5000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("Timed out waiting for relay state");
}
async function connect(port: number, admission: Awaited<ReturnType<AsteroidsContinuity["admit"]>>) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/asteroids`),
    messages: RelayMessage[] = [];
  socket.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
  await new Promise((resolve, reject) => {
    socket.on("open", resolve);
    socket.on("error", reject);
  });
  socket.send(
    JSON.stringify({
      type: "auth",
      value: {
        code: admission.code,
        token: admission.token,
        generation: admission.generation,
      },
    }),
  );
  await waitFor(() => messages.some((m) => m.type === "identity"));
  return {
    socket,
    messages,
    send: (type: string, value?: unknown) => socket.send(JSON.stringify({ type, value })),
  };
}
test("separate socket servers share damaged state, input, recovery and planned host renewal", async (t) => {
  const store = new MemoryContinuityStore(),
    a = new AsteroidsContinuity(store),
    b = new AsteroidsContinuity(store);
  const servers = [a, b].map((service) => {
    const wss = new WebSocketServer({ port: 0, maxPayload: 16384 });
    wss.on("connection", (socket) => attachAsteroidsSocket(socket, service));
    return wss;
  });
  await Promise.all(
    servers.map((wss) => new Promise((r) => wss.on("listening", r))),
  );
  t.after(() => {
    for (const wss of servers) {
      for (const socket of wss.clients) socket.terminate();
      wss.close();
    }
  });
  const host = await a.admit({ create: true, code: "ROCK" });
  let h = await connect(tcpPort(servers[0]!), host);
  const world = createWorld(42);
  setConnected(world, host.id, true, 1);
  world.asteroids[0]!.hp = 2;
  world.asteroids[0]!.maxHp = 3;
  let serial = 1;
  const publish = setInterval(() => {
    world.tick++;
    if (h.socket.readyState === 1)
      h.send("hostSnapshot", snapshot(world, serial));
  }, 60);
  t.after(() => clearInterval(publish));
  const guest = await b.admit({ code: host.code });
  const g = await connect(tcpPort(servers[1]!), guest);
  setConnected(world, guest.id, true, 2);
  serial = 2;
  await waitFor(() =>
    g.messages.some(
      (m) =>
        m.type === "gameState" &&
        m.value.membership === 2 &&
        m.value.asteroids[0]![6] === 2,
    ),
  );
  const input = {
    runId: world.runId,
    seq: 1,
    turn: 1,
    thrust: true,
    fire: false,
  };
  g.send("input", input);
  await waitFor(() =>
    h.messages.some((m) => m.type === "input" && m.value.id === guest.id),
  );
  const forwarded = h.messages.find((m) => m.type === "input")!.value;
  assert.equal(applyInput(world, guest.id, forwarded), true);
  const count = g.messages.filter((m) => m.type === "gameState").length;
  g.send("hostSnapshot", { ...snapshot(world, serial), wave: 99 });
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(
    g.messages.some((m) => m.type === "gameState" && m.value.wave === 99),
    false,
  );
  assert.ok(g.messages.filter((m) => m.type === "gameState").length > count);
  world.players.find((p) => p.id === guest.id)!.lives = 0;
  g.socket.close();
  await waitFor(() => store.records.get("ROCK")!.value.serial === 3);
  setConnected(world, guest.id, false);
  serial = 3;
  const returned = await a.admit({
    code: guest.code,
    identityToken: guest.token,
  });
  assert.equal(returned.id, guest.id);
  const g2 = await connect(tcpPort(servers[0]!), returned);
  setConnected(world, guest.id, true, 2);
  serial = 4;
  await waitFor(() =>
    g2.messages.some(
      (m) =>
        m.type === "gameState" &&
        m.value.players.some((p: AsteroidsFrame["players"][number]) => p[0] === guest.id && p[2] === 0),
    ),
  );
  const next = await b.admit({
    code: host.code,
    identityToken: host.token,
    generation: host.generation,
    renew: true,
  });
  const previous = h;
  h = await connect(tcpPort(servers[1]!), next);
  previous.socket.close();
  await waitFor(() =>
    g2.messages.some(
      (m) => m.type === "gameState" && m.value.tick >= world.tick - 1,
    ),
  );
  assert.equal(store.records.get("ROCK")!.value.ended, false);
  assert.equal(world.wave, 1);
  assert.equal(world.asteroids[0]!.hp, 2);
  const extras=[];
  for(let i=0;i<2;i++) {
    const data=await b.admit({code:host.code});
    const connection=await connect(tcpPort(servers[i]!),data);
    extras.push({data,connection});setConnected(world,data.id,true,i+3);serial++;
    await waitFor(()=>connection.messages.some(m=>m.type==='gameState' && m.value.players.length===i+3));
  }
  await assert.rejects(()=>a.admit({code:host.code}),{status:409});
  for(const {data,connection} of extras) {connection.socket.close();setConnected(world,data.id,false);}
  await waitFor(()=>store.records.get('ROCK')!.value.identities.filter(p=>p.connected).length===2);
  serial=store.records.get('ROCK')!.value.serial;
  h.socket.close();
  await waitFor(() => g2.messages.some((m) => m.type === "sessionEnded"));
  await assert.rejects(() => a.admit({ code: host.code }), { status: 404 });
});

