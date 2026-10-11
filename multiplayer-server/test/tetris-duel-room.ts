type Envelope = {players: {id: string}[];gameState: {opponent: {height: number}}};
interface RoomFixtureView {accept(client: {sessionId: string}): boolean;limits: Map<string,{time: number}>;sendSnapshot(client: {sessionId: string;send(type: string,data: Envelope): void}): void}
const inspect = (room: TetrisDuelRoom) => room as unknown as RoomFixtureView; // Deliberate private-unit-test view.
import test from 'node:test';
import assert from 'node:assert/strict';
import {TetrisDuelRoom} from '../src/tetris-duel-room.ts';
test('room rate budget is seat-scoped and rejects excess messages until the window renews',()=>{
  const room=new TetrisDuelRoom(),a={sessionId:'a'},b={sessionId:'b'};
  for(let i=0;i<60;i++)assert.equal(inspect(room).accept(a),true);
  assert.equal(inspect(room).accept(a),false);assert.equal(inspect(room).accept(b),true);
  inspect(room).limits.get('a')!.time-=1000;assert.equal(inspect(room).accept(a),true);
});
test('snapshot envelope cannot leak opponent cells through presence players or local warnings',()=>{
  const room=new TetrisDuelRoom();room.simulation.add('a');const b=room.simulation.add('b')!;
  // @ts-expect-error Deliberately poison a private board cell to detect leakage.
  b.board[23]![0]='PRIVATE';
  // @ts-expect-error Deliberately poison the private queue to detect leakage.
  b.queue=['SECRET'];
  let payload: Envelope | undefined;inspect(room).sendSnapshot({sessionId:'a',send:(type,data)=>{assert.equal(type,'snapshot');payload=data;}});
  assert.equal(JSON.stringify(payload).includes('PRIVATE'),false);assert.equal(JSON.stringify(payload).includes('SECRET'),false);
  assert.equal(payload!.players.length,2);assert.equal(payload!.gameState.opponent.height,1);
  for(const player of payload!.players)assert.equal('board'in player,false);
});
