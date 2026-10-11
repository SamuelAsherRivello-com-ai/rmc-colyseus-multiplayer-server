import { CloseCode, type Client } from "@colyseus/core";
import { PrivateCodeRoom } from "./private-code-room.js";
// The same browser-safe deterministic rules are exported by the shared client package.
import { StreetFighterSimulation } from "../packages/client/street-fighter-simulation.js";

export class StreetFighterRoom extends PrivateCodeRoom {
  override maxClients = 2;
  simulation = new StreetFighterSimulation();
  limits = new Map<string, { time: number; count: number }>();
  disconnectedTokens = new Map<string, string>();

  override onCreate(options: { code: string }) {
    this.simulation.setStageFromCode(options.code);
    this.setMetadata({ code: options.code });
    this.onMessage("snapshot", (client) => { if (this.accept(client)) client.send("snapshot", { players: this.players(), capacity: 2, gameState: this.simulation.snapshot() }); });
    this.onMessage("select", (client, data) => { if (this.accept(client)) this.simulation.select(client.sessionId, data?.fighter); });
    this.onMessage("ready", (client, data) => { if (this.accept(client)) this.simulation.ready(client.sessionId, data?.ready); });
    this.onMessage("input", (client, data) => { if (this.accept(client)) this.simulation.input(client.sessionId, data); });
    this.onMessage("rematch", (client, data) => { if (this.accept(client)) this.simulation.ready(client.sessionId, data?.ready); });
    this.setSimulationInterval(() => this.simulation.step(1 / 60), 1000 / 60);
    this.clock.setInterval(() => this.broadcast("gameState", this.simulation.snapshot()), 50);
  }

  accept(client: Client) {
    const now = Date.now(); let limit = this.limits.get(client.sessionId);
    if (!limit || now - limit.time >= 1000) { limit = { time: now, count: 0 }; this.limits.set(client.sessionId, limit); }
    return ++limit.count <= 60;
  }

  players() { return this.simulation.seats.map((seat: { sessionId: string | null; number: number; fighter: string; connected: boolean }) => ({ id: seat.sessionId, number: seat.number, fighter: seat.fighter, connected: seat.connected })); }
  activeTokens() { return this.simulation.seats.map((seat: { token: string }) => seat.token); }

  override onJoin(client: Client, options: { reconnectToken?: string; roomCodeRejoinSessionId?: string }) {
    this.privateCodeRoomJoined();
    const token = options?.reconnectToken;
    const replaced = this.consumeRoomCodeRejoin(options?.roomCodeRejoinSessionId);
    const seat = (replaced ? this.simulation.replaceDisconnected(replaced, client.sessionId, token) : null)
      ?? this.simulation.reconnect(client.sessionId, token)
      ?? this.simulation.add(client.sessionId, token);
    if (replaced) this.disconnectedTokens.delete(replaced);
    if (!seat) { client.send("notice", "Room is full or reconnect token expired"); void client.leave(4003); return; }
    client.send("identity", { seat: seat.number });
    this.broadcast("presence", { players: this.players(), capacity: 2, gameState: this.simulation.snapshot() });
  }

  override onReconnect(client: Client) {
    this.privateCodeRoomJoined();
    this.clearRoomCodeRecovery(client.sessionId);
    this.disconnectedTokens.delete(client.sessionId);
    client.send("snapshot", { players: this.players(), capacity: 2, gameState: this.simulation.snapshot() });
  }

  override async onDrop(client: Client) {
    const token = this.simulation.sessionSeats.get(client.sessionId)?.token;
    if (token) this.disconnectedTokens.set(client.sessionId, token);
    this.simulation.disconnect(client.sessionId);
    this.broadcast("presence", { players: this.players(), capacity: 2, gameState: this.simulation.snapshot() });
    await this.waitForCodeRecovery(client, () => { if (this.clients.length === 0) this.removePlayer(client.sessionId); });
  }

  override onLeave(client: Client, code?: number) {
    if (this.privateCodeRoomLeft(client)) return;
    if (this.isRoomCodeRejoinPending(client.sessionId) || this.hasRoomCodeRecovery(client.sessionId)) return;
    if (code === CloseCode.CONSENTED) { this.removePlayer(client.sessionId); return; }
    this.simulation.disconnect(client.sessionId);
    this.reserveDisconnectedCodeSeat(client.sessionId, () => this.removePlayer(client.sessionId));
    this.broadcast("presence", { players: this.players(), capacity: 2, gameState: this.simulation.snapshot() });
  }

  private removePlayer(sessionId: string) {
    if (this.simulation.sessionSeats.has(sessionId)) this.simulation.leave(sessionId);
    this.disconnectedTokens.delete(sessionId);
    this.limits.delete(sessionId);
    this.broadcast("departed", sessionId);
    this.broadcast("presence", { players: this.players(), capacity: 2, gameState: this.simulation.snapshot() });
  }

  protected onRoomCodeRejoinCancelled(sessionId: string) { this.removePlayer(sessionId); }
}
