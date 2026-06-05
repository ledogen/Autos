# Pitfalls Research — v1.1 Mountains & Roads

**Domain:** Adding seeded layered terrain, world-seed system, deterministic switchback road routing, road surface ribbon with terrain carve, free-fly camera, and POI anchors to a shipped browser car-physics sim (Three.js r184, vanilla ES6, Web Worker terrain gen, fixed 1/60s physics, sphere-contact queryContacts).
**Researched:** 2026-06-05
**Confidence:** HIGH (analysis of live terrain.js + blueprint + prior bug history). MEDIUM (road routing specifics — no shipped code yet, derived from algorithm analysis).

---

## Critical Pitfalls

---

### Pitfall 1: Mesh/Physics Height Disagreement — The Floating/Sinking Truck

**What goes wrong:**
The truck visually floats above the terrain mesh or sinks through it. The mesh renders at one height; `queryContacts` queries a different height. The gap persists and is not transient (it is a systematic formula divergence, not a timing gap). When layered terrain adds coarse + fine + regional roughness octaves, the road carve blend, and a `terrainAmplitude` multiplier, there are at least five places where physics and mesh can silently diverge.

**Why it happens:**
The current system has a single path: the Worker computes raw noise heights, posts a `Float32Array` to the main thread, the main thread applies `terrainAmplitude` when building the mesh geometry (`heights[i] * amp`), and `sampleHeight` also applies `terrainAmplitude` (`raw * (this._params.terrainAmplitude ?? 1.0)`). This works today because there is only one formula and one multiplier. The v1.1 failure modes are:

1. **Octave count divergence.** The Worker computes the height with N octaves (coarse + fine + regional). The main-thread physics sampler (`sampleHeight`) reads directly from the Worker's `Float32Array`. If the Worker's formula and any per-sample road-carve applied on the main thread get out of sync — e.g., road carve is applied in the Worker but not in `sampleHeight`, or vice versa — the two surfaces disagree.

2. **Road carve applied in only one path.** The cut-biased road carve blends the terrain toward the road surface within a shoulder width. If the carve is applied when building the chunk mesh (main thread) but `sampleHeight` still reads the raw Worker heights, every car wheel position is above the carved road surface. The truck "floats" on the road and sinks into terrain shoulders.

3. **`terrainAmplitude` applied at different stages.** If the debug-panel amplitude slider changes, `rebuildAllChunks()` re-scales visible mesh geometry using the current `amp`. If a chunk is already built, its raw heights in `chunk.heights` are unscaled — `sampleHeight` re-applies `amp` at query time. This is correct today. But if road carve modifies `chunk.heights` values directly (rather than being a post-process), a subsequent `rebuildAllChunks` call will double-apply or mis-scale the carved values.

4. **Float32 vs Float64 divergence across threads.** The Worker stores heights in `Float32Array`. The main thread reads from `Float32Array`. If any physics path recomputes noise independently using `Float64` math (e.g., a thin fallback inline in `sampleHeight` for unloaded chunks), the floats round differently and the physics surface differs from the mesh surface by a small but non-zero delta. For a 0.37 m wheel radius, even a 0.01 m systematic offset causes wheels to hover above ground.

5. **Regional roughness multiplier applied only to mesh.** The regional roughness is a "low-frequency multiplier on the fine layer only." If the multiplier is baked into the mesh vertex positions but the physics sampler reconstructs fine-layer amplitude from a different path, the surface heights differ under the fine-noise peaks.

**How to avoid:**
- **Single source of truth.** Define the complete `height(x, z)` formula — including all octaves, regional multiplier, and road carve blend — as one pure function callable from both the Worker and the main-thread physics sampler. The Worker calls it to fill the `Float32Array`. `sampleHeight` reads from that `Float32Array` (bilinear-interpolated) — it never recomputes noise independently.
- **Road carve must not modify `chunk.heights`.** Store road carve as a separate lookup (a road-proximity blend weight queryable by world position). In `sampleHeight`, apply the carve blend as a post-read operation on the interpolated raw height. In mesh build, apply the same carve blend to each vertex height using the same lookup. Both use identical math from the same carve function.
- **Write a height-agreement unit test before any P7 terrain code ships.** Pick five world positions spread across a chunk. Assert that `terrainSystem.sampleHeight(x, z)` equals the bilinear-interpolated value from the chunk's stored `heights` array (which came from the Worker) multiplied by `terrainAmplitude`. If this test fails, there is a divergence bug. Run it at phase start, not after the full feature is built.
- **Freeze `terrainAmplitude` as a spawn-time parameter once road carve is active.** Live-tuning amplitude while roads are carved creates re-scaling inconsistencies. If the slider must stay, ensure `rebuildAllChunks` re-derives road carve geometry simultaneously.

**Warning signs:**
- Car wheels visually rest above the terrain surface at rest on any non-flat ground.
- Car sinks into the road surface on the carve shoulder but floats on the flat carved section.
- `console.log(terrainSystem.sampleHeight(x, z))` compared against reading the mesh vertex Y at the same (x,z) shows a mismatch.
- Increasing `terrainAmplitude` via the debug slider causes the car to lift off ground and stay there until respawn.
- Physics normal appears flat (0,1,0) while the visible mesh slope is clearly non-zero — indicates `sampleHeight` is reading uncarved heights while the mesh shows carved heights.

**Phase to address:** P7 (terrain formula must be unified before any road work). Road carve in P9 must pass the same height-agreement test as P7.

---

### Pitfall 2: Determinism Break — Chunk Load Order Dependence

**What goes wrong:**
Two players use the same seed. The maps look different. Or: the player loads the same seed twice on different hardware and gets different terrain. Roads that went north on the first load go east on the second. The world-seed contract is broken.

**Why it happens:**
The HARD RULE states every generator is a pure function of `(worldSeed, world coords)`. Violations come from:

1. **`Math.random()` called in the Worker.** The current Worker code uses `createNoise2D(() => 0.5)` — a fixed degenerate permutation, not seed-driven. When v1.1 replaces this with a seeded permutation, using `Math.random()` instead of a seed-derived PRNG breaks the contract globally for any player without a `?seed=` param.

2. **Worker message ordering.** Workers process messages FIFO within a single Worker, so the order of chunk responses equals the order of requests. However, if the ring decides which chunk to request first based on the car's exact position at the frame the ring update runs, and frame timing varies between loads, requests arrive in a different order. Since the noise function is pure, the heights themselves are deterministic — but if any logic branches on "which chunk arrived first" or accumulates state as chunks arrive, it will differ. The current `_pendingQueue.shift()` FIFO is safe; anything that writes shared state based on chunk-arrival order is not.

3. **Sub-seed correlation between terrain and roads.** If `seedFor("roads")` is derived from `worldSeed` by a trivial operation — e.g., `worldSeed + 1` or `worldSeed XOR constant` — the road waypoints will visually correlate with terrain ridge lines. Roads always follow ridges or always avoid them in a pattern that looks designed, not natural. The bias is subtle but reproducible.

4. **Road tile-graph depending on which tiles are currently loaded.** If the routing algorithm in P8 finds waypoints by sampling the coarse height function, and the coarse height is only available for loaded chunks, a tile that hasn't loaded yet returns height 0 (flat ground). The router finds a different least-cost path through the flat zero-height tile than it would through the actual terrain. On the next session, if that tile loads before routing runs, the path is different.

5. **Float non-determinism between JS engines.** Modern JS engines do not guarantee identical IEEE 754 results for `Math.sin`, `Math.atan2`, or `Math.sqrt` across V8, SpiderMonkey, and JavaScriptCore. If the height function uses these operations, Chrome and Firefox can produce heights differing by the last ULP. In practice the difference is ~1e-7, which is sub-millimeter and imperceptible. However, if the road router uses height comparisons to choose left/right at a tile boundary, a single ULP difference can flip a branch and produce a divergent road path.

**How to avoid:**
- **Use `mulberry32` or `xoshiro128**` as the seed-driven PRNG.** Both are ~4 operations, produce independent streams per domain tag, and are identical across all JS engines (no floating-point). `seedFor("domain", tileX, tileZ)` hashes inputs to a 32-bit uint, feeds `mulberry32`, returns a deterministic sequence. Define and freeze `seedFor()` in P7 before any other generator uses it.
- **Route over a standalone coarse-height function, not over chunk data.** The P8 road router must call `coarseHeight(x, z)` — a pure function using only the world-seed — not `terrainSystem.sampleHeight(x, z)`. The `TerrainSystem` is chunk-cached and chunk-load-order-dependent. The coarse function is always available. The same pure function feeds both the router and the coarse octave in the mesh-height formula.
- **Hash domain tags with a non-commutative operation.** `seedFor("coarse")`, `seedFor("fine")`, `seedFor("regional")`, `seedFor("roads", tileX, tileZ)` must produce uncorrelated outputs even when the input tags are similar strings. Use a proper string hash (FNV-1a or similar) combined with the worldSeed before producing the PRNG seed. Do not use `worldSeed + tileX * 31 + tileZ * 37` — arithmetic combinations of small integers produce correlated outputs.
- **Write a determinism test in P7.** Generate heights for a 5×5 grid of world positions twice with the same seed. Assert byte-identical results. Generate with a different seed and assert the results differ. Run this test on every future change to the height function.

**Warning signs:**
- Same seed produces different terrain on page refresh.
- Roads on the same seed don't share the same shape between two browser sessions.
- Terrain and road paths visually correlate (roads always exactly follow ridges or exactly follow valleys) — indicates sub-seed correlation.
- Switching from the default seed to a custom `?seed=` produces identical terrain — indicates seed is not wired into the noise function.

**Phase to address:** P7 (seed foundation and `seedFor()` must be locked before any procedural generator is written). P8 road router must use the pure coarse-height function, not chunk data.

---

### Pitfall 3: Performance Cliff — Layered Noise + Road Lookups Busting 60fps

**What goes wrong:**
The game drops from 60fps to 30–40fps after v1.1 terrain and road features land. The frame time is not obviously spiked — it just runs slightly slow because per-step physics costs increased. Profile reveals `queryContacts` or the road-carve lookup is the culprit.

**Why it happens (specific to this codebase):**
`queryContacts` is called 4 times per physics step (one per wheel sphere), and potentially 14 more times for body probes — 18 total per step, at 60 Hz = 1,080 calls/second. Each call currently costs ~6 array lookups + 10 multiplies. The v1.1 additions that can blow this budget:

1. **Multi-octave noise called directly in `sampleHeight` instead of reading the `Float32Array`.** If a developer "simplifies" the unified-height path by inlining the noise formula directly in `sampleHeight` (avoiding the chunk cache), each call computes 4–6 octaves of `Math.sin`/trig. Even at 100 ns/call, 1,080 calls × 4 octaves = ~0.4 ms per frame just for height queries. Add domain warp (another noise call to offset the input coordinates) and this doubles again to ~0.8 ms — 5% of the 16.7 ms frame budget gone on height queries alone.

2. **Per-sample road proximity lookup using a spline distance search.** The road carve applies a blend based on distance from the road centerline. If `sampleHeight` calls a function that iterates over all road spline segments to find the nearest, the per-call cost is O(segments). A road network with 200 spline segments × 1,080 calls/second = 216,000 segment iterations/second. At 50 ns/iteration that is ~11 ms/frame — a catastrophic performance cliff.

3. **Domain warping the input coordinates.** Domain warp (sampling noise at a noise-offset position) produces rich, natural-looking terrain. But it adds 2 extra noise calls per height query. If each call is 20 ns × 3 octaves = 60 ns, domain warp adds 120 ns per `sampleHeight`. At 1,080 physics calls/second: 0.13 ms. Acceptable on its own, but combined with other overhead it compounds.

4. **`sampleNormal` calling `sampleHeight` 4 times per query.** The central-difference normal already makes 4 height lookups per call. If `sampleHeight` becomes expensive (due to items 1–3), `sampleNormal` becomes 4× as expensive. The 14 body-contact probes in `queryVertexContacts` all call `sampleHeight` — some also call `sampleNormal` — and the cost multiplies.

5. **Chunk geometry build cost increase from layered noise.** The Worker currently computes 3 octaves. A full Sierra-style formula (ridged FBM + domain warp + regional multiplier) may be 6–8 noise calls per sample. At 4,225 samples per chunk, that is 25,000–34,000 noise calls per chunk. At 20 ns/call: 0.5–0.7 ms per chunk in the Worker. This is invisible on the main thread but means the Worker backlog grows during rapid movement.

**How to avoid:**
- **`sampleHeight` must read from `chunk.heights` Float32Array — never recompute noise.** The bilinear interpolation on the Float32Array is irreducibly cheap (6 lookups + 10 ops, ~5 ns). Noise recomputation in the physics hot path is strictly forbidden. Enforce this as an explicit code comment and a code-review check.
- **Road carve lookup must be O(1).** Before P9 ships, define the road carve as a texture or a spatial hash: for a given (x,z), store the blend weight in a sparse per-chunk lookup (e.g., a second `Float32Array` per chunk, same 65×65 grid, value = carve blend weight 0–1). `sampleHeight` reads one array value — same cost as the terrain height lookup. The road spline-to-texture bake is done once when the chunk is built, not per physics call.
- **Profile P7 terrain cost immediately after implementing the new noise formula.** Open Chrome DevTools Performance panel. Record 5 seconds of driving. Measure `queryContacts` call time. Budget: must stay under 0.2 ms/frame total for all height/normal queries. If it exceeds this, the noise formula is being re-evaluated in the hot path.
- **Domain warp is a mesh-only option.** If domain warp is used for terrain shaping, bake it into the Worker's height computation (stored in `Float32Array`). Never domain-warp in `sampleHeight`.
- **Road routing must not run per-frame.** The deterministic tile-graph approach in P8 computes road routes once per tile and caches them. The route is looked up per chunk load, not re-solved every frame. A global least-cost pathfinder called from `queryContacts` or the physics loop would instantly kill 60fps.

**Warning signs:**
- FPS drops to 45–50fps after terrain or road feature lands, with no obvious render change.
- Chrome Performance panel shows `sampleHeight` or `sampleNormal` accumulating significant time across 1,000+ calls per second.
- `queryContacts` timing is 3–5× higher than before v1.1.
- Road feature lands and FPS drops further even though no new mesh was added — indicates per-sample road lookup in physics path.

**Phase to address:** P7 (noise formula in hot path is the highest risk). P9 (road carve lookup must be designed as O(1) before being wired into `sampleHeight`).

---

### Pitfall 4: Road Routing — Degenerate Paths at Tile Seams

**What goes wrong:**
Roads work in the interior of tiles but produce one or more of: discontinuous gaps at tile boundaries, overlapping double-paths near seam lines, extreme direction changes (180° turns) at seam edges, or roads that ignore terrain grade at boundaries because the coarse height is sampled only within one tile.

**Why it happens:**
The "deterministic tile-graph" approach from the blueprint computes routes tile by tile, seaming them at shared edges. Failure modes unique to this approach:

1. **Tile-boundary waypoints computed independently.** If tile (0,0) picks its east-edge exit waypoint by minimizing grade within its own tile, and tile (1,0) picks its west-edge entry waypoint independently, the two waypoints are at different Z positions. The road has a seam jump at x=0 boundary. This is the most common tile-routing failure mode.

2. **Switchback waypoints exceeding max grade anyway.** The router adds switchback legs when the direct grade exceeds the max. But if the switchback itself cuts across a feature (a local ridge running perpendicular to the road direction) the switchback leg can exceed max grade. Greedy per-step routing without lookahead produces this. The router thinks it made a 3D turn but the new heading still climbs a steep face.

3. **Overlapping or crossing switchback arms.** A switchback that ascends a slope, reverses at a landing, and reverses again can cross its own previous leg if the turn radius (set by road width and minimum curve radius) doesn't have enough lateral room. On narrow ridges this is geometrically impossible to avoid without a wider hairpin zone.

4. **Spline continuity break between tiles.** Even if waypoints match at the seam, a cubic spline fitted tile-by-tile has a discontinuous tangent at the boundary unless the tangent constraint is propagated across tiles. Visual effect: a sharp kink in the road line at every tile boundary.

5. **Road routing over coarse height diverges from the actual terrain shape.** If the coarse height function (used for routing) has significantly lower amplitude than the full layered height (which includes fine noise), the router thinks a grade of 12° is passable, but the actual road path traverses a fine-noise feature that adds local 18° slopes. The car hits these on the road surface even though the router "solved" the grade constraint.

**How to avoid:**
- **Tile boundary waypoints must be shared, not independently computed.** When tile (0,0) and tile (1,0) are generated, both must derive the edge-crossing waypoint using the same deterministic formula: `edgeWaypoint(tileX, tileZ, edge) = seedFor("edge", tileX, tileZ, edge) → deterministic Z position on the east/west/north/south edge`. Both tiles use this same function — the waypoint is canonical, not tile-local.
- **Propagate entry and exit tangent constraints.** When building the road spline for a tile, require that the spline's entry tangent equals the exit tangent from the previous tile (stored in the tile-graph). This enforces C1 continuity across seams. Cache the exit tangent in the tile-graph when the tile is first routed.
- **Use a minimum switchback arm length.** Enforce that each switchback leg is at least 3× the road width in length before allowing a reversal. This prevents hairpins that immediately overlap. Enforce the geometric no-crossing check: the new arm's starting point must be at least `road_width * 2` laterally offset from any prior arm at the same elevation.
- **Grade check must use the full height function for a sanity pass.** After the coarse-height router proposes a path, evaluate the path elevation at 1 m intervals using the fine+coarse height. If any 10 m segment exceeds `max_grade * 1.2` (20% tolerance), flag that segment for carve deepening in P9 rather than re-routing.
- **Visualize every new tile's spline immediately in debug mode.** P8 ships with colored debug splines drawn per tile. Visual inspection of seam continuity is faster than assertions for this problem class.

**Warning signs:**
- Road line has visible kinks at integer tile boundaries (multiples of 64 m world units).
- A road switchback visually loops back and crosses itself on steep terrain.
- The road appears to go downhill then uphill in the same tile — indicates the routing cost function isn't accounting for the reversal arm's elevation gain correctly.
- Entry tangent at a tile seam produces a sharp angle visible in the debug spline view.

**Phase to address:** P8. Seam continuity and switchback geometry must both be verified in the debug-spline deliverable before any mesh work begins in P9.

---

### Pitfall 5: Road Surface — Carve Seam Cliffs at Shoulders

**What goes wrong:**
The road surface ribbon is smooth, but at the shoulder edge there is a sudden cliff: the terrain drops sharply from the road elevation back to the original uncarved terrain. Cars that drift to the road edge clip through this cliff or experience sudden impulse forces from the bodywork contact probes hitting the shoulder wall.

**Why it happens:**
The cut-biased carve is supposed to blend the terrain down to the road surface within a shoulder width. If the blend weight function drops to 0 abruptly (hard cutoff at shoulder edge) rather than tapering over a gradual shoulder, the height transition from road surface to raw terrain is a step function. The chunk mesh shows a cliff. `sampleHeight` returns the road elevation at the edge, then the raw terrain elevation one sample further — a possible 2–5 m height jump per 1 m cell.

The body-contact probes in `queryVertexContacts` (front/rear bumpers, sills, undercarriage) are positioned assuming a smooth ground plane. A 1–2 m cliff on the road shoulder triggers bumper contacts at highway speed, producing sudden upward impulses — the car "launches" when drifting off-road.

Additionally: at the seam between two adjacent chunks, the blend function is evaluated independently per chunk. If the road passes diagonally across the chunk boundary, the blend weights on each side of the seam may be computed from slightly different distances-to-road (due to the tile-local spline representation vs the canonical edge waypoint). This produces a seam in the carve — a height discontinuity at the chunk boundary, aligned with the road.

**How to avoid:**
- **Use a smooth blend function, not a hard cutoff.** The blend weight `w(d)` where `d` is distance from road centerline must be: `w(d) = 1` for `d < half_road_width`, tapering via `smoothstep` from 1 to 0 between `half_road_width` and `half_road_width + shoulder_width`. Zero at and beyond `shoulder_width`. A `smoothstep` taper over 3–5 m of shoulder width prevents visible cliffs while keeping the flat road zone flat.
- **Carve blend evaluation must use the same road-proximity function in both chunks.** When computing the carve weight for a vertex or sample at (x,z), the distance to the road centerline must be looked up from the canonical tile-graph spline, not a chunk-local copy. Two adjacent chunk samples at (64.0, z) and (64.01, z) must return the same road proximity weight. This is only guaranteed if both call the same `roadDistance(x, z)` function that uses the canonical edge waypoints.
- **Test carve at chunk seams explicitly.** Before P9 is complete, sample `sampleHeight` at (63.0, z), (64.0, z), (65.0, z) where the road crosses the chunk boundary. Assert that the height difference between adjacent samples is less than `terrain_slope * 1m` — i.e., no larger than the background terrain slope at that point.
- **Ensure body-contact probes have realistic response on shoulder cliffs.** Even with smooth carve, the terrain immediately outside the shoulder can be several meters lower than the road. Add a grade-limit check: if the body probe detects a contact with depth > 0.3 m at a probe that was not contacting the previous frame, cap the impulse magnitude (already present in the Baumgarte corrector) to prevent launch spikes.

**Warning signs:**
- Car experiences a sudden upward impulse when the front bumper probe crosses the road shoulder.
- Visible cliff edge at road shoulders in the debug wireframe.
- Height samples at (64.0, z) and (65.0, z) where a road crosses the chunk boundary differ by more than expected terrain slope.
- `sampleNormal` at the road shoulder returns a near-horizontal normal (pointing sideways) — the cliff face is being treated as a contact surface.

**Phase to address:** P9. The carve blend function design must be specified before the road surface mesh or physics integration is coded.

---

### Pitfall 6: Free-Cam — Physics Continuing While Flying, and Camera State Leak

**What goes wrong:**
Two failure modes:

(A) While in free-cam mode the car continues to receive physics updates. On flat terrain the car slowly rolls to a stop harmlessly. On steep terrain, or if the car was partially airborne when free-cam was activated, it can roll off a cliff, flip, or land in an unrecoverable state before the player returns to chase mode.

(B) When toggling back from free-cam to chase mode, the camera snaps abruptly to the car position because the chase camera's exponential follow state (`currentPos`, `currentLook`) was not updated during the free-cam period. The car moved; the chase camera's internal position state is stale. The result is a visible jump followed by a re-convergence lag that looks like a bug.

**Why it happens:**
`camera.js` is architected for multi-mode (confirmed in the blueprint: "this adds a mode, not a rewrite"). The current chase camera uses framerate-independent exponential follow (dt-based). Free-cam mode needs to: (1) keep the camera active without following the car, (2) idle the car or freeze physics while flying, (3) restore chase-cam state correctly on return.

The physics loop in `main.js` runs unconditionally inside the fixed-step accumulator. If free-cam just changes camera mode without touching the physics path, the car continues to simulate. This is likely the intended behavior (car idles while flying) but needs deliberate confirmation, since a car that falls off a cliff in the 30 seconds the player is evaluating terrain is frustrating.

**How to avoid:**
- **Decide explicitly: freeze physics or idle-simulate.** The blueprint says "car idles while flying." This means physics continues but the car receives zero throttle/brake/steer input. This is the correct choice (avoids a physics-resume discontinuity on return). Implement it as: while `camera.mode === 'freecam'`, force all input accumulators to zero before the physics step. The car coasts to a stop naturally due to rolling resistance and tire damping.
- **On free-cam exit, snap chase camera state before first follow frame.** When toggling back to chase mode, set `camera.currentPos.copy(car.position + offset)` and `camera.currentLook.copy(car.position)` immediately — before the exponential follow runs. This eliminates the snap artifact. Add a one-frame "hard follow" (alpha = 1.0) on the first frame after mode switch to prevent any residual lerp artifact.
- **Free-cam should not write to `vehicleState`.** Free-cam WASD controls must move only a `freeCamPos` / `freeCamQuat` state local to `camera.js`. They must not modify `vehicleState.position` or `vehicleState.velocity`. This prevents accidental car teleportation if the free-cam shares input processing with the car.
- **Hide or dim the physics debug HUD while in free-cam.** The slip-angle HUD, Pacejka canvas, and suspension travel bars become meaningless while flying. Display a "free-cam active" overlay. This also prevents players from misreading the HUD as the camera flying.

**Warning signs:**
- Car position shifts unexpectedly after returning from free-cam (indicates free-cam was writing to `vehicleState`).
- Camera snaps to car on free-cam exit then slowly converges — indicates chase-cam state was stale.
- Car falls off the visible terrain edge while in free-cam mode before the player can return — indicates input-zero not enforced.
- Free-cam WASD movement also steers the car slightly — indicates input handlers are shared without mode gating.

**Phase to address:** P7 (free-cam is the first deliverable within P7 and must be code-complete before terrain tuning begins — this is explicitly required by the blueprint).

---

### Pitfall 7: Chunk Streaming Thrash — Road Carve Invalidating Built Chunks

**What goes wrong:**
A chunk is built by the Worker and rendered. Later, the road routing system (P8/P9) determines that a road passes through that chunk and the carve needs to be applied. The chunk must now be rebuilt with carve weights. If the road data is not available when the chunk is first built, the chunk is built twice: once without carve, then again with carve. In a worst case the player sees the terrain "jump" from uncarved to carved as the road appears.

A related variant: the player moves fast enough that the chunk ring evicts a chunk before its road data is resolved. On re-entry, the chunk is rebuilt but road data may or may not be resolved in time, producing flickering road presence.

**Why it happens:**
The existing chunk pipeline is: request → Worker generates heights → main thread builds mesh. In v1.1, road carve depends on P8 road routing data that is separate from the noise heightmap. If road routing is a second async step, there is a window between "chunk heights available" and "road data available" where the chunk can be built without carve.

The existing `MAX_BUILDS_PER_FRAME = 2` cap and the `_pendingWorker` reservation guard (which the spawn-chunk bug fix explicitly hardened in commit 7cf6178) prevent duplicate geometry builds from the Worker. But they do not prevent a "carve update" rebuild triggered by road data arriving after the chunk is already in `_chunkMap`.

**How to avoid:**
- **Prefer synchronous road data over async if road routing is cheap.** If `roadData(tileX, tileZ)` is a pure deterministic function (no I/O, no Worker), it can be called synchronously during chunk mesh build on the main thread. The chunk-build path becomes: Worker heights arrive → main thread calls `roadData(cx, cz)` synchronously → builds mesh with carve already applied. No second rebuild needed.
- **If road data must be async, hold chunks in "pending carve" state.** Before P9 ships, extend the pending pipeline: `_pendingCarve` set analogous to `_pendingWorker`. A chunk does not transition to `_chunkMap` until both its heights and its road carve data are resolved. This extends the "flat ground fallback" period but eliminates the double-build artifact. The existing `_pendingWorker` reservation pattern is a direct model for this.
- **Road tile-graph must be computed before any chunk in that tile is built.** Since road routing in P8 is deterministic and tile-keyed, the road graph for tile (cx, cz) can be computed as soon as `cx` and `cz` are known — before the Worker is even posted. Add `_roadTileGraph.ensure(cx, cz)` before `_worker.postMessage(...)` in `_updateChunkRing`. This ensures road data is always ready before heights arrive.
- **Never rebuild a chunk solely for road carve updates to avoid the double-build stamp.** Once a chunk is in `_chunkMap` with carve applied, it should not be rebuilt unless it exits and re-enters the ring. Carve parameters should be frozen at build time for the ring's lifetime of that chunk.

**Warning signs:**
- The terrain visible under a road suddenly drops/shifts when the road carve is applied after the chunk is already rendered — a visual "jump" in terrain height.
- The road surface flickers between present and absent when moving near the chunk ring edge.
- Two geometry build events for the same chunk key in the same session visible in a debug log.
- The road appears to float above the terrain on re-entry into a previously visited chunk — the chunk was rebuilt without road carve data on re-entry.

**Phase to address:** P8 (road tile-graph must be ready before chunk builds during that phase's implementation). P9 (carve integration into the chunk pipeline must follow the "no double-build" rule).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Recompute noise inline in `sampleHeight` instead of reading `Float32Array` | Simpler code, no chunk-cache dependency | ~10× per-call cost in physics hot path; catastrophic at 1,080 calls/second | Never — always read from the `Float32Array` |
| Modify `chunk.heights` array values for road carve | One array to maintain | `rebuildAllChunks()` applies `terrainAmplitude` to the carve-modified values, double-scaling the carve; `sampleHeight` loses the "raw vs carved" distinction | Never — keep raw heights in `chunk.heights`, apply carve as a post-read blend |
| Use `Math.random()` in the seed-derived PRNG for "variety" | More visual variety | Breaks determinism; seed contract fails; shareable maps stop working | Never in any generator |
| Route roads over `terrainSystem.sampleHeight()` instead of a pure coarse-height function | One fewer function to maintain | Road routing depends on which chunks are loaded; non-deterministic; different on each load | Never — routing must use a pure function |
| Compute road proximity by iterating all spline segments in `sampleHeight` | Simple to code | O(segments) per call × 1,080 physics calls/second = catastrophic performance | Never in physics hot path |
| Hard shoulder cutoff (no smoothstep blend) in road carve | Simple math | Cliff at shoulder edge; car body probes trigger launch impulses when drifting off road | Never — always blend over a shoulder width |
| Snap chase camera directly to car on free-cam exit | No lerp artifact | One-frame snap is visible and looks like a bug | Never — always hard-set `currentPos` before the first exponential follow frame |
| Accept that roads don't exactly match grade constraints due to fine-noise | Simpler router | Player drives a "flat" road that actually has 20° local slopes; grade constraint is meaningless | Acceptable only if fine-noise amplitude is low enough (< 0.3 m deviation from coarse) |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `seedFor()` → Worker | Passing `worldSeed` to the Worker as a message, then using `Math.random()` as a fallback if the message doesn't arrive before the first `generate` | Initialize the Worker's PRNG from the seed in the first message; refuse to generate until seed message is confirmed; no `Math.random()` fallback |
| Road carve ↔ `sampleHeight` | Applying carve only in the mesh build path, not in `sampleHeight` | Both must call the same `carveBlend(x, z)` function; the function must be defined in a shared scope accessible from both the mesh builder and the `TerrainSystem.sampleHeight` path |
| Free-cam ↔ input system | Free-cam sharing the same WASD input handlers as car steering | Gate all vehicle-input accumulation behind `if (camera.mode !== 'freecam')` before the physics step |
| Road tile-graph ↔ chunk ring | Road graph state stored in `TerrainSystem` (tightly coupled to chunk lifecycle) | Road graph state is a separate module with its own Map keyed by `tileX,tileZ`; it is not evicted when a chunk leaves the ring (roads persist; terrain chunks are recycled) |
| `queryContacts` ↔ road surface normal | Returning terrain normal (from `sampleNormal`) for a position on the road, which does not include crown or bank | Road contact points must check if they are within road width of centerline; if so, return road normal (crown + bank + terrain slope blend) instead of raw terrain normal |
| `rebuildAllChunks()` ↔ road carve | Amplitude slider triggers `rebuildAllChunks()`, which re-scales all vertex heights from raw `chunk.heights` — if carve is baked into `chunk.heights`, it gets re-scaled by the new amplitude | Raw Worker heights stay in `chunk.heights`; carve is a post-read function; `rebuildAllChunks()` applies carve blend during vertex rebuild, not before storing heights |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Noise recomputed in `sampleHeight` hot path | fps drops from 60 to 45–50 with no render change; `sampleHeight` appears in profiler's hot functions | Read from `chunk.heights` Float32Array only; never call noise functions from the main thread | Immediately at 60 Hz × 18 probes with any multi-octave formula |
| O(N) road spline search per physics call | fps crashes proportional to road network size; profiler shows `roadDistance()` dominates | Spatial grid or per-chunk `Float32Array` carve-weight map; O(1) lookup | With >20 road spline segments on screen |
| Building all pending chunks in one frame when car crosses tile corners | Visible single-frame hitch; ms spike in Performance timeline | Existing `MAX_BUILDS_PER_FRAME = 2` cap must remain; do not bypass it for road carve rebuild | 4 new chunks × ~2 ms build = 8 ms spike without the cap |
| `sampleNormal` calling `sampleHeight` 4× per call, with expensive `sampleHeight` | Normal query 4× worse than height query; physics slow on slopes | Keep `sampleHeight` O(1) bilinear; the 4× factor is then ~20 ns total for normal | Immediately if `sampleHeight` is non-O(1) |
| Global least-cost pathfinding per frame | fps instantly non-playable; JS freezes | Tile-graph approach: route once per tile, cache; never route during the game loop | Every frame with any graph search over infinite terrain |
| Road tile-graph recomputed every time a chunk is evicted and re-entered | Hitches on chunk boundary crossing | Road graph state is persistent (separate Map, not evicted with chunk) | In any drive session longer than 10 minutes on varied terrain |

---

## "Looks Done But Isn't" Checklist

- [ ] **Unified height function:** `terrainSystem.sampleHeight(x, z)` returns the same value as bilinear-interpolating the stored `chunk.heights` (times `terrainAmplitude`) — verified with an explicit assertion test at 5 world positions.
- [ ] **Road carve in both paths:** Driving on the road surface feels level (no floating above mesh), and looking at the terrain from free-cam shows the carve in the mesh at the same location where `sampleHeight` returns the carved height.
- [ ] **Seed determinism:** Refreshing the page with the same `?seed=` produces identical terrain and roads (visual inspection + the height-agreement unit test).
- [ ] **Switchback grade constraint:** Driving a switchback from bottom to top in the Ranger without wheel-spin confirms no segment exceeds the target max grade (debug HUD shows slope angle during drive).
- [ ] **Road seam continuity:** Debug spline view shows no kinks at tile boundaries (multiples of 64 m world units).
- [ ] **Free-cam exit:** Toggling from free-cam back to chase mode shows no camera snap — the transition is smooth.
- [ ] **60fps after all v1.1 features:** Open Chrome DevTools Performance panel, drive 60 seconds on road + terrain. `sampleHeight` and road lookup combined are under 0.2 ms/frame.
- [ ] **Shoulder blend:** Driving off the road edge at low speed produces no sudden launch impulse from body-contact probes hitting a shoulder cliff.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Mesh/physics height divergence discovered mid-P9 | HIGH | Freeze all mesh and physics changes; write and run the height-agreement assertion test; identify which path diverges; fix the divergent path; rerun test before unfreezing |
| Determinism break discovered after P8 ships | MEDIUM | Add the determinism test; bisect which generator breaks it (terrain, road, or seed derivation); fix `seedFor()` or the PRNG seeding; rerun all determinism assertions |
| Performance cliff from noise in hot path | LOW (if caught early) / HIGH (if found after all features) | Profile immediately with DevTools; confirm `sampleHeight` is the culprit; add the Float32Array read path; remove any direct noise calls from main thread hot path |
| Road seam kinks discovered in P9 mesh | MEDIUM | Return to P8 tile-graph; enforce shared edge-waypoints and C1 tangent propagation; re-examine all tile-boundary splines in debug view |
| Carve cliff at shoulders discovered in P9 testing | LOW | Replace hard cutoff with smoothstep blend in carve weight function; confirm with height-sample assertion at shoulder edge; no architecture change required |
| Free-cam camera snap on exit | LOW | Add `currentPos.copy(...)` hard-set before first chase-cam frame; one-line fix |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Mesh/physics height disagreement (core terrain) | P7 — height-agreement test must pass before P7 is complete | `sampleHeight(x,z)` === bilinear of `chunk.heights[...]` × amp at 5 world positions |
| Mesh/physics height disagreement (road carve) | P9 — carve must be applied identically in mesh and `sampleHeight` | Same height-agreement test extended to on-road positions |
| Determinism — seed not wired into noise | P7 — `seedFor()` and seeded PRNG locked before any other generator | Refresh with same `?seed=` → byte-identical heights at 5 positions |
| Determinism — road router uses chunk data | P8 — pure coarse-height function must exist before routing is coded | Road path identical on two fresh page loads with same seed |
| Determinism — sub-seed correlation | P7 — `seedFor()` uses FNV-1a or equivalent non-trivial hash | Visual check: terrain ridges and road paths are uncorrelated |
| Performance cliff — noise in hot path | P7 — profile immediately after first layered terrain implementation | `sampleHeight` time in profiler < 0.01 ms/frame |
| Performance cliff — O(N) road lookup | P9 — carve-weight map designed before coding | Profiler shows road carve lookup under 0.05 ms/frame |
| Road routing seam discontinuity | P8 — shared edge-waypoints enforced before any spline smoothing | No kinks visible in debug spline view at tile boundaries |
| Road routing degenerate switchbacks | P8 — minimum arm length + no-crossing check in router | Debug visualization shows no self-crossing switchback arms |
| Road carve shoulder cliffs | P9 — smoothstep blend specified before mesh/physics coding | Height samples at shoulder edge show no step discontinuity |
| Free-cam physics/state issues | P7 — free-cam is P7's first deliverable | Toggle free-cam → drive 30 seconds → return: car state intact, camera snap-free |
| Chunk rebuild thrash from road carve | P8 — road tile-graph ready before chunk is built | No double-build events for any chunk key in session logs |

---

## Sources

- Direct code analysis of `src/terrain.js` (live codebase, 2026-06-05): chunk pipeline, `_pendingWorker` reservation, `sampleHeight` bilinear path, `rebuildAllChunks` amplitude re-scale, `MAX_BUILDS_PER_FRAME = 2` cap.
- `.planning/v1.1-BLUEPRINT-DRAFT.md` (2026-06-04): "#1 correctness constraint," "HARD RULE," "Open Question" on tile-graph routing, "Carried-Forward Constraints."
- `.planning/research/phase-06-terrain.md` (2026-06-03): Pitfall 3 (seams from non-deterministic seed), Pitfall 5 (queryVertexContacts not updated), Pitfall 7 (spawn terrain height), amplitude estimate analysis.
- `.planning/STATE.md` quick task log: spawn-chunk duplicate-request race (260604-x3i), amplitude rebuild orphan bug — both are direct evidence for the "thrash on rebuild" failure mode.
- Prior PITFALLS.md (2026-05-10): Pitfall 8 (GC pressure from hot-path allocation) — applicable to road carve lookups.
- First-principles algorithm analysis: deterministic tile-graph routing, central-difference normal, bilinear interpolation O(1) cost.

---
*Pitfalls research for: v1.1 Mountains & Roads (RangerSim)*
*Researched: 2026-06-05*
