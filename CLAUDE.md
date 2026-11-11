# Working notes for Claude (tower-rts)

Read `.plan` first. Work the next unchecked items in order, tick them in the same commit as the code, and add a line to the Log.
`DESIGN.md` holds the rules and numbers. Change the numbers there and in `src/sim/defs.ts` together.

## Commands
- `npm run dev`: tsc --watch + static server at http://localhost:5173 (reload by hand, no HMR)
- `npm test`: `node --test` on `tests/**/*.test.ts` (Node ≥22.18 runs .ts directly)
- `npm run typecheck`: browser tsconfig + node tsconfig (tests, tools, sim)
- `npm run build`: tsc → `dist/js`, copies `public/` → `dist/`
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
src/sim/        defs.ts (all numbers: rooms, units, lane), types.ts, world.ts (tick, issue, hash, replay,
                spawnUnit, damageRoom, supplyUsed), rng.ts, commands.ts, tower.ts (grid, support, merge, supply,
                rubble cost), scenario.ts (dummy enemy), systems/{economy,production,units}.ts
src/ai/         types.ts (script format), scripts.ts (the scripts, as data), controller.ts (AiController, pickCell,
                stepWithAi). The controller is outside the World and acts only through world.issue()
src/game.ts     client state: match config + AIs, tick(), time control, selection, placing, floaters, toasts
src/render/     layout.ts (cell ↔ world), camera.ts, renderer.ts (Canvas 2D)
src/input/      pointer + keys → game verbs / camera
src/ui/         hud.ts (DOM)
public/         index.html, style.css, icon.svg (copied into dist/)
tools/          build.ts, dev.ts, serve.ts, match.ts
tests/          node:test, one file per system
```
`window.game` and `window.cam` are exposed for the console and for screenshot scripts. Fast-forward with `game.tick()`
(not `world.step()`, which skips the AI).

## Port from docs/auto-rts (copy, then adapt)
World/tick/hash/command log · combat (Attack type, air/ground flags, cooldown) · separation · camera + trackpad/pinch · Pages workflow · vite `base: './'`.

## Verifying UI work
After UI changes: `npm run build`, serve `dist/`, and drive it with Playwright (installed in /opt/npm-tools, browsers in
/opt/pw-browsers) at 1366×800, 844×390 (phone landscape, touch) and 390×844. Tap real cells via `cam.toScreen`, and
check for console errors. Look at every screenshot.

## Gates
M3 ends with a feel test by Jono. Don't start M4 until he has answered it in `.plan`.
