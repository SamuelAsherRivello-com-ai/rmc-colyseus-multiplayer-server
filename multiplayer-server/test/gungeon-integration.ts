import type {GungeonSimulation as SnapshotSimulation} from "../src/gungeon-simulation.js";
type TestGameState = ReturnType<SnapshotSimulation["snapshot"]>;
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { MultiplayerClient, type JoinOptions } from '../packages/client/index.js';
const endpoint=process.env.SERVER_URL||'http://127.0.0.1:2683',clients: MultiplayerClient<TestGameState>[]=[];
async function until(fn: () => unknown,label: string,ms=20000){const end=Date.now()+ms;while(!fn()){if(Date.now()>end)throw Error(label);await delay(40);}}
async function join(options: JoinOptions|undefined){const c=new MultiplayerClient<TestGameState>(endpoint,'gungeon',options);clients.push(c);void c.connect();await until(()=>['connected','full','error'].includes(c.state.status),'join '+c.state.error);return c;}
test('coded dungeon sync, authority, readiness, four seats, isolation, hot drop and fresh reconnect',{timeout:90000},async()=>{
 let server;try{
  if(!process.env.SERVER_URL){server=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,PORT:'2683'},stdio:'ignore',windowsHide:true});let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(endpoint+'/api/health')).ok;}catch{}if(ready)break;await delay(100);}assert.ok(ready);}
  const a=await join({create:true});assert.equal(a.state.status,'connected');const code=a.state.code;assert.match(code!,/^[A-Z0-9]{4}$/);const b=await join({code});assert.equal(a.state.roomId,b.state.roomId);
  a.send('weapon','scatter');await until(()=>b.state.gameState!.players.some((p: { weapon: string; })=>p.weapon==='scatter'),'weapon sync');a.send('ready');await delay(100);assert.equal(b.state.gameState!.phase,'lobby');b.send('ready');await until(()=>b.state.gameState!.phase==='combat','ready');
  const id=a.state.sessionId,x=b.state.gameState!.players.find((p: { id: string|null; })=>p.id===id)!.x;a.send('input',{x:1,y:0,ax:1,ay:0,shoot:true,roll:false});await until(()=>b.state.gameState!.players.find((p: { id: string|null; })=>p.id===id)!.x>x+.05,'movement');a.send('input',{x:999,y:0,ax:1,ay:0,shoot:true,roll:false,hp:9999});await delay(350);assert.ok(b.state.gameState!.players.every((p: { hp: number; x: number; })=>p.hp<=100&&p.x<29));
  const c=await join({code}),d=await join({code});assert.equal(c.state.gameState!.wave,b.state.gameState!.wave);const extra=await join({code});assert.equal(extra.state.status,'full');const other=await join({create:true});assert.notEqual(other.state.roomId,a.state.roomId);assert.equal(other.state.gameState!.wave,0);
  d.disconnect();await until(()=>b.state.players.length===3,'consented leave');void extra.connect();await until(()=>extra.state.status==='connected','seat retry');a.room!.connection.close();await until(()=>a.state.status==='connected'&&a.state.sessionId!==id,'reconnect');assert.equal(a.state.code,code);assert.equal(a.state.roomId,b.state.roomId);
  const missing=await join({code:'BAD'});assert.equal(missing.state.status,'error');const direct=await fetch(endpoint+'/matchmake/joinOrCreate/gungeon',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(direct.status,403);
 }finally{clients.forEach(c=>c.disconnect());await delay(300);server?.kill();}
});
