import type { Cost, RoomId, UnitId } from './defs.ts';

/** 0: the player. 1: hostile to the player. 2: neutral (a trader; at war with no one). */
export type Team = 0 | 1 | 2;
export const PLAYER: Team = 0;
export const ENEMY: Team = 1;
export const NEUTRAL: Team = 2;

/** Whether two teams fight each other. Only the player and the hostile team do. */
export const hostile = (a: Team, b: Team): boolean => (a === 0 && b === 1) || (a === 1 && b === 0);

/** The other side of the war (Skirmish win rule): 0 ↔ 1. Neutral has no opponent. */
export const opponent = (t: Team): Team | null => (t === 0 ? 1 : t === 1 ? 0 : null);

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

/** `tower` picks one of the team's towers; omitted, the command goes to the team's first (home) tower. */
type TowerRef = { team: Team; tower?: TowerId };

export type Command =
  | (TowerRef & { type: 'build'; room: RoomId; col: number; floor: number })
  | (TowerRef & { type: 'cancel'; col: number; floor: number })
  | (TowerRef & { type: 'demolish'; col: number; floor: number })
  | (TowerRef & { type: 'collect'; col: number; floor: number })
  | (TowerRef & { type: 'setTrain'; col: number; floor: number; unit: UnitId | null });

export type CommandResult = { ok: true; gained?: Cost } | { ok: false; reason: string };
