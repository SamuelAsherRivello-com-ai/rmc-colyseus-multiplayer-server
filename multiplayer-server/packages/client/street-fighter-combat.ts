import type { FighterId, AttackDefinition } from "./street-fighter-fighters.js";
export interface FighterInput { away?: boolean | undefined; toward?: boolean | undefined; up?: boolean; down?: boolean; jump?: boolean; run?: boolean; punch?: false | "light" | "medium" | "heavy"; kick?: false | "light" | "medium" | "heavy" }
export interface Attack extends AttackDefinition { type: string; pose?: string }
export interface FighterState { id: FighterId; x: number; y: number; vx: number; vy: number; health: number; rounds: number; facing: number; crouching: boolean; airborne: boolean; stun: number; blockStun: number; attack: Attack | null; projectile: {x: number; y: number; vx: number; startup: number; attack: Attack; owner: FighterId} | null; attackTick: number; attackSpent: boolean; attackHits?: number; hitFlash: number; guarding: boolean; inputHistory: {direction: string; punch: boolean; kick: boolean; time: number}[]; lastInput: FighterInput; lastDirection: string }
export interface FighterMatch { phase: string; fighters: FighterId[]; players: [FighterState, FighterState]; time: number; roundSeconds: number; round: number; wins: [number, number]; elapsed: number; announcement: string; event: string; eventUntil: number; winner: string | null; paused: boolean; roundWinner?: string }
import { ATTACKS, FIGHTERS, SPECIALS } from "./street-fighter-fighters.js";

export const STAGE = Object.freeze({ width: 960, floor: 520, minX: 82, maxX: 878, fighterWidth: 54, fighterHeight: 112 });
export const ROUND_SECONDS = 99;
export const FIXED_STEP = 1 / 60;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function fighterState(id: FighterId, x: number, facing: number): FighterState {
  return { id, x, y: STAGE.floor, vx: 0, vy: 0, health: 100, rounds: 0, facing, crouching: false, airborne: false, stun: 0, blockStun: 0, attack: null, projectile: null, attackTick: 0, attackSpent: false, hitFlash: 0, guarding: false, inputHistory: [], lastInput: {}, lastDirection: "·" };
}

export function createMatch({ fighters = ["ryu", "chunLi"], roundSeconds = ROUND_SECONDS }: {fighters?: FighterId[]; roundSeconds?: number} = {}): FighterMatch {
  return { phase: "select", fighters, players: [fighterState(fighters[0]!, 260, 1), fighterState(fighters[1]!, 700, -1)], time: roundSeconds, roundSeconds, round: 1, wins: [0, 0], elapsed: 0, announcement: "SELECT YOUR FIGHTER", event: "", eventUntil: 0, winner: null, paused: false };
}

export function startMatch(match: FighterMatch) {
  match.phase = "fight"; match.announcement = "FIGHT!"; match.eventUntil = match.elapsed + 1;
  return match;
}

function beginAttack(player: FighterState, type: string, definition: AttackDefinition) {
  const kickMoves = ["lightKick", "mediumKick", "heavyKick", "tatsumaki", "hyakuretsu", "spinningBird", "lightningStep", "cometHeel"];
  player.attack = { type, pose: kickMoves.includes(type) ? "kick" : "punch", ...definition }; player.attackTick = 0; player.attackSpent = false; player.attackHits = 0;
  if (definition.projectile) player.projectile = { x: player.x + player.facing * 42, y: player.y - 62, vx: player.facing * 820, startup: definition.startup, attack: { ...definition, type }, owner: player.id };
  if (definition.airborne && !player.airborne) { player.vy = -430; player.airborne = true; }
  if (definition.advancing) player.vx = player.facing * 235;
}

function inputDirection(input: FighterInput, facing: number) {
  if (input.down && input.toward) return "↘";
  if (input.down && input.away) return "↙";
  if (input.down) return "↓";
  if (input.up) return "↑";
  if (input.toward) return "→";
  if (input.away) return "←";
  return "·";
}

function resolveMove(player: FighterState, input: FighterInput) {
  const hist = player.inputHistory;
  const d = inputDirection(input, player.facing);
  const fighterSpecials = SPECIALS[player.id] ?? {};
  for (const [key, move] of Object.entries(fighterSpecials)) {
    const isKick = ["tatsumaki", "hyakuretsu", "spinningBird", "lightningStep", "cometHeel"].includes(key);
    const button = isKick ? input.kick : input.punch;
    const motion = key === "spinningBird" ? ["↓", "↑"] : key === "lightningStep" ? ["→", "→"] : key === "ashenCounter" ? ["←", "→"] : ["↓", "↘", "→"];
    if (key === "shoryuken" || key === "cometHeel") motion.splice(0, motion.length, "→", "↓", "↘");
    if (key === "tatsumaki") motion.splice(0, motion.length, "↓", "↙", "←");
    const motionFound = (() => { let index = 0; for (const entry of hist.slice(-8)) if (entry.direction === motion[index]) index++; return index === motion.length; })();
    const rapidKick = key === "hyakuretsu" && input.kick && hist.slice(-8).filter((item) => item.kick).length >= 3;
    if (button && (motionFound || rapidKick)) { beginAttack(player, key, move); hist.length = 0; return true; }
  }
  if (!player.attack) {
    const basic = input.punch === "heavy" ? "heavyPunch" : input.punch === "medium" ? "mediumPunch" : input.punch ? "lightPunch" : input.kick === "heavy" ? "heavyKick" : input.kick === "medium" ? "mediumKick" : input.kick ? "lightKick" : null;
    if (basic) { beginAttack(player, basic, ATTACKS[basic]); return true; }
  }
  return false;
}

export function stepMatch(match: FighterMatch, inputs: FighterInput[] = [{}, {}], dt = FIXED_STEP) {
  if (match.paused || match.phase !== "fight") return match;
  const frame = Math.min(dt, 0.05); match.elapsed += frame; match.time = Math.max(0, match.time - frame);
  const [a, b] = match.players;
  const pendingHits = [];
  a.facing = a.x <= b.x ? 1 : -1; b.facing = -a.facing;

  for (let i = 0; i < 2; i++) {
    const p = match.players[i]!, enemy = match.players[1 - i]!, input = inputs[i] ?? {};
    const previousInput = p.lastInput;
    const direction = inputDirection(input, p.facing);
    const directionChanged = direction !== p.lastDirection;
    const punchPressed = Boolean(input.punch) && !Boolean(previousInput.punch);
    const kickPressed = Boolean(input.kick) && !Boolean(previousInput.kick);
    if (directionChanged || punchPressed || kickPressed) p.inputHistory.push({ direction: directionChanged ? direction : "·", punch: punchPressed, kick: kickPressed, time: match.elapsed });
    p.lastInput = input;
    p.lastDirection = direction;
    if (p.inputHistory.length > 12) p.inputHistory.shift();
    p.guarding = Boolean(input.away && !p.airborne);
    p.crouching = Boolean(input.down && !p.airborne);
    if (p.hitFlash > 0) p.hitFlash--;
    if (p.stun > 0) { p.stun--; p.vx *= 0.82; }
    else if (p.blockStun > 0) { p.blockStun--; p.vx *= 0.8; }
    else {
      if (input.jump && !p.airborne) { p.vy = -465; p.airborne = true; }
      const axis = (Number(Boolean(input.toward)) - Number(Boolean(input.away))) * p.facing;
      if (!p.attack || p.attackTick >= p.attack.startup + p.attack.active) p.vx = axis * (input.run ? 265 : 190);
      if (input.punch || input.kick) resolveMove(p, input);
    }
    if (p.attack) {
      const attack = p.attack; p.attackTick++;
      const hitLimit = attack.hits ?? 1;
      const multiHitReady = (p.attackHits ?? 0) < hitLimit && (p.attackHits === 0 || p.attackTick >= attack.startup + Math.floor(attack.active * (p.attackHits ?? 0) / hitLimit));
      if (!attack.projectile && !p.attackSpent && multiHitReady && p.attackTick >= attack.startup && p.attackTick < attack.startup + attack.active) {
        const distance = (enemy.x - p.x) * p.facing;
        const inReach = distance >= -20 && distance <= attack.reach;
        const airtime = STAGE.floor - enemy.y;
        const verticalOk = attack.height === "high" ? (!enemy.crouching && (!enemy.airborne || airtime <= 120)) : attack.height === "low" ? (!enemy.airborne || airtime <= 55) : true;
        if (inReach && verticalOk && (!attack.counter || (enemy.attack && enemy.attackTick >= enemy.attack.startup && enemy.attackTick < enemy.attack.startup + enemy.attack.active))) {
          p.attackSpent = true;
          p.attackHits = (p.attackHits ?? 0) + 1;
          pendingHits.push({ attacker: p, defender: enemy, attack });
        }
      }
      if ((p.attackHits ?? 0) < hitLimit) p.attackSpent = false;
      if (p.attackTick >= attack.startup + attack.active + attack.recovery) p.attack = null;
    }
    if (p.airborne) { p.vy += 1120 * frame; p.y += p.vy * frame; if (p.y >= STAGE.floor) { p.y = STAGE.floor; p.vy = 0; p.airborne = false; } }
    p.x = clamp(p.x + p.vx * frame, STAGE.minX, STAGE.maxX);
    p.vx *= p.stun > 0 || p.blockStun > 0 ? 0.9 : 0.75;
  }

  for (const attacker of match.players) {
    const projectile = attacker.projectile;
    if (!projectile) continue;
    const defender = match.players.find((player) => player !== attacker)!; // The match always has two distinct fighters.
    if (projectile.startup > 0) { projectile.startup--; continue; }
    const previousX = projectile.x;
    projectile.x += projectile.vx * frame;
    const crossed = projectile.vx > 0
      ? previousX <= defender.x + STAGE.fighterWidth / 2 && projectile.x >= defender.x - STAGE.fighterWidth / 2
      : previousX >= defender.x - STAGE.fighterWidth / 2 && projectile.x <= defender.x + STAGE.fighterWidth / 2;
    const verticalOk = projectile.attack.height === "high" ? !defender.crouching && (!defender.airborne || STAGE.floor - defender.y <= 120) : true;
    if (crossed && verticalOk) {
      pendingHits.push({ attacker, defender, attack: projectile.attack });
      attacker.projectile = null;
    } else if (projectile.x < 0 || projectile.x > STAGE.width) attacker.projectile = null;
  }

  for (const { attacker, defender, attack } of pendingHits) {
    const blocked = defender.guarding && (defender.facing === -attacker.facing || (attack.height === "low" && defender.crouching));
    const dealt = blocked ? Math.max(1, Math.ceil(attack.damage * 0.15)) : attack.damage;
    defender.health = Math.max(0, defender.health - dealt); defender.vx = attacker.facing * (blocked ? 75 : 190); defender.hitFlash = blocked ? 3 : 7;
    if (blocked) defender.blockStun = attack.stun; else { defender.stun = attack.stun; if (attack.airborne) defender.vy = -165; }
    match.event = blocked ? "BLOCK!" : `${FIGHTERS[attacker.id].name} ${attack.type.toUpperCase()}!`; match.eventUntil = match.elapsed + 0.8;
  }

  const overlap = (STAGE.fighterWidth - Math.abs(a.x - b.x)) / 2;
  if (overlap > 0) { const push = overlap / 2; a.x = clamp(a.x - a.facing * push, STAGE.minX, STAGE.maxX); b.x = clamp(b.x - b.facing * push, STAGE.minX, STAGE.maxX); }

  let outcome = null;
  if (a.health <= 0 && b.health <= 0) outcome = "draw";
  else if (a.health <= 0) outcome = "p2";
  else if (b.health <= 0) outcome = "p1";
  else if (match.time <= 0) outcome = a.health === b.health ? "draw" : a.health > b.health ? "p1" : "p2";
  if (outcome) finishRound(match, outcome);
  return match;
}

function finishRound(match: FighterMatch, outcome: string) {
  match.phase = "round-over"; match.roundWinner = outcome; match.announcement = outcome === "draw" ? "DRAW GAME" : `${outcome === "p1" ? FIGHTERS[match.players[0].id].name : FIGHTERS[match.players[1].id].name} WINS`;
  if (outcome !== "draw") match.wins[outcome === "p1" ? 0 : 1]++;
  const matchWon = match.wins.some((wins) => wins >= 2);
  if (matchWon) { match.phase = "match-over"; match.winner = outcome; match.announcement += " — CHAMPION"; return; }
  match.round++;
  match.eventUntil = match.elapsed + 2.5;
}

export function resetRound(match: FighterMatch) {
  if (match.phase === "match-over") return createMatch({ fighters: match.fighters, roundSeconds: match.roundSeconds });
  match.players = [fighterState(match.fighters[0]!, 260, 1), fighterState(match.fighters[1]!, 700, -1)];
  match.time = match.roundSeconds; match.phase = "fight"; match.announcement = `ROUND ${match.round} — FIGHT!`; match.eventUntil = match.elapsed + 1;
  return match;
}

export function getMoveList(id: FighterId) {
  const special = Object.entries(SPECIALS[id] ?? {}).map(([name, data]) => ({ name, input: data.input, damage: data.damage }));
  return [...Object.entries(ATTACKS).map(([name, data]) => ({ name, input: data.label, damage: data.damage })), ...special];
}
