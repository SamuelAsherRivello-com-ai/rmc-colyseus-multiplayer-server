import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerClient } from '../packages/client/index.js';

async function failedAdmission(game: string, options: import("../packages/client/index.js").JoinOptions, statuses: number[], stopAfterFirst = false) {
 const original = globalThis.fetch;
 let calls = 0;
 const client = new MultiplayerClient('https://example.invalid', game, options);
 globalThis.fetch = async () => {
  const status = statuses[Math.min(calls++, statuses.length - 1)]!;
  if (stopAfterFirst) setTimeout(() => client.disconnect(), 20);
  return new Response(JSON.stringify({error:'No seat'}), {status});
 };
 try {
  await client.connect();
  return {calls,status:client.state.status};
 } finally {client.disconnect();globalThis.fetch=original;}
}
test('Combat missing-room retries are bounded and preserve terminal full/invalid responses', async () => {
 assert.deepEqual(await failedAdmission('combat',{code:'ABCD'},[404]),{calls:4,status:'error'});
 assert.deepEqual(await failedAdmission('combat',{code:'ABCD'},[404,409]),{calls:2,status:'full'});
 assert.deepEqual(await failedAdmission('combat',{code:'ABCD'},[400]),{calls:1,status:'error'});
 assert.deepEqual(await failedAdmission('combat',{create:true},[404]),{calls:1,status:'error'});
 assert.deepEqual(await failedAdmission('gungeon',{code:'ABCD'},[404]),{calls:1,status:'error'});
});
test('Leaving during Combat admission retry cancels subsequent requests', async () => {
 assert.deepEqual(await failedAdmission('combat',{code:'ABCD'},[404],true),{calls:1,status:'offline'});
});
test('Combat retries the same socket reservation without reserving another human seat', async () => {
 const { Client } = await import('@colyseus/sdk');
 const oldFetch=globalThis.fetch, oldConsume=Client.prototype.consumeSeatReservation;
 let fetches=0,consumes=0;
 const reservation={sessionId:'reserved-human',room:{roomId:'same-room'}};
 const messages=new Map<string, ((data: unknown) => void)[]>(), leaves: (() => void)[]=[];
 const room={sessionId:'reserved-human',roomId:'same-room',reconnection:{},connection:{reconnect(){}},
  onMessage(type: string,fn: (data: unknown) => void){const list=messages.get(type)||[];list.push(fn);messages.set(type,list);},onDrop(){},onReconnect(){},onError(){},onLeave(fn: () => void){leaves.push(fn);},
  send(){queueMicrotask(()=>messages.get('snapshot')?.forEach(fn=>fn({players:[],capacity:4,gameState:{protocol:1}})));},
  async leave(){leaves.forEach(fn=>fn());}};
 const client=new MultiplayerClient('https://example.invalid','combat',{code:'ABCD'});
 globalThis.fetch=async()=>{fetches++;return Response.json({reservation,code:'ABCD'});};
 Client.prototype.consumeSeatReservation=async function<T>(value: Parameters<typeof oldConsume>[0]){assert.deepEqual(value,reservation);if(++consumes<3)throw Error('transient upgrade');return room as unknown as Awaited<ReturnType<typeof oldConsume<T>>>;};
 try{await client.connect();assert.equal(fetches,1);assert.equal(consumes,3);assert.equal(client.state.sessionId,'reserved-human');assert.equal(client.state.status,'connected');}
 finally{client.disconnect();globalThis.fetch=oldFetch;Client.prototype.consumeSeatReservation=oldConsume;}
});
test('Exhausted Combat socket retries stop instead of allocating another reservation', async () => {
 const { Client }=await import('@colyseus/sdk');
 const oldFetch=globalThis.fetch,oldConsume=Client.prototype.consumeSeatReservation;
 let fetches=0,consumes=0;
 const client=new MultiplayerClient('https://example.invalid','combat',{code:'ABCD'});
 globalThis.fetch=async()=>{fetches++;return Response.json({reservation:{sessionId:'one-seat'},code:'ABCD'});};
 Client.prototype.consumeSeatReservation=async()=>{consumes++;throw Error('upgrade unavailable');};
 try{await client.connect();assert.equal(fetches,1);assert.equal(consumes,3);assert.equal(client.state.status,'error');assert.equal(client.timer,undefined);}
 finally{client.disconnect();globalThis.fetch=oldFetch;Client.prototype.consumeSeatReservation=oldConsume;}
});
