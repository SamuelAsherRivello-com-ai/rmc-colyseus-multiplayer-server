import { Room, type Client } from '@colyseus/core';
// Browser-safe JavaScript is shared by the authoritative server and offline clients.
import { RacingSimulation } from '../packages/client/racing-simulation.js';
export class RacingRoom extends Room {
  override maxClients = 4;
  simulation = new RacingSimulation();
  limits = new Map<string, {time:number; count:number}>();
  override onCreate() {
    this.onMessage('input', (client,data) => {if(this.accept(client))this.simulation.input(client.sessionId,data);});
    this.onMessage('ready', (client,data) => {if(this.accept(client))this.simulation.ready(client.sessionId,data);});
    this.onMessage('start', client => {if(this.accept(client))this.simulation.start(client.sessionId);});
    this.onMessage('snapshot', client => {if(this.accept(client))client.send('snapshot',{players:this.players(),capacity:4,gameState:this.simulation.snapshot()});});
    this.setSimulationInterval(()=>this.simulation.step(1/30),1000/30);
    this.clock.setInterval(()=>this.broadcast('gameState',this.simulation.snapshot()),50);
  }
  accept(client:Client){const now=Date.now();let l=this.limits.get(client.sessionId);if(!l||now-l.time>=1000){l={time:now,count:0};this.limits.set(client.sessionId,l);}return ++l.count<=60;}
  players(){return [...this.simulation.people.values()];}
  override onJoin(client:Client){this.simulation.add(client.sessionId);this.broadcast('presence',{players:this.players(),capacity:4});}
  override onLeave(client:Client){this.simulation.remove(client.sessionId);this.limits.delete(client.sessionId);this.broadcast('departed',client.sessionId);this.broadcast('presence',{players:this.players(),capacity:4});}
}
