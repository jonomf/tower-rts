/** Preset setups applied after the towers exist. */
import type { RoomId } from './defs.ts';
import { placeRoom } from './tower.ts';
import type { World } from './world.ts';

export type ScenarioId = 'none' | 'dummy';

/**
 * M2 target: a static enemy tower (team 1) with no production and no AI.
 * Tower-local layout: column 5 faces the lane. Rows are listed bottom floor first.
 */
const DUMMY: (RoomId | null)[][] = [
  // floor 0: Core sits in columns 0-1
  [null, null, 'mine', 'quarters', 'wall', 'wall'],
  ['mine', 'refinery', 'mine', 'quarters', 'wall', 'wall'],
  [null, 'quarters', 'mine', 'refinery', 'wall', null],
  [null, null, 'mine', 'hangar', null, null],
];

export function buildScenario(w: World, id: ScenarioId): void {
  if (id === 'dummy') {
    const t = w.towers[1];
    if (!t) throw new Error('dummy scenario needs team 1');
    DUMMY.forEach((row, floor) =>
      row.forEach((def, col) => {
        if (!def) return;
        const r = placeRoom(t, w.newId(), def, col, floor, true);
        r.train = null; // static: never trains
      }),
    );
  }
}
