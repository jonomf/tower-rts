/**
 * Units: march along the world axis, stop to fight what they can hit, and chew into hostile tower faces.
 * The world is 1-D (x in cells). A unit walks in its own direction; team 0 starts toward +x in Skirmish.
 */
import { LANE, TOWER, UNITS } from '../defs.ts';
import { faceOf, roomAt } from '../tower.ts';
import { hostile, type Room, type Side, type Team, type Tower, type Unit } from '../types.ts';
import type { World } from '../world.ts';

/**
 * The nearest hostile tower ahead of a unit walking in `dir` from `x`, and the face it would reach.
 * A tower counts as ahead while its near face is at or beyond `x` (minus the unit's reach, so a unit already
 * standing at a face keeps it as its target).
 */
export function towerAhead(w: World, team: Team, x: number, dir: 1 | -1, reach: number): { tower: Tower; side: Side; face: number } | undefined {
  let best: { tower: Tower; side: Side; face: number } | undefined;
  for (const t of w.towers) {
    if (!hostile(team, t.team)) continue;
    const side: Side = dir > 0 ? 'left' : 'right';
    const face = faceOf(t, side);
    if ((face - x) * dir < -reach) continue;
    if (!best || (face - best.face) * dir < 0) best = { tower: t, side, face };
  }
  return best;
}
export function canHit(attacker: Unit, target: Unit): boolean {
  const a = UNITS[attacker.def].attack;
  return UNITS[target.def].air ? a.hitsAir : a.hitsGround;
}

/**
 * The room an attacker standing on `fromSide` hits: the column nearest that face first, then the lowest floor,
 * among the floors it can reach. Rubble is never a target.
 */
export function frontRoom(t: Tower, fromSide: Side, reachesAllFloors: boolean): Room | undefined {
  const floors = reachesAllFloors ? TOWER.floors : LANE.groundReach;
  for (let i = 0; i < TOWER.cols; i++) {
    const c = fromSide === 'left' ? i : TOWER.cols - 1 - i;
    for (let f = 0; f < floors; f++) {
      const r = roomAt(t, c, f);
      if (r && r.def !== 'rubble' && r.hp > 0) return r;
    }
  }
  return undefined;
}

export function unitSystem(w: World, dt: number): void {
  // Everyone decides from the same snapshot (start-of-tick positions), and unit damage lands after
  // all have acted, so neither side gets the first shot from update order.
  for (const u of w.units) u.px = u.x;
  const hits: [Unit, number][] = [];
  for (const u of w.units) {
    if (u.hp <= 0) continue;
    const d = UNITS[u.def];
    u.cooldown = Math.max(0, u.cooldown - dt);
    const reach = d.attack.range + LANE.contact;

    // 1. Nearest enemy unit in range that we can hit.
    let best: Unit | undefined;
    let bestDist = Infinity;
    for (const v of w.units) {
      if (!hostile(u.team, v.team) || v.hp <= 0 || !canHit(u, v)) continue;
      const dist = Math.abs(v.px - u.px);
      if (dist <= reach && dist < bestDist) {
        best = v;
        bestDist = dist;
      }
    }
    if (best) {
      u.target = { kind: 'unit', id: best.id };
      if (u.cooldown <= 0) {
        hits.push([best, d.attack.damage]);
        u.cooldown = d.attack.cooldown;
        w.effects.push({ kind: 'shot', tick: w.tick, team: u.team, fx: u.x, falt: u.alt, tx: best.x, talt: best.alt, room: null });
      }
      continue;
    }

    // 2. At a hostile tower's face: hit the room nearest that face.
    const dir = u.dir;
    const ahead = towerAhead(w, u.team, u.px, dir, reach);
    if (ahead && Math.abs(ahead.face - u.px) <= reach && d.attack.hitsGround) {
      const room = frontRoom(ahead.tower, ahead.side, d.air);
      if (room) {
        u.target = { kind: 'room', tower: ahead.tower.id, id: room.id };
        if (u.cooldown <= 0) {
          u.cooldown = d.attack.cooldown;
          w.effects.push({
            kind: 'shot',
            tick: w.tick,
            team: u.team,
            fx: u.x,
            falt: u.alt,
            tx: ahead.face,
            talt: room.floor + 0.5,
            room: { x: ahead.tower.x, side: ahead.side, col: room.col, floor: room.floor, w: room.w },
          });
          w.damageRoom(ahead.tower, room, d.attack.damage);
        }
        continue;
      }
    }

    // 3. March on. Never past the face of the hostile tower ahead.
    u.target = null;
    u.x += dir * d.speed * dt;
    if (ahead) {
      const stop = ahead.face - dir * d.attack.range;
      if ((u.x - stop) * dir > 0) u.x = stop;
    }
  }

  for (const [target, damage] of hits) target.hp -= damage;
  // Remove the dead.
  for (const u of w.units) if (u.hp <= 0) w.effects.push({ kind: 'died', tick: w.tick, x: u.x, alt: u.alt, team: u.team });
  w.units = w.units.filter((u) => u.hp > 0);
}
