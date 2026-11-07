---
id: BUG-141
type: bug
status: open
severity: major
opened: 2026-11-07
source: owner, 2026-11-07 tracker inbox
relates: BUG-135 (story start seat), test/story-start-clear.mjs
---
lane: Spare

# BUG-141: free roam can spawn the truck facing a spur's dead end, or on a steep grade

Owner, verbatim (2026-11-07 tracker inbox): "Vehicle spawns in free roam are kind of busted This has been mostly rectified in story mode due to the presence of the tutorial and spawning at the burger joint But in free roam, it can still spawn you facing the end of a spur with nowhere to go My take is it should always spawn you on relatively level ground and not right at the end of the spur Relatively level is like under a 20% grade"

## Acceptance

- [ ] Free roam spawns on a road under 20 % grade, not near a spur's dead end, facing the long way.
- [ ] A census over random seeds: how often today's spawn fails either rule, and 0 after.

## Built (Spare, 2026-11-07): `RoadSystem.freeRoamSeat`, free roam only

**What it does.** From the spawn decision's road point, the seat slides along that same road in 8 m steps, nearest
spot first, to the first spot that:

- is under 20 % grade (the deck, ±4 m);
- is at least 150 m from a dead end. `_deadEndReach` walks on through two-leg nodes (bends), so a dead end beyond a
  bend still counts.

The truck then faces the long way: away from a dead end, otherwise toward the farther end of the run. When no spot
qualifies, the gentlest spot wins.

**Where it applies.** `main.js` applies it in the free-roam reseat only (`_gameMode === 'freeroam'`). Story keeps the
unrefined spawn: its region centre is captured from it (BUG-121), and its run starts at the burger joint (BUG-135).
So no story world moves.

**Census** (`wip/bug-141/census.mjs`, the 100 fresh random seeds of BUG-105's census). Today, 23 seeds break a rule;
with the seat, 0:

| Rule | Seeds broken today | Detail |
|---|---|---|
| On a 20 % or steeper grade | 10 | worst 25.8 % |
| Within 150 m of a dead end | 5 | 3 of them right at it |
| Facing a dead end | 12 | as far as 2.2 km down the spur |

The seat moves the truck on 15 seeds (median 0 m, max 161 m). On the rest it only turns it round, or leaves it.

**Gate:** `test/free-roam-seat.mjs`, on four census seeds:
- 1536055470, at a dead end: seated 93 m on, 152 m from the dead end;
- 1016364815, on a 25 % grade: seated 40 m on, at 17.5 %;
- 2811484882, facing a spur: turned round;
- 672275505, a clean spawn: unmoved.

world-determinism's three spawns stay within 2 cm, and two of them turn round.
