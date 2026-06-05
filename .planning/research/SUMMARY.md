# Project Research Summary

**Project:** RangerSim
**Domain:** Browser procedural terrain + road generation for a 6DOF car-physics sim (milestone v1.1 "Mountains & Roads")
**Researched:** 2026-06-05
**Confidence:** HIGH (terrain/seed/camera/spline mechanisms), MEDIUM (infinite tile-graph switchback road routing)

## Executive Summary

v1.1 adds an Eastern-Sierra landscape (steep escarpments, flat valleys) with procedurally-routed switchback roads, a reproducible world-seed system, a dev free-cam, and POI data hooks — all on top of the existing simplex/Web-Worker/chunk-streaming terrain, with **no new dependencies**. Research confirms every piece is achievable in vanilla JS + Three.js r184 as pure, stateless, Worker-safe functions of `(worldSeed, world coords)`.

The recommended terrain approach is **ridged multifractal + power redistribution** for the coarse layer (directly produces the Sierra escarpment/valley character), the existing fBm as a narrower-band fine layer, and a low-frequency regional-roughness multiplier — exactly the blueprint's three-layer scheme. Seeding is nearly free: the existing simplex `createNoise2D(random)` already takes a random callback that is currently stubbed to `() => 0.5`; replacing that stub with a seeded PRNG (xmur3 string-hash → splitmix32) is the whole change. The road router is a tile-keyed, grade-cost A* over a pure `coarseHeight(wx,wz)` function; switchbacks emerge when grade is penalized correctly.

The dominant risk is **mesh/physics height disagreement** (truck floats/sinks). The discipline that prevents it: one source-of-truth height formula, and the cut-biased road carve applied as a **post-read blend** in both the mesh build and the physics sampler — **never baked into `chunk.heights`** (which `rebuildAllChunks` rescales from raw values). The second risk is the **infinite + deterministic + switchbacking router** (P8) — the only genuinely novel algorithm in the milestone; it warrants a research spike before implementation.

## Key Findings

### Recommended Stack

All additions are vanilla-JS techniques, not libraries — the no-dependency constraint holds. Detail in [STACK.md](STACK.md).

**Core technologies:**
- **xmur3 + splitmix32** (~20 lines, pure arithmetic): string→32-bit hash + seeded PRNG for `seedFor(worldSeed, domainTag, ...coords)`. Runs identically in main thread and Blob Worker. — canonical JS PRNG pair, zero deps.
- **Existing inlined simplex** (`createNoise2D(random)` in `terrain.js` WORKER_SOURCE): already seedable; just feed it a seeded PRNG instead of the `() => 0.5` stub. — no noise rewrite needed.
- **`THREE.CatmullRomCurve3`** (core module, not addon — confirmed r184): `getSpacedPoints`, `getTangentAt`, `getFrenetFrames` for road spline + ribbon edges. — use manual `BufferGeometry` quad strips, not TubeGeometry/ExtrudeGeometry.
- **`THREE.CanvasTexture`** (programmatic canvas): dark-grey asphalt + dashed centerline, one shared material. — no asset files.
- **Browser-native seed plumbing:** `URLSearchParams` (`?seed=`) + `history.replaceState` + a lil-gui string controller.

### Expected Features

Detail and per-technique analysis in [FEATURES.md](FEATURES.md).

**Must have (table stakes):**
- Seeded layered terrain (coarse ridged + fine + regional), one unified `height(x,z)`+normal
- `seedFor()` world-seed foundation with shareable `?seed=` URL
- Dev free-fly camera (delivered first in P7 so terrain is observable)
- Deterministic road routing with hard max-grade + switchbacks, queryable debug splines
- Road surface ribbon: asphalt look, crown + curvature camber, cut-biased terrain carve, physics height **and normal**

**Should have (competitive):**
- Domain warping on the coarse layer (organic, non-grid ridgelines) — additive if base is ridged
- Regional-roughness difficulty hook (random now, difficulty-driven later)

**Defer (stretch / v1.2):**
- Pothole/crack micro-noise on the road surface only
- POI *spawning* (v1.1 ships the data contract only)

#### Terrain technique comparison — SPEED vs FUN (for the architecture deliberation)

| Technique | Speed (per-sample) | FUN / landform character | Stateless? | Verdict |
|-----------|--------------------|--------------------------|-----------|---------|
| **Ridged multifractal + power redistribution** | **Very fast** (one abs/clamp/mul + a `pow` per sample) | **High** — narrow ridges, flat valley floors → switchback-worthy Sierra grades | Yes | **Recommended base** |
| Derivative slope warping (Quilez "morenoise") | Very fast (analytical gradients ~5× faster than central diff) | High — genuine erosion-like, complexity accumulates on slopes | Yes (needs a `noised()` simplex variant returning derivatives) | Strong alternative; bigger noise-fn change |
| Domain warping (fBm-of-fBm) | Medium (2–3× plain fBm) | Medium-High — organic curved ridgelines, kills grid look | Yes | Best as an additive layer, not the base |
| Plain fBm (current, 3-octave) | Very fast | **Low** — monotonous, no escarpment/valley asymmetry | Yes | Keep only as the *fine* layer |
| Iterative hydraulic/thermal erosion | N/A | Highest realism | **No — needs global state** | **Disqualified** (incompatible with streaming `height(x,z)`); slope warping is the stateless stand-in |

Both top options satisfy the speed criterion easily; the deliberation is essentially **ridged multifractal (simplest change, proven Sierra character)** vs **derivative slope warping (more erosion-like, requires a derivative-returning simplex)**.

### Architecture Approach

One source-of-truth height formula, Worker-safe, with carve as a post-read blend. Detail in [ARCHITECTURE.md](ARCHITECTURE.md).

**Major components:**
1. **`src/seed.js`** — `xmur3`/`splitmix32`/`seedFor()`; functions also pasted verbatim into `WORKER_SOURCE` (no-bundler reality; a P7 determinism test catches drift).
2. **Layered height in `WORKER_SOURCE`** — single source of truth for terrain height; physics `sampleHeight` reads the chunk's `Float32Array`, never recomputes the formula.
3. **`src/road.js`** — pure `coarseHeight(wx,wz)` + tile-keyed A* road graph + queryable splines via a chunk-keyed index; `ensureTile(cx,cz)` runs synchronously before the Worker is posted.
4. **Carve as post-read blend** — `chunk.carveWeights` (second `Float32Array`, built once per chunk); `carveBlend(rawHeight*amp, roadSurfaceH, weight)` called identically in `_flushPendingQueue` (mesh) and `sampleHeight` (physics). `chunk.heights` stays raw.
5. **`src/road-mesh.js`** — CatmullRomCurve3 → manual BufferGeometry ribbon; shared CanvasTexture asphalt material.
6. **Free-fly mode in `camera.js`** — third mode string; ~5-line main-thread input gate (zero vehicle inputs while flying); hard-set camera on chase re-entry to avoid snap.

### Critical Pitfalls

Top items from [PITFALLS.md](PITFALLS.md):

1. **Mesh/physics height disagreement (CRITICAL)** — divergence between Worker mesh and physics sampler. Avoid: single source-of-truth formula; carve as a post-read blend on a pre-built `carveWeights` array, never baked into `chunk.heights` (which `rebuildAllChunks` rescales from raw).
2. **Determinism breaks (CRITICAL)** — current Worker uses a fixed `() => 0.5` permutation; wiring the seed needs a real PRNG + domain-tag hash. Road routing must use the pure `coarseHeight` fn, not the chunk-load-order-dependent `sampleHeight`. Sub-seed via `seedFor(tag,...)` so terrain and roads don't visually correlate.
3. **Performance cliffs (CRITICAL)** — `queryContacts` ≈ 18 probes × 60 Hz ≈ 1,080 `sampleHeight` calls/s. No noise recompute or O(N) spline search in the hot path; carve/road lookups must be O(1) per-chunk `Float32Array`.
4. **Road seam discontinuity / switchback self-crossing (HIGH)** — tile-boundary waypoints must be computed by the same canonical formula from both adjacent tiles; propagate exit tangents for C1 continuity; enforce min switchback arm length + no-crossing check.
5. **Road shoulder cliffs (HIGH)** — hard carve cutoff creates a wall that launches body-contact probes. Use a smoothstep taper over a 3–5 m shoulder.

## Implications for Roadmap

Suggested phase structure (continuing numbering from v1.0; the milestone is **4 phases, foldable to 3**):

### Phase 7: Free-cam + Seeded Layered Terrain
**Rationale:** Free-cam must ship first so terrain tuning is observable (blueprint requirement); seed + layered height is the foundation every later generator depends on.
**Delivers:** `seed.js` + `seedFor()` (frozen, tested), three-layer height (ridged coarse + fine + regional) in `WORKER_SOURCE`, free-fly camera, `?seed=`/debug-panel seed.
**Addresses:** seeded layered terrain, world-seed foundation, free-cam.
**Avoids:** determinism + mesh/physics-agreement pitfalls (gates below).
**Gates:** `seedFor()` determinism test passes before any other generator uses it; height-agreement test passes before P7 closes; free-cam verified before terrain tuning; `sampleHeight` profiled < 0.01 ms/frame.

### Phase 8: Road Routing
**Rationale:** Roads route over the *coarse* layer, so coarse terrain must be locked first. This is the milestone's highest-risk algorithm.
**Delivers:** pure `coarseHeight(wx,wz)`, deterministic tile-keyed A* road graph with switchbacks, queryable debug splines (visualization is a required deliverable, not optional).
**Uses:** `seedFor("roads", tileX, tileZ)`.
**Gates:** router uses pure `coarseHeight` (never chunk data); shared edge-waypoints enforced; debug spline view shows no kinks/self-crossings at tile seams before P9.

### Phase 9: Road Surface
**Rationale:** Needs locked splines from P8; carries the #1 correctness constraint.
**Delivers:** ribbon mesh (asphalt CanvasTexture), crown + curvature camber, cut-biased carve via `carveWeights` Float32Array + smoothstep shoulder, physics height **and normal** integration; `rebuildAllChunks` updated to re-apply carve.
**Gates:** carve blend design specified before any mesh/physics code; height-agreement test extended to on-road positions is the exit criterion.

### Phase 10: POI Hooks + Polish
**Rationale:** Cheap data contract; depends on roads existing for road-adjacent anchoring.
**Delivers:** seeded `{position, tangent, type}` POI anchors (no spawning); pothole/crack road-only micro-noise stretch.
**Note:** Foldable into P9 if P9 lands under budget (blueprint's 3-phase cut).

### Phase Ordering Rationale
- Strict dependency chain: **seed → coarse height → road routing → road surface/carve → POI**. No circular deps.
- Coarse terrain parameters must be **locked at end of P7** — changing them after P8 invalidates all generated roads.
- Free-cam first inside P7 so all subsequent terrain/road work is visually verifiable.

### Research Flags
Phases likely needing deeper research/spike during planning:
- **Phase 8 (Road Routing):** the infinite, deterministic, switchback-capable tile-graph is the only novel algorithm — needs a spike for how a per-tile pathfinder handles paths that double back at different altitudes (multi-layer grid vs waypoint-graph-with-U-turn-nodes vs recursive sub-tile routing). **Architecture deliberation (terrain technique: ridged vs derivative-warp) should be resolved in P7 discussion before execution.**

Phases with standard patterns (lighter research):
- **Phase 7:** ridged multifractal, PRNG, free-cam, seed plumbing are all well-documented and confirmed.
- **Phase 9:** spline sweep + canvas texture are standard; the carve coupling is an implementation-discipline risk, not a research gap.
- **Phase 10:** data contract only.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | PRNG pair, simplex seeding hook, CatmullRomCurve3/CanvasTexture all verified against r184 + live `terrain.js` |
| Features | HIGH | Terrain techniques converge across multiple sources; per-technique speed/landform validated; stateless constraint checked per technique |
| Architecture | HIGH | Mechanisms derived from live `terrain.js`/`camera.js`; no-bundler shared-height answer (verbatim paste + determinism test) is concrete |
| Pitfalls | HIGH | Mesh/physics + determinism + perf risks derived from real code paths; road-routing seam specifics MEDIUM (no shipped road code yet) |

**Overall confidence:** HIGH, with the road tile-graph switchback router as the one MEDIUM-confidence area carrying a P8 spike.

### Gaps to Address
- **Coarse terrain calibration:** exact amplitude/wavelength/octave constants to match Sierra topo statistics — tune in P7 against a reference topo/DEM; lock before P8.
- **Terrain-gen architecture choice:** ridged multifractal vs derivative slope warping — resolve in the P7 discussion deliberation (ranked on speed + fun); derivative path requires a `noised()` simplex variant returning gradients.
- **Switchback-in-tile routing:** resolve via P8 spike before implementation.
- **Worker seed-change strategy:** respawn (~100 ms, simpler) vs in-place `{type:'reset', worldSeed}` (faster, more state) — decide at P7 implementation.
- **Road surface height cost:** profile at P9 start; fall back to a per-chunk `roadSurfaceHeight` Float32Array if spline eval > 0.1 ms/frame.

## Sources

### Primary (HIGH confidence)
- Three.js r184 docs / Context7 — `CatmullRomCurve3`, `CanvasTexture`, core-vs-addon confirmation
- Live codebase — `src/terrain.js` (WORKER_SOURCE, sampleHeight, rebuildAllChunks, chunk ring), `src/camera.js` (multi-mode), `src/main.js` (queryContacts wiring)
- bryc/code JS PRNG reference — xmur3 + splitmix32

### Secondary (MEDIUM confidence)
- Inigo Quilez articles — fBm, ridged/morenoise derivative noise, domain warping
- Musgrave multifractal terrain literature; Red Blob Games; The Book of Shaders — ridged/terracing/redistribution character
- Tile-keyed deterministic A* / infinite-world routing patterns (switchback-in-tile specifics carry genuine unknowns)

---
*Research completed: 2026-06-05*
*Ready for roadmap: yes*
