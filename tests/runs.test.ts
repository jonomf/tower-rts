import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.ts';
import { recordRun, runStats } from '../src/ui/runs.ts';

test('run summary: score = sectors x100 + raids x50 + camps x200 + 1000 for a win - seconds', () => {
  const w = new World({ seed: 7, mode: 'expedition' });
  w.issue({ type: 'build', team: 0, room: 'mine', col: 1, floor: 0 });
  for (let i = 0; i < 20 * 30; i++) w.step();
  const lost = runStats(w);
  assert.equal(lost.won, false);
  assert.equal(lost.rooms, 1);
  assert.equal(lost.seconds, 30);
  assert.equal(lost.score, lost.explored * 100 + lost.repelled * 50 + lost.camps * 200 - 30);

  const sh = w.tower(1);
  w.damageRoom(sh, sh.rooms.find((r) => r.def === 'core')!, 1e9);
  w.step();
  assert.equal(w.winner, 0, 'destroying the Stronghold Core wins the run');
  const won = runStats(w);
  assert.equal(won.score, lost.score + 1000);
});

test('best run: kept only when beaten, and storage failures are swallowed', () => {
  const run = { won: false, seconds: 60, explored: 3, repelled: 1, camps: 0, rooms: 4, score: 290 };
  // No localStorage in Node: recordRun must not throw, and reports this run as the best.
  assert.deepEqual(recordRun(run), { best: run, isBest: true });
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  try {
    assert.equal(recordRun(run).isBest, true);
    assert.deepEqual(recordRun({ ...run, score: 100 }), { best: run, isBest: false });
    assert.equal(recordRun({ ...run, score: 900 }).best.score, 900);
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
