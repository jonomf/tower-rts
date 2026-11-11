/**
 * Expedition fog and sites. A sector's terrain is explored, and its site discovered, when a player unit enters it.
 * The first player unit to reach a Cache's centre loots it into that unit's home tower. Ruins hold nothing.
 * (Camps, the Stronghold and the Trader come alive in P3/P4.)
 */
import { TOWER } from '../defs.ts';
import { inMap, sectorCenter, sectorOf, siteAt } from '../map.ts';
import { PLAYER } from '../types.ts';
import type { World } from '../world.ts';

/** How close (cells) a unit must get to a Cache's centre to loot it. */
export const LOOT_REACH = 1;

export function exploreSystem(w: World): void {
  const m = w.map;
  if (!m) return;
  for (const u of w.units) {
    if (u.team !== PLAYER || u.hp <= 0) continue;
    const s = sectorOf(u.x);
    if (!inMap(m, s)) continue;
    m.explored[s + m.radius] = true;
    const site = siteAt(m, s)!;
    if (!site.discovered) {
      site.discovered = true;
      w.effects.push({ kind: 'discovered', tick: w.tick, sector: s, site: site.kind });
    }
    if (site.kind === 'cache' && !site.claimed && Math.abs(u.x - sectorCenter(s)) <= LOOT_REACH) {
      site.claimed = true;
      const t = w.towerById(u.home) ?? w.tower(PLAYER);
      t.bank.minerals += site.loot.minerals;
      t.bank.gas += site.loot.gas;
      t.income.minerals += site.loot.minerals;
      t.income.gas += site.loot.gas;
      w.effects.push({ kind: 'loot', tick: w.tick, x: sectorCenter(s), gained: { ...site.loot } });
    }
  }
}

/**
 * Which sectors the player can see right now (index = sector + radius): any sector holding a player unit or tower,
 * and the sectors next to those. Hostile units elsewhere are hidden.
 */
export function visibleSectors(w: World): boolean[] {
  const m = w.map;
  if (!m) return [];
  const seen = new Array<boolean>(m.radius * 2 + 1).fill(false);
  const mark = (x: number) => {
    const s = sectorOf(x);
    for (let d = -1; d <= 1; d++) if (inMap(m, s + d)) seen[s + d + m.radius] = true;
  };
  for (const t of w.towers) if (t.team === PLAYER) mark(t.x + TOWER.cols / 2);
  for (const u of w.units) if (u.team === PLAYER && u.hp > 0) mark(u.x);
  return seen;
}
