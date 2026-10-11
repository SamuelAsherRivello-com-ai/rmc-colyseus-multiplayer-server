import { CloseCode, type Client } from '@colyseus/core';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { PrivateCodeRoom } from './private-code-room.js';
import { TetrisDuel } from '../packages/client/tetris-duel-rules.js';

export class TetrisDuelRoom extends PrivateCodeRoom {
  override maxClients = 2;
  simulation = new TetrisDuel(parseInt(randomUUID().slice(0,8),16));
  private tokens = new Map<string,string>();
  private recoveryStarts = new Map<string,number>();
  private replacementTimers = new Map<string,ReturnType<typeof setTimeout>>();
  private limits = new Map<string,{time:number;count:number}>();
  private lastTick = performance.now();

  override onCreate(options: {code:string}) {
    this.setMetadata({code:options.code});
    this.onMessage('snapshot', client=>{if(this.accept(client))this.sendSnapshot(client);});
    for(const type of ['ready','rematch']) this.onMessage(type,(client,data)=>{
      this.catchUp();
      if(this.accept(client)&&this.simulation.ready(client.sessionId,data?.ready))this.sendAll();
    });
    this.onMessage('input',(client,data)=>{
      this.catchUp();
      if(this.accept(client)&&this.simulation.command(client.sessionId,data)&&data?.action==='commit')this.sendAll();
    });
    this.setSimulationInterval(()=>this.catchUp(),20);
    this.clock.setInterval(()=>this.sendAll(),50);
  }
  private catchUp() {
    const now=performance.now(),elapsed=now-this.lastTick;this.lastTick=now;
    const revision=this.simulation.revision;this.simulation.advance(elapsed);
    if(revision!==this.simulation.revision)this.sendAll();
  }
  private accept(client:Client) {
    const now=Date.now();let limit=this.limits.get(client.sessionId);
    if(!limit||now-limit.time>=1000){limit={time:now,count:0};this.limits.set(client.sessionId,limit);}
    return ++limit.count<=60;
  }
  private sendSnapshot(client:Client) {
    const gameState=this.simulation.project(client.sessionId);if(!gameState)return;
    client.send('snapshot',{capacity:2,players:[gameState.own,gameState.opponent].filter((p): p is NonNullable<typeof p> => p !== null).map(p=>({id:p.id,number:p.seat,name:p.name,color:p.color,connected:p.connected,ready:p.ready})),gameState});
  }
  private sendAll() {for(const client of this.clients)this.sendSnapshot(client);}
  tokenSeat(token:string) {return this.tokens.get(token);}
  canAdmit() {return this.simulation.phase==='lobby'&&this.simulation.players.some((p:unknown)=>!p);}
  async prepareTokenRecovery(token:string) {
    const id=this.tokens.get(token);if(!id)return undefined;
    // A refresh may race the old socket's close event.
    for(let i=0;i<20;i++){
      const p=this.simulation.player(id);
      if(p&&!p.connected&&p.recoveryUsed<15000){
        const replaced=await this.prepareRoomCodeRejoin(id);
        if(replaced){
          const remaining=15000-p.recoveryUsed-(Date.now()-(this.recoveryStarts.get(id)??Date.now()));
          const timer=setTimeout(()=>void this.cancelRoomCodeRejoin(id),Math.max(1,remaining));
          timer.unref?.();this.replacementTimers.set(id,timer);
        }
        return replaced;
      }
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    return undefined;
  }
  override onJoin(client:Client, options:{reconnectToken?:string;roomCodeRejoinSessionId?:string}) {
    this.privateCodeRoomJoined();
    const replaced=this.consumeRoomCodeRejoin(options.roomCodeRejoinSessionId);
    if(replaced){
      this.finishRecovery(replaced);
      if((this.simulation.player(replaced)?.recoveryUsed ?? 0)>=15000){this.expire(replaced);void client.leave(4003);return;}
      this.simulation.reconnect(replaced,client.sessionId);
      for(const [token,id] of this.tokens)if(id===replaced)this.tokens.delete(token);
    }else if(!this.canAdmit()||!this.simulation.add(client.sessionId)){
      void client.leave(4003);return;
    }
    if(options.reconnectToken)this.tokens.set(options.reconnectToken,client.sessionId);
    client.send('identity',{seat:this.simulation.player(client.sessionId)!.seat});
    this.sendAll();
  }
  override onReconnect(client:Client) {
    this.catchUp();this.finishRecovery(client.sessionId);
    this.privateCodeRoomJoined();this.clearRoomCodeRecovery(client.sessionId);
    this.simulation.reconnect(client.sessionId);this.lastTick=performance.now();this.sendAll();
  }
  private finishRecovery(id:string) {
    clearTimeout(this.replacementTimers.get(id));this.replacementTimers.delete(id);
    const start=this.recoveryStarts.get(id),p=this.simulation.player(id);
    if(start!==undefined&&p)p.recoveryUsed=Math.min(15000,p.recoveryUsed+Date.now()-start);
    this.recoveryStarts.delete(id);
  }
  override async onDrop(client:Client) {
    this.catchUp();const p=this.simulation.player(client.sessionId);if(!p)return;
    this.simulation.disconnect(client.sessionId);this.recoveryStarts.set(client.sessionId,Date.now());this.sendAll();
    const seconds=Math.max(0.001,(15000-p.recoveryUsed)/1000);
    await this.waitForCodeRecovery(client,()=>this.expire(client.sessionId),seconds);
  }
  override onLeave(client:Client,code?:number) {
    if(this.privateCodeRoomLeft(client)||this.isRoomCodeRejoinPending(client.sessionId)||this.hasRoomCodeRecovery(client.sessionId))return;
    if(code===CloseCode.CONSENTED){this.expire(client.sessionId);return;}
    this.expire(client.sessionId);
  }
  private expire(id:string) {
    this.finishRecovery(id);this.simulation.forfeit(id);this.limits.delete(id);
    for(const [token,seat]of this.tokens)if(seat===id)this.tokens.delete(token);
    this.sendAll();
  }
  protected onRoomCodeRejoinCancelled(id:string){this.expire(id);}
}
