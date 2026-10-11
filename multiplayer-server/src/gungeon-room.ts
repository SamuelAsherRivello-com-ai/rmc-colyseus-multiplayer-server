import { CloseCode, type Client } from '@colyseus/core';
import { PrivateCodeRoom } from './private-code-room.js';
import { GungeonSimulation } from './gungeon-simulation.js';
export class GungeonRoom extends PrivateCodeRoom {
  override maxClients=4;
  simulation=new GungeonSimulation();
  disconnected=new Set<string>();
  limits=new Map<string,{time:number;count:number}>();
  override onCreate(options:{code:string}){
    this.simulation.code=options.code;this.setMetadata({code:options.code});
    this.onMessage('input',(c,d)=>{if(this.accept(c))this.simulation.input(c.sessionId,d);});
    this.onMessage('weapon',(c,d)=>{if(this.accept(c))this.simulation.select(c.sessionId,d);});
    this.onMessage('ready',c=>{if(this.accept(c))this.simulation.ready(c.sessionId);});
    this.onMessage('upgrade',(c,d)=>{if(this.accept(c))this.simulation.upgrade(c.sessionId,d);});
    this.onMessage('restart',c=>{if(this.accept(c))this.simulation.restart(c.sessionId);});
    this.onMessage('snapshot',c=>{if(this.accept(c))c.send('snapshot',{players:this.playerList(),capacity:4,strokes:[],gameState:this.simulation.snapshot()});});
    this.setSimulationInterval(()=>this.simulation.step(1/30),1000/30);
    this.clock.setInterval(()=>this.broadcast('gameState',this.simulation.snapshot()),50);
  }
  accept(c:Client){const now=Date.now();let l=this.limits.get(c.sessionId);if(!l||now-l.time>=1000){l={time:now,count:0};this.limits.set(c.sessionId,l);}return ++l.count<=60;}
  playerList(){return [...this.simulation.players.values()].map(({id,number,name,color})=>({id,number,name,color,connected:!this.disconnected.has(id)}));}
  override onJoin(c:Client, options:{roomCodeRejoinSessionId?:string}){this.privateCodeRoomJoined();const old=this.consumeRoomCodeRejoin(options?.roomCodeRejoinSessionId);if(old){this.disconnected.delete(old);if(!this.simulation.replaceDisconnected(old,c.sessionId))this.simulation.add(c.sessionId);}else this.simulation.add(c.sessionId);this.disconnected.delete(c.sessionId);this.broadcast('presence',{players:this.playerList(),capacity:4});}
  override async onDrop(c:Client){
    this.disconnected.add(c.sessionId);
    this.broadcast('presence',{players:this.playerList(),capacity:4});
    await this.waitForCodeRecovery(c,()=>{if(this.clients.length===0)this.removePlayer(c.sessionId);});
  }
  override onReconnect(c:Client){this.privateCodeRoomJoined();this.clearRoomCodeRecovery(c.sessionId);this.disconnected.delete(c.sessionId);this.broadcast('presence',{players:this.playerList(),capacity:4});}
  override onLeave(c:Client,code?:number){if(this.privateCodeRoomLeft(c)||this.isRoomCodeRejoinPending(c.sessionId)||this.hasRoomCodeRecovery(c.sessionId))return;if(code===CloseCode.CONSENTED){this.removePlayer(c.sessionId);return;}this.disconnected.add(c.sessionId);this.simulation.disconnect(c.sessionId);this.reserveDisconnectedCodeSeat(c.sessionId,()=>this.removePlayer(c.sessionId));this.broadcast('presence',{players:this.playerList(),capacity:4});}
  private removePlayer(sessionId:string){this.disconnected.delete(sessionId);this.simulation.remove(sessionId);this.limits.delete(sessionId);this.broadcast('departed',sessionId);this.broadcast('presence',{players:this.playerList(),capacity:4});}
  protected onRoomCodeRejoinCancelled(sessionId:string){this.removePlayer(sessionId);}
}
