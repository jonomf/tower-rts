import type { Cost, RoomId, UnitId } from './defs.ts';

export type Team = 0 | 1;
export const PLAYER: Team = 0;
export const ENEMY: Team = 1;

export type RoomInstId = number;

export type Room = {
  id: RoomInstId;
  def: RoomId;
  /** Leftmost column, counted from the tower's left edge (world-oriented: no mirroring). */
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
  /** Position on the world axis, in cells (a tower spans [tower.x, tower.x + TOWER.cols)). */
  x: number;
  /** x at the start of the last tick (render interpolation). */
  px: number;
  /** Walking direction on the axis. */
  dir: 1 | -1;
  /** The tower that trained this unit (it counts against that tower's supply), or null (raiders, test spawns). */
  home: TowerId | null;
  /** Height in floors (0 for ground units). */
  alt: number;
  /** 0..1 visual spread across the lane's depth (no gameplay effect). */
  depth: number;
  hp: number;
  cooldown: number;
  target: Target | null;
};

export type TowerId = number;

export type Target = { kind: 'unit'; id: UnitInstId } | { kind: 'room'; tower: TowerId; id: RoomInstId };

/** Which side of a tower faces danger: where its units leave from and where attackers are expected. */
export type Front = 'left' | 'right' | 'both';
export type Side = 'left' | 'right';

/** Render-only events produced by the sim (not hashed). */
export type Effect =
  | {
      kind: 'shot';
      tick: number;
      team: Team;
      fx: number;
      falt: number;
      /** Unit target: world position. */
      tx: number;
      talt: number;
      /** Room target (drawn at the room instead of tx/talt). `x` is the tower's x; `side` is the face that was hit. */
      room: { x: number; side: Side; col: number; floor: number; w: number } | null;
    }
  | { kind: 'destroyed'; tick: number; team: Team; x: number; col: number; floor: number }
  | { kind: 'died'; tick: number; x: number; alt: number; team: Team };

export type Tower = {
  id: TowerId;
  team: Team;
  /** Left edge on the world axis, in cells. Faces are at x (left) and x + TOWER.cols (right). */
  x: number;
  /** Leftmost column of the Core (on floor 0). */
  coreCol: number;
  front: Front;
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
