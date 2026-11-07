/**
 * Tower grid rules: placement, support, merge groups, supply.
 * Coordinates are tower-local: floor 0 is ground level, column TOWER.cols-1 faces the lane.
 * (The enemy tower is mirrored only when drawn.)
 */
import { ECON, MAX_MERGE, MERGE_MULT, ROOMS, TOWER, type Cost, type RoomId } from './defs.ts';
import type { Room, RoomInstId, Team, Tower } from './types.ts';

export function createTower(team: Team): Tower {
  const grid: (RoomInstId | null)[][] = [];
  for (let f = 0; f < TOWER.floors; f++) grid.push(new Array<RoomInstId | null>(TOWER.cols).fill(null));
  return { team, bank: { ...ECON.startBank }, rooms: [], grid, income: { minerals: 0, gas: 0 } };
}

export function inBounds(col: number, floor: number): boolean {
  return Number.isInteger(col) && Number.isInteger(floor) && col >= 0 && col < TOWER.cols && floor >= 0 && floor < TOWER.floors;
}

export function roomById(t: Tower, id: RoomInstId | null | undefined): Room | undefined {
  if (id == null) return undefined;
  return t.rooms.find((r) => r.id === id);
}

export function roomAt(t: Tower, col: number, floor: number): Room | undefined {
  if (!inBounds(col, floor)) return undefined;
  return roomById(t, t.grid[floor][col]);
}

export function canAfford(bank: Cost, cost: Cost): boolean {
  return bank.minerals >= cost.minerals && bank.gas >= cost.gas;
}

/** Why a room can't go here, or null if it can. Checks everything except cost. */
export function placementError(t: Tower, def: RoomId, col: number, floor: number): string | null {
  const d = ROOMS[def];
  for (let c = col; c < col + d.width; c++) {
    if (!inBounds(c, floor)) return 'Outside the tower';
    const here = roomAt(t, c, floor);
    if (here && here.def !== 'rubble') return 'That cell is taken';
    if (floor > 0 && t.grid[floor - 1][c] == null) return 'Needs a room below it';
  }
  if (d.minFloor && floor < d.minFloor) return `${d.name} must be on floor ${d.minFloor + 1} or higher`;
  return null;
}

/** What building `def` here costs: full price, or the rubble discount when rebuilding a destroyed cell. */
export function buildCost(t: Tower, def: RoomId, col: number, floor: number): Cost {
  const c = ROOMS[def].cost;
  if (roomAt(t, col, floor)?.def !== 'rubble') return { ...c };
  return { minerals: Math.floor(c.minerals * ECON.rubbleRebuild), gas: Math.floor(c.gas * ECON.rubbleRebuild) };
}

/** Why this room can't be removed, or null. Rooms can't leave anything above them floating. */
export function removalError(t: Tower, r: Room): string | null {
  if (r.def === 'core') return 'The Core can’t be removed';
  if (r.def === 'rubble') return 'Build over rubble to replace it';
  if (r.floor + 1 < TOWER.floors) {
    for (let c = r.col; c < r.col + r.w; c++) if (t.grid[r.floor + 1][c] != null) return 'A room above depends on it';
  }
  return null;
}

export function placeRoom(t: Tower, id: RoomInstId, def: RoomId, col: number, floor: number, built: boolean): Room {
  const d = ROOMS[def];
  const r: Room = {
    id,
    def,
    col,
    floor,
    w: d.width,
    hp: d.hp,
    built,
    progress: built ? d.buildTime : 0,
    buffer: 0,
    paid: { ...d.cost },
    train: d.trains?.[0] ?? null,
    job: null,
  };
  t.rooms.push(r);
  for (let c = col; c < col + d.width; c++) t.grid[floor][c] = id;
  return r;
}

export function removeRoom(t: Tower, r: Room): void {
  t.rooms = t.rooms.filter((x) => x.id !== r.id);
  for (let c = r.col; c < r.col + r.w; c++) t.grid[r.floor][c] = null;
}

/**
 * Merge groups: runs of adjacent, built, same-type mergeable rooms on one floor,
 * split left to right into groups of at most MAX_MERGE. Every room is in exactly one group.
 */
export function mergeGroups(t: Tower): Room[][] {
  const groups: Room[][] = [];
  const seen = new Set<RoomInstId>();
  for (let f = 0; f < TOWER.floors; f++) {
    let run: Room[] = [];
    const flush = () => {
      for (let i = 0; i < run.length; i += MAX_MERGE) groups.push(run.slice(i, i + MAX_MERGE));
      run = [];
    };
    for (let c = 0; c < TOWER.cols; c++) {
      const r = roomAt(t, c, f);
      if (!r || seen.has(r.id)) {
        if (!r) flush();
        continue;
      }
      seen.add(r.id);
      const prev = run[run.length - 1];
      const joins = prev && r.built && prev.built && ROOMS[r.def].mergeable && prev.def === r.def && prev.col + prev.w === r.col;
      if (!joins) flush();
      run.push(r);
    }
    flush();
  }
  return groups;
}

/** The merge group containing this room. */
export function groupOf(t: Tower, r: Room): Room[] {
  return mergeGroups(t).find((g) => g.includes(r)) ?? [r];
}

/** Per-room share of a group's output multiplier (1 unmerged, 1.1 in a pair, 1.2 in a trio). */
export function mergeShare(n: number): number {
  return MERGE_MULT[n] / n;
}

/** A built producer's output per second, merge bonus included. */
export function roomRate(t: Tower, r: Room): number {
  const p = ROOMS[r.def].produces;
  if (!p || !r.built) return 0;
  return p.rate * mergeShare(groupOf(t, r).length);
}

export function bufferCap(rate: number): number {
  return rate * ECON.bufferSeconds;
}

export function supplyMax(t: Tower): number {
  let s = ECON.baseSupply;
  for (const g of mergeGroups(t)) {
    const per = ROOMS[g[0].def].supply;
    if (per && g[0].built) s += Math.floor(per * MERGE_MULT[g.length]);
  }
  return s;
}

export function coreOf(t: Tower): Room | undefined {
  return t.rooms.find((r) => r.def === 'core');
}
