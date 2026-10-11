import test from "node:test";
import assert from "node:assert/strict";
import {
  AsteroidsContinuity,
  MemoryContinuityStore,
  roomKey,
  publicPresence,
} from "../src/asteroids-continuity.ts";

const setup = () => {
  const store = new MemoryContinuityStore();
  return {
    store,
    a: new AsteroidsContinuity(store),
    b: new AsteroidsContinuity(store),
  };
};
test("independent relay instances atomically claim one editable room code", async () => {
  const { a, b } = setup();
  const result = await Promise.allSettled([
    a.admit({ create: true, code: "ROCK" }),
    b.admit({ create: true, code: "ROCK" }),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(result.find((r) => r.status === "rejected")!.reason.status, 409);
});
test("concurrent cross-instance arrivals cannot overfill four seats", async () => {
  const { a, b } = setup();
  await a.admit({ create: true, code: "ROCK" });
  const result = await Promise.allSettled(
    Array.from({ length: 8 }, (_, i) =>
      (i % 2 ? a : b).admit({ code: "ROCK" }),
    ),
  );
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 3);
  const { value: r } = await a.current("ROCK");
  assert.equal(publicPresence(r).players.length, 4);
  assert.equal(new Set(r.identities.map((p) => p.number)).size, 4);
});
test("guest recovery keeps private identity and host ledger key while freeing capacity", async () => {
  const { a, b } = setup();
  const host = await a.admit({ create: true, code: "ROCK" }),
    guest = await b.admit({ code: "ROCK" });
  await b.leave(guest.code, guest.id, guest.generation);
  const returned = await a.admit({
    code: guest.code,
    identityToken: guest.token,
  });
  assert.equal(returned.id, guest.id);
  assert.notEqual(returned.generation, guest.generation);
  await assert.rejects(
    () => a.admit({ code: "ROCK", identityToken: guest.id }),
    { status: 403 },
  );
  await assert.rejects(
    () => a.admit({ code: "ROCK", identityToken: host.token }),
    { status: 410 },
  );
});
test("planned host renewal fences the old socket and preserves epoch and sole authority", async () => {
  const { a, b } = setup();
  const host = await a.admit({ create: true, code: "ROCK" });
  const renewed = await b.admit({
    code: host.code,
    identityToken: host.token,
    generation: host.generation,
    renew: true,
  });
  assert.equal(renewed.id, host.id);
  assert.equal(renewed.epoch, host.epoch);
  assert.equal(renewed.host, true);
  await a.leave(host.code, host.id, host.generation);
  assert.equal((await b.current(host.code)).value.ended, false);
  await assert.rejects(
    () => a.authenticate(host.code, host.token, host.generation),
    { status: 403 },
  );
  await assert.rejects(
    () =>
      a.admit({
        code: host.code,
        identityToken: host.token,
        generation: host.generation,
        renew: true,
      }),
    { status: 403 },
  );
});
test("actual host loss invalidates invitations without host election", async () => {
  const { a, b } = setup();
  const host = await a.admit({ create: true, code: "ROCK" }),
    guest = await b.admit({ code: "ROCK" });
  await a.leave(host.code, host.id, host.generation);
  await assert.rejects(
    () => b.admit({ code: guest.code, identityToken: guest.token }),
    { status: 404 },
  );
  assert.equal((await a.store.read(host.code))!.value.hostId, host.id);
});
test("cache loss or expired host heartbeat fails closed without recreating a world", async () => {
  const { a, b, store } = setup();
  const host = await a.admit({ create: true, code: "ROCK" });
  b.now = () => Date.now() + 20000;
  await assert.rejects(() => b.admit({ code: "ROCK" }), { status: 410 });
  assert.equal((await store.read(host.code))!.value.ended, true);
});
test("out-of-order membership notifications are immutable by registry revision", async () => {
  const { a, b, store } = setup();
  const host = await a.admit({ create: true, code: "ROCK" });
  await b.admit({ code: "ROCK" });
  await a.admit({ code: "ROCK" });
  const latest = (await a.current("ROCK")).value;
  assert.equal(
    (await store.get(roomKey(latest, "registry:2")) as {identities: unknown[]}).identities.length,
    2,
  );
  assert.equal(
    (await store.get(roomKey(latest, "registry:3")) as {identities: unknown[]}).identities.length,
    3,
  );
  assert.equal(latest.hostId, host.id);
});

test('one generation can claim exactly one socket across independent instances', async () => {
  const {a,b}=setup(); const host=await a.admit({create:true,code:'ROCK'});
  const attempts=await Promise.allSettled([a.authenticate(host.code,host.token,host.generation),b.authenticate(host.code,host.token,host.generation)]);
  assert.equal(attempts.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(attempts.find(result=>result.status==='rejected')!.reason.status,403);
});
test('abandoned guest admissions release their seats without inheriting an identity', async () => {
  const {a,b,store}=setup(); const host=await a.admit({create:true,code:'ROCK'});
  const guests=await Promise.all([a.admit({code:'ROCK'}),b.admit({code:'ROCK'}),a.admit({code:'ROCK'})]);
  const later=Date.now()+16000; b.now=()=>later;
  const record=(await b.current('ROCK')).value; await store.set(roomKey(record,'frame'),{at:later});
  const newcomer=await b.admit({code:'ROCK'});
  assert.equal((await b.current('ROCK')).value.identities.filter(p=>p.connected).length,2);
  assert.ok(!guests.some(g=>g.id===newcomer.id));
  await assert.rejects(()=>a.authenticate(guests[0].code,guests[0].token,guests[0].generation),{status:403});
});

test('room-scoped identities and full recovery cannot steal another connected seat',async()=>{
  const {a,b}=setup();const host=await a.admit({create:true,code:'ROCK'}),other=await b.admit({create:true,code:'MOON'});
  const departed=await a.admit({code:host.code});await a.leave(host.code,departed.id,departed.generation);
  await assert.rejects(()=>b.admit({code:other.code,identityToken:departed.token}),{status:403});
  await Promise.all(Array.from({length:3},()=>a.admit({code:host.code})));
  await assert.rejects(()=>b.admit({code:host.code,identityToken:departed.token}),{status:409});
  assert.equal((await a.current(host.code)).value.identities.filter(p=>p.connected).length,4);
});
test('retained guest identity ledger has an explicit bound and error',async()=>{
  const {a}=setup();await a.admit({create:true,code:'ROCK'});
  for(let i=0;i<127;i++){const g=await a.admit({code:'ROCK'});await a.leave(g.code,g.id,g.generation);}
  await assert.rejects(()=>a.admit({code:'ROCK'}),{status:429});
  assert.equal((await a.current('ROCK')).value.identities.length,128);
});
