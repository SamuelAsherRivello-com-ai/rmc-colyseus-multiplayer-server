import { Room, type Client } from "@colyseus/core";

export type CatActivity = "idle" | "wander" | "rest" | "box" | "food" | "tree" | "social";
type Cat = { id: string; number: number; name: string; color: string; bot: boolean; x: number; z: number; activity: CatActivity };
type Input = { x: number; z: number; time: number };

const colors = ["#ed866e", "#68a8db", "#b99cdb", "#e6ba59", "#6cc5ae", "#de87b0", "#a1b754", "#768bd2", "#da9c61", "#6dbfcd", "#ca737a", "#93aa84"];
const names = ["Mochi", "Pochi", "Nori", "Miso", "Soba", "Yuzu", "Tofu", "Kumo", "Sumi", "Mikan", "Fuyu", "Tama"];
const botActivities: readonly CatActivity[] = ["wander", "rest", "box", "food", "tree", "social"];
const bounds = 11;

/** A public social room. Human input and all bot movement are server-authoritative. */
export class CatHangoutRoom extends Room {
  override maxClients = 12;
  cats = new Map<string, Cat>();
  inputs = new Map<string, Input>();
  limits = new Map<string, { time: number; count: number }>();
  botGoal = new Map<string, { x: number; z: number; until: number }>();

  override onCreate() {
    this.onMessage("snapshot", (client) => { if (this.accept(client)) client.send("snapshot", this.snapshot()); });
    this.onMessage("move", (client, data: unknown) => this.receiveMove(client, data));
    this.onMessage("interact", (client) => {
      this.receiveInteract(client);
    });
    this.setSimulationInterval(() => this.step(), 50);
  }

  snapshot() { return { capacity: this.maxClients, players: [...this.cats.values()].filter((cat) => !cat.bot), cats: [...this.cats.values()] }; }

  receiveMove(client: Client, data: unknown) {
    if (!this.accept(client) || !isInput(data)) return false;
    const length = Math.max(1, Math.hypot(data.x, data.z));
    this.inputs.set(client.sessionId, { x: data.x / length, z: data.z / length, time: Date.now() });
    return true;
  }

  receiveInteract(client: Client) {
    if (!this.accept(client)) return false;
    const cat = this.cats.get(client.sessionId);
    if (!cat) return false;
    cat.activity = "social";
    return true;
  }

  accept(client: Client) {
    const now = Date.now();
    let limit = this.limits.get(client.sessionId);
    if (!limit || now - limit.time >= 1000) { limit = { time: now, count: 0 }; this.limits.set(client.sessionId, limit); }
    return ++limit.count <= 60;
  }

  private addHuman(id: string) {
    const number = this.nextNumber();
    this.cats.set(id, { id, number, name: names[number - 1]!, color: colors[number - 1]!, bot: false, x: -8 + ((number - 1) % 4) * 2, z: -7 + Math.floor((number - 1) / 4) * 2, activity: "idle" });
  }

  private addBot() {
    const number = this.nextNumber(); const id = `cat-bot-${number}`;
    this.cats.set(id, { id, number, name: `${names[number - 1]!} Bot`, color: colors[number - 1]!, bot: true, x: 7 - ((number - 1) % 4) * 2, z: 6 - Math.floor((number - 1) / 4) * 2, activity: "wander" });
  }

  private nextNumber() { const used = new Set([...this.cats.values()].map((cat) => cat.number)); let number = 1; while (used.has(number)) number++; return number; }

  private fillBots() {
    this.removeBots();
    const humans = [...this.cats.values()].filter((cat) => !cat.bot).length;
    for (let i = humans; i < Math.min(4, humans + 3); i++) this.addBot();
  }

  private removeBots() { for (const [id, cat] of this.cats) if (cat.bot) { this.cats.delete(id); this.botGoal.delete(id); } }

  private stepBot(cat: Cat, now: number) {
    let goal = this.botGoal.get(cat.id);
    if (!goal || now >= goal.until || Math.hypot(goal.x - cat.x, goal.z - cat.z) < 0.2) {
      cat.activity = botActivities[Math.floor(Math.random() * botActivities.length)]!;
      if (cat.activity !== "wander") { this.botGoal.delete(cat.id); return; }
      goal = { x: -bounds + Math.random() * bounds * 2, z: -bounds + Math.random() * bounds * 2, until: now + 1500 + Math.random() * 2500 };
      this.botGoal.set(cat.id, goal);
    }
    const distance = Math.hypot(goal.x - cat.x, goal.z - cat.z);
    if (distance > 0) { cat.x += ((goal.x - cat.x) / distance) * 0.12; cat.z += ((goal.z - cat.z) / distance) * 0.12; }
  }

  step() {
    const now = Date.now();
    for (const cat of this.cats.values()) {
      if (cat.bot) { this.stepBot(cat, now); continue; }
      const input = this.inputs.get(cat.id);
      if (input && now - input.time < 300) { cat.x += input.x * 0.18; cat.z += input.z * 0.18; cat.activity = "wander"; }
      else if (cat.activity === "wander") cat.activity = "idle";
      cat.x = Math.max(-bounds, Math.min(bounds, cat.x)); cat.z = Math.max(-bounds, Math.min(bounds, cat.z));
    }
    this.broadcast("catState", this.snapshot());
  }

  override onJoin(client: Client) { this.removeBots(); this.addHuman(client.sessionId); this.fillBots(); this.broadcast("presence", this.snapshot()); }
  override onLeave(client: Client) { this.cats.delete(client.sessionId); this.inputs.delete(client.sessionId); this.limits.delete(client.sessionId); this.fillBots(); this.broadcast("presence", this.snapshot()); }
}

function isInput(value: unknown): value is { x: number; z: number } {
  if (!value || typeof value !== "object") return false;
  const { x, z } = value as { x?: unknown; z?: unknown };
  return typeof x === "number" && typeof z === "number" && Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) <= 1 && Math.abs(z) <= 1;
}
