// Fallback palette is a nonempty fixed constant.
import { Room, type Client } from "@colyseus/core";
import { randomUUID } from "node:crypto";
import { ParticipantHostRelay, type TransferableState } from "./participant-host-relay.js";

type Cursor = [number, number] | null;
type Player = { id: string; number: number; name: string; color: string; cursor: Cursor; host: boolean };
type Action = { type: "cue" | "plant" | "water" | "speed"; payload: unknown; sequence: number; sender: string; timestamp: number };
const colors = ["#ed866e", "#68a8db", "#b99cdb", "#e6ba59", "#6cc5ae", "#de87b0", "#a1b754", "#768bd2", "#da9c61", "#6dbfcd", "#ca737a", "#93aa84"];
const first = ["Clover", "Maple", "Juniper", "Robin", "Sage", "Poppy", "Wren", "Fern", "Moss", "Lark", "Iris", "Rowan"];
const second = ["Field", "Willow", "Hollow", "Meadow", "Brook", "Thicket", "Vale", "Grove", "Hill", "Dawn", "Burrow", "Moor"];

export class JustLikeRabbitsRoom extends Room {
  override maxClients = 12;
  private readonly players = new Map<string, Player>();
  private readonly relay = new ParticipantHostRelay();
  private readonly limits = new Map<string, { start: number; count: number }>();
  private actionSequence = 0;

  override onCreate() {
    this.onMessage("snapshot", client => this.sendSnapshot(client));
    this.onMessage("heartbeat", client => { if (this.accept(client)) this.syncHost(); });
    this.onMessage("cursor", (client, cursor) => {
      if (!this.accept(client) || !validCursor(cursor)) return;
      const player = this.players.get(client.sessionId); if (!player) return;
      player.cursor = cursor; this.broadcast("cursor", { id: player.id, cursor });
    });
    this.onMessage("action", (client, value) => {
      if (!this.accept(client) || !validAction(value)) return;
      const action: Action = { ...value, payload: structuredClone(value.payload), sequence: ++this.actionSequence, sender: client.sessionId, timestamp: Date.now() };
      const host = this.relay.host;
      if (!host) return;
      this.broadcast("habitatAction", action);
    });
    this.onMessage("hostSnapshot", (client, value) => {
      if (!this.accept(client) || !validTransfer(value)) return;
      const transfer = this.relay.publish(client.sessionId, value);
      if (transfer) this.broadcast("gameState", { hostId: this.relay.host, transfer });
    });
    this.setSimulationInterval(() => this.syncHost(), 1000);
  }

  override onJoin(client: Client) {
    const occupied = new Set([...this.players.values()].map(player => player.number));
    let number = 1; while (occupied.has(number)) number++;
    const seed = parseInt(randomUUID().slice(0, 8), 16);
    const used = new Set([...this.players.values()].map(player => player.color));
    const color = colors.find(entry => !used.has(entry)) ?? colors[0]!;
    this.players.set(client.sessionId, { id: client.sessionId, number, name: `${first[seed % first.length]} ${second[(seed >>> 5) % second.length]}`, color, cursor: null, host: false });
    const election = this.relay.join(client.sessionId);
    this.syncHost();
    if (election.changed) this.broadcast("hostTransfer", { hostId: election.hostId, transfer: election.transfer });
    this.sendSnapshot(client);
  }

  override onLeave(client: Client) {
    this.players.delete(client.sessionId); this.limits.delete(client.sessionId);
    const election = this.relay.leave(client.sessionId);
    this.broadcast("departed", client.sessionId);
    this.syncHost();
    if (election.changed) this.broadcast("hostTransfer", { hostId: election.hostId, transfer: election.transfer });
  }

  private sendSnapshot(client: Client) {
    if (!this.accept(client)) return;
    client.send("snapshot", { players: this.list(), capacity: this.maxClients, gameState: { hostId: this.relay.host, transfer: this.relay.transfer } });
  }

  private syncHost() {
    const election = this.relay.expire();
    for (const player of this.players.values()) player.host = player.id === this.relay.host;
    this.broadcast("presence", { players: this.list(), capacity: this.maxClients, hostId: this.relay.host });
    if (election.changed) this.broadcast("hostTransfer", { hostId: election.hostId, transfer: election.transfer });
  }

  private list() { return [...this.players.values()].map(player => ({ ...player })); }

  private accept(client: Client) {
    const now = Date.now(); let limit = this.limits.get(client.sessionId);
    if (!limit || now - limit.start > 1000) { limit = { start: now, count: 0 }; this.limits.set(client.sessionId, limit); }
    this.relay.touch(client.sessionId, now);
    return ++limit.count <= 60;
  }
}

function validCursor(value: unknown): value is Cursor { return value === null || (Array.isArray(value) && value.length === 2 && value.every(item => typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 1)); }
function validAction(value: unknown): value is { type: Action["type"]; payload: unknown } {
  if (!value || typeof value !== "object") return false;
  const action = value as { type?: string; payload?: unknown };
  if (action.type === "speed") return [0.5, 1, 2, 4, 10].includes(action.payload as number);
  if (action.type === "cue") return validCursor(action.payload);
  if ((action.type === "plant" || action.type === "water") && action.payload && typeof action.payload === "object") {
    const tile = action.payload as { x?: unknown; z?: unknown };
    return Number.isInteger(tile.x) && Number.isInteger(tile.z) && (tile.x as number) >= 0 && (tile.x as number) < 64 && (tile.z as number) >= 0 && (tile.z as number) < 64;
  }
  return false;
}
function validTransfer(value: unknown): value is Omit<TransferableState, "sequence" | "timestamp"> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (!("state" in candidate && "random" in candidate && "clock" in candidate)) return false;
  try { return JSON.stringify(value).length <= 48_000; } catch { return false; }
}
