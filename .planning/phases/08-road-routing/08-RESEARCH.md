# Phase 8: Road Routing — Research

**Researched:** 2026-06-09
**Domain:** Deterministic tile-graph road routing, switchback pathfinding, Catmull-Rom spline seam continuity
**Confidence:** HIGH (architecture), MEDIUM (cost weights — require tuning at runtime)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Sparse network — trunk road + occasional seeded spurs, not a dense web. Branch points are seeded (`seedFor("roads", ...)`) so spurs are deterministic.
- **D-02:** Max road grade target ~12%. Where a direct line exceeds it, the router switchbacks with tighter hairpins rather than long sweeping turns. The truck must always be able to climb any shipped road.
- **D-03:** Expose max-grade as a live debug slider. Roads are pure functions of `(worldSeed, coords)` and re-route automatically when grade target changes.
- **D-04:** Valley/pass-seeking cost function — reward low altitude + saddle/pass crossings. Roads hug valley floors and climb only at passes.
- **D-05:** Shipped debug viz = road centerline splines only, toggled via a lil-gui checkbox.
- **D-06:** Seam continuity (no kinks at 64 m tile boundaries) is the EXIT GATE.
- **D-07:** Swap the Phase 7 `resolveSpawn` body to "probe nearest road node + tangent heading"; same signature `(worldSeed, params) → {position, heading}`.

### Claude's Discretion

- Per-tile A* internals and how it handles altitude-doubling-back paths
- Branch-point logic for spurs
- Spline sampling/resolution
- Exact valley-seeking cost weights
- Max-grade slider range
- Spline query API shape (kept clean for Phase 9 consumption)

### Deferred Ideas (OUT OF SCOPE)

- Road surface ribbon mesh / crown / camber / terrain carve — Phase 9
- POI anchors at road-adjacent low-slope sites — Phase 10
- Pothole/crack micro-noise — Phase 10 stretch
- Truck body styles + functional lights — backlog 999.1
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ROAD-01 | Roads are routed deterministically over the coarse height as a tile-able graph — same seed + coords produce the same roads, seamless across streaming chunks | Per-tile A* on coarseHeight; seedFor("roads", tileX, tileZ) per tile; shared edge waypoints |
| ROAD-02 | Routing uses slope-weighted cost with a hard maximum-grade limit | Quadratic slope cost + hard grade cutoff (block edges exceeding max grade absolutely) |
| ROAD-03 | Where a direct line would exceed max grade, the route switchbacks up the slope instead of exceeding the grade | Fine-resolution routing grid allows lateral traversal; switchbacks emerge from cost not topology |
| ROAD-04 | Road centerlines are queryable as splines and visualized as debug lines | THREE.CatmullRomCurve3 per tile segment; LineSegments for debug; `road.js` module with query API |
</phase_requirements>

---

## Summary

Phase 8 builds the road routing system: a deterministic, tile-scalable A* pathfinder that routes over `coarseHeight`, switchbacks on steep terrain, and exposes its output as queryable Catmull-Rom splines. The system is the only novel algorithm in v1.1 and is genuinely high-risk — specifically around two sub-problems that required a research spike.

**Research spike resolution (two hard questions):**

**1. Altitude doubling-back during switchbacks:** A standard 2D A* grid marks cells visited once. A switchback path that doubles back over the same (x, z) footprint at a higher elevation would appear to visit the same cells twice — and would be rejected by the visited-set. The resolution is that switchbacks do NOT require revisiting the same cells. A switchback road traverses laterally along a contour, reverses direction at a hairpin node, and climbs the next arm above — each arm occupies a DIFFERENT set of grid cells because the arms are separated in X or Z by the hairpin width (~10–20 m). Standard A* visited-set is safe. The altitude-doubling-back problem is a red herring from thinking of the path in bird's-eye 2D; in the routing grid it is always a new cell. What DOES require care is the cost function: without quadratic slope weighting, a greedy path will hug the steepest-but-direct route rather than taking the longer hairpin. The quadratic (slope)^2 cost makes multi-arm hairpins cheaper than a single over-grade arm, causing switchbacks to emerge naturally from cost optimization rather than requiring explicit switchback topology.

**2. C1 spline continuity at the 64 m tile seam:** Both the left tile and the right tile derive their shared edge waypoints from the same `seedFor("roads", tileX, tileZ)` key (the tile whose eastern/northern edge is shared derives the edge waypoints; its neighbor reads those same waypoints as its western/southern entry points). When both tiles produce a Catmull-Rom segment, they include one ghost control point from the neighbor tile so the Catmull-Rom tangent formula (which uses the point before and after each control point) computes the same tangent value on both sides of the seam. This is exactly how Catmull-Rom achieves C1 across segment boundaries by construction: the tangent at a control point P_i = τ(P_{i+1} − P_{i-1}). If both tiles share P_{i-1} and P_{i+1} across the seam, the tangent at P_i is identical. Implementation: each tile keeps a one-waypoint overlap with each neighbor when building its spline.

**Primary recommendation:** Build `src/road.js` with (1) a fine-grid A* router operating on `coarseHeight`, using quadratic slope cost + hard grade block, (2) seeded tile-edge waypoints derived by the western/southern tile and consumed (as ghost points) by the eastern/northern tile, (3) `THREE.CatmullRomCurve3` as the spline representation with `getPoint(t)` / `getTangentAt(t)` as the public query API, and (4) lazy per-tile generation cached in a `Map` keyed by `tileX,tileZ`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Coarse terrain height sampling for routing | `src/terrain.js` | — | `coarseHeight()` is the only valid height source for router; `analyticHeight` wraps it with amplitude |
| Per-tile A* routing | `src/road.js` | — | New module, pure function of (worldSeed, tileX, tileZ, params) |
| Seeded tile-edge waypoints | `src/road.js` + `src/seed.js` | — | `seedFor("roads", tileX, tileZ)` frozen; road.js derives edge waypoints per tile |
| Spline representation + query API | `src/road.js` | Three.js `CatmullRomCurve3` | road.js wraps CatmullRomCurve3; exposes clean API consumed by Phase 9 |
| Debug visualization (centerline lines) | `src/road.js` / `src/main.js` | `src/debug.js` (toggle) | `THREE.LineSegments` or `Line` objects; toggle wired in debug.js lil-gui |
| Max-grade slider + road viz toggle | `src/debug.js` | — | Consistent with existing lil-gui folder pattern |
| Spawn integration (nearest road node + heading) | `src/main.js` `resolveSpawn` | `src/road.js` | Same call signature; road.js provides `nearestPoint(wx, wz)` |
| Spur branch-point seeding | `src/road.js` | `src/seed.js` | `seedFor("roads-spur", tileX, tileZ)` for branch selection |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `THREE.CatmullRomCurve3` | r184 (bundled) | Spline representation + `getPoint`/`getTangent` query | Already in project; C1 by construction; direct Phase 9 mesh sweep input |
| `THREE.BufferGeometry` + `THREE.LineSegments` | r184 (bundled) | Debug centerline visualization | Zero-dep; toggled via `visible` flag, no dispose/recreate cycle needed |
| `coarseHeight` (from `src/terrain.js`) | existing | Terrain height for routing grid | Pure function; never sampleHeight (chunk-load-order dependent) |
| `seedFor` (from `src/seed.js`) | existing | Per-tile deterministic sub-seed derivation | Frozen; roads use `seedFor("roads", tileX, tileZ)` |

### No New External Dependencies

Per CLAUDE.md: hand-rolled + Three.js + existing simplex only. No npm, no build system. The router, spline wrapper, and debug vis all fit in a single `src/road.js` module using what already exists.

**Version verification:** `THREE.CatmullRomCurve3` confirmed present in Three.js r184. [VERIFIED: threejs.org, CLAUDE.md]

---

## Package Legitimacy Audit

> No new external packages are installed in this phase. All dependencies are already present (Three.js r184 bundled via importmap, seed.js, terrain.js).

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
worldSeed + tileX,tileZ
        |
        v
seedFor("roads", tileX, tileZ)
        |
        +---> Edge waypoints (W + S edges of tile)
        |     shared as ghost points by neighbor tiles
        |
        v
Per-tile A* on fine routing grid
  - coarseHeight(wx, wz) at grid cells
  - Quadratic slope cost + hard grade block
  - Valley-seeking altitude weight
        |
        v
Ordered waypoint list (world coords, ~4-8 pts/tile)
        |
        +--- Ghost pts from W/S neighbors prepended
        +--- Ghost pts from E/N neighbors appended
        |
        v
THREE.CatmullRomCurve3 (per tile segment)
        |
        +---> getPoint(t), getTangentAt(t)   <── Phase 9 spline sweep
        +---> getPoints(N) → LineSegments    <── Debug viz
        |
        v
RoadSystem.queryNearest(wx, wz)
        |
        +---> { point: Vector3, tangent: Vector3 }  <── resolveSpawn (D-07)
        +---> spline segment ref                     <── Phase 9 ribbon
```

### Recommended Project Structure

```
src/
├── road.js          # New module: RoadSystem class + per-tile router
├── terrain.js       # Unchanged: coarseHeight used by road.js
├── seed.js          # Unchanged: seedFor frozen
├── main.js          # resolveSpawn body swap + debug wiring + road viz
└── debug.js         # Road viz toggle checkbox + max-grade slider
```

### Pattern 1: Per-Tile Lazy Generation with Cached Map

**What:** `RoadSystem` generates each tile's waypoints + spline on first access, stores in a `Map<"tileX,tileZ", TileRoad>`. Subsequent queries hit cache.

**When to use:** Every query to road.js — spawn resolution, Phase 9 mesh sweep, debug viz.

```javascript
// Source: derived from existing TerrainSystem._chunkMap pattern in src/terrain.js
class RoadSystem {
  constructor(worldSeed, params, terrainSystem) {
    this._worldSeed     = worldSeed
    this._params        = params          // reads maxRoadGrade, routeGridStep
    this._terrain       = terrainSystem   // for coarseHeight calls
    this._tileCache     = new Map()       // key: "cx,cz" → { waypoints, spline }
    this._debugLines    = []              // THREE.Line objects, added to scene on demand
    this._scene         = null            // set via init(scene)
  }

  // Returns { waypoints: Vector3[], spline: THREE.CatmullRomCurve3 } for a tile.
  // Pure function of (worldSeed, tileX, tileZ, params) — cache is just memoization.
  _getTile(tileX, tileZ) {
    const key = `${tileX},${tileZ}`
    if (!this._tileCache.has(key)) {
      this._tileCache.set(key, this._routeTile(tileX, tileZ))
    }
    return this._tileCache.get(key)
  }
}
```

**Note:** Cache must be invalidated when `maxRoadGrade` changes (re-routing). Same debounce pattern as terrain slider changes. [ASSUMED — timing/debounce exact values need tuning]

### Pattern 2: Fine-Grid A* Routing Over coarseHeight

**What:** Each tile is divided into a fine routing grid (recommended: 8×8 or 16×16 cells, i.e., 8 m or 4 m cell size). A* finds the least-cost path from the tile's entry edge waypoints to its exit edge waypoints.

**The critical insight about switchbacks:** Switchback arms are spatially separated. A 12% grade road climbing 64 m of relief (the full tile height range) would need: horizontal distance = 64/0.12 = 533 m. A single tile is only 64 m wide. This means: **a single tile will never contain a full switchback cycle**. The switchback pattern emerges across multiple tiles — the route goes up one arm for several tiles, hits a hairpin at the top of a tile, comes back across several more tiles. Each arm occupies entirely different tile cells (different tileX or tileZ). Standard A* visited-set is completely safe.

**Where switchbacks DO appear within a tile:** At the hairpin tile — the cell at which the route reverses direction. The "hairpin" is simply a high-cost U-turn bend that A* finds as the cheapest way to connect the inbound arm to the outbound arm. The router finds this naturally if the routing grid is fine enough to resolve both arms and the turn radius. At 4 m cell size and a 10 m minimum turn radius, the hairpin occupies ~3×3 = 9 cells. The router visits different cells on the inbound arm vs. outbound arm because they are physically separated by the hairpin width.

**Cost function (recommended):**

```javascript
// Source: [ASSUMED] derived from terrain pathfinding literature + domain reasoning
// coarseH is terrain.analyticHeight(wx, wz) / params.terrainAmplitude
// (raw coarse value pre-amplitude for consistent grade math)
function edgeCost(fromCell, toCell, params) {
  const dx = toCell.wx - fromCell.wx
  const dz = toCell.wz - fromCell.wz
  const dh = toCell.h  - fromCell.h    // raw coarseHeight delta

  const dist   = Math.sqrt(dx*dx + dz*dz + dh*dh)   // 3D distance
  const grade  = Math.abs(dh) / Math.sqrt(dx*dx + dz*dz)  // rise/run ratio

  // Hard block: edges exceeding maxGrade are impassable (Infinity cost)
  if (grade > params.maxRoadGrade) return Infinity

  // Quadratic slope penalty: penalizes abrupt altitude changes more than gradual ones
  // A grade of 0.06 (6%) costs (0.06)^2 * slopePenalty = 0.0036 * slopePenalty per unit
  // A grade of 0.12 (12%) costs (0.12)^2 * slopePenalty = 0.0144 * slopePenalty per unit
  // (4× penalty for 2× grade — strongly discourages steep but doesn't forbid below maxGrade)
  const slopeCost = grade * grade * params.roadSlopePenalty

  // Altitude weight: reward low altitude (valley-seeking, D-04)
  // toCell.h is raw coarseHeight; lower is better; subtract so low values get cheaper cost
  // Normalized by a reference height so the term doesn't dominate
  const altCost = toCell.h * params.roadAltWeight    // positive: higher altitude = higher cost

  // Valley saddle bonus: coarseHeight uses ridged noise (1 - |n|)^sharpness.
  // Low coarseHeight IS the valley. High ridged coarseHeight IS the ridge.
  // Saddle/pass crossings are low points on ridges — they appear as local minima of
  // coarseHeight surrounded by higher values. The altitude cost already rewards them
  // because they have lower h than the surrounding ridge. No extra saddle term needed
  // if altCost weight is tuned correctly. [ASSUMED — may need saddle-detection if
  // the router routes under ridges instead of over passes]

  return dist + slopeCost + altCost
}
```

**Heuristic for A*:**

```javascript
// Euclidean distance in XZ (ignoring altitude) — admissible since actual 3D distance >= XZ distance
function heuristic(cell, goalCell) {
  const dx = goalCell.wx - cell.wx
  const dz = goalCell.wz - cell.wz
  return Math.sqrt(dx*dx + dz*dz)
}
```

**Grid connectivity:** 8-directional (cardinal + diagonal). Diagonal cost multiplied by sqrt(2). This allows the route to follow contour lines diagonally, producing more natural curves.

### Pattern 3: Seeded Tile-Edge Waypoints for C0 + C1 Seam Continuity

**What:** Each tile has entry and exit waypoints on its western (left) and southern (bottom) edges. These waypoints are derived ONLY by the tile that "owns" that edge — by convention, the western edge waypoints are owned by the tile to the LEFT (lower tileX), and the eastern (right) neighbor reads them as its western entry waypoints.

**Ownership convention:**
- Tile `(tX, tZ)` owns its WESTERN edge (x = tX * CHUNK_SIZE) and SOUTHERN edge (z = tZ * CHUNK_SIZE)
- Eastern neighbor `(tX+1, tZ)` reads tile `(tX, tZ)`'s eastern edge = tile `(tX+1, tZ)`'s western edge
- This means tile `(tX, tZ)` derives its eastern-exit waypoints by calling `_getTile(tX+1, tZ)` for the neighbor's western-entry points — which forces the neighbor's tile to generate if it hasn't yet. The cache makes this idempotent.

**Why this achieves C1 (not just C0):**

Catmull-Rom tangent at control point P_i: `tangent_i = τ * (P_{i+1} - P_{i-1})`

At a tile seam, the last waypoint of tile A is P_i. Tile A knows P_{i-1} (its second-to-last waypoint) and P_{i+1} (tile B's first internal waypoint — obtained by querying tile B). Tile B knows P_i (its first waypoint = tile A's last waypoint) and P_{i+1} (its second waypoint). BOTH tiles compute the tangent at P_i using the same P_{i-1} and P_{i+1} — if they share those ghost control points across the seam, the C1 tangent is guaranteed identical on both sides.

**Implementation pattern:**

```javascript
// When building tile A's CatmullRomCurve3, extend the waypoint list with ghost points:
// [ghost_from_prev_tile, ...tile_A_waypoints, ghost_from_next_tile]
// The ghost points are the adjacent tiles' first/last internal waypoints.
// CatmullRomCurve3 will compute correct C1 tangents at the seam waypoints.
function buildTileSpline(tileX, tileZ, waypoints) {
  const prevTileLastWp  = _getLastWaypointOf(tileX - 1, tileZ)  // ghost: left neighbor
  const nextTileFirstWp = _getFirstWaypointOf(tileX + 1, tileZ) // ghost: right neighbor
  const pts = [prevTileLastWp, ...waypoints, nextTileFirstWp].filter(Boolean)
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5)
}
```

**Caveat:** Ghost point lookups create a dependency between adjacent tiles. To avoid infinite recursion (tile A asks tile B for its ghost, tile B asks tile A for a ghost while building), the edge waypoints must be computed BEFORE the spline, and spline construction (which needs ghost points) must be deferred until after edge waypoints exist. Separation of stages: (1) generate edge waypoints from `seedFor`, (2) run A* to compute internal waypoints, (3) build spline with ghost points. [ASSUMED — implementation detail; verify no circular dependency at coding time]

### Pattern 4: Seeded Edge Waypoints via seedFor

**What:** The tile's entry/exit positions on tile edges are pre-seeded BEFORE A* runs, so the A* always starts from and ends at deterministic, reproducible waypoint positions on each edge.

```javascript
// Source: derived from existing seedFor pattern in src/seed.js
function deriveEdgeWaypoints(tileX, tileZ, worldSeed) {
  const CHUNK_SIZE = 64
  const rng  = mulberry32(seedFor(worldSeed, "roads", tileX, tileZ))

  // Western edge entry point: random Z position on western edge of this tile
  const entryZ = tileZ * CHUNK_SIZE + rng() * CHUNK_SIZE
  const entryX = tileX * CHUNK_SIZE
  const entryH = coarseHeight(entryX, entryZ, ...)

  // Eastern edge exit point: random Z position on eastern edge
  const exitZ  = tileZ * CHUNK_SIZE + rng() * CHUNK_SIZE
  const exitX  = (tileX + 1) * CHUNK_SIZE
  const exitH  = coarseHeight(exitX, exitZ, ...)

  return { entry: new THREE.Vector3(entryX, entryH, entryZ),
           exit:  new THREE.Vector3(exitX,  exitH,  exitZ) }
}
```

**Trunk road convention:** The trunk road routes primarily in the X direction (east-west). Tiles receive their western edge entry point from the neighbor's eastern exit, derived by the neighbor. Only the western edge waypoints need the ownership convention; northern/southern edges are for spur branches.

### Pattern 5: Spur Branch-Point Logic

**What:** At seeded branch tiles, the router generates a secondary spur that leaves the trunk road and terminates at a seeded dead-end or loops back.

**Algorithm:**
1. For each trunk tile, compute `spurSeed = seedFor(worldSeed, "roads-spur", tileX, tileZ)`.
2. If `mulberry32(spurSeed)() < params.spurProbability` (e.g., 0.15 = 15% chance per tile), a spur is generated.
3. Spur starts from a seeded point on the trunk centerline (at parameter `t = mulberry32(spurSeed)()`).
4. Spur runs in the N or S direction for a seeded number of tiles (1–3), then terminates.
5. Spur A* uses the same cost function as the trunk.

**Key constraint:** Spurs are pure functions of `(worldSeed, tileX, tileZ)` — no inter-tile spur dependencies. A spur tile that has no trunk context still generates its spur correctly from its own seed.

### Pattern 6: Debug Visualization

```javascript
// Source: Three.js LineSegments pattern; [ASSUMED] based on existing Three.js usage in project
function buildDebugLine(spline, scene, color = 0xffaa00) {
  const pts = spline.getPoints(64)  // 64 samples along tile segment
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  const mat = new THREE.LineBasicMaterial({ color })
  const line = new THREE.Line(geo, mat)
  scene.add(line)
  return line
}
// Toggle: line.visible = roadVizEnabled (write from lil-gui checkbox onChange)
```

**lil-gui wiring in debug.js (consistent with existing folder pattern):**

```javascript
// In initDebug(), add a "Roads" folder:
const roadFolder = gui.addFolder('Roads')
roadFolder.add(state, 'roadViz').name('Show Road Splines').onChange(v => {
  if (callbacks.onRoadVizToggle) callbacks.onRoadVizToggle(v)
})
roadFolder.add(params, 'maxRoadGrade', 0.04, 0.20, 0.01).name('Max Grade (ratio)')
  .onChange(() => { if (callbacks.onRoadParamChange) callbacks.onRoadParamChange() })
```

### Anti-Patterns to Avoid

- **Using `sampleHeight` instead of `analyticHeight` (or raw `coarseHeight`) in the router:** `sampleHeight` returns 0 for unloaded chunks. The router runs before chunks are loaded. MUST use the pure `coarseHeight` function directly, not `analyticHeight` (which applies `terrainAmplitude` — the router should work in raw coarse units).
- **Routing over the full combined height (coarse + fine + regional):** Fine noise adds ~±0.5 m high-frequency variance that would cause the router to jitter around local texture. Route ONLY over `coarseHeight` per CONTEXT.md.
- **Marking visited cells in a global bitmap across tile boundaries:** Each tile's A* runs independently. No global visited state exists — only per-tile routing grids.
- **Building the spline before deriving edge waypoints:** Ghost point lookups require neighbor edge waypoints to exist. Stage order: (1) edge waypoints, (2) internal A* waypoints, (3) spline with ghost points.
- **Calling `road.js` from inside the physics fixed-timestep loop:** Road queries must be O(1) cache hits in the render loop. The routing computation (A*) happens lazily on first tile access, not per-frame.
- **Allocating new `THREE.Vector3` per frame in `nearestPoint` query:** Use scratch vectors or a fixed pool. `queryContacts` is called at 60fps; GC pressure kills frame time.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Spline evaluation + tangent | Custom Hermite or Bezier | `THREE.CatmullRomCurve3` | Already in project, C1 by construction, `getPoint(t)` / `getTangentAt(u)` are correct and tested |
| Spline arc-length parameterization | Manual arc-length table | `CatmullRomCurve3.getPointAt(u)` | Three.js computes the arc-length LUT internally; `getPointAt` is arc-length accurate (not parameter-uniform) |
| Seeded PRNG | Roll your own | `mulberry32(seedFor(...))` | Already in project, passes PractRand at relevant draw counts |
| Hashing | Custom hash | `seedFor` / `djb2` | Frozen; any change to these functions changes all generated roads |

**Key insight:** The hard work in this phase is the routing graph and seam continuity logic — not the spline math. Three.js does the spline math correctly. Don't introduce a second spline library.

---

## Common Pitfalls

### Pitfall 1: The "Altitude Doubling-Back" Red Herring

**What goes wrong:** Developer assumes switchbacks require A* to visit the same (x,z) cell twice at different heights, concluding that a 2D grid cannot model switchbacks.

**Why it happens:** Thinking about the switchback in bird's-eye view — the two arms appear to overlap spatially. But in the routing grid, the arms are on different terrain Z-offsets (the hairpin moves the road laterally by ~10–30 m). At a 4 m grid cell size, the two arms occupy entirely different cells.

**How to avoid:** Keep the routing grid fine enough to separate the two arms (cell size ≤ half the minimum hairpin width). At 4 m cells and a ~15 m minimum hairpin radius, the arms are 3–7 cells apart. Standard A* visited-set is always safe.

**Warning signs:** If the router produces straight-line roads that exceed grade (never switchbacking), the grid is too coarse or the quadratic slope cost weight is too low — not a visited-cell problem.

### Pitfall 2: Tile Seam Kinks from Missing Ghost Control Points

**What goes wrong:** Each tile builds its `CatmullRomCurve3` from its own waypoints only. At the tile boundary, the tangent of tile A's last point uses A's second-to-last point (inside the tile) as P_{i-1}, but tile B's first point uses B's second point (inside tile B) as P_{i+1}. The two computed tangents at the shared seam waypoint DIFFER — producing a kink.

**Why it happens:** Forgetting that Catmull-Rom's tangent formula needs one control point on each side of the target point. The seam waypoint needs one ghost point from EACH neighbor.

**How to avoid:** Always extend each tile's control-point list with one ghost point prepended (from the previous tile's last waypoint) and one appended (from the next tile's first waypoint) before constructing `CatmullRomCurve3`. The ghost points are not part of the tile's own waypoints — they are borrowed from the cache. This is the exit gate (D-06).

**Warning signs:** The debug spline shows a visible angle at every 64 m boundary. Fix: check that ghost points are being fetched and that the `CatmullRomCurve3` is constructed with them included.

### Pitfall 3: coarseHeight vs analyticHeight Confusion

**What goes wrong:** Router calls `terrainSystem.analyticHeight(wx, wz)` which multiplies by `terrainAmplitude`. Grade is computed as `dh / dx`. If `dh` uses amplitude-scaled height but the max-grade threshold is set against raw coarse units, grade is off by `terrainAmplitude` (default ~1.0, but tunable in debug panel — changes it on the fly).

**Why it happens:** `analyticHeight` is the "right" height for physics; but for routing, the grade computation must be consistent. Using raw `coarseHeight` makes grade independent of the visual amplitude slider.

**How to avoid:** The router must call `coarseHeight(wx, wz, noiseCoarse, params)` directly with its own noise closure (seeded identically to the terrain's main-thread closure). Road.js must construct its own `_noiseCoarse` using `createNoise2D(mulberry32(seedFor(worldSeed, 'coarse')))` — same as `TerrainSystem.reinitWorker`. Do NOT take a dependency on `TerrainSystem`'s private `_noiseCoarse` field.

**Warning signs:** Changing the terrain amplitude slider causes roads to re-route even though grade hasn't changed — means router is reading amplitude-scaled height.

### Pitfall 4: Cache Invalidation on maxRoadGrade Change

**What goes wrong:** Player drags the max-grade debug slider. Roads don't re-route. The tile cache still holds the old A* results.

**Why it happens:** The lazy-generation cache has no invalidation logic.

**How to avoid:** When `maxRoadGrade` (or any routing param) changes, call `roadSystem.invalidateCache()` which clears `this._tileCache`. Debounce the clear (same 150 ms pattern as terrain param changes in D-09). Then invalidate debug line objects and rebuild on next query.

**Warning signs:** Slider changes produce no visible change in road position.

### Pitfall 5: resolveSpawn Querying Un-Generated Tiles

**What goes wrong:** `resolveSpawn` calls `roadSystem.nearestPoint(wx, wz)` before any tile has been generated. Road system has no tiles. nearestPoint returns null. Spawn falls through to terrain-only fallback.

**Why it happens:** Road generation is lazy; spawn is called at init before any road tiles exist.

**How to avoid:** `resolveSpawn` must eagerly generate at least the spawn-region tile before querying nearest point. Pass `(worldSeed, RANGER_PARAMS)` to `roadSystem.ensureTile(tileX, tileZ)` for the spawn tile before calling `nearestPoint`. Since routing is cheap (small grid, cached), this is acceptable at spawn time.

**Warning signs:** Truck spawns off-road on every load.

### Pitfall 6: A* Grid Too Coarse — Roads Cut Through Ridges

**What goes wrong:** At 8 m grid cells, a 64 m tile has an 8×8 grid (64 cells). The router finds a straight-line path through a ridge because the ridge is only 1–2 cells wide and the slope cost doesn't penalize it enough.

**Why it happens:** Course grid + linear slope cost (not quadratic) makes ridge-cutting cheap.

**How to avoid:** Use 16×16 grid (4 m cells) with quadratic slope cost. The quadratic cost means a 2-cell ridge crossing costs (grade²) per cell and thus 2× the cost of a smooth contour-following path of the same length. This strongly discourages ridge cutting without forbidding it.

**Warning signs:** Roads run through mountain peaks; no valley-following behavior observed.

---

## Code Examples

### Verified Patterns from Official / Project Sources

#### CatmullRomCurve3 Query API

```javascript
// Source: Three.js r184 docs — CatmullRomCurve3 inherits from Curve
// [CITED: threejs.org/docs/#api/en/extras/curves/CatmullRomCurve3]
const spline = new THREE.CatmullRomCurve3(
  points,          // Array of THREE.Vector3 control points
  false,           // closed — false for open road segment
  'centripetal',   // curveType — 'centripetal' avoids self-intersections in tight bends
  0.5              // tension — 0.5 is standard Catmull-Rom
)

// Point at parameter t (not arc-length uniform):
const pt  = spline.getPoint(0.5)          // returns Vector3 at midpoint

// Tangent at parameter t (unit vector):
const tan = spline.getTangent(0.5)        // returns unit Vector3 tangent direction

// Arc-length uniform versions (use these for spawn heading — more accurate):
const ptAL  = spline.getPointAt(0.5)      // arc-length midpoint
const tanAL = spline.getTangentAt(0.5)    // arc-length tangent

// Discretize for debug line:
const pts64 = spline.getPoints(64)        // returns 65 THREE.Vector3 (64 segments)
```

#### seedFor Usage for Roads

```javascript
// Source: src/seed.js (frozen, existing project code)
// Roads domain tag: "roads", per-tile
import { seedFor, mulberry32 } from './seed.js'

const tileSeed = seedFor(worldSeed, "roads", tileX, tileZ)
const rng      = mulberry32(tileSeed)
// rng() → [0,1) — use for edge waypoint positions, spur probability, etc.

// Spur branch seed (independent stream from trunk):
const spurSeed = seedFor(worldSeed, "roads-spur", tileX, tileZ)
```

#### Minimal Priority Queue for A* (no library needed)

```javascript
// Source: [ASSUMED] standard binary heap pattern for A* in vanilla JS
// Three.js does not include a priority queue; hand-roll a min-heap (40 lines)
class MinHeap {
  constructor() { this._data = [] }
  push(item, priority) {
    this._data.push({ item, priority })
    this._bubbleUp(this._data.length - 1)
  }
  pop() {
    const top = this._data[0].item
    const last = this._data.pop()
    if (this._data.length > 0) { this._data[0] = last; this._sinkDown(0) }
    return top
  }
  get size() { return this._data.length }
  _bubbleUp(i) {
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this._data[p].priority <= this._data[i].priority) break
      ;[this._data[p], this._data[i]] = [this._data[i], this._data[p]]
      i = p
    }
  }
  _sinkDown(i) {
    const n = this._data.length
    while (true) {
      let min = i, l = 2*i+1, r = 2*i+2
      if (l < n && this._data[l].priority < this._data[min].priority) min = l
      if (r < n && this._data[r].priority < this._data[min].priority) min = r
      if (min === i) break
      ;[this._data[min], this._data[i]] = [this._data[i], this._data[min]]
      i = min
    }
  }
}
```

**Note:** For the routing grid sizes in this phase (16×16 = 256 cells max), even an O(N) sorted array would be fast enough. A binary heap is clean and avoids performance surprises if grid size increases.

---

## Runtime State Inventory

> Greenfield module (`src/road.js`). No existing runtime state to migrate. All generated road data is computed on-demand from `(worldSeed, tileX, tileZ, params)` — no persisted data, no IndexedDB, no saved game state affected.

**Nothing found in any category** — verified by: road routing does not exist in the codebase yet; no prior road data in terrain chunks, vehicle state, or debug panel state.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Global A* on entire world heightmap | Per-tile A* with seeded entry/exit waypoints | Standard for infinite-world games | Enables infinite streaming without global state |
| Linear slope cost | Quadratic slope cost | Established in terrain pathfinding literature (Runevision 2016) | Switchbacks emerge naturally; valley-following without explicit constraints |
| Bézier curves (manual tangent control) | Catmull-Rom (automatic tangents) | Standard in road procedural gen | C1 by construction; no manual tangent editing; Phase 9 sweep input |
| dat.GUI (legacy) | lil-gui (bundled in Three.js addons) | Three.js replaced dat.GUI | Already in project; host max-grade slider and road viz toggle here |

**Deprecated/outdated patterns in this domain:**
- Global waypoint graphs for infinite worlds: scale linearly with world size; replaced by tile-local graphs with seam protocols.
- L-system road generation: good for city blocks, not mountain switchbacks (no elevation awareness in base L-system).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Road spur probability 15% per tile (`spurProbability = 0.15`) | Architecture Patterns §5 | Too many/few spurs; easy to tune via debug slider |
| A2 | Routing grid: 16×16 cells per tile (4 m cell size) is sufficient resolution | Common Pitfalls §1, §6 | Too coarse → roads cut ridges or can't resolve hairpin arms; too fine → A* slow per tile |
| A3 | Ghost point scheme prevents C1 seam kinks (no circular dependency during construction) | Pattern 3 | Circular dependency during init; avoid by staging edge-waypoints before spline build |
| A4 | `roadAltWeight` and `roadSlopePenalty` cost weights must be tuned at runtime | Architecture Patterns §2 | Wrong weights → valley-seeking not achieved, or roads never climb passes |
| A5 | Catmull-Rom 'centripetal' curveType avoids self-intersection at hairpin bends | Code Examples | Self-intersecting curves in tight switchback turns; switch to 'chordal' if needed |
| A6 | `seedFor("roads-spur", tileX, tileZ)` produces independent stream from trunk seed | Architecture Patterns §5 | Spurs correlate with trunk waypoints; check avalanche behavior of seedFor |
| A7 | Per-tile A* on 16×16 grid completes in <1 ms on a mid-range laptop | Performance §below | Tile generation blocks frame on first access; profile and cap grid if needed |
| A8 | coarseHeight values are in raw noise units (pre-amplituide); grade math is amplitude-independent | Common Pitfalls §3 | Grade threshold behaves differently for different terrainAmplitude settings |

---

## Open Questions

1. **Routing grid resolution vs. A* performance budget**
   - What we know: 16×16 = 256 cells per tile; 8-directional A* expands at most 256 nodes; each node evaluates `coarseHeight` (inline simplex, ~100 ns per call); total: ~25,600 noise calls × 100 ns ≈ 2.5 ms worst case (not all cells expanded).
   - What's unclear: Whether 2.5 ms per tile-first-access is acceptable. Tile generation is lazy (only on first query), so it rarely happens mid-drive — but spawn resolution generates the spawn tile synchronously.
   - Recommendation: Profile on first tile access. If >2 ms, reduce to 8×8 grid (1 ms) and accept coarser switchback resolution. Expose grid size as a debug-only constant (not a slider).

2. **Valley-seeking cost weight calibration**
   - What we know: D-04 requires roads to reward low altitude + saddle/pass crossings. The quadratic slope cost already discourages climbing. The altitude weight adds an additional per-cell cost proportional to raw coarseHeight.
   - What's unclear: The ratio of `roadAltWeight` to `roadSlopePenalty` that produces "Eastern Sierra feel" without making the router refuse to climb any slope at all.
   - Recommendation: Start with `roadSlopePenalty = 50`, `roadAltWeight = 0.1`. Expose both as debug sliders. Mark them as tunable parameters from Phase 8 day 1.

3. **Trunk road global direction**
   - What we know: D-01 specifies a "trunk road." A trunk road must have a coherent large-scale direction (east-west, north-south, or diagonal) otherwise the per-tile routing produces a locally-optimal path on each tile that doesn't connect into a meaningful trunk globally.
   - What's unclear: Whether the trunk direction is fixed (e.g., always East-West) or derived from worldSeed.
   - Recommendation: Fix trunk direction as East-West (X-axis) for simplicity. Entry waypoint is on the western edge; exit waypoint is on the eastern edge. Seeded Z offsets on those edges ensure the road meanders north-south within the tile. This is a planner decision — flag as Claude's Discretion already granted.

4. **resolveSpawn: nearest-road-node search radius**
   - What we know: `resolveSpawn` must find the nearest road node. The road is a trunk + sparse spurs. The spawn region is near world origin (seeded offset ±100 m from `seedFor(worldSeed, "spawn")`).
   - What's unclear: What if the trunk road is far from the spawn origin for a given seed? The search needs a maximum radius.
   - Recommendation: Generate the 3×3 tiles around the spawn origin eagerly, then find the nearest point on any generated spline within 200 m radius. If none found (impossible trunk configuration), fall back to terrain-only spawn with a console.warn. Bounded, deterministic.

---

## Environment Availability

> This phase is purely code/config changes within the existing browser + Three.js environment. No new external services, CLIs, or runtimes are required.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Three.js r184 (CatmullRomCurve3, BufferGeometry, LineBasicMaterial) | Spline + debug viz | Yes | r184 (confirmed CLAUDE.md) | — |
| `src/seed.js` (seedFor, mulberry32) | Deterministic tile seeds | Yes | Phase 7 (frozen) | — |
| `src/terrain.js` (coarseHeight, analyticHeight) | Router height queries | Yes | Phase 7 complete | — |
| Local HTTP server (VS Code Live Server or npx serve) | ES6 module dev | Yes (per CLAUDE.md) | — | — |

**Missing dependencies with no fallback:** none.

---

## Validation Architecture

> `workflow.nyquist_validation: true` — section required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Browser console assertions (manual + automated console checks) — no Jest/Vitest per project constraints (no build system, no npm) |
| Config file | none — assertions embedded in test scripts loaded via `<script type="module">` in a test HTML page, or run as browser console snippets |
| Quick run command | Load `test-road.html` in browser; check console for PASS/FAIL |
| Full suite command | Same — all assertions in one file |

**Note:** The project has no automated test runner (no Jest, no Vitest — excluded by "no build system" constraint in CLAUDE.md). Tests are browser-runnable scripts that `import` from `src/` modules and log PASS/FAIL assertions to the console. This matches the pattern used for the P7 height-agreement test (exit gate todo #2 in STATE.md).

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ROAD-01 | Same seed + tile coords → identical road splines on two separate constructions | unit | Run `RoadSystem` twice with same worldSeed; assert waypoints and spline sample points are byte-equal | ❌ Wave 0 |
| ROAD-01 | Splines are continuous (no gap) across tile seams | integration | Sample spline at t=1.0 of tile A; sample at t=0.0 of tile B; assert distance < 0.01 m | ❌ Wave 0 |
| ROAD-02 | No edge in the A* result exceeds maxRoadGrade | unit | Walk all consecutive waypoint pairs; assert `|dh/dx| <= params.maxRoadGrade + epsilon` | ❌ Wave 0 |
| ROAD-03 | Route switchbacks on 50% grade terrain | smoke | Construct road system on a synthetic steep test terrain (analyticHeight returns a uniform ramp); assert centerline does not go straight up | ❌ Wave 0 |
| ROAD-04 | Spline query API returns consistent point + tangent | unit | Call `getPointAt(0.5)` and `getTangentAt(0.5)`; assert tangent is unit length, point is on the spline | ❌ Wave 0 |
| D-06 | No kink at tile seam (C1 continuity) | integration | Compute tangent at t=1.0 of tile A and at t=0.0 of tile B; assert angle between tangents < 5° | ❌ Wave 0 — **this is the exit gate** |

### Sampling Rate

- **Per task commit:** Determinism test (ROAD-01 first half) in browser console
- **Per wave merge:** Full suite (all 6 test cases above) in browser console
- **Phase gate:** Exit gate = D-06 (no kink at seam) green before Phase 9 begins

### Wave 0 Gaps

- [ ] `test/test-road.html` — loads `src/road.js` as a module; runs all 6 assertions above; logs PASS/FAIL per assertion
- [ ] `test/test-road-seam.html` — focused seam-continuity test (D-06 exit gate); samples tangents at tile boundaries for a 3×3 tile grid and asserts angle < 5°
- [ ] Synthetic terrain helper: a `mockCoarseHeight(wx, wz)` function for test isolation (returns a known steep ramp, eliminating dependency on live worldSeed noise during unit tests)

---

## Project Constraints (from CLAUDE.md)

The following directives from `CLAUDE.md` are directly applicable to this phase. Planner must verify compliance.

| Directive | Impact on Phase 8 |
|-----------|------------------|
| No physics library (Cannon.js, Rapier, etc.) | Road router is pure JS math — no new library for pathfinding; hand-roll the min-heap |
| No build system (webpack, Vite, Rollup) | `src/road.js` is an ES6 module with `import`/`export`; no transpilation; loaded via importmap in index.html |
| No dat.GUI | Max-grade slider and road viz toggle go in lil-gui (already in project via `three/addons/libs/lil-gui.module.min.js`) |
| No Euler angles for body rotation | Not relevant to road routing — no body rotation in road.js |
| No Web Workers for physics | Not relevant — road routing stays on main thread |
| Single `index.html` entry point | `src/road.js` imported in `src/main.js`; no new HTML files for production |
| `coarseHeight` only (never `sampleHeight`) | Router builds its own noise closure matching terrain's coarse seed; never calls `sampleHeight` |
| Pure function of `(worldSeed, world coords)` — HARD RULE | Router is `(worldSeed, tileX, tileZ, params) → waypoints + spline`; tile cache is memoization only, not state |
| 60fps target — `queryContacts` must stay cheap | Road queries in `queryContacts` / `resolveSpawn` must hit cache (O(1) Map lookup + O(1) spline evaluation) |
| LLM maintainability — explicit, self-documenting | `road.js` must be fully commented: every function has a JSDoc block; every non-obvious constant is named and explained |

---

## Sources

### Primary (HIGH confidence)
- Three.js r184 CatmullRomCurve3 API — `getPoint`, `getTangent`, `getPointAt`, `getTangentAt`, constructor params [CITED: threejs.org/docs/#api/en/extras/curves/CatmullRomCurve3]
- CLAUDE.md project directives (no build system, no physics library, coarseHeight-only for routing, 60fps, lil-gui)
- `src/seed.js` — `seedFor`, `mulberry32` function bodies (frozen, project source)
- `src/terrain.js` — `coarseHeight` signature, `TerrainSystem._chunkMap` cache pattern, `analyticHeight` contract
- `src/main.js` — `resolveSpawn` signature `(worldSeed, params) → {position, heading}` (D-07/D-16 seam)
- `src/debug.js` — lil-gui folder pattern for debug slider wiring
- `.planning/phases/08-road-routing/08-CONTEXT.md` — D-01 through D-07 locked decisions
- `.planning/ROADMAP.md` — Phase 8 success criteria, exit gate (seam continuity), research spike requirement

### Secondary (MEDIUM confidence)
- Catmull-Rom C1 tangent formula: `tangent_i = τ(P_{i+1} - P_{i-1})` [CITED: graphics.cs.cmu.edu/nsp/course/15-462/Fall04/assts/catmullRom.pdf]
- Quadratic slope cost for natural terrain paths [CITED: blog.runevision.com/2016/03/note-on-creating-natural-paths-in.html]
- Catmull-Rom 'centripetal' parameterization avoids self-intersections [CITED: en.wikipedia.org/wiki/Catmull–Rom_spline]

### Tertiary (LOW confidence)
- Specific cost weight starting values (`roadSlopePenalty = 50`, `roadAltWeight = 0.1`) — [ASSUMED], require tuning at runtime via debug sliders
- Routing grid resolution recommendation (16×16 per tile) — [ASSUMED], derived from switchback geometry reasoning + coarseHeight performance estimate

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Three.js CatmullRomCurve3 is confirmed in r184; seed.js and terrain.js are existing project code
- Architecture: HIGH — per-tile lazy routing + shared-ghost-point seam continuity is a well-understood pattern; the altitude-doubling-back analysis is a geometric argument, not an empirical claim
- Cost weights: MEDIUM/LOW — starting values are reasoned estimates; all exposed as debug sliders for runtime tuning (D-03)
- Pitfalls: HIGH — each pitfall derives from concrete code contracts in the project (coarseHeight vs analyticHeight, ghost point Catmull-Rom math, cache invalidation)

**Research date:** 2026-06-09
**Valid until:** 2026-07-09 (stable domain — Three.js API, A* algorithm, Catmull-Rom math are not fast-moving)
