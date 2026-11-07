/** World-space layout for drawing and hit-testing. The sim knows grid cells and lane x; this maps them to space. */
import { LANE, TOWER } from '../sim/defs.ts';
import type { Team } from '../sim/types.ts';

export const CELL_W = 96;
export const CELL_H = 64;
export const FRAME = 10;
export const TOWER_W = TOWER.cols * CELL_W;
export const TOWER_H = TOWER.floors * CELL_H;
/** One lane cell is one tower column wide. */
export const LANE_LEN = LANE.length * CELL_W;
/** Left edge of the (mirrored) enemy tower. */
export const ENEMY_X0 = TOWER_W + LANE_LEN;
export const FIELD_W = ENEMY_X0 + TOWER_W;

export type Cell = { col: number; floor: number };
export type Rect = { x: number; y: number; w: number; h: number };

/**
 * A tower cell in world space. Floors grow upward from ground y = 0 (screen-style y: up is negative).
 * Team 0's tower spans x 0..TOWER_W with column cols-1 at the lane; team 1's is mirrored on the far side.
 */
export function cellRect(col: number, floor: number, w = 1, team: Team = 0): Rect {
  const x = team === 0 ? col * CELL_W : ENEMY_X0 + (TOWER.cols - col - w) * CELL_W;
  return { x, y: -(floor + 1) * CELL_H, w: w * CELL_W, h: CELL_H };
}

/** Lane x (cells) → world x. Lane x 0 is team 0's lane face. */
export const laneToWorld = (x: number): number => TOWER_W + x * CELL_W;
/** Altitude (floors) → world y. */
export const altToWorld = (alt: number): number => -alt * CELL_H;

/** Player-tower cell under a world point. */
export function cellAt(wx: number, wy: number): Cell | null {
  const col = Math.floor(wx / CELL_W);
  const floor = Math.floor(-wy / CELL_H);
  if (col < 0 || col >= TOWER.cols || floor < 0 || floor >= TOWER.floors) return null;
  return { col, floor };
}
