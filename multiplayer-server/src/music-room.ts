// Color index is bounded by private room admission capacity.
import { Room, type Client } from '@colyseus/core';
import { randomUUID } from 'node:crypto';

type Person = { id: string; number: number; name: string; color: string; host: boolean };
const colors = ['#65cfff', '#ffb86b', '#bda1ff', '#7fe2af'];
const adjectives = ['Neon', 'Blue', 'Tiny', 'Cosmic', 'Velvet', 'Lunar', 'Sunny', 'Silver'];
const animals = ['Otter', 'Finch', 'Fox', 'Panda', 'Moth', 'Lynx', 'Koala', 'Owl'];
const sounds = ['kick', 'snare', 'hat', 'tone'];
const safeInt = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0;
const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const record = (n: unknown): n is Record<string, any> => !!n && typeof n === 'object' && !Array.isArray(n);
const validEvent = (v: unknown) => record(v) && safeInt(v.step) && safeInt(v.sequence) && typeof v.origin === 'string' && sounds.includes(v.sound) && finite(v.deadline) && typeof v.epoch === 'string' && v.epoch.length <= 64;

/** Admission and bounded transport only. Musical time and rules belong to the host browser. */
export class MusicRoom extends Room {
  override maxClients = 4;
  private players = new Map<string, Person>();
  private hostId = '';
  private code = '';
  private ended = false;
  private lastHostSeen = Date.now();
  private limits = new Map<string, { at: number; count: number; sequence: number }>();

  reserveHost(id: string) { this.hostId = id; }

  override onCreate(options: { code: string }) {
    this.code = options.code;
    this.setMetadata({ code: this.code });
    this.onMessage('snapshot', client => this.snapshot(client));
    this.onMessage('heartbeat', client => { if (this.accept(client) && client.sessionId === this.hostId) this.lastHostSeen = Date.now(); });
    this.onMessage('musicIntent', (client, v) => {
      if (!this.accept(client) || !record(v) || !safeInt(v.sequence) || !safeInt(v.step) || !sounds.includes(v.sound) || typeof v.epoch !== 'string' || v.epoch.length > 64) return;
      const limit = this.limits.get(client.sessionId)!;
      if (v.sequence <= limit.sequence) return;
      limit.sequence = v.sequence;
      this.host()?.send('musicIntent', { epoch: v.epoch, step: v.step, sequence: v.sequence, sound: v.sound, origin: client.sessionId });
    });
    this.onMessage('musicClockRequest', (client, v) => {
      if (!this.accept(client) || !record(v) || !safeInt(v.request) || !finite(v.sent)) return;
      this.host()?.send('musicClockRequest', { request: v.request, sent: v.sent, origin: client.sessionId });
    });
    this.onMessage('musicClockReply', (client, v) => {
      if (!this.fromHost(client) || !record(v) || typeof v.target !== 'string' || !safeInt(v.request) || !finite(v.sent) || !finite(v.received) || !finite(v.hostNow) || !finite(v.start) || typeof v.epoch !== 'string' || v.epoch.length > 64) return;
      this.clients.find(c => c.sessionId === v.target)?.send('musicClockReply', v);
    });
    this.onMessage('musicCommit', (client, v) => {
      if (!this.fromHost(client) || !validEvent(v)) return;
      this.broadcast('musicCommit', v);
    });
    this.onMessage('musicSnapshot', (client, v) => {
      if (!this.fromHost(client) || !record(v) || typeof v.target !== 'string' || typeof v.epoch !== 'string' || v.epoch.length > 64 || !finite(v.start) || !finite(v.hostNow) || !safeInt(v.sequence) || !Array.isArray(v.events) || v.events.length > 112 || !v.events.every(validEvent) || Buffer.byteLength(JSON.stringify(v)) > 14336) return;
      this.clients.find(c => c.sessionId === v.target)?.send('musicSnapshot', v);
    });
    this.onMessage('musicRejected', (client, v) => {
      if (!this.fromHost(client) || !record(v) || typeof v.target !== 'string' || !safeInt(v.sequence)) return;
      this.clients.find(c => c.sessionId === v.target)?.send('musicRejected', { sequence: v.sequence });
    });
    this.setSimulationInterval(() => {
      if (this.hostId && Date.now() - this.lastHostSeen > 15_000) this.end();
    }, 1000);
  }

  override onJoin(client: Client) {
    if (this.ended) { void client.leave(); return; }
    const occupied = new Set([...this.players.values()].map(p => p.number));
    // Seat 1 belongs to the creator even when a guest's socket attaches first.
    let number = client.sessionId === this.hostId ? 1 : this.hostId ? 2 : 1;
    while (occupied.has(number)) number++;
    if (!this.hostId) this.hostId = client.sessionId;
    const seed = parseInt(randomUUID().slice(0, 8), 16);
    this.players.set(client.sessionId, { id: client.sessionId, number, name: `${adjectives[seed % 8]} ${animals[(seed >>> 4) % 8]}`, color: colors[number - 1]!, host: client.sessionId === this.hostId });
    this.snapshot(client);
    this.sendPresence();
  }

  override onDrop(client: Client) { this.depart(client); }
  override onLeave(client: Client) { this.depart(client); }
  private depart(client: Client) {
    if (client.sessionId === this.hostId) { this.end(); return; }
    this.players.delete(client.sessionId); this.limits.delete(client.sessionId);
    this.broadcast('departed', client.sessionId); this.sendPresence();
  }
  private host() { return this.clients.find(c => c.sessionId === this.hostId); }
  private fromHost(client: Client) { return client.sessionId === this.hostId && this.accept(client); }
  private accept(client: Client) {
    if (this.ended || !this.players.has(client.sessionId)) return false;
    let entry = this.limits.get(client.sessionId);
    if (!entry) { entry = { at: Date.now(), count: 0, sequence: -1 }; this.limits.set(client.sessionId, entry); }
    if (Date.now() - entry.at >= 1000) { entry.at = Date.now(); entry.count = 0; }
    return ++entry.count <= (client.sessionId === this.hostId ? 128 : 32);
  }
  private snapshot(client: Client) {
    client.send('snapshot', { players: [...this.players.values()], capacity: 4, hostId: this.hostId, code: this.code, gameState: null });
    if (client.sessionId !== this.hostId) this.host()?.send('musicSnapshotRequest', { target: client.sessionId });
  }
  private sendPresence() { this.broadcast('presence', { players: [...this.players.values()], capacity: 4, hostId: this.hostId, code: this.code }); }
  private end() {
    if (this.ended) return;
    this.ended = true;
    void this.lock();
    this.broadcast('musicEnded', { reason: 'Host disconnected' });
    this.clock.setTimeout(() => { void this.disconnect(); }, 100);
  }
}

