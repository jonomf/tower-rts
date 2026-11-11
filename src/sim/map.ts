/**
 * The Expedition map: a strip of sectors left and right of the home tower (decision E1 in .plan).
 * Generation is seeded and separate from the World's RNG, so the same seed always gives the same map.
 */
import { MAP, SITES, type Cost, type SiteKind } from './defs.ts';
import { Rng } from './rng.ts';
import type { Site, WorldMap } from './types.ts';

/** Sector index of an axis position. Sector s spans [s*S - S/2, s*S + S/2). */
export const sectorOf = (x: number): number => Math.floor((x + MAP.sector / 2) / MAP.sector);
/** Axis x of a sector's centre. */
export const sectorCenter = (s: number): number => s * MAP.sector;
/** Axis span of the whole map. */
export const mapSpan = (m: WorldMap): { x0: number; x1: number } => ({
  x0: -m.radius * MAP.sector - MAP.sector / 2,
  x1: m.radius * MAP.sector + MAP.sector / 2,
});

export const siteAt = (m: WorldMap, s: number): Site | undefined => m.sites[s + m.radius];
export const inMap = (m: WorldMap, s: number): boolean => s >= -m.radius && s <= m.radius;

const randInt = (rng: Rng, lo: number, hi: number): number => lo + rng.int(hi - lo + 1);

export function generateMap(seed: number, radius = MAP.radius): WorldMap {
  const rng = new Rng((seed ^ 0x5eed1e) >>> 0);
  const kinds = new Map<number, SiteKind>();
  const table = Object.entries(SITES.weights) as [SiteKind, number][];
  const total = table.reduce((a, [, w]) => a + w, 0);

  // 1. Weighted table for every non-home sector.
  for (let s = -radius; s <= radius; s++) {
    if (s === 0) continue;
    let roll = rng.next() * total;
    let pick: SiteKind = 'empty';
    for (const [k, w] of table) {
      if ((roll -= w) < 0) {
        pick = k;
        break;
      }
    }
    kinds.set(s, pick);
  }
  kinds.set(0, 'home');

  // 2. Guaranteed sites, overwriting.
  const side = () => (rng.next() < 0.5 ? -1 : 1);
  const sh = side() * randInt(rng, ...clampRange(SITES.stronghold, radius));
  kinds.set(sh, 'stronghold');
  let tr = sh;
  while (tr === sh) tr = side() * randInt(rng, ...clampRange(SITES.trader, radius));
  kinds.set(tr, 'trader');

  // 3. Fix-ups.
  for (let s = -SITES.noCampWithin; s <= SITES.noCampWithin; s++) if (kinds.get(s) === 'camp') kinds.set(s, 'empty');
  for (const dir of [-1, 1]) {
    let camps = 0;
    for (let d = 1; d <= radius; d++) {
      const s = d * dir;
      if (kinds.get(s) !== 'camp') continue;
      if (++camps > SITES.maxCampsPerSide) kinds.set(s, 'empty');
    }
  }
  const near = [];
  for (let s = -SITES.cacheWithin; s <= SITES.cacheWithin; s++) if (s !== 0) near.push(s);
  if (!near.some((s) => kinds.get(s) === 'cache')) {
    const spots = near.filter((s) => kinds.get(s) === 'empty' || kinds.get(s) === 'ruin');
    kinds.set(spots[rng.int(spots.length)], 'cache');
  }

  // 4. Loot, and the site list.
  const sites: Site[] = [];
  const explored: boolean[] = [];
  for (let s = -radius; s <= radius; s++) {
    const kind = kinds.get(s)!;
    sites.push({ sector: s, kind, discovered: s === 0, claimed: false, loot: kind === 'cache' ? cacheLoot(rng, Math.abs(s)) : { minerals: 0, gas: 0 } });
    explored.push(Math.abs(s) <= MAP.startExplored);
  }
  return { radius, sites, explored };
}

function cacheLoot(rng: Rng, distance: number): Cost {
  const L = SITES.cacheLoot;
  const scale = 1 + L.perSector * Math.max(0, distance - 1);
  const minerals = Math.round(randInt(rng, L.min, L.max) * scale);
  const gas = rng.next() < L.gasChance ? Math.round(randInt(rng, L.gasMin, L.gasMax) * scale) : 0;
  return { minerals, gas };
}

function clampRange([lo, hi]: [number, number], radius: number): [number, number] {
  return [Math.min(lo, radius), Math.min(hi, radius)];
}
