/**
 * src/main.js — RangerSim Walking Skeleton
 *
 * Entry point for the browser app. Responsibilities:
 *  - Three.js scene setup (renderer, camera, lighting, ground, grid)
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
import { getBodyContactPoints } from './suspension.js'
import { updateVehicle, SPAWN_STATE } from './vehicle.js'
import { updateCamera } from './camera.js'
import { initDebug, updatePacejkaCurve, updateTravelBars, updateSlipVectors } from './debug.js'
import { captureFrame, toggleRecording, openInitialCondition } from './logger.js'
import { TerrainSystem } from './terrain.js'

// TerrainSystem instance — declared at module scope so queryContacts / queryVertexContacts
// can access it by reference. Initialized after scene exists (below initDebug).
let terrainSystem = null

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
    bodyYCorner[i]   = hubY + (L_S - strutComp[i]) + (p.cgHeight - p.wheelRadius)
  }
  // Use average of front-pair bodyY for initial CG height (front/rear should be nearly equal
  // with balanced tuning; minor front-rear offset settles within a frame via hub dynamics).
  const bodyY = (bodyYCorner[0] + bodyYCorner[1]) / 2
  return { bodyY, strutComp }
}

// ── Fixed-timestep loop constants (RESEARCH §Pattern 2) ─────────────────────
// PHYSICS_DT: parameterized physics step per D-09. Single source of truth — all downstream
// code reads this constant or params.physicsDt (same value, mirrored in ranger.js for
// suspension.js which cannot import main.js). NEVER use 1/60 or 0.0167 literals below.
const PHYSICS_DT = 1 / 60        // physics step: 16.667ms (D-09)
const MAX_FRAME_TIME = 0.25       // spiral-of-death clamp: 250ms (T-01-04 mitigation)

let simTime = 0  // accumulated simulation time in seconds; incremented by FIXED_DT each physics step

let accumulator = 0
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

// Grid overlay — muted sandy lines, subtle enough to read depth without screaming
const grid = new THREE.GridHelper(200, 100, 0x7a6a50, 0x6a5a40)
scene.add(grid)

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

  // Ground surface — terrain height query (Phase 6)
  const terrainH = terrainSystem ? terrainSystem.sampleHeight(px, pz) : 0
  if (py < terrainH) {
    // Phase 6 fix (TERR-FIX-02): use terrain surface normal, not hardcoded flat normal.
    // _flatNormal was always (0,1,0) — caused body contacts to push straight up on slopes.
    const terrainN = terrainSystem ? terrainSystem.sampleNormal(px, pz) : { x: 0, y: 1, z: 0 }
    hits.push({ normal: new THREE.Vector3(terrainN.x, terrainN.y, terrainN.z), depth: terrainH - py })
  }

  // Ramp face contacts — all four faces skipped when ramp is disabled (TERR-06 / T-06-07)
  if (RANGER_PARAMS.rampEnabled !== false) {
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

  // Ground surface — terrain height query (Phase 6; replaces flat y=0 half-space)
  const terrainH = terrainSystem ? terrainSystem.sampleHeight(cx, cz) : 0
  const gd = terrainH + r - cy
  if (gd > 0) {
    const n = terrainSystem ? terrainSystem.sampleNormal(cx, cz) : { x: 0, y: 1, z: 0 }
    hits.push({
      normal:       new THREE.Vector3(n.x, n.y, n.z),
      depth:        gd,
      contactPoint: new THREE.Vector3(cx, terrainH, cz)
    })
  }

  // Triangle mesh contacts — sphere vs each ramp triangle (skipped when ramp is disabled)
  if (RANGER_PARAMS.rampEnabled !== false) {
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
scene.add(rampMesh)

// FPS tracking — smoothed using an exponential moving average (alpha=0.1).
// Placed here (module scope) so it persists across frames without closure overhead.
let _fpsEma = 60       // initial estimate: 60 fps
let _fpsLastTime = 0   // will be set to currentTime on first frame

// ── Debug panel ──────────────────────────────────────────────────────────────
// D-10: passes mutable RANGER_PARAMS ref so sliders write directly to the object physics.js reads.
// Phase 6 (TERR-06): pass setRampVisible callback so the Ramp Visible toggle in debug.js
// can control rampMesh visibility without requiring debug.js to import rampMesh directly.
initDebug(RANGER_PARAMS, {
  setRampVisible:  (v) => { rampMesh.visible = v },
  rebuildTerrain:  ()  => { if (terrainSystem) terrainSystem.rebuildAllChunks() }
})

// ── TerrainSystem (Phase 6) ───────────────────────────────────────────────────
// Instantiated after scene exists. Removes flat ground mesh to prevent Z-fighting.
terrainSystem = new TerrainSystem(scene, RANGER_PARAMS)
scene.remove(ground)   // Remove flat 200×200 ground mesh — terrain chunks replace it (T-06-06)

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

// ── Logger key bindings (D-03 / D-02) ────────────────────────────────────────
// \ toggles frame recording; Ctrl+I opens the initial condition file picker.
document.addEventListener('keydown', e => {
  if (e.key === '\\') toggleRecording()
  if (e.key === 'i' && e.ctrlKey) openInitialCondition(vehicleState, RANGER_PARAMS)
})

// ── Game loop ─────────────────────────────────────────────────────────────────
// Fixed-timestep accumulator (RESEARCH §Pattern 2, gafferongames.com/post/fix_your_timestep/)
// FIXED_DT = 1/60s; MAX_FRAME_TIME = 0.25s (T-01-04: spiral-of-death mitigation)
function loop () {
  requestAnimationFrame(loop)

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
      // M1-12: reset to spawn state — zero all motion, restore identity quaternion.
      // Phase 4.1: position.y and strutComp[] reset to static equilibrium (not RANGER_PARAMS.cgHeight)
      // so the car spawns pre-settled with no visible drop (RESEARCH §Pattern 4 / Pitfall 1).
      const eq = computeStaticEquilibrium(RANGER_PARAMS)
      vehicleState.position.set(SPAWN_STATE.positionX, eq.bodyY, SPAWN_STATE.positionZ)
      // Phase 6: offset spawn Y by terrain height so car sits on terrain surface after reset.
      // sampleHeight returns 0 when chunk not loaded — safe flat-ground fallback (T-06-04).
      vehicleState.position.y += terrainSystem ? terrainSystem.sampleHeight(SPAWN_STATE.positionX, SPAWN_STATE.positionZ) : 0
      vehicleState.velocity.set(0, 0, 0)
      vehicleState.quaternion.set(SPAWN_STATE.quatX, SPAWN_STATE.quatY, SPAWN_STATE.quatZ, SPAWN_STATE.quatW)
      vehicleState.angularVelocity.set(0, 0, 0)
      vehicleState.steerAngle = 0
      vehicleState.throttle = 0
      vehicleState.brake = 0
      vehicleState.wheelAngles    = [0, 0, 0, 0]
      vehicleState.wheelSteerAngles = [0, 0, 0, 0]
      vehicleState.wheelDebug     = [ {fn:0,fy:0,sa:0,c:0,omega:0,fz:0}, {fn:0,fy:0,sa:0,c:0,omega:0,fz:0}, {fn:0,fy:0,sa:0,c:0,omega:0,fz:0}, {fn:0,fy:0,sa:0,c:0,omega:0,fz:0} ]
      vehicleState.wheelOmega     = [0, 0, 0, 0]
      vehicleState.slipLong       = [0, 0, 0, 0]
      vehicleState.slipLat        = [0, 0, 0, 0]
      vehicleState.handbrake      = false
      // Phase 4.1 strut state reset — reassigned (not mutated entry-by-entry) per PATTERNS §Reset block
      vehicleState.strutComp    = [...eq.strutComp]
      vehicleState.strutCompVel = [0, 0, 0, 0]
    }

    stepPhysics(vehicleState, RANGER_PARAMS, PHYSICS_DT, queryContacts, queryVertexContacts)
    simTime += PHYSICS_DT
    captureFrame(simTime, vehicleState, vehicleState.wheelDebug)
    accumulator -= PHYSICS_DT
  }

  syncMeshesToState(vehicleState)

  // Phase 6: update terrain chunk ring each render frame (outside physics accumulator).
  // ground.position.x/z snapping removed — ground mesh removed; terrain chunks replace it.
  terrainSystem.update(vehicleState.position)

  // Snap grid to car position so it appears infinite.
  // Cell size = grid width (200m) / divisions (100) = 2m — snap prevents visible seam movement.
  const CELL = 2
  const snapX = Math.round(vehicleState.position.x / CELL) * CELL
  const snapZ = Math.round(vehicleState.position.z / CELL) * CELL
  grid.position.x   = snapX
  grid.position.z   = snapZ

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

  // Update body contact debug spheres (only when visible — cheap early-out)
  if (_dbgSpheresOn) {
    RANGER_PARAMS._rotateVector = (v) => new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(vehicleState.quaternion)
    const pts = getBodyContactPoints(vehicleState, RANGER_PARAMS)
    pts.forEach((pt, i) => { if (_dbgSpheres[i]) _dbgSpheres[i].position.set(pt.x, pt.y, pt.z) })
  }

  renderer.render(scene, camera)
}

requestAnimationFrame(loop)

// ── Resize handler ───────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
