/**
 * Expedition fog and sites. A sector's terrain is explored, and its site discovered, when a player unit enters it.
 * The first player unit to reach a Cache's centre loots it into that unit's home tower. Ruins hold nothing.
 * (Camps, the Stronghold and the Trader come alive in P3/P4.)
 */
import { TOWER, TRADE } from '../defs.ts';
import { inMap, sectorCenter, sectorOf, siteAt } from '../map.ts';
import { PLAYER } from '../types.ts';
import { TICK_RATE, type World } from '../world.ts';

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
    // Meeting the Trader: a one-time gift, and trading opens (from anywhere, from then on).
    if (site.kind === 'trader' && !site.claimed && w.trade && Math.abs(u.x - sectorCenter(s)) <= TRADE.reach) {
      site.claimed = true;
      w.trade.unlocked = true;
      const t = w.tower(PLAYER);
      t.bank.minerals += TRADE.gift.minerals;
      t.bank.gas += TRADE.gift.gas;
      t.income.minerals += TRADE.gift.minerals;
      t.income.gas += TRADE.gift.gas;
      w.effects.push({ kind: 'traderMet', tick: w.tick, x: sectorCenter(s), gained: { ...TRADE.gift } });
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

/** The Trader's rate drifts: redrawn within ±swing every TRADE.every seconds. */
export function tradeSystem(w: World): void {
  const tr = w.trade;
  if (!tr || w.tick < tr.nextDrift) return;
  tr.rate = 1 - TRADE.swing + w.rng.next() * 2 * TRADE.swing;
  tr.nextDrift = w.tick + TRADE.every * TICK_RATE;
}

/** What selling pays right now: [gas for TRADE.mineralsIn minerals, minerals for TRADE.gasIn gas]. */
export function tradeOffer(rate: number): { gas: number; minerals: number } {
  return { gas: Math.round(TRADE.gasOut * rate), minerals: Math.round(TRADE.mineralsOut * rate) };
}
