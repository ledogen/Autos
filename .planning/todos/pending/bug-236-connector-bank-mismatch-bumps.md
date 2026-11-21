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
Owner picked "Build the proposed design" (2026-11-20). BUILT on land/bug-236-bumps-kink (lane b), not landed. Owner:
drive it (card `bug236-built-drive`), then the orchestrator lands it. Open: 6 sharp bends worse than main by 0.6–2.7 cm
(list in the Log); the ≥ 60° bends keep a shared plane (see Decisions; both are deviations from DEC-461).

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

### The whole connector deck (2026-11-19, owner's option 4)
60 random seeds, 203 connector bends; 82 have a wheel-track bump over 15 cm (8 m straightedge, wheel tracks ±1.785 m,
connector core ±2 m). Each bend's bump was split into its parts (`wip/bug-236/census2.mjs`): the legs' OWN centreline
profiles through the node, the connector's grade blend, and its cross-section blend. A bend can carry several classes.
- **Class 1, different banks at the node** (6 of 82, all gentle kinks; median 21.5 cm, worst 29.6 cm at 2215738496
  (−756.9, −500.2)). `_applyJunctionBlend` · `bankCrest`: one leg runs its bank off, the other keeps the shared start
  bank (5 bends); 1 bend has two different banks and no crest side (792126976 (435.9, 109.4)). Proof: option 1 takes
  the cross-section part from 14.3 to 1.8 cm (median); the 6th is fixed by the class-4 change.
- **Class 2, the node is a sag (or crest) the profile never smooths** (60 of 82, 23 at kinks ≥ 60°; median 22.6 cm,
  worst 55.2 cm at 2973054976 (956.3, −66.4)). The two runs are solved separately and meet at the node with a grade
  break: 114 of 203 connector nodes are sags with > 10 % grade change, 22 crests. `_applyJunctionBlend` holds a deg-2
  node on the mean grade line (`_junctionGradeVector`, or the shared pad plane at kinks ≥ 60°, `_junctionPadPlane`), and
  `_recoverFromHold` bends back to the run's own profile under the FEAT-82 sag/crest rule priced at par's corner speed
  (`vNode2`) and capped at 45 % of the run: the worst site climbs back at 40 % within 5 m. Proof (toggle T2, one
  parabolic vertical curve through the node at the open-road rule): the legs' own profile bump 21.5 → 10.9 cm median.
- **Class 3, the connector blends two runs' extended grades** (21 of 82; median 18.7 cm, worst 33.5 cm at 4082309632
  (255.5, −692.1)). `_connectorDesignAt` takes each leg's grade at its nearest point (`_runGradeAt`; past a leg's end it
  is frozen at the end value, faded over XS_OFF_FADE 4 m) weighted 1/(gap² + 0.5²) to that leg's edge; the handover adds
  a bump the legs do not have (median 8.5 cm over the legs' own). Proof (T3, the core's height a cubic in arc length
  along the connector, matching each leg's height and grade at its mouth): excess 8.5 → −2.4 cm; 16 of 21 ≤ 15 cm alone.
- **Class 4, the connector blends two runs' extended cross-sections** (35 of 82, 23 at kinks ≥ 60°; median 22.8 cm,
  worst 37.6 cm at 3138363520 (874.2, −108.8)). `_runGradeAt`'s fold: `crownProfile` is unbounded past the edge (−15 cm
  at 10 m off a leg, −40 cm at 15 m) and the bank lever is extended to 8 m; at sharp kinks the core lies 8–15 m off both
  legs. Proof (T4, the normal crown about the connector's own centre line plus a bank run linearly from one mouth's
  bank to the other's): the cross-section part 10.0 → 2.3 cm median (worst 31.2 → 5.7).
- **Unexplained: 3 of 82** carry no class over its bar (15.2–16.9 cm, legs' own 13–15 cm: sags just under class 2's
  bar). Toggles alone are not additive: at kinks ≥ 60° the plane's grade and cross-section errors partly cancel today,
  so T2 alone or T4 alone makes those worse (T2 alone: 151 bends > 15 cm); only together do they help.
### Proposed connector deck (scratch experiment T1+T2+T3+T4, not shipped)
One road through the bend. Profile: one symmetric parabolic vertical curve centred on the node joins the two runs'
solved grades; length = grade change / curvature limit at 28 m/s (sag R ≥ 80 m, crest R ≥ 160 m: the open-road rule
the runs already meet), capped at 45 % of either run; the node height floats onto the curve (median 0.28 m, 27 of 203
nodes > 1 m, max 2.5 m). Replaces the deg-2 hold, the corner-speed recovery and the ≥ 60° shared pad plane. Through the
core: height a cubic in arc length along the connector (C1 to each run at its mouth); cross-section = crown about the
connector's centre line + a bank run linearly between the two mouths' banks. Option 1 kept.
Census (203 bends, main → design): > 15 cm 82 → 4, > 10 cm 132 → 35, > 5 cm 189 → 142, median 13.0 → 6.7 cm, worst
55.2 → 21.6 cm; worse by > 0.5 cm: none. > 5 cm stays high: the open-road sag limit is ~10 cm against an 8 m
straightedge (plain road worst 9 cm). Left over 15 cm: hairpins 2349152256 (272.2, 614.7) 127° 26.6 → 21.6, 278212208
(169.2, 328.5) 123° 37.3 → 16.5, 3075315200 (−682.2, −109.4) 119° 33.7 → 16.3 (the tight inside of the fillet), and
1960500736 (801.2, 484.3) 35.8 → 19.9, a node the graph counts as 3-way (pad-plane path, the experiment did not touch it).
Not checked: MESH == PHYSICS on the experiment (both read `_connectorCarve`, so it holds by construction), the node
height change against streams/causeways/POIs, gates, cost of the extra solved-profile build per connector leg.

## Tracker
- [x] Reproduced headless (replay exact; deck walk, ribbon vs physics)
- [x] Cause named and proven by experiment; today's landings cleared
- [x] Census over 60 random seeds
- [x] Screenshot sheet (`/Users/ledogen/CodeShit/CarGame/wip/bug-236/sheet.jpg`)
- [x] Owner picked option 4 (diagnose the whole deck first; option 1 not to land alone)
- [x] Option 1 built as wip + gate `connector-bank-runoff` (0487cef0, 0b096f51); proofs in the Log; NOT for landing alone
- [x] Whole-deck diagnosis: 4 classes with toggles, shares of the 82, 3 unexplained
- [x] Proposed deck design + scratch census (82 → 4 over 15 cm, none worse); sheet `sheet-deck.jpg`
- [x] Owner picks: build the design (2026-11-20)
- [x] Built: node vertical curve (gentle bends), fitted shared plane (sharp bends), connector core deck, option 1
- [x] Gate `connector-bend-bumps` (all four classes + capture; red on main, green here)
- [x] Affected gates on 953a1618: 96/96 green (71 + the 25 after the hold); smoke 42/42 (retry), pad-e2e ok
- [x] Census 60 seeds; 400-seed sweep 0 throws (9cddcb10); node moves vs bores/streams/water
- [x] Topology identical to main on 400/400 seeds; fingerprints; sheet `sheet-built.jpg`; card `bug236-built-drive`
- [ ] Owner drive (card `bug236-built-drive`), then land

## Decisions
- 2026-11-20, owner: "Build the proposed design" (DEC-461).
- Sharp bends (kink ≥ 60°) keep ONE shared plane while the legs' pavements overlap, now fitted to the two runs' own
  grades through the node (`_deg2BendPlane`, cap 24 %). Replacing it by the curve broke junction-stitch (legs 2.3 m
  apart where their pavements overlap). 7 % cap measured 10 bends > 15 cm against 5; 12 % / 16 % no better overall.
- DEC-065 (no longitudinal grade smoother; crest priced by par's corner speed): the node curve is not a smoother (one
  curve per node grade break, from the two solved grades, ≤ 45 % of either run). It does replace the corner-speed
  recovery at connector nodes with the open-road rule (vMax 28 m/s) — the design the owner picked; a DEC may want writing.


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
- 2026-11-19 (lane b): option 1 built (0487cef0), gate `connector-bank-runoff` (0b096f51): capture 28.2 → 4.2 cm wheel-track,
  node banks 10.73° → 0° mismatch; ribbon vs physics ≤ 0.6 cm at all 8 sites. Census (203 bends, identical to X2): the 7
  same-cause bends all agree at the node; 5 better (16.3→7.1, 5.7→4.4, 29.6→15.1, 6.4→4.3, 21.7→15.0 cm), 2 worse:
  3245191168 (285.1, 223.1) 15.4→22.5 and 3075315200 (550.4, 7) 16.2→16.7. Other worse (> 1 mm): 4184160384 (−953.5,
  −38.9) 8.8→9.4, 2798042624 (−176.8, −344.7) 8.3→10.3, 611829248 (−477.6, 155.9) 20.4→21.2, 2395778304 (277, −743.9)
  14.2→15.2. Why 3245191168: main's leg kept the inherited crest-side 3.65° over its first 2.4 m (this bug, smaller); its
  high inside edge part-filled a matched-bank sag at the node (centre −10 → −17 cm). Both legs flat, the wider-class sag
  shows in full; keeping that bank would restore the capture hump, so no option-1 rule avoids it. Wider class > 15 cm:
  82 → 79 (> 25 cm 19 → 18, summed bumps 29.56 → 29.09 m). 3 mismatches left have no crest-side leg (not this cause).
  Fingerprint: 6 windows: seed6/seed11 story differ in surface/carve/tiles (+water seed6), 4 play windows identical;
  tutorial 1872706826 (r 1400): network/profiles/junctions/POIs identical, surface/carve/tiles/water differ at 5 of 19
  connector bends (bank run-off on the pavement; earthwork slopes 13–21 m out up to 1.44 m). Every 2 m deck cell that
  moved > 1 mm in the three story windows lies within 61 m of a connector node.
- 2026-11-19 (lane b): owner picked option 4. Option 1 landing proofs stopped (400-seed sweep: 169 seeds done, 0 throws;
  smokes not run). Whole-deck diagnosis: classes 1–4 = 6 / 60 / 21 / 35 of the 82 (3 unexplained); design experiment
  (`wip/bug-236/design-exp.patch` on the branch, env toggles BUG236_T2/T3/T4) 82 → 4 bends over 15 cm, worst 55.2 → 21.6 cm, none
  worse. Scripts: census2.mjs, c7-cls.mjs, sitepro.mjs, sheet-deck.mjs. Sheet `wip/bug-236/sheet-deck.jpg`.
- 2026-11-20 (lane b): BUILT (6fc35f8e…953a1618). Census 60 seeds, 204 bends, main → built: > 15 cm 82 → 5 (one is a
  main router spike, 2146252800 (218.4, −761.6) 125.9 → 116.3, not the deck), > 10 cm 135 → 35, median 13.1 → 6.9, worst
  connector 18.5 cm. Worse > 0.5 cm, all sharp: 1666431344 (24.8, −95) 10.0→12.7, (−493.2, −45.6) 9.0→10.4, 1168177514
  (793.1, 372.3) 10.4→11.5, 3936696320 (−332.1, −557.2) 7.6→8.7, 4133490816 (−608.9, −394.6) 5.8→6.7, 3273639936 (578, −314.3) 8.4→9.0.
  Node heights: 201 of 204 decks move; node median 0.12 m, 19 > 1 m, max 2.48 m. First gate run 95/96: bare-join's
  connector-join step 6.8 cm (the core's deck extended 10 m sideways over a leg's pavement) → fixed 953a1618 (0.9 cm).
- 2026-11-21 (lane b): main merged (311038d3). Gates 96/96; cdp-smoke 42/42 on the retry (first run: FEAT-305 "mom does
  not point at the Shop tab", a UI timing check), pad-e2e ok. Topology identical to main on 400/400 seeds. Fingerprints:
  physics identical; world differs in profiles/junctions/surface/carve/tiles; water (tutorial): bodies identical, 22 stream-
  bed verts draped on the moved road carve, worst 1 cm; props (capture): 444 of 4912 re-seated (median 1.2 cm, max 1.18 m),
  11 added / 9 removed, all within 65 m of the node (moved earthwork). Tutorial 1872706826: 8 bends, > 15 cm 3 → 0, worst
  20.8 → 11.6 cm, nodes move ≤ 0.56 m, POIs identical; tut-gate + tutorial-seed pass. Sheet `wip/bug-236/sheet-built.jpg`.
