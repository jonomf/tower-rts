import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_VERSION, World } from '../src/sim/world.ts';
import { AiController, stepWithAi } from '../src/ai/controller.ts';
import { SCRIPTS } from '../src/ai/scripts.ts';

/** Save to JSON and back, as the browser does. */
const roundTrip = <T>(x: T): T => JSON.parse(JSON.stringify(x));

test('a restored Skirmish match with an AI continues exactly like the original', () => {
  const w = new World({ seed: 21, teams: [0, 1] });
  const ais = [new AiController(0, SCRIPTS.rush, 'sharp', 21), new AiController(1, SCRIPTS.boom, 'steady', 21)];
  for (let i = 0; i < 20 * 90; i++) stepWithAi(w, ais);
  assert.ok(w.units.length > 0 && w.commandLog.length > 20);

  const saved = roundTrip({ world: w.snapshot(), ais: ais.map((a) => a.snapshot()) });
  const w2 = World.fromSnapshot(saved.world);
  const ais2 = saved.ais.map((s) => AiController.fromSnapshot(s, SCRIPTS));
  assert.equal(w2.hash(), w.hash());

  for (let i = 0; i < 20 * 120; i++) {
    stepWithAi(w, ais);
    stepWithAi(w2, ais2);
  }
  assert.equal(w2.hash(), w.hash(), 'same state two minutes later');
  assert.equal(w2.winner, w.winner);
  assert.equal(w2.commandLog.length, w.commandLog.length);
});

test('a restored Expedition keeps its map, fog, sites and unit orders', () => {
  const w = new World({ mode: 'expedition', seed: 5 });
  w.tower(0).bank = { minerals: 2000, gas: 0 };
  w.issue({ type: 'build', team: 0, room: 'barracks', col: 4, floor: 0 });
  w.issue({ type: 'build', team: 0, room: 'quarters', col: 4, floor: 1 });
  w.stepSeconds(20);
  w.issue({ type: 'setDeploy', team: 0, col: 4, floor: 0, deploy: 'right' });
  w.issue({ type: 'setPosture', team: 0, posture: 'build' });
  w.stepSeconds(5);
  w.issue({ type: 'setPosture', team: 0, posture: 'army' });
  w.stepSeconds(60);
  const w2 = World.fromSnapshot(roundTrip(w.snapshot()));
  assert.equal(w2.options.mode, 'expedition');
  assert.deepEqual(w2.map, w.map);
  assert.ok(w2.map!.explored.filter(Boolean).length > 3);
  assert.equal(w2.hash(), w.hash());
  w.stepSeconds(60);
  w2.stepSeconds(60);
  assert.equal(w2.hash(), w.hash());
  // New ids keep counting from where the original was.
  const a = w.spawnUnit('trooper', 0, 0);
  const b = w2.spawnUnit('trooper', 0, 0);
  assert.equal(a.id, b.id);
});

test('a restored dummy-scenario world does not rebuild the dummy on top of itself', () => {
  const w = new World({ seed: 3, teams: [0, 1], scenario: 'dummy' });
  w.stepSeconds(5);
  const w2 = World.fromSnapshot(roundTrip(w.snapshot()));
  assert.equal(w2.tower(1).rooms.length, w.tower(1).rooms.length);
  assert.equal(w2.hash(), w.hash());
});

test('a save from another version is refused', () => {
  const snap = roundTrip(new World().snapshot());
  snap.version = SAVE_VERSION + 1;
  assert.throws(() => World.fromSnapshot(snap), /save version/);
});
