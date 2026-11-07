import { Game } from './game.ts';
import { Camera } from './render/camera.ts';
import { Renderer } from './render/renderer.ts';
import { FRAME, LANE_LEN, TOWER_H, TOWER_W } from './render/layout.ts';
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

function frameTower(): void {
  // Tower plus a peek down the lane.
  // Portrait screens are narrow, so drop the lane peek there.
  const pad = 30;
  const portrait = cam.height > cam.width;
  const lane = portrait ? 0 : Math.min(LANE_LEN, 160);
  cam.fit({ x: -FRAME - pad, y: -TOWER_H - FRAME * 3 - pad, w: TOWER_W + FRAME * 2 + pad * 2 + lane, h: TOWER_H + FRAME * 3 + pad * 2 + 20 });
}

function onResize(): void {
  renderer.resize();
  measureInsets();
  if (!userMovedCamera) frameTower();
}

attachInput(canvas, game, cam, () => (userMovedCamera = true));
window.addEventListener('resize', onResize);
document.querySelector('#recenter')!.addEventListener('click', () => {
  userMovedCamera = false;
  frameTower();
});
onResize();
const touchPortrait = matchMedia('(pointer: coarse) and (orientation: portrait)').matches;
game.notify(touchPortrait ? 'Tip: turn your phone sideways' : 'Build Mines, then tap them to collect.');

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
