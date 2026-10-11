// Palette lookup is bounded by the room capacity and available-color count.
import { Room, type Client } from "@colyseus/core";
import { randomUUID } from "node:crypto";

type Point = [number, number];
type Player = { id: string; number: number; name: string; color: string; cursor: Point | null };
type Stroke = { id: string; owner: string; points: Point[]; complete: boolean };
const colors = ["#d64d68", "#3478c8", "#38956a", "#9365c6", "#d57930", "#228d99", "#bb4d91", "#617d2e", "#675ccc", "#ad643d", "#317b83", "#a6741e"];
const adjectives = ["Cosmic", "Sunny", "Quiet", "Clever", "Velvet", "Mellow", "Brave", "Silver"];
const animals = ["Otter", "Panda", "Finch", "Fox", "Lynx", "Moth", "Kiwi", "Orca"];
export class DrawingRoom extends Room {
  override maxClients = 12;
  players = new Map<string, Player>();
  strokes = new Map<string, Stroke>();
  limits = new Map<string, { time: number; count: number }>();
  override onCreate() {
    this.onMessage("snapshot", client => this.snapshot(client));
    this.onMessage("cursor", (client, point) => {
      if (!this.accept(client) || !(point === null || validPoint(point))) return;
      const player = this.players.get(client.sessionId);
      if (!player) return;
      player.cursor = point;
      this.broadcast("cursor", { id: player.id, cursor: point });
    });
    this.onMessage("stroke", (client, data) => {
      if (!this.accept(client) || !data || typeof data.id !== "string" || data.id.length > 80 ||
          !Array.isArray(data.points) || data.points.length > 64 || !data.points.every(validPoint) ||
          !Number.isSafeInteger(data.offset) || data.offset < 0 || typeof data.complete !== "boolean") return;
      const key = client.sessionId + ":" + data.id;
      let stroke = this.strokes.get(key);
      if (!stroke) {
        if (data.offset !== 0 || data.points.length === 0) return;
        if ([...this.strokes.values()].filter(s => s.owner === client.sessionId).length >= 100) {
          client.send("notice", "Canvas limit reached. Erase some of your strokes to continue."); return;
        }
        stroke = { id: key, owner: client.sessionId, points: [], complete: false };
        this.strokes.set(key, stroke);
      }
      if (stroke.complete || stroke.points.length !== data.offset) return;
      const used = [...this.strokes.values()].filter(s => s.owner === client.sessionId).reduce((n, s) => n + s.points.length, 0);
      if (used + data.points.length > 10000 || stroke.points.length + data.points.length > 2048) {
        client.send("notice", "Drawing limit reached. Erase some of your strokes to continue."); return;
      }
      stroke.points.push(...data.points);
      stroke.complete = data.complete;
      this.broadcast("stroke", { id: key, owner: client.sessionId, offset: data.offset, points: data.points, complete: data.complete });
    });
    this.onMessage("erase", (client, id) => {
      if (!this.accept(client) || typeof id !== "string") return;
      if (this.strokes.get(id)?.owner !== client.sessionId) return;
      this.strokes.delete(id);
      this.broadcast("erase", id);
    });
  }
  accept(client: Client) {
    const now = Date.now();
    let limit = this.limits.get(client.sessionId);
    if (!limit || now - limit.time > 1000) { limit = { time: now, count: 0 }; this.limits.set(client.sessionId, limit); }
    return ++limit.count <= 100;
  }
  override onJoin(client: Client) {
    const occupied = new Set([...this.players.values()].map(p => p.number));
    let number = 1;
    while (occupied.has(number)) number++;
    const seed = parseInt(randomUUID().slice(0, 8), 16);
    const usedColors = new Set([...this.players.values()].map(p => p.color));
    const available = colors.filter(c => !usedColors.has(c));
    const player = { id: client.sessionId, number, name: adjectives[seed % adjectives.length] + " " + animals[(seed >>> 4) % animals.length], color: available[seed % available.length]!, cursor: null };
    this.players.set(client.sessionId, player);
    this.broadcast("presence", { players: [...this.players.values()], capacity: this.maxClients });
  }
  snapshot(client: Client) {
    if (!this.accept(client)) return;
    client.send("snapshot", { players: [...this.players.values()], strokes: [...this.strokes.values()], capacity: this.maxClients });
  }
  override onLeave(client: Client) {
    this.players.delete(client.sessionId);
    this.limits.delete(client.sessionId);
    for (const [id, stroke] of this.strokes) if (stroke.owner === client.sessionId) this.strokes.delete(id);
    this.broadcast("departed", client.sessionId);
    this.broadcast("presence", { players: [...this.players.values()], capacity: this.maxClients });
  }
}
function validPoint(p: unknown): p is Point {
  return Array.isArray(p) && p.length === 2 && p.every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1);
}

