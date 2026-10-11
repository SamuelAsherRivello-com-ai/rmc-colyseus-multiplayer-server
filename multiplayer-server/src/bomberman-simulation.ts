import type {BomberGame, BomberInput} from '../packages/client/bomberman-rules.js';
import type {CpuBrain} from '../packages/client/bomberman-cpu.js';
export interface BombermanPerson {id: string;number: number;name: string;color: number;cpu: boolean;ready: boolean;connected: boolean;score: number;ack: number}
interface ReceivedInput {seq: number;x: number;y: number;bomb: boolean;at: number}
import { createGame, stepGame } from '../packages/client/bomberman-rules.js';
import { cpuInput, CPU_LEVELS } from '../packages/client/bomberman-cpu.js';

export class BombermanSimulation {
 code: string;players: Map<string, BombermanPerson>;inputs: Map<string, ReceivedInput>;received: Map<string,number>;phase: string;clock: number;round: number;match: number;until: number;game: BomberGame;winner: string | null;matchWinner: string | null;options: {cpu: string;map: string;plant: boolean;chainReaction: boolean};brains: Map<string, CpuBrain>;resultAt: number;
  constructor(code = '') {
    this.code = code; this.players = new Map(); this.inputs = new Map(); this.received = new Map();
    this.phase = 'lobby'; this.clock = 0; this.round = 0; this.match = 0; this.until = 0;
    this.game = createGame([]); this.winner = null; this.matchWinner = null;
    this.options={cpu:'MED',map:'LOW',plant:false,chainReaction:false}; this.brains=new Map(); this.resultAt=0; this.fillSeats();
  }
  fillSeats() {
    for(let number=0;number<4;number++)if(![...this.players.values()].some(p=>p.number===number)){
      const id=`cpu:${number}`;
      this.players.set(id,{id,number,name:`CPU ${number+1}`,color:number,cpu:true,ready:true,connected:false,score:0,ack:-1});
    }
  }
  host() { return [...this.players.values()].filter(p=>!p.cpu&&p.connected).sort((a,b)=>a.number-b.number)[0]?.id; }
  configure(id: string, value: unknown) {
    const data=value && typeof value==='object' ? value as Record<string, unknown> : null;
    if(id!==this.host()||!['lobby','matchResults'].includes(this.phase)||!data||typeof data!=='object')return false;
    if(data.cpu!==undefined&&(typeof data.cpu!=='string'||!Object.hasOwn(CPU_LEVELS,data.cpu)))return false;
    if(data.map!==undefined&&(typeof data.map!=='string'||!['LOW','MED','HIGH'].includes(data.map)))return false;
    if(data.plant!==undefined&&typeof data.plant!=='boolean')return false;
    if(data.chainReaction!==undefined&&typeof data.chainReaction!=='boolean')return false;
    this.options={...this.options,...Object.fromEntries(['cpu','map','plant','chainReaction'].filter(k=>data[k]!==undefined).map(k=>[k,data[k]]))};
    return true;
  }
  transfer(oldId: string, next: BombermanPerson) {
    const actor=this.game.players.find(p=>p.id===oldId);
    if(actor)actor.id=next.id;
    for(const bomb of this.game.bombs){if(bomb.owner===oldId)bomb.owner=next.id;bomb.pass=bomb.pass.map(id=>id===oldId?next.id:id);}
    if(this.winner===oldId)this.winner=next.id;
    if(this.matchWinner===oldId)this.matchWinner=next.id;
    this.inputs.delete(oldId);this.received.delete(oldId);this.brains.delete(oldId);
    this.players.delete(oldId);this.players.set(next.id,next);
  }
  replaceDisconnectedId(oldId: string, newId: string) {
    const player = this.players.get(oldId);
    if (!player || player.cpu || player.connected || this.players.has(newId)) return false;
    this.transfer(oldId, { ...player, id: newId, connected: true, ready: false, ack: -1 });
    return true;
  }
  add(id: string) {
    if(this.players.has(id))return false;
    const seat=[...this.players.values()].filter(p=>p.cpu).sort((a,b)=>a.number-b.number)[0];
    if(!seat)return false;
    this.transfer(seat.id,{...seat,id,cpu:false,name:`Player ${seat.number+1}`,ready:false,connected:true,ack:-1});
    return true;
  }
  remove(id: string) {
    const seat=this.players.get(id);if(!seat||seat.cpu)return;
    this.transfer(id,{...seat,id:`cpu:${seat.number}`,cpu:true,name:`CPU ${seat.number+1}`,ready:true,connected:false,ack:-1});
  }
  connected(id: string, value: boolean) {
    const p = this.players.get(id); if (p) { p.connected = value; p.ready = false; }
    this.inputs.delete(id);
  }
  ready(id: string) {
    const p = this.players.get(id);
    if (this.phase === 'lobby' && p?.connected) p.ready = !p.ready;
  }
  rematch(id: string) {
    const p = this.players.get(id);
    if (this.phase === 'matchResults' && this.clock-this.resultAt>=180 && p?.connected) p.ready = !p.ready;
  }
  color(id: string, color: unknown) {
    if (this.phase !== 'lobby' || typeof color !== 'number' || !Number.isInteger(color) || color < 0 || color > 3) return;
    const p = this.players.get(id);
    if (p && ![...this.players.values()].some(q => q.id !== id && !q.cpu && q.color === color)) {const other=[...this.players.values()].find(q=>q.cpu&&q.color===color);if(other)other.color=p.color;p.color = color;}
  }
  input(id: string, value: unknown) {
    const data=value && typeof value==='object' ? value as Record<string, unknown> : null;
    const p = this.players.get(id);
    if (!p?.connected || this.phase !== 'playing' || !data || typeof data !== 'object') return false;
    if (typeof data.seq!=='number' || typeof data.x!=='number' || typeof data.y!=='number' || !Number.isSafeInteger(data.seq) || data.seq < 0 || data.seq <= (this.received.get(id) ?? p.ack) ||
        !Number.isFinite(data.x) || Math.abs(data.x) > 1 || !Number.isFinite(data.y) || Math.abs(data.y) > 1 || typeof data.bomb !== 'boolean') return false;
    this.received.set(id, data.seq);
    const previous = this.inputs.get(id);
    this.inputs.set(id, { seq: data.seq, x: data.x, y: data.y, bomb: data.bomb || previous?.bomb || false, at: this.clock });
    return true;
  }
  startMatch() {
    this.match++; this.round = 0; this.matchWinner = null;
    this.inputs.clear(); this.received.clear();
    for (const p of this.players.values()) { p.score = 0; p.ack = -1; p.ready = false; }
    this.begin();
  }
  begin() {
    this.round++;
    const ordered = [...this.players.values()].sort((a, b) => a.number - b.number);
    this.game = createGame(ordered.map(p => p.id), this.match * 1000 + this.round,this.options.map,this.options.plant,this.options.chainReaction); this.brains.clear();
    this.inputs.clear(); this.phase = 'countdown'; this.until = this.clock + 180; this.winner = null;
    for (const p of this.players.values()) p.ready = false;
  }
  lobby() {
    this.phase = 'lobby'; this.until = 0; this.inputs.clear();
    for (const p of this.players.values()) p.ready = false;
  }
  step() {
    this.clock++;
    const connected = [...this.players.values()].filter(p => !p.cpu && p.connected);
    if (this.phase === 'lobby' || this.phase === 'matchResults') {
      if (this.phase === 'matchResults' && connected.length < 1) { this.lobby(); return; }
      if (connected.length >= 1 && connected.every(p => p.ready)) this.startMatch();
      return;
    }
    if (this.phase === 'countdown') {
      if (connected.length < 1) { this.lobby(); return; }
      if (this.clock >= this.until) { this.phase = 'playing'; this.until = this.clock + 7200; }
      return;
    }
    if (this.phase === 'results') {
      if (this.clock >= this.until) { if (connected.length >= 1) this.begin(); else this.lobby(); }
      return;
    }
    if (this.phase !== 'playing') return;
    const inputs: Record<string, BomberInput> = {};
    for (const [id, input] of this.inputs) {
      if (this.clock - input.at <= 18) {
        inputs[id] = { x: input.x, y: input.y, bomb: input.bomb };
        const p = this.players.get(id); if (p) p.ack = input.seq;
      }
      input.bomb = false;
    }
    for(const p of this.players.values())if(p.cpu)inputs[p.id]=cpuInput(this.game,p.id,this.brains,this.options.cpu);
    stepGame(this.game, inputs);
    const survivors = this.game.players.filter(p => p.alive);
    if (survivors.length <= 1 || this.clock >= this.until) {
      this.winner = survivors.length === 1 ? survivors[0]!.id : null;
      const winner = this.winner === null ? undefined : this.players.get(this.winner);
      if (winner) winner.score++;
      this.matchWinner = winner && winner.score >= 3 ? winner.id : null;
      this.phase = this.matchWinner ? 'matchResults' : 'results';
      this.resultAt=this.clock; this.until = this.matchWinner ? 0 : this.clock + 360;
      for (const p of this.players.values()) p.ready = false;
      this.inputs.clear();
    }
  }
  snapshot() {
    // Do not expose hidden item locations or the full future wall schedule.
    const { hidden, waves, pendingPowerups, ...visible } = this.game;
    return { ...visible, code: this.code, phase: this.phase, match: this.match, round: this.round,
      options:{...this.options},hostId:this.host(),resultAt:this.resultAt,serverTick: this.clock, remaining: Math.max(0, (this.until - this.clock) / 60),
      winner: this.winner, matchWinner: this.matchWinner, people: [...this.players.values()],
      players: this.game.players.map(p => ({ ...p, ...this.players.get(p.id) })) };
  }
}
