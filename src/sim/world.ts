import { ECON, OVERTIME, TOWER, UNITS, type UnitId } from './defs.ts';
import { applyCommand } from './commands.ts';
import { Rng, fnv1a } from './rng.ts';
import { constructionSystem, economySystem } from './systems/economy.ts';
import { productionSystem } from './systems/production.ts';
import { faceX, unitSystem } from './systems/units.ts';
import { buildScenario, type ScenarioId } from './scenario.ts';
import { coreOf, createTower, placeRoom, removeRoom } from './tower.ts';
import type { Command, CommandResult, Effect, Room, Team, Tower, Unit } from './types.ts';

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

export type WorldOptions = {
  seed: number;
  /** Which towers exist. M1 is single-tower; the enemy arrives in M2/M3. */
  teams: Team[];
  /** The micro dial: 0 = tap or nothing, 1 = tapping is pointless. */
  autoCollectRate: number;
  /** Extra setup after the empty towers exist (e.g. the M2 dummy enemy). */
  scenario: ScenarioId;
};

/** Render-only effects are kept this many ticks. */
const EFFECT_TTL = 12;

export type LoggedCommand = { tick: number; cmd: Command };

/**
 * The whole simulation: plain data + fixed-tick systems. No DOM, no wall clock, no Math.random.
 * Deterministic: the same options plus the same commands on the same ticks give the same hash().
 */
export class World {
  tick = 0;
  readonly options: WorldOptions;
  readonly rng: Rng;
  readonly towers: Tower[] = [];
  units: Unit[] = [];
  /** Render-only events (shots, deaths, destroyed rooms). Not part of the hash. */
  effects: Effect[] = [];
  /** Set when a Core falls; the sim freezes. */
  winner: Team | null = null;
  /** Every accepted command and the tick it was applied on (replays, lockstep later). */
  readonly commandLog: LoggedCommand[] = [];
  private nextId = 1;

  constructor(options: Partial<WorldOptions> = {}) {
    this.options = { seed: 1, teams: [0], autoCollectRate: ECON.autoCollectRate, scenario: 'none', ...options };
    this.rng = new Rng(this.options.seed);
    for (const team of this.options.teams) {
      const t = createTower(team);
      placeRoom(t, this.newId(), 'core', TOWER.coreCol, 0, true);
      this.towers[team] = t;
    }
    buildScenario(this, this.options.scenario);
  }

  get seconds(): number {
    return this.tick / TICK_RATE;
  }

  newId(): number {
    return this.nextId++;
  }

  tower(team: Team): Tower {
    return this.towers[team];
  }

  /** Apply a command now (before the next step). Accepted commands are logged. */
  issue(cmd: Command): CommandResult {
    const res = applyCommand(this, cmd);
    if (res.ok) this.commandLog.push({ tick: this.tick, cmd: structuredClone(cmd) });
    return res;
  }

  step(): void {
    if (this.winner !== null) return;
    for (const t of this.towers) {
      if (!t) continue;
      constructionSystem(t, DT);
      economySystem(t, DT, this.options.autoCollectRate);
    }
    // Units act before production, so a unit never moves on the tick it is born.
    unitSystem(this, DT);
    productionSystem(this, DT);
    this.overtime();
    this.tick++;
    if (this.effects.length) this.effects = this.effects.filter((e) => this.tick - e.tick <= EFFECT_TTL);
  }

  get inOvertime(): boolean {
    return this.options.teams.length === 2 && this.seconds >= OVERTIME.start;
  }

  /** Both Cores burn in overtime. If both fall on the same tick, the tower in better shape wins. */
  private overtime(): void {
    if (!this.inOvertime || this.winner !== null) return;
    const fallen: Team[] = [];
    for (const t of this.towers) {
      const core = coreOf(t);
      if (!core) continue;
      core.hp -= OVERTIME.burn * DT;
      if (core.hp <= 0) fallen.push(t.team);
    }
    if (fallen.length === 1) this.winner = fallen[0] === 0 ? 1 : 0;
    else if (fallen.length === 2) {
      const score = (team: Team) =>
        this.towers[team].rooms.reduce((s, r) => s + Math.max(0, r.hp), 0) + this.units.filter((u) => u.team === team).length;
      this.winner = score(0) >= score(1) ? 0 : 1;
    }
  }

  // ---- Units & damage -----------------------------------------------------------

  /** Supply in use: living units plus units being trained. */
  supplyUsed(team: Team): number {
    let s = 0;
    for (const u of this.units) if (u.team === team) s += UNITS[u.def].supply;
    for (const r of this.towers[team]?.rooms ?? []) if (r.job) s += UNITS[r.job.unit].supply;
    return s;
  }

  /** A new unit leaves `team`'s tower. Ground units exit at floor 0; air units launch from their room's floor. */
  spawnUnit(def: UnitId, team: Team, floor: number): Unit {
    const d = UNITS[def];
    const u: Unit = {
      id: this.newId(),
      def,
      team,
      x: faceX(team),
      px: faceX(team),
      alt: d.air ? floor + 0.5 : 0,
      depth: this.rng.next(),
      hp: d.hp,
      cooldown: 0,
      target: null,
    };
    this.units.push(u);
    return u;
  }

  /** Damage a room; at 0 hp it becomes rubble, and a fallen Core ends the game. */
  damageRoom(team: Team, room: Room, amount: number): void {
    if (room.hp <= 0) return;
    room.hp -= amount;
    if (room.hp > 0) return;
    const t = this.towers[team];
    this.effects.push({ kind: 'destroyed', tick: this.tick, team, col: room.col, floor: room.floor });
    removeRoom(t, room);
    if (room.def === 'core') {
      this.winner = team === 0 ? 1 : 0;
      return;
    }
    placeRoom(t, this.newId(), 'rubble', room.col, room.floor, true);
  }

  stepSeconds(s: number): void {
    const n = Math.round(s * TICK_RATE);
    for (let i = 0; i < n; i++) this.step();
  }

  /** Fingerprint of the full sim state. */
  hash(): string {
    return fnv1a(
      JSON.stringify({ tick: this.tick, rng: this.rng.state, id: this.nextId, towers: this.towers, units: this.units, winner: this.winner }),
    );
  }
}

/** Rebuild a world from options + a command log, stepping to `ticks`. */
export function replay(options: Partial<WorldOptions>, log: readonly LoggedCommand[], ticks: number): World {
  const w = new World(options);
  let i = 0;
  while (w.tick < ticks) {
    while (i < log.length && log[i].tick === w.tick) w.issue(log[i++].cmd);
    w.step();
  }
  while (i < log.length && log[i].tick === w.tick) w.issue(log[i++].cmd);
  return w;
}
