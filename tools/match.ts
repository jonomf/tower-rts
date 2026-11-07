// Headless runner. M1: plays scripted economy openings on one tower and reports income.
// M3 turns this into AI-vs-AI matches (win rate, length) for balance sweeps.
// Usage: npm run match -- [--n 20] [--seconds 180] [--tap 1]  (--tap 0 = never tap, rely on auto-collect)
import { parseArgs } from 'node:util';
import { World } from '../src/sim/world.ts';
import { ROOMS, TOWER, type RoomId } from '../src/sim/defs.ts';
import { canAfford, placementError, roomAt, supplyMax } from '../src/sim/tower.ts';

const { values } = parseArgs({
  options: {
    n: { type: 'string', default: '10' },
    seconds: { type: 'string', default: '180' },
    tap: { type: 'string', default: '1' },
  },
});
const runs = Number(values.n), seconds = Number(values.seconds), tap = values.tap !== '0';

/** Openings: what to build next, in priority order, whenever affordable. */
const OPENINGS: Record<string, RoomId[]> = {
  minesOnly: ['mine', 'mine', 'mine', 'mine', 'mine', 'mine', 'mine', 'mine'],
  balanced: ['mine', 'mine', 'refinery', 'mine', 'quarters', 'refinery', 'mine', 'mine'],
  merged: ['mine', 'mine', 'mine', 'refinery', 'refinery', 'refinery', 'mine', 'mine'],
};

function firstFreeCell(w: World, def: RoomId): [number, number] | null {
  const t = w.tower(0);
  for (let f = 0; f < TOWER.floors; f++) for (let c = 0; c < TOWER.cols; c++) if (!placementError(t, def, c, f)) return [c, f];
  return null;
}

function play(order: RoomId[], seed: number) {
  const w = new World({ seed });
  const t = w.tower(0);
  let next = 0;
  while (w.seconds < seconds) {
    if (next < order.length && canAfford(t.bank, ROOMS[order[next]].cost)) {
      const cell = firstFreeCell(w, order[next]);
      if (cell && w.issue({ type: 'build', team: 0, room: order[next], col: cell[0], floor: cell[1] }).ok) next++;
    }
    // A "tapper" collects every room once a second (an attentive human).
    if (tap && w.tick % 20 === 0) {
      for (let f = 0; f < TOWER.floors; f++)
        for (let c = 0; c < TOWER.cols; c++) {
          const r = roomAt(t, c, f);
          if (r && r.col === c && r.buffer >= 1) w.issue({ type: 'collect', team: 0, col: c, floor: f });
        }
    }
    w.step();
  }
  return { minerals: t.income.minerals, gas: t.income.gas, rooms: t.rooms.length - 1, supply: supplyMax(t), hash: w.hash() };
}

console.log(`${runs} runs × ${seconds}s, tapping ${tap ? 'on' : 'off'}`);
for (const [name, order] of Object.entries(OPENINGS)) {
  const results = Array.from({ length: runs }, (_, i) => play(order, i + 1));
  const avg = (k: 'minerals' | 'gas') => (results.reduce((s, r) => s + r[k], 0) / runs).toFixed(0);
  const hashes = new Set(results.map((r) => r.hash)).size;
  console.log(`${name.padEnd(10)} income ◆${avg('minerals')} ▲${avg('gas')}  rooms ${results[0].rooms}  supply ${results[0].supply}  distinct hashes ${hashes}`);
}
