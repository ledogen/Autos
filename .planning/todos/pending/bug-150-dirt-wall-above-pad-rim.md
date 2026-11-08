---
id: BUG-150
type: bug
status: open
severity: minor
opened: 2026-11-08
source: Lane B, drive soak run9 (6 random seeds on main 2f5735eb)
relates: BUG-145 (one PAD_DUCK_CAP for mesh and physics), BUG-122/123 (the 0.15 m designed rim kerb), BUG-151 (found beside it)
---
lane: B

# BUG-150: a 0.42 m dirt wall stands above a junction pad's rim on a hillside T

Seed 169372896, the 3-leg junction at (7.4, −904.7). The soak flagged a jolt there at 2.5 m/s (it did not replay: the
autopilot's path differs on replay), and `soak-site` found 283 ground steps over 0.15 m within 4 m of it, the biggest
0.41 m per 0.1 m at (15.42, −910.37). That is 7.6 m off run `g:7376,-904746,-1:0,-2,1`'s centreline, 10 m from the
node, in the sector between that leg and `g:55671,-864787,-1:7376,-904746,-1`.

It is a vertical step inside 1 cm. 5 cm inside the pad's ring the wheel rides the pad top (150.37). 10 cm outside it
rides dirt at 150.79. So 0.42 m of dirt stands ABOVE the asphalt rim, where the designed edge is the pad 0.15 m above
the dirt. Inside the ring the terrain mesh's dirt is held at the same height, so it pokes up to 0.30 m through the drawn
pad as well (junction-edge-lip's POKE, 9 points).

Main before tonight's pad landings (1ddea2f5) had the same wall at 1.05 m. BUG-145 shrank it; it did not cause it.

## Acceptance

- At this rim the dirt meets the pad at the designed kerb (pad above dirt, ≤ 0.25 m) and never stands above it.
- No dirt pokes through this pad.
- junction-edge-lip's RIM check fails dirt standing above a rim, not only a pad standing too high.

## Root cause and fix (Lane B, 2026-11-08, `land/bug-150`)

**The duck cap.** `_mergeCarve` let the pad move the dirt at most `PAD_DUCK_CAP` (1.2 m) from the leg's own
cross-section, inside the ring and out. Here the leg's section is pulled up toward the other leg by the QUAL-10
inter-leg ruled blend (151.99 just outside the rim), while the pad's own surface sits on the first leg's deck
(150.37). Just outside the rim the pad's dirt is 1.75 m under the leg's section (1.88 m just inside, where it also
carries `PAD_DIRT_EXTRA`). So the cap held the dirt 0.55 m short of where the pad's rim-hold band puts it. That
shortfall, less the 0.13 m the pad's dirt sits under its top there, is the 0.42 m wall.

The cap's purpose was to stop the old free-sampled duck field's tears at crease lines from tearing a smooth shoulder.
BUG-145 had already recorded that PERF-25 made the pad surface resolve-free and continuous, which removed those
tears. So all the cap still did was strand dirt where a crease ran deeper than 1.2 m.

**Fix:** the cap is gone. Inside the ring the dirt takes the lower of the two, by however much. Outside the ring the
pad's dirt governs as BUG-123 hands it over, and `b.blendW`'s ramp past the rim-hold band carries the dirt back to the
leg's. Mesh and physics share `_mergeCarve`, so MESH == PHYSICS holds.

- **This site:** rim wall 0.379 m → none (the rim now drops 0.20 m, pad above dirt). The biggest jump on the
  cross-section went from 0.42 m per 1 cm to 0.135 m per 0.25 m, a slope.
- **Census, 9 random seeds, 62 ringed junctions** (`wip/drive-soak/rim-wall.mjs`): main has a wall at this junction
  only; every other rim point has the pad above the dirt. After the fix: none.
- **BUG-149's rim lips are the same cap**, the other way round (the pad's dirt more than 1.2 m above the leg's, held
  below the rim). Seed 1074499174: 0.281 / 0.360 / 0.389 m → none over 0.25 m. BUG-149's 0.263 m leg lip is not the
  cap and stays open.
- **The gate:** junction-edge-lip's RIM check is two-sided. Dirt more than `WALL_MAX` 0.05 m above a rim fails. Its
  three seeds have no wall on main or on the fix. Seed 169372896 stays out of `SEEDS` for now. With it, main fails the
  gate 17 times and the fix fails it twice, and both of those are older:
  - a 0.073 m-per-1 cm tear inside the pad at (372.8, −263.2). This is BUG-146's class, and it is already gone on
    `land/bug-146` (worst 1 cm step 1.9 mm there).
  - BUG-151's 1.8 cm poke at (46.0, −856.7).
  Add the seed when both have landed.
