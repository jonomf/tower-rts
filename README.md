# Tower RTS

Fallout Shelter tower building meets StarCraft macro. Two towers face each other across one lane.
You build rooms; units train on their own and march on the enemy. Your weapon is the shape of your tower.

**Status: M3, full matches against an AI.** Pick an opponent (Rusher, Expander, or a practice dummy) and a difficulty,
build your tower, and destroy the enemy Core before yours falls. Overtime at 5:00 ends every match by 7:30.
See [`.plan`](.plan) for the roadmap (next: the Expedition pivot, designed in [`docs/expedition.md`](docs/expedition.md)) and [`DESIGN.md`](DESIGN.md) for the rules as built.

**Play:** https://jonomf.github.io/tower-rts/ (deployed by GitHub Actions on every push to `main`)

## Run

Needs Node ≥ 22.18 (it runs the TypeScript sources directly). The only dependency is `typescript`.

```sh
npm install
npm run dev        # http://localhost:5173 (tsc --watch; reload to see changes)
npm test           # simulation tests (node:test)
npm run typecheck
npm run build      # dist/
npm run match -- --all   # headless AI-vs-AI win rates and match lengths
```

## Controls

| | Touch | Mouse / keys |
|---|---|---|
| Build | tap a room in the palette, then a highlighted cell | click, or `1`–`6` |
| Pick / pause a unit | tap a Barracks or Hangar → panel | same |
| Camera preset | ⌖ (your tower → whole field → enemy) | `F` |
| Collect / select | tap a room | click |
| Pan / zoom | drag / pinch | drag or trackpad swipe / wheel or pinch |
| Cancel | ✕ | `Esc`, right-click |
| Demolish | room panel | `Del` |
| Time | ❚❚ and 1× buttons | `Space`, `−` / `+` |
| Debug | | `` ` `` |

## How it's built

- `src/sim/` is a pure, deterministic simulation: 20 Hz fixed tick, seeded RNG, every change through `world.issue(command)`.
  The same commands on the same ticks give the same `hash()`, which is the basis for replays, headless balance runs and lockstep multiplayer later.
- `src/render/` draws a Canvas 2D side view. `src/ui/` is a DOM HUD. Neither touches sim state.
- No bundler: `tsc` emits native ES modules into `dist/js`.

Notes: [[Fallout Shelter + RTS game (jam) idea]] (jono-obs). Sibling project: [auto-rts-vibes](https://github.com/jonomf/auto-rts-vibes).
