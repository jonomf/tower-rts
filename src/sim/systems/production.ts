import { ROOMS, UNITS } from '../defs.ts';
import { canAfford, supplyMax } from '../tower.ts';
import type { World } from '../world.ts';

/**
 * Production rooms train their picked unit on repeat. A job starts (and is paid for) when the room is idle,
 * the bank covers the unit, and supply has room for it. Finished units leave the tower right away.
 * Rooms are served oldest first, and a room that is waiting on resources holds its price back from the
 * rooms after it, so cheap units can't starve an expensive one forever.
 */
export function productionSystem(w: World, dt: number): void {
  for (const t of w.towers) {
    if (!t) continue;
    const held = { minerals: 0, gas: 0 };
    for (const r of t.rooms) {
      if (!r.built || !ROOMS[r.def].trains) continue;
      if (!r.job && r.train) {
        const u = UNITS[r.train];
        if (w.supplyUsed(t.team) + u.supply <= supplyMax(t)) {
          // Held-back resources only block a unit that needs that resource.
          const free = {
            minerals: u.cost.minerals > 0 ? t.bank.minerals - held.minerals : 0,
            gas: u.cost.gas > 0 ? t.bank.gas - held.gas : 0,
          };
          if (canAfford(free, u.cost)) {
            t.bank.minerals -= u.cost.minerals;
            t.bank.gas -= u.cost.gas;
            r.job = { unit: r.train, progress: 0 };
          } else {
            held.minerals += u.cost.minerals;
            held.gas += u.cost.gas;
          }
        }
      }
      if (r.job) {
        r.job.progress += dt;
        if (r.job.progress >= UNITS[r.job.unit].trainTime - 1e-6) {
          w.spawnUnit(r.job.unit, t.team, r.floor);
          r.job = null;
        }
      }
    }
  }
}
