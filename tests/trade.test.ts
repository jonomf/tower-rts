import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.ts';
import { TRADE } from '../src/sim/defs.ts';
import { sectorCenter } from '../src/sim/map.ts';
import { tradeOffer } from '../src/sim/systems/explore.ts';

function world(seed = 6) {
  const w = new World({ mode: 'expedition', seed });
  const post = w.towers.find((t) => t.kind === 'trader')!;
  const site = w.map!.sites.find((s) => s.kind === 'trader')!;
  /** Put a player scout next to the trading post. */
  const visit = () => {
    const u = w.spawnUnit('trooper', 0, 0, w.tower(0), 'home');
    u.x = u.px = sectorCenter(site.sector) + 1;
    w.step();
    return u;
  };
  return { w, post, site, home: w.tower(0), visit };
}

test('every map has one neutral trading post; trading is locked until a player unit reaches it', () => {
  const { w, post, site } = world();
  assert.equal(w.towers.filter((t) => t.kind === 'trader').length, 1);
  assert.equal(post.team, 2);
  assert.equal(post.x + 3, sectorCenter(site.sector));
  assert.deepEqual(w.issue({ type: 'trade', team: 0, sell: 'minerals' }), { ok: false, reason: 'Find the Trader first' });
});

test('meeting the Trader pays a one-time gift and unlocks trading from anywhere', () => {
  const { w, home, site, visit } = world();
  home.bank = { minerals: 0, gas: 0 };
  const scout = visit();
  assert.equal(w.trade!.unlocked, true);
  assert.equal(site.claimed, true);
  assert.ok(Math.abs(home.bank.minerals - TRADE.gift.minerals) < 1 && home.bank.gas === TRADE.gift.gas);
  assert.equal(w.effects.filter((e) => e.kind === 'traderMet').length, 1);
  scout.hp = 0; // the scout dies; trading stays open
  visit();
  w.stepSeconds(2);
  assert.ok(home.bank.gas === TRADE.gift.gas, 'no second gift');
  assert.equal(w.issue({ type: 'trade', team: 0, sell: 'gas' }).ok, true);
});

test('selling pays the posted offer, both ways, and needs the full amount', () => {
  const { w, home, visit } = world();
  visit();
  home.bank = { minerals: 250, gas: 0 };
  const offer = tradeOffer(w.trade!.rate);
  assert.deepEqual(w.issue({ type: 'trade', team: 0, sell: 'gas' }), { ok: false, reason: 'Not enough gas' });
  assert.deepEqual(w.issue({ type: 'trade', team: 0, sell: 'minerals' }), { ok: true, gained: { minerals: 0, gas: offer.gas } });
  assert.deepEqual([home.bank.minerals, home.bank.gas], [150, offer.gas]);
  home.bank.gas = TRADE.gasIn;
  assert.equal(w.issue({ type: 'trade', team: 0, sell: 'gas' }).ok, true);
  assert.deepEqual([home.bank.minerals, home.bank.gas], [150 + offer.minerals, 0]);
  home.bank.minerals = 99;
  assert.deepEqual(w.issue({ type: 'trade', team: 0, sell: 'minerals' }), { ok: false, reason: 'Not enough minerals' });
});

test('the rate drifts every 60 s and stays within ±20%', () => {
  const { w } = world();
  const seen = new Set<number>();
  for (let i = 0; i < 10; i++) {
    seen.add(w.trade!.rate);
    assert.ok(w.trade!.rate >= 1 - TRADE.swing && w.trade!.rate <= 1 + TRADE.swing);
    w.stepSeconds(TRADE.every);
    if (w.winner !== null) break;
  }
  assert.ok(seen.size >= 3, `distinct rates: ${seen.size}`);
});
