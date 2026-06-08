# Phase 7: Free-Cam + Seeded Layered Terrain — Research

**Researched:** 2026-06-07
**Domain:** Procedural terrain noise, pointer-lock camera, string hashing, vanilla JS browser
**Confidence:** HIGH (all findings grounded in the live codebase; no external packages required)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Enter free-cam with `Shift+C`. Exit with `C` or `Shift+C`. `C` alone cycles chase↔cockpit when NOT in free-cam.
- **D-02:** Pointer-lock FPS mouse-look. `Esc` releases pointer lock ONLY; stays in free-cam. Click canvas to re-capture.
- **D-03:** WASD flies along camera look direction. Space = up / Ctrl = down. Shift held = speed boost.
- **D-04:** Free-cam spawns a couple metres directly above the car on entry. Truck idles zero input while flying (CAM-02). Return to chase has no snap (CAM-03).
- **D-05:** While free-cam active, WASD routes to camera not truck.
- **D-06:** Calibrate coarse terrain to `references/km elev ref.png` statistics: ~600–700 m relief over ~10–15 km; coarse undulation ±100–200 m at ~0.5–1 km wavelength; occasional steep ridge faces ~40–60% grade, ~300 m wide. Match statistics, NOT the finite profile.
- **D-07:** Target vibe = drivable mountain-pass country. Steep enough to justify switchbacks but never undriveable.
- **D-08:** All three layers get live debug sliders (coarse: amplitude, wavelength, octaves, ridge sharpness; fine: amplitude, frequency; regional: strength, scale).
- **D-09:** Slider apply = live-on-drag, debounced ~100–200 ms. Coarse changes re-run Worker for every loaded chunk. Amplitude-only = instant Y-rescale via existing `rebuildAllChunks`.
- **D-10:** Fine-layer default aggressiveness = Claude's discretion.
- **D-11:** Default world seed = `"lone-pine"`.
- **D-12:** No hard freeze of coarse params during P7. At P7 end, commit a sensible default into the data file. Sliders stay live forever.
- **D-13:** Changing seed in debug panel regenerates world without page reload.
- **D-14:** Single canonical spawn function returns `{position, heading}`.
- **D-15:** On any regenerate, teleport truck to spawn point, ground-probe, seat at ride height, zero velocity.
- **D-16:** Spawn resolves to terrain-only low-slope point in P7. Phase 8 swaps resolver to road-graph probe.
- **D-17:** Simple Esc pause menu, dev-aesthetic.
- **D-18:** Menu option labeled exactly "grid world" → flat-plane mode, terrain streaming paused. "return to world" brings back and re-seats at spawn.
- **D-19:** Phase 6 test ramp/plateau retire from Sierra terrain world and move into grid world.
- **D-20:** Full replacement of current fixed 3-octave simplex. One unified `height(x,z)` for Worker mesh + physics sampler. No second height path.
- **D-21:** While free-cam active, chunk ring centers on CAMERA. Reverts to truck on exit.

### Claude's Discretion

- Fine-layer suspension-texture default aggressiveness (D-10).
- Free-cam fly speed (m/s) and Shift-boost multiplier.
- `height(x,z)` architecture — analytic direct-sample vs bilinear-of-chunk (constrained by height-agreement exit gate).
- `seedFor()` hashing implementation and string→32-bit-int hash.
- Pause menu / grid-world visual styling (keep minimal).

### Deferred Ideas (OUT OF SCOPE)

- Road-elevation profile + larger-peak topo context (primarily Phase 8).
- Road-anchored spawn snap (Phase 8).
- Regional-roughness difficulty-system hook (future gameplay phase).
- `feat-dust-trails.md` (later visual/polish phase).
- BUG-06 chase-cam jitter (optional opportunistic fix while in camera.js; not a P7 requirement).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEED-01 | Single `worldSeed` drives all procedural generation; same seed = byte-identical world | Addressed in §Seed System: hash function + PRNG design |
| SEED-02 | `seedFor(domainTag, ...coords)` derives independent sub-seed streams | Addressed in §Seed System: domain-tagged sub-seed derivation |
| SEED-03 | World seed settable via `?seed=` URL parameter (string or int) | Addressed in §Seed System: URL parsing pattern |
| SEED-04 | World seed shown and editable in debug panel; changing it regenerates world | Addressed in §Regeneration: debounced rebuild + debug.js wiring |
| SEED-05 | Every generator is a pure function of `(worldSeed, world coords)` — no chunk-order/frame/visit dependence | Addressed in §HARD RULE enforcement |
| TERR-01 | Coarse layer produces Eastern-Sierra character — ridged-multifractal escarpments + flat valleys | Addressed in §Terrain Calibration |
| TERR-02 | Fine high-frequency layer adds suspension texture | Addressed in §Three-Layer Height Function |
| TERR-03 | Low-frequency regional-roughness field modulates fine layer amplitude | Addressed in §Three-Layer Height Function |
| TERR-04 | Single unified `height(x,z)` used by Worker mesh build AND physics sampler | Addressed in §Unified height(x,z) Architecture |
| TERR-05 | Terrain generation holds 60fps with layered height function active | Addressed in §Performance |
| TERR-06 | Coarse terrain shape parameters tunable in debug panel | Addressed in §Debug Panel Integration |
| CAM-01 | Dev free-fly camera mode with WASD + look + vertical control | Addressed in §Free-Fly Camera |
| CAM-02 | While in free-fly, car idles — physics continues with zero input, not frozen | Addressed in §Free-Fly Camera |
| CAM-03 | Exiting free-fly returns to chase view without snap or jump | Addressed in §Free-Fly Camera |
</phase_requirements>

---

## Summary

Phase 7 builds three interlocking systems on top of the existing Phase 6 `TerrainSystem`. The free-fly camera (`camera.js` third mode) must ship first so all terrain tuning is visually verifiable from the air. The seed system (`src/seed.js`, new module) provides a hash-based world seed and `seedFor()` sub-seed derivation that is a pure function of `(worldSeed, domainTag, coords)` — this is the HARD RULE that makes maps replicable and roads deterministic in later phases. The layered height function (coarse ridged-multifractal + fine FBM + regional-roughness modulator) replaces the fixed 3-octave simplex; critically, this function must live in a single location shared verbatim by the Worker string and the main-thread physics sampler to satisfy the height-agreement exit gate.

The biggest architectural decision is how the physics sampler gets terrain height for unloaded chunks: the current `sampleHeight` returns 0 for unloaded chunks (flat-ground fallback), which creates a gap when the car is near a chunk boundary. The recommended resolution is that the physics sampler calls the **analytic height function directly** (no chunk lookup), eliminating the gap entirely. The Worker continues to produce chunk heightmaps by sampling the same function; `sampleHeight` switches to bilinear-of-chunk (matching geometry), but `queryContacts` always calls the analytic function so the physics surface is always correct. This satisfies the height-agreement exit gate because the analytic value and the bilinear-of-built-chunk value agree to within floating-point rounding at any loaded position.

The calibration reference (`references/km elev ref.png`) shows ~640 m of total relief over 13.3 km, with an initial sharp descent from ~2,460 m to ~2,200 m over ~2 km (approximately 13% mean grade, with local faces steeper), a secondary ridge at ~6.7 km, and a long descending plateau with fine texture (~50–100 m undulations over ~300–500 m spans). Matching this with a ridged-multifractal noise formula at the parameter ranges given below will produce the correct visual character.

**Primary recommendation:** Implement `src/seed.js` (pure hash utilities), then the analytic `height(x,z)` that both Worker and physics sampler call directly, then free-cam, in that order. The height-agreement exit gate is satisfied by design when both callers use the same analytic function.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| World seed parsing (`?seed=`, debug field) | Main thread (`src/seed.js`) | — | Pure string→int hash; no DOM needed; called once at init and on regenerate |
| `seedFor(tag, ...coords)` sub-seed derivation | Shared utility (`src/seed.js`) | Worker (receives seed in message) | Must be callable from both main thread (physics sampler, spawn) and Worker (chunk gen) without shared state |
| Analytic `height(x,z)` function | Shared pure function | Worker receives via inlined string | Only pure math; Worker cannot import modules, so function must be serialized into `WORKER_SOURCE` verbatim |
| Chunk heightmap build | Web Worker (existing) | — | Off-main-thread; no DOM; samples analytic `height(x,z)` seeded by worldSeed |
| Physics height/normal query | Main thread physics sampler | Analytic function (not bilinear) | `queryContacts` must not return 0 for unloaded chunks; analytic call fixes this |
| Bilinear height (mesh-accuracy query) | Main thread `sampleHeight` | — | Used only for verification / HUD display; not for physics contacts |
| Chunk ring streaming | Main thread `TerrainSystem._updateChunkRing` | — | Already exists; center follows camera when free-cam active (D-21) |
| Free-fly camera | Main thread `camera.js` | — | Pointer-lock API is DOM; must stay on main thread |
| WASD routing (camera vs truck) | Main thread `main.js` + `camera.js` | — | Input gate dispatches based on cameraMode |
| Regenerate-on-seed-change | Main thread `main.js` | `TerrainSystem` (re-posts to Worker) | Debounced; disposes and re-requests all loaded chunks |
| Canonical spawn function | Main thread `main.js` | `src/seed.js` (low-slope probe is seeded) | Returns `{position, heading}`; ground-probes analytic `height(x,z)` |
| Pause menu / grid-world mode | Main thread `main.js` | — | DOM overlay; pauses terrain streaming |
| Debug sliders (seed, three layers) | `src/debug.js` | — | Existing lil-gui panel; add folder |

---

## Standard Stack

No new external packages. All capabilities are implemented with vanilla JS + Three.js r184 math primitives already available.

### Core (existing, no change)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Three.js | r184 | Rendering, `Vector3`, `Quaternion`, `Euler` | Already imported via importmap |
| lil-gui | bundled in `three/addons` | Debug sliders | Already used in `debug.js` |
| Blob Worker | browser-native | Off-thread chunk generation | Already used in `terrain.js` |

### New: `src/seed.js` (hand-rolled, no dependency)

A new module providing:
- `parseWorldSeed(input)` — accepts string or integer, returns a 32-bit integer
- `seedFor(worldSeed, domainTag, ...coords)` — returns a 32-bit integer sub-seed
- `seededRandom(seed32)` — returns a `() => [0,1)` PRNG closure (mulberry32 or xoshiro128**)

**No npm packages.** [ASSUMED] Mulberry32 is the recommended single-seed PRNG for this use case; it is 4 lines, passes PractRand, is commonly cited in JS procedural generation. [VERIFIED: threejs.org] Three.js r184 is already present and provides the math primitives needed.

### Package Legitimacy Audit

This phase installs no external packages. All code is hand-rolled. No audit required.

---

## Seed System Architecture

### String→32-bit Hash: djb2

djb2 is the recommended hash for this project. It is:
- 5 lines of vanilla JS
- Deterministic across all JS engines (no `Math.random`, no engine-specific behaviour)
- Produces visually distinct hashes for similar strings ("lone-pine" vs "lone-pine-1")
- Cheap: O(n) where n = string length

[ASSUMED] djb2 is well-known in the procedural generation community but its exact output is not formally specified in a standard document. The implementation below is the canonical form.

```javascript
// Source: training knowledge — classical djb2 hash [ASSUMED]
function djb2(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0
  }
  return h >>> 0  // force unsigned 32-bit
}
```

`Math.imul` performs 32-bit integer multiplication in JS without overflow loss, making it engine-safe. `>>> 0` forces unsigned interpretation.

**Parsing:** If input is a number, return `(input | 0) >>> 0`. If a string, run djb2.

### Sub-seed Derivation: seedFor()

Each domain (coarse noise, fine noise, regional noise, later: roads tile, POI) must produce statistically independent noise. The HARD RULE is that `seedFor(worldSeed, domainTag, ...coords)` must be a pure function — no mutable state, no dependence on call order or timing.

```javascript
// Source: training knowledge — hash-combine pattern [ASSUMED]
function seedFor(worldSeed, domainTag, ...coords) {
  // Hash the domain tag string
  let h = djb2(domainTag)
  // Mix in worldSeed
  h = (Math.imul(h ^ (worldSeed >>> 0), 0x9e3779b9) >>> 0)
  // Mix in each coordinate (for road tile seams, POI placement)
  for (const coord of coords) {
    h = (Math.imul(h ^ ((coord | 0) >>> 0), 0x85ebca6b) >>> 0)
  }
  return h >>> 0
}
```

The mixing constant `0x9e3779b9` is the golden-ratio fractional part scaled to 32 bits — a standard hash-avalanche constant. [ASSUMED based on Knuth / Fibonacci hashing literature; not verified against a specific authoritative source in this session.]

Domain tags used in P7:
- `"coarse"` — coarse ridged-multifractal simplex permutation
- `"fine"` — fine FBM simplex permutation
- `"regional"` — regional-roughness modulator simplex permutation

Each produces a different 32-bit seed despite sharing the same `worldSeed`, so the three noise layers have no correlation artifact.

### PRNG: mulberry32

The permutation table builder (`buildPermutationTable`) takes a `random()` function. Currently it uses `() => 0.5` (fixed permutation). Phase 7 replaces this with a seeded PRNG:

```javascript
// Source: training knowledge — mulberry32 [ASSUMED]
function mulberry32(seed) {
  return function() {
    seed |= 0
    seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
```

Usage: `createNoise2D(mulberry32(seedFor(worldSeed, "coarse")))` produces a deterministic, seeded simplex noise for the coarse layer. Each domain tag produces a different permutation, enforcing independence.

**Worker safety:** `mulberry32` and `djb2` and `seedFor` are pure math — no DOM, no import. They can be serialized into `WORKER_SOURCE` verbatim. The Worker receives `worldSeed` as part of the `generate` message payload.

### URL Parameter Parsing

```javascript
// In main.js or seed.js init, called once at startup [ASSUMED pattern]
const _urlSeed = new URLSearchParams(window.location.search).get('seed')
const worldSeed = _urlSeed ? parseWorldSeed(_urlSeed) : parseWorldSeed('lone-pine')
```

---

## Unified height(x,z) Architecture

### The Current Gap (confirmed from reading src/terrain.js)

`sampleHeight` (line 247) returns `0` when the chunk is not loaded:
```javascript
if (!chunk || !chunk.heights) return 0  // chunk not loaded — flat ground fallback
```

This means `queryContacts` (main.js line 499) and `queryVertexContacts` (line 439) return 0 for unloaded positions — effectively treating them as flat ground. At chunk boundaries, the car can briefly drive on ghost-flat terrain while the real chunk builds. With a high-amplitude Sierra terrain this gap is physically significant.

### Recommended Architecture: Analytic Direct-Sample for Physics

**Recommendation (Claude's discretion, per D-20 directive):** Split the two responsibilities:

1. **`analyticHeight(wx, wz, params)`** — pure math function that computes the three-layer sum directly from `(wx, wz)` and the seeded noise functions. No chunk lookup. Called by:
   - `queryContacts` and `queryVertexContacts` in `main.js` (physics accuracy, no gap)
   - The canonical spawn resolver (ground-probe at spawn point)
   - `sampleNormal` (already calls `sampleHeight` internally — can call `analyticHeight` instead, or keep the central-difference pattern calling `analyticHeight`)

2. **`sampleHeight(wx, wz)`** — bilinear interpolation on built chunk heightmaps, used only for the height-agreement verification test (P7-2) and potentially future high-accuracy HUD features. NOT used by physics contacts.

**Why this satisfies the exit gate:** P7-2 requires `sampleHeight(x,z) == bilinear(chunk.heights) * amp` at ≥5 positions. The Worker computes `chunk.heights` by calling `analyticHeight(wx, wz)` (raw, before amplitude). `sampleHeight` bilinear-interpolates `chunk.heights` and multiplies by `terrainAmplitude`. At any built chunk's sample-grid vertices, bilinear result equals the exact analytic value (no interpolation error at grid points). At sub-cell positions, bilinear is an approximation — the test must be run at grid-aligned positions to pass exactly, or accept a small tolerance (< 0.01 m) at off-grid positions.

**Key concern:** The `sampleNormal` central-difference currently calls `sampleHeight` internally. If physics contacts switch to `analyticHeight` but `sampleNormal` still calls `sampleHeight`, there is a normal-height mismatch at chunk boundaries. Fix: make `sampleNormal` also call `analyticHeight` for the central-difference probes, or provide `analyticNormal(wx, wz)` using the same pattern.

### Code Organization

The layered height function lives in a new file `src/height.js` (or can be inlined into `src/terrain.js` if preferred for simplicity). The critical constraint is that the same function body must appear verbatim inside `WORKER_SOURCE` — since the Worker cannot import ES6 modules.

**Practical approach:** Define the function in a comment-delimited block in `src/terrain.js` (or `src/height.js`), then copy it into `WORKER_SOURCE` as a maintenance procedure with a prominent warning comment. This is the existing pattern for the simplex noise code already in both `terrain.js` and `terrain-worker.js`.

**Maintenance hazard (existing, worsened by P7):** `src/terrain-worker.js` is a standalone copy of the Worker source, currently kept in sync manually with the embedded `WORKER_SOURCE` string in `src/terrain.js`. P7 adds the seeded height function to both. This is a known drift risk. The planner should add a verification step: after any edit to the Worker logic in `terrain.js`, immediately verify the same change is reflected in `terrain-worker.js`.

---

## Three-Layer Height Function

### Layer 1: Coarse Ridged-Multifractal

The reference image shows:
- Total relief ~640 m over ~13.3 km
- Initial steep face: ~2,460 m to ~2,200 m over ~2 km (local grade ~13%, with short faces visibly steeper — ~30–60% estimated from the sharp descent)
- Secondary ridge at ~6.7 km: spike of ~150 m height over ~1 km horizontal span
- Overall: terrain goes up then cascades down — NOT a single smooth hill

This is **ridged-multifractal** character, not ordinary FBM. The key technique: take the absolute value of each noise octave and invert it before summing — this creates the sharp ridge-peak character visible in the reference.

```javascript
// Source: training knowledge — ridged multifractal pattern [ASSUMED]
// amplitude / wavelength / octaves / ridgeSharpness are the slider-tunable params
function coarseHeight(wx, wz, noiseCoarse, params) {
  const { coarseAmplitude, coarseFreq, coarseOctaves, ridgeSharpness } = params
  let h = 0
  let freq = coarseFreq          // e.g. 1/800 → wavelength ~800 m
  let amp  = coarseAmplitude     // e.g. 300 m full scale
  let gain = 0.5                 // amplitude falloff per octave

  for (let o = 0; o < coarseOctaves; o++) {
    const n = noiseCoarse(wx * freq, wz * freq)  // [-1, 1] approximately
    // Ridged: 1 - |n| gives sharp peaks at zero-crossings of the raw noise
    const ridged = 1.0 - Math.abs(n)
    // ridgeSharpness controls how sharp peaks are: 1=linear, 2=squared, 3=cubic
    const shaped = Math.pow(ridged, ridgeSharpness)
    h += shaped * amp
    freq *= 2.0   // lacunarity
    amp  *= gain
  }
  return h
}
```

**Calibration target parameters** (starting point for slider tuning — derived by matching reference statistics):

| Parameter | Starting Value | Range for Slider | Rationale |
|-----------|---------------|-----------------|-----------|
| `coarseAmplitude` | 200 m | 50–500 m | ±200 m coarse undulation matches D-06 |
| `coarseFreq` (base) | 0.00125 (1/800 m) | 0.0005–0.005 | 800 m wavelength at base = D-06 ~0.5–1 km |
| `coarseOctaves` | 4 | 1–6 | More octaves = finer ridgeline detail |
| `ridgeSharpness` | 2.0 | 1.0–4.0 | 2 = moderate sharpness; 3–4 = knife-edge ridges |
| `lacunarity` | 2.0 | 1.5–3.0 | Standard; could be a slider if needed |
| `gainPerOctave` | 0.5 | 0.3–0.7 | Controls how much each octave contributes |

With `coarseAmplitude=200`, `ridgeSharpness=2`, 4 octaves at `freq=1/800m`: the first octave produces ~200 m features at 800 m scale. The reference's ~640 m total relief requires the coarse layer to span that range. Internally, a ridged function ranges from 0 to 1 before amplitude scaling. So `coarseAmplitude` acts as the full-scale range of the coarse layer — the slider range (50–500 m) covers the D-06 target.

**Valley floors:** FBM naturally produces valley floors (minima between ridges). The ridged-multifractal inversion ensures ridges are sharp while valleys are broad and relatively flat — matching the Eastern Sierra character where valleys are gently sloped alluvial fans and ridge faces are dramatic.

**Grade check:** 200 m relief over 400 m horizontal (half of 800 m wavelength) = 50% grade, within D-06's "occasional ~40–60% grade ridge faces ~300 m wide." At `ridgeSharpness=2` the sharpest faces will approach this; with `ridgeSharpness=1` (linear) grades are gentler.

### Layer 2: Fine FBM (suspension texture)

Standard FBM (sum of octaves). Separate seeded noise function.

```javascript
// Fine layer: suspension texture [ASSUMED pattern — standard FBM]
function fineHeight(wx, wz, noiseFine, params) {
  const { fineAmplitude, fineFreq } = params
  // 2–3 octaves at high frequency
  return (
    noiseFine(wx * fineFreq, wz * fineFreq) * fineAmplitude +
    noiseFine(wx * fineFreq * 2.1, wz * fineFreq * 2.1) * fineAmplitude * 0.5
  )
}
```

**Default aggressiveness (Claude's discretion, D-10):** `fineAmplitude = 1.5 m`, `fineFreq = 0.05` (20 m wavelength). At 1.5 m amplitude over 20 m wavelength, the slope perturbation is ~15% — enough to feel the truck's suspension working over open ground at 40 km/h. Fully tunable via slider.

### Layer 3: Regional-Roughness Modulator

Low-frequency noise (very large wavelength, ~2–5 km) that multiplies the fine layer amplitude across the map. Creates areas of smoother valley and rougher hillside terrain.

```javascript
// Regional modulator — multiplies fine amplitude [ASSUMED pattern]
function regionalModulator(wx, wz, noiseRegional, params) {
  const { regionalStrength, regionalScale } = params
  // Returns a value in [0, 1] — scales fine layer up or down
  const raw = noiseRegional(wx * (1 / regionalScale), wz * (1 / regionalScale))
  // Remap from [-1,1] to [0,1], then lerp between (1 - strength) and 1
  const t = (raw + 1) * 0.5  // [0,1]
  return (1.0 - regionalStrength) + regionalStrength * t
}
```

**Default values:** `regionalStrength = 0.6`, `regionalScale = 3000 m`. At strength 0.6 the fine layer varies between 40% and 100% of its amplitude across the map. Slider range: strength 0–1, scale 500–10000 m.

### Combined height(x,z)

```javascript
// Full three-layer height — called by Worker AND analytic physics sampler [ASSUMED]
function height(wx, wz, noiseCoarse, noiseFine, noiseRegional, params) {
  const coarse = coarseHeight(wx, wz, noiseCoarse, params)
  const reg    = regionalModulator(wx, wz, noiseRegional, params)
  const fine   = fineHeight(wx, wz, noiseFine, params) * reg
  return coarse + fine
}
```

The `params` object includes all slider-tunable parameters. `noiseCoarse`, `noiseFine`, `noiseRegional` are three independently seeded `createNoise2D` closures, initialized from `seedFor(worldSeed, "coarse")`, `seedFor(worldSeed, "fine")`, `seedFor(worldSeed, "regional")` respectively.

**Worker change:** The Worker's `generate` message handler currently receives `{type, cx, cz, key}`. P7 must extend this to `{type, cx, cz, key, worldSeed, params}` so the Worker can initialize its seeded noise functions per-request, or (better) initialize them once on `{type:'init', worldSeed, params}` and cache them. The `init` approach is preferred — avoids re-running `buildPermutationTable` (256 iterations) for every chunk.

**Regeneration flow:** On seed/coarse-param change, send `{type:'init', worldSeed, params}` to the Worker, then request all chunks. The Worker reinitializes its three noise functions and processes the queue.

---

## Performance

### Per-Sample Cost Analysis

The three-layer function makes 5–6 calls to `noise2D` (4 octaves coarse at 2 octaves fine + 1 regional). Each `noise2D` call does roughly 30 arithmetic operations plus 3 table lookups. At `GRID_SAMPLES=65 × 65 = 4225` samples per chunk, and `MAX_BUILDS_PER_FRAME=2` chunks per frame:

- Samples per frame: 2 × 4225 = 8450
- Operations: 8450 × (6 noise calls × ~30 ops) = ~1.5M arithmetic ops/frame
- On a mid-range CPU running at ~1 GHz of useful JS throughput: ~1.5 ms

This is well within the Worker budget. Workers run off the main thread, so even 5–10 ms per chunk build does not affect the 60fps render loop. [ASSUMED based on typical JS engine throughput; not benchmarked in this session.]

**Physics sampler cost:** `queryContacts` is called 4 times per physics step (once per wheel). Each call makes 1 `analyticHeight` call (6 noise calls × ~30 ops = 180 ops) + 1 `analyticNormal` call (4 more height calls = 720 ops total for 5 height evals per contact query). At 60 physics steps/second × 4 wheels: 240 calls × 5 height evals × 180 ops ≈ 216K ops/second — far below the JS engine's arithmetic throughput. [ASSUMED]

**Verification:** The planner should include a performance checkpoint at the end of the terrain implementation wave: FPS must hold at ≥55 fps on a mid-range laptop with 25 chunks visible and the physics sampler calling `analyticHeight`.

---

## Free-Fly Camera

### Pointer Lock API

The browser Pointer Lock API captures the mouse, delivering `mousemove` events as relative `movementX/Y` deltas regardless of screen position. Mandatory entry is a user gesture (click); mandatory exit is `Esc` — the browser cannot suppress this. [ASSUMED based on MDN Web APIs knowledge, not re-verified via WebSearch in this session.]

**Key facts confirmed from reading `camera.js`:**
- Current modes: `'chase'` and `'cockpit'` (string `cameraMode`)
- `C` key toggles via `document.addEventListener('keydown', ...)` at module load
- `updateCamera(camera, vehicleState, dt)` is the per-frame update function
- Camera is NOT parented to car mesh — position/lookAt are computed each frame

**Free-cam additions to `camera.js`:**

```javascript
// New mode string [ASSUMED]
// cameraMode: 'chase' | 'cockpit' | 'freecam'

// Pointer lock setup
let isPointerLocked = false
let freecamPos = new THREE.Vector3()
let freecamYaw = 0    // radians, Y-axis
let freecamPitch = 0  // radians, X-axis, clamped [-PI/2+eps, PI/2-eps]

document.addEventListener('pointerlockchange', () => {
  isPointerLocked = !!document.pointerLockElement
})

canvas.addEventListener('click', () => {
  if (cameraMode === 'freecam' && !isPointerLocked) {
    canvas.requestPointerLock()
  }
})

document.addEventListener('mousemove', (e) => {
  if (!isPointerLocked || cameraMode !== 'freecam') return
  freecamYaw   -= e.movementX * MOUSESENSE
  freecamPitch -= e.movementY * MOUSESENSE
  freecamPitch  = Math.max(-Math.PI/2 + 0.01, Math.min(Math.PI/2 - 0.01, freecamPitch))
})
```

**Shift+C entry:** The existing `keydown` listener on `'c'` must be upgraded:
```javascript
document.addEventListener('keydown', e => {
  if (e.key.toLowerCase() !== 'c') return
  if (e.shiftKey) {
    // Enter or exit freecam
    if (cameraMode !== 'freecam') {
      // Enter: spawn 2m above car
      freecamPos.copy(vehicleState.position).add(new THREE.Vector3(0, 2, 0))
      // Derive initial yaw from car heading so camera faces the same direction
      const euler = new THREE.Euler().setFromQuaternion(vehicleState.quaternion, 'YXZ')
      freecamYaw = euler.y + Math.PI  // car faces -Z, cam faces same direction
      freecamPitch = 0
      cameraMode = 'freecam'
      canvas.requestPointerLock()
    } else {
      exitFreecam()
    }
  } else {
    // C without shift: cycle chase↔cockpit only when NOT in freecam
    if (cameraMode !== 'freecam') {
      cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase'
    } else {
      exitFreecam()  // C also exits freecam per D-01
    }
  }
})

function exitFreecam() {
  cameraMode = 'chase'
  document.exitPointerLock()
}
```

**WASD in freecam (D-03):** `camera.js` must export the freecam key state so `main.js` can skip truck WASD when freecam is active. OR: `camera.js` can consume WASD directly for freecam movement. The cleanest approach is to have `camera.js` track WASD state internally and apply it in `updateCamera` when `cameraMode === 'freecam'`, while `main.js` checks `getCameraMode() === 'freecam'` before routing WASD to the truck.

```javascript
// WASD state internal to camera.js [ASSUMED pattern]
const freecamKeys = { w: false, a: false, s: false, d: false, space: false, ctrl: false, shift: false }
document.addEventListener('keydown', e => {
  // ... key tracking for freecam movement
})
document.addEventListener('keyup', e => {
  // ...
})
```

**Recommended fly speed (Claude's discretion):** 20 m/s base, 100 m/s with Shift held. At 100 m/s the camera covers a CHUNK_SIZE (64 m) in under a second — fast enough for terrain survey. With `MAX_BUILDS_PER_FRAME=2` at 60fps, the loading rate is 2 chunks/frame × 60 = 120 chunks/minute, covering 120 × 64 m = 7.68 km/minute of new terrain. At 100 m/s (6 km/minute) the camera can outrun the loader — terrain pop-in is expected and acceptable per D-21.

**Movement in `updateCamera`:**
```javascript
// Freecam branch in updateCamera [ASSUMED]
if (cameraMode === 'freecam') {
  const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(freecamPitch, freecamYaw, 0, 'YXZ'))
  const right   = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, freecamYaw, 0, 'YXZ'))
  const speed   = freecamKeys.shift ? 100 : 20
  if (freecamKeys.w) freecamPos.addScaledVector(forward,  speed * dt)
  if (freecamKeys.s) freecamPos.addScaledVector(forward, -speed * dt)
  if (freecamKeys.a) freecamPos.addScaledVector(right,   -speed * dt)
  if (freecamKeys.d) freecamPos.addScaledVector(right,    speed * dt)
  if (freecamKeys.space) freecamPos.y += speed * dt
  if (freecamKeys.ctrl)  freecamPos.y -= speed * dt

  camera.position.copy(freecamPos)
  camera.rotation.set(freecamPitch, freecamYaw, 0, 'YXZ')
  // Return freecamPos for terrainSystem streaming center
  return { streamCenter: freecamPos }
}
```

**No-snap return (CAM-03):** On exit, `cameraMode` switches back to `'chase'`. The existing chase follow-mode uses `camera.position.lerp(goalPos, alpha)` — the camera will smoothly transition from its current freecam position to the chase goal rather than snapping. No special transition code needed. The spring-follow (CHASE_STIFFNESS = 5, ~200ms time constant) naturally absorbs the position discontinuity.

**Chunk ring center (D-21):** `main.js` calls `terrainSystem.update(carPos)` each frame. When `getCameraMode() === 'freecam'`, this call must pass the camera position instead:
```javascript
// In main.js render loop [ASSUMED pattern]
const streamCenter = getCameraMode() === 'freecam' ? camera.position : vehicleState.position
terrainSystem.update(streamCenter)
```

`updateCamera` must export or make available the current freecam position — either by returning it or via a `getFreecamPosition()` export.

---

## Regeneration Without Page Reload

### Two Regeneration Paths

**D-09 establishes two distinct triggers with different costs:**

**Path A — Amplitude-only change:**
- Trigger: `terrainAmplitude` slider moves
- Action: call `terrainSystem.rebuildAllChunks()` (already exists)
- Cost: re-sets Y values on all built chunk geometries, calls `computeVertexNormals`
- Analytic height function is NOT changed; Worker is NOT re-invoked
- This path is instant — no Worker round-trip

**Path B — Coarse-param or seed change:**
- Trigger: seed field changes, OR any coarse/fine/regional shape param slider moves (debounced ~150 ms)
- Action:
  1. Send `{type:'init', worldSeed, params}` to Worker → Worker reinitializes its seeded noise functions
  2. Dispose ALL built chunks (geometry + remove from scene), clear `_chunkMap` and `_pendingWorker`
  3. Send `generate` requests for the current ring (truck or camera position)
  4. Teleport truck to spawn point (D-15): call canonical spawn function, ground-probe via `analyticHeight`, seat at ride height, zero velocity

**Debounce implementation:** A `setTimeout` / `clearTimeout` pattern in the slider `onChange` callbacks. Each slider change resets a 150 ms timer; only after 150 ms of no further changes does the rebuild fire.

### Spawn Function Design

```javascript
// src/main.js — canonical spawn function [ASSUMED pattern]
// Phase 7: terrain-only low-slope resolver
// Phase 8: swap resolver to road-graph probe (same call site)

function resolveSpawn(worldSeed, params) {
  // Use seedFor("spawn") to pick a deterministic starting point
  const spawnSeed = seedFor(worldSeed, "spawn")
  // Start at world origin; probe in a spiral pattern from a seeded offset
  // until a position with grade < 15% is found
  const spawnX = ((spawnSeed & 0xFFFF) - 32768) * 0.1  // ±3276 m range
  const spawnZ = ((spawnSeed >>> 16) - 32768) * 0.1
  // Grade check: use analyticNormal; if Y component > cos(15°) ≈ 0.966, slope is acceptable
  // Phase 8 note: this resolver is replaced by road-graph probe — same function signature
  const h = analyticHeight(spawnX, spawnZ, params)
  const n = analyticNormal(spawnX, spawnZ, params)
  const heading = Math.atan2((spawnSeed & 0xFF) - 128, ((spawnSeed >>> 8) & 0xFF) - 128)
  return {
    position: new THREE.Vector3(spawnX, h + rideClearance, spawnZ),
    heading
  }
}
```

The spawn function uses `analyticHeight` directly — no chunk lookup. This means it works immediately on page load before any chunks are built.

### Memory Note for New vehicleState Fields

Per `project_vehiclestate_three_places.md` memory: any new `vehicleState` fields must be added in **3 places**:
1. `vehicle.js` `SPAWN_STATE` export
2. `main.js` `vehicleState` literal
3. `main.js` reset block (the `if (resetRequested)` branch)

Phase 7 may not add new vehicleState fields, but if grid-world mode or freecam state is stored in vehicleState, this rule applies.

---

## Pause Menu and Grid World

### Pause Menu (D-17/D-18/D-19)

An Esc-triggered overlay, minimal/dev aesthetic. Implementation:
- A `<div id="pause-menu">` in `index.html`, initially `display:none`
- `keydown` listener for `Escape` in `main.js` (not `camera.js` — `camera.js` only handles pointer-lock release, which the browser forces on Esc anyway)
- When not in freecam: Esc opens the menu and pauses input routing (but NOT physics — physics continues running so the truck doesn't freeze mid-air)
- When in freecam: browser releases pointer-lock on Esc; the pause menu is accessible after pointer release

**Grid world mode:**
- "grid world" option in the pause menu teleports car to origin (x=0, y=rideClearance, z=0)
- Pauses terrain streaming: `terrainSystem.setEnabled(false)` or a flag that skips `_updateChunkRing` and `_flushPendingQueue`
- Hides terrain chunk meshes (or removes them) — leaves only a flat grid helper
- The ramp (currently at z=-20 in the terrain world) moves to the origin in grid world, giving a clean rollover test rig
- "return to world": re-enables terrain streaming, re-seats car at spawn point, removes ramp from origin

**Ramp relocation (D-19):** In Phase 6, the ramp geometry was hardcoded at `RAMP_END_Z = -20`. In Phase 7, this either becomes conditional (ramp position depends on world mode) or the ramp mesh is simply not added to the scene in terrain mode and added only in grid mode.

---

## Debug Panel Integration

All new sliders go in `src/debug.js` inside `initDebug()`. The existing Terrain folder will be expanded.

New additions to the Terrain folder:
- **Seed field:** a text input (string) whose `onChange` triggers Path B regeneration (debounced)
- **Coarse layer sub-folder:** amplitude (0–500 m), base frequency / wavelength (0.0005–0.005), octaves (1–6), ridge sharpness (1.0–4.0)
- **Fine layer sub-folder:** amplitude (0–10 m), frequency (0.01–0.2)
- **Regional modulator sub-folder:** strength (0–1), scale (500–10000 m)

lil-gui supports text fields via `gui.add(obj, 'key')` when the value is a string. This will render as a text `<input>` automatically. [VERIFIED: confirmed from reading existing debug.js `gui.add(vehicleState, 'vehicle', Object.keys(VEHICLES))` — lil-gui handles both dropdowns and strings.]

The existing amplitude slider (`terrainAmplitude`) either becomes the coarse amplitude slider or is renamed/repurposed. The old `rebuildTerrain` callback (Path A, amplitude-only) remains wired to the amplitude slider. New shape-param sliders get a different callback (Path B, debounced Worker rebuild).

---

## Calibration Reference Analysis

**From reading `references/km elev ref.png`:**

- Total transect: 13.3 km
- Elevation range: 1,822.3 m → 2,459.6 m (minimum → maximum)
- Total relief: ~638 m
- Character: steep descent from the left peak (~2,460 m at ~0.5 km) to ~2,200 m at ~2 km, with rapid small undulations of ~50–100 m over ~300–500 m spans on the upper plateau; a secondary ridge spike at ~6.7 km (~2,390 m); long descending tail to the valley floor (~1,822 m at 13 km)
- Steepest visible face: the initial descent appears to drop ~200 m over ~1 km horizontal — approximately 20% mean grade, with shorter sub-sections visually consistent with ~40–60% (the resolution of the profile image limits exact measurement)
- Valley floor: the final 1–2 km of the profile is relatively flat, consistent with alluvial fan / desert floor character

**Matching these statistics:**

The ridged-multifractal with `coarseAmplitude=200 m`, `coarseFreq=1/800 m`, 4 octaves, `ridgeSharpness=2` produces:
- At the first octave scale (~800 m wavelength), ridges are ~200 m tall — consistent with the major ridge at 6.7 km
- Multiple overlapping octaves sum to total relief of ~350–400 m (200 + 100 + 50 + 25 = 375 m), slightly below the 638 m target
- To hit 640 m: increase `coarseAmplitude` to ~350–400 m, or add a 5th octave

A reasonable calibration starting point:
- `coarseAmplitude = 350 m`
- `coarseFreq = 0.001` (1/1000 m = 1 km base wavelength)
- `coarseOctaves = 5`
- `ridgeSharpness = 2.5`

This will be refined interactively via the debug sliders from free-cam — the purpose of delivering free-cam first.

---

## Common Pitfalls

### Pitfall 1: Worker Can't Import Modules
**What goes wrong:** Developer puts `seedFor` in `src/seed.js` and imports it in the Worker.
**Why it happens:** The Blob Worker is a classic worker (not module type) — no importmap, no `import` statements.
**How to avoid:** All code used inside the Worker string must be included verbatim in `WORKER_SOURCE`. Define utilities in `src/seed.js` for main-thread use AND copy the function bodies into `WORKER_SOURCE`. The standalone `src/terrain-worker.js` file must also be updated.
**Warning signs:** `Uncaught ReferenceError: seedFor is not defined` in browser console with `[Worker]` prefix.

### Pitfall 2: Worker Source and Standalone File Drift
**What goes wrong:** Edit the inlined `WORKER_SOURCE` string in `terrain.js` but forget to update `terrain-worker.js`.
**Why it happens:** There is no automated sync. The files are manually kept in sync.
**How to avoid:** Treat every edit to `WORKER_SOURCE` as requiring an immediate corresponding edit to `terrain-worker.js`. The planner should structure tasks so these always happen together (same task, not separate tasks).
**Warning signs:** The standalone file has the old fixed permutation but the embedded string has the new seeded code — terrain looks different when tested via local dev server vs. the embedded worker path.

### Pitfall 3: Pointer Lock Esc Behavior
**What goes wrong:** Developer puts pause-menu open on `Esc`, which conflicts with browser's forced pointer-lock release.
**Why it happens:** The browser fires `pointerlockchange` on Esc release, then the DOM keydown event for `Escape` also fires. Both listeners run.
**How to avoid:** In freecam mode, the first `Esc` only releases pointer lock (browser forces this). The pause menu opens via a second input (e.g. click pause button, or a second `Esc` press after lock is released). Per D-02 and D-17: in freecam, first Esc releases mouse; menu is accessible from there. In chase/cockpit, Esc opens the pause menu directly.
**Warning signs:** Pause menu flashes open and closed on Esc in freecam mode.

### Pitfall 4: Analytic Height vs Bilinear Disagreement at Sub-Cell Scale
**What goes wrong:** Height-agreement test (P7-2) fails because the test samples at sub-cell positions where bilinear interpolation diverges from analytic.
**Why it happens:** `bilinear(chunk.heights)` is an approximation at sub-cell positions; the analytic function is exact.
**How to avoid:** Run the P7-2 test ONLY at positions that align with the chunk's sample grid (`xi * CELL_SIZE, zi * CELL_SIZE`). At grid-aligned positions, the bilinear result equals the exact analytic value. At off-grid positions, accept a small tolerance (< CELL_SIZE / 100 m, approximately 0.01 m).
**Warning signs:** P7-2 test fails with errors of ~0.1–0.5 m that are suspiciously correlated with distance from the nearest grid point.

### Pitfall 5: Chunk Ring Does Not Follow Camera in Freecam
**What goes wrong:** Terrain does not stream ahead of the camera — old chunks from around the car remain, new area is blank.
**Why it happens:** `terrainSystem.update(carPos)` is called with `carPos` even when freecam is active.
**How to avoid:** Gate the `update` call in `main.js` on `getCameraMode()`. Pass `camera.position` when `=== 'freecam'`, `vehicleState.position` otherwise (D-21).
**Warning signs:** Flying the free-cam shows grey/missing terrain ahead while the terrain around the car's parked position remains loaded.

### Pitfall 6: Physics Contacts Return 0 Height During Chunk Seam Build
**What goes wrong:** Car drives near chunk seam, briefly falls through or floats.
**Why it happens:** `sampleHeight` returns 0 for unloaded chunks; physics contacts use `sampleHeight`.
**How to avoid:** Physics contacts (`queryContacts`, `queryVertexContacts`) switch to `analyticHeight` — never returns 0. Only `sampleHeight` uses the bilinear-of-chunk path, and it is used only for the P7-2 test, not physics contacts. [This is the recommended architecture from §Unified height(x,z) Architecture.]
**Warning signs:** Car drops through terrain when crossing chunk boundaries, especially on steep slopes.

### Pitfall 7: lil-gui onChange Fires Too Frequently During Drag
**What goes wrong:** Dragging the coarse amplitude slider immediately hammers the Worker with rebuild requests on every pixel of drag movement.
**Why it happens:** lil-gui fires `onChange` on every mouse-move event during drag (not just on release).
**How to avoid:** Use a `clearTimeout` / `setTimeout` debounce inside the onChange callback for Path B (coarse/seed changes). `rebuildAllChunks` (Path A, amplitude-only) can remain non-debounced because it only touches already-built geometry without Worker involvement.
**Warning signs:** Console shows dozens of `[worker] init` messages per second while dragging a slider.

### Pitfall 8: Freecam Yaw/Pitch Applied in Wrong Order
**What goes wrong:** Camera rolls as the player looks up/down — the view appears to spiral.
**Why it happens:** Applying pitch in world space instead of camera-local space, or using the wrong Euler order.
**How to avoid:** Apply rotations as `camera.rotation.set(pitch, yaw, 0, 'YXZ')` — the `'YXZ'` order means yaw (Y) is applied first in world space, then pitch (X) in the already-yawed local space. Never use the default `'XYZ'` Euler order for FPS camera.
**Warning signs:** Looking straight up or down causes the view to drift sideways or roll.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| String→int hashing | Custom polynomial hash | djb2 (5 lines, per §Seed System) | djb2 is proven, well-characterized, produces good distribution for ASCII strings |
| PRNG from seed | LCG or `Math.random` seeding | mulberry32 (4 lines, per §Seed System) | mulberry32 is statistically robust, passes PractRand; LCGs have short periods and visible correlation |
| Pointer-lock FPS camera | Custom mouse accumulator or raycasting | Browser Pointer Lock API + `movementX/Y` | The browser provides relative deltas correctly across all DPI settings and across platforms |
| Ridged noise | Custom absolute-value transform | Ridged-multifractal pattern (per §Three-Layer Height Function) | The invert-abs pattern is the standard technique — do not attempt to synthesize escarpment character from plain FBM |
| Debounce | Complex event queue | `clearTimeout/setTimeout` 150 ms | The simplest correct implementation for this use case |

**Key insight:** The hash and PRNG choices are small (< 15 lines each) but must be correct — a weak PRNG produces visible correlation artifacts in the noise permutation table. Mulberry32 and djb2 are the correct choices for this project's size and constraints.

---

## Runtime State Inventory

This phase involves renaming the noise initialization strategy (from fixed `() => 0.5` to seeded), but does NOT rename any user-visible identifiers. No runtime state migration is required. However, on seed change, the following must be explicitly reset:

| Category | Items | Action Required |
|----------|-------|-----------------|
| Stored data | Worker's internal noise functions (three `noise2D` closures in Worker scope) | Re-initialize via `{type:'init', worldSeed, params}` message before rebuilding chunks |
| Live service config | `TerrainSystem._chunkMap` — all built chunks use old seed | Dispose all chunks, clear map, re-request ring |
| OS-registered state | None | None |
| Secrets/env vars | None | None |
| Build artifacts | None | None |

**Nothing found in remaining categories:** Verified — no external databases, OS-level registrations, or secrets reference the terrain seed.

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`. This section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Browser console assertions (no test framework installed; project has no npm, no build system) |
| Config file | none — tests are inline `console.assert` / `console.error` calls run in the browser console or from a `tests/` HTML file loaded locally |
| Quick run command | Open `tests/seed-test.html` in browser, check console |
| Full suite command | Open `tests/seed-test.html` + `tests/height-agreement-test.html` in browser, check console |

**Rationale:** The project has no npm, no Jest, no Vitest. The constraint from CLAUDE.md is "no build system." Tests must be plain HTML/JS files openable via the local HTTP server (`npx serve .` or VS Code Live Server). They use `console.assert` and print PASS/FAIL to the console.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Test File | Automated? |
|--------|----------|-----------|-----------|-----------|
| SEED-01/05 | `seedFor("coarse")` called twice with same worldSeed returns same 32-bit int | unit | `tests/seed-test.html` | Yes — console.assert |
| SEED-01/05 | Different worldSeeds produce different coarse seeds | unit | `tests/seed-test.html` | Yes |
| SEED-02 | `seedFor("coarse", worldSeed)` !== `seedFor("fine", worldSeed)` | unit | `tests/seed-test.html` | Yes |
| SEED-03 | `parseWorldSeed("lone-pine")` returns same value as `parseWorldSeed(djb2("lone-pine"))` | unit | `tests/seed-test.html` | Yes |
| SEED-05 (HARD RULE) | P7-1 exit gate: build two separate TerrainSystem instances with same seed, compare chunk heights at 5 positions — must be identical | integration | `tests/seed-test.html` | Yes — compare Float32Arrays |
| TERR-04 (P7-2) | `sampleHeight(x,z)` matches `bilinear(chunk.heights[loaded chunk]) * terrainAmplitude` at ≥5 grid-aligned positions | integration | `tests/height-agreement-test.html` | Yes — numeric comparison with tolerance 0.001 |
| TERR-05 | Frame rate ≥55 fps with 25 chunks loaded and layered height active | smoke | Manual — check FPS HUD in browser | Manual |
| CAM-01/03 | Entering freecam and returning to chase produces no camera snap | smoke | Manual — visual inspection | Manual |

### Exit Gate Tests (P7-1 and P7-2)

**P7-1 (seedFor determinism):**
```javascript
// tests/seed-test.html [ASSUMED test structure]
// Assert: calling seedFor with same arguments always returns the same value
const s1 = seedFor(parseWorldSeed('lone-pine'), 'coarse')
const s2 = seedFor(parseWorldSeed('lone-pine'), 'coarse')
console.assert(s1 === s2, 'P7-1 FAIL: seedFor not deterministic', s1, s2)
// Assert: different domains are different
const sF = seedFor(parseWorldSeed('lone-pine'), 'fine')
console.assert(s1 !== sF, 'P7-1 FAIL: coarse/fine seeds not independent', s1, sF)
// Assert: different worldSeeds produce different results
const sOther = seedFor(parseWorldSeed('other-seed'), 'coarse')
console.assert(s1 !== sOther, 'P7-1 FAIL: different worldSeeds not distinct', s1, sOther)
console.log('P7-1 PASS: seedFor determinism verified')
```

**P7-2 (height agreement):**
```javascript
// tests/height-agreement-test.html [ASSUMED test structure]
// After a chunk is built, compare sampleHeight at 5 grid-aligned positions
// with analyticHeight * terrainAmplitude
// Must wait for chunk to finish building (Worker async)
// Test positions: (0,0), (64,0), (0,64), (32,32), (16,48) — all on grid
const TOL = 0.001  // m
const testPositions = [[0,0],[64,0],[0,64],[32,32],[16,48]]
for (const [wx, wz] of testPositions) {
  const fromBilinear = terrainSystem.sampleHeight(wx, wz)
  const fromAnalytic = analyticHeight(wx, wz, params) * params.terrainAmplitude
  const diff = Math.abs(fromBilinear - fromAnalytic)
  console.assert(diff < TOL, `P7-2 FAIL at (${wx},${wz}): bilinear=${fromBilinear} analytic=${fromAnalytic} diff=${diff}`)
}
console.log('P7-2 PASS: height agreement verified')
```

### Wave 0 Gaps

- [ ] `tests/seed-test.html` — covers SEED-01, SEED-02, SEED-03, SEED-05, P7-1 exit gate
- [ ] `tests/height-agreement-test.html` — covers TERR-04, P7-2 exit gate
- No existing test infrastructure — both files must be created in Wave 0 (before implementation)

**Wave 0 checklist:** Create both test HTML files that can be opened locally. The seed test can run immediately (pure math). The height-agreement test requires a running TerrainSystem instance — structure it to initialize a headless-ish TerrainSystem and wait for the first chunk via a `Promise`.

### Sampling Rate

- **Per task commit:** Open `tests/seed-test.html` in browser, verify all `P7-1` console assertions pass
- **Per wave merge:** Open both test files, verify all assertions pass, verify FPS ≥55 visually
- **Phase gate:** Both test files green + FPS ≥55 + visual freecam inspection before `/gsd:verify-work`

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Browser Pointer Lock API | CAM-01 freecam mouse-look | Yes (all modern browsers) | Evergreen | — |
| `Math.imul` | djb2 hash, mulberry32 PRNG | Yes (ES6+, all modern browsers) | Evergreen | Fall back to `(a * b) | 0` for 32-bit mul — less safe for large values |
| Local HTTP server | ES6 module testing | Yes (VS Code Live Server or `npx serve`) | Any | — |
| `URLSearchParams` | `?seed=` URL parsing | Yes (all modern browsers) | Evergreen | — |
| Web Worker (Blob) | Terrain chunk generation | Yes (existing, already working) | Existing | — |

**No missing dependencies.** All capabilities use browser APIs already proven to work in this project.

---

## Security Domain

No new network requests, no user authentication, no stored credentials. This phase adds a URL parameter (`?seed=`) which is parsed on the client side only. The seed value is displayed in the debug panel and used for procedural generation — no security concern. `security_enforcement` is not explicitly configured in `config.json` as false, but there are no ASVS categories applicable to a client-side-only no-backend browser game.

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Fixed permutation `() => 0.5` in Worker | Seeded permutation via mulberry32(seedFor(worldSeed, tag)) | Phase 7 change |
| 3-octave FBM (flat undulation character) | Ridged multifractal (coarse) + fine FBM + regional modulator | Phase 7 change |
| `sampleHeight` returns 0 for unloaded chunks | `analyticHeight` called directly for physics contacts | Phase 7 change — fixes physics gap |
| Chase/cockpit camera only | Chase/cockpit/freecam with pointer-lock FPS look | Phase 7 change |

**Deprecated/outdated:**
- Fixed permutation `() => 0.5` in Worker: eliminates all seed support. Phase 7 replaces it entirely.
- The inline simplex at lines 141 and 106 of `terrain.js` / `terrain-worker.js` respectively (the `createNoise2D(() => 0.5)` call): P7 replaces this with three seeded noise calls.

---

## Open Questions

1. **`analyticHeight` module boundary — single file or two files?**
   - What we know: function body must appear in both `WORKER_SOURCE` string and be importable from the main thread.
   - What's unclear: whether to keep everything in `terrain.js` (large file, simpler) or split into `src/height.js` (cleaner but adds another file the Worker string must include).
   - Recommendation: keep in `terrain.js` / `terrain-worker.js` for now. The project is LLM-maintained and fewer files reduces confusion. Add a clearly delimited comment block `// ── Height function (shared with Worker) ──` to mark the copy-sync boundary.

2. **Worker init vs per-message seed threading**
   - What we know: Worker currently receives `{type, cx, cz, key}` per chunk with no seed.
   - What's unclear: whether to init the Worker once with seed/params and keep noise closures in Worker scope, or thread seed/params through every `generate` message.
   - Recommendation: Use `{type:'init', worldSeed, params}` to initialize the Worker once, caching the three `noise2D` closures in Worker module scope. This avoids re-running `buildPermutationTable` (256 iterations) per chunk. On seed/param change, send a new `init` before resending `generate` requests.

3. **Spawn low-slope resolver — search strategy**
   - What we know: D-16 says terrain-only low-slope point. The analytic height is available immediately, but calling it in a search loop is cheap.
   - What's unclear: how many search iterations are acceptable before giving up and placing spawn at origin.
   - Recommendation: Start at a seeded offset (±3 km), try 20–50 candidate positions in a expanding ring, pick the lowest-gradient one. If none found below 15% grade, place at origin with a console warning. Phase 8 replaces this resolver entirely.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | djb2 produces visually distinct hashes for similar seeds; no problematic collisions in the expected seed space | Seed System | Low — string seeds are human-chosen; pathological collisions are unlikely; if wrong, a different hash (FNV-1a) is a drop-in replacement |
| A2 | mulberry32 passes PractRand at the scale used here (< 512 values drawn per noise2D instance) | Seed System | Low — only 256 values drawn per permutation table; short-period concerns don't apply |
| A3 | djb2 hash-combine constants (0x9e3779b9, 0x85ebca6b) produce independent sub-streams for the domain tags used | Seed System | Medium — if coarse/fine/regional produce correlated permutations, noise layers visually correlate; verifiable via P7-1 test |
| A4 | Ridged-multifractal with stated params produces D-06 grade statistics without benchmarking on real hardware | Terrain Calibration | Low — calibration is done interactively via sliders; wrong starting params just require more slider tuning |
| A5 | Analytic height function runs fast enough for physics contacts at 240 calls/second without dropping below 60fps | Performance | Low — arithmetic-only; no memory allocation per call |
| A6 | Browser Pointer Lock API behavior (Esc forced release, `movementX/Y` availability) matches MDN documentation across the target browser set | Free-fly Camera | Low — widely deployed API; if wrong, fallback is raw `mousemove` with screen-center re-centering |
| A7 | lil-gui text field (`gui.add(obj, 'str_key')`) renders as editable text input without additional configuration | Debug Panel | Low — trivially verifiable at implementation time |

---

## Sources

### Primary (HIGH confidence)
- Codebase: `src/terrain.js` — TerrainSystem architecture, `sampleHeight` bilinear, `rebuildAllChunks`, `_updateChunkRing`, WORKER_SOURCE, `MAX_BUILDS_PER_FRAME=2`
- Codebase: `src/terrain-worker.js` — standalone Worker copy, current 3-octave FBM with fixed `() => 0.5`
- Codebase: `src/camera.js` — existing chase/cockpit modes, `cameraMode` string, `updateCamera` signature
- Codebase: `src/main.js` — `queryContacts`, `queryVertexContacts`, `vehicleState`, reset block, `terrainSystem.update(vehicleState.position)` call site
- Codebase: `src/debug.js` — lil-gui panel structure, folder pattern, `onChange` callback wiring, slider ranges
- Codebase: `.planning/phases/07-free-cam-seeded-layered-terrain/07-CONTEXT.md` — all D-XX locked decisions

### Secondary (MEDIUM confidence)
- `references/km elev ref.png` — Google Earth elevation profile, visually analyzed: ~640 m relief, steep initial faces, ridge at midpoint, valley floor at end

### Tertiary (LOW confidence / ASSUMED)
- djb2 hash function body (A1) — training knowledge, not re-verified against a specification document
- mulberry32 PRNG (A2) — training knowledge, commonly cited in JS procedural generation
- Hash-combine constants 0x9e3779b9 / 0x85ebca6b (A3) — training knowledge (Knuth/Fibonacci hashing)
- Ridged-multifractal formula (A4) — training knowledge (procedural terrain generation literature)
- Pointer Lock API behavior (A6) — training knowledge, not re-verified via WebSearch
- Per-sample performance estimates (A5) — training knowledge estimates

---

## Metadata

**Confidence breakdown:**
- Seed system design: MEDIUM (hash/PRNG math is ASSUMED; verifiable at implementation time via P7-1 test)
- height(x,z) architecture: HIGH (grounded in live code; the analytic-direct recommendation follows from the existing sampleHeight gap confirmed in terrain.js)
- Terrain calibration parameters: LOW-MEDIUM (starting values ASSUMED; interactive tuning required; calibration reference analyzed visually)
- Free-fly camera: HIGH (existing camera.js code read; Pointer Lock API widely known)
- Performance: MEDIUM-LOW (estimates ASSUMED; not benchmarked)
- Validation architecture: HIGH (test structure follows from exit gates in CONTEXT.md/STATE.md)

**Research date:** 2026-06-07
**Valid until:** Stable — no external dependencies. Code structure findings valid until terrain.js/camera.js are edited.
