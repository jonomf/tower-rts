import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.ts';
import { MAP, RAIDS, TOWER, UNITS } from '../src/sim/defs.ts';
import { generateMap, mapSpan, sectorCenter, siteAt } from '../src/sim/map.ts';
import { campsOn } from '../src/sim/systems/director.ts';
import type { Effect } from '../src/sim/types.ts';

/** First seed whose map satisfies `ok` (so tests don't depend on one generated layout). */
function seedWhere(ok: (camps: number[]) => boolean): number {
  for (let seed = 1; seed < 2000; seed++) {
    const camps = generateMap(seed).sites.filter((s) => s.kind === 'camp').map((s) => s.sector);
    if (ok(camps)) return seed;
  }
  throw new Error('no such seed');
}
const noCamps = seedWhere((c) => c.length === 0);
const campsBothSides = seedWhere((c) => c.some((s) => s < 0) && c.some((s) => s > 0));

/** Step, collecting every effect of the given kinds with the tick it happened on. */
function run(w: World, seconds: number, kinds: Effect['kind'][]): Effect[] {
  const seen: Effect[] = [];
  for (let i = 0; i < seconds * 20 && w.winner === null; i++) {
    w.step();
    for (const e of w.effects) if (e.tick === w.tick - 1 && kinds.includes(e.kind)) seen.push(e);
  }
  return seen;
}

test('the raid schedule is deterministic per seed, and differs between seeds', () => {
  const sched = (seed: number) =>
    run(new World({ mode: 'expedition', seed }), 600, ['raid']).map((e) => `${e.tick}:${e.kind === 'raid' ? e.side + '/' + e.size : ''}`).join(' ');
  assert.equal(sched(11), sched(11));
  assert.notEqual(sched(11), sched(12));
});

test('first raid: warned 12 s ahead, launched at 2:30, 3–5 Troopers marching toward home', () => {
  const w = new World({ mode: 'expedition', seed: noCamps });
  const fx = run(w, 151, ['warning', 'raid']);
  assert.deepEqual(fx.map((e) => e.kind), ['warning', 'raid']);
  assert.equal(fx[0].tick, (RAIDS.first - RAIDS.warn) * 20);
  assert.equal(fx[1].tick, RAIDS.first * 20);
  const [warn, raid] = fx as [Extract<Effect, { kind: 'warning' }>, Extract<Effect, { kind: 'raid' }>];
  assert.equal(warn.side, raid.side);
  assert.equal(warn.seconds, 12);
  const raiders = w.units.filter((u) => u.team === 1);
  assert.ok(raiders.length >= RAIDS.phases[0].size[0] && raiders.length <= RAIDS.phases[0].size[1]);
  assert.ok(raiders.every((u) => u.def === 'trooper' && u.home === null && u.raid === 1 && u.dir === -raid.side));
  // No camp on this map: they come from the map edge.
  const span = mapSpan(w.map!);
  const edge = raid.side === -1 ? span.x0 : span.x1;
  assert.ok(raiders.every((u) => Math.abs(u.x - edge) < 3));
  // Difficulty scales the squad.
  const big = new World({ mode: 'expedition', seed: noCamps, raidScale: 3 });
  run(big, 151, []);
  assert.ok(big.units.filter((u) => u.team === 1).length >= 9);
});

test('raids launch from the nearest living Camp on their side; a destroyed Camp stops spawning', () => {
  const w = new World({ mode: 'expedition', seed: campsBothSides });
  w.director!.side = 1;
  const camp = campsOn(w, 1)[0];
  const others = campsOn(w, 1).length - 1;
  run(w, 151, []);
  const first = w.units.filter((u) => u.raid === 1);
  assert.ok(first.length >= 2);
  assert.ok(first.every((u) => Math.abs(u.x - camp.x) < 3), 'spawned at the camp\'s home-side face');

  // Destroy that camp: loot, site marked, tower gone, later raids on that side start elsewhere.
  const home = w.tower(0);
  const bank = home.bank.minerals;
  const fx: Effect[] = [];
  w.damageRoom(camp, camp.rooms.find((r) => r.def === 'campCore')!, 1e6);
  fx.push(...w.effects.filter((e) => e.kind === 'campDestroyed'));
  assert.equal(fx.length, 1);
  assert.equal(home.bank.minerals, bank + RAIDS.campLoot);
  assert.ok(!w.towers.includes(camp));
  assert.equal(siteAt(w.map!, Math.round((camp.x + 3) / MAP.sector))!.claimed, true);
  assert.equal(w.director!.campsDown.right, 1);
  assert.equal(campsOn(w, 1).length, others);
  assert.equal(w.winner, null, 'a camp falling does not end the game');
  for (const u of w.units) u.hp = 0; // clear the field
  w.director!.side = 1;
  const launched = run(w, 120, ['raid']);
  assert.ok(launched.length >= 1);
  const next = w.units.filter((u) => u.raid === 2);
  assert.ok(next.length > 0 && next.every((u) => Math.abs(u.x - camp.x) > 6), 'not from the dead camp');
});

test('never three raids running from one side; squads grow with time', () => {
  const w = new World({ mode: 'expedition', seed: 5 });
  // Keep the tower alive forever so the schedule can run long.
  const raids: Extract<Effect, { kind: 'raid' }>[] = [];
  for (let i = 0; i < 20 * 900; i++) {
    w.step();
    for (const u of w.units) if (u.team === 1 && Math.abs(u.x) < 20) u.hp = 0;
    for (const e of w.effects) if (e.kind === 'raid' && e.tick === w.tick - 1) raids.push(e);
  }
  assert.ok(raids.length >= 9, `raids: ${raids.length}`);
  for (let i = 2; i < raids.length; i++) assert.ok(!(raids[i].side === raids[i - 1].side && raids[i].side === raids[i - 2].side), `three in a row at ${i}`);
  const early = raids.filter((r) => r.tick < 300 * 20), late = raids.filter((r) => r.tick >= 720 * 20);
  assert.ok(early.every((r) => r.size >= RAIDS.phases[0].size[0] && r.size <= RAIDS.phases[0].size[1]));
  assert.ok(late.length >= 2 && late.every((r) => r.size >= RAIDS.phases[3].size[0]));
  assert.ok(late[late.length - 1].size > late[0].size, 'the last phase keeps growing');
});

test('a squad marches at its slowest unit\'s pace, so it arrives together', () => {
  const w = new World({ mode: 'expedition', seed: noCamps });
  const a = w.spawnRaider('flyer', 60, -1, 99, UNITS.bruiser.speed);
  const b = w.spawnRaider('bruiser', 60.5, -1, 99, UNITS.bruiser.speed);
  w.stepSeconds(20);
  assert.ok(Math.abs(b.x - a.x - 0.5) < 1e-6);
});

test('an undefended tower falls to the raids; a garrison repels them and the count goes up', () => {
  const lost = new World({ mode: 'expedition', seed: noCamps });
  run(lost, 900, []);
  assert.equal(lost.winner, 1, 'nobody home: the Core falls');
  assert.ok(lost.seconds > RAIDS.first);

  const w = new World({ mode: 'expedition', seed: noCamps });
  const home = w.tower(0);
  home.bank = { minerals: 3000, gas: 0 };
  for (const [room, col] of [['barracks', 0], ['barracks', 5], ['quarters', 1], ['quarters', 4]] as const) w.issue({ type: 'build', team: 0, room, col, floor: 0 });
  const fx = run(w, 300, ['repelled']);
  assert.equal(w.winner, null);
  assert.ok(w.director!.repelled >= 1 && fx.length >= 1, `repelled ${w.director!.repelled}`);
  assert.equal(home.x + TOWER.cols / 2, sectorCenter(0));
});
