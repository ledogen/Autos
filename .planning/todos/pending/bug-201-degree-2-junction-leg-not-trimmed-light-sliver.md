---
id: BUG-201
type: bug
status: in-review
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 — "the unknown sliver is an active bug class on main. i think specifically deg 2 junctions dont get their legs trimmed properly. ticket and fix it"
relates: BUG-179, BUG-127, DEC-068, DEC-069, src/road.js
---
lane: B

# BUG-201: A light sliver on the outer edge of a two-road bend

## Next steps
Owner look at `CarGame-machine/wip/bug-201/sheet.jpg` (owed card `bug201-bend-sliver-look`). On "good": land
`land/bug-201-deg2-sliver`.

## Summary
At a degree-2 bend each leg's ribbon was trimmed at the bare junction cutback (10 m from the node), but the bend's
connector strip leaves the leg further out, at its mouth (12.5 m, up to 20.5 m on a sharp kink). So each leg ran
on straight for 2.5–10.5 m past the point where the connector turns off it, and on the bend's outer side that
overrun stuck out of the connector's edge: the sliver. The owner's hypothesis held. Fixed: the legs now end on the
connector's mouth, welded there like a padded junction's legs.

## Description
**What the sliver is (an overrun, not a gap or z-fighting).** Measured from the built ribbon mesh at the #17 bend
(seed 1019019281, node (−2902.0, −644.9), a BUG-179 chained-fork bend): the connector's mouths sit 20.5 m from the
node on both legs (12.5 m + the full 8 m sharp-kink pullback). The legs' ribbons ended at 10.9 m and 12.0 m, i.e.
9.6 m and 8.5 m past their mouths. Over that overrun the ribbon's outer edge runs out of the connector strip by
0 at the mouth growing to 1.02 m at its end, and the ribbon top there sits up to 0.47 m below the connector deck.
The visible part is the last metre or so of that wedge, beside the connector's outer edge.

**Physics had it too.** The road colliders are built from the same ribbon geometry, and the physics asphalt
overlay (`_ribbonDrawnAt`, BUG-127) read the same 10 m trim, so both carried the overrun.

**Why (the owner's hypothesis, confirmed).** In `_detectNodeJunctions` a 3+-leg junction gives each leg a
`mouth` (cutback + halfWidth/2, pushed further out where the pavements have not parted, BUG-59/BUG-146), and the
ribbon trim (`road-mesh.js _buildRoadTile`, `trimOf`) ends the ribbon exactly there with a weld section (DEC-068).
A degree-2 node with a connector skipped that block entirely: no `mouth`, so `trimOf` fell back to the bare
`junctionCutbackDist()` (10 m). The connector's own mouth (`_buildDeg2ArcGeom`) is at cutback + halfWidth/2 plus up
to `DEG2_SHARP_PULLBACK` 8 m, so the trim was always 2.5 m short, and up to 10.5 m short on sharp kinks.

**Fix (`src/road.js`).** `_buildDeg2ArcGeom` returns each leg's mouth distance (`mouthD`, node.legs order), and
`_detectNodeJunctions` sets `leg.mouth = mouthD[i]`, `leg.weld = true` on both legs of a connector node. The
existing trim then ends the ribbon with a section exactly on the mouth, where the connector's cross-section is the
same (it takes the run's frame there, junction-flow stage 4). The physics overlay follows by the same record.

**Census (≥ 30 random seeds).** 30 random seeds (`wip/bug-201/seeds.txt`), every deg-2 connector within 2000 m of
the origin, measured from the mesh (`wip/bug-201/census.mjs`): 399 connectors (398 ordinary, 1 BUG-105 bend);
before, 79 had a sliver > 5 cm (62 > 0.2 m, 44 > 0.5 m, worst 5.68 m on a near-hairpin, legs 2.5–10.2 m past their
mouths); after, 0. BUG-179's 35 site windows (`sites-all.json`, 150 m round each): 25 connectors (8 promoted
chained-fork bends, 17 ordinary); before 21 with a sliver (6 of 8 promoted, worst 1.65 m; 15 of 17 ordinary,
worst 5.79 m); after 0. Residuals explained: on legs that curve tightly at the mouth, the weld section's
inner-edge vertices project up to 1.8 m nearer the node than the mouth but lie inside the connector (0 m outside).
The lead-in (connector and ribbon coincident from anchor to mouth) shows ≤ 0.19 m chord residual on 51 of 399
connectors, identical before and after: not this bug, untouched.

**Cost.** Ribbon triangles over the tiles round the census connectors: 884,180 → 871,820 (−1.4 %); BUG-179 sites
62,620 → 59,200 (−5.5 %). The colliders are the same ribbons minus skirts, so they shrink alike. Build work is
unchanged (one assignment per deg-2 leg; the ribbons sweep fewer sections), so no build-time bench was run.

## Tracker
- [x] Reproduced on main at a degree-2 junction, the sliver's geometry named and measured
- [x] The owner's hypothesis (legs not trimmed at a deg-2 junction) confirmed or replaced
- [x] Census on random seeds: how many degree-2 junctions show it, before → after
- [x] Fixed at the root with a gate that fails before and passes after; fingerprint differences explained
- [ ] Before/after screenshots for the owner

## Decisions
- 2026-11-17, owner: "ticket and fix it"
- No conflict with DEC-068 (the fix extends its ribbon-pad weld to the connector's mouth), DEC-064/065 (no
  retune, no grade smoother), DEC-073 (no pooled geometry touched), DEC-260 (by construction), DEC-396.

## Open questions
None.

## Links
BUG-179 (chained forks, its #17 tile), BUG-127 (physics overlay at deg-2 ends), BUG-59/BUG-146 (3+-leg mouths),
QUAL-16 (the connector), DEC-068.

## Files
`src/road.js` (`_buildDeg2ArcGeom`, `_detectNodeJunctions`), `src/road-mesh.js` (comment), `test/deg2-leg-trim.mjs`,
`test/gates.mjs`. Tools (git-invisible): `wip/bug-201/` probe.mjs, census.mjs, summ.py, surfdiff.mjs, shots.mjs,
sheet.mjs.

## Log
- 2026-11-17: minted by the orchestrator from the owner's verdict on BUG-179's round-2 sheet.
- 2026-11-17 (lane B): fix + gate `deg2-leg-trim` (red on main 1.02 / 0.77 / 1.31 m, green after). Census 79/399 →
  0/399 (random), 21/25 → 0/25 (BUG-179 sites). Fingerprint vs main: network, profiles, poi, carve, water, props
  identical; junctions, tiles, surface differ (seed-7 window: 30 of 410,881 physics lattice points moved, ≤ 1.8 cm,
  all inside a deg-2 node's mouth radius).
