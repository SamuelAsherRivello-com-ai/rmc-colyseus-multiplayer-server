import test from 'node:test';
import assert from 'node:assert/strict';
import {MultiplayerClient} from '../packages/client/index.js';
import {Client} from '@colyseus/sdk';

for(const game of ['ring-rivals','tetris-duel','music-maker']){
 test(`${game} retries missing private invitation but never retries capacity or invalid tokens`,async()=>{
  const original=globalThis.fetch;
  try{
   for(const [status,expectedCalls,expectedStatus]of ([[404,4,'error'],[409,1,'full'],[403,1,'error']] as const)){
    let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({error:'Expired room or invalid token'},{status});};
    const client=new MultiplayerClient('https://example.invalid',game,{code:'ABCD'});
    await client.connect();assert.equal(calls,expectedCalls);assert.equal(client.state.status,expectedStatus);assert.equal(client.timer,undefined);client.disconnect();
   }
  }finally{globalThis.fetch=original;}
 });
 test(`${game} exhausted socket attachment preserves one reservation and ends visibly`,async()=>{
  const originalFetch=globalThis.fetch,originalConsume=Client.prototype.consumeSeatReservation;
  let fetches=0,consumes=0;
  const reservation={sessionId:'one-private-seat',room:{roomId:'original-room'}};
  globalThis.fetch=async()=>{fetches++;return Response.json({reservation,code:'ABCD',token:'own-private-token'});};
  Client.prototype.consumeSeatReservation=async value=>{assert.deepEqual(value,reservation);consumes++;throw Error('Transient instance routing');};
  const client=new MultiplayerClient('https://example.invalid',game,{code:'ABCD'});
  try{await client.connect();assert.equal(fetches,1);assert.equal(consumes,4);assert.equal(client.state.status,'error');assert.equal(client.timer,undefined);}
  finally{client.disconnect();globalThis.fetch=originalFetch;Client.prototype.consumeSeatReservation=originalConsume;}
 });
 test(`${game} leaving during lookup backoff cancels the old generation`,async()=>{
  const original=globalThis.fetch;let calls=0;
  const client=new MultiplayerClient('https://example.invalid',game,{code:'ABCD'});
  globalThis.fetch=async()=>{calls++;setTimeout(()=>client.disconnect(),10);return Response.json({error:'Expired'},{status:404});};
  try{await client.connect();assert.equal(calls,1);assert.equal(client.state.status,'offline');assert.equal(client.timer,undefined);}
  finally{client.disconnect();globalThis.fetch=original;}
 });
}
