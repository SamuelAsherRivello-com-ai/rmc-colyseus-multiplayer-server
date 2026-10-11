import test from 'node:test';
import assert from 'node:assert/strict';
import { TetrisDuel, cells, aim, emptyBoard, landing, SHAPES, stackHeight, type DuelPlayer, type Shape, type AimingPiece } from '../packages/client/tetris-duel-rules.js';
const duel = () => { const d=new TetrisDuel(28);d.add('a');d.add('b');d.ready('a',true);d.ready('b',true);d.advance(3000);return d; };
const command = (d: TetrisDuel,id: string,action: string,seq?: number) => {const p=d.player(id)!;return d.command(id,{protocolVersion:1,epoch:d.epoch,pieceId:p.piece!.id,seq:seq??p.ack+1,action});};
const piece = (shape: Shape,x: number,rotation=0): AimingPiece => ({shape,x,rotation,stage:'aiming',id:10,deadline:9000});
const fullRows = (p: DuelPlayer,n: number,gap=0) => {p.board=emptyBoard();for(let y=24-n;y<24;y++)p.board[y]=Array.from({length:10},(_,x)=>x===gap?null:'G');p.piece=piece('I',gap,1);};
test('all orientations occupy four unique cells; edge rotations kick and O preserves occupancy',()=>{
  for(const s of SHAPES)for(let r=0;r<4;r++)assert.equal(new Set(cells(s,r).map(String)).size,4);
  assert.deepEqual(cells('O',0).sort(),cells('O',1).sort());
  const p=piece('I',8,1), rotated=aim(p,'cw')!; assert.equal(rotated.x,6);
  assert.equal(aim(piece('I',9,1),'cw')!.rotation,1,'rotation requiring a three-cell kick is rejected');
  assert.equal(aim(piece('O',0),'left')!.x,0);
});
test('straight landing stops above first obstacle and blocked entry has no fictitious landing',()=>{
  const b=emptyBoard(),p=piece('O',3); assert.equal(landing(b,p),22);
  b[10]![3]='G';assert.equal(landing(b,p),8);b[0]![3]='G';assert.equal(landing(b,p),null);
});
test('identical independent seven-bag streams and replay do not depend on other player speed',()=>{
  const d=duel(), seen=[];
  for(let i=0;i<7;i++){const p=d.player('a')!;seen.push(p.piece!.shape);command(d,'a','commit');d.advance(200);p.board=emptyBoard();}
  assert.equal(new Set(seen).size,7);assert.equal(d.player('b')!.piece!.shape,seen[0]);assert.equal(d.player('b')!.placements,0);
  const e=duel();for(const action of ['left','cw','commit']){command(e,'a',action);}
  const f=duel();for(const action of ['left','cw','commit']){command(f,'a',action);}
  e.advance(220);f.advance(20);f.advance(200);assert.deepEqual(e.project('a'),f.project('a'));
});
test('deadline equality auto releases, descent cannot steer, next piece starts independently',()=>{
  const d=duel(),deadline=d.player('a')!.piece!.deadline;d.advance(4999);
  assert.equal(d.player('a')!.piece!.stage,'aiming');d.advance(1);assert.equal(d.time,deadline);
  assert.equal(d.player('a')!.piece!.stage,'falling');assert.equal(command(d,'a','left'),false);
  d.advance(200);assert.equal(d.player('a')!.placements,1);assert.equal(d.player('a')!.piece!.deadline,d.time+5000);
  command(d,'a','commit');d.advance(200);assert.equal(d.player('a')!.placements,2);assert.equal(d.player('b')!.placements,1);
});
test('fractional callback jitter uses one fixed tick grid and preserves simultaneous outcomes',()=>{
  const a=duel(),b=duel();
  a.advance(5000);for(let i=0;i<1000;i++)b.advance(i%2?6.5:3.5);
  assert.equal(a.time,b.time);assert.deepEqual(a.project('a'),b.project('a'));
  const d=duel();d.player('a')!.board[1]![0]='G';d.player('b')!.board[1]![0]='G';
  command(d,'a','commit');d.advance(9);command(d,'b','commit');d.advance(191);
  assert.equal(d.phase,'results');assert.equal(d.winner,null);
});
test('multirow attacks, warning maturity, FIFO cancellation and placement-boundary insertion',()=>{
  const d=duel(),a=d.player('a')!,b=d.player('b')!;fullRows(a,4);command(d,'a','commit');d.advance(200);
  assert.equal(a.lines,4);assert.equal(b.incoming[0]!.rows,4);assert.equal(b.incoming[0]!.eligibleAt,d.time+1000);
  const packet=b.incoming[0]!;fullRows(b,3);command(d,'b','commit');d.advance(200);
  assert.equal(b.incoming[0]!.rows,2);assert.equal(a.incoming.length,0);
  d.advance(1000);assert.equal(b.board.some(row=>row.includes('G')),false,'maturity alone cannot insert');
  b.board=emptyBoard();command(d,'b','commit');d.advance(200);
  assert.equal(b.incoming.length,0);assert.equal(b.board[23]!.filter(Boolean).length,9);assert.equal(b.board[22]![packet.gap],null);
});
test('single clears do not attack or cancel and simultaneous excess attacks neutralize',()=>{
  const d=duel(),a=d.player('a')!,b=d.player('b')!;fullRows(a,1);a.incoming=[{id:1,rows:2,gap:8,eligibleAt:9000}];
  command(d,'a','commit');d.advance(200);assert.equal(a.lines,1);assert.equal(a.incoming[0]!.rows,2);assert.equal(b.incoming.length,0);
  a.incoming=[];fullRows(a,4);fullRows(b,4);command(d,'b','commit');command(d,'a','commit');d.advance(200);
  assert.equal(a.incoming.length,0);assert.equal(b.incoming.length,0);
});
test('upward overflow tops out and simultaneous hidden occupancy is an order-independent draw',()=>{
  const d=duel(),a=d.player('a')!;a.board[0]![0]='G';a.incoming=[{id:1,rows:1,gap:3,eligibleAt:0}];command(d,'a','commit');d.advance(200);
  assert.equal(d.phase,'results');assert.equal(d.winner,2);
  for(const order of [['a','b'],['b','a']]){const e=duel();for(const id of order){e.player(id)!.board[1]![0]='G';command(e,id,'commit');}e.advance(200);assert.equal(e.phase,'results');assert.equal(e.winner,null);}
});
test('private projection never includes other board, queue, RNG, fall or packet gap',()=>{
  const d=duel(),a=d.player('a')!,b=d.player('b')!;b.board[20]![8]='L';a.incoming=[{id:1,rows:1,gap:3,eligibleAt:9000}];
  const s=d.project('a')!;assert.equal(s.opponent!.height,4);assert.ok(s.opponent!.aim);assert.deepEqual(Object.keys(s.opponent!).sort(),['aim','color','connected','height','id','name','out','ready','seat']);
  assert.equal('rng' in s.own,false);assert.equal('gap' in s.own.incoming[0]!,false);
  command(d,'b','commit');assert.equal(d.project('a')!.opponent!.aim,null);assert.equal(stackHeight(emptyBoard()),0);
});
test('validation deduplicates sequences and rejects stale piece, epoch, enum and forged state',()=>{
  const d=duel(),p=d.player('a')!;assert.equal(command(d,'a','left',1),true);assert.equal(command(d,'a','left',1),false);
  for(const bad of [{epoch:0},{pieceId:999},{seq:NaN},{action:'teleport'},{protocolVersion:999}]){
    assert.equal(d.command('a',{protocolVersion:1,epoch:d.epoch,pieceId:p.piece!.id,seq:4,action:'commit',...bad}),false);
  }
  assert.equal(p.piece!.stage,'aiming');const old=p.piece!.id;command(d,'a','commit',5);d.advance(200);
  assert.equal(d.command('a',{protocolVersion:1,epoch:d.epoch,pieceId:old,seq:6,action:'commit'}),false);
});
test('disconnect pauses clocks; leave forfeits; both-ready rematch resets epoch and board',()=>{
  const d=duel(),before=d.time;d.disconnect('a');d.advance(20000);assert.equal(d.time,before);
  d.reconnect('a');d.advance(100);assert.equal(d.time,before+100);d.forfeit('a');assert.equal(d.winner,2);
  d.reconnect('a');d.ready('a',true);assert.equal(d.phase,'results');d.ready('b',true);assert.equal(d.phase,'countdown');assert.equal(d.epoch,2);
  d.advance(3000);assert.equal(d.phase,'playing');assert.equal(d.player('a')!.placements,0);assert.equal(d.player('a')!.board.flat().filter(Boolean).length,0);
});
