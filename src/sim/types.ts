import type { Cost, RoomId } from './defs.ts';

export type Team = 0 | 1;
export const PLAYER: Team = 0;
export const ENEMY: Team = 1;

export type RoomInstId = number;

export type Room = {
  id: RoomInstId;
  def: RoomId;
  /** Leftmost column (tower-local: column cols-1 always faces the lane). */
  col: number;
  floor: number;
  w: number;
  hp: number;
  built: boolean;
  /** Seconds of construction done. */
  progress: number;
  /** Uncollected output (producers only). */
  buffer: number;
  /** What was paid, for refunds. */
  paid: Cost;
};

export type Tower = {
  team: Team;
  bank: Cost;
  rooms: Room[];
  /** grid[floor][col] = room id or null. */
  grid: (RoomInstId | null)[][];
  /** Lifetime totals, for stats and tests. */
  income: Cost;
};

export type Command =
  | { type: 'build'; team: Team; room: RoomId; col: number; floor: number }
  | { type: 'cancel'; team: Team; col: number; floor: number }
  | { type: 'demolish'; team: Team; col: number; floor: number }
  | { type: 'collect'; team: Team; col: number; floor: number };

export type CommandResult = { ok: true; gained?: Cost } | { ok: false; reason: string };
