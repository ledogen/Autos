---
id: BUG-179
type: bug
status: closed
severity: major
opened: 2026-11-15
closed: 2026-11-17
source: owner, 2026-11-15 — "two legs diverge in elevation rapidly and there is a tear at the interface"
relates: BUG-171, src/road.js, src/road-mesh.js
---
lane: Spare

# BUG-179: Two road legs diverge in height quickly and the surface tears where they meet

## Next steps
Closed (2026-11-17). Resolution: the chained fork (DEC-366, option 1) plus the dead-end trim (d0f216e5) on
`land/bug-179`, signed off by the owner on the round-2 sheet ("1. looks good"); lands on main with gate
`test/leg-overlap-tear.mjs`. Still open, on main: the #9 hairpin's 38 % climb is BUG-200; the light sliver at a
degree-2 bend (#17) is BUG-201; main's own 51 dead-end stubs stay, as character (DEC-396), so no trim follow-up.

## Summary
At one place on seed 1684703087 two road legs leave each other with rapidly different elevations, and there is a
visible tear along the line where their surfaces meet. The owner marked the spot with an in-game capture.

## Description
Owner's capture: `Logs/autos-capture-1794791342440.json` (place capture, free roam, quality Normal, freecam).

- Seed `1684703087`. Mark at x −270.19, z 158.38. Capture region x −370…−170, z 58…258.
- At the mark the game reported: on road, run `g:-1,-1,0:-1,0,0`, arc length 1404.85 m, road grade height
  188.19 m, ground height 188.67 m (0.48 m above the grade), camber 0.053, centreline radius within design.

`node test/replay.mjs Logs/autos-capture-1794791342440.json` on main (2026-11-15):
- REPRODUCED: the headless road equals the game's road at the mark (all six fields match).
- Surface window-invariance over the region: identical across stream centres (347 on-road points, worst grade
  difference 0.000 m). So this is not a streaming artifact; the generated geometry itself has the tear.
- Fold metric at the mark: centreline radius within the design minimum. Not a fold.

Not yet known: which second leg is involved, the size of the height gap along the interface, and whether the tear
is in the drawn mesh only or in the physics ground too (MESH == PHYSICS says both).

### Root (Spare lane, 2026-11-16, land/bug-179; `node test/leg-overlap-census.mjs <seeds>`)
The legs: node `-1,0,0` at (−235.8, 145.2), a degree-3 node. Leg A `g:-1,-1,0:-1,0,0` (1441.7 m, the mark's run) and
leg B `g:-433663,326333,-1:-1,0,0` (271.0 m, both end at the node). B is the node end of the old edge `-1,0,0|-2,0,0`,
which a T at P (−433.7, 326.3) split; the third road `-1,0,0|-1,1,1` leaves from P.

| out from node (m) | 0–30 | 35 | 40 | 45 | 50 |
|---|---|---|---|---|---|
| centreline separation (m) | 0.6–2.0 | 3.3 | 5.5 | 7.6 | 9.8 |
| grade A − B (m) | ≤ 0.14 | −0.79 | −2.31 | −4.37 | −6.58 |
| ground step across the seam, one 5 mm move (m) | ≤ 0.15 (edges) | — | 2.79 | 4.49 | 7.05 |

A and B are ONE road for the first 30 m (centres 0.6–2.0 m apart) and only part (separation > one road width,
10 m) at ~51 m. The tear starts at ~37 m out (A arc 1404.7, B arc ~234.5) and grows to 8.0 m by 54 m. Same in mesh
and physics: the carve resolver hands each point to the nearer leg, so the ground is a cliff on their equidistance
line, and the mesh draws both ribbons.

Which stage: the **merge plan** (`_v2NodeMerges`, the role loop). At node `-1,0,0` it saw both other roads ceding to A
(`-1,0,0|-1,1,1` over 90 m, `-1,0,0|-2,0,0` over 86 m), but `-1,1,1` already cedes to `-2,0,0` (their T at P, 268 m
out), so the role rule ("a run may not be both winner and loser, or cede twice, at one node") dropped both
(`role` skips). Nothing downstream catches it: `_v2JoinOverlaps` skips pairs that share a node. Then the **profile
planner** holds both legs on the pad plane only to 28 m (`JN_HOLD_MAX_PLANE` 30 m cap; its comment calls a pair still
overlapping past 30 m "a merge shape"), and past it each recovers its own grade (A falls ~23 %, B climbs ~13 %) while
the decks still overlap. Junction stitch and mesh tiling are not involved (replay: window-invariant).

Not BUG-171's root (that is the limb/tie terms inside one leg's carve; here two legs' profiles disagree).

### Census (the tear class: a winner flip between two legs of one node on shared pavement, 5 cm step > 0.10 m)
| seeds (R 3000 m) | pairs walked | shared-pavement flips | tears | worst |
|---|---|---|---|---|
| 3294922864, 4019197054, 2132283174 | 561 | 4073 | 1 (0.15 m, a deck edge 10 m out) | 0.15 m |
| 1684703087 (capture, R 1000 m) | 20 | 152 | 1 | 6.12 m (this site) |

## Tracker
- [x] Reproduced headlessly with the two legs named and the height gap measured along the interface
- [x] Root cause found; same root as BUG-171 or a separate one, stated (separate: the merge plan's role rule)
- [x] Owner picks a fix (DEC-366: option 1, the chained fork)
- [x] Fixed at the root, with a gate or census that fails before and passes after (`test/leg-overlap-tear.mjs`)
- [x] 12 generated chains measured before → after, sheet made (`wip/bug-179/chained-forks-sheet.jpg`)
- [x] Dead-end tail the chain left (9 of 12 chains) dropped: the old fork is a 2-leg bend (d0f216e5), tails 9 → 0
- [x] Owner signs off the chains + the tail drop on the round-2 sheet (DEC-366): "1. looks good" (2026-11-17)
- [x] Owner looks at the spot on seed 1684703087 (not driven: the gate `test/leg-overlap-tear.mjs` pins the capture seed's tear; closed with the round-2 sign-off)

## Decisions
DEC-366 (owner, 2026-11-17): build option 1, a chain of forks at one junction; show him 10 generated chained forks and
he signs off before it lands on main ("im worried this expansion could create a whole class of bugs").
Owner sign-off, 2026-11-17, on the round-2 sheet: "1. looks good" (the chains + the dead-end trim). Land it.
DEC-396 (owner, 2026-11-17): main's existing dead ends stay, as character; the trim stays chains-only.
DEC-260 (fix by construction, never averaged away) governs this ticket. DEC-065, DEC-068, DEC-064 bind any fix; none
of the options below conflicts with them. Owner 2026-11-13 (memory, no record): ask before changing junction promotion.

## Open questions
- How to fix it? Spare lane recommends 1.
  1. **Plan layer** (recommended): let the role rule admit a CHAINED bundle, a road that wins one fork at a node also
     ceding to a third road there when the two forks are on different stretches (here B cedes to A at ~45 m, `-1,1,1`
     still forks off B at P). A becomes a T with B leaving it; the deck hold (60 m on a T) keeps them together until
     they part. Changes junction promotion, and the network at every such site (rare: 0 on 3 random seeds).
  2. **Assembly layer**: let `_v2JoinOverlaps` take node-sharing pairs whose shared stretch outruns the deck hold (one
     T at the far end of the stretch). Catches any pair the plan dropped, whatever the reason. Same owner call.
  3. **Profile only**: lift the 30 m plane-hold cap while a pair still overlaps. No network change, but the plane is a
     bad ground model that far out (why the cap exists) and A would then have to fall 6+ m in its next 30 m. Not
     recommended.

## Links
Capture: `Logs/autos-capture-1794791342440.json`. Possibly related: BUG-171 (deep dive
`.planning/dives/BUG-171-option2-gore-steps.html`); unverified.

## Files
`src/road.js` (`_v2NodeMerges` role loop, `_v2JoinOverlaps`, `_junctionHoldReach`, `JN_HOLD_MAX_PLANE`) ·
`test/leg-overlap-census.mjs` (the class census; becomes a gate with the fix) · `test/replay.mjs`

## Log
- 2026-11-17 (Lane B, land/bug-179, landing): owner signed off round 2 ("1. looks good"). Main merged in (no
  conflicts). Follow-ups on main: BUG-200 (#9 hairpin 38 %), BUG-201 (degree-2 bend sliver), DEC-396 (stubs stay). Closed.
- 2026-11-17 (Lane B, land/bug-179 @ d0f216e5, round 2 checks): affected gates 76/76 green (serial); world fingerprint
  ALL IDENTICAL to main. #9 (seed 688224244): the 0.79 m is a smooth slope at the outer metre of a hairpin the old T
  became (centreline profile identical to r1: a 38 % climb 20–36 m out, made by the chained fork), no tear. #7: the +606 m
  is graph leg 1,-1,0—1,-2,0, which main drops (role rule barred the merge, shove 44 m > 30 m cap); the chain merges it.
  Main's stubs: 51 on 27 of 34 seeds (32–120 m), all left by promotion ceding legs off a winner (same root; trunkEnds is
  chains-only by design). Sheet rebuilt (19 tiles). Unverified: a drive of the #9 hairpin; a ~1 m sliver at #17's bend edge.
- 2026-11-17 (Lane B, land/bug-179 @ 08373870, no src change this round): 35 chain sites from 213 random seeds
  (`wip/bug-179/sites-all.json`, `measure.mjs`): 12 fully built, 23 with one T declined (those 23 identical before/after).
  Shared-pavement step (census measure) before → after: 4 tears fixed (6.12, 3.95, 14.87, 6.94 → ≤ 0.27), 0 new; worst
  1 m step on pavement 21.5 → 0.64 m. The seed-4243617325 "25.3 m" was the box metric: an off-pavement cut wall between a
  hairpin's two arms 40 m apart, 21 m before (one run, so unseen) → 27 m after. Affected gates 76/76 green (serial; play-area held back).
- 2026-11-16 (Spare, land/bug-179 e53633e9+): root = merge-plan role rule drops the B×A cession, plane hold capped at
  30 m; census script added (not a gate: red at the capture seed until fixed). No src change, so no fingerprint or
  gate run needed (`run-all --list`: no gates cover it). Stopped for the owner's pick.
- 2026-11-15 (Lane C, read-only, land/bug-171): NOT BUG-171's root. Two legs of one node, `g:-433663,326333,-1:-1,0,0`
  (arc ~230) and the mark's `g:-1,-1,0:-1,0,0` (arc ~1400), run side by side 6.3 m apart (3.17 m each side of the
  seam, decks overlapping) with grades 3.1 m apart (190.48 vs 187.38) ~40 m from the node. The resolver winner flips
  at their equidistance line: a 3.31 m step at (−273.7, 161.9) in one 5 mm move; also 0.56 / 0.29 m steps inside the
  pad with no winner or rival change. All three identical on main, option 2 and the BUG-171 foot fix (±8 m lines in 4 directions).
- 2026-11-15: minted from the owner's capture. Replay reproduces the road at the mark and shows the surface is
  window-invariant there. No investigation beyond that.
