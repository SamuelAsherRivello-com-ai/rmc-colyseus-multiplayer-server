import type {CombatSimulation as SnapshotSimulation} from "../src/combat-simulation.js";
type TestGameState = ReturnType<SnapshotSimulation["snapshot"]>;
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {MultiplayerClient, type JoinOptions} from '../packages/client/index.js';
const port=23000+(process.pid%17000),endpoint=process.env.SERVER_URL||`http://127.0.0.1:${port}`;
const clients: MultiplayerClient<TestGameState>[]=[];
async function until(fn: () => unknown,label: string,ms=20000){const end=Date.now()+ms;while(!fn()){if(Date.now()>end)throw Error(label);await delay(30);}}
async function join(options: JoinOptions|undefined){const c=new MultiplayerClient<TestGameState>(endpoint,'combat',options);clients.push(c);void c.connect();await until(()=>['connected','full','error'].includes(c.state.status),'Combat admission: '+JSON.stringify(c.state));if(c.state.status==='error')console.log('admissionError',JSON.stringify({options,status:c.state.status,error:c.state.error}));return c;}
test('Combat real private admission, authoritative motion/fire, populations, recovery races and isolation',{timeout:95000},async()=>{
 let server;
 try{
  if(!process.env.SERVER_URL){server=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,PORT:String(port)},stdio:'ignore',windowsHide:true});let ok=false;for(let i=0;i<100;i++){try{ok=(await fetch(endpoint+'/api/health')).ok;}catch{}if(ok)break;await delay(100);}assert.ok(ok,'local server started');}
  assert.ok((await (await fetch(endpoint+'/api/health')).json()).games.includes('combat'));
  const a=await join({create:true});assert.equal(a.state.status,'connected');const code=a.state.code;assert.match(code!,/^[A-Z0-9]{4}$/);
  assert.equal(a.state.gameState!.protocol,1);assert.equal(a.state.gameState!.tanks.length,4);assert.equal(a.state.gameState!.tanks.filter(t=>t.cpu).length,3);
  const b=await join({code});assert.equal(b.state.status,'connected',b.state.error);assert.equal(b.state.roomId,a.state.roomId);await until(()=>a.state.gameState!.people.length===2,'two people');assert.equal(a.state.gameState!.tanks.filter(t=>t.cpu).length,2);
  b.send('options',{mode:'ricochet',difficulty:'high',arena:'switchback'});await delay(120);assert.equal(a.state.gameState!.mode,'classic');
  a.send('options',{mode:'ricochet',difficulty:'high',arena:'switchback'});await until(()=>b.state.gameState!.mode==='ricochet','host options');assert.equal(b.state.gameState!.arena,'switchback');
  a.send('ready');await delay(100);assert.equal(b.state.gameState!.phase,'lobby');b.send('ready');await until(()=>a.state.gameState!.phase==='playing','start countdown');
  const start={...a.state.gameState!.tanks[0]};let seq=0;const controls=setInterval(()=>a.send('input',{seq:++seq,drive:1,turn:0,fire:true}),50);
  try{await until(()=>b.state.gameState!.tanks[0]!.ack>=2&&b.state.gameState!.tanks[0]!.cooldown>0,'authoritative controls and shots');assert.ok(Math.hypot(b.state.gameState!.tanks[0]!.x-start.x!,b.state.gameState!.tanks[0]!.y-start.y!)>0);}finally{clearInterval(controls);a.send('input',{seq:++seq,drive:0,turn:0,fire:false});}
  const c=await join({code});assert.equal(c.state.status,'connected',c.state.error);await until(()=>a.state.gameState!.people.length===3,'late arrival');assert.equal(c.state.gameState!.people.find((p: { id: string|null; })=>p.id===c.state.sessionId)!.waiting,true);assert.equal(c.state.gameState!.tanks.filter(t=>t.cpu).length,2);
  const d=await join({code});assert.equal(d.state.status,'connected',d.state.error);assert.equal(d.state.roomId,a.state.roomId);const full=await join({code});assert.equal(full.state.status,'full');
  const previousAck=a.state.gameState!.tanks[0]!.ack;
  a.send('input',{seq:2147483647,drive:99,turn:0,fire:false,score:999});
  a.send('input',{seq:0,drive:1,turn:0,fire:false});
  await delay(100);assert.equal(b.state.gameState!.tanks[0]!.ack,previousAck,'invalid and duplicate inputs rejected');
  const floodEnd=seq+400;while(seq<floodEnd)a.send('input',{seq:++seq,drive:0,turn:0,fire:false});
  await delay(350);assert.ok(b.state.gameState!.tanks[0]!.ack<floodEnd,'excess control messages rate limited');
  const observed: {tick: number;time: number}[]=[];const off=b.subscribe((state,event)=>{if(event==='gameState')observed.push({tick:state.gameState!.tick,time:state.gameState!.serverTime});});
  await delay(320);off();assert.ok(observed.length>=3&&observed.length<=12,'bounded snapshots');
  for(let i=1;i<observed.length;i++){assert.ok(observed[i]!.tick>observed[i-1]!.tick);assert.ok(Math.abs((observed[i]!.time-observed[i-1]!.time)*60-(observed[i]!.tick-observed[i-1]!.tick))<.01,'timestamp follows fixed ticks');}
  const id=a.state.sessionId,slot=a.state.gameState!.people.find((p: { id: string|null; })=>p.id===id)!.slot;
  a.room!.connection.close();await until(()=>a.state.status==='reconnecting','drop');await until(()=>a.state.status==='connected'&&a.state.sessionId===id,'same session recovery');assert.equal(a.state.gameState!.people.find((p: { id: string|null; })=>p.id===id)!.slot,slot);
  const lost=d.state.sessionId;d.room!.reconnection.enabled=false;d.stopped=true;d.room!.connection.close();await until(()=>b.state.gameState!.people.some(p=>p.id===lost&&!p.connected),'CPU takeover');
  const protectedJoin=await join({code});assert.equal(protectedJoin.state.status,'full','code stranger cannot steal recovery reservation');
  await until(()=>!b.state.gameState!.people.some((p: { id: string|null; })=>p.id===lost),'expired recovery removes reservation',22000);const replacement=await join({code});assert.equal(replacement.state.status,'connected');assert.equal(replacement.state.gameState!.tanks.length,4);
  const other=await join({create:true,code});assert.equal(other.state.status,'error','duplicate code rejected');
  const independent=await join({create:true});assert.notEqual(independent.state.roomId,b.state.roomId);
  const peers=await Promise.all(Array.from({length:3},()=>join({code:independent.state.code})));
  assert.ok(peers.every(p=>p.state.status==='connected'&&p.state.roomId===independent.state.roomId),'simultaneous reservations share one room: '+JSON.stringify(peers.map(p=>({status:p.state.status,room:p.state.roomId,error:p.state.error,code:p.state.code}))));
  await until(()=>independent.state.gameState!.people.length===4,'four simultaneous humans');
  assert.equal(independent.state.gameState!.tanks.filter(t=>t.cpu).length,0);
  const expiredCode=independent.state.code;for(const peer of [independent,...peers])peer.disconnect();
  await delay(16500);const expired=await join({code:expiredCode});assert.equal(expired.state.status,'error','empty room expires after bounded grace');
  const invalid=await join({code:'BAD'});assert.equal(invalid.state.status,'error');
  const wrong=await fetch(endpoint+'/api/join/gungeon',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});assert.equal(wrong.status,404,'cross-game code isolation');
  console.log(JSON.stringify({combatProbe:'passed',endpoint,room:b.state.roomId,protocol:b.state.gameState!.protocol,tanks:b.state.gameState!.tanks.length,tick:b.state.gameState!.tick,mode:b.state.gameState!.mode}));
 }finally{clients.forEach(c=>c.disconnect());await delay(250);server?.kill();}
});

