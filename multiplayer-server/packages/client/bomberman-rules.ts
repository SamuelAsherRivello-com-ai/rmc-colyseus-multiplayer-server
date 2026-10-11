export interface BomberPlayer {id: string; x: number; y: number; alive: boolean; capacity: number; range: number; speed: number; speedLevel: number; glove: boolean; shieldUntil: number}
export interface Bomb {id: number;owner: string;x: number;y: number;range: number;deadline: number;pass: string[];sliding?: {dx: number;dy: number} | null;slideX?: number;slideY?: number}
export type Upgrade = "bomb" | "range" | "speed" | "glove" | "shield";
export interface Wave {cells: number[];warnTick: number;closeTick: number}
export type BomberEvent = {type: "push";bomb: number} | {type: "explosion";bomb: number;cells: number[]} | {type: "elimination";player: string;cause?: string} | {type: "pickup";player: string;cell: number;upgrade: Upgrade};
export interface BomberGame {width: number;height: number;mapSize: string;plantEnabled: boolean;chainReaction?: boolean;plants: number[];nextPlantTick: number;time: number;tick: number;board: number[];bombs: Bomb[];blasts: {id: number;cells: number[];until: number}[];nextBomb: number;paused: boolean;hidden: (Upgrade | null)[];pendingPowerups: {cell: number;type: Upgrade}[];powerups: {cell: number;type: Upgrade}[];warnings: Wave[];closed: number[];waves: Wave[];players: BomberPlayer[];events: BomberEvent[]}
export interface BomberInput {x?: number;y?: number;bomb?: boolean}
export const WIDTH = 15, HEIGHT = 13, STEP = 1 / 60;
export const MAP_SIZES: Record<string, [number,number]>={LOW:[15,13],MED:[19,15],HIGH:[23,17]};
export const index = (x: number, y: number, width=WIDTH) => y * width + x;
export const tile = (p: {x: number;y: number}): [number,number] => [Math.floor(p.x), Math.floor(p.y)];

export function suddenDeathWaves(board: readonly number[], width=WIDTH, height=HEIGHT) {
  const WIDTH=width,HEIGHT=height,index=(x: number,y: number)=>y*width+x;
  const mirroredCells=(x: number,y: number)=>[...new Set([index(x,y),index(WIDTH-1-x,y),index(x,HEIGHT-1-y),index(WIDTH-1-x,HEIGHT-1-y)])];
  const seen = new Set<number>(), waves: Wave[] = [];
  for (let ring = 1; ring < Math.ceil(Math.min(WIDTH,HEIGHT)/2); ring++) {
    const right = WIDTH - 1 - ring, bottom = HEIGHT - 1 - ring;
    const perimeter: [number,number][] = [];
    for (let x = ring; x <= right; x++) perimeter.push([x, ring]);
    for (let y = ring + 1; y <= bottom; y++) perimeter.push([right, y]);
    for (let x = right - 1; x >= ring; x--) perimeter.push([x, bottom]);
    for (let y = bottom - 1; y > ring; y--) perimeter.push([ring, y]);
    for (const [x, y] of perimeter) {
      const cells = mirroredCells(x, y).filter(i => !seen.has(i) && board[i] !== 1);
      if (!cells.length) continue;
      cells.forEach(i => seen.add(i));
      const warnTick = 5400 + waves.length * 45;
      waves.push({ cells, warnTick, closeTick: warnTick + 60 });
    }
  }
  const interval=Math.min(45,Math.floor(1740/Math.max(1,waves.length-1)));
  return waves.map((wave,n)=>({...wave,warnTick:5400+n*interval,closeTick:5460+n*interval}));
}

export function createGame(ids = ['practice'], seed = 1, mapSize='LOW', plant=false, chainReaction=false): BomberGame {
  const [WIDTH,HEIGHT]=MAP_SIZES[mapSize]||MAP_SIZES.LOW!,index=(x: number,y: number)=>y*WIDTH+x;
  const corners: [number,number][]=[[1,1],[WIDTH-2,HEIGHT-2],[WIDTH-2,1],[1,HEIGHT-2]];
  const mirroredCells=(x: number,y: number)=>[...new Set([index(x,y),index(WIDTH-1-x,y),index(x,HEIGHT-1-y),index(WIDTH-1-x,HEIGHT-1-y)])];
  const board = Array(WIDTH * HEIGHT).fill(0);
  const hidden = Array(WIDTH * HEIGHT).fill(null);
  let rng = seed >>> 0;
  const random = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const i = index(x, y);
    if (!x || !y || x === WIDTH - 1 || y === HEIGHT - 1 || (!(x % 2) && !(y % 2))) board[i] = 1;
  }
  let guaranteed = 0;
  const types: Upgrade[] = ['bomb', 'range', 'speed'];
  for (let y = 1; y <= Math.floor(HEIGHT/2); y++) for (let x = 1; x <= Math.floor(WIDTH/2); x++) {
    const cells = mirroredCells(x, y);
    if (board[index(x, y)] || corners.some(([cx, cy]) => Math.abs(cx - x) + Math.abs(cy - y) <= 2)) continue;
    const block = random() < .7;
    let upgrade: Upgrade | null = null;
    if (block) {
      if (guaranteed < types.length) upgrade = types[guaranteed++]!;
      else if (random() < .45) {const special=random();upgrade=special<.035?'glove':special<.075?'shield':types[Math.floor(random()*types.length)]!;}
    }
    for (const i of cells) { board[i] = block ? 2 : 0; hidden[i] = upgrade; }
  }
  const available=board.map((value,cell)=>!value&&corners.every(([x,y])=>Math.abs(cell%WIDTH-x)+Math.abs(Math.floor(cell/WIDTH)-y)>=4)&&([[1,0],[-1,0],[0,1],[0,-1]] as const).some(([dx,dy])=>board[index(cell%WIDTH+dx,Math.floor(cell/WIDTH)+dy)]===0)?cell:-1).filter(cell=>cell>=0);
  if (plant && !available.length) {
    // Carve a mirrored pair of central floor cells without disturbing starts.
    const x = Math.floor(WIDTH / 2), y = 1;
    for (const cell of [...mirroredCells(x, y), ...mirroredCells(x - 1, y)]) {
      if (board[cell] !== 1) { board[cell] = 0; hidden[cell] = null; }
    }
    available.push(index(x, y));
  }
  const plants=plant?[available[Math.floor(random()*available.length)]!]:[];
  return { width:WIDTH,height:HEIGHT,mapSize,plantEnabled:plant,...(chainReaction ? {chainReaction:true} : {}),plants,nextPlantTick:300,time: 0, tick: 0, board, bombs: [], blasts: [], nextBomb: 1, paused: false,
    hidden, pendingPowerups: [], powerups: [], warnings: [], closed: [], waves: suddenDeathWaves(board,WIDTH,HEIGHT),
    players: ids.map((id, n) => ({ id, x: corners[n]![0] + .5, y: corners[n]![1] + .5, alive: true, capacity: 1, range: 2, speed: 3, speedLevel: 0,glove:false,shieldUntil:0 })), events: [] };
}

function blocked(g: BomberGame, p: BomberPlayer, x: number, y: number) {
  const WIDTH=g.width||15,HEIGHT=g.height||13,index=(x: number,y: number)=>y*WIDTH+x;
  for (const dx of [-.28, .28]) for (const dy of [-.28, .28]) {
    const tx = Math.floor(x + dx), ty = Math.floor(y + dy);
    const cell=index(tx,ty),shielded=g.tick<(p.shieldUntil||0);
    const leavingClosed=shielded&&(g.closed||[]).includes(cell)&&[-.28,.28].some(dx=>[-.28,.28].some(dy=>index(Math.floor(p.x+dx),Math.floor(p.y+dy))===cell));
    if (tx < 0 || ty < 0 || tx >= WIDTH || ty >= HEIGHT || (g.board[cell]&&!leavingClosed) || g.plants.includes(cell)) return true;
    if (g.bombs.some(b => b.x === tx && b.y === ty && !b.pass.includes(p.id))) return true;
  }
  return false;
}

export function placeBomb(g: BomberGame, p: BomberPlayer | undefined) {
  if (!p?.alive || g.bombs.filter(b => b.owner === p.id).length >= p.capacity) return false;
  const [x, y] = tile(p);
  if (g.board[index(x, y,g.width||15)] || g.plants?.includes(index(x, y,g.width||15)) || g.bombs.some(b => b.x === x && b.y === y)) return false;
  g.bombs.push({ id: g.nextBomb++, owner: p.id, x, y, range: p.range, deadline: g.tick + 150,
    pass: g.players.filter(q => Math.abs(q.x - x - .5) < .78 && Math.abs(q.y - y - .5) < .78).map(q => q.id) });
  return true;
}

export function stepGame(g: BomberGame, inputs: Record<string, BomberInput> = {}) {
  if (g.paused) return;
  const WIDTH=g.width||15,HEIGHT=g.height||13,index=(x: number,y: number)=>y*WIDTH+x;
  g.tick++; g.time = g.tick * STEP; g.events = [];
  g.blasts = g.blasts.filter(b => b.until > g.tick);
  g.powerups ||= []; g.pendingPowerups ||= []; g.closed ||= [];
  g.plants ||= [];
  const dangerous = (cell: number) => g.blasts.some(b => b.cells.includes(cell));
  g.pendingPowerups = g.pendingPowerups.filter(item => {
    if (dangerous(item.cell)) return true;
    if (!g.board[item.cell]) g.powerups.push(item);
    return false;
  });
  for (const p of g.players) {
    if (!p.alive) continue;
    const input = inputs[p.id] || {};
    let dx = Math.sign(Number(input.x) || 0), dy = Math.sign(Number(input.y) || 0);
    const tx=Math.floor(p.x),ty=Math.floor(p.y),solid=(x: number,y: number)=>Boolean(g.board[index(x,y)])||g.plants.includes(index(x,y))||(!p.glove&&g.bombs.some(b=>b.x===x&&b.y===y&&!b.pass.includes(p.id)));
    // Keep the small collider for forgiving turns, but don't let it create
    // sideways wiggle inside a corridor bounded on both sides.
    if(solid(tx-1,ty)&&solid(tx+1,ty))dx=0;
    if(solid(tx,ty-1)&&solid(tx,ty+1))dy=0;
    if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
    const distance = p.speed * STEP;
    if(p.glove)for(const b of g.bombs){if(b.sliding||b.pass.includes(p.id))continue;const nx=p.x+dx*distance,ny=p.y+dy*distance;if([- .28,.28].some(ox=>[-.28,.28].some(oy=>Math.floor(nx+ox)===b.x&&Math.floor(ny+oy)===b.y))&&(dx||dy)){
      b.sliding={dx:dx?Math.sign(dx):0,dy:dx?0:Math.sign(dy)};b.slideX=b.x+.5;b.slideY=b.y+.5;b.pass=[];g.events.push({type:'push',bomb:b.id});
    }}
    // Gentle assistance aligns the perpendicular axis only through free space.
    if (dx && !dy) { const y = p.y + Math.sign(Math.floor(p.y) + .5 - p.y) * Math.min(Math.abs(Math.floor(p.y) + .5 - p.y), distance); if (!blocked(g, p, p.x, y)) p.y = y; }
    if (dy && !dx) { const x = p.x + Math.sign(Math.floor(p.x) + .5 - p.x) * Math.min(Math.abs(Math.floor(p.x) + .5 - p.x), distance); if (!blocked(g, p, x, p.y)) p.x = x; }
    if (!blocked(g, p, p.x + dx * distance, p.y)) p.x += dx * distance;
    if (!blocked(g, p, p.x, p.y + dy * distance)) p.y += dy * distance;
    for (const b of g.bombs) if (Math.abs(p.x - b.x - .5) >= .78 || Math.abs(p.y - b.y - .5) >= .78) b.pass = b.pass.filter(id => id !== p.id);
    if (input.bomb) placeBomb(g, p);
  }
  for(const b of g.bombs)if(b.sliding){const nx=b.slideX!+b.sliding.dx*6*STEP,ny=b.slideY!+b.sliding.dy*6*STEP,tx=Math.floor(nx+b.sliding.dx*.48),ty=Math.floor(ny+b.sliding.dy*.48),cell=index(tx,ty);
    if(tx<0||ty<0||tx>=WIDTH||ty>=HEIGHT||g.board[cell]||g.plants.includes(cell)||g.bombs.some(other=>other!==b&&other.x===tx&&other.y===ty)){
      b.sliding=null;b.deadline=g.tick;
    }else{b.slideX=nx;b.slideY=ny;b.x=Math.floor(nx);b.y=Math.floor(ny);}
  }
  if(g.plantEnabled&&g.tick>=g.nextPlantTick){const grown=new Set(g.plants);for(const cell of g.plants){const x=cell%WIDTH,y=Math.floor(cell/WIDTH);for(const [dx,dy] of ([[1,0],[-1,0],[0,1],[0,-1]] as const)){const next=index(x+dx,y+dy);if(x+dx>0&&x+dx<WIDTH-1&&y+dy>0&&y+dy<HEIGHT-1&&!g.board[next]&&!g.bombs.some(b=>b.x===x+dx&&b.y===y+dy)&&!g.players.some(p=>p.alive&&[-.28,.28].some(ox=>[-.28,.28].some(oy=>index(Math.floor(p.x+ox),Math.floor(p.y+oy))===next)))&&!dangerous(next))grown.add(next);}}g.plants=[...grown];g.nextPlantTick=g.tick+300;g.powerups=g.powerups.filter(item=>!grown.has(item.cell));}
  g.warnings = (g.waves || []).filter(w => w.warnTick <= g.tick && w.closeTick > g.tick);
  const closing = new Set((g.waves || []).filter(w => w.closeTick === g.tick).flatMap(w => w.cells));
  if (closing.size) {
    for (const cell of closing) { g.board[cell] = 1; g.closed.push(cell); }
    g.bombs = g.bombs.filter(b => !closing.has(index(b.x, b.y)));
    g.powerups = g.powerups.filter(item => !closing.has(item.cell));
    g.plants=g.plants.filter(cell=>!closing.has(cell));
    g.pendingPowerups = g.pendingPowerups.filter(item => !closing.has(item.cell));
    for (const b of g.blasts) b.cells = b.cells.filter(cell => !closing.has(cell));
    for (const p of g.players) if (p.alive && g.tick>=(p.shieldUntil||0) && [-.28, .28].some(dx => [-.28, .28].some(dy => closing.has(index(Math.floor(p.x + dx), Math.floor(p.y + dy)))))) {
      p.alive = false;p.glove=false; g.events.push({ type: 'elimination', player: p.id, cause: 'wall' });
    }
  }
  const queue = g.bombs.filter((b) => !b.sliding && b.deadline <= g.tick),
    detonated = new Map<number, Bomb>(),
    geometry = [...g.board],
    destroyed = new Set<number>(),
    plantGeometry = new Set(g.plants),
    cutPlants = new Set<number>();
  const trace = (bomb: Bomb, fullRange: boolean | undefined) => {
    const cells = [index(bomb.x, bomb.y)],
      triggered = [],
      blocks = new Set<number>(),
      plants = new Set<number>();
    if (plantGeometry.has(cells[0]!)) plants.add(cells[0]!);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const)
      for (let n = 1; n <= (fullRange ? Math.max(WIDTH, HEIGHT) : bomb.range); n++) {
        const x = bomb.x + dx * n,
          y = bomb.y + dy * n;
        if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) break;
        const i = index(x, y);
        if (geometry[i] === 1) break;
        cells.push(i);
        const other = g.bombs.find((b) => b.x === x && b.y === y);
        if (other) triggered.push(other);
        if (plantGeometry.has(i)) {
          plants.add(i);
          break;
        }
        if (geometry[i] === 2) {
          blocks.add(i);
          break;
        }
      }
    return { cells, triggered, blocks, plants };
  };
  while (queue.length) {
    const bomb = queue.shift()!;
    if (detonated.has(bomb.id)) continue;
    detonated.set(bomb.id, bomb);
    queue.push(...trace(bomb, false).triggered);
  }
  if (g.chainReaction && detonated.size >= 2) {
    // An extended ray can reach another bomb, so expand until no new bombs join this tick.
    const expanded = new Set();
    const pending = [...detonated.values()];
    while (pending.length) {
      const bomb = pending.shift()!;
      if (expanded.has(bomb.id)) continue;
      expanded.add(bomb.id);
      for (const other of trace(bomb, true).triggered)
        if (!detonated.has(other.id)) {
          detonated.set(other.id, other);
          pending.push(other);
        }
    }
  }
  for (const bomb of detonated.values()) {
    const { cells, blocks, plants } = trace(bomb, g.chainReaction && detonated.size >= 2);
    for (const cell of blocks) destroyed.add(cell);
    for (const cell of plants) cutPlants.add(cell);
    g.blasts.push({ id: bomb.id, cells, until: g.tick + 30 });
    g.events.push({ type: 'explosion', bomb: bomb.id, cells });
  }
  for (const i of destroyed) {
    g.board[i] = 0;
    if (g.hidden?.[i]) { g.pendingPowerups.push({ cell: i, type: g.hidden[i]! }); g.hidden[i] = null; }
  }
  g.bombs = g.bombs.filter(b => !detonated.has(b.id));
  g.plants=g.plants.filter(cell=>!cutPlants.has(cell));
  for (const p of g.players) if (p.alive) {
    const touched = [-.28, .28].some(dx => [-.28, .28].some(dy => {const cell=index(Math.floor(p.x+dx),Math.floor(p.y+dy));return g.blasts.some(b=>b.cells.includes(cell))||g.closed.includes(cell);}));
    if (touched&&g.tick>=(p.shieldUntil||0)) { p.alive = false;p.glove=false; g.events.push({ type: 'elimination', player: p.id }); }
  }
  g.powerups = g.powerups.filter(item => !dangerous(item.cell));
  for (const p of g.players) if (p.alive) {
    const cell = index(...tile(p)), item = g.powerups.find(q => q.cell === cell);
    if (!item) continue;
    if (item.type === 'bomb') p.capacity = Math.min(5, p.capacity + 1);
    if (item.type === 'range') p.range = Math.min(8, p.range + 1);
    if (item.type === 'speed') { p.speedLevel = Math.min(3, (p.speedLevel || 0) + 1); p.speed = 3 * (1 + .15 * p.speedLevel); }
    if(item.type==='glove')p.glove=true;
    if(item.type==='shield')p.shieldUntil=g.tick+600;
    g.powerups = g.powerups.filter(q => q !== item);
    g.events.push({ type: 'pickup', player: p.id, cell, upgrade: item.type });
  }
}
