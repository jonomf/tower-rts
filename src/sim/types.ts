import type { Cost, RoomId, UnitId } from './defs.ts';

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
  /** Production rooms: the unit this room keeps training (null = paused). */
  train: UnitId | null;
  /** Production rooms: the unit in progress (already paid for). */
  job: { unit: UnitId; progress: number } | null;
};

export type UnitInstId = number;

export type Unit = {
  id: UnitInstId;
  def: UnitId;
  team: Team;
  /** Lane position in cells: 0 = team 0's lane face, LANE.length = team 1's. */
  x: number;
  /** x at the start of the last tick (render interpolation). */
  px: number;
  /** Height in floors (0 for ground units). */
  alt: number;
  /** 0..1 visual spread across the lane's depth (no gameplay effect). */
  depth: number;
  hp: number;
  cooldown: number;
  target: Target | null;
};

export type Target = { kind: 'unit'; id: UnitInstId } | { kind: 'room'; team: Team; id: RoomInstId };

/** Render-only events produced by the sim (not hashed). */
export type Effect =
  | {
      kind: 'shot';
      tick: number;
      team: Team;
      fx: number;
      falt: number;
      /** Unit target: lane position. */
      tx: number;
      talt: number;
      /** Room target (drawn at the room instead of tx/talt). */
      room: { team: Team; col: number; floor: number; w: number } | null;
    }
  | { kind: 'destroyed'; tick: number; team: Team; col: number; floor: number }
  | { kind: 'died'; tick: number; x: number; alt: number; team: Team };

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
  | { type: 'collect'; team: Team; col: number; floor: number }
  | { type: 'setTrain'; team: Team; col: number; floor: number; unit: UnitId | null };

export type CommandResult = { ok: true; gained?: Cost } | { ok: false; reason: string };
