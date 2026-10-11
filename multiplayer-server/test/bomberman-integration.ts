import type {BombermanSimulation as SnapshotSimulation} from "../src/bomberman-simulation.js";
type TestGameState = ReturnType<SnapshotSimulation["snapshot"]>;
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { MultiplayerClient, type JoinOptions } from '../packages/client/index.js';
const localPort=22000+(process.pid%20000),endpoint=process.env.SERVER_URL||`http://127.0.0.1:${localPort}`,clients: MultiplayerClient<TestGameState>[]=[];
async function until(fn: () => unknown,label: string,ms=20000){const end=Date.now()+ms;while(!fn()){if(Date.now()>end)throw Error(label);await delay(40);}}
async function join(options: JoinOptions|undefined){const c=new MultiplayerClient<TestGameState>(endpoint,'bomberman',options);clients.push(c);void c.connect();await until(()=>['connected','full','error'].includes(c.state.status),'join');return c;}
test('private Bomberman admission, authoritative bombs, isolation, capacity and same-identity reconnect',{timeout:90000},async()=>{
 let server;try{
  if(!process.env.SERVER_URL){server=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,PORT:String(localPort)},stdio:'ignore',windowsHide:true});let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(endpoint+'/api/health')).ok;}catch{}if(ready)break;await delay(100);}assert.ok(ready);}
  const a=await join({create:true}),code=a.state.code,b=await join({code});assert.match(code!,/^[A-Z0-9]{6}$/);assert.equal(a.state.roomId,b.state.roomId);
  const earlyId=a.state.sessionId;a.room!.connection.close();await until(()=>a.state.status==='reconnecting','immediate drop observed');await until(()=>a.state.status==='connected'&&a.state.sessionId===earlyId,'recovery without minimum uptime');
  const c=await join({code}),d=await join({code});a.send('ready');await delay(150);assert.equal(b.state.gameState!.phase,'lobby');for(const player of [b,c,d])player.send('ready');await until(()=>b.state.gameState!.phase==='playing','countdown');
  const id=a.state.sessionId;for(const player of [a,c,d])player.send('input',{seq:1,x:0,y:0,bomb:true});await until(()=>b.state.gameState!.bombs.length===3,'bomb sync');await until(()=>b.state.gameState!.phase==='results','round result');assert.equal(b.state.gameState!.winner,b.state.sessionId);
  const extra=await join({code});assert.equal(extra.state.status,'full');const other=await join({create:true});assert.notEqual(other.state.roomId,a.state.roomId);
  a.room!.connection.close();await until(()=>a.state.status==='reconnecting','drop observed');await until(()=>a.state.status==='connected'&&a.state.sessionId===id,'same identity reconnect');
  d.disconnect();await until(()=>b.state.gameState!.people.filter(p=>!p.cpu).length===3,'consent removal');void extra.connect();await until(()=>extra.state.status==='connected','seat reuse');
  const lostId=c.state.sessionId;c.room!.reconnection.enabled=false;c.stopped=true;c.room!.connection.close();await until(()=>b.state.gameState!.people.some(p=>p.id===lostId&&!p.connected),'reserved dropped seat');await delay(19000);assert(b.state.gameState!.people.some(p=>p.id===lostId&&!p.connected),'room-code seat remains available while players stay connected');
  const invalid=await join({code:'BAD'});assert.equal(invalid.state.status,'error');
 }finally{clients.forEach(c=>c.disconnect());await delay(300);server?.kill();}
});
