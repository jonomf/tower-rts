/**
 * Save games in the browser (localStorage), so a player can close the page and continue later.
 * One slot. The world and AI snapshots are versioned by SAVE_VERSION; a save from another version is dropped.
 */
import { SAVE_VERSION, type WorldSnapshot } from '../sim/world.ts';
import type { AiSnapshot } from '../ai/controller.ts';
import type { MatchConfig } from '../game.ts';

const KEY = 'tower-rts.save';

export type SavedGame = {
  version: number;
  savedAt: number;
  config: MatchConfig;
  speed: number;
  world: WorldSnapshot;
  ais: AiSnapshot[];
};

export function loadSave(): SavedGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedGame;
    if (s?.version !== SAVE_VERSION || s.world?.version !== SAVE_VERSION) {
      localStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function writeSave(s: SavedGame): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage full or unavailable: the game goes on without a save.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** "Expedition · 4:12" */
export function describeSave(s: SavedGame): string {
  const sec = Math.floor(s.world.tick / 20);
  const mode = s.config.mode === 'expedition' ? 'Expedition' : 'Skirmish';
  return `${mode} · ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
