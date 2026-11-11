import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, replay } from '../src/sim/world.ts';
import { OVERTIME, UNITS } from '../src/sim/defs.ts';
import { AiController, pickCell, stepWithAi } from '../src/ai/controller.ts';
import { SCRIPTS } from '../src/ai/scripts.ts';
import { coreOf, roomAt } from '../src/sim/tower.ts';
import { runMatch } from '../tools/match.ts';

test('pickCell: back, merge, front, up', () => {
  const w = new World({ teams: [0] });
  const t = w.tower(0);
  t.bank = { minerals: 9999, gas: 9999 };
  assert.deepEqual(pickCell(t, 'mine', 'back'), { col: 2, floor: 0 });
  assert.deepEqual(pickCell(t, 'wall', 'front'), { col: 5, floor: 0 });
  assert.deepEqual(pickCell(t, 'quarters', 'up'), { col: 0, floor: 1 });
  w.issue({ type: 'build', team: 0, room: 'mine', col: 4, floor: 0 });
  assert.deepEqual(pickCell(t, 'mine', 'merge'), { col: 3, floor: 0 });
  assert.equal(pickCell(t, 'hangar', 'up'), null, 'nothing reaches floor 4 yet');
});

test('every script builds its whole order and fields an army against a passive tower', () => {
  for (const id of Object.keys(SCRIPTS)) {
    const w = new World({ seed: 2, teams: [0, 1] });
    const ai = new AiController(1, SCRIPTS[id], 'sharp', 2);
    let trained = 0;
    while (w.winner === null && w.seconds < 600) {
      const before = w.units.length;
      stepWithAi(w, [ai]);
      trained += Math.max(0, w.units.length - before);
    }
    assert.equal(w.winner, 1, `${id} should beat a tower that does nothing`);
    assert.ok(w.seconds < OVERTIME.start, `${id} wins before overtime (${w.seconds}s)`);
    assert.ok(trained >= 3, `${id} trained ${trained}`);
  }
});

test('production: a room waiting on resources holds its price back from later rooms', () => {
  const w = new World({ teams: [0] });
  const t = w.tower(0);
  t.bank = { minerals: 1000, gas: 1000 };
  w.issue({ type: 'build', team: 0, room: 'barracks', col: 2, floor: 0 });
  w.issue({ type: 'build', team: 0, room: 'barracks', col: 3, floor: 0 });
  w.issue({ type: 'setTrain', team: 0, col: 2, floor: 0, unit: 'bruiser' });
  for (const r of t.rooms) r.built = true;
  t.bank = { minerals: 120, gas: 0 }; // bruiser needs gas: it waits, and holds 100 minerals
  w.step();
  assert.equal(roomAt(t, 2, 0)!.job, null);
  assert.equal(roomAt(t, 3, 0)!.job, null, '120 - 100 held < 50');
  t.bank.minerals = 150 + UNITS.trooper.cost.minerals;
  w.step();
  assert.equal(roomAt(t, 3, 0)!.job?.unit, 'trooper');
});

test('overtime: Cores burn from 6:00, so an untouched stalemate still ends', () => {
  const w = new World({ teams: [0, 1] });
  w.stepSeconds(OVERTIME.start - 1);
  assert.equal(coreOf(w.tower(0))!.hp, 1500);
  w.stepSeconds(11);
  assert.ok(coreOf(w.tower(1))!.hp < 1500 - 50);
  coreOf(w.tower(1))!.hp -= 100; // team 1 took more damage earlier
  w.stepSeconds(300);
  assert.equal(w.winner, 0);
  assert.ok(w.seconds < 12 * 60);
});

test('M3 exit: full AI-vs-AI matches end with a winner in under 12 minutes', () => {
  for (const [a, b] of [['rush', 'boom'], ['boom', 'rush'], ['rush', 'rush'], ['boom', 'boom']] as const) {
    const r = runMatch(a, b, 'sharp', 'sharp', 4);
    assert.notEqual(r.winner, null, `${a} vs ${b}`);
    assert.ok(r.seconds < 12 * 60, `${a} vs ${b} took ${r.seconds}s`);
  }
});

test('M3 exit: replaying the command log with no AI attached reproduces the match', () => {
  const r = runMatch('rush', 'boom', 'sharp', 'relaxed', 11);
  const again = replay({ seed: 11, teams: [0, 1] }, r.world.commandLog, r.world.tick);
  assert.ok(r.world.commandLog.length > 50);
  assert.equal(again.winner, r.winner);
  assert.equal(again.hash(), r.world.hash());
});

test('sharp beats relaxed with the same script', () => {
  for (const id of Object.keys(SCRIPTS)) assert.equal(runMatch(id, id, 'sharp', 'relaxed', 6).winner, 0, id);
});
