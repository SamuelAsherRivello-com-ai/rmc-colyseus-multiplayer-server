import { Room, ServerError, type Client } from "@colyseus/core";
import { randomUUID } from "node:crypto";
import { ParticipantHostRelay } from "./participant-host-relay.js";

type Seat = { id: string; number: number; sessionId: string | null; token: string; reservedUntil: number };
type Action = { sequence: number; sender: string; type: string; payload: unknown; timestamp: number };
const bounded = (value: unknown, bytes: number) => {
  try { return Buffer.byteLength(JSON.stringify(value), "utf8") <= bytes; } catch { return false; }
};
const finiteTree = (value: unknown): boolean => typeof value === "number" ? Number.isFinite(value)
  : Array.isArray(value) ? value.every(finiteTree)
  : value !== null && typeof value === "object" ? Object.values(value).every(finiteTree) : true;

/** Routes opaque host state. No collision, movement, life or wave simulation runs here. */
export class SpaceInvadersRoom extends Room {
  override maxClients = 4;
  private seats: Seat[] = [];
  private relay = new ParticipantHostRelay();
  private epoch = 0;
  private ready = false;
  private journal: Action[] = [];
  private sequence = 0;
  private ack = 0;
  private runId: string = randomUUID();
  private limits = new Map<string, { at: number; count: number; inputSeq: number }>();
  private emptyTimer?: ReturnType<typeof setTimeout>;
  private heartbeats = new Map<string, number>();

  override onCreate(options: { code: string }) {
    this.autoDispose = false;
    this.setMetadata({ code: options.code });
    this.onMessage("snapshot", client => this.snapshot(client));
    this.onMessage("heartbeat", client => {
      if (!this.accept(client)) return;
      const previous = this.relay.host;
      if (!this.heartbeats.has(client.sessionId)) this.relay.join(client.sessionId);
      this.heartbeats.set(client.sessionId, Date.now());
      this.changed(previous);
    });
    this.onMessage("hostReady", (client, message) => {
      if (!this.accept(client) || client.sessionId !== this.relay.host || message?.epoch !== this.epoch) return;
      this.ready = true;
      this.broadcast("presence", this.sessionPresence());
    });
    this.onMessage("action", (client, value) => {
      if (!this.accept(client) || !this.ready || !value || !bounded(value, 256)) return;
      if (value.epoch !== this.epoch || value.runId !== this.runId) return;
      const limit = this.limits.get(client.sessionId)!;
      if (!Number.isSafeInteger(value.sequence) || value.sequence <= limit.inputSeq) return;
      if (value.type !== "input" && value.type !== "start") return;
      if (value.type === "start" && client.sessionId !== this.relay.host) return;
      const p = value.payload;
      if (value.type === "input" && (!p || ![-1, 0, 1].includes(p.move) || typeof p.fire !== "boolean")) return;
      limit.inputSeq = value.sequence;
      const seat = this.seats.find(s => s.sessionId === client.sessionId)!;
      this.action(seat.id, value.type, { ...p, inputSequence: value.sequence });
    });
    this.onMessage("hostSnapshot", (client, value) => {
      if (!this.accept(client) || !this.ready || client.sessionId !== this.relay.host) return;
      if (!value || value.epoch !== this.epoch || value.protocolVersion !== 1 || value.runId !== this.runId || !bounded(value, 12_288) || !finiteTree(value)) return;
      if (!Number.isSafeInteger(value.lastAppliedRelaySeq) || value.lastAppliedRelaySeq < this.ack || value.lastAppliedRelaySeq > this.sequence) return;
      if (!Number.isSafeInteger(value.tick) || value.tick < 0 || !value.state || typeof value.state !== "object") return;
      this.ack = value.lastAppliedRelaySeq;
      this.journal = this.journal.filter(a => a.sequence > this.ack);
      const transfer = this.relay.publish(client.sessionId, { state: value, random: value.random, clock: value.tick });
      this.broadcast("gameState", { ...this.sessionPresence(), transfer });
    });
    this.setSimulationInterval(() => {
      const previous = this.relay.host;
      for (const [id, at] of this.heartbeats) if (Date.now() - at > 3000) {
        this.heartbeats.delete(id);
        this.relay.leave(id);
      }
      this.changed(previous);
    }, 250);
  }

  /** Invoked only by serialized HTTP admission. Recovery is bound to a private token. */
  async admit(token?: string) {
    const slot = (exclude?: Seat) => [1,2,3,4].find(n => !this.seats.some(s => s !== exclude && s.number === n && (s.sessionId || s.reservedUntil > Date.now())));
    if (token) {
      const seat = this.seats.find(s => s.token === token);
      if (!seat) throw new ServerError(403, "Recovery token is invalid or expired");
      if (seat.sessionId) {
        const old = this.clients.find(c => c.sessionId === seat.sessionId);
        if (old) old.leave(4001, "Reconnected in another tab");
        // Complete the lifecycle synchronously before reserving a replacement.
        this.detach(seat.sessionId);
      }
      const number = slot(seat);
      if (!number) throw new ServerError(409, "Room full");
      seat.number = number;
      seat.reservedUntil = Date.now() + 15_000;
      await this.unlock();
      return token;
    }
    const number = slot();
    if (!number) throw new ServerError(409, "Room full");
    const newToken = randomUUID();
    this.seats.push({ id: randomUUID(), number, sessionId: null, token: newToken, reservedUntil: Date.now() + 15_000 });
    await this.unlock();
    return newToken;
  }

  override onJoin(client: Client, options: { reconnectToken?: string }) {
    clearTimeout(this.emptyTimer);
    const seat = this.seats.find(s => s.token === options.reconnectToken && !s.sessionId);
    if (!seat) throw new ServerError(403, "Private seat reservation required");
    seat.sessionId = client.sessionId;
    const previous = this.relay.host;
    this.relay.join(client.sessionId);
    this.heartbeats.set(client.sessionId, Date.now());
    this.action(seat.id, "membership", { connected: true, number: seat.number });
    this.changed(previous);
    client.send("identity", { seat: seat.id, number: seat.number });
    this.broadcast("presence", this.sessionPresence());
    this.snapshot(client);
  }

  override onLeave(client: Client, code?: number) {
    this.detach(client.sessionId, code === 4000 ? 0 : 15_000);
    if (!this.clients.length) this.emptyTimer = setTimeout(() => void this.disconnect(), 15_000);
  }
  override onDispose() { clearTimeout(this.emptyTimer); }

  private detach(sessionId: string, grace = 0) {
    const seat = this.seats.find(s => s.sessionId === sessionId);
    if (!seat) return;
    seat.sessionId = null;
    seat.reservedUntil = Date.now() + grace;
    const previous = this.relay.host;
    this.relay.leave(sessionId);
    this.limits.delete(sessionId);
    this.heartbeats.delete(sessionId);
    this.action(seat.id, "membership", { connected: false, number: seat.number });
    this.changed(previous);
    this.broadcast("presence", this.sessionPresence());
  }

  private action(sender: string, type: string, payload: unknown) {
    if (this.journal.length >= 256) {
      this.ready = false;
      this.broadcast("recoveryError", { message: "Host checkpoint stalled. Rejoin or create a new room." });
      return;
    }
    const action = { sequence: ++this.sequence, sender, type, payload, timestamp: Date.now() };
    this.journal.push(action);
    this.broadcast("gameAction", action);
  }
  private changed(previous: string | null) {
    if (previous === this.relay.host) return;
    this.epoch++;
    this.ready = false;
    this.broadcast("hostTransfer", { ...this.sessionPresence(), transfer: this.relay.transfer, journal: this.journal });
  }
  private sessionPresence() {
    return { hostId: this.relay.host, epoch: this.epoch, ready: this.ready, runId: this.runId, capacity: 4,
      players: this.seats.filter(s => s.sessionId || s.reservedUntil > Date.now()).map(({ token: _token, reservedUntil: _reserved, ...seat }) => ({ ...seat, connected: seat.sessionId !== null })) };
  }
  private snapshot(client: Client) {
    if (!this.accept(client)) return;
    client.send("snapshot", { ...this.sessionPresence(), seat: this.seats.find(s => s.sessionId === client.sessionId)?.id,
      gameState: { ...this.sessionPresence(), transfer: this.relay.transfer, journal: this.journal } });
  }
  private accept(client: Client) {
    if (!this.seats.some(s => s.sessionId === client.sessionId)) return false;
    const now = Date.now();
    let limit = this.limits.get(client.sessionId);
    if (!limit) { limit = { at: now, count: 0, inputSeq: -1 }; this.limits.set(client.sessionId, limit); }
    if (now - limit.at >= 1000) { limit.at = now; limit.count = 0; }
    return ++limit.count <= 60;
  }
}

