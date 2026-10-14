/** Public protocol types for the server-authoritative Just Like Rabbits room. */
export const JUST_LIKE_RABBITS_TIME_SCALES = [0.5, 1, 2, 4, 10] as const;

export type JustLikeRabbitsTimeScale = (typeof JUST_LIKE_RABBITS_TIME_SCALES)[number];
export type JustLikeRabbitsRabbitState = "idle" | "wander" | "seekCarrot" | "moveToCarrot" | "eatCarrot" | "hide" | "rest";
export type JustLikeRabbitsPoint = { x: number; y: number };
export type JustLikeRabbitsPlot = JustLikeRabbitsPoint & { stage: 0 | 1 | 2 | 3; plantedAt: number };
export type JustLikeRabbitsRabbit = JustLikeRabbitsPoint & { id: string; kind: "resident" | "bot"; state: JustLikeRabbitsRabbitState; target?: JustLikeRabbitsPoint; stateUntil: number };
export type JustLikeRabbitsState = { elapsed: number; timeScale: JustLikeRabbitsTimeScale; seed: number; cultivated: JustLikeRabbitsPoint[]; plots: JustLikeRabbitsPlot[]; carrots: JustLikeRabbitsPoint[]; rabbits: JustLikeRabbitsRabbit[] };
export type JustLikeRabbitsActions = {
  action: { type: "plant"; payload: { x: number; z: number } } | { type: "speed"; payload: JustLikeRabbitsTimeScale };
  heartbeat: undefined;
  snapshot: undefined;
};
