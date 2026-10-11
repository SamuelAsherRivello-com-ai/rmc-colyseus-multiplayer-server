import type {RacingSimulation as SnapshotSimulation} from "../packages/client/racing-simulation.js";
type TestGameState = ReturnType<SnapshotSimulation["snapshot"]>;
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {MultiplayerClient} from '../packages/client/index.js';
const endpoint=process.env.SERVER_URL||'http://127.0.0.1:2685';
const clients: MultiplayerClient<TestGameState>[]=[];
async function until(fn: () => unknown,message: string,timeout=20000){const end=Date.now()+timeout;while(!fn()){if(Date.now()>end)throw Error(message);await delay(30);}}
async function join(game='dust-circuit-rally'){const c=new MultiplayerClient<TestGameState>(endpoint,game);clients.push(c);void c.connect();await until(()=>['connected','full'].includes(c.state.status),'join: '+c.state.error);return c;}
test('racing synchronization, readiness, late arrival, authority, capacity, departure and fresh retry',{timeout:90000},async()=>{let server;try{
 if(!process.env.SERVER_URL){server=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,PORT:'2685'},stdio:'ignore',windowsHide:true});let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(endpoint+'/api/health')).ok;}catch{}if(ready)break;await delay(100);}assert(ready);}
 const a=await join(),b=await join();assert.equal(a.state.roomId,b.state.roomId);a.send('ready',true);b.send('ready',true);await until(()=>a.state.gameState!.people.every(p=>p.ready),'ready missing');b.send('start');await delay(100);assert.equal(a.state.gameState!.phase,'waiting');a.send('start');await until(()=>a.state.gameState!.phase==='countdown','countdown missing');const c=await join();assert(!c.state.gameState!.trucks.some((p: { id: string|null; })=>p.id===c.state.sessionId));assert.equal(c.state.gameState!.trucks.length,4);await until(()=>a.state.gameState!.phase==='racing','race missing');const id=a.state.sessionId,before=b.state.gameState!.trucks.find((p: { id: string|null; })=>p.id===id)!.x;
 for(let seq=0;seq<10;seq++){a.send('input',{seq,steer:0,throttle:1,brake:false,boost:false,recover:false});await delay(50);}await until(()=>Math.abs(b.state.gameState!.trucks.find((p: { id: string|null; })=>p.id===id)!.x-before)>.5,'movement missing');a.send('input',{seq:20,steer:999,throttle:1,brake:false,boost:false,recover:false,laps:3});await delay(100);assert(b.state.gameState!.trucks.every((p: { x: unknown; laps: number; })=>Number.isFinite(p.x)&&p.laps===0));
 const d=await join();assert.equal(d.state.status,'connected');const fifth=await join();assert.equal(fifth.state.status,'full');const draw=await join('multiplayer-draw');assert.notEqual(draw.state.roomId,a.state.roomId);assert.equal(draw.state.gameState,null);
 a.disconnect();await until(()=>b.state.gameState!.trucks.find((p: { id: string|null; })=>p.id===id)?.bot,'AI substitution missing');void fifth.connect();await until(()=>fifth.state.status==='connected','retry missing');assert(!fifth.state.gameState!.trucks.some((p: { id: string|null; })=>p.id===fifth.state.sessionId));d.disconnect();await delay(200);const old=b.state.sessionId;b.room!.connection.close();await until(()=>b.state.status==='connected'&&b.state.sessionId!==old,'fresh reconnect missing');assert(!b.state.gameState!.trucks.some((p: { id: string|null; })=>p.id===b.state.sessionId));
 }finally{clients.forEach(c=>c.disconnect());await delay(300);server?.kill();}});
