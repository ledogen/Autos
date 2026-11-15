---
id: BUG-159
type: bug
status: open
severity: major
opened: 2026-11-12
source: owner capture (story mode, freecam)
relates: BUG-33 (stream water over road — span suppression), FEAT-25 (draped cobble bed), FEAT-44 (culvert visual), road×stream causeways, MESH == PHYSICS
---
lane: C

# BUG-159: a stream mesh sheet floats over the road where a stream crosses it

## Next steps
Orchestrator: land `land/bug-159`. Then the owner looks at the capture spot in game (seed 2879661543, mark (2269.2, 950.0)).

## Summary
The FEAT-25 cobble bed drew on top of the road wherever a stream runs under a road deck. The water ribbon's span
rule keeps water that is clearly below a deck (the deck hides it), and the bed reused that span set. But the bed is
draped on the composed surface, which on a road core is the deck itself, so it laid cobble on the pavement and hung
chords up to 0.63 m above it. Fixed in the bed builder: a quad with any corner on a road core is not drawn.

## Description
### Symptom

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

### Root cause (measured headless)
The water ribbon has 0 triangles above the deck; the bed owns them all. At the capture, stream `2144,896` runs
along and under the road for ~7 points (its water 3–5 m below the deck, so the BUG-33 road rule keeps the span).
Bed verts there sit at `surfaceAt().h + 0.06`, and `h` is the deck (blendW 1.00). Chords between a deck row and the
channel row beside it stand up to 0.63 m above the composed deck. The suspect (unprobed outer columns) was part of
it: the fix checks all five columns.

### Fix
`computeStreamSpans` now also returns `roadW` (the road-carve blend of its three probes); `buildStreamBedMesh` reads it
for the inner columns, samples it for the outer ones, and skips every quad with a corner at blendW > 0.5 (the road
rule's own threshold). Vertices are unchanged; only indices drop. The water ribbon is untouched.

## Tracker
- [x] No stream-water or bed triangle above a road deck at the capture: `stream-bed-drape` OFF-THE-DECK, 264 → 0 triangles (worst +0.63 m → 0).
- [x] Same on seed 6's gate window (32 → 0) and three random seeds at their first crossing near the origin (83, 157, 41 → 0).
- [x] The stream still shows on both sides: only triangles touching a road core are dropped (removed ≈ the bad count on every case); DRY-SHOULDER 100 % and WET-BED 95 % unchanged.
- [ ] Owner confirms in game at the capture site.

## Links
Capture: `logs/autos-capture-1794548910307.json` + `.png` (main checkout's `logs/`, git-ignored).

## Files
`src/water-render.js` (computeStreamSpans, buildStreamBedMesh) · `test/stream-bed-drape.mjs` (OFF-THE-DECK)

## Log
- 2026-11-14, Lane C: fixed on `land/bug-159`. Gates: stream-bed-drape 11/11 (OFF-THE-DECK 0 on all 5 cases), affected run-all 1/1,
  cdp-smoke boot/drive/story PASS. fingerprint-world vs main: only `water` differs (5 of 6 windows; bed index buffers
  lose the road-core quads, every other section PASS). Not verified: the owner's in-game look.
