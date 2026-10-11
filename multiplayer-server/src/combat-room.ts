import { CloseCode, type Client } from '@colyseus/core';
import { PrivateCodeRoom } from './private-code-room.js';
import { CombatSimulation } from './combat-simulation.js';
/** Combat deliberately does not support anonymous code-based recovery seat replacement. */
export class CombatRoom extends PrivateCodeRoom {
 override maxClients=4;
 simulation=new CombatSimulation();
 private limits=new Map<string,{time:number;count:number}>();
 override onCreate(options:{code:string}){
  this.simulation.code=options.code;this.setMetadata({code:options.code});
  this.onMessage('input',(client,data)=>{if(this.accept(client))this.simulation.input(client.sessionId,data);});
  this.onMessage('ready',client=>{if(this.accept(client))this.simulation.ready(client.sessionId);});
  this.onMessage('rematch',client=>{if(this.accept(client))this.simulation.ready(client.sessionId);});
  this.onMessage('options',(client,data)=>{if(this.accept(client))this.simulation.configure(client.sessionId,data);});
  this.onMessage('snapshot',client=>{if(this.accept(client))this.snapshot(client);});
  let last=performance.now(),accumulator=0;
  this.setSimulationInterval(()=>{const now=performance.now();accumulator+=Math.min((now-last)/1000,.25);last=now;while(accumulator>=1/60){this.simulation.step();accumulator-=1/60;}},1000/60);
  this.clock.setInterval(()=>this.broadcast('gameState',this.simulation.snapshot()),50);
 }
 private accept(client:Client){const now=Date.now();let limit=this.limits.get(client.sessionId);if(!limit||now-limit.time>=1000){limit={time:now,count:0};this.limits.set(client.sessionId,limit);}return ++limit.count<=90;}
 private playerList(){return [...this.simulation.players.values()].map(p=>({id:p.id,slot:p.slot,connected:p.connected,ready:p.ready,waiting:p.waiting}));}
 private sendPresence(){this.broadcast('presence',{players:this.playerList(),capacity:4});}
 private snapshot(client:Client){client.send('snapshot',{players:this.playerList(),capacity:4,strokes:[],gameState:this.simulation.snapshot()});}
 override onJoin(client:Client){this.privateCodeRoomJoined();if(!this.simulation.add(client.sessionId)){void client.leave(CloseCode.WITH_ERROR);return;}this.sendPresence();}
 override async onDrop(client:Client){this.simulation.connected(client.sessionId,false);this.sendPresence();await this.waitForCodeRecovery(client,()=>this.removePlayer(client.sessionId));}
 override onReconnect(client:Client){this.privateCodeRoomJoined();this.clearRoomCodeRecovery(client.sessionId);this.simulation.connected(client.sessionId,true);this.snapshot(client);this.sendPresence();}
 override onLeave(client:Client,code?:number){if(this.privateCodeRoomLeft(client)||this.hasRoomCodeRecovery(client.sessionId))return;if(code===CloseCode.CONSENTED){this.removePlayer(client.sessionId);return;}this.simulation.connected(client.sessionId,false);this.reserveDisconnectedCodeSeat(client.sessionId,()=>this.removePlayer(client.sessionId));this.sendPresence();}
 private removePlayer(id:string){this.simulation.remove(id);this.limits.delete(id);this.sendPresence();}
 protected onRoomCodeRejoinCancelled(id:string){this.removePlayer(id);}
}

