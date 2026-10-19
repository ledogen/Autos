/**
 * src/main.js — AUTOS entry point: the glue.
 *
 * Owns boot order and wiring, not behaviour — each subsystem lives in its own module:
 *  - renderer / scene / lights / shadow cascades, and the menu stage that fronts every load
 *  - constructing and cross-wiring the world systems (terrain, roads, water, props, physics engine)
 *  - world rebuilds: seed change, road/terrain parameter changes, spawn resolve and truck re-seat
 *  - queryContacts — the analytic wheel-contact query stepPhysics is given
 *  - story-mode UI: POI/camp/mission/paper-route panels, wallet, energy meter, rank timer
 *  - the fixed-timestep accumulator loop (physics at PHYSICS_DT, render interpolated)
 *
 * No gate EXECUTES this file (a few source-scan it via extraDeps) — verify behaviour in the browser.
 *
 * Conventions: see docs/GLOSSARY.md
 * Forbidden patterns: Euler angles for body rotation (quaternion only); importing the physics
 *                     engine from anywhere but src/physics-engine.js.
 */

import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { stepPhysics, createVehicleChassis, classifyImpactRegion, readRimStrikes, setBodyRestitution, syncChassisMass } from './physics.js'
import { DEFAULT_VEHICLE_MODEL } from '../data/vehicle-models.js'   // the hero truck's open-bed collider
import { createPhysicsEngine } from './physics-engine.js'
import { TerrainPhysics, RoadPhysics, PropPhysics, PoiPhysics } from './terrain-physics.js'
import { DebrisSystem, bedDropPoints, inBedWell, strapPose, cubeLayout, STACK_RADIUS, BARREL_CUBE_SIDE, BARREL_CUBE_LAYERS } from './debris.js'
import { PhysicsWireframes } from './physics-debug.js'
import { getWheelPosition, computeStaticEquilibrium } from './suspension.js'
import { makeFuelState } from './fuel.js'
import { makeVehicleState } from './vehicle-state.js'   // FEAT-41: the canonical vehicleState shape, shared with the menu stage
import { MenuStage } from './stage.js'                  // FEAT-41: the live 3D scene behind the menu AND every load
import { DamageModel, DAMAGE_PARAMS } from './damage.js'    // SM-3: component condition model
import { truckConfig, loadVerdict, tireCondCap } from './load-verdict.js'   // FEAT-112: fits / warning / overload
import { DamageHUD } from './damage-hud.js'                 // SM-3: the diagnostic condition readout (debug panel)
import { DamageScreen } from './damage-screen.js'           // FEAT-90: the player's damage pictogram (V, park-gated)
import { parkPrompt, keycap } from './park-badge.js'        // FEAT-90: the blue P "park first" badge
import { updateVehicle, setLaunchHold, setControlAttenuation } from './vehicle.js'
import { makeIgnitionState, keyPosition, OFF as IGN_OFF, RUNNING as IGN_RUNNING } from './ignition.js'
import { updateCamera, getCameraMode, getFreecamPosition, getFreecamYaw, exitFreecam, placeFreecam, setCameraFocus, setAimMode, isAiming, snapCamera } from './camera.js'
// Dev handle (mirrors window.terrain / window.sky): jump the freecam to a spot for visual troubleshooting.
// window.__view(x, y, z, yaw, pitch) — used by test/screenshot.mjs (headless CDP) and the browser console.
window.__view = placeFreecam
// PERF-07 measurement handles (lazy getters — survive seed rebuilds): the headless CDP perf
// harness toggles prop shadow casting and reads renderer.info through these.
window.__props = () => propSystem
window.__renderer = () => renderer
window.__cam = () => camera   // INFRA-07: test/cdp-smoke.mjs reads the chase heading after a freecam exit (R-11)
import { initDebug, updatePacejkaCurve, updateTravelBars, updateSlipVectors, setDebugLockout } from './debug.js'
import { captureFrame, toggleRecording, openInitialCondition, isRecording, setCaptureContext, downloadJSON } from './logger.js'
import { buildPlaceCapture } from './capture.js'
import { ensureEngineAudio, updateEngineAudio, setEngineAudioEnabled, setEngineAudioVolume, setAudioPageActive, startCrankAudio, stopCrankAudio, playCatchAudio, playShutoffAudio, playSputterPop } from './engine-audio.js'
import { ensureTireAudio, updateTireAudio, setTireAudioEnabled, setTireAudioVolumes, playTireBlowout } from './tire-audio.js'
import { ensureWindAudio, updateWindAudio, setWindAudioEnabled, setWindAudioVolume } from './wind-audio.js'
import { TerrainSystem } from './terrain.js'
import { RoadSystem, CHUNK_SIZE, ROAD_ROUTER_VERSION } from './road.js'
import { perfAdd, perfMark, perfDump, perfReset, perfSnapshot, perfEnableUserTiming, perfFrameDt,
         perfEnableHitchLog, perfFrameBegin, perfFrameEnd, perfHitchReport, perfHitchDump, perfHitchReset, perfEvent } from './perf.js'  // ?prof / ?hitch profiler (D-arc / PERF-08 / PERF-26)
let _perfFrame = 0  // frame counter for the ?hitch/?prof auto-dump at load
let _firstFrameMarked = false  // first animate frame: perf mark (init vs loop time) + one-time hand-offs
import { RoadMeshSystem } from './road-mesh.js'
import { DustSystem } from './dust.js'
import { TireSmokeSystem } from './smoke.js'
import { DirtSpraySystem } from './dirt-spray.js'
import { SkySystem, SKY_CYCLE } from './sky.js'                        // QUAL-02: atmospheric skybox + sun-driven lighting
import { MoonSystem } from './moon.js'                      // QUAL-02: night moon disc on the key-light direction
import { parseWorldSeed, seedFor } from './seed.js'
import { createVehicleModel } from './vehicle-model.js'
import { Map2D } from './map2d.js'                       // FEAT-16: 2D top-down map dev/validation overlay
import { GaugeCluster } from './cluster.js'              // FEAT-49: 1992 Ranger gauge cluster overlay
import { MissionSystem, REGION_MARGIN } from './mission.js'  // story mode (beta)
import { LabSystem } from './lab.js'                     // FEAT-31: isolated flat testing lab + timing gates
import { StorySystem } from './story.js'                 // FEAT-43: sandboxed Story Mode gamemode (seed entry + frozen region)
import { validateArea, discArea, unplayableReason } from './world-validate.js'   // BUG-56 C: is this seed playable at all?
import { PoiSystem, POI_PARAMS, dropZoneWorld, overDropZone } from './poi.js'         // FEAT-46: story-mode POIs on lay-by pads
import { HAUL_PAR_SLACK, FREIGHT_PAR_SLACK_PER_KG, FREIGHT_TIME_SLACK, FREIGHT_TIP_MULT, THINGS } from '../data/offers.js'   // FEAT-88/96: a loaded job's par is longer
import { FREIGHT } from '../data/freight.js'          // FEAT-96 scaffolding: the debug "Load Cargo" list
import { PROP_MODELS } from '../data/prop-models.js'   // …and each load's strap-free width
import { DaySystem, DAY_PARAMS, STAGE_COLOR } from './day.js'   // FEAT-47: story-mode day clock (drives the sky)
import { EconomySystem, ECONOMY_PARAMS, RANK_COLOR, formatDeeds, formatMoney, basePay } from './economy.js'  // FEAT-53: payout, wallet, good deeds
import { InventorySystem } from './inventory.js'          // FEAT-122: what the player owns this run
import { InventoryScreen } from './inventory-screen.js'   // FEAT-122: Tab screen + quick keys 1–4
import { OfferBoard, formatGameDuration, formatDue, gateText } from './offer-board.js'   // FEAT-67: the mission board
import { CampSystem, CAMP_PARAMS, VIBE_W } from './camp.js'  // FEAT-45: story-mode dispersed-camping zones
import { CampfireFx } from './campfire.js'   // FEAT-66 fire slot: ASSET-24 + flames/light
import { DialogueSystem } from './dialogue.js'           // FEAT-61: sequential character cards
import { PAPER_ROUTE_INTRO, DLG } from '../data/dialogue.js'
import { simulateThrow, launchVelocity, accuracyScore, THROW_PARAMS } from './throw.js'   // FEAT-61: the thrown roll
// FEAT-61: the paper route — Larry's route, its one par, and the flat-rate settlement.
import { PaperRouteSystem, runPaper, resetPaperRun, stockForTier,
         planTourJob, customersForTier } from './paper-route.js'
import { GpsSystem, addGpsGui } from './gps.js' // FEAT-39: GPS assist (in-world route arrows)
import { formatTime, RANK_THRESHOLDS_DEFAULT, haulGrade, fragileGrade } from './par.js'   // FEAT-29 par time formatting; FEAT-87 rank bar fallback bands; FEAT-88 haul letter; FEAT-97 fragile letter
import { SCENARIOS } from '../data/scenarios.js'   // FEAT-62: authored scenarios
import { ScenarioSystem } from './scenario.js'             // FEAT-62: countdown / gates / finish rules
import { Leaderboard } from './leaderboard.js'             // FEAT-62: best times (save-file hook in its header)
import { RANK_TIMER_PARAMS, rankTimerLayout, rankTimerFrame } from './rank-timer.js'   // FEAT-87
import { playHeartbeat, HEARTBEAT_DUB_DELAY, HEARTBEAT_DUB_LEVEL } from './heartbeat-audio.js'   // FEAT-87: the bar's lub-dub
import { FuelStop, towPrice, towHours } from './fuel-stop.js'   // FEAT-50: the pump visit + the tow
import { playNozzle, playGallonBell, playShutoff, playRegister, setPumpFlow } from './pump-audio.js'
import { playGlassBreak, playCargoHit } from './glass-audio.js'   // FEAT-87: the rank tile shattering; FEAT-97 cargo hits
import { makeFragile, feltG } from './fragile.js'   // FEAT-97: a fragile load's condition
import { snapshotRoadParams } from './road-network-worker.js'   // spawn memo key: the params the router actually reads
import { RoadNetworkClient } from './road-network-client.js'  // PERF-30: whole-network build Worker (routing + plan layer off-thread)
import { PropSystem } from './props/prop-system.js'        // FEAT-06: procedural trees/rocks/bushes
import { StreamMotion } from './stream-priority.js'         // PERF-33: travel direction + jump detection for streaming order
import { StreamBudget } from './stream-budget.js'           // PERF-33: one shared per-frame streaming budget
import { scatterTreePositions } from './props/prop-scatter.js'  // FEAT-45: read-only tree re-roll (camp shade score)
import { ShadowBakeSystem, ATLAS_N, TILE_PX, shearFromSun } from './props/prop-shadow-bake.js'  // PERF-07: baked prop-shadow atlas
import { installShadowEdgeFade, installNearShadowCoupling } from './shadow-fade.js'   // QUAL-18 edge fade · BUG-78 near/far coupling
import { addPropGui } from './props/prop-debug.js'         // FEAT-06: live tuning folder (self-contained)
import { spawnModel } from './model-service.js'            // FEAT-59: hand-modelled asset import service
import { FLORA_PARAMS } from '../data/flora.js'
import { WaterSystem } from './water.js'                   // FEAT-22/17/18: ponds + streams detection (leaf, injected heightFn)
import { WaterRenderer } from './water-render.js'          // FEAT-17/18: pond discs + stream ribbons

// World seed — parsed from URL ?seed= parameter, defaulting to '6'.
// Plan 04: changed to `let` so debug panel seed field can mutate it (SEED-04).
// Refreshing the same ?seed= URL reproduces the same terrain (SEED-01/03).
const _urlParams = new URLSearchParams(window.location.search)
const _urlSeed = _urlParams.get('seed')
// PERF-08 harness flags: ?prof=1 exposes the window.__q/__ri/__perfData/__lever dev handles +
// mirrors perf buckets into performance.measure (trace user_timing). ?noaa=1 disables MSAA at
// renderer construction (AA can't toggle live — context creation flag). Zero cost when absent.
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
// Pond exclusion discs [x, z, r, …] for the road router — the play/map RoadSystems and the network
// Worker client all read this one builder. Reads module-scope waterSystem at CALL time.
function _pondDiscs (minX, minZ, maxX, maxZ) {
  if (!waterSystem) return []
  const discs = []
  for (const p of waterSystem.pondsNear(minX, minZ, maxX, maxZ)) discs.push(p.floorX, p.floorZ, p.radius + p.skirt)
  return discs
}
function rebuildWaterSystem () {
  if (waterRenderer) { scene.remove(waterRenderer.group); waterRenderer.dispose() }
  // rawHeightWorld (carve-free), NOT analyticHeight — detection was gated against raw height;
  // carve-baked height would drift pond levels off the rendered terrain surface.
  waterSystem   = new WaterSystem(worldSeed, RANGER_PARAMS, (x, z) => terrainSystem.rawHeightWorld(x, z))
  // BUG-33: the renderer suppresses ribbon spans whose water level would stand above the
  // COMPOSED driving surface (road decks/pads pulled through the channel) — inject the same
  // physics surface the wheels ride. A network can land AFTER a ribbon was built (PERF-30 adopts
  // are asynchronous), so the frame loop hands sync() the road revision and a change rebuilds them.
  // { h, blendW }: the composed surface and its road-carve blend, from ONE road resolve (S-36).
  waterRenderer = new WaterRenderer(waterSystem, {
    surfaceAt: (x, z) => { const s = { h: 0, blendW: 0 }; s.h = terrainSystem.analyticHeight(x, z, undefined, undefined, s); return s },
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
  if (roadSystem) roadSystem.setWaterNoGo(waterNoGoFn, _pondDiscs)
  // The map's own read-only RoadSystem must route with the identical exclusion (it validates the
  // network the player drives).
  map2d.setWaterNoGo(waterNoGoFn, _pondDiscs)
  // The mission planner needs no injection of its own: it plans on the play instance, which was
  // handed the same exclusion two lines up. The board's memoised offer routes still hold
  // centerlines from the pre-change network, so they must go (FEAT-67).
  offerBoard?.clearRoutes()
  _dropLarryTour()
  // FEAT-18: stream channels carve the terrain (bed + banks) — inject the pure sampler into the
  // terrain height paths (see terrain.setWaterCarve for the composition + causeway rule).
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
// PERF-34: under ?hitch / ?prof every sampler is timed into a perf bucket (sampler.<name>) so the
// hitch report can say WHICH ground query a scatter spends its frame in (~2k calls per chunk). With
// profiling off the samplers are passed through bare — no clock reads, no bucket writes.
// FOUR arguments, not three: waterNear takes a bbox (x0, z0, x1, z1). The three-argument form of
// this wrapper (2026-09-29) dropped z1, so the live game told every chunk "no water here" and the
// scatter stopped keeping trees and rocks out of ponds and channels — invisible to the gates,
// which build their own samplers.
const _timed = !_HITCH ? (name, fn) => fn : (name, fn) => {
  const label = 'sampler.' + name
  return (a, b, c, d) => { const t = performance.now(); const r = fn(a, b, c, d); perfAdd(label, performance.now() - t); return r }
}
const makePropSamplers = () => Object.fromEntries(Object.entries({
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
  // PERF-34: per-chunk early-out for both water samplers (see WaterSystem.waterNearBBox).
  waterNear:   (x0, z0, x1, z1) => waterSystem ? waterSystem.waterNearBBox(x0, z0, x1, z1) : { ponds: false, streams: false },
  // PERF-07: sun shear for the per-instance shadow ground-fit (shadowShearScale at prop commit).
  // Reads the live key-light direction at call time (same convention); absent headless (gates build
  // PropSystem without this key → the bake attribute stays at its flat-ground default).
  sunShear:    () => shearFromSun(skySystem.sunDirection, _sunShearScratch),
  // FEAT-85: roadside cover. roadWalk hands the scatter the road slices around a chunk (sampled
  // along the arc) so the wall stands beside the road without a nearest-road query per clump;
  // groundAt is the terrain's own green/rock/dirt reading; padBlocked keeps the cover off
  // junction aprons and lay-by pads (graded ground, not verge).
  roadWalk:    (cx, cz, stepM) => roadSystem.walkTileRoads(cx, cz, stepM),
  groundAt:    (x, z) => terrainSystem.groundAt(x, z),
  groundClassify: (slope, h) => terrainSystem.groundClassify(slope, h),   // PERF-34: the litter grid's own slope
  padBlocked:  (x, z, keepOut) => roadSystem.poiPadBlocked(x, z, keepOut) || roadSystem.junctionPadBlocked(x, z, keepOut),
}).map(([k, fn]) => [k, k === 'sunShear' ? fn : _timed(k, fn)]))
const _sunShearScratch = new THREE.Vector2()

// ── BUG-71: prop road-intrusion sweeps — trigger and budget are two different problems ──────────
// PropSystem.invalidateRoadIntrusions() re-tests live placements whenever the ROADS change, because
// a scatter can only ask about runs registered in the window it ran against (see the method's
// header for why no "regenerate at time T" fix exists). It was wired to the network adopt with a
// 10-chunk round-robin budget, which is right for the driving frontier and wrong everywhere a
// WORLD arrives at once. Two measured failures (2026-09-21, seeds 11/14 at Normal→49 live chunks):
//   • Reseed, then stand still: 79–118 props inside the 9 m exclusion, worst 0.01 m off the
//     centreline. Four adopts fire while the network settles, then stop — a parked truck moves no
//     band — so the cursor covers 40 of 49 chunks and the last 9 keep their props FOREVER.
//   • Story mode: the region freeze means the frame loop makes no roadSystem.update() call at all,
//     so there is no adopt, so the sweep never runs once in a whole run. Measured 26 props in the
//     road, unchanged over 55 s of idling AND driving.
// PERF-33: so an adopt no longer SWEEPS, it OWES — every adopt (and every seat) owes one whole-ring
// pass, and the frame loop pays it off PROP_SWEEP_PER_FRAME chunks at a time. That closes both
// failures above without an unbounded pass on an adopt: the debt is paid whether or not another
// adopt ever comes (parked truck), and each settle adopt simply re-arms a full pass. The previous
// "whole ring on the next 6 adopts" arming ran a 25–46 ms (cpu×4) sweep inside the adopt message
// handler — and once duplicate adopts stopped burning the 6 during load, those landed while driving.
const PROP_SWEEP_PER_FRAME = 2   // ≈0.3 ms/chunk (measured, see invalidateRoadIntrusions) → 49-chunk ring in ~25 frames
let _propSweepOwed = 0           // chunks still to examine in the current owed pass
/** Owe one whole-ring intrusion pass — at least the full streamed ring, since a seat can arrive
 *  before the props have scattered (live count 0) and the pass must still cover them once they do. */
const owePropSweep = () => {
  const ring = (2 * Math.max(_propRing, _bbRing) + 1) ** 2
  _propSweepOwed = Math.max(_propSweepOwed, ring, propSystem ? propSystem.liveChunkCount() : 0)
}
// ── PERF-33: streaming motion ─────────────────────────────────────────────────────────────────
// _streamMotion is the stream centre's smoothed velocity (truck, or camera in free-cam). Every
// streaming queue orders itself near-then-ahead by it (stream-priority.js), and a JUMP — a move no
// vehicle makes in a frame (teleport, spawn, free-cam placement) — re-arms the fill budgets.
// (A road window shifted AHEAD of travel was built and measured, 2026-09-25: it moved the network's
// coverage circle forward, so chunks behind the truck re-carved flat and road queries behind it
// forced 50 ms synchronous builds — and bought nothing, the network already leads the visible
// terrain by ~64 m+. Deleted; see PERF-33.)
const _streamMotion = new StreamMotion()
const STREAM_JUMP_M = 128          // m in one frame = a jump (two chunks; 60 mph is ~0.45 m/frame)
/** The centre play streams the road network around — the one the frame loop uses, so the param and
 *  adopt re-slice paths can never compute a different band and re-dispatch. */
function roadStreamCenter () {
  return getCameraMode() === 'freecam' ? getFreecamPosition() : vehicleState.position
}

// ── PERF-33: shared streaming budget + the freeze guard ─────────────────────────────────────────
// Owner ruling 2026-09-24: smooth driving beats everything EXCEPT at the edge of generation — if the
// truck would reach ground that is not built (terrain chunk, ribbon tile, road network
// covering it) within HOLD_ENTER_S at its current speed, it is OK to freeze until drivable road exists.
// Built, not current: a chunk or tile queued for an in-place rebuild is still drivable and never holds.
// The hold is a silent sim pause (last frame stays up, streaming gets the FILL budget) plus a small
// yellow warning triangle — the FPS-game "network issue" idiom — telling a slow machine to drop a
// graphics preset. Driving only: free-cam never holds (nothing to protect, and it outruns everything).
const _streamBudget = new StreamBudget()
let _streamSpentMs = 0
const HOLD_ENTER_S = 2.0       // hold when ready ground ahead < this many seconds of travel
const HOLD_EXIT_S = 3.0        // release once this much is ready (hysteresis — no hold/release flapping)
const HOLD_MAX_S = 8           // a hold that has not cleared by now gives up (never soft-lock the game)…
const HOLD_COOLDOWN_S = 5      // …and the guard stands down this long before it may hold again
const HOLD_MIN_SPEED = 1.0     // m/s — below this there is no "ahead"
const HOLD_STEP_M = 16         // lookahead sample spacing (quarter chunk)
const HOLD_WARN_LINGER_S = 3   // the triangle outlives the hold so a sub-second one is still seen
let _genHold = false
let _genHoldSince = 0
let _genHoldCooldownUntil = 0
let _genWarnUntil = 0
let _genWarnEl = null
/** Is the ground at world (x, z) ready to drive on? */
function _groundReadyAt (x, z) {
  const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE)
  if (!terrainSystem.isChunkDrivable(cx, cz)) return false   // built, not necessarily current — see there
  if (roadMeshSystem && !roadMeshSystem.isTileBuilt(cx, cz)) return false
  // Story mode freezes the road stream on a pre-built region — coverage there is the region, not a window.
  if (roadSystem && !storySystem.isRoadStreamSuspended() && !roadSystem.networkCoversXZ(x, z)) return false
  return true
}
/** Seconds of travel before the truck reaches ground that is not ready, looking `lookS` ahead
 *  (Infinity when everything in that window is ready, or the truck is ~stopped). */
function _readyAheadS (lookS) {
  const v = vehicleState.velocity, p = vehicleState.position
  const sp = Math.hypot(v.x, v.z)
  if (sp < HOLD_MIN_SPEED) return Infinity
  const ux = v.x / sp, uz = v.z / sp, L = sp * lookS
  for (let d = 0; d <= L; d += HOLD_STEP_M) {
    if (!_groundReadyAt(p.x + ux * d, p.z + uz * d)) return d / sp
  }
  return Infinity
}
function _updateGenHold (nowS) {
  const guardOn = terrainSystem && !_labActive && !_simHeld && !_spawnWarmActive && getCameraMode() !== 'freecam'
  if (!guardOn) {
    _genHold = false
  } else if (_genHold) {
    const timedOut = nowS - _genHoldSince > HOLD_MAX_S
    if (timedOut || _readyAheadS(HOLD_EXIT_S) >= HOLD_EXIT_S) {
      _genHold = false
      if (timedOut) _genHoldCooldownUntil = nowS + HOLD_COOLDOWN_S
    }
  } else if (nowS >= _genHoldCooldownUntil && _readyAheadS(HOLD_ENTER_S) < HOLD_ENTER_S) {
    _genHold = true
    _genHoldSince = nowS
    perfEvent('stream.hold')
  }
  if (_genHold) _genWarnUntil = nowS + HOLD_WARN_LINGER_S
  _setGenWarning(nowS < _genWarnUntil)
}
function _setGenWarning (on) {
  if (!on && !_genWarnEl) return
  if (!_genWarnEl) {
    const el = document.createElement('div')
    el.id = 'gen-warning'
    el.title = 'World generation is falling behind — try a lower graphics preset'
    el.innerHTML = '<svg viewBox="0 0 24 22" width="28" height="26" aria-hidden="true">'
      + '<path d="M12 1.5 L22.5 20.5 H1.5 Z" fill="#f5c518" stroke="#1a1a1a" stroke-width="1.5" stroke-linejoin="round"/>'
      + '<rect x="11" y="7.5" width="2" height="7" rx="1" fill="#1a1a1a"/><circle cx="12" cy="17.2" r="1.2" fill="#1a1a1a"/></svg>'
    Object.assign(el.style, {
      position: 'fixed', right: '14px', top: '14px', zIndex: '90', display: 'none',
      pointerEvents: 'none', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
    })
    document.body.appendChild(el)
    _genWarnEl = el
  }
  const want = on ? 'block' : 'none'
  if (_genWarnEl.style.display === want) return
  if (on) {
    // Top-right corner, below the story run HUD when that is up (it owns the corner in a run).
    const run = document.getElementById('run-hud')
    const r = run && run.offsetParent !== null ? run.getBoundingClientRect() : null
    _genWarnEl.style.top = r ? `${Math.round(r.bottom + 8)}px` : '14px'
  }
  _genWarnEl.style.display = want
}

/**
 * Re-test live placements against the roads that exist NOW. `budget` is chunks to examine;
 * Infinity means the whole ring in one pass (~2–25 ms — only ever behind a loading screen; play
 * pays the owed pass per frame instead, see owePropSweep).
 * The predicate is makePropSamplers()' own roadClear, so it can never drift from the scatter's.
 */
const _sweepRoadClear = makePropSamplers().roadClear   // reads the live systems at call time
function sweepPropIntrusions (budget) {
  if (!propSystem) return 0
  const dropped = propSystem.invalidateRoadIntrusions(
    _sweepRoadClear, FLORA_PARAMS.scatter.roadExclusion, budget)
  if (dropped) perfEvent('props.roadIntrusion')   // re-scatter lands via the normal ensure path
  return dropped
}

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
 * Shared by the dust system (dust is reduced on asphalt), dirt spray (off below LOOSE_FLOOR), tire
 * audio (screech ↔ dirt blend), and — read inverted — tire smoke (BUG-38: full on the ribbon,
 * SMOKE_OFFROAD_FLOOR off it). This is the ONE place the surface class is decided; every FX
 * consumer reads it, so they can never disagree about what the tyre is standing on.
 *
 * THREE SURFACES, and the lab is one of them (owner, 2026-09-21). The FEAT-31 testing lab is a
 * bare instrumented plate — not road, not terrain — so it gets its own branch and **shares the
 * pavement effect class for now**: a lab burnout should smoke and screech like tarmac, not throw
 * clods off a test plate. It used to fall through to 1 ("all dirt") purely because there is no
 * roadSystem to query there, which is an accident of plumbing rather than a decision, and it made
 * the lab the one place where dust, spray, audio and smoke all read the surface wrong at once.
 * The `!roadSystem` fallthrough below stays 1 on purpose — that is genuinely raw terrain with no
 * network streamed yet, not a third class.
 */
function _looseSurfaceFactorAt (x, z) {
  if (_labActive) return RANGER_PARAMS.dustPavedFactor ?? 0.1   // lab: own surface, paved FX for now
  if (!roadSystem) return 1
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

// Ground height under an effect emitter (dust / smoke / dirt spray): the lab's own surface in the
// lab, analytic terrain otherwise — the same split queryContacts makes. The truck's own Y is the
// FEAT-40 queryY, exactly as queryContacts passes the wheel's: without it a bore span answers with
// the hill OVERHEAD, so every wheel read as "in contact" and emitted dust/smoke/spray up on the
// hilltop — none of it ever showed inside a tunnel.
const _fxGroundYAt = (x, z) => _labActive ? (labSystem ? labSystem.groundHeight(x, z) : 0)
                                          : (terrainSystem ? terrainSystem.analyticHeight(x, z, undefined, vehicleState.position.y) : 0)

// S-64: dust, smoke and dirt spray each sample the SAME 4 wheel points every frame (and tire audio
// asks looseSurfaceFactor too) — 12 carve-aware height queries where 4 do. A 4-slot cache keyed on
// the exact (x, z), reset once per frame before the FX run: a hit returns the identical value, a
// differing point simply misses, so the output cannot change.
function _frameCache4 (fn) {
  const kx = [0, 0, 0, 0], kz = [0, 0, 0, 0], kv = [0, 0, 0, 0]
  let n = 0
  const cached = (x, z) => {
    for (let i = 0; i < n; i++) if (kx[i] === x && kz[i] === z) return kv[i]
    const v = fn(x, z)
    if (n < 4) { kx[n] = x; kz[n] = z; kv[n++] = v }
    return v
  }
  cached.reset = () => { n = 0 }
  return cached
}
const looseSurfaceFactor = _frameCache4(_looseSurfaceFactorAt)
const _fxGroundY = _frameCache4(_fxGroundYAt)


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

// PERF-30: the network Worker builds the ENTIRE network (routing + BUG-56 plan layer + assembly)
// off-thread; play adopts finished networks atomically between frames (stale-until-replaced). It runs
// its OWN nested route-worker pool (PERF-31 W2.2), which is the QUAL-08 pool that used to live here —
// QUAL-27 deleted the main-thread copy, whose dispatcher had not been handed a job since PERF-30
// (every warm call site was already netClient-guarded). Flip false to fall back to fully-synchronous
// main-thread routing, which is exactly what the headless gates run.
const USE_NETWORK_WORKER = true

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
//   3. queryNearest(baseX, baseZ, R) in two tiers — a tight R first, widening to ~1.5× the site
//      spacing only when the tight probe misses (see _spawnTiers below).
//   4. On road hit: position.y = terrainSystem.analyticHeight(...) for visual surface match
//      (router uses raw coarseHeight for grade math; spawn PLACEMENT uses analyticHeight so
//      the truck rests on the rendered surface). heading = atan2(tangent.x, tangent.z) faces
//      down the road (D-07).
//   5. Null result or absent roadSystem → console.warn + Phase 7 terrain-only fallback
//      (bounded ≤50 tries, deterministic — T-07-04-SPAWN guarantee preserved).
// Spawn probe geometry for resolveSpawn (kept separate so test/lib/spawn-decision.mjs can mirror it).
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

// ── QUAL-14 perf: in-session route cache ─────────────────────────────────────────────────
// Nothing persists on the player's machine (user decision 2026-07-06). A regen stashes the
// outgoing RoadSystem's routes in this Map, so toggling back to a seed already visited this
// session is instant. (FEAT-68 deleted the BUNDLED half — the baked static assets, their bake
// script, sig discipline and parity gate. v2 routes a whole region in ~2.8 s at 4x throttle and
// the bundle had shrunk to 130 KB, so it was buying a second on the one seed it covered while
// costing a subsystem; owner call 2026-08-19.)
const _sessionRouteCache = new Map()   // String(seed) → exportRouteCache() payload
function _importSessionRoutes () {
  if (!roadSystem) return
  const mem = _sessionRouteCache.get(String(worldSeed))
  if (mem) roadSystem.importRouteCache(mem)
}


let _spawnWarmActive = false   // frame loop skips the road stream while a spawn-band warm is pumping
// The seed spawn is a pure function of (seed, params) — test/world-determinism.mjs proves it is
// identical under every streaming history — so R does not need to re-run the search. It did: every
// press awaited two network-worker builds (the tight tier + the re-centre), queued behind whatever
// build the worker already had in flight — ~1.3 s per press measured on 2026-09-22, and much longer
// before the worker kept its warm instance. Keyed on the router's own param snapshot, so a slider
// change misses and re-resolves. In-session memory only; nothing is saved.
let _spawnMemo = null   // { key, point, tangent }
async function resolveSpawn (wseed, params) {
  const memoKey = wseed + '|' + JSON.stringify(snapshotRoadParams(params))
  // Use the memo only while the STREAMED network still holds the road there. Far away, the full
  // path below re-streams around the spawn first, so the truck is never seated beside a road that
  // has not arrived yet (BUG-11).
  if (_spawnMemo && _spawnMemo.key === memoKey && roadSystem?.networkCoversXZ(_spawnMemo.point.x, _spawnMemo.point.z)
      && roadSystem.queryNearest(_spawnMemo.point.x, _spawnMemo.point.z, 5)) {
    const { point, tangent } = _spawnMemo
    const surfaceY = terrainSystem ? terrainSystem.analyticHeight(point.x, point.z) : 0
    return { position: new THREE.Vector3(point.x, surfaceY, point.z), heading: Math.atan2(tangent.x, tangent.z) }
  }
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
    perfMark('resolveSpawn: before ensureTile (cold network stream)')  // D-arc
    for (const [_qR, _streamR] of _spawnTiers) {
      const _tierR = Math.max(_savedRadius, _streamR)
      roadSystem.setRadius(_tierR)
      // PERF-30: build the tier window on the network Worker — the whole plan layer runs
      // off-thread while the loading screen animates. buildNow's center matches ensureTile's
      // stream center exactly, so the ensureTile below finds the adopted band sig and never
      // rebuilds synchronously. A stale reply (seed/params changed mid-load) falls through to
      // ensureTile's synchronous build — correctness never depends on the worker.
      if (netClient) {
        // _spawnWarmActive parks the frame loop's update() for the await — otherwise a mid-session
        // reseat races a synchronous cold build.
        _spawnWarmActive = true
        try { await netClient.buildNow('play', (baseTX + 0.5) * CHUNK_SIZE, (baseTZ + 0.5) * CHUNK_SIZE, _tierR) }
        finally { _spawnWarmActive = false }
      }   // no client (USE_NETWORK_WORKER off / no Worker): ensureTile below builds synchronously
      roadSystem.ensureTile(baseTX, baseTZ)
      nearest = roadSystem.queryNearest(baseX, baseZ, _qR)
      if (nearest) break   // tight tier hit → skip the wide stream entirely (the common, fast path)
    }
    perfMark('resolveSpawn: cold network stream done')  // D-arc
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
      // AT THE FULL PLAY RADIUS — the network the first frame streams. PERF-19.3 trimmed this to a
      // 228 m window: the chosen spawn POINT is byte-identical either way (test/spawn-identity.mjs),
      // but the road's vertical profile is a function of the build window, and the truck is seated on
      // this network's road top. Seed 1536014377: road top 61.32 m in the 228 m window, 58.15 m in the
      // 320 m play band that adopted ~0.6 s after ready — a 3.2 m drop on that seed's cold load. Restoring
      // the full band measured +0.08 s to ready (10 seeds, within noise) and 0 drops.
      // PERF-30: same off-thread treatment (and the same frame-loop park) as the tier loop above.
      if (netClient) {
        _spawnWarmActive = true
        try { await netClient.buildNow('play', (spawnTX + 0.5) * CHUNK_SIZE, (spawnTZ + 0.5) * CHUNK_SIZE, _savedRadius) }
        finally { _spawnWarmActive = false }
      }
      roadSystem.ensureTile(spawnTX, spawnTZ)
      nearest = roadSystem.queryNearest(nearest.point.x, nearest.point.z, 100) || nearest
      // analyticHeight for placement so the truck rests on the rendered terrain surface.
      // (router used raw coarseHeight for grade; spawn PLACEMENT uses analyticHeight — visual match)
      const surfaceY = terrainSystem ? terrainSystem.analyticHeight(nearest.point.x, nearest.point.z) : 0
      _spawnMemo = { key: memoKey, point: { x: nearest.point.x, z: nearest.point.z },
                     tangent: { x: nearest.tangent.x, z: nearest.tangent.z } }
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
// Every terrain-shape slider (amplitude included, since BUG-31 → rebuildTerrainFull) lands here;
// Path A (rebuildAllChunks) is now only the palette recolour.
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
    // A new world: nothing measured against the old one may outlive it. (_spawnOverride is dropped
    // by applyWorldSeed for a seed change; a terrain-shape slider reaches here directly, and an
    // absolute-Y spawn point under regenerated ground is exactly the stale point its comment forbids.)
    _spawnOverride = null
    _treeChunkCache.clear()
    _streamCenterRing.length = 0
    // (rebuildAllChunksFromWorker moved BELOW the reseat — see the ORDER MATTERS note there.)
    // Phase 8: re-init RoadSystem with new seed — roads are pure fns of (worldSeed, coords, params)
    // so a new seed produces a different deterministic road network. Preserve viz state.
    if (roadSystem && scene) {
      const wasVisible = roadSystem._debugVisible
      // QUAL-14 perf: stash the outgoing instance's routes so toggling back to this seed later
      // in the session is instant (in-session only — nothing persists to disk).
      if (roadSystem._proto?.cls?.size) {
        _sessionRouteCache.set(String(roadSystem._worldSeed), roadSystem.exportRouteCache())
      }
      roadSystem.disposeDebugLines()   // the old seed's centreline viz must not outlive its network
      roadSystem = new RoadSystem(worldSeed, RANGER_PARAMS)
      roadSystem.init(scene)
      roadSystem.setRadius(320)   // PERF (Tier 1): match the terrain ring, not 640 m — see initial setup
      // PERF-30: re-register the new instance with the network-Worker client (opts persist from
      // the boot register). The worker notices the seed change on the next build request and
      // rebuilds its own RoadSystem from scratch; any in-flight reply is dropped by the seed guard.
      if (netClient) netClient.register('play', roadSystem)
      // Restore viz state — the next roadSystem.update(streamCenter) re-streams the new seed's
      // network and (because _debugVisible is set) rebuilds the centerline lines.
      roadSystem.setDebugVisible(wasVisible)
      // Phase 9 (SURF-01): clear + re-create RoadMeshSystem with the new road system so
      // ribbon tiles rebuild from the new network. Road is a pure fn of (seed, coords, params).
      if (roadMeshSystem) roadMeshSystem.dispose()   // tiles AND the per-instance materials/textures
      roadMeshSystem = new RoadMeshSystem(
        scene, roadSystem,
        (x, z) => terrainSystem.rawHeightWorld(x, z),  // CR-04 / BUG-74: raw, like the boot-time construction below
        RANGER_PARAMS,
        worldSeed  // D-03: roadQuality determinism
      )
      if (!_labActive) roadMeshSystem.setPhysicsHook(roadPhysics)   // FEAT-48: re-attach after the seed-rebuild swap (exitLab does it in the lab, S-65)
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
      if (!_labActive) propSystem.setPhysicsHook(propPhysics)   // FEAT-48: re-attach after the seed-rebuild swap (exitLab does it in the lab, S-65)
      // PERF-07: wipe the old seed's baked shadow tiles and re-arm baking for the fresh props.
      if (shadowBake) { shadowBake.clear(); propSystem.setShadowBake(shadowBake) }
      if (_syncImpostors) _syncImpostors()   // PERF-21: re-activate billboards on the fresh instance
    }
    _step('props')
    // S-65: the fresh instances above are built visible — in the lab's clean room they stay hidden.
    if (_labActive) _setWorldgenVisible(false)
    // QUAL-14 perf: same session-cache import + async reseat as the initial load — the new seed's spawn
    // bands route on the worker pool inside resolveSpawn (frames keep rendering) before each
    // synchronous stream. AFTER rebuildWaterSystem above: the warm must carry the new seed's
    // pond no-go discs.
    _importSessionRoutes()
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
// and any cached mission offers, and fire the debounced Path-B rebuild. Shared by the
// debug seed field (changeSeed) and Story Mode's seed prompt (StorySystem) so both reseed identically.
// Returns the rebuild promise (FEAT-43: story-mode entry awaits it before centering its region).
function applyWorldSeed (v) {
  _reseedRequestedAt = performance.now()   // PERF-27: start of the debounce+scheduling gap
  worldSeed = parseWorldSeed(v)
  _seedString = String(v)
  _spawnOverride = null
  offerBoard?.clearRoutes()   // FEAT-67: memoised offer routes pin centerlines from the outgoing network
  _dropLarryTour()
  map2d.reset()   // a new seed is a new world — the map closes and rebuilds from nothing on next open
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
    if (roadSystem) {
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
    // PERF-30: with the network Worker wired and a warm network up, invalidateCache DEFERRED the
    // whole rebuild — the old world keeps serving until the swap. The ribbon clear + carve
    // re-bake below fire in the client's onAdopted('params') instead; running them now would
    // rebuild everything against the stale geometry and then again at adoption.
    if (netClient && roadSystem._networkDispatch && roadSystem._network.size > 0) return
    // Phase 9 (SURF-01): clear road ribbon tiles — they rebuild from the new network.
    if (roadMeshSystem) roadMeshSystem.clearAll()
    // ORDER MATTERS (in-sim fix): re-stream the NEW road BEFORE rebuilding the ribbon/carve so
    // both build against the new geometry. Previously the carve rebuilt here while _network was
    // still empty/dirty (invalidateCache cleared it but had not re-streamed), so _buildCarveTable
    // read a stale/empty road → the cuts + foundations lagged the new road position. The re-stream
    // was also gated on _debugVisible, so with the centerline viz OFF the road never re-streamed on
    // a slider change at all. Re-stream first, unconditionally; update() rebuilds viz lines only if
    // visible (internal _debugVisible check), so this is safe regardless of viz state.
    roadSystem.update(roadStreamCenter())   // re-streams (dirty) + re-slices; rebuilds viz lines only if visible
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
  // BUG-71: a seat is ALWAYS a world arriving at once — cold load, R-reset, or a Path-B reseed —
  // and the band the props scattered against is still filling in behind it. Owe a whole-ring pass
  // here rather than at each of those three call sites, so no future spawn path can forget.
  owePropSweep()
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
  // A teleport (any _spawnOverride) lands somewhere the streamed network may not reach yet. The
  // cold spawn builds its roads BEFORE seating (resolveSpawn); the teleport used to seat at once and
  // let the per-frame dispatcher fetch the network a second or two later — so the truck fell onto
  // raw terrain and the road popped in under it, while the PERF-33 freeze guard saw chunks carved
  // "correctly" against the old window and let go. Build the play band at the destination first;
  // the chunks then stream against the right roads and the guard holds until they are carved
  // (owner, 2026-10-03). Same frame-loop park as the spawn path.
  // NOT in story mode: the play network there is the frozen whole-region build, already covering
  // any teleport destination. Building "the band at the destination" meant re-routing a ~2.6 km
  // radius network around the drop point — story entry's multi-second warm, on every map
  // teleport, with no feedback (owner, 2026-10-05) — and re-centring the frozen region on it.
  // storySystem is tested LAST: it is declared further down, and the boot seat has no override.
  // NOT in the lab either (S-62): the lab never streams roads, so the build is pure waste — and the
  // truck free-falls over the lab slab while it runs.
  if (_spawnOverride && !_labActive && netClient && roadSystem && !storySystem.isRoadStreamSuspended()) {
    _spawnWarmActive = true
    try { await netClient.buildNow('play', _spawnOverride.x, _spawnOverride.z, roadSystem._proto.radius) }
    finally { _spawnWarmActive = false }
  }
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
  // Every other field back to a fresh truck, from the one canonical shape (vehicle-state.js) — parked,
  // strutComp at static equilibrium. The pose objects keep their identity (other modules hold
  // them), and engineHealth stays the damage model's to write.
  // FEAT-33 (owner, 2026-08-22): story mode re-seats you with a DEAD truck — starting the day by
  // starting the truck is the ritual SM-INV-6 wants. Free roam / lab / scenario hand you a running
  // one so a debug reset is never gated behind a keypress.
  const { position, quaternion, velocity, angularVelocity, engineHealth, fuel, ...fresh } =
    makeVehicleState(RANGER_PARAMS, _gameMode === 'story' ? IGN_OFF : IGN_RUNNING)
  Object.assign(vehicleState, fresh)
  // FEAT-50: a story tank survives every seat — a teleport, a tow — the way damage does; anywhere
  // else a seat is a fresh truck with a full tank.
  if (_gameMode !== 'story') vehicleState.fuel = fuel
  vehicleState.velocity.set(0, 0, 0)
  vehicleState.angularVelocity.set(0, 0, 0)
  // Every seat (R, teleport, reseed) lands the camera on the new pose outright — the chase spring
  // would otherwise sweep across the jump and smear the frame on the way.
  snapCamera()
  _restrapFreight()
  damageModel.resetTransients()   // S-30: no burst or held peak survives the jump, story or not
  // Damage persists only across a STORY run (owner, 2026-10-02). Every free-roam seat — cold load,
  // R, a teleport, a reseed — hands you a fresh truck; the condition the last drive left behind is
  // part of that drive, not of the world. publish() so the very next physics step reads stock
  // multipliers rather than last step's.
  // The alert goes too: it holds until the damage screen is opened, so a repaired truck kept the lit
  // icon and read as still broken (owner, 2026-10-14).
  if (_gameMode !== 'story') { damageModel.setAll(1); damageModel.publish(RANGER_PARAMS); damageScreen.clearAlert() }
}

// Story entry seats the truck on the spawn-band network (resolveSpawn), then routes the whole region
// behind the loading screen. The road stays where it was in plan, but its vertical profile is a
// function of the build window, so the region build can move the surface under the truck by metres
// (seed 1536014377 dropped 3.2 m here while resolveSpawn still seated on a 228 m window; the
// 2.6 km region can still disagree with the 320 m band it seats on now).
// Re-fit the truck to the region's ground in place — same XZ and heading, so the region centre and
// the seed's determinism are untouched. Every other seat state from the spawn seat still stands.
function _reseatOnRegionGround () {
  const p = vehicleState.position
  const seat = _seatOnGroundPlane(p.x, p.z, _currentHeading(), computeStaticEquilibrium(RANGER_PARAMS), 0)
  vehicleState.position.set(seat.x, seat.y, seat.z)
  vehicleState.quaternion.copy(seat.quat)
  vehicleState.velocity.set(0, 0, 0)
  vehicleState.angularVelocity.set(0, 0, 0)
  snapCamera()
  _restrapFreight()
  damageModel.resetTransients()
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
// FEAT-62: the pause menu is up. Up here, not with the scenario block, because _hidePauseMenu writes
// it and is reachable long before the module body gets that far.
let _pauseOpen = false
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

// ── FEAT-33 "hold I to start the truck" hint ──────────────────────────────────────────────
// Raised by vehicle.js whenever the driver asks for throttle with the key off. Re-raised every
// frame W is held, so the toast holds at full opacity while they keep trying and fades 1.5 s after
// they stop (or the moment the starter engages — the hint has done its job by then).
let _ignHintTimer = null
function showIgnitionHint () {
  const el = document.getElementById('ignition-hint')
  if (!el) return
  clearTimeout(_ignHintTimer)
  el.style.transition = 'none'
  el.style.opacity = '1'
  void el.offsetWidth      // reflow so the fade re-arms (same trick as showSpawnToast)
  el.style.transition = 'opacity 1s ease'
  _ignHintTimer = setTimeout(() => { el.style.opacity = '0' }, 1500)
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
// PHYSICS_DT: the physics step (D-09). Single source of truth — passed down as `dt` to
// everything that steps. NEVER use 1/60 or 0.0167 literals below.
const PHYSICS_DT = 1 / 60        // physics step: 16.667ms (D-09)
const MAX_FRAME_TIME = 0.25       // spiral-of-death clamp: 250ms (T-01-04 mitigation)

// FEAT-63: the spare-time pump's budget, at the very bottom of loop(). The margin is what keeps a
// pumped frame from being the one that misses vsync — the estimate of "time already spent" cannot
// see the driver's own work after we return. The floor guarantees forward progress on a machine
// that is permanently over budget: the re-plan gets slower, never stuck.
const FRAME_BUDGET_MS = 1000 / 60
const PUMP_MARGIN_MS  = 2
const PUMP_FLOOR_MS   = 0.5

let simTime = 0  // accumulated simulation time in seconds; incremented by PHYSICS_DT each physics step

let accumulator = 0

// Subframe render interpolation: track the physics state from immediately before the last step.
// After the accumulator drains, lerp(prevRender, current, accumulator/PHYSICS_DT) eliminates the
// one-frame jitter that occurs when the render loop and physics loop drift in/out of sync.
const _prevRenderPos  = new THREE.Vector3()
const _prevRenderQuat = new THREE.Quaternion()
const _renderPos      = new THREE.Vector3()      // this frame's interpolated pose (scratch, reused)
const _renderQuat     = new THREE.Quaternion()
let currentTime = performance.now() / 1000

// ── Vehicle state ────────────────────────────────────────────────────────────
// The player's truck. Mutated each physics step by vehicle.js (input) and physics.js (dynamics);
// units, sign conventions and the wheel index (0=FL, 1=FR, 2=RL, 3=RR) are in GLOSSARY.md.
// The SHAPE and its static-equilibrium seeding live in src/vehicle-state.js — FEAT-41's menu stage
// runs a SECOND truck in its own physics world, and two copies of that literal would drift the
// first time a field was added to one and not the other.
const vehicleState = makeVehicleState(RANGER_PARAMS)

// ── SM-3 damage model ────────────────────────────────────────────────────────────────────────────
// One instance per run. Starts at 100% (a new truck); the jalopy generator will replace this with a
// seeded roll over starting wear later in SM-3. publish() runs immediately so the physics stack sees
// defined multipliers on the very first step rather than falling back to its `?? 1` defaults.
const damageModel = new DamageModel({ params: RANGER_PARAMS })
damageModel.publish(RANGER_PARAMS)
window.__damage = damageModel   // debug panel + the damage GUI read this
// The diagnostic readout, toggled from the debug panel's Damage folder. Hidden by default and free
// while hidden; it is how a drive's wear is evaluated, since wear rates and a tenth-of-a-second
// impact are otherwise invisible from behind the wheel.
const damageHUD = new DamageHUD(damageModel, vehicleState)
window.__damageHUD = damageHUD   // the debug panel's "Diagnostic Readout" checkbox reads this
// FEAT-90: the player's damage screen (V or the left-edge icon, parked only). The suppress
// callback runs per frame, long after menuStage is initialised below.
const damageScreen = new DamageScreen(damageModel, vehicleState, () => menuStage.isActive())


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
// shadowed world. 0.82 of the ±20 m near frustum ⇒ full shadows to ~16 m, gone by 20 m.
installShadowEdgeFade({ fadeStart: 0.82 })
// BUG-78: the near map's shadow also gates the far cascade, so the truck can be kept OUT of the
// far map (see the wrapped shadow pass by sunFar) without its shadow dropping to the near light's 40 % share.
installNearShadowCoupling()
// PERF-16: stop re-rendering the sun's whole shadow pass every frame. Three defaults autoUpdate=true,
// so the 1536²/2048² shadow map is re-rendered each frame even parked under a static sun (measured
// ~9 pp renderer-main, ~3 pp GPU). We drive needsUpdate on-demand from the shadow-follow block in
// loop() instead — re-armed only when the shadow could actually change (camera crossed a texel, the
// sun moved, world geometry streamed, or the vehicle is in motion). First frame needs one render.
renderer.shadowMap.autoUpdate  = false
renderer.shadowMap.needsUpdate = true

// ── FEAT-41: the menu stage ──────────────────────────────────────────────────
// The live 3D scene behind the main menu, and the loading screen for every mode entry after that.
// Constructed HERE — right after the renderer, long before the world exists — because everything
// below is a run of top-level awaits, and the stage's own rAF loop animates through the gaps
// between them. That is what turns the cold-boot wait into the truck drop rather than a black
// screen with text. loop() takes the driving off it the moment it starts (stopStandalone).
//
// `?nomenu=1` BYPASSES the menu and boots straight into free roam, the way the game did before this
// feature. The headless harnesses that drive a real page — test/screenshot.mjs, profile.mjs,
// hitch-report.mjs, story-coldload.mjs — all pass it: they wait on window.__rsReady and then expect
// to be looking at the WORLD, and a menu in front of it would leave them screenshotting a truck on
// a dirt mound. The stage is still constructed (so the pause menu's way back to it works), just
// never raised.
const _noMenu = _urlParams.has('nomenu')
const menuStage = new MenuStage({
  active: !_noMenu,
  // The boot splash must not lift before there is something behind it: this fires after the
  // stage's first PAINTED frame, not merely when it is built.
  onFirstFrame: () => { const bl = document.getElementById('boot-loading'); if (bl) bl.style.display = 'none' },
})
void menuStage.begin(renderer)   // deliberately not awaited — it must run DURING the init below
if (_noMenu) {
  document.body.classList.remove('stage-on')
  const mm = document.getElementById('main-menu'); if (mm) mm.style.display = 'none'
}
// While the stage owns the screen the world sim is HELD: nothing should be driving the truck behind
// a menu. The hold skips only the fixed-step block, so storySystem.update() — the region-entry pump,
// which lives after it — keeps running, and terrain/roads keep streaming. That is the whole trick
// behind "the load animates".
let _simHeld = !_noMenu

// THE MENU IS WIRED HERE, not at the bottom of this module with every other listener. main.js's
// remaining body is a long run of top-level awaits, so a listener registered down there does not
// exist for the whole of worldgen — the buttons were visibly dead for the first ~10 s and a click
// did nothing at all (owner, 2026-09-06). Registered here they respond immediately; the two
// handlers that actually reach into the world await _worldReady first and sit on the load caption
// until it resolves, which is what "click, then hang on loading" means.
//
// Everything these listeners call before that await must be either a hoisted function or a binding
// declared ABOVE this line — a const further down is in its temporal dead zone (unreachable, and
// touching it throws) until the module body gets there.
let _worldInit = false
let _resolveWorldReady
const _worldReady = new Promise((res) => { _resolveWorldReady = res })
let _seedModalMode = 'story'   // 'story' | 'freeroam' — read by _startStoryFromModal

document.getElementById('ss-start')?.addEventListener('click', _startStoryFromModal)

// Main-menu buttons. Free roam and story both go through the seed dialog; the lab is a debug rig
// with no world of its own, so it just enters.
document.getElementById('mm-freeroam')?.addEventListener('click', () => _showSeedModal(null, null, 'freeroam'))
document.getElementById('mm-story')?.addEventListener('click', () => _showSeedModal(null, null, 'story'))
document.getElementById('mm-lab')?.addEventListener('click', async () => {
  _hideMainMenu()
  _enterStageLoad('building the world\u2026')   // the lab still needs the world's systems built
  await _worldReady
  _exitStageLoad()
  if (!_labActive) enterLab()
})
// FEAT-62: scenarios. The list is data (data/scenarios.js), so its buttons are built here rather
// than written into index.html. The leaderboard lives up here too — it is pure and has no world
// dependencies, and the list shows each scenario's best time, so it must exist before the module
// body below has finished building the world. No store passed = session-only memory; the one-line
// save-file hook is described in src/leaderboard.js's header.
const scenarioLeaderboard = new Leaderboard()
// The lab's barrel cube (see _buildBarrelCube) — up here because the scenario list names its size.
const BARREL_CUBE_RUNUP = 400 * 0.3048        // m — truck CG to the cube's near face
const BARREL_CUBE_X = -150, BARREL_CUBE_Z = 40
let _barrelCube = null                         // { bodies, side, count } while a cube stands
let _kick = null                               // the cube's kick ramp: { body, mesh, tris }
function _renderScenarioList () {
  const list = document.getElementById('mm-scenario-list')
  if (!list) return
  list.textContent = ''
  for (const def of SCENARIOS) {
    const b = document.createElement('button')
    const best = scenarioLeaderboard.best(def.id)
    b.innerHTML = `${def.name}<span class="mm-sub">${def.blurb}`
      + `${best != null ? ` &middot; best ${formatTime(best)}` : ''}</span>`
    b.addEventListener('click', () => { void _startScenario(def) })
    list.appendChild(b)
  }
  // Not a timed run, so not in SCENARIOS (no seed, no gates, no board): the lab's barrel cube.
  const cube = document.createElement('button')
  cube.innerHTML = `barrel cube<span class="mm-sub">${BARREL_CUBE_SIDE}\u00d7${BARREL_CUBE_SIDE}\u00d7${BARREL_CUBE_LAYERS} = ${BARREL_CUBE_SIDE ** 2 * BARREL_CUBE_LAYERS} drums, 400 ft run-up, testing lab</span>`
  cube.addEventListener('click', () => { void _startBarrelCube() })
  list.appendChild(cube)
}
document.getElementById('mm-scenarios')?.addEventListener('click', () => {
  _renderScenarioList()
  document.getElementById('main-menu')?.classList.add('scenarios')
})
document.getElementById('mm-scenarios-back')?.addEventListener('click', () => {
  document.getElementById('main-menu')?.classList.remove('scenarios')
})
document.getElementById('mm-settings')?.addEventListener('click', () => {
  document.getElementById('main-menu')?.classList.add('settings')
})
document.getElementById('mm-settings-back')?.addEventListener('click', () => {
  document.getElementById('main-menu')?.classList.remove('settings')
})
// "start anyway": the region behind the disclaimer is already built and frozen, so honouring this
// costs nothing but a call. Story mode is a sandbox while it is being designed and going to LOOK at
// what broke is a legitimate thing to want — the warning has been read, so this is informed.
document.getElementById('ss-anyway')?.addEventListener('click', () => {
  _hideSeedModal()
  storySystem.acceptRejectedSeed()
})
// Cancel out of a REFUSED entry leaves story mode entirely — the region is built but the player has
// declined it, and leaving them standing in a world the check refused would be the silent failure
// this whole feature exists to avoid.
document.getElementById('ss-cancel')?.addEventListener('click', () => _cancelSeedModal())
document.getElementById('ss-seed')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); _startStoryFromModal() }
  // The input is focused whenever the prompt is up, so THIS is the Esc the player actually presses —
  // it must do what cancel does. It used to only hide the prompt, which on a refused seed left
  // story mode active in its 'rejected' phase: no POIs, no wallet, and the region wall still on.
  else if (e.key === 'Escape') { e.preventDefault(); _cancelSeedModal() }
  e.stopPropagation()   // keep WASD/M/Esc out of the world while typing a seed
})


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
// Fog kill-switch (owner request, 2026-08-18 — FEAT-68 checkpoint screenshots): `?nofog=1` boots
// with fog off, and the debug-panel checkbox flips it live. Quality presets write density THROUGH
// this state (applyQuality), so a preset change can never silently re-enable fog. FogExp2 with
// density 0 is a no-op, so toggling needs no scene surgery. Sky looks only recolour fog — unaffected.
const _fogState = {
  disabled: _urlParams.has('nofog'),
  presetDensity: 0.006,   // last preset-owned density; restored when the toggle re-enables fog
}
if (_fogState.disabled) scene.fog.density = 0

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
// BUG-78 — THE TRUCK IS NOT IN THIS MAP. three has no per-light caster set (WebGLShadowMap tests
// object.layers against the VIEW camera, not the light), so at first the truck cast into both maps.
// With this one re-rendered only every SHADOW_FAR_SNAP metres, its copy of the truck's shadow stayed
// pinned where the last pass drew it while the truck drove on — a stale blob left on the road at
// speed (or displaced down a slope) until the next far pass wiped it. So the far pass is now run
// with the vehicle hidden (the wrapped shadow pass just below the light's setup), and the
// shader couples the two lights (installNearShadowCoupling) so the near map alone throws the
// truck's shadow at full strength. Anything else that MOVES and casts belongs in that hide list.
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
// PERF: opt out of the global on-demand shadow trigger. Its needsUpdate is never armed directly —
// the far-follow in loop() raises _farShadowPending and the wrapped shadow pass below draws it.
sunFar.shadow.autoUpdate = false
let _farShadowPending = true   // first frame needs one render
scene.add(sunFar)
scene.add(sunFar.target)
// BUG-78: the far cascade is drawn with the VEHICLE HIDDEN, so nothing that moves is baked into a
// map that is only refreshed every SHADOW_FAR_SNAP metres. three's shadow pass is one call over
// every shadow-casting light, made from inside render() (it must be — per-draw setup reads the
// render state that only exists there, so it cannot be run from the frame loop). Wrap that call:
// the near light(s) go through untouched, honouring the global on-demand gate as before; then, if
// the far-follow asked for it, the far light is drawn on its own with carGroup hidden and shown
// again before the world pass. Geometry matrices are fresh here (render() walks the graph first),
// and the far map still lands in the same frame as the streaming step that requested it.
// `this` must be the WebGLShadowMap: the original reads its own `type` through it.
// FAR_SHADOW_HIDE is the list of moving casters; the vehicle root joins it once it exists (the
// sky's cube-map prewarm renders — and so runs this pass — before the vehicle is built).
const FAR_SHADOW_HIDE = []
{
  const shadowPass = renderer.shadowMap.render
  renderer.shadowMap.render = function (lights, sceneArg, camera) {
    shadowPass.call(this, lights.filter(l => l !== sunFar), sceneArg, camera)
    // LOAD-BEARING: only the WORLD scene feeds the far map. The prop-impostor re-bake (several
    // small renders of its own scene, on every sky look change) runs BEFORE the world render in the
    // same frame; without this guard a far pass due on such a frame drew the cascade from the bake
    // scene AND consumed the global gate, so the world render then skipped the near map — the
    // truck's whole shadow sat still for a frame and caught up on the next (owner saw it, 2026-09-29).
    if (!_farShadowPending || !sunFar.castShadow || sceneArg !== scene) return
    _farShadowPending = false
    // Near grass/brush casts into the near map only: at 0.25 m/texel a clump's shadow is mush, and
    // its wind sway would freeze into a map refreshed every SHADOW_FAR_SNAP metres.
    const hide = propSystem ? FAR_SHADOW_HIDE.concat(propSystem.coverCasters) : FAR_SHADOW_HIDE
    const wasVisible = hide.map(o => o.visible)
    for (const o of hide) o.visible = false
    this.needsUpdate = true          // global gate (already consumed by the near pass above)
    sunFar.shadow.needsUpdate = true // per-light gate
    shadowPass.call(this, [sunFar], sceneArg, camera)
    hide.forEach((o, i) => { o.visible = wasVisible[i] })
  }
}
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
// NB `window.terrain` is the ground-height FUNCTION (returns metres), not the streaming system. This is the system
// itself — needed to reach _terrainUniforms (e.g. A/B-ing uShadowStrength from a CDP probe, or zeroing
// the FEAT-84 surface-texture uniforms to price them). A getter: a reseed swaps the instance.
window.__terrain = () => terrainSystem

// The moon rides SkySystem's KEY-LIGHT direction, so the disc you see is the thing casting the
// night's shadows. Placed each frame from the loop (see moonSystem.update).
const moonSystem = new MoonSystem(scene)
// Scratch for the per-frame unlit-particle irradiance push (dust / smoke / dirt spray).
const _particleLight = new THREE.Color(1, 1, 1)

// Wheel dust trails (src/dust.js). Self-contained sprite-pool puffs tinted to the dirt
// we're driving on; driven each render frame from vehicleState (see loop). Construct here
// since it only needs the scene + params — no dependency on terrain/road systems.
const dustSystem = new DustSystem(scene, RANGER_PARAMS)

// Tire smoke (src/smoke.js) — same construction convention as dust: scene + params only.
const smokeSystem = new TireSmokeSystem(scene, RANGER_PARAMS)

// Dirt spray (src/dirt-spray.js) — slip-driven clod stream + shed floaters, loose surfaces only.
const dirtSpraySystem = new DirtSpraySystem(scene, RANGER_PARAMS)

// Vehicle visual model (body, wheels, lights) + per-frame mesh sync now live in
// src/vehicle-model.js. syncMeshesToState(state) is called once per render frame below.
const { carGroup, syncMeshesToState, setBodyColor, addLightGui, setNightFactor, prewarmLightPrograms } = createVehicleModel(scene, RANGER_PARAMS)
FAR_SHADOW_HIDE.push(carGroup)   // BUG-78: the truck never casts into the far shadow cascade

// ── FEAT-16: 2D top-down map (dev/validation overlay, toggle M) ──────────────────
// Owns a SEPARATE read-only RoadSystem instance streamed around its own pan cursor — it never
// touches the live roadSystem/play network (see src/map2d.js). Accessors are injected so map2d
// stays decoupled from main's module state. Body forward is the -Z axis (vehicle.js); we pass
// the world-forward XZ so the marker's heading is convention-agnostic.
const _mapFwd = new THREE.Vector3()
// Story mode (beta) — constructed below, after roadSystem exists. Declared here so map2d can
// read its markers without the two modules knowing about each other.
let missionSystem = null
// FEAT-67: the mission board (src/offer-board.js) — every source POI's live offers, their timers and
// the completion/cancel log. Built when a story region goes live (onRegionLive), dropped on region
// exit. Null outside story mode. Declared up here because the water/seed paths above clear its
// memoised routes.
let offerBoard = null
// FEAT-67: Larry's hover card needs his tour, which is the paper route's planner — Held-Karp, up to
// ~14 ms at fifteen stops. It runs as a RESUMABLE job pumped a couple of ms per frame while the map
// is open (planTourJob, the same generator the route itself uses), never blocking a hover.
// { offerId, tier, it, done, route }. See _larryRoute / _pumpLarryTour.
let _larryTour = null
let _mapOpenClass = false   // mirrors body.map-open (see the frame loop)
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
  // Double-click teleport (free roam and story — isTeleportEnabled). The map snaps to the nearest road and hands us the
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
  // FEAT-67: the mission board as a view — hover cards, the drawn offer route, turnover timers,
  // diamond colours. map2d stays economy-free: the card is offer-board's view-model, and every
  // number on it is computed here from the live board, clock and terms.
  getBoard: () => (offerBoard && storySystem?.isActive() ? _boardView : null),
  // Q / E with no source under the cursor: step the parked offer panel the map is open behind.
  onCycle: (d) => { if (missionSystem?.state === 'offer') missionSystem.cycle(d) },
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
// Dev handles for the FEAT-68 checkpoint tooling (CDP probes: map renders, drive-through tests).
// Same always-on precedent as window.__view.
window.__map2d = () => map2d
window.__teleport = (x, z, heading, drop = 0.5) => teleportToGround(x, z, heading, drop)
window.__car = () => ({ x: vehicleState.position.x, y: vehicleState.position.y, z: vehicleState.position.z,
                        v: Math.hypot(vehicleState.velocity.x, vehicleState.velocity.z) })

// FEAT-49: gauge cluster (bottom-right canvas overlay). The odometer seeds to a random jalopy
// mileage at boot and RE-seeds on every story-mode entry — "the next run's jalopy". The temp needle
// reads damageModel's engine temperature (FEAT-51); fuel is a placeholder until FEAT-50.
const gaugeCluster = new GaugeCluster(document.getElementById('cluster'))
gaugeCluster.seedOdometer()

// ── Lab ramp ──────────────────────────────────────────────────────────────────
// Freestanding ramp: 10°, 5m rise + 5m underrun, 6m wide, no plateau.
// RAMP_UNDERRUN extends the slope downhill (toward spawn) so the toe is buried underground
// along the ramp direction — not straight down. Toe sits at y ≈ −0.88 m.
const RAMP_ANGLE    = Math.PI / 18   // 10 degrees
const RAMP_LENGTH   = 5              // m — rise section (from ground level to crest)
const RAMP_UNDERRUN = 5              // m — extra slope buried below terrain at the toe end
const RAMP_WIDTH    = 6              // m — collision bounds match mesh width
const RAMP_DEPTH    = 5              // m below toe the collision solid extends (sides + back)
const RAMP_MAX_H    = RAMP_LENGTH * Math.tan(RAMP_ANGLE)  // ≈ 0.88 m — crest height
const RAMP_END_Z    = -20            // m — crest z (top of ramp)
const RAMP_TOE_Z    = RAMP_END_Z + RAMP_LENGTH + RAMP_UNDERRUN  // -10 — toe z (near spawn)
const RAMP_TOE_Y    = -RAMP_UNDERRUN * Math.tan(RAMP_ANGLE)     // ≈ −0.88 m — toe depth

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

// Dev handle: ground height (m) at world (x, z). The harness tools float the freecam on it
// (`window.terrain(x, z) + 45`), so it MUST return a number. It used to be the Phase-1 ramp stub,
// which returned `{ height, normal }` — every freecam sweep in test/profile.mjs, hitch-report.mjs and
// teleport-fill.mjs was therefore placed at a non-numeric height (BUG-34's lesson, un-learned).
window.terrain = (x, z) => terrainSystem ? terrainSystem.analyticHeight(x, z) : 0

/** Sphere-vs-triangle contacts for a list of [[x,y,z]×3] triangles — the lab ramp and the kick ramp. */
function _triContacts (tris, cx, cy, cz, r, hits) {
  for (const [[ax, ay, az], [bx, by, bz], [ex, ey, ez]] of tris) {
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
 */
// Tire-envelope stencil (see queryContacts): ring radii as a fraction of the wheel radius, and the
// eight sample directions. Hoisted so the per-wheel query does no trig — the values are the same
// cos/sin of o·2π/8 the loop used to evaluate on every call.
const FOOT_RINGS = [0.35, 0.6, 0.8, 0.95]
const FOOT_DIRS  = 8
const FOOT_COS   = Array.from({ length: FOOT_DIRS }, (_, o) => Math.cos(o * Math.PI * 2 / FOOT_DIRS))
const FOOT_SIN   = Array.from({ length: FOOT_DIRS }, (_, o) => Math.sin(o * Math.PI * 2 / FOOT_DIRS))

// S-64: queryContacts' per-sample road-hint and ground-height samplers, hoisted to module scope so
// the 4-wheels-per-step physics path does not allocate two closures per call. The call's cy reaches
// them through _qcY (set at the top of queryContacts; nothing in between re-enters it).
let _qcY = 0
const _qcHintAt = (x, z) => (!_labActive && roadSystem) ? roadSystem.carveHint(x, z) : undefined
// FEAT-40: cy disambiguates the two stacked surfaces in a bore span (floor vs hill overhead).
const _qcGroundH = (x, z) => _labActive ? labSystem.groundHeight(x, z)
                                        : (terrainSystem ? terrainSystem.analyticHeight(x, z, _qcHintAt(x, z), _qcY) : 0)
function queryContacts (cx, cy, cz, r, footprint = false) {
  const hits = []
  _qcY = cy

  // Ground surface — the lab's own surface in the testing lab; analytic terrain height otherwise.
  // PERF (contact path): resolve the road run ONCE (memoized carveHint) and thread it into EVERY
  // height/normal sample below. That collapses the per-wheel road tile-scans to ~1, and — crucially —
  // carveHint is memoized per 0.05 m cell, so the death-spiral's ~300 queryContacts/frame at a
  // near-stationary wheel reuse one query instead of each re-scanning a switchback's many slices
  // (the slow-CPU 5fps lock that recovers airborne). Height stays accurate: at the query center the
  // projection is ~0 (perp foot) so rest height ≈ exact (≤~5 mm via the memo).
  // The road run is resolved PER SAMPLE, not once at the wheel centre.
  //
  // It used to be resolved once at (cx,cz) and threaded into every footprint sample, which quietly
  // defeated the tire envelope at exactly the place it matters most — a road EDGE. With the wheel
  // centre still off the road, the centre's hint says "no run here", so every sample ahead resolved
  // against bare terrain and the envelope never saw the raised road at all. The tire clipped through
  // the edge until the centre crossed it, at which point the hint flipped and the surface snapped up
  // under the wheel (owner, 2026-08-22). The whole point of the envelope is to feel an edge before
  // the centre reaches it.
  //
  // The perf that motivated the shared hint (PERF-24) is preserved by carveHint's own memo, which is
  // keyed per 0.05 m cell: the stencil's 33 samples are distinct cells, but every substep and every
  // repeat query at the same spot still shares them, which is what the death-spiral case needs.
  // (_qcHintAt / _qcGroundH above.)

  // TIRE-ENVELOPE (footprint sampling). A wheel is a disc of radius r; it rests on the HIGHEST
  // terrain its circular profile can touch, NOT the single point under the hub. The legacy probe
  // sampled only the centre column, so the tire sank into troughs (rumble strips) and clipped through
  // crests / the downhill face of a slope. Here we sweep a small direction-agnostic stencil and take
  // the ENVELOPE max of  h(sample) + sqrt(r² − d²)  — the wheel-centre rest height each sample implies
  // (d = horizontal offset; the sqrt is the circle's height above ground at that offset). The winning
  // sample sets penetration depth, contact point, and surface normal. At d=0 this reduces EXACTLY to
  // the old  terrainH + r − cy, so flat ground and the m4-* assertions are unchanged.
  // PERF: each sample resolves its OWN road run, memoized per 0.05 m cell — see the note above the
  // stencil for why a single shared hint broke the envelope at road edges. Wheel callers pass
  // footprint=true; body probes do not.
  const doFootprint = footprint && r > 0 && RANGER_PARAMS.wheelFootprint !== false
  let bestH   = _qcGroundH(cx, cz)
  let bestTop = bestH + r        // d=0 term — identical to the legacy single probe
  let bestX = cx, bestZ = cz
  if (doFootprint) {
    // Four rings x eight directions (32 offsets), direction-agnostic so it bridges bumps and slopes
    // in any orientation without knowing the wheel's heading.
    //
    // It was two rings x four directions, and the owner could see the seams: rolling onto a road
    // edge the wheel climbed in two visible steps — one per ring — because the envelope only knows
    // the surface at the radii it samples. The disc it is approximating is continuous, so the fix
    // is resolution: more rings make the climb finer, and the diagonals matter because a wheel
    // rarely meets an edge square-on to the world axes.
    //
    // Cost is bounded by carveHint's 0.05 m memo — these offsets are distinct cells for one wheel,
    // but every suspension substep and every repeat query at the same spot reuse them.
    for (let k = 0; k < FOOT_RINGS.length; k++) {
      const d    = FOOT_RINGS[k] * r
      const lift = Math.sqrt(Math.max(0, r * r - d * d))
      for (let o = 0; o < FOOT_DIRS; o++) {
        const sx = cx + d * FOOT_COS[o], sz = cz + d * FOOT_SIN[o]
        const h   = _qcGroundH(sx, sz)
        const top = h + lift
        if (top > bestTop) { bestTop = top; bestH = h; bestX = sx; bestZ = sz }
      }
    }
  }
  const gd = bestTop - cy
  if (gd > 0) {
    const n = _labActive ? labSystem.groundNormal(bestX, bestZ)
                         : (terrainSystem ? terrainSystem.analyticNormal(bestX, bestZ, _qcHintAt(bestX, bestZ), cy) : { x: 0, y: 1, z: 0 })
    hits.push({
      normal:       new THREE.Vector3(n.x, n.y, n.z),
      depth:        gd,
      contactPoint: new THREE.Vector3(bestX, bestH, bestZ)
    })
  }

  // Ramp triangle contacts — lab only (wheel path; the chassis gets the engine ramp prism).
  // _labActive is the authoritative gate; RANGER_PARAMS.rampEnabled is a secondary debug toggle.
  if (_labActive && RANGER_PARAMS.rampEnabled !== false) _triContacts(RAMP_TRIS, cx, cy, cz, r, hits)
  if (_kick) _triContacts(_kick.tris, cx, cy, cz, r, hits)   // the barrel cube's kick ramp

  // FEAT-06b: prop hard contacts (tree trunks = capsule, rocks/boulders = sphere). Local query
  // against the per-chunk collidable grid — bushes are NOT here (soft-drag is applied separately
  // once per physics step in the loop). Skipped in the lab (no props there). Same {normal,depth,
  // contactPoint} shape, so the wheel + body solvers consume them unchanged.
  if (!_labActive && propSystem) {
    propSystem.queryProps(cx, cy, cz, r, hits)   // appends in place (S-49)
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
  // surface. Reuses the CENTRE's run (memoized, so no extra tile scan) — a tunnel wall is a
  // property of the run the wheel is in, not of the envelope's outlying samples.
  if (!_labActive && roadSystem) {
    const wallHit = roadSystem.queryTunnelWallContact(cx, cy, cz, r, _qcHintAt(cx, cz))
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
// S-64: the debug HUD's read-out spans, looked up once (WR-04: a missing id is skipped, never thrown
// on inside the frame loop), and written only when the string changes.
const _hudEl = Object.fromEntries(['spinVal', 'flFzVal', 'frFzVal', 'rlFzVal', 'rrFzVal', 'slipVal', 'thrVal', 'brkVal', 'fpsVal', 'posVal']
  .map(id => [id, document.getElementById(id)]))
const _hudText = (el, s) => { if (el && el.textContent !== s) el.textContent = s }

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
// propCastShadow lever flips it back). The whole realtime caster set is the truck, FEAT-46's POI
// cubes, and the near FEAT-85 grass/brush pools (too fine for the bake; see prop-system castsNearShadow). A world-sized frustum was therefore spending its entire texel budget framing geometry that
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
// FEAT-85 cover: the roadside grass/brush fade window (m) and whether new chunks scatter it at
//   all. Low fades everything to nothing (zero fragments) and stops scattering; the others widen
//   the window with the tier's reach. Written to FLORA_PARAMS.scatter.cover, pushed by the same
//   sync hook as the impostors (applyPropImpostors), GUI-overridable live.
// coverDensity: × on the backcountry cover attempts (owner 2026-09-23: grass scales with the
//   quality slider; rocks do NOT — they are what ties the props to the ground texture). The far
//   prop ring stands 3–4-tri stand-ins (COVER_FAR_CAT), so the vertex cost of the extra density
//   lands mostly inside lodRing.
const QUALITY_PRESETS = {
  Low:    { ring: 1, warm: 1, fogDensity: 0.012, detailScale: 0,   shadows: false, propRing: 1, lodRing: 0, bbRing: 2, resHeight: 720,  shadowMap: 1024, shadowExtent: 20, shadowTilePx: 0,   cover: false, coverFade: [0, 0],     coverDensity: 0   },
  Normal: { ring: 2, warm: 1, fogDensity: 0.006, detailScale: 1.0, shadows: true,  propRing: 2, lodRing: 1, bbRing: 3, resHeight: 1200, shadowMap: 1536, shadowExtent: 20, shadowTilePx: 256, cover: true,  coverFade: [50, 110],  coverDensity: 1.0 },
  High:   { ring: 3, warm: 3, fogDensity: 0.004, detailScale: 1.0, shadows: true,  propRing: 3, lodRing: 2, bbRing: 6, resHeight: null, shadowMap: 2048, shadowExtent: 20, shadowTilePx: 384, cover: true,  coverFade: [80, 150],  coverDensity: 1.6 },
  Ultra:  { ring: 4, warm: 4, fogDensity: 0.003, detailScale: 1.0, shadows: true,  propRing: 4, lodRing: 2, bbRing: 8, resHeight: null, shadowMap: 3072, shadowExtent: 20, shadowTilePx: 512, cover: true,  coverFade: [100, 190], coverDensity: 2.2 },
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

let _qualityName = 'Normal'   // the tier last applied (captures record it)
function applyQuality (name) {
  const p = QUALITY_PRESETS[name] ?? QUALITY_PRESETS.Normal
  _qualityName = QUALITY_PRESETS[name] ? name : 'Normal'
  if (terrainSystem) terrainSystem.setRingRadius(p.ring, p.warm)
  // roadRadius DERIVED from the visible ring (PERF-06): (ring+0.5)·2·CHUNK_SIZE = 2× the terrain axis
  // half-width = the square ring's diagonal corner (×√2) with a ×√2 lead. The road network is a CIRCLE
  // that must enclose the SQUARE terrain ring's corner before it scrolls into view; it is a route/slice
  // radius (CPU), not a draw distance (the ribbon mesh is terrain-chunk-bound via syncToChunkRing). Low/
  // Normal land exactly on today's 192/320; High/Ultra trim 512→448 / 640→576 (the old constants were
  // routed past anything renderable). Tied to ring so it can never drift out of sync with the terrain.
  if (roadSystem) roadSystem.setRadius((p.ring + 0.5) * 2 * CHUNK_SIZE)   // dirty → next update() re-streams
  _fogState.presetDensity = p.fogDensity
  if (scene.fog && !_fogState.disabled) scene.fog.density = p.fogDensity
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
  if (p.shadows) { _farShadowPending = true; renderer.shadowMap.needsUpdate = true }
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
  // FEAT-85 roadside cover: same write-the-param-then-sync pattern (the impostor hook also
  // pushes the cover dials). `enabled` only affects chunks scattered from now on.
  if (p.coverFade && FLORA_PARAMS.scatter?.cover) {
    const C = FLORA_PARAMS.scatter.cover
    C.enabled = p.cover !== false
    C.density = p.coverDensity ?? 1
    C.fadeStart = p.coverFade[0]; C.fadeEnd = p.coverFade[1]
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

// ── PERF-08 profiling dev handles (?prof=1 only) ──────────────────────────────────────────────
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
  window.__barrelCube = (side, count) => { if (!_labActive) enterLab(); _buildBarrelCube(side, count); return debrisSystem.count }   // test/bench-barrels.mjs
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
    // Geometry fingerprint: cheap, order-independent hash of every registered run's sampled
    // points. Two builds with the same fingerprint ARE the same roads — this is what makes a
    // router-price A/B measurable instead of eyeballed.
    let fp = 0, pts = 0, km = 0
    for (const e of rs._network.values()) {
      km += (e.polyCum?.[e.polyCum.length - 1] ?? 0) / 1000
      for (const q of e.points) {
        fp = (fp + Math.round(q.x * 8) * 73856093 + Math.round(q.y * 8) * 19349663 + Math.round(q.z * 8) * 83492791) >>> 0
        pts++
      }
    }
    return {
      runs: rs._network.size, fp, pts, km: +km.toFixed(2),
      pending: rs._pendingRoutes.size,
      cls: rs._proto.cls?.size ?? 0,
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
    propChunks: propSystem ? propSystem.liveChunkCount() : 0,
    // PERF-33: chunk keys live around a world XZ (the teleport-fill harness polls these)
    hasProps:   (cx, cz) => !!propSystem && propSystem.hasChunk(cx, cz),
    hasGround:  (cx, cz) => !!terrainSystem && terrainSystem._chunkMap.has(cx + ',' + cz),
  })
  // FEAT-39 harness: drop the CAR at a spot (unlike __view, which only moves the freecam). Lets the
  // CDP probe frame the real chase-cam approach to a junction without hand-driving there.
  // `drop` is exposed because the SM-3 spring track is calibrated by DROPPING the truck onto its
  // bump stops from a known height, which is the only clean way to produce a repeatable bump-stop
  // force (owner, 2026-08-20). 0.5 m stays the default so existing harness calls are unchanged.
  window.__tp = (x, z, heading = 0, drop = 0.5) => teleportToGround(x, z, heading, drop)
  // Single-lever A/B toggles: isolate one cost axis at a time at a fixed preset. Each returns true
  // if applied. NOT persisted anywhere — page reload restores the preset's values.
  const _eachPropMesh = (fn) => { if (propSystem) for (const rec of propSystem._meshes.values()) fn(rec) }
  const LEVERS = {
    // PERF-16 re-arm. Both cascades move together — the lever means "realtime sun shadows on/off".
    sunShadow:        v => { sun.castShadow = sunFar.castShadow = !!v; _farShadowPending = true; renderer.shadowMap.needsUpdate = true },
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
}

// Phase 6 (TERR-06): pass setRampVisible callback so the Ramp Visible toggle in debug.js
// can control rampMesh visibility without requiring debug.js to import rampMesh directly.
// Phase 7 (SEED-04 / D-09): rebuildTerrainFull = Path B debounced rebuild (Worker reinit + re-seat);
//   changeSeed = update worldSeed then fire Path B.
const _gui = initDebug(RANGER_PARAMS, {
  // The ramp is a LAB rig: the mesh shows only there, and the chassis's engine prism follows the
  // toggle too (the wheels' RAMP_TRIS already did) — no invisible ramp, no ramp in free roam.
  setRampVisible:      (v) => {
    rampMesh.visible = v && _labActive
    if (_labActive) { _destroyLabColliders(); _buildLabColliders() }
  },
  // FEAT-33 × SM-3 (owner 2026-09-04): the damage model's engine track OWNS engineHealth now (it
  // writes vehicleState.engineHealth every step), so the slider pokes the track itself. Inert while
  // damage is disabled — the track is locked at nominal there, by design.
  setEngineHealth:     (v) => { damageModel.set('engine', v); damageModel.publish(RANGER_PARAMS) },
  fuelGal:             () => vehicleState.fuel.gal,
  setFuelGal:          (g) => {   // FEAT-50 debug Refill / Drain
    const f = vehicleState.fuel
    f.gal = Math.max(f.floorGal, Math.min(RANGER_PARAMS.fuelTankGal, g)); f.dry = f.gal <= 0
    if (f.gal <= 0 && vehicleState.ignition) { vehicleState.ignition.state = IGN_OFF; vehicleState.ignition.event = 'shutoff' }
  },
  // FEAT-36 gap 3: drop a settled barrel pyramid on the ground ahead of the truck. The one pile
  // the game has — everything else debris does is player-thrown, so this is the only way to watch
  // object↔object stacking. 8 m out along the truck's own forward (−Z in body space), seated on
  // the analytic terrain height so it settles rather than falling in from altitude.
  spawnDebrisStack: () => {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(vehicleState.quaternion)
    fwd.y = 0
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1)
    fwd.normalize()
    const x = vehicleState.position.x + fwd.x * 8
    const z = vehicleState.position.z + fwd.z * 8
    const y = terrainSystem ? terrainSystem.analyticHeight(x, z) : 0
    debrisSystem.spawnStack('barrel', { x, y, z })
  },
  // Drop one ~50 kg rock into the truck's bed, to drive around with a load. A random spot inside
  // the wheelhouse walls, 0.8 m above the floor, in the truck's CURRENT pose and carrying its
  // velocity so it falls in even while moving. Inert on a model without an open bed.
  dropRockInBed: () => {
    const bed = DEFAULT_VEHICLE_MODEL.bed
    if (!bed) return
    const local = new THREE.Vector3(
      (Math.random() * 2 - 1) * (bed.wheelhouseHalfW - 0.25),
      bed.floorY + 0.8,
      bed.frontZ + 0.3 + Math.random() * (bed.tailZ - bed.frontZ - 0.6))
    const p = local.applyQuaternion(vehicleState.quaternion).add(vehicleState.position)
    const v = vehicleState.velocity
    debrisSystem.spawn('rock', { x: p.x, y: p.y, z: p.z }, { x: v.x, y: v.y, z: v.z })
  },
  loadFreight:         (key, massKg) => _loadFreight(key, massKg),   // FEAT-96 scaffolding: '' empties the bed
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
    // FEAT-84: 'uSurfScale.x' addresses one component of a vector uniform.
    const dot = name.indexOf('.')
    if (dot > 0) {
      const u = terrainSystem?._terrainUniforms?.[name.slice(0, dot)]
      if (u) u.value[name.slice(dot + 1)] = value
      return
    }
    if (terrainSystem?._terrainUniforms?.[name]) terrainSystem._terrainUniforms[name].value = value
    if (roadMeshSystem?._roadUniforms?.[name])   roadMeshSystem._roadUniforms[name].value = value
  },
}, { initialSeed: _urlSeed ?? '6' })

// Fog kill-switch checkbox (see _fogState at the fog construction for the boot-param half).
_gui.add(_fogState, 'disabled').name('Disable fog').onChange((v) => {
  if (scene.fog) scene.fog.density = v ? 0 : _fogState.presetDensity
})

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
perfMark('init: before TerrainSystem')  // D-arc — the ~8s load is one-time init, not the frame loop
terrainSystem = new TerrainSystem(scene, RANGER_PARAMS, worldSeed)

// ── FEAT-48: the physics engine world ────────────────────────────────────────
// One engine world for everything — chassis, streamed terrain colliders, debris.
// WASM init is ~15 ms (measured, Phase 0); top-level await here matches the
// existing boot style (route-cache import below also top-level awaits).
perfMark('init: before physics engine')
const physicsEngine = await createPhysicsEngine()
const terrainPhysics = new TerrainPhysics(physicsEngine, () => roadSystem)   // road spans → bore slots in the collider
terrainSystem.setPhysicsHook(terrainPhysics)   // mirrors every chunk build/recarve/dispose
// The model's open-bed spec (if it has one) builds a real well instead of the solid deck, so
// cargo dropped in rides in it (owner, 2026-09-29: "add a couple and drive around").
const vehicleChassis = createVehicleChassis(physicsEngine, vehicleState, RANGER_PARAMS,
  { bed: DEFAULT_VEHICLE_MODEL.bed ?? null })
const engineCtx = { engine: physicsEngine, chassis: vehicleChassis }
const debrisSystem = new DebrisSystem(physicsEngine, scene)   // FEAT-36: thrown barrels/rocks

// ── FEAT-96: the strapped load — a freight job's, or the debug "Load Cargo" pick ─────────────
// One load at a time; loading another replaces it. The load is placed AT REST where strapPose
// (debris.js) says, and welded to the chassis at once — so its mass and inertia ride
// the truck through the joint, exactly as a loose body's would through contact. Pinned (outside
// DEBRIS_CAP) and noDamage, as FEAT-88's bundles are. The weld dies with its body (Box3D), so
// removing the body is the whole teardown — "Clear Debris" included.
let _freight = null   // { body, joint, key, massKg, mission, health, sound, blink } — the strapped load (mission null = debug), or null
const _fP = new THREE.Vector3(), _fV = new THREE.Vector3()
// FEAT-97: a debug pick is health-tracked when only fragile things use that load (the large crate is
// freight too, so a debug crate stays freight).
const _DEBUG_FRAGILE = Object.fromEntries(THINGS
  .filter(t => t.family === 'fragile' && !THINGS.some(f => f.family === 'freight' && f.load === t.load))
  .map(t => [t.load, t]))
async function _loadFreight (key, massKg, mission = null, health = null) {
  const bed = DEFAULT_VEHICLE_MODEL.bed, row = FREIGHT[key]
  const kind = `freight:${key}`
  if (bed && row) await debrisSystem.load(kind, { model: row.model, massKg: row.massKg, friction: 0.6, restitution: 0.1, box: true })
  if (_freight) { debrisSystem.remove([_freight.body]); _freight = null }   // after the await: a second pick mid-load still leaves one load
  if (!bed || !row) return
  const e = debrisSystem.halfExtents(kind)
  // A `floorSeated` model (the angled plywood) already stands on the wheelhouses in its own geometry: width 0
  // keeps strapPose from lifting it onto them a second time.
  const pose = strapPose(bed, e, PROP_MODELS[row.model].floorSeated ? 0 : (PROP_MODELS[row.model].collision?.size?.[0] ?? 2 * e.x) / 2)
  // vehicleState is the authoritative pose (physics.js Step 1.5); push it so the weld's frames are
  // taken against where the truck IS, not the last step's pose (matters straight after a reseat).
  physicsEngine.setTransform(vehicleChassis, vehicleState.position, vehicleState.quaternion)
  _fP.set(pose.x, pose.y, pose.z).applyQuaternion(vehicleState.quaternion).add(vehicleState.position)
  _fV.copy(_fP).sub(vehicleState.position)
  _fV.crossVectors(vehicleState.angularVelocity, _fV).add(vehicleState.velocity)   // v + ω × r: the bed's own velocity there
  const v = { x: _fV.x, y: _fV.y, z: _fV.z }
  const q = vehicleState.quaternion, w = vehicleState.angularVelocity
  // FEAT-97: a fragile load carries its condition. A re-strap hands the same tracker back — a reseat
  // never repairs the cargo.
  const fragile = mission ? mission.fragile : _DEBUG_FRAGILE[key]
  const body = debrisSystem.spawn(kind, { x: _fP.x, y: _fP.y, z: _fP.z }, v,
    { spin: { x: w.x, y: w.y, z: w.z }, quaternion: { x: q.x, y: q.y, z: q.z, w: q.w }, pinned: true, noDamage: true, massKg,
      ownMaterials: !!fragile })
  const joint = physicsEngine.createWeldJoint(vehicleChassis, body, _fP)
  _freight = { body, joint, key, massKg, mission, blink: 0, sound: fragile?.sound ?? null,
               health: fragile ? (health ?? makeFragile(fragile)) : null }
}
// A seat (R, teleport, reseed, region re-fit) moves the truck in one jump; a weld to the load left
// behind would yank them together across it. Re-strap the same load on the new pose instead.
function _restrapFreight () {
  if (_freight) void _loadFreight(_freight.key, _freight.massKg, _freight.mission, _freight.health)
}

// ── FEAT-97: the fragile load's shocks ───────────────────────────────────────────────────────
// Per fixed step: the strap's force on the load ÷ its mass, plus gravity, is the g it feels
// (src/fragile.js). A banked hit plays the load's sound and blinks it red, both scaled by what the
// hit cost. No number reaches the HUD (SM-INV-10). At zero the job has FAILED: it pays nothing and
// can no longer be delivered, and "clean up cargo" (+1 h) is the only way out of it.
const FRAGILE_BLINK_S = 0.3   // s for a full-strength blink to fade out
const _jf = { x: 0, y: 0, z: 0 }
function _fragileStep () {
  const f = _freight
  if (!f?.health || f.health.health <= 0) return
  const ev = f.health.step(feltG(physicsEngine.jointForce(f.joint, _jf), f.massKg))
  if (!ev) return
  playCargoHit(f.sound, ev.cost)
  f.blink = Math.max(f.blink, Math.min(1, 0.4 + 2 * ev.cost))
  if (f.health.health <= 0 && f.mission) { f.mission.failed = true; _disarmJobCancel() }
}
function _fragileBlink (dt) {
  if (!(_freight?.blink > 0)) return
  _freight.blink = Math.max(0, _freight.blink - dt / FRAGILE_BLINK_S)
  debrisSystem.blink(_freight.body, _freight.blink)
}
// Road ribbon/pad/bore trimesh colliders — attached to roadMeshSystem at its creation sites
// below (boot + seed rebuild). The terrain heightfields mirror the CARVED mesh, which sits
// roadClearanceMargin BELOW the asphalt; without this mirror debris fell through the road.
const roadPhysics = new RoadPhysics(physicsEngine)
// POI marker solids for the chassis — rebuilt with the markers (_rebuildPoiMarkers).
const poiPhysics = new PoiPhysics(physicsEngine)
// Prop hard colliders (tree trunks, logs, rocks, boulders) as engine statics — the chassis'
// rigid tree contact ("squishy trees" fix, 2026-08-15). Attached at every PropSystem creation.
const propPhysics = new PropPhysics(physicsEngine, FLORA_PARAMS)
window.__propPhysics = propPhysics             // dev handle — prop-debug radius sliders resyncAll()
// Collider wireframes (debug overlay) — replaces the retired orange probe spheres. Backtick
// toggles it; the debug panel mirrors it. Two-tone X-ray over the models, never hiding them.
const physicsWireframes = new PhysicsWireframes(physicsEngine, scene)
window.__physWireframes = physicsWireframes    // dev handle — debug.js checkbox targets it
window.__physicsEngine = physicsEngine         // dev handle (counters in the HUD / console)
window.__setBodyBounce = (e) => setBodyRestitution(physicsEngine, vehicleChassis, e)   // debug.js Body Bounce slider
window.__syncChassisMass = () => syncChassisMass(physicsEngine, vehicleChassis, RANGER_PARAMS)   // debug.js Mass slider + vehicle preset
window.__vs = vehicleState                    // dev handle — read live vehicle state from the console / CDP probes
window.__roadSys = () => roadSystem           // dev handle — the LIVE RoadSystem instance (getter: play swaps instances on seed regen); __road() below is the stats view

// FEAT-33: is the starter motor actually turning? Not the same as state === 'cranking' — the key
// stays at START while it is held, so an over-crank against an already-running engine still has the
// starter engaged. Drives the crank audio level. (The cluster needs no equivalent: it draws the key
// at the START detent under exactly this condition, so the picture already says it.)
const _starterEngaged = (ign) => !!ign && (ign.state === 'cranking' || ign.startHeld)
window.__debris = debrisSystem                 // dev handle — debug.js projectile selector + clear button
perfMark('init: physics engine ready')

// Phase 8 (D-05 / D-07): RoadSystem — instantiated after scene exists.
// init(scene) attaches the scene reference so buildDebugLines() can add debug lines.
// RoadSystem is pure-function-of-(worldSeed, coords, params) — the tile cache is memoization
// only; same seed always produces the same roads.
roadSystem = new RoadSystem(worldSeed, RANGER_PARAMS)
roadSystem.init(scene)
// Stream the road network at roughly the terrain view radius.
// PERF (Tier 1): road stream radius ~matches the terrain ring (5×5 chunks ≈ 160–226 m), not 640 m.
// Routing/slicing cost scales with this area; 640 m routed ~16× the terrain footprint. 320 m covers
// the visible terrain ring with margin while cutting cold-stream + per-crossing re-stream cost.
roadSystem.setRadius(320)

// ── FEAT-46: story-mode POIs — orange marker cubes on their own lay-by pads ─────────────────
// Story mode only. The pads are handed to the RoadSystem carve AFTER the region is routed and
// frozen (story.js's onRegionLive), which is what keeps the ratified rule — POIs never influence
// routing determinism — structural: free roam never calls build(), so it never sets a pad, and the
// same seed produces the same roads, the same surface and the same par in both modes.
//
// POI knobs live in POI_PARAMS, deliberately NOT in RANGER_PARAMS: a poi* key landing in that
// object would re-route the whole world every time a marker's size changed.
const poiSystem = new PoiSystem({
  getRoad:    () => roadSystem,
  getWater:   () => waterSystem,
  getTerrain: () => terrainSystem,
  getSeed:    () => worldSeed,
  getParams:  () => RANGER_PARAMS,
})

// FEAT-45: dispersed-camping zones. Same isolation + same params discipline as the POI layer above
// (CAMP_PARAMS is outside RANGER_PARAMS for the same re-route reason), and the same story-only
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
const _pumpZoneMat = _ringMat(0x4fc8ff)    // FEAT-50: blue — pull alongside and park to use the pump
const _pumpZoneMarks = []                  // the pump zones' curtains (two per island), rebuilt with the markers
// ASSET-74: the same curtain round a PARK box instead of a circle — the ring with four sides. A unit
// square (side 1, open top and bottom): 4 radial segments started at 45°, at radius √½. Shares the
// ring's material and alpha ramp, so it reads as the same signal in a different shape.
const _parkBoxGeo = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true, Math.PI / 4)
const PARK_SLACK = 0.3         // m the park box grows by for the trigger — a truck half a wheel over the line still counts
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
// poi.id → its marker (model group or cube), so ONE marker can be hidden — the stranded motorist's
// car shows only while it has work (FEAT-102, see _updatePoiPresence).
const _poiMeshes = new Map()
// customer.id → [ring, pip]. FEAT-61: a delivery target is only lit when it is ON your route and
// still owed a paper — see _updateCustomerRings.
const _customerRings = new Map()

/**
 * Rebuild the markers + interaction rings (cheap: a handful of each per region).
 *
 * FEAT-60: a POI whose roster slot names a model (or a model POOL — the five residences draw
 * from every 'residence'-tagged asset) gets the model; everything else keeps the orange cube.
 * The cube is not an unfinished job — it is the honest placeholder for a type nobody has modelled
 * yet, and the auto shops, the food vendor and the stores are all still cube.
 */
function _rebuildPoiMarkers () {
  _poiGroup.clear()   // geometry + material are shared singletons — nothing per-cube to dispose
  _poiRings.clear()
  _poiMeshes.clear()
  for (const { mesh } of _dropMarks.values()) mesh.geometry.dispose()   // per-mark geometry, not shared
  _dropMarks.clear()
  _customerRings.clear()
  _pumpZoneMarks.length = 0
  const half = POI_PARAMS.poiCubeSize * 0.5
  const r = POI_PARAMS.poiInteractR
  for (const q of poiSystem.list()) {
    if (q.modelKey) {
      // receiveShadow too: a building is big enough to catch its neighbours' shadows and its own,
      // unlike the small thrown mission items FEAT-59's cast-only default was written for.
      const m = spawnModel(q.modelKey, { castShadow: true, receiveShadow: true, variant: q.modelVariant })
      // pad records are base-seated, and so are the models. modelX/Z, not the pad centre: a model
      // may be `seat`ed toward the back of the pad to leave its yard on the road side (FEAT-71).
      m.position.set(q.modelX, q.y, q.modelZ)
      // modelYaw = the pad's road-facing yaw plus the asset's own yawOffset (a Winnebago parks
      // broadside, a trailer stands square) — see the yawOffset note in data/prop-models.js.
      m.rotation.y = q.modelYaw ?? q.yaw
      _poiGroup.add(m)
      _poiMeshes.set(q.id, m)
    } else {
      const cube = new THREE.Mesh(_poiCubeGeo, _poiCubeMat)
      cube.position.set(q.x, q.y + half, q.z)
      cube.castShadow = true
      _poiGroup.add(cube)
      _poiMeshes.set(q.id, cube)
    }
    // FEAT-71: the yard — lawn furniture at a residence, clutter at a farm. Positions are solved
    // in poi.js (deterministic in the seed); this only dresses them. Static meshes, no bodies.
    for (const sat of q.satellites ?? []) {
      const m = spawnModel(sat.key, { castShadow: true, variant: sat.variant })
      m.position.set(sat.x, sat.y, sat.z)
      m.rotation.y = sat.yaw
      _poiGroup.add(m)
    }

    // FEAT-50: a pump island's two zones — the store lot's box curtain, in fuel blue rather than
    // job orange, because the brake there opens the pump, never an offer.
    for (const zb of q.pumpZones ?? []) {
      const w = dropZoneWorld(q, zb)
      const m = new THREE.Mesh(_parkBoxGeo, _pumpZoneMat)
      m.scale.set(2 * w.halfX, _POI_RING_H, 2 * w.halfZ)
      m.position.set(w.x, q.y - _POI_RING_SINK + _POI_RING_H * 0.5, w.z)
      m.rotation.y = w.yaw
      m.renderOrder = 5
      _poiGroup.add(m)
      _pumpZoneMarks.push(m)
    }

    // The ring means "park here and something happens", so it belongs only to markers where
    // something does. The services are unbuilt and mom's house has her own doorstep prompt.
    if (!q.jobs) continue
    // FEAT-88: a haul giver's "park here" is its drop zone, not a ring round the pad.
    if (q.drop) { _addDropMark(q); continue }
    const box = q.park ? dropZoneWorld(q, q.park) : null
    const ring = new THREE.Mesh(box ? _parkBoxGeo : _ringGeo, _poiRingMat)
    if (box) {   // ASSET-74: the general store's lot — a box curtain round every stall
      ring.scale.set(2 * box.halfX, _POI_RING_H, 2 * box.halfZ)
      ring.position.set(box.x, q.y - _POI_RING_SINK + _POI_RING_H * 0.5, box.z)
      ring.rotation.y = box.yaw
    } else {
      ring.scale.set(r, _POI_RING_H, r)
      ring.position.set(q.x, q.y - _POI_RING_SINK + _POI_RING_H * 0.5, q.z)
    }
    ring.renderOrder = 5
    _poiGroup.add(ring)
    _poiRings.set(q.id, ring)
  }
  // MESH == PHYSICS: the body hits what you see — and a hidden marker has neither (FEAT-102).
  _updatePoiPresence(true)

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
  // S-64: the route's own array, tested only for rings inside the show radius — no Set per poll.
  const live = paperRouteSystem.routeCustomers()
  const vp = vehicleState.position
  for (const [id, pair] of _customerRings) {
    const p = pair[0].position
    let on = Math.hypot(p.x - vp.x, p.z - vp.z) <= TARGET_RING_SHOW_R
    if (on) on = live.some(c => c.id === id) && !paperRouteSystem.isDelivered(id)
    pair[0].visible = on
    pair[1].visible = on
  }
}

/**
 * The orange↔green swap, on the ~10 Hz HUD poll: while a POI job is STAGING, the marker you took it
 * from drops its interaction ring and the start-zone ring stands in its place. Everything here is
 * visibility + a transform — no allocation after the first staged job.
 */
/**
 * FEAT-102: a marker that exists only while it has work (roster `showWhileJob` — the stranded
 * motorist). Hidden unless a slot there is live or taken; hidden means no mesh, no ring, no park
 * trigger, no map marker and NO COLLIDER, so an idle motorist pad is an empty lay-by. Re-shown only
 * once the truck is clear of the pad, so a car never spawns into the chassis. Colliders re-sync
 * only when a flag flips (or on `force`, the marker rebuild). Deterministic: it reads the board.
 */
function _updatePoiPresence (force = false) {
  let changed = force
  const vp = vehicleState.position
  const now = daySystem.clockH()
  for (const q of poiSystem.list()) {
    if (!q.showWhileJob) continue
    const busy = !!offerBoard && offerBoard.slotStates(q.id, now).some(s => s.state === 'live' || s.state === 'taken')
    const hide = !busy || (!!q.hidden && Math.hypot(q.x - vp.x, q.z - vp.z) < POI_REAPPEAR_CLEAR_M)
    if (hide !== !!q.hidden) { q.hidden = hide; changed = true }
  }
  if (!changed) return
  for (const q of poiSystem.list()) {
    const m = _poiMeshes.get(q.id)
    if (m) m.visible = !q.hidden
    const ring = _poiRings.get(q.id)
    if (ring) ring.userData.hidden = !!q.hidden
  }
  poiPhysics.sync(poiSystem.list().filter(q => !q.hidden), POI_PARAMS.poiCubeSize)
}
const POI_REAPPEAR_CLEAR_M = 15   // m — truck-to-marker distance a hidden marker waits for before it returns

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
  const onMission = ['loading', 'staging', 'running', 'done'].includes(missionSystem?.state)
                    || paperRouteSystem.isActive()
  _updateDropMarks(onMission)
  const vp = vehicleState.position
  // FEAT-102: a fetch's PICKUP wears its orange ring for the whole outbound leg — the one "park
  // here" on screen while you are on a job, marking the area you park in to acquire the item.
  const pickId = missionSystem?.pickupPoiId() ?? null
  for (const [id, ring] of _poiRings) {
    const near = Math.hypot(ring.position.x - vp.x, ring.position.z - vp.z) <= POI_RING_SHOW_R
    ring.visible = id === pickId || (near && id !== activeId && !onMission && !ring.userData.hidden)
  }
  // FEAT-50: pump zones show on a job too — running low mid-route is exactly when you need them —
  // and drop away while the pump is open (you are already in one).
  for (const m of _pumpZoneMarks)
    m.visible = !fuelStop.isOpen && Math.hypot(m.position.x - vp.x, m.position.z - vp.z) <= POI_RING_SHOW_R
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

// ── FEAT-88: the haul load ─────────────────────────────────────────────────────────────────
// A haul giver has a DROP ZONE instead of an orange ring (owner, 2026-10-05): a bed-sized rectangle
// on the ground (poi.js `drop`). Park with your bed over it and the yard's offers open; accept and
// the job goes 'loading' (mission.js) and the load drops AT ONCE, one piece every HAUL_DROP_GAP,
// at FIXED points over the rectangle — not over wherever your truck happens to be. Parking is the
// skill: a bed half off the zone catches half a load, and a miss is lost pay. Each piece is a pinned
// debris body (outside DEBRIS_CAP, so a thrown rock cannot delete it) that never feeds the wear
// model. The pieces are counted at arrival (onSettle above) and removed; cancel or leaving the job
// removes them too (the 10 Hz poll).
const HAUL_DROP_Y   = 3.3   // m above the pad: ~2.6 m over a Ranger's bed floor — the title screen's rock drop
const HAUL_DROP_GAP = 0.3   // s between pieces, so the impacts never stack
const HAUL_SETTLE_S = 1.0   // s after the last piece before the job stages — let it land first
const DROP_SLACK    = 0.6   // m — how far the bed centre may sit off the zone and still open the offers
let _haul = null            // { mission, drops, handles, t0, zone } — the live load, or null
const _haulV = new THREE.Vector3(), _haulQ = new THREE.Quaternion(), _haulQd = new THREE.Quaternion()
const _UP = new THREE.Vector3(0, 1, 0)

/** The loading POI of the job in hand, if it is loading. */
function _haulPoi () {
  if (missionSystem?.state !== 'loading') return null
  const id = missionSystem.mission?.fromPoi
  return poiSystem.list().find(q => q.id === id) ?? null
}

/** Is the truck's bed over POI `q`'s drop zone (within DROP_SLACK)? */
function _bedOverDrop (q) {
  const bed = DEFAULT_VEHICLE_MODEL.bed
  if (!bed || !q?.drop) return false
  _haulV.set(0, 0, (bed.frontZ + bed.tailZ) / 2).applyQuaternion(vehicleState.quaternion).add(vehicleState.position)
  return overDropZone(q, _haulV.x, _haulV.z, DROP_SLACK)
}

/**
 * Fixed step, after stepPhysics: release the load on the clock. The drop points are
 * bedDropPoints' bed-shaped layout laid on the ZONE: its bed-local z (along the truck) runs along
 * the zone's long axis, so one quaternion — the marker yaw plus a quarter turn — carries both the
 * points and each piece's attitude into the world.
 */
function _haulStep () {
  if (missionSystem?.state !== 'loading') return
  const bed = DEFAULT_VEHICLE_MODEL.bed
  if (!_haul) {
    const zone = dropZoneWorld(_haulPoi())
    if (!bed || !zone) return
    const mission = missionSystem.mission
    _haul = { mission, handles: [], t0: simTime, zone,
              q: new THREE.Quaternion().setFromAxisAngle(_UP, zone.yaw + Math.PI / 2),
              drops: bedDropPoints(mission.bundles, bed, `haul:${worldSeed}:${mission.offerId}`) }
  }
  const n = _haul.drops.length, mid = (bed.frontZ + bed.tailZ) / 2, z = _haul.zone
  while (_haul.handles.length < n && simTime >= _haul.t0 + _haul.handles.length * HAUL_DROP_GAP) {
    const d = _haul.drops[_haul.handles.length]
    _haulV.set(d.x, 0, d.z - mid).applyQuaternion(_haul.q)
    _haulQ.copy(_haul.q).multiply(_haulQd.set(d.quaternion.x, d.quaternion.y, d.quaternion.z, d.quaternion.w))
    const h = debrisSystem.spawn(d.kind, { x: z.x + _haulV.x, y: z.y + HAUL_DROP_Y, z: z.z + _haulV.z },
      { x: 0, y: -1.2, z: 0 },
      { spin: d.spin, quaternion: { x: _haulQ.x, y: _haulQ.y, z: _haulQ.z, w: _haulQ.w }, pinned: true, noDamage: true })
    if (!h) return          // the piece's model is still loading — try again next step
    _haul.handles.push(h)
  }
  if (_haul.handles.length === n && simTime >= _haul.t0 + (n - 1) * HAUL_DROP_GAP + HAUL_SETTLE_S) {
    missionSystem.loadingDone()
  }
}

/** Pieces of the live load inside the bed well right now. */
function _haulAboard () {
  const bed = DEFAULT_VEHICLE_MODEL.bed
  if (!_haul || !bed) return 0
  physicsEngine.getTransform(vehicleChassis, _haulV, _haulQ)
  _haulQ.invert()
  const cp = _haulV.clone(), p = new THREE.Vector3(), q = new THREE.Quaternion()
  let n = 0
  for (const h of _haul.handles) {
    physicsEngine.getTransform(h, p, q)
    if (inBedWell(p.sub(cp).applyQuaternion(_haulQ), bed)) n++
  }
  return n
}

function _haulClear () {
  if (_haul) debrisSystem.remove(_haul.handles)
  _haul = null
}

// The drop zone, painted on the pad (owner, 2026-10-05): a box OUTLINE a little wider than the bed so
// it can be eyeballed while pulling up, BED written inside, and an arrow on the approach side
// pointing in — the direction you back in from. The yard is laid out for reversing in from the +X
// mouth (ASSET-36: the vendor's own pickup holds the far end), so the arrow sits on +X pointing
// −X and BED reads upright to a driver looking back over the tailgate. One white canvas texture,
// tinted by the material: orange, green while your bed is over the zone.
const DROP_MARK_PAD = 0.3     // m the outline stands off the bed-sized zone on every side
const DROP_ARROW_LEN = 1.7    // m of pad the arrow takes, beyond the outline
const _DROP_PX = 200          // canvas px per metre
function _dropMarkTexture (lx, lz) {          // lx, lz: outline size in metres (along X, along Z)
  const W = Math.round((lx + DROP_ARROW_LEN) * _DROP_PX), H = Math.round(lz * _DROP_PX)
  const bw = Math.round(lx * _DROP_PX), line = 0.12 * _DROP_PX
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const g = cv.getContext('2d')
  g.strokeStyle = g.fillStyle = '#fff'
  // Canvas left = model −X (the box), right = +X (the arrow); canvas up = model −Z.
  g.lineWidth = line
  g.strokeRect(line / 2, line / 2, bw - line, H - line)
  g.save()
  g.translate(bw / 2, H / 2)
  g.rotate(-Math.PI / 2)                      // letters' top toward −X, the way you are backing
  g.font = `bold ${Math.round(0.55 * _DROP_PX)}px sans-serif`
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText('BED', 0, 0)
  g.restore()
  const ax0 = bw + 0.15 * _DROP_PX, ax1 = W - 0.1 * _DROP_PX, cy = H / 2
  const head = 0.6 * _DROP_PX, half = 0.45 * _DROP_PX, shaft = 0.12 * _DROP_PX
  g.beginPath()                               // pointing LEFT, into the box
  g.moveTo(ax0, cy); g.lineTo(ax0 + head, cy - half); g.lineTo(ax0 + head, cy - shaft)
  g.lineTo(ax1, cy - shaft); g.lineTo(ax1, cy + shaft); g.lineTo(ax0 + head, cy + shaft)
  g.lineTo(ax0 + head, cy + half); g.closePath(); g.fill()
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}
const _dropMat = (c, map) => new THREE.MeshBasicMaterial({ color: c, map, transparent: true, opacity: 0.85,
  depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
let _dropMatIdle = null, _dropMatOver = null
const _dropMarks = new Map()   // poi id → { q, mesh }

function _addDropMark (q) {
  const z = dropZoneWorld(q)
  const lx = 2 * (z.halfX + DROP_MARK_PAD), lz = 2 * (z.halfZ + DROP_MARK_PAD)
  if (!_dropMatIdle) {   // every drop zone is the same size today: one texture, two tints
    const tex = _dropMarkTexture(lx, lz)
    _dropMatIdle = _dropMat(0xff7a18, tex); _dropMatOver = _dropMat(0x3ddc6b, tex)
  }
  // Plane in the marker frame: −lx/2 .. lx/2 + arrow along X, centred on the zone.
  const geo = new THREE.PlaneGeometry(lx + DROP_ARROW_LEN, lz).rotateX(-Math.PI / 2).translate(DROP_ARROW_LEN / 2, 0, 0)
  const mesh = new THREE.Mesh(geo, _dropMatIdle)
  mesh.position.set(z.x, z.y + 0.03, z.z)
  mesh.rotation.y = z.yaw
  mesh.renderOrder = 5
  _poiGroup.add(mesh)
  _dropMarks.set(q.id, { q, mesh })
}

/** Near-field like the rings; hidden on any other job, kept lit while its own load is dropping. */
function _updateDropMarks (onMission) {
  const vp = vehicleState.position, loadingAt = _haulPoi()?.id
  for (const [id, { q, mesh }] of _dropMarks) {
    const near = Math.hypot(mesh.position.x - vp.x, mesh.position.z - vp.z) <= POI_RING_SHOW_R
    mesh.visible = near && (!onMission || id === loadingAt)
    mesh.material = _bedOverDrop(q) ? _dropMatOver : _dropMatIdle
  }
}

// ── FEAT-47: the story-mode day clock ──────────────────────────────────────────────────────
// Story mode only: started when the region goes live, stopped on exit (see the story deps below),
// and a no-op every frame in between in free roam. Its one output today is the sky hour — pushed on
// a quantized ladder because each push re-bakes the sky cubemap and the prop impostor atlas
// (skySystem.onLookApplied, below). DAY_PARAMS lives in day.js, out of RANGER_PARAMS, for the
// same reason POI_PARAMS does.
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
  // getRegion: the per-region payout multiplier's index (FEAT-53, owner 2026-08-17). Pinned to 1
  // because multi-region progression is FEAT-28 / SM-4 and does not exist yet — story.js builds
  // exactly ONE bounded region. When SM-4 lands, this is the single line that has to change.
  getRegion: () => 1,
})

// FEAT-50: the Emergency gas can — 2 gal straight into the tank, any time there is room for it. A
// full tank refuses (returns false), so the can is kept rather than wasted. A dry engine is not
// restarted for you: the gas only makes the key work again (ignition.js catchTime).
let _sputtersHeard = 0   // fuel.sputters already voiced (a fresh tank resets the count, hence !== above)
function _pourGasCan () {
  const f = vehicleState.fuel, space = RANGER_PARAMS.fuelTankGal - f.gal
  if (space < 0.05) return false
  f.gal += Math.min(RANGER_PARAMS.emergencyGasGal, space)
  f.dry = false
  playNozzle(); setPumpFlow(true); setTimeout(() => setPumpFlow(false), 1200)
}

// ── FEAT-122: the inventory ────────────────────────────────────────────────────────────────
// One grant path (rewards now; the shop and finds later). Stowed kit is real load: every change
// pushes its mass onto the chassis. start() empties it when the region goes live (story deps).
const inventorySystem = new InventorySystem({
  slotCap: () => RANGER_PARAMS.inventorySlots,
  onMassChange: (kg) => { RANGER_PARAMS.stowedKg = kg; syncChassisMass(physicsEngine, vehicleChassis, RANGER_PARAMS) },
  onChange: () => inventoryScreen.render(),
  effects: { coffee: () => daySystem.drinkCoffee(), gas: _pourGasCan },
})
// Parked only, like V; a POI that owns the brake here blocks it the same way (_updateParkTriggers).
const inventoryScreen = new InventoryScreen(inventorySystem, vehicleState, {
  isSuppressed: () => menuStage.isActive(),
  isBlocked: () => damageScreen.blocked,
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
      // in their head. `scored.pay` is banked money — the fare is not in it, because that depends
      // on when you finish and the route can still take it back.
      _showThrowReadout(`<span style="color:#7ed957">${scored.dist.toFixed(2)} m`
        + ` &nbsp;·&nbsp; +$${formatMoney(scored.pay)}</span>`)
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
// IN STORY MODE, PAPERS ONLY FLY ON A ROUTE (owner, 2026-09-29). Off a route the throw used to
// fall through to the free-roam practice path — scored against the nearest customer, with the
// distance-and-percentage read-out — so a finished round left the player still throwing and still
// being told how accurate they were. Free roam keeps the practice throw (it is how the target
// circles and the ballistics were proved to agree); debris throws are a physics test and stay.
function _canThrow () {
  const throwingPaper = (RANGER_PARAMS.throwProjectile ?? 'paper') === 'paper'
  return !throwingPaper || !storySystem.isActive() || paperRouteSystem.isRunning()
}
document.addEventListener('keydown', e => {
  if (e.key !== 'f' && e.key !== 'F') return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  // Not while the world is still building (storySystem is declared after the cold-spawn await, so
  // _canThrow would throw on it) and not behind the menu/loading stage.
  if (!_worldInit || _simHeld) return
  if (getCameraMode() !== 'chase') return      // hood and freecam own their own look
  if (!_canThrow()) return                     // no reticle either: nothing to aim with
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
  // The route ended while F was held (the last paper landed): drop the aim, throw nothing.
  if (!_canThrow()) { setAimMode(false); return }
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

// Which system owns the result card currently on screen — set by whichever card last rendered in
// its 'done' state. The felt/export buttons are shared DOM, so without this they would always ask
// the POI mission system and a finished paper round would silently export the previous job.
// Declared up here because BOTH card renderers assign it, and they live above the handler.
let _exportSource = null

/**
 * Show the ONE calibration form on whichever result card is up, MOVING the node rather than
 * duplicating it (FEAT-30; paper route added 2026-08-17).
 *
 * The bug this fixes, because it is invisible from the code that had it: `#mp-export-row` is a
 * child of `#mission-panel`, and `#paper-panel` is a SIBLING of that, not a face of it. So setting
 * the row's own `display` while the paper card is up did exactly nothing — its parent was hidden.
 * A finished round showed earnings and a continue button and no form at all.
 *
 * Moving the node keeps one form, one set of inputs and one set of click listeners (listeners
 * survive appendChild), which is what stops the two mission types drifting into two calibration
 * forms that ask subtly different questions.
 */
// NOTE, because it cost a shipped bug: these two are MODULE-scope helpers and the card renderers'
// `show()` is NOT — every `show` in this file is a `const` local to one render function. An earlier
// cut of these called `show(row, …)` and threw a ReferenceError the instant a round finished, which
// aborted _renderPaperUI midway: the body had already been written, so the card LOOKED fine while
// the form never mounted and the buttons kept the previous render's labels. The display write is
// therefore inline here, with no dependency on anything a renderer happens to have in scope.
// (test/paper-route.mjs pins that these helpers never call `show(`.)
function unmountExportRow (panelId) {
  const row = document.getElementById('mp-export-row')
  // Ownership-guarded on purpose. Both card renderers run on their own schedules, so an
  // unconditional hide here lets the IDLE paper renderer tear the form off a live POI result card
  // (and vice versa). Only the panel currently holding the node may hide it.
  if (row && row.parentElement?.id === panelId) row.style.display = 'none'
}

function mountExportRow (panelId, beforeId) {
  const row = document.getElementById('mp-export-row')
  const panel = document.getElementById(panelId)
  if (!row || !panel) return
  const before = beforeId ? document.getElementById(beforeId) : null
  if (row.parentElement !== panel || (before && row.nextElementSibling !== before)) {
    panel.insertBefore(row, before)
  }
  row.style.display = 'block'
}

// ── Story mode (beta): par-graded missions ───────────────────────────────────
// The testing harness for the par economy — see src/mission.js and .planning/story-mode/DESIGN.md.
// Entered from the pause menu so a visitor is never dropped into an unfinished mode by default.
// getRoad is a GETTER: roadSystem is swapped on seed regen (see the regen path above).
const _misFwd = new THREE.Vector3()
// Car telemetry for the mission systems. Richer than an arrival check needs: the run export
// records a driven trace, and throttle / brake / steer are what make it useful for fitting
// anything later. ONE reader for the POI job and the paper route, so the two mission types
// cannot drift apart and can share one calibration corpus (FEAT-30).
function _carTelemetry () {
  _misFwd.set(0, 0, -1).applyQuaternion(vehicleState.quaternion)
  return {
    x: vehicleState.position.x, y: vehicleState.position.y, z: vehicleState.position.z,
    speed: Math.hypot(vehicleState.velocity.x, vehicleState.velocity.z),
    heading: Math.atan2(_misFwd.x, _misFwd.z),
    throttle: vehicleState.throttle, brake: vehicleState.brake, steer: vehicleState.steerAngle,
  }
}
missionSystem = new MissionSystem({
  // Missions plan on the PLAY network — the frozen region band story mode built behind its own
  // loading screen (see the header note in mission.js). It is real and CULLED, so a mission can
  // only ever propose roads that actually exist, and there is nothing left to pre-warm.
  getRoad:  () => roadSystem,
  getSeed:  () => worldSeed,
  getCar:   _carTelemetry,
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
  // FEAT-67: a settled board job — ANY letter, D included — completes its offer, and the slot then
  // waits out that offer's original expiry before re-rolling.
  onSettle: (result, mission) => {
    // FEAT-88: a haul pays the ordinary line × the share of the load still in the bed. Counted
    // here, at arrival, then the load is gone — the economy only ever sees a scaled payMult, so
    // base + tip still sum to the total and the result card stays honest.
    if (mission?.bundles) {
      result.loaded = mission.bundles
      result.aboard = _haul?.mission === mission ? _haulAboard() : 0
      // The letter is the run's OVERALL rank: clock and load blended (par.js haulGrade).
      result.letter = haulGrade(result.ratio, result.aboard / mission.bundles,
                                mission.terms?.thresholds ?? RANK_THRESHOLDS_DEFAULT).letter
      mission = { ...mission, payMult: mission.payMult * result.aboard / mission.bundles }
      _haulClear()
    }
    // FEAT-97: a fragile job is paid and lettered on the condition it arrived in (economy.js
    // splitFragilePayout, par.js fragileGrade). Read here, before the load comes off.
    if (mission?.fragile) {
      result.health = _freight?.mission === mission && _freight.health ? _freight.health.health : 0
      result.letter = fragileGrade(result.health)
    }
    const s = economySystem.settle(result, mission)
    // FEAT-122: the earned bonus goes in the truck — or waits on the swap prompt if it's full.
    if (s.award) s.award.stowed = inventorySystem.grant(s.award.rewardId)
    if (mission?.offerId) offerBoard?.complete(mission.offerId, daySystem.clockH())
    return s
  },
  onChange: () => _renderMissionUI(),
  // FEAT-113: the mission clock is world time — a sleep or a time skip spends the tip, the camp
  // pause holds it — and a board job's deadline is read on the same clock.
  getClockH: () => daySystem.clockH(),
})

// ── FEAT-61: the paper route ───────────────────────────────────────────────────────────────
// Larry's route. A SIBLING of missionSystem — the two can never run at once (each one's park
// trigger and prompt yields to the other's active state), but neither is a mode inside the other.
//
// It plans on the same network missionSystem does — the play instance, frozen at the region radius
// behind story mode's loading screen. Nothing here streams a network of its own.
const paperRouteSystem = new PaperRouteSystem({
  getRoad:   () => roadSystem,
  getPois:   () => poiSystem,
  getRegion: () => storySystem?.region() ?? null,
  getCar:    _carTelemetry,
  getSeed:   () => worldSeed,
  getTerms:  () => economySystem.terms(),
  getTargetR: () => POI_PARAMS.poiHouseTargetR,
  // The ONE money path (FEAT-53). This mission prices itself on its own axis and hands over a
  // finished number; the wallet, the deeds and the mission count still accrue in economy.js.
  onSettle:  (payout, letter) => {
    const s = economySystem.settleFlat(payout, letter)
    const id = paperRouteSystem.offer?.id
    if (id) offerBoard?.complete(id, daySystem.clockH())   // FEAT-67: Larry's slot then empties
    return s
  },
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
  getClockH: () => daySystem.clockH(),   // FEAT-113: world-time elapsed + Larry's deadline
  onChange:  () => _renderPaperUI(),
})
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
    // FEAT-102: guideRoute(), not the mission — a fetch is guided one leg at a time.
    return (s === 'countdown' || s === 'staging' || s === 'running') ? missionSystem.guideRoute() : null
  },
  getCar: () => vehicleState.position,
  // Read at BAKE time only (once per mission, plus while the bake is still partial): the design
  // profile the carve, the ribbon mesh and the physics all read. Without it the overlay bakes the
  // par oracle's elevation instead, which is a different pipeline stage and disagrees by up to
  // 27 m — see gps.js bakeRoute's ELEVATION SOURCE note.
  getRoad: () => roadSystem,
})

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
 * FEAT-67: the board view map2d reads (see Map2D's getBoard doc). One object for the session; every
 * method reads the live board, clock and terms at call time.
 */
const _boardView = {
  status (poiId) {
    const now = daySystem.clockH()
    // FEAT-101: a budget giver with nothing on offer right now is still a giver — a grey diamond.
    if (!offerBoard.isGiver(poiId)) return { source: false, family: null, nextText: null }
    // Per frame per diamond, so this must not PLAN: it drops only offers already known to have no
    // route (planDistinct memoises null on the offer). The hover card and the prompt do the full
    // _takeableOffers check, so a dead offer greys its diamond the first time it is looked at.
    const live = offerBoard.offers(poiId, now).filter(o => o.route !== null)
    const next = offerBoard.nextTurnoverH(poiId, now)
    return {
      source: true,
      family: live.length ? offerBoard.spec(live[0])?.family ?? null : null,
      nextText: next != null ? formatGameDuration(next - now) : null,
    }
  },
  view (poiId, idx) {
    const now = daySystem.clockH()
    const offers = _takeableOffers(poiId, now)
    const next = offerBoard.nextTurnoverH(poiId, now)
    const nextText = next != null ? formatGameDuration(next - now) : null
    const n = offers.length
    if (!n) return { count: 0, idx: 0, card: null, poly: null, nextText }
    const i = ((idx % n) + n) % n
    const o = offers[i]
    const papers = offerBoard.spec(o)?.family === 'papers'
    const route = papers ? _larryRoute(o) : _planOffer(o)
    const card = offerBoard.card(o, {
      nowH: now, payTier: economySystem.terms().payTier,
      route: route ? { par: route.par, distance: route.distance, endPoiId: route.endPoiId ?? null, placeName: route.placeName } : null,
      customers: papers ? route?.customers?.length ?? null : null,
      verdict: _offerVerdict(o),
    })
    const poly = route?.poly ?? null
    return { count: n, idx: i, card, poly,
             // FEAT-102: a fetch's preview points at its PICKUP — its own end is back where you stand.
             start: route?.start ?? poly?.[0] ?? null, end: route?.legs?.[0].end ?? route?.end ?? poly?.[poly.length - 1] ?? null,
             nextText }
  },
}

// FEAT-112: the truck as configured NOW. Stock until FEAT-115's bed parts exist — then this folds
// the installed upgrades (truckConfig's second argument) and has to be re-read when they change.
const TRUCK = truckConfig(DEFAULT_VEHICLE_MODEL)
const _HAUL_PIECE = PROP_MODELS.firewoodBundleA.collision.size   // one bundle; the pile is FEAT-114's
/**
 * FEAT-112: this offer's load verdict on the truck as configured, or null for cab cargo (courier,
 * papers — always fits). Handed to offerBoard.card(); never to the roll (SM-INV-12).
 */
function _offerVerdict (offer) {
  const sp = offerBoard.spec(offer)
  // FEAT-122: stowed kit counts toward the same payload as the cargo (owner, 2026-10-16).
  const massKg = (sp?.massKg ?? 0) + inventorySystem.stowedKg()
  if (sp?.bundles) return loadVerdict(TRUCK, { massKg, size: _HAUL_PIECE, form: 'loose' })
  const row = sp?.load ? FREIGHT[sp.load] : null
  return row ? loadVerdict(TRUCK, { massKg, size: PROP_MODELS[row.model].collision.size, form: row.form }) : null
}

/**
 * FEAT-67: Larry's tour for his hover card, or null while it is still planning. Starts (or restarts,
 * when the offer or the paper tier changed) the resumable job; _pumpLarryTour advances it.
 */
function _larryRoute (offer) {
  const tier = runPaper.tier
  const j = _larryTour
  if (j && j.offerId === offer.id && j.tier === tier) return j.done ? j.route : null
  _dropLarryTour()
  const larry = poiSystem.list().find(q => q.id === offer.poiId)
  if (!larry || !roadSystem) return null
  _larryTour = {
    offerId: offer.id, tier, done: false, route: null,
    it: planTourJob(roadSystem, larry, poiSystem.customers(tier), customersForTier(),
                    storySystem.region(), 100),
  }
  return null
}

/** Advance Larry's tour job by up to `budgetMs`. Each next() is well under half a millisecond. */
function _pumpLarryTour (budgetMs) {
  const j = _larryTour
  if (!j || j.done) return
  const t0 = performance.now()
  try {
    while (performance.now() - t0 < budgetMs) {
      const r = j.it.next()
      if (r.done) { j.done = true; j.route = r.value ?? null; j.it = null; break }
    }
  } catch (e) {
    console.warn('[board] Larry tour planning failed', e)
    j.done = true; j.route = null; j.it = null
  }
}

/**
 * Abandon Larry's tour job. return() runs the generator's `finally`, which hands its Held-Karp table
 * lease back — an abandoned job that skipped it would strand the lease (see planTourJob).
 */
function _dropLarryTour () {
  try { _larryTour?.it?.return() } catch (e) { /* already closed */ }
  _larryTour = null
}

/**
 * The offers at a POI the player can actually TAKE: live on the board AND plannable. The board rolls
 * offers without knowing the network, so it can post one with no route — seed 1813164377's tackle
 * shop fetches from the one general store, 8 km and 13 hops away, past the planner's 5.2 km / 9-hop
 * leg. Every reader (the park prompt, the brake, the map card and diamond, the parked panel's
 * refresh) goes through here, so none of them advertises an offer that opens nothing. Larry's offer
 * passes as-is: his tour plans asynchronously and is the paper route's to judge.
 */
function _takeableOffers (poiId, now) {
  if (!offerBoard) return []
  return offerBoard.offers(poiId, now).filter(o => offerBoard.spec(o)?.family === 'papers' || _planOffer(o))
}

/**
 * FEAT-67: price one board offer — the offer→mission callback the parked panel and the map's hover
 * card share. Memoised ON THE OFFER (offerBoard.clearRoutes drops it with the network), so hovering
 * back and forth or cycling the panel plans each offer once. Deterministic: the planner draws from
 * the offer's own seeded stream. Papers return null — Larry's tour is the paper route's to plan.
 */
function _planOffer (offer) {
  if (!offerBoard || !offer) return null
  const sp = offerBoard.spec(offer)
  if (sp?.family === 'papers') return null
  // planDistinct resolves "no two offers at a POI are the same job" oldest-first and memoises on the
  // offer; this callback is the planner for ONE offer, told which destination POIs to avoid.
  return offerBoard.planDistinct(offer, (o, exclude) => {
    const s = offerBoard.spec(o)
    const poi = poiSystem.list().find(q => q.id === o.poiId)
    if (!s || !poi || s.family === 'papers') return null
    const dest = offerBoard.destWish(o, poiSystem.list(), exclude)
    const m = missionSystem.planOffer(poi, { rng: offerBoard.routeRng(o), dest })
    if (m) {
      // The contract's board-side terms ride on the mission: which offer it is (complete/cancel),
      // the bonus it carries, and its cash multiplier (a bonus offer pays BONUS_PAY_MULT of the line).
      m.offerId = o.id
      m.bonus = s.bonus
      m.payMult = s.payMult
      m.bundles = s.bundles   // FEAT-88: a haul load's piece count — null for every other family
      if (s.bundles) m.par *= HAUL_PAR_SLACK   // the load slows the truck; payMult already ÷ the same
      // FEAT-96: a freight load is strapped in at accept. Its par grows with its mass and pay rides
      // par, NOT divided back out — a heavier load pays more (data/offers.js FREIGHT_PAR_SLACK_PER_KG).
      m.load = s.load
      m.cargoKg = s.load ? s.massKg : null
      m.fragile = s.fragile   // FEAT-97: tolerance + sound, or null
      if (s.load) {
        m.par *= 1 + FREIGHT_PAR_SLACK_PER_KG * s.massKg
        // Freight grades looser and tips less than haul (owner, 2026-10-11) — data/offers.js. Not
        // fragile: its tip and letter read the cargo's condition, never the clock.
        if (!s.fragile) {
          m.timeSlack = FREIGHT_TIME_SLACK
          m.tipMult = FREIGHT_TIP_MULT
        }
      }
    }
    return m
  })
}

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
  // jobsOnly (FEAT-60): only a job source answers the park trigger. Without this the roster's
  // other six types would each win the trigger and then have nothing to say — and mom's house,
  // which outranks her own front door in the precedence below, would offer freight instead of bed.
  const q = poiSystem.nearest(vehicleState.position.x, vehicleState.position.z,
                             POI_PARAMS.poiInteractR, true)
  // FEAT-88: a haul giver answers only with your BED over its drop zone — that is where the load
  // lands, so it is where you park to be offered one.
  if (q && q.drop && !_bedOverDrop(q)) return null
  // ASSET-74: a POI with a PARK box (the general store's lot) answers only with the truck inside it.
  // nearest()'s poiInteractR still finds it: the box's far corner is 8.8 m from the pad centre.
  const vp = vehicleState.position
  return q && q.park && !overDropZone(q, vp.x, vp.z, PARK_SLACK, q.park) ? null : q
}

// Rising edge of the parking-brake latch (vehicleState.parked), sampled where the prompt is polled.
// Starts TRUE because a spawn/teleport seats the truck already latched — an offer must never open
// from a latch the player did not pull. The latch is sticky (a tap sets it and it stays), so polling
// at the prompt's ~10 Hz cadence cannot miss a real pull.
let _prevParkedForPoi = true

// FEAT-102: the fetch prompts. "park to acquire mission item" in reach of the pickup; after the
// latch, "get back to …!" for FETCH_HOME_MSG_S. Returns true when it owns the prompt this poll.
let _fetchHomeMsg = null, _fetchHomeUntil = 0
const FETCH_HOME_MSG_S = 4
function _updateFetchPrompt (poiEl, pulled) {
  const now = performance.now()
  const pickId = missionSystem?.pickupPoiId()
  if (pickId) {
    const pq = poiSystem.list().find(q => q.id === pickId)
    const vp = vehicleState.position
    // Same reach as the giver trigger: the interaction radius, and — at a POI with a PARK box (the
    // general store's lot, ASSET-74) — inside the box, whose curtain is the halo you park in.
    const near = pq && Math.hypot(pq.x - vp.x, pq.z - vp.z) <= POI_PARAMS.poiInteractR
      && (!pq.park || overDropZone(pq, vp.x, vp.z, PARK_SLACK, pq.park))
    if (near && pulled && missionSystem.acquire()) {
      _fetchHomeMsg = `get back to ${_fetchHomeLabel(missionSystem.mission)}!`
      _fetchHomeUntil = now + FETCH_HOME_MSG_S * 1000
    } else if (near) {
      if (poiEl) { poiEl.style.display = 'block'; poiEl.innerHTML = parkPrompt('park to acquire mission item') }
      return true
    }
  }
  if (_fetchHomeMsg && now < _fetchHomeUntil && missionSystem?.state === 'running') {
    if (poiEl) { poiEl.style.display = 'block'; poiEl.textContent = _fetchHomeMsg }
    return true
  }
  _fetchHomeMsg = null
  if (!pickId) return false
  // On the outbound leg away from the pickup: nothing to say, and nothing else may answer the brake.
  if (poiEl) poiEl.style.display = 'none'
  return true
}

/** Who a fetch goes home to, as the prompt and the HUD say it. */
function _fetchHomeLabel (m) {
  const giver = poiSystem.list().find(q => q.id === m?.fromPoi)
  if (giver?.type === 'strandedMotorist') return 'the stranded motorist'
  return (giver && offerBoard?.placeLabel(giver.id)) || 'the giver'
}


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
//   • the CAMPFIRE — ASSET-24, lit by src/campfire.js (flames, coals, embers, a flickering point
//     light), standing at the pad centre once camp is made. It replaced the blue placeholder cube.
//     FEAT-66's other slots (shelter / over-fire / shade) are still empty — the default camp is
//     bedroll + fire, and there is no bedroll model yet.
// camp.js stays THREE-free (the story-layer isolation rule): it hands out a pad record and main.js
// is the only place that becomes geometry.
const _campGroup = new THREE.Group()
_campGroup.name = 'camp'
scene.add(_campGroup)
const campfire = new CampfireFx(_campGroup)
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
 * Camp is established: light the fire on the pad and put the camera on it. The camera seam is
 * camera.js's focus override (setCameraFocus) — the minimal one: it reuses the chase cam's existing
 * drag-orbit angles, so the player can still look around camp, and clearing it hands back to the
 * follow lerp with no snap. Freecam is untouched and still outranks it.
 */
function _enterCampScene (site) {
  const pad = site?.pad
  if (!pad) return
  // Seat on the REAL ground, not pad.y: the camp bench is carved flat at pad.y − roadClearanceMargin
  // (road.js _poiPadCarve), so pad.y floats 0.25 m. analyticHeight reads the live carve, and
  // setCampPads has already run by the time we get here. pad.y stays as the fallback.
  const gy = terrainSystem?.analyticHeight(pad.x, pad.z)
  const y = Number.isFinite(gy) ? gy : pad.y
  campfire.show(pad.x, y, pad.z)
  setCameraFocus({ x: pad.x, y: y + 1, z: pad.z })
}

/** Break camp / leave the region: fire out, camera back on the truck. */
function _exitCampScene () {
  campfire.hide()
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
// "Looking for a campsite" — toggled by the tent icon or Z (owner, 2026-07-31: the full
// bar-and-copy prompt was intrusive when just driving through a zone; 2026-10-16: the bottom chip
// became the tent in the top-right icon column). Not looking, the tent is the whole UI AND the
// siting ray never runs AND the brake latch will not open the camp dialogue — looking is how the
// player says "I'm shopping for ground now". Session-sticky on purpose: it stays on from zone to
// zone until they turn it off.
let _campSeek = false

function _campPromptState () {
  if (!storySystem.isActive() || storySystem.isEntering()) return null
  // FEAT-113 (owner, 2026-10-15): a job IN HAND may camp — the night spends world time against its
  // tip and deadline. Only the panels (an offer up, a result card) still refuse. The truck stays
  // parked where it is; nothing about camping moves it or its bed.
  if (missionSystem && missionSystem.state !== 'idle' && !missionSystem.isOnJob()) return null
  if (paperRouteSystem.isActive() && !paperRouteSystem.isCarrying()) return null
  if (_campUi || _campBusy) return null
  if (Math.hypot(vehicleState.velocity.x, vehicleState.velocity.z) * 3.6 > CAMP_PROMPT_KPH) return null
  if (!campSystem.zoneAt(vehicleState.position.x, vehicleState.position.z)) return null
  // Collapsed: the zone test above (a point-in-disc scan) is ALL we pay — no ray, no grading.
  if (!_campSeek) return { collapsed: true }
  const g = campSystem.evaluate(vehicleState.position.x, vehicleState.position.z)
  return g.inZone ? g : null
}

// ── FEAT-50: the pump visit ───────────────────────────────────────────────────────────────────
// Pull alongside a pump island into one of its two zones (prop-models.js `pumpZones`), pull the
// handbrake: the pump opens. HOLD F to pump — the whole time — and the handbrake down pays what is on
// the counter (owner, 2026-10-16). FuelStop (src/fuel-stop.js) is the machine; this owns where you
// are, the keys, the DOM and the sound. Stepped on the fixed physics step, so a fill is 10 s of real
// driving time and pauses when the game does.
const fuelStop = new FuelStop()
let _fHeld = false
window.addEventListener('keydown', e => { if (!e.repeat && e.key.toLowerCase() === 'f') _fHeld = true })
window.addEventListener('keyup', e => { if (e.key.toLowerCase() === 'f') _fHeld = false })
window.addEventListener('blur', () => { _fHeld = false })
let _pumpReceiptT = 0     // s left on the settled receipt's hold
let _pumpBounceT = 0      // s left on the counters' settle-bounce

/** The pump island whose zone the truck is in (story mode, no dialogue up), or null. */
function _pumpInReach () {
  if (!storySystem.isActive() || storySystem.isEntering()) return null
  if (_campUi || _campBusy) return null
  const vp = vehicleState.position
  for (const q of poiSystem.list()) {
    if (!q.pumpZones || q.hidden || Math.hypot(q.x - vp.x, q.z - vp.z) > 20) continue
    if (q.pumpZones.some(z => overDropZone(q, vp.x, vp.z, PARK_SLACK, z))) return q
  }
  return null
}

/** One physics step of an open pump. Handbrake down (or leaving story mode) settles the sale. */
function _stepFuelStop (dt) {
  if (!fuelStop.isOpen) return
  if (!vehicleState.parked || !storySystem.isActive()) {
    const { sale } = fuelStop.settle()
    setPumpFlow(false)
    if (sale > 0) { economySystem.spend(sale); playRegister() } else playNozzle()
    _pumpReceiptT = sale > 0 ? 2.5 : 0
    return
  }
  fuelStop.step(dt, _fHeld, vehicleState.fuel, RANGER_PARAMS, economySystem.money())
  switch (fuelStop.event) {
    case 'start':  setPumpFlow(true); break
    case 'stop':   setPumpFlow(false); _pumpBounceT = 0.3; break
    case 'full':   setPumpFlow(false); playShutoff(); _pumpBounceT = 0.3; break
    case 'gallon': playGallonBell(); break
  }
}

// The counters are MECHANICAL DRUMS, odometer-style: each drum is a 0–9 strip (plus a trailing 0
// for the wrap) slid by translateY. The lowest drum turns continuously with the counter; every drum
// above it holds its digit and only rolls over during the last tenth of the drum below it — the
// carry a real register makes. So 4.99 → 5.00 is three drums turning together, not a jump.
const _pumpEl = {}
function _pumpDrums (id, n, dp) {
  const el = document.getElementById(id)
  if (!el || el.childElementCount) return
  for (let i = 0; i < n; i++) {
    if (i === n - dp) el.insertAdjacentHTML('beforeend', '<span class="pd-dot">.</span>')
    el.insertAdjacentHTML('beforeend', '<span class="pd-drum"><span class="pd-strip">' + '0123456789'.split('').concat('0').join('<br>') + '</span></span>')
  }
}
function _setDrums (id, value, dp) {
  const strips = document.getElementById(id)?.querySelectorAll('.pd-strip')
  if (!strips) return
  const x = Math.max(0, value) * 10 ** dp           // in units of the lowest drum
  const n = strips.length
  let below = x % 10                                 // the lowest drum's continuous position
  for (let i = n - 1; i >= 0; i--) {
    const place = 10 ** (n - 1 - i)
    let pos
    if (i === n - 1) pos = below
    else {
      const whole = Math.floor(x / place) % 10
      pos = whole + Math.max(0, below - 9)           // roll only while the drum below goes 9 → 0
      below = pos
    }
    strips[i].style.transform = `translateY(${-pos * 1.15}em)`
  }
}
/** Per frame: the pump face, its hint line, and the receipt's hold + fade. */
function _renderPumpDisplay (dt) {
  const el = _pumpEl.root ??= document.getElementById('pump-display')
  if (!el) return
  _pumpReceiptT = Math.max(0, _pumpReceiptT - dt)
  _pumpBounceT = Math.max(0, _pumpBounceT - dt)
  const show = fuelStop.isOpen || _pumpReceiptT > 0
  el.classList.toggle('on', show)
  if (!show) return
  _pumpDrums('pd-sale', 4, 2); _pumpDrums('pd-gal', 5, 3)
  const r = fuelStop.isOpen ? { gal: fuelStop.gal, sale: fuelStop.sale } : fuelStop.receipt
  _setDrums('pd-sale', r.sale, 2)
  _setDrums('pd-gal', r.gal, 3)
  el.classList.toggle('flowing', fuelStop.state === 'pumping')
  el.classList.toggle('bounce', _pumpBounceT > 0)
  el.classList.toggle('receipt', !fuelStop.isOpen)
  document.getElementById('pd-price').textContent = '$' + fuelStop.price.toFixed(2)
  const tank = vehicleState.fuel, full = tank.gal >= RANGER_PARAMS.fuelTankGal - 1e-6
  const broke = fuelStop.isOpen && fuelStop.price > 0 && economySystem.money() - fuelStop.sale < 0.005
  document.getElementById('pd-hint').innerHTML = !fuelStop.isOpen ? 'thank you — drive safe'
    : full ? `tank full · release the handbrake to pay`
    : broke ? `that's all you can afford · release the handbrake to pay`
    : `hold ${keycap('F')} to pump · release the handbrake to pay`
}

// ── FEAT-50: running dry — the Recovery chip ─────────────────────────────────────────────────
// Nothing pops up when the engine dies: the chip appears in the right-hand icon column only once
// you are dry AND parked (owner, 2026-10-16), the way the other context actions wait for the brake.
// Today it holds one option — a tow to the nearest place that sells fuel — and later tows (anytime,
// to the service station) are further rows in the same card. Can't afford it and you are out of
// fuel: the run is over ("you broke down", SM-INV-1).
let _recoveryOpen = false

/** The nearest POI that sells fuel (a pump island, until ASSET-13's station has zones). */
function _nearestFuelSeller () {
  const vp = vehicleState.position
  let best = null, bestD = Infinity
  for (const q of poiSystem.list()) {
    if (!q.pumpZones || q.hidden) continue
    const d = Math.hypot(q.x - vp.x, q.z - vp.z)
    if (d < bestD) { bestD = d; best = q }
  }
  return best && { q: best, km: bestD / 1000 }
}

function _towQuote () {
  const dest = _nearestFuelSeller()
  if (!dest) return null
  return { ...dest, price: towPrice(dest.km, economySystem.tierNow(), ECONOMY_PARAMS), hours: towHours(dest.km, ECONOMY_PARAMS) }
}

function _towToFuel () {
  const t = _towQuote()
  if (!t || !economySystem.spend(t.price)) return
  _recoveryOpen = false
  // Into the road-side pump zone, nose along the island: model +X in world is (cos yaw, −sin yaw)
  // and the truck's forward is (−sin h, −cos h), so h = yaw − π/2 lays the truck alongside.
  // The seat is teleportToGround's minus its side effects: no "spawn point set" toast, and the R
  // spawn is put back afterwards — a tow is a trip, not a new home.
  const z = dropZoneWorld(t.q, t.q.pumpZones[0])
  const prev = _spawnOverride
  _spawnOverride = { align: true, x: z.x, z: z.z, heading: z.yaw - Math.PI / 2, drop: 0.3 }
  storySystem?.notifyTeleport()
  daySystem.advanceMinutes(t.hours * 60)
  void _reseatTruckAtSpawn().then(() => {
    _spawnOverride = prev
    // The truck lands parked; clearing the edge detector lets the next poll open the pump at once.
    _prevParkedForPoi = false
  })
}

function _updateRecovery () {
  const row = document.getElementById('recovery-row')
  if (!row) return
  const show = storySystem.isActive() && !storySystem.isEntering() && !!vehicleState.fuel?.dry
    && vehicleState.fuel.gal <= 0 && !!vehicleState.parked && !fuelStop.isOpen
  row.style.display = show ? 'flex' : 'none'
  if (!show) { _recoveryOpen = false; return }
  document.getElementById('recovery-icon')?.classList.toggle('on', _recoveryOpen)
  document.getElementById('recovery-icon')?.classList.add('ready')
  const card = document.getElementById('recovery-card')
  card.style.display = _recoveryOpen ? 'block' : 'none'
  if (!_recoveryOpen) return
  const t = _towQuote()
  const money = economySystem.money()
  const html = !t ? '<div class="rc-head">out of fuel</div><div class="rc-dim">no tow can reach you here</div>'
    : money + 1e-9 >= t.price
      ? `<div class="rc-head">out of fuel</div>
         <button class="rc-opt" id="rc-tow">tow to gas station — $${formatMoney(t.price)}</button>
         <div class="rc-dim">${t.km.toFixed(1)} km · ${formatGameDuration(t.hours)} · you have $${formatMoney(money)}</div>`
      : `<div class="rc-head">out of fuel</div>
         <div class="rc-dim">can't afford a tow — $${formatMoney(t.price)}, you have $${formatMoney(money)}</div>
         <button class="rc-opt rc-end" id="rc-end">end run — you broke down</button>`
  if (card.dataset.html !== html) {   // repaint only on change: the poll is 10 Hz and buttons must stay clickable
    card.dataset.html = html
    card.innerHTML = html
    document.getElementById('rc-tow')?.addEventListener('click', _towToFuel)
    document.getElementById('rc-end')?.addEventListener('click', _backToMenu)
  }
}
window.addEventListener('keydown', e => {
  if (e.repeat || e.key.toLowerCase() !== 'x') return
  if (document.getElementById('recovery-row')?.style.display === 'flex') { _recoveryOpen = !_recoveryOpen; _updateRecovery() }
})
document.getElementById('recovery-icon')?.addEventListener('click', () => { _recoveryOpen = !_recoveryOpen; _updateRecovery() })

/** Can the truck knock on mom's door from here? (Same gates, minus the zone and the grading.) */
function _atMomsHouse () {
  if (!storySystem.isActive() || storySystem.isEntering()) return false
  if (missionSystem && missionSystem.state !== 'idle' && !missionSystem.isOnJob()) return false   // FEAT-113: as _campPromptState
  if (paperRouteSystem.isActive() && !paperRouteSystem.isCarrying()) return false
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
  const campRow = document.getElementById('camp-row')
  const poi = _poiInReach()
  // A mission zone (a giver in reach, or its offer open) owns the brake: no other parking action —
  // the damage screen included — may answer it there (owner, 2026-10-16).
  damageScreen.blocked = !!poi || ['generating', 'offer'].includes(missionSystem?.state)
    || ['planning', 'offer'].includes(paperRouteSystem.state)
  const parked = !!vehicleState.parked
  const pulled = parked && !_prevParkedForPoi
  _prevParkedForPoi = parked

  // FEAT-102: a FETCH's pickup outranks everything below — while one is out, parking at the pickup
  // is the only thing the brake means there. The item is acquired the instant the brake latches
  // (owner, 2026-10-08), then the prompt sends you home for a few seconds.
  if (_updateFetchPrompt(poiEl, pulled)) {
    damageScreen.blocked ||= poiEl?.style.display === 'block'   // at the pickup: the brake is the fetch's
    if (campRow) campRow.style.display = 'none'
    return
  }

  // FEAT-50: a pump zone. The brake there opens the pump and nothing else — an open pump owns the
  // brake until it is released (which pays), so no other parking action can answer it.
  const pump = fuelStop.isOpen ? null : _pumpInReach()
  if (fuelStop.isOpen || pump) {
    damageScreen.blocked = true
    if (pump && pulled) {
      fuelStop.open(pump.id, RANGER_PARAMS.fuelPricePerGal)
      playNozzle()
    }
    if (poiEl) {
      poiEl.style.display = fuelStop.isOpen ? 'none' : 'block'
      if (!fuelStop.isOpen) poiEl.innerHTML = parkPrompt('park to use the pump')
    }
    if (campRow) campRow.style.display = 'none'
    return
  }

  if (poi && pulled) {
    // FEAT-61: Larry is the one giver whose offer is a different mission. Branching on the type
    // here (rather than teaching MissionSystem a second shape) is what keeps the two systems
    // siblings — each leaves 'idle' and each other's reach test then returns null.
    // FEAT-67: what is on offer is the BOARD's — live offers only. With nothing live the brake opens
    // nothing and the prompt says when the next offer turns up (the prompt shows it; see below).
    const offers = _takeableOffers(poi.id, daySystem.clockH())
    if (!offers.length) return
    if (poi.type === 'larrysHouse') paperRouteSystem.open(poi, offers[0])
    else missionSystem.enterFromPoi(poi, offers, _planOffer)
    if (poiEl) poiEl.style.display = 'none'
    if (campRow) campRow.style.display = 'none'
    return
  }

  const camp = _campPromptState()
  const seeking = camp && !camp.collapsed
  // Mom's door outranks an idle tent (a doorstep is a specific affordance, like a POI) but
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

  // Display. The POI prompt wins outright when both apply — see the precedence above. Mom's door is
  // a doorstep, so it borrows the POI prompt's slot at the bottom rather than the tent's card.
  if (poiEl) {
    poiEl.style.display = poi || moms ? 'block' : 'none'
    // Name what the brake will actually do. Larry hands out a route, not an errand, and a prompt
    // that says "mission" at the one marker that gives you the paper route is the same small lie as
    // a ring drawn wider than its trigger.
    if (poi) {
      // FEAT-67: an empty board says when it fills, rather than inviting a park that opens nothing.
      const now = daySystem.clockH()
      const live = _takeableOffers(poi.id, now).length
      const next = offerBoard?.nextTurnoverH(poi.id, now)
      // FEAT-90: every "park to …" line carries the blue P badge; the status line does not.
      poiEl.innerHTML = !live
        ? (next != null ? `no work here right now — new offer in ${formatGameDuration(next - now)}`
                        : 'no work here right now')
        : poi.type === 'larrysHouse' ? parkPrompt('park to take the paper route')
        : live > 1 ? parkPrompt(`park to see ${live} offers`) : parkPrompt('park to see the offer')
    } else if (moms) {
      poiEl.innerHTML = parkPrompt("park to sleep at mom's house")
    }
  }
  if (!campRow) return
  // The tent: wherever a camp could be looked for. Its card only while looking.
  const showCamp = !poi && !!camp && !_campUi
  campRow.style.display = showCamp ? 'flex' : 'none'
  // The world-space ring: only while the card is offering a spot that could actually be taken.
  // Once the dialogue is up the DIALOGUE owns the ring — the confirm face leaves it standing on the
  // site it is asking about — so this 10 Hz poll must not stamp it off underneath (showCamp is
  // false whenever _campUi is set).
  if (!_campUi) _updateCampMarker(showCamp && seeking && camp.withinTether && camp.flat ? camp : null)
  if (!showCamp) return
  document.getElementById('camp-icon')?.classList.toggle('on', seeking)
  document.getElementById('camp-prompt').style.display = seeking ? 'block' : 'none'
  if (!seeking) return
  _renderVibeBar(camp)
  // "not flat" now means the WHOLE siting ray failed the flatness gate — every candidate from the
  // road edge out to the tether — not merely that the verge beside the truck did.
  // cands 0 ⇒ every rung was rejected before grading — in practice because it crowded a road
  // (camp.js CAMP_ROAD_CLEAR_TOL_M: beside a junction or a spur there is no room for a bench).
  document.getElementById('camp-prompt-text').innerHTML =
      !camp.withinTether ? 'too far from the road'
    : camp.cands === 0   ? 'no room off the road'
    : !camp.flat         ? 'not flat'
    :                      parkPrompt('park to make camp')
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
  const ui = _campUi   // the dialogue this fade was started from
  const finish = () => {
    // The fade overlay lets clicks through, so Cancel (or leaving the region) can close the
    // dialogue mid-fade. The deferred action belongs to THAT dialogue: if it is gone, do nothing.
    try { if (_campUi === ui) during() } finally {
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
 * re-carve the terrain chunks the pad reaches, then release the covering prop chunks so the
 * scatter re-rolls against the finished ground — digging clears the site of trees via the pad
 * keep-out (poiPadBlocked); un-digging lets them come back.
 *
 * recarveInPlace, NOT rebuildAllChunksFromWorker: the heights have not changed, only the carve, and
 * pads never bump roadGeneration. The full rebuild this used to call is the seed-change path — it
 * disposed the WHOLE ring (and every terrain collider) and re-requested it from the Worker, so
 * breaking camp, which has no fade, blinked the visible world out under a parked truck.
 */
function _refreshGroundAround (pad) {
  if (roadSystem) terrainSystem?.recarveInPlace([roadSystem.padReachOf(pad)], { burst: false })
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
    _enterCampScene(site)   // fire lit on the pad, camera on the camp
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
    // FEAT-33: you turned the key off to make camp, so you wake to a dead truck and start the
    // morning by starting it. This is the diegetic bookend the ignition exists for (SM-INV-6) —
    // and on a worn engine it is also the morning's first piece of news about what you're driving.
    vehicleState.ignition = makeIgnitionState(IGN_OFF)
    damageModel.engineTempC = DAMAGE_PARAMS.tempAmbientC   // FEAT-51: a night off is a cold engine
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
  show('cp-item',   st.mode === 'camp')
  show('cp-map',    st.mode === 'camp' || st.mode === 'moms')
  show('cp-spirits', st.mode === 'camp')
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

/** The tent icon / Z: toggle "looking for a campsite". Only while the tent shows — Z anywhere else
 *  must not silently arm a sticky hunt the player cannot see. */
function _toggleCampSeek () {
  if (document.getElementById('camp-row')?.style.display !== 'flex') return
  _campSeek = !_campSeek
  _updateParkTriggers()       // repaint now rather than on the next 10 Hz poll
}
const _campIcon = document.getElementById('camp-icon')
// mousedown preventDefault keeps focus off the icon: Space is the parking brake, and a focused
// element would swallow the tap.
_campIcon?.addEventListener('mousedown', (e) => e.preventDefault())
_campIcon?.addEventListener('click', _toggleCampSeek)
document.addEventListener('keydown', (e) => {
  if ((e.key !== 'z' && e.key !== 'Z') || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
  const t = e.target
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
  _toggleCampSeek()
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
// FEAT-118: the map is openable from camp (M works too); the clock stays held while it is up.
document.getElementById('cp-map')?.addEventListener('click', (e) => { map2d.toggle(); e.currentTarget.blur() })
// FEAT-122: the inventory from camp (Tab works too); the camp pause holds the clock while it is up.
document.getElementById('cp-item')?.addEventListener('click', (e) => { inventoryScreen.request(); e.currentTarget.blur() })
document.getElementById('cp-hours')?.addEventListener('input', _syncSleepRow)

/**
 * FEAT-67: the head of a parked offer panel — the giver's portrait beside their line of dialogue.
 * Both are PLACEHOLDERS (owner, 2026-09-28): the portrait is the same flat silhouette the map card
 * draws, and a missing line shows a bracketed marker so an unwritten one is obvious in play.
 * `flavorHtml` is trusted markup (authored constants or the escaped card flavor), never player input.
 */
function _panelHead (flavorHtml) {
  return '<div class="mp-head">'
    + '<div class="mp-portrait" title="portrait (placeholder)"><svg viewBox="0 0 36 36" aria-hidden="true">'
    + '<circle cx="18" cy="13.7" r="7.2"/><path d="M5 36 Q5.8 23 18 23 Q30.2 23 31 36 Z"/></svg></div>'
    + `<div class="mp-flavor">${flavorHtml ?? '&ldquo;<span class="mp-dim">[flavor line]</span>&rdquo;'}</div>`
    + '</div>'
}

/**
 * THE MONEY ROWS, shared by both result cards (owner, 2026-09-29: the offer card and the result
 * card are a pair). The offer card quotes ONE number, "Base pay" — the guaranteed amount. The
 * result card answers it row for row, in the same words and the same order:
 *
 *     Base pay   $B     — the same figure the offer quoted (splitPayout, so it matches to the cent)
 *     Tip        $T     — what the clock paid above it; $0 for a drive slow enough to run it out
 *     [Accuracy bonus $S]  — paper route only: the per-throw money, banked as it landed
 *     +N good deeds     — on the tip line, as before
 *     Bonus …           — the offer's item, earned or what it needed
 *
 * `base`/`tip`/`spot` are dollars to the cent, all printed through formatMoney.
 */
function _payRows ({ base, tip, spot = null, points = 0, bonus = null, award = null, haul = null, condition = null }) {
  const row = (label, money) => `<br><span class="mp-dim">${label}</span> <span class="mp-pay">$${money}</span>`
  // FEAT-88: the one place a load's count is shown — after the drive, never during (SM-INV-10).
  return (haul ? `<br><span class="mp-dim">Firewood delivered</span> <span class="mp-pay">${haul.aboard} / ${haul.loaded}</span>` : '')
    // FEAT-97: likewise the fragile load's condition — on the card after the drive, never on the HUD.
    + (condition != null ? `<br><span class="mp-dim">Cargo condition</span> <span class="mp-pay">${Math.round(condition * 100)}%</span>` : '')
    + row('Base pay', formatMoney(base))
    + row('Tip', formatMoney(tip))
    + (points > 0
      ? ` &nbsp;<span class="mp-dim">·</span>&nbsp; <span class="mp-pay">+${points} good deed${points > 1 ? 's' : ''}</span>`
      : '')
    + (spot != null ? row('Accuracy bonus', formatMoney(spot)) : '')
    + (bonus
      ? (award
        ? `<br><span class="mp-pay">Bonus: ${bonus.name} &check;</span>`
          + (award.stowed === 'pending' ? ` <span class="mp-dim">no room in the truck &mdash; Tab to make room</span>` : '')
        : `<br><span class="mp-dim">Bonus: ${bonus.name} missed (needed ${gateText(bonus.gate)})</span>`)
      : '')
}

/** FEAT-113: the result card of a job signed off past its deadline (POI job and paper route alike). */
function _expiredCard (dueH) {
  return `<span class="mp-big">Expired</span><br><span class="mp-dim">was due ${formatDue(dueH)} &mdash; no pay</span>`
}
/**
 * The abandoned job's card (owner, 2026-10-15): the word, the time, what became of the cargo, and $0.
 * `cargo` is _abandonCargo's read; `extra` is any mission-specific line (the paper route's count).
 */
function _abandonedCard (r, extra = '') {
  const dim = (t) => `<br><span class="mp-dim">${t}</span>`
  const c = r.cargo
  const cargo = !c ? ''
    : c.kind === 'haul' ? (c.aboard > 0
      ? dim(`Firewood remaining</span> <span class="mp-pay">${c.aboard} / ${c.loaded}`)
      : '<br><span class="mp-bad">Firewood all lost</span>')
    : c.kind === 'fragile' ? (c.health > 0
      ? dim(`Cargo condition</span> <span class="mp-pay">${Math.round(c.health * 100)}%`)
      : '<br><span class="mp-bad">Cargo destroyed</span>')
    : dim('Cargo remaining</span> <span class="mp-pay">1 / 1')
  return `<span class="mp-big mp-bad">Abandoned</span>`
    + ` &nbsp;<span class="mp-dim">·</span>&nbsp; <span class="mp-big">${formatTime(r.elapsed)}</span>`
    + extra + cargo
    + `<br><span class="mp-dim">Pay</span> <span class="mp-pay mp-bad">$${formatMoney(0)}</span>`
}

// Story-mode DOM. Two surfaces: the offer/result panel (over the map) and the in-run HUD.
// SM-INV-3 — par NEVER appears while driving; the result card is the only place it is shown.
function _renderMissionUI () {
  const panel = document.getElementById('mission-panel')
  const body  = document.getElementById('mp-body')
  const hud   = document.getElementById('mission-hud')
  const acts  = document.getElementById('mp-actions')
  if (!panel || !body || !hud) return
  const hudText = hud.querySelector('.hud-text') ?? hud   // the readout; the abandon button sits after it
  const m = missionSystem
  const show = (el, on, disp = 'block') => { el.style.display = on ? disp : 'none' }
  const km = (mm) => (mm / 1000).toFixed(2) + ' km'

  const btn = (id, on) => { const b = document.getElementById(id); if (b) b.style.display = on ? '' : 'none' }

  // FEAT-113: a job past its deadline reads the same in every on-job state — park and sign it off.
  const expired = m.isOnJob() && !!m.mission?.expired
  switch (expired ? 'expired' : m.state) {
    case 'expired':
      show(panel, false); show(hud, true)
      hudText.textContent = 'job expired · park and sign it off'
      break
    case 'generating':
      show(panel, true); show(hud, false)
      // The planner streams a real, culled network the first time (and after a seed change or a
      // long walk), which takes a few seconds — say so rather than looking hung.
      body.innerHTML = 'planning a job&hellip;<br><span class="mp-dim">building the road network for this area</span>'
      show(acts, false, 'flex')
      unmountExportRow('mission-panel')
      break
    case 'offer': {
      show(panel, true); show(hud, false); show(acts, true, 'flex')
      const j = m.mission
      // FEAT-67: a board offer reads as its card — the sentence, then base pay and the terms, then
      // the bonus. The same view-model the map's hover card draws, so the two can never disagree.
      const card = m.offer && offerBoard
        ? offerBoard.card(m.offer, { nowH: daySystem.clockH(), payTier: economySystem.terms().payTier, route: j,
                                     verdict: _offerVerdict(m.offer) })
        : null
      const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      body.innerHTML = (card
        ? _panelHead(card.flavor != null ? `&ldquo;${esc(card.flavor)}&rdquo;` : null)
          + (m.offers.length > 1 ? `<span class="mp-dim">offer ${m.offerIdx + 1} / ${m.offers.length}</span><br>` : '')
          + (card.badge ? `<span class="job-badge">${esc(card.badge)}</span>` : '')   // placeholder type badge
          + card.sentence.map(r => r.b ? `<b>${esc(r.t)}</b>` : esc(r.t)).join('') + '<br>'
          + (card.pay ? `<span class="mp-pay">${esc(card.pay)}</span> &nbsp;` : '')
          + `<span class="mp-dim">${card.terms.map(esc).join(' &middot; ')}</span><br>`
          + (card.bonus ? `${esc(card.bonus)}<br>` : '')
          + (card.verdict ? `<span class="mp-verdict mp-${card.verdict.level}">${esc(card.verdict.text)}</span><br>` : '')
        : `<span class="mp-big">${km(j.distance)}</span> &nbsp;<span class="mp-dim">`
          + `${j.edges} leg${j.edges === 1 ? '' : 's'}</span><br>`)
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
      btn('mp-prev', m.offers.length > 1); btn('mp-next', m.offers.length > 1)
      unmountExportRow('mission-panel')
      // Clear the per-run note so the previous run's note cannot ride along with the next export.
      // The DRIVER name is deliberately NOT cleared — it is per-session, and re-typing it every run
      // is exactly how you end up with three spellings of one person in the dataset.
      const _n = document.getElementById('mp-note'); if (_n) _n.value = ''
      break
    }
    case 'countdown':
      show(panel, false); show(hud, true)
      hudText.innerHTML = `<span class="mh-count">${Math.max(1, Math.ceil(m.countdown))}</span>`
      break
    case 'loading':
      // FEAT-88: the load is dropping onto the zone you parked over.
      show(panel, false); show(hud, true)
      hudText.textContent = 'loading…'
      break
    case 'staging':
      // The POI start. No digits and no hold — the only thing the player needs told is what starts
      // the clock, and the green ring that just replaced the marker's orange one says where.
      show(panel, false); show(hud, true)
      hudText.textContent = 'leave the green circle to start'
      break
    case 'running':
      show(panel, false); show(hud, true)
      // Distance to go ALONG THE ROUTE (crow-flies grew while driving a winding route correctly,
      // which read as "wrong way"). No par, no target — SM-INV-3. No elapsed either (owner,
      // 2026-10-15): the rank bar under it already reads time against par.
      // FEAT-102: a fetch also says which leg — out to the pickup, or home.
      hudText.textContent = `${km(m.routeRemaining())} to go`
        + (m.mission?.legs ? (m.leg === 0 ? '   · to pickup' : `   · back to ${_fetchHomeLabel(m.mission)}`) : '')
      break
    case 'done': {
      show(panel, true); show(hud, false); show(acts, true, 'flex')
      const r = m.result
      if (r.expired) {   // FEAT-113: signed off past the deadline — no letter, no pay
        body.innerHTML = _expiredCard(r.dueH)
        btn('mp-accept', true); btn('mp-decline', false); btn('mp-retry', false)
        btn('mp-regen', false); btn('mp-quit', false); btn('mp-prev', false); btn('mp-next', false)
        unmountExportRow('mission-panel')
        const nb = document.getElementById('mp-accept')
        if (nb) nb.textContent = 'continue'
        break
      }
      if (r.abandoned) {
        body.innerHTML = _abandonedCard(r)
        btn('mp-accept', true); btn('mp-decline', false); btn('mp-retry', !m.mission?.fromPoi)
        btn('mp-regen', false); btn('mp-quit', true)
        btn('mp-prev', false); btn('mp-next', false)
        unmountExportRow('mission-panel')   // nothing finished, nothing to calibrate against
        const nb = document.getElementById('mp-accept')
        if (nb) nb.textContent = 'continue'
        break
      }
      // FEAT-53: the letter wears its ratified rank colour (D·C·B·A·S = red·orange·yellow·white·
      // blue), the final letter (SM-INV-3: display only; the FEAT-87 strip shows it live). A paid
      // job adds its payout + good deeds; Quick Job says plainly that it pays nothing.
      const paid = r.payout !== undefined
      // Letter and time share the headline, at one size (owner, 2026-08-14 — the same rule the
      // paper route's cards follow).
      //
      // PAR IS NOT SHOWN [owner, 2026-08-16 — the par re-anchor]. The two lines that used to sit
      // here ("par 2:14.3" and "+0:12.4 vs par") are gone: the player sees a letter and a number,
      // how they did and what they earned, and never the reference the letter was cut from. Par is
      // now the failing line rather than a target to aim at, so showing it invites exactly the
      // stopwatch relationship SM-INV-3 exists to prevent — and it was the last place par leaked
      // onto the screen outside the paper route's authored timer.
      // `r.par` and `r.margin` are still CARRIED on the result object — the run-export
      // (mission.js, `rangersim-run-export/2`) writes them as par_s/margin_s and the whole runs/
      // calibration corpus is keyed on that. Display change only; do not prune the fields.
      // Then the money rows the offer card set up — Base pay answered, the tip beside it, the
      // offer's bonus earned or missed (FEAT-67; the item lands in the FEAT-122 inventory). See _payRows.
      body.innerHTML = `<span class="mp-big" style="color:${RANK_COLOR[r.letter] || '#fff'}">${r.letter}</span>`
        + ` &nbsp;<span class="mp-dim">·</span>&nbsp; <span class="mp-big">${formatTime(r.elapsed)}</span>`
        + (paid
          ? _payRows({ base: r.base, tip: r.tip, points: r.points, bonus: m.mission?.bonus, award: r.award,
                       haul: r.loaded ? { aboard: r.aboard, loaded: r.loaded } : null, condition: r.health ?? null })
          : (m.mission?.fromPoi ? '' : `<br><span class="mp-dim">test job &mdash; no pay</span>`))
      // The result card is exactly three actions: retry · continue · back to free roam (that is the
      // DOM order too). The calibration form above them stays — the subjective read is the ground
      // truth PAR_REF is fitted to, and it is only reliably captured here, in the same click.
      // FEAT-53: no retry on a paid job (the payout exploit) — hidden here, gated in mission.js.
      btn('mp-accept', true); btn('mp-decline', false); btn('mp-retry', !m.mission?.fromPoi)
      btn('mp-regen', false); btn('mp-quit', true)
      btn('mp-prev', false); btn('mp-next', false)
      // Reclaim the shared felt buttons for the POI job — a paper round finishing first
      // would otherwise leave them pointed at paperRouteSystem (see _exportSource), and would
      // also have left the form parented to the paper panel.
      _exportSource = missionSystem
      mountExportRow('mission-panel', 'mp-actions')
      // The accept button doubles as CONTINUE here — one obvious forward action, with "retry"
      // beside it to re-run the same route (testing/calibration: a known-road second lap).
      const nb = document.getElementById('mp-accept')
      if (nb) nb.textContent = 'continue'
      break
    }
    default:
      show(panel, false); show(hud, false)
      unmountExportRow('mission-panel')
      if (m.error) console.info('[mission]', m.error)
      break
  }
  const nb = document.getElementById('mp-accept')
  if (m.state === 'offer' && nb) nb.textContent = 'accept mission'
  // FEAT-112: an overload cannot be taken — the card line above says why.
  if (nb) nb.disabled = m.state === 'offer' && !!m.offer && _offerVerdict(m.offer)?.verdict === 'overload'
  _syncJobCancel(hud, storySystem.isActive() && m.isOnJob())
}

/**
 * FEAT-61: the paper route's panel and HUD. Same shape as _renderMissionUI — one switch, one
 * repaint per state change (plus the 10 Hz poll while running, because the clock and the count are
 * live values).
 *
 * SM-INV-3: the running surface carries the clock, the count and the inventory, and nothing else.
 * No rank, no par, no payout until the route is over. The clock counts UP (owner, 2026-09-29: no
 * time limit) — the same elapsed read-out a POI job shows, never a countdown.
 */
function _renderPaperUI () {
  const panel = document.getElementById('paper-panel')
  const body  = document.getElementById('pp-body')
  const hud   = document.getElementById('paper-hud')
  const acts  = document.getElementById('pp-actions')
  if (!panel || !body || !hud) return
  const hudText = hud.querySelector('.hud-text') ?? hud   // the readout; the abandon button sits after it
  const p = paperRouteSystem
  const show = (el, on, disp = 'block') => { if (el) el.style.display = on ? disp : 'none' }
  const km = (mm) => (mm / 1000).toFixed(2) + ' km'

  // FEAT-113: past Larry's deadline the round reads the same in staging and running.
  const expired = p.isCarrying() && !!p.run?.expired
  switch (expired ? 'expired' : p.state) {
    case 'expired':
      show(panel, false); show(hud, true); show(acts, false, 'flex')
      hudText.textContent = 'route expired · park and sign it off'
      break
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
      // THE HEADLINE NUMBERS, one line, one size (owner, 2026-08-14): who, how far. "How long" left
      // with the bell (owner, 2026-09-29), and par is not shown on any offer card (SM-INV-3). The
      // round's DEADLINE (FEAT-113) is a window from accept, stated beside the board expiry.
      // FEAT-67: Larry's portrait and his line head the panel, like every giver's. His line was
      // already written (the spare-papers aside), so it moves up into the dialogue slot.
      body.innerHTML = _panelHead('&ldquo;i gave you a couple extra, feel free to keep what you don&rsquo;t deliver&rdquo;')
        + `<span class="mp-big">${r.customers.length}</span> `
        + `<span class="mp-dim">customer${r.customers.length === 1 ? '' : 's'}</span> `
        + `&nbsp;<span class="mp-dim">·</span>&nbsp; <span class="mp-big">${km(r.distance)}</span><br>`
        + `${stock} papers in the truck `
        + `<span class="mp-dim">(${stock - r.customers.length} spare)</span><br>`
        // FEAT-67: Larry's card states base pay only — the fare at par, before the tips.
        + `<span class="mp-pay">Base pay $${formatMoney(basePay(r.par, economySystem.terms().payTier))}</span>`
        + (p.offer ? ` &nbsp;<span class="mp-dim">expires in ${formatGameDuration(p.offer.expiresH - daySystem.clockH())}`
          + (offerBoard?.spec(p.offer) ? ` &middot; deliver within ${formatGameDuration(offerBoard.deadlineH(p.offer, r.par))}` : '')
          + `</span>` : '')
      break
    }
    case 'staging':
      // Same words the POI job uses, because it is the same threshold and the same promise: sort
      // yourself out on the pad for as long as you like, the clock starts at the green line.
      show(panel, false); show(hud, true); show(acts, false, 'flex')
      hudText.textContent = 'leave the green circle to start the route'
      break
    case 'running': {
      show(panel, false); show(hud, true)
      // Delivered/total and the inventory — the two facts you act on. No elapsed (owner, 2026-10-15):
      // the rank bar under it reads time against par.
      hudText.textContent = `${p.delivered()} / ${p.route.customers.length} delivered   `
        + `${p.stock()} paper${p.stock() === 1 ? '' : 's'}`
      break
    }
    case 'done': {
      show(panel, true); show(hud, false); show(acts, true, 'flex')
      const r = p.result
      if (r.expired) { body.innerHTML = _expiredCard(r.dueH); break }   // FEAT-113: no letter, no pay
      if (r.abandoned) {
        body.innerHTML = _abandonedCard(r, `<br><b>${r.delivered}</b> of <b>${r.customers}</b> delivered `
          + `&nbsp;<span class="mp-dim">·</span>&nbsp; <span class="mp-dim">papers left</span> <span class="mp-pay">${r.stock}</span>`)
        unmountExportRow('paper-panel')
        break
      }
      body.innerHTML = `<span class="mp-big" style="color:${RANK_COLOR[r.letter] || '#fff'}">${r.letter}</span>`
        + ` &nbsp;<span class="mp-dim">·</span>&nbsp; <span class="mp-big">${formatTime(r.elapsed)}</span>`
        // The "+N% early" badge went with the expediency bonus it reported [2026-08-17]. Pace is
        // now paid through the shared margin line, so the letter and the time money already say it
        // and a third restatement was just the old bonus wearing a percentage.
        + `<br><b>${r.delivered}</b> of <b>${r.customers}</b> delivered `
        + `&nbsp;<span class="mp-dim">·</span>&nbsp; `
        + `${Math.round(r.meanAccuracy * 100)}% <span class="mp-dim">accuracy</span>`
        // The same rows the POI result card shows (_payRows), plus the accuracy bonus — a third
        // payment, banked as the papers landed. Showing only the settlement would look like a pay cut.
        + _payRows({ base: r.base, tip: r.tip, spot: r.spot, points: r.points })
        + (r.advanced
          ? `<br><span style="color:#ffdc3c">Larry&rsquo;s giving you a bigger route &mdash; ${r.nextTier} houses next time</span>`
          : '')
      // FEAT-30 calibration form, same one the POI result card shows (owner, 2026-08-17): a paper
      // round could not be recorded at all before this, so par had nothing to be fitted against for
      // the one mission type whose par is dominated by STOPS. `_exportSource` tells the shared felt
      // handler which system to ask for the blob.
      _exportSource = paperRouteSystem
      mountExportRow('paper-panel', 'pp-actions')
      break
    }
    default:
      show(panel, false); show(hud, false)
      if (p.error) console.info('[paper]', p.error)
      break
  }
  if (p.state !== 'done' || p.result?.expired) unmountExportRow('paper-panel')
  _syncJobCancel(hud, storySystem.isActive() && p.isCarrying())
  // Two buttons, two meanings: on the offer they are take/decline, on the result card the left one
  // is the only forward action and the right one has nothing to say.
  const acc = document.getElementById('pp-accept')
  const dec = document.getElementById('pp-decline')
  if (acc) acc.textContent = p.state === 'done' ? 'continue' : 'start the route'
  if (dec) dec.style.display = p.state === 'offer' ? '' : 'none'
}

document.getElementById('pp-accept')?.addEventListener('click', () => {
  if (paperRouteSystem.state === 'done') { paperRouteSystem.dismiss(); return }
  // FEAT-67: Larry's offer comes off the board at accept, if it is still there.
  const o = paperRouteSystem.offer
  if (paperRouteSystem.state === 'offer' && o && offerBoard && !offerBoard.take(o.id, daySystem.clockH(), paperRouteSystem.route?.par)) {
    paperRouteSystem.decline()
    return
  }
  paperRouteSystem.accept()
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
  // The clock reads the one authoritative world clock (day.js) in the SAME notation as a job's due
  // time — "Day 3, 2:15 am" — so this is where the player looks to read a deadline (owner,
  // 2026-10-15). Whole minutes, which also keeps the snapshot key from re-writing the DOM at 10 Hz.
  const clock = formatDue(Math.floor(daySystem.clockH() * 60) / 60)
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
  }
  const on = storySystem.isActive() && !storySystem.isEntering()
  if (on !== _emOn) {
    _emOn = on
    _emEls.root.style.display = on ? 'block' : 'none'
    if (on) {
      // Band widths from the LIVE thresholds — they are debug sliders, so lay the strip out each
      // time it comes up rather than once at boot.
      const hours = {
        rested:    daySystem.fullEnergyH() - DAY_PARAMS.sleepyAtH,
        sleepy:    DAY_PARAMS.sleepyAtH - DAY_PARAMS.tiredAtH,
        tired:     DAY_PARAMS.tiredAtH,
        exhausted: -daySystem.debtFloorH(),
      }
      for (const [k, el] of Object.entries(_emEls.segs)) {
        el.style.width = `${hours[k] * EM_PX_PER_H}px`
        el.style.background = STAGE_COLOR[k]
      }
    }
  }
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

// ── FEAT-87: the live rank timer (RoR2 ticker, top-centre under the mission readout) ───────
// The job's rank bands — S·A·B·C·D, cut at the thresholds FROZEN at accept × par — laid along a
// time axis at RT.pxPerS and scrolled under a fixed pointer by the MISSION clock (the same
// `elapsed` the result card grades on, so the bar and the letter cannot disagree). Pure geometry
// and the per-frame read live in rank-timer.js; this is the DOM. Per frame, like the Energy
// meter, because the creep IS the display — and because the escalation (glow, scale, heartbeat)
// runs on a pulse up to 2 Hz that a 10 Hz poll would stutter.
//
// Binding (SM-INV-3 as amended 2026-08-17; FEAT-87 rulings): NO digits on this surface — the
// only text is the letter in the title and the letters on the bands. Boundary proximity, never
// `3:41 remaining`. Calm for the quiet middle of a band; flashy only inside RT.escalateS of the
// next line (the "glanceable and peripheral" relaxation is local to boundaries). Crossing the
// offer's bonus gate plays the "bonus lost" beat; crossing the C/D line plays "too slow". Both are
// display only — the payout underneath is the same continuous line (SM-INV-4).
//
// NOT ON SCREEN UNTIL IT MATTERS [owner, 2026-10-01]: the bar POPS UP RT.appearS seconds before
// the S/A line (rank-timer.js `shown`) and stays to the end of the job — except the strip itself,
// which closes RT.closeAfterDS after the C/D line (`barShown`, owner 2026-10-03): in D there is
// nothing ahead to show. The Rank: D tile stays until the job is finished. Before that it has nothing
// useful to say and is simply absent. It sits top-centre under #mission-hud / #paper-hud — the
// spot the "leave the green circle" line and the elapsed readout occupy — not with the wallet.
//
// THE RANK: READOUT [owner, 2026-10-01 — "something dramatic"]: the band under the pointer as a
// dark letter on a solid TILE in its colour, floating centred BELOW the card (owner, 2026-10-02:
// "the card should just be the bar"; the bare glowing letter "isn't doing it", so it is a tile).
// As a line nears, the tile THUMPS on every kick of the heartbeat — a scale punch and a flash that
// decay in RT.punchTau, once for the lub and softer for the dub — so it moves with the sound
// rather than breathing on a sine. When a line goes past the OLD tile cracks in two and the halves
// tumble away (_rtBreakLetter — two clipped clones, CSS-animated, self-removing) while the new
// letter slams in.
//
// Sources: a POI/Quick job (missionSystem — countdown / staging / running, with `mission.bonus.gate`
// as the marked line) or a paper round (paperRouteSystem — staging / running). The paper route's
// letter is graded on par × coverage, which is not known until the round is in; the bar draws the
// full-coverage bands, i.e. the clock you are held to if you serve everyone, and marks no gate
// (rounds carry no bonus item).
const RT = RANK_TIMER_PARAMS
let _rtEls = null, _rtKey = null, _rtLayout = null, _rtPrev = -1, _rtLetter = '', _rtHot = false
let _rtBeatT = 0, _rtShown = false, _rtPhase = 0, _rtLastNow = 0
let _rtKickT = -1   // performance.now()/1000 of the last heartbeat (-1: none since calm) — drives the tile's thump
function _rankTimerSource () {
  const m = missionSystem
  if (m && m.mission && (m.state === 'countdown' || m.state === 'staging' || m.state === 'running')) {
    if (m.mission.expired) return null   // FEAT-113: a job that pays nothing has no rank to chase
    // No bar where the clock is not what the letter reads (owner, 2026-10-15): a fragile job is
    // lettered on condition, a haul on the clock AND the load — a bar falling S → A on the clock
    // promises a grade the job does not give. Courier and freight keep it (time pays their tip).
    if (m.mission.fragile || m.mission.bundles) return null
    return { key: m.mission, elapsed: m.elapsed, par: m.mission.par,
             thresholds: m.mission.terms?.thresholds ?? RANK_THRESHOLDS_DEFAULT,
             gate: m.mission.bonus?.gate ?? null }
  }
  const p = paperRouteSystem
  if (p && p.isCarrying() && p.run && p.route && !p.run.expired) {
    return { key: p.run, elapsed: p.run.elapsed, par: p.route.par,
             thresholds: p.run.thresholds ?? RANK_THRESHOLDS_DEFAULT, gate: null }
  }
  return null
}
// FEAT-113: the job's deadline, "DUE: Day 3, 2 am", under the rank tile (owner, 2026-10-15: the due
// time and the rank timer are related, so they read together). A fixed time, never a countdown
// (SM-INV-3). Its own element in #job-stack, so it shows from accept, and on fragile and haul jobs,
// which have no rank bar.
let _jobDueText = null
function _updateJobDue () {
  let h = null
  if (storySystem.isActive() && !storySystem.isEntering()) {
    const m = missionSystem, p = paperRouteSystem
    if (m?.isOnJob() && !m.mission?.expired) h = m.mission?.dueH
    else if (p?.isCarrying() && !p.run?.expired) h = p.run?.dueH
  }
  const text = Number.isFinite(h) ? formatDue(h) : ''
  if (text === _jobDueText) return
  _jobDueText = text
  const el = document.getElementById('job-due')
  if (!el) return
  el.lastChild.textContent = text
  el.style.display = text ? 'block' : 'none'
}
function _updateRankTimer () {
  if (!_rtEls) {
    const root = document.getElementById('rank-timer')
    if (!root) return
    _rtEls = { root, strip: document.getElementById('rt-strip'), gate: document.getElementById('rt-gate'),
               letter: document.getElementById('rt-letter'), letterBox: document.getElementById('rt-letter-box'),
               beat: document.getElementById('rt-beat'), card: document.getElementById('rt-card'), segs: [] }
  }
  const src = (storySystem.isActive() && !storySystem.isEntering()) ? _rankTimerSource() : null
  if (!src) {
    if (_rtKey !== null) {       // the job ended or was put down: hide once, forget the layout
      _rtKey = null; _rtLayout = null; _rtHot = false; _rtShown = false
      _rtEls.root.style.display = 'none'
      _rtEls.root.classList.remove('rt-lost', 'rt-slow', 'rt-in', 'rt-closed')
      _rtEls.card.style.boxShadow = ''; _rtEls.card.style.borderColor = ''
      _rtEls.letterBox.style.scale = ''; _rtEls.letterBox.style.filter = ''
    }
    return
  }
  const E = _rtEls
  if (src.key !== _rtKey) {
    // A new job in hand: rebuild the strip from its contract. One DOM build per accept.
    _rtKey = src.key
    _rtLayout = rankTimerLayout(src.par, src.thresholds, src.gate)
    _rtPrev = -1; _rtLetter = ''; _rtHot = false; _rtShown = false
    E.letterBox.style.scale = ''; E.letterBox.style.filter = ''; _rtKickT = -1   // the last job may have ended mid-thump
    for (const el of E.segs) el.remove()
    E.segs = []
    for (const sh of E.letterBox.querySelectorAll('.rt-shard')) sh.remove()
    E.letter.classList.remove('rt-slam')
    E.root.classList.remove('rt-lost', 'rt-slow', 'rt-in', 'rt-closed')
    E.root.style.display = 'none'
    E.gate.classList.remove('lost')
    if (_rtLayout) {
      for (const b of _rtLayout.bands) {
        const el = document.createElement('div')
        // D runs off the end of any window the strip can show — par again, plus the view.
        const w = (isFinite(b.t1) ? b.t1 - b.t0 : src.par + RT.viewW / RT.pxPerS) * RT.pxPerS
        el.className = w > RT.viewW / 2 ? 'rt-seg wide' : 'rt-seg'   // wide: letter at the left edge
        el.style.width = `${w}px`
        el.style.background = RANK_COLOR[b.letter]
        el.textContent = w >= 14 ? b.letter : ''   // a letter half-clipped reads worse than none
        E.strip.insertBefore(el, E.gate)
        E.segs.push(el)
      }
      if (_rtLayout.gateT != null) {
        E.gate.style.left = `${_rtLayout.gateT * RT.pxPerS}px`
        E.gate.style.display = 'block'
      } else E.gate.style.display = 'none'
    }
  }
  if (!_rtLayout) return
  const e = src.elapsed
  const f = rankTimerFrame(_rtLayout, e, _rtPrev < 0 ? e : _rtPrev, RT)
  _rtPrev = e
  // The pop: absent until appearS before the S/A line, then on for the rest of the job (the
  // rt-in class runs the entrance animation once).
  if (f.shown !== _rtShown) {
    _rtShown = f.shown
    E.root.style.display = f.shown ? 'block' : 'none'
    E.root.classList.toggle('rt-in', f.shown)
  }
  if (!f.shown) return
  // Deep in D the strip closes (rank-timer.js closeAfterDS); the tile below it stays to the end.
  E.root.classList.toggle('rt-closed', !f.barShown)
  // The scroll: the pointer is at pointerFrac of the view; the strip's origin (elapsed 0) slides
  // left of it by elapsed × pxPerS.
  E.strip.style.transform = `translateX(${RT.viewW * RT.pointerFrac - e * RT.pxPerS}px)`
  if (f.letter !== _rtLetter) {
    const old = _rtLetter
    _rtLetter = f.letter
    if (old) _rtBreakLetter(old)   // a line went past: the old letter breaks and falls
    E.letter.textContent = f.letter
    E.letterBox.style.background = RANK_COLOR[f.letter]   // the tile; the letter on it is dark (CSS)
    if (old) { E.letter.classList.remove('rt-slam'); void E.letter.offsetWidth; E.letter.classList.add('rt-slam') }
  }
  // The beats. A beat holds for RT.beatS (the CSS animation runs the flash; the class is removed
  // on the clock so a second beat can re-trigger it). Both fire once, on the crossing frame.
  const now = performance.now() / 1000
  if (f.lost || f.slow) {
    E.root.classList.remove('rt-lost', 'rt-slow')
    void E.root.offsetWidth    // restart the CSS animation if a beat is already playing
    E.root.classList.add(f.lost ? 'rt-lost' : 'rt-slow')
    E.beat.textContent = f.lost ? 'bonus lost' : 'too slow'
    if (f.lost) E.gate.classList.add('lost')
    _rtBeatT = now + RT.beatS
  } else if (_rtBeatT && now >= _rtBeatT) {
    _rtBeatT = 0
    E.root.classList.remove('rt-lost', 'rt-slow')
  }
  // The escalation. Calm = no inline style at all (reset once). Near a line: a glow in the colour
  // of the band about to be lost, beating faster as it nears, with a heartbeat kick on every peak
  // that the rank tile thumps in time with. The card itself does NOT move (owner, 2026-10-02: the old
  // sideways shake is gone). The bonus gate and the C/D line hit harder than the S/A, A/B lines
  // you were not banking on.
  const i = f.intensity
  if (i <= 0) {
    if (_rtHot) {
      _rtHot = false; _rtPhase = 0
      E.card.style.boxShadow = ''; E.card.style.borderColor = ''
      E.letterBox.style.scale = ''; E.letterBox.style.filter = ''; _rtKickT = -1
    }
    _rtLastNow = now
    return
  }
  // ONE oscillator. Its frequency ramps pulseHzMin → pulseHzMax (48 → 140 bpm) with intensity² —
  // slow for most of the approach, then quickly up to a racing heartbeat at the line. The phase
  // INTEGRATES (phase += 2π·f·dt) so the frequency ramp is continuous: no jumps as f changes.
  // Everything the escalation moves — the card's glow, the heartbeat and the tile's thump — rides
  // this one signal. The heartbeat fires on the step the phase crosses a PEAK (sin = 1, i.e. phase =
  // π/2 + 2πk), so the lub lands as the glow tops out.
  const dtF = _rtHot ? Math.min(0.1, now - _rtLastNow) : 0
  _rtLastNow = now; _rtHot = true
  const freq = RT.pulseHzMin + (RT.pulseHzMax - RT.pulseHzMin) * i * i
  const peaksBefore = Math.floor((_rtPhase - Math.PI / 2) / (2 * Math.PI))
  _rtPhase += 2 * Math.PI * freq * dtF
  const osc = Math.sin(_rtPhase)
  const weight = f.heavy ? 1 : 0.5
  if (Math.floor((_rtPhase - Math.PI / 2) / (2 * Math.PI)) > peaksBefore) {
    playHeartbeat((RT.heartMin + (1 - RT.heartMin) * i) * weight)
    _rtKickT = now
  }
  const pulse = 0.5 + 0.5 * osc                       // 0..1, the same rhythm for every effect
  const colour = RANK_COLOR[f.letter]
  E.card.style.borderColor = colour
  E.card.style.boxShadow = `0 0 ${((3 + 16 * i * pulse) * weight).toFixed(1)}px ${colour}, 0 2px 10px rgba(0,0,0,0.45)`
  // The tile's thump: an exponential punch on each kick, the lub at full and the dub
  // HEARTBEAT_DUB_DELAY later at HEARTBEAT_DUB_LEVEL — the same two hits heartbeat-audio.js plays.
  const env = (t) => (t >= 0 ? Math.exp(-t / RT.punchTau) : 0)
  const k = _rtKickT < 0 ? 0
    : env(now - _rtKickT) + HEARTBEAT_DUB_LEVEL * env(now - _rtKickT - HEARTBEAT_DUB_DELAY)
  E.letterBox.style.scale = `${(1 + RT.punchScale * (0.4 + 0.6 * i) * weight * k).toFixed(3)}`
  E.letterBox.style.filter = `brightness(${(1 + 0.6 * k).toFixed(3)})`
}
// The break: two clones of the OLD tile (its colour, its letter), each clipped (CSS) to one side of
// a jagged crack, dropped over the tile; their fall animations remove them when done. It sounds
// like a car side window going (glass-audio.js).
function _rtBreakLetter (old) {
  playGlassBreak()
  for (const side of ['l', 'r']) {
    const sh = document.createElement('span')
    sh.className = `rt-shard ${side}`
    sh.textContent = old
    sh.style.background = RANK_COLOR[old]
    sh.addEventListener('animationend', () => sh.remove(), { once: true })
    _rtEls.letterBox.appendChild(sh)
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
  if (missionSystem.state === 'done') { missionSystem.exit(); return }
  // FEAT-67: take the offer OFF THE BOARD first, re-checking it is still live — a food offer lives
  // ~2 real minutes, so it can expire with the panel up. If it has gone, the panel re-presents what
  // is live now instead of accepting a job the board no longer has.
  const o = missionSystem.offer
  if (o && offerBoard && _offerVerdict(o)?.verdict === 'overload') return   // FEAT-112: the button is disabled too
  if (o && offerBoard && !offerBoard.take(o.id, daySystem.clockH(), missionSystem.mission?.par)) { _refreshParkedOffers(); return }
  missionSystem.accept()
  // FEAT-96: a freight job's load is handed over at accept, already strapped — no drop, no loading beat.
  const j = missionSystem.mission
  if (j?.load && missionSystem.isOnJob()) void _loadFreight(j.load, j.cargoKg, j)
})
document.getElementById('mp-prev')?.addEventListener('click', () => missionSystem.cycle(-1))
document.getElementById('mp-next')?.addEventListener('click', () => missionSystem.cycle(+1))

/**
 * FEAT-67: the parked panel's offer expired (or was taken) under it — re-present the POI's live
 * offers, or close with a note when none are left. Called from the accept guard and the 10 Hz poll.
 */
function _refreshParkedOffers () {
  if (missionSystem.state !== 'offer' || !missionSystem.mission?.fromPoi) return
  const poi = poiSystem.list().find(q => q.id === missionSystem.mission.fromPoi)
  const offers = poi ? _takeableOffers(poi.id, daySystem.clockH()) : []
  if (!offers.length) { missionSystem.exit(); return }
  const prevId = missionSystem.offer?.id
  missionSystem.enterFromPoi(poi, offers, _planOffer)
  // Looked up AFTER the re-entry, in the mission's own list: enterFromPoi drops offers whose route
  // cannot be planned, so an index into the board's list can point at a different offer.
  const keep = missionSystem.offers.findIndex(o => o.id === prevId)
  if (keep > 0) { missionSystem.offerIdx = keep; missionSystem.cycle(0) }
}
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
    const data = (_exportSource ?? missionSystem).exportRun(note)
    if (!data) return
    data.felt = b.dataset.felt
    data.driver = document.getElementById('mp-driver')?.value?.trim() || null
    data.seed = worldSeed
    // WHICH ROADS this was driven on. Same contract as `par_ref.slack` inside the blob: a drive
    // recorded on different roads is measured against a different standard, so the corpus has to
    // carry the router version or a later refit cannot tell two incompatible corpora apart. This
    // is BUG-41 Stage 2's whole problem — PAR_REF was fitted on v1 roads two days before v2 shipped
    // and nothing in `runs/` records that. Stamped here beside seed/driver/felt because this is
    // where the run's CONTEXT is attached; buildRunExport knows the drive, not the world.
    data.road_router = ROAD_ROUTER_VERSION
    // `paper` in the name so the two mission types are tellable apart in runs/ at a glance — their
    // pars are not comparable (a paper round's is dominated by per-porch stops).
    const kind = data.mission_type === 'paper_route' ? 'paper-' : ''
    downloadJSON(data, `rangersim-run-${kind}${data.driver ? data.driver.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-' : ''}`
      + `${data.felt}-${data.result.letter ?? 'x'}-${Math.round(data.result.elapsed_s)}s.json`, 2)
    b.dataset.label ??= b.textContent   // S-65: a second click inside 1.5 s must not capture 'saved ✓'
    b.textContent = 'saved ✓'
    setTimeout(() => { b.textContent = b.dataset.label }, 1500)
  })
}
document.getElementById('mp-quit')?.addEventListener('click', () => {
  missionSystem.exit()
  // FEAT-43: a mission only ever runs INSIDE story mode, so "back to free roam" leaves the whole
  // mode — route through StorySystem.exit() to restore streaming radii + debug tooling.
  if (storySystem.isActive()) storySystem.exit()
})

// Phase 9 (SURF-01 / SURF-03): RoadMeshSystem — ribbon mesh sweep with crown + camber.
// Constructed after both terrainSystem and roadSystem exist.
// setRoadSystem() wires the carve hook in analyticHeight so physics feels the road surface.
terrainSystem.setRoadSystem(roadSystem)
// QUAL-14 perf: map shares the play route cache (getter — play swaps instances on seed regen).
map2d.setSharedRouteSource(() => roadSystem)
// PERF-30: the network Worker client. The play RoadSystem's dispatcher hands every real rebuild
// (window move past the band sig, slider invalidate) to the Worker and keeps serving the old
// network until the finished one is adopted atomically between frames. Cold flows (spawn resolve,
// story region entry) await client.buildNow() behind the loading screen — the build runs
// off-thread so the screen actually animates. Headless gates never construct this → the
// synchronous path in road.js is byte-untouched.
let netClient = null
if (USE_NETWORK_WORKER && typeof Worker !== 'undefined') {
  netClient = new RoadNetworkClient({
    getSeed: () => worldSeed,
    getParams: () => RANGER_PARAMS,
    getPondDiscs: _pondDiscs,
    // PERF-34: prime the water caches for the request window in slices before the discs are read.
    warmRegion: (minX, minZ, maxX, maxZ, ms) => waterSystem ? waterSystem.warmRegion(minX, minZ, maxX, maxZ, ms) : true,
  })
  netClient.register('play', roadSystem, {
    onAdopted: (reason) => {
      // EVERY adopt, not just 'params': a positional move-adopt is precisely when runs the old
      // window never registered enter the network, which is what strands props on roads. The
      // predicate comes from makePropSamplers() so it can never drift from the one the scatter
      // itself used. BUG-71 + PERF-33: owe a whole-ring pass; the frame loop pays it off in slices
      // (this handler runs between frames, so any sweep here is an unbudgeted stall).
      owePropSweep()
      if (reason !== 'params') {
        // BUG-76: a positional adopt does not bump the generation, yet it can still re-shape road
        // inside chunks already carved (a window-dependent T promotion, measured flipping 114 m from
        // the car). Left alone, the mesh + heightfield + road trimesh keep the OLD road while the
        // wheels read the new analyticHeight — tyres sink, the chassis rides the stale collider.
        // adoptNetwork() diffed the swap and has already re-sliced, so both consumers rebuild
        // against the adopted network. Driving budget (burst:false): these land ≥100 m out.
        const dirty = roadSystem.lastAdoptDirty()
        if (dirty) {
          terrainSystem?.recarveInPlace(dirty, { burst: false })
          roadMeshSystem?.invalidateRegions(dirty)
        }
        return
      }
      // The deferred half of debouncedRoadRebuild (see there): the swap just bumped _generation,
      // so clear the ribbon tiles and re-bake the carve against the ADOPTED geometry — doing this
      // at invalidate time would have rebuilt against the stale network and then again here.
      if (roadMeshSystem) roadMeshSystem.clearAll()
      // ORDER MATTERS, exactly as in debouncedRoadRebuild's synchronous path — and this call was
      // MISSING here, which is the whole bug. adoptNetwork() installs the runs but explicitly drops
      // the slices (`_tiles.clear()`, `_slicedFrom = null`), so between the swap and the next
      // _sliceNetwork() the road exists as runs and does NOT exist as tiles. The carve reads TILES.
      // Rebuilding the terrain in that gap bakes chunks against an empty road: the deck sits at its
      // design height with no embankment or bench under it, and the ribbon tile for that key was
      // just cleared — a road spline drawn through open air, the truck resting on whatever the
      // uncarved ground left behind. Driving away and back masked it because a chunk streamed in
      // LATER re-carves against a by-then-sliced network. Re-slice first, then rebuild.
      roadSystem.update(roadStreamCenter())   // adopted window ⇒ short-circuits the rebuild, just re-slices (PERF-33: the SAME centre play streams by, or the band would differ and re-dispatch)
      if (terrainSystem) {
        terrainSystem.reinitWorker(worldSeed, RANGER_PARAMS)
        terrainSystem.rebuildAllChunksFromWorker()
      }
    },
  })
  // The map's read-only instance builds off the same worker (client 'map'), and in story mode it
  // can skip the build entirely by adopting the play network — play already holds the region.
  map2d.setNetworkClient(netClient)
  map2d.setPlayNetworkSource(() => roadSystem)
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
  // FEAT-85: the cover's live dials ride the same hook — every path that recreates the
  // PropSystem (GUI rebuild, reseed) or switches tier lands here.
  const C = FLORA_PARAMS.scatter?.cover
  if (C) { propSystem.setCoverFade(C.fadeStart, C.fadeEnd); propSystem.setCoverWind(C.windStrength) }
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
    if (!_labActive) propSystem.setPhysicsHook(propPhysics)   // FEAT-48: re-attach after the GUI full rebuild (exitLab does it in the lab, S-65)
    else propSystem.setVisible(false)                           // …and in the lab's clean room it stays hidden
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
// FEAT-47: story day clock folder (self-contained, same pattern).
daySystem.addGui(_gui)
// FEAT-53: economy folder — wallet/deeds/tier read-outs + the PROVISIONAL k and cap tunables.
economySystem.addGui(_gui)
// FEAT-122: grant any catalog item without running a mission.
inventorySystem.addGui(_gui)
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
// FEAT-66: campfire light/flame tunables.
campfire.addGui(_gui)
// FEAT-14: vehicle cast-light tuning folder (headlight beams + rear lamp pools).
addLightGui(_gui)
// User pref: every lil-gui section collapsed by default (the root panel stays open). Runs after ALL
// folders exist (debug + props), so it covers debug.js's folders without editing debug.js.
_gui.foldersRecursive().forEach((f) => f.close())

// Phase 7 (D-14/15/16): initial-load seat via canonical resolveSpawn + analyticHeight ground-probe.
// TerrainSystem is now alive and analyticHeight is immediately available (no chunk load required).
// This overrides the vehicleState.position set by makeVehicleState (origin at static-equilibrium bodyY).
perfMark('init: systems created, before spawn reseat')  // D-arc
// PERF-11/12: apply the default tier ONCE at boot. Until now "Normal == construction defaults"
// held by convention; Normal now differs (resHeight 1200, shadow 1536@±160), so the preset must
// actually run. Idempotent for the fields that do match; systems exist at this point, so the
// ring/radius calls are real (and no-ops at the default ring).
applyQuality('Normal')
// Seat the truck (top-level await — main.js is a module, so everything below, including the
// render loop start, waits). resolveSpawn builds each band it needs on the network Worker before
// touching it, so the cold load is an event-loop-friendly wait rather than a synchronous block.
await _reseatTruckAtSpawn()
perfMark('init: spawn reseated')  // D-arc

// ── Collider wireframe overlay (physics-debug.js) ─────────────────────────────
// Replaced the 14 orange probe spheres (2026-08-15): those visualised the retired
// getBodyContactPoints probes; the wireframes draw the ACTUAL engine colliders.
// Backtick toggles them from debug.js's own backtick listener, under the panel's lockout (R-13).
document.addEventListener('keydown', e => {
  // FEAT-16: M toggles the 2D top-down map overlay (sim keeps running underneath).
  if (e.key === 'm' || e.key === 'M') {
    // FEAT-43's region window used to be set here, on the keypress. BUG-68 moved it INTO the map
    // (Map2D._syncRegionWindow, run on open and per frame): doing it only here meant any other way
    // of opening or re-targeting the map — mission framing is the live one — left the map's cap at
    // the free-roam 2000 m, short of a 2500 m region, so the region lock never engaged and panning
    // re-streamed around the cursor. The map now covers its own region whoever opened it.
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
  if (RANGER_PARAMS.rampEnabled === false) return   // debug toggle: no ramp for wheels OR chassis
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
  _clearBarrelCube()
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

// ── Barrel cube: the lab's crash toy ─────────────────────────────────────────────────────
// A block of upright drums on the lab slab with the truck 400 ft back from its face, pointed at it —
// floor it and watch the cube come apart. Its size (src/debris.js BARREL_CUBE_SIDE / _LAYERS) is
// set well under the measured 60 fps ceiling — see the comment there.
// Behind the lab spawn (−X) on open slab: the truck drives toward −X, so the wreckage flies away
// from the strip, the ramp and the pads. Each drum is a PINNED debris body (outside DEBRIS_CAP);
// this block owns them, and leaving the lab removes them. (Its constants sit up by the main menu:
// the menu is live while the module body is still building the world, and lists the cube's size.)
function _buildBarrelCube (side = BARREL_CUBE_SIDE, count = side * side * BARREL_CUBE_LAYERS) {
  _clearBarrelCube()
  const layout = cubeLayout(count, side)
  const bodies = debrisSystem.spawnStack('barrel', { x: BARREL_CUBE_X, y: 0, z: BARREL_CUBE_Z }, layout, true)
  _barrelCube = { bodies, side, count }
  const nearFace = BARREL_CUBE_X + Math.max(...layout.map(p => p.x)) + STACK_RADIUS
  _buildKick(nearFace + KICK_GAP, BARREL_CUBE_Z)
  teleportToGround(nearFace + BARREL_CUBE_RUNUP, BARREL_CUBE_Z, Math.PI / 2, 0.5)   // heading π/2 faces −X
  labSystem.status = `barrel cube: ${bodies.length} drums dead ahead \u2014 floor it \u00b7 R stacks a fresh one`
}

function _clearBarrelCube () {
  if (_barrelCube) debrisSystem.remove(_barrelCube.bodies)
  _barrelCube = null
  if (_kick) {
    physicsEngine.destroyBody(_kick.body)
    scene.remove(_kick.mesh)
    _kick.mesh.geometry.dispose(); _kick.mesh.material.dispose()
    _kick = null
  }
}

// The kick ramp (owner, 2026-10-14): a small 7° wedge across the run-up, its lip 11.3 m short of the
// cube, so the truck arrives airborne and nose-high. ONE corner list is the wheels' analytic
// triangles, the engine hull (chassis and drums) and the mesh — MESH == PHYSICS by construction.
// The incline runs on under the slab (KICK_UNDERRUN), as the lab ramp's does, so a tire meets a
// face rather than the toe's edge.
const KICK_ANGLE    = 7 * Math.PI / 180
const KICK_LEN      = 6                 // m of incline above the slab → lip 0.74 m
const KICK_UNDERRUN = 0.5               // m of incline buried below it
const KICK_HALF_W   = 3                 // m — 6 m wide, the lab ramp's width
const KICK_GAP      = 11.3              // m (~37 ft) — lip to the cube's near face

/** Build the kick ramp with its lip at xLip, centred on z, rising toward −X (the run-up's direction). */
function _buildKick (xLip, z) {
  const tan = Math.tan(KICK_ANGLE), h = KICK_LEN * tan, y0 = -KICK_UNDERRUN * tan
  const x0 = xLip + KICK_LEN + KICK_UNDERRUN, zL = z - KICK_HALF_W, zR = z + KICK_HALF_W
  const TL = [x0, y0, zL], TR = [x0, y0, zR], LL = [xLip, h, zL], LR = [xLip, h, zR]
  const BL = [xLip, y0, zL], BR = [xLip, y0, zR]
  // Wound outward: incline (up, toward the toe), lip wall (−X), sides (∓Z). The base is under the slab.
  const tris = [[TL, LR, TR], [TL, LL, LR], [LL, BR, LR], [LL, BL, BR], [TL, BL, LL], [TR, LR, BR]]
  const body = physicsEngine.createBody({ type: 'static', position: { x: 0, y: 0, z: 0 }, userData: { kind: 'lab-ramp' } })
  physicsEngine.addHull(body, [TL, TR, LL, LR, BL, BR].flat(), { friction: 0.8 })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(2), 3))
  geo.computeVertexNormals()      // non-indexed ⇒ one normal per face: faceted, per the art style
  const mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0x8a5030 }))   // the lab ramp's
  mesh.receiveShadow = true
  scene.add(mesh)
  _kick = { body, mesh, tris }
}

/** Main-menu entry (the scenario list): into the lab, cube up, truck seated at the run-up. */
async function _startBarrelCube () {
  _hideMainMenu()
  _enterStageLoad('stacking barrels\u2026')
  await _worldReady
  _exitStageLoad()
  _exitScenario()
  if (missionSystem?.isActive()) missionSystem.exit()
  if (storySystem.isActive()) storySystem.exit()
  if (!_labActive) enterLab()
  _buildBarrelCube()
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
  // FEAT-62: restart only means something inside a scenario.
  const restartBtn = document.getElementById('pm-restart')
  if (restartBtn) restartBtn.style.display = scenarioSystem.isActive() ? '' : 'none'
  _pauseOpen = true
}

function _hidePauseMenu () {
  const el = document.getElementById('pause-menu')
  if (el) el.style.display = 'none'
  _pauseOpen = false
}

// ── FEAT-62: scenarios ────────────────────────────────────────────────────────────────────────────
// An authored run on a pinned seed: seat the truck at the scenario's spawn, stand light columns at
// the start (white), the gates (cyan) and the finish (red), and hand the rules to ScenarioSystem
// (src/scenario.js). It runs in the ordinary free-roam world — no region, no day clock, no wallet —
// with teleport off (isTeleportEnabled) and the debug panel locked out, so a time is comparable.
//
// While a scenario is live the pause menu really PAUSES (the sim is held, so the clock stops), and
// R restarts the run rather than just re-seating the truck. The finish card and the run HUD reuse
// the mission panel's chrome and the Quick Job's #mission-hud readout.
const scenarioSystem = new ScenarioSystem({
  getCar: () => vehicleState.position,
  leaderboard: scenarioLeaderboard,
  onChange: () => { _syncScenarioColumns(); _renderScenarioUI() },
})

// The light columns: the POI curtain material (_ringMat — vertical alpha ramp, no tone mapping, no
// depth write) on a thin open cylinder, one each side of the road. Tall enough to read over a crest
// from a few hundred metres; sunk so a slope can never open a gap under one.
const _SCN_COL_R = 0.35     // m
const _SCN_COL_H = 14       // m
const _SCN_COL_SINK = 1.5   // m
const _scnColGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true)
const _scnColMat = {
  start:  _ringMat(0xffffff, 0.55),
  gate:   _ringMat(0x2fe6ff, 0.55),
  finish: _ringMat(0xff3030, 0.6),
}
let _scnGroup = null
let _scnPairs = []   // { kind, idx, x, z, meshes:[left,right], seated }

function _clearScenarioColumns () {
  if (_scnGroup) scene.remove(_scnGroup)   // geometry + materials are shared singletons
  _scnGroup = null
  _scnPairs = []
}
function _buildScenarioColumns (def) {
  _clearScenarioColumns()
  _scnGroup = new THREE.Group()
  _scnGroup.name = 'scenario-columns'
  scene.add(_scnGroup)
  const add = (pose, kind, idx) => {
    // Body +X (the road's right) at this heading — the yaw rotation of (1, 0, 0).
    const rx = Math.cos(pose.heading), rz = -Math.sin(pose.heading)
    const meshes = [-1, 1].map(side => {
      const m = new THREE.Mesh(_scnColGeo, _scnColMat[kind])
      m.scale.set(_SCN_COL_R, _SCN_COL_H, _SCN_COL_R)
      m.position.set(pose.x + rx * def.gateHalfWidth * side, 0, pose.z + rz * def.gateHalfWidth * side)
      m.renderOrder = 5
      _scnGroup.add(m)
      return m
    })
    _scnPairs.push({ kind, idx, x: pose.x, z: pose.z, meshes, seated: false })
  }
  add(def.start, 'start', 0)
  def.gates.forEach((g, i) => add(g, 'gate', i))
  add(def.finish, 'finish', 0)
  _seatScenarioColumns()
}
/**
 * Stand each pair on the road. A gate 1.5 km away is not streamed yet, so its first height is the
 * bare terrain; the 10 Hz poll keeps re-sampling until the road surface is under it, then stops.
 * One height per pair (the centreline), so the pair stays level across a cambered road.
 */
function _seatScenarioColumns () {
  for (const p of _scnPairs) {
    if (p.seated) continue
    const y = _groundSampleY(p.x, p.z)
    for (const m of p.meshes) m.position.y = y - _SCN_COL_SINK + _SCN_COL_H * 0.5
    if (roadSystem?.sampleRoadTopY(p.x, p.z) != null) p.seated = true
  }
}
/** A gate goes dark the moment it is crossed — the crossing confirmation. */
function _syncScenarioColumns () {
  for (const p of _scnPairs) {
    const on = p.kind !== 'gate' || !scenarioSystem.passed[p.idx]
    for (const m of p.meshes) m.visible = on
  }
}

function _renderScenarioUI () {
  const hud = document.getElementById('mission-hud')
  const panel = document.getElementById('scenario-panel')
  if (!hud || !panel) return
  const hudText = hud.querySelector('.hud-text') ?? hud
  const sc = scenarioSystem
  const show = (el, on) => { el.style.display = on ? 'block' : 'none' }
  switch (sc.state) {
    case 'countdown':
      show(panel, false); show(hud, true)
      hudText.innerHTML = `<span class="mh-count">${Math.max(1, Math.ceil(sc.countdown))}</span>`
      break
    case 'running':
      show(panel, false); show(hud, true)
      hudText.textContent = `${formatTime(sc.elapsed)}   gate ${sc.gatesPassed()} / ${sc.def.gates.length}`
      break
    case 'done': {
      show(hud, false); show(panel, true)
      const r = sc.result
      const title = document.getElementById('sp-title')
      if (title) title.textContent = `scenario · ${sc.def.name}`
      const status = !r.valid
        ? `<span class="sp-miss">missed ${r.missed} gate${r.missed === 1 ? '' : 's'} &mdash; time not recorded</span>`
        : r.newBest ? '<span class="sp-best">NEW BEST</span>'
        : r.rank ? `<span class="mp-dim">#${r.rank} on the board</span>`
        : '<span class="mp-dim">off the board</span>'
      const rows = scenarioLeaderboard.entries(sc.def.id).slice(0, 5)
        .map((e, i) => `<tr class="${r.valid && r.rank === i + 1 ? 'sp-you' : ''}"><td>${i + 1}</td>`
          + `<td>${formatTime(e.elapsed)}</td><td class="mp-dim">${new Date(e.at).toLocaleDateString()}</td></tr>`)
        .join('')
      document.getElementById('sp-body').innerHTML =
        `<span class="mp-big">${formatTime(r.elapsed)}</span><br>${status}`
        + (rows ? `<table class="sp-board">${rows}</table>` : '')
      break
    }
    default:
      show(hud, false); show(panel, false)
  }
}

function _nextFrame () { return new Promise(res => requestAnimationFrame(() => res())) }

/** One-click entry from the main menu: build/keep the seed, seat at the crest, count down. */
async function _startScenario (def) {
  _enterStageLoad(`loading ${def.name}\u2026`)
  await _worldReady
  if (scenarioSystem.isActive()) _exitScenario()
  if (missionSystem?.isActive()) missionSystem.exit()
  if (storySystem.isActive()) storySystem.exit()
  if (_labActive) exitLab()
  window.__setGameMode('scenario')
  setDebugLockout(true)
  try {
    if (parseWorldSeed(def.seed) !== worldSeed) await applyWorldSeed(def.seed)
    // AFTER the reseed: applyWorldSeed clears the override, and the rebuild's own reseat runs first.
    _spawnOverride = { align: true, x: def.spawn.x, z: def.spawn.z, heading: def.spawn.heading, drop: 0 }
    await _seatOnStreamedGround()
  } finally {
    _exitStageLoad()
  }
  _buildScenarioColumns(def)
  scenarioSystem.enter(def)
}

/**
 * Seat at the spawn override, behind the stage. The first seat may probe bare terrain — nothing is
 * streamed there yet, and the raw terrain at the crest stands ~4.7 m above the road cut, so the
 * truck would drop onto it. The loop keeps streaming around the truck while the sim is held, so
 * wait until BOTH the road is under the spawn and the ground ring has settled, then seat again on
 * the real road surface. Both, because they arrive separately: the network is built off-thread
 * (PERF-30) and the ring can report settled ~0.3 s after a 1.5 km jump, well before the road lands
 * (measured on the far restart, 2026-10-02). A few frames first so the ring has noticed the move.
 */
async function _seatOnStreamedGround () {
  await _reseatTruckAtSpawn()
  const o = _spawnOverride
  for (let i = 0; i < 10; i++) await _nextFrame()
  const t0 = performance.now()
  const ready = () => (!terrainSystem || terrainSystem.isRingSettled())
    && (!o || roadSystem?.sampleRoadTopY(o.x, o.z) != null)
  while (!ready() && performance.now() - t0 < 20000) await _nextFrame()
  await _reseatTruckAtSpawn()
}

// Beyond this the crest has streamed out from under the truck and a restart needs the staged load;
// inside it the road at the spawn is still live and the restart is instant. Well inside the 320 m
// play window, so "still streamed" is not a guess.
const SCENARIO_QUICK_RESTART_M = 150
let _scenarioRestarting = false

/** Pause-menu restart, the finish card's restart, and R while a scenario is live. */
async function _restartScenario () {
  if (!scenarioSystem.isActive() || _scenarioRestarting) return
  _hidePauseMenu()
  const sp = scenarioSystem.def.spawn
  const far = Math.hypot(vehicleState.position.x - sp.x, vehicleState.position.z - sp.z) > SCENARIO_QUICK_RESTART_M
  if (far) {
    _scenarioRestarting = true
    _enterStageLoad(`back to the top of ${scenarioSystem.def.name}\u2026`)
    try { await _seatOnStreamedGround() } finally { _exitStageLoad(); _scenarioRestarting = false }
  } else {
    void _reseatTruckAtSpawn()   // the override IS the scenario spawn; a non-story reseat is a fresh truck
  }
  scenarioSystem.restart()
}

/** Leave the scenario. Does not reseat — whatever comes next (menu, story, lab) seats the truck. */
function _exitScenario () {
  if (!scenarioSystem.isActive()) return
  scenarioSystem.exit()
  _clearScenarioColumns()
  _spawnOverride = null
  setDebugLockout(false)
  window.__setGameMode('freeroam')
}

// ── Story Mode (FEAT-43) — sandboxed gamemode ─────────────────────────────────────────────
// StorySystem owns the whole story-mode lifecycle (src/story.js). main.js only supplies the `deps`
// adapter so story.js stays free of engine imports; the region radius is story.js's own constant.
//
// The mode's defining behaviour is the ROUTING FREEZE: behind the entry loading screen the play
// RoadSystem is widened to the whole region, every connection in it is warmed on the road Worker,
// the network is registered once at that wide radius, and thereafter the frame loop makes NO
// roadSystem.update() calls at all (see isRoutingFrozen() at the call site in
// loop()). Terrain/props/water/ribbons keep streaming around the player and build against that
// frozen network — freezing THEM would pin ~1.4 GB of chunk meshes. See story.js's header.
const _storyWarmCenter = new THREE.Vector3()   // scratch for the region warm/release calls below
let _regionNetBuild = null   // PERF-30: { key, done } — the one in-flight story-region worker build
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
  setDebugLockout,
  // BUG-56 workstream C: is the seed the player typed actually playable on the parameters that are
  // loaded? story.js owns WHEN (after the region warm — you have to route it to know) and WHAT TO DO
  // (the disclaimer); main.js owns the road system, so it answers. The check itself is
  // src/world-validate.js, the SAME routine test/play-area.mjs gates on, so the game and the gate
  // cannot drift apart on what "broken" means.
  // BUG-85: pieces are cut at the PLANNERS' wall (radius less REGION_MARGIN) — see world-validate.js
  // THE STRICT CUT — so report.mainNodes is exactly the piece the planners can route on.
  validateRegion: (centre, radius) => validateArea(roadSystem, centre, discArea(radius, REGION_MARGIN), RANGER_PARAMS),
  onSeedRejected: (seed, report) => _showSeedModal(report, seed),
  hidePauseMenu: () => _hidePauseMenu(),
  setQuickJobVisible: (visible) => { const el = document.getElementById('quickjob-btn'); if (el) el.style.display = visible ? 'block' : 'none' },
  // FEAT-41: the entry load is now WATCHED, not waited out behind a black panel. This is the one
  // signal that covers every story entry (main menu, pause button, a rejected-seed retry), so the
  // stage is raised and dropped from here rather than at each call site.
  isGroundReady: () => !terrainSystem || terrainSystem.isRingSettled(),
  setLoading: (visible, text) => { if (visible) _enterStageLoad(text, LOAD_HINT_STORY); else _exitStageLoad() },
  getVehiclePosition: () => ({ x: vehicleState.position.x, z: vehicleState.position.z }),
  isMissionActive: () => !!missionSystem?.isActive(),
  /**
   * One step of the region routing warm. Widens the play RoadSystem to the region radius and pumps
   * warmBandComplete(), which dispatches every un-cached connection in the band to the road Worker
   * and returns true only when nothing is outstanding.
   * The play network is the only network there is — the private planner instance this pump used
   * to mirror was deleted when missions moved onto the play band — and it is the one the frame
   * loop is about to stop updating.
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
    // PERF-30: ONE off-thread region build replaces the route pre-warm + the synchronous
    // region-wide plan/register that froze the loading screen for the whole plan-layer cost.
    // story.js keeps pumping this until it returns true; the screen animates the whole while.
    // A stale reply (seed/params changed mid-entry) resets the state so the next pump re-issues.
    if (netClient) {
      const key = `${center.x}:${center.z}:${radius}`
      if (_regionNetBuild && _regionNetBuild.key === key && _regionNetBuild.done) {
        _regionNetBuild = null
        terrainSystem?.recarveInPlace()   // same live-ring re-bake as the sync path below
        _reseatOnRegionGround()
        return true
      }
      if (!_regionNetBuild || _regionNetBuild.key !== key) {
        const st = { key, done: false }
        _regionNetBuild = st
        roadSystem.setRadius(radius)
        netClient.buildNow('play', center.x, center.z, radius).then((ok) => {
          if (_regionNetBuild === st) { if (ok) st.done = true; else _regionNetBuild = null }
        })
      }
      return false
    }
    roadSystem.setRadius(radius)
    if (!roadSystem.warmBandComplete(_storyWarmCenter)) return false
    roadSystem.update(_storyWarmCenter)   // register + cull the whole region, once
    // ORDER MATTERS (same rule as debouncedRebuildFull): terrain bakes its carve tables at
    // chunk-request time, so any chunk built while the region was still warming carries the carve
    // of the OLD 320 m network. Re-bake the live ring against the now-registered region — ~25
    // chunks behind the loading screen, and it removes a whole class of "the road is drawn but not
    // carved" seams near the spawn. IN PLACE: the seed did not change, so the raw heights, meshes and
    // colliders all stay; disposing them left the truck on no ground for the whole refill.
    terrainSystem?.recarveInPlace()
    _reseatOnRegionGround()
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
    inventorySystem.start()          // FEAT-122: items die with the run (SM-INV-8/9)
    // …and a fresh truck. Entry flips the mode to 'story' BEFORE it reseats, so the seat's
    // free-roam damage wipe (_reseatTruckAtSpawnInner) is skipped and a truck broken in free roam
    // drove straight into the new run. Per-run state (SM-INV-8): the run starts here, so does the truck.
    damageModel.setAll(1); damageModel.publish(RANGER_PARAMS)
    vehicleState.fuel = makeFuelState(RANGER_PARAMS, RANGER_PARAMS.fuelStartFrac)   // FEAT-50: "some gas in it"
    dialogueSystem.start()           // FEAT-61: a new run hears every briefing again
    resetPaperRun()                  // …and starts back on Larry's four-house route (SM-INV-12)
    paperRouteSystem.abort()
    _renderDialogue()
    _renderPaperUI()
    // BUG-85: only the main piece hosts POIs and customers — stranded pieces get none.
    const mainNodes = storySystem.region()?.nodes ?? null
    poiSystem.build(center, radius, mainNodes)
    // FEAT-61: AFTER build() — mom is a newspaper customer, and she is a roster POI, so the roster
    // has to exist before customers() can be asked who receives a paper. Houses carve nothing and
    // touch no pads, so unlike build() this needs no re-bake behind it.
    poiSystem.buildHouses(center, radius, mainNodes)
    // FEAT-67: the mission board — AFTER build() (it reads the roster) and AFTER daySystem.start()
    // (it starts on the run's clock). A new run, a new board: nothing survives from the last one.
    offerBoard = new OfferBoard({
      seed: worldSeed, pois: poiSystem.list(), nowH: daySystem.clockH(),
    })
    // ORDER MATTERS: the roster decides where mom lives, and camping is handed that answer.
    // Mom's house is a POI with a building on it, not a camp — you can sleep there, and sleeping
    // there reuses the camp module's sleep path, which is the whole of the relationship (FEAT-60).
    campSystem.build(center, radius, poiSystem.list().find(q => q.type === 'momsHouse') ?? null)
    _rebuildPoiMarkers()
    // Only the chunks a pad reaches: pads are the one carve input that changed here. Pads never bump
    // roadGeneration, so these must be marked stale explicitly (terrain.js recarveInPlace). This was a
    // full dispose + worker refill, which discarded the warm's re-bake 1.5 s after it was queued.
    terrainSystem?.recarveInPlace(roadSystem?.storyPadReach() ?? null)
    // BUG-71: this mode FREEZES the road stream, so the adopt that normally drives the intrusion
    // sweep never comes — measured 26 props standing in the road for a whole run, idle and driving
    // alike. Go-live is the one and only moment that matters here, and it is the right one: the
    // region was just registered WHOLE at the wide radius, so every chunk scattered from here on
    // tests against the final network. One unbounded pass, behind the loading screen.
    sweepPropIntrusions(Infinity)
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
    // A job cannot outlive its region. Every exit path used to have to remember this itself, and
    // the ones that forgot are how a mission ended up running in the lab.
    if (missionSystem?.isActive()) missionSystem.exit()
    daySystem.stop()    // FEAT-47: clock off, sky handed back to free roam's noon look
    daySystem.setBlinksEnabled(false)   // …and the eyelids can never fire in free roam
    setControlAttenuation(1)            // belt-and-braces: leave the driver's inputs whole
    offerBoard?.clearRoutes()           // FEAT-67: routes hold live centerlines — never keep them across a region
    offerBoard = null                   // …and the board belongs to the run that just ended
    _dropLarryTour()
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
    // The map's streaming window is raised to the region radius when the map is opened in story
    // mode (Map2D._syncRegionWindow, BUG-68) and only ever grows — hand it back too, or free roam keeps
    // routing the region's outer rings cold for the rest of the session.
    map2d?.resetRadiusTarget()
    if (!roadSystem) return
    roadSystem.setRadius(320)   // PERF (Tier 1) play radius — matches the terrain ring
    roadSystem.update(roadStreamCenter())
  },
})

// ── Story-mode seed prompt (FEAT-43) ──────────────────────────────────────────────────────
/**
 * Open the story seed prompt. With a `report` it opens in its REFUSED state: the seed just entered
 * routed a region that is severed or carries a road nothing could give a profile to, so the player
 * is told plainly and asked for a different one. Nothing rerolls — that was the owner's ruling
 * (2026-08-27), and it is why story mode does not need a nine-tile play area to be safe.
 */
// FEAT-41: the same dialog now fronts FREE ROAM as well as story mode — both are "pick a world and
// go", and there was no reason for free roam to be the one mode you could not choose a seed for.
// The refusal block below stays story-only: free roam has no region to validate, so there is nothing
// for world-validate.js to refuse.
function _showSeedModal (report = null, rejectedSeed = null, mode = 'story') {
  _seedModalMode = mode
  const el = document.getElementById('story-seed-modal')
  if (el) {
    el.style.display = 'flex'
    el.classList.toggle('rejected', !!report)
  }
  const title = document.getElementById('ss-title')
  if (title) title.textContent = mode === 'freeroam' ? 'free roam' : 'story mode'
  if (report) {
    const why = document.getElementById('ss-reject-why')
    const detail = document.getElementById('ss-reject-detail')
    if (why) why.textContent = `Seed "${rejectedSeed}": ${unplayableReason(report)}.`
    if (detail) {
      const bits = [`${report.runs} roads · ${report.km.toFixed(0)} km in the region`]
      if (report.components > 1) bits.push(`${report.components} disconnected pieces`)
      if (report.condemned.length) bits.push(`${report.condemned.length} unsolvable: ${report.condemned.slice(0, 3).join(', ')}`)
      bits.push(`max road grade ${((RANGER_PARAMS.roadV2?.gMaxRoad ?? 0.24) * 100).toFixed(0)} %`)
      detail.textContent = bits.join('  ·  ')
    }
  }
  // Always blank (owner, 2026-09-06): the placeholder offers a random world, and pre-filling the
  // standing seed would quietly make "just press start" mean "replay the same world forever".
  const inp = document.getElementById('ss-seed')
  if (inp) { inp.value = ''; inp.focus() }
}

/** Blank ⇒ a fresh random world. Any other text is a seed verbatim (parseWorldSeed hashes it). */
function _resolveSeedInput () {
  const raw = (document.getElementById('ss-seed')?.value ?? '').trim()
  return raw || String((Math.random() * 0x100000000) >>> 0)
}
/**
 * Back out of the seed prompt. Backing out of a REFUSED story seed also leaves story mode — the
 * alternative is standing in a region the playability check just rejected.
 */
function _cancelSeedModal () {
  if (!_worldInit) { _hideSeedModal(); return }   // nothing to back out of yet
  const wasRejected = storySystem.isSeedRejected()
  _hideSeedModal()
  if (wasRejected) storySystem.exit()
}
function _hideSeedModal () {
  const el = document.getElementById('story-seed-modal')
  if (el) { el.style.display = 'none'; el.classList.remove('rejected') }
}
// ── FEAT-41: the menu / loading screen state machine ─────────────────────────────────────────────
// Three states, all sharing ONE 3D scene (src/stage.js): the menu (stage + buttons), a load (stage +
// caption strip) and the world (stage off). The stage is what the player looks at for the first two,
// which is why loop() renders it INSTEAD of the world scene rather than behind it.
function _showMainMenu () {
  map2d.reset()   // the menu always leaves the map closed and cleared, whatever comes next
  _hidePauseMenu()
  _hideSeedModal()
  const cap = document.getElementById('load-caption')
  if (cap) cap.style.display = 'none'
  const el = document.getElementById('main-menu')
  if (el) { el.style.display = 'flex'; el.classList.remove('settings', 'scenarios') }
  menuStage.setActive(true)   // re-runs the drop when arriving from the world; a no-op at boot
  _simHeld = true
  document.body.classList.add('stage-on')
}
function _hideMainMenu () {
  const el = document.getElementById('main-menu')
  if (el) { el.style.display = 'none'; el.classList.remove('settings', 'scenarios') }
}
// The region-freeze blurb is a STORY-MODE fact; it was showing on free-roam and lab loads too.
const LOAD_HINT_STORY = 'the whole region is routed once, up front — after this the roads are frozen and no routing runs while you drive.'

/** Raise the stage over a load. Idempotent — story.js pumps setLoading with fresh text each stage. */
function _enterStageLoad (text, hint = '') {
  _hideMainMenu()
  menuStage.setActive(true)
  _simHeld = true
  document.body.classList.add('stage-on')
  const cap = document.getElementById('load-caption')
  if (cap) cap.style.display = 'flex'
  const t = document.getElementById('sl-text')
  if (t && text) t.textContent = text
  const hintEl = document.getElementById('sl-hint')
  if (hintEl) hintEl.textContent = hint
}
/** The world is ready: drop the stage and hand the screen (and the fixed-step block) back. */
function _exitStageLoad () {
  const cap = document.getElementById('load-caption')
  if (cap) cap.style.display = 'none'
  _hideMainMenu()
  menuStage.setActive(false)
  _simHeld = false
  document.body.classList.remove('stage-on')
  // The chase camera is a spring and it has been sitting wherever the last mode left it. Without
  // this it slides onto the truck over about a second the moment the world appears, which reads as
  // the camera "arriving" rather than the world simply being there (owner, 2026-09-06).
  snapCamera()
}

/**
 * Free roam on a chosen seed. The world standing behind the menu was built on the boot seed, so
 * picking that same one costs nothing but a re-seat; anything else pays one full rebuild — behind
 * the stage, which is the entire point of the stage existing.
 */
async function _startFreeRoam (seedStr) {
  if (storySystem.isActive()) storySystem.exit()
  if (_labActive) exitLab()
  window.__setGameMode('freeroam')
  try {
    if (parseWorldSeed(seedStr) !== worldSeed) await applyWorldSeed(seedStr)
    else await _reseatTruckAtSpawn()
  } finally {
    _exitStageLoad()   // a failed reseat must not leave the loading stage up with the sim held
  }
}

async function _startStoryFromModal () {
  const seed = _resolveSeedInput()
  _hideSeedModal()
  map2d.reset()   // story always starts on a fresh map, even on the seed already loaded
  // The caption goes up BEFORE the await, not after: the player clicked, and the whole point of
  // wiring these buttons early is that the click is acknowledged even while init is still running.
  _enterStageLoad('building the world\u2026')
  await _worldReady
  if (_seedModalMode === 'freeroam') { await _startFreeRoam(seed); return }
  if (_labActive) exitLab()
  _enterStageLoad('entering the region\u2026', LOAD_HINT_STORY)   // ahead of enter(), so the world is never on screen mid-reseed
  gaugeCluster.seedOdometer()   // FEAT-49: a story entry is a fresh run — fresh jalopy, fresh mileage
  damageModel.engineTempC = DAMAGE_PARAMS.tempAmbientC   // FEAT-51: ...and a cold engine
  storySystem.enter(seed)
}
// Quick Job launcher — the beta mission generator, now surfaced only inside story mode.
// Same gates as _poiInReach: you cannot take work while doing work. Ungated, a click mid-job reset
// a TAKEN board job to 'generating' (no cancel, no slot lock) or started a mission beside a live
// paper route — the two siblings that must never run at once.
document.getElementById('quickjob-btn')?.addEventListener('click', () => {
  if (!missionSystem || missionSystem.state !== 'idle' || paperRouteSystem.isActive() || _campUi) return
  missionSystem.enter()
})

// Wire pause-menu buttons. Null-guarded (?.) like every other DOM lookup in this file:
// an unguarded deref would throw at module-eval and abort the whole sim if an id is
// renamed/removed from index.html (WR-04).
document.getElementById('pm-resume')?.addEventListener('click', () => _hidePauseMenu())
// FEAT-62: scenario restart (the button is only shown inside a scenario) and the finish card.
document.getElementById('pm-restart')?.addEventListener('click', () => { void _restartScenario() })
document.getElementById('sp-restart')?.addEventListener('click', () => { void _restartScenario() })
document.getElementById('sp-menu')?.addEventListener('click', () => { _exitScenario(); _showMainMenu() })
// A clicked button keeps focus, and a focused button eats Space — the brake — as another click. The
// #job-cancel trick: never take focus, so a restart cannot fire again under the next brake.
for (const id of ['pm-restart', 'sp-restart', 'sp-menu']) {
  document.getElementById(id)?.addEventListener('mousedown', (e) => e.preventDefault())
}
// FEAT-67: CANCEL the job in hand — canon: the player phones the customer and cancels on them. The
// only thing that cancels a job (owner, 2026-09-27): leaving the route or region never does, and the
// pause menu's exits end the whole run rather than cancel. The giver's slot then locks for the
// offer's FULL expiry length from now — cancelling an offer that already expired is not free.
//
// THE BUTTON is "abandon job", sitting to the right of the run timer in #mission-hud / #paper-hud
// (owner, 2026-10-02 — it used to be a pause-menu entry). ONE element, moved into whichever HUD is
// live by _syncJobCancel. Two clicks: the first ARMS it for JOB_CANCEL_ARM_S ("confirm?"),
// the second cancels — the slot lock makes a stray click expensive. It never takes focus
// (mousedown is prevented, tabindex -1), because a focused button eats Space, which is the brake.
// Only a PARKED truck can abandon (owner, 2026-10-15): moving, the button reads "park to abandon"
// and does nothing. Either way the job ends on its result card — "abandoned", $0, and the cargo.
const JOB_CANCEL_ARM_S = 3
let _jobCancelArm = 0   // setTimeout handle while armed, 0 when not
function _disarmJobCancel () {
  if (_jobCancelArm) clearTimeout(_jobCancelArm)
  _jobCancelArm = 0
  const b = document.getElementById('job-cancel')
  if (b) { b.classList.remove('armed'); b.innerHTML = _jobCancelLabel() }
}
// FEAT-96: on a strapped job the button reads "clean up cargo" — the load has to come off before the
// job can go, and that costs CLEANUP_H on the day clock. Same two-click confirm, same slot lock.
const CLEANUP_H = 1
// FEAT-113: a job past its deadline is dead in hand. The button turns into "mission expired" — ONE
// click, an acknowledgement rather than a choice, and only while parked: the expired card must never
// pop up mid-drive (owner, 2026-10-15). A strapped load still has to come off (CLEANUP_H).
function _expiredJob () {
  return paperRouteSystem.isCarrying() ? !!paperRouteSystem.run?.expired
    : !!missionSystem?.isOnJob() && !!missionSystem.mission?.expired
}
function _strappedJob () {
  return !paperRouteSystem.isCarrying() && !!missionSystem?.isOnJob() && !!missionSystem.mission?.load
}
function _jobCancelLabel () {
  if (_expiredJob()) return vehicleState.parked ? 'mission expired' : parkPrompt('mission expired')   // FEAT-113
  if (!vehicleState.parked) return parkPrompt('park to abandon')
  // An intact strapped load still costs the clean-up hour, but it reads "abandon job" (owner,
  // 2026-10-15: "clean up" only once the cargo is actually wrecked).
  return _strappedJob() && missionSystem.mission.failed ? 'cargo destroyed · clean up' : 'abandon job'   // FEAT-97
}
function _syncJobCancel (hud, on) {
  const b = document.getElementById('job-cancel')
  if (!b) return
  if (on && b.parentElement !== hud) { _disarmJobCancel(); hud.appendChild(b) }
  if (b.parentElement !== hud) return   // the other HUD owns it; leave it alone
  b.style.display = on ? '' : 'none'
  if ((!on || !vehicleState.parked) && _jobCancelArm) _disarmJobCancel()
  if (on && !_jobCancelArm) { const t = _jobCancelLabel(); if (b.innerHTML !== t) b.innerHTML = t }
  b.classList.toggle('unparked', !vehicleState.parked)
}
/** What became of the load, for the abandoned card — null when the job carries none (yet). */
function _abandonCargo () {
  const m = missionSystem?.mission
  if (_haul && _haul.mission === m) return { kind: 'haul', aboard: _haulAboard(), loaded: m.bundles }
  if (_freight && _freight.mission === m) {
    return m.fragile ? { kind: 'fragile', health: _freight.health?.health ?? 0 } : { kind: 'load' }
  }
  return null
}
document.getElementById('job-cancel')?.addEventListener('mousedown', (e) => e.preventDefault())
document.getElementById('job-cancel')?.addEventListener('click', (e) => {
  const b = e.currentTarget
  if (!vehicleState.parked) return
  if (_expiredJob()) {   // FEAT-113: one click — an acknowledgement, not a choice
    _disarmJobCancel()
    if (_strappedJob()) daySystem.advanceMinutes(CLEANUP_H * 60)
    // No abandon(): the board already locked the slot at the deadline itself.
    if (paperRouteSystem.isCarrying()) paperRouteSystem.expire(); else missionSystem.expire()
    return
  }
  if (!_jobCancelArm) {
    _jobCancelArm = setTimeout(_disarmJobCancel, JOB_CANCEL_ARM_S * 1000)
    b.classList.add('armed')
    b.innerHTML = _strappedJob() ? `confirm? <small>· takes ${CLEANUP_H} hour</small>` : 'confirm?'   // FEAT-96: say the clean-up cost
    return
  }
  _disarmJobCancel()
  if (_strappedJob()) daySystem.advanceMinutes(CLEANUP_H * 60)   // before the cancel: the slot locks from the clean-up's end
  const id = paperRouteSystem.isCarrying() ? paperRouteSystem.cancel() : missionSystem?.cancel(_abandonCargo())
  if (id) offerBoard?.abandon(id, daySystem.clockH())
})
// FEAT-41: back out to the main menu. The mode is left FIRST — dropping to a menu while story mode
// still holds a frozen region and a live day clock would leave both running behind the scene.
function _backToMenu () {
  _exitScenario()
  if (missionSystem?.isActive()) missionSystem.exit()
  if (storySystem.isActive()) storySystem.exit()
  if (_labActive) exitLab()
  _showMainMenu()
}
document.getElementById('pm-menu')?.addEventListener('click', _backToMenu)
// Story mode is opt-in from this menu ONLY — a first-time visitor lands in free roam and is
// never thrust into an unfinished mode. Switching the game mode also disables free-roam-only
// affordances (teleport), which is the point of _gameMode existing.
document.getElementById('pm-lab')?.addEventListener('click', () => {
  if (_labActive) { exitLab(); return }
  _exitScenario()
  if (missionSystem?.isActive()) missionSystem.exit()   // don't run a mission inside the lab
  // …nor a story run: its day clock, wallet and region wall would all stay live around a truck
  // teleported to the lab strip, and exitLab would then declare free roam inside an active story.
  if (storySystem.isActive()) storySystem.exit()
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
  _exitScenario()
  _hidePauseMenu()
  _showSeedModal()
})
// (grid world's "grid world" / "return to world" buttons were removed with it — the lab's own
// toggle is the way in and out of a flat world now.)

// ── Free-cam "teleport here" button (feature/teleport) ────────────────────────────────────
// Drops the truck at the EXACT free-cam position (off-road / floating allowed) facing the camera
// heading, and sets that as the spawn. The button's visibility is driven by the render loop
// (shown only in free-cam, in free roam or story — isTeleportEnabled). T fires the same action while flying (pointer-lock hides
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
  // FEAT-41: the seed dialog gets Esc FIRST, or it is a dead end. The input's own handler only
  // fires while the input has focus, and the stage guard below would otherwise swallow the key —
  // so a player who clicked away from the field had no way back out of the dialog at all.
  // Same semantics as the cancel button: backing out of a REFUSED story seed leaves story mode,
  // because the alternative is standing in a region the playability check just rejected.
  const seedModal = document.getElementById('story-seed-modal')
  if (seedModal && seedModal.style.display === 'flex') { _cancelSeedModal(); return }
  // FEAT-90: an open damage screen takes Esc too — one press closes it, the next one pauses.
  if (damageScreen.isOpen) { damageScreen.close(); return }
  if (inventoryScreen.isOpen) { inventoryScreen.close(); return }   // FEAT-122: same rule
  // There is nothing to pause while the stage owns the screen — the sim is held, and the pause menu
  // is one of the panels body.stage-on hides, so it would open invisibly. Esc steps back out of the
  // settings page and is otherwise inert until the world is handed back.
  if (menuStage.isActive()) { document.getElementById('main-menu')?.classList.remove('settings', 'scenarios'); return }
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
  session:             _captureSession(),
}))

/**
 * Everything about the live session a bug report can use, as plain JSON — written into BOTH capture
 * kinds (P = place, \ = event) as `session` (owner, 2026-10-03: "the P dump should be giving us all
 * this info"). Each block is guarded so a system that is not up yet costs a null, never a throw.
 */
function _captureSession () {
  const vs = vehicleState
  const r3 = (v) => Math.round(v * 1000) / 1000
  const vec = (v) => v ? { x: r3(v.x), y: r3(v.y), z: r3(v.z) } : null
  const arr = (a, d = 3) => Array.isArray(a) ? a.map((v) => +(+v).toFixed(d)) : null
  const q = vs.quaternion
  const sc = roadStreamCenter()
  let hitches = null
  try { const h = perfHitchReport(); hitches = { frames: h.frames, thresholdMs: h.thresholdMs, quiet: h.quiet, hitches: h.hitches.slice(-20) } } catch { /* profiler off */ }
  return {
    capturedAt:   new Date().toISOString(),
    url:          location.href,
    uptimeS:      r3(performance.now() / 1000),
    simTimeS:     r3(simTime),
    gameMode:     _gameMode,
    quality:      _qualityName,
    cameraMode:   getCameraMode(),
    simHeld:      _simHeld,
    spawnOverride: _spawnOverride ? { align: _spawnOverride.align, x: r3(_spawnOverride.x), z: r3(_spawnOverride.z) } : null,
    truck: {
      position: vec(vs.position), velocity: vec(vs.velocity), angularVelocity: vec(vs.angularVelocity),
      quaternion: q ? { x: r3(q.x), y: r3(q.y), z: r3(q.z), w: r3(q.w) } : null,
      speedMs: r3(Math.hypot(vs.velocity.x, vs.velocity.y, vs.velocity.z)),
      steerAngle: r3(vs.steerAngle), throttle: r3(vs.throttle), brake: r3(vs.brake),
      handbrake: !!vs.handbrake, parked: !!vs.parked, ignition: vs.ignition?.state ?? null,
      gear: vs.drivetrain?.gear ?? null, engineRPM: vs.drivetrain ? Math.round(vs.drivetrain.engineRPM) : null,
      strutComp: arr(vs.strutComp), tireFz: arr(RANGER_PARAMS._tireFz, 0), wheelOmega: arr(vs.wheelOmega, 2),
      slipVel: arr(vs.slipVel, 2), rimForce: arr(vs.rimForce, 0), rimForceRoad: arr(vs.rimForceRoad, 0), bumpForce: arr(vs.bumpForce, 0),
      submerged: !!vs.submerged, mass: RANGER_PARAMS.mass,
    },
    damage: damageModel ? {
      enabled: !!DAMAGE_PARAMS.enabled,
      condition: Object.fromEntries(Object.entries(damageModel.condition).map(([k, v]) => [k, +v.toFixed(3)])),
      flat: damageModel.flat.slice(), engineTempC: +damageModel.engineTempC.toFixed(1),
      toeOffsetDeg: arr(damageModel.toeOffsetDeg, 2), camberOffsetDeg: arr(damageModel.camberOffsetDeg, 2),
    } : null,
    story: storySystem ? {
      active: storySystem.isActive(), entering: storySystem.isEntering(), phase: storySystem._phase ?? null,
      region: storySystem.region?.() ?? null, day: daySystem?.day?.() ?? null,
      mission: missionSystem ? { state: missionSystem.state ?? null } : null,
      paperRoute: paperRouteSystem?.isActive?.() ?? null,
    } : null,
    streaming: {
      streamCenter: sc ? { x: r3(sc.x), z: r3(sc.z) } : null,
      terrain: terrainSystem ? {
        chunks: terrainSystem._chunkMap.size, ring: terrainSystem._ringRadius, warm: terrainSystem._warmMargin,
        ringSettled: terrainSystem.isRingSettled(), filling: terrainSystem.isFilling(),
      } : null,
      road: roadSystem ? {
        radius: roadSystem._proto.radius, runs: roadSystem._network.size, networkRev: roadSystem._networkRev,
        generation: roadSystem.roadGeneration(), routeEpoch: roadSystem.routeEpoch(),
        center: roadSystem._networkCenter ? { x: r3(roadSystem._networkCenter.x), z: r3(roadSystem._networkCenter.z) } : null,
        lastAdoptDirty: roadSystem.lastAdoptDirty()?.length ?? 0,
      } : null,
      netClient: netClient ? {
        active: netClient._active ? { id: netClient._active.id, reason: netClient._active.reason, x: r3(netClient._active.x), z: r3(netClient._active.z), radius: netClient._active.radius } : null,
        queued: netClient._queue.length,
      } : null,
      roadTiles: roadMeshSystem ? { built: roadMeshSystem._tileMeshMap.size, pending: roadMeshSystem._pendingQueue.length } : null,
      props: propSystem ? { chunks: propSystem.liveChunkCount(), queued: propSystem._scatterQueue.length, scattering: !!propSystem._activeScatter } : null,
      shadowBake: shadowBake ? { enabled: shadowBake.enabled, pendingTiles: shadowBake._dirty.length } : null,
    },
    sky: skySystem ? { hour: +SKY_CYCLE.hour.toFixed(2), playing: !!SKY_CYCLE.playing, sun: vec(skySystem.sunDirection) } : null,
    perf: hitches,
  }
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
      session: _captureSession(),
    })
    downloadJSON(capture, 'autos-capture-' + Date.now() + '.json')
    console.log(`[capture] place @(${px.toFixed(1)},${pz.toFixed(1)}) run ${capture.place.observed.runKey} gradeY ${capture.place.observed.gradeY?.toFixed(2)} minR ${capture.place.observed.minRadius?.toFixed(1)}`)
  }
})

// ── Game loop ─────────────────────────────────────────────────────────────────
// Fixed-timestep accumulator (RESEARCH §Pattern 2, gafferongames.com/post/fix_your_timestep/)
// PHYSICS_DT = 1/60s; MAX_FRAME_TIME = 0.25s (T-01-04: spiral-of-death mitigation)
let _ignEdge = null   // S-61: the ignition catch/shutoff edge, latched per step, played once per frame
function loop () {
  requestAnimationFrame(loop)
  perfFrameBegin()   // PERF-26: closes out the previous frame's attribution, arms this one (no-op unless ?hitch)
  if (!_firstFrameMarked) {
    _firstFrameMarked = true
    // S-65: currentTime was stamped at module evaluation, seconds before the top-level awaits let
    // this loop start — the first frame would owe a clamped 0.25 s (15 catch-up steps under ?nomenu).
    currentTime = performance.now() / 1000
    perfMark('first animate frame')  // D-arc
    // FEAT-41: one rAF loop, not two. The stage has been animating on its own since just after the
    // renderer was made; from here it is a passenger and this loop drives it.
    menuStage.stopStandalone()
    // PERF-30's boot-splash hide normally fires from the stage's first painted frame (so the splash
    // never lifts onto an empty canvas). This is the fallback for the one case that cannot: the
    // stage failed to build at all. Without it a stage-side error would leave the splash up forever
    // over a perfectly playable game.
    const bl = document.getElementById('boot-loading')
    if (bl) bl.style.display = 'none'
  }

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
  // FEAT-41: sim hold. Zeroing the accumulator is not optional — leaving the debt to grow while the
  // menu is up would fire a spiral of catch-up steps the instant the world was handed back.
  // The interpolation pose must follow too. With no step running, _prevRenderPos is never refreshed,
  // and at alpha 0 the render pose IS _prevRenderPos — so a reseat behind the stage (story entry,
  // free-roam reseed) left the rendered truck, and the terrain ring streaming around it, parked at the
  // OLD spawn for the whole load (measured 2026-09-22: ring built ~280 m from the truck, then
  // rebuilt from scratch the moment the stage lifted).
  // FEAT-62: a scenario's pause menu is a real pause — its clock must not run behind the menu.
  if (_simHeld || _genHold || (_pauseOpen && scenarioSystem.isActive())) {   // PERF-33: the freeze guard holds the sim the same way
    accumulator = 0
    _prevRenderPos.copy(vehicleState.position)
    _prevRenderQuat.copy(vehicleState.quaternion)
  }
  damageHUD.update(frameTime)   // SM-3 diagnostic readout — returns on the first line while hidden
  damageScreen.update(frameTime)   // FEAT-90: alert detection + icon tint at 10 Hz
  inventoryScreen.update()         // FEAT-122: the park zone's lock; closes when the truck drives off
  _fragileBlink(frameTime)   // FEAT-97: the load's red hit blink fading out

  // PERF-26: bucket the whole fixed-step block. Without it the catch-up substeps a hitch frame owes
  // (a 150 ms frame is followed by one paying ~9 physics steps) land in no bucket at all, and the
  // hitch report shows a fat frame with nothing explaining it.
  const _ptP = performance.now()
  while (accumulator >= PHYSICS_DT) {
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
    setLaunchHold(!!missionSystem?.isHeld() || scenarioSystem.isHeld() || !!_campUi || _campBusy)

    const resetRequested = updateVehicle(vehicleState, RANGER_PARAMS, PHYSICS_DT)
    // S-61: stepIgnition clears ignition.event at the top of EVERY step, so on a 2+ step frame a
    // catch on step 1 is gone by the time the frame reads it. Latch the edge here, per step.
    const ignEv = vehicleState.ignition?.event
    if (ignEv === 'catch' || ignEv === 'shutoff') _ignEdge = ignEv
    if (resetRequested) {
      // R-12: R while camped breaks camp first — the same close the dialogue's "break camp" button
      // runs (un-digs the pad, hides the fire, drops the camera focus, releases the FEAT-118 clock
      // hold). A fade in flight checks that its dialogue is still up, so this is safe mid-fade too.
      if (_campUi) _closeCampUi()
      // R re-seats the truck to a driveable state ONLY — it does NOT touch any tunable
      // params or slider values. All tuning (vehicle AND terrain) stays exactly as set;
      // a full page reload is the only way to revert params to file defaults.
      // Phase 7 (D-15): canonical re-seat via resolveSpawn + analyticHeight ground-probe.
      // _reseatTruckAtSpawn() replaces the former inline reset block — picks a low-slope spawn
      // using the current worldSeed, seats at static equilibrium height, zeros all motion.
      // Async since QUAL-14 (spawn bands warm on the worker pool); fire-and-forget — with the
      // route cache warm this resolves within a frame or two.
      // FEAT-62: inside a scenario R is RESTART — the same seat plus a fresh count and clean gates.
      if (scenarioSystem.isActive()) void _restartScenario()
      else if (_barrelCube) _buildBarrelCube(_barrelCube.side, _barrelCube.count)   // a fresh cube AND a fresh run-up
      else void _reseatTruckAtSpawn()
    }

    // FEAT-31: lab gate crossings. One segment test per gate, clocked off the fixed step so a
    // frame spike can't skip a gate the truck actually drove through.
    if (_labActive) labSystem.update(PHYSICS_DT)

    // Story mode (beta): countdown tick + arrival check. Two distance checks — no routing, no
    // par math (that ran once at mission-offer time). Clocked off the fixed step, not wall time.
    // FEAT-113: the day clock steps HERE, inside the fixed step, so the mission clocks below read
    // a world clock that has moved exactly this step — arrival grades on this step's time, and the
    // driven trace never stamps two rows with one time. Fixed-step also means a PERF-32 overload
    // (dropped catch-up steps, slow motion) never bills world time for road the truck did not drive.
    // FEAT-118: a pitched camp (or mom's) is a planning pause — idle there, the clock and energy
    // hold until an action (sleep, break camp) spends or resumes it. The confirm face is not camp yet.
    if (!_campUi || _campUi.mode === 'confirm') daySystem.update(PHYSICS_DT)
    if (missionSystem?.isActive()) {
      missionSystem.update(PHYSICS_DT)
    }
    // FEAT-61: the start threshold, then the route's clock. One distance check or one add — same
    // discipline as above, and clocked off the fixed step so a frame spike can neither stretch the
    // elapsed time nor skip the line that starts it.
    if (paperRouteSystem.isCarrying()) paperRouteSystem.update(PHYSICS_DT)
    // FEAT-62: the scenario's countdown, clock and line crossings — same fixed-step discipline.
    if (scenarioSystem.isActive()) scenarioSystem.update(PHYSICS_DT)

    _prevRenderPos.copy(vehicleState.position)
    _prevRenderQuat.copy(vehicleState.quaternion)

    // FEAT-06b: bush soft-drag — a capped, velocity-opposing resistive force while the chassis
    // overlaps a bush volume (never a hard contact). Applied as an impulse on the body velocity
    // each physics step: dv = F/m · dt. propSystem caps F at collision.bush.fMax (~200 N) so it's a
    // felt drag, not a stop. No-op (returns 0) when no bush overlaps the CG.
    if (!_labActive && propSystem) {
      const p = vehicleState.position, v = vehicleState.velocity
      const f = propSystem.bushDragForce(p.x, p.y, p.z, v.x, v.y, v.z, _bushDragF)
      if (f.x || f.y || f.z) {
        const k = PHYSICS_DT / RANGER_PARAMS.mass
        v.x += f.x * k; v.y += f.y * k; v.z += f.z * k
      }
    }

    // FEAT-36: debris pre-step — render snapshot + cargo-in-bed bullet flag (see debris.js).
    debrisSystem.beforeStep(vehicleChassis, DEFAULT_VEHICLE_MODEL.bed ?? null)
    stepPhysics(vehicleState, RANGER_PARAMS, PHYSICS_DT, queryContacts, engineCtx)
    _haulStep()   // FEAT-88: the haul load drops on the fixed step, like everything that touches physics
    _fragileStep()   // FEAT-97: the fragile load's shocks, on the step that produced them
    // SM-3: integrate component wear on the SAME fixed step the physics ran, so condition is
    // framerate-independent like everything else (INFRA-03 determinism). Reads the honest signals
    // stepPhysics just published; writes the effect multipliers the NEXT step will read.
    // Fold the engine's wheel-core contacts into rimForce BEFORE the damage step reads it — the
    // soft path wrote its own rim contacts during stepPhysics and this maxes on top.
    const hit = readRimStrikes(physicsEngine, vehicleChassis, vehicleState.rimForce, PHYSICS_DT)
    damageModel.tireCondCap = tireCondCap(TRUCK, (_freight?.massKg ?? 0) + inventorySystem.stowedKg())   // FEAT-112: an overloaded bed pops tires (FEAT-122: stowed kit counts)
    damageModel.step(vehicleState, RANGER_PARAMS, PHYSICS_DT)
    _stepFuelStop(PHYSICS_DT)   // FEAT-50: an open pump fills on the fixed step (pauses with the game)
    // SM-3: one bang per puncture. Drained rather than polled so a tire that pops during a
    // catch-up burst of physics steps still gets exactly one.
    if (damageModel.popped.length) { damageModel.drainPops(); playTireBlowout() }
    // SM-3 collision damage: hand the hardest contact on the chassis this step (`hit`, read with
    // the rim strikes above) to the damage model, which decides whether that is an impact (see
    // feedContact — a contact is not).
    // classifyImpactRegion turns the body-local point/normal into an armor region and returns null
    // for ground contacts, so driving over terrain never registers as a crash.
    {
      const landed = damageModel.feedContact(
        classifyImpactRegion(hit.point, hit.normal), hit.impulse, RANGER_PARAMS.mass, PHYSICS_DT,
        vehicleState.velocity)
      if (landed) { damageHUD.noteImpact(landed); damageScreen.alert() }
    }
    simTime += PHYSICS_DT
    // While recording, log the ground the browser sampled (gated on isRecording() so normal play
    // pays nothing). The post-hoc road-resolution path lives in test/replay.mjs.
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
      roadDebug = { gh, wheelGh }
    }
    captureFrame(simTime, vehicleState, vehicleState.wheelDebug, roadDebug)
    accumulator -= PHYSICS_DT

    // PERF-32: WALL-CLOCK CATCH-UP BUDGET — the spiral brake the MAX_FRAME_TIME clamp is not.
    //
    // The clamp bounds the debt one frame may ADD (0.25 s), which is 15 catch-up steps: it caps how
    // deep the hole gets, not whether we are digging. The runaway needs no big frame to start. Once
    // ONE step costs more wall time than PHYSICS_DT of sim time, every frame ends owing more than it
    // paid, so the next frame dispatches two steps, then three, and it settles at the clamp — 15
    // steps per frame, ~4 fps, self-sustaining until the cost goes away. That is the PERF-32 lock: at
    // a deg-2 connector the ground query alone was 8.5 ms of a 16.7 ms step, and a near-stationary
    // truck (the capture is creeping at 0.5 m/s) sits in it. carveHint's memo comment has named this
    // failure since PERF-24 — "the death-spiral fires when the truck is ~STATIONARY (a slow frame
    // dispatches many catch-up steps at one spot)" — as a thing to be survived by making each step
    // cheaper. Cheaper steps raise the bar; they do not remove it, because the bar is a ratio.
    //
    // So measure the ratio directly instead of guessing a step count: if the loop has already burned
    // a full PHYSICS_DT of WALL time, real time is outrunning us and further catch-up cannot converge
    // — abandon the debt and render. The first step is unconditional, so the sim never stalls; under
    // overload it runs in slow motion (sim time lags wall time), which is the standard trade and the
    // one the 0.25 s clamp already makes, just without waiting for 4 fps to make it. Costs nothing on
    // a healthy frame, where the loop exits on `accumulator < PHYSICS_DT` long before the budget.
    if (accumulator >= PHYSICS_DT && performance.now() - _ptP > PHYSICS_DT * 1000) {
      accumulator = 0
      break
    }
  }
  perfAdd('frame.physics', performance.now() - _ptP)

  // PERF-26 INSTRUMENT (measurement only): close the attribution GAP. The worst frames left in the
  // run carry 60–73 ms inside NO bucket. That is either (a) an unbucketed section of this loop or
  // (b) a GC pause — completely different fixes, and the current buckets cannot tell them apart. So
  // partition the WHOLE loop first: two coarse spans (pre-stream / post-stream). After this frame.*
  // covers the loop end to end, so if `unattr` is STILL ~60 ms it is GC, conclusively, no guessing.
  const _ptPre = performance.now()

  // FEAT-43: Story Mode — advance the settle→freeze timer and enforce the region boundary on the
  // physics pose BEFORE the render interpolation reads it (so the truck is clamped, not just drawn
  // clamped). No-op unless story mode is active.
  storySystem.update(frameTime, vehicleState)

  // FEAT-47: the story day clock stepped inside the fixed step above (FEAT-113) — here we only
  // hand its two outputs on. Both are PER FRAME, not on the 10 Hz HUD block: a 200 ms doze is
  // over in a dozen frames, so a 100 ms cadence would quantise the eyelids into a stutter and let
  // the attenuation lag the blink. Two style writes on cached elements — cheap enough to afford.
  setControlAttenuation(daySystem.attenuation())   // identically 1 outside a doze
  _updateDozeOverlay(daySystem.eyelidFactor())
  // FEAT-55: the Energy meter scrolls on the same per-frame cadence — the creep is the display.
  _updateEnergyMeter()
  // FEAT-87: the rank timer scrolls on the mission clock, per frame for the same reason (and its
  // near-boundary pulse runs at a rate a 10 Hz poll would stutter).
  _updateRankTimer()
  _updateJobDue()

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
  _renderPos.copy(_prevRenderPos).lerp(vehicleState.position, _renderAlpha)
  _renderQuat.copy(_prevRenderQuat).slerp(vehicleState.quaternion, _renderAlpha)

  // Temporarily substitute interpolated pos/quat so meshes and camera both render at subframe time.
  const _physPos  = vehicleState.position
  const _physQuat = vehicleState.quaternion
  vehicleState.position  = _renderPos
  vehicleState.quaternion = _renderQuat

  // FEAT-14: feed the day/night factor so headlight/lamp cast pools dim by day, brighten at night.
  setNightFactor(skySystem.nightFactor())
  syncMeshesToState(vehicleState)
  campfire.update(frameTime, skySystem.nightFactor())   // no-op unless a camp is up

  // Wheel dust trails — advance + emit using the interpolated render pose (vehicleState is
  // still the render copy here; restored below). Ground sampler = _fxGroundY (mirrors queryContacts).
  // Cheap no-op when no wheel is working.
  _fxGroundY.reset(); looseSurfaceFactor.reset()   // S-64: fresh per-frame wheel-point caches
  dustSystem.update(frameTime, vehicleState, RANGER_PARAMS, _fxGroundY, looseSurfaceFactor)

  // Tire smoke — same render-pose timing and ground sampler as dust above, and BUG-38 gives it the
  // same looseSurfaceFactor too: smoke reads it INVERTED (full on pavement, a thin floor off it)
  // while dust and spray read it forward. No lab special-case here — looseSurfaceFactor answers for
  // the lab itself (its own surface, on the pavement effect class), so all four consumers agree.
  smokeSystem.update(frameTime, vehicleState, RANGER_PARAMS, _fxGroundY, looseSurfaceFactor)

  // Dirt spray — same render-pose timing and ground sampler; additionally gated by
  // looseSurfaceFactor so clods only fly where there is loose material to throw.
  dirtSpraySystem.update(frameTime, vehicleState, RANGER_PARAMS, _fxGroundY, looseSurfaceFactor)

  // Phase 6: update terrain chunk ring each render frame (outside physics accumulator).
  // ground.position.x/z snapping removed — ground mesh removed; terrain chunks replace it.
  // Phase 7 D-21: while free-cam is active, stream chunks around the camera, not the truck.
  // Reverts to truck position on exit so the ring stays anchored to the car in normal mode.
  const streamCenter = roadStreamCenter()
  _trackStreamCenter(simTime, streamCenter.x, streamCenter.z)   // capture ring (Phase 4/5)
  // PERF-33: travel direction for near-then-ahead ordering; a jump drops every queue's backlog.
  if (_streamMotion.update(streamCenter.x, streamCenter.z, frameTime, STREAM_JUMP_M) && !_labActive) {
    terrainSystem?.onStreamJump()
    propSystem?.onStreamJump()
  }
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
      _farShadowPending = true              // BUG-78: drawn by the wrapped shadow pass, vehicle hidden
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
  // PERF-33: open the shared streaming budget. The systems below spend it in the owner's order —
  // terrain → road surface → props → shadow bake / water pre-warm. FILL (a big budget) while anything
  // is filling or the freeze guard holds: those are the edge-of-generation moments a hitch is allowed.
  const _streamT0 = _pt
  _streamBudget.begin(_genHold || !!terrainSystem?.isFilling() || !!propSystem?.isFilling() || !!roadMeshSystem?.isFilling())
  if (!_labActive) terrainSystem.update(streamCenter, _streamMotion, _streamBudget)
  perfAdd('frame.terrain.update', performance.now() - _pt)
  // Phase 8: stream the valley-trunk network around the same center as terrain (08-07: the
  // unified update() replaces the retired updateProto — streams + slices + redraws viz if visible).
  _pt = performance.now()
  // QUAL-14 perf: while a spawn warm holds the enlarged radius (seed regen), a re-stream here
  // would synchronously route the enlarged band — skip until the warm restores the play radius.
  // FEAT-43: story mode suspends this for the same reason as _spawnWarmActive above — while its
  // region warm holds the enlarged radius a re-stream here would synchronously route the whole
  // region every frame; and once frozen, a re-stream would narrow the network back to a 320 m
  // window and undo the freeze. This skip IS the mode's perf win.
  if (roadSystem && !_spawnWarmActive && !_labActive && !storySystem.isRoadStreamSuspended()) roadSystem.update(streamCenter)
  perfAdd('frame.road.update', performance.now() - _pt)
  // Phase 9 (SURF-01): sync road ribbon tiles with the active terrain chunk ring.
  // syncToChunkRing enqueues new tiles and disposes evicted ones co-located with chunk lifetime.
  // flushPendingQueue builds up to MAX_ROAD_BUILDS_PER_FRAME tiles per frame.
  // PERF-33: moved up from the end of the block — the road surface outranks props (owner ruling).
  if (roadMeshSystem && terrainSystem && !_labActive) {
    _pt = performance.now()
    roadMeshSystem.syncToChunkRing(terrainSystem.getActiveChunkKeys())
    perfAdd('frame.ribbon.sync', performance.now() - _pt)
    _pt = performance.now()
    roadMeshSystem.flushPendingQueue(Math.floor(streamCenter.x / CHUNK_SIZE), Math.floor(streamCenter.z / CHUNK_SIZE), _streamMotion, _streamBudget.deadline())
    perfAdd('frame.ribbon.flush', performance.now() - _pt)
  }
  // FEAT-06: stream props around the same center. PERF-14: scatter is queued + time-sliced inside
  // update(); the vehicle position is the HARD radius — its 3×3 chunks force-complete so prop
  // collision always exists under the truck, while the visual ring drips in budget-bound.
  _pt = performance.now()
  if (propSystem && !_labActive) propSystem.update(streamCenter.x, streamCenter.z, _propRing, vehicleState.position.x, vehicleState.position.z, _bbRing, _streamMotion, _streamBudget)
  // BUG-71 / PERF-33: pay down the owed road-intrusion pass (see owePropSweep).
  if (_propSweepOwed > 0 && !_labActive && _streamBudget.remaining() > 0) { sweepPropIntrusions(PROP_SWEEP_PER_FRAME); _propSweepOwed -= PROP_SWEEP_PER_FRAME }
  perfAdd('frame.props.update', performance.now() - _pt)   // D-arc
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
  // PERF-33: clear atlas tiles that still hold a departed chunk's shadows (toroidal slot reuse) the
  // moment the window moves — early-outs unless the stream centre changed chunk.
  if (shadowBake && !_labActive) shadowBake.syncCenter(Math.floor(streamCenter.x / CHUNK_SIZE), Math.floor(streamCenter.z / CHUNK_SIZE))
  if (shadowBake && shadowBake.hasWork() && !_labActive) { perfEvent('shadow.bake'); shadowBake.update(_streamBudget.deadline()) }   // PERF-26 tag
  perfAdd('frame.shadowBake', performance.now() - _pt)
  // FEAT-17/18: sync pond/stream meshes to the view region (bbox-culled, keyed — no churn when still).
  _pt = performance.now()
  if (waterRenderer && !_labActive) {
    const wr = waterSyncRadius()
    waterRenderer.sync(
      streamCenter.x - wr, streamCenter.z - wr,
      streamCenter.x + wr, streamCenter.z + wr,
      roadSystem ? roadSystem._networkRev : 0   // ribbons are suppressed against the road surface
    )
  }
  perfAdd('frame.water.sync', performance.now() - _pt)   // D-arc
  // PERF-14: pump the water-detection pre-warm ahead of every consumer (prop scatter ring
  // ≤160 m, terrain carve fetch 512 m). 768 m lookahead ≈ 6-12 s of lead at freecam speeds;
  // 2 ms/frame budget. Without this, the first query into a fresh WATER_CELL paid a 13-58 ms
  // lazy detection (pond rim casts + stream traces) inside the scatter/carve — the measured
  // dominant streaming hitch.
  _pt = performance.now()
  if (waterSystem && !_labActive) {
    const WW = 768
    // PERF-33: its 2 ms ceiling now comes out of the shared budget (last in line — pure lookahead).
    waterSystem.warmRegion(streamCenter.x - WW, streamCenter.z - WW, streamCenter.x + WW, streamCenter.z + WW, Math.max(0, Math.min(2, _streamBudget.remaining())))
  }
  perfAdd('frame.water.warm', performance.now() - _pt)   // D-arc
  // D-arc: auto-dump the perf profile at ~load (frame 180 ≈ 3s) and steady-state (frame 600).
  // PERF-27: the reset is a console-triage convenience, and under ?prof=1 it actively destroys
  // data — an external harness owns the buckets then, and on a throttled load frame 180 can land
  // mid-measurement (it wiped the reseed spans at 4×). Dump, but only reset when nobody is watching.
  // S-64: only under ?hitch/?prof — with both off there is nothing in the buckets to dump or reset.
  if (_HITCH) {
    _perfFrame++
    if (_perfFrame === 180) { perfDump('load ~3s'); if (!_PROF) perfReset() }
    else if (_perfFrame === 600) { perfDump('steady ~10s') }
  }
  const _ptPost = performance.now()   // PERF-26 INSTRUMENT: streaming-block end → render start
  _streamSpentMs = _ptPost - _streamT0
  // PERF-33: decide next frame's hold from the ground this frame's streaming left ready.
  _updateGenHold(newTime)

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
    // FEAT-50: a low-fuel stumble drops the drone out for its length, with one pop per stumble.
    const fuel = vehicleState.fuel
    if (fuel.sputters !== _sputtersHeard) { if (fuel.sputters > _sputtersHeard) playSputterPop(fuel.sputterDepth); _sputtersHeard = fuel.sputters }
    updateEngineAudio(dtrain.engineRPM, vehicleState.throttle,
      (vehicleState.ignition?.state ?? 'running') === 'running' && !(fuel.sputterT > 0), RANGER_PARAMS.cylinders)
  }

  // FEAT-33 ignition audio, in two halves.
  //
  // The STARTER is a level, not an edge: it runs for as long as the key is physically held at START
  // — including after the engine has caught, because you really can keep grinding the starter
  // against a running engine and the driver decides when to stop by letting go (owner, 2026-08-22).
  // start/stopCrankAudio are idempotent, so calling the level every frame is free.
  //
  // The CATCH and SHUTOFF are edges. The state machine leaves a one-shot on ignition.event for
  // exactly the step it happened on, and the NEXT step clears it — so the step loop latches it into
  // _ignEdge (S-61) and it is played here, once per frame, however many steps the frame ran.
  const ign = vehicleState.ignition
  if (ign) {
    if (_starterEngaged(ign)) startCrankAudio(); else stopCrankAudio()
    if (_ignEdge === 'catch') playCatchAudio()
    else if (_ignEdge === 'shutoff') playShutoffAudio()
    ign.event = null
  }
  _ignEdge = null
  // FEAT-33: the dead-engine throttle hint (raised in vehicle.js). Same one-shot discipline as the
  // events above — consume and clear, so holding W re-raises it every frame and the toast simply
  // stays up until the driver stops asking.
  if (vehicleState.ignitionHint) {
    vehicleState.ignitionHint = false
    showIgnitionHint()
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
    // FEAT-62: the countdown digit and the clock are live values; the far columns settle onto the
    // road as it streams in.
    if (scenarioSystem.state === 'countdown' || scenarioSystem.state === 'running') {
      _renderScenarioUI()
      _seatScenarioColumns()
    }

    // Story mode (beta): the countdown digit and the elapsed/distance readout are live values,
    // so they repaint on the HUD's ~10 Hz cadence rather than per physics step. ('staging' is a
    // static line, but it costs one string write and keeps the state→HUD mapping in one place.)
    if (missionSystem && (missionSystem.state === 'countdown' || missionSystem.state === 'staging'
                          || missionSystem.state === 'running' || missionSystem.state === 'loading')) _renderMissionUI()
    // FEAT-88: a load whose job is gone (cancelled, exited, a new run) leaves with it.
    if (_haul && (!missionSystem?.isOnJob() || missionSystem.mission !== _haul.mission)) _haulClear()
    // FEAT-96: …and so does a freight load, on delivery, clean-up or a new run. (A debug load has no
    // mission and stays until replaced.) The weld dies with the body.
    if (_freight?.mission && (!missionSystem?.isOnJob() || missionSystem.mission !== _freight.mission)) {
      debrisSystem.remove([_freight.body]); _freight = null
    }
    // FEAT-67: a parked offer panel carries a live expiry, and the offer can expire under it.
    if (missionSystem?.state === 'offer' && missionSystem.offer && offerBoard) {
      if (!offerBoard.isLive(missionSystem.offer.id, daySystem.clockH())) _refreshParkedOffers()
      else _renderMissionUI()
    }
    // FEAT-61: the route's HUD carries three live values (the clock, the count, the inventory), so
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
    // FEAT-102: the motorist's car comes and goes with its work — before the rings read the flag.
    _updatePoiPresence()
    // FEAT-46: the orange interaction ring ↔ green start-zone ring swap rides the same poll.
    _updateMissionRings()

    // FEAT-53: the run wallet — money + good deeds, story mode only, always visible while the
    // region is live (owner, 2026-08-01). Run state, not mission state: it never references par
    // or the current job, so the SM-INV-3 running surface above stays clean.
    _renderRunHud()
    const guiOpen = _gui.domElement.style.display !== 'none'   // S-64: debug read-outs only while the panel shows
    if (guiOpen) economySystem.syncGui()

    // FEAT-46/45: the POI + camping prompts, and the ONE parking-brake trigger behind both.
    // Still the ~10 Hz cadence: the `parked` latch is sticky, so the edge cannot fall between polls.
    _updateParkTriggers()
    _updateRecovery()           // FEAT-50: the out-of-fuel chip, once parked
    // FEAT-45: the camping folder's read-outs ride the same 10 Hz poll and hit the same memoized
    // grade the prompt just computed. Gated to the SAME sub-20 kph window as the prompt on purpose:
    // grading costs a handful of terrain/water/scatter samples, and paying for it at speed to feed a
    // debug read-out is exactly the frame-loop diagnostic src/ is supposed to be free of.
    if (guiOpen && storySystem.isActive()
        && Math.hypot(vehicleState.velocity.x, vehicleState.velocity.z) * 3.6 <= CAMP_PROMPT_KPH) {
      campSystem.syncGui(vehicleState.position.x, vehicleState.position.z)
    }

    // FEAT-49: speed/gear/RPM moved off the text HUD onto the gauge cluster; only the wheelspin
    // diagnostic (no cluster equivalent) stays here.
    if (dtrain) {
      const spEl = _hudEl.spinVal
      if (spEl) {
        const spin = dtrain.wheelspin || 0
        _hudText(spEl, spin.toFixed(1))
        spEl.style.color = spin > (RANGER_PARAMS.wheelspinThreshold ?? 7.5) ? '#ff2222' : '#00ff88'
      }
    }

    // M4-09 / D-12: per-wheel Fz HUD — tire spring force per corner.
    // Uses ?. / ?? 0 nullish-default per PATTERNS §Logger field append-at-end + nullish-coalesce.
    // toFixed(0) = whole newtons (Fz is in thousands; decimals add noise).
    _hudText(_hudEl.flFzVal, (vehicleState.wheelDebug[0]?.fz ?? 0).toFixed(0))
    _hudText(_hudEl.frFzVal, (vehicleState.wheelDebug[1]?.fz ?? 0).toFixed(0))
    _hudText(_hudEl.rlFzVal, (vehicleState.wheelDebug[2]?.fz ?? 0).toFixed(0))
    _hudText(_hudEl.rrFzVal, (vehicleState.wheelDebug[3]?.fz ?? 0).toFixed(0))

    // M3-07: front slip velocity HUD — sa field stores slip-velocity magnitude in m/s (not slip angle).
    // See physics.js: "sa field now stores SLIP VELOCITY magnitude (m/s) instead of slip angle (rad)".
    // Thresholds: ~0.5 m/s = light slip (green), ~1.5 m/s = heavy slip (red).
    const slipMps = (vehicleState.wheelDebug?.[0]?.sa || 0)
    const slipEl = _hudEl.slipVal
    if (slipEl) {
      _hudText(slipEl, slipMps.toFixed(2) + ' m/s')
      slipEl.style.color = slipMps < 0.5 ? '#00ff88' : slipMps < 1.5 ? '#ffaa00' : '#ff2222'
    }

    // M3-08: throttle and brake percentage HUD
    _hudText(_hudEl.thrVal, (vehicleState.throttle * 100).toFixed(0))
    _hudText(_hudEl.brkVal, (vehicleState.brake * 100).toFixed(0))

    // FPS HUD
    _hudText(_hudEl.fpsVal, String(Math.round(_fpsEma)))

    // Road-Feel QoL: seed / x / z OSD — correlates screenshots and in-game sightings with the
    // headless report's coords (test/road-character.mjs prints worst-offender x/z in world space).
    if (_hudEl.posVal) {
      // Freecam shows the CAMERA's position (you fly to a defect, the OSD must name that spot,
      // not wherever the truck was left) — same source the capture mark uses.
      const posSrc = getCameraMode() === 'freecam' ? getFreecamPosition() : vehicleState.position
      _hudText(_hudEl.posVal, `seed ${_seedString} / ${posSrc.x.toFixed(0)} / ${posSrc.z.toFixed(0)}`)
    }

    // M3-09 / D-13: Pacejka curve + 4-corner travel bars + slip vectors — canvas repaints, throttled
    // with the HUD. Each early-returns when its canvas is hidden (constraint #10: outside accumulator).
    updatePacejkaCurve(vehicleState, RANGER_PARAMS)
    updateTravelBars(vehicleState, RANGER_PARAMS)
    updateSlipVectors(vehicleState)
  }

  updateCamera(camera, vehicleState, frameTime)
  _updateThrownRolls(frameTime)   // FEAT-61: fly the airborne papers (render-rate, analytic)
  debrisSystem.update(_renderAlpha)   // FEAT-36: engine → debris meshes, at the truck's render alpha

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
  if (map2d.isOpen()) { _pumpLarryTour(2); map2d.render() }   // FEAT-67: Larry's hover tour, sliced
  // FEAT-67: `map-open` on <body> while the map is up, so page chrome that would sit on top of the
  // offer card (the Quick Job corner button) can step aside in CSS. Written only on change.
  if (map2d.isOpen() !== _mapOpenClass) { _mapOpenClass = map2d.isOpen(); document.body.classList.toggle('map-open', _mapOpenClass) }

  // FEAT-49: gauge cluster — every frame (needles must be smooth, unlike the 10 Hz text HUD),
  // hidden while the map is open, live in chase/hood/freecam alike. update() early-outs when hidden.
  gaugeCluster.setVisible(!map2d.isOpen())
  gaugeCluster.setIgnition(keyPosition(vehicleState.ignition))
  gaugeCluster.setCoolantTemp(damageModel.tempGaugeFrac())   // FEAT-51
  // FEAT-50: free roam (and the lab, scenarios) can never run dry — the tank stops at a floor. Set
  // every frame from the mode rather than at each transition, so no entry/exit path can miss it.
  vehicleState.fuel.floorGal = _gameMode === 'story' ? 0 : RANGER_PARAMS.fuelTankGal * RANGER_PARAMS.fuelFreeRoamFloorFrac
  gaugeCluster.setFuelLevel(vehicleState.fuel.gal / RANGER_PARAMS.fuelTankGal)
  gaugeCluster.setLowFuel(vehicleState.fuel.gal <= RANGER_PARAMS.fuelLowLightGal)
  _renderPumpDisplay(frameTime)
  gaugeCluster.setRedline(RANGER_PARAMS.engineRedlineRPM)   // repaints the tach face only on an engine swap
  gaugeCluster.update(frameTime, vehicleState.velocity.length(), vehicleState.drivetrain?.engineRPM ?? 0)

  // feature/teleport: show the "teleport here" button only in free-cam, where isTeleportEnabled()
  // (free roam or story). Toggle on change to avoid touching the DOM every frame.
  const _showTpBtn = isTeleportEnabled() && getCameraMode() === 'freecam'
  if (_showTpBtn !== _tpBtnShown) {
    _tpBtnShown = _showTpBtn
    const btn = document.getElementById('teleport-btn')
    if (btn) btn.style.display = _showTpBtn ? 'block' : 'none'
  }

  const _ptR = performance.now()
  perfAdd('frame.postStream', _ptR - _ptPost)   // PERF-26 INSTRUMENT
  // FEAT-41: whichever scene owns the screen. Skipping the world render behind a menu or a load is
  // not just tidiness — it hands the GPU to the build that is running underneath.
  if (menuStage.isActive()) { menuStage.update(frameTime); menuStage.render(renderer) }
  else renderer.render(scene, camera)
  perfAdd('frame.render', performance.now() - _ptR)  // D-arc: render submit (the ~8.5 s load-cost suspect)
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
  // PERF-33: what the rest of the frame cost — next frame's streaming budget is what that leaves.
  _streamBudget.noteOther(performance.now() - newTime * 1000 - _streamSpentMs)
  if (paperRouteSystem?.hasReplan()) {
    const spentMs = performance.now() - newTime * 1000
    paperRouteSystem.pumpReroute(Math.max(PUMP_FLOOR_MS, FRAME_BUDGET_MS - PUMP_MARGIN_MS - spentMs))
  }
}

perfMark('init: synchronous bootstrap done, requesting first frame')  // D-arc
// Dev handle (like __view above): init — including the QUAL-14 async spawn warm — is complete and
// the render loop is starting. Read by the headless boot-timing probes.
window.__rsReady = true
requestAnimationFrame(loop)
// PERF-21: precompile the light-count shader variants (lamps off/brake/night/reverse) off the
// critical path so the first brake or headlight toggle doesn't compile shaders mid-drive.
//
// _worldReady resolves AFTER this settles, not before. A menu pick made during init now runs the
// moment it can, and a reseed racing an in-flight compileAsync disposes materials out from under
// three's checkMaterialsReady poll ("Cannot read properties of undefined (reading 'isReady')").
// It is also the honest meaning of ready: shaders warmed, so the first frame of driving is clean.
// .finally, not .then — a failed prewarm is a best-effort miss, never a reason to strand the menu.
// The campfire's point-light variant rides the same chain (see campfire.js header) — compiled with the
// lamps in their final all-off prewarm state, which is how the truck sits at camp.
prewarmLightPrograms(renderer, scene, camera)
  .then(() => campfire.prewarm(renderer, scene, camera))
  .finally(() => {
    _worldInit = true
    _resolveWorldReady()   // release any menu pick the player made while this was still building
  })

// ── Resize handler ───────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  menuStage.resize()   // FEAT-41: the stage has its own camera
  // PERF-06: applyRenderResolution re-clamps pixelRatio (the resHeight cap depends on innerHeight) AND
  // re-stamps the backing buffer — replaces the bare setSize so a Low-tier 720p cap survives a resize.
  applyRenderResolution()
})
