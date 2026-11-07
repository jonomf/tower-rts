import { Game } from './game.ts';
import { Camera } from './render/camera.ts';
import { Renderer } from './render/renderer.ts';
import { ENEMY_X0, FIELD_W, FRAME, TOWER_H, TOWER_W } from './render/layout.ts';
import { attachInput } from './input/input.ts';
import { Hud } from './ui/hud.ts';

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const game = new Game();
const cam = new Camera();
const renderer = new Renderer(canvas, cam);
const hud = new Hud(game);

/** Until the player moves the camera, keep the tower framed on resize/rotate. */
let userMovedCamera = false;

function measureInsets(): void {
  const top = document.querySelector('#topbar')!.getBoundingClientRect();
  const pal = document.querySelector('#palette')!.getBoundingClientRect();
  const side = pal.height > pal.width; // vertical palette on short landscape screens
  cam.insets = {
    top: top.bottom,
    right: side ? cam.width - pal.left : 0,
    bottom: side ? 0 : cam.height - pal.top,
    left: 0,
  };
}

/** Camera presets, cycled by ⌖ / F: your tower (+ a peek down the lane), the whole field, the enemy tower. */
const VIEWS = ['tower', 'field', 'enemy'] as const;
let view = 0;

function frameView(): void {
  const pad = 30;
  const top = -TOWER_H - FRAME * 3 - 50 - pad; // include the roof flag
  const h = -top + 30 + pad;
  const portrait = cam.height > cam.width;
  const peek = portrait ? 0 : 200;
  switch (VIEWS[view]) {
    case 'tower':
      return cam.fit({ x: -FRAME - pad, y: top, w: TOWER_W + FRAME * 2 + pad * 2 + peek, h });
    case 'field':
      return cam.fit({ x: -FRAME - pad, y: top, w: FIELD_W + FRAME * 2 + pad * 2, h });
    case 'enemy':
      return cam.fit({ x: ENEMY_X0 - FRAME - pad - peek, y: top, w: TOWER_W + FRAME * 2 + pad * 2 + peek, h });
  }
}

function cycleView(): void {
  userMovedCamera = false;
  view = (view + 1) % VIEWS.length;
  frameView();
  game.notify(`View: ${VIEWS[view] === 'tower' ? 'your tower' : VIEWS[view] === 'field' ? 'whole field' : 'enemy tower'}`);
}

function onResize(): void {
  renderer.resize();
  measureInsets();
  if (!userMovedCamera) frameView();
}

attachInput(canvas, game, cam, () => (userMovedCamera = true));
window.addEventListener('resize', onResize);
document.querySelector('#recenter')!.addEventListener('click', cycleView);
window.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') cycleView();
});
onResize();
const touchPortrait = matchMedia('(pointer: coarse) and (orientation: portrait)').matches;
game.notify(touchPortrait ? 'Tip: turn your phone sideways' : 'Build Mines, then a Barracks. Units march on their own.');

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
Object.assign(window as unknown as Record<string, unknown>, { game, cam });
