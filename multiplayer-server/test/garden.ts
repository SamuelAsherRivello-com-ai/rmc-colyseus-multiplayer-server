import type {Player} from '../packages/client/index.js';
interface GardenPlayer extends Player {x: number;z: number}
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {MultiplayerClient} from '../packages/client/index.js';
const endpoint=process.env.SERVER_URL||'http://127.0.0.1:2679';
const clients: MultiplayerClient<unknown,Record<string,unknown>,unknown,unknown,unknown,GardenPlayer>[]=[];
async function until(fn: () => unknown,label: string,ms=15000){const end=Date.now()+ms;while(!fn()){if(Date.now()>end)throw Error(label);await delay(40);}}
async function join(game='garden-chat'){const c=new MultiplayerClient<unknown, Record<string, unknown>, unknown, unknown, unknown, GardenPlayer>(endpoint,game);clients.push(c);void c.connect();await until(()=>['connected','full'].includes(c.state.status),'join '+c.state.error);return c;}
test('garden: movement, collision, bounds, chat, late join, drop, reconnect, capacity and isolation',{timeout:90000},async()=>{
 let server;
 try{
  if(!process.env.SERVER_URL){server=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,PORT:'2679'},stdio:'ignore',windowsHide:true});let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(endpoint+'/api/health')).ok;}catch{}if(ready)break;await delay(100);}assert.ok(ready);}
  const a=await join(),b=await join();assert.equal(a.state.roomId,b.state.roomId);
  const me=()=>b.state.players.find(p=>p.id===a.state.sessionId);
  const start=me()!.x;const moving=setInterval(()=>a.send('move',{x:1,z:0}),70);
  await until(()=>me()!.x>start+1,'movement not relayed');
  await delay(1100);
  const pair=b.state.players;assert.ok(Math.hypot(pair[0]!.x-pair[1]!.x,pair[0]!.z-pair[1]!.z)>=0.99,'players overlap');
  await delay(4500);clearInterval(moving);a.send('move',{x:0,z:0});assert.ok(me()!.x<=7.5,'bounds');
  const stopped=me()!.x;a.send('move',{x:999,z:0});await delay(400);assert.ok(Math.abs(me()!.x-stopped)<0.3,'invalid movement');
  a.send('chat','Hello garden <b>plain text</b>');await until(()=>b.state.chats?.some(m=>m.text.includes('Hello garden')),'chat relay');
  const c=await join();assert.ok(c.state.chats.some(m=>m.text.includes('Hello garden')),'late history');
  const count=c.state.chats.length;a.send('chat','x'.repeat(281));await delay(100);assert.equal(c.state.chats.length,count);
  const draw=await join('multiplayer-draw');assert.notEqual(draw.state.roomId,a.state.roomId);assert.equal(draw.state.chats.length,0);
  const old=a.state.sessionId;a.disconnect();await until(()=>!b.state.players.some(p=>p.id===old),'hot drop');void a.connect();await until(()=>a.state.status==='connected','fresh join');assert.notEqual(a.state.sessionId,old);
  for(let i=0;i<9;i++)assert.equal((await join()).state.status,'connected');
  const full=await join();assert.equal(full.state.status,'full');c.disconnect();await until(()=>b.state.players.length===11,'free seat');void full.connect();await until(()=>full.state.status==='connected','retry seat');
  const id=b.state.sessionId;b.room!.connection.close();await until(()=>b.state.status==='connected'&&b.state.sessionId!==id,'automatic reconnect',20000);
 }finally{for(const c of clients)c.disconnect();await delay(250);server?.kill();}
});
