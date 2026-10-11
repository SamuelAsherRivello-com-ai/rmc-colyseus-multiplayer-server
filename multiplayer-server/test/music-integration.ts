interface MusicPayload {origin: string;deadline: number;[field: string]: unknown}
class MusicTestClient extends MultiplayerClient<unknown, Record<string, unknown>, unknown, unknown, MusicPayload> {events: {type: string;data: MusicPayload | undefined}[]=[];}
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { MultiplayerClient, type JoinOptions } from '../packages/client/index.js';
import { Client } from '@colyseus/sdk';
const endpoint = process.env.SERVER_URL || 'http://127.0.0.1:2696';
async function until(fn: () => unknown, label: string, ms = 20000) { const end = Date.now()+ms; while (!fn()) { if(Date.now()>end) throw Error(label); await delay(25); } }
test('music private room relay: identity, host-only publication, clock, capacity, guest rejoin, isolation and host end', {timeout:90000}, async () => {
 const clients: MusicTestClient[]=[]; let server;
 async function join(options: JoinOptions|undefined) { const c=new MusicTestClient(endpoint,'music-maker',options); clients.push(c); c.events=[]; c.subscribe((s,e)=>{if(e.startsWith('music'))c.events.push({type:e,data:structuredClone(s.musicMessage)});}); void c.connect(); await until(()=>['connected','full','error'].includes(c.state.status),'music admission'); return c; }
 try {
  if(!process.env.SERVER_URL) { server=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,PORT:'2696'},stdio:'ignore',windowsHide:true}); let ready=false; for(let i=0;i<100;i++){try{ready=(await fetch(endpoint+'/api/health')).ok;}catch{} if(ready)break;await delay(100);} assert.ok(ready); }
  // Reserve the creator but deliberately attach a guest before its socket.
  const admission=await (await fetch(endpoint+'/api/join/music-maker',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({create:true})})).json();
  const earlyGuest=await join({code:admission.code});
  assert.equal(earlyGuest.state.status,'connected');
  assert.equal(earlyGuest.state.hostId,admission.reservation.sessionId);
  assert.equal(earlyGuest.state.players.find(p=>p.id===earlyGuest.state.sessionId)!.number,2);
  const creator=await new Client(endpoint).consumeSeatReservation(admission.reservation);
  await until(()=>earlyGuest.state.players.length===2,'creator attached after guest');
  assert.equal(earlyGuest.state.players.find(p=>p.id===creator.sessionId)!.number,1);
  await creator.leave();await until(()=>earlyGuest.state.status==='ended','reserved creator loss ends room');
  const a=await join({create:true}), b=await join({code:a.state.code});
  assert.equal(a.state.status,'connected'); assert.equal(b.state.roomId,a.state.roomId); assert.equal(b.state.hostId,a.state.sessionId);
  await until(()=>a.state.players.length===2,'roster'); assert.deepEqual(a.state.players.map(p=>p.number),[1,2]); assert.ok(a.state.players.every(p=>p.name));
  const snapshot={target:b.state.sessionId,epoch:'test',start:0,hostNow:5,sequence:0,events:[]};
  a.send('musicSnapshot',snapshot); await until(()=>b.events.some((e: { type: string; })=>e.type==='musicSnapshot'),'host snapshot');
  const event={epoch:'test',sequence:1,origin:b.state.sessionId,step:3,sound:'snare',deadline:1500};
  b.send('musicCommit',event); await delay(100); assert.equal(a.events.filter((e: { type: string; })=>e.type==='musicCommit').length,0,'guest publication rejected');
  b.send('musicIntent',{...event,origin:a.state.sessionId}); await until(()=>a.events.some((e: { type: string; })=>e.type==='musicIntent'),'intent relayed'); assert.equal(a.events.find((e: { type: string; })=>e.type==='musicIntent')!.data!.origin,b.state.sessionId,'origin server stamped');
  a.send('musicCommit',event); await until(()=>b.events.some((e: { type: string; })=>e.type==='musicCommit'),'commit delivered'); assert.equal(b.events.find((e: { type: string; })=>e.type==='musicCommit')!.data!.deadline,1500);
  b.send('musicClockRequest',{request:1,sent:10}); await until(()=>a.events.some((e: { type: string; })=>e.type==='musicClockRequest'),'clock request');
  a.send('musicClockReply',{target:b.state.sessionId,request:1,sent:10,received:20,hostNow:21,start:0,epoch:'test'}); await until(()=>b.events.some((e: { type: string; })=>e.type==='musicClockReply'),'clock reply');
  b.send('musicIntent',{epoch:'test',sequence:2,step:-1,sound:'kick'}); await delay(80); assert.equal(a.events.filter((e: { type: string; })=>e.type==='musicIntent').length,1,'invalid step rejected');
  b.send('musicSnapshot',snapshot); b.send('musicClockReply',{target:a.state.sessionId,request:99,sent:0,received:0,hostNow:0,start:0,epoch:'test'}); a.send('musicSnapshot',{...snapshot,events:Array(113).fill(event)}); b.send('musicIntent',{epoch:'test',sequence:3,step:1,sound:'invalid'}); await delay(100); assert.equal(a.events.filter((e: { type: string; })=>e.type==='musicClockReply').length,0); assert.equal(b.events.filter((e: { type: string; })=>e.type==='musicSnapshot').length,1,'oversized snapshot rejected'); for(let i=0;i<80;i++)b.send('musicClockRequest',{request:100+i,sent:10}); await delay(200); assert.ok(a.events.filter((e: { type: string; })=>e.type==='musicClockRequest').length<=33,'guest rate bounded');
  const c=await join({code:a.state.code}),d=await join({code:a.state.code}),full=await join({code:a.state.code}); assert.equal(full.state.status,'full');
  const other=await join({create:true}); assert.notEqual(other.state.roomId,a.state.roomId); assert.equal(other.events.filter((e: { type: string; })=>e.type==='musicCommit').length,0);
  const oldId=d.state.sessionId; d.disconnect(); await until(()=>a.state.players.length===3,'guest departure');
  const rejoin=await join({code:a.state.code}); assert.equal(rejoin.state.status,'connected'); assert.notEqual(rejoin.state.sessionId,oldId); assert.equal(rejoin.state.players.find(p=>p.id===rejoin.state.sessionId)!.number,4);
  a.room!.connection.close(); await until(()=>b.state.status==='ended','host-drop ends session'); assert.equal(b.state.error,'Host disconnected'); await delay(300); assert.equal(b.stopped,true,'no automatic migration/rejoin');
 } finally { clients.forEach(c=>c.disconnect()); await delay(200); server?.kill(); }

});


