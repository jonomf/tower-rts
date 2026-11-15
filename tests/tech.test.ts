import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, ROOMS, UNITS, type RoomId, type UnitId } from '../src/sim/defs.ts';
import { roomLocked, techTier, techTiers, unitLocked } from '../src/sim/tech.ts';
import type { CommandResult } from '../src/sim/types.ts';
import { World } from '../src/sim/world.ts';

function rich(seed = 3): World {
  const w = new World({ seed, mode: 'expedition' });
  w.tower(0).bank = { minerals: 5000, gas: 5000 };
  return w;
}
const run = (w: World, seconds: number) => {
  for (let i = 0; i < seconds * 20; i++) w.step();
};
const why = (r: CommandResult) => (r.ok ? '' : r.reason);
const build = (w: World, room: RoomId, col: number, floor: number) => w.issue({ type: 'build', team: 0, room, col, floor });

test('tech: every requirement is a buildable room, the tree has no cycles, and every unit is trained somewhere', () => {
  for (const id of PALETTE) {
    for (const req of ROOMS[id].requires ?? []) assert.ok(PALETTE.includes(req), `${id} requires ${req}`);
    assert.ok(techTier(id) >= 1 && techTier(id) <= 5);
  }
  for (const u of Object.keys(UNITS) as UnitId[]) {
    assert.ok(PALETTE.some((r) => ROOMS[r].trains?.includes(u)), `${u} has a room`);
    for (const req of UNITS[u].requires ?? []) assert.ok(PALETTE.includes(req));
  }
  assert.deepEqual(techTiers().flat().sort(), ['core', ...PALETTE].sort());
});

test('tech: a room is locked until its requirement is built (not just placed)', () => {
  const w = rich();
  assert.equal(roomLocked(w, 0, 'workshop'), 'barracks');
  assert.match(why(build(w, 'workshop', 0, 0)), /Needs a Barracks/);
  assert.ok(build(w, 'barracks', 0, 0).ok);
  assert.equal(build(w, 'workshop', 1, 0).ok, false, 'the Barracks is still under construction');
  run(w, ROOMS.barracks.buildTime + 1);
  assert.ok(build(w, 'workshop', 1, 0).ok);
  assert.equal(build(w, 'lab', 4, 0).ok, false);
  run(w, ROOMS.workshop.buildTime + 1);
  assert.ok(build(w, 'lab', 4, 0).ok);
  assert.ok(build(w, 'flak', 5, 0).ok);
});

test('tech: units need their tech room to be picked, and stop training (waiting: tech) if it is lost', () => {
  const w = rich();
  build(w, 'barracks', 0, 0);
  run(w, 16);
  const pick = (unit: UnitId) => w.issue({ type: 'setTrain', team: 0, col: 0, floor: 0, unit });
  assert.equal(unitLocked(w, 0, 'walker'), 'workshop');
  assert.match(why(pick('walker')), /Needs a Workshop/);
  assert.ok(pick('scout').ok, 'the Scout needs no tech');
  w.issue({ type: 'setTrain', team: 0, col: 0, floor: 0, unit: null }); // keep supply free for the Walker
  w.units.length = 0;
  build(w, 'workshop', 1, 0);
  run(w, 16);
  assert.ok(pick('walker').ok);
  run(w, UNITS.walker.trainTime + 1);
  assert.ok(w.units.some((u) => u.def === 'walker'));
  const t = w.tower(0);
  w.damageRoom(t, t.rooms.find((r) => r.def === 'workshop')!, 1e9);
  run(w, UNITS.walker.trainTime + 2);
  assert.equal(t.rooms.find((r) => r.def === 'barracks')!.waiting, 'tech');
});

test('walker: reaches rooms above the second floor and does double damage to rooms', () => {
  const w = new World({ seed: 1, teams: [0, 1] }); // Skirmish: two towers, one lane
  const enemy = w.tower(1);
  const hpBefore = enemy.rooms.reduce((s, r) => s + r.hp, 0);
  const u = w.spawnUnit('walker', 0, 0);
  run(w, 60);
  assert.ok(u.hp > 0);
  const lost = hpBefore - enemy.rooms.reduce((s, r) => s + r.hp, 0);
  assert.ok(lost > 0 && lost % (UNITS.walker.attack.damage * 2) === 0, `lost ${lost}`);
});

test('interceptor: shoots air only; a marksman outranges a trooper', () => {
  const w = new World({ seed: 1, teams: [0, 1] });
  const i = w.spawnUnit('interceptor', 0, 4);
  const flyer = w.spawnUnit('flyer', 1, 4);
  const trooper = w.spawnUnit('trooper', 1, 0);
  flyer.x = flyer.px = i.x + 2;
  trooper.x = trooper.px = i.x + 1;
  w.step();
  assert.deepEqual(i.target, { kind: 'unit', id: flyer.id });
  assert.ok(UNITS.marksman.attack.range > UNITS.trooper.attack.range);
});

test('infirmary: heals the garrison at home, not units that marched out', () => {
  const w = rich();
  build(w, 'quarters', 0, 0);
  run(w, 11);
  assert.ok(build(w, 'infirmary', 1, 0).ok);
  run(w, 13);
  const t = w.tower(0);
  const home = w.spawnUnit('trooper', 0, 0, t, 'home');
  const out = w.spawnUnit('trooper', 0, 0, t, 'right');
  home.hp = out.hp = 10;
  run(w, 5);
  assert.ok(Math.abs(home.hp - (10 + ROOMS.infirmary.heals! * 5)) < 0.01, `home ${home.hp}`);
  assert.equal(out.hp, 10);
  run(w, 30);
  assert.equal(home.hp, UNITS.trooper.hp, 'never above full');
});

test('cannon: outranges a Gun Nest and hits ground only', () => {
  assert.ok(ROOMS.cannon.turret!.range > ROOMS.gunNest.turret!.range);
  assert.equal(ROOMS.cannon.turret!.hitsAir, false);
  assert.deepEqual(ROOMS.cannon.requires, ['lab']);
});
