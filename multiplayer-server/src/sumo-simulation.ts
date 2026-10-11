// Palette and collision indexes are bounded by modulo-twelve and local array loop bounds.
export const RADIUS = 6;
export type Input = { x: number; z: number; dash: boolean };
export type Wrestler = { id: string; number: number; name: string; color: string; bot: boolean; x: number; z: number; vx: number; vz: number; angle: number; score: number; cooldown: number; out: number; shield: number; attacker: string; hitAt: number; input: Input; inputAt: number };
export const colors = ['#ed7159','#59b9ef','#f1c65a','#8dcf86','#b79aed','#f09bc3','#5bd4c8','#ff9c4b','#a4baff','#cae16a','#d6a782','#a6d9e8'];
export class SumoSimulation {
  players = new Map<string, Wrestler>();
  time = 0;
  winner: string | null = null;
  restartAt = 0;
  match = 1;
  event = { serial: 0, text: 'Hajime! Push rivals out of the ring.' };
  add(id: string, bot = false) {
    const occupied = new Set([...this.players.values()].map(p => p.number));
    let number = 1; while (occupied.has(number)) number++;
    const p: Wrestler = { id, number, name: bot ? 'Dojo Bot' : `Sumo ${number}`, color: colors[(number - 1) % 12]!, bot, x: 0, z: 0, vx: 0, vz: 0, angle: 0, score: 0, cooldown: 0, out: 0, shield: 1.5, attacker: '', hitAt: -100, input: { x: 0, z: 0, dash: false }, inputAt: 0 };
    this.players.set(id, p); this.spawn(p); return p;
  }
  remove(id: string) { this.players.delete(id); }
  spawn(p: Wrestler) {
    // Pick the least crowded of twelve safe spawn positions.
    let best = -1, bx = 0, bz = 0;
    for (let i = 0; i < 12; i++) {
      const a = (i + p.number) * Math.PI / 6, x = Math.cos(a) * 3.8, z = Math.sin(a) * 3.8;
      const distance = Math.min(100, ...[...this.players.values()].filter(q => q !== p && !q.out).map(q => Math.hypot(x - q.x, z - q.z)));
      if (distance > best) { best = distance; bx = x; bz = z; }
    }
    Object.assign(p, { x: bx, z: bz, vx: 0, vz: 0, out: 0, shield: 1.2, attacker: '', hitAt: -100 });
  }
  input(id: string, data: unknown) {
    const d = data as Input, p = this.players.get(id);
    if (!p || !d || typeof d.dash !== 'boolean' || ![d.x, d.z].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1)) return false;
    p.input = { x: d.x, z: d.z, dash: d.dash }; p.inputAt = this.time; return true;
  }
  step(dt: number) {
    this.time += dt;
    if (this.winner) {
      if (this.time >= this.restartAt) {
        this.winner = null; this.match++;
        for (const p of this.players.values()) { p.score = 0; p.cooldown = 0; p.input = { x: 0, z: 0, dash: false }; this.spawn(p); }
        this.event = { serial: this.event.serial + 1, text: 'New match. Hajime!' };
      }
      return;
    }
    const list = [...this.players.values()];
    for (const p of list) {
      p.cooldown = Math.max(0, p.cooldown - dt); p.shield = Math.max(0, p.shield - dt);
      if (p.out > 0) { p.out = Math.max(0, p.out - dt); if (!p.out) this.spawn(p); continue; }
      if (p.bot) {
        const target = list.find(q => !q.bot && !q.out);
        if (target) { const dx = target.x - p.x, dz = target.z - p.z, n = Math.hypot(dx, dz) || 1; p.input = { x: dx / n * .7, z: dz / n * .7, dash: n < 2.3 && Math.hypot(p.x, p.z) < 4.5 }; p.inputAt = this.time; }
      }
      const input = this.time - p.inputAt < .3 ? p.input : { x: 0, z: 0, dash: false };
      const n = Math.max(1, Math.hypot(input.x, input.z)), x = input.x / n, z = input.z / n;
      if (Math.hypot(x, z) > .05) p.angle = Math.atan2(x, z);
      p.vx += x * 24 * dt; p.vz += z * 24 * dt;
      if (input.dash && p.cooldown === 0) { p.vx += Math.sin(p.angle) * 8; p.vz += Math.cos(p.angle) * 8; p.cooldown = 1.5; }
      const drag = Math.exp(-5 * dt); p.vx *= drag; p.vz *= drag;
      p.x += p.vx * dt; p.z += p.vz * dt;
    }
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!, b = list[j]!; if (a.out || b.out || a.shield || b.shield) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz); if (d >= 1.22) continue;
      const nx = d ? dx / d : 1, nz = d ? dz / d : 0, overlap = (1.22 - d) / 2;
      a.x -= nx * overlap; a.z -= nz * overlap; b.x += nx * overlap; b.z += nz * overlap;
      const approach = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (approach > 0) {
        const impulse = Math.min(12, approach * .8 + 1.3);
        a.vx -= nx * impulse; a.vz -= nz * impulse; b.vx += nx * impulse; b.vz += nz * impulse;
        a.attacker = b.id; a.hitAt = this.time; b.attacker = a.id; b.hitAt = this.time;
      }
    }
    for (const p of list) {
      if (p.out || Math.hypot(p.x, p.z) <= RADIUS + .2) continue;
      p.out = 1.8; p.vx = 0; p.vz = 0;
      const attacker = this.players.get(p.attacker);
      if (attacker && attacker !== p && this.time - p.hitAt <= 4) {
        attacker.score++;
        this.event = { serial: this.event.serial + 1, text: `${attacker.name} pushed out ${p.name}!` };
        if (attacker.score >= 3) { this.winner = attacker.id; this.restartAt = this.time + 8; this.event.text = `${attacker.name} wins! Next match in 8 seconds.`; break; }
      } else this.event = { serial: this.event.serial + 1, text: `${p.name} stepped out. No point awarded.` };
    }
  }
  snapshot() {
    return { match: this.match, time: this.time, radius: RADIUS, winner: this.winner, restartIn: Math.max(0, this.restartAt - this.time), event: this.event, wrestlers: [...this.players.values()].map(({ input, inputAt, attacker, hitAt, ...p }) => p) };
  }
}
