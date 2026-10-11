import { CloseCode, type Client } from '@colyseus/core';
import { PrivateCodeRoom } from './private-code-room.js';
import { BombermanSimulation } from './bomberman-simulation.js';
export class BombermanRoom extends PrivateCodeRoom {
  override maxClients=4;
  simulation=new BombermanSimulation();
  limits=new Map<string,{time:number;count:number}>();
  override onCreate(options:{code:string}){
    this.simulation.code=options.code;this.setMetadata({code:options.code});
    this.onMessage('input',(client,data)=>{if(this.accept(client))this.simulation.input(client.sessionId,data);});
    this.onMessage('ready',client=>{if(this.accept(client))this.simulation.ready(client.sessionId);});
    this.onMessage('rematch',client=>{if(this.accept(client))this.simulation.rematch(client.sessionId);});
    this.onMessage('options',(client,data)=>{if(this.accept(client))this.simulation.configure(client.sessionId,data);});
    this.onMessage('color',(client,data)=>{if(this.accept(client))this.simulation.color(client.sessionId,data);});
    this.onMessage('snapshot',client=>{if(this.accept(client))this.snapshot(client);});
    // Timers can arrive unevenly. Advance fixed simulation ticks from elapsed
    // monotonic time so movement and fuses do not slow with timer jitter.
    let last=performance.now(),accumulator=0;
    this.setSimulationInterval(()=>{
      const now=performance.now();accumulator+=Math.min((now-last)/1000,.25);last=now;
      while(accumulator>=1/60){this.simulation.step();accumulator-=1/60;}
    },1000/60);
    this.clock.setInterval(()=>this.broadcast('gameState',this.simulation.snapshot()),50);
  }
  accept(client:Client){const now=Date.now();let limit=this.limits.get(client.sessionId);if(!limit||now-limit.time>=1000){limit={time:now,count:0};this.limits.set(client.sessionId,limit);}return ++limit.count<=60;}
  playerList(){return [...this.simulation.players.values()];}
  snapshot(client:Client){client.send('snapshot',{players:this.playerList(),capacity:4,strokes:[],gameState:this.simulation.snapshot()});}
  override onJoin(client:Client, options:{roomCodeRejoinSessionId?:string}){
    this.privateCodeRoomJoined();
    const replaced = this.consumeRoomCodeRejoin(options?.roomCodeRejoinSessionId);
    if (!replaced || !this.simulation.replaceDisconnectedId(replaced, client.sessionId)) this.simulation.add(client.sessionId);
    this.broadcast('presence',{players:this.playerList(),capacity:4});
  }
  override async onDrop(client:Client){
    this.simulation.connected(client.sessionId,false);
    this.broadcast('presence',{players:this.playerList(),capacity:4});
    await this.waitForCodeRecovery(client,()=>{if(this.clients.length===0)this.removePlayer(client.sessionId);});
  }
  override onReconnect(client:Client){this.privateCodeRoomJoined();this.clearRoomCodeRecovery(client.sessionId);this.simulation.connected(client.sessionId,true);this.snapshot(client);}
  override onLeave(client:Client,code?:number){if(this.privateCodeRoomLeft(client)||this.isRoomCodeRejoinPending(client.sessionId)||this.hasRoomCodeRecovery(client.sessionId))return;if(code===CloseCode.CONSENTED){this.removePlayer(client.sessionId);return;}this.simulation.connected(client.sessionId,false);this.reserveDisconnectedCodeSeat(client.sessionId,()=>this.removePlayer(client.sessionId));this.broadcast('presence',{players:this.playerList(),capacity:4});}
  private removePlayer(sessionId:string){this.simulation.remove(sessionId);this.limits.delete(sessionId);this.broadcast('presence',{players:this.playerList(),capacity:4});}
  protected onRoomCodeRejoinCancelled(sessionId:string){this.removePlayer(sessionId);}
}
