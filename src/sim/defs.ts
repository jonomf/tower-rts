/**
 * Catalog: every tunable number lives here (mirrored in DESIGN.md).
 * Units: time in seconds, rates per second, costs in resource units.
 */

export type Res = 'minerals' | 'gas';
export type Cost = { minerals: number; gas: number };

export type RoomId = 'core' | 'mine' | 'refinery' | 'quarters' | 'wall';

export type RoomDef = {
  id: RoomId;
  name: string;
  /** Cells wide. Everything except the Core is 1; wider rooms come from merging. */
  width: number;
  cost: Cost;
  buildTime: number;
  hp: number;
  /** Output per second for one unmerged room. Goes into the room's buffer (see ECON). */
  produces?: { res: Res; rate: number };
  /** Supply cap added by one unmerged room. */
  supply?: number;
  /** Adjacent built rooms of this type on one floor merge (up to MAX_MERGE wide). */
  mergeable: boolean;
  /** False for the pre-placed Core. */
  buildable: boolean;
  color: string;
  blurb: string;
};

export const ROOMS: Record<RoomId, RoomDef> = {
  core: {
    id: 'core',
    name: 'Core',
    width: 2,
    cost: { minerals: 0, gas: 0 },
    buildTime: 0,
    hp: 1500,
    mergeable: false,
    buildable: false,
    color: '#c9a227',
    blurb: 'Your tower’s heart. Trickles minerals. Lose it and you lose.',
  },
  mine: {
    id: 'mine',
    name: 'Mine',
    width: 1,
    cost: { minerals: 75, gas: 0 },
    buildTime: 8,
    hp: 200,
    produces: { res: 'minerals', rate: 2 },
    mergeable: true,
    buildable: true,
    color: '#3f88c5',
    blurb: 'Produces minerals. Tap to collect.',
  },
  refinery: {
    id: 'refinery',
    name: 'Refinery',
    width: 1,
    cost: { minerals: 75, gas: 0 },
    buildTime: 10,
    hp: 200,
    produces: { res: 'gas', rate: 1 },
    mergeable: true,
    buildable: true,
    color: '#3fa34d',
    blurb: 'Produces gas. Tap to collect.',
  },
  quarters: {
    id: 'quarters',
    name: 'Quarters',
    width: 1,
    cost: { minerals: 100, gas: 0 },
    buildTime: 10,
    hp: 250,
    supply: 8,
    mergeable: true,
    buildable: true,
    color: '#b56576',
    blurb: 'Raises your supply cap (how big an army you can field).',
  },
  wall: {
    id: 'wall',
    name: 'Wall',
    width: 1,
    cost: { minerals: 50, gas: 0 },
    buildTime: 6,
    hp: 600,
    mergeable: false,
    buildable: true,
    color: '#6c757d',
    blurb: 'Does nothing but soak damage. Cheap armor for the lane side.',
  },
};

/** Build palette order. */
export const PALETTE: RoomId[] = ['mine', 'refinery', 'quarters', 'wall'];

export const TOWER = {
  cols: 6,
  floors: 8,
  /** Column cols-1 faces the lane. The Core sits at the back of floor 0 (columns 0..width-1). */
  coreCol: 0,
};

export const ECON = {
  startBank: { minerals: 200, gas: 0 } as Cost,
  baseSupply: 6,
  /** Core income, straight to the bank (keeps a broke tower alive). */
  coreRate: { minerals: 1, gas: 0 } as Cost,
  /** A room's buffer holds this many seconds of its output. */
  bufferSeconds: 30,
  /** Fraction of a room's rate that flows from its buffer to the bank on its own. 1 = no tapping needed. */
  autoCollectRate: 0.4,
  demolishRefund: 0.5,
};

/** Total output multiplier for a merged group of n rooms (index = n). */
export const MERGE_MULT = [0, 1, 2.2, 3.6];
export const MAX_MERGE = 3;
