import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.ts';
import { MAP } from '../src/sim/defs.ts';
import { generateMap, sectorCenter, siteAt } from '../src/sim/map.ts';
import { visibleSectors } from '../src/sim/systems/explore.ts';

const R = MAP.radius;
const exploredList = (w: World) => w.map!.explored.flatMap((e, i) => (e ? [i - R] : []));

/** A seed whose map has a Cache at `sector` and none between it and home (searched, so the test doesn't depend on one layout). */
function seedWithCacheAt(sector: number): number {
  for (let seed = 1; seed < 500; seed++) {
    const m = generateMap(seed);
    const between = Array.from({ length: Math.abs(sector) - 1 }, (_, i) => Math.sign(sector) * (i + 1));
    if (siteAt(m, sector)!.kind === 'cache' && between.every((s) => siteAt(m, s)!.kind !== 'cache')) return seed;
  }
  throw new Error(`no seed with a cache at ${sector}`);
}

/** A marching player trooper, starting at the home tower's right or left face. */
function scout(w: World, dir: 1 | -1) {
  const u = w.spawnUnit('trooper', 0, 0, w.tower(0), dir > 0 ? 'right' : 'left');
  return u;
}

test('only sectors -1..1 start explored; only home is discovered', () => {
  const w = new World({ mode: 'expedition', seed: 4 });
  assert.deepEqual(exploredList(w), [-1, 0, 1]);
  assert.deepEqual(w.map!.sites.filter((s) => s.discovered).map((s) => s.sector), [0]);
});

test('exploration reveals sectors in order as a unit marches out, and finds each site on entry', () => {
  const w = new World({ mode: 'expedition', seed: 4 });
  scout(w, 1);
  const order: number[] = [];
  const found: number[] = [];
  for (let i = 0; i < 20 * 120; i++) {
    w.step();
    for (const s of exploredList(w)) if (!order.includes(s) && s > 1) order.push(s);
    for (const e of w.effects) if (e.kind === 'discovered' && e.tick === w.tick - 1) found.push(e.sector);
  }
  assert.deepEqual(order, [2, 3, 4, 5]);
  assert.deepEqual(found, [1, 2, 3, 4, 5], 'sector 1 was already explored, but its site is still found on entry');
  assert.ok(exploredList(w).every((s) => s >= -1), 'nothing on the left was explored');
});

test('a Cache pays once, into the looting unit\'s home tower', () => {
  const seed = seedWithCacheAt(-2);
  const w = new World({ mode: 'expedition', seed });
  const site = siteAt(w.map!, -2)!;
  const loot = { ...site.loot };
  assert.ok(loot.minerals > 0);
  const home = w.tower(0);
  home.bank = { minerals: 0, gas: 0 };
  scout(w, -1);
  let loots = 0;
  for (let i = 0; i < 20 * 60; i++) {
    w.step();
    loots += w.effects.filter((e) => e.kind === 'loot' && e.tick === w.tick - 1).length;
  }
  assert.equal(loots, 1);
  assert.equal(site.claimed, true);
  const coreIncome = 60; // 1 mineral/s for 60 s
  assert.ok(Math.abs(home.bank.minerals - coreIncome - loot.minerals) < 1e-6, `bank ${home.bank.minerals}`);
  // A second unit walking over the same spot gets nothing.
  scout(w, -1);
  const before = home.bank.minerals;
  w.stepSeconds(60);
  assert.ok(Math.abs(home.bank.minerals - before - 60) < 1e-6);
  assert.equal(sectorCenter(-2), -28);
});

test('visibility: sectors with a player unit or tower, and their neighbours', () => {
  const w = new World({ mode: 'expedition', seed: 4 });
  const vis = () => visibleSectors(w).flatMap((v, i) => (v ? [i - R] : []));
  assert.deepEqual(vis(), [-1, 0, 1]);
  const u = scout(w, 1);
  u.x = u.px = sectorCenter(4);
  assert.deepEqual(vis(), [-1, 0, 1, 3, 4, 5]);
});
