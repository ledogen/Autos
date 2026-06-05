# Feature Research

**Domain:** Procedural terrain generation + road routing for browser-based car physics sim (RangerSim v1.1 Mountains & Roads)
**Researched:** 2026-06-05
**Confidence:** HIGH (terrain techniques, seed/cam/spline patterns), MEDIUM (road routing tile-graph for infinite world)

> This file supersedes the Phase 6 FEATURES.md for purposes of the v1.1 milestone.
> The original Phase 6 content (HUD, input, debug tools, camera modes, physics sandbox features)
> is preserved below in the "Carried-Forward Features" section and remains valid.

---

## PRIMARY: Terrain Generation Technique Survey

### Context and Constraints

The existing terrain.js uses a **3-octave plain fBm** with a fixed permutation table (non-seeded).
The inner worker loop (lines 162-172 inside the Blob source string) is the only surgical site
for technique upgrades. The outer infrastructure — TerrainSystem chunk ring, bilinear
`sampleHeight`, central-diff `sampleNormal`, Worker messaging — is unchanged by any of the
below techniques.

**Hard constraints on all techniques:**
- Must be a stateless pure function: `height(x, z)` depends only on `(worldSeed, x, z)`
- Must run in the Blob classic Worker (no DOM, no importmap, self-contained)
- Must be fast enough that a 65x65 grid (4,225 samples) completes well before the next frame
- No new CDN dependencies — algorithm must be inlineable in the worker string

**The two ranking criteria (from PROJECT.md):**
1. SPEED — very fast per-sample evaluation
2. FUN — terrain that yields interesting, switchback-worthy, drivable road routes

---

### Technique 1: Plain fBm (current baseline)

**Algorithm:**
Sum N octaves of simplex noise with halving amplitude and doubling frequency each octave.
`h = sum(amplitude_i * noise(x * freq_i, z * freq_i))` for i = 0..N-1.
Current implementation uses 3 octaves at frequencies 0.02 / 0.06 / 0.15 with amplitudes
4.0 / 1.5 / 0.5.

**Landform character:** Self-similar rolling terrain. Features repeat at all scales.
No preferential flat or steep zones — both peaks and valleys have similar gradients.
Does NOT produce Eastern Sierra asymmetry (no dominant escarpment + flat valley separation).

**Speed:** VERY FAST. 3-6 octaves is typical; each octave is one simplex call. Already ships.

**Fun/routeability:** LOW. Monotonous. Roads follow mild undulations but rarely produce a
compelling forced-switchback situation. No single steep face dominates the landscape.

**Stateless:** Yes.
**terrain.js integration:** This IS the current implementation. Zero changes needed to keep it.
Replacing it is a worker inner-loop surgery only.

---

### Technique 2: Ridged Multifractal (Musgrave)

**Algorithm:**
Like fBm, but each octave's noise is inverted/folded and weighted by the previous octave's
value. The feedback creates ridge–valley asymmetry automatically.

```js
// Pseudocode — runs entirely within the worker height loop
let result = 0, weight = 1;
for (let i = 0; i < octaves; i++) {
  let signal = offset - Math.abs(noise2D(x * freq, z * freq));
  signal *= signal;             // sharpen ridges
  result += signal * weight;
  weight = Math.min(1, Math.max(0, signal * gain));  // feedback
  freq *= lacunarity;
}
```

Typical parameters: offset=1.0, gain=2.0, lacunarity=2.0.

**Landform character:** Sharp narrow ridges separated by relatively smooth flat valley floors.
The feedback loop concentrates fine-octave energy at peaks while valleys receive diminishing
contributions. Closest single-technique match to Eastern Sierra: the escarpment is steep and
narrow; valley floors are smooth. Amplitude and offset are tunable for grade steepness.

**Speed:** VERY FAST. ~3 additional multiply/abs/clamp operations per octave vs plain fBm.
At 4 octaves over a 65x65 grid: negligible extra cost.

**Fun/routeability:** HIGH. Sharp ridge/valley structure creates compelling routing challenges.
Routes must find valley corridors, cross passes, and switchback up steep faces. Terrain has
"narrative" — approach, climb, pass, descent. Best single-technique match for the v1.1 goal.

**Stateless:** Yes.
**terrain.js integration:** Worker inner loop replacement only. Same `noise2D` function.
No structural TerrainSystem changes. LOW integration complexity.

---

### Technique 3: Billow Noise

**Algorithm:**
Like fBm but uses absolute value (no inversion, no feedback):
`h = sum(amplitude_i * abs(noise2D(x * freq_i, z * freq_i)))`

The `abs()` folds the negative half upward, producing rounded convex bumps.

**Landform character:** Rolling, lumpy hills — gentle plains or sand dunes. All features are
convex humps; valleys are also rounded, not flat. No sharp ridges, no flat floors.
Not an Eastern Sierra match on its own.

**Speed:** VERY FAST. Essentially identical to fBm (one `abs()` added per octave).

**Fun/routeability:** LOW alone (uniform, no dramatic variation). HIGH value as the fine-detail
layer in a layered scheme where the coarse layer provides escarpment structure.

**Stateless:** Yes.
**terrain.js integration:** Inner loop change only. Best used as the fine layer.

---

### Technique 4: Domain Warping (Quilez fBm-of-fBm)

**Algorithm:**
Distort input coordinates using a separate fBm evaluation before sampling the primary terrain
function. `h = fbm((x + fbm(x,z) * warpAmp), (z + fbm(x+offset, z+offset) * warpAmp))`

Two separate noise evaluations at the offset stage, then one main evaluation.

```js
// Single-pass warp (worker inner loop)
const wx = fbm(x * warpFreq,          z * warpFreq)          * warpAmp;
const wz = fbm(x * warpFreq + 5.2,    z * warpFreq + 1.3)    * warpAmp;
const h  = ridgedFbm((x + wx) * terrainFreq, (z + wz) * terrainFreq);
```

The offsets (5.2, 1.3) prevent the warp from being axis-aligned.

**Landform character:** Highly organic, flowing terrain with curved ridgelines and natural-
looking transitions. Avoids grid-aligned regularity. Creates intertwined ridge-and-valley
systems. Combined with ridged multifractal as the primary function, produces curved escarpments
that feel geologically plausible rather than procedural.

**Speed:** FAST (not VERY FAST). 2-3x more expensive than plain fBm — requires two extra fBm
calls for warp coordinates. For N=4 primary + N=4 warp: ~12 total simplex calls vs ~4.
Still well within Worker budget for 65x65 grid. Worth benchmarking in context.

**Fun/routeability:** HIGH. Curved ridges prevent grid-regularity and create varied approach
angles. Routes feel contextual rather than repetitive. Strongest for "organic feel."

**Stateless:** Yes. Each coordinate is independently evaluated; the warp is a function of
the input point only.
**terrain.js integration:** Worker inner loop. Moderate complexity increase. Need to add a
second `fbm()` helper function inside the Blob source string.

---

### Technique 5: Derivative-Based Slope Warping (Quilez "morenoise")

**Algorithm:**
Uses analytical gradient (derivative) of the noise function to modulate subsequent octave
contributions. Rather than summing noise values independently per octave, accumulated
derivatives warp the coordinates for each successive octave.

```js
// Each octave contributes noise value AND gradient (dx, dz)
let result = 0, derivX = 0, derivZ = 0;
for (let i = 0; i < octaves; i++) {
  const { v, dx, dz } = noised(x * freq + derivX * warpScale,
                                z * freq + derivZ * warpScale);
  result += v * amplitude;
  derivX += dx * amplitude;   // accumulate slope info
  derivZ += dz * amplitude;
  freq *= lacunarity;
  amplitude *= gain;
}
```

The `noised()` function returns both value and analytical partial derivatives. For simplex
noise this requires a modified noise function that computes gradient components analytically —
much faster than finite-difference approximation (Quilez: "5x faster than central differences").

**Landform character:** Produces flat areas AND rough areas in the same height function.
High-slope regions warp inputs more aggressively, accumulating complexity. Flat regions stay
smooth. Quilez: "flat areas as well as more rough areas" with an erosion-like appearance.
This matches Eastern Sierra: valley floors reliably flat, ridge faces sharply complex.
Closest stateless approximation to the look of hydraulic erosion without simulation state.

**Speed:** VERY FAST. Analytical derivatives are intrinsically computed with simplex gradient
noise — the derivative comes "for free" from the gradient vector. Net cost is comparable to
5-octave plain fBm. Faster than central-difference normals for the same geometric information.

**Fun/routeability:** HIGH. Natural erosion character means valley floors are reliably drivable
and ridgelines sharply defined — strong routing affordances.

**Stateless:** Yes. Derivative accumulation happens within a single height(x,z) call.

**terrain.js integration:** MEDIUM complexity. Requires switching from the current scalar-
returning `noise2D()` to a `noised()` variant that also returns `{dx, dz}`. The existing
simplex-noise@4.0.3 subset in terrain.js does NOT return derivatives. Would need to inline a
gradient-returning simplex variant in the Blob source. This is a moderate worker source change
but structurally sound — all within the self-contained string.

---

### Technique 6: Hybrid Multifractal (Musgrave variant)

**Algorithm:**
Combines fBm-style octave summation with height-dependent weighting. Low-elevation regions
suppress higher octaves (keeping valleys smooth); high-elevation regions receive full amplitude.

```js
let result = (noise2D(x, z) + offset);  // first octave
let weight = result;
for (let i = 1; i < octaves; i++) {
  freq *= lacunarity;
  const signal = (noise2D(x * freq, z * freq) + offset) * amplitude;
  result += signal * weight;
  weight = Math.min(1, Math.max(0, weight * signal));
  amplitude *= Math.pow(gain, H);
}
```

**Landform character:** Broader mountain masses with smooth lower slopes transitioning to
rough peaks. Mountains appear substantial and rounded, not sharp-spined. Valleys are smooth.
Less "spiky sierra" than ridged multifractal, more "rounded alpine highland." Good for a
general mountain look; less ideal for the narrow-escarpment Eastern Sierra specifically.

**Speed:** VERY FAST. Same order as ridged multifractal.

**Fun/routeability:** MEDIUM. Mountain masses are interesting but broader gradients mean roads
can often skirt mountains rather than needing to switchback. Switchbacks happen but are less
forced than with ridged terrain.

**Stateless:** Yes.
**terrain.js integration:** Worker inner loop replacement only. LOW complexity.

---

### Technique 7: Power-Redistribution (Elevation Exponent)

**Algorithm:**
Post-process any of the above with a power function:
`h_out = sign(h_in) * Math.pow(Math.abs(h_in), exponent)`
Exponent > 1 pushes mid-range elevations toward zero (flattens valleys), leaving peaks tall.
Exponent < 1 raises valleys and flattens peaks.

**Landform character:** Not a standalone technique — a modifier. Applied with exponent ~1.5-2.0
on top of ridged multifractal, it aggressively flattens valley floors while preserving steep
mountain faces. Cheapest way to achieve the Eastern Sierra asymmetry in the output distribution.

**Speed:** TRIVIALLY FAST. One `Math.pow()` per sample after the noise sum. Negligible.

**Fun/routeability:** HIGH as a modifier on ridged. Creates clearer valley corridors and
steeper forcing grades. Directly increases routeability.

**Stateless:** Yes.
**terrain.js integration:** One line added after the height sum in the worker loop.

---

### Technique 8: Terracing

**Algorithm:**
`h_out = Math.round(h * levels) / levels`
Optionally with smooth-step blending between levels.

**Landform character:** Stepped terrain — distinct horizontal platforms, mesa-like forms.

**Speed:** TRIVIALLY FAST.

**Fun/routeability:** LOW for Sierra target. Roads on terraced terrain hug steps and feel
artificial. NOT recommended for v1.1.

**Stateless:** Yes.
**Recommendation: Anti-feature for v1.1.** Power redistribution gives flat-floor character
without discrete steps.

---

### Technique 9: Iterative Hydraulic/Thermal Erosion

**CRITICAL FLAG: DISQUALIFIED — NOT STATELESS**

Iterative erosion (Sebastian Lague, etc.) requires generating the full heightmap first, then
running 10,000+ passes with neighbor-comparison state. Cannot be evaluated per-sample.
Incompatible with infinite streaming terrain — would require caching the entire visible world.

**Stateless:** NO. This is the only technique that fails the hard architectural constraint.

**Stateless approximation:** Derivative-based slope warping (Technique 5) approximates the
visual character of erosion via slope-dependent detail accumulation, without any global state.

---

### Comparison Matrix (ranked for v1.1: SPEED first, FUN second)

| Technique | Speed | Fun/Routeability | Sierra Match | Stateless | Integration Complexity |
|-----------|-------|-----------------|--------------|-----------|------------------------|
| **Ridged Multifractal** | VERY FAST | HIGH | BEST | Yes | LOW — worker loop only |
| **Ridged + Power Redistribution** | VERY FAST | HIGH | BEST | Yes | LOW — one modifier line added |
| **Derivative Slope Warping** | VERY FAST | HIGH | VERY GOOD | Yes | MEDIUM — needs noised() fn |
| **Domain Warping** | FAST | HIGH | GOOD | Yes | LOW-MEDIUM — extra fbm helper |
| **Hybrid Multifractal** | VERY FAST | MEDIUM | GOOD | Yes | LOW — worker loop only |
| **fBm (current)** | VERY FAST | LOW | POOR | Yes | None (already exists) |
| **Billow (alone)** | VERY FAST | LOW | POOR | Yes | LOW |
| **Terracing** | TRIVIAL | LOW | POOR | Yes | LOW (NOT recommended) |
| **Iterative Erosion** | DISQUALIFIED | n/a | BEST | **NO** | DISQUALIFIED |

**Architecture recommendation for the deliberation phase:**
Ridged Multifractal + Power Redistribution is the highest-confidence recommendation: VERY FAST,
stateless, produces escarpment + flat valley character, LOW integration complexity (worker loop
only, same noise2D function). Derivative Slope Warping is the best single-technique alternative
if a noised() variant can be cleanly embedded in the Blob worker.

**The blueprint's three-layer scheme maps as follows:**
- Coarse (Sierra grades): Ridged Multifractal × Power Redistribution
- Fine (suspension texture): Plain fBm (current octaves, narrower frequency band)
- Regional roughness: Low-frequency fBm scalar multiplied onto the fine-layer amplitude

---

## SECONDARY: v1.1 Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Seeded layered terrain (coarse + fine + regional roughness) | Core v1.1 deliverable; without this there is no v1.1 | HIGH | Ridged coarse + fBm fine + low-freq roughness scalar; unified height(x,z) |
| World seed — `?seed=` URL param + debug-panel editable | Standard for shareable procedural worlds; Minecraft popularized this expectation | LOW | MurmurHash string→32bit + Mulberry32 PRNG; `seedFor(tag)` for domain sub-seeds |
| Dev free-fly camera | Needed to evaluate terrain before roads exist; tuning without observation is blind | LOW | camera.js already multi-mode; add a FLY mode with WASD + pointer lock |
| Deterministic road routing with switchbacks | Core v1.1 promise; without switchbacks the terrain's steepness is wasted | HIGH | A* or Dijkstra with slope-cost on coarse height; per-tile seeded graph for streaming; hard max-grade enforcement |
| Road ribbon mesh with crown and camber | If a road is promised, a flat ribbon feels broken immediately | MEDIUM | ~10 m width; cross-section swept along spline; 2-3° crown; curvature-driven camber |
| Road physics integration (height AND normal) | If the car doesn't react to crown/camber, the road is cosmetic only | MEDIUM | Road height overrides terrain in sampleHeight; road normal carries crown/camber |
| Terrain carve under road | Visual seam where road "floats" is immediately noticeable | MEDIUM | Cut-biased: smooth-min blend of road and terrain height within shoulder width |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Eastern Sierra landform fidelity (calibrated to real DEM stats) | Makes switchbacks feel earned — terrain genuinely demands them | MEDIUM | Blueprint calls for topo baseline calibration pass; tune ridged amplitude/lacunarity vs real quad stats |
| Regional roughness multiplier (quiet zones vs rough zones) | Off-road variety: smooth valley floor vs rough mountain flank in the same world | LOW | Low-freq fBm scalar (0..1) × fine-layer amplitude |
| Friendly shareable seed strings ("lone-pine-1") | More memorable than raw integers; URL-shareable | LOW | MurmurHash string→int; accept both formats |
| Seeded POI anchor hooks (data contract only) | Clean architecture seam for future mission/content; commits the contract now, pays nothing | LOW | `{position, tangent, type}` emitted at low-slope road-adjacent sites; no rendering |
| Pothole / crack micro-noise on road surface | Distinguishes asphalt from terrain in physics and (future) audio | LOW | High-freq noise within road boundary only; Phase 10 stretch |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Iterative hydraulic erosion | Produces most realistic terrain | Requires full-heightmap global state — INCOMPATIBLE with streaming height(x,z) | Derivative slope warping approximates erosion character stateless per-sample |
| GPU terrain generation (OffscreenCanvas) | Looks attractive for speed | OffscreenCanvas requires COOP/COEP headers; GitHub Pages does not set them — project constraint | CPU Worker noise is fast enough: 65×65 × 4 ridged octaves = ~17k noise calls, well within budget |
| Pre-computed DEM import (real Sierra heightmap) | Perfect fidelity | Finite world, file size, tiling seams, breaks infinite streaming | Calibrate procedural stats to match DEM statistics; infinite procedural wins |
| Terracing modifier | Easy, looks stylized | Produces artificial steps incompatible with natural road routing | Power redistribution gives flat-floor character without discrete steps |
| Bundler or noise library dependency | Tempting (libnoise, etc.) | Violates hard no-dependency constraint | Inline algorithm subset in Blob worker string (already done for simplex; same pattern) |

---

## Feature Dependencies

```
World Seed + seedFor()
    └──required by──> Seeded Layered Terrain
    └──required by──> Road Routing (per-tile graph seeding)
    └──required by──> POI Anchor Hooks

Seeded Layered Terrain (coarse + fine + regional)
    └──required by──> Road Routing (routes over COARSE height only)
    └──required by──> Terrain Carve (carve applied to unified height fn)
    └──must be locked before──> Road Routing validation
       (if coarse layer changes post-routing, all generated roads become stale)

Dev Free-Fly Camera
    └──enables (not blocks)──> Terrain Tuning (observable without car present)
    └──no blocking dependencies──> can be built first (as blueprint recommends)

Road Routing (spline graph)
    └──required by──> Road Ribbon Mesh
    └──required by──> Road Physics Integration
    └──required by──> Terrain Carve
    └──required by──> POI Anchor Hooks

Road Ribbon Mesh
    └──required by──> Road Physics Integration (normal must carry crown/camber)

Road Physics Integration + Terrain Carve
    └──COUPLED RISK: carve must apply identically in mesh build AND sampleHeight
       (milestone's #1 correctness constraint from PROJECT.md)
```

### Dependency Notes

- **World Seed first:** Every generator must be a pure function of `(worldSeed, worldCoords)`. Seed system must exist before any procedural parameter is finalized, or results won't be deterministic and shareable.
- **Coarse terrain must be locked before road routing:** The router consumes the coarse height. Changing coarse parameters after routing validation invalidates all generated roads.
- **Unified height fn is the hardest coupling:** Road carve must modify the exact same `height(x,z)` used by physics. If mesh carve and physics sampler carve diverge by even a few cm, the car floats or sinks at road edges. The spatial index of road splines (for efficient per-sample road proximity queries) is the most architecturally consequential piece of Phase 9.
- **Free-fly has no blockers:** Independent of all other v1.1 features. Build first.

---

## MVP by Phase

### Phase 7 — Must Ship

- [ ] World seed: `seedFor()`, `?seed=` URL param, debug-panel editable
- [ ] Seeded layered terrain: coarse (ridged + power redistribution, Sierra-tuned) + fine (retuned fBm) + regional roughness
- [ ] Unified `height(x,z)` for mesh + physics (no disagreement)
- [ ] Dev free-fly camera: toggle key, WASD + pointer lock, car idles

### Phase 8 — Must Ship

- [ ] Deterministic road routing: slope-cost graph, hard max-grade, switchbacks, per-tile seeded, seamless streaming
- [ ] Debug spline visualization (line geometry, no ribbon mesh yet)

### Phase 9 — Must Ship

- [ ] Road ribbon mesh: ~10 m, crown, curvature camber
- [ ] Road physics: height + normal integration (crown/camber carries to suspension)
- [ ] Terrain carve: cut-biased shoulder blend, identical in mesh and physics sampler

### Phase 10 — Add After Validation

- [ ] Seeded POI anchor hooks: `{position, tangent, type}` data contract only
- [ ] Pothole/crack micro-noise on road (stretch goal — defer if Phase 9 slips)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Seeded world system | HIGH | LOW | P1 |
| Ridged multifractal coarse terrain | HIGH | LOW | P1 |
| Fine layer (existing fBm, retuned) | HIGH | LOW | P1 |
| Regional roughness multiplier | MEDIUM | LOW | P1 |
| Dev free-fly camera | HIGH | LOW | P1 |
| Road routing with switchbacks | HIGH | HIGH | P1 |
| Road ribbon mesh | HIGH | MEDIUM | P1 |
| Road physics height + normal | HIGH | MEDIUM | P1 |
| Terrain carve (cut-biased) | HIGH | MEDIUM | P1 |
| Power redistribution modifier | HIGH | LOW | P1 (modifier on ridged) |
| Seeded POI anchor hooks | MEDIUM | LOW | P2 |
| Pothole/crack micro-noise | LOW | LOW | P3 |
| Derivative slope warping (alternative to ridged) | MEDIUM | MEDIUM | P2 (if ridged insufficient) |
| Domain warping (organic ridgelines) | MEDIUM | MEDIUM | P2 (additive if ridged chosen) |

---

## Implementation Notes for terrain.js

### What changes in the Worker Blob source

The worker's inner height loop (lines 162-172 inside the Blob source string in terrain.js)
is the only surgical site for technique upgrades. The outer TerrainSystem infrastructure —
chunk ring, bilinear `sampleHeight`, central-diff `sampleNormal`, Worker messaging — is
unchanged by any of the above techniques.

**Changes needed for layered + seeded terrain:**
1. **Add seeded permutation table:** The current worker uses `random = () => 0.5` (fixed
   permutation). `buildPermutationTable()` already accepts a `random` argument — just needs
   to receive a Mulberry32 PRNG initialized from `worldSeed`. The worker message protocol
   must add `worldSeed` to the `{type, cx, cz, key}` message.
2. **Replace coarse layer:** Swap the 3-octave additive fBm with ridged multifractal loop
   for the coarse layer, followed by a power redistribution modifier.
3. **Retain fine layer:** Keep the existing 3-octave fBm, adjusted to a narrower frequency
   band (suspension texture scale only).
4. **Add regional roughness:** Low-frequency simplex call (scalar 0..1) multiplied onto
   the fine-layer amplitude.

### Seed system (outside terrain.js)

The world seed system lives in main.js / a new `seed.js` module:
- MurmurHash (inlineable, ~30 lines) converts string seeds to 32-bit ints
- Mulberry32 produces a seeded float random() from the int
- `seedFor(tag)` calls MurmurHash on `worldSeed + ":" + tag` to produce independent streams
- `?seed=` URL param read on load; debug panel binds to the same value
- On seed change: flush all chunks (invalidate chunkMap) and regenerate

### Road carve as height override

The unified `height(x,z)` must incorporate road surface:
`effectiveHeight = min(terrainHeight, roadHeight)` (cut-biased).
The road height query requires efficient proximity lookup for road splines.
A spatial index (grid-keyed list of nearby spline segments) is needed for O(1) per-sample
queries at 60fps. This is the highest-complexity architectural concern in the milestone.

---

## Road Routing Behavior (Phase 8 expected behavior)

**Pattern:** A-star or Dijkstra on a coarse heightmap grid with slope-weighted edge costs.
- Edge cost = distance + slope_penalty (where slope_penalty → infinity at max_grade)
- Hard grade limit: reject edges that exceed max_grade (e.g. 15% / ~8.5°)
- Switchback detection: when direct path exceeds max grade, route must double back —
  the pathfinder naturally finds this if the cost field penalizes grade correctly
- Deterministic per-tile: seeded endpoint selection via `seedFor("roads", tileX, tileZ)`;
  entry/exit points on tile edges are consistent regardless of which tile generates them
  (eastern-most point seeds the connection decision — both tiles agree)
- Output: queryable spline control points, not a mesh; debug line geometry for Phase 8

**Critical open question (flags for phase-specific research in Phase 8):**
Global A* over an infinite heightmap is not feasible. The realistic shape is a deterministic
tile-graph: each tile generates its internal road segment from seeded entry/exit points, and
adjacent tiles stitch at their shared edge. Switchbacks within a tile are the implementation
challenge — the pathfinder must be allowed to traverse the tile multiple times at different
altitudes. This warrants a Phase 8 research spike before committing to the implementation.

---

## Road Spline and Ribbon Behavior (Phase 9 expected behavior)

**Spline:** Catmull-Rom interpolation from the A* control points for smooth curvature.
**Ribbon sweep:** Sample spline at regular arc-length intervals; at each sample, emit a quad
strip of width ~10 m. Cross-section: center-crown (+2-3° taper) + curvature-driven camber
(bank proportional to turn radius × speed target). Normal at each ribbon vertex must carry
crown + bank for physics.
**Carve:** At each sample, compute road height. Blend terrain height toward road height within
shoulder radius using smooth-min or lerp with a smoothstep falloff coefficient.

---

## Free-Fly Camera Behavior (Phase 7 expected behavior)

**Toggle:** Single key (e.g. F or Tab); car idles at last position, physics continues.
**Controls:** WASD for horizontal/forward/back; Q/E or Shift/Space for up/down; mouse look
via Pointer Lock API. Sensitivity controls.
**Implementation:** camera.js already architected for multi-mode (chase + cockpit exist).
Adding FLY mode follows the same pattern. Three.js FlyControls exists in addons as a reference
(`three/addons/controls/FlyControls.js`) but hand-rolling it is ~50 lines and avoids any
addons dependency concern.

---

## World Seed System Behavior (Phase 7 expected behavior)

**Format:** Accept string ("lone-pine-1") or raw integer. Strings hashed to 32-bit int via
MurmurHash (~30 inlineable lines, no dependency). 32-bit int fed to Mulberry32 PRNG.
**Sub-seeds:** `seedFor(tag)` = MurmurHash(worldSeed + ":" + tag) → independent stream per
domain. Tags: "coarse", "fine", "regional", "roads", "poi".
**URL param:** `?seed=lone-pine-1` parsed on load; refresh with same seed = same world.
**Debug panel:** Editable seed field; on change, flush all chunks and regenerate.
**Worker protocol:** Pass `worldSeed` in each generate message so the worker initializes its
permutation table from the seed, not from the fixed `() => 0.5`.

---

## Carried-Forward Features (Phase 6, still valid)

The following Phase 6 features are complete and not being re-researched for v1.1:
- Physics sandbox table stakes (speed HUD, wheel rotation, chase camera, rollover)
- Input handling (accumulation steering, speed-scaled max steer)
- Debug tools (Pacejka sliders, live curve plot, suspension sliders)
- Camera modes (chase, cockpit, orbit)
- HUD elements (speed, slip angle, throttle/brake bar)

For original research on these, see git history of this file (pre-2026-06-05 version).

---

## Sources

- [The Book of Shaders: Fractal Brownian Motion](https://thebookofshaders.com/13/)
- [Inigo Quilez: Domain Warping](https://iquilezles.org/articles/warp/)
- [Inigo Quilez: Noise Derivatives / Slope Warping](https://iquilezles.org/articles/morenoise/)
- [Red Blob Games: Terrain from Noise](https://www.redblobgames.com/maps/terrain-from-noise/)
- [Learn Procedural Generation: Noise for Terrains](https://aparis69.github.io/LearnProceduralGeneration/terrain/procedural/noise_for_terrains/)
- [The Mountains of Madness — Interactive Terrain Algorithms (JS demos)](https://amanpriyanshu.github.io/The-Mountains-of-Madness/)
- [Musgrave: Procedural Fractal Terrains (PDF)](https://www.classes.cs.uchicago.edu/archive/2015/fall/23700-1/final-project/MusgraveTerrain00.pdf)
- [Isara Docs: Ridged Multifractal](https://docs.isaratech.com/ue4-plugins/noise-library/generators/ridged-multi)
- [Brano Kemen: Roads (Game Developer)](https://www.gamedeveloper.com/programming/roads)
- [Stanford: Movement costs for pathfinders (slope-cost A*)](http://theory.stanford.edu/~amitp/GameProgramming/MovementCosts.html)
- [Alternative Earth: Deterministic tile-based procedural roads](https://stevebennett.me/2020/01/03/alternative-earth-procedurally-generated-map-using-vector-tiles/)
- [Mulberry32: Fast 32-bit seeded PRNG](https://www.4rknova.com/blog/2026/03/01/mulberry32-rng)
- [Sierra Nevada Eastern Escarpment — SummitPost](https://www.summitpost.org/the-magnificent-eastern-escarpment-of-the-sierra-nevada/277484)
- [Owens Valley elevation stats — Wikipedia](https://en.wikipedia.org/wiki/Owens_Valley)
- [Three.js FlyControls example](https://threejs.org/examples/misc_controls_fly.html)

---
*Feature research for: RangerSim v1.1 Mountains & Roads*
*Researched: 2026-06-05*
