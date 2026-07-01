# HANDOFF → merge the water code into the running game (FEAT-22 / FEAT-17 ponds / FEAT-18 streams)

**From:** lead session (2026-07-01)
**To:** whoever cuts the water generation into mainline (the ponds + streams work)
**Type:** integration / merge request
**Read first:** memory `project_water_generation_landed` + `project_water_features_scope`, then the
per-feature handoffs `2026-07-01-ponds-worker.md` / `2026-07-01-streams-worker.md`, and
`2026-07-01-COORDINATION.md` (shared-file rules).

---

## TL;DR

The water **generation** is DONE and headless-green, but **UNWIRED** — `main.js` imports none of it. All
three tickets (FEAT-22 foundation + FEAT-17 ponds + FEAT-18 streams) live in one leaf module
`src/water.js` (+ `src/water-render.js`), gated by `test/water-invariance.mjs` (9 gates GREEN, seed 6:
8 ponds / ~59 streams over 3×3 km). Nothing is committed. This handoff is the **cut-into-main** guide.

Merge in **four layers**, easiest→riskiest. Layers 1–2 are additive/leaf (safe now). Layers 3–4 touch
`road.js` + `WORKER_SOURCE`, which are shared with live workers — coordinate + serialize.

⚠️ **Do NOT `git add -A`.** The tree also holds the QUAL-08 router work (mine) and in-flight QUAL-10
junction work (road.js/road-mesh.js/debug.js/ranger.js). The water files are cleanly separable:
`src/water.js`, `src/water-render.js`, `test/water-invariance.mjs`, and the `water:{}` block in
`data/ranger.js`. Commit those explicitly.

## What's built (the public surface you're wiring)

`WaterSystem(seed, params, heightFn)` — THREE-free leaf. `heightFn(wx,wz)` = RAW amplitude-applied,
carve-free height → inject `terrainSystem.rawHeightWorld` (src/terrain.js:686). Macro-cell ownership
(`WATER_CELL=512`), every feature a pure fn of a bounded stencil → window-invariant. Public API:
- **Detection (FEAT-22):** `basinsNear/saddlesNear(bbox)`, `traceFlow(sx,sz)` (descends to the exact basin
  floor → streams meet ponds for free).
- **Ponds (FEAT-17):** `pondsNear(bbox)` / `pondAt(x,z)`, `isRoadNoGo(x,z)` (pond+skirt disc — the router
  route-around query), `pondSkirtAt(x,z)` (FEAT-06 scatter sampler), `submergedAt(cgX,cgWorldY,cgZ) →
  {submerged, depth}` (the CG hook).
- **Streams (FEAT-18):** `streamsNear(bbox)`, `streamCarveSample(x,z,streams)` (PURE carve cross-section,
  staged for CARVE SYNC — NOT yet mirrored into any worker), `streamRoadCrossings(roadPolylines,bbox)`
  (PURE bridge-site detector).

`src/water-render.js` — `WaterRenderer(water, opts)` with `.sync(minX,minZ,maxX,maxZ)` (builds/culls pond
discs + stream ribbons to a `THREE.Group`), simple transparent material (no shader). `.dispose()`.

---

## Layer 1 — render + detection into `main.js` (additive, leaf, SAFE)

Mirrors the FEAT-06 `PropSystem` wiring (decoupled, injected sampler). Nothing else needs to change.

**a) Imports** (near the other `src/` imports, ~line 37):
```js
import { WaterSystem } from './water.js'
import { WaterRenderer } from './water-render.js'
```

**b) Instantiate** — after `roadSystem`/`terrainSystem` exist (~line 1013, alongside `propSystem`):
```js
let waterSystem   = new WaterSystem(worldSeed, RANGER_PARAMS, (x, z) => terrainSystem.rawHeightWorld(x, z))
let waterRenderer = new WaterRenderer(waterSystem, {})
scene.add(waterRenderer.group)
```

**c) Per-frame sync** — in `loop()`, right after `propSystem.update(...)` (~line 1410). Sync to the same
view region the terrain ring covers (use `streamCenter` + a radius ≈ the draw distance):
```js
if (waterRenderer) {
  const R = 640   // m — water draw region; tie to the Quality ring if you want it to track draw distance
  waterRenderer.sync(streamCenter.x - R, streamCenter.z - R, streamCenter.x + R, streamCenter.z + R)
}
```

**d) Seed-change rebuild** — in `debouncedRebuildFull` (~line 360, where `propSystem` is recreated) and the
initial-seed path: water is seed-deterministic, so rebuild it on a new seed or it shows stale water:
```js
if (waterRenderer) { scene.remove(waterRenderer.group); waterRenderer.dispose() }
waterSystem   = new WaterSystem(worldSeed, RANGER_PARAMS, (x, z) => terrainSystem.rawHeightWorld(x, z))
waterRenderer = new WaterRenderer(waterSystem, {})
scene.add(waterRenderer.group)
```

**Verify:** `npx serve .` → drive around seed 6; ponds sit in valley bottoms (each contained by its rim,
different heights), streams descend from saddles into ponds. No per-frame hitch from `sync` (it's bbox-
culled). **Register the gate:** add `'water-invariance.mjs'` to `test/run-all.mjs` `GATES` once wired.

## Layer 2 — the `submerged` flag (FEAT-22 hook, additive)

Add `submerged`/`submergedDepth` to vehicleState in **all THREE places** (memory
`project_vehiclestate_three_places`: `vehicle.js` SPAWN_STATE + `main.js` state literal + `main.js` reset).
Then per-frame in `loop()`, after the physics step, feed the CG:
```js
if (waterSystem) {
  const cgY = vehicleState.position.y + (RANGER_PARAMS.cgHeight ?? 0)
  const sub = waterSystem.submergedAt(vehicleState.position.x, cgY, vehicleState.position.z)
  vehicleState.submerged = sub.submerged; vehicleState.submergedDepth = sub.depth
}
```
v1 SETS the flag only (buoyancy/hydrolock/drag later consume it). Don't build water dynamics now.

## Layer 3 — roads route AROUND ponds (FEAT-17, touches `road.js` + the ROUTE SYNC router — SERIALIZE)

The router must avoid `waterSystem.isRoadNoGo(x,z)` (pond + skirt disc). **This needs TWO parts — an
anchor-level filter is NOT sufficient on its own** (see the correction below).

**Part A — arc-level exclusion (the actual guarantee).** The road is the ARC `arcPrimitiveConnect` routes
between anchors, and that arc is what must avoid ponds. Anchor-only filtering fails because two pond-free
anchors on opposite sides of a pond still get joined by an arc straight through it — and it's *worse* than
neutral: the router's cost has a `wAlt·height` term (`road-carve.js:574`) that makes it **prefer low
ground** (it valley-seeks — see the arc-router gate "DETOURS-AROUND-PEAK"). Ponds sit at valley FLOORS =
lowest-cost cells, so the router is actively *drawn toward* them. So add a **pond-obstacle term to the arc
router's per-primitive cost/validity**, right alongside the existing `wAlt·height` and the `hardR`
min-radius rejection (which already establish per-primitive rejection as the router's native pattern):
reject / heavily penalize any primitive whose sampled centerline enters a pond disc.

  Keep QUAL-08's two-Worker split clean by passing ponds as **DATA, not code** (do NOT mirror `WaterSystem`
  into the Worker):
  - Main thread computes ponds once (`WaterSystem`) and attaches the pond discs overlapping a connection's
    bbox to each route job as `opts.pondDiscs` — a few `{x,z,r}` floats per job.
  - `arcPrimitiveConnect` (canonical in `road-carve.js` ROUTE SYNC region → mirrored into
    `src/road-worker.js`; regenerate + `route-worker-sync.mjs` enforces byte-equality) reads
    `opts.pondDiscs` and excludes primitives entering them. The pond-handling **code** is identical in both
    copies and both get the **same deterministic pond data**, so the Worker's pre-warmed route == the
    main-thread synchronous route (byte-identical → the pre-warm cache stays valid). ⚠️ If only the main
    thread were pond-aware, the Worker would pre-warm pond-crossing routes and poison the cache — both
    routers MUST be pond-aware with identical data.

**Part B — anchor-level filter (cheap complement, not the guarantee).** Also drop/displace anchors inside a
pond disc during network assembly (`_buildUrquhart` / anchor generation). This keeps intersections out of
the water and reduces how often an arc even approaches a pond — but it does NOT by itself stop an arc from
crossing one (that's Part A's job).

- Inject the no-go into `road.js` via a setter (e.g. `roadSystem.setNoGo((x,z) => waterSystem.isRoadNoGo(x,z))`
  for anchor filtering) and thread the pond discs into `warmRoutes`/the route-job specs for Part A — keep
  `road.js` decoupled from `water.js` (no direct import; inject the sampler + data from `main.js`).
- ⚠️ **`road.js` AND the ROUTE SYNC region are shared.** road.js edits are disjoint from QUAL-08 (dispatcher
  L1145–1240) and QUAL-10 (node junctions L2740–2980); the ROUTE SYNC arcPrimitiveConnect edit re-touches
  the region QUAL-08 just relocated — coordinate, serialize commits, work in a git worktree. See COORDINATION.
- Hand the skirt to FEAT-06 scatter: add `pondSkirtAt` to the prop samplers (`makePropSamplers` in main.js)
  so trees/rocks prefer the shoreline.

## Layer 4 — stream carve + bridges (FEAT-18, touches `road-carve.js` + `WORKER_SOURCE` — DO LAST)

- **Channel carve:** promote `streamCarveSample` to a CARVE SYNC body — canonical in `src/road-carve.js`,
  mirrored verbatim into `terrain.js` `WORKER_SOURCE` in the **same commit** (search `CARVE SYNC` / SYNC
  RULE). ✅ **The router (QUAL-08) has already split `WORKER_SOURCE` — the ROUTE region is GONE from
  terrain.js; only the CARVE SYNC region remains there.** Add your carve body to the CARVE region; do NOT
  reintroduce routing into terrain.js. Note terrain.js:1399 — carve is a post-read main-thread blend, so
  follow the road-carve pattern exactly (do NOT add a third Worker; two-worker cap is a hard invariant).
- **Road×stream = BRIDGE, always:** feed the streamed road polylines to `streamRoadCrossings(...)`, emit a
  deck at road grade with the channel continuous underneath (suppress the road carve into the bed at the
  span). Share FEAT-08's self-overpass deck/support builder (`feat-road-self-overpass.md` — check its
  state; you may build the shared span builder here and FEAT-08 reuses it).
- Add a stream-carve smoothness/determinism gate; ensure `route-worker-sync.mjs` (now guarding
  `road-worker.js`) + the carve gates stay green.

## Commit split (when ready)

```
# Water generation (additive, separable — commit as one):
git add src/water.js src/water-render.js test/water-invariance.mjs \
        .planning/todos/pending/feat-water-*.md .planning/handoffs/2026-07-01-water-merge.md
#   NOTE: data/ranger.js has a water:{} block MIXED with QUAL-10's roadJunctionCarveRadius — split by hunk
#   (git add -p) or land after QUAL-10 commits its ranger.js changes. Do NOT git add -A.
```
Then Layers 1–4 land as their own commits (`feat(FEAT-17)…`, `feat(FEAT-18)…`) in dependency order.

## Watch-outs

- `water.js` stays a **leaf** — injected `heightFn`, no road/terrain-system import — so it remains headless-
  testable. Wire the couplings (no-go, skirt, submerged) from `main.js`, not from inside `water.js`.
- Use `rawHeightWorld` (raw, carve-free), NOT `analyticHeight` (carve-baked) — matches what the detection
  was gated against; mismatch would drift pond levels off the rendered surface.
- Everything window-invariant: a pond/stream must look identical regardless of approach / draw distance /
  which tile built it. The gate covers this; keep it green as you wire.
- `pondMaxRadius ≈ 50 m` — ponds, not lakes. Locked scope; resist creep.
