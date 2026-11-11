/** The only way to change the world. Player input, AI and (later) the network all come through here. */
import { ECON, ROOMS, UNITS, type Cost } from './defs.ts';
import { buildCost, canAfford, groupOf, placeRoom, placementError, removalError, removeRoom, roomAt } from './tower.ts';
import type { Command, CommandResult, Room } from './types.ts';
import type { World } from './world.ts';

const fail = (reason: string): CommandResult => ({ ok: false, reason });

/** Cost of a production room's unfinished job (refunded when the job is dropped). */
const jobRefund = (r: Room): Cost => (r.job ? { ...UNITS[r.job.unit].cost } : { minerals: 0, gas: 0 });

export function applyCommand(w: World, cmd: Command): CommandResult {
  const t = w.towers.find((x) => x.team === cmd.team);
  if (!t) return fail('No such team');

  switch (cmd.type) {
    case 'build': {
      const d = ROOMS[cmd.room];
      if (!d || !d.buildable) return fail('Can’t build that');
      if (w.winner !== null) return fail('The game is over');
      const err = placementError(t, cmd.room, cmd.col, cmd.floor);
      if (err) return fail(err);
      const cost = buildCost(t, cmd.room, cmd.col, cmd.floor);
      if (!canAfford(t.bank, cost)) return fail(cost.gas > t.bank.gas ? 'Not enough gas' : 'Not enough minerals');
      const rubble = roomAt(t, cmd.col, cmd.floor);
      if (rubble) removeRoom(t, rubble);
      t.bank.minerals -= cost.minerals;
      t.bank.gas -= cost.gas;
      const r = placeRoom(t, w.newId(), cmd.room, cmd.col, cmd.floor, d.buildTime <= 0);
      r.paid = cost;
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
      const job = jobRefund(r);
      const gained = {
        minerals:
          Math.floor(r.paid.minerals * ECON.demolishRefund) + Math.floor(ROOMS[r.def].produces?.res === 'minerals' ? r.buffer : 0) + job.minerals,
        gas: Math.floor(r.paid.gas * ECON.demolishRefund) + Math.floor(ROOMS[r.def].produces?.res === 'gas' ? r.buffer : 0) + job.gas,
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

    case 'setTrain': {
      const r = roomAt(t, cmd.col, cmd.floor);
      const trains = r && ROOMS[r.def].trains;
      if (!r || !trains) return fail('This room doesn’t train units');
      if (cmd.unit !== null && !trains.includes(cmd.unit)) return fail(`${ROOMS[r.def].name} can’t train that`);
      if (r.train === cmd.unit) return fail('Already set');
      // Switching or pausing drops the job in progress, refunded in full.
      const refund = jobRefund(r);
      t.bank.minerals += refund.minerals;
      t.bank.gas += refund.gas;
      r.job = null;
      r.train = cmd.unit;
      return { ok: true, gained: refund };
    }
  }
}
