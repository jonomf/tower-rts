/** DOM HUD: top bar, build palette, selected-room panel, toasts, help. Rebuilt cheaply each frame via text diffing. */
import { ECON, MERGE_MULT, PALETTE, ROOMS, UNITS, type Cost, type UnitId } from '../sim/defs.ts';
import { bufferCap, canAfford, coreOf, groupOf, removalError, roomAt, roomRate, supplyMax } from '../sim/tower.ts';
import { DEFAULT_MATCH, type Game, type MatchConfig } from '../game.ts';
import { SCRIPTS } from '../ai/scripts.ts';
import type { AiLevel } from '../ai/types.ts';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

export class Hud {
  private readonly minerals = $('#minerals');
  private readonly gas = $('#gas');
  private readonly supply = $('#supply');
  private readonly clock = $('#clock');
  private readonly pauseBtn = $<HTMLButtonElement>('#pause');
  private readonly speedBtn = $<HTMLButtonElement>('#speed');
  private readonly palette = $('#palette');
  private readonly panel = $('#panel');
  private readonly toast = $('#toast');
  private readonly help = $('#help');
  private readonly gameover = $('#gameover');
  private shownWinner: number | null = null;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private panelKey = '';
  private readonly game: Game;

  constructor(game: Game) {
    this.game = game;
    for (const id of PALETTE) {
      const d = ROOMS[id];
      const b = document.createElement('button');
      b.className = 'build';
      b.style.setProperty('--room', d.color);
      b.innerHTML = `<span class="name">${d.name}</span><span class="cost">${costHtml(d.cost)}</span>`;
      b.title = `${d.name}: ${d.blurb} (${d.buildTime}s)`;
      b.addEventListener('click', () => game.togglePlacing(id));
      this.palette.append(b);
      this.buttons.set(id, b);
    }
    this.pauseBtn.addEventListener('click', () => game.togglePause());
    this.speedBtn.addEventListener('click', () => game.rotateSpeed());
    $('#debug').addEventListener('click', () => (game.debug = !game.debug));
    $('#help-btn').addEventListener('click', () => this.help.classList.toggle('open'));
    $('#help-close').addEventListener('click', () => this.help.classList.remove('open'));
    $('#new-game').addEventListener('click', () => {
      this.help.classList.remove('open');
      this.openMenu();
    });
    this.buildMenu();
    this.panel.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      const s = game.selected;
      if (!act || !s) return;
      if (act === 'collect') game.collect(s);
      if (act === 'remove') game.demolishOrCancel(s);
      if (act === 'close') game.selected = null;
      if (act.startsWith('train:')) {
        const u = act.slice(6);
        game.setTrain(s, u === 'off' ? null : (u as UnitId));
      }
      this.panelKey = '';
    });
    $('#again').addEventListener('click', () => game.start());
    $('#to-menu').addEventListener('click', () => {
      this.gameover.classList.remove('open');
      this.openMenu();
    });
  }

  // ---- Start menu -------------------------------------------------------------

  private readonly menu = $('#menu');
  private choice: MatchConfig = loadChoice();

  private openMenu(): void {
    this.game.started = false;
    this.menu.classList.add('open');
  }

  private buildMenu(): void {
    const opponents = [
      ...Object.values(SCRIPTS).map((sc) => ({ id: sc.id, name: sc.name, blurb: sc.blurb })),
      { id: 'dummy', name: 'Target dummy', blurb: 'A tower that never fights back. For practice.' },
    ];
    const levels: { id: AiLevel; name: string; blurb: string }[] = [
      { id: 'relaxed', name: 'Relaxed', blurb: 'The AI never taps to collect, so its economy runs at 40%.' },
      { id: 'sharp', name: 'Sharp', blurb: 'The AI collects everything. You’ll need to tap too.' },
    ];
    const group = <T extends string>(sel: string, items: { id: T; name: string; blurb: string }[], get: () => T, set: (id: T) => void) => {
      const el = $(sel);
      const render = () => {
        el.innerHTML = items
          .map((o) => `<button data-id="${o.id}" class="${get() === o.id ? 'on' : ''}"><b>${o.name}</b><span>${o.blurb}</span></button>`)
          .join('');
      };
      el.addEventListener('click', (e) => {
        const id = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset.id as T | undefined;
        if (!id) return;
        set(id);
        render();
        $('#level-wrap').classList.toggle('off', this.choice.opponent === 'dummy');
      });
      render();
    };
    group('#opponents', opponents, () => this.choice.opponent, (id) => (this.choice.opponent = id));
    group('#levels', levels, () => this.choice.level, (id) => (this.choice.level = id));
    $('#level-wrap').classList.toggle('off', this.choice.opponent === 'dummy');
    $('#start').addEventListener('click', () => {
      saveChoice(this.choice);
      this.menu.classList.remove('open');
      this.game.start(this.choice);
    });
  }

  update(): void {
    const g = this.game;
    const t = g.tower;
    set(this.minerals, String(Math.floor(t.bank.minerals)));
    set(this.gas, String(Math.floor(t.bank.gas)));
    set(this.supply, `${g.world.supplyUsed(g.team)}/${supplyMax(t)}`);
    const s = Math.floor(g.world.seconds);
    set(this.clock, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    this.clock.classList.toggle('overtime', g.world.inOvertime);
    set(this.pauseBtn, g.paused ? '▶' : '❚❚');
    this.pauseBtn.classList.toggle('on', g.paused);
    set(this.speedBtn, `${g.speed}×`);

    for (const [id, b] of this.buttons) {
      const d = ROOMS[id as keyof typeof ROOMS];
      b.classList.toggle('active', g.placing === id);
      b.classList.toggle('poor', !canAfford(t.bank, d.cost));
    }

    if (g.toast) {
      set(this.toast, g.toast.text);
      this.toast.className = `show ${g.toast.kind}`;
      this.toast.style.opacity = String(Math.min(1, (2.5 - g.toast.age) * 2));
    } else this.toast.className = '';

    this.updatePanel();
    this.updateGameOver();
  }

  private updateGameOver(): void {
    const w = this.game.world;
    if (w.winner === this.shownWinner) return;
    this.shownWinner = w.winner;
    if (w.winner === null) {
      this.gameover.classList.remove('open');
      return;
    }
    const s = Math.floor(w.seconds);
    const time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const won = w.winner === this.game.team;
    $('#gameover-title').textContent = won ? 'Victory! Enemy Core destroyed' : 'Defeat: your Core fell';
    $('#gameover-detail').textContent = won
      ? `Took ${time}. Core HP left: ${Math.ceil(coreOf(this.game.tower)?.hp ?? 0)}.`
      : `You held out for ${time}.`;
    this.gameover.classList.toggle('won', won);
    this.gameover.classList.add('open');
  }

  private updatePanel(): void {
    const g = this.game;
    const s = g.selected;
    const r = s && roomAt(g.tower, s.col, s.floor);
    if (!r) {
      this.panel.classList.remove('open');
      this.panelKey = '';
      return;
    }
    const d = ROOMS[r.def];
    const group = groupOf(g.tower, r);
    const lines: string[] = [];
    if (!r.built) {
      lines.push(`Building… ${Math.floor((r.progress / d.buildTime) * 100)}% (${Math.ceil(d.buildTime - r.progress)}s left)`);
    } else if (d.produces) {
      const rate = roomRate(g.tower, r) * group.length;
      const buf = group.reduce((a, m) => a + m.buffer, 0);
      const cap = bufferCap(roomRate(g.tower, r)) * group.length;
      lines.push(`${rate.toFixed(1)} ${d.produces.res}/s${group.length > 1 ? ` (merged ×${group.length}: +${Math.round((MERGE_MULT[group.length] / group.length - 1) * 100)}%)` : ''}`);
      lines.push(`Ready: ${Math.floor(buf)} / ${Math.floor(cap)} · auto ${Math.round(g.world.options.autoCollectRate * 100)}%`);
    } else if (d.supply) {
      lines.push(`+${Math.floor(d.supply * MERGE_MULT[group.length])} supply${group.length > 1 ? ` (merged ×${group.length})` : ''}`);
    } else if (r.def === 'core') {
      lines.push(`HP ${Math.ceil(r.hp)} / ${d.hp} · +${ECON.coreRate.minerals} minerals/s`);
    }
    let trainHtml = '';
    if (r.built && d.trains) {
      if (r.job) {
        const u = UNITS[r.job.unit];
        lines.push(`Training ${u.name}: ${Math.floor((r.job.progress / u.trainTime) * 100)}%`);
      } else if (!r.train) lines.push('Paused');
      else {
        const u = UNITS[r.train];
        const why = g.world.supplyUsed(g.team) + u.supply > supplyMax(g.tower) ? 'supply (build Quarters)' : 'resources';
        lines.push(`Waiting for ${why}`);
      }
      trainHtml = `<div class="acts train">${d.trains
        .map((id) => {
          const u = UNITS[id];
          return `<button data-act="train:${id}" class="${r.train === id ? 'on' : ''}" title="${u.blurb}">${u.name}<span class="cost">${costHtml(u.cost)}</span><span class="cost">${u.supply} supply</span></button>`;
        })
        .join('')}<button data-act="train:off" class="${r.train ? '' : 'on'}">Pause</button></div>`;
    }
    if (r.built && r.hp < d.hp && d.hp > 0) lines.push(`Damaged: ${Math.ceil(r.hp)} / ${d.hp} HP`);
    const removeErr = removalError(g.tower, r);
    const refund = r.built
      ? { minerals: Math.floor(r.paid.minerals * ECON.demolishRefund), gas: Math.floor(r.paid.gas * ECON.demolishRefund) }
      : r.paid;
    const canCollect = r.built && !!d.produces && group.some((m) => m.buffer >= 1);
    const key = JSON.stringify([r.id, lines, removeErr, canCollect, group.length, r.train]);
    if (key === this.panelKey) return;
    this.panelKey = key;
    const removeLabel = r.def === 'core' || r.def === 'rubble' ? '' : `${r.built ? 'Demolish' : 'Cancel'} <span class="cost">+${costHtml(refund)}</span>`;
    this.panel.innerHTML = `
      <div class="head" style="--room:${d.color}"><b>${d.name}</b><button data-act="close" class="x" aria-label="Close">✕</button></div>
      <p class="blurb">${d.blurb}</p>
      ${lines.map((l) => `<p>${l}</p>`).join('')}
      ${trainHtml}
      <div class="acts">
        ${d.produces ? `<button data-act="collect" ${canCollect ? '' : 'disabled'}>Collect</button>` : ''}
        ${removeLabel ? `<button data-act="remove" ${removeErr ? `disabled title="${removeErr}"` : ''}>${removeLabel}</button>` : ''}
      </div>
      ${removeErr && r.def !== 'core' && r.def !== 'rubble' ? `<p class="why">${removeErr}</p>` : ''}`;
    this.panel.classList.add('open');
  }
}

const CHOICE_KEY = 'tower-rts.match';

function loadChoice(): MatchConfig {
  try {
    const c = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? 'null');
    if (c && (c.opponent === 'dummy' || SCRIPTS[c.opponent]) && (c.level === 'relaxed' || c.level === 'sharp')) return c;
  } catch {
    // storage unavailable: fall through to the default
  }
  return { ...DEFAULT_MATCH };
}

function saveChoice(c: MatchConfig): void {
  try {
    localStorage.setItem(CHOICE_KEY, JSON.stringify(c));
  } catch {
    // not fatal
  }
}

function costHtml(c: Cost): string {
  const parts = [];
  if (c.minerals) parts.push(`<i class="m">◆</i>${c.minerals}`);
  if (c.gas) parts.push(`<i class="g">▲</i>${c.gas}`);
  return parts.join(' ') || 'free';
}

function set(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
