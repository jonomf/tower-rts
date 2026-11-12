# Working notes for Claude (tower-rts)

Read `.plan` first (v2, the Expedition pivot), then `docs/expedition.md` (the pivot's design) and `DESIGN.md` (rules as built).
Work the next unchecked items in order, tick them in the same commit as the code, and add a line to the Log.
Change numbers in the design doc and in `src/sim/defs.ts` together.

## How to work on this repo (read this if you are picking it up cold)
- One checkbox at a time. For each: write or update the test first, make it pass, run the full pre-commit line, commit, push.
  Small commits. Never batch a whole phase into one commit.
- Do not redesign. The plan's decisions (E1–E6) are settled unless Jono changes them. If something in the plan is
  impossible or contradictory, stop, write the problem under "Open questions" in `.plan`, and ask Jono.
- Refactors (P1 especially) must keep every existing test passing. Update tests mechanically; never delete one to get green.
  If a test's expectation has to change, say why in the commit message.
- Balance with data, not guesses: change a number, run `npm run match`, paste the before/after line into the commit message.
- Everything lives in this repo and on GitHub. Do not write to Jono's local folders.
- Pushing to `main` deploys to https://jonomf.github.io/tower-rts/ in about 2 minutes. After a push, open the page in the
  built-in browser and check the build id in the help sheet (`?`) and that there are no console errors. The `gh` CLI has no
  valid token here; a push (or an empty commit) is how you redeploy.
- If `node_modules/.bin/tsc` or `node_modules/@types/node` is missing at the start of a session, recreate the symlinks:
  `mkdir -p node_modules/.bin node_modules/@types && ln -sf /opt/npm-tools/node_modules/typescript node_modules/typescript &&
  ln -sf ../typescript/bin/tsc node_modules/.bin/tsc && ln -sf /opt/npm-tools/node_modules/@types/node node_modules/@types/node`
- Tell Jono plainly what the numbers say, including when they say the design has a problem (see the M3 findings in `docs/plan-v1.md`).

## Save games
The current match autosaves to localStorage (`src/ui/save.ts`; key `tower-rts.save`) every 5 s and when the page is
hidden or closed; the menu offers Continue. A save is `World.snapshot()` + `AiController.snapshot()`.
**Whenever you change the shape of sim state** (fields on Tower, Room, Unit, WorldMap, Site, WorldOptions, AI controller
state), bump `SAVE_VERSION` in `src/sim/world.ts` so old saves are dropped instead of misread, and keep
`tests/save.test.ts` passing (a restored game must continue with the same hash).

## Lessons already paid for
- The HUD must not rebuild interactive DOM on a timer. Rebuild on a structural key; update text separately (`Hud.setLines`).
- Unit logic must read start-of-tick positions (`px`) and apply damage after the loop, or one team gets the first shot.
- A stream of units that arrives one at a time loses to anything that kills one unit at a time (this killed a "Core gun"
  experiment). If you add static defenses, check with `npm run match` that attackers can still win.
- Continuous production starves expansion: 3 merged Mines pay for exactly one Barracks of Troopers. AI scripts need
  `{ train: seconds }` gaps or `saves: false`; see `src/ai/scripts.ts`.
- GitHub Pages lets browsers cache files for 10 minutes. `npm run build` therefore emits the modules into `dist/js-<build>/`
  so a new index.html never runs stale scripts. (Dev still uses `dist/js/`.) When checking a deploy, look at the build id
  in the help sheet *and* that the new behaviour is there. Actions runs can also sit queued for 20+ minutes; check
  `curl -s https://api.github.com/repos/jonomf/tower-rts/actions/runs?per_page=3` before assuming a push failed.
- In Playwright, the game-over and menu overlays intercept clicks: check `game.world.winner` and `game.started` first.
  Fast-forward with `game.tick()`, tapping producers once a second, to play like a person.

## Commands
- `npm run dev`: tsc --watch + static server at http://localhost:5173 (reload by hand, no HMR)
- `npm test`: `node --test` on `tests/**/*.test.ts` (Node ≥22.18 runs .ts directly)
- `npm run typecheck`: browser tsconfig + node tsconfig (tests, tools, sim)
- `npm run build`: tsc → `dist/js-<build id>/` (cache-busting), copies `public/` → `dist/`
- `npm run match -- [--a rush] [--b boom] [--la sharp] [--lb sharp] [--n 50] [--all]`: headless AI vs AI (win rates, lengths)

Before every commit: `npm run typecheck && npm test && npm run build`. Never push red.

## Zero-dependency rule
The only devDeps are `typescript` and `@types/node`. Claude's workspace can't `npm install`; there,
`node_modules` is symlinked from /opt/npm-tools (typescript 6.0.3, @types/node 26.6.3). Pin those exact versions.
Because Node runs the sources directly, use erasable syntax only: no enums, namespaces, or constructor parameter
properties, and relative imports keep their `.ts` extension (tsc rewrites them to .js for the browser).

## Architecture rules
- `src/sim/` is pure TS: no DOM, no `Math.random` (use the World's seeded RNG), no `Date.now`. It is deterministic.
- All state changes go through `world.issue(command)`, whether they come from the player, the AI, or (later) the network.
  The AI is just another command source.
- Fixed 20 Hz tick. Rendering interpolates and never mutates sim state.
- Data over code: rooms, units and AI scripts are catalog entries/JSON, not subclasses.
- Generic names only (no StarCraft/Fallout names in code or UI).
- No runtime dependencies.

## Layout
```
src/sim/        defs.ts (all numbers: rooms, units, lane), types.ts (Team 0/1/2, hostile(), opponent()),
                world.ts (towers list, addTower, tower(team), towerById, tick, issue, hash, replay, spawnUnit,
                damageRoom, supplyUsed), rng.ts, commands.ts (optional `tower` id on every command), tower.ts
                (grid, support, merge, supply, rubble cost, faceOf, exitSide, defaultDeploy), scenario.ts (dummy),
                map.ts (Expedition sectors: sectorOf, sectorCenter, generateMap), systems/{economy,production,
                units (orders: garrison/march; towerAhead, frontRoom), explore (fog, sites, caches, visibleSectors)}.ts
src/ai/         types.ts (script format), scripts.ts (the scripts, as data), controller.ts (AiController, pickCell,
                stepWithAi). The controller is outside the World and acts only through world.issue()
src/game.ts     client state: match config + AIs, tick(), time control, selection, placing, floaters, toasts
src/render/     layout.ts (cell ↔ world), camera.ts, renderer.ts (Canvas 2D)
src/input/      pointer + keys → game verbs / camera
src/ui/         hud.ts (DOM: top bar, palette, the permanent room panel / tower summary, menu, game over)
public/         index.html, style.css, icon.svg (copied into dist/)
tools/          build.ts, dev.ts, serve.ts, match.ts
tests/          node:test, one file per system
```
Coordinates: one world axis in cells. A tower spans `[x, x + TOWER.cols)`; columns are world-oriented (no mirroring);
`front` is its lane side. Units have `x` on the same axis, `dir`, and `home` (tower id, for supply). Rendering is
`x * CELL_W` everywhere (`src/render/layout.ts`).

`window.game`, `window.cam` and `window.renderer` (its `strip` rect, for strip taps) are exposed for the console and
for screenshot scripts. Start Expedition in Playwright by clicking `#modes button` "Expedition" before `#start`. Fast-forward with `game.tick()`
(not `world.step()`, which skips the AI).

## Port from docs/auto-rts (copy, then adapt)
World/tick/hash/command log · combat (Attack type, air/ground flags, cooldown) · separation · camera + trackpad/pinch · Pages workflow · vite `base: './'`.

## Verifying UI work
After UI changes: `npm run build`, serve `dist/`, and drive it with Playwright (installed in /opt/npm-tools, browsers in
/opt/pw-browsers) at 1366×800, 844×390 (phone landscape, touch) and 390×844. Tap real cells via `cam.toScreen`, and
check for console errors. Look at every screenshot.

## Gates
P3 ends with a feel test by Jono. Don't start P4 until he has answered it in `.plan`. Don't start P5 unasked.
