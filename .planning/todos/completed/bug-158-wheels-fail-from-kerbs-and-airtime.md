---
id: BUG-158
type: bug
status: closed
severity: major
opened: 2026-11-11
closed: 2026-11-11
source: owner, 2026-11-11 orchestrator intake
relates: FEAT-162 (a wheel at 0 % collapses), BUG-140 (drop rebound), SM-3
---

# BUG-158: wheels fail from kerb strikes and airtime while the tire is still on

Owner, verbatim: "wheels failing from impact while the tire is still there. wheels should only fail from impact in
exceedingly hard impacts (7+m) and the tire should protect them. i had one instance where one failed from airtime and
one where it failed as i drive over the shoulder curb. 2x failed wheels in one playthrough meant all my money was spent
on wheels and tires. wheels now feel like they're more fragile than the tires."

## Acceptance

- [x] Below a 7 m flat drop, the tire protects the wheel: no rim damage.
- [x] The 15 cm road-edge kerb (`roadClearanceMargin`) leaves the wheel intact at everyday speeds.
- [x] Only exceedingly hard hits bend a wheel; a 10 m drop writes one off.

## Cause

The road rim-strike yield (`rimYieldRoadMult` 14× static wheel load, ≈ 46 kN) was calibrated when a 2 m drop
bottomed the tire. Since BUG-140 the tire first reaches the rim at 5 m, so drops were already gentle. Kerbs, though,
still read against 46 kN. Measured headless (the real `stepPhysics` with the FEAT-70 tire cylinder) on the old
numbers: a 15 cm step at 45 mph and 30° cost a wheel 22 %, and at 60 mph 79–100 %. A 25 cm step at 30 mph wrote one
off in a single hit.

Uneven landings were checked too, and they stay far under either yield: nose-down 15° from 5 m reads 16 kN, coming
down across the road edge 14 kN. The airtime failure was most likely a landing into an upslope, which adds forward
speed to the hit. It may also have been a wheel already worn down by earlier kerb strikes.

Two other measures were tried and rejected. Dropping the tire damper from the residual, and switching to energy past
full squash, both still rank a tall kerb strike above a 10 m drop. A square edge really does bottom the tire in this
model.

## Resolution

`src/damage.js`: `rimYieldRoadMult` 14 → 24 (≈ 80 kN, the 7 m drop's rim load), `rimFullRoadMult` 60 → 54
(≈ 180 kN overload, the 10 m drop's). Front-wheel loss per event:

| event | rim load | old | new |
|---|---|---|---|
| flat drop 5 / 7 / 8 / 9 / 10 m | 2 / 81 / 129 / 192 / 261 kN | 0 / 7 / – / – / 100 % | 0 / 0.03 / 14 / 49 / 100 % |
| 15 cm kerb, 10–30 mph, any angle | ≤ 9 kN | 0 % | 0 % |
| 15 cm kerb, 45 mph straight on | 79 kN | 6.5 % (rears) | 0 % |
| 15 cm kerb, 45 mph at 45° | 215 kN | – | 65 % |

The owner chose this edge (2026-11-11): 45+ mph kerb strikes at a steep angle can still bend a wheel. Making kerbs
gentler would also make a 10 m drop harmless, because both are read on the same rim-force scale. Rock strikes (the
debris path) and crashes through armour are unchanged.

Gate: `test/damage-rim-strike.mjs` §2 now pins the new anchors. All 20 affected gates are green.
