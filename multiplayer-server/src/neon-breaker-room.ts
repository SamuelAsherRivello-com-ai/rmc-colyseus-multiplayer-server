import { Room, type Client } from '@colyseus/core';
import { NeonBreakerSimulation } from './neon-breaker-simulation.js';
export class NeonBreakerRoom extends Room {
  override maxClients=2;
  simulation=new NeonBreakerSimulation();
  limits=new Map<string,{time:number;count:number}>();
  seats=new Map<string,number>();
  snapshot(){return {...this.simulation.snapshot(),serverTime:Date.now()};}
  override onCreate(){
    this.onMessage('input',(client,data)=>{if(this.accept(client)){const seat=this.seats.get(client.sessionId);if(seat!==undefined)this.simulation.input(seat,data);}});
    this.onMessage('launch',client=>{if(this.accept(client)){const seat=this.seats.get(client.sessionId);if(seat!==undefined)this.simulation.launch(seat);}});
    this.onMessage('restart',client=>{if(this.accept(client)&&this.simulation.snapshot().outcome!=='playing')this.simulation.restart();});
    this.onMessage('snapshot',client=>{if(this.accept(client))client.send('snapshot',{players:this.players(),capacity:2,gameState:this.snapshot()});});
    this.setSimulationInterval(()=>this.simulation.step(1/30),1000/30);
    this.clock.setInterval(()=>this.broadcast('gameState',this.snapshot()),50);
  }
  accept(client:Client){const now=Date.now();let l=this.limits.get(client.sessionId);if(!l||now-l.time>=1000){l={time:now,count:0};this.limits.set(client.sessionId,l);}return ++l.count<=60;}
  players(){return [...this.seats].map(([id,seat])=>({id,number:seat+1,name:`Player ${seat+1}`,seat}));}
  override onJoin(client:Client){const taken=new Set(this.seats.values());const seat=taken.has(0)?1:0;this.seats.set(client.sessionId,seat);this.simulation.join(seat);this.broadcast('presence',{players:this.players(),capacity:2});client.send('snapshot',{players:this.players(),capacity:2,gameState:this.snapshot()});}
  override onLeave(client:Client){const seat=this.seats.get(client.sessionId);if(seat!==undefined)this.simulation.leave(seat);this.seats.delete(client.sessionId);this.limits.delete(client.sessionId);this.broadcast('departed',client.sessionId);this.broadcast('presence',{players:this.players(),capacity:2});}
}

