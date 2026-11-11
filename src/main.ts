import { Game } from './game.ts';
import { Camera } from './render/camera.ts';
import { Renderer } from './render/renderer.ts';
import { CELL_W, FRAME, TOWER_H, TOWER_W, fieldBounds } from './render/layout.ts';
import { MAP } from './sim/defs.ts';
import { mapSpan, sectorCenter } from './sim/map.ts';
import { attachInput } from './input/input.ts';
import { Hud } from './ui/hud.ts';

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const game = new Game();
const cam = new Camera();
const renderer = new Renderer(canvas, cam);
const hud = new Hud(game);

/** Until the player moves the camera, keep the tower framed on resize/rotate. */
let userMovedCamera = false;

/**
 * Camera insets: the parts of the screen covered by the top bar, the build palette and the room panel.
 * The panel's place depends on the layout (see style.css): a right column on desktop, a left column on
 * landscape phones, a strip above the palette on portrait screens. Its position comes from CSS variables set here.
 */
function measureInsets(): void {
  const root = document.documentElement.style;
  const top = document.querySelector('#topbar')!.getBoundingClientRect();
  root.setProperty('--top-h', `${top.bottom}px`);
  const pal = document.querySelector('#palette')!.getBoundingClientRect();
  const side = pal.height > pal.width; // vertical palette on short landscape screens
  root.setProperty('--pal-h', side ? '0px' : `${Math.max(0, cam.height - pal.top)}px`);
  const panel = document.querySelector('#panel')!.getBoundingClientRect();
  const strip = panel.width >= cam.width - 1;
  const onLeft = !strip && panel.left < cam.width / 2;
  cam.insets = {
    top: top.bottom,
    right: side ? cam.width - pal.left : !strip && !onLeft ? cam.width - panel.left : 0,
    bottom: strip ? cam.height - panel.top : side ? 0 : cam.height - pal.top,
    left: onLeft ? panel.right : 0,
  };
}

/** Camera presets, cycled by ⌖ / F: your tower (+ a peek toward its front), the whole field, then each other tower. */
let view = 0;
const viewCount = () => game.world.towers.length + 1;

function frameView(): void {
  // Keep the strip overlay (lane or sector strip, drawn at the bottom of the free area) off the tower.
  cam.fitReserveBottom = game.started ? (game.world.map ? 44 : 30) : 0;
  const pad = 30;
  const top = -TOWER_H - FRAME * 3 - 50 - pad; // include the roof flag
  const h = -top + 30 + pad;
  const portrait = cam.height > cam.width;
  const peek = portrait ? 0 : 200;
  const frameTower = (t: (typeof game.world.towers)[number]) => {
    const x = t.x * CELL_W;
    const left = t.front === 'left' ? peek : 0;
    const right = t.front === 'left' ? 0 : peek;
    cam.fit({ x: x - FRAME - pad - left, y: top, w: TOWER_W + FRAME * 2 + pad * 2 + left + right, h });
  };
  if (view === 0) return frameTower(game.tower);
  if (view === 1) {
    const m = game.world.map;
    const b = m ? { x0: mapSpan(m).x0 * CELL_W, x1: mapSpan(m).x1 * CELL_W } : fieldBounds(game.world.towers);
    return cam.fit({ x: b.x0 - FRAME - pad, y: top, w: b.x1 - b.x0 + FRAME * 2 + pad * 2, h });
  }
  const others = game.world.towers.filter((t) => t !== game.tower);
  if (!others.length) return frameTower(game.tower);
  frameTower(others[(view - 2) % others.length]);
}

/** Look at one Expedition sector (from a tap on the sector strip). */
function frameSector(s: number): void {
  const pad = 30;
  const top = -TOWER_H - FRAME * 3 - 50 - pad;
  const h = -top + 30 + pad;
  userMovedCamera = true;
  cam.fit({ x: (sectorCenter(s) - MAP.sector / 2) * CELL_W, y: top, w: MAP.sector * CELL_W, h });
}

function stripTap(sx: number, sy: number): boolean {
  const st = renderer.strip;
  if (!st || sx < st.x || sx > st.x + st.w || sy < st.y - 6 || sy > st.y + st.h + 6) return false;
  const n = st.s1 - st.s0 + 1;
  const s = st.s0 + Math.min(n - 1, Math.max(0, Math.floor(((sx - st.x) / st.w) * n)));
  frameSector(s);
  return true;
}

function cycleView(): void {
  userMovedCamera = false;
  view = (view + 1) % viewCount();
  frameView();
  game.notify(`View: ${view === 0 ? 'your tower' : view === 1 ? 'whole field' : 'enemy tower'}`);
}

function onResize(): void {
  renderer.resize();
  measureInsets();
  if (!userMovedCamera) frameView();
}

attachInput(canvas, game, cam, () => (userMovedCamera = true), stripTap);
game.onStart = () => {
  view = 0;
  userMovedCamera = false;
  frameView();
};
window.addEventListener('resize', onResize);
document.querySelector('#recenter')!.addEventListener('click', cycleView);
window.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') cycleView();
});
onResize();

let last = performance.now();
function loop(now: number): void {
  game.frame((now - last) / 1000);
  last = now;
  renderer.draw(game);
  hud.update();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Handy from the devtools console.
Object.assign(window as unknown as Record<string, unknown>, { game, cam, renderer });
