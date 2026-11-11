/** AI scripts are plain data (JSON-shaped), so later the player can write them too. */
import type { RoomId, UnitId } from '../sim/defs.ts';

/**
 * Where to put a room:
 * front = lane-side column, lowest floor · back = lowest floor, rearmost column ·
 * merge = next to a same-type room (else back) · up = highest floor available, rearmost column.
 */
export type Where = 'front' | 'back' | 'merge' | 'up';

export type BuildAction = { build: RoomId; at: Where; train?: UnitId };

/** An order step: build something, or keep training for a while before the next build. */
export type Step = BuildAction | { train: number };

export type Cond = { supplyCapped: true } | { bankOver: number };

export type Rule = { when: Cond; do: BuildAction };

export type AiScript = {
  id: string;
  name: string;
  blurb: string;
  /** Done in order. The AI stops training to save up for a build step; `{ train: seconds }` lets the army grow. */
  order: Step[];
  /** After the order: the first rule that holds and is affordable fires. */
  rules: Rule[];
  /** False: never stop training to save for a build; just build when the bank allows. Default true. */
  saves?: boolean;
  /** Rebuild its own destroyed rooms (on rubble, half price) when affordable. */
  rebuild: boolean;
};

/** relaxed: never taps to collect (40% producer income). sharp: taps every few seconds. */
export type AiLevel = 'relaxed' | 'sharp';
