import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, placeBomb, index, type BomberInput, type BomberGame } from '../packages/client/bomberman-rules.js';
const advance = (g: BomberGame, ticks: number, input?: Record<string,BomberInput>) => { for (let n = 0; n < ticks; n++) stepGame(g, input); };

test('arena is symmetric with clear equal escape routes', () => {
  const g = createGame();
  assert.equal(g.board.length, 195);
  assert.deepEqual(g.board, [...g.board].reverse());
  for (const [x, y] of [[1,1],[13,11],[13,1],[1,11]]) assert.equal(g.board[index(x!,y!)], 0);
});
test('collision prevents walking through outer walls', () => {
  const g = createGame(); advance(g, 180, { practice: { x: -1 } });
  assert.ok(g.players[0]!.x >= 1.28);
});
test('plants block movement without eliminating players or growing into them', () => {
  const g = createGame();
  g.board = g.board.map(value => value === 2 ? 0 : value);
  const p = g.players[0]!;
  g.plants = [index(2, 1)];
  advance(g, 30, { practice: { x: 1 } });
  assert.ok(p.x <= 1.72);
  assert.equal(p.alive, true);
  p.x = 2.5;
  assert.equal(placeBomb(g, p), false);
  stepGame(g);
  assert.equal(p.alive, true);

  p.x = 5.5;
  p.y = 6.5;
  g.plants = [index(5, 5)];
  g.plantEnabled = true;
  g.nextPlantTick = g.tick + 1;
  g.board[index(4, 5)] = 2;
  g.bombs = [{ id: 1, owner: 'practice', x: 6, y: 5, range: 1, deadline: 150, pass: [] }];
  g.blasts = [{ id: 2, cells: [index(5, 4)], until: g.tick + 30 }];
  stepGame(g);
  assert.deepEqual(g.plants, [index(5, 5)]);
  assert.equal(p.alive, true);
});
test('bomb capacity, fuse, owner damage and blast duration', () => {
  const g = createGame(), p = g.players[0]!;
  assert.equal(placeBomb(g,p),true); assert.equal(placeBomb(g,p),false);
  advance(g,149); assert.equal(g.bombs.length,1); assert.equal(p.alive,true);
  advance(g,1); assert.equal(g.bombs.length,0); assert.equal(p.alive,false); assert.equal(g.blasts.length,1);
  advance(g,30); assert.equal(g.blasts.length,0);
});
test('owner leaves bomb but cannot reenter', () => {
  const g = createGame(), p = g.players[0]!; placeBomb(g,p);
  advance(g,25,{practice:{x:1}}); assert.ok(p.x > 2.28);
  advance(g,25,{practice:{x:-1}}); assert.ok(p.x >= 2.28);
});
test('chain detonates once and destruction blocks that tick rays', () => {
  const g = createGame(); g.board.fill(0); const p = g.players[0]!; p.capacity=2;
  p.x=3.5;p.y=3.5; placeBomb(g,p);p.x=5.5;placeBomb(g,p);
  g.bombs[0]!.deadline=1;g.board[index(6,3)]=2;p.x=10.5;p.y=10.5;
  stepGame(g); assert.equal(g.bombs.length,0);assert.equal(g.blasts.length,2);
  assert.equal(g.board[index(6,3)],0);assert.ok(!g.blasts.some(b=>b.cells.includes(index(7,3))));
});
test('pause and restart have no stale clock or bomb state', () => {
  const g=createGame();placeBomb(g,g.players[0]);g.paused=true;advance(g,200);assert.equal(g.tick,0);
  g.paused=false;advance(g,1);assert.equal(g.tick,1);
  const fresh=createGame();advance(fresh,200);assert.equal(fresh.bombs.length,0);assert.equal(fresh.players[0]!.alive,true);
});
test('same seeded input stream produces identical outcomes', () => {
  const a=createGame(['a','b'],42),b=createGame(['a','b'],42);
  for(let n=0;n<240;n++){const input={a:{x:n<60?1:0,bomb:n===80}};stepGame(a,input);stepGame(b,input);}
  assert.deepEqual(a,b);
});

test('all four starts have mirrored blocks and hidden upgrade opportunities', () => {
  for (const seed of [1, 2, 42, 123456]) {
    const g = createGame(['a', 'b', 'c', 'd'], seed);
    for (let y = 0; y < 13; y++) for (let x = 0; x < 15; x++) {
      for (const opposite of [index(14-x,y), index(x,12-y)]) {
        assert.equal(g.board[index(x,y)], g.board[opposite]);
        assert.equal(g.hidden[index(x,y)], g.hidden[opposite]);
      }
    }
    const upgrades = new Set(g.hidden.filter(Boolean));
    for (const type of (['bomb','range','speed'] as const)) assert.ok(upgrades.has(type));
    assert.ok([...upgrades].every(type => ['bomb','range','speed','glove','shield'].includes(type!)));
    for (const p of g.players) {
      const x=Math.floor(p.x),y=Math.floor(p.y);
      const exits=[[x===1?1:-1,0],[0,y===1?1:-1]];
      for (const [dx,dy] of exits) for(let n=0;n<=2;n++) assert.equal(g.board[index(x+dx!*n,y+dy!*n)],0);
    }
  }
});

test('hidden upgrade waits for all blasts, then later explosions destroy exposed items',()=>{
  const g=createGame(),p=g.players[0]!,cell=index(5,3);g.board.fill(0);g.hidden.fill(null);
  g.board[cell]=2;g.hidden[cell]='range';p.x=3.5;p.y=3.5;placeBomb(g,p);g.bombs[0]!.deadline=1;p.x=10.5;p.y=10.5;
  stepGame(g);assert.equal(g.board[cell],0);assert.equal(g.powerups.length,0);assert.deepEqual(g.pendingPowerups,[{cell,type:'range'}]);
  g.blasts.push({id:99,cells:[cell],until:40});advance(g,38);assert.equal(g.powerups.length,0);
  stepGame(g);assert.deepEqual(g.powerups,[{cell,type:'range'}]);
  p.x=3.5;p.y=3.5;placeBomb(g,p);g.bombs[0]!.deadline=g.tick+1;p.x=10.5;p.y=10.5;
  stepGame(g);assert.equal(g.powerups.length,0);assert.equal(p.range,2);
});

test('collection caps stats, exact bomb capacity, eliminated rejection and fresh reset',()=>{
  const g=createGame(),p=g.players[0]!;g.board.fill(0);
  for(const type of (['bomb','range','speed'] as const))for(let i=0;i<12;i++){
    g.powerups=[{cell:index(1,1),type}];stepGame(g);
  }
  assert.equal(p.capacity,5);assert.equal(p.range,8);assert.equal(p.speedLevel,3);assert.equal(p.speed,3*(1+.15*3));
  for(let n=0;n<5;n++){p.x=1.5+n;p.y=1.5;assert.equal(placeBomb(g,p),true);}
  p.x=7.5;assert.equal(placeBomb(g,p),false);
  p.alive=false;g.powerups=[{cell:index(7,1),type:'bomb'}];stepGame(g);assert.equal(g.powerups.length,1);
  const fresh=createGame();assert.equal(fresh.players[0]!.capacity,1);assert.equal(fresh.players[0]!.range,2);assert.equal(fresh.players[0]!.speed,3);assert.equal(fresh.powerups.length,0);assert.equal(fresh.bombs.length,0);
});

test('walls warn for one second, close symmetrically and crush all occupants together',()=>{
  const g=createGame(['a','b']);g.tick=5399;stepGame(g);
  assert.equal(g.warnings.length,1);assert.equal(g.warnings[0]!.closeTick-g.tick,60);
  const cells=g.warnings[0]!.cells;advance(g,59);assert.equal(g.board[cells[0]!],0);assert.ok(g.players.every(p=>p.alive));
  stepGame(g);assert.ok(cells.every(cell=>g.board[cell]===1));assert.ok(g.players.every(p=>!p.alive));
  assert.equal(g.events.filter(e=>e.type==='elimination').length,2);
});

test('warned tile can be escaped and closed wall blocks movement permanently',()=>{
  const g=createGame();g.tick=5399;stepGame(g);advance(g,30,{practice:{x:1}});advance(g,30);
  assert.equal(g.players[0]!.alive,true);assert.equal(g.board[index(1,1)],1);
  // Another warning is already approaching; verify the first wall in isolation.
  g.waves=[];const x=g.players[0]!.x;advance(g,60,{practice:{x:-1}});
  assert.ok(g.players[0]!.x>=2.28);assert.ok(g.players[0]!.x<=x);
});

test('inward wall schedule is deterministic, unique and fits the final thirty seconds',()=>{
  const g=createGame(),closed=g.waves.flatMap(w=>w.cells);
  assert.equal(new Set(closed).size,closed.length);
  assert.equal(closed.length,g.board.filter((value,i)=>value!==1&&i>=15&&i<180).length);
  assert.equal(g.waves[0]!.warnTick,5400);assert.ok(g.waves.at(-1)!.closeTick<7200);
  assert.deepEqual(g.waves,createGame().waves);
});

test('Chain Reaction extends every bomb in a same-tick chain and is off by default', () => {
  const setup = (enabled: boolean|undefined) => {
    const g = createGame(['practice'], 1, 'LOW', false, enabled);
    g.board.fill(0);
    g.players[0]!.x = 13.5;
    g.players[0]!.y = 11.5;
    g.bombs = [
      { id: 1, owner: 'practice', x: 3, y: 3, range: 2, deadline: 1, pass: [] },
      { id: 2, owner: 'practice', x: 5, y: 3, range: 2, deadline: 150, pass: [] },
      { id: 3, owner: 'practice', x: 11, y: 3, range: 2, deadline: 150, pass: [] },
    ];
    return g;
  };
  const ordinary = setup(false);
  stepGame(ordinary);
  assert.deepEqual(ordinary.events.filter(e => e.type === 'explosion').map(e => e.bomb), [1, 2]);
  const chained = setup(true);
  stepGame(chained);
  assert.deepEqual(chained.events.filter(e => e.type === 'explosion').map(e => e.bomb), [1, 2, 3]);
  for (const blast of chained.blasts) {
    const x = { 1: 3, 2: 5, 3: 11 }[blast.id]!;
    assert.ok(blast.cells.includes(index(1, 3)));
    assert.ok(blast.cells.includes(index(x, 11)));
  }
});
