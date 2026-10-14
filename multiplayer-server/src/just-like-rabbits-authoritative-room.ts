import { Room, type Client } from "@colyseus/core";
import { randomUUID } from "node:crypto";
import { advance, initialHabitatState, plant, reconcileBotRabbits, setTimeScale, type HabitatState } from "./just-like-rabbits-simulation.js";

type Cursor = [number, number] | null;
type Player = { id: string; number: number; name: string; color: string; cursor: Cursor };
type WireAction = { type: "plant"; payload: { x: number; z: number } } | { type: "speed"; payload: 0.5 | 1 | 2 | 4 | 10 };
const colors = ["#ed866e", "#68a8db", "#e9c46a", "#9b5de5", "#2a9d8f", "#f28482", "#457b9d", "#8ac926", "#ff99c8", "#ffca3a", "#6a994e", "#a8dadc"];
const first = ["Clover", "Maple", "Juniper", "Rowan", "Sage", "Fern", "Willow", "Iris", "Briar", "Aspen", "Moss", "Pine"];
const second = ["Field", "Willow", "Meadow", "Brook", "Grove", "Vale", "Hollow", "Glade", "Hill", "Dale", "Thicket", "Ridge"];

export class JustLikeRabbitsAuthoritativeRoom extends Room {
  override maxClients = 12;
  private readonly players = new Map<string, Player>();
  private readonly limits = new Map<string, { start: number; count: number }>();
  private readonly habitat = initialHabitatState();

  override onCreate() {
    this.onMessage("snapshot", client => this.sendSnapshot(client));
    this.onMessage("heartbeat", client => { if (this.accept(client)) this.sendSnapshot(client); });
    this.onMessage("cursor", (client, cursor: unknown) => {
      if (!this.accept(client) || !validCursor(cursor)) return;
      const player = this.players.get(client.sessionId); if (!player) return;
      player.cursor = cursor; this.broadcast("cursor", { id: player.id, cursor });
    });
    this.onMessage("action", (client, value: unknown) => {
      if (!this.accept(client) || !validAction(value)) return;
      if (!this.apply(value)) return;
      this.broadcastState();
    });
    this.setSimulationInterval(() => { advance(this.habitat, 0.1); this.broadcastState(); }, 100);
  }

  override onJoin(client: Client) {
    const number = this.players.size + 1;
    const seed = parseInt(randomUUID().slice(0, 8), 16);
    this.players.set(client.sessionId, { id: client.sessionId, number, name: `${first[(number - 1) % first.length]!} ${second[seed % second.length]!}`, color: colors[(number - 1) % colors.length]!, cursor: null });
    reconcileBotRabbits(this.habitat, this.players.size);
    this.broadcastPresence(); this.sendSnapshot(client);
  }

  override onLeave(client: Client) { this.players.delete(client.sessionId); this.limits.delete(client.sessionId); reconcileBotRabbits(this.habitat, this.players.size); this.broadcast("departed", client.sessionId); this.broadcastPresence(); this.broadcastState(); }

  private apply(action: WireAction) { if (action.type === "plant") return plant(this.habitat, { x: action.payload.x, y: action.payload.z }); setTimeScale(this.habitat, action.payload); return true; }
  private sendSnapshot(client: Client) { if (this.accept(client)) client.send("snapshot", { players: this.list(), capacity: this.maxClients, gameState: this.snapshot() }); }
  private broadcastState() { this.broadcast("gameState", this.snapshot()); }
  private broadcastPresence() { this.broadcast("presence", { players: this.list(), capacity: this.maxClients }); }
  private snapshot(): HabitatState { return structuredClone(this.habitat); }
  private list() { return [...this.players.values()].map(player => ({ ...player })); }
  private accept(client: Client) {
    const now = Date.now(); let limit = this.limits.get(client.sessionId);
    if (!limit || now - limit.start > 1000) { limit = { start: now, count: 0 }; this.limits.set(client.sessionId, limit); }
    return ++limit.count <= 60;
  }
}

function validCursor(value: unknown): value is Cursor { return value === null || (Array.isArray(value) && value.length === 2 && value.every(item => typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 1)); }
function validAction(value: unknown): value is WireAction {
  if (!value || typeof value !== "object") return false;
  const action = value as { type?: unknown; payload?: unknown };
  if (action.type === "speed") return [0.5, 1, 2, 4, 10].includes(action.payload as number);
  if (action.type !== "plant" || !action.payload || typeof action.payload !== "object") return false;
  const point = action.payload as { x?: unknown; z?: unknown };
  return Number.isInteger(point.x) && Number.isInteger(point.z) && Number(point.x) >= 0 && Number(point.x) < 18 && Number(point.z) >= 0 && Number(point.z) < 12;
}
