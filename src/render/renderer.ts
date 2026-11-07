/** Canvas 2D side-view renderer: sky, ground, lane, tower cross-section, rooms, feedback. Never mutates the sim. */
import { ROOMS, TOWER } from '../sim/defs.ts';
import { bufferCap, canAfford, mergeGroups, placementError, roomAt, roomRate } from '../sim/tower.ts';
import type { Room } from '../sim/types.ts';
import type { Game } from '../game.ts';
import type { Camera } from './camera.ts';
import { CELL_H, CELL_W, FRAME, LANE_LEN, TOWER_H, TOWER_W, cellRect, type Rect } from './layout.ts';

const RES_ICON = { minerals: '◆', gas: '▲' } as const;
const RES_COLOR = { minerals: '#7cc6ff', gas: '#7ee08a' } as const;

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly cam: Camera;
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement, cam: Camera) {
    this.canvas = canvas;
    this.cam = cam;
    this.ctx = canvas.getContext('2d')!;
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.cam.width = r.width;
    this.cam.height = r.height;
  }

  draw(game: Game): void {
    const { ctx, cam } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.sky();
    // World transform.
    const [ox, oy] = cam.toScreen(0, 0);
    ctx.setTransform(this.dpr * cam.zoom, 0, 0, this.dpr * cam.zoom, this.dpr * ox, this.dpr * oy);
    this.ground();
    this.towerShell();
    this.rooms(game);
    this.placement(game);
    this.selection(game);
    this.floaters(game);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (game.debug) this.debug(game);
  }

  // ---- Backdrop ---------------------------------------------------------------

  private sky(): void {
    const { ctx, cam } = this;
    const g = ctx.createLinearGradient(0, 0, 0, cam.height);
    g.addColorStop(0, '#1d2340');
    g.addColorStop(0.6, '#4a3b5c');
    g.addColorStop(1, '#8a5a52');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cam.width, cam.height);
  }

  private ground(): void {
    const { ctx } = this;
    const left = -2000, right = TOWER_W + LANE_LEN + 2000;
    // Distant ridge.
    ctx.fillStyle = '#2e2a3d';
    ctx.beginPath();
    ctx.moveTo(left, 0);
    for (let x = left; x <= right; x += 160) ctx.lineTo(x, -60 - 40 * Math.sin(x * 0.004) - 25 * Math.sin(x * 0.011));
    ctx.lineTo(right, 0);
    ctx.fill();
    // Earth.
    const g = ctx.createLinearGradient(0, 0, 0, 400);
    g.addColorStop(0, '#5b4636');
    g.addColorStop(1, '#2a1f19');
    ctx.fillStyle = g;
    ctx.fillRect(left, 0, right - left, 2000);
    // Lane: a packed-dirt road from the tower's lane face toward the enemy site.
    ctx.fillStyle = '#7a6250';
    ctx.fillRect(TOWER_W, 0, LANE_LEN, 6);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.setLineDash([24, 18]);
    ctx.beginPath();
    ctx.moveTo(TOWER_W + 20, 14);
    ctx.lineTo(TOWER_W + LANE_LEN, 14);
    ctx.stroke();
    ctx.setLineDash([]);
    // Enemy site placeholder.
    const ex = TOWER_W + LANE_LEN;
    ctx.strokeStyle = 'rgba(255,120,120,0.35)';
    ctx.setLineDash([10, 10]);
    ctx.strokeRect(ex, -TOWER_H, TOWER_W, TOWER_H);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,160,160,0.45)';
    ctx.font = '600 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('enemy tower (M2+)', ex + TOWER_W / 2, -TOWER_H / 2);
  }

  private towerShell(): void {
    const { ctx } = this;
    // Outer frame.
    ctx.fillStyle = '#3a3f58';
    ctx.fillRect(-FRAME, -TOWER_H - FRAME, TOWER_W + FRAME * 2, TOWER_H + FRAME);
    // Roof.
    ctx.fillStyle = '#4b516e';
    ctx.fillRect(-FRAME * 2, -TOWER_H - FRAME * 2.2, TOWER_W + FRAME * 4, FRAME * 1.4);
    // Empty cells.
    ctx.fillStyle = '#161826';
    ctx.fillRect(0, -TOWER_H, TOWER_W, TOWER_H);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let c = 1; c < TOWER.cols; c++) line(ctx, c * CELL_W, -TOWER_H, c * CELL_W, 0);
    ctx.strokeStyle = '#2b2f45';
    ctx.lineWidth = 4;
    for (let f = 1; f < TOWER.floors; f++) line(ctx, 0, -f * CELL_H, TOWER_W, -f * CELL_H);
    // Lane face marker (the side enemies will hit).
    ctx.fillStyle = 'rgba(255,90,90,0.5)';
    ctx.fillRect(TOWER_W + FRAME - 3, -TOWER_H, 3, TOWER_H);
  }

  // ---- Rooms --------------------------------------------------------------------

  private rooms(game: Game): void {
    const t = game.tower;
    for (const g of mergeGroups(t)) {
      const first = g[0];
      const last = g[g.length - 1];
      const rect = cellRect(first.col, first.floor, last.col + last.w - first.col);
      this.room(game, g, inset(rect, 3));
    }
  }

  private room(game: Game, group: Room[], r: Rect): void {
    const { ctx } = this;
    const room = group[0];
    const def = ROOMS[room.def];
    const t = game.tower;

    if (!room.built) {
      ctx.fillStyle = shade(def.color, -0.55);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      // Hatch.
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,200,80,0.18)';
      ctx.lineWidth = 6;
      for (let x = r.x - r.h; x < r.x + r.w; x += 18) line(ctx, x, r.y + r.h, x + r.h, r.y);
      ctx.restore();
      const p = room.progress / def.buildTime;
      bar(ctx, r.x + 6, r.y + r.h - 12, r.w - 12, 6, p, '#ffc857');
      this.label(def.name, r.x + r.w / 2, r.y + r.h * 0.38, r.w, 'rgba(255,255,255,0.75)');
      this.label(`${Math.floor(p * 100)}%`, r.x + r.w / 2, r.y + r.h * 0.62, r.w, '#ffc857', 0.8);
      return;
    }

    // Body: back wall + floor strip, FS cross-section style.
    ctx.fillStyle = shade(def.color, -0.35);
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = shade(def.color, 0.05);
    ctx.fillRect(r.x, r.y + r.h - 9, r.w, 9);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(r.x, r.y, r.w, 5);
    // Merge seams.
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    for (let i = 1; i < group.length; i++) {
      const sx = (group[i].col) * CELL_W;
      line(ctx, sx, r.y + 6, sx, r.y + r.h - 10);
    }
    // Lights that blink so the tower feels alive.
    for (let i = 0; i < group.length * room.w; i++) {
      const on = Math.sin(game.time * 2 + room.id * 1.7 + i * 2.3) > -0.6;
      ctx.fillStyle = on ? shade(def.color, 0.6) : shade(def.color, -0.2);
      ctx.fillRect(r.x + 8 + i * CELL_W, r.y + 9, 6, 4);
    }

    const name = group.length > 1 ? `${def.name} ×${group.length}` : def.name;
    this.label(name, r.x + r.w / 2, r.y + r.h * 0.42, r.w, '#fff');

    if (room.def === 'core') {
      const pulse = 0.5 + 0.5 * Math.sin(game.time * 1.5);
      ctx.fillStyle = `rgba(255,220,120,${0.15 + 0.15 * pulse})`;
      ctx.beginPath();
      ctx.arc(r.x + r.w / 2, r.y + r.h * 0.42, r.h * 0.42, 0, Math.PI * 2);
      ctx.fill();
      this.label(def.name, r.x + r.w / 2, r.y + r.h * 0.42, r.w, '#fff');
      bar(ctx, r.x + 8, r.y + r.h - 7, r.w - 16, 4, room.hp / def.hp, '#e05555');
    }

    const p = def.produces;
    if (p) {
      const rate = roomRate(t, room);
      const cap = bufferCap(rate);
      const buf = group.reduce((s, m) => s + m.buffer, 0);
      const fill = cap > 0 ? buf / (cap * group.length) : 0;
      this.label(`${(rate * group.length).toFixed(1)}/s`, r.x + r.w / 2, r.y + r.h * 0.66, r.w, 'rgba(255,255,255,0.7)', 0.75);
      bar(ctx, r.x + 6, r.y + r.h - 7, r.w - 12, 4, fill, RES_COLOR[p.res]);
      if (buf >= Math.max(5, cap * group.length * 0.2)) this.bubble(game, r.x + r.w / 2, r.y - 4, RES_ICON[p.res], RES_COLOR[p.res], fill >= 0.999);
    }
    if (def.supply) this.label(`+${Math.floor(def.supply * [0, 1, 2.2, 3.6][group.length])} supply`, r.x + r.w / 2, r.y + r.h * 0.66, r.w, 'rgba(255,255,255,0.7)', 0.75);
  }

  /** "Ready to collect" bubble, Fallout Shelter style. */
  private bubble(game: Game, x: number, y: number, icon: string, color: string, full: boolean): void {
    const { ctx } = this;
    const bob = Math.sin(game.time * 4 + x * 0.05) * 3;
    const cy = y - 16 + bob;
    ctx.fillStyle = full ? '#fff3c4' : 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(x, cy, 15, 0, Math.PI * 2);
    ctx.moveTo(x - 6, cy + 12);
    ctx.lineTo(x, cy + 21);
    ctx.lineTo(x + 6, cy + 12);
    ctx.fill();
    ctx.fillStyle = shade(color, -0.3);
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, x, cy + 1);
  }

  // ---- Interaction feedback ---------------------------------------------------

  private placement(game: Game): void {
    if (!game.placing) return;
    const { ctx } = this;
    const t = game.tower;
    const affordable = canAfford(t.bank, ROOMS[game.placing].cost);
    for (let f = 0; f < TOWER.floors; f++) {
      for (let c = 0; c < TOWER.cols; c++) {
        if (placementError(t, game.placing, c, f)) continue;
        const r = inset(cellRect(c, f), 4);
        ctx.strokeStyle = affordable ? 'rgba(120,255,160,0.55)' : 'rgba(255,200,120,0.4)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.setLineDash([]);
      }
    }
    const h = game.hover;
    if (h) {
      const ok = !placementError(t, game.placing, h.col, h.floor) && affordable;
      const r = inset(cellRect(h.col, h.floor), 3);
      ctx.fillStyle = ok ? 'rgba(120,255,160,0.25)' : 'rgba(255,90,90,0.25)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      this.label(ROOMS[game.placing].name, r.x + r.w / 2, r.y + r.h / 2, r.w, ok ? '#c8ffd8' : '#ffb3b3');
    }
  }

  private selection(game: Game): void {
    const s = game.selected;
    if (!s) return;
    const room = roomAt(game.tower, s.col, s.floor);
    if (!room) return;
    const r = inset(cellRect(room.col, room.floor, room.w), 1);
    const { ctx } = this;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }

  private floaters(game: Game): void {
    const { ctx } = this;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 22px system-ui, sans-serif';
    for (const f of game.floaters) {
      const a = 1 - f.age / 1.2;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = '#000';
      ctx.fillText(f.text, f.x + 1.5, f.y - f.age * 50 + 1.5);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - f.age * 50);
    }
    ctx.globalAlpha = 1;
  }

  private debug(game: Game): void {
    const { ctx, cam } = this;
    const lines = [
      `tick ${game.world.tick}  t ${game.world.seconds.toFixed(1)}s`,
      `fps ${game.fps.toFixed(0)}  zoom ${cam.zoom.toFixed(2)}`,
      `hash ${game.hash}  seed ${game.world.options.seed}`,
      `cmds ${game.world.commandLog.length}`,
    ];
    ctx.font = '12px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const x = cam.insets.left + 8, y = cam.insets.top + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 4, y - 4, 230, lines.length * 15 + 8);
    ctx.fillStyle = '#9fffb0';
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * 15));
  }

  /** Centered text sized to the room, hidden when it would be unreadably small on screen. */
  private label(text: string, x: number, y: number, maxW: number, color: string, scale = 1): void {
    const { ctx, cam } = this;
    const size = 17 * scale;
    if (size * cam.zoom < 7) return;
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(text, x + 1, y + 1, maxW - 8);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y, maxW - 8);
  }
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: number, color: string): void {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, p)), h);
}

function inset(r: Rect, d: number): Rect {
  return { x: r.x + d, y: r.y + d, w: r.w - d * 2, h: r.h - d * 2 };
}

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb color. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)),
  );
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}
