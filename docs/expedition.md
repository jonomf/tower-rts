# Expedition: design for the pivot

Status: design only (2026-11-11). Numbers are starting points; tune them with `npm run match` before asking Jono to play.
Where this file and `.plan` disagree, `.plan` wins. When you change a number here, change `src/sim/defs.ts` in the same commit.

## Pitch
You run a tower in hostile country. Most of the time you are building: economy, housing, production, defenses.
Every minute or two something comes out of the fog at you, from the left or the right. Between raids you send squads
out, sector by sector, to find supplies, burn out raider camps, meet a trader, and finally find and destroy the Stronghold.

## Why these choices
- **Strip, not grid.** The game is a side-view cross-section. A strip of sectors keeps everything on one screen and one
  camera. A grid needs a separate overworld screen and pathfinding, and loses the "ant farm" look.
- **PvE pacing instead of a mirror match.** M3's headless runs showed mirrored streams stalemate and one opening dominates.
  A director that sends raids on a schedule gives pressure without requiring the enemy to play the same game as you.
- **Deploy per room.** One three-way switch per Barracks is the least control that makes exploring a decision
  ("do I keep these at home for the next raid?") without adding unit micro.
- **Camps are small towers.** They reuse the room/damage/rubble code and the renderer. No new entity type.

## World
- Axis in cells. Sector width 14. Sectors −5..5. Home tower (6 cells wide) centred in sector 0.
- Site table for non-home sectors (weights): Empty 3 · Cache 3 · Ruin 1 · Camp 3. Then place the guaranteed
  Stronghold (distance 3–5, random side) and Trader (distance 2–4, either side, not the Stronghold's sector), overwriting.
  Fix-ups: at least one Cache within distance 2; no Camp at distance 1; at most 2 Camps per side.
- Cache loot: 150–300 minerals, 30% chance of 50–100 gas as well. Scales +25% per sector of distance.
- Fog: unexplored sectors are drawn as a dark curtain; explored-but-not-visible sectors show their site but no units.

## Units and orders
- `garrison`: idle point is the home tower's centre. If a hostile unit is in sector 0, walk to it and fight. Otherwise walk back.
- `march(dir)`: walk in `dir`. Fight hostile units in reach (existing rule). Attack a hostile site's near face in reach.
  Entering a sector explores it. At the last sector, hold at its centre.
- New units from a room take that room's Deploy setting. Changing Deploy does not affect units already out.
- Recall: every player unit becomes `garrison`. Send left/right: every garrison unit becomes `march`.

## Raids (director)
| Game time | Interval | Squad |
|---|---|---|
| 2:30–5:00 | 75–90 s | 2–3 Troopers |
| 5:00–8:00 | 65–80 s | 4–6 Troopers, 30% chance +1 Bruiser |
| 8:00–12:00 | 60–75 s | 6–8 mixed, Flyers from 9:00 |
| 12:00+ | 55–70 s | +1 unit per raid, uncapped |
- Side: random, but never the same side three times running. A side with a living Camp is twice as likely.
- Each destroyed Camp: +15 s to intervals on that side and 200 minerals loot.
- Warning 12 s before spawn. Raiders spawn at the Camp's face, or at the map edge if there is none.
- Raiders are team 1, `home: null` (no supply), order `march` toward sector 0.

## Rooms added in P3
| Room | Cost | Build | HP | Effect |
|---|---|---|---|---|
| Gun Nest | 100/0 | 12 s | 400 | outer column only; hits ground units within 3 cells of its face; 8 dmg / 0.5 s |
| Flak | 100/50 | 12 s | 400 | outer column only; hits air units within 4 cells of its face; 12 dmg / 0.6 s |
A column is "outer" on a floor if no room stands between it and that side's face on that floor.
A turret that gets walled in stops firing (show "blocked" on the room).

## Camps and Stronghold
- Camp layout (tower-local, Core 1 wide for camps): `[wall, core, wall]` on floor 0, `[null, quarters, null]` on floor 1.
  Camp Core 600 hp. Camps never build.
- Stronghold: full 6×8 tower run by an `AiController`. Before discovery it only builds economy and walls (a script with
  no production rooms). On discovery, switch to a combat script (start from `SCRIPTS.rush`) at the menu's difficulty.

## Trader
- Neutral tower, never targeted, never attacks.
- Trade: sell 100 minerals → 40 gas, or 50 gas → 80 minerals. Rate drifts ±20% every 60 s (seeded).
- Gift on first contact: 150 minerals and 50 gas.

## Win, lose, score
- Win: Stronghold Core destroyed. Lose: home Core destroyed.
- Score for the summary screen: sectors explored ×100 + raids repelled ×50 + camps destroyed ×200 + win bonus 1000 − seconds.

## Things deliberately left out for now
2-D map, unit micro, multiple player towers, diplomacy, crew, research. See P5 in `.plan`.
