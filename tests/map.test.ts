import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP, SITES, TOWER } from '../src/sim/defs.ts';
import { generateMap, sectorCenter, sectorOf, siteAt } from '../src/sim/map.ts';
import { World } from '../src/sim/world.ts';
import { coreOf } from '../src/sim/tower.ts';

test('sectorOf: sector s spans [s*14 - 7, s*14 + 7)', () => {
  assert.equal(sectorOf(0), 0);
  assert.equal(sectorOf(-7), 0);
  assert.equal(sectorOf(6.99), 0);
  assert.equal(sectorOf(7), 1);
  assert.equal(sectorOf(-7.01), -1);
  assert.equal(sectorOf(sectorCenter(-4)), -4);
});

test('generation guarantees hold over 200 seeds', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const m = generateMap(seed);
    const R = MAP.radius;
    assert.equal(m.sites.length, 2 * R + 1);
    const at = (s: number) => siteAt(m, s)!.kind;
    const where = (k: string) => m.sites.filter((x) => x.kind === k).map((x) => x.sector);
    assert.equal(at(0), 'home');
    const [sh] = where('stronghold');
    assert.equal(where('stronghold').length, 1, `seed ${seed}: one stronghold`);
    assert.ok(Math.abs(sh) >= SITES.stronghold[0] && Math.abs(sh) <= SITES.stronghold[1], `seed ${seed}: stronghold at ${sh}`);
    const [tr] = where('trader');
    assert.equal(where('trader').length, 1, `seed ${seed}: one trader`);
    assert.ok(Math.abs(tr) >= SITES.trader[0] && Math.abs(tr) <= SITES.trader[1], `seed ${seed}: trader at ${tr}`);
    assert.ok(where('cache').some((s) => Math.abs(s) <= SITES.cacheWithin), `seed ${seed}: a cache within 2`);
    assert.ok(!where('camp').some((s) => Math.abs(s) <= SITES.noCampWithin), `seed ${seed}: no camp at distance 1`);
    for (const dir of [-1, 1]) assert.ok(where('camp').filter((s) => Math.sign(s) === dir).length <= SITES.maxCampsPerSide);
    for (const c of m.sites.filter((x) => x.kind === 'cache')) {
      const scale = 1 + SITES.cacheLoot.perSector * (Math.abs(c.sector) - 1);
      assert.ok(c.loot.minerals >= Math.round(SITES.cacheLoot.min * scale) && c.loot.minerals <= Math.round(SITES.cacheLoot.max * scale));
    }
    assert.deepEqual(m.explored.map((e, i) => e === Math.abs(i - R) <= MAP.startExplored), m.explored.map(() => true));
    assert.ok(m.sites.every((x) => x.discovered === (x.sector === 0)));
  }
});

test('the same seed gives the same map; different seeds vary', () => {
  assert.deepEqual(generateMap(42), generateMap(42));
  const layouts = new Set(Array.from({ length: 20 }, (_, i) => generateMap(i + 1).sites.map((s) => s.kind[0]).join('')));
  assert.ok(layouts.size > 15);
});

test('an Expedition world: one home tower centred in sector 0, open both ways, Core in the middle', () => {
  const w = new World({ mode: 'expedition', seed: 3 });
  assert.equal(w.towers.length, 1);
  const home = w.tower(0);
  assert.equal(home.x + TOWER.cols / 2, 0);
  assert.equal(home.front, 'both');
  assert.deepEqual([coreOf(home)!.col, coreOf(home)!.w], [2, 2]);
  assert.deepEqual(w.map, generateMap(3));
  w.stepSeconds(10);
  assert.equal(w.inOvertime, false);
});
