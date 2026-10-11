import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerClient } from '../packages/client/index.js';
import { setTimeout as delay } from 'node:timers/promises';

test('private client retries the same missing invitation within a bounded budget and ends visibly',async()=>{
 const previous=globalThis.fetch;const requests: {url: unknown;body: import("../packages/client/index.js").JoinOptions}[]=[];
 globalThis.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(String(options!.body))});return new Response(JSON.stringify({error:'Room expired'}),{status:404});};
 const client=new MultiplayerClient('https://relay.example','space-invaders',{code:'AB12',reconnectToken:'private-test-token'});
 try{await client.connect();assert.equal(requests.length,4);assert.equal(client.state.status,'error');assert.equal(client.state.error,'Room expired');assert.ok(requests.every(r=>r.body.code==='AB12'&&r.body.reconnectToken==='private-test-token'&&!r.body.create));assert.equal(client.timer,undefined);}
 finally{client.disconnect();globalThis.fetch=previous;}
});

test('disconnect during admission backoff cancels further requests and cannot reconnect an old generation',async()=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('{}',{status:404});};
 const client=new MultiplayerClient('https://relay.example','space-invaders',{code:'AB12'});
 try{const pending=client.connect();await delay(30);client.disconnect();await pending;await delay(200);assert.equal(calls,1);assert.equal(client.state.status,'offline');assert.equal(client.room,undefined);assert.equal(client.stopped,true);}
 finally{client.disconnect();globalThis.fetch=previous;}
});

test('capacity and invalid private tokens remain terminal without creating replacement rooms',async()=>{
 const previous=globalThis.fetch;
 try{for(const [status,expected] of ([[409,'full'],[403,'error']] as const)){let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:'Admission rejected'}),{status});};const client=new MultiplayerClient('https://relay.example','space-invaders',{code:'AB12'});await client.connect();assert.equal(calls,1);assert.equal(client.state.status,expected);client.disconnect();}}
 finally{globalThis.fetch=previous;}
});
