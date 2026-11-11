import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, replay } from '../src/sim/world.ts';
import { MAP, ROOMS, TOWER, UNITS } from '../src/sim/defs.ts';
import { sectorCenter } from '../src/sim/map.ts';
import { defaultDeploy, roomAt } from '../src/sim/tower.ts';

/** An Expedition world with a finished Barracks at (4,0) and a deep bank. */
function expedition(seed = 7) {
  const w = new World({ mode: 'expedition', seed });
  const home = w.tower(0);
  home.bank = { minerals: 100000, gas: 100000 };
  assert.equal(w.issue({ type: 'build', team: 0, room: 'barracks', col: 4, floor: 0 }).ok, true);
  const r = roomAt(home, 4, 0)!;
  r.built = true;
  r.progress = ROOMS.barracks.buildTime;
  return { w, home, barracks: r };
}
const centre = (w: World) => w.tower(0).x + TOWER.cols / 2;

test('default deploy follows the tower: out of a one-fronted tower, home for the two-sided one', () => {
  const sk = new World({ teams: [0, 1] });
  assert.equal(defaultDeploy(sk.tower(0)), 'right');
  assert.equal(defaultDeploy(sk.tower(1)), 'left');
  assert.equal(defaultDeploy(new World({ mode: 'expedition' }).tower(0)), 'home');
});

test('deploy home: new units garrison the tower centre and stay there', () => {
  const { w } = expedition();
  w.stepSeconds(UNITS.trooper.trainTime + 0.1);
  assert.equal(w.units.length, 1);
  const u = w.units[0];
  assert.equal(u.order, 'garrison');
  w.stepSeconds(20);
  assert.ok(Math.abs(u.x - centre(w)) < 1e-9, `stayed home (x=${u.x})`);
});

test('deploy left/right: units march out of that face and hold at the centre of the last sector', () => {
  const { w } = expedition();
  assert.equal(w.issue({ type: 'setDeploy', team: 0, col: 4, floor: 0, deploy: 'left' }).ok, true);
  assert.equal(w.issue({ type: 'setDeploy', team: 0, col: 4, floor: 0, deploy: 'left' }).ok, false, 'already set');
  w.stepSeconds(UNITS.trooper.trainTime + 0.05);
  const u = w.units[0];
  assert.deepEqual([u.order, u.dir], ['march', -1]);
  assert.ok(Math.abs(u.x - w.tower(0).x) < 0.1, 'left the left face');
  w.issue({ type: 'setTrain', team: 0, col: 4, floor: 0, unit: null });
  w.stepSeconds(120);
  assert.equal(u.x, sectorCenter(-MAP.radius), 'holds at the far-left sector centre');
});

test('recall brings marching units home; send marches the garrison out', () => {
  const { w } = expedition();
  w.issue({ type: 'setDeploy', team: 0, col: 4, floor: 0, deploy: 'right' });
  w.stepSeconds(UNITS.trooper.trainTime + 0.05);
  w.issue({ type: 'setTrain', team: 0, col: 4, floor: 0, unit: null });
  const u = w.units[0];
  w.stepSeconds(20);
  assert.ok(u.x > 15);
  assert.equal(w.issue({ type: 'sendGarrison', team: 0, dir: -1 }).ok, false, 'no one at home yet');
  assert.equal(w.issue({ type: 'recall', team: 0 }).ok, true);
  assert.equal(w.issue({ type: 'recall', team: 0 }).ok, false, 'already recalled');
  w.stepSeconds(40);
  assert.ok(Math.abs(u.x - centre(w)) < 1e-9, `back home (x=${u.x})`);
  assert.equal(w.issue({ type: 'sendGarrison', team: 0, dir: -1 }).ok, true);
  w.stepSeconds(5);
  assert.deepEqual([u.order, u.dir], ['march', -1]);
  assert.ok(u.x < centre(w) - 4);
});

test('the garrison engages a raider in its sector, then walks back to the centre', () => {
  const { w } = expedition();
  w.stepSeconds(UNITS.trooper.trainTime + 0.05);
  w.issue({ type: 'setDeploy', team: 0, col: 4, floor: 0, deploy: 'home' }); // already the default: rejected, harmless
  const guard = w.units[0];
  // Keep the Barracks training so the guard has company; the raider walks in from the right.
  const raider = w.spawnUnit('trooper', 1, 0, w.tower(0));
  raider.x = raider.px = 6.5;
  raider.dir = -1;
  raider.order = 'march';
  w.stepSeconds(15);
  assert.ok(raider.hp <= 0 || !w.units.includes(raider), 'the raider was killed');
  w.stepSeconds(20);
  for (const g of w.units.filter((x) => x.team === 0)) assert.ok(Math.abs(g.x - centre(w)) < 1e-9, `back at the centre (x=${g.x})`);
  assert.ok(w.units.includes(guard) || w.units.length > 0);
});

test('deploy and order commands replay deterministically from the command log', () => {
  const opts = { mode: 'expedition' as const, seed: 9 };
  const w = new World(opts);
  w.issue({ type: 'build', team: 0, room: 'barracks', col: 4, floor: 0 });
  w.stepSeconds(60);
  w.issue({ type: 'setDeploy', team: 0, col: 4, floor: 0, deploy: 'right' });
  w.stepSeconds(40);
  w.issue({ type: 'recall', team: 0 });
  w.stepSeconds(10);
  w.issue({ type: 'sendGarrison', team: 0, dir: -1 });
  w.stepSeconds(30);
  assert.ok(w.units.length >= 2, `units: ${w.units.length}`);
  assert.ok(w.commandLog.some((c) => c.cmd.type === 'sendGarrison'));
  const r = replay(opts, w.commandLog, w.tick);
  assert.equal(r.hash(), w.hash());
});
