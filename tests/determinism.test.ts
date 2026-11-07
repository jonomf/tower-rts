import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, replay } from '../src/sim/world.ts';
import { Rng } from '../src/sim/rng.ts';
import type { Command } from '../src/sim/types.ts';

function script(w: World, extra = false): void {
  const at = (sec: number, cmd: Command) => {
    while (w.seconds < sec) w.step();
    w.issue(cmd);
  };
  at(0, { type: 'build', team: 0, room: 'mine', col: 2, floor: 0 });
  at(3, { type: 'build', team: 0, room: 'mine', col: 3, floor: 0 });
  at(20, { type: 'collect', team: 0, col: 2, floor: 0 });
  at(25, { type: 'build', team: 0, room: 'quarters', col: 2, floor: 1 });
  if (extra) at(26, { type: 'collect', team: 0, col: 3, floor: 0 });
  at(40, { type: 'collect', team: 0, col: 3, floor: 0 });
  w.stepSeconds(30);
}

test('rng: same seed, same sequence; different seed, different sequence', () => {
  const a = new Rng(42), b = new Rng(42), c = new Rng(43);
  const sa = Array.from({ length: 5 }, () => a.next());
  assert.deepEqual(sa, Array.from({ length: 5 }, () => b.next()));
  assert.notDeepEqual(sa, Array.from({ length: 5 }, () => c.next()));
  assert.ok(sa.every((x) => x >= 0 && x < 1));
});

test('same options + same commands on the same ticks -> same hash', () => {
  const a = new World({ seed: 7 });
  const b = new World({ seed: 7 });
  script(a);
  script(b);
  assert.equal(a.hash(), b.hash());
});

test('a different command changes the hash', () => {
  const a = new World({ seed: 7 });
  const b = new World({ seed: 7 });
  script(a);
  script(b, true);
  assert.notEqual(a.hash(), b.hash());
});

test('replaying the command log reproduces the hash', () => {
  const a = new World({ seed: 9 });
  script(a);
  const r = replay({ seed: 9 }, a.commandLog, a.tick);
  assert.equal(r.tick, a.tick);
  assert.equal(r.hash(), a.hash());
});

test('rejected commands are not logged', () => {
  const w = new World();
  assert.equal(w.issue({ type: 'build', team: 0, room: 'mine', col: 2, floor: 3 }).ok, false);
  assert.equal(w.commandLog.length, 0);
});
