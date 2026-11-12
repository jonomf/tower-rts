/**
 * Client state around the sim: time control, selection, placement mode, feedback.
 * Everything that changes the world goes through world.issue().
 */
import { ROOMS, type Cost, type RoomId, type UnitId } from './sim/defs.ts';
import { groupOf, roomAt } from './sim/tower.ts';
import { DT, SAVE_VERSION, World } from './sim/world.ts';
import type { SavedGame } from './ui/save.ts';
import { PLAYER, type Command, type CommandResult, type Deploy, type Team } from './sim/types.ts';
import { CELL_H, CELL_W, cellRect, type Cell } from './render/layout.ts';
import { AiController } from './ai/controller.ts';
import { SCRIPTS } from './ai/scripts.ts';
import type { AiLevel } from './ai/types.ts';

/**
 * What to play. skirmish: against an AI script id, or the static practice dummy, at a level.
 * expedition: one tower on a fogged map (opponent and level unused until raids arrive in P3).
 */
export type GameMode = 'skirmish' | 'expedition';
export type MatchConfig = { mode: GameMode; opponent: string; level: AiLevel };
export const DEFAULT_MATCH: MatchConfig = { mode: 'skirmish', opponent: 'rush', level: 'relaxed' };

/** How a found site is announced. */
const SITE_NAMES: Partial<Record<string, string>> = {
  cache: 'a supply cache',
  ruin: 'ruins (nothing left)',
  camp: 'a raider camp',
  stronghold: 'the enemy Stronghold',
  trader: 'a trader',
};

export const SPEEDS = [0.5, 1, 2, 4];

export type Floater = { x: number; y: number; text: string; color: string; age: number };
export type Toast = { text: string; age: number; kind: 'info' | 'error' };

export class Game {
  world: World;
  readonly team: Team = PLAYER;
  paused = false;
  speed = 1;
  debug = false;
  placing: RoomId | null = null;
  selected: Cell | null = null;
  hover: Cell | null = null;
  floaters: Floater[] = [];
  toast: Toast | null = null;
  /** Real seconds since load, for animation. */
  time = 0;
  fps = 0;
  /** False while the start menu is up: the world is a backdrop and doesn't tick. */
  started = false;
  config: MatchConfig = { ...DEFAULT_MATCH };
  /** Called after a match starts (the client re-frames the camera). */
  onStart: () => void = () => {};
  private ais: AiController[] = [];
  private acc = 0;
  private hashAt = -1;
  private hashVal = '';
  private lastAlert = -100;

  constructor() {
    this.world = new World({ seed: 1, teams: [0, 1], scenario: 'dummy' });
  }

  /** Start a match against `config.opponent`. */
  start(config: MatchConfig = this.config): void {
    this.config = { ...config };
    const seed = Date.now() % 100000;
    const expedition = config.mode === 'expedition';
    const script = expedition ? undefined : SCRIPTS[config.opponent];
    this.world = expedition
      ? new World({ seed, mode: 'expedition' })
      : new World({ seed, teams: [0, 1], scenario: script ? 'none' : 'dummy' });
    this.ais = script ? [new AiController(1, script, config.level, seed)] : [];
    this.started = true;
    this.placing = null;
    this.selected = null;
    this.floaters = [];
    this.acc = 0;
    this.lastAlert = -100;
    this.paused = false;
    this.onStart();
    this.notify(
      expedition
        ? 'Build up, then set a Barracks to Deploy Left or Right to explore.'
        : script
          ? `${script.name} is building. Mines first, then a Barracks.`
          : 'Practice: raze the dummy tower.',
    );
  }

  /** The current match as a save game, or null when there is nothing worth resuming. */
  toSave(): SavedGame | null {
    if (!this.started || this.world.winner !== null) return null;
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      config: { ...this.config },
      speed: this.speed,
      world: this.world.snapshot(),
      ais: this.ais.map((a) => a.snapshot()),
    };
  }

  /** Continue a saved match. It resumes paused, so the player can get their bearings. */
  resume(s: SavedGame): void {
    this.world = World.fromSnapshot(s.world);
    this.ais = s.ais.map((a) => AiController.fromSnapshot(a, SCRIPTS));
    this.config = { ...DEFAULT_MATCH, ...s.config };
    this.speed = SPEEDS.includes(s.speed) ? s.speed : 1;
    this.started = true;
    this.paused = true;
    this.placing = null;
    this.selected = null;
    this.floaters = [];
    this.acc = 0;
    this.lastAlert = -100;
    this.onStart();
    this.notify('Welcome back. Paused: press ▶ (or Space) to continue.');
  }

  /** One sim tick: AIs act, the world steps, alerts fire. */
  tick(): void {
    const w = this.world;
    const wasOvertime = w.inOvertime;
    for (const ai of this.ais) ai.update(w);
    w.step();
    if (!wasOvertime && w.inOvertime) this.notify('Overtime! Both Cores are burning.', 'error');
    for (const e of w.effects) {
      if (e.tick !== w.tick - 1) continue;
      if (e.kind === 'discovered' && SITE_NAMES[e.site]) {
        this.notify(`Scouts found ${SITE_NAMES[e.site]} ${e.sector < 0 ? 'to the left' : 'to the right'} (sector ${Math.abs(e.sector)}).`);
      } else if (e.kind === 'loot') {
        this.float(e.x * CELL_W, -CELL_H * 1.2, e.gained);
        this.notify(`Cache looted: +${Math.floor(e.gained.minerals)} minerals${e.gained.gas ? `, +${Math.floor(e.gained.gas)} gas` : ''}.`);
      }
    }
    if (this.time - this.lastAlert > 10 && w.effects.some((e) => e.kind === 'shot' && e.room?.x === this.tower.x && e.tick === w.tick - 1)) {
      this.lastAlert = this.time;
      this.notify('Your tower is under attack!', 'error');
    }
  }

  /** 0..1 progress between the last sim tick and the next (render interpolation). */
  get alpha(): number {
    return Math.min(1, this.acc / DT);
  }

  get tower() {
    return this.world.tower(this.team);
  }

  /** Advance by real time; the sim runs on fixed ticks. */
  frame(dtReal: number): void {
    const dt = Math.min(dtReal, 0.25);
    this.time += dt;
    this.fps = this.fps * 0.9 + (dt > 0 ? 1 / dt : 0) * 0.1;
    if (this.started && !this.paused) {
      this.acc += dt * this.speed;
      let steps = 0;
      while (this.acc >= DT && steps < 40) {
        this.tick();
        this.acc -= DT;
        steps++;
      }
    }
    for (const f of this.floaters) f.age += dt;
    this.floaters = this.floaters.filter((f) => f.age < 1.2);
    if (this.toast) {
      this.toast.age += dt;
      if (this.toast.age > 2.5) this.toast = null;
    }
  }

  /** World hash, refreshed at most once per sim second (for the debug overlay). */
  get hash(): string {
    if (this.world.tick - this.hashAt >= 20 || this.hashAt < 0) {
      this.hashAt = this.world.tick;
      this.hashVal = this.world.hash();
    }
    return this.hashVal;
  }

  issue(cmd: Command): CommandResult {
    const res = this.world.issue(cmd);
    if (!res.ok) this.notify(res.reason, 'error');
    return res;
  }

  notify(text: string, kind: Toast['kind'] = 'info'): void {
    this.toast = { text, age: 0, kind };
  }

  // ---- Player verbs ---------------------------------------------------------

  /** Tap on a tower cell: place, collect, or select. */
  tap(cell: Cell | null): void {
    if (!cell) {
      this.selected = null;
      return;
    }
    if (this.placing) {
      const res = this.issue({ type: 'build', team: this.team, room: this.placing, col: cell.col, floor: cell.floor });
      if (res.ok) {
        this.selected = cell;
        this.placing = null;
      }
      return;
    }
    const r = roomAt(this.tower, cell.col, cell.floor);
    if (!r) {
      this.selected = null;
      return;
    }
    this.selected = { col: r.col, floor: r.floor };
    if (ROOMS[r.def].produces && r.built && groupOf(this.tower, r).some((m) => m.buffer >= 1)) this.collect(cell);
  }

  collect(cell: Cell): void {
    const r = roomAt(this.tower, cell.col, cell.floor);
    if (!r) return;
    const group = groupOf(this.tower, r);
    const res = this.world.issue({ type: 'collect', team: this.team, col: cell.col, floor: cell.floor });
    if (res.ok && res.gained) {
      const first = group[0];
      const rect = cellRect(first.col, first.floor, group.length * first.w, this.tower.x);
      this.float(rect.x + rect.w / 2, rect.y + CELL_H * 0.2, res.gained);
    }
  }

  demolishOrCancel(cell: Cell): void {
    const r = roomAt(this.tower, cell.col, cell.floor);
    if (!r) return;
    const res = this.issue({ type: r.built ? 'demolish' : 'cancel', team: this.team, col: r.col, floor: r.floor });
    if (res.ok) {
      const rect = cellRect(r.col, r.floor, r.w, this.tower.x);
      if (res.gained) this.float(rect.x + rect.w / 2, rect.y + CELL_H * 0.3, res.gained);
      this.selected = null;
    }
  }

  setDeploy(cell: Cell, deploy: Deploy): void {
    this.issue({ type: 'setDeploy', team: this.team, col: cell.col, floor: cell.floor, deploy });
  }

  /** Army ↔ Build: pause or resume every production room at once. */
  togglePosture(): void {
    const next = this.tower.posture === 'army' ? 'build' : 'army';
    if (this.issue({ type: 'setPosture', team: this.team, posture: next }).ok)
      this.notify(next === 'build' ? 'Build posture: all training paused. Save up for rooms.' : 'Army posture: training resumed.');
  }

  recall(): void {
    if (this.issue({ type: 'recall', team: this.team }).ok) this.notify('Recalled: every unit is heading home.');
  }

  send(dir: 1 | -1): void {
    if (this.issue({ type: 'sendGarrison', team: this.team, dir }).ok) this.notify(`Garrison marching ${dir < 0 ? 'left' : 'right'}.`);
  }

  setTrain(cell: Cell, unit: UnitId | null): void {
    this.issue({ type: 'setTrain', team: this.team, col: cell.col, floor: cell.floor, unit });
  }

  togglePlacing(def: RoomId): void {
    this.placing = this.placing === def ? null : def;
    if (this.placing) {
      this.selected = null;
      this.notify(`Tap a highlighted cell to build ${ROOMS[def].name}`);
    }
  }

  cancelMode(): void {
    if (this.placing) this.placing = null;
    else this.selected = null;
  }

  togglePause(): void {
    this.paused = !this.paused;
  }

  cycleSpeed(dir: 1 | -1): void {
    const i = SPEEDS.indexOf(this.speed);
    this.speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + dir))];
  }

  /** Speed button: 0.5 → 1 → 2 → 4 → 0.5. */
  rotateSpeed(): void {
    this.speed = SPEEDS[(SPEEDS.indexOf(this.speed) + 1) % SPEEDS.length];
  }

  private float(x: number, y: number, gained: Cost): void {
    const parts: [number, string, string][] = [
      [gained.minerals, '◆', '#7cc6ff'],
      [gained.gas, '▲', '#7ee08a'],
    ];
    let dy = 0;
    for (const [n, icon, color] of parts) {
      if (n >= 1) {
        this.floaters.push({ x, y: y + dy, text: `+${Math.floor(n)} ${icon}`, color, age: 0 });
        dy -= CELL_W * 0.25;
      }
    }
  }
}
