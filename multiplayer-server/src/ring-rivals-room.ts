import { CloseCode, type Client } from '@colyseus/core';
import { PrivateCodeRoom } from './private-code-room.js';
import { RingRivalsSimulation } from './ring-rivals-simulation.js';

export class RingRivalsRoom extends PrivateCodeRoom {
  override maxClients = 2;
  simulation = new RingRivalsSimulation();
  seats = new Map<string, number>();
  limits = new Map<string, { time: number; count: number }>();

  override onCreate(options: { code: string }) {
    this.setMetadata({ code: options.code });
    this.onMessage('input', (client, data) => {
      if (this.accept(client)) this.simulation.input(this.seats.get(client.sessionId), data);
    });
    this.onMessage('select', (client, data) => {
      if (this.accept(client)) this.simulation.select(this.seats.get(client.sessionId), data?.boxer);
      this.broadcastState();
    });
    this.onMessage('ready', client => {
      if (this.accept(client)) this.simulation.ready(this.seats.get(client.sessionId));
      this.broadcastState();
    });
    this.onMessage('rematch', client => {
      if (this.accept(client)) this.simulation.rematch(this.seats.get(client.sessionId));
      this.broadcastState();
    });
    this.onMessage('snapshot', client => {
      if (this.accept(client)) this.sendSnapshot(client);
    });
    this.setSimulationInterval(() => {
      this.simulation.step(1 / 30);
    }, 1000 / 30);
    this.clock.setInterval(() => this.broadcastState(), 50);
  }

  accept(client: Client) {
    const now = Date.now();
    let limit = this.limits.get(client.sessionId);
    if (!limit || now - limit.time >= 1000) {
      limit = { time: now, count: 0 };
      this.limits.set(client.sessionId, limit);
    }
    return ++limit.count <= 60;
  }

  players() {
    return [...this.seats].map(([id, seat]) => ({ id, number: seat + 1, name: `Player ${seat + 1}`, seat }));
  }

  sendSnapshot(client: Client) {
    client.send('snapshot', { players: this.players(), capacity: 2, code: this.metadata?.code, gameState: this.simulation.snapshot() });
  }

  broadcastState() {
    this.broadcast('gameState', this.simulation.snapshot());
    this.broadcast('presence', { players: this.players(), capacity: 2, code: this.metadata?.code });
  }

  override onJoin(client: Client, options: { roomCodeRejoinSessionId?: string }) {
    this.privateCodeRoomJoined();
    const replaced = this.consumeRoomCodeRejoin(options?.roomCodeRejoinSessionId);
    const previousSeat = replaced ? this.seats.get(replaced) : undefined;
    if (replaced && previousSeat !== undefined) {
      this.seats.delete(replaced);
      this.seats.set(client.sessionId, previousSeat);
      this.simulation.connected(previousSeat, true);
      this.broadcastState();
      this.sendSnapshot(client);
      return;
    }
    const occupied = new Set(this.seats.values());
    const seat = occupied.has(0) ? 1 : 0;
    this.seats.set(client.sessionId, seat);
    this.simulation.join(seat);
    this.broadcastState();
    this.sendSnapshot(client);
  }

  override async onDrop(client: Client) {
    const seat = this.seats.get(client.sessionId);
    if (seat === undefined) return;
    this.simulation.connected(seat, false);
    this.broadcastState();
    await this.waitForCodeRecovery(client, () => {
      if (this.clients.length === 0) this.removePlayer(client.sessionId);
      else { this.simulation.forfeit(seat); this.removePlayer(client.sessionId); }
    });
  }

  override onReconnect(client: Client) {
    this.privateCodeRoomJoined();
    this.clearRoomCodeRecovery(client.sessionId);
    const seat = this.seats.get(client.sessionId);
    if (seat !== undefined) this.simulation.connected(seat, true);
    this.sendSnapshot(client);
    this.broadcastState();
  }

  override onLeave(client: Client, code?: number) {
    if (this.privateCodeRoomLeft(client)) return;
    if (this.isRoomCodeRejoinPending(client.sessionId) || this.hasRoomCodeRecovery(client.sessionId)) return;
    if (code === CloseCode.CONSENTED) { this.removePlayer(client.sessionId); return; }
    const seat = this.seats.get(client.sessionId);
    if (seat !== undefined) this.simulation.connected(seat, false);
    this.reserveDisconnectedCodeSeat(client.sessionId, () => this.removePlayer(client.sessionId));
    this.broadcastState();
  }

  private removePlayer(sessionId: string) {
    const seat = this.seats.get(sessionId);
    if (seat !== undefined) this.simulation.leave(seat);
    this.seats.delete(sessionId);
    this.limits.delete(sessionId);
    this.broadcast('departed', sessionId);
    this.broadcastState();
  }

  protected onRoomCodeRejoinCancelled(sessionId: string) { this.removePlayer(sessionId); }
}
