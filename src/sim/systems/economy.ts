import { ECON, MERGE_MULT, ROOMS } from '../defs.ts';
import { mergeGroups } from '../tower.ts';
import type { Tower } from '../types.ts';

/** Construction progress. Rooms finish building after their buildTime. */
export function constructionSystem(t: Tower, dt: number): void {
  for (const r of t.rooms) {
    if (r.built) continue;
    r.progress += dt;
    if (r.progress >= ROOMS[r.def].buildTime - 1e-6) {
      r.progress = ROOMS[r.def].buildTime;
      r.built = true;
    }
  }
}

/**
 * Production: producers fill their own buffer (capped at ECON.bufferSeconds of output).
 * A fraction of the rate (autoCollectRate) drains from the buffer to the bank by itself;
 * tapping (the 'collect' command) takes the whole buffer. Tap often and you earn the full rate.
 */
export function economySystem(t: Tower, dt: number, autoCollectRate: number): void {
  t.bank.minerals += ECON.coreRate.minerals * dt;
  t.bank.gas += ECON.coreRate.gas * dt;
  t.income.minerals += ECON.coreRate.minerals * dt;
  t.income.gas += ECON.coreRate.gas * dt;

  for (const g of mergeGroups(t)) {
    const p = ROOMS[g[0].def].produces;
    if (!p || !g[0].built) continue;
    const rate = (p.rate * MERGE_MULT[g.length]) / g.length;
    const cap = rate * ECON.bufferSeconds;
    for (const r of g) {
      r.buffer = Math.min(cap, r.buffer + rate * dt);
      const drain = Math.min(r.buffer, rate * autoCollectRate * dt);
      r.buffer -= drain;
      t.bank[p.res] += drain;
      t.income[p.res] += drain;
    }
  }
}
