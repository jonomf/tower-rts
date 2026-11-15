/**
 * Catalog: every tunable number lives here (mirrored in DESIGN.md).
 * Units: time in seconds, rates per second, costs in resource units.
 */

export type Res = 'minerals' | 'gas';
export type Cost = { minerals: number; gas: number };

export type RoomId = 'core' | 'mine' | 'refinery' | 'quarters' | 'barracks' | 'hangar' | 'wall' | 'gunNest' | 'flak' | 'workshop' | 'lab' | 'infirmary' | 'cannon' | 'rubble' | 'campCore' | 'market';
export type UnitId = 'trooper' | 'scout' | 'bruiser' | 'marksman' | 'walker' | 'flyer' | 'interceptor';

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
  /** False for the pre-placed Core and for rubble. */
  buildable: boolean;
  /** Units this room can train (one at a time, on repeat). The first is the default pick. */
  trains?: UnitId[];
  /** Lowest floor this room may be built on. */
  minFloor?: number;
  /**
   * Defense rooms: shoots the nearest hostile unit (air or ground, per hitsAir) within `range` cells of an open face.
   * Must be built with nothing between it and a front face on its floor; walled in later, it stops firing.
   */
  turret?: { damage: number; cooldown: number; range: number; hitsAir: boolean };
  /** Tech: your team must own a built room of each of these before this can be built (see sim/tech.ts). */
  requires?: RoomId[];
  /** Hit points per second restored to each of this tower's garrisoned units standing at the tower. */
  heals?: number;
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
  barracks: {
    id: 'barracks',
    name: 'Barracks',
    width: 1,
    cost: { minerals: 150, gas: 0 },
    buildTime: 15,
    hp: 300,
    trains: ['trooper', 'scout', 'bruiser', 'marksman', 'walker'],
    mergeable: false,
    buildable: true,
    color: '#d17a22',
    blurb: 'Trains ground units on repeat while you can pay and have supply.',
  },
  hangar: {
    id: 'hangar',
    name: 'Hangar',
    width: 1,
    cost: { minerals: 150, gas: 100 },
    buildTime: 20,
    hp: 300,
    trains: ['flyer', 'interceptor'],
    minFloor: 3,
    requires: ['workshop'],
    mergeable: false,
    buildable: true,
    color: '#7b5ea7',
    blurb: 'Trains air units. Must be on floor 4 or higher.',
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
  gunNest: {
    id: 'gunNest',
    name: 'Gun Nest',
    width: 1,
    cost: { minerals: 100, gas: 0 },
    buildTime: 12,
    hp: 400,
    turret: { damage: 8, cooldown: 0.5, range: 3, hitsAir: false },
    requires: ['barracks'],
    mergeable: false,
    buildable: true,
    color: '#a23b3b',
    blurb: 'Shoots ground units near its side of the tower. Must be the outermost room on its floor.',
  },
  flak: {
    id: 'flak',
    name: 'Flak',
    width: 1,
    cost: { minerals: 100, gas: 50 },
    buildTime: 12,
    hp: 400,
    turret: { damage: 12, cooldown: 0.6, range: 4, hitsAir: true },
    requires: ['workshop'],
    mergeable: false,
    buildable: true,
    color: '#2f8f8f',
    blurb: 'Shoots air units near its side of the tower. Must be the outermost room on its floor.',
  },
  workshop: {
    id: 'workshop',
    name: 'Workshop',
    width: 1,
    cost: { minerals: 150, gas: 0 },
    buildTime: 15,
    hp: 300,
    requires: ['barracks'],
    mergeable: false,
    buildable: true,
    color: '#8c6d46',
    blurb: 'Tech. Unlocks the Hangar, Flak, the Lab and the Walker.',
  },
  lab: {
    id: 'lab',
    name: 'Lab',
    width: 1,
    cost: { minerals: 150, gas: 100 },
    buildTime: 20,
    hp: 250,
    requires: ['workshop'],
    mergeable: false,
    buildable: true,
    color: '#4f6fd0',
    blurb: 'Advanced tech. Unlocks the Cannon, the Marksman and the Interceptor.',
  },
  infirmary: {
    id: 'infirmary',
    name: 'Infirmary',
    width: 1,
    cost: { minerals: 125, gas: 25 },
    buildTime: 12,
    hp: 250,
    requires: ['quarters'],
    heals: 3,
    mergeable: false,
    buildable: true,
    color: '#d98880',
    blurb: 'Heals this tower’s garrison while it stands at home.',
  },
  cannon: {
    id: 'cannon',
    name: 'Cannon',
    width: 1,
    cost: { minerals: 200, gas: 100 },
    buildTime: 18,
    hp: 500,
    turret: { damage: 45, cooldown: 2.5, range: 6, hitsAir: false },
    requires: ['lab'],
    mergeable: false,
    buildable: true,
    color: '#7a2f4f',
    blurb: 'Long-range gun against ground units. Slow, heavy shots. Must be the outermost room on its floor.',
  },
  campCore: {
    id: 'campCore',
    name: 'Camp',
    width: 2,
    cost: { minerals: 0, gas: 0 },
    buildTime: 0,
    hp: 600,
    mergeable: false,
    buildable: false,
    color: '#8a2b2b',
    blurb: 'The heart of a raider camp. Destroy it and the camp is gone.',
  },
  market: {
    id: 'market',
    name: 'Trader',
    width: 2,
    cost: { minerals: 0, gas: 0 },
    buildTime: 0,
    hp: 600,
    mergeable: false,
    buildable: false,
    color: '#b8922e',
    blurb: 'A neutral trading post.',
  },
  rubble: {
    id: 'rubble',
    name: 'Rubble',
    width: 1,
    cost: { minerals: 0, gas: 0 },
    buildTime: 0,
    hp: 0,
    mergeable: false,
    buildable: false,
    color: '#4a4440',
    blurb: 'A destroyed room. Still holds up the floor above. Rebuilding here costs half.',
  },
};

/** Build palette order. */
export const PALETTE: RoomId[] = ['mine', 'refinery', 'quarters', 'wall', 'barracks', 'infirmary', 'gunNest', 'workshop', 'hangar', 'flak', 'lab', 'cannon'];
/** Rooms offered only in Expedition (the Skirmish AI has no answer to turrets yet). */
export const EXPEDITION_ONLY: RoomId[] = ['gunNest', 'flak', 'cannon'];

export const TOWER = {
  cols: 6,
  floors: 8,
  /** Default Core column for a tower whose front is on the right (the Core sits at the back of floor 0). */
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
  /** Building on rubble costs this fraction of the room's price. */
  rubbleRebuild: 0.5,
};


/** Total output multiplier for a merged group of n rooms (index = n). */
export const MERGE_MULT = [0, 1, 2.2, 3.6];
export const MAX_MERGE = 3;

// ---- Units & lane ---------------------------------------------------------------

export type UnitDef = {
  id: UnitId;
  name: string;
  cost: Cost;
  supply: number;
  /** Seconds to train. */
  trainTime: number;
  hp: number;
  /** Lane cells per second. */
  speed: number;
  air: boolean;
  attack: {
    damage: number;
    /** Seconds between shots. */
    cooldown: number;
    /** Lane cells. */
    range: number;
    hitsGround: boolean;
    hitsAir: boolean;
    /** Ground units only: reaches rooms on every floor, not just the bottom two. */
    siege?: boolean;
    /** Damage multiplier against rooms (default 1). */
    vsRooms?: number;
  };
  /** Tech: your team must own a built room of each of these to train this unit. */
  requires?: RoomId[];
  color: string;
  blurb: string;
};

export const UNITS: Record<UnitId, UnitDef> = {
  trooper: {
    id: 'trooper',
    name: 'Trooper',
    cost: { minerals: 50, gas: 0 },
    supply: 1,
    trainTime: 6,
    hp: 45,
    speed: 1.0,
    air: false,
    attack: { damage: 6, cooldown: 0.6, range: 2, hitsGround: true, hitsAir: true },
    color: '#9fd3ff',
    blurb: 'Cheap all-rounder. Shoots ground and air.',
  },
  scout: {
    id: 'scout',
    name: 'Scout',
    cost: { minerals: 40, gas: 0 },
    supply: 1,
    trainTime: 4,
    hp: 35,
    speed: 2.2,
    air: false,
    attack: { damage: 3, cooldown: 0.8, range: 1.5, hitsGround: true, hitsAir: false },
    color: '#b8f2c9',
    blurb: 'Fast and frail. Send it out to lift the fog; it loses most fights.',
  },
  bruiser: {
    id: 'bruiser',
    name: 'Bruiser',
    cost: { minerals: 100, gas: 25 },
    supply: 2,
    trainTime: 9,
    hp: 120,
    speed: 0.8,
    air: false,
    attack: { damage: 20, cooldown: 1.5, range: 0.6, hitsGround: true, hitsAir: false },
    color: '#ffb36b',
    blurb: 'Armored brawler. Ground only: flyers pass right over it.',
  },
  marksman: {
    id: 'marksman',
    name: 'Marksman',
    cost: { minerals: 75, gas: 40 },
    supply: 1,
    trainTime: 9,
    hp: 40,
    speed: 0.9,
    air: false,
    attack: { damage: 22, cooldown: 1.6, range: 4, hitsGround: true, hitsAir: true },
    requires: ['lab'],
    color: '#f2e394',
    blurb: 'Long range, hits ground and air, dies fast up close. Needs a Lab.',
  },
  walker: {
    id: 'walker',
    name: 'Walker',
    cost: { minerals: 150, gas: 100 },
    supply: 3,
    trainTime: 16,
    hp: 180,
    speed: 0.5,
    air: false,
    attack: { damage: 40, cooldown: 3, range: 4, hitsGround: true, hitsAir: false, siege: true, vsRooms: 2 },
    requires: ['workshop'],
    color: '#e07a5f',
    blurb: 'Slow tower breaker: outranges Gun Nests, double damage to rooms on any floor. Needs a Workshop.',
  },
  flyer: {
    id: 'flyer',
    name: 'Flyer',
    cost: { minerals: 125, gas: 75 },
    supply: 2,
    trainTime: 10,
    hp: 90,
    speed: 1.4,
    air: true,
    attack: { damage: 12, cooldown: 1.0, range: 1.5, hitsGround: true, hitsAir: false },
    color: '#d6b8ff',
    blurb: 'Air-to-ground. Hits rooms on any floor; only anti-air can touch it.',
  },
  interceptor: {
    id: 'interceptor',
    name: 'Interceptor',
    cost: { minerals: 100, gas: 75 },
    supply: 2,
    trainTime: 10,
    hp: 80,
    speed: 1.6,
    air: true,
    attack: { damage: 10, cooldown: 0.5, range: 2.5, hitsGround: false, hitsAir: true },
    requires: ['lab'],
    color: '#8fe3e8',
    blurb: 'Air superiority: shoots only other air units. Needs a Lab.',
  },
};

export const LANE = {
  /** Cells between the two towers' lane faces. */
  length: 16,
  /** Ground units can hit rooms on floors [0, groundReach). Air units reach every floor. */
  groundReach: 2,
  /** Units count as touching when this close (cells), on top of attack range. */
  contact: 0.25,
};

/** Overtime breaks stalemates: from `start` seconds on, both Cores burn. Whoever hurt the other more outlasts them. */
export const OVERTIME = {
  start: 300,
  /** Core hp lost per second. */
  burn: 10,
};

// ---- Expedition map (docs/expedition.md) ------------------------------------------

export const MAP = {
  /** Cells per sector. Sector s spans [s*sector - sector/2, s*sector + sector/2). */
  sector: 14,
  /** Sectors run from -radius to +radius; the home tower is centred in sector 0. */
  radius: 5,
  /** Sectors within this distance start with their terrain explored (their sites are still found on entry). */
  startExplored: 1,
};

export type SiteKind = 'home' | 'empty' | 'cache' | 'ruin' | 'camp' | 'stronghold' | 'trader';

export const SITES = {
  /** Weighted table for non-home sectors, before the guaranteed sites are placed. */
  weights: { empty: 3, cache: 3, ruin: 1, camp: 3 } as Record<'empty' | 'cache' | 'ruin' | 'camp', number>,
  /** Distance range (inclusive) for the one Stronghold and the one Trader. */
  stronghold: [3, 5] as [number, number],
  trader: [2, 4] as [number, number],
  /** At least one Cache within this distance; no Camp within this distance; at most this many Camps per side. */
  cacheWithin: 2,
  noCampWithin: 1,
  maxCampsPerSide: 2,
  /** Cache loot: minerals in [min, max], with a gasChance of [gasMin, gasMax] gas, +perSector for each sector beyond 1. */
  cacheLoot: { min: 150, max: 300, gasChance: 0.3, gasMin: 50, gasMax: 100, perSector: 0.25 },
};

// ---- Raids (docs/expedition.md) -----------------------------------------------------

/** Raid squad size multiplier by difficulty level. */
export const RAID_SCALE = { relaxed: 0.7, steady: 1, sharp: 1.3 };

export const RAIDS = {
  /** Seconds until the first raid launches. */
  first: 150,
  /** Seconds of warning before a raid launches. */
  warn: 12,
  /** Minerals for destroying a Camp, and seconds added to raid intervals on that side per destroyed Camp. */
  campLoot: 200,
  campDelay: 15,
  /**
   * By game time (seconds): seconds between raids, and squad size. `bruiser`: chance of one extra Bruiser.
   * `mixed`: each unit is drawn from `mix`. `growth`: extra units per raid launched in this phase.
   */
  phases: [
    { from: 0, interval: [75, 90], size: [3, 5], bruiser: 0, mixed: false, growth: 0 },
    { from: 300, interval: [65, 80], size: [8, 10], bruiser: 0.3, mixed: false, growth: 0 },
    { from: 480, interval: [60, 75], size: [12, 15], bruiser: 0, mixed: true, growth: 0 },
    { from: 720, interval: [55, 70], size: [16, 16], bruiser: 0, mixed: true, growth: 1 },
  ] as { from: number; interval: [number, number]; size: [number, number]; bruiser: number; mixed: boolean; growth: number }[],
  mix: { trooper: 0.6, bruiser: 0.25, flyer: 0.15 },
  /** No Flyers before this time; they fly at this height. */
  flyersFrom: 540,
  flyerAlt: 4.5,
  /** Raiders spawn this far apart (cells), so a squad arrives as a group. */
  spacing: 0.5,
};

/** A raider camp, columns left to right, bottom floor first. Its Core is 2 wide. */
export const CAMP_LAYOUT: (RoomId | null)[][] = [
  [null, 'wall', 'campCore', null, 'wall', null],
  [null, null, 'quarters', 'quarters', null, null],
];

/** The Trader (Expedition): met when a player unit comes within `reach` cells of its centre. */
export const TRADE = {
  reach: 4,
  gift: { minerals: 150, gas: 50 } as Cost,
  /** Sell `mineralsIn` minerals for `gasOut` gas, or `gasIn` gas for `mineralsOut` minerals, times the current rate. */
  mineralsIn: 100,
  gasOut: 40,
  gasIn: 50,
  mineralsOut: 80,
  /** The rate is redrawn in [1 - swing, 1 + swing] every `every` seconds. */
  swing: 0.2,
  every: 60,
};

/** The trading post, columns left to right, bottom floor first. */
export const TRADER_LAYOUT: (RoomId | null)[][] = [
  [null, 'refinery', 'market', null, 'mine', null],
  [null, null, 'quarters', 'quarters', null, null],
];
