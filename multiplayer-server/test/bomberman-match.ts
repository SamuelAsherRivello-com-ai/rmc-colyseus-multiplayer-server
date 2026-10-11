import type {BombermanSimulation as SnapshotSimulation} from "../src/bomberman-simulation.js";
type TestGameState = ReturnType<SnapshotSimulation["snapshot"]>;
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { MultiplayerClient, type JoinOptions } from '../packages/client/index.js';

test('two real Colyseus clients complete first-to-three and ready a fresh rematch',{timeout:90000},async()=>{
 const endpoint=process.env.SERVER_URL||'http://127.0.0.1:2691';const clients: MultiplayerClient<TestGameState>[]=[];let server;
 async function until(fn: () => unknown,label: string,ms=20000){const end=Date.now()+ms;while(!await fn()){if(Date.now()>end)throw Error(label);await delay(30);}}
 try{
  if(!process.env.SERVER_URL){
   server=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,PORT:'2691'},stdio:'ignore',windowsHide:true});
   await until(asyncReady,'local server');
  }
  async function join(options: JoinOptions|undefined){const c=new MultiplayerClient<TestGameState>(endpoint,'bomberman',options);clients.push(c);void c.connect();await until(()=>c.state.status==='connected','admission');return c;}
  const a=await join({create:true}),b=await join({code:a.state.code}),c=await join({code:a.state.code}),d=await join({code:a.state.code});for(const player of [a,b,c,d])player.send('ready');
  let seq=1;
  for(let round=1;round<=3;round++){
   await until(()=>a.state.gameState!.phase==='playing'&&a.state.gameState!.round===round,'round '+round);
   assert.equal(a.state.gameState!.players.find((p: { id: string|null; })=>p.id===a.state.sessionId)!.capacity,1);
   const placedAt=Date.now();for(const player of [a,c,d])player.send('input',{seq:seq,x:0,y:0,bomb:true});seq++;
   await until(()=>a.state.gameState!.people.find((p: { id: string|null; })=>p.id===b.state.sessionId)!.score===round,'authoritative score '+round);
   await until(()=>b.state.gameState!.people.find((p: { id: string|null; })=>p.id===b.state.sessionId)!.score===round,'peer score '+round);
   assert.ok(Date.now()-placedAt>=2400&&Date.now()-placedAt<4500,'real fuse follows simulation time despite timer jitter');
  }
  assert.equal(a.state.gameState!.phase,'matchResults');assert.equal(b.state.gameState!.phase,'matchResults');
  assert.equal(a.state.gameState!.matchWinner,b.state.sessionId);assert.equal(b.state.gameState!.matchWinner,b.state.sessionId);
  await delay(3100);a.send('rematch');await delay(200);assert.equal(a.state.gameState!.phase,'matchResults');for(const player of [b,c,d])player.send('rematch');
  await until(()=>a.state.gameState!.phase==='playing'&&a.state.gameState!.match===2,'rematch');
  assert.equal(a.state.gameState!.round,1);assert.ok(a.state.gameState!.people.every((p: { score: number; })=>p.score===0));assert.equal(a.state.gameState!.bombs.length,0);
  assert.ok(a.state.gameState!.players.every((p: { capacity: number; range: number; speedLevel: number; })=>p.capacity===1&&p.range===2&&p.speedLevel===0));
 }finally{clients.forEach(c=>c.disconnect());await delay(300);server?.kill();}
 async function asyncReady(){try{return(await fetch(endpoint+'/api/health')).ok;}catch{return false;}}
});
