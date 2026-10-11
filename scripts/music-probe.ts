import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {MultiplayerClient} from '../multiplayer-server/packages/client/index.js';
const endpoint=process.env.SERVER_URL||'http://127.0.0.1:2567';
interface MusicMessage {request: number;step: number;origin: string;deadline: number;[field: string]: unknown}
class ProbeClient extends MultiplayerClient<unknown, Record<string, unknown>, unknown, unknown, MusicMessage> { events: {type: string;data: MusicMessage | undefined}[] = []; }
const clients: ProbeClient[]=[];
async function until(fn: () => unknown,label: string){for(let i=0;i<800;i++){if(fn())return;await delay(25);}throw Error(label);}
async function join(options: import("../multiplayer-server/packages/client/index.js").JoinOptions){const c=new ProbeClient(endpoint,'music-maker',options);clients.push(c);c.events=[];c.subscribe((s,e)=>{if(e.startsWith('music'))c.events.push({type:e,data:structuredClone(s.musicMessage)});});void c.connect();await until(()=>['connected','error','full'].includes(c.state.status),'admission timeout');assert.equal(c.state.status,'connected',c.state.error);return c;}
try{
 const host=await join({create:true}),guest=await join({code:host.state.code});
 const epoch=crypto.randomUUID(),start=performance.now();
 let sequence=0;
 host.subscribe((s,type)=>{const v=s.musicMessage;if (!v) return;if(type==='musicIntent')host.send('musicCommit',{...v,sequence:++sequence,deadline:start+v.step*500});if(type==='musicClockRequest')host.send('musicClockReply',{target:v.origin,...v,received:performance.now(),hostNow:performance.now(),epoch,start});});
 const duration=Number(process.env.MUSIC_PROBE_SECONDS||2)*1000;
 const began=performance.now();let count=0;
 do{
  assert.equal(host.state.status,'connected');assert.equal(guest.state.status,'connected');
  const request=++count;guest.send('musicClockRequest',{request,sent:performance.now()});
  await until(()=>guest.events.some(e=>e.type==='musicClockReply'&&e.data?.request===request),'music clock unsupported');
  guest.send('musicIntent',{epoch,sequence:request,step:request,sound:'kick'});
  await until(()=>guest.events.some(e=>e.type==='musicCommit'&&e.data?.step===request),'music relay unsupported');
  const e=guest.events.find(e=>e.type==='musicCommit'&&e.data?.step===request)!.data!;
  assert.equal(e.origin,guest.state.sessionId);assert.equal(e.deadline,start+request*500);
  await delay(1000);
 }while(performance.now()-began<duration);
 console.log(JSON.stringify({result:'PASS',protocol:'music-maker epoch/absolute-step v1',clients:2,exchanges:count,elapsedMs:performance.now()-began,endpoint}));
}finally{clients.forEach(c=>c.disconnect());}
