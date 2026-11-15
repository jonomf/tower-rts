/** Expedition run summary and the best run, kept in this browser (localStorage). */
import type { World } from '../sim/world.ts';

const KEY = 'tower-rts.best';

export type RunStats = { won: boolean; seconds: number; explored: number; repelled: number; camps: number; rooms: number; score: number };

/** Score: sectors x100 + raids repelled x50 + camps x200 + 1000 for a win - seconds played (docs/expedition.md). */
export function runStats(w: World): RunStats {
  const d = w.director;
  const won = w.winner === 0 || w.victoryAt !== null;
  // A run that was won is timed to the win, however long the player kept going afterwards.
  const seconds = Math.floor(w.victoryAt ?? w.seconds);
  const explored = w.map ? w.map.explored.filter(Boolean).length : 0;
  const repelled = d?.repelled ?? 0;
  const camps = d ? d.campsDown.left + d.campsDown.right : 0;
  const rooms = w.commandLog.filter((c) => c.cmd.type === 'build' && c.cmd.team === 0).length;
  const score = explored * 100 + repelled * 50 + camps * 200 + (won ? 1000 : 0) - seconds;
  return { won, seconds, explored, repelled, camps, rooms, score };
}

/** Save this run if it beats the best so far. Returns the best (after saving) and whether this run set it. */
export function recordRun(run: RunStats): { best: RunStats; isBest: boolean } {
  let best: RunStats | null = null;
  try {
    best = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    // unreadable: treat as no best yet
  }
  if (best && typeof best.score === 'number' && best.score >= run.score) return { best, isBest: false };
  try {
    localStorage.setItem(KEY, JSON.stringify(run));
  } catch {
    // storage unavailable: the summary still shows this run
  }
  return { best: run, isBest: true };
}
