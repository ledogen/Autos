---
phase: 06-procedural-terrain
reviewed: 2026-06-03T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/terrain.js
  - src/terrain-worker.js
  - src/main.js
  - index.html
  - src/debug.js
  - data/ranger.js
  - test/terrain-unit.js
  - docs/GLOSSARY.md
findings:
  critical: 2
  warning: 3
  info: 3
  total: 8
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-06-03
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 6 adds procedural terrain via a Blob Web Worker, a bilinear height-query system, and a TerrainSystem class that manages a 5×5 chunk ring. The core architecture is sound: the worker correctly transfers `heights.buffer` as a transferable (zero-copy), bilinear interpolation is correctly implemented, and the fixed-timestep loop correctly calls `terrainSystem.update()` outside the physics accumulator.

Two critical bugs were found. First, `queryVertexContacts` uses a hardcoded flat normal `(0,1,0)` for terrain contact regardless of slope — while `queryContacts` (sphere contacts) correctly calls `sampleNormal`. This asymmetry means body-box vertex contacts on sloped terrain always push the body straight up, producing incorrect rollover/slide behavior on hills. Second, `terrainAmplitude` slider changes cause an immediate mismatch between the physics contact surface and visual geometry: `sampleHeight` reads the new amplitude instantly while existing built chunks retain geometry baked at the old amplitude, causing the car to collide with invisible terrain or float above visible ground until chunks cycle out.

Three warnings cover: the `_pendingQueue` not being filtered before building (stale out-of-ring chunks get GPU-uploaded for one frame), the dead `terrain()` function still being called every physics step, and the unused `simplex-noise` importmap entry fetching an unnecessary CDN dependency.

Unit tests pass but have significant coverage gaps.

---

## Critical Issues

### CR-01: `queryVertexContacts` ignores terrain slope — always uses flat normal

**File:** `src/main.js:407`

**Issue:** `queryVertexContacts` (used for body-box vertex collision) detects terrain contact correctly via `terrainSystem.sampleHeight`, but always pushes the contact response along `_flatNormal` (`(0,1,0)`) regardless of the actual surface slope. In contrast, `queryContacts` (sphere/wheel contact) on line 463 correctly calls `terrainSystem.sampleNormal`. On sloped terrain, body-vertex contacts will generate a vertical impulse instead of a surface-normal impulse. For a 10° slope this is a ~1.5% error; for a 45° slope (amplitude=3.0 can produce ~30° slopes) the error becomes large enough to prevent rolling/sliding along the surface and create ghost forces pushing the body sideways into the slope.

```js
// CURRENT (line 405-408):
const terrainH = terrainSystem ? terrainSystem.sampleHeight(px, pz) : 0
if (py < terrainH) {
  hits.push({ normal: _flatNormal.clone(), depth: terrainH - py })
}

// FIX:
const terrainH = terrainSystem ? terrainSystem.sampleHeight(px, pz) : 0
if (py < terrainH) {
  const tn = terrainSystem ? terrainSystem.sampleNormal(px, pz) : { x: 0, y: 1, z: 0 }
  hits.push({ normal: new THREE.Vector3(tn.x, tn.y, tn.z), depth: terrainH - py })
}
```

---

### CR-02: `terrainAmplitude` change immediately breaks physics/visual parity for existing chunks

**File:** `src/terrain.js:274` and `src/terrain.js:385`

**Issue:** When the `terrainAmplitude` slider is changed, `sampleHeight` reads `this._params.terrainAmplitude` immediately (line 274), while chunk meshes in the scene were built with geometry baked at the old amplitude value (line 385 in `_flushPendingQueue`). The contact surface the physics uses and the surface the player sees are now at different heights. If the amplitude is increased, the physics sees the car underground; if decreased, the car floats above the mesh. This persists until every chunk in the 5×5 ring cycles out — which requires driving at least 64 m in any direction.

The debug panel comment in `debug.js` line 117 acknowledges "live mutation takes effect on the next chunk built" but does not document that this produces a temporary physics/visual mismatch. The mismatch is not cosmetic — it will produce incorrect contact forces on all loaded chunks.

**Fix:** Either (a) mark the amplitude as pending-only (only apply at queue build time, do NOT read live in `sampleHeight`), forcing a chunk reload to change amplitude; or (b) store the amplitude value used at build time per chunk, and apply that stored value in `sampleHeight` instead of the live param:

```js
// In _flushPendingQueue, store the amplitude used at build time:
const amp = this._params.terrainAmplitude ?? 1.0
// ...build geometry...
this._chunkMap.set(key, { mesh, heights, amp })   // store amp

// In sampleHeight, use the stored per-chunk amplitude:
const chunk = this._chunkMap.get(this._chunkKey(cx, cz))
if (!chunk || !chunk.heights) return 0
// ...
return raw * chunk.amp   // use the value geometry was built with
```

Option (b) guarantees physics and visual surfaces are always co-located at the cost of one extra field per chunk.

---

## Warnings

### WR-01: `_pendingQueue` not filtered — stale out-of-ring chunks get GPU-uploaded

**File:** `src/terrain.js:369-400`

**Issue:** `_flushPendingQueue` builds whatever is in the FIFO without checking whether the chunk is still within the current ring. If the car moves quickly (or teleports on reset) while worker responses are in-flight, `_pendingQueue` will contain chunks that `_updateChunkRing` has already determined are out of ring. `_flushPendingQueue` builds them anyway: GPU memory is allocated, a mesh is added to the scene, and the chunk is inserted into `_chunkMap` — only to be immediately disposed the next time `_updateChunkRing` runs. Under normal game speeds (< 30 m/s) the race window is small, but after reset (which can teleport the car to spawn) this can produce a burst of 25 stale builds blocking the `MAX_BUILDS_PER_FRAME=2` cap for several frames, delaying visible terrain appearing at the new position.

**Fix:** Add a ring-membership check before building:

```js
_flushPendingQueue() {
  const { cx: ccx, cz: ccz } = this._worldToChunk(
    /* need current car pos — pass it as argument or store it */
  )
  let built = 0
  while (this._pendingQueue.length > 0 && built < MAX_BUILDS_PER_FRAME) {
    const item = this._pendingQueue[0]
    // Discard stale entries that are no longer in the ring
    const [icx, icz] = item.key.split(',').map(Number)
    if (Math.abs(icx - ccx) > RING_RADIUS || Math.abs(icz - ccz) > RING_RADIUS) {
      this._pendingQueue.shift()
      continue
    }
    this._pendingQueue.shift()
    // ... build geometry
    built++
  }
}
```

Alternatively, store the last known center chunk in `update()` and use it in `_flushPendingQueue`.

---

### WR-02: `terrain()` function called every physics step — dead code with side effect

**File:** `src/main.js:579`

**Issue:** The legacy `terrain(x, z)` stub is called every physics step (60×/sec) inside the fixed-timestep accumulator:

```js
const _surface = terrain(vehicleState.position.x, vehicleState.position.z)  // eslint-disable-line no-unused-vars
```

Its return value is discarded (the `eslint-disable` comment acknowledges this). Phase 6 replaced the terrain height source with `terrainSystem.sampleHeight` called inside `queryContacts`/`queryVertexContacts`. The `terrain()` function only returns ramp height for the old ramp geometry — it is not connected to the procedural terrain at all. Calling it 60×/sec wastes CPU and creates misleading code: a reader unfamiliar with the history would assume this call feeds the physics system, which it does not.

**Fix:** Remove line 579. The `terrain()` function itself and `window.terrain = terrain` (line 336) should also be removed unless there is a deliberate console-debugging use case for `window.terrain`.

---

### WR-03: `_pendingWorker` entries not cleared when chunk is evicted from ring

**File:** `src/terrain.js:342-347`

**Issue:** When `_updateChunkRing` evicts a chunk that is in `_chunkMap`, it correctly disposes the geometry and removes from the map. However, if a key is in `_pendingWorker` (requested but no response yet) and then falls out of the ring — which can only happen if the car moves more than 2 chunks between `update()` calls — the key remains in `_pendingWorker` indefinitely. When the worker eventually responds with the heightmap, line 213 does `this._pendingWorker.delete(key)` and pushes into `_pendingQueue`. The chunk then gets built despite being out of ring (see WR-01). The `_pendingWorker` set grows without bound in extreme movement scenarios, though the values eventually drain as worker responses arrive.

This is a minor robustness issue only triggered at unrealistic movement speeds (> 128 m/s to cross 2 chunks in 1 frame). At normal game speeds it is harmless.

**Fix:** In `_updateChunkRing`, also remove evicted keys from `_pendingWorker`:

```js
for (const [key, chunk] of this._chunkMap) {
  if (!needed.has(key)) {
    this._scene.remove(chunk.mesh)
    chunk.mesh.geometry.dispose()
    this._chunkMap.delete(key)
  }
}
// Also cancel pending requests that fell out of ring
for (const key of this._pendingWorker) {
  if (!needed.has(key)) this._pendingWorker.delete(key)
}
```

Note: the worker will still complete and send the response, but the main thread will then build the chunk (WR-01 fix handles this).

---

## Info

### IN-01: Unused `simplex-noise` importmap entry causes unnecessary CDN network fetch

**File:** `index.html:27`

**Issue:** The importmap contains an entry for `simplex-noise` pointing to the CDN. No source file imports from `'simplex-noise'` — the noise implementation is self-contained inside the inlined `WORKER_SOURCE` string in `terrain.js`. This entry causes the browser to fetch ~10KB of JavaScript from jsdelivr.net on every page load for no benefit. On slow connections or when the CDN is unreachable, this delays page load.

**Fix:** Remove line 27 from the importmap:
```html
"simplex-noise": "https://cdn.jsdelivr.net/npm/simplex-noise@4.0.3/dist/esm/simplex-noise.js"
```

---

### IN-02: Unit tests missing coverage for `terrainAmplitude != 1.0`, negative coordinates, and chunk-boundary normal discontinuity

**File:** `test/terrain-unit.js`

**Issue:** All six tests use `terrainAmplitude = 1.0`. The amplitude multiplier codepath (`return raw * (terrainAmplitude ?? 1.0)`) is never exercised with a non-unity value. Additionally, no test queries at negative world coordinates (chunks with `cx < 0` or `cz < 0`), so the `Math.floor(wx / CHUNK_SIZE)` for negative inputs (e.g., `Math.floor(-1 / 64) = -1`) is untested. A test for `sampleNormal` at a chunk boundary (e.g., `wx = 0.0`) where one probe falls into an unloaded neighbor chunk is also absent — the fallback-to-zero behavior produces a false slope artifact that could be important to document.

**Fix:** Add three tests:
1. `sampleHeight` with `terrainAmplitude = 2.0` on a known height — verifies the multiplier.
2. `sampleHeight` at `wx = -16, wz = -16` with a chunk at `cx=-1, cz=-1` — exercises negative chunk coords.
3. `sampleNormal` at `wx = 0.5` with only chunk `(0,0)` loaded — documents the boundary discontinuity behavior (the probe at `wx - 0.5 = 0.0` stays in chunk 0,0 at its left edge, so this one actually passes; test at `wx = 0.25` to force the `-EPS` probe into chunk `-1,0`).

---

### IN-03: Two copies of worker source must be kept in sync manually

**File:** `src/terrain.js:37-177` and `src/terrain-worker.js`

**Issue:** The Blob worker source is maintained in two places: as an inlined string constant in `terrain.js` and as the standalone `terrain-worker.js`. They are currently functionally identical (confirmed by diff — only comments differ), but there is no automated check to detect divergence. A future edit to `terrain-worker.js` that is not mirrored in `terrain.js`'s `WORKER_SOURCE` would silently run the wrong worker in production.

**Fix:** Add a comment at the top of `terrain-worker.js` explicitly naming `terrain.js:WORKER_SOURCE` as the canonical runtime copy. Alternatively, add a CI/build step (or `test/` script) that strips comments from both sources and asserts they match. At minimum, add a `// WARNING: Mirror changes to WORKER_SOURCE in src/terrain.js` banner to the standalone file.

---

_Reviewed: 2026-06-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
