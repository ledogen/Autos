---
id: QUAL-11
type: quality
status: open
opened: 2026-07-01
severity: minor
source: user-request
note: "Intersection pad v2: replace QUAL-10's roughly-CIRCULAR pad with one whose boundary HUGS the roads —
each leg's ribbon edges continued in and joined to the next leg by a tangent ARC (or a spline where two
facing edges are parallel-but-non-collinear), then the enclosed surface filled. Fill is over non-planar
(3D graded) control curves. Builds on QUAL-10 (node-junction detect + terrain carve + ribbon cut-back)."
---

# QUAL-11: Intersection pad — edge-tangent arc/spline boundary + non-planar fill

## Context

QUAL-10 shipped a first-pass intersection pad: it detects the real graph junctions (`_detectNodeJunctions`
= where ≥3 streamed runs meet at a shared anchor), carves the terrain to a flat plaza (`_junctionCarve`),
cuts the swept ribbons back from the node, and drops a radiused pad into the cleared room. That fixed the
spikes and works well for **straight T/Y junctions**. Two things it does NOT do (the reason for this
ticket), confirmed by in-browser review (`test/screenshot.mjs`):

- The pad reads as a **circle** (user sketch 1) — mouths + node-centred corner arcs → convex blob — rather
  than a boundary that **hugs the roads** (concave between legs).
- On a **curved approach** the pad mouth is a **straight** extrapolation (`node + dir·T`), but the trimmed
  ribbon ends **2.6–5.3 m to the side** (measured this session) → a **seam gap / notch** where they meet.

**Desired (user sketch 2):** the intersection surface is bounded by — for each leg — its two ribbon
**edges** continued inward to the cut end, with **adjacent legs' facing edges joined by a tangent ARC**
(a real fillet), or a **spline** where the two facing edges are parallel-but-non-collinear (a single
tangent arc is ill-defined there). The enclosed region is then **filled**. The boundary welds to the
ribbon edges and the fill rides the 3D graded surface.

## Hard-won lessons from QUAL-10 (read before implementing)

- **Exact weld self-intersects.** Placing each mouth on the *actual curved ribbon end* (the correct weld)
  made **19/24 boundaries self-intersect** → flipped-sliver "spikes". Hand-built boundaries are fragile.
- **Node-centred everything assumes the node is interior.** It isn't for one-sided "pitchfork" clusters
  (all legs splay one way) — those are filtered out in QUAL-10 (Σleg-dir balance test); keep that guard.
- **`earClip` + forced up-winding** on a *simple* boundary is reliable (0 inverted / 64 pads). The whole
  game is producing a **simple (non-self-intersecting)** boundary in the first place.
- Verify visually every iteration with `node test/screenshot.mjs <x> <z> [y]` — headless-numeric checks
  (inverted normals, max vertex radius) catch spikes but NOT seams; the eye catches seams.

## Direction (decide specifics at planning)

1. **Boundary from real ribbon edges (weld).** Re-add the QUAL-10 infra removed as dead: `road.runPointAt
   (runKey, arc)` (world XZ of a run at a run-global arc) + `endArc` on node-junction legs (which endpoint
   the node sits at). For each leg sample the trimmed-end **frame** — centre `runPointAt(endpoint ±
   cutback)` + tangent `runProfile(...)` — and take its two edge points at ±halfWidth. These coincide with
   the ribbon's end cross-section → no seam.
2. **Tangent arc / spline joins.** Between adjacent legs, join the two facing edges with an arc tangent to
   both edge lines (true fillet, not node-centred). Near-parallel non-collinear edges → a cubic Hermite
   spline matching both edge endpoints + tangents (the user's parallel-edge case). Straight-through back
   sides connect straight (no bulge).
3. **Robust non-planar fill (the crux).** The control curves are 3D (graded), but the fill *topology* can
   be solved in **XZ** then **lifted**: build the closed boundary polyline in XZ, triangulate robustly
   (constrained Delaunay, or ear-clip with an explicit self-intersection guard + repair), add interior
   Steiner points (a clipped grid) so the lifted surface follows the grade smoothly, then set every vertex
   Y via `road.sampleRoadTopY` (= the physics surface → mesh==collision) and force up-winding. The
   non-planarity is handled purely by per-vertex Y sampling; XZ triangulation stays 2D.
4. **Must never self-intersect** for ANY junction (tight angles, hard curves, near-parallel legs, ≥4 legs).
   This is the QUAL-10 failure to design out — the boundary construction (not just the triangulator) has to
   guarantee simplicity, or the triangulator has to be self-intersection-tolerant.

## Acceptance

- Intersection boundary **hugs the roads** (concave between legs), welds to the ribbon edges (no seam
  gap/notch), joined by tangent arcs / splines — matches user sketch 2, not a circle.
- Holds on **curved approaches** (the QUAL-10 residual, e.g. junction near world (-38, 183) on seed 6) and
  at T / four-way / near-parallel / acute junctions — **no spikes, no seams**.
- **Window-invariant**, **mesh == collision** (fill rides `sampleRoadTopY`), `npm test` green, once-per-
  build cached path. Verified in-browser with `test/screenshot.mjs` at several junctions.

## Related

- **QUAL-10** (`qual-junction-visual-blend.md`) — the first pass this builds on (node detect, carve,
  cut-back, radiused mouth). Its `buildJunctionFootprint` / `_detectNodeJunctions` / `_junctionCarve` are
  the entry points. Sliders: Ribbon Cutback / Mouth Flare / Terrain Carve Radius.
- **`test/screenshot.mjs`** — headless CDP screenshot tool (`node test/screenshot.mjs <x> <z> [y]`) via the
  `window.__view` dev handle — the visual-verify loop for this work.
- User sketches: circular = current, edge-tangent-arc hugging boundary = wanted.
