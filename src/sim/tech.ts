/**
 * The tech tree: a room or unit may list `requires` (room ids). It is unlocked while its team owns a built room of
 * each kind, in any of its own towers (site towers such as camps and the trading post do not count).
 */
import { PALETTE, ROOMS, UNITS, type RoomId, type UnitId } from './defs.ts';
import type { Team } from './types.ts';
import type { World } from './world.ts';

export function hasRoom(w: World, team: Team, def: RoomId): boolean {
  if (w.options.freeTech) return true;
  return w.towers.some((t) => t.team === team && t.kind !== 'camp' && t.kind !== 'trader' && t.rooms.some((r) => r.def === def && r.built));
}

/** The first required room the team lacks, or null when everything is unlocked. */
export function missingTech(w: World, team: Team, requires: readonly RoomId[] | undefined): RoomId | null {
  for (const id of requires ?? []) if (!hasRoom(w, team, id)) return id;
  return null;
}

export const roomLocked = (w: World, team: Team, room: RoomId): RoomId | null => missingTech(w, team, ROOMS[room].requires);
export const unitLocked = (w: World, team: Team, unit: UnitId): RoomId | null => missingTech(w, team, UNITS[unit].requires);

/** Tree depth of a room: 1 for rooms with no requirement (the Core is 0), else one more than its deepest requirement. */
export function techTier(room: RoomId): number {
  const req = ROOMS[room].requires;
  if (room === 'core') return 0;
  return req?.length ? 1 + Math.max(...req.map(techTier)) : 1;
}

/** The buildable rooms grouped by tier (index = tier; tier 0 is the Core), in palette order. */
export function techTiers(): RoomId[][] {
  const tiers: RoomId[][] = [['core']];
  for (const id of PALETTE) (tiers[techTier(id)] ??= []).push(id);
  return tiers;
}
