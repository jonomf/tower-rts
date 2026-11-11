/**
 * Units: march down the lane, stop to fight what they can hit, and chew into the enemy tower face.
 * The lane is 1-D (x in cells). Team 0 marches toward +x, team 1 toward -x.
 */
import { LANE, ROOMS, TOWER, UNITS } from '../defs.ts';
import { roomAt, roomById } from '../tower.ts';
import type { Room, Team, Tower, Unit } from '../types.ts';
import type { World } from '../world.ts';

export const dirOf = (team: Team): 1 | -1 => (team === 0 ? 1 : -1);
/** Lane x of a team's own lane face. */
export const faceX = (team: Team): number => (team === 0 ? 0 : LANE.length);

export function canHit(attacker: Unit, target: Unit): boolean {
  const a = UNITS[attacker.def].attack;
  return UNITS[target.def].air ? a.hitsAir : a.hitsGround;
}

/**
 * The room an attacker hits: the frontmost (lane-side) column first, then the lowest floor,
 * among the floors it can reach. Rubble is never a target. The Core is hit last on its floors by construction.
 */
export function frontRoom(t: Tower, reachesAllFloors: boolean): Room | undefined {
  const floors = reachesAllFloors ? TOWER.floors : LANE.groundReach;
  for (let c = TOWER.cols - 1; c >= 0; c--) {
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
      if (v.team === u.team || v.hp <= 0 || !canHit(u, v)) continue;
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

    // 2. At the enemy tower face: hit its frontmost reachable room.
    const enemy: Team = u.team === 0 ? 1 : 0;
    const enemyTower = w.towers[enemy];
    const distFace = Math.abs(faceX(enemy) - u.px);
    if (enemyTower && distFace <= reach && d.attack.hitsGround) {
      const room = frontRoom(enemyTower, d.air);
      if (room) {
        u.target = { kind: 'room', team: enemy, id: room.id };
        if (u.cooldown <= 0) {
          u.cooldown = d.attack.cooldown;
          w.effects.push({
            kind: 'shot',
            tick: w.tick,
            team: u.team,
            fx: u.x,
            falt: u.alt,
            tx: faceX(enemy),
            talt: room.floor + 0.5,
            room: { team: enemy, col: room.col, floor: room.floor, w: room.w },
          });
          w.damageRoom(enemy, room, d.attack.damage);
        }
        continue;
      }
    }

    // 3. March on. Never past the enemy face.
    u.target = null;
    const dir = dirOf(u.team);
    const stop = faceX(enemy) - dir * d.attack.range;
    u.x += dir * d.speed * dt;
    if ((dir > 0 && u.x > stop) || (dir < 0 && u.x < stop)) u.x = stop;
  }

  for (const [target, damage] of hits) target.hp -= damage;
  // Remove the dead.
  for (const u of w.units) if (u.hp <= 0) w.effects.push({ kind: 'died', tick: w.tick, x: u.x, alt: u.alt, team: u.team });
  w.units = w.units.filter((u) => u.hp > 0);
}

/** Room a unit is currently hitting, if any (for rendering). */
export function targetRoom(w: World, u: Unit): Room | undefined {
  if (u.target?.kind !== 'room') return undefined;
  const t = w.towers[u.target.team];
  return t ? roomById(t, u.target.id) : undefined;
}

export const isProduction = (r: Room): boolean => !!ROOMS[r.def].trains;
