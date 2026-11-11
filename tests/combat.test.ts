import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.ts';
import { ECON, LANE, ROOMS, TOWER, UNITS, type RoomId } from '../src/sim/defs.ts';
import { coreOf, roomAt, supplyMax } from '../src/sim/tower.ts';
import { frontRoom } from '../src/sim/systems/units.ts';
import { hostile } from '../src/sim/types.ts';
import type { Team } from '../src/sim/types.ts';

/** Two empty towers (just Cores), rich banks. */
function arena(opts: { scenario?: 'none' | 'dummy' } = {}) {
  const w = new World({ teams: [0, 1], ...opts });
  for (const t of w.towers) t.bank = { minerals: 100000, gas: 100000 };
  return w;
}
/** One tower and no enemy, so nothing ever dies (production tests). */
function solo() {
  const w = new World({ teams: [0] });
  w.tower(0).bank = { minerals: 100000, gas: 100000 };
  return w;
}
const place = (w: World, team: Team, room: RoomId, col: number, floor: number) => w.issue({ type: 'build', team, room, col, floor });
const builtNow = (w: World) => {
  for (const t of w.towers) for (const r of t.rooms) if (!r.built) ((r.built = true), (r.progress = ROOMS[r.def].buildTime));
};

// ---- Production ----------------------------------------------------------------

test('a Barracks trains its pick on repeat: paid at start, unit appears after trainTime', () => {
  const w = solo();
  place(w, 0, 'barracks', 2, 0);
  builtNow(w);
  const t = w.tower(0);
  const bank = t.bank.minerals;
  w.step();
  const r = roomAt(t, 2, 0)!;
  assert.equal(r.job?.unit, 'trooper');
  assert.ok(Math.abs(t.bank.minerals - bank - ECON.coreRate.minerals / 20 + UNITS.trooper.cost.minerals) < 1e-6);
  w.stepSeconds(UNITS.trooper.trainTime - 0.1);
  assert.equal(w.units.length, 0);
  w.stepSeconds(0.1);
  assert.equal(w.units.length, 1);
  assert.equal(w.units[0].def, 'trooper');
  assert.ok(w.units[0].x - TOWER.cols < 0.2, 'it just left the tower (its right face is at x = TOWER.cols)');
  assert.ok(r.job, 'the next one starts right away');
});

test('supply caps production; Quarters lift the cap', () => {
  const w = solo();
  place(w, 0, 'barracks', 2, 0);
  place(w, 0, 'barracks', 3, 0);
  builtNow(w);
  w.stepSeconds(60);
  assert.equal(w.supplyUsed(0), ECON.baseSupply);
  assert.equal(supplyMax(w.tower(0)), ECON.baseSupply);
  place(w, 0, 'quarters', 4, 0);
  builtNow(w);
  w.stepSeconds(60);
  assert.ok(w.supplyUsed(0) > ECON.baseSupply);
  assert.ok(w.supplyUsed(0) <= supplyMax(w.tower(0)));
});

test('a broke tower waits; switching or pausing refunds the job in progress', () => {
  const w = solo();
  place(w, 0, 'barracks', 2, 0);
  builtNow(w);
  const t = w.tower(0);
  t.bank = { minerals: 10, gas: 0 };
  w.stepSeconds(1);
  assert.equal(roomAt(t, 2, 0)!.job, null);
  t.bank = { minerals: 200, gas: 100 };
  w.step();
  assert.equal(roomAt(t, 2, 0)!.job?.unit, 'trooper');
  const before = t.bank.minerals;
  assert.equal(w.issue({ type: 'setTrain', team: 0, col: 2, floor: 0, unit: 'bruiser' }).ok, true);
  assert.equal(t.bank.minerals, before + UNITS.trooper.cost.minerals);
  assert.equal(w.issue({ type: 'setTrain', team: 0, col: 2, floor: 0, unit: 'flyer' }).ok, false); // Barracks can't
  w.step();
  assert.equal(roomAt(t, 2, 0)!.job?.unit, 'bruiser');
  assert.equal(w.issue({ type: 'setTrain', team: 0, col: 2, floor: 0, unit: null }).ok, true);
  w.stepSeconds(20);
  assert.equal(w.units.length, 0);
});

test('Hangars need floor 4+; flyers launch at the Hangar’s height', () => {
  const w = solo();
  assert.equal(w.issue({ type: 'build', team: 0, room: 'hangar', col: 2, floor: 0 }).ok, false);
  for (let f = 0; f < 3; f++) place(w, 0, 'wall', 2, f);
  const res = w.issue({ type: 'build', team: 0, room: 'hangar', col: 2, floor: 3 });
  assert.equal(res.ok, true);
  builtNow(w);
  w.stepSeconds(UNITS.flyer.trainTime);
  assert.equal(w.units[0]?.def, 'flyer');
  assert.equal(w.units[0].alt, 3.5);
});

// ---- Combat --------------------------------------------------------------------

test('units march toward the enemy and stop at the enemy face, in range', () => {
  const w = arena();
  const u = w.spawnUnit('trooper', 0, 0);
  // Axis positions: team 0's right face is at TOWER.cols, team 1's left face LANE.length cells further on.
  const enemyFace = TOWER.cols + LANE.length;
  w.stepSeconds(1);
  assert.ok(Math.abs(u.x - TOWER.cols - UNITS.trooper.speed) < 1e-6);
  w.stepSeconds(60);
  const reach = UNITS.trooper.attack.range + LANE.contact;
  assert.ok(u.x >= enemyFace - reach - 1e-9 && u.x <= enemyFace - UNITS.trooper.attack.range, `stopped at ${u.x}`);
  assert.equal(u.target?.kind, 'room');
  const e = w.spawnUnit('trooper', 1, 0);
  w.stepSeconds(0.5);
  assert.equal(e.target?.kind, 'unit', 'a fresh enemy in range fights instead of walking');
});

test('opposing units stop and fight; the stronger side wins', () => {
  const w = arena();
  w.spawnUnit('bruiser', 0, 0);
  w.spawnUnit('trooper', 1, 0);
  w.stepSeconds(30);
  assert.equal(w.units.length, 1);
  assert.equal(w.units[0].team, 0);
});

test('ground-only units ignore flyers; flyers fly over and hit them', () => {
  const w = arena();
  const b = w.spawnUnit('bruiser', 0, 0);
  const f = w.spawnUnit('flyer', 1, 4);
  w.stepSeconds(12);
  assert.equal(f.hp, UNITS.flyer.hp, 'the bruiser never hits the flyer');
  assert.ok(b.hp < UNITS.bruiser.hp, 'the flyer hits the bruiser');
  // Troopers do shoot air.
  const w2 = arena();
  w2.spawnUnit('trooper', 0, 0);
  const f2 = w2.spawnUnit('flyer', 1, 4);
  w2.stepSeconds(12);
  assert.ok(f2.hp < UNITS.flyer.hp);
});

test('frontRoom: lane-side column first, lowest floor first; ground reaches floors 1–2 only', () => {
  // Team 1's tower faces left: column 0 is its lane side, and attackers stand on its left.
  const w = arena();
  const t = w.tower(1);
  place(w, 1, 'wall', 2, 0);
  place(w, 1, 'wall', 2, 1);
  place(w, 1, 'wall', 2, 2);
  place(w, 1, 'wall', 1, 0);
  place(w, 1, 'wall', 1, 1);
  place(w, 1, 'wall', 1, 2);
  place(w, 1, 'wall', 0, 0);
  place(w, 1, 'wall', 0, 1);
  place(w, 1, 'wall', 0, 2);
  place(w, 1, 'mine', 0, 3);
  roomAt(t, 0, 0)!.hp = 0; // treat as gone
  roomAt(t, 0, 1)!.hp = 0;
  assert.deepEqual(pos(frontRoom(t, 'left', false)), [1, 0], 'ground: floors 0-1 only, so column 1');
  assert.deepEqual(pos(frontRoom(t, 'left', true)), [0, 2], 'air: frontmost column, any floor');
});
const pos = (r: { col: number; floor: number } | undefined) => (r ? [r.col, r.floor] : null);

test('destroyed rooms become rubble: still support, never targeted, rebuilt at half price', () => {
  const w = arena();
  const t = w.tower(1);
  place(w, 1, 'wall', 0, 0);
  place(w, 1, 'mine', 0, 1);
  builtNow(w);
  const wall = roomAt(t, 0, 0)!;
  w.damageRoom(1, wall, 10000);
  const rubble = roomAt(t, 0, 0)!;
  assert.equal(rubble.def, 'rubble');
  assert.equal(roomAt(t, 0, 1)?.def, 'mine', 'the room above still stands');
  assert.deepEqual(pos(frontRoom(t, 'left', false)), [0, 1], 'rubble is skipped');
  assert.equal(w.issue({ type: 'demolish', team: 1, col: 0, floor: 0 }).ok, false);
  const bank = t.bank.minerals;
  assert.equal(w.issue({ type: 'build', team: 1, room: 'wall', col: 0, floor: 0 }).ok, true);
  assert.equal(t.bank.minerals, bank - ROOMS.wall.cost.minerals * ECON.rubbleRebuild);
});

test('the Core falls last on its floor; when it falls the game ends and the sim freezes', () => {
  const w = arena();
  const t = w.tower(1);
  place(w, 1, 'wall', 3, 0);
  builtNow(w);
  assert.equal(frontRoom(t, 'left', false)?.def, 'wall');
  w.damageRoom(1, roomAt(t, 3, 0)!, 10000);
  assert.equal(frontRoom(t, 'left', false)?.def, 'core');
  w.damageRoom(1, coreOf(t)!, 100000);
  assert.equal(w.winner, 0);
  const tick = w.tick;
  w.stepSeconds(5);
  assert.equal(w.tick, tick);
  assert.equal(w.issue({ type: 'build', team: 0, room: 'mine', col: 2, floor: 0 }).ok, false);
});

// ---- Integration ----------------------------------------------------------------

test('M2 exit: a player who only builds rooms razes the dummy tower', () => {
  const w = new World({ teams: [0, 1], scenario: 'dummy', seed: 3 });
  const p = w.tower(0);
  // A plain opening: build each step as soon as it's affordable, tap producers once a second.
  const plan: [RoomId, number, number][] = [
    ['mine', 2, 0], ['mine', 3, 0], ['barracks', 4, 0], ['quarters', 2, 1], ['barracks', 5, 0], ['mine', 3, 1], ['quarters', 4, 1],
  ];
  while (w.winner === null && w.seconds < 600) {
    if (plan.length && w.issue({ type: 'build', team: 0, room: plan[0][0], col: plan[0][1], floor: plan[0][2] }).ok) plan.shift();
    if (w.tick % 20 === 0)
      for (const r of p.rooms) if (ROOMS[r.def].produces && r.buffer >= 1) w.issue({ type: 'collect', team: 0, col: r.col, floor: r.floor });
    w.step();
  }
  assert.equal(w.winner, 0, `dummy should fall; units=${w.units.length} t=${w.seconds}`);
  console.log(`  dummy razed at ${w.seconds.toFixed(0)}s`);
});

test('determinism holds with units and combat (replay)', () => {
  const w = new World({ teams: [0, 1], scenario: 'dummy', seed: 5 });
  w.tower(0).bank = { minerals: 2000, gas: 500 };
  w.issue({ type: 'build', team: 0, room: 'barracks', col: 2, floor: 0 });
  w.issue({ type: 'build', team: 0, room: 'barracks', col: 3, floor: 0 });
  w.stepSeconds(30);
  w.issue({ type: 'setTrain', team: 0, col: 3, floor: 0, unit: 'bruiser' });
  w.stepSeconds(90);
  assert.ok(w.units.length > 0);
  // Replay by hand (the stock replay() starts from the default bank).
  const w2 = new World({ teams: [0, 1], scenario: 'dummy', seed: 5 });
  w2.tower(0).bank = { minerals: 2000, gas: 500 };
  let i = 0;
  while (w2.tick < w.tick) {
    while (i < w.commandLog.length && w.commandLog[i].tick === w2.tick) w2.issue(w.commandLog[i++].cmd);
    w2.step();
  }
  assert.equal(w2.hash(), w.hash());
});

// ---- Teams, homes, supply (P1) ---------------------------------------------------

test('hostile(): only the player and the hostile team fight; neutral fights no one', () => {
  const teams: Team[] = [0, 1, 2];
  const table = teams.map((a) => teams.map((b) => (hostile(a, b) ? 'x' : '.')).join('')).join(' ');
  assert.equal(table, '.x. x.. ...');
});

test('units carry a direction and a home tower; supply counts only units whose home is that tower', () => {
  const w = arena();
  const home = w.tower(0);
  const outpost = w.addTower(0, { x: -20, front: 'left', coreCol: 4 });
  const a = w.spawnUnit('trooper', 0, 0);
  const b = w.spawnUnit('bruiser', 0, 0, outpost);
  const raider = w.spawnUnit('trooper', 1, 0, home); // spawned at someone else's tower: no home
  assert.deepEqual([a.dir, a.home], [1, home.id]);
  assert.deepEqual([b.dir, b.home], [-1, outpost.id], 'leaves from the outpost\'s left face');
  assert.equal(b.x, outpost.x);
  assert.equal(raider.home, null);
  assert.equal(w.supplyUsed(home), UNITS.trooper.supply);
  assert.equal(w.supplyUsed(outpost), UNITS.bruiser.supply);
  assert.equal(w.supplyUsed(0), UNITS.trooper.supply, 'a team number means its home tower');
});

test('a tower attacked from its left loses column 0 first; its other face is untouched', () => {
  const w = arena();
  const home = w.tower(0); // faces right; its left face is at x = 0
  place(w, 0, 'wall', 2, 0);
  place(w, 0, 'wall', 5, 0);
  builtNow(w);
  const raider = w.spawnUnit('bruiser', 1, 0, home);
  raider.x = raider.px = -8;
  raider.dir = 1;
  w.stepSeconds(20);
  assert.equal(raider.target?.kind, 'room');
  assert.ok(raider.x < 0, `stopped on the left at ${raider.x}`);
  assert.ok(coreOf(home)!.hp < ROOMS.core.hp, 'the Core (column 0-1) takes the hits');
  assert.equal(roomAt(home, 2, 0)!.hp, ROOMS.wall.hp);
  assert.equal(roomAt(home, 5, 0)!.hp, ROOMS.wall.hp, 'the lane-side wall is never touched');
});

test('three towers on one axis: units hit the nearest hostile tower ahead and walk past friendly ones', () => {
  const w = arena();
  const near = w.tower(1); // x = 22, faces left
  const far = w.addTower(1, { x: 40, front: 'left', coreCol: 4 });
  assert.deepEqual(w.towers.map((t) => t.x), [0, near.x, far.x]);
  const mine = w.spawnUnit('trooper', 0, 0);
  w.stepSeconds(25);
  assert.equal(mine.target?.kind, 'room');
  assert.equal(mine.target?.kind === 'room' && mine.target.tower, near.id, 'the nearer hostile tower');
  // In a fresh world, a unit from the far tower walks straight through its own team's nearer tower.
  const w2 = arena();
  const near2 = w2.tower(1);
  const far2 = w2.addTower(1, { x: 40, front: 'left', coreCol: 4 });
  const theirs = w2.spawnUnit('bruiser', 1, 0, far2);
  assert.equal(theirs.x, far2.x);
  w2.stepSeconds(25); // 0.8 cells/s: 20 cells, from x=40 to x=20, past the near tower (x 22-28)
  assert.ok(theirs.x < near2.x, `walked past its own team's tower (x=${theirs.x})`);
  assert.equal(theirs.target, null);
  assert.ok(near2.rooms.every((r) => r.hp === ROOMS[r.def].hp), 'never hit its own team');
});

test('a neutral tower between the sides is never targeted, and neither are its units', () => {
  const w = arena();
  const trader = w.addTower(2, { x: 12, front: 'both', coreCol: 2 });
  w.tower(2).bank = { minerals: 0, gas: 0 };
  const trader0 = trader.rooms.map((r) => r.hp);
  const local = w.spawnUnit('trooper', 2, 0, trader);
  local.x = local.px = 13; // stand still inside the trader's footprint
  const localHp = local.hp;
  w.spawnUnit('trooper', 0, 0);
  w.spawnUnit('trooper', 1, 0);
  w.stepSeconds(40);
  assert.deepEqual(trader.rooms.map((r) => r.hp), trader0, 'trader rooms untouched');
  assert.equal(local.hp, localHp, 'neutral unit untouched');
  assert.equal(w.winner, null);
});

// ---- Waiting reasons and posture -----------------------------------------------------

test('an idle production room says what it is waiting for: minerals, gas or supply', () => {
  const w = solo();
  const t = w.tower(0);
  place(w, 0, 'barracks', 2, 0);
  builtNow(w);
  const r = roomAt(t, 2, 0)!;
  t.bank = { minerals: 10, gas: 0 };
  w.step();
  assert.equal(r.waiting, 'minerals');
  w.issue({ type: 'setTrain', team: 0, col: 2, floor: 0, unit: 'bruiser' });
  t.bank = { minerals: 500, gas: 0 };
  w.step();
  assert.equal(r.waiting, 'gas');
  t.bank = { minerals: 100000, gas: 100000 };
  w.step();
  assert.equal(r.waiting, null, 'training now');
  w.stepSeconds(60);
  assert.equal(r.waiting, 'supply', 'base supply (6) is full of Bruisers');
});

test('Build posture stops new units (the one in training finishes); Army resumes', () => {
  const w = solo();
  const t = w.tower(0);
  place(w, 0, 'barracks', 2, 0);
  builtNow(w);
  const r = roomAt(t, 2, 0)!;
  w.step();
  assert.ok(r.job, 'training');
  assert.equal(w.issue({ type: 'setPosture', team: 0, posture: 'build' }).ok, true);
  assert.equal(w.issue({ type: 'setPosture', team: 0, posture: 'build' }).ok, false, 'already set');
  w.stepSeconds(UNITS.trooper.trainTime);
  assert.equal(w.units.length, 1, 'the unit in training finished');
  const bank = t.bank.minerals;
  w.stepSeconds(30);
  assert.equal(w.units.length, 1, 'nothing new');
  assert.equal(r.waiting, 'posture');
  assert.ok(t.bank.minerals > bank, 'the bank grows instead');
  w.issue({ type: 'setPosture', team: 0, posture: 'army' });
  w.step();
  assert.ok(r.job, 'training again');
});
