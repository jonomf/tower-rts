import type { Rect } from './layout.ts';

export type Insets = { top: number; right: number; bottom: number; left: number };

/** 2D camera: (x, y) is the world point at the centre of the visible area. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  /** CSS pixels of the canvas. */
  width = 1;
  height = 1;
  insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  minZoom = 0.2;
  maxZoom = 3;

  private get cx(): number {
    return this.insets.left + (this.width - this.insets.left - this.insets.right) / 2;
  }
  private get cy(): number {
    return this.insets.top + (this.height - this.insets.top - this.insets.bottom) / 2;
  }

  toScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x) * this.zoom + this.cx, (wy - this.y) * this.zoom + this.cy];
  }

  toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.cx) / this.zoom + this.x, (sy - this.cy) / this.zoom + this.y];
  }

  /** Fit a world rect into the area inside the insets. */
  fit(r: Rect): void {
    const aw = Math.max(1, this.width - this.insets.left - this.insets.right);
    const ah = Math.max(1, this.height - this.insets.top - this.insets.bottom);
    this.zoom = clamp(Math.min(aw / r.w, ah / r.h), this.minZoom, this.maxZoom);
    this.x = r.x + r.w / 2;
    this.y = r.y + r.h / 2;
  }

  panBy(dsx: number, dsy: number): void {
    this.x -= dsx / this.zoom;
    this.y -= dsy / this.zoom;
  }

  /** Zoom by a factor, keeping the world point under (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.toWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const [nx, ny] = this.toWorld(sx, sy);
    this.x += wx - nx;
    this.y += wy - ny;
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
