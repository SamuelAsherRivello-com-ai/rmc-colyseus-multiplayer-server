import { Room, type Client } from '@colyseus/core';
import { GauntletSimulation } from './gauntlet-simulation.js';
export class GauntletRoom extends Room {
  override maxClients=4;
  simulation=new GauntletSimulation();
  limits=new Map<string,{time:number;count:number}>();
  override onCreate(){
    this.onMessage('input',(c,data)=>{if(this.accept(c))this.simulation.input(c.sessionId,data);});
    this.onMessage('class',(c,data)=>{if(this.accept(c))this.simulation.choose(c.sessionId,data);});
    this.onMessage('restart',c=>{if(this.accept(c))this.simulation.restart(c.sessionId);});
    this.onMessage('snapshot',c=>{if(this.accept(c))c.send('snapshot',{players:this.playerList(),capacity:4,strokes:[],gameState:this.simulation.snapshot()});});
    this.setSimulationInterval(()=>this.simulation.step(1/30),1000/30);
    this.clock.setInterval(()=>this.broadcast('gameState',this.simulation.snapshot()),50);
  }
  accept(c:Client){const now=Date.now();let l=this.limits.get(c.sessionId);if(!l||now-l.time>=1000){l={time:now,count:0};this.limits.set(c.sessionId,l);}return ++l.count<=60;}
  playerList(){return [...this.simulation.players.values()].map(({id,number,name,color})=>({id,number,name,color}));}
  broadcastPresence(){this.broadcast('presence',{players:this.playerList(),capacity:4});}
  override onJoin(c:Client){this.simulation.add(c.sessionId);this.broadcastPresence();}
  override onLeave(c:Client){this.simulation.remove(c.sessionId);this.limits.delete(c.sessionId);this.broadcast('departed',c.sessionId);this.broadcastPresence();}
}

