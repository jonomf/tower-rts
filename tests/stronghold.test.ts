import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.ts';
import { TOWER } from '../src/sim/defs.ts';
import { sectorCenter, sectorOf, siteAt } from '../src/sim/map.ts';
import { coreOf } from '../src/sim/tower.ts';
import { AiController, stepWithAi } from '../src/ai/controller.ts';
import { STRONGHOLD } from '../src/ai/scripts.ts';

function world(seed = 8) {
  const w = new World({ mode: 'expedition', seed });
  const sh = w.tower(1);
  const ai = new AiController(1, STRONGHOLD, 'sharp', seed);
  const site = siteAt(w.map!, sectorOf(sh.x + TOWER.cols / 2))!;
  const run = (seconds: number) => {
    for (let i = 0; i < seconds * 20 && w.winner === null; i++) {
      // Keep the home tower out of it: raiders are removed before they arrive.
      for (const u of w.units) if (u.team === 1 && u.raid !== null) u.hp = 0;
      stepWithAi(w, [ai]);
    }
  };
  return { w, sh, ai, site, run };
}

test('the Stronghold only builds economy and walls until a player unit finds it', () => {
  const { w, sh, site, run } = world();
  run(240);
  const defs = new Set(sh.rooms.map((r) => r.def));
  assert.ok(defs.has('mine') && defs.has('wall') && defs.has('quarters'), [...defs].join(','));
  assert.ok(!defs.has('barracks'));
  assert.equal(w.units.filter((u) => u.home === sh.id).length, 0);
  assert.equal(site.discovered, false);
});

test('once found it builds Barracks and sends units at the player', () => {
  const { w, sh, site, run } = world();
  run(120);
  const scout = w.spawnUnit('trooper', 0, 0, w.tower(0), sh.x > 0 ? 'right' : 'left');
  scout.x = scout.px = sectorCenter(site.sector) - Math.sign(site.sector) * 6.5; // just inside its sector
  run(1);
  assert.equal(site.discovered, true);
  run(120);
  const defs = sh.rooms.map((r) => r.def);
  assert.ok(defs.includes('barracks'), defs.join(','));
  const theirs = w.units.filter((u) => u.home === sh.id);
  assert.ok(theirs.length >= 3, `units: ${theirs.length}`);
  assert.ok(theirs.every((u) => u.order === 'march' && u.dir === -Math.sign(site.sector)), 'marching toward home');
});

test('destroying the Stronghold\'s Core wins the run', () => {
  const { w, sh } = world();
  w.damageRoom(sh, coreOf(sh)!, 1e9);
  assert.equal(w.winner, 0);
});
