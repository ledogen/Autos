# Technology Stack: RangerSim

**Project:** Browser-based 6DOF car physics simulation (Ford Ranger)
**Researched:** 2026-05-10 (v1.0), updated 2026-06-05 (v1.1 Mountains & Roads additions)
**Overall confidence:** HIGH (Three.js version confirmed from threejs.org live site; physics loop pattern confirmed from working prototype; MDN authoritative for Web Worker constraints; PRNG algorithms confirmed from bryc/code reference implementation)

---

## Recommended Stack

### Core Rendering

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Three.js | r184 | 3D rendering, scene graph, camera | Current stable release (confirmed threejs.org 2026-05-10); ES module build via CDN importmap is the officially documented approach as of r147+; Y-up coordinate system matches project requirement |
| ES6 importmap | browser-native | Module resolution without bundler | Lets `import * as THREE from 'three'` and `import { X } from 'three/addons/...'` work in plain HTML without npm or webpack; supported in all modern browsers |

**CDN importmap pattern (use this exactly):**
```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/"
  }
}
</script>
```

Note: Three.js uses both `r184` (old-style) and `0.184.0` (semver) naming on npm. Pin the exact version — do not use `@latest` or `@three` with no version because CDN caching of `@latest` can serve stale builds and introduces non-determinism across sessions.

### Debug / Development Tools

| Technology | Source | Purpose | Why |
|------------|--------|---------|-----|
| lil-gui | Bundled in Three.js addons | Physics parameter sliders (Pacejka B/C/E/D, spring stiffness, damping, ride height) | Already bundled at `three/addons/libs/lil-gui.module.min.js` — zero additional dependency; the Three.js manual uses it in all interactive examples; it replaced dat.GUI as the official Three.js debug UI |
| stats.js | `three/addons/libs/stats.module.js` | FPS counter, frame time monitor | Also bundled in Three.js addons; shows FPS/ms panel in corner; essential for hitting 60fps target on mid-range laptop |

**Import pattern for both:**
```javascript
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import Stats from 'three/addons/libs/stats.module.js';
```

No additional CDN URLs needed — both come from the same jsdelivr importmap already declared for Three.js.

### Physics System

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Hand-rolled (vanilla JS) | — | 6DOF rigid body, Pacejka tires, spring-damper suspension | Project requirement; gives full control over tire model, contact patch velocity, quaternion integration, and surface normal handling. No physics library can expose the per-wheel force pipeline at the level needed for a real Pacejka implementation with load transfer |
| Three.js `Quaternion`, `Vector3`, `Matrix4` | r184 | Math primitives for physics | Three.js math classes are available after the Three.js import; avoids importing a second math library. `THREE.Quaternion.slerp`, `THREE.Vector3.applyQuaternion`, etc. are well-tested and documented |

### Module Structure

| Module | Responsibility | Imports from |
|--------|---------------|--------------|
| `src/tire.js` | Pacejka Magic Formula, slip angle → lateral force | Nothing (pure math) |
| `src/suspension.js` | Spring-damper per corner, contact patch position, normal force | `tire.js` (for normal force input) |
| `src/physics.js` | 6DOF integrator, force accumulation, quaternion rotation | `tire.js`, `suspension.js` |
| `src/vehicle.js` | Vehicle state, drivetrain, Ackermann, input accumulation | `physics.js` |
| `src/camera.js` | Chase camera, spring follow | Three.js only |
| `src/debug.js` | lil-gui panel, scenario logger, HUD | `vehicle.js` (reads state) |
| `src/main.js` | Entry point, scene setup, game loop | All of the above |
| `data/ranger.js` | Ford Ranger specs as exported const object | Nothing |

**Dependency direction is strictly:** `tire → suspension → physics → vehicle → main`. No module imports from a module downstream in this chain. This eliminates all circular dependency risk.

### Hosting

| Technology | Purpose | Why |
|------------|---------|-----|
| GitHub Pages | Static hosting | Zero infrastructure; serves ES modules correctly with proper `Content-Type: text/javascript`; CORS-safe for `type="module"` scripts |
| Local dev via `npx serve` or VS Code Live Server | Local testing | ES6 modules require HTTP — `file://` URLs throw CORS errors. Any local HTTP server works; `npx serve .` (no install) is the simplest |

---

## Physics Loop Pattern

The working prototype already implements the correct pattern. Use it as the canonical approach:

```javascript
const DT = 1 / 60;       // fixed physics timestep, seconds
let lastTime = performance.now();
let accumulator = 0;

function animate(now) {
  requestAnimationFrame(animate);

  // Cap delta to prevent spiral of death on tab-switch/lag spikes
  accumulator += Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // Consume fixed steps
  while (accumulator >= DT) {
    physicsStep();        // always called with exactly DT = 1/60s
    accumulator -= DT;
  }

  // Render with whatever state physics left (no interpolation needed at 60fps target)
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
```

**Why no render interpolation:** Interpolation (blending previous and current state by `accumulator / DT`) eliminates visual stutter when physics runs slower than render. At 60fps target on a laptop, the physics and render rates match — interpolation adds code complexity for no visible benefit. If the game later runs physics at 120hz for accuracy, add interpolation then.

**Why the 0.1s cap:** Prevents the accumulator from growing unbounded when the tab is backgrounded or the browser stalls. Without it, returning to a stalled tab causes hundreds of physics steps in one frame.

---

## v1.1 Mountains & Roads — Stack Additions

These sections cover new technique decisions for v1.1 only. They add no runtime dependencies. All techniques are vanilla JS + Three.js r184 and are Worker-safe unless stated otherwise.

---

### 1. World Seed / PRNG: xmur3 + splitmix32

**Recommendation:** Use xmur3 as the string-to-seed hasher and splitmix32 as the per-domain PRNG. Both are ~10-line pure functions, zero-dependency, and Worker-safe.

**Why this pair:**
- xmur3 takes a string and produces a callable that emits successive 32-bit integers. It handles arbitrary-length strings (domain tags like `"coarse"`, `"roads"`, `"poi"`) and is designed specifically to seed other PRNGs with good bit distribution. This is its documented use case in the bryc/code reference.
- splitmix32 is a fast, stateful 32-bit PRNG. It has a period of 2^32, which is sufficient for sub-seed derivation (we are generating at most thousands of seeds, not billions). It produces floats in [0, 1) or raw uint32s. It uses only `Math.imul` and bitwise ops — no floating-point dependencies, runs identically on main thread and in Blob workers.
- The pair is a well-known combination: xmur3 seeds splitmix32. The bryc/code repository (canonical JS PRNG reference) recommends exactly this pattern.

**`seedFor()` implementation pattern:**

```javascript
// src/seed.js — pure functions, no imports, Worker-safe
// Both functions are ~10 lines; inline into terrain-worker source string as-is.

function xmur3(str) {
    for (let i = 0, h = 1779033703 ^ str.length; i < str.length; i++) {
        h ^= Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return function() {
        h ^= Math.imul(h ^ (h >>> 16), 2246822507);
        h ^= Math.imul(h ^ (h >>> 13), 3266489909);
        return (h ^= h >>> 16) >>> 0;
    };
}

function splitmix32(seed) {
    let state = seed >>> 0;
    return function() {
        state = (state + 0x9e3779b9) | 0;
        let t = state ^ (state >>> 15);
        t = Math.imul(t, 0x85ebca6b);
        t ^= t >>> 13;
        t = Math.imul(t, 0xc2b2ae35);
        return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
    };
}

// seedFor(worldSeed, domainTag, ...coords) → seeded splitmix32 PRNG
// worldSeed: number (int32) or string
// domainTag: string constant, e.g. "coarse", "roads", "poi"
// coords: optional tile coords (integers) for spatial sub-streams
export function seedFor(worldSeed, domainTag, ...coords) {
    const key = String(worldSeed) + ':' + domainTag + ':' + coords.join(',');
    const hash = xmur3(key);
    // Advance hash state 3x before seeding (improves distribution for short strings)
    hash(); hash(); hash();
    return splitmix32(hash());
}

// stringToSeed: convert a user-facing string seed ("lone-pine-1") to an integer
export function stringToSeed(s) {
    if (typeof s === 'number') return s | 0;
    const hash = xmur3(String(s));
    hash(); hash(); hash();
    return hash() | 0;
}
```

**Worker note:** The terrain-worker is a Blob classic worker that cannot use ES module imports. Both `xmur3` and `splitmix32` must be pasted verbatim into the `WORKER_SOURCE` string — exactly the same pattern used for `createNoise2D` today. Do NOT try to postMessage seeds from main thread to worker; the worker must derive sub-seeds itself from `(worldSeed, cx, cz)` using the same `seedFor()` logic.

**Confidence:** HIGH — verified from bryc/code canonical reference; both functions use only `Math.imul` and bitwise ops confirmed available in all modern browsers and Web Worker contexts.

---

### 2. Existing Simplex Source: Seeding Story

**Finding:** The simplex source embedded in `terrain.js` (lines 67–131 of `WORKER_SOURCE`) is a minimal extract of simplex-noise@4.0.3 (MIT, Jonas Wagner). It already accepts a seeding hook.

**Key fact:** `createNoise2D(random)` takes a `random` callback that is called exactly 255 times to build the permutation table via Fisher-Yates shuffle. Today it is called with a fixed stub `function() { return 0.5; }` which produces a deterministic but unvarying permutation — the same noise field for every world.

**What this means for v1.1:**
- No rewrite needed. To make the noise field vary by `worldSeed`, replace the fixed stub with a `splitmix32` instance seeded via `seedFor(worldSeed, "coarse")` (for the coarse layer) or `seedFor(worldSeed, "fine")` (for the fine layer).
- Each call to `createNoise2D` with a different seeded PRNG produces a distinct permutation table, yielding a different noise field. The noise function returned is still a pure, stateless function of (x, z) — calling it with the same coordinates always returns the same value for a given permutation.
- The Worker will need `worldSeed` passed in the `generate` message alongside `cx, cz`. Main thread passes it; worker stores it at init and derives all per-layer PRNGs from it.

**Concrete change required in P7:**
1. Add `worldSeed` to the `{type:'generate', cx, cz, key, worldSeed}` worker message.
2. Inside the worker, at first message receipt (or lazily), call `createNoise2D(seedFor(worldSeed, "coarse"))` etc. and cache the resulting noise functions.
3. On `worldSeed` change (debug panel or URL param), terminate and respawn the worker (simplest reset path), or send a `{type:'reset', worldSeed}` message and rebuild the noise functions in-place.

**No new simplex dependency needed.** The existing extract is fully sufficient. The multi-layer terrain (coarse + fine + regional) is achieved by calling `createNoise2D` three times with three different seeded PRNGs, then blending the three noise functions with appropriate amplitude/frequency weights in the height function.

**Confidence:** HIGH — read directly from the source code in `src/terrain.js`.

---

### 3. Layered Terrain: Noise Techniques (no new deps)

**Recommendation:** Three-layer fBm with ridged noise on the coarse layer. All implemented as pure arithmetic on top of the existing `createNoise2D` function.

**Layer breakdown:**

| Layer | Technique | Purpose | Blending |
|-------|-----------|---------|---------|
| Coarse | Ridged multi-octave simplex | Mountain escarpments, valley floors | Base signal |
| Fine | 3-octave fBm (existing today) | Suspension texture, off-road character | Additive, amplitude ~20% of coarse |
| Regional roughness | Single low-frequency simplex | Controls fine layer multiplier by region | Multiplicative on fine layer only |

**Ridged noise technique (coarse layer):**
Standard ridged multifractal: at each octave, take `1.0 - Math.abs(noise2D(x, z))` instead of `noise2D(x, z)`. This inverts the noise so zero-crossings become sharp ridges instead of smooth hills. Multiple octaves of this produce the escarpment character typical of the Sierra Nevada — steep ridge lines falling into flat valley floors. No new function needed; it is a one-line transformation of the existing noise call.

```javascript
// ridged octave contribution
const raw = noise2D(wx * freq, wz * freq);
const ridged = 1.0 - Math.abs(raw);
```

**Domain warping (optional stretch for P7):** Sample the coarse layer at `(x + offset_x, z + offset_z)` where `offset_x` and `offset_z` are themselves low-frequency noise values. This breaks grid-aligned artifacts and makes terrain feel organic. Cost is two extra noise calls per sample. Flag as an optional enhancement, not required for baseline.

**Performance:** `sampleHeight` is called ~56 times per physics frame (14 body probes × 4 central-difference samples each for normals). Three noise layers × 3 octaves = 9 noise evaluations per sample = ~504 evaluations/physics frame. Each simplex 2D evaluation is ~30 floating-point ops. Total: ~15,000 FLOPs/frame for physics height sampling — well within budget on any modern CPU. No caching needed at this scale.

**Confidence:** HIGH for technique correctness. MEDIUM for specific amplitude/wavelength tuning to match Sierra Nevada topo statistics — that requires calibration during P7 implementation, not resolvable in research.

---

### 4. Road Routing: Algorithm (P8)

**Recommendation:** Tile-keyed A* on a coarse height grid with slope cost, deterministic from `(worldSeed, tileX, tileZ)`. Build per-tile, stitch across tile boundaries via fixed entry/exit waypoints.

**Why A* over alternatives:**
- Dijkstra finds the globally optimal path but explores the full graph — expensive on large grids. A* with a Euclidean distance heuristic prunes ~60–70% of node expansions on grid graphs, giving the same optimal result at lower cost.
- The coarse grid resolution can be large (e.g. 8m cells on the 64m chunk grid = 8×8 = 64 nodes per chunk). A* on a 64-node-per-chunk graph is trivially fast and deterministic.
- Tile-keyed approach: road routing within a tile is seeded by `seedFor(worldSeed, "roads", tileX, tileZ)`. Entry and exit waypoints on tile edges are derived deterministically from the same seed so adjacent tiles produce seamlessly connected roads.

**Switchback generation:**
A* with a hard grade cap (e.g. 25% = 14°) handles switchbacks naturally: when a direct path across steep terrain exceeds the grade limit, the cost function makes steep edges prohibitively expensive and the router finds a longer traversal path that zigzags — which is exactly a switchback. No special switchback logic needed; the grade-weighted cost function produces them emergently.

**Cost function:**
```
edge_cost = distance × (1 + k × slope_penalty(grade))
slope_penalty = grade > MAX_GRADE ? Infinity : (grade / MAX_GRADE)^2
```

**Tile stitching:**
Each tile edge has N fixed candidate waypoints (e.g. 3 per edge, spaced at tile_width / 4). The router picks the entry/exit waypoint pair that minimizes path cost within the tile. Adjacent tiles share the same edge waypoint positions because the positions are derived from tile coords, not the route. This guarantees seamless cross-tile connectivity without global state.

**Output:** Ordered array of `THREE.Vector3` control points fed into `THREE.CatmullRomCurve3` for spline generation (see section 5).

**Confidence:** HIGH for algorithm pattern. MEDIUM for specific grade thresholds and waypoint density — requires tuning against actual terrain steepness during P8.

---

### 5. Road Ribbon Mesh: Three.js r184 Techniques

**Recommendation:** Manual `THREE.BufferGeometry` ribbon, not `TubeGeometry`. Use `THREE.CatmullRomCurve3.getSpacedPoints()` + `getTangentAt()` for centerline samples; build a quad strip manually by extruding perpendicular to the tangent in the XZ plane, then applying crown/camber as Y offsets.

**Why not TubeGeometry:** `TubeGeometry` generates a circular cross-section. Roads need a flat rectangular cross-section (10m wide, 0.05m thick) with a crowned profile. Using `TubeGeometry` and deforming it is more complex than building the quad strip directly.

**Why manual BufferGeometry:**
- Full control over vertex positions: centerline + perpendicular offset + height carve + crown Y offset
- Full control over UVs: U along the road length (for lane marking tiling), V across the road width
- Compatible with the Worker-safe constraint: the ribbon geometry is built on the main thread from spline data; no worker involvement needed

**CatmullRomCurve3 availability:** Confirmed built into the core `three` module (not an addon). Available as `new THREE.CatmullRomCurve3(points)`. Key methods used:
- `getSpacedPoints(N)` — evenly spaced points along curve (arc-length parameterized) — use for ribbon segment centerlines
- `getTangentAt(t)` — unit tangent vector at parameter t — use to compute perpendicular for ribbon edges
- `getFrenetFrames(N, false)` — returns `{tangents, normals, binormals}` arrays — use if banking/camber frames are needed (more robust than manual cross-product on highly curved segments)

**Ribbon build pattern:**
```javascript
function buildRoadRibbon(curve, roadWidth, segmentCount, heightFn) {
    // heightFn(wx, wz) = terrain.sampleHeight(wx, wz) — same function used by physics
    const pts = curve.getSpacedPoints(segmentCount);
    const frames = curve.getFrenetFrames(segmentCount, false);

    const verts = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= segmentCount; i++) {
        const p = pts[i];
        const right = frames.binormals[i]; // XZ-plane right vector
        // Left and right edge of ribbon
        const left3  = p.clone().addScaledVector(right, -roadWidth / 2);
        const right3 = p.clone().addScaledVector(right,  roadWidth / 2);
        // Crown: raise centerline slightly, drop edges
        // Carve: clamp Y to min(terrainY - shoulderBlend, roadY)
        left3.y  = Math.min(heightFn(left3.x,  left3.z),  p.y - crownDrop);
        right3.y = Math.min(heightFn(right3.x, right3.z), p.y - crownDrop);
        verts.push(left3.x, left3.y, left3.z, right3.x, right3.y, right3.z);
        uvs.push(0, i / segmentCount, 1, i / segmentCount);
    }
    // ... quad index generation omitted for brevity
}
```

**Physics integration of road surface:** The ribbon is not a separate physics object. Instead, `sampleHeight(wx, wz)` is modified to check whether `(wx, wz)` is within a road corridor (fast road AABB or signed-distance check against centerline), and if so, return `roadHeightAt(wx, wz)` which evaluates the ribbon surface (bilinear on the road quad strip). The same road `heightFn` is used by both mesh build and physics — this is the same single-source-of-truth pattern already established for terrain chunks.

**Asphalt material — no asset files:**
Use `THREE.MeshPhongMaterial` (already used for terrain) with a `THREE.CanvasTexture`. Generate a 64×16 canvas with:
- Dark grey base (`#2a2a2a`)
- White dashed centerline (drawn as canvas `fillRect` calls)
- Optional edge markings

This produces a tileable UV-mapped asphalt texture from pure JavaScript with no image files. The canvas is created once at startup; the texture is shared across all road chunk meshes.

```javascript
function makeAsphaltTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, 64, 64);
    // Dashed centerline
    ctx.fillStyle = '#ffffff';
    for (let y = 0; y < 64; y += 16) ctx.fillRect(30, y, 4, 8);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, roadLengthM / 8); // tile every 8m along road
    return tex;
}
```

**Confidence:** HIGH for Three.js API availability (CatmullRomCurve3 confirmed core, CanvasTexture confirmed r184). MEDIUM for specific crown/camber numbers and UV tiling ratios — requires visual tuning during P9.

---

### 6. URL Param + Debug-Panel Seed Plumbing

**Recommendation:** `URLSearchParams` for URL parsing (browser-native, no library), lil-gui string controller for the debug panel. One `worldSeed` value drives both; refresh with same URL = same world.

**URL param pattern:**
```javascript
// In main.js, before scene init
const params = new URLSearchParams(window.location.search);
const rawSeed = params.get('seed');  // string or null
const worldSeed = rawSeed !== null ? stringToSeed(rawSeed) : Math.floor(Math.random() * 0xFFFFFFFF);
```

`URLSearchParams` is available in all modern browsers and in Web Workers (confirmed MDN). No parsing code needed.

**Debug panel (lil-gui) pattern:**
```javascript
// Expose as a string field so user can type "lone-pine-1" or "12345"
const seedState = { seed: String(worldSeed) };
gui.add(seedState, 'seed').name('World Seed').onFinishChange(value => {
    const newSeed = stringToSeed(value);
    // Update URL without reload so the seed is shareable
    const url = new URL(window.location.href);
    url.searchParams.set('seed', value);
    window.history.replaceState(null, '', url.toString());
    // Trigger world reset
    resetWorld(newSeed);
});
```

`window.history.replaceState` updates the URL bar without a page reload, so after the user types a seed the URL becomes shareable immediately.

**`resetWorld(newSeed)` contract:**
- Terminate and respawn the terrain worker with `worldSeed` in the init message (simplest approach — avoids stale chunk state).
- Clear `chunkMap`, `pendingWorker`, `pendingQueue` in `TerrainSystem`.
- Reset vehicle to spawn position.
- Road splines and POI anchors are derived from `worldSeed` on demand; no explicit reset needed for those.

**Worker handoff:** The terrain worker currently has no init message. P7 should add a `{type:'init', worldSeed}` message as the first message sent after worker spawn. The worker stores `worldSeed` and uses it to seed all noise functions before handling any `generate` messages.

**Confidence:** HIGH for `URLSearchParams` and `history.replaceState` availability. HIGH for lil-gui string controller pattern (confirmed from Three.js manual examples). MEDIUM for the specific reset flow — worker respawn vs in-place reset is an implementation choice to validate during P7.

---

## v1.1 Module Additions

| Module | Responsibility | Worker-safe? | Notes |
|--------|---------------|-------------|-------|
| `src/seed.js` | `xmur3`, `splitmix32`, `seedFor()`, `stringToSeed()` | YES (paste verbatim into WORKER_SOURCE) | Pure functions, no imports |
| `src/road.js` | Road graph routing (A* on coarse height), spline generation, POI anchors | Main thread only | Uses `THREE.CatmullRomCurve3`; needs terrain height access |
| `src/road-mesh.js` | Ribbon mesh build, asphalt CanvasTexture, physics height integration | Main thread only | Produces `THREE.Mesh`; carve fn shared with terrain sampler |

`seed.js` functions must also be duplicated inside `WORKER_SOURCE` (pasted inline as non-module code) because the Blob classic worker cannot import ES modules. The authoritative source is `src/seed.js`; the WORKER_SOURCE copy is a documented duplicate. Comment both copies clearly.

---

## What NOT to Use (v1.1 additions)

### Do Not Add: simplex-noise npm package
The project already contains a minimal 2D extract of simplex-noise@4.0.3 inlined in `terrain.js`. Adding the full npm package would require either a CDN import (URL in the Blob worker is impossible) or bundling. The existing extract is fully sufficient for three-layer terrain.

### Do Not Use: THREE.TubeGeometry for road ribbon
`TubeGeometry` generates a circular cross-section. Road ribbons need a flat crowned cross-section. Manual `BufferGeometry` with quad strips gives full control with the same number of lines.

### Do Not Use: THREE.ExtrudeGeometry for road ribbon
`ExtrudeGeometry` extrudes a 2D shape along a path but uses `ExtrudeGeometryOptions.extrudePath` which does not provide per-vertex height modification needed for terrain carving. Manual ribbon is simpler for this use case.

### Do Not Use: crypto.randomUUID() or crypto.getRandomValues() for seed hashing
`crypto.getRandomValues()` is non-deterministic by design. `xmur3` is the right tool for string-to-integer hashing because it is deterministic, pure, and does not require the Web Crypto API (which has availability caveats in some Worker contexts without HTTPS).

### Do Not Use: Perlin noise to replace simplex for new layers
The existing simplex extract already works and is seeded correctly via `buildPermutationTable(random)`. Adding a second noise algorithm adds code complexity for no quality gain. All three terrain layers use `createNoise2D` with different seeds.

### Do Not Use: Global road state or load-order-dependent routing
Road routing must be a pure function of `(worldSeed, tileX, tileZ)`. Any algorithm that requires visiting a tile before knowing the road layout violates the determinism constraint and breaks seamless streaming.

---

## What NOT to Use (carried forward from v1.0)

### Do Not Use: Cannon.js, Rapier, Ammo.js, or any physics library
Project requirement, but worth explaining why the constraint is correct: physics libraries expose forces and impulses at collision resolution level, not at tire contact patch level. Implementing Pacejka Magic Formula, load transfer, and correct longitudinal slip requires direct access to per-wheel normal force and contact patch velocity — concepts that don't map to physics library APIs without fighting the abstraction. Hand-rolled physics is the right choice here.

### Do Not Use: dat.GUI
dat.GUI is unmaintained (last npm release 2020). lil-gui is its maintained successor, is already bundled in Three.js addons, and has an identical API surface. Using dat.GUI would require a separate CDN dependency for no benefit.

### Do Not Use: Global `<script>` tag for Three.js (the r128 prototype pattern)
The prototype loaded Three.js as `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js">` which dumps everything into `window.THREE`. This is the pre-r147 pattern. It conflicts with ES6 module imports, prevents tree-shaking (irrelevant without a bundler but still bad practice), and uses a version that is 56 releases behind current. Use importmap + ES modules.

### Do Not Use: Web Workers for physics
Web Workers cannot access `requestAnimationFrame` (MDN confirmed). Coordinating fixed-timestep physics in a worker requires either `setInterval` (not frame-synchronized) or `SharedArrayBuffer` (requires cross-origin isolation headers that GitHub Pages does not send by default). The overhead of postMessage serialization for a 6DOF state vector every frame adds latency without meaningful gain — the physics budget at 1/60s is ~16ms and the hand-rolled simulation is pure arithmetic with no I/O. Stay on the main thread.

### Do Not Use: OffscreenCanvas
Three.js manual notes Chrome is the only browser with full OffscreenCanvas support (as of documentation). Requires complex proxy patterns for keyboard/mouse events. The rendering workload (simple geometry, no post-processing) does not justify this complexity.

### Do Not Use: A bundler (webpack, Vite, Rollup)
Project requirement, but the reason is sound: GitHub Pages + importmap + CDN is a complete and working deployment pipeline. A bundler would require a build step, a `node_modules` directory, and a CI pipeline — all of which conflict with the "open from GitHub Pages without install" constraint.

### Do Not Use: Euler angles for body rotation
The prototype used Euler angles (YXZ order) and hit gimbal lock at 90° roll/pitch — this is the documented reason for the rewrite. Use `THREE.Quaternion` for body orientation throughout. Only convert to Euler for Three.js `Object3D.rotation` at render time (Three.js `.setFromQuaternion()` handles this).

---

## Version Verification Status

| Item | Verified? | Source | Confidence |
|------|-----------|--------|------------|
| Three.js r184 | YES | threejs.org live site, 2026-05-10 | HIGH |
| importmap pattern | YES | Three.js manual (r147+ documented as "only way") | HIGH |
| lil-gui bundled in three/addons | YES | Three.js manual source references `three/addons/libs/lil-gui.module.min.js` | HIGH |
| stats.js bundled in three/addons | YES | Three.js manual references `three/addons/libs/stats.module.js` | HIGH |
| Web Workers cannot use rAF | YES | MDN Web Workers API docs | HIGH |
| SharedArrayBuffer requires COOP/COEP headers | YES | MDN, GitHub Pages does not set these by default | HIGH |
| file:// CORS blocks ES modules | YES | MDN Modules guide | HIGH |
| Fixed timestep accumulator pattern | YES | Working prototype (backup12.html) implements it correctly | HIGH |
| xmur3 string hash + splitmix32 PRNG | YES | bryc/code PRNGs.md canonical reference (github.com/bryc/code) | HIGH |
| CatmullRomCurve3 in core three module (not addon) | YES | threejs.org/docs + Context7 three.js source; getSpacedPoints, getTangentAt, getFrenetFrames confirmed | HIGH |
| CanvasTexture in three module | YES | Context7 three.js source; MeshPhongMaterial + CanvasTexture pattern confirmed in r184 examples | HIGH |
| URLSearchParams Worker-safe | YES | MDN Web Workers API — URLSearchParams available in Worker global scope | HIGH |
| Existing simplex extract accepts seeding hook | YES | Read directly from src/terrain.js WORKER_SOURCE: createNoise2D(random) takes a random callback; buildPermutationTable(random) uses it 255 times | HIGH |
| Ridged noise technique (1 - |noise|) | MEDIUM | Book of Shaders, noise-for-terrains reference — standard technique, not Three.js specific | MEDIUM |

---

## Installation / Setup

No npm, no install. The full setup is:

**index.html:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>RangerSim</title>
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/"
    }
  }
  </script>
</head>
<body>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

**Local dev (requires HTTP, not file://):**
```
# Option 1: VS Code Live Server extension (click "Go Live")
# Option 2: Python
python3 -m http.server 8080
# Option 3: Node (no install)
npx serve .
```

**Deploy:** Push to `main` branch. GitHub Pages serves `index.html` from repo root. No build step.

---

## Sources

- Three.js current version r184: https://threejs.org/ (live, 2026-05-10)
- Three.js importmap pattern, r147+ requirement: https://threejs.org/manual/en/fundamentals.html
- lil-gui in Three.js addons: https://threejs.org/manual/en/align-html-elements-to-3d.html (source references `three/addons/libs/lil-gui.module.min.js`)
- Web Workers limitations (no rAF, SharedArrayBuffer headers): https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
- OffscreenCanvas browser support caveats: https://threejs.org/manual/en/offscreencanvas.html
- ES6 modules CORS requirement on file://: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
- Fixed timestep accumulator pattern: `/references/backup12.html` lines 709-721 (working implementation)
- xmur3 + splitmix32 canonical JS PRNG reference: https://github.com/bryc/code/blob/master/jshash/PRNGs.md
- CatmullRomCurve3 docs (r184): https://threejs.org/docs/#api/en/extras/curves/CatmullRomCurve3
- Ridged multifractal noise technique: https://aparis69.github.io/LearnProceduralGeneration/terrain/procedural/noise_for_terrains/
- Domain warping for terrain: https://thebookofshaders.com/13/
- Red Blob Games terrain from noise: https://www.redblobgames.com/maps/terrain-from-noise/
