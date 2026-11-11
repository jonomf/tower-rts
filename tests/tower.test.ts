import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.ts';
import { ECON, ROOMS, TOWER } from '../src/sim/defs.ts';
import { coreOf, mergeGroups, roomAt, supplyMax } from '../src/sim/tower.ts';
import type { Command, CommandResult } from '../src/sim/types.ts';

const rich = () => {
  const w = new World();
  w.tower(0).bank = { minerals: 10000, gas: 10000 };
  return w;
};
const build = (w: World, room: 'mine' | 'refinery' | 'quarters' | 'wall', col: number, floor: number): CommandResult =>
  w.issue({ type: 'build', team: 0, room, col, floor });
const cmd = (w: World, type: Exclude<Command['type'], 'build' | 'setTrain'>, col: number, floor: number) => w.issue({ type, team: 0, col, floor });
const reason = (r: CommandResult) => (r.ok ? 'ok' : r.reason);

test('a new tower has a 2-wide Core at the back of floor 0 and the starting bank', () => {
  const w = new World();
  const t = w.tower(0);
  const core = coreOf(t)!;
  assert.deepEqual([core.col, core.floor, core.w, core.built], [0, 0, 2, true]);
  assert.equal(roomAt(t, 1, 0), core);
  assert.deepEqual(t.bank, ECON.startBank);
  assert.equal(t.grid.length, TOWER.floors);
  assert.equal(t.grid[0].length, TOWER.cols);
});

test('building costs its price up front and finishes after buildTime', () => {
  const w = new World();
  assert.equal(reason(build(w, 'mine', 2, 0)), 'ok');
  const t = w.tower(0);
  assert.equal(t.bank.minerals, 200 - ROOMS.mine.cost.minerals);
  const r = roomAt(t, 2, 0)!;
  assert.equal(r.built, false);
  w.stepSeconds(ROOMS.mine.buildTime - 0.1);
  assert.equal(r.built, false);
  w.stepSeconds(0.1);
  assert.equal(r.built, true);
});

test('placement rules: bounds, occupied, support, cost', () => {
  const w = new World();
  assert.equal(reason(build(w, 'mine', 6, 0)), 'Outside the tower');
  assert.equal(reason(build(w, 'mine', 1, 0)), 'That cell is taken');
  assert.equal(reason(build(w, 'mine', 3, 1)), 'Needs a room below it');
  assert.equal(reason(build(w, 'mine', 0, 1)), 'ok'); // on top of the Core
  assert.equal(reason(build(w, 'mine', 2, 0)), 'ok');
  assert.equal(reason(build(w, 'quarters', 3, 0)), 'Not enough minerals'); // 50 left
  assert.equal(reason(build(w, 'mine', 2, 1)), 'Not enough minerals'); // supported by the unfinished mine, but broke
  w.tower(0).bank.minerals = 1000;
  assert.equal(reason(build(w, 'mine', 2, 1)), 'ok'); // unfinished rooms still support
});

test('cancel refunds in full; demolish refunds half; neither may leave a room floating', () => {
  const w = rich();
  build(w, 'mine', 2, 0);
  build(w, 'wall', 2, 1);
  assert.equal(reason(cmd(w, 'cancel', 2, 0)), 'A room above depends on it');
  const before = w.tower(0).bank.minerals;
  assert.equal(reason(cmd(w, 'cancel', 2, 1)), 'ok');
  assert.equal(w.tower(0).bank.minerals, before + ROOMS.wall.cost.minerals);
  assert.equal(reason(cmd(w, 'demolish', 2, 0)), 'Still building (cancel instead)');
  w.stepSeconds(10);
  const b2 = w.tower(0).bank.minerals;
  const buf = roomAt(w.tower(0), 2, 0)!.buffer;
  assert.equal(reason(cmd(w, 'demolish', 2, 0)), 'ok');
  assert.equal(w.tower(0).bank.minerals, b2 + Math.floor(ROOMS.mine.cost.minerals * 0.5) + Math.floor(buf));
  assert.equal(roomAt(w.tower(0), 2, 0), undefined);
  assert.equal(reason(cmd(w, 'demolish', 0, 0)), 'The Core can’t be removed');
});

test('merge: adjacent built same-type rooms on a floor group up to 3; the rest start a new group', () => {
  const w = rich();
  for (const c of [2, 3, 4, 5]) build(w, 'mine', c, 0);
  // unbuilt rooms don't merge
  assert.equal(mergeGroups(w.tower(0)).filter((g) => g[0].def === 'mine').length, 4);
  w.stepSeconds(ROOMS.mine.buildTime);
  const sizes = mergeGroups(w.tower(0)).filter((g) => g[0].def === 'mine').map((g) => g.length);
  assert.deepEqual(sizes, [3, 1]);
});

test('merge: different types, gaps and floors break groups', () => {
  const w = rich();
  build(w, 'mine', 2, 0);
  build(w, 'refinery', 3, 0);
  build(w, 'mine', 4, 0);
  build(w, 'mine', 0, 1);
  build(w, 'mine', 1, 1);
  w.stepSeconds(20);
  const mines = mergeGroups(w.tower(0)).filter((g) => g[0].def === 'mine').map((g) => g.map((r) => `${r.col},${r.floor}`));
  assert.deepEqual(mines, [['2,0'], ['4,0'], ['0,1', '1,1']]);
});

test('supply: base + Quarters (built only), merged Quarters get the bonus', () => {
  const w = rich();
  assert.equal(supplyMax(w.tower(0)), ECON.baseSupply);
  build(w, 'quarters', 2, 0);
  assert.equal(supplyMax(w.tower(0)), ECON.baseSupply);
  w.stepSeconds(ROOMS.quarters.buildTime);
  assert.equal(supplyMax(w.tower(0)), ECON.baseSupply + 8);
  build(w, 'quarters', 3, 0);
  w.stepSeconds(ROOMS.quarters.buildTime);
  assert.equal(supplyMax(w.tower(0)), ECON.baseSupply + Math.floor(8 * 2.2));
});

test('commands go to the team\'s first tower by default, or to a named tower of that team', () => {
  const w = new World({ teams: [0, 1] });
  const second = w.addTower(0, { x: -20, front: 'left', coreCol: 4 });
  for (const t of w.towers) t.bank = { minerals: 1000, gas: 0 };
  assert.equal(w.issue({ type: 'build', team: 0, room: 'mine', col: 2, floor: 0 }).ok, true);
  assert.equal(roomAt(w.tower(0), 2, 0)?.def, 'mine', 'default: home tower');
  assert.equal(roomAt(second, 2, 0), undefined);
  assert.equal(w.issue({ type: 'build', team: 0, tower: second.id, room: 'wall', col: 2, floor: 0 }).ok, true);
  assert.equal(roomAt(second, 2, 0)?.def, 'wall');
  const r = w.issue({ type: 'build', team: 0, tower: w.tower(1).id, room: 'wall', col: 2, floor: 0 });
  assert.deepEqual(r, { ok: false, reason: 'Not your tower' });
  assert.deepEqual(w.issue({ type: 'build', team: 0, tower: 9999, room: 'wall', col: 2, floor: 0 }), { ok: false, reason: 'No such tower' });
  assert.equal(w.tower(0).x, 0, 'tower(team) is the first one created');
});
