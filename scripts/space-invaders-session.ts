interface ProbeTransfer {state: {tick: number;state: {wave: number;lives: number[];tick: number}}}
type ProbeClient = MultiplayerClient<unknown, Record<string, unknown>, ProbeTransfer, {sequence: number}>;
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { MultiplayerClient } from '../multiplayer-server/packages/client/index.js';
const endpoint = process.env.SERVER_URL;
if (!endpoint) throw Error('SERVER_URL required');
const seconds = Number(process.env.LONG_SESSION_SECONDS || 240);
const a: ProbeClient = new MultiplayerClient(endpoint,'space-invaders',{create:true});
const peers: {b?: ProbeClient} = {};
const until = async (fn: () => unknown) => { const end=Date.now()+20000; while(!fn()) { if(Date.now()>end) throw Error('Relay timeout'); await delay(50); } };
try {
  void a.connect(); await until(()=>a.state.status==='connected');
  peers.b = new MultiplayerClient(endpoint,'space-invaders',{code:a.state.code});
  void peers.b.connect(); await until(()=>peers.b!.state.status==='connected');
  a.send('hostReady',{epoch:a.state.epoch}); await until(()=>a.state.ready);
  const start=Date.now(); let tick=0;
  while(Date.now()-start < seconds*1000) {
    assert.equal(a.state.status,'connected'); assert.equal(peers.b.state.status,'connected');
    a.send('hostSnapshot',{protocolVersion:1,epoch:a.state.epoch,runId:a.state.runId,tick:++tick,lastAppliedRelaySeq:a.state.lastAction?.sequence ?? 0,random:19,state:{wave:2,lives:[2,3],tick}});
    await delay(1000);
    assert.ok((peers.b.state.transfer?.state?.tick ?? -Infinity) >= tick-2,'peer checkpoint stalled');
  }
  a.disconnect(); await until(()=>peers.b!.state.hostId===peers.b!.state.sessionId);
  assert.equal(peers.b.state.transfer!.state.state.wave,2);
  peers.b.send('hostReady',{epoch:peers.b.state.epoch}); await until(()=>peers.b!.state.ready);
  console.log(JSON.stringify({result:'PASS',game:'space-invaders',seconds,checkpointTick:peers.b.state.transfer!.state.tick,migration:true}));
} finally { a.disconnect(); peers.b?.disconnect(); }
