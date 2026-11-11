/** Canvas 2D side-view renderer: sky, ground, lane, both towers, units, shots. Never mutates the sim. */
import { LANE, MERGE_MULT, ROOMS, TOWER, UNITS } from '../sim/defs.ts';
import { bufferCap, canAfford, buildCost, mergeGroups, placementError, roomAt, roomRate } from '../sim/tower.ts';
import type { Room, Tower, Unit } from '../sim/types.ts';
import { DT } from '../sim/world.ts';
import type { Game } from '../game.ts';
import type { Camera } from './camera.ts';
import {
  CELL_H,
  CELL_W,
  ENEMY_X0,
  FIELD_W,
  FRAME,
  LANE_LEN,
  TOWER_H,
  TOWER_W,
  altToWorld,
  cellRect,
  laneToWorld,
  type Rect,
} from './layout.ts';

const RES_ICON = { minerals: '◆', gas: '▲' } as const;
const RES_COLOR = { minerals: '#7cc6ff', gas: '#7ee08a' } as const;
const TEAM_COLOR = ['#4cc3ff', '#ff5d5d'] as const;
const TEAM_DARK = ['#1d5f86', '#8a2b2b'] as const;
/** Effects live this many ticks (matches the sim's TTL). */
const FX_TICKS = 12;

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
    const [ox, oy] = cam.toScreen(0, 0);
    ctx.setTransform(this.dpr * cam.zoom, 0, 0, this.dpr * cam.zoom, this.dpr * ox, this.dpr * oy);
    this.ground();
    for (const t of game.world.towers) if (t) this.tower(game, t);
    this.placement(game);
    this.selection(game);
    this.units(game);
    this.effects(game);
    this.floaters(game);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (game.started) this.laneStrip(game);
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
    const left = -3000, right = FIELD_W + 3000;
    ctx.fillStyle = '#2e2a3d';
    ctx.beginPath();
    ctx.moveTo(left, 0);
    for (let x = left; x <= right; x += 160) ctx.lineTo(x, -60 - 40 * Math.sin(x * 0.004) - 25 * Math.sin(x * 0.011));
    ctx.lineTo(right, 0);
    ctx.fill();
    const g = ctx.createLinearGradient(0, 0, 0, 400);
    g.addColorStop(0, '#5b4636');
    g.addColorStop(1, '#2a1f19');
    ctx.fillStyle = g;
    ctx.fillRect(left, 0, right - left, 2000);
    // The lane: a packed-dirt road between the two lane faces.
    ctx.fillStyle = '#7a6250';
    ctx.fillRect(TOWER_W, 0, LANE_LEN, 22);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(TOWER_W, 18, LANE_LEN, 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.setLineDash([24, 18]);
    line(ctx, TOWER_W + 20, 11, ENEMY_X0 - 20, 11);
    ctx.setLineDash([]);
    // Midfield marker.
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(TOWER_W + LANE_LEN / 2 - 2, 0, 4, 22);
  }

  // ---- Towers -------------------------------------------------------------------

  private tower(game: Game, t: Tower): void {
    const { ctx } = this;
    const x0 = t.team === 0 ? 0 : ENEMY_X0;
    ctx.fillStyle = t.team === 0 ? '#3a3f58' : '#4a3a48';
    ctx.fillRect(x0 - FRAME, -TOWER_H - FRAME, TOWER_W + FRAME * 2, TOWER_H + FRAME);
    ctx.fillStyle = t.team === 0 ? '#4b516e' : '#5e4a5a';
    ctx.fillRect(x0 - FRAME * 2, -TOWER_H - FRAME * 2.2, TOWER_W + FRAME * 4, FRAME * 1.4);
    ctx.fillStyle = '#161826';
    ctx.fillRect(x0, -TOWER_H, TOWER_W, TOWER_H);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let c = 1; c < TOWER.cols; c++) line(ctx, x0 + c * CELL_W, -TOWER_H, x0 + c * CELL_W, 0);
    ctx.strokeStyle = '#2b2f45';
    ctx.lineWidth = 4;
    for (let f = 1; f < TOWER.floors; f++) line(ctx, x0, -f * CELL_H, x0 + TOWER_W, -f * CELL_H);
    // Lane face (the side that gets hit).
    ctx.fillStyle = 'rgba(255,90,90,0.5)';
    const fx = t.team === 0 ? TOWER_W + FRAME - 3 : ENEMY_X0 - FRAME;
    ctx.fillRect(fx, -TOWER_H, 3, TOWER_H);
    // Team flag on the roof.
    ctx.fillStyle = TEAM_COLOR[t.team];
    const flagX = x0 + TOWER_W / 2;
    ctx.fillRect(flagX - 1.5, -TOWER_H - FRAME * 2.2 - 40, 3, 40);
    ctx.beginPath();
    const fdir = t.team === 0 ? 1 : -1;
    ctx.moveTo(flagX, -TOWER_H - FRAME * 2.2 - 40);
    ctx.lineTo(flagX + fdir * 30, -TOWER_H - FRAME * 2.2 - 32);
    ctx.lineTo(flagX, -TOWER_H - FRAME * 2.2 - 24);
    ctx.fill();

    for (const g of mergeGroups(t)) {
      const first = g[0];
      const last = g[g.length - 1];
      const rect = cellRect(first.col, first.floor, last.col + last.w - first.col, t.team);
      this.room(game, t, g, inset(rect, 3));
    }
  }

  private room(game: Game, t: Tower, group: Room[], r: Rect): void {
    const { ctx } = this;
    const room = group[0];
    const def = ROOMS[room.def];

    if (room.def === 'rubble') {
      ctx.fillStyle = '#2a2624';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#4a4440';
      for (let i = 0; i < 7; i++) {
        const px = r.x + 8 + ((room.id * 37 + i * 29) % (r.w - 24));
        const sz = 8 + ((room.id + i * 13) % 10);
        ctx.fillRect(px, r.y + r.h - sz - 2 - (i % 3) * 5, sz + 6, sz);
      }
      return;
    }

    if (!room.built) {
      ctx.fillStyle = shade(def.color, -0.55);
      ctx.fillRect(r.x, r.y, r.w, r.h);
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
      this.hpBar(group, r);
      return;
    }

    ctx.fillStyle = shade(def.color, -0.35);
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = shade(def.color, 0.05);
    ctx.fillRect(r.x, r.y + r.h - 9, r.w, 9);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(r.x, r.y, r.w, 5);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    for (let i = 1; i < group.length; i++) {
      const sx = cellRect(group[i].col, group[i].floor, 1, t.team).x + (t.team === 0 ? 0 : CELL_W);
      line(ctx, sx, r.y + 6, sx, r.y + r.h - 10);
    }
    for (let i = 0; i < group.length * room.w; i++) {
      const on = Math.sin(game.time * 2 + room.id * 1.7 + i * 2.3) > -0.6;
      ctx.fillStyle = on ? shade(def.color, 0.6) : shade(def.color, -0.2);
      ctx.fillRect(r.x + 8 + i * CELL_W, r.y + 9, 6, 4);
    }

    const name = group.length > 1 ? `${def.name} ×${group.length}` : def.name;
    if (room.def === 'core') {
      const pulse = 0.5 + 0.5 * Math.sin(game.time * 1.5);
      ctx.fillStyle = `rgba(255,220,120,${0.15 + 0.15 * pulse})`;
      ctx.beginPath();
      ctx.arc(r.x + r.w / 2, r.y + r.h * 0.42, r.h * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    this.label(name, r.x + r.w / 2, r.y + r.h * 0.4, r.w, '#fff');

    const p = def.produces;
    if (p) {
      const rate = roomRate(t, room);
      const cap = bufferCap(rate);
      const buf = group.reduce((s, m) => s + m.buffer, 0);
      const fill = cap > 0 ? buf / (cap * group.length) : 0;
      this.label(`${(rate * group.length).toFixed(1)}/s`, r.x + r.w / 2, r.y + r.h * 0.64, r.w, 'rgba(255,255,255,0.7)', 0.75);
      bar(ctx, r.x + 6, r.y + r.h - 7, r.w - 12, 4, fill, RES_COLOR[p.res]);
      if (t.team === game.team && buf >= Math.max(5, cap * group.length * 0.2))
        this.bubble(game, r.x + r.w / 2, r.y - 4, RES_ICON[p.res], RES_COLOR[p.res], fill >= 0.999);
    }
    if (def.supply) this.label(`+${Math.floor(def.supply * MERGE_MULT[group.length])} supply`, r.x + r.w / 2, r.y + r.h * 0.64, r.w, 'rgba(255,255,255,0.7)', 0.75);
    if (def.trains) {
      if (room.job) {
        const u = UNITS[room.job.unit];
        this.label(u.name, r.x + r.w / 2, r.y + r.h * 0.64, r.w, u.color, 0.75);
        bar(ctx, r.x + 6, r.y + r.h - 7, r.w - 12, 4, room.job.progress / u.trainTime, u.color);
      } else {
        this.label(room.train ? 'waiting' : 'paused', r.x + r.w / 2, r.y + r.h * 0.64, r.w, 'rgba(255,255,255,0.5)', 0.75);
      }
    }
    this.hpBar(group, r);
  }

  /** Damage bar across the top of a room group, only once it's been hit. */
  private hpBar(group: Room[], r: Rect): void {
    const hp = group.reduce((s, m) => s + m.hp, 0);
    const max = group.reduce((s, m) => s + ROOMS[m.def].hp, 0);
    if (hp >= max) return;
    bar(this.ctx, r.x + 4, r.y + 2, r.w - 8, 5, hp / max, hp / max > 0.5 ? '#ffd166' : '#ff5d5d');
  }

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

  // ---- Units & effects ------------------------------------------------------------

  private units(game: Game): void {
    const a = game.alpha;
    // Ground units back-to-front by depth so nearer ones overlap farther ones.
    const list = [...game.world.units].sort((u, v) => Number(u.alt > 0) - Number(v.alt > 0) || u.depth - v.depth);
    // Spread each unit back from its sim position by its depth, so units at the same x read as a squad.
    for (const u of list) {
      const spread = u.alt > 0 ? 0 : (u.team === 0 ? -1 : 1) * u.depth * 34;
      this.unit(game, u, laneToWorld(u.px + (u.x - u.px) * a) + spread);
    }
  }

  private unit(game: Game, u: Unit, x: number): void {
    const { ctx } = this;
    const d = UNITS[u.def];
    const dir = u.team === 0 ? 1 : -1;
    const body = TEAM_COLOR[u.team];
    const dark = TEAM_DARK[u.team];
    const fighting = u.target !== null;
    let top: number;
    if (d.air) {
      const y = altToWorld(u.alt) + Math.sin(game.time * 3 + u.id) * 4;
      top = y - 14;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(x, 14, 14, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(x + dir * 18, y);
      ctx.lineTo(x - dir * 14, y - 10);
      ctx.lineTo(x - dir * 8, y);
      ctx.lineTo(x - dir * 14, y + 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = d.color;
      ctx.fillRect(x - 3, y - 2, 6, 4);
    } else {
      const feet = 4 + u.depth * 14;
      const step = fighting ? 0 : Math.sin(game.time * 12 + u.id) * 2;
      if (u.def === 'bruiser') {
        top = feet - 30;
        ctx.fillStyle = dark;
        ctx.fillRect(x - 7, feet - 6, 5, 6 + step);
        ctx.fillRect(x + 2, feet - 6, 5, 6 - step);
        ctx.fillStyle = body;
        ctx.fillRect(x - 11, feet - 26, 22, 20);
        ctx.fillStyle = d.color;
        ctx.fillRect(x + dir * 6, feet - 22, dir * 10, 8);
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.arc(x, feet - 29, 5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        top = feet - 26;
        ctx.fillStyle = dark;
        ctx.fillRect(x - 4, feet - 6, 3, 6 + step);
        ctx.fillRect(x + 1, feet - 6, 3, 6 - step);
        ctx.fillStyle = body;
        ctx.fillRect(x - 5, feet - 18, 10, 12);
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(x, feet - 22, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 2;
        line(ctx, x, feet - 13, x + dir * 11, feet - 14);
      }
    }
    if (u.hp < d.hp) bar(ctx, x - 12, top - 8, 24, 4, u.hp / d.hp, u.hp / d.hp > 0.5 ? '#7ee08a' : '#ff5d5d');
  }

  private effects(game: Game): void {
    const { ctx } = this;
    const w = game.world;
    for (const e of w.effects) {
      const age = Math.max(0, (w.tick - e.tick) / FX_TICKS);
      if (age >= 1) continue;
      if (e.kind === 'shot') {
        const fx = laneToWorld(e.fx), fy = e.falt > 0 ? altToWorld(e.falt) : -14;
        let tx: number, ty: number;
        if (e.room) {
          const r = cellRect(e.room.col, e.room.floor, e.room.w, e.room.team);
          tx = e.room.team === 0 ? r.x + r.w - 8 : r.x + 8;
          ty = r.y + r.h / 2;
        } else {
          tx = laneToWorld(e.tx);
          ty = e.talt > 0 ? altToWorld(e.talt) : -12;
        }
        const t = Math.min(1, age * 3);
        ctx.globalAlpha = 1 - age;
        ctx.strokeStyle = e.team === 0 ? '#bdf0ff' : '#ffc2c2';
        ctx.lineWidth = 2.5;
        line(ctx, fx + (tx - fx) * t * 0.6, fy + (ty - fy) * t * 0.6, fx + (tx - fx) * t, fy + (ty - fy) * t);
        if (t >= 1) {
          ctx.fillStyle = '#fff3c4';
          ctx.beginPath();
          ctx.arc(tx, ty, 6 * (1 - age), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (e.kind === 'destroyed') {
        const r = cellRect(e.col, e.floor, 1, e.team);
        ctx.globalAlpha = 1 - age;
        ctx.fillStyle = '#ffb347';
        ctx.beginPath();
        ctx.arc(r.x + r.w / 2, r.y + r.h / 2, 20 + age * 50, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'died') {
        ctx.globalAlpha = (1 - age) * 0.8;
        ctx.fillStyle = '#ddd';
        ctx.beginPath();
        ctx.arc(laneToWorld(e.x), e.alt > 0 ? altToWorld(e.alt) : -10, 6 + age * 16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---- Interaction feedback ---------------------------------------------------

  private placement(game: Game): void {
    if (!game.placing) return;
    const { ctx } = this;
    const t = game.tower;
    for (let f = 0; f < TOWER.floors; f++) {
      for (let c = 0; c < TOWER.cols; c++) {
        if (placementError(t, game.placing, c, f)) continue;
        const ok = canAfford(t.bank, buildCost(t, game.placing, c, f));
        const r = inset(cellRect(c, f), 4);
        ctx.strokeStyle = ok ? 'rgba(120,255,160,0.55)' : 'rgba(255,200,120,0.4)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.setLineDash([]);
      }
    }
    const h = game.hover;
    if (h) {
      const ok = !placementError(t, game.placing, h.col, h.floor) && canAfford(t.bank, buildCost(t, game.placing, h.col, h.floor));
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
    this.ctx.strokeStyle = '#fff';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(r.x, r.y, r.w, r.h);
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

  /** Screen-space strip showing the whole lane, so you can watch the front while looking at your tower. */
  private laneStrip(game: Game): void {
    const { ctx, cam } = this;
    const availW = cam.width - cam.insets.left - cam.insets.right;
    const w = Math.min(420, availW - 40);
    const x0 = cam.insets.left + (availW - w) / 2;
    const y = cam.height - cam.insets.bottom - 22;
    ctx.fillStyle = 'rgba(10,12,20,0.7)';
    ctx.fillRect(x0 - 14, y - 9, w + 28, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x0, y + 5, w, 2);
    ctx.fillRect(x0 + w / 2 - 1, y - 2, 2, 10);
    // Tower ends.
    ctx.fillStyle = TEAM_COLOR[0];
    ctx.fillRect(x0 - 10, y - 5, 8, 14);
    ctx.fillStyle = TEAM_COLOR[1];
    ctx.fillRect(x0 + w + 2, y - 5, 8, 14);
    for (const u of game.world.units) {
      const ux = x0 + (u.x / LANE.length) * w;
      ctx.fillStyle = TEAM_COLOR[u.team];
      if (UNITS[u.def].air) {
        ctx.beginPath();
        ctx.moveTo(ux, y - 6);
        ctx.lineTo(ux - 3.5, y);
        ctx.lineTo(ux + 3.5, y);
        ctx.fill();
      } else ctx.fillRect(ux - 2, y + (u.def === 'bruiser' ? -1 : 1), u.def === 'bruiser' ? 5 : 3, u.def === 'bruiser' ? 7 : 5);
    }
  }

  private debug(game: Game): void {
    const { ctx, cam } = this;
    const w = game.world;
    const lines = [
      `tick ${w.tick}  t ${w.seconds.toFixed(1)}s  dt ${DT}`,
      `fps ${game.fps.toFixed(0)}  zoom ${cam.zoom.toFixed(2)}`,
      `hash ${game.hash}  seed ${w.options.seed}`,
      `cmds ${w.commandLog.length}  units ${w.units.length}  fx ${w.effects.length}`,
    ];
    ctx.font = '12px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const x = cam.insets.left + 8, y = cam.insets.top + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 4, y - 4, 250, lines.length * 15 + 8);
    ctx.fillStyle = '#9fffb0';
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * 15));
  }

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
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

