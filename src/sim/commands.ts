/** The only way to change the world. Player input, AI and (later) the network all come through here. */
import { ECON, ROOMS } from './defs.ts';
import { canAfford, groupOf, placeRoom, placementError, removalError, removeRoom, roomAt } from './tower.ts';
import type { Command, CommandResult } from './types.ts';
import type { World } from './world.ts';

const fail = (reason: string): CommandResult => ({ ok: false, reason });

export function applyCommand(w: World, cmd: Command): CommandResult {
  const t = w.towers[cmd.team];
  if (!t) return fail('No such team');

  switch (cmd.type) {
    case 'build': {
      const d = ROOMS[cmd.room];
      if (!d || !d.buildable) return fail('Can’t build that');
      const err = placementError(t, cmd.room, cmd.col, cmd.floor);
      if (err) return fail(err);
      if (!canAfford(t.bank, d.cost)) return fail(d.cost.gas > t.bank.gas ? 'Not enough gas' : 'Not enough minerals');
      t.bank.minerals -= d.cost.minerals;
      t.bank.gas -= d.cost.gas;
      placeRoom(t, w.newId(), cmd.room, cmd.col, cmd.floor, d.buildTime <= 0);
      return { ok: true };
    }

    case 'cancel': {
      const r = roomAt(t, cmd.col, cmd.floor);
      if (!r) return fail('Nothing there');
      if (r.built) return fail('Already built');
      const err = removalError(t, r);
      if (err) return fail(err);
      removeRoom(t, r);
      t.bank.minerals += r.paid.minerals;
      t.bank.gas += r.paid.gas;
      return { ok: true, gained: { ...r.paid } };
    }

    case 'demolish': {
      const r = roomAt(t, cmd.col, cmd.floor);
      if (!r) return fail('Nothing there');
      if (!r.built) return fail('Still building (cancel instead)');
      const err = removalError(t, r);
      if (err) return fail(err);
      const gained = {
        minerals: Math.floor(r.paid.minerals * ECON.demolishRefund) + Math.floor(ROOMS[r.def].produces?.res === 'minerals' ? r.buffer : 0),
        gas: Math.floor(r.paid.gas * ECON.demolishRefund) + Math.floor(ROOMS[r.def].produces?.res === 'gas' ? r.buffer : 0),
      };
      removeRoom(t, r);
      t.bank.minerals += gained.minerals;
      t.bank.gas += gained.gas;
      return { ok: true, gained };
    }

    case 'collect': {
      const r = roomAt(t, cmd.col, cmd.floor);
      const p = r && ROOMS[r.def].produces;
      if (!r || !p) return fail('Nothing to collect');
      let total = 0;
      for (const m of groupOf(t, r)) {
        total += m.buffer;
        m.buffer = 0;
      }
      if (total <= 0) return fail('Nothing to collect');
      t.bank[p.res] += total;
      t.income[p.res] += total;
      return { ok: true, gained: { minerals: p.res === 'minerals' ? total : 0, gas: p.res === 'gas' ? total : 0 } };
    }
  }
}
