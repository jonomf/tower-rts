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

/**
 * Scripted players for Expedition balance runs (`npm run match -- --mode expedition`). Not offered as opponents.
 * homesteader: economy by the Core, a home garrison, a Gun Nest on each side, then a second Barracks that explores.
 */
export const BOTS: Record<string, AiScript> = {
  homesteader: {
    id: 'homesteader',
    name: 'Homesteader',
    blurb: 'Balance bot: garrison, two Gun Nests, then explore to the right and left.',
    order: [
      { build: 'mine', at: 'core' }, mine, mine,
      { build: 'barracks', at: 'core', train: 'trooper', deploy: 'home' },
      { build: 'gunNest', at: 'left' },
      { build: 'gunNest', at: 'right' },
      { build: 'quarters', at: 'up' }, train(40),
      { build: 'barracks', at: 'core', train: 'trooper', deploy: 'right' },
      { build: 'quarters', at: 'up' }, train(60),
      { build: 'refinery', at: 'up' },
      { build: 'workshop', at: 'up' },
      { build: 'flak', at: 'left' },
      { build: 'flak', at: 'right' }, train(60),
      { build: 'barracks', at: 'core', train: 'trooper', deploy: 'left' },
      { build: 'quarters', at: 'up' },
    ],
    rules: [
      { when: { garrisonOver: 14 }, order: 'assault' },
      { when: { supplyCapped: true }, do: { build: 'quarters', at: 'up' } },
      { when: { bankOver: 400 }, do: { build: 'gunNest', at: 'left' } },
      { when: { bankOver: 300 }, do: { build: 'gunNest', at: 'right' } },
    ],
    rebuild: true,
  },
};

/**
 * The Expedition Stronghold: economy and walls while hidden; once a player unit finds it, three Barracks of Troopers.
 * (A Gun Nest here dropped the steady bot's win rate from 30% to 17%, below the 30–60% target, so it has none.)
 * Not offered as a Skirmish opponent.
 */
export const STRONGHOLD: AiScript = {
  id: 'stronghold',
  name: 'Stronghold',
  blurb: 'The enemy tower hidden somewhere on the map.',
  order: [
    mine, mine, mine, quarters,
    { build: 'wall', at: 'front' },
    { build: 'wall', at: 'front' },
    { until: 'discovered' },
    troopers,
    quarters, train(30), troopers, quarters, train(40), troopers, quarters,
  ],
  rules: [
    { when: { supplyCapped: true }, do: quarters },
    { when: { bankOver: 400 }, do: { build: 'wall', at: 'front' } },
  ],
  saves: false,
  rebuild: true,
};

/** Every script a saved AI controller may refer to. */
export const ALL_SCRIPTS: Record<string, AiScript> = { ...SCRIPTS, ...BOTS, stronghold: STRONGHOLD };
