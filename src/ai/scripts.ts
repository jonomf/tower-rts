import type { AiScript, BuildAction, Step } from './types.ts';

const mine: BuildAction = { build: 'mine', at: 'merge' };
const quarters: BuildAction = { build: 'quarters', at: 'up' };
const troopers: BuildAction = { build: 'barracks', at: 'back', train: 'trooper' };
const train = (seconds: number): Step => ({ train: seconds });

/** Found by `npm run match`: three merged Mines pay for exactly one Barracks of nonstop Troopers. */
export const SCRIPTS: Record<string, AiScript> = {
  rush: {
    id: 'rush',
    name: 'Rusher',
    blurb: 'Three Mines, one Barracks, Troopers forever. It never stops to grow.',
    order: [mine, mine, mine, troopers, quarters, troopers, quarters, troopers, quarters, { build: 'wall', at: 'front' }],
    rules: [
      { when: { supplyCapped: true }, do: quarters },
      { when: { bankOver: 350 }, do: troopers },
    ],
    saves: false,
    rebuild: true,
  },
  boom: {
    id: 'boom',
    name: 'Expander',
    blurb: 'Holds the lane, then pauses in short bursts to grow a second economy and flood you.',
    order: [
      mine, mine, mine, troopers, train(20),
      { build: 'mine', at: 'up' }, train(8), mine, train(8), mine, train(8),
      quarters, troopers, train(15), quarters, train(10),
      { build: 'mine', at: 'up' }, mine, mine, train(10),
      troopers, quarters, train(15), quarters, troopers,
    ],
    rules: [
      { when: { supplyCapped: true }, do: quarters },
      { when: { bankOver: 350 }, do: troopers },
      { when: { bankOver: 250 }, do: { build: 'wall', at: 'front' } },
    ],
    rebuild: true,
  },
};
