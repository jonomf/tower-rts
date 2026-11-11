# Tower RTS: design (first pass; numbers are starting points for balance sweeps)

## Pitch
Two towers, one lane. Build a Fallout Shelter-style cross-section of rooms: economy, supply, production, defense, research.
Units train on their own and march on the enemy. Your only weapon is the shape of your tower, so read what's coming and rebuild to counter it.

## Core loop
1. Collect resources (tap rooms, or let them auto-collect slowly).
2. Spend them on rooms. Placement matters: lane-side rooms are armor, and merged rooms are efficient.
3. Production rooms train their selected unit on repeat while you have the supply and the bank to pay.
4. Waves clash in the lane. Survivors chew into the enemy tower face, room by room.
5. Watch the enemy composition, then swap production, add defenses, and research counters.
Win: destroy the enemy Core. Overtime: from 5:00 both Cores burn 10 hp/s, so a match ends by 7:30; if both fall on the same tick, the tower with more room hp left wins.

## Tower
- Grid 6 wide × 8 high. Column 5 faces the lane (mirrored for the enemy).
- Core: 2 cells at the back of floor 0, 1500 hp, trickles 1 mineral/s into the bank (a broke tower can recover). Pre-built, and it can't be removed.
- Support: build on floor 0 or directly above a room (including one still building), or rubble (M2).
- Removal: cancel a room under construction for a full refund, or demolish a built one for 50% (+ its uncollected buffer). Nothing may be left floating.
- Merge: 2 or 3 adjacent, built, same-type rooms on one floor merge. Output ×2.2 / ×3.6 (+10% / +20% per room); Quarters supply too. Runs longer than 3 split left to right. Tapping any room in a group collects the whole group.
- Rubble: a destroyed room leaves rubble. It still supports the floor above, is never targeted, and rebuilding on it costs 50%.
- Ground units leave from floor 0 on the lane side. Air units launch from their Hangar's cell.

## Damage
- Ground units reach floors 1–2 (0–1 in code). Air (and Siege, M4) reach any floor.
- Attackers target the frontmost (lane-side) column first, then the lowest floor, among their reachable floors; rubble is skipped.
- So the Core (back of floor 1) is only hit once everything in front of it on reachable floors is rubble or empty.
- When a Core falls the game ends.

## Resources
Minerals and gas. Start with 200 minerals and 0 gas. Each tower has one bank.
Collect (Q1): producers fill their own buffer, capped at 30 s of output. A tap collects all of it. Auto-collect drains 40% of the rate from the buffer to the bank on its own.
So an untapped room earns 40% of its rate, and a room tapped at least every ~30 s earns 100%. Measured at 3 minutes: tapping ≈ 2.5× income (`npm run match`).

## Rooms (cost m/g · build s · hp)
| Room | Cost | Build | HP | Effect |
|---|---|---|---|---|
| Mine | 75/0 | 8 | 200 | +2 minerals/s |
| Refinery | 75/0 | 10 | 200 | +1 gas/s |
| Quarters | 100/0 | 10 | 250 | +8 supply (base 6) |
| Barracks | 150/0 | 15 | 300 | trains ground units (Trooper, Bruiser) on repeat |
| Hangar | 150/100 | 20 | 300 | trains air units (Flyer) on repeat; must be on floor 4+ |
| Gun Nest | 100/0 | 12 | 400 | lane face only; anti-ground, range 6 |
| Flak | 100/50 | 12 | 400 | lane face only; anti-air, range 7 |
| Lab | 100/100 | 20 | 250 | research; tier-2 unlock + upgrades |
| Wall | 50/0 | 6 | 600 | does nothing; cheap armor |

## Lane & units
The lane is 1-D: 16 cells between the two lane faces (one cell = one tower column wide). Range and speed are in cells.
Units walk until something they can hit is within range (+0.25 contact), then stand and fight. Rooms count as ground targets.
Production rooms train their picked unit on repeat; each job is paid when it starts and needs free supply (base 6, Quarters +8).

| Unit | From | Cost | Sup | Train | HP | Dmg/cd | Rng | Spd | Hits | Role |
|---|---|---|---|---|---|---|---|---|---|---|
| Trooper | Barracks | 50/0 | 1 | 6 s | 45 | 6/0.6 | 2 | 1.0 | G+A | cheap all-rounder |
| Bruiser | Barracks | 100/25 | 2 | 9 s | 120 | 20/1.5 | 0.6 | 0.8 | G | armored melee, eats Troopers |
| Flyer | Hangar | 125/75 | 2 | 10 s | 90 | 12/1.0 | 1.5 | 1.4 | G | air-to-ground; rooms on any floor |
| Siege Walker (M4) | Barracks T2 | 150/100 | 3 | | 160 | 40/3.0 | 4 | 0.5 | G + rooms any floor | tower breaker |
| Interceptor (M4) | Hangar T2 | 100/100 | 2 | | 80 | 10/0.5 | 2.5 | 1.6 | A | air superiority |

Intended counters: Bruiser > Trooper swarm · Trooper/Flak/Interceptor > Flyer · Flyer > Bruiser and Walker · Gun Nest > ground waves · Walker > turrets and walls.

## Production order
Rooms are served oldest first. A room that can't afford its unit holds that price back from the rooms after it
(only for resources the later unit needs), so cheap units can't starve an expensive one.

## AI scripts (data)
`src/ai/scripts.ts`. A script is an ordered list of steps: `{ build, at, train? }` or `{ train: seconds }`, where
`at` is `front` (lane-side column), `back`, `merge` (next to a same-type room) or `up` (highest floor).
By default the AI stops training to save for the next build (`saves: false` turns that off). After the order, standing
rules fire when they hold and are affordable (`supplyCapped`, `bankOver`), and `rebuild` restores destroyed rooms.
Levels: Relaxed never taps (40% producer income); Steady taps every 90 s (about 70%); Sharp taps every 3 s. It's the same shape the player-automation tie-in will use later.
