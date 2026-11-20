---
id: BUG-236
type: bug
status: open
severity: major
opened: 2026-11-18
source: owner capture autos-capture-1795075034907 (seed 1225608752, story, Normal) — "Big bumps here and a small kink, get back to me in a card in the lanes about what caused this."
relates: BUG-90, BUG-230, QUAL-16, src/road.js
---
lane: unplaced

# BUG-236: a degree-2 connector bend meets two different banks — hump, dip and a crease at the node

## Next steps
Building the DEC-461 design (CarGame-machine). Then gates, a check of the node height change against streams / causeways / POIs, and an owner drive.

## Summary
Two runs meet at a degree-2 node with a 42° kink; a connector arc (R ≈ 24 m) carries the road round it. BUG-90 runs
the south-west leg's bank off to 0° at the node, but the north-east leg inherited the same 10.7° bank and keeps it,
because BUG-90's crest test reads that leg's bank 10 m out, where it has already run off to 0°. The connector blends
the two cross-sections and makes a +28 cm hump on the inside wheel track, a −32 cm dip on the outside edge, and a
crease where the cross-slope flips. Not made or changed by any 2026-11-18 landing.

## Description
### The site
Seed 1225608752, node `-2,0,1` at (−765.9, 222.7). Legs `g:-885340,101440,-1:-2,0,1` (run 1, arrives heading ~20°)
and `g:-2,0,1:-635403,421899,-1` (run 2, leaves at 45°). First-chord kink 42.3° (> roadJunctionKinkDeg 9°, < the 60°
plane kink), so `_detectNodeJunctions` builds a connector (`_buildDeg2ArcGeom`, 39.1 m, mouths 12.5 m out on each leg).
The mark (−762.5, 222.5) is run 2 arcS 2.25, 2 m past the node. `node test/replay.mjs` reproduces it exactly.

### Measured (physics deck = `analyticHeight`, potholes off; drawn ribbon = physics to < 1 mm on the pavement)
Walked along the connector every 0.5 m, distance s from the node; inside = the side the arc cuts (+x).
- Inside wheel track (1.8 m in): hump +28 cm against an 8 m straightedge at s −2; grade +13 % then −10 % within 3 m.
- Centre line: +16 cm at s −1.5. Inside edge: +27 cm at s +1.5.
- Outside edge (4.5 m out): dip −32 cm at s +3; grade −16 % then +8 % within 3 m.
- Cross-section at the node: outside edge 117.13, inside edge 117.65 (5.8 % cross-slope, inside high); 8 m earlier it is a
  plain symmetric crown.
- Plan: no kink in the drawn edges. The leg ribbons weld to the connector within 5 cm; the connector's own edge facets
  are 7–9° every 2.9 m (R 24 m). The centre-line dash breaks at the node (the connector's mark-phase jump, by design).
  The "small kink" is most likely the crease above; the dash stub is the other candidate (asked on the card).

### Cause (proven by experiment)
`_applyJunctionBlend` → `bankCrest` (BUG-90): a leg whose HIGH edge faces the connector's inside runs its bank off to
flat at the node. The sign is read from `camberRad[i]` at the cutback (10 m out).
- Run 1 pre-blend bank: 11.2° at 10 m, 10.7° at the node → crest-side → run off to 0°.
- Run 2 is seeded with run 1's PRE-blend end bank (P4 chain, `_runStartCamber` = 10.73°) and slews to its own 0° at
  1.5°/m, so its bank 10 m out is 0 → `bankCrest` returns false → it keeps 10.73° at the node.
- So the node sees 0° against 10.7°: 0.95 m of disagreement at the pavement edges. The connector overlay
  (`_withConnectorTop`, 1/(gap² + soft²) blend by distance to each leg's edge) turns that into the hump/dip/crease.
Experiment (scratch copy, not committed; X1 and X2 below give the identical deck here): run 2 also runs off; the connector core's worst straightedge deviation falls 32.4 → 4.3 cm, wheel-track vertical
curvature 0.249 → 0.052 /m.

### Today's landings
Built at main 96a4355d, at fc10404d^1 (before BUG-230) and at 900267da^1 (before BUG-200 E): the walk's 408 × 7 deck
samples and all 671 connector-mesh vertices are bit-identical. BUG-230 does not touch it (it handles BARE joins only;
this one has a connector).

### How common
60 random seeds (`wip/bug-236/seeds.txt`), R 1000 m round the origin, free-roam network, potholes off. Metric: worst
8 m straightedge deviation on the wheel tracks (±1.785 m) through the connector core (`census.mjs`).
- 203 connector bends; 142 gentle (kink < 60°). The one-sided bank (one leg 0°, the other > 3°) is at 10 of the 142,
  on 9 of 60 seeds. Their bump: median 16 cm, worst 30 cm.
- Wider class, not this cause alone: connector bends are bumpy in general. 82 of 203 have a wheel-track bump over 15 cm
  (19 over 25 cm, 49 of 60 seeds have one). Control: the middle 48 m of 59 plain runs: median 2 cm, worst 9 cm, none
  over 15 cm. The matched-bank bumps need their own diagnosis (candidate: the connector overlay's distance blend).
### Fix candidates (scratch experiments, paired census on the same 203 sites)
- X1: `bankCrest` reads the largest bank between node and cutback. Fixes this site; changed only 3 sites, 1 worse.
- X2 (option 1): the node decides — if EITHER leg is crest-side, both run off (the other leg's pre-blend arrays via
  `_computeCamberArrays` + `_runStartCamber`). This site 32 → 4 cm. 20 sites changed: 9 better by > 2 cm, 1 worse
  (3245191168 (285.1, 223.1): 15 → 23 cm). 3 mismatches > 3° remain (legs with no crest side).
- X3: X2 plus BUG-230's mean bank at connector joins too. 0 mismatches left; 9 better, 2 worse (adds 792126976
  (435.9, 109.4): 22 → 26 cm).

## Tracker
- [x] Reproduced headless (replay exact; deck walk, ribbon vs physics)
- [x] Cause named and proven by experiment; today's landings cleared
- [x] Census over 60 random seeds
- [x] Screenshot sheet (`/Users/ledogen/CodeShit/CarGame/wip/bug-236/sheet.jpg`)
- [x] Owner picks a fix
- [ ] Fix + gate (this site, plus the census sites), road gates green

## Decisions
- 2026-11-20, owner: "Build the proposed design" (DEC-461).

## Open questions
- Which fix (card `bug236-bumps-kink`). Is the "small kink" the crease or the dash stub at the node?

## Links
Capture: `wip/captures/autos-capture-1795075034907.json` (main checkout). Scripts and data: `wip/bug-236/` in
CarGame-machine (git-ignored): `walk2.mjs` (deck walk), `census.mjs`, `sheet.mjs`.

## Files
`src/road.js` (`_applyJunctionBlend` · `bankCrest`, `_buildCamberProfile`, `_runStartCamber`, `_withConnectorTop`)

## Log
- 2026-11-19: diagnosis on land/bug-236-bumps-kink (lane b). No src change. Experiments X1/X2/X3 in scratch copies only.
  Not checked: an in-game drive at speed; story-mode pruning (census used the free-roam network; this site matches).
- 2026-11-20: owner, card bug236-bumps-kink: "Build the proposed design". DEC-461 (connector deck design: one vertical curve through the node, smooth connector height, the connector's own crown, the node still decides the bank). Not yet checked at choice time: regression gates on the design, node height change against streams, causeways and POIs, a drive. Build is under way in CarGame-machine.

