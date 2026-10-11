export type FighterId = "ryu" | "chunLi" | "kaida";
export interface AttackDefinition { label?: string; input?: string; damage: number; reach: number; startup: number; active: number; recovery: number; stun: number; height: string; projectile?: boolean; airborne?: boolean; advancing?: boolean; hits?: number; counter?: boolean }
export const FIGHTERS = Object.freeze({
  ryu: Object.freeze({ id: "ryu", name: "RYU", title: "The Wandering Warrior", color: "#f4eee4", trim: "#d94738", role: "Balanced", moves: Object.freeze(["Hadouken", "Shoryuken", "Tatsumaki Senpukyaku"]) }),
  chunLi: Object.freeze({ id: "chunLi", name: "CHUN-LI", title: "The Strongest Woman", color: "#2777d0", trim: "#f2c84b", role: "Speed", moves: Object.freeze(["Hyakuretsukyaku", "Spinning Bird Kick", "Lightning Step"]) }),
  kaida: Object.freeze({ id: "kaida", name: "KAIDA", title: "The Ember Comet", color: "#8e4bba", trim: "#f08842", role: "Trickster", moves: Object.freeze(["Cinder Arc", "Comet Heel", "Ashen Counter"]) }),
});

export const ATTACKS = Object.freeze({
  lightPunch: { label: "LP", damage: 4, reach: 105, startup: 3, active: 4, recovery: 10, stun: 12, height: "high" },
  mediumPunch: { label: "MP", damage: 7, reach: 120, startup: 5, active: 4, recovery: 15, stun: 18, height: "high" },
  heavyPunch: { label: "HP", damage: 11, reach: 140, startup: 8, active: 5, recovery: 22, stun: 26, height: "high" },
  lightKick: { label: "LK", damage: 5, reach: 135, startup: 4, active: 5, recovery: 12, stun: 14, height: "low" },
  mediumKick: { label: "MK", damage: 8, reach: 165, startup: 7, active: 5, recovery: 18, stun: 20, height: "low" },
  heavyKick: { label: "HK", damage: 13, reach: 195, startup: 10, active: 5, recovery: 25, stun: 30, height: "low" },
});

export const SPECIALS: Readonly<Record<FighterId, Readonly<Record<string, AttackDefinition>>>> = Object.freeze({
  ryu: Object.freeze({ hadouken: { input: "↓ ↘ → + P", damage: 12, reach: 650, startup: 12, active: 2, recovery: 24, stun: 22, height: "high", projectile: true }, shoryuken: { input: "→ ↓ ↘ + P", damage: 17, reach: 185, startup: 5, active: 12, recovery: 32, stun: 38, height: "high", airborne: true }, tatsumaki: { input: "↓ ↙ ← + K", damage: 14, reach: 210, startup: 7, active: 16, recovery: 28, stun: 30, height: "mid", advancing: true } }),
  chunLi: Object.freeze({ hyakuretsu: { input: "Rapid K", damage: 3, hits: 4, reach: 160, startup: 5, active: 18, recovery: 20, stun: 8, height: "low" }, spinningBird: { input: "↓ ↑ + K", damage: 16, reach: 185, startup: 8, active: 16, recovery: 29, stun: 34, height: "high", airborne: true }, lightningStep: { input: "→ → + K", damage: 10, reach: 215, startup: 6, active: 5, recovery: 22, stun: 20, height: "mid", advancing: true } }),
  kaida: Object.freeze({ cinderArc: { input: "↓ ↘ → + P", damage: 11, reach: 560, startup: 14, active: 2, recovery: 25, stun: 20, height: "high", projectile: true }, cometHeel: { input: "→ ↓ ↘ + K", damage: 15, reach: 220, startup: 7, active: 9, recovery: 28, stun: 32, height: "mid", advancing: true }, ashenCounter: { input: "← → + P", damage: 18, reach: 145, startup: 2, active: 8, recovery: 32, stun: 38, height: "mid", counter: true } }),
});
