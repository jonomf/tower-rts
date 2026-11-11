/**
 * Runs an AiScript for one team. It lives outside the World and only acts through world.issue(),
 * so its commands land in the command log and a match replays without any AI attached.
 */
import { ROOMS, TOWER, type RoomId } from '../sim/defs.ts';
import { Rng } from '../sim/rng.ts';
import { buildCost, canAfford, placementError, roomAt, supplyMax } from '../sim/tower.ts';
import type { Team, Tower } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import type { AiLevel, AiScript, BuildAction, Cond, Where } from './types.ts';

/** Ticks between decisions (0.5 s). */
const THINK = 10;
/** Chance to dither on a decision; gives matches variety and breaks mirror symmetry. */
const HESITATE = 0.25;
/** Ticks between taps on its producers, by level (relaxed never taps). */
const TAP_EVERY: Record<AiLevel, number> = { relaxed: 0, steady: 1800, sharp: 60 };

type Cell = { col: number; floor: number };

export function pickCell(t: Tower, def: RoomId, where: Where): Cell | null {
  const valid: Cell[] = [];
  for (let floor = 0; floor < TOWER.floors; floor++)
    for (let col = 0; col < TOWER.cols; col++) if (!placementError(t, def, col, floor)) valid.push({ col, floor });
  if (!valid.length) return null;
  const by = (f: (c: Cell) => number) => valid.reduce((a, b) => (f(b) < f(a) ? b : a));
  switch (where) {
    case 'front':
      return by((c) => -c.col * 100 + c.floor);
    case 'up':
      return by((c) => -c.floor * 100 + c.col);
    case 'merge': {
      const near = valid.filter((c) => [c.col - 1, c.col + 1].some((n) => roomAt(t, n, c.floor)?.def === def));
      if (near.length) return near.reduce((a, b) => (b.floor * 100 + b.col < a.floor * 100 + a.col ? b : a));
      return by((c) => c.floor * 100 + c.col);
    }
    case 'back':
      return by((c) => c.floor * 100 + c.col);
  }
}

export class AiController {
  readonly team: Team;
  readonly script: AiScript;
  readonly level: AiLevel;
  private readonly rng: Rng;
  private step = 0;
  private saving = false;
  /** Tick at which the current `{ train: seconds }` step ends (-1 = not started). */
  private trainUntil = -1;
  /** What this AI built where ("col,floor"), for unit picks and rebuilding. */
  private readonly built = new Map<string, BuildAction>();

  constructor(team: Team, script: AiScript, level: AiLevel, seed: number) {
    this.team = team;
    this.script = script;
    this.level = level;
    this.rng = new Rng(seed * 7919 + team + 1);
  }

  /** Call once before every world.step(). */
  update(w: World): void {
    if (w.winner !== null || w.tick % THINK !== 0) return;
    const t = w.towers[this.team];
    const tapEvery = TAP_EVERY[this.level];
    if (tapEvery > 0 && w.tick > 0 && w.tick % tapEvery === 0) {
      for (const r of [...t.rooms]) if (r.buffer >= 1) w.issue({ type: 'collect', team: this.team, col: r.col, floor: r.floor });
    }
    if (this.rng.next() >= HESITATE) this.decide(w, t);
    this.reconcileTrainers(w, t);
  }

  private decide(w: World, t: Tower): void {
    this.saving = false;
    // 1. The build order. Stop training to save for the next step.
    while (this.step < this.script.order.length) {
      const a = this.script.order[this.step];
      if (!('build' in a)) {
        if (this.trainUntil < 0) this.trainUntil = w.tick + a.train * 20;
        if (w.tick < this.trainUntil) return;
        this.trainUntil = -1;
        this.step++;
        continue;
      }
      const cell = pickCell(t, a.build, a.at);
      if (!cell) {
        this.step++;
        continue;
      }
      if (canAfford(t.bank, buildCost(t, a.build, cell.col, cell.floor))) {
        this.build(w, a, cell);
        this.step++;
      } else this.saving = this.script.saves !== false;
      return;
    }
    // 2. Rebuild what was destroyed.
    if (this.script.rebuild) {
      for (const [key, a] of this.built) {
        const [col, floor] = key.split(',').map(Number);
        if (roomAt(t, col, floor)?.def !== 'rubble') continue;
        if (!canAfford(t.bank, buildCost(t, a.build, col, floor))) continue;
        this.build(w, a, { col, floor });
        return;
      }
    }
    // 3. Standing rules.
    for (const rule of this.script.rules) {
      if (!this.holds(w, t, rule.when)) continue;
      const cell = pickCell(t, rule.do.build, rule.do.at);
      if (!cell || !canAfford(t.bank, buildCost(t, rule.do.build, cell.col, cell.floor))) continue;
      this.build(w, rule.do, cell);
      return;
    }
  }

  private holds(w: World, t: Tower, c: Cond): boolean {
    if ('supplyCapped' in c)
      return w.supplyUsed(this.team) + 2 > supplyMax(t) && !t.rooms.some((r) => r.def === 'quarters' && !r.built);
    return t.bank.minerals > c.bankOver;
  }

  private build(w: World, a: BuildAction, cell: Cell): void {
    const res = w.issue({ type: 'build', team: this.team, room: a.build, col: cell.col, floor: cell.floor });
    if (res.ok) this.built.set(`${cell.col},${cell.floor}`, a);
  }

  /** Production rooms train their scripted unit, or nothing while saving (a unit in progress is finished first). */
  private reconcileTrainers(w: World, t: Tower): void {
    for (const r of t.rooms) {
      const trains = ROOMS[r.def].trains;
      if (!trains) continue;
      const want = this.saving ? null : (this.built.get(`${r.col},${r.floor}`)?.train ?? trains[0]);
      if (r.train === want) continue;
      if (want === null && r.job) continue;
      w.issue({ type: 'setTrain', team: this.team, col: r.col, floor: r.floor, unit: want });
    }
  }
}

/** One sim tick with AIs attached. */
export function stepWithAi(w: World, ais: readonly AiController[]): void {
  for (const ai of ais) ai.update(w);
  w.step();
}
