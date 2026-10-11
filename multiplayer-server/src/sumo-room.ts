import { Room, type Client } from '@colyseus/core';
import { SumoSimulation } from './sumo-simulation.js';
export class SumoRoom extends Room {
  override maxClients = 12;
  simulation = new SumoSimulation();
  limits = new Map<string, { time: number; count: number }>();
  override onCreate() {
    this.onMessage('input', (client, data) => { if (this.accept(client)) this.simulation.input(client.sessionId, data); });
    this.onMessage('snapshot', client => { if (this.accept(client)) client.send('snapshot', { players: this.playerList(), capacity: 12, strokes: [], gameState: this.simulation.snapshot() }); });
    this.setSimulationInterval(() => this.simulation.step(1 / 30), 1000 / 30);
    this.clock.setInterval(() => this.broadcast('gameState', this.simulation.snapshot()), 50);
  }
  accept(client: Client) {
    const now = Date.now(); let limit = this.limits.get(client.sessionId);
    if (!limit || now - limit.time >= 1000) { limit = { time: now, count: 0 }; this.limits.set(client.sessionId, limit); }
    return ++limit.count <= 60;
  }
  playerList() { return [...this.simulation.players.values()].filter(p => !p.bot).map(({ id, number, name, color }) => ({ id, number, name, color })); }
  updateBot() {
    this.simulation.remove('dojo-bot');
    if (this.playerList().length === 1) this.simulation.add('dojo-bot', true);
    this.broadcast('presence', { players: this.playerList(), capacity: 12 });
  }
  override onJoin(client: Client) { this.simulation.remove('dojo-bot'); this.simulation.add(client.sessionId); this.updateBot(); }
  override onLeave(client: Client) { this.simulation.remove(client.sessionId); this.limits.delete(client.sessionId); this.broadcast('departed', client.sessionId); this.updateBot(); }
}

