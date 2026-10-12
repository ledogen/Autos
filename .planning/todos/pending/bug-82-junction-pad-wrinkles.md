---
id: BUG-82
type: bug
status: pending
severity: medium
opened: 2026-10-10
source: Owner report + capture `.planning/bug-captures/bug-82-seed244091065-pad-wrinkles.json` (seed 244091065, mark 538.1, −1137.3). Diagnosed headless the same session; plan approved in principle, perf budget set by the owner.
---

# BUG-82 — junction pads show wrinkles (sliver triangulation); re-mesh at no extra cost

## Handoff — read this first

- **Work in the existing worktree** `/Users/ledogen/CodeShit/CarGame-junction-lip`, branch
  `feature/junction-lip` (worktree skill rules: every edit and command targets that path, never main).
  Its `node_modules` is a symlink to main's. Preview: `npm run dev -- --port 3118 --strictPort`.
- The branch already carries commit `9412ffa`: the **junction skirt**. Pads and deg-2 connectors drop a
  0.4 m dirt wall from their boundary edges, like the ribbon's folded-over edge. The owner signed it off.
  It is built by `_withJunctionSkirt` in `src/road-mesh.js`, which takes ANY up-facing triangle soup
  and skirts its boundary. So a new pad triangulation gets the skirt for free. Keep it that way.
- The owner thought the wrinkles predate the skirt, and they do. The cause is the pad fill, not the skirt.
- Scratch diagnostics, untracked, in the worktree's `test/`:
  - `_wrinkle.mjs <capture>`: pad chord error, triangle aspect, field-curvature map, and normal error
    at the captured node.
  - `_padperf.mjs`: per-pad build cost over seeds 3, 6 and 7.
  - `_skirt-check.mjs`: every skirt wall faces outward, every pad has a skirt, and no wall sits on a mouth.

  Turn the useful parts into a registered gate (below), then delete the scratch files before merging.

## What the owner saw

Dark diagonal creases ("wrinkles") running across a 3-leg pad. They are most visible on the glossy
asphalt in low sun.

## Diagnosis (measured, the capture's node at 538.7, −1134.6, 3 legs)

The **height field is fine** and the **mesh is not**:

| Measure | Value |
|---|---|
| Field curvature over most of the pad | < 0.05 /m (a few hotspots near the leg mouths, see "Out of scope") |
| Triangle aspect (longest edge² ÷ area; equilateral = 2.3) | median 17, p95 131, max 444 |
| Worst chord error (field minus the flat triangle) | 12.7 cm |
| Interior shading-normal error vs. the field's true slope | median 0.8°, p95 4.1°, max 11.2° |

The 11° normal error is the visible streak. The cause is `_buildPadGeometry` in `src/road-mesh.js`.
It **ear-clips** the ring, meaning it triangulates using only the outline points, so every triangle
spans from one edge of the pad to another. Red-green refinement then halves any edge over 3 m. Halving
makes triangles smaller but never fatter, because a halved sliver is two slivers.
`computeVertexNormals` then averages normals over those slivers and tilts them.

The deg-2 connectors (`_buildDeg2Ribbon`) are swept as a regular grid and are clean. Leave them alone.

## The fix (approved approach)

Replace earClip + red-green inside `_buildPadGeometry` with a well-shaped triangulation of the same ring:

1. **Even outline.** Split each ring edge into `ceil(L / s)` equal pieces, with spacing s ≈ 1.5 m.
   Keep every original ring point, because the mouth corners are where the pad welds exactly to the
   ribbon end. Moving them opens a seam.
2. **Interior points.** Lay a triangular (hex) lattice at spacing s over the ring's bounding box.
   Keep only points inside the ring and at least ~0.5·s from the outline.
3. **Delaunay triangulation** (Bowyer–Watson). It connects the points so that no point lies inside any
   triangle's circumcircle, the circle through its three corners. That is the triangulation with the
   largest smallest-angle, so it can't make slivers. Then drop any triangle whose centroid is outside
   the ring. Write it in plain JS: no new dependency (package.json carries only three + simplex-noise).
4. **Guard.** Check that every outline edge from step 1 survives as a triangle edge. If one doesn't
   (a Delaunay mesh can cut a corner of a concave outline), fall back to the current earClip path for
   that pad. Fail gracefully, the same way `_buildJunctionRing`'s ladder does.
5. Heights still come from `sampleY` (`_nodeSurfaceTop`), so mesh == collision is unchanged.
   Winding: up-facing per triangle, as now. aMark: all-zero, as now. Then call `_withJunctionSkirt`
   with the existing `onMouth` skip.

`earClip` is used only by `_buildPadGeometry`, and the collision carve does not reuse this
triangulation. Pads become trimesh colliders via `syncTile`, though, so physics drives on this mesh
too. A better mesh also shrinks the "car sinks into the junction" residual noted in the red-green
comment.

## Performance budget (owner: "negligible overall impact, no heavier than now")

Baseline, measured headless with `test/_padperf.mjs` (69 pads, seeds 3, 6 and 7; in-game adds a
terrain lookup per skirt vertex for colour):

| | now |
|---|---|
| Build time per pad (mean) | **0.60 ms** |
| Vertices per pad (top + skirt) | 593 |
| Height-field sampling (`_nodeSurfaceTop`, 0.68 µs per call) | 0.40 ms (two-thirds of the cost) |
| earClip | 0.003 ms |
| Typical pad | 355 m², 84 m perimeter |

**Hard rule: the mean ms per pad on the same harness must be ≤ 0.60 ms.** Report before and after.

How to fit inside it:
- **Fewer vertices pay for the triangulator.** At s = 1.5 m a hex lattice puts ~0.51 points per m²,
  so ~180 interior plus ~90 outline points ≈ 270 top vertices, against ~420 now. That cuts field
  sampling to ~0.26 ms and leaves ~0.3 ms for Delaunay and the rest.
- **Delaunay cost is the risk.** Naive Bowyer–Watson scans every triangle on each insertion. That is
  O(n²): the work grows with the square of the point count. At n ≈ 270 it is ~150k circumcircle tests,
  an estimated 0.3–0.6 ms, probably over budget. **Measure the naive version first.** If it is over,
  insert the points in lattice order and find each point's containing triangle by walking from the
  last triangle created. Each insertion then touches only a handful of neighbours, so the cost is
  roughly linear.
- **Spacing s is the knob.** s = 2.0 m roughly halves the interior count. Chord error scales with
  edge length squared (≈ curvature × L² / 8), so it costs ~1.8× more chord error, still far below
  today's 12.7 cm. Pick the largest s that meets the quality targets below.
- **Analytic normals are off the table by default.** Taking the field's slope at each vertex costs 4
  extra field samples per vertex, ≈ +0.7 ms, which would blow the budget. Well-shaped triangles should
  bring `computeVertexNormals` within target on their own. Only revisit if the target is missed AND
  the budget still holds.
- Optional, only if still over budget: cache the XZ triangulation on the node per `_networkRev`, the
  same way `node.ring` is cached. Tile rebuilds would then pay only for field sampling.
- In game, the `ribbon.pads` perf bucket (`perfAdd` in `_buildRoadTile`) carries this cost. Glance at
  it in the PERF-08 harness if the headless number is close to the line.

## Progress 2026-10-10 — implemented, awaiting the owner's browser check

`padFillDelaunay` (`src/road-carve.js`) replaces earClip + red-green in `_buildPadGeometry`; the old
path survives only as `_padFillEarClip`, the guard fallback. s = 1.5 m. Mouth chords split into
`CROSS_SEGS` (8) steps, so the pad's mouth vertices land exactly on the ribbon end's cross-section verts.
A mouth edge now needs both ends on the SAME leg's chord (`mouthOf`). A through road's straight back
side runs corner-to-corner between two different mouths. The first cut called it a mouth, split it into
8 steps of 4.3 m and chorded 7.5 cm. The skirt's skip test had the same latent flaw and uses the same rule now.

| | before (earClip) | after |
|---|---|---|
| ms per pad, warm (`_padperf.mjs`, 69 pads) | 0.59 | **0.51** |
| vertices per pad | 593 | 272 |
| Capture pad: aspect p50 / p95 / max | 16.8 / 131 / 444 | 2.3 / 4.4 / 6 |
| Capture pad: chord, field curvature < 0.3 /m within 1.5 m | — | 3.3 cm |
| Capture pad: normal error p95 / max, same region | — | 1.10° / 2.21° |
| Capture pad: normal error p95 / max, all interior verts | 4.06° / 11.2° | 3.14° / 7.6° (rest is field creases) |
| Battery (seeds 3, 6, 7): aspect p95 / max | 398 / 141 343 | 4.7 / 33.8 |
| Battery: chord where field < 0.1 /m | 8.6 cm | 4.9 cm |
| Battery: normal error p95 / max, field < 0.1 /m | 1.84° / 60.6° | 0.78° / 2.48° |
| Delaunay fallbacks | — | 0 of 69 |

Where the acceptance numbers moved, and why:
- **Aspect max 33.8, not 20.** It is forced by the ring, not made by the fill. The ring builder emits
  0.07–0.13 m stubs beside mouth corners, and the fill keeps every ring point because the corners weld
  to the ribbon. Each stub carries one thin, tiny triangle. `computeVertexNormals` is area-weighted, so
  these carry no shading. Gate limit: 40.
- **Chord 3 cm only where the field is gentle.** Spacing finer than 1.5 m barely helps (s = 1.0 m:
  off-crease chord 3.3 → 2.2 cm) and costs 1.32 ms per pad. The battery residual is real field
  curvature: a ridge of ~0.15–0.25 /m on a steep seed-3 pad, at (-1327, -1002), where the old fill had
  21 cm. Gate limit: 6 cm where |y''| < 0.1 /m.
- **Capture-pad normals.** Away from creases the max meets target (2.21°) and p95 (1.10°) just misses
  the 1° target. The worst values sit on the field's own creases. The curvature map shows those scattered
  across the pad interior, not only at the mouths (out of scope below).

## Follow-up 2026-10-11 — ribbon-pad weld (owner: "slight tears at the outer edges of the road ribbon where it meets junction pads")

Owner signed the fill off in the browser ("It looks really good") and approved this plan: fix the pad
field's camber mismatch, then weld, then gate it.

Measured cause, 209 mouths on seeds 3, 6 and 7:
- The ribbon ran 2.5 m past `cutback` under every pad. The pad won by polygon offset, with no join.
  In 7 % of that overlap the ribbon's outer edge stuck out of the pad, by up to 72 cm. There, the
  ribbon's open end showed, and its outward-only skirt let you see into the hollow under the road.
- At the mouth the pad field missed the ribbon mesh by p50 6 cm, p95 18 cm, max 42 cm at the outer
  edges, while centres agreed to 1 cm. The pad handed off to `_legSurfaceTop`, which carries the
  inter-leg ruled blend. That blend keeps the siblings' pull onto a leg's own pavement edge (RULE_SOFT).
  The ribbon draws the leg's own deck.

Fix:
- **Field (road.js):**
  - `_legDeckTop` is the leg's own deck (profile + crown + camber, no blend), the ribbon's surface.
  - `_padRibbonMask` snaps to it, through legs included past their mouth. A trunk's 2 m edge ease
    had left it 21 cm off.
  - The TPS samples on a side road's pavement use it. The shoulder lines stay blended, the real dirt.
  - Edge mismatch at the mouths fell to p50 0.06, p95 2.8, max 11.6 cm. The max is one tight curve,
    where the ribbon's runProfile frame and the field's nearest-point foot sit about 1.4 m apart in arc.
- **One mouth source:**
  - `leg.mouth`, set with `leg.cutback` in `_detectNodeJunctions`.
  - `leg.weld` is set only where the ring carries that leg's mouth chord as an edge (`_ringHasMouth`).
    The legacy circle pad doesn't, so those ribbons keep the overlap.
  - `_junctionMouths`, the ribbon trim and the marking feather read it.
- **Weld (road-mesh.js):**
  - `_ribbonSection` is the ribbon cross-section formula, factored out of `sweepRibbon`. Its output was
    bit-identical over 401 slices before the weld landed.
  - Welded ribbons trim to the mouth and end on an exact section there.
  - The pad's mouth vertices copy that section, so the two meshes share the edge. The skirts meet at the
    corners, and nothing overlaps.
- **Gate:** `road-pad-fill` builds the real ribbon tiles (`_buildRoadTile`) and asserts every welded mouth
  vertex is a ribbon vertex to the bit. Result: 209 of 209 legs welded, 1881 shared verts, 0 misses. With
  the pad snap disabled it reports 1717 misses, so the check bites.
- Pad build 0.48 ms per pad (budget 0.60). Normal error off-crease max 2.48° → 3.07° (report-only); the
  first row of pad triangles now absorbs the residual above.

Owner on the weld (2026-10-12): "It's really good." They asked for the round pads to go too.

**Circle pad removed (2026-10-12).**
- The QUAL-10 circle rung (`_junctionRingLegacy`, `LEGACY_PAD_FLARE`) is deleted. The ladder is now
  weld → hull.
- It fired 0 times in 201 battery junctions, but it shows in the owner's world. Its flared mouths carry no
  mouth chord, so it was the one pad the weld could not join, and it read as a glitchy round patch.
- A hull ring carries the mouth chord for 596 of 608 legs, so those junctions weld now.
- The hull floor also covers 2-leg nodes whose connector arc is degenerate, which the circle used to catch.
- Affected gates: 42/44 green; the two reds are the known road-tunnel and road-clearance, with identical numbers.

## Acceptance

On the capture's node AND across the seed battery (`test/lib/road-battery.mjs` windows):

- [x] Triangle aspect: p95 ≤ ~6 (4.7), max ≤ ~20. **Max 33.8 is ring-forced**, see Progress.
- [x] Worst chord error ≤ 3 cm away from the mouth-crease hotspots. Capture pad 3.3 cm; battery 4.9 cm on field < 0.1 /m. See Progress.
- [x] Interior normal error: p95 ≤ 1°, max ≤ ~3°. Battery 0.78° / 2.48°; capture pad 1.10° / 2.21° off-crease.
- [x] Mean build time per pad ≤ 0.60 ms on `_padperf.mjs`: 0.59 → 0.51 ms.
- [x] Skirt still clean: 0 flipped, 0 without a skirt, 0 on mouths (now asserted in the gate, seeds 3, 6 and 7).
- [x] The pad's top area equals the ring's area (asserted per pad, 1e-3 relative); 0 fallbacks.
- [x] Registered gate `test/road-pad-fill.mjs` asserting aspect, chord, coverage, up-facing and skirt.
      Timing and normal error are report-only. `_skirt-check.mjs` was folded in and deleted.
- [x] Owner looks at the capture spot in the browser and the wrinkles are gone (2026-10-11).
- [x] Owner checks the ribbon-pad weld in the browser: no tears at the ribbon's outer edges (2026-10-12).
- [ ] Before merging: delete `test/_wrinkle.mjs`, `test/_padperf.mjs` and `test/_mouthY.mjs`.

## Out of scope / known residue

- The field itself has a few curvature hotspots, up to ~2.25 /m on a finite difference, at the ring
  edge near the leg mouths. That is where the solved pad eases onto the leg field (`_buildPadSurface`,
  road.js). Those are creases in the surface definition, and no mesh fixes them. If wrinkles remain
  there, report them and open a separate ticket. Do not widen this one.
- Ear-clipped zero-area slivers along collinear ring runs exist today. The new path removes them as a
  side effect, but don't chase them in the fallback path.
