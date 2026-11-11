/**
 * Pointer + keyboard → game verbs and camera moves.
 * One finger / mouse: tap = act on a cell, drag = pan. Two fingers: pinch zoom + pan.
 * Wheel: Ctrl/pinch-gesture zooms, trackpad swipe pans, mouse wheel zooms.
 */
import { PALETTE } from '../sim/defs.ts';
import type { Game } from '../game.ts';
import type { Camera } from '../render/camera.ts';
import { cellAt } from '../render/layout.ts';

const TAP_SLOP = 10; // px a press may move and still count as a tap

type P = { x: number; y: number; sx: number; sy: number };

/**
 * `onScreenTap` gets first look at a tap in screen coordinates (e.g. the sector strip) and returns true if it used it.
 */
export function attachInput(
  canvas: HTMLCanvasElement,
  game: Game,
  cam: Camera,
  onUserCamera: () => void,
  onScreenTap: (sx: number, sy: number) => boolean = () => false,
): void {
  const pointers = new Map<number, P>();
  let dragged = false;
  let pinchDist = 0;

  const local = (e: PointerEvent | WheelEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const cellUnder = (sx: number, sy: number) => {
    const [wx, wy] = cam.toWorld(sx, sy);
    return cellAt(game.tower, wx, wy);
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = local(e);
    pointers.set(e.pointerId, { x, y, sx: x, sy: y });
    if (pointers.size === 1) dragged = false;
    if (pointers.size === 2) {
      dragged = true;
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    if (e.pointerType === 'mouse') game.hover = cellUnder(x, y);
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (pointers.size === 1) {
      if (!dragged && Math.hypot(x - p.sx, y - p.sy) > TAP_SLOP) dragged = true;
      if (dragged) {
        cam.panBy(x - p.x, y - p.y);
        onUserCamera();
      }
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const midBefore = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      p.x = x;
      p.y = y;
      const midAfter = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      cam.panBy(midAfter[0] - midBefore[0], midAfter[1] - midBefore[1]);
      if (pinchDist > 0) cam.zoomAt(midAfter[0], midAfter[1], d / pinchDist);
      pinchDist = d;
      onUserCamera();
      return;
    }
    p.x = x;
    p.y = y;
  });

  const end = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (!p) return;
    if (pointers.size === 0 && !dragged && e.type === 'pointerup' && e.button !== 2) {
      const [x, y] = local(e);
      if (onScreenTap(x, y)) return;
      const cell = cellUnder(x, y);
      if (e.pointerType !== 'mouse') game.hover = cell;
      game.tap(cell);
    }
    if (pointers.size < 2) pinchDist = 0;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') game.hover = null;
  });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    game.cancelMode();
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const [x, y] = local(e);
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dx = e.deltaX * scale, dy = e.deltaY * scale;
      const trackpadSwipe = !e.ctrlKey && e.deltaMode === 0 && (dx !== 0 || Math.abs(dy) < 40);
      if (trackpadSwipe) cam.panBy(-dx, -dy);
      else cam.zoomAt(x, y, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)));
      onUserCamera();
    },
    { passive: false },
  );

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const k = e.key;
    if (k === ' ') {
      e.preventDefault();
      game.togglePause();
    } else if (k === 'Escape') game.cancelMode();
    else if (k === '-' || k === '_') game.cycleSpeed(-1);
    else if (k === '=' || k === '+') game.cycleSpeed(1);
    else if (k === '`') game.debug = !game.debug;
    else if (k >= '1' && k <= String(PALETTE.length)) game.togglePlacing(PALETTE[Number(k) - 1]);
    else if ((k === 'Delete' || k === 'Backspace') && game.selected) game.demolishOrCancel(game.selected);
  });
}
