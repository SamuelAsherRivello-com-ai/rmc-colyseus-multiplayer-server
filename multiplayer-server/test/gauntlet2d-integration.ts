import type {Gauntlet2DSimulation as SnapshotSimulation} from "../src/gauntlet2d-simulation.js";
type TestGameState = ReturnType<SnapshotSimulation["snapshot"]>;
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { MultiplayerClient } from '../packages/client/index.js';
const endpoint=process.env.SERVER_URL||'http://127.0.0.1:2682',clients: MultiplayerClient<TestGameState>[]=[];
async function until(fn: () => unknown,label: string,ms=20000){const end=Date.now()+ms;while(!fn()){if(Date.now()>end)throw Error(label);await delay(40);}}
async function join(game='gauntlet-2d'){const c=new MultiplayerClient<TestGameState>(endpoint,game);clients.push(c);void c.connect();await until(()=>['connected','full'].includes(c.state.status),'join '+c.state.error);return c;}
test('gauntlet-2d sync, duplicate classes, late join, capacity, isolation and fresh reconnect',{timeout:90000},async()=>{
 let server;try{
  if(!process.env.SERVER_URL){server=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,PORT:'2682'},stdio:'ignore',windowsHide:true});let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(endpoint+'/api/health')).ok;}catch{}if(ready)break;await delay(100);}assert.ok(ready);}
  const a=await join(),b=await join();assert.equal(a.state.roomId,b.state.roomId);
  a.send('select','wizard');b.send('select','wizard');await until(()=>b.state.gameState!.players.filter((p: { hero: string; })=>p.hero==='wizard').length===2,'switch sync');
  assert.equal(new Set(b.state.gameState!.players.map(p=>p.color)).size,2);
  const id=a.state.sessionId,x=b.state.gameState!.players.find((p: { id: string|null; })=>p.id===id)!.x;
  a.send('input',{x:-1,y:0,ax:0,ay:0,attack:false});await until(()=>b.state.gameState!.players.find((p: { id: string|null; })=>p.id===id)!.x<x-.05,'move sync');
  a.send('input',{x:0,y:0,ax:0,ay:0,attack:false});a.send('select','constructor');a.send('input',{x:999,y:0,ax:0,ay:0,attack:true,hp:9999});await delay(100);
  assert.ok(b.state.gameState!.players.every((p: { hp: number; x: unknown; })=>p.hp<=100&&Number.isFinite(p.x)));
  const c=await join(),d=await join();assert.equal(c.state.gameState!.round,b.state.gameState!.round);const extra=await join();assert.equal(extra.state.status,'full');
  const draw=await join('multiplayer-draw');assert.notEqual(draw.state.roomId,a.state.roomId);assert.equal(draw.state.gameState,null);
  d.disconnect();await until(()=>b.state.players.length===3,'departure');void extra.connect();await until(()=>extra.state.status==='connected','seat retry');
  a.room!.connection.close();await until(()=>a.state.status==='connected'&&a.state.sessionId!==id,'fresh reconnect');
  const denied=await fetch(endpoint+'/matchmake/joinOrCreate/gauntlet-2d',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,403);
 }finally{clients.forEach(c=>c.disconnect());await delay(300);server?.kill();}
});
