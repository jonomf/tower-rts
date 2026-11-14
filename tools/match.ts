// Headless AI-vs-AI matches for balance.
// Usage: npm run match -- [--a rush] [--b boom] [--la sharp] [--lb sharp] [--n 50] [--all]
import { parseArgs } from 'node:util';
import { World } from '../src/sim/world.ts';
import { RAID_SCALE } from '../src/sim/defs.ts';
import { AiController, stepWithAi } from '../src/ai/controller.ts';
import { BOTS, SCRIPTS } from '../src/ai/scripts.ts';
import type { AiLevel } from '../src/ai/types.ts';
import type { Team } from '../src/sim/types.ts';

export type MatchResult = { winner: Team | null; seconds: number; world: World };

export function runMatch(a: string, b: string, la: AiLevel, lb: AiLevel, seed: number, maxSeconds = 1200): MatchResult {
  const w = new World({ seed, teams: [0, 1] });
  const ais = [new AiController(0, SCRIPTS[a], la, seed), new AiController(1, SCRIPTS[b], lb, seed)];
  while (w.winner === null && w.seconds < maxSeconds) stepWithAi(w, ais);
  return { winner: w.winner, seconds: w.seconds, world: w };
}

function series(a: string, b: string, la: AiLevel, lb: AiLevel, n: number): void {
  let wa = 0, wb = 0, draws = 0, total = 0, longest = 0;
  for (let i = 1; i <= n; i++) {
    const r = runMatch(a, b, la, lb, i);
    if (r.winner === 0) wa++;
    else if (r.winner === 1) wb++;
    else draws++;
    total += r.seconds;
    longest = Math.max(longest, r.seconds);
  }
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  console.log(
    `${`${a}/${la}`.padEnd(13)} vs ${`${b}/${lb}`.padEnd(13)} ${String(wa).padStart(3)}-${String(wb).padEnd(3)} draws ${draws}  avg ${mmss(total / n)}  longest ${mmss(longest)}`,
  );
}

export type RunResult = { seconds: number; survived: boolean; repelled: number; raids: number; explored: number; camps: number };

/** One Expedition run by a scripted player, up to `maxSeconds`. */
export function runExpedition(bot: string, level: AiLevel, seed: number, maxSeconds = 900, raids: AiLevel = 'steady'): RunResult {
  const w = new World({ seed, mode: 'expedition', raidScale: RAID_SCALE[raids] });
  const ai = new AiController(0, BOTS[bot], level, seed);
  while (w.winner === null && w.seconds < maxSeconds) stepWithAi(w, [ai]);
  const d = w.director!;
  return {
    seconds: w.seconds,
    survived: w.winner === null,
    repelled: d.repelled,
    raids: d.raids,
    explored: w.map!.explored.filter(Boolean).length,
    camps: d.campsDown.left + d.campsDown.right,
  };
}

function expeditionSeries(bot: string, level: AiLevel, n: number): void {
  const runs = Array.from({ length: n }, (_, i) => runExpedition(bot, level, i + 1));
  const pct = (f: (r: RunResult) => boolean) => `${Math.round((runs.filter(f).length / n) * 100)}%`.padStart(4);
  const avg = (f: (r: RunResult) => number) => (runs.reduce((s, r) => s + f(r), 0) / n).toFixed(1);
  console.log(
    `${`${bot}/${level}`.padEnd(20)} alive at 5:00 ${pct((r) => r.seconds >= 300)}  10:00 ${pct((r) => r.seconds >= 600)}  15:00 ${pct((r) => r.seconds >= 900)}` +
      `  raids repelled ${avg((r) => r.repelled)} of ${avg((r) => r.raids)}  sectors ${avg((r) => r.explored)}/11  camps ${avg((r) => r.camps)}`,
  );
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      a: { type: 'string', default: 'rush' },
      b: { type: 'string', default: 'boom' },
      la: { type: 'string', default: 'sharp' },
      lb: { type: 'string', default: 'sharp' },
      n: { type: 'string', default: '50' },
      all: { type: 'boolean', default: false },
      mode: { type: 'string', default: 'skirmish' },
      bot: { type: 'string', default: '' },
    },
  });
  const n = Number(values.n);
  if (values.mode === 'expedition') {
    // --bot takes a level (relaxed / steady / sharp: how often the player taps); omitted, all three run.
    const levels = (values.bot ? [values.bot] : ['relaxed', 'steady', 'sharp']) as AiLevel[];
    for (const level of levels) expeditionSeries('homesteader', level, n);
  } else if (values.all) {
    const ids = Object.keys(SCRIPTS);
    for (const a of ids) for (const b of ids) series(a, b, 'sharp', 'sharp', n);
    for (const a of ids) series(a, a, 'sharp', 'relaxed', n);
  } else series(values.a, values.b, values.la as AiLevel, values.lb as AiLevel, n);
}
