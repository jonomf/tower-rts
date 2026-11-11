/** World-space layout for drawing and hit-testing. The sim knows grid cells and axis x; this maps them to space. */
import { TOWER } from '../sim/defs.ts';
import type { Tower } from '../sim/types.ts';

export const CELL_W = 96;
export const CELL_H = 64;
export const FRAME = 10;
export const TOWER_W = TOWER.cols * CELL_W;
export const TOWER_H = TOWER.floors * CELL_H;

export type Cell = { col: number; floor: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** Axis x (cells) → world x. */
export const laneToWorld = (x: number): number => x * CELL_W;
/** Altitude (floors) → world y. */
export const altToWorld = (alt: number): number => -alt * CELL_H;

/** A cell of a tower at axis position `towerX`, in world space. Floors grow upward from ground y = 0 (up is negative y). */
export function cellRect(col: number, floor: number, w = 1, towerX = 0): Rect {
  return { x: (towerX + col) * CELL_W, y: -(floor + 1) * CELL_H, w: w * CELL_W, h: CELL_H };
}

/** The cell of tower `t` under a world point, if any. */
export function cellAt(t: Pick<Tower, 'x'>, wx: number, wy: number): Cell | null {
  const col = Math.floor(wx / CELL_W) - t.x;
  const floor = Math.floor(-wy / CELL_H);
  if (col < 0 || col >= TOWER.cols || floor < 0 || floor >= TOWER.floors) return null;
  return { col, floor };
}

/** World-space extent of every tower plus the ground between them. */
export function fieldBounds(towers: readonly Pick<Tower, 'x'>[]): { x0: number; x1: number } {
  const xs = towers.map((t) => t.x);
  return { x0: Math.min(...xs) * CELL_W, x1: (Math.max(...xs) + TOWER.cols) * CELL_W };
}
