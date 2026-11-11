// Headless AI-vs-AI matches for balance.
// Usage: npm run match -- [--a rush] [--b boom] [--la sharp] [--lb sharp] [--n 50] [--all]
import { parseArgs } from 'node:util';
import { World } from '../src/sim/world.ts';
import { AiController, stepWithAi } from '../src/ai/controller.ts';
import { SCRIPTS } from '../src/ai/scripts.ts';
import type { AiLevel } from '../src/ai/types.ts';

export type MatchResult = { winner: 0 | 1 | null; seconds: number; world: World };

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

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      a: { type: 'string', default: 'rush' },
      b: { type: 'string', default: 'boom' },
      la: { type: 'string', default: 'sharp' },
      lb: { type: 'string', default: 'sharp' },
      n: { type: 'string', default: '50' },
      all: { type: 'boolean', default: false },
    },
  });
  const n = Number(values.n);
  if (values.all) {
    const ids = Object.keys(SCRIPTS);
    for (const a of ids) for (const b of ids) series(a, b, 'sharp', 'sharp', n);
    for (const a of ids) series(a, a, 'sharp', 'relaxed', n);
  } else series(values.a, values.b, values.la as AiLevel, values.lb as AiLevel, n);
}
