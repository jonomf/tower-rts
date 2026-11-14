/**
 * Defense rooms (Gun Nest, Flak): each shoots the nearest hostile unit of its kind (ground or air) within range of a
 * front face it has a clear line to. Runs before the unit system; a unit it kills doesn't act that tick.
 */
import { ROOMS, UNITS } from '../defs.ts';
import { faceOf, openSidesAt } from '../tower.ts';
import { hostile, type Unit } from '../types.ts';
import type { World } from '../world.ts';

export function defenseSystem(w: World, dt: number): void {
  for (const t of w.towers) {
    for (const r of t.rooms) {
      const tur = ROOMS[r.def].turret;
      if (!tur || !r.built) continue;
      r.cooldown = Math.max(0, r.cooldown - dt);
      if (r.cooldown > 0) continue;
      let best: Unit | undefined;
      let bestDist = Infinity;
      let bestFace = 0;
      for (const side of openSidesAt(t, r.col, r.floor)) {
        const face = faceOf(t, side);
        for (const u of w.units) {
          if (!hostile(t.team, u.team) || u.hp <= 0 || UNITS[u.def].air !== tur.hitsAir) continue;
          const dist = Math.abs(u.x - face);
          if (dist <= tur.range && dist < bestDist) {
            best = u;
            bestDist = dist;
            bestFace = face;
          }
        }
      }
      if (!best) continue;
      best.hp -= tur.damage;
      r.cooldown = tur.cooldown;
      w.effects.push({ kind: 'shot', tick: w.tick, team: t.team, fx: bestFace, falt: r.floor + 0.5, tx: best.x, talt: best.alt, room: null });
    }
  }
}
