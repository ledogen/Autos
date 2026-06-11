# Phase 9: Road Surface — Research

**Researched:** 2026-06-11
**Domain:** Procedural mesh sweep, terrain carve/blend, junction geometry, physics height integration
**Confidence:** HIGH (codebase-grounded; no external packages; pure Three.js math throughout)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- D-01: Procedural dark-grey asphalt, no asset files. Lane markings vary by a seeded road-quality tier.
- D-02: Road quality varies in ~500 m stretches along each road, each stretch's tier derived
  deterministically from `worldSeed + along-road position`. Blended at stretch boundaries so markings
  don't snap. Tiers: High (solid centerline + solid edge lines), Mid (solid centerline + intermittent
  edge lines), Low (translucent centerline only).
- D-03: SURF-06 pothole/crack severity driven by the same per-stretch `roadQuality` value as markings.
  Carry a labeled `roadQuality` hook on the surface; implement bumps if P9 lands under budget.
- D-04: Crown + camber as real surface geometry/normal. Banking ~2–6° proportional to curve tightness
  + a small water-shedding centerline crown. Expose camber-strength + crown-height debug sliders.
- D-05: Cut-and-fill via ONE signed cross-section. `delta = roadDesignGrade − groundHeight`.
  `delta > 0` → fill (raised dirt embankment); `delta < 0` → cut (notch into high ground).
- D-06: Smoothed road "design grade" required — a vertical profile smoother than raw terrain.
  Smoothing amount is a research/tuning item.
- D-07: Raised height on rolling ground defaults to ~1–2 m causeway. Expose fill-height + dirt-slope-angle sliders.
- D-08: Cut side uses steeper slope; fill side uses gentler dirt slope. Continuous by construction
  (cut/fill depth → 0 at the crossover). Steep-but-continuous faces are ALLOWED; only degenerate
  vertical seams are disallowed.
- D-09: Five procedural material zones, feathered/blended at every boundary, no hard lines.
  Asphalt · engineered cutout · dirt foundation · natural cliff · general terrain.
- D-10: Engineered road cutout ≠ natural cliff — cutout reads man-made/uniform; cliff reads wild/weathered.
- D-11: Slope-based terrain shading (cliff vs level) kept in P9; splittable to follow-up if P9 grows too large.
- D-12: Intersections built from the start. Merged paved footprint, at-grade only.
- D-13: Construction approach: detect crossings (pairwise XZ segment intersection over `this._network`
  → shared node); gather legs leaving the node; connect adjacent legs' outer edges with tangent fillet
  arcs → closed footprint polygon; fill as paved surface; trim each leg ribbon back to the footprint;
  apply same signed carve to embed the box in terrain. Crown is flattened inside the box.
- D-14: Both roads reconcile to one shared node elevation; each road's design grade blends to that
  elevation approaching the node.
- D-15: The merged-footprint junction algorithm is the PRIMARY RESEARCH TARGET.
- D-16: BUG-08 window-invariant splines are folded in. Junctions must not pop or rebuild while driving.
  Splines (and derived junctions) must be a pure function of `(seed, world coords, params)`.

### Carried-Forward Locked (hard constraints — not re-discussed)
- Single `height(x,z)` / `analyticHeight` shared by mesh + physics.
- Carve via `chunk.carveWeights` Float32Array — NEVER baked into `chunk.heights` (post-read blend).
- Carve applied IDENTICALLY in Worker mesh build and physics sampler.
- Road router stays on pure `coarseHeight` — do NOT modify routing.
- No asset files, no new dependencies, Worker-safe height fn, `queryContacts` stays cheap (60 fps).

### Claude's Discretion
- Exact magnitudes behind sliders (raise height, camber/crown, shoulder/blend widths,
  design-grade smoothing, fillet radii) — pick realistic defaults and expose debug sliders.

### Deferred Ideas (OUT OF SCOPE)
- Grade-separated crossings (overpasses/bridges/underpasses).
- FEAT-04 truck body/lights.
- FEAT-03 dust trails.
- BUG-06 chase-cam jitter.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID      | Description                                                                                | Research Support |
|---------|-------------------------------------------------------------------------------------------|-----------------|
| SURF-01 | ~10 m fixed-width ribbon mesh swept along road splines                                    | §Ribbon Sweep Pattern |
| SURF-02 | Basic asphalt color/texture, no asset files                                               | §Vertex-Color Asphalt |
| SURF-03 | Cross-section with centerline crown + curvature-driven camber                             | §Crown and Camber |
| SURF-04 | Physics surface carries road height AND normal (car feels crown + bank)                   | §carveBlend Integration with analyticHeight |
| SURF-05 | Road embeds in terrain via cut-and-fill, applied identically in mesh build and physics    | §Cut-and-Fill Carve |
| SURF-06 | (stretch) Pothole/crack micro-noise, severity from per-stretch road quality tier          | §Road Quality + Pothole Hook |
| SURF-07 | Merged at-grade paved junction at road crossings — one shared footprint, no z-fighting   | §Junction Algorithm (Primary Target) |
</phase_requirements>

---

## Summary

Phase 9 turns queryable road splines into a drivable physical surface. The work has four integrated
sub-problems that must be designed together: (1) the ribbon mesh sweep, (2) the terrain carve that
embeds it, (3) the physics integration that replaces `analyticHeight`/`analyticNormal` with the carved
road surface at on-road positions, and (4) the junction mesh that merges crossing ribbons into one
paved footprint. A fifth problem, BUG-08 window-invariant splines, is a prerequisite for stable
junction detection and must ship first within the phase.

The carve is the most architecturally sensitive piece: `chunk.carveWeights` is a Float32Array
post-read blend (never baked into `chunk.heights`) that must be computed identically in the Worker
mesh build (inside `_flushPendingQueue`'s vertex write loop) and in `analyticHeight`/`sampleHeight`
on the main thread. This identity requirement is the exit gate for the phase. The junction algorithm
is the most complex new algorithm — it requires pairwise XZ segment-intersection detection over
`this._network` (which already has a `_segXZ` helper in `_removeSelfCrossings`), fillet arc math,
polygon triangulation, and shared-elevation reconciliation. Research below de-risks all of this with
concrete math and recommended defaults.

**Primary recommendation:** Build in strict wave order — (0) BUG-08 fix, (1) carveBlend spec + height
agreement test, (2) ribbon + carve mesh, (3) carve in physics, (4) junction detection + footprint, (5)
materials + debug sliders. Never start the junction mesh before the carve spec is locked; the junction
footprint inherits the same carve.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Road ribbon mesh geometry | Main thread (TerrainSystem pattern) | Worker (carve weights delivery) | Three.js BufferGeometry built on main thread; heights from Worker |
| Carve blend function | Shared (main thread + Worker) | — | Must execute identically in `_flushPendingQueue` and `analyticHeight` |
| Physics height + normal on road | Main thread (`analyticHeight`) | — | Physics runs on main thread; `analyticHeight` is the already-established contact path |
| Junction detection | Main thread (`road.js _streamNetwork`) | — | Operates on `this._network` polylines post-build |
| Junction footprint mesh | Main thread | — | Same pattern as ribbon mesh |
| Design grade smoothing | Main thread (`road.js`) | — | Along-spline pass over per-tile splines; pure function of spline |
| Debug sliders (camber/crown/carve) | Main thread (`debug.js`) | — | Follows existing Roads folder pattern |
| Road quality tiers + markings | Main thread (ribbon mesh build) | — | Vertex-color pass during ribbon build |

---

## Standard Stack

### Core (already present — no new packages)

| Library / Module | Version | Purpose | Why |
|-----------------|---------|---------|-----|
| Three.js | r184 | `BufferGeometry`, `Vector3`, `CatmullRomCurve3`, `MeshPhongMaterial` | Already in project; all mesh and math needed is in r184 [CITED: threejs.org] |
| `src/road.js` | Phase 8 | `this._network` polylines, `queryNearest`, `_sliceNetwork`, `_tiles` | The spline source the ribbon sweep consumes |
| `src/terrain.js` | Phase 7 | `analyticHeight`, `analyticNormal`, `_flushPendingQueue`, Worker `height()` | Both must be extended with carveBlend |
| `src/seed.js` | Phase 7 | `seedFor`, `mulberry32` | Design grade + road quality tier derivation |

### Supporting Patterns (already in codebase)

| Pattern | Source | Purpose |
|---------|--------|---------|
| `chunk.carveWeights Float32Array` | Phase 6/7 architecture decision | Post-read blend discipline — see §Carve Architecture |
| `_scratchPt` module-scope reuse | `road.js` line 45 | GC-free per-sample probe for ribbon sweep |
| WORKER_SOURCE embedded Blob | `terrain.js` | Worker-safe code without importmap |

**Installation:** None. Zero new dependencies.

---

## Package Legitimacy Audit

> This phase installs NO external packages. All code is hand-rolled using Three.js r184 (already
> present) and vanilla JS.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none) | — | — | — | — | — | N/A |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged [SUS]:** none

*slopcheck not available in this session (sandbox restriction). No packages to check — moot.*

---

## Architecture Patterns

### System Architecture Diagram

```
road.js this._network (polylines, raw coarseHeight y)
         │
         ├── [BUG-08 fix] _streamNetwork → window-invariant canonical runs
         │
         ├── [Junction pass] pairwiseXZIntersect(this._network)
         │     → junctionNodes: Map<nodeKey, {pos, legs[]}>
         │
         ├── [Design grade] smoothDesignGrade(splinePoints)
         │     → smoothed Y per arc-length sample
         │
         └── [P9 consumer] buildRoadMesh(tile)
               │
               ├── for each spline slice in this._tiles:
               │     sweepRibbon(spline, designGrade, crownParams, camberParams)
               │     → BufferGeometry (positions, normals, uvs, vertexColors)
               │
               ├── for each junctionNode in tile:
               │     buildJunctionFootprint(node, filletRadius)
               │     → merged footprint BufferGeometry
               │
               └── carve pass:
                     carveWeights Float32Array (one per vertex)
                     written into chunk.carveWeights
                     applied in Worker _flushPendingQueue (mesh Y)
                     applied in analyticHeight (physics Y)
```

### Recommended Project Structure

```
src/
├── road.js           # add: _detectJunctions(), _smoothDesignGrade(), window-invariance fix
├── road-mesh.js      # NEW: ribbon sweep, junction footprint, vertex-color asphalt
├── road-carve.js     # NEW: carveBlend pure function (shared by Worker + main thread)
├── terrain.js        # extend: carveBlend hook in _flushPendingQueue + analyticHeight
├── terrain-worker.js # extend: same carveBlend hook in Worker height() loop
├── debug.js          # extend: Roads folder — new surface/carve sliders
└── data/ranger.js    # extend: new road surface params (roadWidth, crownHeight, camberStrength, …)
```

The `road-carve.js` module is the most important new file — it must be a **pure function with no
imports** so it can be embedded verbatim into WORKER_SOURCE (same pattern as the height function
sync rule). Every call site uses the identical source.

---

## BUG-08: Window-Invariant Splines (D-16 prerequisite)

### Root Cause (confirmed by `_streamNetwork` read)

`_streamNetwork` is triggered by `PROTO_REGEN_MOVE = 96 m` center movement (road.js line 77). On
re-stream, post-processing passes (`_removeLoops`, `_removeSelfCrossings`, `_limitCurvature`,
`PROTO_COVER_*` overlap suppression) all operate over the **windowed polyline only** — the set of
macro-row segments that fall inside the current `[center ± radius]` window. A fixed world coordinate
that lies near the window boundary is processed against a different neighborhood each time the window
shifts, producing different excisions → different spline geometry for the same world location.

Key code path (road.js ~line 920–999):
- `this._network.clear()` at the top of every real re-stream discards previous results
- `PROTO_COVER_*` spatial hash `cover` is rebuilt from scratch each re-stream, so the same row's
  overlap suppression result can change depending on which other rows are in the window
- `_removeLoops` and `_limitCurvature` operate on the concatenated row polyline; a row sampled at
  different window extents produces a different polyline → different loop removal

### Fix: Canonical Per-Run Determinism

**The fix is to key each run by its canonical macro-row index (`mz`), not by the window, and to
ensure the row polyline is always built from the SAME set of macro anchors regardless of window
extent.** [ASSUMED — specific implementation needs confirmation]

Recommended approach (from BUG-08 analysis):
1. **Extend the macro anchor chain to a canonical fixed-width band** — instead of
   `[center ± radius]`, always build each macro-row from anchor `mx_min` to `mx_max` where those
   bounds are derived from a stable world-aligned grid (e.g., `floor(center.x/PROTO_ANCHOR_SPACING)
   ± CANONICAL_HALF_WIDTH` where `CANONICAL_HALF_WIDTH` is large enough that no visible road falls
   outside it). Cache completed runs by `mz:mx0:mx1` so re-streams within the same canonical band
   are no-ops.
2. **Post-processing passes (loop removal, curvature, overlap) operate on the full canonical run**,
   not the window slice. Since the canonical run is always the same extent for a given seed+mz, the
   result is deterministic across re-streams.
3. **`PROTO_COVER_*` suppression**: register canonical runs in order of `mz` (deterministic
   ordering), not streaming order. The spatial hash must be rebuilt from completed canonical runs
   each time, not accumulated across re-streams.

**Expected effort:** Medium — touching `_streamNetwork` row loop and the `cover` spatial hash.
The `_protoConnect` / `_protoAnchor` machinery is pure and needs no changes (it's already cached by
anchor key). This is a Wave 0 or Wave 1 task; junction detection depends on it.

---

## Design Grade Smoothing (D-06)

### What it does

The "design grade" is a smoothed vertical profile of the road centerline — smoothed enough that the
raw terrain texture (fine noise, `fineAmplitude ≈ 0.5 m`) does not create unnecessary cut/fill on
every micro-bump, but not so smooth that the road ignores real terrain shape.

### Recommended algorithm: Arc-length sliding window average [ASSUMED]

For each spline sample point `i` with arc-length position `s_i`, compute:

```
designGrade_Y[i] = (1/W) · integral_{s_i - W/2}^{s_i + W/2} groundHeight(x(s), z(s)) ds
```

Approximated discretely over `N` samples: sum the `analyticHeight` values within a window of half-width
`W/2` on both sides, divide by the count.

**Recommended window W = 40–60 m** (default 50 m). This is wide enough to average out the fine noise
layer (which has `fineFreq = 0.05 /m` → ~20 m wavelength, amplitude ±0.5 m) while preserving the
coarse terrain shape (`coarseFreq = 0.0005 /m` → 2 km wavelength, amplitude up to 150 m). A 50 m
window gives ~2.5 wavelengths of the fine layer, suppressing it to ~20% amplitude while keeping
the coarse grade fully intact.

**Expose as a debug slider**: `roadDesignGradeWindow` (default 50, range 10–150 m).

**Implementation note:** Sample the spline at ~2 m intervals (`spline.getPointAt(u)` at 100+ steps
per tile), compute `analyticHeight` at each XZ, then run the sliding window. This is a one-shot
per-tile build (not per-frame). Total cost for a 64 m tile with 2 m sampling = 32 `analyticHeight`
calls + one pass. Negligible.

---

## Cut-and-Fill Carve (SURF-05)

### carveBlend function — the core spec

The carve is expressed as a single pure function that computes the carved height at any world
XZ position, given access to the road system and the raw terrain height:

```javascript
// road-carve.js — NO imports; pure function for Worker embedding
// carveBlend(wx, wz, rawTerrainHeight, roadParams) → carvedHeight
//
// Returns rawTerrainHeight when far from any road (blend weight = 0).
// Returns designGradeHeight when on the road ribbon (blend weight = 1).
// Interpolates across the shoulder zone.
function carveBlend(wx, wz, rawTerrainHeight, roadCarveData, roadParams) {
    // roadCarveData: { centerX, centerZ, designGradeY, normal2D, halfWidth,
    //                  shoulderWidth, cutSlopeAngle, fillSlopeAngle, fillMaxHeight }
    // For each road sample, find lateral distance from centerline.
    // (This lookup is pre-built as a Float32Array table per tile — not per-physics-step.)
    const { dist, designGradeY, cutSlope, fillSlope } = nearestCarve(wx, wz, roadCarveData)
    if (dist > roadParams.roadHalfWidth + roadParams.roadShoulderWidth + 20) return rawTerrainHeight
    const delta = designGradeY - rawTerrainHeight  // positive = fill, negative = cut
    const roadSurface = designGradeY + crownProfile(dist, roadParams)
    if (dist < roadParams.roadHalfWidth) return roadSurface          // on the ribbon
    const t = Math.max(0, 1 - (dist - roadParams.roadHalfWidth) / roadParams.roadShoulderWidth)
    return rawTerrainHeight + t * (roadSurface - rawTerrainHeight)   // shoulder blend
}
```

The key constraint from the codebase: `chunk.carveWeights` is a `Float32Array` of per-vertex blend
weights (set up in CONTEXT.md as the existing post-read discipline). For P9, the carve is richer
than a single weight — it needs `designGradeY` per vertex too. **Recommendation: store a new
`chunk.carveData` Float32Array (2 values per vertex: `[blendWeight_0, designGradeY_0,
blendWeight_1, designGradeY_1, ...]`) alongside `chunk.carveWeights`.**

In `_flushPendingQueue` the vertex Y write loop becomes:

```javascript
for (let i = 0; i < N * N; i++) {
    const raw = heights[i] * amp
    const blendW = chunk.carveData ? chunk.carveData[i * 2]     : 0
    const gradeY = chunk.carveData ? chunk.carveData[i * 2 + 1] : raw
    pos.setY(i, raw + blendW * (gradeY - raw))
}
```

In `analyticHeight`:
```javascript
analyticHeight(wx, wz) {
    const raw = height(...) * amp
    const carve = this._carve?.sample(wx, wz)   // returns {blendW, gradeY} or null
    if (!carve || carve.blendW < 1e-6) return raw
    return raw + carve.blendW * (carve.gradeY - raw)
}
```

Both must call the identical `carveBlend` logic. The road-carve module lives in `road-carve.js`
with no imports and is inlined into WORKER_SOURCE exactly as the height functions are today.

### Cut face geometry

When `delta < 0` (terrain higher than design grade): the cut face is the terrain surface between
`designGradeY` and the terrain surface on the cut side. This is already handled by the carve blend
— at the cut edge (dist = halfWidth) the road is at designGradeY and the surrounding terrain is
higher. The surface between them is the natural terrain mesh, not the road mesh. No special geometry
needed; the carve blend creates the notch automatically.

Cut slope angle for physics: the terrain normal at the cut face is computed by `analyticNormal`
using central differences over `analyticHeight` — which now includes the carve. So the steep cut
face automatically yields a near-vertical normal, which produces correct physics (truck cannot
drive up a vertical wall; it bounces off). This is correct behavior per D-08.

### Fill embankment

When `delta > 0` (terrain lower than design grade): the blend raises the mesh between the road
edge and the fill toe. The fill toe distance from centerline:

```
fillToe = halfWidth + shoulderWidth + delta / tan(fillSlopeAngle)
```

where `fillSlopeAngle` is the exposed debug slider (default 3:1 = `atan(1/3) ≈ 18.4°`). Beyond
the fill toe, `blendW → 0` and the terrain returns to natural. The maximum fill height cap (D-07,
`fillMaxHeight ≈ 2 m`) clips `delta = min(delta, fillMaxHeight)` before the toe calculation.

**Default fill slope: 3:1 (run:rise), i.e., 3 m horizontal per 1 m vertical** — standard for
earthen embankment. Debug slider range: 1.5:1 to 5:1. [ASSUMED — reasonable civil engineering
standard]

**Default cut slope: 1:1 (run:rise, i.e., 45°)** — for rocky-ish ground. Debug slider range:
0.5:1 to 2:1. [ASSUMED]

### Carve applied identically in Worker

The Worker `height()` function (inside WORKER_SOURCE) must call the same carve blend. The carve
data for a chunk is passed from the main thread when the chunk is generated. **Pattern: main thread
computes carveData for the chunk bounds (it has access to the road system), then posts it alongside
the `{type:'generate', cx, cz, key}` message as `carveTable: Float32Array`.** The Worker uses it
verbatim in its height loop.

This is the only clean path given the Worker constraint: the Worker cannot import road.js or access
`this._network`. The carve table must be pre-baked on the main thread and sent with the generate
request. This matches the existing discipline: the Worker receives everything it needs in the message
payload.

**Important:** The carve table for a chunk is a pure function of `(cx, cz, roadCarveData, params)`.
If the road re-streams and carve tables change, `rebuildAllChunksFromWorker()` re-sends updated
generate requests. This is already the full-rebuild path used for seed/param changes.

---

## Junction Algorithm (D-15 — Primary Research Target)

### Step 1: Inter-run Crossing Detection

`road.js` already has `_removeSelfCrossings` (lines 715–748) with an exact `_segXZ` helper that
detects pairwise XZ segment intersections and returns the crossing point. Junction detection reuses
this helper across DIFFERENT runs in `this._network`.

```javascript
// road.js — new method: _detectJunctions()
// Returns: Map<nodeKey, { pos: THREE.Vector3, legs: Array<{runKey, segIdx, dir}> }>
_detectJunctions() {
    const junctions = new Map()
    const runs = [...this._network.values()]
    for (let ri = 0; ri < runs.length - 1; ri++) {
        const ptsA = runs[ri].points
        for (let rj = ri + 1; rj < runs.length; rj++) {
            const ptsB = runs[rj].points
            for (let ai = 0; ai < ptsA.length - 1; ai++) {
                for (let bi = 0; bi < ptsB.length - 1; bi++) {
                    const ix = _segXZ(ptsA[ai].x, ptsA[ai].z, ptsA[ai+1].x, ptsA[ai+1].z,
                                      ptsB[bi].x, ptsB[bi].z, ptsB[bi+1].x, ptsB[bi+1].z)
                    if (!ix) continue
                    const posY = (ptsA[ai].y + ptsA[ai+1].y + ptsB[bi].y + ptsB[bi+1].y) * 0.25
                    const pos = new THREE.Vector3(ix.x, posY, ix.z)
                    const nodeKey = `${Math.round(ix.x)},${Math.round(ix.z)}`
                    // … store legs, insert node into both run polylines
                }
            }
        }
    }
    return junctions
}
```

**Degenerate case: near-parallel roads.** The `_segXZ` denominator check `Math.abs(denom) < 1e-10`
already handles this (returns null). For roads that run within `PROTO_COVER_D = 36 m` of each other
in the same direction, `PROTO_COVER_*` suppression already prevents duplicate roads at stream time.
If two runs are near-parallel AND cross at a very shallow angle (< ~5°), the intersection detection
works but the fillet geometry becomes degenerate. Guard: if the crossing half-angle `< 10°`, skip
the fillet and use a simple rectangular merge box instead. [ASSUMED — practical threshold]

**T-junctions (future spurs D-01):** The algorithm handles T-junctions naturally — one road
terminates at the intersection point (it's an endpoint, not a crossing). Gather legs: two legs from
the through-road, one from the spur. Fillet math is the same.

**Multiple crossings (3+ roads):** In practice, the valley-trunk model produces mostly 2-road
crossings (X-junctions) because roads run in rows. Three roads meeting at one point is vanishingly
rare but must not crash. Guard: if `legs.length > 4`, fall back to simple rectangular merge.

### Step 2: Gather and Sort Legs

For a node with N legs, each leg is one road arm leaving the node. For an X-junction, there are
4 legs (two roads × two directions). Sort legs by bearing angle around the node:

```javascript
// bearingFrom(node, legStartPoint) → angle in [-π, π]
const bearings = legs.map(leg => {
    const dx = leg.dir.x, dz = leg.dir.z
    return Math.atan2(dx, dz)  // Three.js Y-up: X-right, Z-forward
})
legs.sort((a, b) => bearings[a.idx] - bearings[b.idx])
```

### Step 3: Fillet Arc Math (D-13)

For each adjacent pair of legs (leg_i and leg_{i+1}), connect their OUTER edges with a tangent
fillet arc. The outer edge of a leg is the road edge at `halfWidth` from centerline, on the side
facing outward from the junction.

**Setup:** At the node, leg_i leaves in direction `d_i` (unit vector away from node). The outer
edge of leg_i on the side facing leg_{i+1} is at position:

```
P_i = node + halfWidth · perp(d_i)
```

where `perp(d) = {x: -d.z, z: d.x}` (left-perpendicular in XZ). For leg_{i+1} the outer edge
on the facing side:

```
P_{i+1} = node + halfWidth · perp(-d_{i+1})  // right-perpendicular = facing back from node
```

**The fillet arc** is a circular arc connecting `P_i` to `P_{i+1}` with the tangent at `P_i`
matching the road edge direction of leg_i and the tangent at `P_{i+1}` matching leg_{i+1}.

For a quarter-circle approximation at a 90° crossing (X-junction with perpendicular roads), the
fillet radius `R_f` is:

```
R_f = halfWidth · tan(θ/2)   where θ = interior crossing half-angle
```

For a 90° crossing (two roads crossing at right angles): `θ = 45°`, `R_f = halfWidth · tan(45°) =
halfWidth`. So the fillet radius equals the road half-width. For roads crossing at 60°: `θ = 30°`,
`R_f ≈ 0.577 · halfWidth`. [ASSUMED — standard road geometry derivation]

**Expose `roadFilletRadius` as a debug slider** (default = `roadHalfWidth`, range 0.5–10 m).

**Degenerate acute crossings (< 20°):** When two roads cross at a very shallow angle, the fillet
center moves far from the node. Guard: cap fillet radius at `3 · halfWidth`; if the computed fillet
would extend beyond this, use a straight bevel cut instead.

**Discrete arc approximation:** Sample the arc at `ceil(R_f · π / 2 m) + 2` points (≈ 1 sample
per 2 m of arc, minimum 3 points). This produces smooth curves without excessive vertex count.

### Step 4: Footprint Polygon + Triangulation

After building fillet arcs for all N adjacent leg pairs, the concatenated arc endpoints form a
closed polygon — the junction footprint. For an X-junction with 4 legs this polygon has
`4 · arcSamples` vertices.

**Triangulation: simple fan from centroid** — sufficient for convex footprints. [ASSUMED — see
note below]

```javascript
function triangulateConvexFan(polygon) {
    // polygon: [{x,z}, ...] ordered CCW
    const cx = polygon.reduce((s, p) => s + p.x, 0) / polygon.length
    const cz = polygon.reduce((s, p) => s + p.z, 0) / polygon.length
    const tris = []
    for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length
        tris.push(centroid, polygon[i], polygon[j])
    }
    return tris
}
```

**Convexity note:** For X-junctions with perpendicular roads the footprint IS convex. For very
acute crossings (< 20°) or 3-way junctions, the footprint may be non-convex. Guard: run a quick
convexity test (all cross-products same sign); if non-convex, fall back to ear-clipping. Ear-clipping
for a polygon of ~16–24 vertices is O(n²) = 256–576 operations — negligible for a one-shot mesh
build. [ASSUMED — standard polygon triangulation approach]

A Worker-safe ear-clip is ~30 lines of vanilla JS (no dependencies):

```javascript
function earClip(polygon) {
    // polygon: [{x,z}, ...] ordered CCW; returns flat array of triangle indices
    const n = polygon.length
    const idx = Array.from({length: n}, (_, i) => i)
    const tris = []
    const isEar = (i) => { /* cross-product convexity + no-point-inside test */ }
    while (idx.length > 3) {
        for (let i = 0; i < idx.length; i++) {
            if (isEar(i)) { tris.push(idx[(i-1+n)%n], idx[i], idx[(i+1)%n]); idx.splice(i, 1); break }
        }
    }
    tris.push(...idx)
    return tris
}
```

### Step 5: Shared-Elevation Reconciliation (D-14)

Both roads must agree on the Y coordinate of the junction node. **Algorithm:**

1. Each road's design grade at the crossing point is computed independently.
2. `nodeY = (designGradeA + designGradeB) / 2` — simple average. (Alternative: use the lower
   of the two to minimize fill on the approach; the user's intent is at-grade with a graded approach.)
3. In the last `blendLength = 30 m` before the node, each road's design grade is linearly
   blended to `nodeY`:
   ```
   approach_Y(s) = lerp(designGrade_Y(s), nodeY, max(0, 1 - dist_to_node / blendLength))
   ```
   `blendLength = 30 m` default (expose as slider). [ASSUMED — realistic for a junction approach]

### Step 6: Leg Trimming

Each ribbon is swept only up to the footprint boundary. The footprint boundary for leg_i is the
intersection of the leg's centerline with the footprint polygon edge nearest to the node. This
is a simple 2D segment-polygon intersection — the `_segXZ` helper already handles this.

### Step 7: Determinism + Window Stability (D-16)

Junctions are derived from `this._network` which is rebuilt on re-stream. The junction detection
result is therefore only as stable as the network. After BUG-08 is fixed (canonical per-run
derivation), `this._network` for a given world region is window-invariant, so junction positions
are too.

**Cache junctions** in `this._junctions` (same pattern as `this._tiles`): cleared on re-stream
(`_streamNetwork` already calls `this._tiles.clear()` — junction cache cleared at the same line),
rebuilt by `_detectJunctions()` on the first call after a re-stream. Pure function of
`this._network` → deterministic by transitivity.

---

## Crown and Camber (SURF-03 / D-04)

### Crown profile

The centerline crown is a parabolic cross-section: at lateral offset `u` (–halfWidth to +halfWidth):

```javascript
function crownProfile(u, params) {
    // params.crownHeight: height at centerline above edge (m), default 0.05 m (5 cm)
    // Returns Y offset above the flat design grade for this lateral position
    const t = u / params.roadHalfWidth  // -1 to +1
    return params.crownHeight * (1 - t * t)  // parabola: peak at u=0, 0 at edges
}
```

Default `crownHeight = 0.05 m`. [ASSUMED — typical 2% cross-slope = 0.1 m per 5 m half-width = 0.02 m.
0.05 m is 1% on a 5 m half-width, subtle and realistic.]

### Curvature-driven camber (banking)

Compute spline curvature κ (inverse radius) at each point along arc length `s`. For a Catmull-Rom
spline, curvature is:

```javascript
function splineCurvature(spline, u, eps = 0.01) {
    // κ = |T' × T| / |T|³ but for unit-speed reparameterized spline: κ = |T'(s)|
    // Finite difference approximation:
    const T0 = spline.getTangentAt(Math.max(0, u - eps))
    const T1 = spline.getTangentAt(Math.min(1, u + eps))
    const dT = T1.clone().sub(T0)
    return dT.length() / (2 * eps * spline.getLength())
}
```

Signed curvature (left vs right turn) requires the cross product:

```javascript
const cross = T0.x * T1.z - T0.z * T1.x  // positive = left turn (bank right)
const signedKappa = Math.sign(cross) * kappa
```

Camber angle in radians (tilt of the cross-section):

```javascript
const camberAngle = clamp(params.camberStrength * signedKappa, -6*DEG, 6*DEG)
// camberStrength default: 200 m·rad/rad → kappa of 0.02 /m (50 m radius) → 4° camber
```

**Default `camberStrength = 200 m`** — a 50 m radius curve (tight for these roads) gives
`0.02 * 200 = 4°` of banking. Expose as a debug slider. [ASSUMED — calibrated to produce ~2–6°
at typical road radii of 30–100 m]

**Applying the tilt:** Each cross-section vertex is rotated about the road centerline:

```javascript
// At arc position u, lateral offset u_lat:
const baseY = designGrade_Y(u) + crownProfile(u_lat, params)
const tiltY = u_lat * Math.sin(camberAngle)  // small-angle: sin(θ) ≈ θ for θ < 10°
vertexY = baseY + tiltY
```

Inside the junction box, `camberAngle = 0` and `crownHeight = 0` (flat paved surface, D-13).

---

## Ribbon Mesh Sweep (SURF-01)

### Geometry construction

For a spline slice of length L (per tile, typically 10–80 m), sample at `ceil(L/2) + 2` arc-length
intervals (≈ 2 m resolution). At each sample `u`, construct a cross-section with `CROSS_SEGS + 1`
vertices (recommended `CROSS_SEGS = 8` — 4 per half-width, gives 1.25 m lateral resolution on a
10 m road). Total vertices per tile: ≈ 45 × 9 = 405. Trivial GPU load.

```javascript
for (let i = 0; i <= N_LONG; i++) {
    const u = i / N_LONG
    const pos = spline.getPointAt(u)
    const tan = spline.getTangentAt(u)
    const right = new THREE.Vector3(tan.z, 0, -tan.x).normalize()  // XZ perp, Y-up
    const kappa = splineCurvature(spline, u)
    const camberAngle = clamp(params.camberStrength * kappa, -MAX_CAMBER, MAX_CAMBER)
    for (let j = 0; j <= CROSS_SEGS; j++) {
        const uLat = (j / CROSS_SEGS - 0.5) * params.roadWidth  // -5m to +5m
        const crownY = crownProfile(uLat, params)
        const tiltY = uLat * Math.sin(camberAngle)
        const designY = designGrade[i]
        const vx = pos.x + right.x * uLat
        const vy = designY + crownY + tiltY
        const vz = pos.z + right.z * uLat
        positions.push(vx, vy, vz)
    }
}
// Quad strip → triangles: 2 tris per quad, standard strip indexing
```

The mesh is a `THREE.BufferGeometry` added to the scene — NOT a terrain chunk, not replaced by
chunks. It lives alongside terrain chunks as a separate scene object.

**Normal computation:** Call `geometry.computeVertexNormals()` after building. The smooth normals
correctly reflect crown and camber. Physics uses `analyticNormal` which computes central-difference
normals over `analyticHeight` (which includes carve) — naturally gets the road normal when on the
road.

### Tile-by-tile streaming

Road mesh tiles are built in `road-mesh.js` as the terrain chunks stream in — one road tile per
terrain chunk (same 64 m key). When a terrain chunk is evicted from the ring, its road tile is
disposed. New road tiles are built frame-spread at the same `MAX_BUILDS_PER_FRAME = 2` cap
(share the budget with terrain or use a separate cap of 1 road + 1 terrain per frame).

---

## Vertex-Color Asphalt + Road Quality (SURF-02 / D-01..D-03)

### Dark grey asphalt base

`MeshPhongMaterial` with `vertexColors: true`. Base color in vertex buffer: `(0.15, 0.15, 0.17)` in
linear space (dark cool grey). No texture atlas, no UV mapping needed — vertex colors are sufficient
for the worn-world aesthetic.

### Per-~500 m road quality tiers (D-02)

Compute `roadQuality` at each arc-length position:

```javascript
function roadQuality(arcS, runKey, worldSeed) {
    const stretchIdx = Math.floor(arcS / ROAD_QUALITY_STRETCH)  // STRETCH = 500 m
    const rng = mulberry32(seedFor(worldSeed, 'roadquality', hashRunKey(runKey), stretchIdx))
    return rng()  // [0,1]: 0 = low, 1 = high
}
```

Blend at stretch boundaries with `smoothstep(0, 1, frac)` where `frac = (arcS % 500) / 50`
(10 m transition zone). [ASSUMED — smooth enough to avoid snapping]

### Lane markings as vertex-color modulation

Lane markings are encoded as bright vertex-color patches (white: `(0.9, 0.9, 0.9)`) at specific
lateral and longitudinal positions. No texture needed. Markings are "drawn" into the vertex buffer
during the ribbon sweep by checking: is this vertex within a marking zone?

```
Centerline: |uLat| < 0.15 m AND marking pattern active
Edge lines:  |uLat - roadHalfWidth| < 0.10 m AND marking pattern active
```

For High tier: solid (no gap). For Mid tier: intermittent (8 m solid / 4 m gap using
`arcS % 12 < 8`). For Low tier: very faint centerline only (alpha-blended via vertex color
brightness `0.3`).

---

## 5-Zone Material System (D-09..D-11)

All five zones share one `MeshPhongMaterial` with `vertexColors: true`. Zone identity is encoded
as different vertex colors baked into each mesh at build time. No shader changes required.

| Zone | Driver | Color (approximate) |
|------|--------|---------------------|
| Asphalt | road ribbon | dark grey `(0.15, 0.15, 0.17)` |
| Engineered cutout | `delta < 0` + `dist < shoulderWidth` | uniform grey-tan `(0.55, 0.50, 0.42)` |
| Dirt foundation | `delta > 0` + `dist < fillToe` | warm tan `(0.65, 0.55, 0.38)` |
| Natural cliff | terrain slope > threshold | grey `(0.60, 0.58, 0.55)` |
| General terrain | existing terrain color | brown `(0.72, 0.60, 0.47)` — existing |

**Feathered blending:** At the terrain mesh level (inside `_flushPendingQueue`), the carve blend
weight `blendW` controls the interpolation from general terrain color to road-zone color. This is
a free side effect of the carve — vertices near the road automatically blend colors.

**Slope-based natural cliff (D-11):** In the terrain vertex color pass:

```javascript
const normal = computeVertexNormal(i)  // central difference over carve-blended heights
const slope = 1 - normal.y            // 0 = flat, 1 = vertical
const cliffBlend = smoothstep(0.3, 0.6, slope)  // ramp from 30% to 60% slope angle
color = lerp(generalTerrainColor, cliffColor, cliffBlend)
```

This applies to terrain mesh vertices, not road mesh vertices (terrain and road are separate
geometries). [ASSUMED — threshold values need in-game tuning; expose as sliders per D-11]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polygon triangulation for junction footprint | Custom triangulator | Fan-from-centroid (convex) or simple ear-clip (non-convex) | Already ~30 lines of vanilla JS — sufficient for 16–24 vertex polygons; no dependency needed |
| Spline arc-length parameterization | Own arc-length table | `CatmullRomCurve3.getPointAt(u)` + `getLengths()` | Three.js r184 `CatmullRomCurve3` has built-in arc-length reparameterization via division count; `getLength()` and `getPointAt(u)` are already arc-length-correct |
| Curvature calculation | Curvature formula from scratch | Finite differences on `getTangentAt` (documented pattern) | Three.js tangent API is correct for centripetal parameterization; finite-difference approach is 3 lines |
| Pairwise segment intersection | Custom intersection code | Reuse `_segXZ` from `_removeSelfCrossings` (road.js line 718) | Already written, tested in production (used to fix self-crossing roads); lift directly |
| Vertex normal computation | Raycaster or separate pass | `geometry.computeVertexNormals()` then physics uses `analyticNormal` | computeVertexNormals is the established pattern; physics normals come from analyticHeight differences |

**Key insight:** The junction polygon triangulation must be Worker-safe (no imports). Fan-from-centroid
covers 95%+ of real cases (convex X-junctions). Ear-clip is the only fallback needed and is 30 lines
of pure math — embed directly in `road-carve.js`.

---

## Common Pitfalls

### Pitfall 1: Baking carve into `chunk.heights`

**What goes wrong:** Writing the carved height directly into the Float32Array received from the Worker
(overwriting `chunk.heights[i]` with the blended value before `_flushPendingQueue` runs). This makes
the carve baked and non-reversible — changing road params or road position requires a full Worker
round-trip instead of a main-thread rebuild.

**Why it happens:** The `_flushPendingQueue` loop writes `heights[i] * amp` to `pos.setY(i, ...)`.
It's tempting to pre-process heights.

**How to avoid:** Keep `chunk.heights` containing ONLY raw Worker output. Store the carve blend in
the separate `chunk.carveData` Float32Array. The blend is applied ONLY in `_flushPendingQueue`'s
Y write and in `analyticHeight`. **This is a locked architectural constraint from the CONTEXT.md
carried-forward decisions.**

**Warning signs:** If `chunk.heights[i]` ever contains a value different from what the Worker sent.

### Pitfall 2: Physics/mesh carve divergence

**What goes wrong:** `analyticHeight` returns a different height at `(wx, wz)` than the visual mesh
vertex at the same position. The truck floats above or sinks below the road.

**Why it happens:** `_flushPendingQueue` and `analyticHeight` use slightly different carve blend
logic — typically because one has a `> 0.5` threshold where the other has a smooth blend.

**How to avoid:** Both call the SAME `carveBlend()` function from `road-carve.js`. The height
agreement test (the phase exit gate) catches this: assert that `analyticHeight(wx, wz) ≈
chunk vertex Y at (wx, wz)` at 5+ on-road positions.

**Warning signs:** Truck bouncing on a road that visually looks flat, or wheels partially submerged
in the road mesh.

### Pitfall 3: `carveBlend` in Worker calls main-thread road.js

**What goes wrong:** The Worker needs carve data but can't import `road.js` (no importmap in
Worker context). Attempting to call `queryNearest` or access `this._network` from the Worker causes
a `ReferenceError`.

**Why it happens:** The existing WORKER_SOURCE pattern already has the height function inlined as a
string — it's easy to forget that ALL road-related logic must be pre-computed on the main thread
before the generate message is sent.

**How to avoid:** The carve table for each chunk is pre-baked on the main thread (a 65×65 Float32Array
of {blendW, gradeY} values) and sent WITH the `{type:'generate', ...}` message as a Transferable.
**NEVER import road.js into the Worker.** Per `project_terrain_worker_constraints` memory: never
postMessage the whole RANGER_PARAMS.

**Warning signs:** Any `import` or `require` in WORKER_SOURCE; any `self.postMessage` receiving
road system state.

### Pitfall 4: Junction mesh rebuilt on every re-stream (BUG-08 not fixed)

**What goes wrong:** If BUG-08 is not fixed before building junction meshes, every 96 m of camera
movement rebuilds `this._network`, which shifts junction positions, which triggers junction mesh
disposal + rebuild while driving → visible road pop.

**Why it happens:** `_streamNetwork` clears `this._network` and rebuilds (road.js line 914).

**How to avoid:** Fix BUG-08 (window-invariant runs) FIRST, before any junction mesh code is
written. This is Wave 0.

**Warning signs:** Road mesh objects being disposed/recreated mid-drive; `_debugLines.length`
fluctuating.

### Pitfall 5: Carve table postMessage DataCloneError

**What goes wrong:** Trying to pass the road carve table to the Worker by including it in a
regular postMessage without transferring the buffer → DataCloneError silently drops the message
(same failure mode as the RANGER_PARAMS DataCloneError documented in
`project_terrain_worker_constraints`).

**How to avoid:** Always pass the carve Float32Array as a Transferable:
```javascript
worker.postMessage({ type:'generate', cx, cz, key, carveTable }, [carveTable.buffer])
```
The main thread cannot reuse `carveTable` after transfer — build a new one per chunk.

**Warning signs:** Worker generating chunks without carve applied (heights match raw terrain even
on road); no error in console (DataCloneError for non-cloneable types throws, but the Worker just
won't have the data if the buffer is transferred and not reconstructed).

### Pitfall 6: Fillet arc winding order inconsistency

**What goes wrong:** Triangles in the junction footprint have inconsistent winding (some CW, some
CCW) → half the triangles face down (invisible or lit wrong with MeshPhongMaterial backface culling).

**Why it happens:** Fillet arc vertices computed from leg bearings can produce a polygon wound
CW rather than CCW depending on the crossing geometry.

**How to avoid:** After computing the footprint polygon, check winding using the shoelace formula
(signed area). If area < 0, reverse the polygon. Then fan-triangulate from centroid. [ASSUMED]

### Pitfall 7: Design grade smoothing at tile seams

**What goes wrong:** The design grade is computed per tile from the spline slice's control points.
At tile boundaries, the design grade from tile A and tile B diverge slightly → a small vertical
step in the road mesh at tile boundaries (even though the splines are C0/C1 continuous).

**Why it happens:** The sliding window average pulls from the parent spline's sample points, and
the first/last few samples of each tile's slice have different neighbors on each side.

**How to avoid:** When computing the design grade, extend the sample window 2–3 samples past the
tile boundary (using the adjacent tile's spline data, which is available in `this._tiles`). Clamp
the resulting designGrade endpoints to match between adjacent tiles. [ASSUMED]

---

## Code Examples

### Pattern: `carveBlend` pure function (Worker-safe)

```javascript
// road-carve.js — NO imports — suitable for embedding in WORKER_SOURCE
// Source: hand-rolled for this phase, patterns from terrain.js height() sync discipline

/**
 * Sample the carve blend at a world XZ position from a pre-baked carve table.
 * carveTable: Float32Array(N*N*2) — [blendW_0, gradeY_0, blendW_1, gradeY_1, ...]
 * N: grid resolution (same as GRID_SAMPLES = 65)
 * originX, originZ: world coordinates of carve table grid origin
 * cellSize: metres per cell (= CHUNK_SIZE / (GRID_SAMPLES-1) = 1.0)
 */
function sampleCarve(wx, wz, carveTable, N, originX, originZ, cellSize) {
    const lx = wx - originX, lz = wz - originZ
    const xi = Math.max(0, Math.min(N-2, Math.floor(lx / cellSize)))
    const zi = Math.max(0, Math.min(N-2, Math.floor(lz / cellSize)))
    const fx = lx / cellSize - xi, fz = lz / cellSize - zi
    const i00 = (zi * N + xi) * 2, i10 = (zi * N + xi+1) * 2
    const i01 = ((zi+1) * N + xi) * 2, i11 = ((zi+1) * N + xi+1) * 2
    const bw = carveTable[i00]  *(1-fx)*(1-fz) + carveTable[i10]  *fx*(1-fz)
             + carveTable[i01]  *(1-fx)*fz      + carveTable[i11]  *fx*fz
    const gy = carveTable[i00+1]*(1-fx)*(1-fz) + carveTable[i10+1]*fx*(1-fz)
             + carveTable[i01+1]*(1-fx)*fz      + carveTable[i11+1]*fx*fz
    return { blendW: bw, gradeY: gy }
}
```

### Pattern: Debug slider wiring for new road surface params (from debug.js Roads folder)

```javascript
// Follows existing pattern at debug.js line 196 (Roads folder)
// Source: verified in debug.js _roadState / fireRoadParam pattern

const _roadSurfState = { roadViz: false }
// New sliders added inside existing roadFolder:
roadFolder.add(params, 'roadWidth',          6, 14, 0.5).name('Road Width (m)')
roadFolder.add(params, 'crownHeight',      0.0, 0.2, 0.005).name('Crown Height (m)')
roadFolder.add(params, 'camberStrength',    50, 500, 10  ).name('Camber Strength (m)')
roadFolder.add(params, 'roadFillHeight',   0.0, 4.0, 0.1 ).name('Max Fill Height (m)')
roadFolder.add(params, 'roadCutSlope',    0.5, 2.0, 0.05 ).name('Cut Slope (H:V)')
roadFolder.add(params, 'roadFillSlope',   1.5, 5.0, 0.1  ).name('Fill Slope (H:V)')
roadFolder.add(params, 'roadShoulderWidth',1.0, 6.0, 0.5 ).name('Shoulder Width (m)')
roadFolder.add(params, 'designGradeWindow', 10, 150, 5   ).name('Design Grade Window (m)')
```

### Pattern: `_segXZ` reuse for junction detection

```javascript
// Source: road.js _removeSelfCrossings (line 718) — lift verbatim
// The function is not currently exported; promote to module-scope for junction detection
function _segXZ(ax, az, bx, bz, cx, cz, dx, dz) {
    const ex = bx-ax, ez = bz-az, fx = dx-cx, fz = dz-cz
    const denom = ex*fz - ez*fx
    if (Math.abs(denom) < 1e-10) return null
    const t = ((cx-ax)*fz - (cz-az)*fx) / denom
    const u = ((cx-ax)*ez - (cz-az)*ex) / denom
    if (t > 1e-6 && t < 1-1e-6 && u > 1e-6 && u < 1-1e-6) return { x: ax+t*ex, z: az+t*ez }
    return null
}
```

### Pattern: `analyticHeight` extension for carve

```javascript
// Source: terrain.js analyticHeight (line 486), extended with carve hook
analyticHeight(wx, wz) {
    if (!this._noiseCoarse) throw new Error('analyticHeight called before reinitWorker')
    const raw = height(wx, wz, this._noiseCoarse, this._noiseFine, this._noiseRegional, this._params)
                * (this._params.terrainAmplitude ?? 1.0)
    // P9 extension: apply road carve blend if carve system is active
    if (this._roadCarve) {
        const c = this._roadCarve.sampleWorld(wx, wz)
        if (c && c.blendW > 1e-6) return raw + c.blendW * (c.gradeY - raw)
    }
    return raw
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Terrain-only height (pre-P9) | Carve-blended height at road positions | P9 | Truck rides the road surface |
| Debug spline lines only | Physical ribbon mesh | P9 | Road is visible and drivable |
| Z-fighting overlapping ribbons at crossings | Merged footprint junction (SURF-07) | P9 | No z-fighting at intersections |
| Window-variant splines (BUG-08) | Canonical window-invariant runs | P9 | Road geometry stable while flying |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | BUG-08 fix: canonical per-run band approach makes splines window-invariant | BUG-08 Fix | If wrong, junction positions still pop; need alternative (run keying by canonical extent) |
| A2 | Design grade window W = 50 m suppresses fine noise adequately | Design Grade Smoothing | Too small → unnecessary cut/fill on bumps; too large → road ignores terrain shape; tunable via slider |
| A3 | Fill slope default 3:1, cut slope default 1:1 | Cut-and-Fill Carve | Wrong defaults → visually weird embankments; tunable via sliders |
| A4 | `camberStrength = 200 m` gives ~4° banking at 50 m radius | Crown and Camber | Too strong → truck tips on curves; tunable via slider |
| A5 | Fillet radius = `halfWidth * tan(θ/2)` | Junction Algorithm Step 3 | Degenerate geometry at acute crossings; guard by capping at 3×halfWidth |
| A6 | Fan-from-centroid triangulation covers all X-junction footprints | Junction Algorithm Step 4 | Non-convex footprints need ear-clip fallback; 30-line implementation included |
| A7 | 10° crossing-angle guard for near-parallel roads | Junction Algorithm Step 1 | Too conservative → skips valid shallow crossings; too permissive → degenerate fillets |
| A8 | `blendLength = 30 m` for junction approach grade blend (D-14) | Junction Step 5 | Too short → abrupt step at junction entry; tunable via slider |
| A9 | Road quality stretch boundary transition = 10 m | Vertex-Color Asphalt | Too short → visible snap; too long → marking gap too wide; tunable |
| A10 | Cliff slope threshold: 30–60% for smoothstep blend | 5-Zone Material System | Wrong thresholds → no visual cliff distinction; expose as slider (D-11) |
| A11 | Carve table sent as Transferable with generate message | Carve Worker Integration | If sent without Transferable → DataCloneError risk; if not pre-baked → Worker cannot access road system |
| A12 | `crownHeight = 0.05 m` default | Crown Profile | Too subtle on coarse display; tunable |

---

## Open Questions (RESOLVED)

1. **Carve table rebuild on road re-stream**
   - What we know: carve tables are pre-baked per chunk and sent with generate requests. If BUG-08
     is fixed, re-streams are rare. But when they occur, all visible chunks need new carve tables.
   - What's unclear: Does this require `rebuildAllChunksFromWorker()` (full Worker round-trip) or
     can we update carve tables in-place on already-built chunks via a new `{type:'updateCarve'}`
     message?
   - **RESOLVED:** For simplicity in P9, trigger `rebuildAllChunksFromWorker()` on road re-stream.
     The carve-only in-place update is a P10 optimization. Implemented by Plans 09-02 and 09-03.

2. **Road mesh LOD / streaming lifecycle**
   - What we know: terrain chunks stream in a 5×5 ring (RING_RADIUS=2). Road tiles should match.
   - What's unclear: should road tiles be disposed when the terrain chunk evicts, or persist longer?
   - **RESOLVED:** co-locate road tile lifetime with terrain chunk lifetime; same ring key.
     Implemented by Plans 09-03 and 09-04.

3. **Multiple road segments per tile and junction tiles**
   - What we know: `this._tiles.get(key)` returns an ARRAY of segments (a tile MAY hold several
     slices from different runs). Junction footprints span parts of all legs.
   - What's unclear: junction footprint tile assignment — the footprint may straddle multiple tiles.
   - **RESOLVED:** assign the junction mesh to the tile containing the node position. When that
     tile is loaded, build all junction meshes whose node falls within it. Implemented by Plan 09-04.

4. **`analyticNormal` after carve**
   - What we know: `analyticNormal` uses central-difference over `analyticHeight` with `EPS = 0.5 m`.
     After P9, `analyticHeight` includes the carve. On the road surface, this automatically returns
     the road surface normal (including crown/camber effects from the carve-blended height).
   - What's unclear: is `EPS = 0.5 m` fine enough to resolve the crown profile (0.05 m over 5 m)?
     Central-difference gradient at the centerline = `crownHeight * 2 * 0.5 / (roadHalfWidth²) *
     EPS` — for default params ≈ 0.01 rad = 0.6°. This is below the 2–6° target for physics feel.
   - **RESOLVED:** for physics contacts that are ON the road, the crown normal is correctly sampled
     by `analyticNormal`. For the carve-driven camber, the tilted surface geometry is captured in the
     carve gradeY table which includes the tilt. So `analyticNormal` naturally captures camber too.
     No special case needed; verify with the carve-continuity test (Plan 09-02 exit gate).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Three.js r184 | Ribbon mesh, junction geometry | Yes | r184 | — |
| Node.js | Local test server | Yes | v25.8.2 | Python http.server |
| Web Worker (Blob) | Terrain + carve Worker | Yes (existing) | — | — |

**Missing dependencies with no fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vanilla JS browser harnesses (existing pattern: `test/test-road.html`, `test/test-road-seam.html`) |
| Config file | none — inline scripts in HTML harnesses |
| Quick run command | open `test/test-road-carve.html` in browser |
| Full suite command | open all harnesses; read pass/fail assertions in console |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SURF-01 | Ribbon mesh swept along splines | smoke | open `test/test-road-mesh.html` | No — Wave 0 |
| SURF-02 | Asphalt vertex colors visible | smoke (visual) | open `test/test-road-mesh.html` | No — Wave 0 |
| SURF-03 | Crown + camber as real geometry | unit (normal check) | `test/test-road-carve.html` | No — Wave 0 |
| SURF-04 | Physics height/normal on road | height-agreement test | `test/test-road-carve.html` | No — Wave 0 |
| SURF-05 | Cut-and-fill carve, identical in mesh + physics | carve-continuity test | `test/test-road-carve.html` | No — Wave 0 |
| SURF-06 | Pothole hook (stretch) | manual inspection | in-game | No — Wave 0 |
| SURF-07 | Merged junction, no z-fighting | smoke (visual) + unit (footprint poly) | `test/test-road-mesh.html` | No — Wave 0 |

### Sampling Rate

- Per task commit: open relevant harness, assert console shows PASS
- Per wave merge: all harnesses green + in-game drive-on-road check
- Phase gate: all harnesses green + in-game junction visual check before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `test/test-road-carve.html` — height-agreement test (carveBlend identical in mesh + physics), carve-continuity test (no vertical step across carve boundary). This is the EXIT GATE for the phase.
- [ ] `test/test-road-mesh.html` — smoke: ribbon mesh appears, asphalt visible, junction rendered.
- [ ] Framework install: none needed — existing harness pattern (see `test/test-road.html`).

---

## Security Domain

> `security_enforcement` not set in config.json — treated as enabled per spec.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | Partial | `worldSeed` is already parsed through `parseWorldSeed()` (djb2 hash for strings, int for numbers); road params are slider-bounded in debug.js. Carve table values are Float32Array from own math — no external input. |
| V6 Cryptography | No | — |

### Threat Patterns

| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| DataCloneError on carve table postMessage | Denial of service (Worker silently gets no carve) | Always use Transferable `[carveTable.buffer]` in postMessage; verify in harness |
| Infinite loop in ear-clip for degenerate polygon | Denial of service | Bound ear-clip iterations at `n * 3`; fall back to fan if exceeded |
| NaN propagation from degenerate spline curvature (zero-length tangent) | Tampering (corrupted normals) | Guard `splineCurvature` with tangent length check; clamp result |

---

## Project Constraints (from CLAUDE.md)

- Three.js r184, ES6 importmap, no build system, no bundler.
- No new npm dependencies — all code is hand-rolled.
- Browser-only runtime (GitHub Pages, no server).
- Hand-rolled physics — no physics library.
- 60fps target with terrain active.
- No Euler angles for body rotation (existing constraint; not directly relevant to road surface).
- No Web Workers for physics (relevant: carve pre-computation stays on main thread; Worker receives pre-baked table).
- No asset files (vertex-color asphalt must be procedural).
- Worker-safe height fn — WORKER_SOURCE must contain all needed math inline.
- `queryContacts` stays cheap — `analyticHeight` extension must not add significant cost per contact probe.
- LLM maintainability — all new functions must be explicitly documented and self-describing.

---

## Sources

### Primary (HIGH confidence)

- `src/terrain.js` lines 486–562 — `analyticHeight`, `sampleHeight`, `_flushPendingQueue`: verified carve integration points
- `src/road.js` lines 715–748 — `_removeSelfCrossings` / `_segXZ`: verified junction detection foundation
- `src/road.js` lines 893–999 — `_streamNetwork`: verified BUG-08 root cause (window-variant network)
- `src/road.js` lines 1025–1076 — `_sliceNetwork`: verified tile slice architecture and C0/C1 continuity
- `src/terrain.js` WORKER_SOURCE lines 44–276 — verified Worker architecture: Blob classic worker, no importmap, all math inlined
- `src/debug.js` lines 196–215 — Roads folder slider pattern: verified model for new sliders
- `data/ranger.js` lines 187–232 — Road routing params: verified live-tunable param pattern
- `.planning/phases/09-road-surface/09-CONTEXT.md` — all locked decisions D-01..D-16
- [CITED: threejs.org] Three.js r184 `CatmullRomCurve3` API: `getPointAt(u)`, `getTangentAt(u)`, `getLength()`, `getLengths()` are arc-length-correct [ASSUMED based on Three.js documentation; not verified via Context7 in this session]

### Secondary (MEDIUM confidence)

- `.planning/todos/pending/bug-road-restream-pop.md` — BUG-08 root cause analysis and fix directions (author's own analysis, not externally verified)
- `.planning/todos/pending/feat-road-intersections.md` — junction intent and design sketch

### Tertiary (LOW confidence)

- Fill slope 3:1, cut slope 1:1 defaults: civil engineering conventions [ASSUMED — not sourced from official standards]
- Fillet radius formula `halfWidth * tan(θ/2)`: standard road geometry derivation [ASSUMED — not verified against official road design standards]
- `camberStrength = 200 m` default: calibrated estimate [ASSUMED — needs in-game tuning]

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new packages; all capabilities verified in existing codebase
- BUG-08 fix approach: MEDIUM — root cause verified in code; fix direction from BUG-08 analysis; implementation detail ASSUMED
- Carve architecture: HIGH — `chunk.carveWeights` discipline locked in CONTEXT.md; Worker pattern verified in terrain.js
- Junction algorithm: MEDIUM — `_segXZ` helper verified; fillet math and triangulation ASSUMED (standard algorithms, no exotic edge cases expected for the road topology this generator produces)
- Design grade smoothing: MEDIUM — sliding window approach is sound; specific window width ASSUMED
- Crown/camber math: HIGH (formula correct) / MEDIUM (default values ASSUMED)
- Material system: HIGH — vertex-color approach verified compatible with existing `MeshPhongMaterial` + `vertexColors: true` pattern

**Research date:** 2026-06-11
**Valid until:** 2026-07-11 (stable tech stack; Three.js r184 locked; 30-day window)
