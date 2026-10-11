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

## Acceptance

On the capture's node AND across the seed battery (`test/lib/road-battery.mjs` windows):

- [ ] Triangle aspect: p95 ≤ ~6, max ≤ ~20 (now 131 / 444).
- [ ] Worst chord error ≤ 3 cm away from the mouth-crease hotspots (now 12.7 cm).
- [ ] Interior normal error: p95 ≤ 1°, max ≤ ~3° (now 4.1° / 11.2°).
- [ ] Mean build time per pad ≤ 0.60 ms on `_padperf.mjs`, with before and after reported.
- [ ] Skirt still clean: every wall outward, no pad without a skirt, zero walls on mouths (`_skirt-check.mjs`).
- [ ] The pad's top area equals the ring's area (no holes, no overlaps), and the fallback count is
      reported. It should be ~0; if not, say which pads fall back and why.
- [ ] A registered gate in `test/gates.mjs` (subsystem road, `extraDeps` as needed) asserting the
      aspect, chord and skirt checks. `road-mesh.js` currently has **no** gate covering it, so this
      closes that gap. Timing stays report-only (wall-clock asserts are flaky, per CLAUDE.md).
- [ ] Owner looks at the capture spot in the browser and the wrinkles are gone.

## Out of scope / known residue

- The field itself has a few curvature hotspots, up to ~2.25 /m on a finite difference, at the ring
  edge near the leg mouths. That is where the solved pad eases onto the leg field (`_buildPadSurface`,
  road.js). Those are creases in the surface definition, and no mesh fixes them. If wrinkles remain
  there, report them and open a separate ticket. Do not widen this one.
- Ear-clipped zero-area slivers along collinear ring runs exist today. The new path removes them as a
  side effect, but don't chase them in the fallback path.
