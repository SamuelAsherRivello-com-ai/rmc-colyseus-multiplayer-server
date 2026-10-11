import type {TetrisDuel} from '../packages/client/tetris-duel-rules.js';
type TestGameState = NonNullable<ReturnType<TetrisDuel['project']>>;
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {MultiplayerClient, type JoinOptions} from '../packages/client/index.js';
const endpoint=process.env.SERVER_URL||'http://127.0.0.1:2694',clients: MultiplayerClient<TestGameState>[]=[];
async function until(fn: () => unknown,label: string,ms=15000){const end=Date.now()+ms;while(!fn()){if(Date.now()>end)throw Error(label);await delay(25);}}
async function join(options: JoinOptions|undefined){const c=new MultiplayerClient<TestGameState>(endpoint,'tetris-duel',options);clients.push(c);void c.connect();await until(()=>['connected','full','error'].includes(c.state.status),'Tetris admission');return c;}
function input(c: MultiplayerClient<TestGameState>,action: string,extras={}){const s=c.state.gameState;c.send('input',{protocolVersion:1,epoch:s!.epoch,pieceId:s!.own.piece!.id,seq:s!.own.ack+1,action,...extras});}
test('Tetris relay private admission, gameplay, privacy, recovery, outcome, rematch and expiry',{timeout:90000},async()=>{
  let server;
  try{
    if(!process.env.SERVER_URL){
      server=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,PORT:'2694'},stdio:'ignore',windowsHide:true});
      let ready=false;for(let n=0;n<100;n++){try{ready=(await fetch(endpoint+'/api/health')).ok;}catch{}if(ready)break;await delay(100);}assert.ok(ready,'server starts');
    }
    const a=await join({create:true});assert.equal(a.state.status,'connected');const code=a.state.code;
    assert.match(code!,/^[A-Z0-9]{4}$/);const b=await join({code});assert.equal(b.state.status,'connected');assert.equal(a.state.roomId,b.state.roomId);
    await until(()=>a.state.gameState!.opponent&&b.state.gameState!.opponent,'both seats');
    const full=await join({code});assert.equal(full.state.status,'full');
    const bad=await join({code:'BAD'});assert.equal(bad.state.status,'error');
    const collision=await join({create:true,code});assert.equal(collision.state.status,'error');
    const isolate=await join({create:true});assert.notEqual(isolate.state.roomId,a.state.roomId);isolate.disconnect();
    a.send('ready',{ready:true});b.send('ready',{ready:true});
    await until(()=>a.state.gameState!.phase==='playing'&&b.state.gameState!.phase==='playing','ready countdown');
    const own=a.state.gameState!.own,token=a.state.reconnectToken;
    assert.ok(own.board.length===24);assert.ok(own.queue.length===5);
    const messages: {gameState: TestGameState}[]=[];a.room!.onMessage('snapshot',data=>messages.push(data));
    input(a,'left');await until(()=>a.state.gameState!.own.piece!.x===2&&b.state.gameState!.opponent!.aim!.x===2,'aim relay');
    input(a,'commit');await until(()=>!b.state.gameState!.opponent!.aim,'opponent hint removed on commit');
    await until(()=>a.state.gameState!.own.placements===1,'piece resolves');
    input(a,'commit',{epoch:-1,board:[],winner:1});await delay(100);assert.equal(a.state.gameState!.phase,'playing');
    const before=a.state.gameState!.own.placements,seat=a.state.gameState!.own.seat;
    let dropped=false;a.room!.onDrop(()=>{dropped=true;});a.room!.connection.close();
    await until(()=>dropped,'SDK observes drop');
    await until(()=>a.state.status==='connected'&&a.state.gameState!.own.connected,'SDK recovery',20000);
    assert.equal(a.state.gameState!.own.seat,seat);assert.equal(a.state.gameState!.own.placements,before);
    // Disable SDK only to emulate a page refresh with the private admission token.
    a.room!.reconnection.enabled=false;a.room!.connection.close();
    await until(()=>b.state.gameState!.paused,'pause on detected drop');
    const pausedTime=b.state.gameState!.serverTime;await delay(350);assert.equal(b.state.gameState!.serverTime,pausedTime,'both clocks remain paused');
    const stolen=await join({code});assert.equal(stolen.state.status,'full','code alone cannot take reserved seat');
    const restored=await join({code,reconnectToken:token});assert.equal(restored.state.status,'connected');
    assert.equal(restored.state.gameState!.own.seat,seat);assert.equal(restored.state.gameState!.own.placements,before);
    assert.notEqual(restored.state.reconnectToken,token,'refresh rotates token');
    const old=await join({code,reconnectToken:token});assert.equal(old.state.status,'error');
    for(let i=0;i<35&&restored.state.gameState!.phase==='playing';i++){
      const p=restored.state.gameState!.own.piece;
      if(p!.stage==='aiming')input(restored,'commit');
      await until(()=>restored.state.gameState!.phase!=='playing'||restored.state.gameState!.own.piece!.id!==p!.id,'next independent piece');
    }
    await until(()=>b.state.gameState!.phase==='results','top-out outcome');assert.equal(b.state.gameState!.winner,b.state.gameState!.own.seat);
    restored.send('rematch',{ready:true});b.send('rematch',{ready:true});
    await until(()=>restored.state.gameState!.phase==='playing'&&restored.state.gameState!.epoch===2,'rematch');
    assert.equal(restored.state.gameState!.own.placements,0);assert.equal(restored.state.gameState!.own.board.flat().filter(Boolean).length,0);
    for(const {gameState:s}of messages){
      assert.ok(!('seed'in s));assert.ok(!('rng'in s.own));
      if(s.opponent)for(const key of ['board','piece','queue','incoming','rng','token','reconnectToken','placements'])assert.equal(key in s.opponent,false,'opponent private '+key);
      for(const packet of s.own.incoming)assert.equal('gap'in packet,false);
    }
    assert.ok(messages.length>5,'capture actual outbound state paths');
    restored.room!.reconnection.enabled=false;restored.room!.connection.close();
    await until(()=>b.state.gameState!.phase==='results','recovery budget forfeit',17000);
    assert.equal(b.state.gameState!.winner,b.state.gameState!.own.seat);
    if(!process.env.SERVER_URL){
      clients.forEach(c=>c.disconnect());await delay(150);server!.kill();await delay(800);
      server=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,PORT:'2694'},stdio:'ignore',windowsHide:true});await delay(1600);
      const lost=await join({code});assert.equal(lost.state.status,'error','process loss expires room');
    }
  }finally{clients.forEach(c=>c.disconnect());await delay(100);server?.kill();}
});
