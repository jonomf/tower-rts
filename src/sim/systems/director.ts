/**
 * The raid director (Expedition): on a seeded schedule it warns, then launches a squad of raiders from the nearest
 * living Camp on that side, or from the map edge. Squads grow with game time (RAIDS in defs.ts).
 */
import { RAIDS, TOWER, UNITS, type UnitId } from '../defs.ts';
import { mapSpan } from '../map.ts';
import { faceOf } from '../tower.ts';
import type { Director, Tower } from '../types.ts';
import { TICK_RATE, type World } from '../world.ts';

const between = (w: World, [lo, hi]: [number, number]): number => lo + w.rng.int(hi - lo + 1);

/** Living camps on a side, nearest home first. */
export function campsOn(w: World, side: -1 | 1): Tower[] {
  return w.towers
    .filter((t) => t.kind === 'camp' && Math.sign(t.x + TOWER.cols / 2) === side)
    .sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
}

/** Random side; a side with a living Camp is twice as likely; never three raids running from one side. */
function pickSide(w: World, d: Pick<Director, 'recent'>): -1 | 1 {
  if (d.recent.length >= 2 && d.recent[0] === d.recent[1]) return d.recent[0] === 1 ? -1 : 1;
  const left = campsOn(w, -1).length ? 2 : 1;
  const right = campsOn(w, 1).length ? 2 : 1;
  return w.rng.next() * (left + right) < left ? -1 : 1;
}

export function phaseAt(seconds: number): (typeof RAIDS.phases)[number] {
  let p = RAIDS.phases[0];
  for (const q of RAIDS.phases) if (seconds >= q.from) p = q;
  return p;
}

export function createDirector(w: World): Director {
  const d: Director = {
    nextAt: RAIDS.first * TICK_RATE,
    side: 1,
    warned: false,
    recent: [],
    raids: 0,
    repelled: 0,
    live: [],
    late: 0,
    campsDown: { left: 0, right: 0 },
  };
  d.side = pickSide(w, d);
  return d;
}

/** What a raid launched at `seconds` is made of. */
function squad(w: World, d: Director, seconds: number): UnitId[] {
  const p = phaseAt(seconds);
  const n = Math.max(1, Math.round(between(w, p.size) * w.options.raidScale)) + p.growth * d.late;
  const units: UnitId[] = [];
  for (let i = 0; i < n; i++) {
    let def: UnitId = 'trooper';
    if (p.mixed) {
      const r = w.rng.next();
      def = r < RAIDS.mix.trooper ? 'trooper' : r < RAIDS.mix.trooper + RAIDS.mix.bruiser ? 'bruiser' : 'flyer';
      if (def === 'flyer' && seconds < RAIDS.flyersFrom) def = 'trooper';
    }
    units.push(def);
  }
  if (p.bruiser > 0 && w.rng.next() < p.bruiser) units.push('bruiser');
  return units;
}

function launch(w: World, d: Director): void {
  const side = d.side;
  const dir = side === -1 ? 1 : -1; // toward home
  const camp = campsOn(w, side)[0];
  const span = mapSpan(w.map!);
  const from = camp ? faceOf(camp, side === -1 ? 'right' : 'left') : side === -1 ? span.x0 : span.x1;
  const units = squad(w, d, w.seconds);
  const pace = Math.min(...units.map((u) => UNITS[u].speed));
  const id = ++d.raids;
  units.forEach((def, i) => w.spawnRaider(def, from - dir * i * RAIDS.spacing, dir, id, pace));
  d.live.push(id);
  if (phaseAt(w.seconds).growth > 0) d.late++;
  w.effects.push({ kind: 'raid', tick: w.tick, side, size: units.length });

  // Schedule the next one.
  d.recent = [side, ...d.recent].slice(0, 2);
  d.side = pickSide(w, d);
  const delay = between(w, phaseAt(w.seconds).interval) + RAIDS.campDelay * d.campsDown[d.side === -1 ? 'left' : 'right'];
  d.nextAt = w.tick + delay * TICK_RATE;
  d.warned = false;
}

export function directorSystem(w: World): void {
  const d = w.director;
  if (!d || !w.map || w.winner !== null) return;
  if (!d.warned && w.tick >= d.nextAt - RAIDS.warn * TICK_RATE) {
    d.warned = true;
    w.effects.push({ kind: 'warning', tick: w.tick, side: d.side, seconds: Math.round((d.nextAt - w.tick) / TICK_RATE) });
  }
  if (w.tick >= d.nextAt) launch(w, d);
  // Once a second: a raid with no units left has been repelled.
  if (d.live.length && w.tick % TICK_RATE === 0) {
    const alive = new Set(w.units.map((u) => u.raid));
    const dead = d.live.filter((id) => !alive.has(id));
    if (dead.length) {
      d.live = d.live.filter((id) => alive.has(id));
      d.repelled += dead.length;
      w.effects.push({ kind: 'repelled', tick: w.tick, count: d.repelled });
    }
  }
}
