import { Room, ServerError, type Client } from "@colyseus/core";
import { randomUUID } from "node:crypto";

type Member = { id: string; number: number; sessionId: string };
/** Fixed creator authority. Never elect a guest when the creator leaves. */
export class AsteroidsRoom extends Room {
  override maxClients = 4;
  private creatorToken = "";
  private hostSession = "";
  private members = new Map<string, Member>();
  private identities = new Map<string, string>();
  private lastInput = new Map<string, number>();
  private budgets = new Map<string, { at: number; count: number }>();
  private frame: Record<string, unknown> | null = null;
  private serial = 0;
  private ended = false;

  override onCreate(options: { code: string; creatorToken: string }) {
    this.creatorToken = options.creatorToken;
    this.autoDispose = false;
    this.setMetadata({ code: options.code });
    this.clock.setTimeout(() => {
      if (!this.hostSession) void this.disconnect();
    }, 15000);
    this.onMessage("input", (client, value) => {
      const member = this.members.get(client.sessionId);
      if (
        !member ||
        !this.accept(client, 50) ||
        !validInput(value) ||
        value.seq <= (this.lastInput.get(member.id) ?? -1)
      )
        return;
      if (this.frame && value.runId !== this.frame.runId) return;
      this.lastInput.set(member.id, value.seq);
      this.clients
        .find((c) => c.sessionId === this.hostSession)
        ?.send("input", { ...value, id: member.id, membership: this.serial });
    });
    this.onMessage("hostSnapshot", (client, value) => {
      if (
        client.sessionId !== this.hostSession ||
        !this.accept(client, 50) ||
        !validFrame(value, this.serial, this.members)
      )
        return;
      if (
        this.frame &&
        (value.runId < (this.frame.runId as number) ||
          (value.runId === this.frame.runId &&
            value.tick <= (this.frame.tick as number)))
      )
        return;
      if (this.frame?.runId !== value.runId) this.lastInput.clear();
      this.frame = value;
      this.broadcast("gameState", value);
    });
    this.onMessage("snapshot", (client) => {
      if (this.accept(client, 50)) {
        client.send("presence", this.roomPresence());
        if (this.frame) client.send("gameState", this.frame);
      }
    });
  }
  override onAuth(_client: Client, options: { identityToken?: string }) {
    if (this.ended) throw new ServerError(410, "Session ended");
    if (
      typeof options.identityToken !== "string" ||
      !this.identities.has(options.identityToken)
    )
      throw new ServerError(403, "Invalid identity");
    return this.identities.get(options.identityToken)!;
  }
  issueIdentity(token?: string) {
    if (token) {
      if (!this.identities.has(token))
        throw new ServerError(403, "Invalid recovery identity");
      return token;
    }
    if (this.identities.size >= 128)
      throw new ServerError(429, "Session identity limit reached");
    const tokenId = randomUUID();
    this.identities.set(tokenId, randomUUID());
    return tokenId;
  }
  registerCreator() {
    this.identities.set(this.creatorToken, randomUUID());
  }
  identityFor(token: string) {
    return this.identities.get(token)!;
  }
  override onJoin(client: Client, _options: unknown, identity: string) {
    if ([...this.members.values()].some((m) => m.id === identity))
      throw new ServerError(409, "Identity already connected");
    const occupied = new Set([...this.members.values()].map((m) => m.number));
    let number = 1;
    while (occupied.has(number)) number++;
    this.members.set(client.sessionId, {
      id: identity,
      number,
      sessionId: client.sessionId,
    });
    if (identity === this.identityFor(this.creatorToken))
      this.hostSession = client.sessionId;
    this.serial++;
    client.send("identity", {
      id: identity,
      host: identity === this.identityFor(this.creatorToken),
    });
    this.broadcast("presence", this.roomPresence());
    if (this.frame) client.send("gameState", this.frame);
  }
  override onLeave(client: Client) {
    this.members.delete(client.sessionId);
    this.budgets.delete(client.sessionId);
    this.serial++;
    if (client.sessionId === this.hostSession) {
      this.ended = true;
      this.broadcast("sessionEnded", {
        reason: "The host left. Create or join a new room.",
      });
      void this.disconnect();
    } else this.broadcast("presence", this.roomPresence());
  }
  private roomPresence() {
    const hostId = this.identityFor(this.creatorToken);
    return {
      hostId,
      serial: this.serial,
      capacity: 4,
      players: [...this.members.values()].map(({ id, number }) => ({
        id,
        number,
        host: id === hostId,
      })),
    };
  }
  private accept(client: Client, max: number) {
    const now = Date.now();
    let b = this.budgets.get(client.sessionId);
    if (!b || now - b.at >= 1000) {
      b = { at: now, count: 0 };
      this.budgets.set(client.sessionId, b);
    }
    return ++b.count <= max;
  }
}
export function validInput(v: unknown): v is {
  runId: number;
  seq: number;
  turn: number;
  thrust: boolean;
  fire: boolean;
} {
  if (!v || typeof v !== "object") return false;
  const x = v as Record<string, unknown>;
  return (
    Number.isSafeInteger(x.runId) &&
    Number.isSafeInteger(x.seq) &&
    (x.seq as number) >= 0 &&
    [-1, 0, 1].includes(x.turn as number) &&
    typeof x.thrust === "boolean" &&
    typeof x.fire === "boolean"
  );
}
export function validFrame(
  v: unknown,
  serial: number,
  members: Map<string, Member>,
): v is Record<string, unknown> & { runId: number; tick: number } {
  if (!v || typeof v !== "object") return false;
  const x = v as Record<string, unknown>;
  if (
    x.version !== 1 ||
    x.membership !== serial ||
    !Number.isSafeInteger(x.runId) ||
    !Number.isSafeInteger(x.tick) ||
    !Number.isSafeInteger(x.wave) ||
    (x.wave as number) < 1 ||
    !["playing", "intermission", "defeat"].includes(x.phase as string)
  )
    return false;
  if (
    typeof x.time !== "number" ||
    !Number.isFinite(x.time) ||
    typeof x.until !== "number" ||
    !Number.isFinite(x.until)
  )
    return false;
  const arrays = [
    ["players", 4, 12],
    ["asteroids", 72, 10],
    ["bullets", 32, 7],
  ] as const;
  for (const [key, limit, length] of arrays) {
    const rows = x[key];
    if (!Array.isArray(rows) || rows.length > limit) return false;
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== length) return false;
      if (
        row.some(
          (cell) =>
            typeof cell !== "string" &&
            (typeof cell !== "number" || !Number.isFinite(cell)),
        )
      )
        return false;
    }
  }
  const players = x.players as unknown[][];
  const ids = [...members.values()].map((m) => m.id);
  if (
    players.length !== ids.length ||
    new Set(players.map((p) => p[0])).size !== ids.length ||
    players.some(
      (p) =>
        !ids.includes(p[0] as string) ||
        !Number.isInteger(p[2]) ||
        (p[2] as number) < 0 ||
        (p[2] as number) > 3,
    )
  )
    return false;
  const bounded = (n: unknown, min: number, max: number) =>
    typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
  for (const p of players) {
    if (
      p.slice(1).some((n) => typeof n !== "number") ||
      !bounded(p[1], 1, 4) ||
      !bounded(p[3], 0, Number.MAX_SAFE_INTEGER) ||
      !bounded(p[4], 0, 640) ||
      !bounded(p[5], 0, 360) ||
      !bounded(p[6], -146, 146) ||
      !bounded(p[7], -146, 146) ||
      !bounded(p[8], 0, Math.PI * 2) ||
      !Number.isSafeInteger(p[11])
    )
      return false;
  }
  for (const key of ["asteroids", "bullets"] as const) {
    const rows = x[key] as unknown[][];
    if (new Set(rows.map((r) => r[0])).size !== rows.length) return false;
    for (const row of rows) {
      if (!Number.isSafeInteger(row[0]) || (row[0] as number) < 1) return false;
      const offset = key === "bullets" ? 1 : 0;
      if (
        row.slice(1 + offset).some((n) => typeof n !== "number") ||
        !bounded(row[1 + offset], 0, 640) ||
        !bounded(row[2 + offset], 0, 360)
      )
        return false;
      if (
        key === "asteroids" &&
        (!bounded(row[5], 2, 24) ||
          !Number.isInteger(row[6]) ||
          !bounded(row[6], 1, 5) ||
          !bounded(row[7], 1, 5) ||
          !bounded(row[8], 0, 2) ||
          !bounded(row[9], 0, 3))
      )
        return false;
      if (
        key === "bullets" &&
        (typeof row[1] !== "string" || (row[1] as string).length > 64)
      )
        return false;
    }
  }
  try {
    return Buffer.byteLength(JSON.stringify(v)) <= 12288;
  } catch {
    return false;
  }
}
