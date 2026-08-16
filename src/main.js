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
import { stepPhysics, createVehicleChassis } from './physics.js'
import { createPhysicsEngine } from './physics-engine.js'
import { TerrainPhysics, RoadPhysics, PropPhysics } from './terrain-physics.js'
import { DebrisSystem } from './debris.js'
import { PhysicsWireframes } from './physics-debug.js'
import { getWheelPosition } from './suspension.js'
import { updateVehicle, setLaunchHold, setControlAttenuation, SPAWN_STATE } from './vehicle.js'
import { updateCamera, getCameraMode, getFreecamPosition, getFreecamYaw, exitFreecam, placeFreecam, setCameraFocus, setAimMode, isAiming } from './camera.js'
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
import { MoonSystem } from './moon.js'                      // QUAL-02: night moon disc on the key-light direction
import { parseWorldSeed, seedFor } from './seed.js'
import { createVehicleModel } from './vehicle-model.js'
import { Map2D } from './map2d.js'                       // FEAT-16: 2D top-down map dev/validation overlay
import { GaugeCluster } from './cluster.js'              // FEAT-49: 1992 Ranger gauge cluster overlay
import { MissionSystem, MISSION_PLAN_RADIUS, PLAN_RESTREAM_MOVE } from './mission.js'  // story mode (beta)
import { LabSystem } from './lab.js'                     // FEAT-31: isolated flat testing lab + timing gates
import { StorySystem } from './story.js'                 // FEAT-43: sandboxed Story Mode gamemode (seed entry + frozen region)
import { PoiSystem, POI_PARAMS } from './poi.js'         // FEAT-46: story-mode POIs on lay-by pads
import { DaySystem, DAY_PARAMS, STAGE_COLOR } from './day.js'   // FEAT-47: story-mode day clock (drives the sky)
import { EconomySystem, RANK_COLOR, formatDeeds, formatMoney } from './economy.js'  // FEAT-53: payout, wallet, good deeds
import { CampSystem, CAMP_PARAMS, VIBE_W } from './camp.js'  // FEAT-45: story-mode dispersed-camping zones
import { DialogueSystem } from './dialogue.js'           // FEAT-61: sequential character cards
import { PAPER_ROUTE_INTRO, DLG } from '../data/dialogue.js'
import { simulateThrow, launchVelocity, accuracyScore, THROW_PARAMS } from './throw.js'   // FEAT-61: the thrown roll
// FEAT-61: the paper route — Larry's route, its one par, and the flat-rate settlement.
import { PaperRouteSystem, PAPER_PARAMS, runPaper, resetPaperRun, stockForTier, deadlineFor } from './paper-route.js'
import { GpsSystem, addGpsGui } from './gps.js' // FEAT-39: GPS assist (in-world route arrows)
import { formatTime } from './par.js'                    // FEAT-29: par oracle time formatting
import { RoadRouteWorker } from './road-worker.js'       // QUAL-08: dedicated road-network routing Worker
import { PropSystem } from './props/prop-system.js'        // FEAT-06: procedural trees/rocks/bushes
import { scatterTreePositions } from './props/prop-scatter.js'  // FEAT-45: read-only tree re-roll (camp shade score)
import { ShadowBakeSystem, ATLAS_N, TILE_PX, shearFromSun } from './props/prop-shadow-bake.js'  // PERF-07: baked prop-shadow atlas
import { installShadowEdgeFade } from './shadow-fade.js'   // QUAL-18: soft realtime shadow-map edge
import { addPropGui } from './props/prop-debug.js'         // FEAT-06: live tuning folder (self-contained)
import { spawnModel } from './model-service.js'            // FEAT-59: hand-modelled asset import service
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

// TerrainSystem instance — declared at module scope so queryContacts
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
      roadMeshSystem.setPhysicsHook(roadPhysics)   // FEAT-48: re-attach after the seed-rebuild swap
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
      propSystem.setPhysicsHook(propPhysics)   // FEAT-48: re-attach after the seed-rebuild swap
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
//
// IT IS A FREE-ROAM CONVENIENCE AND STORY MODE MUST NOT INHERIT IT (owner, 2026-08-11). This
// override is checked BEFORE resolveSpawn in _reseatTruckAtSpawnInner, so while it is set the truck
// no longer seats at the seed's spawn — and story.js captures the region centre from wherever the
// truck ends up (`_beginWarm`). Chained: teleport to Larry's → exit to free roam (you appear where
// Larry's was) → re-enter the same seed → the region re-centres THERE and every POI moves, which is
// exactly the bug the owner reproduced. `clearSpawnOverride` is called on story entry so the seed,
// and nothing else, decides where the world is built. See test/world-determinism.mjs.
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

// FEAT-63: the spare-time pump's budget, at the very bottom of loop(). The margin is what keeps a
// pumped frame from being the one that misses vsync — the estimate of "time already spent" cannot
// see the driver's own work after we return. The floor guarantees forward progress on a machine
// that is permanently over budget: the re-plan gets slower, never stuck.
const FRAME_BUDGET_MS = 1000 / 60
const PUMP_MARGIN_MS  = 2
const PUMP_FLOOR_MS   = 0.5

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

// ── Terrain shadow cascade (`sunFar`) ────────────────────────────────────────────────────────────
// A SECOND directional light sharing `sun`'s direction and colour, differing only in shadow framing:
// `sun` keeps QUAL-18's tight ±20 m box (what makes the truck's shadow crisp), `sunFar` renders a
// ±SHADOW_FAR_EXTENT box so TERRAIN casts at mountain scale — hills shading valleys at low sun,
// which the truck-framed frustum structurally could not do.
//
// WHY TWO LIGHTS AND NOT ONE WIDE ONE: in three a shadow darkens by removing THAT light's
// contribution, so the only way to get shadows at two very different scales is two lights. The key
// intensity is SPLIT between them (SHADOW_FAR_SPLIT) rather than duplicated — together they sum to
// the look's authored sunIntensity, so adding the cascade does not change overall scene brightness.
//
// WHAT THIS COSTS, HONESTLY:
//  · One extra directional light in EVERY lit material's shader (NUM_DIR_LIGHTS 1→2). Both lights
//    exist from construction so the cost is paid once at boot, not as a mid-session recompile.
//  · One extra shadow pass. This is the part that had to be bought down: at 0.25 m/texel a
//    per-frame re-render of ~25 terrain chunks (8 k tris each) while driving would be real money.
//    So `sunFar` opts OUT of the global on-demand trigger via its own `shadow.autoUpdate = false`
//    (per-light gate, three r184 WebGLShadowMap:170) and is re-armed only when its COARSE-snapped
//    centre moves, the sun direction changes, or geometry streams — see the follow in loop().
//    Driving in a straight line re-renders it roughly once per SHADOW_FAR_SNAP metres, not per frame.
//
// KNOWN TRADE-OFF: three has no per-light caster set (WebGLShadowMap tests object.layers against the
// VIEW camera, not the light), so the truck casts into BOTH maps. Its far-map shadow is ~0.25 m/texel,
// which shows up as a soft penumbra around the crisp near shadow. It reads as softening, not as a
// double shadow, and SHADOW_FAR_SPLIT is the dial if it ever needs pulling back.
const SHADOW_FAR_EXTENT = 256   // half-width in m (the box is 512 m across)
const SHADOW_FAR_MAP    = 2048  // 512 m / 2048 = EXACTLY 0.25 m per texel — the round number matters,
                                // because SHADOW_FAR_SNAP below has to be an integer multiple of it
const SHADOW_FAR_SNAP   = 64    // follow-centre quantisation (m). MUST be an exact multiple of the
                                // far texel size (64 / 0.25 = 256 texels) or the snap stops being
                                // texel-aligned and the shadow shimmers — the BUG-29 failure mode.
                                // Coverage is still ≥ 224 m with the centre a half-cell off.
const SHADOW_FAR_SPLIT  = 0.6   // fraction of the look's key intensity carried by the FAR light
const sunFar = new THREE.DirectionalLight(0xfff2e0, 0)   // colour + intensity driven by SkySystem
sunFar.castShadow = true
sunFar.shadow.mapSize.set(SHADOW_FAR_MAP, SHADOW_FAR_MAP)
sunFar.shadow.camera.left = sunFar.shadow.camera.bottom = -SHADOW_FAR_EXTENT
sunFar.shadow.camera.right = sunFar.shadow.camera.top   =  SHADOW_FAR_EXTENT
sunFar.shadow.camera.near = 1
sunFar.shadow.camera.far  = 2600            // spans the standoff + the world's height range
// Terrain is a huge, gently-sloped, low-poly heightfield lit at grazing angles at exactly the hours
// this feature is for — the classic shadow-acne case. normalBias offsets the lookup along the
// surface normal, which is the right tool for a heightfield (a flat depth bias would peter-pan the
// mountain shadows off their ridges). ~2 far-texels.
sunFar.shadow.normalBias = 0.5
sunFar.shadow.bias = -0.0005
// PERF: opt out of the global on-demand shadow trigger — re-armed explicitly by the far-follow.
sunFar.shadow.autoUpdate = false
sunFar.shadow.needsUpdate = true
scene.add(sunFar)
scene.add(sunFar.target)
// Far-cascade follow state (mirrors the near light's, at the coarse snap).
let _lastFarSnapR = NaN, _lastFarSnapU = NaN, _lastFarGeomSig = NaN
const _lastFarSunDir = new THREE.Vector3(NaN, NaN, NaN)

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
const skySystem = new SkySystem({ scene, renderer, sun, sunFar, farSplit: SHADOW_FAR_SPLIT, ambient })
window.sky = skySystem   // debug handle (mirrors window.terrain) — drive presets/time-of-day from console
// NB `window.terrain` is the height-sampler FUNCTION, not the streaming system. This is the system
// itself — needed to reach _terrainUniforms (e.g. A/B-ing uShadowStrength from a CDP probe).
window.__terrainSystem = () => terrainSystem

// The moon rides SkySystem's KEY-LIGHT direction, so the disc you see is the thing casting the
// night's shadows. Placed each frame from the loop (see moonSystem.update).
const moonSystem = new MoonSystem(scene)
// Scratch for the per-frame unlit-particle irradiance push (dust / smoke / dirt spray).
const _particleLight = new THREE.Color(1, 1, 1)

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

/**
 * FEAT-61: the map's "set off THIS way" chevron — where it sits on a mission line, and which way it
 * points. Returns `{x, z, ang}` or null; map2d draws it (see _drawStartArrow).
 *
 * NOT AT THE HEAD: a route normally starts where the car is parked, and the two marks fought for
 * the same pixels (owner, 2026-08-15). It goes 50 m down the line instead — far enough to be its own
 * mark, near enough to still read as "this way from here".
 *
 * Takes anything carrying a map polyline (`{poly:[{x,z}…]}`) so the paper route and a POI mission
 * can share one definition; arc length is walked here rather than read off `polyCum`, since only one
 * of the two callers has that array and the walk is a few dozen hypots on a click.
 */
function _startArrow (line) {
  const poly = line?.poly
  if (!poly || poly.length < 2) return null
  const AT = 50, SPAN = 30      // m: anchor distance down the line, and the span the heading is read over
  let i = 0, s = 0
  while (i < poly.length - 2 && s < AT) {
    s += Math.hypot(poly[i + 1].x - poly[i].x, poly[i + 1].z - poly[i].z); i++
  }
  // Heading from a span, not from the neighbouring vertex: at 25 m sampling one step is noisy on a
  // bend, and a start marker that points into the ditch is worse than none.
  let j = i, t = 0
  while (j < poly.length - 1 && t < SPAN) {
    t += Math.hypot(poly[j + 1].x - poly[j].x, poly[j + 1].z - poly[j].z); j++
  }
  if (j === i) return null
  return { x: poly[i].x, z: poly[i].z,
           ang: Math.atan2(poly[j].z - poly[i].z, poly[j].x - poly[i].x) }
}

const map2d = new Map2D({
  canvas:    document.getElementById('map2d'),
  getSeed:   () => worldSeed,
  getParams: () => RANGER_PARAMS,
  // The play WaterSystem, read-only: the sheet prints the rivers and ponds the truck actually
  // fords, and the tree-cover raster needs the same water rejects the scatter applies. Reads the
  // module-scope binding at CALL time so it survives rebuildWaterSystem without re-injection —
  // the same convention makePropSamplers uses.
  getWater:  () => waterSystem,
  getCar:    () => {
    _mapFwd.set(0, 0, -1).applyQuaternion(vehicleState.quaternion)
    return { x: vehicleState.position.x, z: vehicleState.position.z, fx: _mapFwd.x, fz: _mapFwd.z }
  },
  // Double-click teleport (free-roam only). The map snaps to the nearest road and hands us the
  // road-top Y; we drop the truck 0.5 m above it (or on terrain when off-road) and set the spawn.
  canTeleport: isTeleportEnabled,
  // FEAT-61: the paper route draws as a mission route, because that is what it is — one line, in
  // the order it will be driven. It wins over the mission's when a route is out; the two can never
  // both be live.
  getMission: () => paperRouteSystem?.markers() ?? missionSystem?.markers() ?? null,
  // FEAT-43: the story-mode region boundary, so the player can see where the wall is rather than
  // finding it by driving into it. Null outside story mode (and until the region center is captured).
  getRegion: () => storySystem?.region() ?? null,
  // FEAT-46: POI icons — how the player finds one to drive to. Empty outside story mode.
  getPois: () => poiSystem.list(),
  getCustomers: () => poiSystem.customers(),   // FEAT-61: you cannot drive a route you cannot see
  // FEAT-61: what the customers MEAN right now, and which way to set off.
  //
  // `onRoute` is the PAPER ROUTE only — it decides whether the customer dots are jobs or scenery, and
  // a POI mission says nothing about newspapers. `arrow` is for EVERY drawn mission line (owner,
  // 2026-08-15): it was gated to the paper offer on the theory that only a self-crossing round is
  // ambiguous about which end to start from, but a line on a sheet has two ends whatever drew it,
  // and "which way" is a question the player asks of a POI job too. So it now follows the line the
  // map is actually drawing, whichever system owns it and whatever state that system is in.
  getRouteState: () => {
    const p = paperRouteSystem
    const paperOn = !!p?.isActive()
    // The same precedence _drawMission's source (`getMission`) uses, so the arrow can never end up
    // describing a different polyline from the one under it.
    const line = paperOn ? p.line() : missionSystem?.markers()
    return { onRoute: paperOn, arrow: _startArrow(line) }
  },
  // FEAT-45: dispersed-camping zones, drawn as a yellow casing on the roads inside them. Empty
  // outside story mode (build() only ever runs from the story deps).
  getCampZones: () => campSystem.zones(),
  // (FEAT-60 dropped getMomsHouse: mom's house is a POI now, so it arrives through getPois with
  // its own glyph — the map no longer needs a second, separate channel for the same place.)
  onTeleport: ({ x, z, heading }) => {
    // Snap to the road orientation, but a road tangent has TWO directions — pick the one closest
    // to the truck's current heading so the teleport doesn't spin it 180°. Off-road: keep heading.
    // teleportToGround fits the truck to the local ground plane (no clip) and drops it 0.5 m.
    const h = heading != null ? _pickRoadDir(heading, _currentHeading()) : _currentHeading()
    teleportToGround(x, z, h, 0.5)
    map2d.hide()   // close the map so the teleport is immediately visible
  }
})

// FEAT-49: gauge cluster (bottom-right canvas overlay). The odometer seeds to a random jalopy
// mileage at boot and RE-seeds on every story-mode entry — "the next run's jalopy". Fuel/temp
// needles are placeholders until the fuel (FEAT-50) and coolant (FEAT-51) models drive them.
const gaugeCluster = new GaugeCluster(document.getElementById('cluster'))
gaugeCluster.seedOdometer()

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

// (queryVertexContacts deleted 2026-08-15 — it fed the retired hand-rolled body-contact
// solver; the engine chassis collides via its own hull compound now. The lab ramp solid it
// described lives on as the engine ramp prism built in _buildLabColliders.)

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

  // Ramp triangle contacts — lab only (wheel path; the chassis gets the engine ramp prism).
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
// Wall-clock (s) of the last day/night shadow re-bake roll — see the sun-generation block in loop().
let _lastSunBakeSec = -1e9
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
  // The terrain cascade rides the same tier switch (Low kills both passes). Re-arm its private
  // needsUpdate on the way back on — it opted out of the global trigger, so nothing else would.
  sunFar.castShadow = p.shadows
  if (p.shadows) { sunFar.shadow.needsUpdate = true; renderer.shadowMap.needsUpdate = true }
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
  // FEAT-53: the run wallet, so a harness can assert a payout/points accrual without a screenshot.
  window.__economy = () => economySystem
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
    // PERF-16 re-arm. Both cascades move together — the lever means "realtime sun shadows on/off".
    sunShadow:        v => { sun.castShadow = sunFar.castShadow = !!v; sunFar.shadow.needsUpdate = true; renderer.shadowMap.needsUpdate = true },
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

// FEAT-59 acceptance proof: spawn the news-roll 3 m ahead of the vehicle, seated on the ground.
// The real consumer is the newspaper-delivery mission (throw arc lives there, not here).
_gui.add({
  spawnNewsRoll: () => {
    const p = vehicleState.position
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(vehicleState.quaternion)
    const x = p.x + fwd.x * 3, z = p.z + fwd.z * 3
    const y = terrainSystem ? terrainSystem.analyticHeight(x, z) : 0
    const roll = spawnModel('newsRoll')
    roll.position.set(x, y, z)
    roll.quaternion.copy(vehicleState.quaternion)
    scene.add(roll)
  },
}, 'spawnNewsRoll').name('Spawn news-roll (FEAT-59)')

// FEAT-61 Phase B proof: play Larry's briefing on demand. The real trigger is accepting a paper
// route (Phase E); this exists so the card can be verified — and re-verified — without one. It
// passes key `null`, so it always plays and never burns the once-per-run flag the mission uses.
_gui.add({
  playBriefing: () => { dialogueSystem.play(null, PAPER_ROUTE_INTRO); _renderDialogue() },
}, 'playBriefing').name('Play Larry briefing (FEAT-61)')

// ── TerrainSystem (Phase 6 / 7) ──────────────────────────────────────────────
// Instantiated after scene exists. Removes flat ground mesh to prevent Z-fighting.
// Phase 7: pass worldSeed so TerrainSystem initializes seeded noise closures and sends
// the Worker init message before any generate requests. analyticHeight/analyticNormal
// are immediately available after construction (no chunk load required).
perfMark('init: before TerrainSystem')  // TEMP (D-arc) — the ~8s load is one-time init, not the frame loop
terrainSystem = new TerrainSystem(scene, RANGER_PARAMS, worldSeed)
scene.remove(ground)   // Remove flat 200×200 ground mesh — terrain chunks replace it (T-06-06)

// ── FEAT-48: the physics engine world ────────────────────────────────────────
// One engine world for everything — chassis, streamed terrain colliders, debris.
// WASM init is ~15 ms (measured, Phase 0); top-level await here matches the
// existing boot style (route-cache import below also top-level awaits).
perfMark('init: before physics engine')
const physicsEngine = await createPhysicsEngine()
const terrainPhysics = new TerrainPhysics(physicsEngine)
terrainSystem.setPhysicsHook(terrainPhysics)   // mirrors every chunk build/recarve/dispose
const vehicleChassis = createVehicleChassis(physicsEngine, vehicleState, RANGER_PARAMS)
const engineCtx = { engine: physicsEngine, chassis: vehicleChassis }
const debrisSystem = new DebrisSystem(physicsEngine, scene)   // FEAT-36: thrown barrels/rocks
// Road ribbon/pad/bore trimesh colliders — attached to roadMeshSystem at its creation sites
// below (boot + seed rebuild). The terrain heightfields mirror the CARVED mesh, which sits
// roadClearanceMargin BELOW the asphalt; without this mirror debris fell through the road.
const roadPhysics = new RoadPhysics(physicsEngine)
// Prop hard colliders (tree trunks, logs, rocks, boulders) as engine statics — the chassis'
// rigid tree contact ("squishy trees" fix, 2026-08-15). Attached at every PropSystem creation.
const propPhysics = new PropPhysics(physicsEngine, FLORA_PARAMS)
window.__propPhysics = propPhysics             // dev handle — prop-debug radius sliders resyncAll()
// Collider wireframes (debug overlay) — replaces the retired orange probe spheres. Backtick
// toggles it; the debug panel mirrors it. Two-tone X-ray over the models, never hiding them.
const physicsWireframes = new PhysicsWireframes(physicsEngine, scene)
window.__physWireframes = physicsWireframes    // dev handle — debug.js checkbox targets it
window.__physicsEngine = physicsEngine         // dev handle (counters in the HUD / console)
window.__vehicleChassis = vehicleChassis       // dev handle — debug.js restitution slider targets it
window.__debris = debrisSystem                 // dev handle — debug.js projectile selector + clear button
perfMark('init: physics engine ready')

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
  getRoad:    () => roadSystem,
  getSeed:    () => worldSeed,
  getParams:  () => RANGER_PARAMS,
  getTerrain: () => terrainSystem,
  getWater:   () => waterSystem,
  treesNear:  (x, z, r) => _treesNear(x, z, r),
})

// FEAT-45: the SHADE score's tree source. Deliberately NOT the live PropSystem — the streamer is a
// window artifact (chunks come and go with the camera), and a campsite score that changed with what
// happened to be resident would not be a property of the site. scatterTreePositions replays the
// chunk's own first scatter pass read-only, so the trees counted are exactly the trees standing
// there, from any window, forever.
//
// Memoized per chunk because that replay is ~40 sampler chains (a couple of ms): the grading poll
// runs at 10 Hz and a camp hunt walks the same two or three chunks for minutes. The cache is keyed
// by seed so a reseed cannot serve another world's forest.
const _treeChunkCache = new Map()   // `${seed}:${cx},${cz}` → [{x,z}, …]
function _chunkTrees (cx, cz) {
  const key = `${worldSeed}:${cx},${cz}`
  let list = _treeChunkCache.get(key)
  if (list) return list
  if (_treeChunkCache.size > 64) _treeChunkCache.clear()   // a camp hunt touches a handful
  list = scatterTreePositions(cx, cz, worldSeed, makePropSamplers(), FLORA_PARAMS)
  _treeChunkCache.set(key, list)
  return list
}
function _treesNear (x, z, r) {
  const S = FLORA_PARAMS.chunkSize
  const c0x = Math.floor((x - r) / S), c1x = Math.floor((x + r) / S)
  const c0z = Math.floor((z - r) / S), c1z = Math.floor((z + r) / S)
  const r2 = r * r
  let n = 0
  for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
    for (const t of _chunkTrees(cx, cz)) {
      const dx = t.x - x, dz = t.z - z
      if (dx * dx + dz * dz <= r2) n++
    }
  }
  return n
}

const _poiGroup = new THREE.Group()
_poiGroup.name = 'poi-markers'
scene.add(_poiGroup)
// Placeholder art (FEAT-43's word): an orange cube standing on the pad. Emissive so it reads at
// distance under the sky's ACES tone mapping without needing its own light.
const _poiCubeGeo = new THREE.BoxGeometry(POI_PARAMS.poiCubeSize, POI_PARAMS.poiCubeSize, POI_PARAMS.poiCubeSize)
const _poiCubeMat = new THREE.MeshStandardMaterial({ color: 0xff7a18, emissive: 0x3a1a00, roughness: 0.55 })

// The INTERACTION ring (owner, 2026-08-02): a translucent orange curtain standing at
// poiInteractR, so the spot where parking actually opens the offer is something you can see and
// aim at rather than a radius you discover by trial — the first step toward the marker being a
// highlighted parking spot you pull into. Drawn on every marker you are NEAR (FEAT-60 cut it to
// POI_RING_SHOW_R); it is still part of what a POI looks like up close, not a UI state.
//
// Deliberately dumb geometry: an open-ended unit cylinder, scaled to the radius and sunk into the
// ground so undulating terrain can never open a gap under it. depthWrite off + DoubleSide so it
// reads as a light curtain from both approaches instead of a solid bucket, and toneMapped off so
// the orange stays the same signal orange at every hour of the day clock.
const _POI_RING_H = 4.0        // m — curtain height
const _POI_RING_SINK = 1.5     // m — how far the base is buried (terrain slop, not decoration)
// How close you must be for a marker's ring to light up (FEAT-60, owner 2026-08-05). Comfortably
// past the pad and past braking distance at road speed, but nowhere near the ~160 m the game draws
// — so you find a POI by seeing the BUILDING, and the ring only tells you where to stop once you
// have. See the near-field note in _updateMissionRings.
const POI_RING_SHOW_R = 50     // m

/** Vertical alpha ramp: solid at the base, gone by the top. alphaMap reads the GREEN channel. */
function _ringAlphaTex () {
  const N = 64
  const data = new Uint8Array(N * 4)
  for (let i = 0; i < N; i++) {
    const v = i / (N - 1)                            // 0 at the base of the cylinder
    const a = v < 0.45 ? 1 : 1 - (v - 0.45) / 0.55   // hold, then fade out
    const b = Math.round(255 * Math.max(0, a))
    data[i * 4] = b; data[i * 4 + 1] = b; data[i * 4 + 2] = b; data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, 1, N, THREE.RGBAFormat)
  tex.needsUpdate = true
  return tex
}
// Unit cylinder + one alpha ramp, shared by BOTH rings — the interaction ring and the start-zone
// ring are the same object in two colours at two radii, which is what makes the swap below read as
// one ring changing meaning rather than two unrelated overlays.
const _ringGeo = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true)
const _ringAlpha = _ringAlphaTex()
const _ringMat = (color, opacity = 0.28) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, side: THREE.DoubleSide,
  depthWrite: false, toneMapped: false, alphaMap: _ringAlpha,
})
const _poiRingMat = _ringMat(0xff7a18)     // orange — park here to be offered a job
// The STAGING ring (owner, 2026-08-02): taking the job swaps the marker's orange circle for the
// green start threshold. One ring at a time, and its colour is the state — orange means "this is
// where you stop", green means "this is where the clock starts". Same geometry, same style, wider
// radius (START_ZONE_R vs poiInteractR) and taller in proportion so a 25 m circle still reads as a
// wall rather than a puddle.
const _stageRingMat = _ringMat(0x3ddc6b)   // green — cross this and you're running
const _STAGE_RING_H = 8.0      // m
const _STAGE_RING_SINK = 3.0   // m
// FEAT-61 delivery target: the same ring in the same green at the customer's 3 m radius, plus a 1 m
// centre ring as an aim point. The centre ring is DECORATION — scoring reads continuous distance
// from the centre POINT, not which ring the paper is inside (owner, 2026-08-05).
//
// Low, but not a kerb: _POI_RING_H's 4 m curtain at a 10 m radius reads as a wall you park inside,
// and the same proportions at 3 m would be a chimney you cannot see your own throw land in. The
// first pass went the other way and made it a 1.2 m kerb, which was too easy to blow straight past
// at speed — DOUBLED to 2.4 m (owner, 2026-08-15). At 3 m radius that is still something you look
// down into, just tall enough to break the horizon line from a moving truck.
// WHITE, not the GPS cyan it wore before (owner, same pass): every ground colour out here is a
// muted natural, so the one ink that never occurs in the landscape is paper white — it separates
// from grass, gravel, wet ground and shadow alike without picking up a meaning from another system.
const _targetRingMat = _ringMat(0xffffff, 0.52)
const _TARGET_RING_H = 2.4      // m
const _TARGET_RING_SINK = 0.5   // m
const _TARGET_PIP_H = 0.5       // m — the centre pip is lower still; it must never mask the landing
let _stageRing = null
// poi.id → its orange ring, so the accepted marker's ring can step aside for the green one while
// every OTHER marker in the region keeps its own.
const _poiRings = new Map()
// customer.id → [ring, pip]. FEAT-61: a delivery target is only lit when it is ON your route and
// still owed a paper — see _updateCustomerRings.
const _customerRings = new Map()

/**
 * Rebuild the markers + interaction rings (cheap: a handful of each per region).
 *
 * FEAT-60: a POI whose roster slot names a model gets the model; everything else keeps the orange
 * cube. The cube is not an unfinished job — it is the honest placeholder for a type nobody has
 * modelled yet, and today's roster is deliberately mostly cube.
 */
function _rebuildPoiMarkers () {
  _poiGroup.clear()   // geometry + material are shared singletons — nothing per-cube to dispose
  _poiRings.clear()
  _customerRings.clear()
  const half = POI_PARAMS.poiCubeSize * 0.5
  const r = POI_PARAMS.poiInteractR
  for (const q of poiSystem.list()) {
    if (q.modelKey) {
      // receiveShadow too: a building is big enough to catch its neighbours' shadows and its own,
      // unlike the small thrown mission items FEAT-59's cast-only default was written for.
      const m = spawnModel(q.modelKey, { castShadow: true, receiveShadow: true })
      m.position.set(q.x, q.y, q.z)     // pad records are base-seated, and so are the models
      m.rotation.y = q.yaw              // faces the road — see the yaw note in poi.js
      _poiGroup.add(m)
    } else {
      const cube = new THREE.Mesh(_poiCubeGeo, _poiCubeMat)
      cube.position.set(q.x, q.y + half, q.z)
      cube.castShadow = true
      _poiGroup.add(cube)
    }

    // The ring means "park here and something happens", so it belongs only to markers where
    // something does. The services are unbuilt and mom's house has her own doorstep prompt.
    if (!q.jobs) continue
    const ring = new THREE.Mesh(_ringGeo, _poiRingMat)
    ring.scale.set(r, _POI_RING_H, r)
    ring.position.set(q.x, q.y - _POI_RING_SINK + _POI_RING_H * 0.5, q.z)
    ring.renderOrder = 5
    _poiGroup.add(ring)
    _poiRings.set(q.id, ring)
  }

  // FEAT-61 — the customers. No body: a house has no model yet and the orange cube would read as
  // "park here to be offered a job", which is the one thing a customer is not. Two rings and
  // nothing else, and NEVER an orange interaction ring — you cannot take a job from a porch.
  //
  // customers(), NOT houses(): mom is a roster POI that also carries the 'newsCustomer' tag, so
  // drawing only the house list left the one customer the player is guaranteed to find with no
  // target on it (owner-reported). Asking by tag is the whole point of having tags.
  const tr = POI_PARAMS.poiHouseTargetR
  for (const h of poiSystem.customers()) {
    const ring = new THREE.Mesh(_ringGeo, _targetRingMat)
    ring.scale.set(tr, _TARGET_RING_H, tr)
    ring.position.set(h.x, h.y - _TARGET_RING_SINK + _TARGET_RING_H * 0.5, h.z)
    ring.renderOrder = 5
    ring.visible = false      // lit only by _updateCustomerRings, and only on a live round
    _poiGroup.add(ring)

    const pip = new THREE.Mesh(_ringGeo, _targetRingMat)
    pip.scale.set(0.5, _TARGET_PIP_H, 0.5)          // 1 m DIAMETER, so radius 0.5
    pip.position.set(h.x, h.y - _TARGET_RING_SINK + _TARGET_PIP_H * 0.5, h.z)
    pip.renderOrder = 5
    pip.visible = false
    _poiGroup.add(pip)
    _customerRings.set(h.id, [ring, pip])
  }
}

/**
 * FEAT-61: which delivery targets are lit.
 *
 * THIS IS WHY PAPERS "COULDN'T BE DELIVERED" (owner-reported 2026-08-09). A region holds 16
 * customers and a tier-1 route visits four of them — but every customer wore a green circle, so
 * twelve of the sixteen targets on screen were decoys. A paper landed dead centre in one of those
 * scored nothing and, because the miss read-out is distance-gated, said nothing either. The circle
 * has to mean "this one, now", or it is not a target.
 *
 * So: on a route, only the route's UNDELIVERED customers light up — and a ring going out as the
 * paper lands is the delivery confirmation.
 *
 * OFF A ROUTE, NOTHING LIGHTS UP AT ALL (owner, 2026-08-15). The rings used to stay on as a
 * learn-the-neighbourhood affordance, but a target you cannot score is a target that teaches you to
 * ignore targets — and it put white circles on the landscape at every moment of the game, including
 * ones that have nothing to do with papers. The ring now means exactly one thing: a paper is owed
 * here, right now.
 *
 * …and only when you are NEAR (owner, 2026-08-11), exactly as the orange interaction rings work.
 * A rung-four route reaches 2 km, and fifteen green circles burning across the valley flattens the
 * landscape into a game board — the same reason FEAT-60 pulled the orange ones in. The distance
 * test comes FIRST and short-circuits everything else, so a customer you are nowhere near costs
 * one hypot per poll. The radius is generous next to the orange rings' 50 m: a target is something
 * you have to spot and line a throw up at while moving, not something you park at.
 */
const TARGET_RING_SHOW_R = 150   // m
function _updateCustomerRings () {
  const onRound = paperRouteSystem.isCarrying()
  if (!onRound) {
    for (const pair of _customerRings.values()) { pair[0].visible = false; pair[1].visible = false }
    return
  }
  const live = new Set(paperRouteSystem.routeCustomers().map(c => c.id))
  const vp = vehicleState.position
  for (const [id, pair] of _customerRings) {
    const p = pair[0].position
    let on = Math.hypot(p.x - vp.x, p.z - vp.z) <= TARGET_RING_SHOW_R
    if (on) on = live.has(id) && !paperRouteSystem.isDelivered(id)
    pair[0].visible = on
    pair[1].visible = on
  }
}

/**
 * The orange↔green swap, on the ~10 Hz HUD poll: while a POI job is STAGING, the marker you took it
 * from drops its interaction ring and the start-zone ring stands in its place. Everything here is
 * visibility + a transform — no allocation after the first staged job.
 */
function _updateMissionRings () {
  // FEAT-61: the paper route stages out of Larry's place through the same threshold, so it hands
  // the same ring the same job. Only one of the two can ever be staging — you cannot take a job
  // while carrying a route — so this is a preference, not a merge.
  const paperZone = paperRouteSystem.startZone()
  const zone = paperZone || (missionSystem?.state === 'staging' ? missionSystem.startZone() : null)
  const activeId = paperZone ? paperRouteSystem.giver?.id
                 : zone ? missionSystem.mission?.fromPoi : null
  // FEAT-60: rings are a NEAR-FIELD affordance now (owner, 2026-08-05). They used to burn at every
  // marker across the region because the cube needed the help to be found; a modelled POI reads as
  // itself from a long way off, and a field of orange curtains flattens the landscape into a game
  // board. Inside POI_RING_SHOW_R the ring goes back to doing its real job — showing you exactly
  // where to stop. Distance is to the marker, not the camera, so freecam does not light them up.
  //
  // FEAT-61 stacks one more condition on top: ONCE A JOB IS TAKEN, NO ORANGE AT ALL (owner,
  // 2026-08-05). You cannot accept a job while running one, so every orange curtain you drive past
  // mid-route is an invitation to do something the game will refuse — noise at exactly the moment
  // you are busy reading the road.
  //
  // TAKEN, not merely offered: 'generating' and 'offer' are the states where you are parked at a
  // marker BEING offered work, and blinking that marker's own ring out from under the panel would
  // be the opposite of the fix.
  // FEAT-61: a paper route counts as being on a job for exactly the same reason — every orange
  // curtain you pass mid-round is an invitation to do something the game will refuse.
  const onMission = ['staging', 'running', 'done'].includes(missionSystem?.state)
                    || paperRouteSystem.isActive()
  const vp = vehicleState.position
  for (const [id, ring] of _poiRings) {
    const near = Math.hypot(ring.position.x - vp.x, ring.position.z - vp.z) <= POI_RING_SHOW_R
    ring.visible = near && id !== activeId && !onMission
  }
  if (!zone) { if (_stageRing) _stageRing.visible = false; return }
  if (!_stageRing) {
    _stageRing = new THREE.Mesh(_ringGeo, _stageRingMat)
    _stageRing.renderOrder = 5
    _stageRing.frustumCulled = false
    scene.add(_stageRing)
  }
  _stageRing.scale.set(zone.r, _STAGE_RING_H, zone.r)
  _stageRing.position.set(zone.x, zone.y - _STAGE_RING_SINK + _STAGE_RING_H * 0.5, zone.z)
  _stageRing.visible = true
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

// ── FEAT-53: the economy spine ─────────────────────────────────────────────────────────────
// Payout, wallet and mission points ("good deeds" on the HUD — owner theming, 2026-08-01).
// Story mode only: start() zeroes the run wallet when the region goes live (story deps below);
// in free roam nothing constructs terms and nothing settles, so it is inert. Run-layer state
// lives in economy.js's runEconomy — a SIBLING of day.js's runState, because the wallet moves at
// mission settlement, which is not a day/sleep boundary (SM-INV-12).
const economySystem = new EconomySystem({
  getDay: () => daySystem.day(),
})

// FEAT-61: the character channel. No deps — it owns a queue and a once-per-run seen set, and this
// file owns the DOM (the mission-panel pattern).
const dialogueSystem = new DialogueSystem()

/**
 * Paint the dialogue card. Called on every state change rather than per-frame: a card is static
 * until a key advances it, so there is nothing for the frame loop to do here.
 *
 * innerHTML is correct and safe on .dlg-text — cards are authored constants in data/dialogue.js
 * carrying <span class="dlg-key"> glyphs, never player input. See the note there.
 */
function _renderDialogue () {
  const panel = document.getElementById('dialogue-panel')
  if (!panel) return
  const card = dialogueSystem.current()
  panel.style.display = card ? 'block' : 'none'
  if (!card) return
  const sp = document.getElementById('dlg-speaker')
  const tx = document.getElementById('dlg-text')
  const mo = document.getElementById('dlg-more')
  if (sp) sp.textContent = card.speaker
  if (tx) tx.innerHTML = card.text
  const p = dialogueSystem.progress()
  // The affordance is "press anything", so name no key — the brief's press-any-key-to-continue.
  if (mo) mo.textContent = p ? `${p.n} / ${p.of}  —  press any key` : ''
}

// ── FEAT-61: the throw ────────────────────────────────────────────────────────
// Hold F to aim, release to throw. The mission (Phase E) consumes landing points; this section only
// produces them, which is why the ballistics live in throw.js and can be gated without a renderer.
// Where the reticle sits, as a fraction of screen height from the top. NOT centred (owner,
// 2026-08-05): a throw is an arc, so the point you want to hit is above the point the camera looks
// at, and a centred reticle made you aim at the ground in front of the truck. Everything that
// consumes the aim direction unprojects THROUGH this point, so the reticle cannot lie about where
// the paper is going.
const AIM_RETICLE_Y = 0.25
const _flying = []               // rolls still in the air — see _updateThrownRolls
const _thrownRolls = []          // live roll meshes, oldest first — see THROWN_ROLL_CAP
const THROWN_ROLL_CAP = 40       // papers left lying around before the oldest is reclaimed. A route
                                 // is at most 15 customers plus spares, so this holds a whole route
                                 // and then some; the cap exists so a debug session throwing all
                                 // afternoon cannot leak meshes.
const _aimDir = new THREE.Vector3()
const AIM_HOLD_S = 0.5           // s the camera stays on the aimed angle AFTER the paper lands
// The rolled paper is modelled at its real size — 90 × 420 mm (ASSETS.md keeps assets true to
// life). At that size it is a smudge from the chase camera, so the THROWN one is drawn at 2×
// (owner, 2026-08-05). A readability decision, deliberately made at the consumer rather than by
// falsifying the asset: the .glb stays honest for every other use, and scoring never reads the
// mesh — the landing point comes from the solver, so a bigger roll cannot make a throw score
// better than it was.
const THROWN_ROLL_SCALE = 2
// Peak tumble rate, rad/s per axis, rolled per throw. Fast enough to read as end-over-end at a
// glance, slow enough not to strobe against the 2× roll's stripe. Cosmetic only — the tumble never
// feeds back into the path, so two identical throws land identically however differently they spin.
const TUMBLE_MAX = 7
let _throwReadoutTimer = 0
let _aimHoldTimer = 0
// The cursor's last known position, so entering aim mode can seed the drag origin and the first
// mousemove is a delta of zero. Without it the view snaps by however far the pointer had drifted
// since the last real drag.
let _lastCursorX = 0, _lastCursorY = 0
document.addEventListener('mousemove', e => { _lastCursorX = e.clientX; _lastCursorY = e.clientY })

/**
 * Surface height for the flight.
 *
 * ANALYTIC HEIGHT, NOT sampleRoadTopY (owner-reported 2026-08-07: papers sank into uphill banks and
 * floated over downhill slopes). This used to try the road sampler first, copying _groundSampleY —
 * but that sampler is the graded APRON sampler, and camp.js already documents the trap: it
 * extrapolates the road-top PLANE laterally well past the asphalt and returns a finite Y for
 * essentially every point out to ~35 m from the centerline. So a paper thrown at a cut bank stopped
 * at the road's height (metres below the hillside it visually passed through), and one thrown down
 * a fill slope stopped at the road's height too (metres above the ground it should have hit). It
 * looked right on the shoulder and around the pads because there the apron IS the ground.
 *
 * analyticHeight is the ROAD-CARVED terrain surface — it already contains the cut and fill
 * earthwork, which is exactly the ground a paper bounces off — so it is right everywhere off the
 * asphalt, and the ribbon itself is handled once at the landing point (see _resolveLanding).
 */
function _throwGroundY (x, z) {
  return terrainSystem ? terrainSystem.analyticHeight(x, z) : 0
}

/**
 * If a paper landed on the road, seat it on the ASPHALT rather than on the carved dirt beneath it.
 *
 * The terrain is carved to roadClearanceMargin (0.15–0.25 m) BELOW the ribbon so the mesh can armor
 * under it, so a paper landing on tarmac would otherwise sit a fifth of a metre sunk into it — which
 * at the roll's drawn size is plainly visible.
 *
 * Done once, at the landing point, rather than inside the integrator: the honest "is this asphalt"
 * test is queryNearest (camp.js's `lateral <= roadHalfWidth`, not the apron sampler), and that is
 * ~44 µs a call — fine once per throw, a dropped frame if run at all ~150 integration steps. The arc
 * itself is unaffected because the two surfaces differ by that clearance and nothing else.
 */
function _resolveLanding (hit) {
  const road = roadSystem
  if (!road || typeof road.queryNearest !== 'function') return hit
  const half = (RANGER_PARAMS.roadHalfWidth ?? 5) + (RANGER_PARAMS.roadShoulderWidth ?? 2.5)
  const nr = road.queryNearest(hit.x, hit.z, half + 1)
  if (!nr?.point) return hit
  if (Math.hypot(nr.point.x - hit.x, nr.point.z - hit.z) > half) return hit
  const ry = road.sampleRoadTopY(hit.x, hit.z)
  if (ry == null || !isFinite(ry)) return hit
  hit.y = ry
  const n = hit.path.length
  if (n >= 3) hit.path[n - 2] = ry     // keep the replayed path ending where the paper rests
  return hit
}

/** Show the landing readout for a moment, then let it fade out of the way. */
function _showThrowReadout (html) {
  const el = document.getElementById('throw-readout')
  if (!el) return
  el.innerHTML = html
  el.style.display = 'block'
  clearTimeout(_throwReadoutTimer)
  _throwReadoutTimer = setTimeout(() => { el.style.display = 'none' }, 2600)
}

/**
 * Throw a roll from the truck along the camera's aim, and freeze it where it lands.
 *
 * The paper STAYS on the ground (owner, 2026-08-05). That is the feedback: a route you have driven
 * reads back as a trail of papers on porches and in ditches, and you can see the one you fluffed.
 * Nothing here simulates a bounce or a roll — the landing point is the scoring point, so the mesh
 * must sit exactly where the number came from or the readout would be contradicting the picture.
 */
function _throwRoll () {
  // Aim THROUGH the reticle, not along the camera's own forward axis. The reticle sits a quarter of
  // the way down the screen, so those two directions are ~15° apart — using the camera axis is what
  // made the throw land short of everything you were pointing at.
  _aimDir.set(0, 1 - 2 * AIM_RETICLE_Y, 0.5).unproject(camera).sub(camera.position).normalize()

  // FEAT-36/FEAT-48: debug projectile selector. Barrels and rocks are DYNAMIC ENGINE BODIES —
  // no ballistic solver, no landing point, no scoring: the engine flies them, bounces them and
  // lets you drive over them (the whole point). Same aim, same launch pose as the paper.
  if ((RANGER_PARAMS.throwProjectile ?? 'paper') !== 'paper') {
    const pd = vehicleState.position
    const pd0 = { x: pd.x + _aimDir.x * 1.6, y: pd.y + 1.6, z: pd.z + _aimDir.z * 1.6 }
    const vd0 = launchVelocity(_aimDir, vehicleState.velocity)
    debrisSystem.spawn(RANGER_PARAMS.throwProjectile, pd0, vd0)
    return
  }

  // Launch from above the cab rather than the body origin: from the origin a flat throw clips the
  // truck's own roof on the first step and lands on the bonnet.
  const p = vehicleState.position
  const p0 = new THREE.Vector3(p.x + _aimDir.x * 1.2, p.y + 1.5, p.z + _aimDir.z * 1.2)
  const v0 = launchVelocity(_aimDir, vehicleState.velocity)
  const hit0 = simulateThrow(p0, v0, _throwGroundY)
  if (!hit0) return   // off a cliff or aimed at the sky — no landing, nothing to score
  const hit = _resolveLanding(hit0)

  const roll = spawnModel('newsRoll')
  roll.scale.setScalar(THROWN_ROLL_SCALE)
  roll.position.copy(p0)
  scene.add(roll)
  _thrownRolls.push(roll)
  while (_thrownRolls.length > THROWN_ROLL_CAP) {
    const old = _thrownRolls.shift()
    scene.remove(old)
    const i = _flying.findIndex(f => f.roll === old)
    if (i >= 0) _flying.splice(i, 1)      // reclaimed mid-flight: stop integrating a removed mesh
  }

  // Play back the path the SOLVER flew, sample for sample. Before drag this was a parabola and the
  // visual could be evaluated in closed form; with drag there is no closed form, and re-integrating
  // here would put a second, nearly-identical arc on screen next to the one that produced the
  // score. Replaying the recorded path makes "where it looks like it landed" and "where it scored"
  // the same statement by construction.
  //
  // The tumble is per-throw random and purely cosmetic — it never touches the path, so two
  // identical throws still land identically however differently they spin (owner: "a little bit of
  // random rotation for visual flair").
  _flying.push({
    roll, path: hit.path, tEnd: hit.t, hit, tau: 0,
    spin: {
      x: (Math.random() * 2 - 1) * TUMBLE_MAX,
      y: (Math.random() * 2 - 1) * TUMBLE_MAX,
      z: (Math.random() * 2 - 1) * TUMBLE_MAX,
    },
    restYaw: Math.random() * Math.PI * 2,
  })
  return hit
}

/**
 * Fly the airborne rolls. Called from the frame loop with real seconds.
 *
 * This is the bit that was missing: the paper used to appear on the ground the instant F came up,
 * because the solver returns a landing point and nothing ever drew the arc between here and there.
 */
function _updateThrownRolls (dt) {
  if (!_flying.length) return
  const step = THROW_PARAMS.stepS
  for (let i = _flying.length - 1; i >= 0; i--) {
    const f = _flying[i]
    f.tau = Math.min(f.tEnd, f.tau + dt)

    // Sample the recorded path at the current time, lerping between the two straddling samples so
    // the flight is smooth at any frame rate rather than stepping at the solver's 120 Hz.
    const path = f.path
    const last = path.length / 3 - 1
    const u = Math.min(last, f.tau / step)
    const i0 = Math.min(last, Math.floor(u)), i1 = Math.min(last, i0 + 1)
    const a = u - i0
    f.roll.position.set(
      path[i0 * 3]     + (path[i1 * 3]     - path[i0 * 3])     * a,
      path[i0 * 3 + 1] + (path[i1 * 3 + 1] - path[i0 * 3 + 1]) * a,
      path[i0 * 3 + 2] + (path[i1 * 3 + 2] - path[i0 * 3 + 2]) * a,
    )
    f.roll.rotation.set(f.spin.x * f.tau, f.spin.y * f.tau, f.spin.z * f.tau)

    if (f.tau >= f.tEnd) {
      f.roll.position.set(f.hit.x, f.hit.y, f.hit.z)   // seat it exactly where it scored
      // Settle flat, at a random yaw: a roll that came to rest should look dropped, and freezing
      // it mid-tumble reads as a bug rather than as a paper on a lawn.
      f.roll.rotation.set(0, f.restYaw, Math.PI / 2)
      _flying.splice(i, 1)
      _scoreLanding(f.hit)                              // the number arrives WITH the landing
    }
  }
}

/**
 * Score one landing and show it.
 *
 * ON A ROUTE, the paper route owns the answer: it credits a specific customer once, spends the
 * inventory, and decides whether that was the last paper. Off a route this falls back to scoring
 * against the nearest customer in the region — a practice throw, and the same read-out that proved
 * the target circles and the ballistics agree with each other.
 */
function _scoreLanding (hit) {
  const R = POI_PARAMS.poiHouseTargetR
  const scored = paperRouteSystem.recordLanding(hit.x, hit.z)
  if (scored) {
    if (scored.credited) {
      // DISTANCE THEN DOLLARS (owner, 2026-08-14). Accuracy is what the throw pays for now, so the
      // read-out quotes the money it just earned rather than a percentage the player has to convert
      // in their head. `scored.pay` is banked money — the expediency bonus is not in it, because
      // that depends on when you finish and the route can still take it back.
      _showThrowReadout(`<span style="color:#7ed957">${scored.dist.toFixed(2)} m`
        + ` &nbsp;·&nbsp; +$${scored.pay.toFixed(2)}</span>`)
    } else if (scored.already) {
      // Not a failure — a paper spent. Saying so is the difference between "that did nothing" and
      // "you already did this one", and only one of those tells you to drive on.
      _showThrowReadout('<span style="color:#8a939c">they already have one</span>')
    } else if (scored.dist < 25) {
      _showThrowReadout(`<span style="color:#ff9f43">missed by ${(scored.dist - R).toFixed(1)} m</span>`)
    } else {
      // ON A ROUTE, A THROW ALWAYS ANSWERS. The distance gate above is right for a practice throw
      // in open country — but during a route, silence is indistinguishable from a broken mission,
      // which is exactly how this read as one (owner, 2026-08-09).
      _showThrowReadout('<span style="color:#ff9f43">nobody on your route lives there</span>')
    }
    return
  }

  let best = null, bestD = Infinity
  for (const c of poiSystem.customers()) {
    const d = Math.hypot(c.x - hit.x, c.z - hit.z)
    if (d < bestD) { bestD = d; best = c }
  }
  const q = best ? accuracyScore(bestD, R) : 0
  if (q > 0) {
    _showThrowReadout(`<span style="color:#7ed957">${bestD.toFixed(2)} m — ${Math.round(q * 100)}%</span>`)
  } else if (best && bestD < 25) {
    _showThrowReadout(`<span style="color:#ff9f43">missed by ${(bestD - R).toFixed(1)} m</span>`)
  }
}

/** Drop every paper — leaving the region, or putting a finished route down. */
function _clearThrownRolls () {
  for (const r of _thrownRolls) scene.remove(r)
  _thrownRolls.length = 0
  // …including the ones still in the air. Without this their meshes leave the scene but the
  // integrator keeps flying them, and each one still calls _scoreLanding when it "lands".
  _flying.length = 0
}

// F is hold-to-aim. keydown repeats while held, and setAimMode is idempotent, so the repeat costs
// nothing; the reticle appears on the first one. Nothing here fires while a briefing is up — that
// listener runs in the capture phase and stops propagation before this one is reached.
document.addEventListener('keydown', e => {
  if (e.key !== 'f' && e.key !== 'F') return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (getCameraMode() !== 'chase') return      // hood and freecam own their own look
  clearTimeout(_aimHoldTimer)                  // re-aiming during the post-throw hold keeps the view
  setAimMode(true, _lastCursorX, _lastCursorY)
  const rt = document.getElementById('aim-reticle')
  if (rt) rt.style.display = 'block'
})
document.addEventListener('keyup', e => {
  if (e.key !== 'f' && e.key !== 'F') return
  if (!isAiming()) return                       // never aimed (wrong camera mode) — never throws
  const rt = document.getElementById('aim-reticle')
  if (rt) rt.style.display = 'none'
  // On a route, a throw costs a paper — and an empty truck cannot throw. Spent at RELEASE, not at
  // the landing: a paper in the air is a paper you no longer have. Off a route there is no
  // inventory and practice throws are free.
  // FEAT-36: debris throws (barrel/rock via the debug selector) are physics tests — they never
  // spend, refund, or score papers, even mid-route.
  const throwingPaper = (RANGER_PARAMS.throwProjectile ?? 'paper') === 'paper'
  const onRound = throwingPaper && paperRouteSystem.isRunning()
  if (onRound && !paperRouteSystem.takePaper()) {
    _showThrowReadout('<span style="color:#ff9f43">out of papers</span>')
    setAimMode(false)
    return
  }
  const hit = _throwRoll()
  // No landing (off a cliff, or aimed at the sky) means the solver never produced a throw at all —
  // nothing was drawn and nothing will ever score, so the paper goes back in the truck. Otherwise
  // an aim at the horizon would silently eat inventory AND leave the route unable to end on it.
  if (onRound && !hit) paperRouteSystem.refundPaper()
  // HOLD THE VIEW (owner, 2026-08-05). Snapping back to the follow camera the instant F comes up
  // yanks the throw out of frame before you can see where it went. Stay on the aimed angle for the
  // whole flight plus a beat, then hand the camera back. Rearmed on every throw, so a quick second
  // throw extends the hold rather than cutting the first one short.
  clearTimeout(_aimHoldTimer)
  // Debris has no solver flight time (the engine flies it live) — hold ~1.5 s so the launch stays
  // in frame, same reasoning as the paper's flight-long hold.
  _aimHoldTimer = setTimeout(() => setAimMode(false), ((hit?.t ?? (throwingPaper ? 0 : 1.5)) + AIM_HOLD_S) * 1000)
})

// Press-any-key advances, and the key goes NOWHERE else. Capture phase on document, which runs
// before every other keydown listener in the project (camera.js, vehicle.js, debug.js and the
// handlers further down this file all bind bubble-phase on document) — so a briefing cannot be
// driven through, paused out of, or logged over. Cards only appear while parked, but "only" is not
// a guarantee worth relying on.
document.addEventListener('keydown', e => {
  if (!dialogueSystem.active) return
  if (e.repeat) return                                          // held key ≠ several presses
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return  // a modifier alone is not a press
  e.preventDefault()
  e.stopPropagation()
  dialogueSystem.advance()
  _renderDialogue()
}, { capture: true })

// …and a click advances too (owner, 2026-08-05). "Press any key" is a keyboard idiom, and a hand
// already on the mouse should not have to move. Same capture-phase swallow, for the same reason:
// the click that advances a card must not also start a camera drag underneath it.
document.addEventListener('mousedown', e => {
  if (!dialogueSystem.active) return
  if (e.target.closest?.('.lil-gui')) return    // the debug panel keeps working during a briefing
  e.preventDefault()
  e.stopPropagation()
  dialogueSystem.advance()
  _renderDialogue()
}, { capture: true })

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

/**
 * Open (or close) the map framed on a route.
 *
 * Shared by the POI job and the paper route (FEAT-61): both want the same thing at the same
 * moment — "here is the work, look at it before you commit". Taking `markers` as an argument
 * rather than reading one system means the second caller was a parameter, not a copy.
 *
 * The offer panel is z 95 and the map canvas z 90, so accept/decline stay on top and clickable —
 * the map is a backdrop to the offer, not a modal over it.
 */
function _setMapOpen (open, mk) {
  if (!open) { map2d.hide(); return }
  map2d.show()
  // Frame the whole job so the route reads at a glance instead of running off the edge.
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
  setMapOpen: (open) => _setMapOpen(open, missionSystem?.markers()),
  // FEAT-53: the economy seams. Terms (day tier + rank thresholds) freeze at ACCEPT; a finished
  // POI job settles into the run wallet. Quick Job never settles — it pays nothing by design.
  getTerms: () => economySystem.terms(),
  onSettle: (result, mission) => economySystem.settle(result, mission),
  onChange: () => _renderMissionUI(),
})

// ── FEAT-61: the paper route ───────────────────────────────────────────────────────────────
// Larry's route. A SIBLING of missionSystem — the two can never run at once (each one's park
// trigger and prompt yields to the other's active state), but neither is a mode inside the other.
//
// It plans on missionSystem's planner network: the region is warmed once at story entry and its
// edges are already routed, so a second 1400 m planner would re-stream roads that exist a metre
// away in memory.
const paperRouteSystem = new PaperRouteSystem({
  getRoad:   () => missionSystem?.planner() ?? roadSystem,
  getPois:   () => poiSystem,
  getRegion: () => storySystem?.region() ?? null,
  getCar:    () => vehicleState.position,
  getTerms:  () => economySystem.terms(),
  getTargetR: () => POI_PARAMS.poiHouseTargetR,
  // The ONE money path (FEAT-53). This mission prices itself on its own axis and hands over a
  // finished number; the wallet, the deeds and the mission count still accrue in economy.js.
  onSettle:  (payout, letter) => economySystem.settleFlat(payout, letter),
  // FEAT-61: accuracy money, banked as each paper lands. Same wallet, same module — but no points
  // and no mission count, because a delivery is not a settlement.
  onSpot:    (amount) => economySystem.addSpot(amount),
  // Larry talks while the tour routes. Once per run (DLG's seen-gate) — the second route must not
  // re-explain the throw — and `done` fires either way, because a skipped briefing still has to
  // release the offer.
  onBriefing: (done) => { dialogueSystem.play(DLG.paperRouteIntro, PAPER_ROUTE_INTRO, done); _renderDialogue() },
  // A finished route takes its papers off the lawns. Region exit does the same (see onRegionExit);
  // this is the other half of the rule the handoff flagged as missing.
  onEnd:     () => _clearThrownRolls(),
  // Parking at Larry's opens the map on the offer (owner, 2026-08-13). A paper route is fifteen
  // porches over as much as 2 km and the panel can only say so as a number — you cannot decide
  // whether to take it without seeing the SHAPE. Same seam a POI job already uses, and it fires at
  // 'offer' rather than on arrival because that is the first moment there is a route to preview.
  setMapOpen: (open) => _setMapOpen(open, paperRouteSystem?.markers()),
  onChange:  () => _renderPaperUI(),
})
window.__paperRoute = () => paperRouteSystem
// FEAT-63: cached so the 10 Hz poll is a style write and not a DOM lookup.
const _recalcEl = document.getElementById('gps-recalc')
let _recalcOn = false

// ── FEAT-39: GPS navigation assist ───────────────────────────────────────────
// A pure guidance overlay: chevrons along the route ahead + a turn arrow over the next junction.
// It reads the route the mission ALREADY computed (mission.segments) — no routing, no per-frame
// RoadSystem query, and nothing anywhere near the input/physics path. Shown only once the run is
// live: during 'offer' the truck has not been teleported to the start yet, so arrows would point
// off elsewhere.
gpsSystem = new GpsSystem(scene, {
  getRoute: () => {
    // FEAT-61/63: the paper route gets guidance too, and it gets the SHORTEST WAY TO FINISH from
    // where the truck actually is — `line()`, which is the re-planned guide when there is one and
    // the priced tour otherwise.
    //
    // This used to be `route` (the tour as priced) on the argument that pointing anywhere else
    // would guide you along a line the clock is not measuring. That is true and it is exactly
    // backwards: once you have left the priced tour it is no longer a route you are driving, only
    // a number you are measured against, so the shortest completion is your best remaining chance
    // of beating it (owner, 2026-08-11). The clock measuring a different line is the REASON the
    // guidance must be optimal rather than faithful. Par itself never moves — see paper-route.js
    // line() for why route and guide are two objects.
    if (paperRouteSystem?.isCarrying()) return paperRouteSystem.line()
    const s = missionSystem?.state
    // 'staging' counts: that is precisely when a POI job wants guidance, because the reason the
    // start zone exists is that you may be pointing the wrong way and have to decide which.
    return (s === 'countdown' || s === 'staging' || s === 'running') ? missionSystem.mission : null
  },
  getCar: () => vehicleState.position,
  // Read at BAKE time only (once per mission, plus while the bake is still partial): the design
  // profile the carve, the ribbon mesh and the physics all read. Without it the overlay bakes the
  // par oracle's elevation instead, which is a different pipeline stage and disagrees by up to
  // 27 m — see gps.js bakeRoute's ELEVATION SOURCE note.
  getRoad: () => roadSystem,
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
  // FEAT-61: a route is a job in flight, same as any other — you cannot take work while doing work,
  // and Larry's own marker must not re-offer the route you are three houses into.
  if (paperRouteSystem.isActive()) return null
  // jobsOnly (FEAT-60): only a mission giver answers the park trigger. Without this the roster's
  // other six types would each win the trigger and then have nothing to say — and mom's house,
  // which outranks her own front door in the precedence below, would offer freight instead of bed.
  return poiSystem.nearest(vehicleState.position.x, vehicleState.position.z,
                           POI_PARAMS.poiInteractR, true)
}

// Rising edge of the parking-brake latch (vehicleState.parked), sampled where the prompt is polled.
// Starts TRUE because a spawn/teleport seats the truck already latched — an offer must never open
// from a latch the player did not pull. The latch is sticky (a tap sets it and it stays), so polling
// at the prompt's ~10 Hz cadence cannot miss a real pull.
let _prevParkedForPoi = true

// ── FEAT-45 Phase D: making camp, and sleeping ──────────────────────────────────────────────
//
// THE PROMPT'S SPEED GATE IS 20 kph (owner, 2026-07-30) — deliberately different from the POI
// prompt's any-speed rule right above. The two prompts are different kinds of thing: a POI is a
// LANDMARK you can see from the road, so its prompt is an instruction that must read as you go past;
// a campsite is a JUDGEMENT about the ground you are on, and the vibe bar it carries is only
// meaningful when you are crawling along looking for a spot. Advertising a live score at 80 kph
// would be noise, and would put a meter on the driving HUD (SM-INV-3).
const CAMP_PROMPT_KPH = 20

// ── The camp's world-space furniture (owner's 2026-07-30 pass) ────────────────────────────────
// Two things, both placeholder art in FEAT-43's sense:
//   • the SITE MARKER — a ring on the ground at the spot the siting ray picked, shown while the
//     prompt is up. The ray means the camp no longer lands where the truck is, so without this the
//     player has no way to read where "make camp" is actually going to put them.
//   • the CAMP CUBE — a blue box standing on the pad once camp is made, the stand-in for the tent
//     and fire models that are deferred.
// camp.js stays THREE-free (the story-layer isolation rule): it hands out a pad record and main.js
// is the only place that becomes geometry.
const _campGroup = new THREE.Group()
_campGroup.name = 'camp'
scene.add(_campGroup)
const CAMP_CUBE_SIZE = 1
const _campCube = new THREE.Mesh(
  new THREE.BoxGeometry(CAMP_CUBE_SIZE, CAMP_CUBE_SIZE, CAMP_CUBE_SIZE),
  new THREE.MeshStandardMaterial({ color: 0x3d7fd6, emissive: 0x0a1a33, roughness: 0.6 }))
_campCube.castShadow = true
_campCube.visible = false
_campGroup.add(_campCube)
// Unit ring (inner 0.86 / outer 1.0), laid flat and scaled to the live pad half-extent, so the
// campPadHalfM slider moves it without rebuilding geometry. No depth write: it is a read-out, and
// it must not z-fight the ground it is describing.
const _campMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.86, 1, 32),
  new THREE.MeshBasicMaterial({ color: 0xffdc3c, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }))
_campMarker.rotation.x = -Math.PI / 2
_campMarker.visible = false
_campGroup.add(_campMarker)

/** Show/hide the siting ring at the spot the ray picked. Called from the prompt poll (~10 Hz). */
function _updateCampMarker (site) {
  const pad = site?.pad
  _campMarker.visible = !!pad
  if (!pad) return
  _campMarker.position.set(pad.x, pad.y + 0.25, pad.z)
  const s = pad.halfLen || CAMP_PARAMS.campPadHalfM
  _campMarker.scale.set(s, s, 1)
}

/**
 * Camp is established: stand the cube on the pad and put the camera on it. The camera seam is
 * camera.js's focus override (setCameraFocus) — the minimal one: it reuses the chase cam's existing
 * drag-orbit angles, so the player can still look around camp, and clearing it hands back to the
 * follow lerp with no snap. Freecam is untouched and still outranks it.
 */
function _enterCampScene (site) {
  const pad = site?.pad
  if (!pad) return
  _campCube.visible = true
  _campCube.position.set(pad.x, pad.y + CAMP_CUBE_SIZE * 0.5, pad.z)
  setCameraFocus({ x: pad.x, y: pad.y + 1, z: pad.z })
}

/** Break camp / leave the region: cube away, camera back on the truck. */
function _exitCampScene () {
  _campCube.visible = false
  _campMarker.visible = false
  setCameraFocus(null)
}

// The camp dialogue's state, or null when it is closed. One object so every render reads one thing:
//   mode  'confirm' (make camp?) | 'camp' (break camp · sleep · fish) | 'sleep' (timer) | 'moms'
//   site  the graded record the camp was made from (vibe + waterFound + pad); null at mom's
//   moms  true when this is mom's house — fixed average vibe, no pad, no fish. Mom's is a POI
//         (poi.js roster), NOT a camp; it borrows this dialogue's sleep path and nothing else.
let _campUi = null
let _campBusy = false   // a fade is in flight: no second trigger, no double-dug pad

/**
 * The campsite grade to show for the truck's current position, or null when nothing should show.
 * In a zone, below 20 kph, story mode, mission idle, dialogue closed. Being outside the tether or
 * on bad ground does NOT return null — those are the prompt's two failure copies, and telling the
 * player why they cannot camp here is the entire job of a prompt.
 */
// "Looking for a campsite" — the expand state of the camp prompt (owner, 2026-07-31: the full
// bar-and-copy prompt was intrusive when just driving through a zone). Collapsed, the prompt is a
// single chip AND the siting ray never runs AND the brake latch will not open the camp dialogue —
// expanding is how the player says "I'm shopping for ground now". Session-sticky on purpose: it
// stays expanded from zone to zone until they collapse it.
let _campSeek = false

function _campPromptState () {
  if (!storySystem.isActive() || storySystem.isEntering()) return null
  if (missionSystem && missionSystem.state !== 'idle') return null
  if (paperRouteSystem.isActive()) return null       // FEAT-61: not while a route is out
  if (_campUi || _campBusy) return null
  if (Math.hypot(vehicleState.velocity.x, vehicleState.velocity.z) * 3.6 > CAMP_PROMPT_KPH) return null
  if (!campSystem.zoneAt(vehicleState.position.x, vehicleState.position.z)) return null
  // Collapsed: the zone test above (a point-in-disc scan) is ALL we pay — no ray, no grading.
  if (!_campSeek) return { collapsed: true }
  const g = campSystem.evaluate(vehicleState.position.x, vehicleState.position.z)
  return g.inZone ? g : null
}

/** Can the truck knock on mom's door from here? (Same gates, minus the zone and the grading.) */
function _atMomsHouse () {
  if (!storySystem.isActive() || storySystem.isEntering()) return false
  if (missionSystem && missionSystem.state !== 'idle') return false
  if (paperRouteSystem.isActive()) return false      // FEAT-61: not while a route is out
  if (_campUi || _campBusy) return false
  return campSystem.atMoms(vehicleState.position.x, vehicleState.position.z)
}

/**
 * THE ONE PARK TRIGGER (FEAT-46's brake latch, now shared). Rising edge of the parking brake, ONE
 * detector, and a fixed precedence: a POI in reach wins (the 18 m lay-by is the specific
 * affordance and it is what you drove onto), then making camp, then mom's door. The prompt follows
 * the same order, so what you see is always what the brake will do.
 */
function _updateParkTriggers () {
  const poiEl  = document.getElementById('poi-prompt')
  const campEl = document.getElementById('camp-prompt')
  const poi = _poiInReach()
  const parked = !!vehicleState.parked
  const pulled = parked && !_prevParkedForPoi
  _prevParkedForPoi = parked

  if (poi && pulled) {
    // FEAT-61: Larry is the one giver whose offer is a different mission. Branching on the type
    // here (rather than teaching MissionSystem a second shape) is what keeps the two systems
    // siblings — each leaves 'idle' and each other's reach test then returns null.
    if (poi.type === 'larrysHouse') paperRouteSystem.open(poi)
    else missionSystem.enterFromPoi(poi)
    if (poiEl) poiEl.style.display = 'none'
    if (campEl) campEl.style.display = 'none'
    return
  }

  const camp = _campPromptState()
  const seeking = camp && !camp.collapsed
  // Mom's door outranks the collapsed chip (a doorstep is a specific affordance, like a POI) but
  // yields to an ACTIVE campsite hunt — mid-seek the bar is what the player is reading.
  const moms = !seeking && _atMomsHouse()

  if (pulled) {
    if (seeking && camp.withinTether && camp.flat && camp.pad) {
      _campUi = { mode: 'confirm', site: camp, moms: false }
      _renderCampUI()
    } else if (moms) {
      _campUi = { mode: 'moms', site: null, moms: true }
      _renderCampUI()
    }
  }

  // Display. The POI prompt wins outright when both apply — see the precedence above.
  if (poiEl) {
    poiEl.style.display = poi ? 'block' : 'none'
    // Name what the brake will actually do. Larry hands out a route, not an errand, and a prompt
    // that says "mission" at the one marker that gives you the paper route is the same small lie as
    // a ring drawn wider than its trigger.
    if (poi) poiEl.textContent = poi.type === 'larrysHouse' ? 'park to take the paper route'
                                                           : 'park to begin mission'
  }
  if (!campEl) return
  const showCamp = !poi && (camp || moms) && !_campUi
  campEl.style.display = showCamp ? 'block' : 'none'
  // The world-space ring: only while the camp prompt is offering a spot that could actually be
  // taken. Not while collapsed, not at mom's (no pad). Once the dialogue is up the DIALOGUE owns
  // the ring — the confirm face leaves it standing on the site it is asking about — so this 10 Hz
  // poll must not stamp it off underneath (showCamp is false whenever _campUi is set).
  if (!_campUi) _updateCampMarker(showCamp && seeking && camp.withinTether && camp.flat ? camp : null)
  if (!showCamp) return
  const vibeEl = document.getElementById('camp-vibe')
  const legEl  = document.getElementById('camp-vibe-legend')
  const textEl = document.getElementById('camp-prompt-text')
  const tglEl  = document.getElementById('camp-seek-toggle')
  const collapsed = !!camp?.collapsed
  campEl.classList.toggle('collapsed', collapsed && !moms)
  if (tglEl) {
    tglEl.style.display = moms ? 'none' : 'block'
    tglEl.textContent = collapsed ? 'look for a campsite' : '▾ stop looking'
  }
  if (moms || collapsed) {
    if (vibeEl) vibeEl.style.display = 'none'
    if (legEl)  legEl.style.display = 'none'
    if (textEl) {
      textEl.style.display = moms ? 'block' : 'none'
      if (moms) textEl.textContent = "park to sleep at mom's house"
    }
    return
  }
  if (vibeEl) vibeEl.style.display = 'flex'
  if (legEl)  legEl.style.display = 'flex'
  _renderVibeBar(camp)
  if (textEl) {
    textEl.style.display = 'block'
    // "not flat" now means the WHOLE siting ray failed the flatness gate — every candidate from the
    // road edge out to the tether — not merely that the verge beside the truck did.
    textEl.textContent = !camp.withinTether ? 'too far from the road'
                       : !camp.flat         ? 'not flat'
                       :                      'park to make camp'
  }
}

/** The stacked vibe bar: four segments whose max widths ARE the 40/15/20/25 VIBE_W weights. */
function _renderVibeBar (g, root = document.getElementById('camp-vibe')) {
  if (!root || !g) return
  const seg = (cls, v) => { const e = root.querySelector(cls); if (e) e.style.width = (v * 100).toFixed(1) + '%' }
  seg('.vseg-flat',  g.flatScore)
  seg('.vseg-view',  g.viewScore)
  seg('.vseg-shade', g.shadeScore)
  seg('.vseg-water', g.waterScore)
}

/**
 * Run `during` behind a full-screen black fade — the make-camp chore and the night both happen in
 * it. The fade is what makes a time skip read as elapsed time rather than as a teleport, and it is
 * also the cover for the terrain re-bake the pad carve needs.
 */
function _campFade (during) {
  const el = document.getElementById('camp-fade')
  _campBusy = true
  const finish = () => {
    try { during() } finally {
      if (el) setTimeout(() => { el.classList.remove('on'); _campBusy = false }, 120)
      else _campBusy = false
    }
  }
  if (!el) { finish(); return }
  el.classList.add('on')
  setTimeout(finish, 480)   // slightly past the 0.45 s CSS transition
}

/**
 * Re-realize the ground around a pad after the carve tables changed (a bench dug OR un-dug):
 * rebuild the terrain chunks, then release the covering prop chunks so the scatter re-rolls
 * against the finished ground — digging clears the site of trees via the pad keep-out
 * (poiPadBlocked); un-digging lets them come back.
 */
function _refreshGroundAround (pad) {
  terrainSystem?.rebuildAllChunksFromWorker()
  if (propSystem) {
    const S = CHUNK_SIZE, r = pad.halfLen
    const c0x = Math.floor((pad.x - r) / S), c1x = Math.floor((pad.x + r) / S)
    const c0z = Math.floor((pad.z - r) / S), c1z = Math.floor((pad.z + r) / S)
    for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) propSystem.releaseChunk(cx, cz)
  }
}

/** Confirmed: 30 in-game minutes pass and a 6 m bench is dug at the graded spot. */
function _makeCamp () {
  const site = _campUi?.site
  if (!site?.pad || _campBusy) return
  _campFade(() => {
    daySystem.advanceMinutes(30)   // the chore costs the day 30 minutes of energy, like any 30 min
    // The bench rides the POI pad carve (RoadSystem._padsAll) — same records, same zero-authority
    // road gate, so digging a camp can no more move the ribbon than a lay-by can.
    roadSystem?.setCampPads(campSystem.makeCampAt(site.pad))
    _refreshGroundAround(site.pad)
    _campUi = { mode: 'camp', site, moms: false }
    _enterCampScene(site)   // blue cube on the pad, camera on the camp
    _renderCampUI()
  })
}

/** Sleep the chosen number of hours at this site's vibe (mom's house is a fixed average 0.5). */
function _sleepAtCamp () {
  if (!_campUi || _campBusy) return
  const hours = parseInt(document.getElementById('cp-hours')?.value ?? '8', 10) || 8
  const vibe = _campUi.moms ? 0.5 : (_campUi.site?.vibe ?? 0.5)
  const back = _campUi.moms ? 'moms' : 'camp'
  _campFade(() => {
    daySystem.sleep(hours, vibe)
    // You wake WHERE YOU SLEPT: the truck is untouched and the dialogue is still up. The pad stays
    // dug for as long as you stay camped; "break camp" is what closes it AND un-digs the bench.
    _campUi = { ..._campUi, mode: back }
    _renderCampUI()
  })
}

/**
 * Close the dialogue — and if it was an ESTABLISHED camp, un-dig the bench. The pad originally
 * stayed as permanent earthwork, but a leftover bench is perfectly flat ground, so re-camping it
 * gamed the flatness score (owner, 2026-07-30). Mom's house and the pre-dig confirm screen have
 * no pad, so they just close. The truck hold is released by the frame loop the moment _campUi
 * goes null.
 */
function _closeCampUi () {
  const st = _campUi
  _campUi = null
  const pad = (!st?.moms && st?.site?.pad && campSystem.camps().includes(st.site.pad)) ? st.site.pad : null
  if (pad) {
    roadSystem?.setCampPads(campSystem.removeCamp(pad))
    _refreshGroundAround(pad)
  }
  _exitCampScene()
  _renderCampUI()
}

/**
 * THE SLEEP PREVIEW (owner, 2026-07-30). Dragging the timer shows the WAKE energy this many hours
 * would actually leave you with — recovery at this site's vibe, minus the coffee loan, clamped at a
 * full tank — so the flow is "drag until the meter looks full, commit" rather than mental arithmetic.
 *
 * The number comes from DaySystem.previewWake, which is literally the arithmetic sleep() applies:
 * one code path, so the preview cannot promise something the night does not deliver.
 *
 * SLEEP DEBT ON THE METER (owner, 2026-08-02). The bar's domain is [debtFloorH, fullEnergyH]
 * (−8..16), with a tick at zero; a segment grows RIGHT from the tick for energy in hand and LEFT
 * for hours of debt. Fill and preview each wear the STAGE_COLOR of the value they show (sleepy
 * yellow / tired orange / exhausted red — debt is always left of the tick and always red, since
 * negative IS exhausted), so the bar and the slider double as the deprivation-stage overlay.
 */
function _syncSleepRow () {
  const h = parseInt(document.getElementById('cp-hours')?.value ?? '8', 10) || 8
  const vibe = _campUi?.moms ? 0.5 : (_campUi?.site?.vibe ?? 0.5)
  const full  = daySystem.fullEnergyH()
  const floor = daySystem.debtFloorH()
  const now   = daySystem.energyH()
  const wake  = daySystem.previewWake(h, vibe)
  const wh    = daySystem.previewWakeHour(h)

  // Map an energy value to a bar fraction, and lay a segment between the zero tick and the value.
  const frac = (v) => Math.max(0, Math.min(1, (v - floor) / (full - floor)))
  const seg = (el, v, alpha) => {
    if (!el) return
    const a = frac(Math.min(0, v)), b = frac(Math.max(0, v))
    el.style.left = `${a * 100}%`
    el.style.width = `${(b - a) * 100}%`
    el.style.background = STAGE_COLOR[daySystem.stageFor(v)] + (alpha ? '57' : '')   // 0x57 ≈ the old 34% preview wash
  }
  seg(document.getElementById('cp-energy-preview'), wake, true)
  seg(document.getElementById('cp-energy-fill'), now, false)
  const zero = document.getElementById('cp-energy-zero')
  if (zero) zero.style.left = `${frac(0) * 100}%`
  const slider = document.getElementById('cp-hours')
  if (slider) slider.style.accentColor = STAGE_COLOR[daySystem.stageFor(wake)]

  const t = document.getElementById('cp-hours-text')
  if (t) t.textContent = `${h} h  ·  wake ${String(Math.floor(wh)).padStart(2, '0')}:${String(Math.floor((wh % 1) * 60)).padStart(2, '0')}`
  const e = document.getElementById('cp-energy-text')
  if (e) {
    // Static strings + toFixed numbers only — nothing player-controlled reaches this innerHTML.
    e.innerHTML = `energy ${now.toFixed(1)} → ${wake.toFixed(1)} / ${full.toFixed(0)} h`
      + `  ·  wake <span style="color:${STAGE_COLOR[daySystem.stageFor(wake)]}">${daySystem.stageFor(wake)}</span>`
      + (daySystem.coffeeDebt() > 0 ? `  ·  coffee debt ${daySystem.coffeeDebt().toFixed(0)} h at wake` : '')
  }
}

// Ground flavour for the confirm face's stats line. Both cuts sit well inside camp.js's two
// spread thresholds — campMaxUnevenM 0.9 m (where the flatness SCORE reaches zero) and
// campGateUnevenM 1.2 m (where the site stops being campable at all) — so by the time the word
// reads "hilly" the yellow segment is already nearly gone, and the two agree.
const CAMP_FLAT_M = 0.2   // m of spread at/below which the ground reads as dead flat
const CAMP_TILT_M = 0.6   // …and at/below which it is merely inclined; above that, hilly
// The view word, on the RAW view fraction (viewScore / VIBE_W.view — the score before its weight).
const CAMP_VIEW_BIG = 0.6   // at/above this the outlook is worth mentioning as the reason to stop
const CAMP_VIEW_OK  = 0.3   // …and at/above this it is at least open; below, you are walled in

/**
 * Render the camp dialogue. day.js/camp.js stay renderer-agnostic (the mission-panel pattern) —
 * this is the only place camp state becomes DOM.
 */
function _renderCampUI () {
  const panel = document.getElementById('camp-panel')
  if (!panel) return
  const st = _campUi
  panel.style.display = st ? 'block' : 'none'
  if (!st) return
  const show = (id, on) => { const e = document.getElementById(id); if (e) e.style.display = on ? '' : 'none' }
  const set  = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt }
  const isSleep = st.mode === 'sleep'
  const isConfirm = st.mode === 'confirm'
  const vibe = st.moms ? 0.5 : (st.site?.vibe ?? 0)

  set('cp-title', st.moms ? "mom's house" : 'camp')
  show('cp-make',   isConfirm)
  show('cp-cancel', isConfirm)
  show('cp-break',  st.mode === 'camp' || st.mode === 'moms')
  show('cp-sleep',  st.mode === 'camp' || st.mode === 'moms')
  show('cp-fish',   st.mode === 'camp' && !!st.site?.waterFound)
  show('cp-sleep-go',   isSleep)
  show('cp-sleep-back', isSleep)
  show('cp-sleep-panel', isSleep)
  set('cp-break', st.moms ? 'leave' : 'break camp')
  show('cp-vibe',        isConfirm)
  show('cp-vibe-legend', isConfirm)
  if (isConfirm) _renderVibeBar(st.site, document.getElementById('cp-vibe'))

  // The confirm face LOOKS at the ground it is asking about: camera onto the graded site and the
  // siting ring left standing on it. Same seam _enterCampScene uses, so committing is a re-target
  // rather than a hand-off; abandoning goes through _closeCampUi → _exitCampScene, which clears
  // both. Every other face drops the ring — camp has the cube, mom's and the timer have no site.
  if (isConfirm && st.site?.pad) {
    const pad = st.site.pad
    setCameraFocus({ x: pad.x, y: pad.y + 1, z: pad.z })
    _updateCampMarker(st.site)
  } else {
    _updateCampMarker(null)
  }

  const body = document.getElementById('cp-body')
  if (body) {
    if (isConfirm) {
      const sp = st.site.spread
      const ground = sp <= CAMP_FLAT_M ? 'dead flat' : sp <= CAMP_TILT_M ? 'inclined' : 'hilly'
      // The view word rides the same rule as "fishable": a poor outlook is simply not mentioned,
      // because a greyed "no view" would read as a promise the site broke rather than a fact.
      const vf = (st.site.viewScore ?? 0) / VIBE_W.view
      const vista = vf >= CAMP_VIEW_BIG ? 'big view' : vf >= CAMP_VIEW_OK ? 'open outlook' : ''
      body.innerHTML = `<span class="cp-stat">vibe ${(vibe * 100) | 0}%</span>`
        + ` &middot; <span class="cp-flat">${ground}</span>`
        + (vista ? ` &middot; <span class="cp-view">${vista}</span>` : '')
        + ` &middot; <span class="cp-trees">${st.site.trees} trees</span>`
        // No water ⇒ the word is simply absent. A greyed "fishable" would read as a broken promise.
        + (st.site.waterFound ? ' &middot; <span class="cp-water">fishable</span>' : '')
    } else if (isSleep) {
      body.innerHTML = '<span class="cp-dim">how long?</span>'
    } else if (st.moms) {
      body.innerHTML = 'the porch light is on.<br><span class="cp-dim">a bed, and an average night&rsquo;s sleep</span>'
    } else {
      body.innerHTML = 'camp is made.<br>'
        + `<span class="cp-dim">vibe ${(vibe * 100) | 0}%</span>`
    }
  }

  // The meter, the wake readout and the preview are all one write — _syncSleepRow owns them, and it
  // is the same function the slider's input event calls, so opening the face and dragging it agree.
  if (isSleep) _syncSleepRow()
}

document.getElementById('camp-seek-toggle')?.addEventListener('click', (e) => {
  _campSeek = !_campSeek
  e.currentTarget.blur()      // Space is the parking brake — a focused button would steal the tap
  _updateParkTriggers()       // repaint now rather than on the next 10 Hz poll
})
document.getElementById('cp-make')?.addEventListener('click', _makeCamp)
document.getElementById('cp-cancel')?.addEventListener('click', _closeCampUi)
document.getElementById('cp-break')?.addEventListener('click', _closeCampUi)
document.getElementById('cp-sleep')?.addEventListener('click', () => {
  if (!_campUi) return
  _campUi = { ..._campUi, mode: 'sleep' }
  _renderCampUI()
})
document.getElementById('cp-sleep-back')?.addEventListener('click', () => {
  if (!_campUi) return
  _campUi = { ..._campUi, mode: _campUi.moms ? 'moms' : 'camp' }
  _renderCampUI()
})
document.getElementById('cp-sleep-go')?.addEventListener('click', _sleepAtCamp)
document.getElementById('cp-hours')?.addEventListener('input', _syncSleepRow)

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
          ? `<span class="mp-dim">starts here &mdash; turn around as you like; the clock starts when you leave the circle</span>`
          : `<span class="mp-dim">green pin is the start &mdash; you'll be moved there</span>`)
      // FEAT-46: the offer is exactly three actions — decline · regenerate · accept.
      // FEAT-53: on a PAID (POI) job the regenerate button is hidden outright — a dead button is
      // worse than no button. The mission.js PAID_JOB_DO_OVERS guard stays behind it as defence
      // against a devtools click; Quick Job (the unpaid calibration rig) keeps the button.
      btn('mp-accept', true); btn('mp-decline', true); btn('mp-retry', false)
      btn('mp-regen', !j.fromPoi); btn('mp-quit', false)
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
    case 'staging':
      // The POI start. No digits and no hold — the only thing the player needs told is what starts
      // the clock, and the green ring that just replaced the marker's orange one says where.
      show(panel, false); show(hud, true)
      hud.textContent = 'leave the green circle to start'
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
      // FEAT-53: the letter wears its ratified rank colour (D·C·B·A·S = red·orange·yellow·white·
      // blue), the one place a rank is ever shown (SM-INV-3: result-card only, never live). A paid
      // job adds its payout + good deeds; Quick Job says plainly that it pays nothing.
      const paid = r.payout !== undefined
      // Letter and time share the headline, at one size (owner, 2026-08-14 — the same rule the
      // paper route's cards follow). Par stays underneath: it is the reference, not the result.
      body.innerHTML = `<span class="mp-big" style="color:${RANK_COLOR[r.letter] || '#fff'}">${r.letter}</span>`
        + ` &nbsp;<span class="mp-dim">·</span>&nbsp; <span class="mp-big">${formatTime(r.elapsed)}</span><br>`
        + `<span class="mp-dim">par</span> <b>${formatTime(r.par)}</b><br>`
        + `<span style="color:${col}">${sign}${formatTime(Math.abs(r.margin))} vs par</span>`
        + (paid
          ? `<br><span class="mp-pay">$${r.payout.toLocaleString('en-US')}</span>`
            + (r.points > 0
              ? ` &nbsp;<span class="mp-dim">·</span>&nbsp; <span class="mp-pay">+${r.points} good deed${r.points > 1 ? 's' : ''}</span>`
              : '')
          : (m.mission?.fromPoi ? '' : `<br><span class="mp-dim">test job &mdash; no pay</span>`))
      // The result card is exactly three actions: retry · continue · back to free roam (that is the
      // DOM order too). The calibration form above them stays — the subjective read is the ground
      // truth PAR_REF is fitted to, and it is only reliably captured here, in the same click.
      // FEAT-53: no retry on a paid job (the payout exploit) — hidden here, gated in mission.js.
      btn('mp-accept', true); btn('mp-decline', false); btn('mp-retry', !m.mission?.fromPoi)
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

/**
 * FEAT-61: the paper route's panel and HUD. Same shape as _renderMissionUI — one switch, one
 * repaint per state change (plus the 10 Hz poll while running, because the bell and the count are
 * live values).
 *
 * SM-INV-3: the running surface carries the clock, the count and the inventory, and nothing else.
 * No rank, no par, no payout until the route is over — the deadline is allowed only because the
 * Phase A amendment ratified it as a diegetic, par-derived one.
 */
function _renderPaperUI () {
  const panel = document.getElementById('paper-panel')
  const body  = document.getElementById('pp-body')
  const hud   = document.getElementById('paper-hud')
  const acts  = document.getElementById('pp-actions')
  if (!panel || !body || !hud) return
  const p = paperRouteSystem
  const show = (el, on, disp = 'block') => { if (el) el.style.display = on ? disp : 'none' }
  const km = (mm) => (mm / 1000).toFixed(2) + ' km'

  switch (p.state) {
    case 'planning':
      // NOTHING (owner, 2026-08-15). This card was cover for a pause the player never experiences:
      // on the first route Larry's dialogue sits on top of it, and on every route after that the
      // map opens straight onto the offer. It was written against an ASSUMED routing cost, and the
      // measurement came back at a few milliseconds — so all it could ever do was flash.
      show(panel, false); show(hud, false); show(acts, false, 'flex')
      break
    case 'offer': {
      show(panel, true); show(hud, false); show(acts, true, 'flex')
      const r = p.route
      const stock = stockForTier()
      // THE THREE HEADLINE NUMBERS, one line, one size (owner, 2026-08-14): who, how far, how long.
      // The deadline used to be dim text on the last line, which made the one number with a bell
      // attached to it the least legible thing on the card.
      body.innerHTML = `<span class="mp-big">${r.customers.length}</span> `
        + `<span class="mp-dim">customer${r.customers.length === 1 ? '' : 's'}</span> `
        + `&nbsp;<span class="mp-dim">·</span>&nbsp; <span class="mp-big">${km(r.distance)}</span> `
        + `&nbsp;<span class="mp-dim">·</span>&nbsp; `
        + `<span class="mp-big">${formatTime(deadlineFor(r.par))}</span><br>`
        + `${stock} papers in the truck `
        + `<span class="mp-dim">(${stock - r.customers.length} spare)</span><br>`
        + `<span class="mp-dim">i gave you a couple extra, feel free to keep what you don&rsquo;t deliver</span>`
      break
    }
    case 'staging':
      // Same words the POI job uses, because it is the same threshold and the same promise: sort
      // yourself out on the pad for as long as you like, the clock starts at the green line.
      show(panel, false); show(hud, true); show(acts, false, 'flex')
      hud.textContent = 'leave the green circle to start the route'
      break
    case 'running': {
      show(panel, false); show(hud, true)
      // Time LEFT, not elapsed: the bell is the thing that ends the route, so it is the thing worth
      // reading. Delivered/total and the inventory are the other two facts you act on.
      hud.textContent = `${formatTime(p.timeLeft())} left   `
        + `${p.delivered()} / ${p.route.customers.length} delivered   `
        + `${p.stock()} paper${p.stock() === 1 ? '' : 's'}`
      break
    }
    case 'done': {
      show(panel, true); show(hud, false); show(acts, true, 'flex')
      const r = p.result
      body.innerHTML = `<span class="mp-big" style="color:${RANK_COLOR[r.letter] || '#fff'}">${r.letter}</span>`
        + ` &nbsp;<span class="mp-dim">·</span>&nbsp; <span class="mp-big">${formatTime(r.elapsed)}</span>`
        + (r.expedite > 0 ? ` &nbsp;<span style="color:#8ce99a">+${Math.round(r.expedite * 100)}% early</span>` : '')
        + `<br><b>${r.delivered}</b> of <b>${r.customers}</b> delivered `
        + `&nbsp;<span class="mp-dim">·</span>&nbsp; `
        + `${Math.round(r.meanAccuracy * 100)}% <span class="mp-dim">accuracy</span>`
        // TWO LINES, because it is two payments: the papers were banked as they landed, and the
        // clock is what settles now. Showing only the settlement would look like a pay cut.
        + `<br><span class="mp-dim">papers (already paid)</span> <span class="mp-pay">$${formatMoney(r.spot)}</span>`
        + `<br><span class="mp-dim">time</span> <span class="mp-pay">$${formatMoney(r.payout)}</span>`
        + (r.points > 0
          ? ` &nbsp;<span class="mp-dim">·</span>&nbsp; <span class="mp-pay">+${r.points} good deed${r.points > 1 ? 's' : ''}</span>`
          : '')
        + (r.advanced
          ? `<br><span style="color:#ffdc3c">Larry&rsquo;s giving you a bigger route &mdash; ${r.nextTier} houses next time</span>`
          : '')
      break
    }
    default:
      show(panel, false); show(hud, false)
      if (p.error) console.info('[paper]', p.error)
      break
  }
  // Two buttons, two meanings: on the offer they are take/decline, on the result card the left one
  // is the only forward action and the right one has nothing to say.
  const acc = document.getElementById('pp-accept')
  const dec = document.getElementById('pp-decline')
  if (acc) acc.textContent = p.state === 'done' ? 'continue' : 'start the route'
  if (dec) dec.style.display = p.state === 'offer' ? '' : 'none'
}

document.getElementById('pp-accept')?.addEventListener('click', () => {
  if (paperRouteSystem.state === 'done') paperRouteSystem.dismiss()
  else paperRouteSystem.accept()
})
document.getElementById('pp-decline')?.addEventListener('click', () => paperRouteSystem.decline())

// ── FEAT-53: the run wallet (top-right) ────────────────────────────────────────────────────
// Painted on the ~10 Hz HUD cadence; the snapshot key skips the DOM write when nothing changed
// (the common case — money moves a few times a day, not a few times a second).
let _runHudKey = ''
function _setRunHudVisible (on) {
  const el = document.getElementById('run-hud')
  if (el) el.style.display = on ? 'block' : 'none'
  if (!on) _runHudKey = ''
}
function _renderRunHud () {
  if (!storySystem.isActive() || storySystem.isEntering()) return
  const el = document.getElementById('run-hud')
  if (!el) return
  const s = economySystem.snapshot()
  // The 24 h clock reads the one authoritative hour-of-day (day.js). Truncated to whole minutes,
  // which is also what keeps the snapshot key from re-writing the DOM on every 10 Hz poll.
  const h = daySystem.hour()
  const mins = Math.min(1439, Math.floor(h * 60))
  const clock = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
  const key = `${s.money}|${s.halfPoints}|${clock}`
  if (key === _runHudKey && el.style.display === 'block') return
  _runHudKey = key
  const deeds = formatDeeds(s.halfPoints)
  el.innerHTML = `<span class="rh-money">$${formatMoney(s.money)}</span><br>`
    + `<span class="rh-deeds">${s.halfPoints === 0 ? 'no' : deeds} good deed${s.halfPoints === 2 ? '' : 's'}</span><br>`
    + `<span class="rh-clock">${clock}</span>`
  el.style.display = 'block'
}

// ── FEAT-55: the Energy meter (RoR2 ticker, top-right under the wallet) ────────────────────
// The stage strip scrolls under a fixed centre pointer as energy drains — the strip is the
// [fullEnergyH … −sleepDebtMaxH] timeline at EM_PX_PER_H, so one in-game hour of waking is a
// constant number of pixels of scroll. Per-frame (one transform write) because the scroll is
// the point: at the 24-min day it creeps visibly, exactly the RoR2 feel. Segment widths and
// colours are derived once from DAY_PARAMS/STAGE_COLOR so the palette and thresholds have one
// owner; the 2 h sleepy/tired slivers carry no inline label — the title names the current
// stage in its colour (that's where the text goes when the band is too thin to hold it).
const EM_PX_PER_H = 25   // also baked into the .em-strip::after hour-tick gradient — keep in step
const EM_VIEW_W = 100
let _emEls = null, _emStage = '', _emOn = false
function _updateEnergyMeter () {
  if (!_emEls) {
    const root = document.getElementById('energy-meter')
    if (!root) return
    _emEls = {
      root,
      strip: document.getElementById('em-strip'),
      stage: document.getElementById('em-stage'),
      segs: {
        rested:    document.getElementById('em-seg-rested'),
        sleepy:    document.getElementById('em-seg-sleepy'),
        tired:     document.getElementById('em-seg-tired'),
        exhausted: document.getElementById('em-seg-exhausted'),
      },
    }
    const full = daySystem.fullEnergyH()
    const hours = {
      rested:    full - DAY_PARAMS.sleepyAtH,
      sleepy:    DAY_PARAMS.sleepyAtH - DAY_PARAMS.tiredAtH,
      tired:     DAY_PARAMS.tiredAtH,
      exhausted: -daySystem.debtFloorH(),
    }
    for (const [k, el] of Object.entries(_emEls.segs)) {
      el.style.width = `${hours[k] * EM_PX_PER_H}px`
      el.style.background = STAGE_COLOR[k]
    }
  }
  const on = storySystem.isActive() && !storySystem.isEntering()
  if (on !== _emOn) { _emOn = on; _emEls.root.style.display = on ? 'block' : 'none' }
  if (!on) return
  const e = daySystem.energyH()
  _emEls.strip.style.transform =
    `translateX(${EM_VIEW_W / 2 - (daySystem.fullEnergyH() - e) * EM_PX_PER_H}px)`
  const st = daySystem.stage()
  if (st !== _emStage) {
    _emStage = st
    _emEls.stage.textContent = st
    _emEls.stage.style.color = STAGE_COLOR[st]
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
roadMeshSystem.setPhysicsHook(roadPhysics)   // FEAT-48: asphalt is a collider, not just a decal

// FEAT-22/17/18: water — needs terrainSystem.rawHeightWorld, alive now. Seed-deterministic like
// props. BEFORE PropSystem: the scatter's waterAt sampler must see the current water from the very
// first chunk, and BEFORE the first roadSystem.update(): setWaterNoGo (inside) reshapes the network.
rebuildWaterSystem()
// FEAT-06: prop system — needs terrain (height/normal) + road (exclusion) + water samplers, all alive now.
propSystem = new PropSystem({ scene, worldSeed, samplers: makePropSamplers() })
propSystem.setPhysicsHook(propPhysics)   // FEAT-48: trees/rocks/boulders are rigid for the chassis

// PERF-07: baked prop-shadow atlas. Needs the WebGL renderer (absent headless — this whole block is
// browser-only). Wires the atlas texture into the terrain sampler, the bake triggers into the prop
// system, and the static sun direction into the projection shear. In realtime-cast mode the terrain
// strength is 0 (props keep casting into the sun's shadow map instead).
const shadowBake = new ShadowBakeSystem(renderer, FLORA_PARAMS.shadows?.tilePx ?? TILE_PX)
window.__shadowBake = shadowBake   // dev handle (mirrors window.sky) — inspect/force sun re-bake rolls
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
  // The terrain shader applies the baked prop shadow to the FAR cascade only (see terrain.js).
  // That light carries SHADOW_FAR_SPLIT of the key, so hand it the reciprocal as gain — the
  // open-sun look then matches what a whole-key multiply produced, while ground the cascade
  // has already shadowed gets nothing added.
  terrainSystem._terrainUniforms.uShadowLightGain.value = 1 / SHADOW_FAR_SPLIT
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
  // The impostor atlas is BAKED under the live key light, so it must see the WHOLE key light —
  // not just `sun`, which now carries only (1 - SHADOW_FAR_SPLIT) of it since the terrain cascade
  // took the rest. Passing `sun` directly baked distant trees at 40 % intensity while the 3D trees
  // beside them got 100 %, i.e. a brightness step exactly at the LOD swap. The proxy re-sums the
  // pair on every read, so it stays correct if the split is ever retuned.
  const _impostorKey = { color: sun.color, get intensity () { return sun.intensity + sunFar.intensity } }
  propSystem.setImpostors(renderer, { sun: _impostorKey, ambient, sunDir: skySystem.sunDirection })
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
    propSystem.setPhysicsHook(propPhysics)   // FEAT-48: re-attach after the GUI full rebuild
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
const _skyFolder = skySystem.addGui(_gui)
moonSystem.addGui(_skyFolder)   // moon lives under Sky / Lighting — same look, same folder
// FEAT-47: story day clock folder (self-contained, same pattern). Hidden by the debug lockout.
daySystem.addGui(_gui)
// FEAT-53: economy folder — wallet/deeds/tier read-outs + the PROVISIONAL k and cap tunables.
economySystem.addGui(_gui)
// FEAT-45: camping folder — the live grade at the truck plus the site tunables. The one action is a
// shortcut INTO the dialogue (skipping the 30-min chore and the carve), so the sleep flow can be
// exercised without hunting for a legal site first.
campSystem.addGui(_gui, {
  openCamp: () => {
    const g = campSystem.evaluate(vehicleState.position.x, vehicleState.position.z)
    _campUi = { mode: 'camp', site: g, moms: false }
    _enterCampScene(g)
    _renderCampUI()
  },
})
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

// ── Collider wireframe overlay (physics-debug.js) ─────────────────────────────
// Replaced the 14 orange probe spheres (2026-08-15): those visualised the retired
// getBodyContactPoints probes; the wireframes draw the ACTUAL engine colliders.
document.addEventListener('keydown', e => {
  // FEAT-43: collider debug is part of the debug tooling locked out in story mode.
  if (e.key === '`' && !storySystem.isActive()) {
    physicsWireframes.setEnabled(!physicsWireframes.enabled)
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

// FEAT-48: engine colliders for the lab clean-room. The world's streamed terrain colliders
// must NOT exist while the lab is active — the lab sits near the world origin where real
// terrain is ~150 m high, and the chassis would spawn deep inside those heightfields (the
// engine would eject it violently). Swap: detach the terrain hook + clear its bodies on
// enter; rebuild lab ground (flat slab; the cm-scale rumble crests only matter to wheels,
// which sample labSystem.groundHeight analytically) + the ramp prism. Reverse on exit —
// re-attaching the hook re-syncs every chunk still in the map.
let _labEngineBodies = []
function _buildLabColliders () {
  const slab = physicsEngine.createBody({ type: 'static', position: { x: 0, y: -5, z: 0 }, userData: { kind: 'lab-ground' } })
  physicsEngine.addBox(slab, { x: 2000, y: 5, z: 2000 }, { friction: 0.8 })   // top face at y = 0
  _labEngineBodies.push(slab)
  // Ramp prism — incline face, back wall, sides (matches the analytic RAMP_TRIS the wheels use).
  const ramp = physicsEngine.createBody({ type: 'static', position: { x: 0, y: 0, z: 0 }, userData: { kind: 'lab-ramp' } })
  const tanA = Math.tan(RAMP_ANGLE)
  const yToe = RAMP_MAX_H + (RAMP_END_Z - RAMP_TOE_Z) * tanA   // toe surface Y (buried below 0)
  const corners = []
  for (const x of [-_hw, _hw]) {
    corners.push(x, yToe, RAMP_TOE_Z, x, RAMP_MAX_H, RAMP_END_Z, x, -RAMP_DEPTH, RAMP_END_Z, x, -RAMP_DEPTH, RAMP_TOE_Z)
  }
  physicsEngine.addHull(ramp, corners, { friction: 0.8 })
  _labEngineBodies.push(ramp)
}
function _destroyLabColliders () {
  for (const b of _labEngineBodies) physicsEngine.destroyBody(b)
  _labEngineBodies = []
}

function enterLab () {
  _labActive = true
  _labActive = true            // reuse every flat-world physics gate
  window.__setGameMode('lab')

  terrainSystem.setPhysicsHook(null)   // FEAT-48: stop mirroring world chunks…
  terrainPhysics.clear()               // …drop their colliders (lab is a clean room)
  roadMeshSystem?.setPhysicsHook(null)
  roadPhysics.clear()
  propSystem?.setPhysicsHook(null)
  propPhysics.clear()
  _buildLabColliders()

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

  _destroyLabColliders()                          // FEAT-48: lab slab + ramp out…
  terrainSystem.setPhysicsHook(terrainPhysics)    // …world chunk colliders back (re-syncs kept chunks)
  roadMeshSystem?.setPhysicsHook(roadPhysics)     // …and the standing road tiles
  propSystem?.setPhysicsHook(propPhysics)         // …and the prop colliders

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
  // FEAT-61: a menu you cannot point at is not a menu. Drop the aim and hand the pointer back —
  // pausing mid-throw is exactly when a player is holding F, and the lock would leave them with no
  // cursor in front of a wall of buttons.
  setAimMode(false)
  if (document.pointerLockElement) document.exitPointerLock()
  const rt = document.getElementById('aim-reticle')
  if (rt) rt.style.display = 'none'
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
  // THE SEED DECIDES WHERE THE WORLD IS, AND NOTHING ELSE (owner, 2026-08-11). A free-roam teleport
  // leaves a spawn override behind, and _reseatTruckAtSpawnInner honours it ahead of resolveSpawn —
  // so without this, entering story mode seats the truck wherever you last teleported and the region
  // centre (and therefore every POI) follows the player instead of the seed. See _spawnOverride.
  clearSpawnOverride: () => { _spawnOverride = null },
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
    economySystem.start()            // FEAT-53: fresh run, empty wallet, zero deeds
    dialogueSystem.start()           // FEAT-61: a new run hears every briefing again
    resetPaperRun()                  // …and starts back on Larry's four-house route (SM-INV-12)
    paperRouteSystem.abort()
    _renderDialogue()
    _renderPaperUI()
    missionSystem.clearOffers()      // …and no offer cached from a previous run survives into this one
    poiSystem.build(center, radius)
    // FEAT-61: AFTER build() — mom is a newspaper customer, and she is a roster POI, so the roster
    // has to exist before customers() can be asked who receives a paper. Houses carve nothing and
    // touch no pads, so unlike build() this needs no re-bake behind it.
    poiSystem.buildHouses(center, radius)
    // ORDER MATTERS: the roster decides where mom lives, and camping is handed that answer.
    // Mom's house is a POI with a building on it, not a camp — you can sleep there, and sleeping
    // there reuses the camp module's sleep path, which is the whole of the relationship (FEAT-60).
    campSystem.build(center, radius, poiSystem.list().find(q => q.type === 'momsHouse') ?? null)
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
    economySystem.stop()                // FEAT-53: wallet dormant (start() re-zeroes on next run)
    missionSystem.clearOffers()         // cached offers hold live centerlines — never keep them across a region
    _setRunHudVisible(false)
    dialogueSystem.abort()              // FEAT-61: abort, not advance — leaving is not "read it"
    _renderDialogue()
    paperRouteSystem.abort()            // …and an unfinished route is dropped, never settled
    _renderPaperUI()
    _clearThrownRolls()                 // …and no papers from a story run lying about in free roam
    setAimMode(false)
    poiSystem.clear()
    campSystem.clear()   // FEAT-45: no camping zones outside a live story region
    roadSystem?.setCampPads(null)   // …and no camp benches: free roam's ground is the seed's ground
    _closeCampUi()
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
  gaugeCluster.seedOdometer()   // FEAT-49: a story entry is a fresh run — fresh jalopy, fresh mileage
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
  // marker is the trigger now — see _updateParkTriggers.
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
    // FEAT-45: the camp UI holds the truck too. You could previously drive away from the camp
    // screen (owner, 2026-07-30) — every camp face is a near-stopped surface by SM-INV-3, so any of
    // them being up means the truck stays put. Same mechanism as the countdown: the handbrake is
    // forced, revving against it is allowed, and dropping the hold on break camp is a clean release
    // — W then behaves exactly as it does when you pull away from a mission launch, because the
    // player's own parking-brake latch (the thing that opened the dialogue) is still underneath it.
    setLaunchHold(!!missionSystem?.isHeld() || !!_campUi || _campBusy)

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
    // FEAT-61: the start threshold, then the route's clock against the bell. One distance check or
    // one add — same discipline as above, and clocked off the fixed step so a frame spike can
    // neither stretch the deadline nor skip the line that starts it.
    if (paperRouteSystem.isCarrying()) paperRouteSystem.update(PHYSICS_DT)

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

    stepPhysics(vehicleState, RANGER_PARAMS, PHYSICS_DT, queryContacts, engineCtx)
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
  // FEAT-55: the Energy meter scrolls on the same per-frame cadence — the creep is the display.
  _updateEnergyMeter()

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

    // ── Terrain cascade follow (`sunFar`) ──────────────────────────────────────────────────────
    // Same texel-snapped construction as above, with two deliberate differences:
    //  1. It centres on the STREAM centre (camera in freecam, truck otherwise), not on the truck.
    //     This map exists to shade the VIEW — a mountain 200 m away casting into the valley you are
    //     looking at is the whole point — whereas the near map exists to track the one caster.
    //  2. It snaps to SHADOW_FAR_SNAP (64 m), not to one texel. At 0.25 m/texel a texel-grade snap
    //     would re-arm this pass on essentially every driving frame, which is exactly the cost the
    //     per-light autoUpdate gate is here to avoid. 64 m is an exact multiple of the texel pitch,
    //     so the sampling grid stays world-locked (no shimmer) while the pass fires a few times a
    //     minute instead of 60 times a second. The ±256 m extent absorbs the up-to-32 m slop.
    const fSnapR = Math.round(streamCenter.dot(_shadowRight) / SHADOW_FAR_SNAP) * SHADOW_FAR_SNAP
    const fSnapU = Math.round(streamCenter.dot(_shadowUp)    / SHADOW_FAR_SNAP) * SHADOW_FAR_SNAP
    const fKeepF = streamCenter.dot(_shadowFwd)
    _shadowCenter.set(0, 0, 0)
      .addScaledVector(_shadowRight, fSnapR)
      .addScaledVector(_shadowUp,    fSnapU)
      .addScaledVector(_shadowFwd,   fKeepF)
    // Standoff must clear the tallest terrain in the box or peaks fall outside the near plane.
    sunFar.position.set(
      _shadowCenter.x + sunDir.x * 1200,
      _shadowCenter.y + sunDir.y * 1200,
      _shadowCenter.z + sunDir.z * 1200
    )
    sunFar.target.position.copy(_shadowCenter)
    sunFar.target.updateMatrixWorld()
    if (fSnapR !== _lastFarSnapR || fSnapU !== _lastFarSnapU
      || sd.x !== _lastFarSunDir.x || sd.y !== _lastFarSunDir.y || sd.z !== _lastFarSunDir.z
      || geomSig !== _lastFarGeomSig) {
      perfEvent('shadow.far')
      sunFar.shadow.needsUpdate = true      // per-light gate (this light opted out of autoUpdate)
      renderer.shadowMap.needsUpdate = true // ...and the global gate, or the whole pass is skipped
      _lastFarSnapR = fSnapR
      _lastFarSnapU = fSnapU
      _lastFarSunDir.copy(sd)
      _lastFarGeomSig = geomSig
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
  // Day/night SUN GENERATION. The baked atlas is a projection along the key light, so as the cycle
  // swings the sun those projections go stale — without this, tree shadows point at dawn all day.
  // Policy lives here (the bake system deliberately does not track live chunks):
  //   · trigger on DRIFT IN METRES (shadowDriftFor), not on shear or on an angle — see there;
  //   · never start a roll while the previous one is still draining, so a fast clock self-throttles
  //     to the slicer's rate instead of queueing without bound;
  //   · plus a wall-clock floor, so a debug dayLengthSec of 5 s can't saturate the baker;
  //   · re-queue NEAREST-FIRST so tiles around the truck re-project before the ring edge.
  // The roll itself is just the existing MAX_BAKES_PER_CALL slicer draining a longer queue — the
  // atlas is never restamped in one frame.
  if (shadowBake && propSystem && !_labActive && shadowBake.enabled && !shadowBake.hasWork()) {
    const _nowSec = performance.now() / 1000
    const _fp = FLORA_PARAMS.shadows
    if (shadowBake.shadowDriftFor(skySystem.sunDirection) > (_fp?.sunRebakeM ?? 0.6)
      && _nowSec - _lastSunBakeSec > (_fp?.sunRebakeMinSec ?? 2.0)) {
      _lastSunBakeSec = _nowSec
      shadowBake.setSun(skySystem.sunDirection)        // commit the new generation
      const _cx = Math.floor(streamCenter.x / CHUNK_SIZE), _cz = Math.floor(streamCenter.z / CHUNK_SIZE)
      propSystem.remarkShadowTilesForSun(_cx, _cz)
      perfEvent('shadow.bake.sun')                     // PERF-26: distinguish a sun roll from stream-in
    }
  }
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
    // so they repaint on the HUD's ~10 Hz cadence rather than per physics step. ('staging' is a
    // static line, but it costs one string write and keeps the state→HUD mapping in one place.)
    if (missionSystem && (missionSystem.state === 'countdown' || missionSystem.state === 'staging'
                          || missionSystem.state === 'running')) _renderMissionUI()
    // FEAT-61: the route's HUD carries three live values (the bell, the count, the inventory), so
    // it repaints on the same poll for the same reason. ('staging' is a static line, but it costs
    // one string write and keeps the state→HUD mapping in one place.)
    if (paperRouteSystem.isCarrying()) _renderPaperUI()
    // FEAT-63: RECALCULATING. On the poll, not the frame — one style write at 10 Hz, and the
    // system's own minimum-display window means a job that finishes in 120 ms is still readable.
    if (_recalcEl) {
      const on = paperRouteSystem.isRerouting()
      if (on !== _recalcOn) { _recalcOn = on; _recalcEl.style.display = on ? 'block' : 'none' }
    }
    // …and which delivery targets are lit. Visibility flags only, no allocation.
    _updateCustomerRings()
    // FEAT-46: the orange interaction ring ↔ green start-zone ring swap rides the same poll.
    _updateMissionRings()

    // FEAT-53: the run wallet — money + good deeds, story mode only, always visible while the
    // region is live (owner, 2026-08-01). Run state, not mission state: it never references par
    // or the current job, so the SM-INV-3 running surface above stays clean.
    _renderRunHud()
    economySystem.syncGui()

    // FEAT-46/45: the POI + camping prompts, and the ONE parking-brake trigger behind both.
    // Still the ~10 Hz cadence: the `parked` latch is sticky, so the edge cannot fall between polls.
    _updateParkTriggers()
    // FEAT-45: the camping folder's read-outs ride the same 10 Hz poll and hit the same memoized
    // grade the prompt just computed. Gated to the SAME sub-20 kph window as the prompt on purpose:
    // grading costs a handful of terrain/water/scatter samples, and paying for it at speed to feed a
    // debug read-out is exactly the frame-loop diagnostic src/ is supposed to be free of.
    if (storySystem.isActive()
        && Math.hypot(vehicleState.velocity.x, vehicleState.velocity.z) * 3.6 <= CAMP_PROMPT_KPH) {
      campSystem.syncGui(vehicleState.position.x, vehicleState.position.z)
    }

    // FEAT-49: speed/gear/RPM moved off the text HUD onto the gauge cluster; only the wheelspin
    // diagnostic (no cluster equivalent) stays here.
    if (dtrain) {
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
  _updateThrownRolls(frameTime)   // FEAT-61: fly the airborne papers (render-rate, analytic)
  debrisSystem.update()           // FEAT-36: engine transform → debris meshes (physics steps them)

  // Restore physics position/quaternion — the interpolated copies were render-only.
  vehicleState.position  = _physPos
  vehicleState.quaternion = _physQuat

  // Collider wireframes: follow dynamic bodies, cull far statics (no-op while disabled). The
  // chassis wireframe takes the INTERPOLATED render pose, not the engine transform — the meshes
  // were drawn at subframe time above, and reading the raw body here would sit the box up to one
  // physics step (~0.5 m at 30 m/s) off the truck it is measuring.
  physicsWireframes.update(camera.position, { position: _renderPos, quaternion: _renderQuat })

  // QUAL-02: keep the (finite) sky box centred on the camera so it always surrounds the view.
  skySystem.update(camera.position)
  // Moon: billboard onto the key-light direction, faded in by nightFactor. After skySystem.update()
  // so a playing cycle's new hour is already applied, and after the camera has been posed.
  moonSystem.update(camera, skySystem.sunDirection, skySystem.nightFactor())
  // Unlit particles get the look's irradiance as a flat multiplier (see SkySystem.particleLight).
  // Pushed here, once, rather than threaded through three different update() signatures.
  skySystem.particleLight(_particleLight)
  const _particleAlpha = skySystem.particleAlpha()
  dustSystem.setLight(_particleLight, _particleAlpha)
  smokeSystem.setLight(_particleLight, _particleAlpha)
  dirtSpraySystem.setLight(_particleLight, _particleAlpha)

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

  // FEAT-49: gauge cluster — every frame (needles must be smooth, unlike the 10 Hz text HUD),
  // hidden while the map is open, live in chase/hood/freecam alike. update() early-outs when hidden.
  gaugeCluster.setVisible(!map2d.isOpen())
  gaugeCluster.update(frameTime, vehicleState.velocity.length(), vehicleState.drivetrain?.engineRPM ?? 0)

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

  // FEAT-63: THE SPARE-TIME PUMP. Dead last in the frame, on purpose — by here everything that
  // owes the player a picture has been done, so what is left before the next vsync is genuinely
  // spare and spending it cannot push anything else over.
  //
  // The re-plan is ~14 ms of work at the top rung and it must never be one frame's worth. Budget
  // is whatever this frame did not use, so a frame that already overran contributes nothing and a
  // quiet one contributes several milliseconds. Even at the FLOOR the job lands in about a second,
  // and the RECALCULATING indicator is what makes that honest to the player.
  // hasReplan(), not isRerouting(): a delivery's re-plan is quiet and shows no indicator, but it
  // still has to be computed — gating the pump on the indicator would leave those jobs suspended
  // forever, which is the bug the indicator was never meant to be able to cause.
  if (paperRouteSystem?.hasReplan()) {
    const spentMs = performance.now() - newTime * 1000
    paperRouteSystem.pumpReroute(Math.max(PUMP_FLOOR_MS, FRAME_BUDGET_MS - PUMP_MARGIN_MS - spentMs))
  }
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
