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
import { updateVehicle, setLaunchHold, setControlAttenuation, SPAWN_STATE } from './vehicle.js'
import { updateCamera, getCameraMode, getFreecamPosition, getFreecamYaw, exitFreecam, placeFreecam } from './camera.js'
// Dev handle (mirrors window.terrain / window.sky): jump the freecam to a spot for visual troubleshooting.
// window.__view(x, y, z, yaw, pitch) — used by test/screenshot.mjs (headless CDP) and the browser console.
window.__view = placeFreecam
// PERF-07 measurement handles (lazy getters — survive seed rebuilds): the headless CDP perf
// harness toggles prop shadow casting and reads renderer.info through these.
window.__props = () => propSystem
window.__renderer = () => renderer
import { initDebug, updatePacejkaCurve, updateTravelBars, updateSlipVectors, setDebugLockout } from './debug.js'
import { captureFrame, toggleRecording, openInitialCondition, isRecording, setCaptureContext } from './logger.js'
import { buildPlaceCapture } from './capture.js'
import { ensureEngineAudio, updateEngineAudio, setEngineAudioEnabled, setEngineAudioVolume, setAudioPageActive } from './engine-audio.js'
import { ensureTireAudio, updateTireAudio, setTireAudioEnabled, setTireAudioVolumes } from './tire-audio.js'
import { ensureWindAudio, updateWindAudio, setWindAudioEnabled, setWindAudioVolume } from './wind-audio.js'
import { TerrainSystem } from './terrain.js'
import { RoadSystem, CHUNK_SIZE } from './road.js'
import { perfAdd, perfMark, perfDump, perfReset, perfSnapshot, perfEnableUserTiming, perfFrameDt,
         perfEnableHitchLog, perfFrameBegin, perfFrameEnd, perfHitchReport, perfHitchDump, perfHitchReset, perfEvent } from './perf.js'  // TEMP perf triage (D-arc / PERF-08 / PERF-26)
let _perfFrame = 0  // TEMP: frame counter for auto-dump at load
let _firstFrameMarked = false  // TEMP: mark the first animate frame to isolate init vs loop time
import { RoadMeshSystem } from './road-mesh.js'
import { DustSystem } from './dust.js'
import { TireSmokeSystem } from './smoke.js'
import { DirtSpraySystem } from './dirt-spray.js'
import { SkySystem } from './sky.js'                        // QUAL-02: atmospheric skybox + sun-driven lighting
import { parseWorldSeed, seedFor } from './seed.js'
import { createVehicleModel } from './vehicle-model.js'
import { Map2D } from './map2d.js'                       // FEAT-16: 2D top-down map dev/validation overlay
import { MissionSystem, MISSION_PLAN_RADIUS, PLAN_RESTREAM_MOVE } from './mission.js'  // story mode (beta)
import { LabSystem } from './lab.js'                     // FEAT-31: isolated flat testing lab + timing gates
import { StorySystem } from './story.js'                 // FEAT-43: sandboxed Story Mode gamemode (seed entry + frozen region)
import { PoiSystem, POI_PARAMS } from './poi.js'         // FEAT-46: story-mode POIs on lay-by pads
import { DaySystem } from './day.js'                     // FEAT-47: story-mode day clock (drives the sky)
import { CampSystem } from './camp.js'                   // FEAT-45: story-mode dispersed-camping zones
import { GpsSystem, addGpsGui } from './gps.js'          // FEAT-39: GPS assist (in-world route arrows)
import { formatTime } from './par.js'                    // FEAT-29: par oracle time formatting
import { RoadRouteWorker } from './road-worker.js'       // QUAL-08: dedicated road-network routing Worker
import { PropSystem } from './props/prop-system.js'        // FEAT-06: procedural trees/rocks/bushes
import { ShadowBakeSystem, ATLAS_N, TILE_PX, shearFromSun } from './props/prop-shadow-bake.js'  // PERF-07: baked prop-shadow atlas
import { installShadowEdgeFade } from './shadow-fade.js'   // QUAL-18: soft realtime shadow-map edge
import { addPropGui } from './props/prop-debug.js'         // FEAT-06: live tuning folder (self-contained)
import { FLORA_PARAMS } from '../data/flora.js'
import { WaterSystem } from './water.js'                   // FEAT-22/17/18: ponds + streams detection (leaf, injected heightFn)
import { loadBundledRouteCache, loadRegionRouteCache } from './route-store.js'  // QUAL-14/PERF-26: bundled route caches (BASE at boot, REGION lazily)
import { WaterRenderer } from './water-render.js'          // FEAT-17/18: pond discs + stream ribbons

// World seed — parsed from URL ?seed= parameter, defaulting to '6'.
// Plan 04: changed to `let` so debug panel seed field can mutate it (SEED-04).
// Refreshing the same ?seed= URL reproduces the same terrain (SEED-01/03).
const _urlParams = new URLSearchParams(window.location.search)
const _urlSeed = _urlParams.get('seed')
// PERF-08 harness flags: ?prof=1 exposes the window.__q/__ri/__perfData/__lever dev handles +
// mirrors perf buckets into performance.measure (trace user_timing). ?noaa=1 disables MSAA at
// renderer construction (AA can't toggle live — context creation flag). Both are TEMP, removed
// with src/perf.js when PERF-04 resolves. Zero cost when absent.
const _PROF = _urlParams.get('prof') === '1'
const _NOAA = _urlParams.get('noaa') === '1'
if (_PROF) perfEnableUserTiming()
// PERF-26: ?hitch=<ms> turns on per-frame hitch attribution at that frame-period threshold (?hitch=1
// takes the default 24 ms). Independent of ?prof so it can be left on during ordinary play — the only
// per-frame cost is two Map writes. ?prof=1 implies it. Read back with __hitchDump() / __hitches().
const _hitchArg = _urlParams.get('hitch')
const _HITCH = _hitchArg !== null || _PROF
if (_HITCH) perfEnableHitchLog(Number(_hitchArg) > 1 ? Number(_hitchArg) : 24)
let worldSeed = parseWorldSeed(_urlSeed ?? '6')
let _seedString = _urlSeed ?? '6'   // current seed STRING (reference for captures; numeric worldSeed drives repro)

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

// FEAT-06: PropSystem — procedural trees/rocks/bushes. Decoupled from road/terrain; we inject the
// real samplers at construction. The factory reads the module-scope terrain/road systems at CALL
// time, so it stays correct across the seed-rebuild reassignment below. _propRing ≤ terrain ring.
let propSystem = null
// PERF-06: prop render radius in chunks — written by applyQuality (Low=1, Normal/High=2, Ultra=3),
// read by the frame loop's propSystem.update(). Mutable so the Quality selector can thin out props.
let _propRing = 2
// PERF-21: billboard-only outer prop ring (trees-as-impostors out to the built terrain edge).
let _bbRing = 3

// FEAT-22/17/18: WaterSystem (pond/stream detection over RAW carve-free height) + its renderer.
// Like props: decoupled leaves, samplers injected at construction, rebuilt on seed change.
let waterSystem = null
let waterRenderer = null
// BUG-32: water render bbox tracks the TERRAIN draw distance (ring × 64 m chunks + one chunk
// of margin) instead of a fixed 640 m — unclipped ribbons used to hang in the void past the
// loaded terrain. Reads the live ring so quality-preset changes (applyQuality → setRingRadius)
// take effect on the next sync.
const waterSyncRadius = () => ((terrainSystem?._ringRadius ?? 2) + 1) * 64
function rebuildWaterSystem () {
  if (waterRenderer) { scene.remove(waterRenderer.group); waterRenderer.dispose() }
  // rawHeightWorld (carve-free), NOT analyticHeight — detection was gated against raw height;
  // carve-baked height would drift pond levels off the rendered terrain surface.
  waterSystem   = new WaterSystem(worldSeed, RANGER_PARAMS, (x, z) => terrainSystem.rawHeightWorld(x, z))
  // BUG-33: the renderer suppresses ribbon spans whose water level would stand above the
  // COMPOSED driving surface (road decks/pads pulled through the channel) — inject the same
  // physics surface the wheels ride. Safe ordering: the frame loop streams the road network
  // (roadSystem.update) before waterRenderer.sync, so any window the ribbons build against
  // already has its roads streamed.
  waterRenderer = new WaterRenderer(waterSystem, {
    groundAt: (x, z) => terrainSystem.analyticHeight(x, z),
    // Road-carve blend at a point (0 = no road). Reads module-scope roadSystem at call time
    // (same convention as makePropSamplers) so it survives seed rebuilds without re-injection.
    roadBlendAt: (x, z) => roadSystem
      ? (roadSystem._sampleCarveWorld(x, z, terrainSystem.rawHeightWorld(x, z))?.blendW ?? 0)
      : 0,
  })
  scene.add(waterRenderer.group)
  // FEAT-17: roads route AROUND ponds — inject the water no-go into the (current) RoadSystem as pure
  // queries/data; road.js never imports water.js. Called here so BOTH the initial wiring and every
  // seed rebuild re-inject into the fresh instances (the debounced rebuild recreates roadSystem
  // BEFORE this runs). Must precede the first roadSystem.update() so the network never streams
  // pond-crossing edges. Deterministic: both fns are pure in (seed, coords, params).
  // Closures read module-scope waterSystem at CALL time (same convention as makePropSamplers), so
  // they survive water rebuilds without re-injection.
  const waterNoGoFn = (x, z) => waterSystem.isRoadNoGo(x, z)
  const pondDiscsFn = (minX, minZ, maxX, maxZ) => {
    const discs = []
    for (const p of waterSystem.pondsNear(minX, minZ, maxX, maxZ)) {
      discs.push(p.floorX, p.floorZ, p.radius + p.skirt)
    }
    return discs
  }
  if (roadSystem) roadSystem.setWaterNoGo(waterNoGoFn, pondDiscsFn)
  // The map's own read-only RoadSystem must route with the identical exclusion (it validates the
  // network the player drives).
  map2d.setWaterNoGo(waterNoGoFn, pondDiscsFn)
  // Same for the story-mode mission planner: it proposes routes the player then drives, so it has
  // to route around exactly the same ponds. Stashed because the planner is built lazily.
  _waterNoGoFns = [waterNoGoFn, pondDiscsFn]
  missionSystem?.invalidatePlan()
  // FEAT-18: stream channels carve the terrain (bed + banks) — inject the pure sampler into the
  // terrain height paths (see terrain.setWaterCarve for the composition + bridge-deck rule).
  // sampleAt keeps a 1-entry windowed stream cache: physics contact queries are spatially coherent,
  // so the common case is a few bbox compares (window-invariance makes the cache safe — any window
  // covering the point yields identical streams; refetch triggers well before the pad could clip).
  const _wcWin = { x0: 0, z0: 0, x1: 0, z1: 0, streams: null }
  const WC_FETCH_R = 512, WC_EDGE = 64
  terrainSystem.setWaterCarve({
    streamsNear: (x0, z0, x1, z1) => waterSystem.streamsInBBox(x0, z0, x1, z1),
    // FEAT-24: widest possible channel half-width + bank — the stream-table fetch pad bound.
    maxReach: () => {
      const k = waterSystem.k
      return k.streamWidth * Math.max(k.widthFlatScale ?? 1, 1) + k.streamBankWidth
    },
    sampleAt: (x, z, streams, raw) => {
      let list = streams
      if (!list) {
        if (!_wcWin.streams ||
            x < _wcWin.x0 + WC_EDGE || x > _wcWin.x1 - WC_EDGE ||
            z < _wcWin.z0 + WC_EDGE || z > _wcWin.z1 - WC_EDGE) {
          _wcWin.x0 = x - WC_FETCH_R; _wcWin.z0 = z - WC_FETCH_R
          _wcWin.x1 = x + WC_FETCH_R; _wcWin.z1 = z + WC_FETCH_R
          _wcWin.streams = waterSystem.streamsInBBox(_wcWin.x0, _wcWin.z0, _wcWin.x1, _wcWin.z1)
        }
        list = _wcWin.streams
      }
      return waterSystem.streamCarveSample(x, z, list, raw)
    },
  })
}
const _bushDragF = { x: 0, y: 0, z: 0 }   // FEAT-06b: reused bush soft-drag accumulator (no per-substep alloc)
const makePropSamplers = () => ({
  heightAt:    (x, z) => terrainSystem.analyticHeight(x, z),
  normalAt:    (x, z) => terrainSystem.analyticNormal(x, z),
  // FEAT-46: a POI lay-by pad counts as road here. It is graded ground with a marker on it, and a
  // tree in the middle of the pullout blocks the only thing a pullout is for.
  roadBlocked: (x, z) => !!roadSystem.queryNearest(x, z, FLORA_PARAMS.scatter.roadExclusion)
    || roadSystem.poiPadBlocked(x, z, FLORA_PARAMS.scatter.roadExclusion),
  // BUG-23: radius-aware road keep-out — true when NO road centreline is within `keepOut` m. Lets the
  // scatter inflate the mask by a prop's own bounding radius so big rocks/boulders can't overhang the
  // lane. queryNearest already sizes its tile-block search from the radius, so large keep-outs are safe.
  roadClear:   (x, z, keepOut) => !roadSystem.queryNearest(x, z, keepOut)
    && !roadSystem.poiPadBlocked(x, z, keepOut),
  // distance to the nearest road centreline (Infinity if none within 25 m) — small-rock road bands
  roadDist:    (x, z) => {
    const nr = roadSystem.queryNearest(x, z, 25)
    return nr ? Math.hypot(x - nr.point.x, z - nr.point.z) : Infinity
  },
  // FEAT-17: pond/skirt membership — the scatter rejects placements inWater (no underwater trees)
  // and keeps the skirt plantable. Reads module-scope waterSystem at call time like the rest.
  waterAt:     (x, z) => waterSystem ? waterSystem.pondSkirtAt(x, z) : null,
  // FEAT-25: stream channel membership ({inChannel,inBank,stream}) — the scatter keeps trees/rocks
  // out of the channel and BOOSTS decorative small-rock density inside it. Same call-time convention.
  streamAt:    (x, z) => waterSystem ? waterSystem.streamChannelAt(x, z) : null,
  // PERF-07: sun shear for the per-instance shadow ground-fit (shadowShearScale at prop commit).
  // Reads the live key-light direction at call time (same convention); absent headless (gates build
  // PropSystem without this key → the bake attribute stays at its flat-ground default).
  sunShear:    () => shearFromSun(skySystem.sunDirection, _sunShearScratch),
})
const _sunShearScratch = new THREE.Vector2()

// FEAT-31 testing-lab mode flag. When true: the world is torn down (streaming stopped AND meshes
// hidden — see enterLab), the ground is the lab's own surface (flat, except the rumble lanes), the
// ramp rig is collidable, and carve/prop/water queries are skipped.
// This replaced grid world (D-18/D-19, retired 2026-07-20): grid world only ever hid the terrain
// CHUNKS, so the rest of worldgen hung overhead and kept streaming, and it had no instrumentation.
// enterLab() and exitLab() are the only write sites.
let _labActive = false
let _labFogDensity = null    // player's fog density, saved across a lab visit
let _labSavedSpawn = null    // player's spawn override, saved across a lab visit

/**
 * Loose-surface factor at a world XZ: ~dustPavedFactor on the paved ribbon, 1 off it, feathered
 * across a band into the shoulder so the edge isn't a hard line. carveHint is the memoized
 * nearest-road query the physics path already warmed at these wheel positions, so this is ~free.
 * Shared by the dust system (dust is reduced on asphalt) and tire audio (screech ↔ dirt blend).
 */
function looseSurfaceFactor (x, z) {
  if (_labActive || !roadSystem) return 1
  const nr = roadSystem.carveHint(x, z)
  if (!nr || !nr.point) return 1                          // off-road → fully loose
  const lat = Math.hypot(x - nr.point.x, z - nr.point.z)
  const hw = RANGER_PARAMS.roadHalfWidth ?? 5
  const paved = RANGER_PARAMS.dustPavedFactor ?? 0.1
  const band = 1.5                                        // m — edge feather into the shoulder
  if (lat <= hw - band) return paved
  if (lat >= hw) return 1
  return paved + (1 - paved) * (lat - (hw - band)) / band
}

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

// QUAL-08 (closes BUG-26): routing now runs on its OWN Worker (src/road-worker.js), separate from the
// terrain heightfield Worker, so route pre-warm jobs can never starve terrain `generate` (the shared-FIFO
// starvation that forced BUG-26 to route on the main thread). With the two job classes on two Workers the
// pre-warm is safe to re-enable. Flip false to fall back to fully-synchronous main-thread routing (the
// BUG-26-safe state) if the dedicated Worker ever regresses — the synchronous router stays the cache-miss
// / teleport / headless fallback regardless.
const USE_WORKER_ROUTING = true

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
// Spawn probe geometry shared by resolveSpawn and _warmSpawnRoutes (QUAL-14 perf) — one source
// so the async pre-warm covers exactly the band the synchronous stream will route.
function _spawnProbeBase (wseed, params) {
  const spawnSeed = seedFor(wseed, 'spawn')
  return {
    spawnSeed,
    baseX: ((spawnSeed & 0xFFFF) / 0xFFFF - 0.5) * 200,   // ±100 m initial offset
    baseZ: (((spawnSeed >>> 16) & 0xFFFF) / 0xFFFF - 0.5) * 200,
    tightR: Math.max(320, Math.round((params.roadSiteSpacing ?? 256) * 0.85)),
    spawnR: Math.max(200, Math.round((params.roadSiteSpacing ?? 256) * 1.5)),
  }
}

// ── QUAL-14 perf: async cold-spawn route warm ────────────────────────────────────────────
// resolveSpawn's ensureTile used to route the whole spawn band SYNCHRONOUSLY on the main thread —
// the one 20 s+ cold-load block (perf log: "resolveSpawn: cold network stream"). Instead, before
// the initial reseat, pump the normal warmRoutes pre-warm at the spawn stream radius on the route
// worker POOL and await settlement: the searches split across 2–4 workers and the event loop
// stays alive. resolveSpawn's stream then finds every connection in _proto.cls (pure cache hits).
// Warms the TIGHT tier only — the wide tier fires for rare sparse-gap seeds and falls back to the
// synchronous router exactly as before. Bounded wait: correctness NEVER depends on the warm.
// ── QUAL-14 perf: route-cache import (bundled default world + in-session seeds) ─────────
// Nothing persists on the player's machine (user decision 2026-07-06). The shipped default
// world's routes come from the bundled static asset (route-store.js — sig-guarded, baked at
// commit time); every other seed caches in this in-session Map: a regen stashes the outgoing
// RoadSystem's routes here, so toggling back to a seed already visited this session is instant.
const _sessionRouteCache = new Map()   // String(seed) → exportRouteCache() payload
async function _importSessionOrBundledRoutes () {
  if (!roadSystem) return
  const mem = _sessionRouteCache.get(String(worldSeed))
  if (mem) { roadSystem.importRouteCache(mem); return }
  const bundled = await loadBundledRouteCache(worldSeed, RANGER_PARAMS)
  if (bundled && roadSystem) roadSystem.importRouteCache(bundled)
}

// ── PERF-26: the STORY-REGION route cache, off the boot critical path ────────────────────
// The bundle is split in two (route-store.js): BASE, awaited above, and this REGION delta, which
// only story mode's 2800 m entry warm needs. Boot must not wait on it — it is the larger half, and
// the cost is not just the download: inflate + JSON.parse run on the main thread.
//
// So: kick the fetch off once the world is up and idle, and let story entry AWAIT it. By the time
// the owner clicks into story mode it is already parsed and waiting (the point of doing it at all);
// if they click sooner, entry blocks on the tail of a download that is already in flight, behind
// the loading screen it already shows.
//
// Fetch and IMPORT are deliberately separate. The download is memoized per seed — the sig check
// inside is seed-dependent, so a non-default seed resolves null and is never retried — while the
// import happens only when story mode actually asks, so free roam never merges 4.7 MB of routes it
// will not use. Correctness never depends on any of this: a miss just routes, like any other seed.
const _regionRouteFetch = new Map()   // String(seed) → Promise<data|null>
function _fetchRegionRoutes (seed) {
  const k = String(seed)
  if (!_regionRouteFetch.has(k)) _regionRouteFetch.set(k, loadRegionRouteCache(seed, RANGER_PARAMS))
  return _regionRouteFetch.get(k)
}
async function _ensureRegionRoutes () {
  const seed = worldSeed
  const data = await _fetchRegionRoutes(seed)
  // Re-check the seed: the player can reseed while this is in flight, and roadSystem is a DIFFERENT
  // instance after a reseed — importing seed 6's routes into seed 99's network would be poison.
  if (data && roadSystem && worldSeed === seed) roadSystem.importRouteCache(data)
}
// One-time cleanup of the short-lived IndexedDB persistence experiment (32cde75, reverted same day).
try { indexedDB.deleteDatabase('rangersim-routes') } catch { /* private mode etc. */ }

let _spawnWarmActive = false   // frame loop skips road stream/warm while a spawn-band warm is pumping
// ── QUAL-14 perf: async spawn-band warm ─────────────────────────────────────────────────
// Pump RoadSystem.warmSpawnBand — the registered-band-exact, uncapped dispatch — for the tile
// ensureTile(tx,tz) is about to stream, at the CURRENT road radius, until every band route is
// cached (or a bounded wait expires; correctness never depends on the warm — the sync router
// finishes any stragglers). The searches split across the worker pool and the event loop stays
// alive. No-op without worker routing (headless gates / USE_WORKER_ROUTING=false).
async function _warmTileBand (tx, tz) {
  if (!roadSystem || !roadWorker) return
  const c = new THREE.Vector3((tx + 0.5) * CHUNK_SIZE, 0, (tz + 0.5) * CHUNK_SIZE)
  const t0 = performance.now()
  _spawnWarmActive = true
  try {
    while (!roadSystem.warmSpawnBand(c) && performance.now() - t0 < 45000) {
      await new Promise(r => setTimeout(r, 25))   // let route replies land between pump passes
    }
  } finally {
    _spawnWarmActive = false
  }
}

async function resolveSpawn (wseed, params) {  // eslint-disable-line no-unused-vars
  const { spawnSeed, baseX, baseZ, tightR, spawnR } = _spawnProbeBase(wseed, params)

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
    // FEAT-13 graph spawn: the graph network is SPARSE (roadSiteSpacing ≈ 640 m), so the nearest road to
    // the seeded ±100 m spawn offset can be 500 m+ away (seed "witch" → 531 m). A fixed 200 m probe would
    // find nothing → off-road terrain fallback. Widen the search to ~1.5× the site spacing, AND widen the
    // streamed radius to match (ensureTile streams at _proto.radius, the play radius ~320 m — too small to
    // even contain a 531 m road), then restore the play radius so the first frame streams normally.
    const _spawnR = spawnR
    const _savedRadius = roadSystem._proto.radius
    // PERF (spawn pre-bake): the cold spawn stream cost scales with radius² (routing area). The network is
    // sparse, so a single wide stream (query _spawnR=1.5×spacing + 200 m pad ≈ 1160 m) routes ~13× the play
    // footprint synchronously — ~5–7 s of the load hitch. Probe a TIGHT radius first (~0.85× site spacing ≈
    // 544 m): it resolves the vast majority of seeds ~2× faster, and only widens to the full _spawnR horizon
    // when the tight probe misses a sparse blue-noise gap. The WIDE tier is byte-identical to the single-
    // stream behaviour, so no seed that spawned on-road can now spawn off-road; the per-connection route
    // cache persists across the two streams, so the widen only routes the new annulus. Headless-verified
    // (0 off-road / 15 seeds; 14 spawn IDENTICAL, the 1 that differs lands on a CLOSER on-road point).
    const _tightR = tightR
    const _spawnTiers = [[_tightR, _tightR + 128], [_spawnR, _spawnR + 200]]   // tight ≈672/544 → wide ≈1160/960
    let nearest = null
    perfMark('resolveSpawn: before ensureTile (cold network stream)')  // TEMP (D-arc)
    for (const [_qR, _streamR] of _spawnTiers) {
      roadSystem.setRadius(Math.max(_savedRadius, _streamR))
      await _warmTileBand(baseTX, baseTZ)   // QUAL-14 perf: route this tier's band on the pool first
      roadSystem.ensureTile(baseTX, baseTZ)
      nearest = roadSystem.queryNearest(baseX, baseZ, _qR)
      if (nearest) break   // tight tier hit → skip the wide stream entirely (the common, fast path)
    }
    perfMark('resolveSpawn: cold network stream done')  // TEMP (D-arc)
    roadSystem.setRadius(_savedRadius)   // restore play radius (next update re-streams tight)
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
      // QUAL-14 perf: the spawn point can sit across an anchor band from baseTile, so this
      // re-center streams a SHIFTED band — warm the shifted band on the pool too (measured:
      // this ensureTile alone was 8.8 s of synchronous routing on a cold load).
      // PERF-19.3: BOUND what blocks `ready` without changing what is ROUTED overall. The recenter's
      // only decision-gating consumer is the queryNearest(100) refinement below — and the ~100 m field
      // around the spawn point is ALREADY cached by the tight tier (nearest.point is within tightR of
      // base, which the tight warm covered at tightR+128). So stream/warm the recenter at a MINIMAL
      // radius covering that query instead of the full play band: the near field is pure cache hits
      // (≈0 pre-ready routing) and the chosen spawn is byte-identical (headless 15-seed × 3-radius
      // spawn-identity check — test/spawn-identity.mjs). The full play band around the spawn streams on
      // the FIRST post-ready update()/warmRoutes (near roads complete; distant roads pop in slightly
      // later — acceptable). The tight tier above is left intact: its queryNearest(tightR) + the BUG-25
      // cull one-ring make it irreducibly decision-gating, so it is NOT trimmed.
      const _recenterR = Math.min(_savedRadius, 100 + 128)   // 100 m query + registration/cull margin
      roadSystem.setRadius(_recenterR)
      await _warmTileBand(spawnTX, spawnTZ)
      roadSystem.ensureTile(spawnTX, spawnTZ)
      roadSystem.setRadius(_savedRadius)   // restore play radius; next update() streams the full band
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
// FEAT-43: the rebuild is AWAITABLE. Story-mode entry must not capture its region center (or start
// the routing warm) until the new seed's world exists and the truck has been re-seated at its spawn
// — otherwise the region would center on the OLD position. Callers that don't care ignore the
// returned promise. Coalesced: every call inside one debounce window gets the SAME promise, settled
// once the body finishes OR throws (a rejection here would only strand the caller; the body logs).
let _rebuildDebounceTimer = null
let _reseedRequestedAt = null   // PERF-27: applyWorldSeed → rebuild-body start (debounce + scheduling)
let _rebuildPending = null   // { promise, resolve } for the currently-debounced rebuild
function debouncedRebuildFull () {
  clearTimeout(_rebuildDebounceTimer)
  if (!_rebuildPending) {
    let resolve
    _rebuildPending = { promise: new Promise(r => { resolve = r }), resolve: (...a) => resolve(...a) }
  }
  const pending = _rebuildPending
  _rebuildDebounceTimer = setTimeout(() => {
    void _rebuildFullNow()
      .catch(e => console.warn('[main] full rebuild failed', e))
      .finally(() => { if (_rebuildPending === pending) _rebuildPending = null; pending.resolve() })
  }, 150)
  return pending.promise
}

async function _rebuildFullNow () {
    if (!terrainSystem) return
    // PERF-27 item 3: WALL spans per step (not CPU) — the question this instrumentation answers is
    // "where do the ~25 s of a story-entry reseed go", and most of that time is spent awaiting
    // worker pools, which no CPU bucket would show. perf.js mirrors these onto the trace's
    // user_timing track under ?prof=1, so test/trace-report.mjs can put them beside per-thread busy.
    let _rt = performance.now()
    const _step = (label) => { const t = performance.now(); perfAdd(`reseed.${label}`, t - _rt); _rt = t }
    // The 150 ms debounce plus however long a starved main thread takes to actually run the timer.
    // Broken out so the step spans below account for the WHOLE reseed, with no silent remainder.
    if (_reseedRequestedAt != null) { perfAdd('reseed.debounceGap', _rt - _reseedRequestedAt); _reseedRequestedAt = null }
    terrainSystem.reinitWorker(worldSeed, RANGER_PARAMS)
    _step('terrainInit')
    // (rebuildAllChunksFromWorker moved BELOW the reseat — see the ORDER MATTERS note there.)
    // Phase 8: re-init RoadSystem with new seed — roads are pure fns of (worldSeed, coords, params)
    // so a new seed produces a different deterministic road network. Preserve viz state.
    if (roadSystem && scene) {
      const wasVisible = roadSystem._debugVisible
      // QUAL-14 perf: stash the outgoing instance's routes so toggling back to this seed later
      // in the session is instant (in-session cache only — nothing persists to disk).
      if (roadSystem._proto?.cls?.size) {
        _sessionRouteCache.set(String(roadSystem._worldSeed), roadSystem.exportRouteCache())
      }
      roadSystem = new RoadSystem(worldSeed, RANGER_PARAMS)
      roadSystem.init(scene)
      // Re-apply the new-API config the initial instance got (surface placement + stream radius).
      roadSystem.setSurfaceSampler((x, z) => terrainSystem.analyticHeight(x, z))
      roadSystem.setRawHeightSampler((x, z) => terrainSystem.rawHeightWorld(x, z))  // CR-01: carve-free sampler for sampleDesignGradeAt
      roadSystem.setRadius(320)   // PERF (Tier 1): match the terrain ring, not 640 m — see initial setup
      // QUAL-08: re-seed the dedicated route Worker + re-register the new play RoadSystem instance (a new
      // seed → a different deterministic network). The stable 'play' client id swaps the instance; old
      // in-flight replies are dropped by the new instance's route epoch. See USE_WORKER_ROUTING.
      if (USE_WORKER_ROUTING && roadWorker) {
        roadWorker.init(worldSeed, RANGER_PARAMS)
        roadWorker.registerClient('play', roadSystem)
        roadSystem.setRouteDispatcher((jobs, epoch) => roadWorker.postRouteJobs('play', jobs, epoch))
      }
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
    _step('roadInit')
    // FEAT-22/17/18: water is seed-deterministic — rebuild it on a new seed or it shows stale water.
    // BEFORE props: the scatter's waterAt sampler must read the NEW seed's ponds, and setWaterNoGo
    // (inside) must reshape the fresh roadSystem's network before anything streams it.
    if (waterSystem) rebuildWaterSystem()
    _step('water')
    // FEAT-39: the baked route belongs to the OLD seed's network — drop it rather than draw
    // arrows over roads that no longer exist.
    if (gpsSystem) gpsSystem.clearRoute()
    // FEAT-06: props are seed-deterministic, so a new seed must rebuild them or they show stale
    // scatter. The samplers read the (now-reassigned) module-scope systems, so makePropSamplers()
    // picks up the fresh terrain/road/water instances.
    if (propSystem) {
      propSystem.dispose()
      propSystem = new PropSystem({ scene, worldSeed, samplers: makePropSamplers() })
      // PERF-07: wipe the old seed's baked shadow tiles and re-arm baking for the fresh props.
      if (shadowBake) { shadowBake.clear(); propSystem.setShadowBake(shadowBake) }
      if (_syncImpostors) _syncImpostors()   // PERF-21: re-activate billboards on the fresh instance
    }
    _step('props')
    // QUAL-14 perf: same cache import + async reseat as the initial load — the new seed's spawn
    // bands route on the worker pool inside resolveSpawn (frames keep rendering) before each
    // synchronous stream. AFTER rebuildWaterSystem above: the warm must carry the new seed's
    // pond no-go discs.
    await _importSessionOrBundledRoutes()
    _step('routeImport')
    await _reseatTruckAtSpawn()
    _step('reseat')
    // ORDER MATTERS (same rule as debouncedRoadRebuild): terrain chunks rebuild AFTER the new
    // road network is streamed — _flushPendingQueue bakes carve tables at chunk-request time, so
    // chunks rebuilt against a not-yet-streamed network get NO road carve and the world looks
    // stale until something forces another rebuild (the "toggle the seed to fix it" symptom).
    // Until this line runs the OLD seed's chunks stay visible; the flip is the clean-start moment.
    terrainSystem.rebuildAllChunksFromWorker()
    _step('chunkRebuild')   // dispatch only — the chunks themselves land asynchronously
}

// Canonical "change the world seed" op: update the seed + reference string, drop the spawn override
// and mission plan, force a fresh planner warm, and fire the debounced Path-B rebuild. Shared by the
// debug seed field (changeSeed) and Story Mode's seed prompt (StorySystem) so both reseed identically.
// Returns the rebuild promise (FEAT-43: story-mode entry awaits it before centering its region).
function applyWorldSeed (v) {
  _reseedRequestedAt = performance.now()   // PERF-27: start of the debounce+scheduling gap
  worldSeed = parseWorldSeed(v)
  _seedString = String(v)
  _spawnOverride = null
  missionSystem?.invalidatePlan()
  _plannerWarm = null; _plannerWarmAt = -Infinity
  return debouncedRebuildFull()
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
    // recomputes smoothed grade against the new params (crownHeight / terrainAmplitude).
    // Spline objects persist across rebuilds — WeakMap would return stale pre-change profiles
    // without this invalidation call.
    if (roadSystem) {
      roadSystem.invalidateDesignGradeCache()
      // Camber (camberMaxAngleDeg / camberKneeRadiusM / roadCamberRate) is baked into the
      // _networkRev-keyed run/camber
      // profile caches, which a surface-param change does NOT otherwise invalidate — bump the rev
      // so camber recomputes on demand instead of re-reading the stale pre-change value.
      roadSystem.invalidateProfileCaches()
    }
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
// SERIALIZED: concurrent calls (e.g. R pressed while a seed-regen's spawn warm is still pumping)
// queue behind the in-flight seat instead of interleaving two async spawn probes' setRadius/warm
// state — the R lands right after the current one finishes, on the fully-loaded road.
let _reseatChain = Promise.resolve()
function _reseatTruckAtSpawn () {
  const run = () => _reseatTruckAtSpawnInner()
  _reseatChain = _reseatChain.then(run, run)
  return _reseatChain
}

// ── Free-roam teleport / custom spawn point (feature/teleport) ────────────────────────────
// _spawnOverride, when non-null, is the BODY-CENTER pose the R-key respawn returns to instead of
// the seed-derived resolveSpawn placement: { x, y, z, heading }. Set by the map double-click
// teleport, the free-cam "teleport here" button, and Shift+R (set spawn to current pose). It is
// cleared on seed change / world regen (a stale point in a fresh world makes no sense).
let _spawnOverride = null

// Extract the truck's current heading (Y-yaw, radians) from its quaternion, inverse of
// setFromAxisAngle(Y, h): body forward is (0,0,-1) → world (-sin h, 0, -cos h) ⇒ h = atan2(-fx, -fz).
const _headingProbe = new THREE.Vector3()
function _currentHeading () {
  _headingProbe.set(0, 0, -1).applyQuaternion(vehicleState.quaternion)
  return Math.atan2(-_headingProbe.x, -_headingProbe.z)
}

// A road tangent yields two opposite headings (h, h+π). Return whichever is closer to `ref`
// (the truck's current facing) so a map-teleport aligns to the road without a needless 180° flip.
function _pickRoadDir (h, ref) {
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))   // → (-π, π]
  return Math.abs(wrap(h - ref)) <= Math.abs(wrap(h + Math.PI - ref)) ? h : h + Math.PI
}

// Surface height the tires rest on at a world XZ: the road top when on a road (so a spawn/teleport
// follows road grade + camber), else the terrain. Road sampling falls back to terrain when the play
// network isn't streamed there yet (e.g. a far map-teleport) — analyticHeight is defined everywhere.
function _groundSampleY (x, z) {
  // In the lab the ground is the lab's own surface. Without this the seat probe would return the
  // REAL terrain/road height (~150 m over most of seed 6) and a lab teleport would drop the truck
  // out of the sky onto the plane.
  if (_labActive) return labSystem ? labSystem.groundHeight(x, z) : 0
  if (roadSystem && typeof roadSystem.sampleRoadTopY === 'function') {
    const ry = roadSystem.sampleRoadTopY(x, z)
    if (ry != null) return ry
  }
  return terrainSystem ? terrainSystem.analyticHeight(x, z) : 0
}

// Fit the truck to the LOCAL GROUND PLANE at (cx,cz) facing `heading`, so it rests on a slope
// instead of being placed dead-level and clipping the uphill corners into the ground. Samples the
// surface at the four tire contact XZ (yaw-projected), fits a plane, and returns the body-center Y
// + an orientation whose up = plane normal and forward = `heading` projected onto the plane.
// `drop` (m) lifts it that much above the surface so it settles cleanly (teleport uses 0.5).
const _seatFwd = new THREE.Vector3(), _seatRight = new THREE.Vector3(), _seatNormal = new THREE.Vector3()
const _seatX = new THREE.Vector3(), _seatZ = new THREE.Vector3(), _seatMat = new THREE.Matrix4()
function _seatOnGroundPlane (cx, cz, heading, eq, drop) {
  const p = RANGER_PARAMS
  const ch = Math.cos(heading), sh = Math.sin(heading)
  const frontZ = -(p.wheelbase * p.weightRear)    // body -Z = forward → front axle at negative Z
  const rearZ  =  (p.wheelbase * p.weightFront)
  const tf = p.trackFront / 2, tr = p.trackRear / 2
  // 0=FL 1=FR 2=RL 3=RR — body-space (lx, lz) rotated into world XZ by yaw only.
  const corners = [[-tf, frontZ], [tf, frontZ], [-tr, rearZ], [tr, rearZ]]
  const oy = [], ox = [], oz = []
  for (const [lx, lz] of corners) {
    const wx =  lx * ch + lz * sh   // rotate about +Y by heading
    const wz = -lx * sh + lz * ch
    ox.push(wx); oz.push(wz); oy.push(_groundSampleY(cx + wx, cz + wz))
  }
  // Plane basis from midpoint spans (front↔rear = forward, right↔left = right).
  _seatFwd.set((ox[0] + ox[1]) / 2 - (ox[2] + ox[3]) / 2,
               (oy[0] + oy[1]) / 2 - (oy[2] + oy[3]) / 2,
               (oz[0] + oz[1]) / 2 - (oz[2] + oz[3]) / 2).normalize()   // body -Z on the plane
  _seatRight.set((ox[1] + ox[3]) / 2 - (ox[0] + ox[2]) / 2,
                 (oy[1] + oy[3]) / 2 - (oy[0] + oy[2]) / 2,
                 (oz[1] + oz[3]) / 2 - (oz[0] + oz[2]) / 2).normalize()
  _seatNormal.crossVectors(_seatRight, _seatFwd).normalize()
  if (_seatNormal.y < 0) _seatNormal.negate()
  _seatX.crossVectors(_seatFwd, _seatNormal).normalize()   // body +X (orthonormalised)
  _seatZ.copy(_seatFwd).negate()                            // body +Z (backward)
  _seatMat.makeBasis(_seatX, _seatNormal, _seatZ)
  const quat = new THREE.Quaternion().setFromRotationMatrix(_seatMat)
  // Body center = the plane point under (cx,cz) lifted (bodyY + drop) along the plane NORMAL, so the
  // ride height is perpendicular to the slope (no belly-clip). Flat ⇒ normal=(0,1,0) ⇒ pure vertical.
  const meanGy = (oy[0] + oy[1] + oy[2] + oy[3]) / 4
  const lift = eq.bodyY + drop
  return { x: cx + _seatNormal.x * lift, y: meanGy + _seatNormal.y * lift, z: cz + _seatNormal.z * lift, quat }
}

async function _reseatTruckAtSpawnInner () {
  const eq = computeStaticEquilibrium(RANGER_PARAMS)
  if (_spawnOverride && _spawnOverride.align === false) {
    // Exact pose (free-cam "teleport here", Shift+R) — floating/off-road allowed, applied verbatim.
    vehicleState.position.set(_spawnOverride.x, _spawnOverride.y, _spawnOverride.z)
    vehicleState.quaternion.copy(_spawnOverride.quat)
  } else {
    // Ground-aligned seat: normal seed spawn, or a map double-click drop. Fit to the local plane.
    let cx, cz, heading, drop
    if (_spawnOverride) {   // align === true
      cx = _spawnOverride.x; cz = _spawnOverride.z; heading = _spawnOverride.heading; drop = _spawnOverride.drop || 0
    } else {
      const { position: spawnPos, heading: h } = await resolveSpawn(worldSeed, RANGER_PARAMS)
      cx = spawnPos.x; cz = spawnPos.z; heading = h; drop = 0
    }
    const seat = _seatOnGroundPlane(cx, cz, heading, eq, drop)
    vehicleState.position.set(seat.x, seat.y, seat.z)
    vehicleState.quaternion.copy(seat.quat)
  }
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
  vehicleState.drivetrain     = { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 }
  vehicleState.slipLong       = [0, 0, 0, 0]
  vehicleState.slipLat        = [0, 0, 0, 0]
  vehicleState.handbrake      = false
  vehicleState.parked         = true   // hold the truck at the fresh spawn/teleport until the driver takes over
  vehicleState.strutComp      = [...eq.strutComp]
  vehicleState.strutCompVel   = [0, 0, 0, 0]
  vehicleState.submerged      = false   // FEAT-22
  vehicleState.submergedDepth = 0
}

// ── Gameplay mode gate (feature/teleport) ─────────────────────────────────────────────────
// Teleport controls (map double-click, free-cam button, Shift+R) are ENABLED per mode here.
//
// FEAT-43 (owner decision 2026-07-26): story mode keeps them ON **for now**. Shipping story mode
// eventually takes them away — teleporting past the region wall is exactly the kind of thing the
// wall exists to prevent — but while the mode is a sandbox under construction, being able to jump
// to a spot and inspect it is worth more than the fiction. Drop 'story' from this list to close it.
// The wall itself still applies: story.js clamps the truck back inside on the next tick, so a
// teleport outside the region is a look, not a move.
let _gameMode = 'freeroam'   // 'freeroam' | 'story' | 'scenario' | 'lab'
function isTeleportEnabled () { return _gameMode === 'freeroam' || _gameMode === 'story' }
window.__setGameMode = (m) => { _gameMode = m }

// ── "spawn point set" toast (feature/teleport) ────────────────────────────────────────────
// Full-opacity immediately, then fades out starting 3 s later (CSS 1 s opacity transition).
// Shown on ANY spawn-point change (teleport or Shift+R).
let _spawnToastTimer = null
function showSpawnToast () {
  const el = document.getElementById('spawn-toast')
  if (!el) return
  clearTimeout(_spawnToastTimer)
  el.style.transition = 'none'     // snap back to full opacity even if a previous fade is mid-flight
  el.style.opacity = '1'
  // Force a reflow so the opacity:1 lands before we re-enable the transition (else no fade).
  void el.offsetWidth
  el.style.transition = 'opacity 1s ease'
  _spawnToastTimer = setTimeout(() => { el.style.opacity = '0' }, 3000)
}

// ── Teleport / set-spawn primitives (feature/teleport) ────────────────────────────────────
// Two flavours of spawn override (see _reseatTruckAtSpawnInner):
//   align:true  — snap to the local ground plane at (x,z)+heading (map double-click, seed spawn).
//   align:false — exact body pose (free-cam "teleport here", Shift+R): floating/off-road preserved.
// teleport* both move the truck NOW and make R return here; setSpawnHere only records the pose.
// FEAT-43: a deliberate teleport DISARMS the story-mode region wall, exactly the way an active
// Quick Job does. Without this the wall clamps the truck straight back on the next tick and a
// teleport outside the region is a no-op. The wall re-arms the moment the player is inside again,
// so this loosens the fence for the jump only — it never disables it.
function teleportToGround (x, z, heading, drop) {
  _spawnOverride = { align: true, x, z, heading, drop }
  storySystem?.notifyTeleport()
  void _reseatTruckAtSpawn()
  showSpawnToast()
}
function teleportToPose (x, y, z, quat) {
  _spawnOverride = { align: false, x, y, z, quat: quat.clone() }
  storySystem?.notifyTeleport()
  void _reseatTruckAtSpawn()
  showSpawnToast()
}
function setSpawnHere () {
  const p = vehicleState.position
  _spawnOverride = { align: false, x: p.x, y: p.y, z: p.z, quat: vehicleState.quaternion.clone() }
  showSpawnToast()
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
  drivetrain:      { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },  // FEAT-23 engine/converter/gearbox state; stepped by stepDrivetrain, read by HUD/logger
  handbrake:       false,                            // Space key handbrake state; written by updateVehicle, read by getBrakeTorque
  parked:          true,                              // spawn/teleport hold (feature/teleport): handbrake held until first driver input
  submerged:       false,                            // FEAT-22: CG below a water surface (set per-frame from WaterSystem.submergedAt)
  submergedDepth:  0,                                // FEAT-22: m below the water surface (0 when dry)
}

// ── Renderer ─────────────────────────────────────────────────────────────────
const canvas = document.querySelector('canvas')
const renderer = new THREE.WebGLRenderer({ antialias: !_NOAA, canvas })  // ?noaa=1 → AA off (PERF-08 A/B)
renderer.setPixelRatio(window.devicePixelRatio)
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
// QUAL-18: patch THREE.ShaderChunk so the realtime shadow-map edge dissolves instead of drawing a
// hard line. MUST run before any material compiles (first render). Baked prop shadows (PERF-07) have
// their own distance fade in the terrain shader; this covers the truck's realtime map.
// fadeStart 0.82 (up from the 0.72 default): the frustum is tighter now that the presets trade
// extent for texel size, so the dissolve has to start later or it eats a visible chunk of the
// shadowed world. 0.82 of ±170 m ⇒ full shadows to ~139 m, gone by 170 m.
installShadowEdgeFade({ fadeStart: 0.82 })
// PERF-16: stop re-rendering the sun's whole shadow pass every frame. Three defaults autoUpdate=true,
// so the 1536²/2048² shadow map is re-rendered each frame even parked under a static sun (measured
// ~9 pp renderer-main, ~3 pp GPU). We drive needsUpdate on-demand from the shadow-follow block in
// loop() instead — re-armed only when the shadow could actually change (camera crossed a texel, the
// sun moved, world geometry streamed, or the vehicle is in motion). First frame needs one render.
renderer.shadowMap.autoUpdate  = false
renderer.shadowMap.needsUpdate = true

// ── Camera ───────────────────────────────────────────────────────────────────
// Spring-follow camera managed by src/camera.js (Plan 04). updateCamera() called each frame.
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)

// ── Scene ────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene()
// QUAL-02: the flat-colour background is replaced by SkySystem's atmospheric Sky mesh (constructed
// after the lights, below — it needs the sun/hemisphere refs). Fog stays here: its DENSITY is owned
// by the draw-distance presets (PERF-03), while SkySystem recolours it to match the sky horizon so
// the FEAT-05 "no hard band at the horizon" invariant is preserved. Initial colour is a placeholder
// overwritten by SkySystem.apply() on construction (it applies the active look's fog colour).
scene.fog = new THREE.FogExp2(0x9bb8d4, 0.006)

// HemisphereLight (cool alpine sky above, warm granite-ground bounce below) reads far more alpine
// than a flat white ambient for almost no cost (FEAT-05).
const ambient = new THREE.HemisphereLight(0xaccadc, 0x5b5048, 0.65)
scene.add(ambient)

const sun = new THREE.DirectionalLight(0xfff2e0, 2.2)  // slightly warm alpine sun (FEAT-05)
sun.position.set(80, 45, 60)
sun.castShadow = true
sun.shadow.mapSize.width  = 2048
sun.shadow.mapSize.height = 2048
sun.shadow.camera.near = 0.5
sun.shadow.camera.far  = 500
// The frustum follows the TRUCK each frame (see the follow in loop()) and is sized to it, not to the
// world — the truck is very nearly the only caster in this map. Rationale + the caster audit are in
// the QUALITY_PRESETS comment. applyQuality() overwrites these at boot; they only set the pre-boot
// state, so keep them at the preset scale or the first frame renders a world-sized blur.
sun.shadow.camera.left = sun.shadow.camera.bottom = -20
sun.shadow.camera.right = sun.shadow.camera.top   =  20
scene.add(sun)
scene.add(sun.target)   // FEAT-06: target must be in-scene for the per-frame shadow-follow to apply

// BUG-29: world-size of one shadow-map texel + scratch vectors for texel-snapping the shadow frustum
// centre each frame (see the follow in loop()). frustumWidth / mapSize = 40 / 2048 ≈ 0.020 m/texel.
// This snap is THE anti-shimmer mechanism: it must stay in step with the live extent/mapSize, which
// is why every writer goes through applyShadowResolution(). A stale SHADOW_TEXEL is what makes a
// texel-snapped shadow shimmer anyway — the symptom reads like "snapping doesn't work", but the
// snap grid is simply quantising to the wrong pitch.
// PERF-12: `let` + recomputed by applyShadowQuality — presets now scale map size and extent.
let SHADOW_TEXEL  = (sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.width
const _shadowFwd    = new THREE.Vector3()
const _shadowRight  = new THREE.Vector3()
const _shadowUp     = new THREE.Vector3()
const _shadowCenter = new THREE.Vector3()
// PERF-16: last-applied shadow-render triggers, compared each frame to decide whether to re-arm the
// on-demand shadow pass (renderer.shadowMap.autoUpdate is false). NaN forces the first render.
let _lastShadowSnapR   = NaN            // texel-snapped frustum centre (light right axis)
let _lastShadowSnapU   = NaN            // texel-snapped frustum centre (light up axis)
const _lastSunDir      = new THREE.Vector3(NaN, NaN, NaN)   // key-light direction (day/night future-proof)
let _lastShadowGeomSig = NaN            // cheap poll-and-compare of streamed-geometry counts

/**
 * Set the sun shadow map's resolution and its world extent TOGETHER, because only their ratio is
 * visible: extent/mapSize is the world size of one shadow texel, and that alone governs how crisp
 * the truck's shadow edge is. (At the old 220 m / 2048 the texel was 0.215 m, so the truck's 1.8 m
 * width spanned ~8 texels — no amount of filtering makes that read as sharp.)
 *
 * One function for all three callers — quality tier, A/B lever, any future slider — because each
 * MUST do the same three things or it breaks something subtle: dispose the render target on a size
 * change (Three only reallocates when it is gone), recompute SHADOW_TEXEL (the per-frame texel-snap
 * follow shimmers if it goes stale — BUG-29), and re-arm the on-demand shadow pass (PERF-16).
 */
function applyShadowResolution (mapSize, extent) {
  if (mapSize && sun.shadow.mapSize.width !== mapSize) {
    sun.shadow.mapSize.set(mapSize, mapSize)
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null }
  }
  if (extent && sun.shadow.camera.right !== extent) {
    sun.shadow.camera.left = sun.shadow.camera.bottom = -extent
    sun.shadow.camera.right = sun.shadow.camera.top   =  extent
    sun.shadow.camera.updateProjectionMatrix()
  }
  SHADOW_TEXEL = (sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.width
  renderer.shadowMap.needsUpdate = true
}

// QUAL-02: atmospheric skybox + sun-driven lighting. Drives the sun light, hemisphere fill and fog
// tint from ONE sun elevation/azimuth (the static base a day/night cycle plugs into). SkySystem adds
// the Sky mesh and sets scene.background = null (the mesh is the background now).
const skySystem = new SkySystem({ scene, renderer, sun, ambient })
window.sky = skySystem   // debug handle (mirrors window.terrain) — drive presets/time-of-day from console

// Ground plane (y=0, 200m × 200m)
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshPhongMaterial({ color: 0x222222, depthWrite: false })
)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

// Wheel dust trails (src/dust.js). Self-contained sprite-pool puffs tinted to the dirt
// we're driving on; driven each render frame from vehicleState (see loop). Construct here
// since it only needs the scene + params — no dependency on terrain/road systems.
const dustSystem = new DustSystem(scene, RANGER_PARAMS)

// Tire smoke (src/smoke.js) — same construction convention as dust: scene + params only.
const smokeSystem = new TireSmokeSystem(scene, RANGER_PARAMS)

// Dirt spray (src/dirt-spray.js) — slip-driven clod stream + shed floaters, loose surfaces only.
const dirtSpraySystem = new DirtSpraySystem(scene, RANGER_PARAMS)

// Vehicle visual model (body, wheels, lights) + per-frame mesh sync now live in
// src/vehicle-model.js. carGroup/bodyMesh/wheelMeshes are returned for back-compat;
// syncMeshesToState(state) is called once per render frame below.
const { carGroup, bodyMesh, wheelMeshes, syncMeshesToState, setBodyColor, addLightGui, setNightFactor, prewarmLightPrograms } = createVehicleModel(scene, RANGER_PARAMS)

// ── FEAT-16: 2D top-down map (dev/validation overlay, toggle M) ──────────────────
// Owns a SEPARATE read-only RoadSystem instance streamed around its own pan cursor — it never
// touches the live roadSystem/play network (see src/map2d.js). Accessors are injected so map2d
// stays decoupled from main's module state. Body forward is the -Z axis (vehicle.js); we pass
// the world-forward XZ so the marker's heading is convention-agnostic.
let _waterNoGoFns = null   // [noGoFn, pondDiscsFn] — see rebuildWaterSystem
const _mapFwd = new THREE.Vector3()
// Story mode (beta) — constructed below, after roadSystem exists. Declared here so map2d can
// read its markers without the two modules knowing about each other.
let missionSystem = null
// FEAT-31 testing lab — assigned below, after the scene exists. Declared here (not `const` at the
// construction site) because the contact queries above reference it: a const would sit in the
// temporal dead zone and throw if anything probed the ground during boot.
let labSystem = null
// FEAT-39 GPS assist — constructed with missionSystem below (it reads the mission's route).
let gpsSystem = null
const map2d = new Map2D({
  canvas:    document.getElementById('map2d'),
  getSeed:   () => worldSeed,
  getParams: () => RANGER_PARAMS,
  getCar:    () => {
    _mapFwd.set(0, 0, -1).applyQuaternion(vehicleState.quaternion)
    return { x: vehicleState.position.x, z: vehicleState.position.z, fx: _mapFwd.x, fz: _mapFwd.z }
  },
  // Double-click teleport (free-roam only). The map snaps to the nearest road and hands us the
  // road-top Y; we drop the truck 0.5 m above it (or on terrain when off-road) and set the spawn.
  canTeleport: isTeleportEnabled,
  getMission: () => missionSystem?.markers() ?? null,
  // FEAT-43: the story-mode region boundary, so the player can see where the wall is rather than
  // finding it by driving into it. Null outside story mode (and until the region center is captured).
  getRegion: () => storySystem?.region() ?? null,
  // FEAT-46: POI icons — how the player finds one to drive to. Empty outside story mode.
  getPois: () => poiSystem.list(),
  // FEAT-45: dispersed-camping zones, drawn as a yellow casing on the roads inside them. Empty
  // outside story mode (build() only ever runs from the story deps).
  getCampZones: () => campSystem.zones(),
  onTeleport: ({ x, z, heading }) => {
    // Snap to the road orientation, but a road tangent has TWO directions — pick the one closest
    // to the truck's current heading so the teleport doesn't spin it 180°. Off-road: keep heading.
    // teleportToGround fits the truck to the local ground plane (no clip) and drops it 0.5 m.
    const h = heading != null ? _pickRoadDir(heading, _currentHeading()) : _currentHeading()
    teleportToGround(x, z, h, 0.5)
    map2d.hide()   // close the map so the teleport is immediately visible
  }
})

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

  // Ground surface — the lab's own surface (flat, except its rumble lanes) in the testing lab;
  // analytic terrain height in the generated world.
  // FEAT-40: pass the vertex's own Y so a body inside a bore span rides the bore floor instead of
  // seeing the raw hill overhead as a 30 m phantom penetration.
  const terrainH = _labActive ? labSystem.groundHeight(px, pz)
                              : (terrainSystem ? terrainSystem.analyticHeight(px, pz, undefined, py) : 0)
  if (py < terrainH) {
    const terrainN = _labActive ? labSystem.groundNormal(px, pz)
                                : (terrainSystem ? terrainSystem.analyticNormal(px, pz, undefined, py) : { x: 0, y: 1, z: 0 })
    hits.push({ normal: new THREE.Vector3(terrainN.x, terrainN.y, terrainN.z), depth: terrainH - py })
  }

  // BUG-37: bore WALL contact — terrainSystem only resolves the bore floor (bore-ownership rule);
  // the curved half-tube sides have no matching collision without this. No hint passed (matches this
  // function's terrain block above, which is also unhinted — vertex contacts fire far less often than
  // per-wheel sphere contacts, so the memo optimization isn't needed here).
  if (!_labActive && roadSystem) {
    const wallHit = roadSystem.queryTunnelWallContact(px, py, pz, 0)
    if (wallHit) hits.push({ normal: wallHit.normal, depth: wallHit.depth })
  }

  // Ramp face contacts — lab only (D-19: the ramp was never part of the generated world). Kept
  // when grid world was retired: a jump is a legitimate suspension/damage input, which is exactly
  // what the lab's rumble lanes are also for.
  // _labActive is the authoritative gate; RANGER_PARAMS.rampEnabled is a secondary debug toggle.
  if (_labActive && RANGER_PARAMS.rampEnabled !== false) {
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
function queryContacts (cx, cy, cz, r, footprint = false) {
  const hits = []

  // Ground surface — the lab's own surface in the testing lab; analytic terrain height otherwise.
  // Grid-world uses flat ground so physics contacts are correct on the clean flat plane (D-18).
  // PERF (contact path): resolve the road run ONCE (memoized carveHint) and thread it into EVERY
  // height/normal sample below. That collapses the per-wheel road tile-scans to ~1, and — crucially —
  // carveHint is memoized per 0.1 m cell, so the death-spiral's ~300 queryContacts/frame at a
  // near-stationary wheel reuse one query instead of each re-scanning a switchback's many slices
  // (the slow-CPU 5fps lock that recovers airborne). Height stays accurate: at the query center the
  // projection is ~0 (perp foot) so rest height ≈ exact (≤~5 mm via the memo).
  const _hint = (!_labActive && roadSystem) ? roadSystem.carveHint(cx, cz) : undefined
  // FEAT-40: cy disambiguates the two stacked surfaces in a bore span (floor vs hill overhead).
  const groundH = (x, z) => _labActive ? labSystem.groundHeight(x, z)
                                       : (terrainSystem ? terrainSystem.analyticHeight(x, z, _hint, cy) : 0)

  // TIRE-ENVELOPE (footprint sampling). A wheel is a disc of radius r; it rests on the HIGHEST
  // terrain its circular profile can touch, NOT the single point under the hub. The legacy probe
  // sampled only the centre column, so the tire sank into troughs (rumble strips) and clipped through
  // crests / the downhill face of a slope. Here we sweep a small direction-agnostic stencil and take
  // the ENVELOPE max of  h(sample) + sqrt(r² − d²)  — the wheel-centre rest height each sample implies
  // (d = horizontal offset; the sqrt is the circle's height above ground at that offset). The winning
  // sample sets penetration depth, contact point, and surface normal. At d=0 this reduces EXACTLY to
  // the old  terrainH + r − cy, so flat ground and the m4-* assertions are unchanged.
  // PERF: _hint is threaded into every sample, so the whole stencil costs ONE road resolve (PERF-24) —
  // only the cheap noise eval multiplies. Wheel callers pass footprint=true; body probes do not.
  const doFootprint = footprint && r > 0 && RANGER_PARAMS.wheelFootprint !== false
  let bestH   = groundH(cx, cz)
  let bestTop = bestH + r        // d=0 term — identical to the legacy single probe
  let bestX = cx, bestZ = cz
  if (doFootprint) {
    // Cardinal cross at 0.55 r and 0.9 r (8 offsets). Direction-agnostic so it bridges bumps and
    // slopes in any orientation without knowing the wheel's heading.
    const STEN = [0.55, 0.9]
    for (let k = 0; k < STEN.length; k++) {
      const d    = STEN[k] * r
      const lift = Math.sqrt(Math.max(0, r * r - d * d))
      const offs = [[d, 0], [-d, 0], [0, d], [0, -d]]
      for (let o = 0; o < 4; o++) {
        const sx = cx + offs[o][0], sz = cz + offs[o][1]
        const h   = groundH(sx, sz)
        const top = h + lift
        if (top > bestTop) { bestTop = top; bestH = h; bestX = sx; bestZ = sz }
      }
    }
  }
  const gd = bestTop - cy
  if (gd > 0) {
    const n = _labActive ? labSystem.groundNormal(bestX, bestZ)
                         : (terrainSystem ? terrainSystem.analyticNormal(bestX, bestZ, _hint, cy) : { x: 0, y: 1, z: 0 })
    hits.push({
      normal:       new THREE.Vector3(n.x, n.y, n.z),
      depth:        gd,
      contactPoint: new THREE.Vector3(bestX, bestH, bestZ)
    })
  }

  // Ramp triangle contacts — lab only (see queryVertexContacts above).
  // _labActive is the authoritative gate; RANGER_PARAMS.rampEnabled is a secondary debug toggle.
  if (_labActive && RANGER_PARAMS.rampEnabled !== false) {
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

  // FEAT-06b: prop hard contacts (tree trunks = capsule, rocks/boulders = sphere). Local query
  // against the per-chunk collidable grid — bushes are NOT here (soft-drag is applied separately
  // once per substep in the loop). Skipped in the lab (no props there). Same {normal,depth,
  // contactPoint} shape, so the wheel + body solvers consume them unchanged.
  if (!_labActive && propSystem) {
    const propHits = propSystem.queryProps(cx, cy, cz, r)
    for (let i = 0; i < propHits.length; i++) hits.push(propHits[i])
  }

  // FEAT-46: the POI marker cube is SOLID — a marker you drive through reads as scenery, and this
  // project's premise is that the physics is honest. Same {nx,ny,nz,depth} convention as the prop
  // hits above, converted here exactly as prop-system does. Empty list in free roam ⇒ free.
  if (!_labActive) {
    const poiHit = poiSystem.queryContact(cx, cy, cz, r)
    if (poiHit) {
      const t = r - poiHit.depth   // query centre back along -normal to the solid's surface
      hits.push({
        normal: new THREE.Vector3(poiHit.nx, poiHit.ny, poiHit.nz),
        depth: poiHit.depth,
        contactPoint: new THREE.Vector3(cx - poiHit.nx * t, cy - poiHit.ny * t, cz - poiHit.nz * t),
      })
    }
  }

  // BUG-37: bore WALL contact — terrainSystem's ground block above only resolves the bore FLOOR
  // (bore-ownership rule); the curved half-tube sides have no matching collision without this. Same
  // {normal,depth,contactPoint} shape as prop hits, so the wheel solver treats a wall like any other
  // surface. Reuses _hint (already resolved for the ground query above) — no extra tile scan.
  if (!_labActive && roadSystem) {
    const wallHit = roadSystem.queryTunnelWallContact(cx, cy, cz, r, _hint)
    if (wallHit) hits.push(wallHit)
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
// D-19: the ramp is NOT part of the generated world — it exists only in the FEAT-31 testing lab.
// Authoritative gate is _labActive; debug toggle (RANGER_PARAMS.rampEnabled) is secondary.
rampMesh.visible = false
scene.add(rampMesh)

// FPS tracking — smoothed using an exponential moving average (alpha=0.1).
// Placed here (module scope) so it persists across frames without closure overhead.
let _fpsEma = 60       // initial estimate: 60 fps
let _fpsLastTime = 0   // will be set to currentTime on first frame
let _lastHudWrite = 0  // PERF-16: wall-clock (ms) of the last HUD DOM/canvas write — throttled to ~10 Hz

// ── Debug panel ──────────────────────────────────────────────────────────────
// D-10: passes mutable RANGER_PARAMS ref so sliders write directly to the object physics.js reads.
// Quality presets (PERF-06, supersedes the PERF-03 draw-distance dropdown): ONE master tier bundles the
// terrain ring + warm margin + fog density + detail-shader scale (the old draw-distance fields) PLUS
// dynamic shadows, prop render radius, an internal render-resolution cap, and (PERF-12) the shadow
// map size + ortho extent. Normal is the boot default (applied via applyQuality at bootstrap) and is
// the thermal-friendly laptop tier; LOW strips every non-gameplay GPU cost.
//   `warm` = rings GENERATED beyond the visible ring (pop-in lead). It grows with draw distance: the
//   higher tiers run lighter fog (you see further), so the build frontier must sit further out to stay
//   hidden — a flat 1-ring margin left obvious pop-in at High/Ultra. Sized so build radius (ring+warm)
//   reaches roughly where the fog goes ~opaque (density·d ≈ 1.3).
// detailScale (PERF-05 × FEAT-05): Low is the low-end / GPU-bound path (PERF-05 found the residual
//   stutter on weak iGPUs is render-bound), so it disables the per-pixel fbm shader entirely (0).
//   Normal+ keep FEAT-05's tuned look (1.0). The shader gates on uDetailScale > 0.0, so 0 is a kill-switch.
// shadows: drives sun.castShadow (toggled in applyQuality, NOT renderer.shadowMap.enabled — see there).
// propRing: chunk radius passed to propSystem.update() via _propRing.
// resHeight: internal render-resolution cap in px (see applyRenderResolution). null = device-native.
// roadRadius is NOT stored: it is DERIVED from the ring in applyQuality (see there).
// NB the "Normal == construction defaults" convention is GONE — applyQuality('Normal') runs once at
// boot (see the bootstrap, before the route-cache import), so the preset table is authoritative.
// PERF-11: resHeight caps Normal at 1200 lines (~1.5× ratio on the Air's Retina panel — native 2×
// shades ~4× the fragments of 1× for no perceptible gain at game viewing distance; user-approved
// thermal lever 2026-07-13). High/Ultra stay native as the "I have GPU to burn" tiers.
// PERF-12: shadowMap/shadowExtent scale with the tier. What matters is only their RATIO — the world
// size of one shadow texel (extent·2 / mapSize), which is what makes the truck's shadow crisp or
// mushy.
//
// THE EXTENT IS SIZED TO THE TRUCK, NOT TO THE WORLD, because the truck is very nearly the only
// thing that CASTS into this map. Terrain (terrain.js) and road (road-mesh.js) set receiveShadow and
// never castShadow; PERF-07 moved every prop to the baked shadow atlas (castShadow = false unless the
// propCastShadow lever flips it back). The whole realtime caster set is the truck, plus FEAT-46's POI
// cubes. A world-sized frustum was therefore spending its entire texel budget framing geometry that
// contributes nothing to it — which is why the truck's shadow was blocky at any map size we could
// afford. Shrinking extent to ±20 m is what buys the sharpness; the map sizes below are LOWER than
// the world-framed ones they replace and still land 6-12× finer:
//   Normal 1536@±20 → 0.026 m/texel (was 0.156). Same map size as before ⇒ same fill, same VRAM,
//     same pass cost. 6× sharper for free — the truck's 1.8 m width spans ~69 texels, not ~11.
//   High 2048@±20 → 0.020 m/texel, Ultra 3072@±20 → 0.013 m/texel. Both are a map-size REDUCTION
//     (3072→2048, 4096→3072), so High/Ultra get sharper AND cheaper than the world-framed sizing.
//     The pass re-renders every frame the truck moves (PERF-16's `moving` trigger), so that fill is
//     paid continuously while driving — this hands a chunk of it back.
// What the tight extent costs: a caster further than ~20 m from the TRUCK gets no realtime shadow.
// Today that means only distant POI cubes (their shadow dissolves in via QUAL-18's fade as you drive
// up) and props in the non-default realtime-cast mode. The world at large is unaffected — its prop
// shadows come from the baked atlas in the terrain shader, which this frustum never fed.
// The frustum now follows the TRUCK (not the streaming/camera centre) — see the shadow-follow block.
// Range cost is smaller than the extent numbers suggest: QUAL-18's edge fade already dissolved
// shadows over the outer band, so the old ±220 was only fully shadowed to ~158 m anyway.
// shadowTilePx: baked prop-shadow atlas resolution, texels per 64 m chunk (prop-shadow-bake.js).
//   Low = 0 → baked shadows OFF entirely (the tier already kills the realtime sun pass; the atlas is
//   freed, not just hidden). Normal 256 (0.25 m/texel, the shipped look); High 384 and Ultra 512 are
//   the 1.5×/2× density steps the GPU-to-burn tiers can afford (atlas VRAM 85 / 151 MB vs 37 MB —
//   it grows with the SQUARE of this). Applied like detailScale: the tier writes the param, then the
//   sync hook pushes it into the bake system + terrain sampler; the GUI slider overrides live.
// PERF-21 lodRing: chunks of full-3D props around the camera; beyond it (out to propRing) trees
//   render as billboard impostors (~2 tris vs ~150–200). propRing == terrain ring on every tier
//   (user call 2026-07-17: trees to full draw distance — bare distant mountainsides read wrong) —
//   never PAST it, or billboards float in the sky where terrain isn't drawn. The 3D reach: Normal
//   keeps its old all-3D radius as lodRing; High/Ultra keep 5×5 3D; Low billboards beyond the
//   camera chunk (billboards are what its hardware can afford).
// PERF-21 bbRing: billboard-only outer prop ring — trees stream as impostor quads out to the
//   BUILT terrain edge (ring + warm; built chunks are in the scene and drawn), so no drawn
//   mountainside is bare. Beyond propRing only trees commit (no rock/bush slots, no shadow tiles).
const QUALITY_PRESETS = {
  Low:    { ring: 1, warm: 1, fogDensity: 0.012, detailScale: 0,   shadows: false, propRing: 1, lodRing: 0, bbRing: 2, resHeight: 720,  shadowMap: 1024, shadowExtent: 20, shadowTilePx: 0   },
  Normal: { ring: 2, warm: 1, fogDensity: 0.006, detailScale: 1.0, shadows: true,  propRing: 2, lodRing: 1, bbRing: 3, resHeight: 1200, shadowMap: 1536, shadowExtent: 20, shadowTilePx: 256 },
  High:   { ring: 3, warm: 3, fogDensity: 0.004, detailScale: 1.0, shadows: true,  propRing: 3, lodRing: 2, bbRing: 6, resHeight: null, shadowMap: 2048, shadowExtent: 20, shadowTilePx: 384 },
  Ultra:  { ring: 4, warm: 4, fogDensity: 0.003, detailScale: 1.0, shadows: true,  propRing: 4, lodRing: 2, bbRing: 8, resHeight: null, shadowMap: 3072, shadowExtent: 20, shadowTilePx: 512 },
}

// PERF-07: set once the bake system exists (browser only — headless never constructs it), so
// applyQuality can push a tier's shadowTilePx without referencing the not-yet-initialised const.
let _syncBakedShadows = null
// PERF-21: same pattern for the prop billboard impostors (activation + tier lodRing push).
let _syncImpostors = null

// PERF-06: internal render-resolution cap for the CURRENT tier (px height; null = device-native). Held
// at module scope so the resize handler can re-apply the clamp (which depends on innerHeight) without
// re-selecting a tier. A fractional pixelRatio < 1 pins the backing buffer to ~resHeight lines tall
// (aspect-correct) → the GPU shades far fewer fragments on a HiDPI/large panel; Math.min prevents
// upscaling past native on a small window or non-HiDPI display.
let _qualityResHeight = QUALITY_PRESETS.Normal.resHeight
function applyRenderResolution () {
  const ratio = _qualityResHeight == null
    ? window.devicePixelRatio
    : Math.min(window.devicePixelRatio, _qualityResHeight / window.innerHeight)
  renderer.setPixelRatio(ratio)
  renderer.setSize(window.innerWidth, window.innerHeight)  // re-stamp the backing buffer at the new ratio
}

function applyQuality (name) {
  const p = QUALITY_PRESETS[name] ?? QUALITY_PRESETS.Normal
  if (terrainSystem) terrainSystem.setRingRadius(p.ring, p.warm)
  // roadRadius DERIVED from the visible ring (PERF-06): (ring+0.5)·2·CHUNK_SIZE = 2× the terrain axis
  // half-width = the square ring's diagonal corner (×√2) with a ×√2 lead. The road network is a CIRCLE
  // that must enclose the SQUARE terrain ring's corner before it scrolls into view; it is a route/slice
  // radius (CPU), not a draw distance (the ribbon mesh is terrain-chunk-bound via syncToChunkRing). Low/
  // Normal land exactly on today's 192/320; High/Ultra trim 512→448 / 640→576 (the old constants were
  // routed past anything renderable). Tied to ring so it can never drift out of sync with the terrain.
  if (roadSystem) roadSystem.setRadius((p.ring + 0.5) * 2 * CHUNK_SIZE)   // dirty → next update() re-streams
  if (scene.fog) scene.fog.density = p.fogDensity
  // Drive the FEAT-05 detail master from the tier. Mirrors setTerrainUniform: write the param (source
  // of truth + what the debug slider binds to) and push the live uniform to both the terrain and the
  // road-shoulder materials. The debug onChange refreshes the slider display to match.
  if (p.detailScale !== undefined) {
    RANGER_PARAMS.terrainDetailScale = p.detailScale
    if (terrainSystem?._terrainUniforms?.uDetailScale) terrainSystem._terrainUniforms.uDetailScale.value = p.detailScale
    if (roadMeshSystem?._roadUniforms?.uDetailScale)   roadMeshSystem._roadUniforms.uDetailScale.value   = p.detailScale
  }
  // PERF-06 shadows: toggle the directional light's caster flag, NOT renderer.shadowMap.enabled. Flipping
  // shadowMap.enabled forces a full material/shader recompile on every object (a visible hitch); toggling
  // sun.castShadow just skips the shadow pass for that light. Receivers keep receiveShadow → they simply
  // receive no shadow when the caster is off. The frame loop also skips the shadow-frustum-follow then.
  sun.castShadow = p.shadows
  // PERF-12: per-tier shadow map size + ortho extent, applied as one texel-size decision.
  applyShadowResolution(p.shadowMap, p.shadowExtent)
  // PERF-06 prop radius: thin out the scattered-prop ring on Low (read by the loop's propSystem.update).
  _propRing = p.propRing
  _bbRing = p.bbRing ?? p.propRing   // PERF-21: billboard-only tree ring out to built terrain
  // PERF-21 billboard takeover ring: write the param (GUI slider binds to it), push via the hook.
  if (p.lodRing !== undefined && FLORA_PARAMS.lod) {
    FLORA_PARAMS.lod.ring3d = p.lodRing
    if (_syncImpostors) _syncImpostors()
  }
  // PERF-07 baked prop shadows: the tier owns the atlas density (0 on Low = off). Write the param
  // (source of truth + what the GUI slider binds to), then let the sync hook reallocate + re-bake.
  if (p.shadowTilePx !== undefined && FLORA_PARAMS.shadows) {
    FLORA_PARAMS.shadows.tilePx = p.shadowTilePx
    if (_syncBakedShadows) _syncBakedShadows()
  }
  // PERF-06 render resolution: stash the tier's cap, then apply (also re-applied on window resize).
  _qualityResHeight = p.resHeight
  applyRenderResolution()
}

// ── PERF-08 profiling dev handles (TEMP — ?prof=1 only, removed with src/perf.js) ──────────────
// External harness surface (test/profile.mjs over CDP). Same precedent as window.__view: init-time
// one-liners, no frame-loop plumbing. Closures read module-scope systems at CALL time, so they
// survive the seed-rebuild reassignment of terrainSystem/roadSystem/propSystem.
// PERF-26: hitch attribution read-back. __hitchDump() prints the table in the browser console (play
// normally with ?hitch=20, then dump); __hitches() is the structured form the CDP harness reads.
if (_HITCH) {
  window.__hitchDump = () => perfHitchDump()
  window.__hitches = () => perfHitchReport()
  window.__hitchReset = () => { perfHitchReset(); return true }
}
if (_PROF) {
  window.__q = (name) => applyQuality(name)
  // renderer.info snapshot — draw calls / triangles / programs / GPU memory handles.
  window.__ri = () => ({
    calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    points: renderer.info.render.points, lines: renderer.info.render.lines,
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length ?? 0,
  })
  window.__perfData = () => perfSnapshot()
  // FEAT-43: story-mode handle, so the external profiler can measure INSIDE the mode (enter it,
  // wait out the region warm, then drive) instead of only ever profiling free roam.
  window.__story = () => storySystem
  // FEAT-46: the placed POIs, so an external harness can enter the mode and verify the pads/markers
  // without a screenshot. Same read-only precedent as __story / __road.
  window.__poi = () => poiSystem
  // The live mission/run state, so a harness can reach a result card without driving the route.
  window.__mission = () => missionSystem
  // Route-dispatch probe: wraps _routeDispatch on first call to count per-key dispatches —
  // diagnoses warm-loop re-dispatch churn (a key dispatched >2× means a warm scan is spinning).
  let _rdWrap = null
  window.__road = () => {
    const rs = roadSystem
    if (!rs) return null
    if (!_rdWrap && rs._routeDispatch) {
      const orig = rs._routeDispatch
      _rdWrap = { count: 0, keys: new Map() }
      rs._routeDispatch = (jobs, epoch) => {
        _rdWrap.count += jobs.length
        for (const j of jobs) _rdWrap.keys.set(j.key, (_rdWrap.keys.get(j.key) ?? 0) + 1)
        return orig(jobs, epoch)
      }
    }
    return {
      pending: rs._pendingRoutes.size,
      cls: rs._proto.cls?.size ?? 0, clsSolo: rs._proto.clsSolo?.size ?? 0,
      lastWarm: !!rs._lastWarmCenter, epoch: rs._routeEpoch,
      dispatched: _rdWrap?.count ?? 0,
      hot: _rdWrap ? [..._rdWrap.keys.entries()].filter(([, n]) => n > 2).sort((a, b) => b[1] - a[1]).slice(0, 8) : [],
    }
  }
  // World-fill snapshot: harness polls this for time-to-ring-complete + drive telemetry.
  window.__world = () => ({
    chunks: terrainSystem ? terrainSystem._chunkMap.size : 0,
    ring:   terrainSystem ? terrainSystem._ringRadius : 0,
    warm:   terrainSystem ? terrainSystem._warmMargin : 0,
    seed:   worldSeed,   // PERF-27: which world is standing — the reseed harness reads this

    pos:    { x: vehicleState.position.x, y: vehicleState.position.y, z: vehicleState.position.z },
    speed:  Math.hypot(vehicleState.velocity.x, vehicleState.velocity.y, vehicleState.velocity.z),
  })
  // FEAT-39: the GPS system, so the CDP harness can inspect the baked route + live arrow/chevrons
  // (the overlay only draws near the car, so it can't otherwise be probed without driving a run).
  window.__gps = () => gpsSystem
  // FEAT-39 harness: drop the CAR at a spot (unlike __view, which only moves the freecam). Lets the
  // CDP probe frame the real chase-cam approach to a junction without hand-driving there.
  window.__tp = (x, z, heading = 0) => teleportToGround(x, z, heading, 0.5)
  // Single-lever A/B toggles: isolate one cost axis at a time at a fixed preset. Each returns true
  // if applied. NOT persisted anywhere — page reload restores the preset's values.
  const _eachPropMesh = (fn) => { if (propSystem) for (const rec of propSystem._meshes.values()) fn(rec) }
  const LEVERS = {
    sunShadow:        v => { sun.castShadow = !!v; renderer.shadowMap.needsUpdate = true },   // PERF-16 re-arm
    propCastShadow:   v => _eachPropMesh(r => { r.mesh.castShadow = !!v }),
    // Re-enabling culling needs real instance bounds (geometry bounds ≠ world spread). Hidden
    // zero-scale slots collapse to origin, inflating the sphere — acceptable for an A/B.
    propFrustumCulled: v => _eachPropMesh(r => { if (v) r.mesh.computeBoundingSphere(); r.mesh.frustumCulled = !!v }),
    // PERF-10 shipped native compaction (mesh.count tracks the occupied prefix `top`); this lever
    // now A/Bs the OLD full-capacity draw (v=0) against the compacted default (v=1).
    propCountCompact: v => _eachPropMesh(r => { r.mesh.count = v ? r.top : r.cap }),
    detailScale:      v => {
      RANGER_PARAMS.terrainDetailScale = v
      if (terrainSystem?._terrainUniforms?.uDetailScale) terrainSystem._terrainUniforms.uDetailScale.value = v
      if (roadMeshSystem?._roadUniforms?.uDetailScale)   roadMeshSystem._roadUniforms.uDetailScale.value   = v
    },
    pixelRatio:       v => { renderer.setPixelRatio(Math.min(window.devicePixelRatio, v)); renderer.setSize(window.innerWidth, window.innerHeight) },
    // Both shadow levers go through applyShadowResolution, so SHADOW_TEXEL tracks them. It used to be
    // left computed for the preset while these moved the real values — the snap granularity drifted
    // and the A/B measured a subtly shimmering shadow. Dial texel size live with these two:
    //   __lever('shadowExtent', 120)  ·  __lever('shadowMapSize', 4096)
    shadowMapSize:    v => applyShadowResolution(v, null),
    shadowExtent:     v => applyShadowResolution(null, v),
    fogDensity:       v => { if (scene.fog) scene.fog.density = v },
    ring:             v => { if (terrainSystem) terrainSystem.setRingRadius(v, 1); if (roadSystem) roadSystem.setRadius((v + 0.5) * 2 * CHUNK_SIZE) },
    // PERF-27 item 3: the world reseed, as a lever. It is the same applyWorldSeed() the debug seed
    // field and Story Mode's seed prompt call, so the harness measures the shipping path — and it
    // returns the awaitable Path-B rebuild promise (see __lever below).
    changeSeed:       v => applyWorldSeed(v),
  }
  // PERF-27 item 3: levers whose work is ASYNC (changeSeed → the awaitable Path-B rebuild) return
  // their promise so a CDP harness can await the real completion instead of guessing at an
  // observable edge. The chunk ring is NOT such an edge: rebuildAllChunksFromWorker is the LAST
  // line of _rebuildFullNow, so the ring only dips after the rebuild is already paid.
  window.__lever = (name, value) => {
    const fn = LEVERS[name]; if (!fn) return false
    const r = fn(value)
    return r instanceof Promise ? r.then(() => true) : true
  }
  // QUAL-21 A/B: flip a road param and re-route through the SAME debounced path the debug
  // sliders take (params mutated in place → debouncedRoadRebuild) — lets the CDP screenshot
  // harness A/B the road toggles without the GUI.
  window.__roadParam = (k, v) => { RANGER_PARAMS[k] = v; debouncedRoadRebuild(); return RANGER_PARAMS[k] }
}

// Phase 6 (TERR-06): pass setRampVisible callback so the Ramp Visible toggle in debug.js
// can control rampMesh visibility without requiring debug.js to import rampMesh directly.
// Phase 7 (SEED-04 / D-09): rebuildTerrainFull = Path B debounced rebuild (Worker reinit + re-seat);
//   changeSeed = update worldSeed then fire Path B.
const _gui = initDebug(RANGER_PARAMS, {
  setRampVisible:      (v) => { rampMesh.visible = v },
  applyQuality:        (name) => applyQuality(name),   // PERF-06: master Quality tier (draw distance + shadows + props + res)
  rebuildTerrain:      ()  => { if (terrainSystem) terrainSystem.rebuildAllChunks() },
  rebuildTerrainFull:  ()  => debouncedRebuildFull(),
  changeSeed:          (v) => applyWorldSeed(v),
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
  // FEAT-05: live-update a procedural-detail shader uniform on both the terrain and road-shoulder
  // materials (shared names like uDetailScale/uNoiseScale update both; material-specific names hit
  // only the one that has them). No rebuild — the change shows on the next frame.
  setTerrainUniform: (name, value) => {
    if (terrainSystem?._terrainUniforms?.[name]) terrainSystem._terrainUniforms[name].value = value
    if (roadMeshSystem?._roadUniforms?.[name])   roadMeshSystem._roadUniforms[name].value = value
  },
}, { initialSeed: _urlSeed ?? '6' })

// Body paint color picker (visual-model) — recolors the imported truck's paint coat live.
const _bodyColor = { color: '#2f6da4' }
_gui.addColor(_bodyColor, 'color').name('Body color').onChange((v) => setBodyColor(v))

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
// PERF (Tier 1): road stream radius ~matches the terrain ring (5×5 chunks ≈ 160–226 m), not 640 m.
// Routing/slicing cost scales with this area; 640 m routed ~16× the terrain footprint. 320 m covers
// the visible terrain ring with margin while cutting cold-stream + per-crossing re-stream cost.
roadSystem.setRadius(320)

// ── Story mode (beta): par-graded missions ───────────────────────────────────
// The testing harness for the par economy — see src/mission.js and .planning/story-mode/DESIGN.md.
// Entered from the pause menu so a visitor is never dropped into an unfinished mode by default.
// getRoad is a GETTER: roadSystem is swapped on seed regen (see the regen path above).
// ── Story-mode planner pre-warm ──────────────────────────────────────────────
// Routing is ~99% of the cost of building the 2.2 km planning network (measured: 19.5 s cold vs
// 0.21 s once the per-connection route cache is populated). So rather than making the player wait
// on "planning a job", we pre-route the band OFF-THREAD on the road Worker and keep a ready
// instance around. Story mode then opens instantly, and regenerates are ~0.2 s.
//
// Kicked off after boot, on any seed change, and when the player drifts past PLAN_RESTREAM_MOVE.
// The warm is pure worker traffic plus one ~0.2 s stream at the end — no main-thread hitch.
let _plannerWarm = null      // { seed, road, center, ready, timer }
// -Infinity, NOT 0: with 0 the throttle below reads as "last warmed at page-load time", so the
// FIRST warm could not start until 20 s in — and a refresh-then-story-mode hit the cold path
// every time, which is exactly the hang this is meant to remove.
let _plannerWarmAt = -Infinity   // last warm start (throttles drift re-warms only)

function _buildPlannerRoad (seed) {
  const r = new RoadSystem(seed, RANGER_PARAMS)
  if (roadWorker) {
    roadWorker.registerClient('mission', r)
    r.setRouteDispatcher((jobs, epoch) => roadWorker.postRouteJobs('mission', jobs, epoch))
  }
  // Ponds first: setWaterNoGo calls _invalidateProto, which clears the route caches it can see —
  // it must run BEFORE adopting play's warm ones or it would wipe them.
  if (_waterNoGoFns) r.setWaterNoGo(_waterNoGoFns[0], _waterNoGoFns[1])
  if (roadSystem && roadSystem._worldSeed === seed) {
    const p = roadSystem._proto, q = r._proto
    q.cls = (p.cls ??= new Map())
    q.clsSolo = (p.clsSolo ??= new Map())
  }
  return r
}

function _startPlannerWarm (seed, cx, cz) {
  if (_plannerWarm?.timer) clearTimeout(_plannerWarm.timer)
  const road = _buildPlannerRoad(seed)
  road.setRadius(MISSION_PLAN_RADIUS)
  const center = new THREE.Vector3(cx, 0, cz)
  const rec = { seed, road, center: { x: cx, z: cz }, ready: false, timer: 0 }
  _plannerWarm = rec
  _plannerWarmAt = performance.now()
  const pump = () => {
    if (_plannerWarm !== rec) return                     // superseded by a newer warm
    let done = false
    try { done = road.warmBandComplete(center) } catch (e) { console.warn('[mission] warm failed', e); return }
    if (!done) { rec.timer = setTimeout(pump, 250); return }
    // Every connection is cached now, so this last step is the cheap one.
    road.update(center)
    rec.ready = true
  }
  rec.timer = setTimeout(pump, 0)
}

// ── FEAT-46: story-mode POIs — orange marker cubes on their own lay-by pads ─────────────────
// Story mode only. The pads are handed to the RoadSystem carve AFTER the region is routed and
// frozen (story.js's onRegionLive), which is what keeps the ratified rule — POIs never influence
// routing determinism — structural: free roam never calls build(), so it never sets a pad, and the
// same seed produces the same roads, the same surface and the same par in both modes.
//
// POI knobs live in POI_PARAMS, deliberately NOT in RANGER_PARAMS: that object feeds routeCacheSig,
// and a poi* key landing in it would re-key every baked route bundle for a marker's size.
const poiSystem = new PoiSystem({
  getRoad:    () => roadSystem,
  getWater:   () => waterSystem,
  getTerrain: () => terrainSystem,
  getSeed:    () => worldSeed,
  getParams:  () => RANGER_PARAMS,
})

// FEAT-45: dispersed-camping zones. Same isolation + same params discipline as the POI layer above
// (CAMP_PARAMS is outside RANGER_PARAMS for the routeCacheSig reason), and the same story-only
// lifecycle: built from the story deps when the region goes live, cleared on exit, so free roam
// never has a zone and pays nothing. Zones are pure f(seed, macro cell) — they read nothing from
// the world, so unlike POIs there is no carve or re-bake to trigger here.
const campSystem = new CampSystem({
  getRoad:   () => roadSystem,
  getSeed:   () => worldSeed,
  getParams: () => RANGER_PARAMS,
})

const _poiGroup = new THREE.Group()
_poiGroup.name = 'poi-markers'
scene.add(_poiGroup)
// Placeholder art (FEAT-43's word): an orange cube standing on the pad. Emissive so it reads at
// distance under the sky's ACES tone mapping without needing its own light.
const _poiCubeGeo = new THREE.BoxGeometry(POI_PARAMS.poiCubeSize, POI_PARAMS.poiCubeSize, POI_PARAMS.poiCubeSize)
const _poiCubeMat = new THREE.MeshStandardMaterial({ color: 0xff7a18, emissive: 0x3a1a00, roughness: 0.55 })

/** Rebuild the marker cubes from the current POI list (cheap: a handful of boxes per region). */
function _rebuildPoiMarkers () {
  _poiGroup.clear()   // geometry + material are shared singletons — nothing per-cube to dispose
  const half = POI_PARAMS.poiCubeSize * 0.5
  for (const q of poiSystem.list()) {
    const cube = new THREE.Mesh(_poiCubeGeo, _poiCubeMat)
    cube.position.set(q.x, q.y + half, q.z)
    cube.castShadow = true
    _poiGroup.add(cube)
  }
}

// ── FEAT-47: the story-mode day clock ──────────────────────────────────────────────────────
// Story mode only: started when the region goes live, stopped on exit (see the story deps below),
// and a no-op every frame in between in free roam. Its one output today is the sky hour — pushed on
// a quantized ladder because each push re-bakes the sky cubemap and the prop impostor atlas
// (skySystem.onLookApplied, below). DAY_PARAMS lives in day.js, out of RANGER_PARAMS/routeCacheSig,
// for the same reason POI_PARAMS does.
const daySystem = new DaySystem({
  setTimeOfDay: (h) => skySystem.setTimeOfDay(h),
})

// Eyelid overlay drive (FEAT-47). Elements cached once; the frame loop writes nothing but the two
// transforms. f = 0 → lids fully retracted off-screen, f = 1 → shut. The lids sit off-screen at
// rest, so the overlay costs a composited layer and nothing else while no blink is running.
const _dozeTopLid = document.querySelector('#doze-overlay .lid-top')
const _dozeBotLid = document.querySelector('#doze-overlay .lid-bottom')
let _dozeLastF = -1
function _updateDozeOverlay (f) {
  if (!_dozeTopLid || f === _dozeLastF) return   // skip the DOM write when nothing moved
  _dozeLastF = f
  const pct = (1 - f) * 100
  _dozeTopLid.style.transform = `translateY(${-pct}%)`
  _dozeBotLid.style.transform = `translateY(${pct}%)`
}

const _misFwd = new THREE.Vector3()
missionSystem = new MissionSystem({
  getRoad:  () => roadSystem,
  getSeed:  () => worldSeed,
  // A DEDICATED read-only RoadSystem for planning, built the same way map2d builds its own.
  // The play instance only holds a ~320 m window, and widening it would re-shape the road under
  // the truck (the crossing cull is window-sensitive — BUG-25). The planner streams a real,
  // CULLED network so a mission can only ever propose roads that actually exist.
  makePlanner: (seed, cx, cz, radius) => {
    // Warm instance ready and still centred near the player? Then this is ~0.2 s, not ~5 s.
    const w = _plannerWarm
    if (w?.ready && w.seed === seed && Math.hypot(w.center.x - cx, w.center.z - cz) < PLAN_RESTREAM_MOVE) {
      w.road.setRadius(radius)
      w.road.update(new THREE.Vector3(cx, 0, cz))
      return w.road
    }
    const r = _buildPlannerRoad(seed)
    r.setRadius(radius)
    r.update(new THREE.Vector3(cx, 0, cz))   // cold path: routes uncached, this is the hang
    return r
  },
  // Richer than the arrival check needs: the run export records a driven trace, and throttle /
  // brake / steer are what make it useful for fitting anything later.
  getCar:   () => {
    _misFwd.set(0, 0, -1).applyQuaternion(vehicleState.quaternion)
    return {
      x: vehicleState.position.x, y: vehicleState.position.y, z: vehicleState.position.z,
      speed: Math.hypot(vehicleState.velocity.x, vehicleState.velocity.z),
      heading: Math.atan2(_misFwd.x, _misFwd.z),
      throttle: vehicleState.throttle, brake: vehicleState.brake, steer: vehicleState.steerAngle,
    }
  },
  // FEAT-43: the story region, when one is live. Confines the whole mission inside the wall and
  // anchors the planner window on the region centre instead of letting it follow the car. Null in
  // free roam, which leaves Quick Job's original player-centred behaviour exactly as it was.
  getRegion: () => storySystem?.region() || null,
  teleport: (x, z, heading) => teleportToGround(x, z, heading, 0.5),
  // FEAT-46: accepting a job moves the spawn to where the run begins — the POI pad you're parked on,
  // or the start pin you were just seated at. Taking the job is the commitment, so it is also the
  // checkpoint: reset (R) puts you back on the job you took, not wherever you last happened to stop.
  // Reuses setSpawnHere() so there is ONE spawn-override write path, not a second that could drift.
  setSpawn: () => setSpawnHere(),
  setMapOpen: (open) => {
    if (!open) { map2d.hide(); return }
    map2d.show()
    // Frame the whole job so the route reads at a glance instead of running off the edge.
    const mk = missionSystem?.markers()
    if (mk?.poly?.length) {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
      for (const p of mk.poly) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z }
      map2d.frameBounds(x0, z0, x1, z1)
      // The mission plans over a wider network than the map streams by default, so tell the map how
      // far it has to build. Otherwise the route runs past the edge of the drawn network and looks
      // like an invented road.
      const car = vehicleState.position
      const reach = Math.max(
        Math.hypot(x0 - car.x, z0 - car.z), Math.hypot(x1 - car.x, z1 - car.z),
        Math.hypot(x0 - car.x, z1 - car.z), Math.hypot(x1 - car.x, z0 - car.z))
      map2d.setRadiusTarget(reach + 300)
    }
  },
  onChange: () => _renderMissionUI(),
})

// ── FEAT-39: GPS navigation assist ───────────────────────────────────────────
// A pure guidance overlay: chevrons along the route ahead + a turn arrow over the next junction.
// It reads the route the mission ALREADY computed (mission.segments) — no routing, no RoadSystem
// query, and nothing anywhere near the input/physics path. Shown only once the run is live: during
// 'offer' the truck has not been teleported to the start yet, so arrows would point off elsewhere.
gpsSystem = new GpsSystem(scene, {
  getRoute: () => {
    const s = missionSystem?.state
    return (s === 'countdown' || s === 'running') ? missionSystem.mission : null
  },
  getCar: () => vehicleState.position,
})
// FEAT-41 seam: the story-mode assists page will flip this (mirrors window.__setGameMode).
window.__setGpsEnabled = (v) => gpsSystem?.setEnabled(v)

// ── FEAT-31: the testing lab ─────────────────────────────────────────────────
// An isolated flat world with painted, auto-timed tracks. Grid world only ever hid the TERRAIN
// chunks, so the ribbons/props/water stayed floating at their real elevations and every worldgen
// system kept streaming — the flat world read as "parked underneath the real one". enterLab()
// tears the generated world down properly (see below) and puts a bare plane + tracks in its place.
labSystem = new LabSystem(scene, () => ({
  x: vehicleState.position.x,
  z: vehicleState.position.z,
  speed: Math.hypot(vehicleState.velocity.x, vehicleState.velocity.z),
  brake: vehicleState.brake,
  throttle: vehicleState.throttle,
}))

// ── FEAT-46: POI interaction ────────────────────────────────────────────────────────────────
// Within range of a marker cube, with no job already in flight → "park to begin mission". The
// prompt is NOT speed-gated (owner, 2026-07-29): it is an instruction, and hiding it until you had
// already slowed down meant the one thing telling you to stop only appeared once you had. So it
// reads at any speed as you pass the lay-by; what it asks for is what actually arms the offer.
// The mission that follows starts where you sit — no teleport (owner, 2026-07-28) — so the countdown
// runs out from under you on the pullout.
//
// THE TRIGGER IS THE PARKING BRAKE (owner, 2026-07-29), not a dedicated key: you roll into the
// lay-by, Space-latch the brake, and the offer opens. That reuses a control the player already has
// to use to stay put on a graded pad, and it means "taking a job" is the same physical act as
// parking — no interact key to advertise. Same rule will gate camping (FEAT-45): stop, latch,
// dialogue. The edge is what fires, so sitting latched next to a marker (or spawning latched) never
// re-opens an offer you just declined — you must release and re-pull. The run then launches with
// your own parking brake still latched, which is fine: W both drops the latch and drives away in one
// motion (vehicle.js's park state machine), the same as pulling away for real.
/**
 * The POI whose offer the player could open from here, or null. Proximity + mode only: there is no
 * speed gate, because the parking-brake latch IS the speed gate — vehicle.js only lets it engage
 * below ~5 km/h, so a moving truck cannot fire the trigger no matter how close the marker is.
 */
function _poiInReach () {
  if (!storySystem.isActive() || storySystem.isEntering()) return null
  if (missionSystem && missionSystem.state !== 'idle') return null
  return poiSystem.nearest(vehicleState.position.x, vehicleState.position.z)
}

// Rising edge of the parking-brake latch (vehicleState.parked), sampled where the prompt is polled.
// Starts TRUE because a spawn/teleport seats the truck already latched — an offer must never open
// from a latch the player did not pull. The latch is sticky (a tap sets it and it stays), so polling
// at the prompt's ~10 Hz cadence cannot miss a real pull.
let _prevParkedForPoi = true

/**
 * The POI proximity prompt AND the parking-brake trigger behind it. One function because they are
 * one affordance: whatever the prompt is offering is exactly what latching the brake does.
 */
function _updatePoiPrompt () {
  const el = document.getElementById('poi-prompt')
  const poi = _poiInReach()
  const parked = !!vehicleState.parked
  const pulled = parked && !_prevParkedForPoi
  _prevParkedForPoi = parked
  if (poi && pulled) {
    missionSystem.enterFromPoi(poi)      // leaves 'idle' ⇒ _poiInReach() is null from here on
    if (el) el.style.display = 'none'
    return
  }
  if (!el) return
  el.style.display = poi ? 'block' : 'none'
  if (poi) el.textContent = 'park to begin mission'
}

// Story-mode DOM. Two surfaces: the offer/result panel (over the map) and the in-run HUD.
// SM-INV-3 — par NEVER appears while driving; the result card is the only place it is shown.
function _renderMissionUI () {
  const panel = document.getElementById('mission-panel')
  const body  = document.getElementById('mp-body')
  const hud   = document.getElementById('mission-hud')
  const acts  = document.getElementById('mp-actions')
  if (!panel || !body || !hud) return
  const m = missionSystem
  const show = (el, on, disp = 'block') => { el.style.display = on ? disp : 'none' }
  const km = (mm) => (mm / 1000).toFixed(2) + ' km'

  const btn = (id, on) => { const b = document.getElementById(id); if (b) b.style.display = on ? '' : 'none' }

  switch (m.state) {
    case 'generating':
      show(panel, true); show(hud, false)
      // The planner streams a real, culled network the first time (and after a seed change or a
      // long walk), which takes a few seconds — say so rather than looking hung.
      body.innerHTML = 'planning a job&hellip;<br><span class="mp-dim">building the road network for this area</span>'
      show(acts, false, 'flex')
      show(document.getElementById('mp-export-row'), false)
      break
    case 'offer': {
      show(panel, true); show(hud, false); show(acts, true, 'flex')
      const j = m.mission
      body.innerHTML = `<span class="mp-big">${km(j.distance)}</span> &nbsp;<span class="mp-dim">`
        + `${j.edges} leg${j.edges === 1 ? '' : 's'}</span><br>`
        // FEAT-46: a POI job does NOT move you — you are already parked at the marker, and claiming
        // otherwise would have the panel lying about the one thing the player is about to feel.
        + (j.fromPoi
          ? `<span class="mp-dim">starts here &mdash; the clock runs from where you're parked</span>`
          : `<span class="mp-dim">green pin is the start &mdash; you'll be moved there</span>`)
      // FEAT-46: the offer is exactly three actions — decline · regenerate · accept.
      btn('mp-accept', true); btn('mp-decline', true); btn('mp-retry', false)
      btn('mp-regen', true); btn('mp-quit', false)
      show(document.getElementById('mp-export-row'), false)
      // Clear the per-run note so the previous run's note cannot ride along with the next export.
      // The DRIVER name is deliberately NOT cleared — it is per-session, and re-typing it every run
      // is exactly how you end up with three spellings of one person in the dataset.
      const _n = document.getElementById('mp-note'); if (_n) _n.value = ''
      break
    }
    case 'countdown':
      show(panel, false); show(hud, true)
      hud.innerHTML = `<span class="mh-count">${Math.max(1, Math.ceil(m.countdown))}</span>`
      break
    case 'running':
      show(panel, false); show(hud, true)
      // Elapsed + distance to go ALONG THE ROUTE (crow-flies grew while driving a winding route
      // correctly, which read as "wrong way"). No par, no target — SM-INV-3.
      hud.textContent = `${formatTime(m.elapsed)}   ${km(m.routeRemaining())} to go`
      break
    case 'done': {
      show(panel, true); show(hud, false); show(acts, true, 'flex')
      const r = m.result
      const sign = r.margin >= 0 ? '+' : '−'
      const col = r.margin >= 0 ? '#8ce99a' : '#ff8f7a'
      body.innerHTML = `<span class="mp-big" style="color:${col}">${r.letter}</span><br>`
        + `your time <b>${formatTime(r.elapsed)}</b> &nbsp;<span class="mp-dim">/</span>&nbsp; `
        + `par <b>${formatTime(r.par)}</b><br>`
        + `<span style="color:${col}">${sign}${formatTime(Math.abs(r.margin))} vs par</span>`
      // The result card is exactly three actions: retry · continue · back to free roam (that is the
      // DOM order too). The calibration form above them stays — the subjective read is the ground
      // truth PAR_REF is fitted to, and it is only reliably captured here, in the same click.
      btn('mp-accept', true); btn('mp-decline', false); btn('mp-retry', true)
      btn('mp-regen', false); btn('mp-quit', true)
      show(document.getElementById('mp-export-row'), true)
      // The accept button doubles as CONTINUE here — one obvious forward action, with "retry"
      // beside it to re-run the same route (testing/calibration: a known-road second lap).
      const nb = document.getElementById('mp-accept')
      if (nb) nb.textContent = 'continue'
      break
    }
    default:
      show(panel, false); show(hud, false)
      show(document.getElementById('mp-export-row'), false)
      if (m.error) console.info('[mission]', m.error)
      break
  }
  if (m.state === 'offer') {
    const nb = document.getElementById('mp-accept')
    if (nb) nb.textContent = 'accept mission'
  }
}

// FEAT-46: the mission panel's seed control is GONE. You choose the world when you enter story mode
// (#story-seed-modal), and offering it again in the job panel meant a full world rebuild could fire
// under a live mission planner mid-run. The debug panel's seed field remains the one testing path.

// Keep typed text out of the world (WASD/M/Esc would otherwise drive/toggle while typing).
for (const id of ['mp-note', 'mp-driver']) {
  document.getElementById(id)?.addEventListener('keydown', (e) => e.stopPropagation())
}

// Buttons. Same null-guarded module-eval wiring as every other control in this file (WR-04).
document.getElementById('mp-accept')?.addEventListener('click', () => {
  // On the result card this button is CONTINUE: put the finished run down and carry on driving in
  // story mode. It no longer auto-rolls the next job — with POIs as the job source, the next one is
  // something you go and find, not something handed to you at the drop point.
  if (missionSystem.state === 'done') missionSystem.exit(); else missionSystem.accept()
})
// FEAT-46: DECLINE puts the job down and leaves you in story mode with nothing active — it does not
// leave the mode. (Leaving is the pause menu's job, and #mp-quit in the result card.) Walking away
// from an offer is an ordinary thing to do; quitting the game mode is not.
document.getElementById('mp-decline')?.addEventListener('click', () => missionSystem.exit())
document.getElementById('mp-regen')?.addEventListener('click', () => missionSystem.regenerate())
document.getElementById('mp-retry')?.addEventListener('click', () => missionSystem.retry())
// FEAT-30 calibration: dump the finished run's route shape + score to a file. A score alone can't
// explain "felt slow, got S" — the grade and curvature profile par actually priced is what does.
// The `felt` label rides along because it IS the calibration target: par is being fitted to make
// "felt on par" land at ratio 1.00. Capturing it here, in the same click, is the only way it
// reliably survives to the dataset. See runs/README.md and `npm run runs:report`.
for (const b of document.querySelectorAll('.mp-felt')) {
  b.addEventListener('click', () => {
    const note = document.getElementById('mp-note')?.value?.trim() ?? ''
    const data = missionSystem.exportRun(note)
    if (!data) return
    data.felt = b.dataset.felt
    data.driver = document.getElementById('mp-driver')?.value?.trim() || null
    data.seed = worldSeed
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `rangersim-run-${data.driver ? data.driver.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-' : ''}`
      + `${data.felt}-${data.result.letter ?? 'x'}-${Math.round(data.result.elapsed_s)}s.json`
    a.click()
    URL.revokeObjectURL(a.href)
    const label = b.textContent
    b.textContent = 'saved ✓'
    setTimeout(() => { b.textContent = label }, 1500)
  })
}
document.getElementById('mp-quit')?.addEventListener('click', () => {
  missionSystem.exit()
  // FEAT-43: Quick Job runs INSIDE story mode, so "back to free roam" leaves the whole mode —
  // route through StorySystem.exit() to restore streaming radii + debug tooling. If a mission was
  // somehow live outside story mode (legacy path), just drop the game mode.
  if (storySystem.isActive()) storySystem.exit()
  else window.__setGameMode('freeroam')
})

// Phase 9 (SURF-01 / SURF-03): RoadMeshSystem — ribbon mesh sweep with crown + camber.
// Constructed after both terrainSystem and roadSystem exist.
// setRoadSystem() wires the carve hook in analyticHeight so physics feels the road surface.
terrainSystem.setRoadSystem(roadSystem)
// QUAL-08: the road pre-warms its centerline cache off-thread via a DEDICATED road-network Worker
// (not the terrain Worker — that's the BUG-26 fix), so the per-crossing arc-search hitch never lands on
// the main thread AND route jobs never starve terrain generate. RoadSystem no-ops the dispatcher when
// unset (headless gates / USE_WORKER_ROUTING=false), keeping the synchronous fallback behaviour.
let roadWorker = null
if (USE_WORKER_ROUTING) {
  roadWorker = new RoadRouteWorker()
  roadWorker.init(worldSeed, RANGER_PARAMS)
  roadWorker.registerClient('play', roadSystem)
  roadSystem.setRouteDispatcher((jobs, epoch) => roadWorker.postRouteJobs('play', jobs, epoch))
  // QUAL-08: the Map2D dev overlay routes its own read-only network off the same Worker (client 'map').
  map2d.setRouteWorker(roadWorker)
  // QUAL-14 perf: map shares the play route cache (getter — play swaps instances on seed regen).
  map2d.setSharedRouteSource(() => roadSystem)
}
roadMeshSystem = new RoadMeshSystem(
  scene, roadSystem,
  (x, z) => terrainSystem.rawHeightWorld(x, z),  // CR-04: carve-free — no crown/camber/pothole baked into design-grade window
  RANGER_PARAMS,
  worldSeed  // D-03: roadQuality determinism requires the world seed
)

// FEAT-22/17/18: water — needs terrainSystem.rawHeightWorld, alive now. Seed-deterministic like
// props. BEFORE PropSystem: the scatter's waterAt sampler must see the current water from the very
// first chunk, and BEFORE the first roadSystem.update(): setWaterNoGo (inside) reshapes the network.
rebuildWaterSystem()
// FEAT-06: prop system — needs terrain (height/normal) + road (exclusion) + water samplers, all alive now.
propSystem = new PropSystem({ scene, worldSeed, samplers: makePropSamplers() })

// PERF-07: baked prop-shadow atlas. Needs the WebGL renderer (absent headless — this whole block is
// browser-only). Wires the atlas texture into the terrain sampler, the bake triggers into the prop
// system, and the static sun direction into the projection shear. In realtime-cast mode the terrain
// strength is 0 (props keep casting into the sun's shadow map instead).
const shadowBake = new ShadowBakeSystem(renderer, FLORA_PARAMS.shadows?.tilePx ?? TILE_PX)
shadowBake.setSun(skySystem.sunDirection)
// Baked strength is 0 whenever the bake can't stand in: realtime-cast mode, or tilePx 0 (Low tier
// turns baked prop shadows off outright — no atlas exists to sample).
const propShadowStrength = () =>
  (FLORA_PARAMS.shadows?.castRealtime || !shadowBake.enabled) ? 0 : (FLORA_PARAMS.shadows?.strength ?? 0.34)
// Keep the bake system + terrain sampler in lockstep with FLORA_PARAMS.shadows (prop-debug's mode
// toggle / strength / fade / resolution sliders and applyQuality's tier all write the params then
// call this). A tilePx change reallocates the atlas, so every live chunk must re-mark its tile —
// that is exactly what setShadowBake() does, so re-run it.
const applyPropShadowMode = () => {
  const resized = shadowBake.setTilePx(FLORA_PARAMS.shadows?.tilePx ?? TILE_PX)
  const realtime = !!FLORA_PARAMS.shadows?.castRealtime
  propSystem.setShadowCasting(realtime)
  if (resized) propSystem.setShadowBake(shadowBake)   // re-mark live chunks into the new atlas
  terrainSystem.setShadowAtlas(shadowBake.atlasTexture, ATLAS_N, shadowBake.tilePx, propShadowStrength())
  terrainSystem.setShadowFade(FLORA_PARAMS.shadows?.fadeStart ?? 240, FLORA_PARAMS.shadows?.fadeEnd ?? 380)
}
_syncBakedShadows = applyPropShadowMode   // lets applyQuality push a tier's shadowTilePx (see there)
propSystem.setShadowBake(shadowBake)
applyPropShadowMode()   // apply the params' fade bounds at boot (uniform defaults are placeholders)
// PERF-07 dev handle: A/B baked vs realtime prop shadows from the console / CDP harness.
window.__propShadows = (realtime) => { FLORA_PARAMS.shadows.castRealtime = !!realtime; applyPropShadowMode() }

// PERF-21: billboard impostors for distant props (browser-only — needs the renderer for the atlas
// bake). Re-run after any PropSystem recreation (GUI rebuild / seed change) — the fresh instance
// boots impostor-less. The atlas is lit by the current sky look; re-bake it when the look changes.
const applyPropImpostors = () => {
  propSystem.setImpostors(renderer, { sun, ambient, sunDir: skySystem.sunDirection })
  propSystem.setLodRing(FLORA_PARAMS.lod?.ring3d ?? 2)
}
_syncImpostors = applyPropImpostors
applyPropImpostors()
skySystem.onLookApplied = () => propSystem.rebakeImpostors()

// FEAT-06: live-tuning GUI (self-contained — attaches to the existing _gui, doesn't touch debug.js).
addPropGui(_gui, {
  params: FLORA_PARAMS,
  rebuild: () => {
    propSystem.dispose()
    propSystem = new PropSystem({ scene, worldSeed, samplers: makePropSamplers() })
    shadowBake.clear()
    propSystem.setShadowBake(shadowBake)
    applyPropShadowMode()
    applyPropImpostors()   // PERF-21: fresh instance boots impostor-less
  },
  getPropSystem: () => propSystem,   // PERF-07: live handle for the shadow-cast toggle (survives rebuild)
  onShadowModeChange: applyPropShadowMode,   // PERF-07: mode/strength toggle → sync casting + atlas strength
})
// FEAT-39: GPS assist toggle (self-contained folder, same pattern as the props one).
addGpsGui(_gui, gpsSystem)
// QUAL-02: sky/lighting tuning folder (self-contained — attaches to _gui like the props folder).
skySystem.addGui(_gui)
// FEAT-47: story day clock folder (self-contained, same pattern). Hidden by the debug lockout.
daySystem.addGui(_gui)
// FEAT-14: vehicle cast-light tuning folder (headlight beams + rear lamp pools).
addLightGui(_gui)
// User pref: every lil-gui section collapsed by default (the root panel stays open). Runs after ALL
// folders exist (debug + props), so it covers debug.js's folders without editing debug.js.
_gui.foldersRecursive().forEach((f) => f.close())

// Phase 7 (D-14/15/16): initial-load seat via canonical resolveSpawn + analyticHeight ground-probe.
// TerrainSystem is now alive and analyticHeight is immediately available (no chunk load required).
// This overrides the vehicleState.position set during declaration (which used origin + _spawnEq.bodyY).
perfMark('init: systems created, before spawn reseat')  // TEMP (D-arc)
// PERF-11/12: apply the default tier ONCE at boot. Until now "Normal == construction defaults"
// held by convention; Normal now differs (resHeight 1200, shadow 1536@±160), so the preset must
// actually run. Idempotent for the fields that do match; systems exist at this point, so the
// ring/radius calls are real (and no-ops at the default ring).
applyQuality('Normal')
// QUAL-14 perf: import the bundled default-world route cache (shipped world boots without
// routing at all; other seeds miss and route on the pool), then reseat (top-level await —
// main.js is a module, so everything below, including the render loop start, waits).
// resolveSpawn warms each band it streams on the worker POOL before touching it, so the old
// 20 s+ synchronous cold-load block becomes a parallel, event-loop-friendly wait.
await _importSessionOrBundledRoutes()
await _reseatTruckAtSpawn()
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
  // FEAT-43: collision-sphere debug is part of the debug tooling locked out in story mode.
  if (e.key === '`' && !storySystem.isActive()) {
    _dbgSpheresOn = !_dbgSpheresOn
    _dbgSpheres.forEach(m => { m.visible = _dbgSpheresOn })
  }
  // FEAT-16: M toggles the 2D top-down map overlay (sim keeps running underneath).
  if (e.key === 'm' || e.key === 'M') {
    // FEAT-43: in story mode, make the map build out to the region boundary so the drawn wall sits
    // on drawn roads instead of on blank map. Cheap here — the region's routes are already cached.
    const _reg = storySystem.region()
    if (_reg) { map2d.setRadiusCap(_reg.r + 400); map2d.setRadiusTarget(_reg.r + 200) }
    map2d.toggle()
    // Freecam pointer-lock swallows the mouse for FPS look — release it so the map is
    // interactive. The canvas click handler in camera.js re-locks it on return to freecam.
    if (document.pointerLockElement) document.exitPointerLock()
  }
})

// ── FEAT-31: the lab floor (grid + pad) ──────────────────────────────────────
// A metre grid and a ground plane at y=0, shown only in the testing lab. Both recenter on the view
// each frame (the grid snapped to its cell size so its lines appear stationary rather than
// crawling) so the floor reads as INFINITE while driving — see the loop.
const LAB_FLOOR_SIZE = 1000       // m span; large enough that the follow never shows an edge

// The pad the tracks are painted on, with the reference grid drawn INTO it by the fragment shader
// rather than as geometry. THREE.GridHelper draws 1-px LineSegments: at a grazing angle the cell
// spacing goes sub-pixel, the rasteriser keeps or drops each line arbitrarily, and whole families of
// lines vanish or shimmer (the long-standing grid-world aliasing). A shader grid measures the cell
// coordinate's screen-space derivative (fwidth) and widens the line to at least one pixel, so a
// receding grid fades smoothly to a flat tone instead of tearing itself apart. It is also cheaper
// than the geometry it replaces — one extra material on one quad against 402 line segments — so it
// is NOT quality-gated; there is nothing to save by turning it off.
// Physics never reads this mesh; it reads LabSystem.groundHeight.
const LAB_GRID_FINE = 5           // m — minor cell
const LAB_GRID_MAJOR = 25         // m — major cell
const _labFloorMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uBase:  { value: new THREE.Color(0x33373c) },
    uMinor: { value: new THREE.Color(0x4c525a) },
    uMajor: { value: new THREE.Color(0x79828c) },
    uFine:  { value: LAB_GRID_FINE },
    uCoarse:{ value: LAB_GRID_MAJOR },
    uFade:  { value: 700 },        // m — beyond this only the major grid survives, then nothing
  },
  vertexShader: `
    varying vec3 vWorld;
    varying float vDist;
    void main () {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      vec4 mv = viewMatrix * w;
      vDist = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform vec3 uBase, uMinor, uMajor;
    uniform float uFine, uCoarse, uFade;
    varying vec3 vWorld;
    varying float vDist;
    // Coverage of a grid line at cell size s, antialiased by the screen-space derivative of the
    // cell coordinate. This is the whole trick: near the camera fwidth is tiny and the line is
    // crisp; far away fwidth grows, the line widens to a pixel and then washes out, so the grid
    // dissolves instead of moireing.
    float gridCoverage (vec2 p, float s, float widthPx) {
      vec2 c = p / s;
      vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
      return 1.0 - min(min(g.x, g.y) / widthPx, 1.0);
    }
    void main () {
      float fine  = gridCoverage(vWorld.xz, uFine,   1.0);
      float major = gridCoverage(vWorld.xz, uCoarse, 1.4);
      // Retire the fine grid first — it is the one that goes sub-pixel soonest.
      fine  *= 1.0 - smoothstep(uFade * 0.10, uFade * 0.40, vDist);
      major *= 1.0 - smoothstep(uFade * 0.45, uFade,        vDist);
      vec3 col = mix(uBase, uMinor, fine);
      col = mix(col, uMajor, major);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
})
const _gridGroundPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(LAB_FLOOR_SIZE * 2, LAB_FLOOR_SIZE * 2),
  _labFloorMaterial
)
_gridGroundPlane.rotation.x = -Math.PI / 2
_gridGroundPlane.receiveShadow = true
_gridGroundPlane.visible = false
scene.add(_gridGroundPlane)

// ── FEAT-31: enter / exit the testing lab ────────────────────────────────────
// Supersedes grid world (D-18/D-19, deleted 2026-07-20), which did neither half of this.
// Two halves that BOTH matter:
//   VISUAL — hide the terrain chunks AND the road ribbons, props, water and dust. Without this
//     the generated world hangs ~150 m overhead and the flat plane reads as a basement.
//     Visibility only; nothing is disposed, so returning to the world is instant.
//   WORK — stop terrain streaming and road streaming/route dispatch. The lab is where physics is
//     measured, so leaving worldgen churning in the background would put its cost inside every
//     measurement. This is the half a visibility flag can't buy.
// Physics needs no special casing: the lab sets _labActive, which every contact-query gate
// already reads (ground at y=0, normal up, no carve/prop/water). _labActive additionally
// suppresses the ramp rig, which would otherwise sit across the drag strip at the origin.
function _setWorldgenVisible (visible) {
  if (terrainSystem) terrainSystem.setChunksVisible(visible)
  if (roadMeshSystem) roadMeshSystem.setVisible(visible)
  if (propSystem) propSystem.setVisible(visible)
  if (waterRenderer) waterRenderer.group.visible = visible
  if (dustSystem) dustSystem.setVisible(visible)
  if (smokeSystem) smokeSystem.setVisible(visible)
  if (dirtSpraySystem) dirtSpraySystem.setVisible(visible)
}

function enterLab () {
  _labActive = true
  _labActive = true            // reuse every flat-world physics gate
  window.__setGameMode('lab')

  // Fog is tuned for worldgen draw distances (FogExp2 ~0.006), which swallows the far end of a
  // 400 m strip and hides the 150 m skidpad entirely from any useful vantage. The lab is a clean
  // room: thin it right out and restore the player's setting on the way back.
  if (scene.fog) { _labFogDensity = scene.fog.density; scene.fog.density = 0.00035 }

  if (terrainSystem) terrainSystem.setEnabled(false)   // stop streaming, not just drawing
  _setWorldgenVisible(false)
  _gridGroundPlane.visible = true
  rampMesh.visible = RANGER_PARAMS.rampEnabled !== false   // D-19 jump rig, kept as a lab feature

  const pmLab = document.getElementById('pm-lab')
  if (pmLab) pmLab.textContent = 'exit testing lab'

  labSystem.enter()
  // Staging the truck on the strip sets _spawnOverride, which would otherwise eat a spawn point
  // the player had set with Shift+R — and leaving the lab would re-seat them at the LAB's
  // coordinates out in the real world. Save it going in, restore it coming out.
  _labSavedSpawn = _spawnOverride
  const pose = labSystem.spawnPose()
  teleportToGround(pose.x, pose.z, pose.heading, 0.5)
  _hidePauseMenu()
  _renderLabUI()
}

function exitLab () {
  _labActive = false
  _labActive = false
  window.__setGameMode('freeroam')

  if (scene.fog && _labFogDensity != null) { scene.fog.density = _labFogDensity; _labFogDensity = null }

  const pmLab = document.getElementById('pm-lab')
  if (pmLab) pmLab.textContent = 'testing lab'

  labSystem.exit()
  _gridGroundPlane.visible = false
  rampMesh.visible = false
  if (terrainSystem) terrainSystem.setEnabled(true)
  _setWorldgenVisible(true)

  _spawnOverride = _labSavedSpawn   // null ⇒ _reseatTruckAtSpawn resolves the canonical seed spawn
  _labSavedSpawn = null
  void _reseatTruckAtSpawn()
  _hidePauseMenu()
  _renderLabUI()
}

// Lab readout: live status, the best of each track, and the DERIVED number each track exists to
// produce (implied accel / decel, and the skidpad's realized mu). The mu column is the point —
// compared against test/measure-vehicle-limits.mjs's steady-state mu it gives the k factor that
// sets PAR_REF (FEAT-30).
function _renderLabUI () {
  const el = document.getElementById('lab-panel')
  const hudEl = document.getElementById('lab-hud')
  if (!el) return
  if (!labSystem.isActive()) {
    el.style.display = 'none'
    if (hudEl) hudEl.style.display = 'none'
    return
  }
  el.style.display = 'block'
  const rows = [...labSystem.best.values()]
    .map(r => `<tr><td>${r.track}</td><td class="lb-num">${r.value.toFixed(r.unit === 's' ? 2 : 1)} ${r.unit}</td>`
      + `<td class="lb-dim">${r.detail || ''}</td><td class="lb-hi">${r.derived || ''}</td></tr>`)
    .join('')
  document.getElementById('lab-status').textContent = labSystem.status
  // Live skidpad readout (L2): radius error vs the ring, speed, and instantaneous mu — the
  // feedback that makes limit-finding possible while the lap is still running.
  const liveEl = document.getElementById('lab-live')
  if (liveEl) {
    const l = labSystem.liveLap()
    if (l) {
      const dr = l.radius - l.targetR
      liveEl.style.display = 'block'
      liveEl.textContent = `${l.name} lap ${l.t.toFixed(1)} s · ${Math.round(l.frac * 100)}%`
        + ` · line ${dr >= 0 ? '+' : ''}${dr.toFixed(1)} m · ${(l.speed * 3.6).toFixed(0)} km/h`
        + ` · live mu ${l.mu.toFixed(2)}`
    } else {
      liveEl.style.display = 'none'
    }
  }
  document.getElementById('lab-rows').innerHTML = rows
    || '<tr><td colspan="4" class="lb-dim">no runs yet — stage in the box or cross a green line</td></tr>'
  // Big center overlay: staging countdown / GO / FALSE START / NEW BEST.
  if (hudEl) {
    const h = labSystem.hud()
    if (h) {
      hudEl.style.display = 'block'
      hudEl.innerHTML = `<span class="lh-${h.cls}">${h.text}</span>`
    } else {
      hudEl.style.display = 'none'
    }
  }
}

// ── Pause-menu helpers ────────────────────────────────────────────────────────
function _showPauseMenu () {
  const el = document.getElementById('pause-menu')
  if (el) el.style.display = 'flex'
  // FEAT-43: the pm-story slot is context-aware — it enters story mode from free roam, and offers
  // the way OUT ("free roam") while story mode is active.
  const storyBtn = document.getElementById('pm-story')
  if (storyBtn) storyBtn.textContent = storySystem.isActive() ? 'free roam' : 'story mode'
}

function _hidePauseMenu () {
  const el = document.getElementById('pause-menu')
  if (el) el.style.display = 'none'
}

// ── Story Mode (FEAT-43) — sandboxed gamemode ─────────────────────────────────────────────
// StorySystem owns the whole story-mode lifecycle (src/story.js). main.js only supplies the `deps`
// adapter so story.js stays free of engine imports; the region radius is story.js's own constant.
//
// The mode's defining behaviour is the ROUTING FREEZE: behind the entry loading screen the play
// RoadSystem is widened to the whole region, every connection in it is warmed on the road Worker,
// the network is registered once at that wide radius, and thereafter the frame loop makes NO
// roadSystem.update()/warmRoutes() calls at all (see isRoutingFrozen() at the two call sites in
// loop()). Terrain/props/water/ribbons keep streaming around the player and build against that
// frozen network — freezing THEM would pin ~1.4 GB of chunk meshes. See story.js's header.
const _storyWarmCenter = new THREE.Vector3()   // scratch for the region warm/release calls below
const storySystem = new StorySystem({
  setGameMode: (m) => window.__setGameMode(m),
  getWorldSeed: () => worldSeed,
  applySeed: (v) => applyWorldSeed(v),     // resolves when the rebuild + reseat have settled
  reseat: () => _reseatTruckAtSpawn(),     // resolves when the truck is seated at the spawn
  setDebugLockout: (locked) => {
    setDebugLockout(locked)
    // Collision-sphere debug lives in main.js, not the GUI — force it off entering the lockout so
    // spheres left on in free roam don't linger into story mode.
    if (locked && _dbgSpheresOn) { _dbgSpheresOn = false; _dbgSpheres.forEach(m => { m.visible = false }) }
  },
  ensureRegionRoutes: () => _ensureRegionRoutes(),   // PERF-26: lazy story-region route cache
  hidePauseMenu: () => _hidePauseMenu(),
  setQuickJobVisible: (visible) => { const el = document.getElementById('quickjob-btn'); if (el) el.style.display = visible ? 'block' : 'none' },
  setLoading: (visible, text) => {
    const el = document.getElementById('story-loading')
    if (el) el.style.display = visible ? 'flex' : 'none'
    const t = document.getElementById('sl-text')
    if (t && text) t.textContent = text
  },
  getVehiclePosition: () => ({ x: vehicleState.position.x, z: vehicleState.position.z }),
  isMissionActive: () => !!missionSystem?.isActive(),
  /**
   * One step of the region routing warm. Widens the play RoadSystem to the region radius and pumps
   * warmBandComplete() — the completion-aware sibling of warmRoutes() — which dispatches every
   * un-cached connection in the band to the road Worker and returns true only when nothing is
   * outstanding. Mirrors the _startPlannerWarm pump above, but on the PLAY instance, because the
   * play network is the one the frame loop is about to stop updating.
   *
   * On the final step it registers the whole region ONCE at the wide radius (roadSystem.update):
   * that runs the crossing cull at the wide radius, which post-BUG-25 is a pure fn of (seed,
   * params, region) and a safe superset of the 320 m window — the invariance gates prove it.
   * Only after that has run is it safe for story.js to set the freeze.
   * @returns {boolean} true ⇒ every region route is cached AND the network is registered
   */
  pumpRegionWarm: (center, radius) => {
    if (!roadSystem) return true
    _storyWarmCenter.set(center.x, 0, center.z)
    roadSystem.setRadius(radius)
    if (!roadSystem.warmBandComplete(_storyWarmCenter)) return false
    roadSystem.update(_storyWarmCenter)   // register + cull the whole region, once
    // ORDER MATTERS (same rule as debouncedRebuildFull): terrain bakes its carve tables at
    // chunk-request time, so any chunk built while the region was still warming carries the carve
    // of the OLD 320 m network. Re-bake the live ring against the now-registered region — ~25
    // chunks behind the loading screen, and it removes a whole class of "the road is drawn but not
    // carved" seams near the spawn.
    terrainSystem?.rebuildAllChunksFromWorker()
    return true
  },
  /**
   * FEAT-46: the region is routed and about to be handed over — place the POIs, hand their pads to
   * the carve, and re-bake. The re-bake is required, not belt-and-braces: pumpRegionWarm already
   * rebuilt the live ring against the registered network, but that ran BEFORE the pads existed, so
   * without this second pass the cubes stand on unflattened hillside until the player drives far
   * enough to evict and re-stream those chunks. Both passes are behind the loading screen.
   */
  onRegionLive: (center, radius) => {
    if (!center) return
    daySystem.start()   // FEAT-47: the run's clock opens at dayStartHour and takes over the sky
    daySystem.setBlinksEnabled(true)   // SM-INV-12: blinks/dozes exist only inside a live story region
    poiSystem.build(center, radius)
    campSystem.build(center, radius)   // FEAT-45: the region's dispersed-camping zones
    _rebuildPoiMarkers()
    terrainSystem?.rebuildAllChunksFromWorker()
    // Props scattered BEFORE the pads existed are still standing in them (the scatter's road
    // keep-out now covers a pad, but only for chunks scattered after this point). Release just the
    // chunks a pad touches so they re-scatter against the finished ground — a handful, not a rebuild.
    if (propSystem) {
      const S = CHUNK_SIZE
      for (const q of poiSystem.list()) {
        const c0x = Math.floor((q.x - q.halfLen) / S), c1x = Math.floor((q.x + q.halfLen) / S)
        const c0z = Math.floor((q.z - q.halfLen) / S), c1z = Math.floor((q.z + q.halfLen) / S)
        for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) propSystem.releaseChunk(cx, cz)
      }
    }
  },
  /** FEAT-46: leaving story mode — drop the pads before releaseRegion() re-bakes without them. */
  onRegionExit: () => {
    daySystem.stop()    // FEAT-47: clock off, sky handed back to free roam's noon look
    daySystem.setBlinksEnabled(false)   // …and the eyelids can never fire in free roam
    setControlAttenuation(1)            // belt-and-braces: leave the driver's inputs whole
    poiSystem.clear()
    campSystem.clear()   // FEAT-45: no camping zones outside a live story region
    _rebuildPoiMarkers()
    terrainSystem?.rebuildAllChunksFromWorker()
  },
  /** Exit: hand the play RoadSystem back its normal streaming window before the loop resumes. */
  releaseRegion: () => {
    if (!roadSystem) return
    roadSystem.setRadius(320)   // PERF (Tier 1) play radius — matches the terrain ring
    roadSystem.update(getCameraMode() === 'freecam' ? getFreecamPosition() : vehicleState.position)
  },
})

// ── Story-mode seed prompt (FEAT-43) ──────────────────────────────────────────────────────
function _showSeedModal () {
  const el = document.getElementById('story-seed-modal')
  if (el) el.style.display = 'flex'
  const inp = document.getElementById('ss-seed')
  if (inp) { inp.value = _seedString; inp.focus(); inp.select() }
}
function _hideSeedModal () {
  const el = document.getElementById('story-seed-modal')
  if (el) el.style.display = 'none'
}
function _startStoryFromModal () {
  const seed = document.getElementById('ss-seed')?.value ?? '6'
  _hideSeedModal()
  storySystem.enter(seed)
}
document.getElementById('ss-start')?.addEventListener('click', _startStoryFromModal)
document.getElementById('ss-cancel')?.addEventListener('click', () => _hideSeedModal())
document.getElementById('ss-seed')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); _startStoryFromModal() }
  else if (e.key === 'Escape') { e.preventDefault(); _hideSeedModal() }
  e.stopPropagation()   // keep WASD/M/Esc out of the world while typing a seed
})
// Quick Job launcher — the beta mission generator, now surfaced only inside story mode.
document.getElementById('quickjob-btn')?.addEventListener('click', () => { if (missionSystem) missionSystem.enter() })

// Wire pause-menu buttons. Null-guarded (?.) like every other DOM lookup in this file:
// an unguarded deref would throw at module-eval and abort the whole sim if an id is
// renamed/removed from index.html (WR-04).
document.getElementById('pm-resume')?.addEventListener('click', () => _hidePauseMenu())
// Story mode is opt-in from this menu ONLY — a first-time visitor lands in free roam and is
// never thrust into an unfinished mode. Switching the game mode also disables free-roam-only
// affordances (teleport), which is the point of _gameMode existing.
document.getElementById('pm-lab')?.addEventListener('click', () => {
  if (_labActive) { exitLab(); return }
  if (missionSystem?.isActive()) missionSystem.exit()   // don't run a mission inside the lab
  enterLab()
})
// FEAT-43: pm-story is context-aware. From free roam it opens the seed prompt → StorySystem.enter()
// (the sandboxed gamemode). While story mode is active it reads "free roam" and exits the mode. It no
// longer launches the beta mission generator directly — that is now Quick Job (#quickjob-btn),
// surfaced inside story mode.
document.getElementById('pm-story')?.addEventListener('click', () => {
  if (storySystem.isActive()) {
    if (missionSystem?.isActive()) missionSystem.exit()
    _hidePauseMenu()
    storySystem.exit()
    return
  }
  if (_labActive) exitLab()
  _hidePauseMenu()
  _showSeedModal()
})
// (grid world's "grid world" / "return to world" buttons were removed with it — the lab's own
// toggle is the way in and out of a flat world now.)

// ── Free-cam "teleport here" button (feature/teleport) ────────────────────────────────────
// Drops the truck at the EXACT free-cam position (off-road / floating allowed) facing the camera
// heading, and sets that as the spawn. The button's visibility is driven by the render loop
// (shown only in free-cam + free-roam). T fires the same action while flying (pointer-lock hides
// the cursor, so the on-screen button is only clickable after releasing lock with Esc).
let _tpBtnShown = false   // tracks the teleport button's DOM display state (toggled on change in loop)
function _teleportToFreecam () {
  if (!isTeleportEnabled() || getCameraMode() !== 'freecam') return
  const p = getFreecamPosition()
  // Exact spot the camera is (off-road / floating allowed), level and facing the camera heading.
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), getFreecamYaw())
  teleportToPose(p.x, p.y, p.z, q)
  exitFreecam()   // drop straight into chase behind the truck at the new spot
}
document.getElementById('teleport-btn')?.addEventListener('click', _teleportToFreecam)

// ── Controls cheat-sheet collapse toggle (feature/teleport) ───────────────────────────────
{
  const box = document.getElementById('controls')
  const toggle = document.getElementById('controls-toggle')
  toggle?.addEventListener('click', () => {
    const collapsed = box.classList.toggle('collapsed')
    toggle.innerHTML = collapsed ? 'controls &#9656;' : 'controls &#9662;'   // ▸ collapsed / ▾ open
  })
}
document.addEventListener('keydown', e => {
  // T → free-cam teleport (usable while pointer-locked, where the button can't be clicked).
  if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey) _teleportToFreecam()
  // FEAT-46's E-to-take-a-job key is GONE (owner, 2026-07-29): latching the parking brake beside a
  // marker is the trigger now — see _updatePoiPrompt.
  //
  // Space closes the offer panel, same as clicking DECLINE (owner, 2026-07-29). The brake pull opened
  // it, so the brake release is the obvious way out — and vehicle.js drops the park latch on that
  // same tap, which leaves the truck ready to roll AND re-arms the trigger, so another pull re-offers.
  // preventDefault so the tap can't ALSO activate whichever panel button last took focus.
  if (e.key === ' ' && missionSystem?.state === 'offer') { e.preventDefault(); missionSystem.exit() }
  // Shift+R → set the spawn point to the truck's current pose (does not move the truck).
  if (e.shiftKey && (e.key === 'r' || e.key === 'R')) {
    if (isTeleportEnabled()) setSpawnHere()
  }
})

// ── Esc handler — pause menu (D-17 / RESEARCH §Pitfall 3) ────────────────────
// Gate on the POINTER LOCK, not the camera mode: while locked, the browser consumes Esc to
// release the lock (acting here too caused the flash-open/close of Pitfall 3) — but an UNLOCKED
// freecam has no such conflict, and blocking Esc there just made the pause key feel broken
// (owner-reported). So: locked → let the browser release the lock; next Esc pauses, from any
// camera. (RESEARCH §Pitfall 3 / 07-PATTERNS.md §Esc/keyboard listener coexistence)
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return
  if (document.pointerLockElement) return   // this Esc is the browser's lock-release
  const el = document.getElementById('pause-menu')
  if (!el) return
  if (el.style.display === 'none' || el.style.display === '') {
    _showPauseMenu()
  } else {
    _hidePauseMenu()
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

// ── Background-tab mute ───────────────────────────────────────────────────────
// Two distinct "we're not looking at it" events, and we need BOTH: alt-tabbing to another app
// fires window blur but NOT visibilitychange (the tab is still visible), while switching browser
// tabs / minimising fires visibilitychange. Mute on either; unmute only when focused AND visible,
// so returning focus to a still-hidden tab doesn't restart the drone.
const _audioPageActive = () => document.hasFocus() && !document.hidden
const _syncAudioPageActive = () => setAudioPageActive(_audioPageActive())
window.addEventListener('blur',  _syncAudioPageActive)
window.addEventListener('focus', _syncAudioPageActive)
document.addEventListener('visibilitychange', _syncAudioPageActive)

document.addEventListener('keydown', e => {
  ensureEngineAudio()   // FEAT-23: first keypress is the user gesture that unlocks WebAudio
  ensureTireAudio()     // tire audio (slip + rolling) shares that same unlocked AudioContext
  ensureWindAudio()     // wind audio too
  if (e.key === '\\') toggleRecording()
  if (e.key === 'i' && e.ctrlKey) openInitialCondition(vehicleState, RANGER_PARAMS)
  // 'p' = MARK THIS PLACE: write a kind:"place" capture at the truck — the replayable spatial bug
  // report (kink / fold / grade / tear). test/replay.mjs rebuilds the road here from seed+params and
  // diffs what the game observed. Supersedes the old road-run-dump (geometry lives in the capture).
  if (e.key === 'p' && roadSystem && !_labActive) {
    // Mark from the freecam when it's active (lets you fly to a defect and capture it), else the truck.
    const markPos = getCameraMode() === 'freecam' ? getFreecamPosition() : vehicleState.position
    const px = markPos.x, pz = markPos.z
    // Optional terrain side of `observed` (verified once terrain-headless lands, Phase 5).
    // wheelGroundY only makes sense at the truck — in freecam the truck isn't at the mark, so skip it.
    let terrainSample = null
    if (terrainSystem) {
      let wheelGroundY = null
      if (getCameraMode() !== 'freecam') {
        wheelGroundY = []
        for (let i = 0; i < 4; i++) { const hub = getWheelPosition(i, vehicleState, RANGER_PARAMS); wheelGroundY.push(terrainSystem.analyticHeight(hub.x, hub.z)) }
      }
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
  perfFrameBegin()   // PERF-26: closes out the previous frame's attribution, arms this one (no-op unless ?hitch)
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
    if (_PROF) perfFrameDt(frameTime * 1000)   // PERF-08: dt ring buffer (post-clamp dt is fine — clamp only fires on tab-hide spikes)
  }
  _fpsLastTime = newTime

  accumulator += frameTime

  // PERF-26: bucket the whole fixed-step block. Without it the catch-up substeps a hitch frame owes
  // (a 150 ms frame is followed by one paying ~9 physics steps) land in no bucket at all, and the
  // hitch report shows a fat frame with nothing explaining it.
  const _ptP = performance.now()
  while (accumulator >= PHYSICS_DT) {
    // Terrain stub call retained for M1-13 verification (Phase 6 replaces body, not call site).
    const _surface = terrain(vehicleState.position.x, vehicleState.position.z)  // eslint-disable-line no-unused-vars

    // Story-mode countdown hold — set BEFORE updateVehicle, which is where handbrake is computed.
    // (The old approach re-latched vehicleState.parked AFTER updateVehicle had already computed
    // handbrake=false for the step, so the countdown never actually held and the player could
    // drive off mid-count.) The hold forces the handbrake only: revving against it is allowed,
    // and the release at zero is the launch.
    setLaunchHold(!!missionSystem?.isHeld())

    const resetRequested = updateVehicle(vehicleState, RANGER_PARAMS, PHYSICS_DT)
    if (resetRequested) {
      // R re-seats the truck to a driveable state ONLY — it does NOT touch any tunable
      // params or slider values. All tuning (vehicle AND terrain) stays exactly as set;
      // a full page reload is the only way to revert params to file defaults.
      // Phase 7 (D-15): canonical re-seat via resolveSpawn + analyticHeight ground-probe.
      // _reseatTruckAtSpawn() replaces the former inline reset block — picks a low-slope spawn
      // using the current worldSeed, seats at static equilibrium height, zeros all motion.
      // Async since QUAL-14 (spawn bands warm on the worker pool); fire-and-forget — with the
      // route cache warm this resolves within a frame or two.
      void _reseatTruckAtSpawn()
    }

    // FEAT-31: lab gate crossings. One segment test per gate, clocked off the fixed step so a
    // frame spike can't skip a gate the truck actually drove through.
    if (_labActive) labSystem.update(PHYSICS_DT)

    // Story mode (beta): countdown tick + arrival check. Two distance checks — no routing, no
    // par math (that ran once at mission-offer time). Clocked off the fixed step, not wall time.
    if (missionSystem?.isActive()) {
      missionSystem.update(PHYSICS_DT)
    }

    _prevRenderPos.copy(vehicleState.position)
    _prevRenderQuat.copy(vehicleState.quaternion)

    // FEAT-06b: bush soft-drag — a capped, velocity-opposing resistive force while the chassis
    // overlaps a bush volume (never a hard contact). Applied as an impulse on the body velocity
    // each substep: dv = F/m · dt. propSystem caps F at collision.bush.fMax (~200 N) so it's a
    // felt drag, not a stop. No-op (returns 0) when no bush overlaps the CG.
    if (!_labActive && propSystem) {
      const p = vehicleState.position, v = vehicleState.velocity
      const f = propSystem.bushDragForce(p.x, p.y, p.z, v.x, v.y, v.z, _bushDragF)
      if (f.x || f.y || f.z) {
        const k = PHYSICS_DT / RANGER_PARAMS.mass
        v.x += f.x * k; v.y += f.y * k; v.z += f.z * k
      }
    }

    stepPhysics(vehicleState, RANGER_PARAMS, PHYSICS_DT, queryContacts, queryVertexContacts)
    simTime += PHYSICS_DT
    // BUG-12 diagnostic (open): while recording, log the truck run's local centerline turn radius
    // to localize ribbon folds. Gated on isRecording() so normal play pays nothing (queryNearest
    // scans a 3×3 tile block). The post-hoc road-resolution path lives in test/replay.mjs.
    let roadDebug = null
    if (isRecording() && !_labActive) {
      const px = vehicleState.position.x, pz = vehicleState.position.z
      // Surface fidelity (2026-06-25): record the ground the browser actually sampled — CG + each wheel
      // hub — so test/replay.mjs can diff it against the headless terrain instead of guessing. Per-wheel
      // uses getWheelPosition (airborne-safe), the same call the contact path and place-capture use.
      const gh = terrainSystem ? terrainSystem.analyticHeight(px, pz) : null
      const wheelGh = terrainSystem
        ? [0, 1, 2, 3].map(i => { const hub = getWheelPosition(i, vehicleState, RANGER_PARAMS); return terrainSystem.analyticHeight(hub.x, hub.z) })
        : [null, null, null, null]
      const minR = roadSystem ? roadSystem.debugSampleAt(px, pz).minR : 9999
      roadDebug = { minR, gh, wheelGh }
    }
    captureFrame(simTime, vehicleState, vehicleState.wheelDebug, roadDebug)
    accumulator -= PHYSICS_DT
  }
  perfAdd('frame.physics', performance.now() - _ptP)

  // PERF-26 INSTRUMENT (measurement only): close the attribution GAP. The worst frames left in the
  // run carry 60–73 ms inside NO bucket. That is either (a) an unbucketed section of this loop or
  // (b) a GC pause — completely different fixes, and the current buckets cannot tell them apart. So
  // partition the WHOLE loop first: two coarse spans (pre-stream / post-stream) plus the one
  // unbucketed call inside the streaming block (warmRoutes). After this frame.* covers the loop end
  // to end, so if `unattr` is STILL ~60 ms it is GC, conclusively, with no guessing.
  const _ptPre = performance.now()

  // FEAT-43: Story Mode — advance the settle→freeze timer and enforce the region boundary on the
  // physics pose BEFORE the render interpolation reads it (so the truck is clamped, not just drawn
  // clamped). No-op unless story mode is active.
  storySystem.update(frameTime, vehicleState)

  // FEAT-47: advance the story day clock on the same wall-clock delta. No-op outside story mode.
  daySystem.update(frameTime)
  // …and hand its two outputs on. Both are PER FRAME, not on the 10 Hz HUD block: a 200 ms doze is
  // over in a dozen frames, so a 100 ms cadence would quantise the eyelids into a stutter and let
  // the attenuation lag the blink. Two style writes on cached elements — cheap enough to afford.
  setControlAttenuation(daySystem.attenuation())   // identically 1 outside a doze
  _updateDozeOverlay(daySystem.eyelidFactor())

  // FEAT-22: water submersion flag — CG vs the local water surface (pond plane). Once per render
  // frame (not per physics substep): v1 only SETS the flag; nothing in stepPhysics consumes it yet.
  if (waterSystem && !_labActive) {
    const cgY = vehicleState.position.y + (RANGER_PARAMS.cgHeight ?? 0)
    const sub = waterSystem.submergedAt(vehicleState.position.x, cgY, vehicleState.position.z)
    vehicleState.submerged = sub.submerged
    vehicleState.submergedDepth = sub.depth
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

  // FEAT-14: feed the day/night factor so headlight/lamp cast pools dim by day, brighten at night.
  setNightFactor(skySystem.nightFactor())
  syncMeshesToState(vehicleState)

  // Wheel dust trails — advance + emit using the interpolated render pose (vehicleState is
  // still the render copy here; restored below). Ground sampler mirrors queryContacts: flat
  // the lab surface in the lab, analytic terrain height otherwise. Cheap no-op when no wheel is working.
  dustSystem.update(frameTime, vehicleState, RANGER_PARAMS,
    (x, z) => _labActive ? (labSystem ? labSystem.groundHeight(x, z) : 0) : (terrainSystem ? terrainSystem.analyticHeight(x, z) : 0),
    looseSurfaceFactor)

  // Tire smoke — same render-pose timing as dust above; ground sampler shared verbatim (smoke
  // has no on-road fade, so no third callback).
  smokeSystem.update(frameTime, vehicleState, RANGER_PARAMS,
    (x, z) => _labActive ? (labSystem ? labSystem.groundHeight(x, z) : 0) : (terrainSystem ? terrainSystem.analyticHeight(x, z) : 0))

  // Dirt spray — same render-pose timing and ground sampler; additionally gated by
  // looseSurfaceFactor so clods only fly where there is loose material to throw.
  dirtSpraySystem.update(frameTime, vehicleState, RANGER_PARAMS,
    (x, z) => _labActive ? (labSystem ? labSystem.groundHeight(x, z) : 0) : (terrainSystem ? terrainSystem.analyticHeight(x, z) : 0),
    looseSurfaceFactor)

  // Phase 6: update terrain chunk ring each render frame (outside physics accumulator).
  // ground.position.x/z snapping removed — ground mesh removed; terrain chunks replace it.
  // Phase 7 D-21: while free-cam is active, stream chunks around the camera, not the truck.
  // Reverts to truck position on exit so the ring stays anchored to the car in normal mode.
  const streamCenter = getCameraMode() === 'freecam' ? getFreecamPosition() : vehicleState.position
  _trackStreamCenter(simTime, streamCenter.x, streamCenter.z)   // capture ring (Phase 4/5)
  // FEAT-06: keep the sun's shadow frustum centred on the view, else only tiles near origin get
  // shadows. QUAL-02: the direction now comes from SkySystem.sunDirection (so shadows align with the
  // visible sun in the sky) — place the light along that direction at a fixed standoff, target the
  // centre. A day/night cycle that animates the sun elevation moves the shadows for free.
  // PERF-06: skip the follow entirely when the Quality tier disabled shadows (sun.castShadow=false) —
  // there is no shadow map to centre, so the matrix writes would be wasted work.
  if (sun.castShadow) {
    const sunDir = skySystem.sunDirection
    // BUG-29: texel-snap the follow centre. The ortho shadow camera is re-centred on the continuous
    // streamCenter every frame; un-snapped, the 2048² map's texel grid slides sub-texel under the
    // geometry → swimming/dithering shadow edges. Quantise the centre to one shadow-texel increment in
    // the LIGHT's view basis (its right/up axes are the shadow-map axes), so the sampling grid stays
    // world-locked. forward = pos→target dir = +sunDir (toward the sun); up = world Y, so
    // right = worldUp × forward lies in the ground plane and matches Three's lookAt basis.
    _shadowFwd.copy(sunDir).normalize()
    _shadowRight.set(0, 1, 0).cross(_shadowFwd)
    if (_shadowRight.lengthSq() < 1e-8) _shadowRight.set(1, 0, 0)   // degenerate: sun straight overhead
    _shadowRight.normalize()
    _shadowUp.copy(_shadowFwd).cross(_shadowRight).normalize()
    // Centre on the TRUCK, not the streaming/camera centre. The frustum is now truck-sized (±20 m,
    // see QUALITY_PRESETS) because the truck is very nearly the only caster, so it has to track the
    // caster rather than the view — in freecam the truck keeps its shadow while you fly away, and
    // when parked, panning the camera no longer re-arms the shadow pass (PERF-16) for nothing.
    // Carry the truck's Y too (this used to pin y=0): with a tight frustum and a 200 m standoff, a
    // truck a few hundred metres up a mountain would otherwise sit near or past the shadow camera's
    // near plane. Snapping still quantises the R/U components below, so the grid stays world-locked.
    _shadowCenter.copy(vehicleState.position)
    const snapR = Math.round(_shadowCenter.dot(_shadowRight) / SHADOW_TEXEL) * SHADOW_TEXEL
    const snapU = Math.round(_shadowCenter.dot(_shadowUp)    / SHADOW_TEXEL) * SHADOW_TEXEL
    const keepF = _shadowCenter.dot(_shadowFwd)               // forward component is along the view axis — leave it
    _shadowCenter.set(0, 0, 0)
      .addScaledVector(_shadowRight, snapR)
      .addScaledVector(_shadowUp,    snapU)
      .addScaledVector(_shadowFwd,   keepF)
    sun.position.set(
      _shadowCenter.x + sunDir.x * 200,
      _shadowCenter.y + sunDir.y * 200,
      _shadowCenter.z + sunDir.z * 200
    )
    sun.target.position.copy(_shadowCenter)
    sun.target.updateMatrixWorld()

    // PERF-16: re-arm the on-demand shadow render only when the shadow could actually change.
    //   1. texel-snapped frustum centre moved (camera crossed a shadow texel),
    //   2. the sun/key-light direction moved (day/night cycle is future work — this trigger batches
    //      shadow refreshes to however often SkySystem moves the sun; no per-frame updates when it's
    //      static, no plumbing when it starts moving),
    //   3. world geometry streamed — a poll-and-compare of the generation/count signals that already
    //      exist (terrain chunks, road generation + built tiles, prop chunks + shadow blobs). Any pop-in
    //      changes one of these, so a chunk/tile/prop that streamed in while parked refreshes its shadow.
    //   4. the vehicle is in motion — mark dirty every frame so the truck's own shadow tracks it; when
    //      parked it stays frozen (correct). Quality/lever changes re-arm at their own sites (applyQuality
    //      + __lever shadow paths).
    // PERF-07: props no longer cast into the realtime map (they're baked), so a prop streaming in no
    // longer needs a realtime re-arm — only the truck (motion) + view texel-snap drive it. Terrain/
    // road stay in the signature for the rare non-prop caster + safety.
    const geomSig = (terrainSystem?._chunkMap.size ?? 0)
      +     7919 * (roadSystem?.roadGeneration?.() ?? 0)
      +   104729 * (roadMeshSystem?._tileMeshMap.size ?? 0)
    const sd = skySystem.sunDirection
    const moving = vehicleState.velocity.lengthSq() > 0.0025            // > 0.05 m/s
      || Math.abs(vehicleState.drivetrain?.wheelspin ?? 0) > 0.1        // wheels spinning in place
    if (moving
      || snapR !== _lastShadowSnapR || snapU !== _lastShadowSnapU
      || sd.x !== _lastSunDir.x || sd.y !== _lastSunDir.y || sd.z !== _lastSunDir.z
      || geomSig !== _lastShadowGeomSig) {
      // PERF-26: tag only the re-arms that are NOT the every-frame `moving` case. Tagging `moving`
      // would put a tag on every driving frame, collapsing the hitch report's quiet control group
      // (a tag is only informative if there are frames without it). A geomSig re-arm while parked
      // IS a pop-in cost and worth its own line.
      if (!moving) perfEvent(geomSig !== _lastShadowGeomSig ? 'shadow.map.geom' : 'shadow.map.view')
      renderer.shadowMap.needsUpdate = true
      _lastShadowSnapR = snapR
      _lastShadowSnapU = snapU
      _lastSunDir.copy(sd)
      _lastShadowGeomSig = geomSig
    }
  }
  // FEAT-31: in the testing lab NONE of the worldgen streaming block below runs. The lab is where
  // vehicle behaviour is measured, so leaving terrain/road/prop/water generation churning in the
  // background would put its cost inside every measurement — and hiding the meshes (which
  // enterLab also does) buys only the draw calls, not the generation. Gate the WORK, not just the
  // pixels. Nothing is disposed, so leaving the lab re-streams from warm caches.
  let _pt = performance.now()
  perfAdd('frame.preStream', _pt - _ptPre)   // PERF-26 INSTRUMENT: physics-end → streaming-block start
  if (!_labActive) terrainSystem.update(streamCenter)
  perfAdd('frame.terrain.update', performance.now() - _pt)
  // Phase 8: stream the valley-trunk network around the same center as terrain (08-07: the
  // unified update() replaces the retired updateProto — streams + slices + redraws viz if visible).
  _pt = performance.now()
  // QUAL-14 perf: while a spawn warm holds the enlarged radius (seed regen), a re-stream here
  // would synchronously route the enlarged band — skip until the warm restores the play radius.
  // FEAT-43: story mode suspends this for the same reason as _spawnWarmActive above — while its
  // region warm holds the enlarged radius a re-stream here would synchronously route the whole
  // region every frame; and once frozen, a re-stream would narrow the network back to a 320 m
  // window and undo the freeze. This skip (and the warmRoutes one below) IS the mode's perf win.
  if (roadSystem && !_spawnWarmActive && !_labActive && !storySystem.isRoadStreamSuspended()) roadSystem.update(streamCenter)
  perfAdd('frame.road.update', performance.now() - _pt)
  // FEAT-06: stream props around the same center. PERF-14: scatter is queued + time-sliced inside
  // update(); the vehicle position is the HARD radius — its 3×3 chunks force-complete so prop
  // collision always exists under the truck, while the visual ring drips in budget-bound.
  _pt = performance.now()
  if (propSystem && !_labActive) propSystem.update(streamCenter.x, streamCenter.z, _propRing, vehicleState.position.x, vehicleState.position.z, _bbRing)
  perfAdd('frame.props.update', performance.now() - _pt)   // TEMP (D-arc)
  // PERF-07: bake freshly-committed chunks' prop shadows into the world atlas (sliced; no-op when the
  // queue is empty, i.e. the steady state). Off the frame's shadow pass entirely once baked.
  _pt = performance.now()
  if (shadowBake && shadowBake.hasWork() && !_labActive) { perfEvent('shadow.bake'); shadowBake.update(scene) }   // PERF-26 tag
  perfAdd('frame.shadowBake', performance.now() - _pt)
  // FEAT-17/18: sync pond/stream meshes to the view region (bbox-culled, keyed — no churn when still).
  _pt = performance.now()
  if (waterRenderer && !_labActive) {
    const wr = waterSyncRadius()
    waterRenderer.sync(
      streamCenter.x - wr, streamCenter.z - wr,
      streamCenter.x + wr, streamCenter.z + wr
    )
  }
  perfAdd('frame.water.sync', performance.now() - _pt)   // TEMP (D-arc)
  // PERF-14: pump the water-detection pre-warm ahead of every consumer (prop scatter ring
  // ≤160 m, terrain carve fetch 512 m). 768 m lookahead ≈ 6-12 s of lead at freecam speeds;
  // 2 ms/frame budget. Without this, the first query into a fresh WATER_CELL paid a 13-58 ms
  // lazy detection (pond rim casts + stream traces) inside the scatter/carve — the measured
  // dominant streaming hitch.
  _pt = performance.now()
  if (waterSystem && !_labActive) {
    const WW = 768
    waterSystem.warmRegion(streamCenter.x - WW, streamCenter.z - WW, streamCenter.x + WW, streamCenter.z + WW, 2)
  }
  perfAdd('frame.water.warm', performance.now() - _pt)   // TEMP (D-arc)
  // PERF-03 WS-A: pre-warm the road centerline cache off-thread ahead of the streamer. This is LIVE:
  // QUAL-08 gave routing its own Worker and USE_WORKER_ROUTING is true, so the dispatcher is wired and
  // this runs. (It previously carried a comment claiming it no-ops under BUG-26 — that was stale, and
  // it cost PERF-26 a whole investigation: the call reads as dead code, so nobody bucketed it, while
  // it was in fact the largest remaining streaming hitch. The routing is off-thread as designed; the
  // main-thread cost was the graph rebuild deciding WHAT to route, now memoised in road.js.)
  // FEAT-43: suspended in story mode — during the region warm this would fight pumpRegionWarm for
  // the same anchor, and once frozen every region route is already cached, so there is nothing left
  // to pre-warm and no router traffic at all while driving.
  _pt = performance.now()   // PERF-26 INSTRUMENT: the one unbucketed call in the streaming block
  if (roadSystem && !_spawnWarmActive && !_labActive && !storySystem.isRoadStreamSuspended()) roadSystem.warmRoutes(streamCenter)   // don't fight a spawn warm's anchor
  perfAdd('frame.road.warmRoutes', performance.now() - _pt)
  // Phase 9 (SURF-01): sync road ribbon tiles with the active terrain chunk ring.
  // syncToChunkRing enqueues new tiles and disposes evicted ones co-located with chunk lifetime.
  // flushPendingQueue builds up to MAX_ROAD_BUILDS_PER_FRAME tiles per frame.
  if (roadMeshSystem && terrainSystem && !_labActive) {
    _pt = performance.now()
    roadMeshSystem.syncToChunkRing(terrainSystem.getActiveChunkKeys())
    perfAdd('frame.ribbon.sync', performance.now() - _pt)
    _pt = performance.now()
    roadMeshSystem.flushPendingQueue()
    perfAdd('frame.ribbon.flush', performance.now() - _pt)
  }
  // TEMP (D-arc): auto-dump the perf profile at ~load (frame 180 ≈ 3s) and steady-state (frame 600).
  _perfFrame++
  // PERF-27: the reset is a console-triage convenience, and under ?prof=1 it actively destroys
  // data — an external harness owns the buckets then, and on a throttled load frame 180 can land
  // mid-measurement (it wiped the reseed spans at 4×). Dump, but only reset when nobody is watching.
  if (_perfFrame === 180) { perfDump('load ~3s'); if (!_PROF) perfReset() }
  else if (_perfFrame === 600) { perfDump('steady ~10s') }
  const _ptPost = performance.now()   // PERF-26 INSTRUMENT: streaming-block end → render start

  // Lab: recenter the floor pad on the view each frame so it reads as infinite. No snapping is
  // needed any more — the grid is drawn from WORLD xz in the fragment shader, so it stays welded to
  // the world however the quad moves (the old GridHelper had to be snapped to its cell size or its
  // lines crawled).
  if (_labActive) _gridGroundPlane.position.set(streamCenter.x, 0, streamCenter.z)

  // FEAT-23: engine audio tracks RPM + throttle EVERY frame (no-op until the first keypress unlocks
  // WebAudio). PERF-16: deliberately OUTSIDE the throttled HUD block below — a 10 Hz pitch update would
  // make the engine note step audibly. Audio is not a DOM write, so the throttle does not apply to it.
  const dtrain = vehicleState.drivetrain
  if (dtrain) {
    setEngineAudioEnabled(RANGER_PARAMS.engineAudioEnabled !== false)
    setEngineAudioVolume(RANGER_PARAMS.engineAudioVolume ?? 0.5)
    updateEngineAudio(dtrain.engineRPM, vehicleState.throttle)
  }

  // Tire-slip audio (src/tire-audio.js): screech on pavement / tearing roar on dirt, gated by
  // per-wheel slip velocity. Same every-frame reasoning as the engine drone above — a throttled
  // update would step the squeal audibly. No-op until the first keypress unlocks WebAudio.
  setTireAudioEnabled(RANGER_PARAMS.tireAudioEnabled !== false)
  setTireAudioVolumes(RANGER_PARAMS.tireScreechVolume ?? 0.5, RANGER_PARAMS.tireDirtVolume ?? 0.3,
    RANGER_PARAMS.tireRoadVolume ?? 0.4)
  updateTireAudio(vehicleState, RANGER_PARAMS, looseSurfaceFactor)

  // Wind noise (src/wind-audio.js): airspeed only — no ground query, no per-wheel work.
  setWindAudioEnabled(RANGER_PARAMS.windAudioEnabled !== false)
  setWindAudioVolume(RANGER_PARAMS.windVolume ?? 0.4)
  updateWindAudio(vehicleState)

  // PERF-16: throttle all HUD DOM + debug-canvas writes to ~10 Hz. These are human-readable readouts;
  // rewriting the spans and repainting the Pacejka/travel/slip canvases every frame cost Layout+Paint
  // +PrePaint (~1.7% of wall) for numbers a human reads a few times a second. Physics reads, the
  // fixed-step accumulator, captureFrame and the logger are untouched (they run every frame above/below).
  // The Pacejka/travel/slip canvases already early-out when hidden (T-03-09 etc.); this just caps their
  // rate when visible — still called once per render pass OUTSIDE the fixed accumulator (constraint #10).
  const _hudNow = performance.now()
  if (_hudNow - _lastHudWrite >= 100) {
    _lastHudWrite = _hudNow

    if (_labActive) _renderLabUI()

    // Story-mode planner: keep a warm planning network near the player so "story mode" opens
    // instantly. Throttled — a re-warm is worker traffic, but there is no point starting one every
    // few seconds while driving across country.
    // Hold off until the spawn band has finished warming so the two do not fight for the Worker.
    // FEAT-43: also hold off while story mode is still entering — its region warm owns the road
    // Worker until the loading screen clears, and a competing planner warm just stretches it.
    if (roadWorker && !_labActive && !_spawnWarmActive && !storySystem.isEntering()) {
      const drift = _plannerWarm
        ? Math.hypot(_plannerWarm.center.x - vehicleState.position.x, _plannerWarm.center.z - vehicleState.position.z)
        : Infinity
      const stale = !_plannerWarm || _plannerWarm.seed !== worldSeed || drift > PLAN_RESTREAM_MOVE
      if (stale && performance.now() - _plannerWarmAt > 20000) {
        _startPlannerWarm(worldSeed, vehicleState.position.x, vehicleState.position.z)
      }
    }

    // Story mode (beta): the countdown digit and the elapsed/distance readout are live values,
    // so they repaint on the HUD's ~10 Hz cadence rather than per physics step.
    if (missionSystem && (missionSystem.state === 'countdown' || missionSystem.state === 'running')) _renderMissionUI()

    // FEAT-46: the POI prompt — and, since 2026-07-29, the parking-brake trigger it advertises.
    // Still the ~10 Hz cadence: the `parked` latch is sticky, so the edge cannot fall between polls.
    _updatePoiPrompt()

    // M1-11: live speed readout. velocity.length() = magnitude in m/s; * 3.6 converts to km/h.
    document.getElementById('speedVal').textContent = (vehicleState.velocity.length() * 3.6).toFixed(1)

    // FEAT-23: gear + engine RPM readout (activeGear 0 = reverse, 1..N = forward gear).
    if (dtrain) {
      const gEl = document.getElementById('gearVal')
      if (gEl) gEl.textContent = dtrain.activeGear === 0 ? 'R' : String(dtrain.activeGear)
      const rEl = document.getElementById('rpmVal')
      if (rEl) rEl.textContent = Math.round(dtrain.engineRPM)
      const spEl = document.getElementById('spinVal')
      if (spEl) {
        const spin = dtrain.wheelspin || 0
        spEl.textContent = spin.toFixed(1)
        spEl.style.color = spin > (RANGER_PARAMS.wheelspinThreshold ?? 7.5) ? '#ff2222' : '#00ff88'
      }
    }

    // M4-09 / D-12: per-wheel Fz HUD — tire spring force per corner.
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

    // Road-Feel QoL: seed / x / z OSD — correlates screenshots and in-game sightings with the
    // headless report's coords (test/road-character.mjs prints worst-offender x/z in world space).
    const posEl = document.getElementById('posVal')
    if (posEl) {
      // Freecam shows the CAMERA's position (you fly to a defect, the OSD must name that spot,
      // not wherever the truck was left) — same source the capture mark uses.
      const posSrc = getCameraMode() === 'freecam' ? getFreecamPosition() : vehicleState.position
      posEl.textContent = `seed ${_seedString} / ${posSrc.x.toFixed(0)} / ${posSrc.z.toFixed(0)}`
    }

    // M3-09 / D-13: Pacejka curve + 4-corner travel bars + slip vectors — canvas repaints, throttled
    // with the HUD. Each early-returns when its canvas is hidden (constraint #10: outside accumulator).
    updatePacejkaCurve(vehicleState, RANGER_PARAMS)
    updateTravelBars(vehicleState, RANGER_PARAMS)
    updateSlipVectors(vehicleState)
  }

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

  // QUAL-02: keep the (finite) sky box centred on the camera so it always surrounds the view.
  skySystem.update(camera.position)

  // FEAT-39: GPS overlay. Early-outs to nothing when no mission is live, so free roam pays a
  // null check. Off in the lab, which has no road network to navigate.
  if (gpsSystem && !_labActive) {
    const _ptG = performance.now()
    gpsSystem.update(frameTime)
    // PERF-26 INSTRUMENT: renamed off the `frame.` prefix — it is now NESTED inside frame.postStream,
    // and perf.js sums every frame.* label to compute `unattr`, so leaving it would double-count.
    perfAdd('post.gps.update', performance.now() - _ptG)
  }

  // FEAT-16: redraw the 2D map overlay only while it's open (off the hot path otherwise).
  if (map2d.isOpen()) map2d.render()

  // feature/teleport: show the "teleport here" button only in free-cam + free-roam. Toggle on
  // change to avoid touching the DOM every frame.
  const _showTpBtn = isTeleportEnabled() && getCameraMode() === 'freecam'
  if (_showTpBtn !== _tpBtnShown) {
    _tpBtnShown = _showTpBtn
    const btn = document.getElementById('teleport-btn')
    if (btn) btn.style.display = _showTpBtn ? 'block' : 'none'
  }

  const _ptR = performance.now()
  perfAdd('frame.postStream', _ptR - _ptPost)   // PERF-26 INSTRUMENT
  renderer.render(scene, camera)
  perfAdd('frame.render', performance.now() - _ptR)  // TEMP: the ~8.5s uninstrumented load cost suspect
  // PERF-26: stamp the frame's CPU span + the program count, so a shader compile shows up as a
  // +N on the hitch record rather than as unexplained time outside every bucket.
  perfFrameEnd(renderer.info.programs?.length ?? -1)
}

perfMark('init: synchronous bootstrap done, requesting first frame')  // TEMP (D-arc)
// Dev handle (like __view above): init — including the QUAL-14 async spawn warm — is complete and
// the render loop is starting. Read by the headless boot-timing probes.
window.__rsReady = true
requestAnimationFrame(loop)
// PERF-26: start pulling the story-region route cache now that boot is done — download + parse
// only, no import (see _fetchRegionRoutes). Deferred to idle so it never competes with the initial
// terrain/prop fill, with a timeout so a permanently-busy machine still gets it. Story entry awaits
// whatever this leaves in flight, so clicking in early costs the tail of the download, not the whole
// thing. Fire-and-forget by design: a failure here just means story mode routes as any seed does.
{
  const kick = () => { void _fetchRegionRoutes(worldSeed) }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(kick, { timeout: 4000 })
  else setTimeout(kick, 2000)
}
// PERF-21: precompile the light-count shader variants (lamps off/brake/night/reverse) off the
// critical path so the first brake or headlight toggle doesn't compile shaders mid-drive.
prewarmLightPrograms(renderer, scene, camera)

// ── Resize handler ───────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  // PERF-06: applyRenderResolution re-clamps pixelRatio (the resHeight cap depends on innerHeight) AND
  // re-stamps the backing buffer — replaces the bare setSize so a Low-tier 720p cap survives a resize.
  applyRenderResolution()
})
