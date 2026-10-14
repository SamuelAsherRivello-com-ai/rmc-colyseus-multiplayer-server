export const HABITAT_WIDTH = 18;
export const HABITAT_HEIGHT = 12;
export const HABITAT_TIME_SCALES = [0.5, 1, 2, 4, 10] as const;

export type HabitatTimeScale = (typeof HABITAT_TIME_SCALES)[number];
export type RabbitState = "idle" | "wander" | "seekCarrot" | "moveToCarrot" | "eatCarrot" | "hide" | "rest";
export type Point = { x: number; y: number };
export type Plot = Point & { stage: "seedling" | "mature"; plantedAt: number };
export type HabitatRabbit = Point & { id: string; state: RabbitState; target?: Point; stateUntil: number };
export type HabitatState = { elapsed: number; timeScale: HabitatTimeScale; seed: number; plots: Plot[]; rabbits: HabitatRabbit[] };
export type HabitatAction = { type: "plant"; point: Point } | { type: "speed"; scale: HabitatTimeScale };

export function initialHabitatState(): HabitatState {
  return { elapsed: 0, timeScale: 1, seed: 123456, plots: [], rabbits: [
    { id: "hazel", x: 5, y: 5, state: "idle", stateUntil: 1.2 },
    { id: "poppy", x: 13, y: 6, state: "wander", stateUntil: 0.8 },
  ] };
}

function terrainAt(point: Point) {
  if (point.x < 0 || point.y < 0 || point.x >= HABITAT_WIDTH || point.y >= HABITAT_HEIGHT) return "water";
  if (point.x === 0 || point.y === 0 || point.x === HABITAT_WIDTH - 1 || point.y === HABITAT_HEIGHT - 1) return "water";
  if ((point.x === 8 || point.x === 9) && point.y > 1 && point.y < HABITAT_HEIGHT - 2) return "path";
  if ((point.x === 3 && point.y === 3) || (point.x === 14 && point.y === 8) || (point.x === 4 && point.y === 9)) return "bush";
  return (point.x + point.y) % 7 === 0 ? "soil" : "grass";
}

export function plant(state: HabitatState, point: Point) {
  const terrain = terrainAt(point);
  if ((terrain !== "grass" && terrain !== "soil") || state.plots.some(plot => samePoint(plot, point))) return false;
  state.plots.push({ ...point, stage: "seedling", plantedAt: state.elapsed });
  return true;
}

export function setTimeScale(state: HabitatState, timeScale: HabitatTimeScale) { state.timeScale = timeScale; }

export function advance(state: HabitatState, wallSeconds: number) {
  const end = state.elapsed + Math.max(0, wallSeconds) * state.timeScale;
  while (state.elapsed + 0.1 <= end + 0.00001) {
    state.elapsed = Math.round((state.elapsed + 0.1) * 10) / 10;
    for (const plot of state.plots) if (plot.stage === "seedling" && state.elapsed - plot.plantedAt >= 20) plot.stage = "mature";
    for (const rabbit of state.rabbits) updateRabbit(state, rabbit);
  }
}

function updateRabbit(state: HabitatState, rabbit: HabitatRabbit) {
  if (rabbit.state === "eatCarrot" && state.elapsed >= rabbit.stateUntil) { rabbit.state = "idle"; rabbit.stateUntil = state.elapsed + 1; delete rabbit.target; return; }
  if ((rabbit.state === "idle" || rabbit.state === "rest" || rabbit.state === "hide") && state.elapsed >= rabbit.stateUntil) return decide(state, rabbit);
  if (rabbit.state === "seekCarrot") {
    if (!rabbit.target || !maturePlots(state).some(plot => samePoint(plot, rabbit.target!))) { delete rabbit.target; rabbit.state = "wander"; rabbit.stateUntil = state.elapsed + 0.8; return; }
    rabbit.state = "moveToCarrot"; rabbit.stateUntil = state.elapsed; return;
  }
  if (rabbit.state === "moveToCarrot" && rabbit.target && state.elapsed >= rabbit.stateUntil) {
    if (!maturePlots(state).some(plot => samePoint(plot, rabbit.target!))) { delete rabbit.target; rabbit.state = "idle"; rabbit.stateUntil = state.elapsed + 0.5; return; }
    if (samePoint(rabbit, rabbit.target)) { state.plots = state.plots.filter(plot => !samePoint(plot, rabbit.target!)); rabbit.state = "eatCarrot"; rabbit.stateUntil = state.elapsed + 1.2; return; }
    stepToward(rabbit, rabbit.target); rabbit.stateUntil = state.elapsed + 0.28; return;
  }
  if (rabbit.state === "wander" && rabbit.target && state.elapsed >= rabbit.stateUntil) {
    if (samePoint(rabbit, rabbit.target)) { rabbit.state = "idle"; rabbit.stateUntil = state.elapsed + 0.8; return; }
    stepToward(rabbit, rabbit.target); rabbit.stateUntil = state.elapsed + 0.36;
  }
}

function decide(state: HabitatState, rabbit: HabitatRabbit) {
  const food = maturePlots(state);
  if (food.length > 0 && nextRandom(state) < 0.68) {
    const target = food[Math.floor(nextRandom(state) * food.length)];
    if (target) { rabbit.target = { x: target.x, y: target.y }; rabbit.state = "seekCarrot"; rabbit.stateUntil = state.elapsed + 0.1; return; }
  }
  const roll = nextRandom(state);
  if (roll < 0.18) { rabbit.state = "rest"; rabbit.stateUntil = state.elapsed + 2; return; }
  if (roll < 0.33) { rabbit.state = "hide"; rabbit.stateUntil = state.elapsed + 2; return; }
  rabbit.state = "wander";
  rabbit.target = { x: 2 + Math.floor(nextRandom(state) * (HABITAT_WIDTH - 4)), y: 2 + Math.floor(nextRandom(state) * (HABITAT_HEIGHT - 4)) };
  rabbit.stateUntil = state.elapsed + 0.25;
}

function maturePlots(state: HabitatState) { return state.plots.filter(plot => plot.stage === "mature"); }
function samePoint(a: Point, b: Point) { return a.x === b.x && a.y === b.y; }
function stepToward(rabbit: HabitatRabbit, target: Point) { if (rabbit.x !== target.x) rabbit.x += Math.sign(target.x - rabbit.x); else if (rabbit.y !== target.y) rabbit.y += Math.sign(target.y - rabbit.y); }
function nextRandom(state: HabitatState) { state.seed = (state.seed * 1664525 + 1013904223) >>> 0; return state.seed / 0x1_0000_0000; }
