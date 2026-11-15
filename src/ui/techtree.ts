/**
 * The Tech sheet: the tech tree drawn from the catalog (`requires` in defs.ts), lit up as the player unlocks it.
 * Tiers run top to bottom; a line joins each room to what it requires. The DOM is built once per mode; only
 * classes change afterwards.
 */
import { EXPEDITION_ONLY, ROOMS, UNITS, type Cost, type RoomId } from '../sim/defs.ts';
import { hasRoom, roomLocked, techTiers, unitLocked } from '../sim/tech.ts';
import type { Game } from '../game.ts';

const cost = (c: Cost) => `${c.minerals}<i class="m">◆</i>${c.gas ? ` ${c.gas}<i class="g">▲</i>` : ''}`;

export class TechTree {
  private readonly root = document.querySelector<HTMLElement>('#tech')!;
  private readonly tree = document.querySelector<HTMLElement>('#tech-tree')!;
  private readonly game: Game;
  private builtFor = '';
  private stateKey = '';

  constructor(game: Game) {
    this.game = game;
    document.querySelector('#tech-btn')!.addEventListener('click', () => this.toggle());
    document.querySelector('#tech-close')!.addEventListener('click', () => this.toggle(false));
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.toggle(false);
    });
    window.addEventListener('resize', () => this.isOpen && this.drawLines());
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 't' || e.key === 'T') this.toggle();
      else if (e.key === 'Escape') this.toggle(false);
    });
  }

  get isOpen(): boolean {
    return this.root.classList.contains('open');
  }

  toggle(open = !this.isOpen): void {
    this.root.classList.toggle('open', open);
    if (open) {
      this.update();
      requestAnimationFrame(() => this.drawLines());
    }
  }

  /** Rooms shown: everything buildable in this mode. */
  private shown(id: RoomId): boolean {
    return id === 'core' || !!this.game.world.map || !EXPEDITION_ONLY.includes(id);
  }

  private build(): void {
    const tiers = techTiers()
      .map((ids) => ids.filter((id) => this.shown(id)))
      .filter((ids) => ids.length);
    this.tree.innerHTML =
      '<svg id="tech-lines" aria-hidden="true"></svg>' +
      tiers
        .map(
          (ids) =>
            `<div class="tier">${ids
              .map((id) => {
                const d = ROOMS[id];
                const units = (d.trains ?? [])
                  .map((u) => `<span class="u" data-unit="${u}" title="${UNITS[u].blurb}">${UNITS[u].name}<em></em></span>`)
                  .join('');
                return `<div class="node" data-room="${id}" style="--room:${d.color}" title="${d.blurb}">
                  <b>${d.name}</b>${id === 'core' ? '' : `<span class="cost">${cost(d.cost)}</span>`}<span class="need"></span>${units}</div>`;
              })
              .join('')}</div>`,
        )
        .join('');
  }

  /** Call every frame; does nothing while closed or while nothing changed. */
  update(): void {
    if (!this.isOpen) return;
    const g = this.game;
    const mode = g.world.map ? 'expedition' : 'skirmish';
    if (this.builtFor !== mode) {
      this.builtFor = mode;
      this.stateKey = '';
      this.build();
      requestAnimationFrame(() => this.drawLines());
    }
    const nodes = [...this.tree.querySelectorAll<HTMLElement>('.node')];
    const state = nodes.map((n) => {
      const id = n.dataset.room as RoomId;
      return [id, hasRoom(g.world, g.team, id), roomLocked(g.world, g.team, id)] as const;
    });
    const units = [...this.tree.querySelectorAll<HTMLElement>('.u')].map((el) => [el, unitLocked(g.world, g.team, el.dataset.unit as keyof typeof UNITS)] as const);
    const key = JSON.stringify([state, units.map((u) => u[1])]);
    if (key === this.stateKey) return;
    this.stateKey = key;
    nodes.forEach((n, i) => {
      const [, have, need] = state[i];
      n.classList.toggle('have', have);
      n.classList.toggle('locked', !!need);
      n.querySelector('.need')!.textContent = have ? 'built' : need ? `needs ${ROOMS[need].name}` : 'ready to build';
    });
    for (const [el, need] of units) {
      el.classList.toggle('locked', !!need);
      el.querySelector('em')!.textContent = need ? ` needs ${ROOMS[need].name}` : '';
    }
    this.drawLines();
  }

  /** One curve from each room down to each room that requires it (rooms with no requirement hang off the Core). */
  private drawLines(): void {
    const svg = this.tree.querySelector<SVGElement>('#tech-lines');
    if (!svg) return;
    const box = this.tree.getBoundingClientRect();
    if (!box.width) return;
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    const at = (id: string) => this.tree.querySelector<HTMLElement>(`.node[data-room="${id}"]`);
    const sideways = getComputedStyle(this.tree).flexDirection === 'row';
    let paths = '';
    for (const child of this.tree.querySelectorAll<HTMLElement>('.node')) {
      const id = child.dataset.room as RoomId;
      if (id === 'core') continue;
      for (const req of ROOMS[id].requires ?? ['core' as RoomId]) {
        const parent = at(req);
        if (!parent) continue;
        const a = parent.getBoundingClientRect();
        const b = child.getBoundingClientRect();
        const lit = parent.classList.contains('have') ? 'lit' : '';
        const n = (v: number) => v.toFixed(1);
        if (sideways) {
          // Tiers are columns: from the parent's right edge to the child's left edge.
          const x1 = a.right - box.left, y1 = a.top + a.height / 2 - box.top;
          const x2 = b.left - box.left, y2 = b.top + b.height / 2 - box.top;
          const mx = (x1 + x2) / 2;
          paths += `<path class="${lit}" d="M${n(x1)} ${n(y1)} C${n(mx)} ${n(y1)} ${n(mx)} ${n(y2)} ${n(x2)} ${n(y2)}"/>`;
        } else {
          const x1 = a.left + a.width / 2 - box.left, y1 = a.bottom - box.top;
          const x2 = b.left + b.width / 2 - box.left, y2 = b.top - box.top;
          const my = (y1 + y2) / 2;
          paths += `<path class="${lit}" d="M${n(x1)} ${n(y1)} C${n(x1)} ${n(my)} ${n(x2)} ${n(my)} ${n(x2)} ${n(y2)}"/>`;
        }
      }
    }
    svg.innerHTML = paths;
  }
}
