import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.ts';
import { ROOMS, UNITS, type RoomId } from '../src/sim/defs.ts';
import { openSidesAt, roomAt } from '../src/sim/tower.ts';

/** An Expedition home tower (open on both sides, Core in columns 2-3) with a deep bank. */
function home() {
  const w = new World({ mode: 'expedition', seed: 2, freeTech: true }); // turret rules, not tech (tests/tech.test.ts)
  const t = w.tower(0);
  t.bank = { minerals: 100000, gas: 100000 };
  const build = (room: RoomId, col: number, floor: number) => w.issue({ type: 'build', team: 0, room, col, floor });
  const finish = () => {
    for (const r of t.rooms) if (!r.built) ((r.built = true), (r.progress = ROOMS[r.def].buildTime));
  };
  /** A hostile unit standing still `dist` cells outside the left (-1) or right (+1) face. */
  const raider = (def: 'trooper' | 'flyer', side: -1 | 1, dist: number) => {
    const u = w.spawnUnit(def, 1, 3, t);
    u.x = u.px = (side < 0 ? t.x : t.x + 6) + side * dist;
    u.dir = side < 0 ? 1 : -1;
    return u;
  };
  return { w, t, build, finish, raider };
}

test('turrets must be the outermost room on their floor (toward a front face)', () => {
  const { w, t, build } = home();
  assert.deepEqual(build('gunNest', 1, 0), { ok: true }, 'column 1: nothing between it and the left face');
  assert.deepEqual(build('gunNest', 4, 0), { ok: true });
  assert.deepEqual(build('wall', 0, 0), { ok: true });
  assert.equal(build('flak', 0, 1).ok, true, 'floor 1 is empty: open to the left');
  assert.deepEqual(build('flak', 1, 1), { ok: true }, 'still open to the right on floor 1');
  build('wall', 4, 1);
  assert.deepEqual(openSidesAt(t, 1, 1), []);
  // Skirmish towers have one front: only that side counts.
  const sk = new World({ teams: [0, 1], freeTech: true });
  sk.tower(0).bank = { minerals: 9999, gas: 9999 };
  sk.issue({ type: 'build', team: 0, room: 'wall', col: 5, floor: 0 });
  assert.deepEqual(sk.issue({ type: 'build', team: 0, room: 'gunNest', col: 4, floor: 0 }), { ok: false, reason: 'Gun Nest must be the outermost room on its floor' });
  assert.equal(w.winner, null);
});

test('a Gun Nest shoots ground units in range and ignores air; a Flak does the reverse', () => {
  const { w, build, finish, raider } = home();
  build('gunNest', 0, 0);
  build('flak', 5, 0);
  finish();
  const g = raider('trooper', -1, 2.9);
  const far = raider('trooper', -1, 3.2 + UNITS.trooper.speed); // walks in; out of range for the first second
  const air = raider('flyer', -1, 2);
  const airR = raider('flyer', 1, 3.9);
  w.step();
  assert.equal(g.hp, UNITS.trooper.hp - ROOMS.gunNest.turret!.damage, 'the nearest ground unit is hit');
  assert.equal(far.hp, UNITS.trooper.hp);
  assert.equal(air.hp, UNITS.flyer.hp, 'the nest ignores air, and the Flak (column 5) has no line to the left face');
  assert.equal(airR.hp, UNITS.flyer.hp - ROOMS.flak.turret!.damage);
  w.stepSeconds(0.4);
  assert.equal(g.hp, UNITS.trooper.hp - 8, 'cooldown 0.5 s');
  w.stepSeconds(0.15);
  assert.equal(g.hp, UNITS.trooper.hp - 16);
});

test('a turret walled in later stops firing; a destroyed wall (rubble) opens it again', () => {
  const { w, t, build, finish, raider } = home();
  build('gunNest', 1, 0);
  finish();
  build('wall', 0, 0);
  build('wall', 4, 0);
  build('wall', 5, 0);
  finish();
  assert.deepEqual(openSidesAt(t, 1, 0), []);
  const g = raider('trooper', -1, 6); // far enough to shoot nothing itself for a while
  g.x = g.px = t.x - 2.5;
  w.step();
  assert.equal(g.hp, UNITS.trooper.hp);
  w.damageRoom(t, roomAt(t, 0, 0)!, 1e6);
  assert.equal(roomAt(t, 0, 0)!.def, 'rubble');
  w.step();
  assert.ok(g.hp < UNITS.trooper.hp);
});

test('turrets shoot from either open face', () => {
  const { w, build, finish, raider } = home();
  build('gunNest', 2, 1); // on top of the Core: open to both faces
  finish();
  const l = raider('trooper', -1, 2);
  w.step();
  assert.ok(l.hp < UNITS.trooper.hp);
  l.hp = 0;
  const r = raider('trooper', 1, 2);
  w.stepSeconds(0.6);
  assert.ok(r.hp < UNITS.trooper.hp);
});
