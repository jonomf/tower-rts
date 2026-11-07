import { ECON, TOWER } from './defs.ts';
import { applyCommand } from './commands.ts';
import { Rng, fnv1a } from './rng.ts';
import { constructionSystem, economySystem } from './systems/economy.ts';
import { createTower, placeRoom } from './tower.ts';
import type { Command, CommandResult, Team, Tower } from './types.ts';

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

export type WorldOptions = {
  seed: number;
  /** Which towers exist. M1 is single-tower; the enemy arrives in M2/M3. */
  teams: Team[];
  /** The micro dial: 0 = tap or nothing, 1 = tapping is pointless. */
  autoCollectRate: number;
};

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
  /** Every accepted command and the tick it was applied on (replays, lockstep later). */
  readonly commandLog: LoggedCommand[] = [];
  private nextId = 1;

  constructor(options: Partial<WorldOptions> = {}) {
    this.options = { seed: 1, teams: [0], autoCollectRate: ECON.autoCollectRate, ...options };
    this.rng = new Rng(this.options.seed);
    for (const team of this.options.teams) {
      const t = createTower(team);
      placeRoom(t, this.newId(), 'core', TOWER.coreCol, 0, true);
      this.towers[team] = t;
    }
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
    for (const t of this.towers) {
      if (!t) continue;
      constructionSystem(t, DT);
      economySystem(t, DT, this.options.autoCollectRate);
    }
    this.tick++;
  }

  stepSeconds(s: number): void {
    const n = Math.round(s * TICK_RATE);
    for (let i = 0; i < n; i++) this.step();
  }

  /** Fingerprint of the full sim state. */
  hash(): string {
    return fnv1a(JSON.stringify({ tick: this.tick, rng: this.rng.state, id: this.nextId, towers: this.towers }));
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
