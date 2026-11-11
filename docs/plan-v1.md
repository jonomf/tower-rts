# Tower RTS: development plan

Working title "tower-rts" (rename freely; avoid "Fallout"/"Vault" in public names).
Fallout Shelter tower building + StarCraft macro. Two towers face each other across one lane.
You build rooms; units train automatically and march on the enemy tower. You win by adapting the tower to what the enemy fields.
Source notes: [[Fallout Shelter + RTS game (jam) idea]], [[Auto-Starcraft]] (jono-obs).
Prior art: docs/one-day-projects/2025-4-30 - FalloutShelter+AutoRTS (Godot MVP, reference only), docs/auto-rts (stack + sim patterns).

Claude writes all the code. Milestones are scope gates, not time estimates.
Every milestone ends with: tests green, build green, pushed, live on GitHub Pages, and a short "try this" note for Jono.

---

## Decisions (proposed defaults; Jono can overturn any of them)
- [x] D1 Stack: TypeScript + Canvas 2D + GitHub Pages, **zero dependencies beyond `typescript`** (revised 2026-11-06).
      No Vite/Vitest: Claude's workspace can't install packages, so the build is plain `tsc` (native ES modules, no bundler)
      and tests use Node's built-in runner (`node --test`, Node ≥22.18 runs .ts directly). Claude can run, test and screenshot everything.
      Mobile = the web page on a phone (landscape, touch-first). PWA install in M5. Native wrapper only if ever needed.
- [x] D2 New repo (github.com/jonomf/tower-rts), not a mode inside auto-rts. Copy the proven pieces (fixed-tick World, Command pipe, defs catalog, combat, separation, camera, Pages workflow) and don't share them as a package.
- [x] D3 Deterministic sim from day one (20 Hz fixed tick, seeded RNG, every change goes through `issue(command)`). That buys replays, headless AI-vs-AI balance runs, and lockstep multiplayer later.
- [x] D4 Generic names (Trooper, Flyer...), not Terran names. Same rule as auto-rts.
- [x] D5 One bank per tower (the tower is the stockpile). This differs from auto-rts's per-building stock on purpose: it's one building.
- [x] D6 Side-view cross-section, landscape: your tower on the left, the lane in the middle, enemy tower on the right. Pinch/drag camera.
- [x] D7 Target match length: 5–8 minutes. Currently 2–5 min, hard cap 7:30 via overtime (revisit after the feel test).

## Open questions for Jono (Claude proceeds on the default in brackets until told otherwise)
- Q1 Micro dial: FS-style tap-to-collect on resource rooms, with slower auto-collect when you don't tap? [yes, both, and a setting]
- Q2 Crew/dwellers assigned to rooms (the most "Fallout Shelter" mechanic)? [not in MVP; candidate for M4+ if the feel test says it's too thin]
- Q3 Room merging: adjacent same-type rooms merge up to 3 wide for an efficiency bonus? [yes]
- Q4 Can you aim your army (hold at home / push) or is it purely automatic? [one hold/push lever per tower, added in M4]
- Q5 ~~Repo~~ done: github.com/jonomf/tower-rts. Jono: Settings → Pages → Source "GitHub Actions" (one-time).
- Q7 Auto-repeat production spends every mineral as soon as it can, so a second Barracks is hard to save for unless you
  pause the first. Options: keep (pausing is a decision), a per-room "keep a reserve" toggle, or only train when bank ≥ 2× unit cost.
  [keep for now; revisit at the M3 feel test]
- Q6 Tapping currently earns ~2.5× an untapped tower (`npm run match`). Is that the right size for the micro dial? [keep for now; revisit at the M3 feel test]

---

## M0: scaffold ✅
- [x] repo: TS strict, `npm run dev | test | build | typecheck | match`; Pages workflow (typecheck → test → build → deploy)
- [x] `src/sim/`: World (towers, tick, seconds), seeded RNG, Command type + `issue()`, command log + `replay()`, `hash()`
- [x] `src/render/`: canvas, camera (pan/zoom, mouse + touch + trackpad), debug overlay (tick, fps, hash; `` ` `` key / # button)
- [x] `tools/match.ts`: headless runner (M1: scripted economy openings, tap vs no-tap)
- [x] tests: same seed + same commands → same hash; replay reproduces it; rejected commands aren't logged
- Exit: live page on Pages; tests green

## M1: one tower, economy only (no enemy) ✅
- [x] tower grid: 6 columns × 8 floors. Core (2 wide) pre-built at the back of floor 0; trickles 1 mineral/s
      (lane door dropped for now: units can just exit floor 0 in M2)
- [x] support rule: a room needs floor 0 or a room below it (unfinished rooms count)
- [x] build room: cost up front + build time, construction progress, cancel = full refund. Demolish = 50% refund (+ its buffer).
      Neither may leave a room floating
- [x] rooms: Mine (minerals), Refinery (gas), Quarters (+supply), Wall (armor, for M2)
- [x] merge: adjacent built same-type rooms on a floor merge up to 3 wide (×2.2 / ×3.6 output; Quarters supply too)
- [x] collect: rooms fill a buffer (30 s cap) with an FS-style bubble; tap collects the whole merged group; 40% auto-collect
      (`autoCollectRate` world option is the micro dial)
- [x] HUD: bank, supply, clock, pause/speed, build palette (bottom; right-hand column on landscape phones), room panel, toasts, help
- [x] touch + mouse: tap = act, drag = pan, pinch/wheel = zoom; keys 1–4, Esc, Space, −/+, Del
- [x] tests: production rates, merge groups + bonus, support rule, refunds, supply, buffer cap, auto-collect
- Exit: build a working economy on a phone (verified in headless Chromium at 1366×800, 844×390 and 390×844)

## M2: units and the lane ✅
- [x] production rooms: Barracks (Trooper / Bruiser), Hangar (Flyer, floor 4+). Each room keeps training its picked unit
      on repeat (paid at start; needs bank + supply); pick or pause in the room panel; switching/pausing refunds the job.
      (Changed from "queue of 5": with auto-repeat a queue added nothing.)
- [x] units leave the tower (ground from floor 0, air from the Hangar's floor), march the 16-cell lane, auto-acquire targets in range
- [x] combat: hp, range, cooldown, air/ground flags; the nearest hittable enemy in range wins; ground-only units walk under flyers.
      No separation physics (the lane is 1-D); units fan out when drawn
- [x] tower damage model: frontmost (lane-side) column first, then the lowest floor, among reachable floors
      (ground: floors 1–2; air: any). Destroyed room → rubble (still supports, never targeted, rebuild at 50%). Core destroyed = loss, sim freezes
- [x] static enemy dummy tower (17 rooms + Core, no production); ⌖ / F cycles camera: your tower → whole field → enemy
- [x] client: mirrored enemy tower, unit sprites + hp bars, shot / death / destruction effects, room damage bars,
      production status on rooms, game-over screen with Play again
- [x] tests (12 new, 31 total): training + supply + refunds, Hangar floor rule, marching/stopping, unit fights,
      air vs ground, frontRoom rule, rubble, Core loss + freeze, determinism with combat, and the exit test below
- Exit: you can raze a dummy tower with units you produced. Scripted 2-mine → Barracks opening (tapping): razed at 2:36

## M3: full match vs AI ✅ (built; waiting on Jono's feel test)
- [x] enemy tower run by AI v0. AI = data (`src/ai/scripts.ts`): an ordered build list with `{ train: seconds }` gaps,
      plus standing rules (`supplyCapped`, `bankOver`), rebuild-on-rubble, and a `saves` flag. The controller lives outside
      the World and only calls `world.issue()`, so a match replays from its command log with no AI attached
- [x] 2 AI scripts: "Rusher" (3 Mines → 1 Barracks, never stops training) and "Expander" (same start, then pauses in
      short bursts for a second Mine trio and more Barracks). 2 levels: Relaxed (never taps: 40% economy) and Sharp (taps)
- [x] game flow: start menu (opponent + difficulty, remembered) → match → victory/defeat → rematch or change opponent;
      "under attack" alert; lane strip showing every unit; overtime clock turns red
- [x] overtime (new): from 5:00 both Cores burn 10 hp/s, so every match ends by 7:30 and whoever hurt the other more wins
- [x] production fairness (new): rooms are served oldest first and a room waiting on resources holds its price back,
      so Troopers can't starve a Bruiser/Flyer room forever. Unit damage is now simultaneous (no first-shot bias by team)
- [x] `npm run match -- --all`: AI vs AI win rates and lengths
- [x] tests (7 new, 38 total): cell picking, each script beats a passive tower, production hold-back, overtime,
      all four pairings end with a winner under 12 min, replay-without-AI reproduces the hash, Sharp beats Relaxed
- Exit: **Jono plays a few matches on phone and desktop, then answers below.**

### What the headless matches say (40 games each, Sharp vs Sharp unless noted)
- Expander beats Rusher 34–6 to 38–2, in about 3:50. Expander mirror: 22–18, avg 4:24. Any Sharp beats any Relaxed in ~2:10.
- Rusher mirror: a perfect stalemate. One Trooper each dies at midfield forever and overtime decides it at 7:30.
- There is one dominant opening: 3 merged Mines (8.2 minerals/s) pay for exactly one Barracks of nonstop Troopers (8.3/s).
  Anything slower to its first Barracks dies around 2:10–2:30. After that the only winning move found is growing the economy in bursts.
- Tech does not pay yet: every Bruiser- or Flyer-based script I tried lost to plain Troopers. So there is nothing to counter with,
  which is the "too simplified" worry in concrete form. M4 (counters, defenses, hold/push) is aimed squarely at this.

### Feel test (Jono fills in; M4 does not start until this is answered)
- [ ] Played: Rusher/Relaxed, Rusher/Sharp, Expander/Sharp, on phone and desktop
- [ ] Engaging, or too simplified? What were you actually deciding minute to minute?
- [ ] Q6 tapping (2.5× income): fun pressure or a chore?
- [ ] Q7 a Barracks spends everything: is pausing it to save up a good decision or an annoyance?
- [ ] Match length (most end 2–5 min; cap 7:30) and overtime: right?
- [ ] Which lever first for M4: counters/tech that pays, defense rooms, waves (units leave in groups), hold/push, crew (Q2)?

## M4: strategic depth (the actual game)
- [ ] roster with counters, starting set:
      Trooper (ground, hits G+A weakly) · Bruiser (ground, anti-armor, G only) · Siege Walker (slow, big room damage)
      Flyer (air, hits G) · Interceptor (air, hits A only)
- [ ] defense rooms on the lane face: Gun Nest (anti-ground), Flak (anti-air). The note's example: enemy goes air-to-ground → you build Flak/Interceptors
- [ ] research rooms: unlock tier-2 units and +damage/+armor upgrades per branch
- [ ] scouting info: an enemy composition readout (what's coming, what they're teching)
- [ ] hold/push lever (Q4)
- [ ] AI v1: reads your composition and counter-builds; 3 difficulties
- [ ] balance via headless sweeps: every AI script vs every other, N=200 each; no strategy over 65% win rate; easy < medium < hard
- [ ] tests: counter table holds in isolated 1v1 unit fights
- Exit: matches with real decisions; a balance report in `docs/balance.md`

## M5: mobile polish
- [ ] touch UX pass: hit sizes, long-press info, landscape lock or responsive layout
- [ ] PWA: manifest, offline, install
- [ ] art pass: FS-style cross-section rooms with little animated occupants; procedural/vector, no external assets needed
- [ ] audio + juice: hits, room destroyed, wave incoming
- [ ] first-match onboarding (scripted easy AI plus 3 hints, no tutorial screens)
- Exit: feels like a phone game

## Later (from the note), in rough order
- [ ] MVP+1 multiplayer: deterministic lockstep over WebRTC (+ small relay); the sim is built for this from M0
- [ ] Jackbox mode: TV/laptop shows the battlefield; phones are each player's tower (room code join)
- [ ] Auto-Starcraft tie-in: player-written programs drive the tower (build order + rules), same format as the AI
- [ ] CCG budget on programs (from [[Auto-Starcraft]] 2023-1-3)
- [ ] AR: tower as an "ant farm" on your desk (WebXR)
- [ ] more lanes / more towers / map

---
Log
- 2026-11-06: plan written from the obs note + Godot proto + auto-rts review
- 2026-11-11: M3 built. AI (Rusher, Expander × Relaxed, Sharp), menu, overtime, production hold-back. 38 tests. Feel test pending
- 2026-11-06: M2 done. Units, combat, rubble, dummy tower, game over. 31 tests. New Q7 (production vs. saving up)
- 2026-11-06: M0 + M1 done. Zero-dep stack (D1 revised). 19 tests. Tapping vs not: ~2.5× income (Q6)
