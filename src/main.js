/**
 * src/main.js — RangerSim Walking Skeleton
 *
 * Entry point for the browser app. Responsibilities:
 *  - Three.js scene setup (renderer, camera, lighting, ground)
 *  - Vehicle mesh creation (body BoxGeometry + 4 wheel CylinderGeometry)
 *  - stats.js FPS panel init
 *  - Fixed-timestep accumulator game loop (Plan 02 inserts physics here)
 *  - terrain(x, z) stub (M1-13 — Phase 6 replaces body, signature locked)
 *  - syncMeshesToState() — meshes follow vehicleState each frame
 *  - Resize handler
 *
 * Conventions: see docs/GLOSSARY.md
 * Forbidden patterns: quaternion-only body rotation (Pitfall 3), no Euler body state,
 *                     no physics library import, no legacy GUI library.
 */

import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { stepPhysics } from './physics.js'
import { getBodyContactPoints, getWheelPosition } from './suspension.js'
import { updateVehicle, SPAWN_STATE } from './vehicle.js'
import { updateCamera, getCameraMode, getFreecamPosition } from './camera.js'
import { initDebug, updatePacejkaCurve, updateTravelBars, updateSlipVectors } from './debug.js'
import { captureFrame, toggleRecording, openInitialCondition, isRecording, setCaptureContext } from './logger.js'
import { buildPlaceCapture } from './capture.js'
import { TerrainSystem } from './terrain.js'
import { RoadSystem, CHUNK_SIZE } from './road.js'
import { perfAdd, perfMark, perfDump, perfReset } from './perf.js'  // TEMP perf triage (D-arc)
let _perfFrame = 0  // TEMP: frame counter for auto-dump at load
let _firstFrameMarked = false  // TEMP: mark the first animate frame to isolate init vs loop time
import { RoadMeshSystem } from './road-mesh.js'
import { parseWorldSeed, seedFor } from './seed.js'

// World seed — parsed from URL ?seed= parameter, defaulting to 'lone-pine'.
// Plan 04: changed to `let` so debug panel seed field can mutate it (SEED-04).
// Refreshing the same ?seed= URL reproduces the same terrain (SEED-01/03).
const _urlSeed = new URLSearchParams(window.location.search).get('seed')
let worldSeed = parseWorldSeed(_urlSeed ?? 'lone-pine')
let _seedString = _urlSeed ?? 'lone-pine'   // current seed STRING (reference for captures; numeric worldSeed drives repro)

// Capture stream-center ring (Phase 4/5): last N stream centers, for event/tear reproduction. Cheap —
// pushed only when the center moves a meaningful distance. Not required for PLACE repro (the road is
// window-invariant since Phase 2/3) but free insurance for the event class.
const _streamCenterRing = []
const _STREAM_RING_MAX = 240
function _trackStreamCenter (t, x, z) {
  const last = _streamCenterRing[_streamCenterRing.length - 1]
  if (last && Math.hypot(x - last.x, z - last.z) < 16) return  // only log meaningful moves
  _streamCenterRing.push({ t, x, z })
  if (_streamCenterRing.length > _STREAM_RING_MAX) _streamCenterRing.shift()
}

// TerrainSystem instance — declared at module scope so queryContacts / queryVertexContacts
// can access it by reference. Initialized after scene exists (below initDebug).
let terrainSystem = null

// RoadSystem instance — declared at module scope so the lil-gui callbacks (onRoadVizToggle,
// onRoadParamChange) can access it. Initialized after TerrainSystem exists (requires scene).
let roadSystem = null

// RoadMeshSystem instance — declared at module scope so re-stream callbacks can clear it.
// Initialized after both terrainSystem and roadSystem exist.
// Provides the visual ribbon mesh (SURF-01) with crown + camber (SURF-03).
let roadMeshSystem = null

// Grid-world mode flag (D-18 / D-19).
// When true: terrain streaming paused, Sierra chunks hidden, ramp visible/collidable,
//            car placed at origin on a flat grid for clean physics tuning.
// When false (default / Sierra world): terrain streams normally, ramp invisible and non-collidable.
// enterGridWorld() and returnToWorld() (below initDebug) are the only write sites.
let _gridWorldActive = false

// Manual verification hook — console.log confirms importmap loaded r184 (FOUND-02)
console.log('THREE.REVISION', THREE.REVISION)


// ── Suspension substep transient scratch arrays (Phase 4 — D-02, PATTERNS §underscore convention) ──
// These are per-step outputs from stepSuspensionSubsteps; live on params (not vehicleState)
// because they are re-computed every outer step and are not integrated state.
// _tireFz[i]:         tire spring force per corner [N] — Fz fed into Pacejka (D-03)
// _suspForceAccum[i]: averaged suspension spring force per corner [N] — applied to body (D-07)
RANGER_PARAMS._tireFz         = [0, 0, 0, 0]
RANGER_PARAMS._suspForceAccum = [0, 0, 0, 0]
// _hubNormalXZ[i]: X/Z residual contact normal force per corner — plain {x,y,z} objects (not THREE.Vector3)
// to preserve the suspension.js pure-math contract (D-06a). Zeroed by stepSuspensionSubsteps each step.
RANGER_PARAMS._hubNormalXZ = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 }
]

// ── Static equilibrium at startup (RESEARCH §Pattern 4, Phase 4.1 D-11) ─────────────────────────────────────
// Pre-compute strutComp and body Y so the car spawns pre-settled with no visible drop.
// Phase 4.1 D-11 formula: strutComp[i] = m_sprung_corner * g / k_S_i
//   m_sprung_corner = mass * weight_i / 2  (sprung mass only — excludes wheelMass from hub ODE)
//   Verified numerically: strutComp ≈ 0.111 m at current params
// Body Y derivation (via series-spring geometry):
//   tireComp  = cornerMass * g / k_T   (full corner mass including wheel)
//   hubY      = wheelRadius - tireComp  (hub sits above ground by tireComp)
//   bodyY[i]  = hubY + (L_S - strutComp[i]) + (cgHeight - wheelRadius)
//   vehicleState.position.y = average of front bodyY values (body is rigid; one CG)
function computeStaticEquilibrium (p) {
  const g          = 9.81
  const strutComp  = [0, 0, 0, 0]
  const bodyYCorner = [0, 0, 0, 0]
  for (let i = 0; i < 4; i++) {
    const isFront    = i < 2
    const cornerMass = p.mass * (isFront ? p.weightFront : p.weightRear) / 2 + p.wheelMass
    const k_T = p.tireStiffness
    const k_S = isFront ? p.suspensionStiffnessFront : p.suspensionStiffnessRear
    const L_S = isFront ? p.suspensionRestLengthFront : p.suspensionRestLengthRear
    const sprung    = p.mass * (isFront ? p.weightFront : p.weightRear) / 2  // D-11: sprung only
    strutComp[i]    = sprung * g / k_S  // ≈ 0.111 m at current params
    // Derive bodyY from strutComp (D-11 geometry):
    //   hubY = wheelRadius - tireComp (where tireComp uses full corner mass incl wheel)
    //   bodyY = hubY + (L_S - strutComp[i]) + (cgHeight - wheelRadius)
    const tireComp   = cornerMass * g / k_T
    const hubY       = p.wheelRadius - tireComp
    // Subtract suspensionBodyOffset to invert getWheelPosition's mount-Y (which now includes it,
    // BUG-05) — keeps the spawn height exact at any ride-height tuning instead of settling a frame.
    const bodyOffset = isFront ? (p.suspensionBodyOffsetFront || 0) : (p.suspensionBodyOffsetRear || 0)
    bodyYCorner[i]   = hubY + (L_S - strutComp[i]) + (p.cgHeight - p.wheelRadius) - bodyOffset
  }
  // Use average of front-pair bodyY for initial CG height (front/rear should be nearly equal
  // with balanced tuning; minor front-rear offset settles within a frame via hub dynamics).
  const bodyY = (bodyYCorner[0] + bodyYCorner[1]) / 2
  return { bodyY, strutComp }
}

// ── resolveSpawn (D-14 / D-16) ───────────────────────────────────────────────────────────
// Phase 8 COMPLETE (D-07 / D-16): Body now probes the road graph first (nearest road node +
// tangent heading), with the Phase 7 terrain-only body preserved as a fallback.
// Signature is unchanged: (wseed, params) → { position: THREE.Vector3, heading: number }.
// Call site (_reseatTruckAtSpawn) is also unchanged — only the body was swapped.
//
// Algorithm:
//   1. Compute spawnSeed = seedFor(wseed, 'spawn') and base offset baseX/baseZ (±100 m).
//   2. If roadSystem exists: eagerly ensureTile the 3×3 spawn-region tiles so queryNearest
//      has data (RESEARCH Pitfall 5 — query on un-generated tiles returns null).
//   3. queryNearest(baseX, baseZ, 200) — nearest point on any road spline within 200 m.
//   4. On road hit: position.y = terrainSystem.analyticHeight(...) for visual surface match
//      (router uses raw coarseHeight for grade math; spawn PLACEMENT uses analyticHeight so
//      the truck rests on the rendered surface). heading = atan2(tangent.x, tangent.z) faces
//      down the road (D-07).
//   5. Null result or absent roadSystem → console.warn + Phase 7 terrain-only fallback
//      (bounded ≤50 tries, deterministic — T-07-04-SPAWN guarantee preserved).
function resolveSpawn (wseed, params) {  // eslint-disable-line no-unused-vars
  const spawnSeed = seedFor(wseed, 'spawn')
  const baseX = ((spawnSeed & 0xFFFF) / 0xFFFF - 0.5) * 200   // ±100 m initial offset
  const baseZ = (((spawnSeed >>> 16) & 0xFFFF) / 0xFFFF - 0.5) * 200

  // ── Phase 8: road-graph probe (D-07) ─────────────────────────────────────────
  if (roadSystem) {
    // Eagerly warm the spawn tile before querying (RESEARCH Pitfall 5 — query on
    // un-generated tiles returns null). One ensureTile streams the whole 640 m-radius
    // network around the spawn tile, which fully covers the 200 m query radius below —
    // so a single warm call is sufficient. queryNearest then searches a radius-sized
    // block of this._tiles (CR-01) cheaply, with NO further streaming. Warming per-tile
    // (a 9×9 grid) re-centered _streamNetwork past its 96 m move-gate ~40 times,
    // rebuilding the network redundantly on every spawn/reload (PERF-01).
    const baseTX = Math.floor(baseX / CHUNK_SIZE)
    const baseTZ = Math.floor(baseZ / CHUNK_SIZE)
    perfMark('resolveSpawn: before ensureTile (cold network stream)')  // TEMP (D-arc)
    roadSystem.ensureTile(baseTX, baseTZ)
    perfMark('resolveSpawn: cold network stream done')  // TEMP (D-arc)
    let nearest = roadSystem.queryNearest(baseX, baseZ, 200)
    if (nearest) {
      // BUG-11 spawn-off-road: the network the road is RENDERED from is whatever the per-frame
      // update() streams around the truck. The spawn point found above can be up to 200 m from
      // baseTile — across a 256 m anchor band — so the canonical run's X-extent (mx0..mx1, which
      // follows the stream center) differs between the baseTile stream and the first-frame stream
      // around the truck. The road then re-shapes out from under the just-seated truck.
      // Re-stream centered on the spawn point and re-seat on THAT network so placement matches
      // what the first frame renders. ensureTile is lazy-gated (96 m), so this only re-streams when
      // the spawn point is actually far enough from baseTile to matter.
      const spawnTX = Math.floor(nearest.point.x / CHUNK_SIZE)
      const spawnTZ = Math.floor(nearest.point.z / CHUNK_SIZE)
      roadSystem.ensureTile(spawnTX, spawnTZ)
      nearest = roadSystem.queryNearest(nearest.point.x, nearest.point.z, 100) || nearest
      // analyticHeight for placement so the truck rests on the rendered terrain surface.
      // (router used raw coarseHeight for grade; spawn PLACEMENT uses analyticHeight — visual match)
      const surfaceY = terrainSystem ? terrainSystem.analyticHeight(nearest.point.x, nearest.point.z) : 0
      return {
        position: new THREE.Vector3(nearest.point.x, surfaceY, nearest.point.z),
        heading:  Math.atan2(nearest.tangent.x, nearest.tangent.z)  // face down the road
      }
    }
    console.warn('[resolveSpawn] No road node within radius — falling back to terrain-only spawn')
  }

  // ── Phase 7 terrain-only fallback (preserved) ────────────────────────────────
  // T-07-04-SPAWN: bounded loop (≤50 tries), origin fallback, console.warn — no infinite loop.
  const MAX_TRIES = 50
  const GRADE_THRESHOLD = Math.cos(15 * Math.PI / 180)  // ≈ 0.966, grade < ~15%
  const STEP = 80

  let candX = baseX
  let candZ = baseZ
  let chosenX = 0
  let chosenZ = 0
  let found = false
  // Track the flattest candidate seen so the no-flat fallback uses it instead of an
  // already-rejected steep point (WR-06). bestNormalY starts at -1 so any real sample wins.
  let bestNormalY = -1
  let bestX = candX
  let bestZ = candZ

  if (terrainSystem) {
    // Bounded grid sweep: keep candidates within ±2 STEP (±160 m) of the seeded offset so
    // the spawn stays near where the seed nominally places it (WR-06 — the old sawtooth let
    // the Z term wander to ±720 m). Deterministic order preserves SEED-driven reproducibility.
    for (let i = 0; i < MAX_TRIES && !found; i++) {
      const nx = candX + ((i % 5) - 2) * STEP
      const nz = candZ + (Math.floor(i / 5) % 5 - 2) * STEP
      const normal = terrainSystem.analyticNormal(nx, nz)
      if (normal.y > bestNormalY) {
        bestNormalY = normal.y
        bestX = nx
        bestZ = nz
      }
      if (normal.y > GRADE_THRESHOLD) {
        chosenX = nx
        chosenZ = nz
        found = true
      }
    }
    if (!found) {
      console.warn('[resolveSpawn] No spawn under grade threshold in', MAX_TRIES,
        'tries — using flattest candidate (normal.y =', bestNormalY.toFixed(3) + ')')
      chosenX = bestX
      chosenZ = bestZ
    }
  }

  const surfaceY = terrainSystem ? terrainSystem.analyticHeight(chosenX, chosenZ) : 0
  const heading = ((spawnSeed & 0xFF) / 255) * Math.PI * 2

  return {
    position: new THREE.Vector3(chosenX, surfaceY, chosenZ),
    heading
  }
}

// ── Debounced Path-B rebuild (D-09) ──────────────────────────────────────────────────────
// Fires on coarse/fine/regional slider changes and seed field changes (~150 ms debounce).
// Path B: reinitWorker → rebuildAllChunksFromWorker → re-seat truck at spawn.
// The amplitude slider (Path A: rebuildAllChunks) bypasses this entirely.
// Free-cam keeps flying through a regenerate — only the truck is re-seated (D-15).
let _rebuildDebounceTimer = null
function debouncedRebuildFull () {
  clearTimeout(_rebuildDebounceTimer)
  _rebuildDebounceTimer = setTimeout(() => {
    if (!terrainSystem) return
    terrainSystem.reinitWorker(worldSeed, RANGER_PARAMS)
    terrainSystem.rebuildAllChunksFromWorker()
    // Phase 8: re-init RoadSystem with new seed — roads are pure fns of (worldSeed, coords, params)
    // so a new seed produces a different deterministic road network. Preserve viz state.
    if (roadSystem && scene) {
      const wasVisible = roadSystem._debugVisible
      roadSystem = new RoadSystem(worldSeed, RANGER_PARAMS)
      roadSystem.init(scene)
      // Re-apply the new-API config the initial instance got (surface placement + stream radius).
      roadSystem.setSurfaceSampler((x, z) => terrainSystem.analyticHeight(x, z))
      roadSystem.setRawHeightSampler((x, z) => terrainSystem.rawHeightWorld(x, z))  // CR-01: carve-free sampler for sampleDesignGradeAt
      roadSystem.setRadius(640)
      // Restore viz state — the next roadSystem.update(streamCenter) re-streams the new seed's
      // network and (because _debugVisible is set) rebuilds the centerline lines.
      roadSystem.setDebugVisible(wasVisible)
      // Phase 9 (SURF-01): clear + re-create RoadMeshSystem with the new road system so
      // ribbon tiles rebuild from the new network. Road is a pure fn of (seed, coords, params).
      if (roadMeshSystem) roadMeshSystem.clearAll()
      roadMeshSystem = new RoadMeshSystem(
        scene, roadSystem,
        (x, z) => terrainSystem.analyticHeight(x, z),
        RANGER_PARAMS,
        worldSeed  // D-03: roadQuality determinism
      )
      terrainSystem.setRoadSystem(roadSystem)
    }
    _reseatTruckAtSpawn()
  }, 150)
}

// ── Debounced road surface rebuild (D-04/D-07 — Plan 09-05) ─────────────────────────────────
// Fires on road surface geometry slider changes (roadWidth, crown, camber, carve slopes, etc.)
// Re-bakes carve tables + rebuilds all terrain chunks from Worker + re-sweeps road mesh tiles.
// This is Path B (full Worker round-trip) because carve tables depend on width/slope params
// that affect per-vertex blendW and gradeY — the Worker needs fresh carve tables.
// Pattern: mirrors debouncedRebuildFull — 150ms debounce, same timer convention (D-09).
let _roadSurfaceDebounceTimer = null
function debouncedRoadSurfaceRebuild () {
  clearTimeout(_roadSurfaceDebounceTimer)
  _roadSurfaceDebounceTimer = setTimeout(() => {
    if (!terrainSystem) return
    // Re-bake carve tables by doing a full Worker round-trip (Path B).
    // reinitWorker re-sends init (same seed/noise — no change) and
    // rebuildAllChunksFromWorker disposes all chunks + re-requests them, calling
    // _buildCarveTable again with the updated carve params (roadWidth, slopes, etc.).
    terrainSystem.reinitWorker(worldSeed, RANGER_PARAMS)
    terrainSystem.rebuildAllChunksFromWorker()
    // CR-04 stale-cache fix: drop memoized design-grade entries so the next ribbon sweep
    // recomputes smoothed grade against the new params (crownHeight / terrainAmplitude /
    // camberStrength). Spline objects persist across rebuilds — WeakMap would return stale
    // pre-change profiles without this invalidation call.
    if (roadSystem) roadSystem.invalidateDesignGradeCache()
    // Re-sweep the road ribbon tiles with the updated geometry params.
    if (roadMeshSystem) {
      roadMeshSystem.clearAll()
    }
  }, 150)
}

// ── Debounced road re-route (D-03 / Phase 8) ──────────────────────────────────────────────
// Fires on max-grade / D-09 cost-weight slider changes (~150 ms debounce).
// Pattern: mirrors debouncedRebuildFull — same timer convention (D-09).
// Re-route = invalidateCache (clears this._network + this._tiles + viz lines and marks the network
// dirty) so the next roadSystem.update(streamCenter) re-streams with the new D-09 weights. Roads are
// pure fns of (worldSeed, coords, params) → same seed+params always produces the same route, so the
// re-route is deterministic (D-03). If the viz is currently visible, re-stream once around the active
// view center and rebuild the centerline lines immediately (so a static view updates without waiting
// for the truck/cam to move past the update() move-threshold).
let _roadRebuildDebounceTimer = null
function debouncedRoadRebuild () {
  clearTimeout(_roadRebuildDebounceTimer)
  _roadRebuildDebounceTimer = setTimeout(() => {
    if (!roadSystem) return
    roadSystem.invalidateCache()
    // Phase 9 (SURF-01): clear road ribbon tiles — they rebuild from the new network.
    if (roadMeshSystem) roadMeshSystem.clearAll()
    // ORDER MATTERS (in-sim fix): re-stream the NEW road BEFORE rebuilding the ribbon/carve so
    // both build against the new geometry. Previously the carve rebuilt here while _network was
    // still empty/dirty (invalidateCache cleared it but had not re-streamed), so _buildCarveTable
    // read a stale/empty road → the cuts + foundations lagged the new road position. The re-stream
    // was also gated on _debugVisible, so with the centerline viz OFF the road never re-streamed on
    // a slider change at all. Re-stream first, unconditionally; update() rebuilds viz lines only if
    // visible (internal _debugVisible check), so this is safe regardless of viz state.
    const c = getCameraMode() === 'freecam' ? getFreecamPosition() : vehicleState.position
    roadSystem.update(c)   // re-streams (dirty) + re-slices; rebuilds viz lines only if visible
    // D3 (plan 09-22): the carve footprint bound reads roadMinTurnRadius directly from
    // _roadSystem._params, so a re-route (min-radius change) must also re-bake the carve. Now that
    // the road is re-streamed above, _buildCarveTable reads the NEW road geometry.
    if (terrainSystem) {
      terrainSystem.reinitWorker(worldSeed, RANGER_PARAMS)
      terrainSystem.rebuildAllChunksFromWorker()
    }
  }, 150)
}

// ── _reseatTruckAtSpawn (D-15) ────────────────────────────────────────────────────────────
// Single canonical seat: resolveSpawn → computeStaticEquilibrium → position + heading + zero state.
// Used at: (1) initial load, (2) R-reset, (3) every debounced Path-B regenerate.
// Free-cam position is NOT affected — only vehicleState is modified.
// 3-PLACES NOTE: This plan adds NO new vehicleState fields; all fields below already exist.
function _reseatTruckAtSpawn () {
  const { position: spawnPos, heading } = resolveSpawn(worldSeed, RANGER_PARAMS)
  const eq = computeStaticEquilibrium(RANGER_PARAMS)
  vehicleState.position.set(spawnPos.x, spawnPos.y + eq.bodyY, spawnPos.z)
  vehicleState.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading)
  vehicleState.velocity.set(0, 0, 0)
  vehicleState.angularVelocity.set(0, 0, 0)
  vehicleState.steerAngle    = 0
  vehicleState.throttle      = 0
  vehicleState.brake         = 0
  vehicleState.smoothThrottle = 0
  vehicleState.smoothBrake    = 0
  vehicleState.wheelAngles    = [0, 0, 0, 0]
  vehicleState.wheelSteerAngles = [0, 0, 0, 0]
  vehicleState.wheelDebug     = [ {fn:0,fy:0,sa:0,c:0,omega:0,fz:0}, {fn:0,fy:0,sa:0,c:0,omega:0,fz:0}, {fn:0,fy:0,sa:0,c:0,omega:0,fz:0}, {fn:0,fy:0,sa:0,c:0,omega:0,fz:0} ]
  vehicleState.wheelOmega     = [0, 0, 0, 0]
  vehicleState.slipLong       = [0, 0, 0, 0]
  vehicleState.slipLat        = [0, 0, 0, 0]
  vehicleState.handbrake      = false
  vehicleState.strutComp      = [...eq.strutComp]
  vehicleState.strutCompVel   = [0, 0, 0, 0]
}

// ── Fixed-timestep loop constants (RESEARCH §Pattern 2) ─────────────────────
// PHYSICS_DT: parameterized physics step per D-09. Single source of truth — all downstream
// code reads this constant or params.physicsDt (same value, mirrored in ranger.js for
// suspension.js which cannot import main.js). NEVER use 1/60 or 0.0167 literals below.
const PHYSICS_DT = 1 / 60        // physics step: 16.667ms (D-09)
const MAX_FRAME_TIME = 0.25       // spiral-of-death clamp: 250ms (T-01-04 mitigation)

let simTime = 0  // accumulated simulation time in seconds; incremented by FIXED_DT each physics step

let accumulator = 0

// Subframe render interpolation: track the physics state from immediately before the last step.
// After the accumulator drains, lerp(prevRender, current, accumulator/PHYSICS_DT) eliminates the
// one-frame jitter that occurs when the render loop and physics loop drift in/out of sync.
const _prevRenderPos  = new THREE.Vector3()
const _prevRenderQuat = new THREE.Quaternion()
let currentTime = performance.now() / 1000

// ── Vehicle state placeholder ────────────────────────────────────────────────
// Vehicle state shape — see GLOSSARY.md. Mutated each physics step by Plan 02's
// vehicle.js / physics.js. Wave 1 leaves it static.
// Wheel index convention (GLOSSARY.md §Wheel Index): 0=FL, 1=FR, 2=RL, 3=RR
//
// Phase 4.1: position.y and strutComp[] are set from static equilibrium so the car spawns pre-settled
// with no visible drop. computeStaticEquilibrium() must be called after RANGER_PARAMS is loaded.
const _spawnEq = computeStaticEquilibrium(RANGER_PARAMS)
const vehicleState = {
  position:        new THREE.Vector3(0, _spawnEq.bodyY, 0),
  velocity:        new THREE.Vector3(),
  quaternion:      new THREE.Quaternion(),       // identity — car points down -Z
  angularVelocity: new THREE.Vector3(),
  steerAngle:      0,                             // rad scalar, see GLOSSARY.md §Sign Conventions
  throttle:        0,
  brake:           0,
  smoothThrottle:  0,                             // FEAT-01: ramped throttle accumulator; read+written by updateVehicle
  smoothBrake:     0,                             // FEAT-01: ramped brake accumulator; read+written by updateVehicle
  wheelAngles:     [0, 0, 0, 0],                 // per-wheel spin angle [rad], Plan 03 drives
  wheelSteerAngles: [0, 0, 0, 0],               // Per-wheel Ackermann steer angles [rad]; set by updateVehicle each step; read by stepPhysics for lateral force decomposition.
  // Phase 4.1 strut state (D-01): strut compression and velocity per corner.
  // Initialized to static equilibrium — strutComp ≈ 0.111 m at current params.
  strutComp:    [..._spawnEq.strutComp],  // m   — strut compression per corner (0=FL,1=FR,2=RL,3=RR)
  strutCompVel: [0, 0, 0, 0],            // m/s — strut compression velocity per corner (D-01)
  wheelDebug:      [ {fn:0,fy:0,sa:0,c:0,omega:0,fz:0}, {fn:0,fy:0,sa:0,c:0,omega:0,fz:0}, {fn:0,fy:0,sa:0,c:0,omega:0,fz:0}, {fn:0,fy:0,sa:0,c:0,omega:0,fz:0} ],  // per-wheel debug data written by stepPhysics; read by logger; fz=tire spring force (D-12)
  wheelOmega:      [0, 0, 0, 0],                   // per-wheel angular velocity [rad/s]; integrated by physics.js omega integrator
  handbrake:       false,                            // Space key handbrake state; written by updateVehicle, read by getBrakeTorque
}

// ── Renderer ─────────────────────────────────────────────────────────────────
const canvas = document.querySelector('canvas')
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas })
renderer.setPixelRatio(window.devicePixelRatio)
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true

// ── Camera ───────────────────────────────────────────────────────────────────
// Spring-follow camera managed by src/camera.js (Plan 04). updateCamera() called each frame.
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)

// ── Scene ────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x87ceeb)
scene.fog = new THREE.FogExp2(0x87ceeb, 0.006)

const ambient = new THREE.AmbientLight(0xffffff, 0.6)
scene.add(ambient)

const sun = new THREE.DirectionalLight(0xffffff, 2.2)
sun.position.set(80, 45, 60)
sun.castShadow = true
sun.shadow.mapSize.width  = 2048
sun.shadow.mapSize.height = 2048
sun.shadow.camera.near = 0.5
sun.shadow.camera.far  = 400
sun.shadow.camera.left = sun.shadow.camera.bottom = -150
sun.shadow.camera.right = sun.shadow.camera.top   =  150
scene.add(sun)

// Ground plane (y=0, 200m × 200m)
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshPhongMaterial({ color: 0x222222, depthWrite: false })
)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

// carGroup: parent Object3D for body + wheels — wheels inherit body pitch/roll (Bug 5 fix).
// syncMeshesToState drives carGroup.position and carGroup.quaternion; children follow automatically.
const carGroup = new THREE.Object3D()
scene.add(carGroup)

// ── Vehicle meshes ───────────────────────────────────────────────────────────
// Body: BoxGeometry (width=1.8m, height=0.8m, length=4.6m)
// Body is at carGroup local origin (0,0,0) — carGroup center IS the CG.
const bodyMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1.66, 0.8, 4.6),
  new THREE.MeshStandardMaterial({ color: 0x336699 })
)
bodyMesh.castShadow = true
carGroup.add(bodyMesh)

// Wheels: CylinderGeometry rotated 90° around Z (Pitfall 5 — must do this BEFORE
// instantiating meshes or the spin axis will be wrong).
// Cylinder default = height along Y. After rotateZ(PI/2), height is along X (lateral).
// Wheels then spin around their local X axis, which is the correct lateral roll axis.
const wheelGeom = new THREE.CylinderGeometry(
  RANGER_PARAMS.wheelRadius,  // radiusTop
  RANGER_PARAMS.wheelRadius,  // radiusBottom
  0.25,                       // height (tire width)
  16                          // radialSegments
)
wheelGeom.rotateZ(Math.PI / 2)  // align spin axis — MUST happen before mesh creation

const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 })

// Local-frame offsets for wheel center positions relative to vehicle CG.
// Car forward = -Z (GLOSSARY.md §Coordinate System).
// Front axle is forward (more negative Z); rear axle is behind (more positive Z).
//
// Longitudinal offset from CG:
//   front wheels: +wheelbase * weightRear in -Z direction = -(wheelbase * weightRear)
//   rear wheels:  +wheelbase * weightFront in +Z direction = +(wheelbase * weightFront)
//
// Lateral offset (X):
//   left wheels: -trackFront/2 or -trackRear/2
//   right wheels: +trackFront/2 or +trackRear/2
//
// Vertical: wheel center at y = wheelRadius (tire sits on ground)
const L = RANGER_PARAMS.wheelbase
const wF = RANGER_PARAMS.weightFront
const wR = RANGER_PARAMS.weightRear
const tF = RANGER_PARAMS.trackFront / 2
const tR = RANGER_PARAMS.trackRear / 2
const wr = RANGER_PARAMS.wheelRadius

// Wheel local offsets in carGroup local space (body-relative), indexed 0=FL, 1=FR, 2=RL, 3=RR.
// Y offset: wheel center is wheelRadius above ground; CG is cgHeight above ground.
// So wheel center Y relative to CG = wr - cgHeight (negative — wheels are below CG).
// wheelRadius=0.368, cgHeight=0.55 → Y offset = 0.368 - 0.55 = -0.182 m
const wheelLocalOffsets = [
  new THREE.Vector3(-tF, wr - RANGER_PARAMS.cgHeight, -(L * wR)),  // 0: FL — left, front
  new THREE.Vector3( tF, wr - RANGER_PARAMS.cgHeight, -(L * wR)),  // 1: FR — right, front
  new THREE.Vector3(-tR, wr - RANGER_PARAMS.cgHeight,  (L * wF)),  // 2: RL — left, rear
  new THREE.Vector3( tR, wr - RANGER_PARAMS.cgHeight,  (L * wF)),  // 3: RR — right, rear
]

// NOTE (Phase 4.1): hubYRest removed. Wheel mesh position is now derived from strutComp via
// full world-space hub position inverse-transformed into body-local space (D-07).
// syncMeshesToState below handles this correctly for any body orientation.

const wheelMeshes = wheelLocalOffsets.map((offset, i) => {
  const mesh = new THREE.Mesh(wheelGeom, wheelMat)
  // Wheels are children of carGroup — position is in carGroup local space (body-relative).
  // carGroup carries world position and orientation; wheels follow automatically (Bug 5 fix).
  mesh.position.set(offset.x, offset.y, offset.z)
  mesh.castShadow = true
  carGroup.add(mesh)
  return mesh
})

// ── Mesh sync ────────────────────────────────────────────────────────────────
// Called every render frame to update mesh transforms from vehicleState.
// carGroup carries world position and quaternion — body and wheels inherit it (Bug 5 fix).
// Do NOT use Euler rotation for body orientation (Pitfall 3 / CLAUDE.md).
function syncMeshesToState (state) {
  // Sync carGroup transform — body and wheels inherit this automatically (Bug 5 fix).
  carGroup.position.copy(state.position)
  carGroup.quaternion.copy(state.quaternion)  // quaternion-only rotation, never Euler (GLOSSARY.md)

  // Per-wheel: spin, steer, and hub-Y visual travel in carGroup local space.
  // wheelLocalOffsets[i] provides rest position; Y is overridden each frame by hub deviation.
  for (let i = 0; i < 4; i++) {
    // Spin quaternion: wheel rolling axis is X (geometry was rotateZ(PI/2) at creation).
    const spinQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), state.wheelAngles[i])

    if (i < 2) {
      // Front wheels: combine steer (Y) then spin (X). steerQ.multiply(spinQ) = steerQ * spinQ
      // meaning spinQ is applied first, then steerQ — spin around axle, then yaw the whole assembly.
      const steer  = state.wheelSteerAngles ? state.wheelSteerAngles[i] : state.steerAngle
      const steerQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), steer)
      wheelMeshes[i].quaternion.copy(steerQ).multiply(spinQ)
    } else {
      wheelMeshes[i].quaternion.copy(spinQ)
    }

    // D-07 (Phase 4.1): Derive full hub world position from strutComp, inverse-transform to body-local.
    // Replaces the broken world-ΔY approximation with exact body-space hub position for any orientation.
    {
      const isFrontMesh = i < 2
      const L_S_mesh = isFrontMesh
        ? RANGER_PARAMS.suspensionRestLengthFront
        : RANGER_PARAMS.suspensionRestLengthRear
      const strutComp_i = state.strutComp?.[i] ?? 0
      const strutLen_i  = L_S_mesh - strutComp_i
      const carQ = state.quaternion
      const body_down_mesh = new THREE.Vector3(0, -1, 0).applyQuaternion(carQ)
      // Mount world position: same local offset as suspension.js, rotated into world space
      const mountLocal = wheelLocalOffsets[i].clone()
      // BUG-05: wheelLocalOffsets bakes in (wr − cgHeight) without suspensionBodyOffset. Add it live
      // (read from RANGER_PARAMS so slider drags take effect) so the visual hub mount tracks the
      // physics hub (getWheelPosition, which now includes the offset). Without this, positive offset
      // renders the wheel below the physics hub — it visibly sinks into the ground; negative floats it.
      mountLocal.y += isFrontMesh
        ? (RANGER_PARAMS.suspensionBodyOffsetFront || 0)
        : (RANGER_PARAMS.suspensionBodyOffsetRear || 0)
      const rMount_mesh = mountLocal.clone().applyQuaternion(carQ)
      const mountWorld = new THREE.Vector3(
        state.position.x + rMount_mesh.x,
        state.position.y + rMount_mesh.y,
        state.position.z + rMount_mesh.z
      )
      const hubWorld = new THREE.Vector3(
        mountWorld.x + strutLen_i * body_down_mesh.x,
        mountWorld.y + strutLen_i * body_down_mesh.y,
        mountWorld.z + strutLen_i * body_down_mesh.z
      )
      // Inverse-transform into carGroup local space (carGroup IS the body):
      const hubLocal = hubWorld.clone()
        .sub(state.position)
        .applyQuaternion(carQ.clone().invert())
      wheelMeshes[i].position.copy(hubLocal)
    }
  }
}

// ── Terrain + ramp ────────────────────────────────────────────────────────────
// M1-13: terrain query. Phase 6 replaces body, signature unchanged.
// Freestanding ramp: 10°, 5m rise + 5m underrun, 6m wide, no plateau.
// RAMP_UNDERRUN extends the slope downhill (toward spawn) so the toe is buried underground
// along the ramp direction — not straight down. Toe sits at y ≈ −0.88 m.
// Normal derivation: for a ramp rising in -Z, n = (0, cos(θ), sin(θ)).
const RAMP_ANGLE    = Math.PI / 18   // 10 degrees
const RAMP_LENGTH   = 5              // m — rise section (from ground level to crest)
const RAMP_UNDERRUN = 5              // m — extra slope buried below terrain at the toe end
const RAMP_WIDTH    = 6              // m — collision bounds match mesh width
const RAMP_DEPTH    = 5              // m below toe the collision solid extends (sides + back)
const RAMP_MAX_H    = RAMP_LENGTH * Math.tan(RAMP_ANGLE)  // ≈ 0.88 m — crest height
const RAMP_END_Z    = -20            // m — crest z (top of ramp)
const RAMP_TOE_Z    = RAMP_END_Z + RAMP_LENGTH + RAMP_UNDERRUN  // -10 — toe z (near spawn)
const RAMP_TOE_Y    = -RAMP_UNDERRUN * Math.tan(RAMP_ANGLE)     // ≈ −0.88 m — toe depth

const _rampNormal   = new THREE.Vector3(0, Math.cos(RAMP_ANGLE), Math.sin(RAMP_ANGLE))
const _flatNormal   = new THREE.Vector3(0, 1, 0)

// ── Ramp triangle mesh ────────────────────────────────────────────────────────
// Eight triangles: top incline (2), back wall (2), left side (2), right side (2).
// Toe vertices sit at RAMP_TOE_Y (below terrain); deep vertices extend RAMP_DEPTH further.
const _hw  = RAMP_WIDTH / 2
const _TL  = [-_hw,  RAMP_TOE_Y,           RAMP_TOE_Z]  // toe left
const _TR  = [ _hw,  RAMP_TOE_Y,           RAMP_TOE_Z]  // toe right
const _CL  = [-_hw,  RAMP_MAX_H,           RAMP_END_Z ]  // crest left
const _CR  = [ _hw,  RAMP_MAX_H,           RAMP_END_Z ]  // crest right
const _DTL = [-_hw,  RAMP_TOE_Y - RAMP_DEPTH, RAMP_TOE_Z]  // deep toe left
const _DTR = [ _hw,  RAMP_TOE_Y - RAMP_DEPTH, RAMP_TOE_Z]  // deep toe right
const _DBL = [-_hw, -RAMP_DEPTH,           RAMP_END_Z ]  // deep back left
const _DBR = [ _hw, -RAMP_DEPTH,           RAMP_END_Z ]  // deep back right
const RAMP_TRIS = [
  [_TL,  _TR,  _CR ],  // top incline tri 1
  [_TL,  _CR,  _CL ],  // top incline tri 2
  [_CL,  _CR,  _DBR],  // back wall tri 1
  [_CL,  _DBR, _DBL],  // back wall tri 2
  [_DTL, _TL,  _CL ],  // left side tri 1
  [_DTL, _CL,  _DBL],  // left side tri 2
  [_TR,  _DTR, _DBR],  // right side tri 1
  [_TR,  _DBR, _CR ],  // right side tri 2
]

// M1-13: terrain height-field query. Phase 6 replaces body, signature locked.
function terrain (x, z) {
  if (Math.abs(x) > RAMP_WIDTH / 2) return { height: 0, normal: _flatNormal }
  const distFromCrest = RAMP_END_Z - z  // negative when z > RAMP_END_Z (toward spawn)
  const totalLen = RAMP_LENGTH + RAMP_UNDERRUN
  if (distFromCrest < 0 && -distFromCrest <= totalLen) {
    return { height: RAMP_MAX_H + distFromCrest * Math.tan(RAMP_ANGLE), normal: _rampNormal }
  }
  return { height: 0, normal: _flatNormal }
}
window.terrain = terrain

/**
 * Closest point on a filled triangle ABC to query point P.
 * Algorithm: Ericson "Real-Time Collision Detection" §5.1.5 — barycentric-coordinate clamping.
 * All arithmetic on plain scalars; returns a new THREE.Vector3.
 */
function closestPointOnTriangle (px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  // Edge vectors
  const abx = bx - ax, aby = by - ay, abz = bz - az
  const acx = cx - ax, acy = cy - ay, acz = cz - az

  // P − A
  const apx = px - ax, apy = py - ay, apz = pz - az

  const d1 = abx * apx + aby * apy + abz * apz
  const d2 = acx * apx + acy * apy + acz * apz
  if (d1 <= 0 && d2 <= 0) return new THREE.Vector3(ax, ay, az)  // vertex A

  // P − B
  const bpx = px - bx, bpy = py - by, bpz = pz - bz
  const d3 = abx * bpx + aby * bpy + abz * bpz
  const d4 = acx * bpx + acy * bpy + acz * bpz
  if (d3 >= 0 && d4 <= d3) return new THREE.Vector3(bx, by, bz)  // vertex B

  // P − C
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz
  const d5 = abx * cpx + aby * cpy + abz * cpz
  const d6 = acx * cpx + acy * cpy + acz * cpz
  if (d6 >= 0 && d5 <= d6) return new THREE.Vector3(cx, cy, cz)  // vertex C

  // Edge AB
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3)
    return new THREE.Vector3(ax + v * abx, ay + v * aby, az + v * abz)
  }

  // Edge AC
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6)
    return new THREE.Vector3(ax + w * acx, ay + w * acy, az + w * acz)
  }

  // Edge BC
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6))
    return new THREE.Vector3(bx + w * (cx - bx), by + w * (cy - by), bz + w * (cz - bz))
  }

  // Interior
  const denom = 1 / (va + vb + vc)
  const v = vb * denom, w = vc * denom
  return new THREE.Vector3(ax + v * abx + w * acx, ay + v * aby + w * acy, az + v * abz + w * acz)
}

/**
 * Point (vertex) collision query against all solid geometry using face normals.
 * Unlike queryContacts, this takes a bare point (no radius) and tests it against
 * surface planes directly — returning the face normal, not a sphere-derived normal.
 * Used for body box vertex contacts to eliminate edge/corner normal artifacts.
 * Each contact: normal points away from solid; depth is penetration depth.
 */
function queryVertexContacts (px, py, pz) {
  const hits = []

  // Ground surface — flat y=0 in grid world; analytic terrain height in Sierra world.
  // Grid-world uses flat ground so body vertex contacts are correct on the clean flat plane (D-18).
  const terrainH = _gridWorldActive ? 0 : (terrainSystem ? terrainSystem.analyticHeight(px, pz) : 0)
  if (py < terrainH) {
    const terrainN = _gridWorldActive ? { x: 0, y: 1, z: 0 } : (terrainSystem ? terrainSystem.analyticNormal(px, pz) : { x: 0, y: 1, z: 0 })
    hits.push({ normal: new THREE.Vector3(terrainN.x, terrainN.y, terrainN.z), depth: terrainH - py })
  }

  // Ramp face contacts — skipped when not in grid-world mode (D-19: ramp retired from Sierra world)
  // _gridWorldActive is the authoritative gate; RANGER_PARAMS.rampEnabled is a secondary debug toggle.
  if (_gridWorldActive && RANGER_PARAMS.rampEnabled !== false) {
    // Ramp top incline face — half-space below the inclined plane, within ramp footprint
    if (px >= -_hw && px <= _hw && pz <= RAMP_TOE_Z && pz >= RAMP_END_Z) {
      const rampSurfaceY = RAMP_MAX_H + (RAMP_END_Z - pz) * Math.tan(RAMP_ANGLE)
      const depth = rampSurfaceY - py
      if (depth > 0) {
        hits.push({ normal: _rampNormal.clone(), depth })
      }
    }

    // Ramp back wall — vertical face at RAMP_END_Z, within ramp width and height
    if (px >= -_hw && px <= _hw && pz < RAMP_END_Z && py >= -RAMP_DEPTH && py <= RAMP_MAX_H) {
      const depth = RAMP_END_Z - pz
      if (depth > 0) {
        hits.push({ normal: new THREE.Vector3(0, 0, 1), depth })
      }
    }

    // Ramp left side wall — at x = -_hw, within ramp Z and height
    if (pz <= RAMP_TOE_Z && pz >= RAMP_END_Z && py >= -RAMP_DEPTH && py <= RAMP_MAX_H) {
      const depth = px - (-_hw)
      if (depth < 0) {
        hits.push({ normal: new THREE.Vector3(1, 0, 0), depth: -depth })
      }
    }

    // Ramp right side wall — at x = +_hw
    if (pz <= RAMP_TOE_Z && pz >= RAMP_END_Z && py >= -RAMP_DEPTH && py <= RAMP_MAX_H) {
      const depth = _hw - px
      if (depth < 0) {
        hits.push({ normal: new THREE.Vector3(-1, 0, 0), depth: -depth })
      }
    }
  }

  return hits
}

/**
 * Sphere collision query against all solid geometry.
 * Returns every surface the sphere at (cx,cy,cz) with radius r overlaps.
 * Each contact: normal points away from solid toward sphere; depth is penetration depth.
 * Called by stepPhysics once per wheel each physics step.
 * Phase 6: extend to query the terrain height-field for rough terrain surfaces.
 */
function queryContacts (cx, cy, cz, r) {
  const hits = []

  // Ground surface — flat y=0 in grid world; analytic terrain height in Sierra world.
  // Grid-world uses flat ground so physics contacts are correct on the clean flat plane (D-18).
  const terrainH = _gridWorldActive ? 0 : (terrainSystem ? terrainSystem.analyticHeight(cx, cz) : 0)
  const gd = terrainH + r - cy
  if (gd > 0) {
    const n = _gridWorldActive ? { x: 0, y: 1, z: 0 } : (terrainSystem ? terrainSystem.analyticNormal(cx, cz) : { x: 0, y: 1, z: 0 })
    hits.push({
      normal:       new THREE.Vector3(n.x, n.y, n.z),
      depth:        gd,
      contactPoint: new THREE.Vector3(cx, terrainH, cz)
    })
  }

  // Triangle mesh contacts — skipped when not in grid-world mode (D-19: ramp retired from Sierra world)
  // _gridWorldActive is the authoritative gate; RANGER_PARAMS.rampEnabled is a secondary debug toggle.
  if (_gridWorldActive && RANGER_PARAMS.rampEnabled !== false) {
    for (const [[ax, ay, az], [bx, by, bz], [ex, ey, ez]] of RAMP_TRIS) {
      const cp = closestPointOnTriangle(cx, cy, cz, ax, ay, az, bx, by, bz, ex, ey, ez)
      const dx = cx - cp.x, dy = cy - cp.y, dz = cz - cp.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const depth = r - dist
      if (depth <= 0) continue
      // WR-05: skip degenerate contacts where sphere center lies exactly on the triangle surface.
      // inv = 0 would produce a zero-length normal; applying it gives Fn*zero = no force despite
      // positive depth, allowing the object to penetrate silently. Use triangle face normal as
      // fallback only when we can safely recover it — for now, skip and rely on adjacent contacts.
      if (dist < 1e-8) continue
      const inv = 1 / dist
      hits.push({
        normal: new THREE.Vector3(dx * inv, dy * inv, dz * inv),
        depth,
        contactPoint: cp
      })
    }
  }

  return hits
}

// Ramp visual — inclined PlaneGeometry spanning the full slope (rise + underrun).
// Toe is buried underground (RAMP_TOE_Y < 0); terrain clips the lower section naturally.
const _rampTotalLen = RAMP_LENGTH + RAMP_UNDERRUN
const rampMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(RAMP_WIDTH, _rampTotalLen),
  new THREE.MeshPhongMaterial({ color: 0x8a5030, side: THREE.DoubleSide })
)
rampMesh.rotation.x = -Math.PI / 2 + RAMP_ANGLE
rampMesh.position.set(
  0,
  (RAMP_TOE_Y + RAMP_MAX_H) / 2,
  (RAMP_TOE_Z + RAMP_END_Z) / 2
)
rampMesh.receiveShadow = true
// D-19: ramp is NOT visible in the Sierra terrain world — only in grid world.
// Authoritative gate is _gridWorldActive; debug toggle (RANGER_PARAMS.rampEnabled) is secondary.
rampMesh.visible = false
scene.add(rampMesh)

// FPS tracking — smoothed using an exponential moving average (alpha=0.1).
// Placed here (module scope) so it persists across frames without closure overhead.
let _fpsEma = 60       // initial estimate: 60 fps
let _fpsLastTime = 0   // will be set to currentTime on first frame

// ── Debug panel ──────────────────────────────────────────────────────────────
// D-10: passes mutable RANGER_PARAMS ref so sliders write directly to the object physics.js reads.
// Phase 6 (TERR-06): pass setRampVisible callback so the Ramp Visible toggle in debug.js
// can control rampMesh visibility without requiring debug.js to import rampMesh directly.
// Phase 7 (SEED-04 / D-09): rebuildTerrainFull = Path B debounced rebuild (Worker reinit + re-seat);
//   changeSeed = update worldSeed then fire Path B.
const _gui = initDebug(RANGER_PARAMS, {
  setRampVisible:      (v) => { rampMesh.visible = v },
  rebuildTerrain:      ()  => { if (terrainSystem) terrainSystem.rebuildAllChunks() },
  rebuildTerrainFull:  ()  => debouncedRebuildFull(),
  changeSeed:          (v) => { worldSeed = parseWorldSeed(v); _seedString = String(v); debouncedRebuildFull() },
  // Phase 8 (D-03 / D-05): road viz toggle + D-09 cost-weight param-change debounce.
  // (08-07: proto wiring retired — there is ONE road system + ONE viz now.)
  onRoadVizToggle:     (v) => { if (roadSystem) roadSystem.setDebugVisible(v) },
  onRoadParamChange:   ()  => debouncedRoadRebuild(),
  // Plan 09-05 (D-04/D-07): surface geometry sliders fire a debounced carve+mesh rebuild.
  onRoadSurfaceChange: ()  => debouncedRoadSurfaceRebuild(),
  // Plan 09-10: polygon-offset sliders update the live material without requiring a rebuild.
  // factor/units are written directly to the shared MeshPhongMaterial so the change is
  // visible immediately at the next render frame (needsUpdate = true not required for
  // polygonOffset changes — Three.js checks the values at draw time).
  onRoadMaterialChange: (factor, units) => {
    if (roadMeshSystem) {
      roadMeshSystem._material.polygonOffsetFactor = factor
      roadMeshSystem._material.polygonOffsetUnits  = units
    }
  },
}, { initialSeed: _urlSeed ?? 'lone-pine' })

// ── TerrainSystem (Phase 6 / 7) ──────────────────────────────────────────────
// Instantiated after scene exists. Removes flat ground mesh to prevent Z-fighting.
// Phase 7: pass worldSeed so TerrainSystem initializes seeded noise closures and sends
// the Worker init message before any generate requests. analyticHeight/analyticNormal
// are immediately available after construction (no chunk load required).
perfMark('init: before TerrainSystem')  // TEMP (D-arc) — the ~8s load is one-time init, not the frame loop
terrainSystem = new TerrainSystem(scene, RANGER_PARAMS, worldSeed)
scene.remove(ground)   // Remove flat 200×200 ground mesh — terrain chunks replace it (T-06-06)

// Phase 8 (D-05 / D-07): RoadSystem — instantiated after scene exists.
// init(scene) attaches the scene reference so buildDebugLines() can add debug lines.
// RoadSystem is pure-function-of-(worldSeed, coords, params) — the tile cache is memoization
// only; same seed always produces the same roads.
roadSystem = new RoadSystem(worldSeed, RANGER_PARAMS)
roadSystem.init(scene)
// Place the centerline viz on the rendered terrain surface, and stream the valley-trunk
// network at roughly the terrain view radius (08-07: setRadius replaces the retired setProtoRadius).
roadSystem.setSurfaceSampler((x, z) => terrainSystem.analyticHeight(x, z))
roadSystem.setRawHeightSampler((x, z) => terrainSystem.rawHeightWorld(x, z))  // CR-01: carve-free sampler for sampleDesignGradeAt
roadSystem.setRadius(640)

// Phase 9 (SURF-01 / SURF-03): RoadMeshSystem — ribbon mesh sweep with crown + camber.
// Constructed after both terrainSystem and roadSystem exist.
// setRoadSystem() wires the carve hook in analyticHeight so physics feels the road surface.
terrainSystem.setRoadSystem(roadSystem)
roadMeshSystem = new RoadMeshSystem(
  scene, roadSystem,
  (x, z) => terrainSystem.rawHeightWorld(x, z),  // CR-04: carve-free — no crown/camber/pothole baked into design-grade window
  RANGER_PARAMS,
  worldSeed  // D-03: roadQuality determinism requires the world seed
)

// Phase 7 (D-14/15/16): initial-load seat via canonical resolveSpawn + analyticHeight ground-probe.
// TerrainSystem is now alive and analyticHeight is immediately available (no chunk load required).
// This overrides the vehicleState.position set during declaration (which used origin + _spawnEq.bodyY).
perfMark('init: systems created, before spawn reseat')  // TEMP (D-arc)
_reseatTruckAtSpawn()
perfMark('init: spawn reseated')  // TEMP (D-arc)

// ── Body contact point debug spheres ──────────────────────────────────────────
// 14 translucent orange spheres — one per probe in getBodyContactPoints.
// Toggled with backtick alongside the rest of the debug overlay.
const _dbgSphereMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.45, depthWrite: false })
const _dbgSphereGeo = new THREE.SphereGeometry(RANGER_PARAMS.bodyContactRadius, 8, 6)
const BODY_CONTACT_COUNT = 14
const _dbgSpheres = Array.from({ length: BODY_CONTACT_COUNT }, () => {
  const m = new THREE.Mesh(_dbgSphereGeo, _dbgSphereMat)
  m.visible = false
  scene.add(m)
  return m
})
let _dbgSpheresOn = false
document.addEventListener('keydown', e => {
  if (e.key === '`') {
    _dbgSpheresOn = !_dbgSpheresOn
    _dbgSpheres.forEach(m => { m.visible = _dbgSpheresOn })
  }
})

// ── Grid-world flat grid helper (D-18) ────────────────────────────────────────
// A THREE.GridHelper at y=0 — shown only in grid-world mode. The grid recenters on the
// view each frame (snapped to cell size) so it reads as INFINITE while driving (see loop).
// 5 m cells; bright lines on a near-black ground for high contrast while tuning.
const GRID_WORLD_SIZE = 1000       // m span; large enough that the snapped follow never shows an edge
const GRID_WORLD_DIVISIONS = 200   // → 5 m cells
const _gridHelper = new THREE.GridHelper(GRID_WORLD_SIZE, GRID_WORLD_DIVISIONS, 0xc8c8c8, 0x707070)
_gridHelper.visible = false
scene.add(_gridHelper)

// ── Grid-world: flat ground plane ────────────────────────────────────────────
// A white-ish flat plane at y=0 — provides collision surface in grid world
// (analyticHeight returns real terrain height; a flat plane at 0 keeps the truck grounded
// when terrain streaming is paused and the terrain height is well above origin).
// In grid world the car is placed at origin where analyticHeight ≈ valid terrain level,
// but since grid world uses the ANALYTIC height at (0,0), it is always grounded correctly.
// No separate flat plane physics is needed — analyticHeight always returns the correct surface.
// This plane is visual only: adds a visible ground surface reference.
const _gridGroundPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(GRID_WORLD_SIZE * 2, GRID_WORLD_SIZE * 2),
  new THREE.MeshPhongMaterial({ color: 0x141414 })  // near-black so the bright grid lines pop
)
_gridGroundPlane.rotation.x = -Math.PI / 2
_gridGroundPlane.receiveShadow = true
_gridGroundPlane.visible = false
scene.add(_gridGroundPlane)

// ── enterGridWorld / returnToWorld (D-17 / D-18 / D-19) ─────────────────────
// enterGridWorld: pause streaming, hide Sierra chunks, show flat grid + ramp,
//   place car at origin on flat ground.
// returnToWorld: hide flat grid + ramp, re-enable streaming, show Sierra chunks,
//   re-seat truck at canonical spawn via _reseatTruckAtSpawn().
// Physics loop is NOT frozen — truck continues to settle while menu is open or
// after teleport (CAM-02 spirit; RESEARCH §Pause Menu).

function enterGridWorld () {
  _gridWorldActive = true

  // Pause terrain streaming and hide Sierra chunks
  if (terrainSystem) {
    terrainSystem.setEnabled(false)
    terrainSystem.setChunksVisible(false)
  }

  // Show flat grid and ground plane
  _gridHelper.visible = true
  _gridGroundPlane.visible = true

  // Show ramp rig (D-19: ramp lives in grid world, not Sierra world)
  rampMesh.visible = RANGER_PARAMS.rampEnabled !== false

  // Place car at origin at static-equilibrium height above y=0 flat ground
  // Grid world y=0 is flat; computeStaticEquilibrium gives the correct body height.
  const eq = computeStaticEquilibrium(RANGER_PARAMS)
  vehicleState.position.set(0, eq.bodyY, 0)
  vehicleState.quaternion.identity()
  vehicleState.velocity.set(0, 0, 0)
  vehicleState.angularVelocity.set(0, 0, 0)
  vehicleState.steerAngle     = 0
  vehicleState.throttle       = 0
  vehicleState.brake          = 0
  vehicleState.smoothThrottle = 0
  vehicleState.smoothBrake    = 0
  vehicleState.wheelAngles    = [0, 0, 0, 0]
  vehicleState.wheelSteerAngles = [0, 0, 0, 0]
  vehicleState.strutComp      = [...eq.strutComp]
  vehicleState.strutCompVel   = [0, 0, 0, 0]
  vehicleState.wheelDebug     = [ {fn:0,fy:0,sa:0,c:0,omega:0,fz:0}, {fn:0,fy:0,sa:0,c:0,omega:0,fz:0}, {fn:0,fy:0,sa:0,c:0,omega:0,fz:0}, {fn:0,fy:0,sa:0,c:0,omega:0,fz:0} ]
  vehicleState.wheelOmega     = [0, 0, 0, 0]
  vehicleState.slipLong       = [0, 0, 0, 0]
  vehicleState.slipLat        = [0, 0, 0, 0]
  vehicleState.handbrake      = false

  _hidePauseMenu()
}

function returnToWorld () {
  _gridWorldActive = false

  // Hide flat grid and ramp
  _gridHelper.visible = false
  _gridGroundPlane.visible = false
  rampMesh.visible = false

  // Re-enable terrain streaming and show Sierra chunks
  if (terrainSystem) {
    terrainSystem.setEnabled(true)
    terrainSystem.setChunksVisible(true)
  }

  // Re-seat truck at canonical spawn (Plan 04 — resolveSpawn + analyticHeight ground-probe)
  _reseatTruckAtSpawn()

  _hidePauseMenu()
}

// ── Pause-menu helpers ────────────────────────────────────────────────────────
function _showPauseMenu () {
  const el = document.getElementById('pause-menu')
  if (el) el.style.display = 'flex'
}

function _hidePauseMenu () {
  const el = document.getElementById('pause-menu')
  if (el) el.style.display = 'none'
}

// Wire pause-menu buttons. Null-guarded (?.) like every other DOM lookup in this file:
// an unguarded deref would throw at module-eval and abort the whole sim if an id is
// renamed/removed from index.html (WR-04).
document.getElementById('pm-resume')?.addEventListener('click', () => _hidePauseMenu())
document.getElementById('pm-grid')?.addEventListener('click', () => enterGridWorld())
document.getElementById('pm-return')?.addEventListener('click', () => returnToWorld())

// ── Esc handler — pause menu (D-17 / RESEARCH §Pitfall 3) ────────────────────
// Gate: only open the menu when NOT in free-cam mode.
// In free-cam, Esc triggers a browser-forced pointer-lock release first; opening the
// menu on the same Esc event causes an immediate flash-open/close. The user must press C
// to exit free-cam, then Esc to open the menu from chase/cockpit mode.
// (RESEARCH §Pitfall 3 / 07-PATTERNS.md §Esc/keyboard listener coexistence)
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return
  if (getCameraMode() !== 'freecam') {  // gate: only open menu when NOT in free-cam (Pitfall 3)
    const el = document.getElementById('pause-menu')
    if (!el) return
    if (el.style.display === 'none' || el.style.display === '') {
      _showPauseMenu()
    } else {
      _hidePauseMenu()
    }
  }
})

// ── Logger key bindings (D-03 / D-02) ────────────────────────────────────────
// \ toggles frame recording; Ctrl+I opens the initial condition file picker.
// Capture context provider (Phase 4/5): supplies world + stream-history so the \ recorder writes a
// replayable kind:"event" capture on stop (see logger._downloadLog).
setCaptureContext(() => ({
  worldSeed,
  seedString:          _seedString,
  params:              RANGER_PARAMS,
  streamCenterHistory: _streamCenterRing.slice(),
}))

// Download a JS object as a timestamped JSON file (capture export).
function _downloadJSON (obj, name) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url; a.download = name
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  } finally { URL.revokeObjectURL(url) }
}

document.addEventListener('keydown', e => {
  if (e.key === '\\') toggleRecording()
  if (e.key === 'i' && e.ctrlKey) openInitialCondition(vehicleState, RANGER_PARAMS)
  // 'p' = MARK THIS PLACE: write a kind:"place" capture at the truck — the replayable spatial bug
  // report (kink / fold / grade / tear). test/replay.mjs rebuilds the road here from seed+params and
  // diffs what the game observed. Supersedes the old road-run-dump (geometry lives in the capture).
  if (e.key === 'p' && roadSystem && !_gridWorldActive) {
    const px = vehicleState.position.x, pz = vehicleState.position.z
    // Optional terrain side of `observed` (verified once terrain-headless lands, Phase 5).
    let terrainSample = null
    if (terrainSystem) {
      const wheelGroundY = []
      for (let i = 0; i < 4; i++) { const hub = getWheelPosition(i, vehicleState, RANGER_PARAMS); wheelGroundY.push(terrainSystem.analyticHeight(hub.x, hub.z)) }
      terrainSample = { groundY: terrainSystem.analyticHeight(px, pz), wheelGroundY }
    }
    const capture = buildPlaceCapture({
      roadSystem, worldSeed, seedString: _seedString, params: RANGER_PARAMS,
      mark: { x: px, z: pz }, streamCenterHistory: _streamCenterRing.slice(), terrainSample,
    })
    _downloadJSON(capture, 'rangersim-capture-' + Date.now() + '.json')
    console.log(`[capture] place @(${px.toFixed(1)},${pz.toFixed(1)}) run ${capture.place.observed.runKey} gradeY ${capture.place.observed.gradeY?.toFixed(2)} minR ${capture.place.observed.minRadius?.toFixed(1)}`)
  }
})

// ── Game loop ─────────────────────────────────────────────────────────────────
// Fixed-timestep accumulator (RESEARCH §Pattern 2, gafferongames.com/post/fix_your_timestep/)
// FIXED_DT = 1/60s; MAX_FRAME_TIME = 0.25s (T-01-04: spiral-of-death mitigation)
function loop () {
  requestAnimationFrame(loop)
  if (!_firstFrameMarked) { _firstFrameMarked = true; perfMark('first animate frame') }  // TEMP (D-arc)

  const newTime = performance.now() / 1000
  let frameTime = newTime - currentTime
  currentTime = newTime

  // Clamp: prevents catch-up loop when tab was hidden or frame spiked (T-01-04)
  if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME

  // FPS EMA — smooth the per-frame time to avoid noisy readout.
  // alpha=0.1 gives ~1s smoothing window at 60 fps (10 frames half-life).
  // Guard: skip first frame where _fpsLastTime=0 (frameTime would be garbage).
  if (_fpsLastTime > 0 && frameTime > 0) {
    const instantFps = 1 / frameTime
    _fpsEma = _fpsEma * 0.9 + instantFps * 0.1
  }
  _fpsLastTime = newTime

  accumulator += frameTime

  while (accumulator >= PHYSICS_DT) {
    // Terrain stub call retained for M1-13 verification (Phase 6 replaces body, not call site).
    const _surface = terrain(vehicleState.position.x, vehicleState.position.z)  // eslint-disable-line no-unused-vars

    const resetRequested = updateVehicle(vehicleState, RANGER_PARAMS, PHYSICS_DT)
    if (resetRequested) {
      // R re-seats the truck to a driveable state ONLY — it does NOT touch any tunable
      // params or slider values. All tuning (vehicle AND terrain) stays exactly as set;
      // a full page reload is the only way to revert params to file defaults.
      // Phase 7 (D-15): canonical re-seat via resolveSpawn + analyticHeight ground-probe.
      // _reseatTruckAtSpawn() replaces the former inline reset block — picks a low-slope spawn
      // using the current worldSeed, seats at static equilibrium height, zeros all motion.
      _reseatTruckAtSpawn()
    }

    _prevRenderPos.copy(vehicleState.position)
    _prevRenderQuat.copy(vehicleState.quaternion)
    stepPhysics(vehicleState, RANGER_PARAMS, PHYSICS_DT, queryContacts, queryVertexContacts)
    simTime += PHYSICS_DT
    // BUG-12 diagnostic (open): while recording, log the truck run's local centerline turn radius
    // to localize ribbon folds. Gated on isRecording() so normal play pays nothing (queryNearest
    // scans a 3×3 tile block). The post-hoc road-resolution path lives in test/replay.mjs.
    let roadDebug = null
    if (isRecording() && roadSystem && !_gridWorldActive) {
      const px = vehicleState.position.x, pz = vehicleState.position.z
      roadDebug = { minR: roadSystem.debugSampleAt(px, pz).minR }
    }
    captureFrame(simTime, vehicleState, vehicleState.wheelDebug, roadDebug)
    accumulator -= PHYSICS_DT
  }

  // Interpolate rendered position/quaternion between the last two physics steps.
  // accumulator is the residual time since the last step; alpha=0 → last step, alpha→1 → next step.
  const _renderAlpha = accumulator / PHYSICS_DT
  const _renderPos   = _prevRenderPos.clone().lerp(vehicleState.position, _renderAlpha)
  const _renderQuat  = _prevRenderQuat.clone().slerp(vehicleState.quaternion, _renderAlpha)

  // Temporarily substitute interpolated pos/quat so meshes and camera both render at subframe time.
  const _physPos  = vehicleState.position
  const _physQuat = vehicleState.quaternion
  vehicleState.position  = _renderPos
  vehicleState.quaternion = _renderQuat

  syncMeshesToState(vehicleState)

  // Phase 6: update terrain chunk ring each render frame (outside physics accumulator).
  // ground.position.x/z snapping removed — ground mesh removed; terrain chunks replace it.
  // Phase 7 D-21: while free-cam is active, stream chunks around the camera, not the truck.
  // Reverts to truck position on exit so the ring stays anchored to the car in normal mode.
  const streamCenter = getCameraMode() === 'freecam' ? getFreecamPosition() : vehicleState.position
  _trackStreamCenter(simTime, streamCenter.x, streamCenter.z)   // capture ring (Phase 4/5)
  let _pt = performance.now()
  terrainSystem.update(streamCenter)
  perfAdd('frame.terrain.update', performance.now() - _pt)
  // Phase 8: stream the valley-trunk network around the same center as terrain (08-07: the
  // unified update() replaces the retired updateProto — streams + slices + redraws viz if visible).
  _pt = performance.now()
  if (roadSystem) roadSystem.update(streamCenter)
  perfAdd('frame.road.update', performance.now() - _pt)
  // Phase 9 (SURF-01): sync road ribbon tiles with the active terrain chunk ring.
  // syncToChunkRing enqueues new tiles and disposes evicted ones co-located with chunk lifetime.
  // flushPendingQueue builds up to MAX_ROAD_BUILDS_PER_FRAME tiles per frame.
  if (roadMeshSystem && terrainSystem) {
    _pt = performance.now()
    roadMeshSystem.syncToChunkRing(terrainSystem.getActiveChunkKeys())
    perfAdd('frame.ribbon.sync', performance.now() - _pt)
    _pt = performance.now()
    roadMeshSystem.flushPendingQueue()
    perfAdd('frame.ribbon.flush', performance.now() - _pt)
  }
  // TEMP (D-arc): auto-dump the perf profile at ~load (frame 180 ≈ 3s) and steady-state (frame 600).
  _perfFrame++
  if (_perfFrame === 180) { perfDump('load ~3s'); perfReset() }
  else if (_perfFrame === 600) { perfDump('steady ~10s') }

  // Grid world: recenter the dev grid + ground on the view each frame so they read as
  // infinite. The grid snaps to the cell size so its lines appear stationary (no crawling);
  // the ground plane follows continuously so its edges never enter view.
  if (_gridWorldActive) {
    const cell = GRID_WORLD_SIZE / GRID_WORLD_DIVISIONS
    _gridHelper.position.set(Math.round(streamCenter.x / cell) * cell, 0, Math.round(streamCenter.z / cell) * cell)
    _gridGroundPlane.position.set(streamCenter.x, 0, streamCenter.z)
  }

  // M1-11: live speed readout. velocity.length() = magnitude in m/s; * 3.6 converts to km/h.
  const speedKmh = vehicleState.velocity.length() * 3.6
  document.getElementById('speedVal').textContent = speedKmh.toFixed(1)

  // M4-09 / D-12: per-wheel Fz HUD — tire spring force per corner, updated each render frame.
  // Uses ?. / ?? 0 nullish-default per PATTERNS §Logger field append-at-end + nullish-coalesce.
  // toFixed(0) = whole newtons (Fz is in thousands; decimals add noise).
  document.getElementById('flFzVal').textContent = (vehicleState.wheelDebug[0]?.fz ?? 0).toFixed(0)
  document.getElementById('frFzVal').textContent = (vehicleState.wheelDebug[1]?.fz ?? 0).toFixed(0)
  document.getElementById('rlFzVal').textContent = (vehicleState.wheelDebug[2]?.fz ?? 0).toFixed(0)
  document.getElementById('rrFzVal').textContent = (vehicleState.wheelDebug[3]?.fz ?? 0).toFixed(0)

  // M3-07: front slip velocity HUD — sa field stores slip-velocity magnitude in m/s (not slip angle).
  // See physics.js: "sa field now stores SLIP VELOCITY magnitude (m/s) instead of slip angle (rad)".
  // Thresholds: ~0.5 m/s = light slip (green), ~1.5 m/s = heavy slip (red).
  const slipMps = (vehicleState.wheelDebug?.[0]?.sa || 0)
  const slipEl = document.getElementById('slipVal')
  if (slipEl) {
    slipEl.textContent = slipMps.toFixed(2) + ' m/s'
    slipEl.style.color = slipMps < 0.5 ? '#00ff88' : slipMps < 1.5 ? '#ffaa00' : '#ff2222'
  }

  // M3-08: throttle and brake percentage HUD
  const thrEl = document.getElementById('thrVal')
  if (thrEl) thrEl.textContent = (vehicleState.throttle * 100).toFixed(0)
  const brkEl = document.getElementById('brkVal')
  if (brkEl) brkEl.textContent = (vehicleState.brake * 100).toFixed(0)

  // FPS HUD
  const fpsEl = document.getElementById('fpsVal')
  if (fpsEl) fpsEl.textContent = Math.round(_fpsEma)

  // M3-09: Pacejka curve plot — called once per render frame OUTSIDE the fixed accumulator (constraint #10)
  updatePacejkaCurve(vehicleState, RANGER_PARAMS)

  // D-13: 4-corner travel bar visualization — called once per render frame, outside accumulator.
  // Reflects most recent strutComp state (written by stepPhysics via wheelDebug each step).
  updateTravelBars(vehicleState, RANGER_PARAMS)
  updateSlipVectors(vehicleState)

  updateCamera(camera, vehicleState, frameTime)

  // Restore physics position/quaternion — the interpolated copies were render-only.
  vehicleState.position  = _physPos
  vehicleState.quaternion = _physQuat

  // Update body contact debug spheres (only when visible — cheap early-out)
  if (_dbgSpheresOn) {
    RANGER_PARAMS._rotateVector = (v) => new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(vehicleState.quaternion)
    const pts = getBodyContactPoints(vehicleState, RANGER_PARAMS)
    pts.forEach((pt, i) => { if (_dbgSpheres[i]) _dbgSpheres[i].position.set(pt.x, pt.y, pt.z) })
  }

  const _ptR = performance.now()
  renderer.render(scene, camera)
  perfAdd('frame.render', performance.now() - _ptR)  // TEMP: the ~8.5s uninstrumented load cost suspect
}

perfMark('init: synchronous bootstrap done, requesting first frame')  // TEMP (D-arc)
requestAnimationFrame(loop)

// ── Resize handler ───────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
