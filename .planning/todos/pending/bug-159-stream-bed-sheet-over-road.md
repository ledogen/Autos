---
id: BUG-159
type: bug
status: open
severity: major
opened: 2026-11-12
source: owner capture (story mode, freecam)
relates: BUG-33 (stream water over road — span suppression), FEAT-25 (draped cobble bed), FEAT-44 (culvert visual), road×stream causeways, MESH == PHYSICS
---

# BUG-159: a stream mesh sheet floats over the road where a stream crosses it

## Symptom

Seed 2879661543, mark (2269.2, 950.0), road run `g:3,1,2:2354056,651982,-1` at arcS 44.2. A brown,
twisted sheet hangs above the pavement across the lane and casts a hard black shadow on it. The
stream channel and its banks are visible just left of the road, so this is a road×stream crossing.
Physics is fine: the truck drives the deck, and `node test/replay.mjs` reproduces the road exactly
(gradeY 69.339, window-invariant over the 200 m region). It is a render-only fault.

Screenshot: `logs/autos-capture-1794548910307.png`.
Capture: `logs/autos-capture-1794548910307.json` (also `~/Downloads/`). `logs/` is git-ignored, so
copy them along if the worktree changes.

## Suspect (unverified — check headless first)

The colour reads as the FEAT-25 cobble bed, not the blue water. `buildStreamBedMesh`
(`src/water-render.js`) shares the water's span set (`computeStreamSpans`). That set is classified
from three probes per point: the centreline and ±w. But the bed reaches further, to ±(w + bankWidth/2),
and its outer columns are never classified. So at an oblique crossing, a row the probes call ACTIVE
(just off the road) can push its outer column onto or over the deck. The drape y there comes from
`surfaceAt().h`, which may not be the rendered road-tile height. The water ribbon itself could also
be the culprit at a skew crossing. Measure which mesh owns the triangles before changing anything.

## Acceptance

- At the capture site, no stream-water or stream-bed triangle sits above the road deck inside the
  pavement footprint. Prove it headless, like BUG-33's "water-over-road verts 8 → 0": count the
  verts of both meshes that lie inside the road footprint and above the road top.
- The stream still shows on both sides of the crossing; no new gap opens in the banks.
- Owner confirms in game at the capture site.
