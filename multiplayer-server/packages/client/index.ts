export interface JoinOptions {code?: string | undefined;create?: boolean;reconnectToken?: string | undefined;[option: string]: unknown}
export interface Player {id: string | null;number?: number;name?: string;color?: string | number;connected?: boolean;ready?: boolean;seat?: number;sessionId?: string | null;cursor?: [number,number] | null}
export interface Stroke {id: string;owner: string;points: [number,number][];complete: boolean}
export interface Chat {id?: string;name?: string;text: string;[field: string]: unknown}
interface Authority<Transfer = unknown> {hostId?: string | null;transfer?: Transfer;epoch?: number;ready?: boolean;runId?: string | number;journal?: unknown[]}
export interface MultiplayerState<GameState = unknown, Transfer = unknown, Action = unknown, Music = unknown, PlayerType extends Player = Player> {status: "idle" | "connecting" | "connected" | "reconnecting" | "ended" | "error" | "full" | "offline";players: PlayerType[];strokes: Map<string, Stroke>;gameState: GameState | null;chats: Chat[];capacity: number;sessionId: string | null;seat: number | null;hostId: string | null;transfer: Transfer | null;lastAction: Action | null;error: string;code?: string;reconnectToken?: string | undefined;roomId?: string | null;musicMessage?: Music;ready?: boolean;epoch?: number;runId?: string | number;journal?: Action[]}
export type Subscription<GameState, Transfer = unknown, Action = unknown, Music = unknown, PlayerType extends Player = Player> = (state: MultiplayerState<GameState, Transfer, Action, Music, PlayerType>, event: string) => void;
interface AdmissionError extends Error {expired?: boolean;codeInUse?: boolean;full?: boolean}
function admissionError(value: unknown): AdmissionError { return value instanceof Error ? value : new Error(String(value)); }
interface Snapshot<GameState, Transfer, PlayerType extends Player> {players: PlayerType[];strokes?: Stroke[];capacity: number;gameState?: GameState & Authority<Transfer>;chats?: Chat[];hostId?: string | null;seat?: number}
import { Client, type Room } from "@colyseus/sdk";
import {consumeReservedSeat} from "./seat-reservation.js";

const ROOM_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Generate an editable four-character suggestion. The server remains authoritative. */
export function suggestRoomCode() {
  const bytes = new Uint8Array(4);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map(value => ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length]).join("");
}

export function readRoomCode(search = globalThis.location?.search ?? "") {
  const value = new URLSearchParams(search).get("room");
  return value?.trim().toUpperCase() ?? "";
}

export function buildRoomLink(code: string, url = globalThis.location?.href) {
  if (!url) throw new Error("A page URL is required to build a room link");
  const link = new URL(url);
  link.searchParams.set("room", String(code).trim().toUpperCase());
  return link.toString();
}

/** Shared anonymous session lifecycle. Each successful join creates a fresh identity. */
export class MultiplayerClient<GameState = unknown, Actions extends object = Record<string, unknown>, Transfer = unknown, Action = unknown, Music = unknown, PlayerType extends Player = Player> {
 endpoint: string;game: string;options: JoinOptions;listeners: Set<Subscription<GameState, Transfer, Action, Music, PlayerType>>;state: MultiplayerState<GameState, Transfer, Action, Music, PlayerType>;stopped: boolean;generation: number;retryDelay: number;
 admissionAbort: AbortController | undefined;timer: ReturnType<typeof setTimeout> | undefined;room: Room<unknown, unknown> | undefined;
  constructor(endpoint: string, game = "multiplayer-draw", options: JoinOptions = {}) {
    this.endpoint = endpoint.replace(/\/$/, "");
    this.game = game;
    this.options = { ...options };
    const linkedCode = readRoomCode();
    if (linkedCode && !options.code && options.create !== true) this.options = { ...this.options, code: linkedCode, create: false };
    if (game === "tetris-duel" && this.options.code && !this.options.create && !this.options.reconnectToken) {
      try { const token=globalThis.sessionStorage?.getItem(`rmc:${this.endpoint}:${game}:${this.options.code}`); if(token)this.options.reconnectToken=token; } catch {}
    }
    this.listeners = new Set();
    this.state = { status: "idle", players: [], strokes: new Map(), gameState: null, chats: [], capacity: 12, sessionId: null, seat: null, hostId: null, transfer: null, lastAction: null, error: "" };
    this.stopped = true;
    this.generation = 0;
    this.retryDelay = 1000;
  }
  subscribe(listener: Subscription<GameState, Transfer, Action, Music, PlayerType>) { this.listeners.add(listener); listener(this.state, "initial"); return () => this.listeners.delete(listener); }
  emit(event: string) { for (const listener of this.listeners) listener(this.state, event); }
  async connect() {
    this.stopped = false;
    const generation = ++this.generation;
    this.admissionAbort?.abort();
    const admissionAbort = new AbortController();
    this.admissionAbort = admissionAbort;
    clearTimeout(this.timer);
    const old = this.room; this.room = undefined;
    if (old) { old.reconnection.enabled = false; void old.leave(); }
    this.state = { ...this.state, status: "connecting", sessionId: null, players: [], strokes: new Map(), gameState: null, chats: [], hostId: null, transfer: null, lastAction: null, error: "" };
    this.emit("status");
    let room: Room<unknown, unknown> | undefined;
    try {
      let response;
      // Hobby may route a simultaneous code lookup to a fresh instance. Retry
      // only opted-in private games' missing-room responses; never create overflow rooms.
      for (let attempt = 0; ; attempt++) {
        response = await fetch(this.endpoint + "/api/join/" + encodeURIComponent(this.game), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(this.options), signal: AbortSignal.any([admissionAbort.signal, AbortSignal.timeout(15000)]) });
        if (this.stopped || generation !== this.generation) return;
        if (!['combat','bomberman','space-invaders','ring-rivals','tetris-duel','music-maker'].includes(this.game) || this.options.create === true || response.status !== 404 || attempt >= 3) break;
        await response.arrayBuffer();
        await new Promise(resolve => setTimeout(resolve, (this.game === 'combat' ? [150,350,700][attempt] : 150 * 2 ** attempt)));
        if (this.stopped || generation !== this.generation) return;
      }
      const payload = await response.json();
      const reservation = payload.reservation || payload;
      if (!response.ok) {
        const error: AdmissionError = new Error(reservation.error || "Server unavailable");
        error.codeInUse = reservation.errorCode === "code_in_use";
        error.full = response.status === 409 && !error.codeInUse;
        error.expired = response.status === 404 || response.status === 400 || response.status === 403;
        throw error;
      }
      if (payload.code) {
        this.options = { code: payload.code, ...(payload.token ? { reconnectToken: payload.token } : this.options.reconnectToken ? { reconnectToken: this.options.reconnectToken } : {}) };
        this.state.code = payload.code;
        if (payload.token) {
          this.state.reconnectToken = payload.token;
          if(this.game === "tetris-duel")try{globalThis.sessionStorage?.setItem(`rmc:${this.endpoint}:${this.game}:${payload.code}`,payload.token);}catch{}
        }
      }
      for (let attempt = 0; ; attempt++) {
        try { room = await (['combat','bomberman','space-invaders','ring-rivals','tetris-duel','music-maker'].includes(this.game)
          ? consumeReservedSeat(this.endpoint,reservation,{signal:admissionAbort.signal})
          : new Client(this.endpoint).consumeSeatReservation(reservation)); break; }
        catch (caught) {
          const error = admissionError(caught);
          // Keep the original reserved identity when a Hobby socket upgrade is
          // routed away from its owner. Re-admission would reserve a second seat.
          if (!['combat','bomberman','space-invaders','ring-rivals','tetris-duel','music-maker'].includes(this.game)) throw error;
          if (attempt >= (this.game === 'combat' ? 2 : 3)) { error.expired = true; error.message = 'Could not attach to this room. Retry the code after the reserved seat expires, or create a new room.'; throw error; }
          await new Promise(resolve => setTimeout(resolve, (this.game === 'combat' ? 200 * (attempt + 1) : 150 * 2 ** attempt)));
          if (this.stopped || generation !== this.generation) return;
        }
      }
      if (!room) throw new Error("Room admission returned no room");
      const admittedRoom = room;
      const recoversSeat = this.game === 'combat' || this.game === 'bomberman' || this.game === 'ring-rivals' || this.game === 'tetris-duel';
      room.reconnection.enabled = recoversSeat;
      if (recoversSeat) {
        room.reconnection.maxRetries = 18; room.reconnection.minDelay = 200; room.reconnection.maxDelay = 1000; room.reconnection.minUptime = 0;
        // The SDK can already have a retry timer queued when a consumer leaves.
        // Guard the public reconnect entry point against a stale lifecycle.
        const reconnect = room.connection.reconnect.bind(room.connection);
        room.connection.reconnect = options => {
          if (!this.stopped && generation === this.generation && admittedRoom.reconnection.enabled) reconnect(options);
        };
        room.onDrop(() => { this.state.status = 'reconnecting'; this.state.error = 'Connection interrupted. Recovering your seat…'; this.emit('status'); });
        room.onReconnect(() => { this.state.status = 'connected'; this.state.error = ''; admittedRoom.send('snapshot'); this.emit('status'); });
      }
      if (this.stopped || generation !== this.generation) { await room.leave(); return; }
      this.room = room;
      if (this.game === "space-invaders") {
        const onMessage = room.onMessage.bind(room);
        room.onMessage = ((type: string | number, callback: (data: unknown) => void) => onMessage(type, data => {
          if (!this.stopped && generation === this.generation && this.room === room) callback(data);
        })) as typeof room.onMessage; // Preserve SDK overloaded registration after guarding delivery.
      }
      this.state.sessionId = room.sessionId;
      this.state.roomId = room.roomId;
      for (const type of ['musicIntent','musicClockRequest','musicClockReply','musicCommit','musicSnapshot','musicSnapshotRequest','musicRejected']) {
        room.onMessage(type, data => { this.state.musicMessage = data; this.emit(type); });
      }
      room.onMessage('musicEnded', data => { this.stopped = true; this.state.status = 'ended'; this.state.error = data.reason; this.emit('musicEnded'); });
      room.onMessage("identity", data => { this.state.seat = data?.seat ?? null; this.emit("identity"); });
      room.onMessage("snapshot", (data: Snapshot<GameState, Transfer, PlayerType>) => {
        if (this.game === "space-invaders") this.state.seat = data.seat ?? this.state.seat;
        this.state.players = data.players;
        this.state.strokes = new Map((data.strokes || []).map((s: Stroke) => [s.id, s]));
        this.state.capacity = data.capacity; this.state.gameState = data.gameState ?? null;
        this.state.chats = data.chats || [];
        this.state.hostId = data.hostId ?? data.gameState?.hostId ?? null;
        this.state.transfer = data.gameState?.transfer ?? null;
        if (this.game === "space-invaders") Object.assign(this.state, { epoch: data.gameState?.epoch, ready: data.gameState?.ready, runId: data.gameState?.runId, journal: data.gameState?.journal ?? [] });
        this.state.capacity = data.capacity;
        this.state.status = "connected";
        this.state.error = "";
        this.retryDelay = 1000;
        this.emit("snapshot");
      });
      room.onMessage("gameState", (data: GameState & Authority<Transfer>) => { this.state.gameState = data; if (data?.hostId !== undefined) { this.state.hostId = data.hostId; this.state.transfer = data.transfer ?? null; } if (this.game === "space-invaders") Object.assign(this.state, { epoch: data.epoch, ready: data.ready, runId: data.runId }); this.emit("gameState"); });
      room.onMessage("presence", data => { Object.assign(this.state, data); this.emit("presence"); });
      room.onMessage("garden", data => { this.state.players = data.players; this.emit("garden"); });
      room.onMessage("chat", data => { this.state.chats = [...(this.state.chats || []), data].slice(-100); this.emit("chat"); });
      room.onMessage("cursor", data => {
        const player = this.state.players.find(p => p.id === data.id);
        if (player) player.cursor = data.cursor;
        this.emit("cursor");
      });
      room.onMessage("stroke", data => {
        let stroke = this.state.strokes.get(data.id);
        if (!stroke) { stroke = { id: data.id, owner: data.owner, points: [], complete: false }; this.state.strokes.set(data.id, stroke); }
        if (stroke.points.length === data.offset) stroke.points.push(...data.points);
        stroke.complete = data.complete;
        this.emit("stroke");
      });
      room.onMessage("erase", id => { this.state.strokes.delete(id); this.emit("erase"); });
      room.onMessage("departed", id => {
        for (const [key, stroke] of this.state.strokes) if (stroke.owner === id) this.state.strokes.delete(key);
        this.state.players = this.state.players.filter(p => p.id !== id);
        this.emit("departed");
      });
      room.onMessage("notice", text => { this.state.error = text; this.emit("notice"); });
      room.onMessage("habitatAction", data => { this.state.lastAction = data; this.emit("habitatAction"); });
      room.onMessage("gameAction", data => { this.state.lastAction = data; this.emit("gameAction"); });
      room.onMessage("recoveryError", data => { this.state.error = data.message; this.state.ready = false; this.emit("recoveryError"); });
      room.onMessage("hostTransfer", data => { if (this.game === "space-invaders") Object.assign(this.state, data); this.state.hostId = data?.hostId ?? null; this.state.transfer = data?.transfer ?? null; this.emit("hostTransfer"); });
      room.onError((_code, message) => { this.state.error = message || "Connection error"; this.emit("error"); });
      room.onLeave(() => {
        if (generation !== this.generation || this.stopped) return;
        this.room = undefined;
        if (this.game === "combat") { this.state.status = "error"; this.state.error = "Room recovery ended. Retry the code or create a new room; scores may be lost."; this.emit("status"); } else if(this.game === "tetris-duel") {
          this.state.status="error";this.state.error="Room expired or recovery ended. Create a new room to play again.";this.emit("status");
        } else this.schedule("Connection lost. Recovering your session…");
      });
      admittedRoom.send("snapshot");
      const heartbeat = ["music-maker", "space-invaders", "just-like-rabbits"].includes(this.game) ? setInterval(() => { if (!this.stopped && generation === this.generation) admittedRoom.send("heartbeat"); }, this.game === "space-invaders" ? 1000 : 5000) : null;

      const snapshotDeadline = setTimeout(() => {
        if (generation === this.generation && this.state.status !== "connected" && !this.stopped) {
          void admittedRoom.leave();
          this.schedule("Connection stalled. Retrying…");
        }
      }, 10000);
      room.onMessage("snapshot", () => clearTimeout(snapshotDeadline));
      room.onLeave(() => { clearTimeout(snapshotDeadline); if (heartbeat) clearInterval(heartbeat); });
    } catch (caught) {
          const error = admissionError(caught);
      if (room) { room.reconnection.enabled = false; void room.leave(); }
      if (generation !== this.generation || this.stopped) return;
      if (error.expired || error.codeInUse) { this.state.status = "error"; this.state.error = error.message; this.emit("status"); } else if (error.full) {
        this.state.status = "full";
        this.state.error = "This room is full. Try again when someone leaves.";
        this.emit("status");
      } else this.schedule("Cannot connect. Retrying…");
    }
  }
  schedule(message: string) {
    if (this.stopped) return;
    this.state = { ...this.state, status: "reconnecting", sessionId: null, players: [], strokes: new Map(), gameState: null, chats: [], hostId: null, transfer: null, lastAction: null, error: message };
    this.emit("status");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.connect(), this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, 15000);
  }
  send<Type extends keyof Actions & (string | number)>(type: Type, message?: Actions[Type]) { if (this.state.status === "connected") this.room?.send(type, message); }
  disconnect() {
    this.stopped = true; this.generation++;
    this.admissionAbort?.abort();
    clearTimeout(this.timer);
    const room = this.room; this.room = undefined;
    if (room) { room.reconnection.enabled = false; void room.leave(); }
    this.state = { ...this.state, status: "offline", sessionId: null, players: [], strokes: new Map(), gameState: null, chats: [], hostId: null, transfer: null, lastAction: null, roomId: null };
    this.emit("status");
  }
}
