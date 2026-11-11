/** Preset setups applied after the towers exist. */
import type { RoomId } from './defs.ts';
import { placeRoom } from './tower.ts';
import type { World } from './world.ts';

export type ScenarioId = 'none' | 'dummy';

/**
 * M2 target: a static enemy tower (team 1) with no production and no AI.
 * Columns run left to right; column 0 faces the lane. Rows are listed bottom floor first.
 */
const DUMMY: (RoomId | null)[][] = [
  // floor 0: Core sits in columns 4-5
  ['wall', 'wall', 'quarters', 'mine', null, null],
  ['wall', 'wall', 'quarters', 'mine', 'refinery', 'mine'],
  [null, 'wall', 'refinery', 'mine', 'quarters', null],
  [null, null, 'hangar', 'mine', null, null],
];

export function buildScenario(w: World, id: ScenarioId): void {
  if (id === 'dummy') {
    const t = w.tower(1);
    DUMMY.forEach((row, floor) =>
      row.forEach((def, col) => {
        if (!def) return;
        const r = placeRoom(t, w.newId(), def, col, floor, true);
        r.train = null; // static: never trains
      }),
    );
  }
}
