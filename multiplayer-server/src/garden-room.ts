// Seat name/color indexes are bounded by the twelve-seat admission limit.
import { Room, type Client } from "@colyseus/core";

type Gardener = { id: string; number: number; name: string; color: string; x: number; z: number };
type Chat = { id: number; sender: string; name: string; color: string; text: string; time: number };
const colors = ["#ed866e", "#68a8db", "#b99cdb", "#e6ba59", "#6cc5ae", "#de87b0", "#a1b754", "#768bd2", "#da9c61", "#6dbfcd", "#ca737a", "#93aa84"];
const names = ["Peach", "Bluebell", "Lavender", "Marigold", "Mint", "Clover", "Fern", "Iris", "Maple", "River", "Rose", "Sage"];
export class GardenRoom extends Room {
  override maxClients = 12;
  players = new Map<string, Gardener>();
  inputs = new Map<string, { x: number; z: number; time: number }>();
  chats: Chat[] = [];
  limits = new Map<string, { time: number; count: number; chat: number }>();
  sequence = 0;
  override onCreate() {
    this.onMessage("snapshot", client => {
      if (this.accept(client)) client.send("snapshot", { players: [...this.players.values()], chats: this.chats, capacity: this.maxClients });
    });
    this.onMessage("move", (client, data) => {
      if (!this.accept(client) || !data || ![data.x, data.z].every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1)) return;
      const length = Math.max(1, Math.hypot(data.x, data.z));
      this.inputs.set(client.sessionId, { x: data.x / length, z: data.z / length, time: Date.now() });
    });
    this.onMessage("chat", (client, data) => {
      if (!this.accept(client) || typeof data !== "string" || data.length > 280) return;
      const text = data.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
      const player = this.players.get(client.sessionId), limit = this.limits.get(client.sessionId)!;
      if (!player || !text) return;
      if (Date.now() - limit.chat < 750) { client.send("notice", "Give your message a moment before sending another."); return; }
      limit.chat = Date.now();
      const message = { id: ++this.sequence, sender: player.id, name: player.name, color: player.color, text, time: Date.now() };
      this.chats.push(message);
      if (this.chats.length > 100) this.chats.shift();
      this.broadcast("chat", message);
    });
    this.setSimulationInterval(() => this.step(), 50);
  }
  accept(client: Client) {
    const now = Date.now();
    let limit = this.limits.get(client.sessionId);
    if (!limit) { limit = { time: now, count: 0, chat: 0 }; this.limits.set(client.sessionId, limit); }
    if (now - limit.time > 1000) { limit.time = now; limit.count = 0; }
    return ++limit.count <= 60;
  }
  step() {
    const players = [...this.players.values()];
    const clamp = (p: Gardener) => { p.x = Math.max(-7.5, Math.min(7.5, p.x)); p.z = Math.max(-10.5, Math.min(10.5, p.z)); };
    for (const p of players) {
      const input = this.inputs.get(p.id);
      if (input && Date.now() - input.time < 300) { p.x += input.x * 0.17; p.z += input.z * 0.17; }
      clamp(p);
    }
    for (let pass = 0; pass < 6; pass++) {
      for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
        // i and j are bounded by the unchanged local player array.
        const a = players[i]!, b = players[j]!;
        let dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz);
        if (distance >= 1) continue;
        if (distance < 0.0001) { dx = 1; dz = 0; distance = 1; }
        const push = (1 - Math.hypot(b.x - a.x, b.z - a.z)) / 2;
        a.x -= dx / distance * push; a.z -= dz / distance * push;
        b.x += dx / distance * push; b.z += dz / distance * push;
        clamp(a); clamp(b);
      }
    }
    this.broadcast("garden", { players });
  }
  override onJoin(client: Client) {
    const occupied = new Set([...this.players.values()].map(p => p.number));
    let number = 1; while (occupied.has(number)) number++;
    // Find a free spawn even when returning visitors occupy the original seat location.
    let x = 0, z = 0;
    outer: for (let row = 0; row < 8; row++) for (let col = 0; col < 6; col++) {
      x = -5 + col * 2; z = -7 + row * 2;
      if ([...this.players.values()].every(p => Math.hypot(p.x - x, p.z - z) >= 1.2)) break outer;
    }
    this.players.set(client.sessionId, { id: client.sessionId, number, name: names[number - 1]!, color: colors[number - 1]!, x, z });
    this.broadcast("presence", { players: [...this.players.values()], capacity: this.maxClients });
  }
  override onLeave(client: Client) {
    this.players.delete(client.sessionId); this.inputs.delete(client.sessionId); this.limits.delete(client.sessionId);
    this.broadcast("departed", client.sessionId);
    this.broadcast("presence", { players: [...this.players.values()], capacity: this.maxClients });
  }
}
