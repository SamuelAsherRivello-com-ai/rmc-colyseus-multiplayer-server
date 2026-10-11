import type {GauntletSimulation as SnapshotSimulation} from "../src/gauntlet-simulation.js";
type TestGameState = ReturnType<SnapshotSimulation["snapshot"]>;
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {MultiplayerClient} from '../packages/client/index.js';
const endpoint=process.env.SERVER_URL||'http://127.0.0.1:2681',clients: MultiplayerClient<TestGameState>[]=[];
async function until(fn: () => unknown,message: string,timeout=20000){const end=Date.now()+timeout;while(!fn()){if(Date.now()>end)throw Error(message);await delay(40);}}
async function join(game='gauntlet-3d'){const c=new MultiplayerClient<TestGameState>(endpoint,game);clients.push(c);void c.connect();await until(()=>['connected','full'].includes(c.state.status),'join timeout');return c;}
test('gauntlet sync, class switching, late join, capacity, seat reuse, reconnect and isolation',{timeout:90000},async()=>{
 let server;
 try{
  if(!process.env.SERVER_URL){server=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,PORT:'2681'},stdio:'ignore',windowsHide:true});let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(endpoint+'/api/health')).ok;}catch{}if(ready)break;await delay(100);}assert.ok(ready);}
  const a=await join(),b=await join();assert.equal(a.state.roomId,b.state.roomId);
  a.send('class','wizard');b.send('class','wizard');await until(()=>b.state.gameState!.players.filter((p: { className: string; })=>p.className==='wizard').length===2,'switch not shared');
  assert.equal(new Set(b.state.gameState!.players.map(p=>p.color)).size,2);
  const id=a.state.sessionId,x=b.state.gameState!.players.find((p: { id: string|null; })=>p.id===id)!.x;
  a.send('input',{x:1,z:0,attack:false,magic:false});await until(()=>b.state.gameState!.players.find((p: { id: string|null; })=>p.id===id)!.x>x+.05,'movement not shared');
  a.send('input',{x:999,z:0,attack:true,magic:true,hp:9999});await delay(400);assert.ok(b.state.gameState!.players.every((p: { hp: number; maxHp: number; })=>p.hp<=p.maxHp));
  const c=await join(),d=await join();assert.equal(c.state.gameState!.match,b.state.gameState!.match);const extra=await join();assert.equal(extra.state.status,'full');
  const other=await join('multiplayer-draw');assert.notEqual(other.state.roomId,b.state.roomId);assert.equal(other.state.gameState,null);
  const color=c.state.players.find(p=>p.id===c.state.sessionId)!.color;c.disconnect();await until(()=>b.state.players.length===3,'departure missing');void extra.connect();await until(()=>extra.state.status==='connected','full retry failed');assert.equal(extra.state.players.find(p=>p.id===extra.state.sessionId)!.color,color);
  const old=d.state.sessionId;d.room!.connection.close();await until(()=>d.state.status==='connected'&&d.state.sessionId!==old,'reconnect failed');
  const forbidden=await fetch(endpoint+'/matchmake/joinOrCreate/gauntlet-3d',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(forbidden.status,403);
 }finally{clients.forEach(c=>c.disconnect());await delay(250);server?.kill();}
});
