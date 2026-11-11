import { ECON, LANE, OVERTIME, TOWER, UNITS, type UnitId } from './defs.ts';
import { applyCommand } from './commands.ts';
import { Rng, fnv1a } from './rng.ts';
import { constructionSystem, economySystem } from './systems/economy.ts';
import { productionSystem } from './systems/production.ts';
import { unitSystem } from './systems/units.ts';
import { buildScenario, type ScenarioId } from './scenario.ts';
import { coreOf, createTower, exitSide, faceOf, placeRoom, removeRoom, type TowerPlacement } from './tower.ts';
import { opponent, type Command, type CommandResult, type Effect, type Room, type Team, type Tower, type TowerId, type Unit } from './types.ts';

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

export type WorldOptions = {
  seed: number;
  /** Which teams get a tower, in Skirmish layout (team 0 on the left facing right, team 1 across the lane). */
  teams: Team[];
  /** The micro dial: 0 = tap or nothing, 1 = tapping is pointless. */
  autoCollectRate: number;
  /** Extra setup after the empty towers exist (e.g. the M2 dummy enemy). */
  scenario: ScenarioId;
};

/** Render-only effects are kept this many ticks. */
const EFFECT_TTL = 12;

/** Skirmish layout: team 0's tower at the left facing right; team 1's across the lane, facing left, Core at the back. */
export function skirmishPlacement(team: Team): TowerPlacement {
  return team === 0
    ? { x: 0, front: 'right', coreCol: TOWER.coreCol }
    : { x: TOWER.cols + LANE.length, front: 'left', coreCol: TOWER.cols - 2 };
}

export type LoggedCommand = { tick: number; cmd: Command };

/**
 * The whole simulation: plain data + fixed-tick systems. No DOM, no wall clock, no Math.random.
 * Deterministic: the same options plus the same commands on the same ticks give the same hash().
 */
export class World {
  tick = 0;
  readonly options: WorldOptions;
  readonly rng: Rng;
  /** Every tower on the axis, in creation order. */
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
    for (const team of this.options.teams) this.addTower(team, skirmishPlacement(team));
    buildScenario(this, this.options.scenario);
  }

  get seconds(): number {
    return this.tick / TICK_RATE;
  }

  newId(): number {
    return this.nextId++;
  }

  /** Create a tower with its Core. */
  addTower(team: Team, at: TowerPlacement): Tower {
    const t = createTower(this.newId(), team, at);
    placeRoom(t, this.newId(), 'core', at.coreCol, 0, true);
    this.towers.push(t);
    return t;
  }

  /** A team's first tower (its home). */
  tower(team: Team): Tower {
    const t = this.towers.find((x) => x.team === team);
    if (!t) throw new Error(`team ${team} has no tower`);
    return t;
  }

  towerById(id: TowerId | null | undefined): Tower | undefined {
    return id == null ? undefined : this.towers.find((t) => t.id === id);
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

  /** Both sides' home Cores burn in overtime. If both fall on the same tick, the tower in better shape wins. */
  private overtime(): void {
    if (!this.inOvertime || this.winner !== null) return;
    const fallen: Team[] = [];
    for (const t of [this.tower(0), this.tower(1)]) {
      const core = coreOf(t);
      if (!core) continue;
      core.hp -= OVERTIME.burn * DT;
      if (core.hp <= 0) fallen.push(t.team);
    }
    if (fallen.length === 1) this.winner = opponent(fallen[0]);
    else if (fallen.length === 2) {
      const score = (team: Team) =>
        this.tower(team).rooms.reduce((s, r) => s + Math.max(0, r.hp), 0) + this.units.filter((u) => u.team === team).length;
      this.winner = score(0) >= score(1) ? 0 : 1;
    }
  }

  // ---- Units & damage -----------------------------------------------------------

  /** Supply in use by a tower: its living units plus units it is training. A team's number means its home tower. */
  supplyUsed(of: Team | Tower): number {
    const t = typeof of === 'number' ? this.tower(of) : of;
    let s = 0;
    for (const u of this.units) if (u.home === t.id) s += UNITS[u.def].supply;
    for (const r of t.rooms) if (r.job) s += UNITS[r.job.unit].supply;
    return s;
  }

  /**
   * A new unit leaves a tower (default: the team's home) from its exit face. Ground units exit at floor 0;
   * air units launch from their room's floor. Units spawned for a team count against its home tower's supply.
   */
  spawnUnit(def: UnitId, team: Team, floor: number, from: Tower = this.tower(team)): Unit {
    const d = UNITS[def];
    const side = exitSide(from);
    const x = faceOf(from, side);
    const u: Unit = {
      id: this.newId(),
      def,
      team,
      x,
      px: x,
      dir: side === 'right' ? 1 : -1,
      home: from.team === team ? from.id : null,
      alt: d.air ? floor + 0.5 : 0,
      depth: this.rng.next(),
      hp: d.hp,
      cooldown: 0,
      target: null,
    };
    this.units.push(u);
    return u;
  }

  /** Damage a room; at 0 hp it becomes rubble, and a fallen Core ends the game. A team's number means its home tower. */
  damageRoom(of: Team | Tower, room: Room, amount: number): void {
    const t = typeof of === 'number' ? this.tower(of) : of;
    if (room.hp <= 0) return;
    room.hp -= amount;
    if (room.hp > 0) return;
    this.effects.push({ kind: 'destroyed', tick: this.tick, team: t.team, x: t.x, col: room.col, floor: room.floor });
    removeRoom(t, room);
    if (room.def === 'core') {
      // A side's Core falling ends the game. (A neutral tower's Core just becomes rubble.)
      const winner = opponent(t.team);
      if (winner !== null) {
        this.winner = winner;
        return;
      }
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
