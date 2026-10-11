import { Room, type Client } from '@colyseus/core';
import { Gauntlet2DSimulation } from './gauntlet2d-simulation.js';
export class Gauntlet2DRoom extends Room {
  override maxClients=4;
  simulation=new Gauntlet2DSimulation();
  limits=new Map<string,{time:number;count:number}>();
  override onCreate(){
    this.onMessage('input',(c,d)=>{if(this.accept(c))this.simulation.input(c.sessionId,d);});
    this.onMessage('select',(c,d)=>{if(this.accept(c))this.simulation.select(c.sessionId,d);});
    this.onMessage('snapshot',c=>{if(this.accept(c))c.send('snapshot',{players:this.playerList(),capacity:4,strokes:[],gameState:this.simulation.snapshot()});});
    this.setSimulationInterval(()=>this.simulation.step(1/30),1000/30);
    this.clock.setInterval(()=>this.broadcast('gameState',this.simulation.snapshot()),50);
  }
  accept(c:Client){const now=Date.now();let l=this.limits.get(c.sessionId);if(!l||now-l.time>=1000){l={time:now,count:0};this.limits.set(c.sessionId,l);}return ++l.count<=60;}
  playerList(){return [...this.simulation.players.values()].map(({id,number,name,color})=>({id,number,name,color}));}
  override onJoin(c:Client){this.simulation.add(c.sessionId);this.broadcast('presence',{players:this.playerList(),capacity:4});}
  override onLeave(c:Client){this.simulation.remove(c.sessionId);this.limits.delete(c.sessionId);this.broadcast('departed',c.sessionId);this.broadcast('presence',{players:this.playerList(),capacity:4});}
}

