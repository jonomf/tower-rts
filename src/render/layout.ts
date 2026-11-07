/** World-space layout for drawing and hit-testing. The sim knows only grid cells; this maps them to space. */
import { TOWER } from '../sim/defs.ts';

export const CELL_W = 96;
export const CELL_H = 64;
export const FRAME = 10;
export const TOWER_W = TOWER.cols * CELL_W;
export const TOWER_H = TOWER.floors * CELL_H;
/** Lane from the player tower's lane face to the enemy site (enemy arrives in M2/M3). */
export const LANE_LEN = 1400;

export type Cell = { col: number; floor: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** Player tower: x in [0, TOWER_W], floors grow upward from ground y = 0 (screen-style y: up is negative). */
export function cellRect(col: number, floor: number, w = 1): Rect {
  return { x: col * CELL_W, y: -(floor + 1) * CELL_H, w: w * CELL_W, h: CELL_H };
}

export function cellAt(wx: number, wy: number): Cell | null {
  const col = Math.floor(wx / CELL_W);
  const floor = Math.floor(-wy / CELL_H);
  if (col < 0 || col >= TOWER.cols || floor < 0 || floor >= TOWER.floors) return null;
  return { col, floor };
}
