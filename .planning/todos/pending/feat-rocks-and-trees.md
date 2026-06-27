---
id: FEAT-06
type: feature
status: open
opened: 2026-06-11
rescoped: 2026-06-26
severity: minor
source: scribe-session
note: "Rescoped 2026-06-26 with user: all props PROCEDURAL/PARAMETRIC (no baked assets) — fits the
no-asset / single-origin constraint and the hand-rolled spirit of the sim. Split into three tickets:
THIS one = palette + scatter + instancing (the visual foundation); FEAT-06b = collision integration;
FEAT-06c = LOD + in-browser baked billboard impostors. Bushes added to the prop set."
split_into: [FEAT-06 (palette+scatter+instancing), FEAT-06b (collision), FEAT-06c (LOD+impostors)]
relates: [FEAT-09 (contact pipeline — FEAT-06b builds on it), PERF-05 (iGPU is render/GPU-bound — overdraw is the real cost)]
---

# FEAT-06: Procedural prop palette + scatter + instancing (trees, rocks, bushes)

Populate the world with **trees, rocks, and bushes** so the terrain feels inhabited rather than
bare. Everything is **procedural/parametric** (no baked asset files) and rendered via instancing.
This ticket is the **visual foundation**: generate the palette, scatter it deterministically, and
draw it cheaply. Collision is FEAT-06b; LOD/impostors is FEAT-06c.

## Why procedural + instanced (perf rationale, settled 2026-06-26)

- **Procedural vs pre-baked makes ~zero difference to render cost.** Once a tree is a static
  `BufferGeometry`, it renders identically whether generated in-browser or shipped as a file. The
  axis that matters is **unique-geometry-per-instance (bad) vs. a small instanced palette (good)**.
- Plan: generate a **small palette ONCE at load** (a few species × size variants, baked to static
  geometry), then render thousands via **`THREE.InstancedMesh`** → a handful of draw calls.
  Generation cost is one-time/off-frame; per-frame cost is instance count × tris × overdraw.
- Scale check: Ultra = ring 4 = 9×9 chunks (64 m) ≈ 576 m square. At condensed-forest density all
  categories together land in the **~10k–40k instance** range — trivial for instancing, **GPU
  fragment/overdraw-bound, not CPU-bound**.
- **Floor machine caveat (PERF-05):** the perf floor is a render/GPU-bound iGPU (HD 620). Foliage's
  real cost there is **alpha-tested overdraw**. So: **alpha-TEST, never alpha-blend** for foliage
  (no depth sort, no transparency overdraw); keep canopy overdraw low. (Far-distance overdraw is
  handled by FEAT-06c impostors.)

## Implementation status — FOUNDATION BUILT 2026-06-26 (not yet wired into the game)

Built as **new files only** (zero edits to road/terrain/main — done alongside the road/terrain
bugfix worker to avoid conflicts). Headless gate `test/props.mjs` PASSES (18 checks).

- `data/flora.js` — all prop params (this ticket's spec, tunable).
- `src/props/prop-geometry.js` — `makeBlob` / `makeKinkedTube` / `makeConeStack` + flat-shade,
  dependency-free `mergeGeometries`, `assembleTree`.
- `src/props/prop-palette.js` — `buildPalette(seed)` bakes the variant sets + shared Lambert
  (vertexColors) material.
- `src/props/prop-scatter.js` — `scatterChunk(cx,cz,seed,samplers)`, deterministic + window-
  invariant, cluster grouping + biome rules, DI samplers (height/normal/roadBlocked).
- `src/props/prop-system.js` — `PropSystem`: ONE InstancedMesh per (category×variant) global pool,
  free-list slot alloc, `update(x,z,ringChunks)` one-call lifecycle. `frustumCulled=false`.
- `test/props.mjs` — headless gate (geometry sanity, palette + scatter determinism, slot accounting).
- `test/prop-preview.html` — standalone in-browser visual check (synthetic terrain, no game deps).

**REMAINING (merge-time, after the bugfix worker lands):**
1. Wire into `src/main.js`: instantiate `PropSystem` with real terrain/road samplers + call
   `props.update(carX, carZ, ring)` in the loop (integration snippet in `prop-system.js` header).
2. Register `test/props.mjs` in `test/run-all.mjs` as a gate.
3. Debug-menu sliders for `FLORA_PARAMS` (feedback_phase_housekeeping).
4. Tune densities/colours against the real terrain (current values are first-pass).

## Scope (this ticket)

1. **Procedural palette** (generated once at init, seeded, parametric):
   - **Trees**: trunk (tapered cylinder / extruded) + canopy (alpha-tested cross-planes or low-poly
     blob). A few species + size variants.
   - **Rocks**: noise-displaced low-poly icosahedron. Size categories: small (decorative), large
     (collidable in 06b), and **huge buried boulders up to ~20 m diameter** (collidable in 06b).
   - **Bushes**: smaller canopy clusters (soft-drag volume in 06b).
2. **Deterministic per-chunk scatter** — keyed off the world seed via `seedFor(worldSeed, 'flora',
   cx, cz)` + `mulberry32` (already in `src/seed.js`). Seam-free across streamed chunks; identical
   on re-stream (window-invariant, same discipline as terrain/road).
3. **Placement rules** — trees off-road / in valleys, rocks favor slopes, bushes filler; **road
   exclusion** via `RoadSystem.queryNearest` (no props on the driving line/ribbon); Y snapped to
   `terrainSystem.analyticHeight`, optional terrain-normal alignment. Buried boulders sink into the
   terrain (partial exposure).
4. **Instanced render + chunk lifecycle** — one `InstancedMesh` per (species/category × variant);
   each terrain chunk owns its instances, built/freed with the chunk (mirror the geometry-pooling
   discipline from PERF-05 — and remember `computeBoundingSphere()` after writing instance
   matrices or frustum culling will hole them).

## Parameterization (captured with user 2026-06-26 — concept art in `feat-06-refs/`)

### Architecture: 3 shared primitives cover all 4 props
- `makeKinkedTube(polyline, radiusAtNode[], sides)` — aspen trunk AND pine trunk (same builder).
- `makeBlob(params)` — aspen canopy, rocks, AND bushes (the amorphous low-poly blob).
- `makeConeStack(params)` — pine canopy (stacked kinked cone frustums).

### `makeBlob` (amorphous low-poly blob — the canopy/rock/bush primitive)
Base icosahedron / 1×-subdiv icosphere → displace each vertex radially by seeded noise →
non-uniform axis-scale for silhouette → **flat shade** (non-indexed + computeVertexNormals).
Flat shading + low poly IS the aesthetic — don't smooth, don't over-tessellate.
- params: `radius`, `axisScale(x,y,z)`, `irregularity` (amp; rocks high/jagged, canopy+bush low/round),
  `noiseFreq` (few big lumps vs many bumps), `subdiv` (poly budget), `seed`.
- aspen canopy = tall egg, low irregularity, green · rock = squashed, HIGH irregularity, gray ·
  bush = squat dome, med irregularity, green · buried boulder = big radius, sunk so only cap shows.

### `makeKinkedTube` (aspen + pine trunk)
Swept polyline loft: N nodes (N=segments+1), each node `= prev + up·segLen + randomXZ·bend·segLen`
(the kink); radius tapers `r[i]=baseR·(1-i/N)^taperPow` (smaller toward top); connect nodes with
low-sided frustums (5–6 sides) → "minor dia of prior = major dia of next" falls out for free.
- **Aspen**: 3–7 segments, HIGH aspect ratio (tall/thin), SUBTLE bend (concept trunks ~straight).
  Trunk is collidable (06b).
- **Pine**: frustum segments, 3–5, stockier, more taper, kinked.
- shared params: `size` (scales segLen × segCount), `bend` (lateral-walk scale).

### `makeConeStack` (pine canopy)
3–5 cone frustums stacked, each lower one wider, overlapping downward (image #3 skirts); each cone
axis kinked by `bend`; low radial sides for facets. params: `size` (cone count + scale), `bend`.

### Instancing / variety (perf-critical — do NOT make unique geo per instance)
Bake ~4–6 variants per category at load. Forest variety = (a) the few variants + (b) per-instance
random scale + Y-rotation in the instance matrix + (c) per-instance color tint via
`InstancedMesh.setColorAt()` (the orange→red gradient in concept #2 = ONE geometry, tinted).

### Placement / grouping / biome (settled 2026-06-26)
- **Both species GROUP** → cluster-based scatter: per chunk seed a few cluster centers, scatter
  individuals (jittered/Poisson) around each center. Grouping is the forest look.
- **Aspen** prefers MEADOWS (low slope), more at higher elevation, present at all altitudes.
- **Pine** prefers EXPOSED + STEEP (high slope), present at all altitudes.
- Species choice + density = `f(slope, elevation, low-freq biome-noise mask)` — blend, not a hard
  slope cutoff. Road exclusion still applies.

### Rock & bush sizing / burial (settled 2026-06-26)
- **Small rocks**: all **< 0.1 m**, **non-collidable** (decorative scatter, drive over — see 06b).
- **Rocks (collidable)**: **20–90% buried** (placement sinks the blob; only the exposed cap shows
  and is what collides). **Large rocks are MORE COMMON on steep slopes** (slope-weighted density).
  Boulders (up to ~20 m) are the top of this size continuum.
- **Bushes**: **0.5–1.5 m**. Drag scales with size (the soft-drag force is size-proportional — 06b).

### Open / deferred
- Aspen art shows branches + orange canopy; ship will be **green, canopy-only (no branches)**.
- Cactus-style surface dots (concept #4) = optional tiny instanced spheres — skip for v1.
- Expose all tunables in the lil-gui debug menu (per feedback_phase_housekeeping).
- TODO(user): attach concept images to `feat-06-refs/` (aspen #2, pine #3, rock+bush #4).

## Acceptance

- Trees, rocks, and bushes appear across the terrain, deterministic and seam-free across streamed
  chunks; identical on re-stream (no pop / re-randomization when a chunk reloads).
- No props on the road ribbon or its immediate shoulder (exclusion holds).
- Rendered via `InstancedMesh` — instance counts in the 10k–40k range hold 60 fps on the M4 and do
  not collapse the iGPU floor at Near/Normal (Ultra acceptance is gated on FEAT-06c impostors).
- Foliage uses alpha-test (not alpha-blend).
- `npm test` stays green; no terrain holes / frustum-cull dropouts from instanced bounds.

## Notes

- Collision is explicitly OUT of scope here → FEAT-06b. LOD + billboard impostors → FEAT-06c.
- Overlaps the planned Phase 10 (POI Hooks + Polish) — reconcile rather than duplicate.
