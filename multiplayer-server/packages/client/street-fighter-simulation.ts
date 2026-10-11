import type { FighterId } from "./street-fighter-fighters.js";
import type { FighterInput, FighterMatch } from "./street-fighter-combat.js";
interface ValidInput extends FighterInput { seq: number }
export interface FighterSeat { sessionId: string | null; token: string; number: number; fighter: FighterId; ready: boolean; connected: boolean; previousSessionId: string | null; input: FighterInput; seq: number; inputAge: number }
import { createMatch, getMoveList, resetRound, startMatch, stepMatch } from "./street-fighter-combat.js";
import { ATTACKS, FIGHTERS, SPECIALS } from "./street-fighter-fighters.js";

export { createMatch, getMoveList, resetRound, startMatch, stepMatch };
export { ATTACKS, FIGHTERS, SPECIALS };

export const STREET_FIGHTER_KEYS = Object.freeze(Object.keys(FIGHTERS) as FighterId[]);
const STAGES = Object.freeze(["dojo", "harbor", "snow"]);
const NEUTRAL = Object.freeze<FighterInput>({ away: false, toward: false, up: false, down: false, jump: false, punch: false, kick: false });
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

function validInput(value: unknown, lastSeq: number): value is ValidInput {
  if (!isObject(value) || typeof value.seq !== "number" || !Number.isSafeInteger(value.seq) || value.seq < 0 || value.seq <= lastSeq) return false;
  const allowed = new Set(["seq", ...Object.keys(NEUTRAL)]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  for (const key of ["away", "toward", "up", "down", "jump"]) if (typeof value[key] !== "boolean") return false;
  for (const key of ["punch", "kick"]) if (![false, "light", "medium", "heavy"].some(option => option === value[key])) return false;
  return true;
}

export class StreetFighterSimulation {
 seats: FighterSeat[]; sessionSeats: Map<string, FighterSeat>; phase: string; stage: string; resumePhase: string; countdown: number; reconnectRemaining: number; roundResetIn: number; match: FighterMatch; event: string; eventSerial: number; time: number;
  constructor() {
    this.seats = [];
    this.sessionSeats = new Map();
    this.phase = "lobby";
    this.stage = "dojo";
    this.resumePhase = "fight";
    this.countdown = 0;
    this.reconnectRemaining = 0;
    this.roundResetIn = 0;
    this.match = createMatch();
    this.event = "Waiting for fighters";
    this.eventSerial = 0;
    this.time = 0;
  }

  announce(text: string) { this.event = text; this.eventSerial++; }

  setStageFromCode(code: string) {
    const hash = [...String(code)].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 7);
    this.stage = STAGES[hash % STAGES.length]!;
  }

  add(sessionId: string, token: string | undefined) {
    if (this.sessionSeats.has(sessionId) || this.seats.length >= 2 || !token) return null;
    const seat: FighterSeat = { sessionId, token, number: this.seats.length + 1, fighter: STREET_FIGHTER_KEYS[this.seats.length]!, ready: false, connected: true, previousSessionId: null, input: { ...NEUTRAL }, seq: -1, inputAge: 0 };
    this.seats.push(seat); this.sessionSeats.set(sessionId, seat);
    if (this.seats.length === 2) this.announce("Select fighters and ready up");
    return seat;
  }

  reconnect(sessionId: string, token: string | undefined) {
    if (!token) return null;
    const seat = this.seats.find((entry) => entry.token === token && !entry.connected && this.reconnectRemaining > 0);
    if (!seat) return null;
    seat.sessionId = sessionId; seat.previousSessionId = null; seat.connected = true; seat.input = { ...NEUTRAL }; seat.inputAge = 0;
    this.sessionSeats.set(sessionId, seat); this.reconnectRemaining = 0; this.phase = this.resumePhase;
    this.announce(`${FIGHTERS[seat.fighter].name} rejoined`);
    return seat;
  }

  replaceDisconnected(oldSessionId: string, newSessionId: string, token: string | undefined) {
    const seat = this.seats.find(entry => !entry.connected && entry.previousSessionId === oldSessionId);
    if (!seat || !token || this.sessionSeats.has(newSessionId)) return null;
    seat.sessionId = newSessionId; seat.previousSessionId = null; seat.token = token; seat.connected = true;
    seat.input = { ...NEUTRAL }; seat.inputAge = 0;
    this.sessionSeats.set(newSessionId, seat); this.reconnectRemaining = 0; this.phase = this.resumePhase;
    this.announce(`${FIGHTERS[seat.fighter].name} rejoined`);
    return seat;
  }

  disconnect(sessionId: string) {
    const seat = this.sessionSeats.get(sessionId);
    if (!seat) return;
    this.sessionSeats.delete(sessionId); seat.previousSessionId = sessionId; seat.sessionId = null; seat.connected = false; seat.input = { ...NEUTRAL };
    this.resumePhase = this.phase === "reconnecting" ? this.resumePhase : this.phase;
    this.phase = "reconnecting"; this.reconnectRemaining = 15;
    this.announce("Opponent disconnected — reconnect window 15 seconds");
  }

  leave(sessionId: string) {
    const seat = this.sessionSeats.get(sessionId);
    if (!seat) return;
    this.sessionSeats.delete(sessionId);
    this.seats = this.seats.filter(entry => entry !== seat);
    this.seats.forEach((entry, index) => { entry.number = index + 1; });
    if (this.seats.length < 2 && this.phase !== "lobby") this.phase = "lobby";
  }

  select(sessionId: string, fighter: unknown) {
    const seat = this.sessionSeats.get(sessionId);
    if (!seat || this.phase !== "lobby" || typeof fighter !== "string" || !Object.hasOwn(FIGHTERS, fighter)) return false;
    seat.fighter = fighter as FighterId; seat.ready = false; this.announce(`${FIGHTERS[seat.fighter].name} selected`); return true;
  }

  ready(sessionId: string, ready: unknown) {
    const seat = this.sessionSeats.get(sessionId);
    if (!seat || typeof ready !== "boolean" || !["lobby", "match-over"].includes(this.phase)) return false;
    seat.ready = ready;
    if (this.phase === "lobby" && this.seats.length === 2 && this.seats.every((entry) => entry.connected && entry.ready)) this.beginCountdown();
    if (this.phase === "match-over" && this.seats.length === 2 && this.seats.every((entry) => entry.connected && entry.ready)) {
      this.seats.forEach((entry) => { entry.ready = false; }); this.beginCountdown();
    }
    return true;
  }

  beginCountdown() { this.phase = "countdown"; this.countdown = 3; this.announce("Get ready"); }

  input(sessionId: string, value: unknown) {
    const seat = this.sessionSeats.get(sessionId);
    if (!seat || this.phase !== "fight" || !validInput(value, seat.seq)) return false;
    seat.seq = value.seq; seat.input = Object.fromEntries(Object.keys(NEUTRAL).map((key) => [key, value[key as keyof FighterInput]])) as FighterInput; // validInput checks every copied control. seat.inputAge = 0;
    return true;
  }

  step(dt = 1 / 60) {
    const delta = Math.max(0, Math.min(dt, 1 / 15)); this.time += delta;
    if (this.phase === "reconnecting") {
      this.reconnectRemaining -= delta;
      if (this.reconnectRemaining <= 0) {
        const disconnected = this.seats.find((seat) => !seat.connected);
        this.phase = "match-over";
        this.match.phase = "match-over"; this.match.winner = disconnected?.number === 1 ? "p2" : "p1";
        this.match.announcement = "OPPONENT FORFEIT — MATCH OVER"; this.announce(this.match.announcement);
      }
      return;
    }
    if (this.phase === "countdown") {
      this.countdown -= delta;
      if (this.countdown <= 0) {
        this.match = createMatch({ fighters: this.seats.map((seat) => seat.fighter) }); startMatch(this.match);
        this.phase = "fight"; this.announce("FIGHT!");
      }
      return;
    }
    if (this.phase === "round-over") {
      this.roundResetIn -= delta;
      if (this.roundResetIn <= 0) { resetRound(this.match); this.phase = "fight"; this.announce(this.match.announcement); }
      return;
    }
    if (this.phase !== "fight") return;
    const inputs = this.seats.map((seat, index) => {
      seat.inputAge += delta;
      if (seat.inputAge > .3) seat.input = { ...NEUTRAL };
      return { ...seat.input, seq: seat.seq, toward: seat.input.toward, away: seat.input.away };
    });
    stepMatch(this.match, inputs, delta);
    if (this.match.phase === "match-over") { this.phase = "match-over"; this.announce(this.match.announcement); }
    else if (this.match.phase === "round-over") { this.phase = "round-over"; this.roundResetIn = 2.5; this.announce(this.match.announcement); }
  }

  snapshot() {
    return {
      phase: this.phase, stage: this.stage, countdown: Math.max(0, this.countdown), reconnectRemaining: Math.max(0, this.reconnectRemaining),
      roundResetIn: Math.max(0, this.roundResetIn), round: this.match.round, time: this.match.time,
      wins: [...this.match.wins], winner: this.match.winner,
      players: this.seats.map(({ sessionId, number, fighter, ready, connected }) => ({ id: sessionId, number, fighter, ready, connected })),
      fighters: this.match.players.map(({ inputHistory, lastInput, lastDirection, ...player }) => ({ ...player, inputHistory: undefined, lastInput: undefined })),
      event: { serial: this.eventSerial, text: this.event },
    };
  }
}
