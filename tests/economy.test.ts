import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.ts';
import { ECON, ROOMS } from '../src/sim/defs.ts';
import { roomAt, roomRate } from '../src/sim/tower.ts';

const near = (a: number, b: number, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

/** A world with one finished room at (2,0) and an empty bank, so only income shows. */
function oneMine(opts: { autoCollectRate?: number } = {}) {
  const w = new World(opts);
  w.issue({ type: 'build', team: 0, room: 'mine', col: 2, floor: 0 });
  w.stepSeconds(ROOMS.mine.buildTime);
  const t = w.tower(0);
  t.bank = { minerals: 0, gas: 0 };
  const mine = roomAt(t, 2, 0)!;
  mine.buffer = 0; // it produced during the tick it finished
  return { w, t, mine };
}

test('the Core trickles minerals into the bank', () => {
  const w = new World();
  w.stepSeconds(10);
  near(w.tower(0).bank.minerals, ECON.startBank.minerals + 10 * ECON.coreRate.minerals);
});

test('untapped: a producer pays out at the auto-collect rate', () => {
  const { w, t } = oneMine();
  w.stepSeconds(10);
  const rate = ROOMS.mine.produces!.rate;
  near(t.bank.minerals, 10 * ECON.coreRate.minerals + 10 * rate * ECON.autoCollectRate);
});

test('tapping collects the buffer; tapping often earns the full rate', () => {
  const { w, t } = oneMine();
  const rate = ROOMS.mine.produces!.rate;
  for (let i = 0; i < 10; i++) {
    w.stepSeconds(1);
    assert.equal(w.issue({ type: 'collect', team: 0, col: 2, floor: 0 }).ok, true);
  }
  near(t.bank.minerals, 10 * ECON.coreRate.minerals + 10 * rate);
});

test('the buffer caps at bufferSeconds of output; past that only auto-collect pays', () => {
  const { w, mine } = oneMine({ autoCollectRate: 0 });
  const rate = ROOMS.mine.produces!.rate;
  w.stepSeconds(ECON.bufferSeconds + 20);
  near(mine.buffer, rate * ECON.bufferSeconds);
});

test('collecting an empty room fails and is not logged', () => {
  const { w } = oneMine();
  w.issue({ type: 'collect', team: 0, col: 2, floor: 0 });
  const n = w.commandLog.length;
  assert.equal(w.issue({ type: 'collect', team: 0, col: 2, floor: 0 }).ok, false);
  assert.equal(w.issue({ type: 'collect', team: 0, col: 0, floor: 0 }).ok, false); // Core: no buffer
  assert.equal(w.commandLog.length, n);
});

test('merged producers: each room gets the merge share, one tap collects the whole group', () => {
  const w = new World({ autoCollectRate: 0 });
  const t = w.tower(0);
  t.bank = { minerals: 1000, gas: 0 };
  for (const c of [2, 3, 4]) w.issue({ type: 'build', team: 0, room: 'refinery', col: c, floor: 0 });
  w.stepSeconds(ROOMS.refinery.buildTime);
  const r = roomAt(t, 3, 0)!;
  t.bank.gas = 0;
  for (const c of [2, 3, 4]) roomAt(t, c, 0)!.buffer = 0;
  near(roomRate(t, r), ROOMS.refinery.produces!.rate * 1.2);
  w.stepSeconds(10);
  const res = w.issue({ type: 'collect', team: 0, col: 4, floor: 0 });
  assert.equal(res.ok, true);
  near(t.bank.gas, 10 * ROOMS.refinery.produces!.rate * 3.6);
  for (const c of [2, 3, 4]) assert.equal(roomAt(t, c, 0)!.buffer, 0);
});

test('autoCollectRate = 1 means tapping adds nothing', () => {
  const a = oneMine({ autoCollectRate: 1 });
  const b = oneMine({ autoCollectRate: 1 });
  for (let i = 0; i < 10; i++) {
    a.w.stepSeconds(1);
    b.w.stepSeconds(1);
    b.w.issue({ type: 'collect', team: 0, col: 2, floor: 0 });
  }
  near(a.t.bank.minerals, b.t.bank.minerals);
});
