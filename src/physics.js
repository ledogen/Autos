/**
 * src/physics.js — Vehicle physics step for RangerSim (FEAT-48: engine-backed).
 *
 * The rigid-body core is the physics ENGINE behind the adapter seam
 * (physics-engine.js): the chassis is an engine dynamic body; integration
 * (position, quaternion, full-tensor inertia with gyroscopic terms) and every
 * body↔terrain / body↔prop / body↔debris contact are solved by the engine.
 * The hand-rolled 6DOF integrator and the BUG-27 sequential-impulse body solver
 * were removed in the cutover — their failure-mode lore lives in the FEAT-48
 * landing commit message and the constants below.
 *
 * What stays OURS — the entire point of the project (see the FEAT-48 warning:
 * never adopt an engine vehicle/wheel abstraction):
 *   - suspension.js spring/damper struts, stepped against the ANALYTIC terrain
 *     surface via queryContacts (higher fidelity than any baked collider);
 *   - tire.js combined-slip Pacejka, fed per-wheel slip velocities;
 *   - the drivetrain chain and the ω Newton integrator.
 * Their net force+torque is applied to the engine body each step; the engine
 * integrates and hands the transform back into vehicleState (the authoritative
 * JS mirror every other system reads).
 *
 * Translation layer (FEAT-48 "the one substantive change"): wheel contact
 * queries are the analytic queryContacts PLUS an engine sphere-overlap for
 * DYNAMIC bodies (debris under the wheel). When the wheel's support surface is
 * a dynamic body, slip and compression velocities are computed RELATIVE to that
 * body's contact-point velocity, and the tire's normal+friction force is
 * applied back to it equal-and-opposite — drive onto a rock and the suspension
 * compresses, the truck lifts, the rock squirts out.
 *
 * Exports:
 *   stepPhysics(vehicleState, params, dt, queryContacts, engineCtx)
 *     — engineCtx = { engine: PhysicsEngine, chassis: bodyHandle } (required)
 *   createVehicleChassis(engine, vehicleState, params) — build the chassis body
 *   getDriveTorque(wheelIndex, vehicleState, params)
 *
 * Conventions: see docs/GLOSSARY.md
 * Forbidden: body rotation must always use THREE.Quaternion, never bodyMesh.rotation
 */

import * as THREE from 'three'
import { computeTireForces } from './tire.js'
import { computeNormalForce, getWheelPosition, stepSuspensionSubsteps } from './suspension.js'
import { stepDrivetrain } from './drivetrain.js'
import { GROUP_CHASSIS, GROUP_DEBRIS } from './physics-engine.js'

// Speed threshold for input routing (rule-based, no dead-zone oscillation).
// FEAT-23 removed FWD_THRESHOLD (the W-brake / drive-cut deadband); the drivetrain now supplies
// forward torque continuously through the torque converter, so there is no roll-back drive cutoff.
const REV_THRESHOLD =  2 / 3.6   //  0.556 m/s: S switches from braking to reverse above this

/**
 * Read the per-wheel drive torque computed once per step by stepDrivetrain (FEAT-23).
 * The engine → torque-converter → automatic-gearbox → final-drive chain (drivetrain.js) runs once
 * before the per-wheel loop and writes params._driveTorque[4]; this is just the accessor so the
 * ω integrator (grounded + airborne branches) reads a consistent value for every wheel.
 *
 * @param {number} wheelIndex - 0-3 per GLOSSARY.md §Wheel Index (0=FL, 1=FR, 2=RL, 3=RR).
 * @param {object} vehicleState - unused (kept for signature stability with getBrakeTorque).
 * @param {object} params - RANGER_PARAMS; reads params._driveTorque (set by stepDrivetrain).
 * @returns {number} Torque [N·m]. Positive = drive forward, negative = reverse.
 */
export function getDriveTorque (wheelIndex, vehicleState, params) {
  const dt = params._driveTorque
  return dt ? (dt[wheelIndex] || 0) : 0
}

/**
 * Compute resistive brake torque for a single wheel (always >= 0, subtracted in integrator).
 * Handles W-braking when going backward fast, S-braking when going forward, and handbrake.
 * Module-private — not exported.
 *
 * @param {number} wheelIndex - 0-3 per GLOSSARY.md §Wheel Index.
 * @param {object} vehicleState - Full vehicleState; uses .throttle, .brake, .handbrake.
 * @param {object} params - RANGER_PARAMS; uses .maxBrakeTorqueFront/.maxBrakeTorqueRear, .maxHandbrakeTorque.
 * @returns {number} Brake torque [N·m]. Positive = resists current wheel spin direction.
 */
function getBrakeTorque (wheelIndex, vehicleState, params) {
  const isRear  = wheelIndex === 2 || wheelIndex === 3
  const longVel = params._longitudinalVelocity || 0

  // FEAT-23: the old "W below FWD_THRESHOLD → brake" branch is gone. The torque-converter drivetrain
  // now delivers forward torque whenever the throttle is down (even while rolling backward), so it
  // arrests and reverses a hill roll-back itself — braking there would fight the drive torque and
  // re-create the drive/brake oscillation this feature fixes.

  // S above REV_THRESHOLD: brake all wheels to slow forward motion (front/rear-split service brake).
  if (vehicleState.brake > 0 && longVel > REV_THRESHOLD) {
    const maxBt = isRear ? (params.maxBrakeTorqueRear ?? 800) : (params.maxBrakeTorqueFront ?? 1200)
    return vehicleState.brake * maxBt
  }

  // Handbrake: rear wheels only, FULL clamping torque at all speeds. A handbrake is a fixed brake, so
  // it must apply full torque at low speed / rest — that is exactly when you park on a hill. The old
  // speed-ramp (scale = |v|/HB_RAMP below 0.3 m/s) faded the torque toward zero right where holding
  // matters, and the `|v| === 0 ? full` guard almost never fires in floating point, so a car creeping
  // on a slope sat in the weak zone and the rear wheels ROLLED instead of locking → it slid downhill on
  // grades far below the friction angle. Full torque locks the rears; the tire then holds (static) or
  // skids (kinetic) per the slope vs friction angle, which is the correct behaviour.
  if (vehicleState.handbrake && isRear) {
    return params.maxHandbrakeTorque
  }

  return 0
}

/**
 * Advance vehicle physics state by one fixed timestep.
 *
 * @param {object} vehicleState - Mutable vehicleState (mutated in-place).
 * @param {object} params - RANGER_PARAMS (may be augmented with debug-slider values).
 * @param {number} dt - Fixed timestep in seconds.
 * @param {function} queryContacts - (cx,cy,cz,r) → Array<{normal,depth,contactPoint}>.
 *   Caller (main.js) implements this against all solid geometry. Replaces the old terrain(x,z)
 *   single-contact interface to support walls, slopes, and multiple contacts per wheel.
 * @returns {void}
 */
// Body (frame/bumper/undercarriage) contact restitution — DEFAULT for params.bodyRestitution.
// BUG-27 lore (kept because the failure mode recurs as an engine-tuning question): restitution
// must be a bias off the PRE-solve approach velocity, never re-derived per solver pass, or it
// compounds. The engine's solver does this correctly; e is applied as the chassis shape's
// restitution material (terrain restitution is 0 and engines combine by max, so the pair
// restitution IS this value).
const BODY_RESTITUTION_DEFAULT = 0.21   // slight rebound on hard slams; 0 = fully-plastic thud
// Restitution applies only to genuine IMPACTS. Below this approach speed there is no bounce, so
// resting/settling contact stays dead-stopped (BUG-27-era REST_VEL_THRESHOLD, now enforced by the
// engine's world-level restitution threshold — wired in physics-engine.js's world defaults).
const REST_VEL_THRESHOLD = 1.0   // m/s — |vn| below this → no bounce, pure plastic stop
// BUG-27b: body contact is SLIPPERY — a bumper grazing the shoulder must SLIDE, not catch and stop
// the truck dead. Under the engine this is a friction MATERIAL on the chassis shape. Engines
// combine pair friction by geometric mean (√(μa·μb)), and terrain colliders carry μ=0.8
// (terrain-physics.js), so the shape value is chosen to land the PAIR at the tuned BUG-27b 0.1:
// √(0.0125 · 0.8) = 0.1.
const BODY_FRICTION_MU  = 0.1            // the tuned pair friction (BUG-27b)
const TERRAIN_FRICTION_REF = 0.8         // must match terrain-physics.js TERRAIN_FRICTION
const CHASSIS_SHAPE_MU  = BODY_FRICTION_MU * BODY_FRICTION_MU / TERRAIN_FRICTION_REF   // ≈ 0.0125

// ── QUAL-25: chassis collider profile — measured off the ACTUAL vehicle model ──────────────
// Body-frame breakpoints (origin = CG, forward = −Z) of hilux.glb pushed through the exact
// seating transform vehicle-model.js applies (targetLength 4.6 × bodyScale 1.065, shiftRear
// 0.318, shiftDown 0.21, planted at cgHeight; mirrors excluded from widths). Re-measure via
// Blender if the model or its VEHICLE_MODELS spec changes — and when a SECOND vehicle model
// lands, this profile should move into data/vehicle-models.js as per-model hull data (the
// QUAL-25 option-2 path) instead of growing switches here.
//
// This vehicle has NO OPEN BED — the model's bed top is closed (reads as a tonneau cover), so
// the deck hull is a SOLID at rail height by owner ruling (2026-08-15). A future model with a
// real open bed gets a hollow bin (three wall hulls + floor) so cargo can ride in it.
const CHASSIS_PROFILE = {
  noseZ: -2.13,        // front bumper face
  tailZ: 2.77,         // rear bumper face
  cowlZ: -0.72,        // windshield base
  roofFrontZ: -0.30,   // windshield top / roof leading edge
  roofRearZ: 0.60,     // roof trailing edge (rear window top)
  cabRearZ: 0.73,      // cab back panel → bed rail
  hoodNoseY: 0.30,     // hood height at the grille
  hoodCowlY: 0.54,     // hood height at the cowl
  roofY: 1.04,         // roof plane (the old single hull had 0.40 — rollovers rested on air)
  railY: 0.29,         // bed rail / tonneau deck top
  beltY: 0.18,         // beltline — top of the full-length lower slab (fenders/doors/bumpers)
  slabHalfW: 0.95,     // fenders/bumpers
  cabHalfW: 0.78,      // cab + roof (mirrors excluded)
  deckHalfW: 0.93,     // bed sides
}

/**
 * Create the vehicle chassis body in the engine world (FEAT-48 Phase 2, QUAL-25 compound).
 *
 * Four convex hulls tracing the visible body volume (engine hulls are convex-only, so the
 * silhouette is decomposed): full-length lower SLAB (frame, bumpers, fenders — undercarriage
 * plane unchanged from the probe era), HOOD wedge rising to the cowl, CAB with the raked
 * windshield up to the real roof, and the tonneau-height bed DECK. Body origin = CG
 * (vehicleState.position), so mass data centers at the local origin. Overlapping hulls are
 * fine — they are one rigid body; overlap just guarantees no seam gaps.
 *
 * Mass + rotational inertia are OVERRIDDEN with the tuned params values — the driving feel is
 * calibration, not collider geometry (a compound's shape-derived tensor never applies).
 */
export function createVehicleChassis (engine, vehicleState, params) {
  const P = CHASSIS_PROFILE
  const undY = params.wheelRadius - params.cgHeight        // undercarriage bottom (unchanged)

  const chassis = engine.createBody({
    type: 'dynamic',
    position: vehicleState.position,
    quaternion: vehicleState.quaternion,
    canSleep: false,               // the player's body — never let the engine idle it out
    bullet: true,                  // continuous collision: no tunnelling through thin debris at speed
    userData: { kind: 'vehicle' },
  })
  const mat = {
    friction: CHASSIS_SHAPE_MU,
    restitution: params.bodyRestitution ?? BODY_RESTITUTION_DEFAULT,
    density: 1,                    // placeholder — overridden by setMassData below
    group: GROUP_CHASSIS,
  }
  // A z–y profile polygon extruded to ±halfW → flat hull point list.
  const extrude = (profile, halfW) => {
    const pts = []
    for (const x of [-halfW, halfW]) for (const [z, y] of profile) pts.push(x, y, z)
    return pts
  }
  // 1. Lower slab: nose to tail, undercarriage to beltline — CHAMFERED (capture 1786773473453).
  // A sharp box corner at undercarriage depth dug into rising ground/road at full suspension
  // compression and turned a graze into a one-frame wall strike (launch + yaw kick). The bottom
  // face is pulled in like a real truck's approach/departure angles (~40°) and side sills, so a
  // bottoming-out contact is always a glancing plane, never a corner catch. The bottom PLANE
  // stays at the honest undercarriage height — flat scrapes are unchanged.
  // Slab restitution is pinned to 0 regardless of params.bodyRestitution: an undercarriage
  // scrape must be fully plastic (real frames yield, they don't bounce); the cab/roof/deck
  // below keep the tunable rebound for genuine body slams and rollovers.
  const slabBottomHalfW = 0.80
  const slabBottomNoseZ = P.noseZ + 0.43   // approach chamfer
  const slabBottomTailZ = P.tailZ - 0.37   // departure chamfer
  engine.addHull(chassis, [
    -P.slabHalfW, P.beltY, P.noseZ, P.slabHalfW, P.beltY, P.noseZ,
    -P.slabHalfW, P.beltY, P.tailZ, P.slabHalfW, P.beltY, P.tailZ,
    -slabBottomHalfW, undY, slabBottomNoseZ, slabBottomHalfW, undY, slabBottomNoseZ,
    -slabBottomHalfW, undY, slabBottomTailZ, slabBottomHalfW, undY, slabBottomTailZ,
  ], { ...mat, restitution: 0 })
  // 2. Hood wedge: grille up to the cowl.
  engine.addHull(chassis, extrude([
    [P.noseZ, 0.02], [P.noseZ, P.hoodNoseY], [P.cowlZ, P.hoodCowlY], [P.cowlZ, 0.02],
  ], P.slabHalfW * 0.95), mat)
  // 3. Cab: cowl → raked windshield → roof → back panel down to the rail.
  engine.addHull(chassis, extrude([
    [P.cowlZ, 0.14], [P.cowlZ, P.hoodCowlY], [P.roofFrontZ, P.roofY],
    [P.roofRearZ, P.roofY], [P.cabRearZ, P.railY], [P.cabRearZ, 0.14],
  ], P.cabHalfW), mat)
  // 4. Bed deck: cab back to the tail at rail height — SOLID (tonneau, see header note).
  engine.addHull(chassis, extrude([
    [P.cabRearZ, 0.14], [P.cabRearZ, P.railY], [P.tailZ, P.railY], [P.tailZ, 0.14],
  ], P.deckHalfW), mat)

  engine.setMassData(chassis, params.mass,
    { x: params.inertiaRoll, y: params.inertiaYaw, z: params.inertiaPitch })
  return chassis
}

export function stepPhysics (vehicleState, params, dt, queryContacts, engineCtx) {
  if (!engineCtx) throw new Error('stepPhysics: engineCtx {engine, chassis} is required (FEAT-48)')
  const { engine, chassis } = engineCtx
  // ── Step 0: Rotation helper ────────────────────────────────────────────────
  params._rotateVector = (v) => new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(vehicleState.quaternion)

  // ── Step 0.5: Wheel contact source = analytic terrain ∪ engine DYNAMIC bodies ──
  // The analytic queryContacts stays the terrain/prop/wall source for wheels (it is
  // continuous-resolution — better than any baked collider). The engine overlap adds
  // debris under the wheel, filtered to GROUP_DEBRIS so engine terrain/props can never
  // double-count a surface the analytic query already reports. Engine hits carry .body,
  // which is what triggers the relative-velocity path in Step 3.
  const qcPlus = (cx, cy, cz, r, footprint) => {
    const list = queryContacts(cx, cy, cz, r, footprint)
    const dyn = engine.overlapSphere({ x: cx, y: cy, z: cz }, r, { collidesWith: GROUP_DEBRIS, dynamicOnly: true })
    for (let i = 0; i < dyn.length; i++) {
      // CAP THE DEPTH of dynamic-body contacts. The overlap query can report a near-full-radius
      // depth in a single frame (hub center dips inside a small rock's hull), and the tire spring
      // turned that into a ~10 kN Fz spike (capture 1786690032648: fl_c 0.004 → 0.148 in one
      // frame, coasting). That spike flung the rock, the fleeing rock's velocity then drove the
      // relative-slip ω integrator to 60+ rad/s, and the loop fed itself. A tire can only deflect
      // so far — bound debris contacts to a deep-but-sane squish and the whole loop dies.
      if (dyn[i].depth > DYN_CONTACT_DEPTH_CAP) dyn[i].depth = DYN_CONTACT_DEPTH_CAP
      list.push(dyn[i])
    }
    return list
  }

  // ── Step 1: Catastrophic penetration failsafe ──────────────────────────────
  // Fires ONLY for genuine tunnelling. Uses queryContacts to detect terrain-aware severe penetration
  // instead of a flat y=0 half-space check (Phase 6 fix: TERR-FIX-01).
  // Old code: embed = wheelRadius - hub.y assumed flat ground at y=0 — always fired on terrain.
  //
  // BUG-24: the trigger stopped being a flat 0.3 m. 0.3 m sat BELOW the wheel radius (0.368 m), so a
  // deeply-compressed-but-normal contact would fire it: e.g. a wheel crossing the intended ~0.25 m
  // road-over-shoulder step has contact depth ~0.25 m + ~0.06 m loaded tire deflection ≈ 0.31 m > 0.3,
  // yet its hub center is still ~0.06 m ABOVE ground — a resolvable contact the suspension (Step 2.5)
  // handles via tire→strut→body force. That threshold preempted the force chain and hard-teleported the
  // body (position write + vy=0) → the observed "teleport instead of a natural bump".
  //
  // The trigger is now `depth > 2·wheelRadius` — the hub CENTER a full wheel radius BELOW the surface,
  // i.e. the whole wheel swallowed. `depth > wheelRadius` (hub center merely AT the surface) still fired
  // on hits the solvers recover from on their own; the teleport is a last-resort escape hatch for a true
  // tunnel (driven through a wall), and everything short of that belongs to Step 3b's Baumgarte, which
  // bleeds penetration out at ≤ MAX_CORRECTION per step instead of snapping.
  //
  // Only the TERRAIN contact can reach this line: its depth is a half-space measure (terrainH + r − cy)
  // that grows without bound as the hub sinks. Mesh/prop contacts compute depth = r − dist, capped at r,
  // so they never trip the failsafe at any threshold ≥ r — they rely on Step 3b (as they already did
  // under the old wheelRadius threshold).
  {
    let maxEmbed = 0
    for (let i = 0; i < 4; i++) {
      const hub      = getWheelPosition(i, vehicleState, params)
      const contacts = queryContacts(hub.x, hub.y, hub.z, params.wheelRadius, true)
      for (const { depth } of contacts) {
        if (depth > maxEmbed) maxEmbed = depth
      }
    }
    // Lifting by maxEmbed puts the hub back at terrainH + wheelRadius — the wheel resting ON the surface.
    if (maxEmbed > 2 * params.wheelRadius) {
      vehicleState.position.y += maxEmbed
      vehicleState.velocity.y  = 0
    }
  }

  // ── Step 1.5: Push authoritative state into the engine body ────────────────
  // vehicleState is the single source of truth every other system (and every
  // external mutation — teleport, spawn reseat, lab staging, the Step 1 failsafe
  // above) writes to. Pushing it into the engine at the top of every step makes
  // those hard-sets Just Work with no dirty-flag plumbing; the engine step below
  // then advances from exactly this state and Step 3e pulls the result back.
  engine.setTransform(chassis, vehicleState.position, vehicleState.quaternion)
  engine.setVelocity(chassis, vehicleState.velocity, vehicleState.angularVelocity)

  // ── Step 2: Body-space axes ────────────────────────────────────────────────
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(vehicleState.quaternion)
  const right   = new THREE.Vector3(1, 0, 0).applyQuaternion(vehicleState.quaternion)
  const up      = new THREE.Vector3(0, 1, 0).applyQuaternion(vehicleState.quaternion)

  // ── Step 2.1: Drivetrain (FEAT-23) ─────────────────────────────────────────
  // Engine → torque converter → automatic gearbox → final drive, stepped ONCE per physics step from
  // the start-of-step rear-axle ω (consistent with the operator-splitting the ω integrator already
  // uses). Writes params._driveTorque[4]; getDriveTorque (grounded + airborne branches) reads it.
  // vForward is the CG longitudinal speed (velocity · forward), which decides forward-vs-reverse.
  const vForward = vehicleState.velocity.x * forward.x +
                   vehicleState.velocity.y * forward.y +
                   vehicleState.velocity.z * forward.z
  stepDrivetrain(vehicleState, params, dt, vForward)

  // ── Step 2.5: Suspension substep loop (Phase 4.1) ──────────────────────────────────────────
  // Integrates strutComp/strutCompVel at dt/N substeps. Writes:
  //   params._tireFz[i]         — strut-axis tire-spring Fz per corner (fed to Pacejka per D-06b)
  //   params._suspForceAccum[i] — averaged suspension force on body per corner (applied along body_up below)
  //   params._hubNormalXZ[i]    — X/Z residual contact normal force per corner (applied in Step 2.6 below)
  // Must run BEFORE Step 3 so Pacejka reads the post-substep tire Fz (D-08).
  stepSuspensionSubsteps(vehicleState, params, dt, qcPlus)

  // ── Step 2.6: Apply XZ contact normal forces to body (Phase 4.1 D-06a) ─────────────────────
  // _hubNormalXZ[i] is the X/Z residual of tire contact normal force — the component of contact
  // normal that is NOT along the strut axis. On flat ground (body upright) this is exactly (0,0,0).
  // On a slope, this residual pushes the body horizontally, causing the car to slide downhill.
  // Applied AFTER substep loop but BEFORE the Pacejka Step 3 loop.
  //
  // Phase 4.1 D-06 architecture:
  //   - Strut-axis component of contact normal → spring pathway (_suspForceAccum) → body via Step 3
  //   - X/Z residual → _hubNormalXZ → direct body force + torque here
  //   On flat ground: _hubNormalXZ[i] = (0,0,0) exactly — legacy m4-02/04/05/06 assertions unaffected.
  //
  // NOTE: torque arm uses hub world position as approximation for contact patch (D-06a resolution).
  // The ~0.37 m offset along the contact normal (hub to actual contact patch) contributes a small
  // torque-arm error acceptable for body forces; a future phase may add _hubContactPoint accumulator
  // for higher accuracy.
  {
    // totalForce and totalTorque are declared below in Step 3; we apply here before the per-wheel loop.
    // Use a temporary accumulator then add after Step 3 declaration — or better, declare early.
    // Solution: the Step 2.6 XZ forces are accumulated into their own temp vectors and added to the
    // Step 3 totalForce/totalTorque after those are declared. See the _xzForce/_xzTorque application below.
  }
  // Pre-compute Step 2.6 XZ contributions so they can be added after totalForce/totalTorque are declared.
  const _xzForceX = [0, 0, 0, 0]
  const _xzForceY = [0, 0, 0, 0]
  const _xzForceZ = [0, 0, 0, 0]
  const _xzTorqueX = [0, 0, 0, 0]
  const _xzTorqueY = [0, 0, 0, 0]
  const _xzTorqueZ = [0, 0, 0, 0]
  if (params._hubNormalXZ) {
    for (let i = 0; i < 4; i++) {
      const xz = params._hubNormalXZ[i]
      if (!xz || (xz.x === 0 && xz.y === 0 && xz.z === 0)) continue
      // Hub world position for torque arm (approximation per D-06a)
      const hub_i  = getWheelPosition(i, vehicleState, params)
      const rHubX  = hub_i.x - vehicleState.position.x
      const rHubY  = hub_i.y - vehicleState.position.y
      const rHubZ  = hub_i.z - vehicleState.position.z
      // Cross product rHub × F_xz for torque
      _xzForceX[i]  = xz.x
      _xzForceY[i]  = xz.y
      _xzForceZ[i]  = xz.z
      _xzTorqueX[i] = rHubY * xz.z - rHubZ * xz.y
      _xzTorqueY[i] = rHubZ * xz.x - rHubX * xz.z
      _xzTorqueZ[i] = rHubX * xz.y - rHubY * xz.x
    }
  }

  // ── Step 3: Per-wheel force accumulation ──────────────────────────────────
  // Gravity is the ENGINE's (world gravity acts on the chassis body) — starting
  // this accumulator at zero instead of −mg is the cutover's one-source rule.
  const totalForce  = new THREE.Vector3()
  const totalTorque = new THREE.Vector3()
  let totalGroundFn = 0  // accumulated normal force across all wheel contacts; gates rolling resistance

  // Apply Step 2.6 pre-computed XZ contact normal forces (D-06a)
  for (let i = 0; i < 4; i++) {
    if (_xzForceX[i] !== 0 || _xzForceY[i] !== 0 || _xzForceZ[i] !== 0) {
      totalForce.x  += _xzForceX[i]
      totalForce.y  += _xzForceY[i]
      totalForce.z  += _xzForceZ[i]
      totalTorque.x += _xzTorqueX[i]
      totalTorque.y += _xzTorqueY[i]
      totalTorque.z += _xzTorqueZ[i]
    }
  }

  for (let i = 0; i < 4; i++) {
    // Phase 4: write per-wheel fz from substep result FIRST (D-12), then airborne check (D-14).
    // Zero wheelDebug for this wheel before contacts — ensures no stale values when wheel is off-ground.
    // The fz field is written from _tireFz (computed by stepSuspensionSubsteps above).
    if (vehicleState.wheelDebug) {
      vehicleState.wheelDebug[i] = { fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: params._tireFz[i] || 0, strutComp: vehicleState.strutComp?.[i] ?? 0 }
    }

    // Phase 4: airborne check (D-14). If tire-spring force is zero or negative, this wheel is
    // airborne. Pacejka contacts loop is skipped for airborne wheels. The omega integrator
    // (below, outside the contacts loop) still runs for airborne wheels so drive torque can
    // rev the wheel while airborne — lastFn=0 causes Newton to converge trivially with no road
    // reaction (this was already the behavior via the `if (lastFn <= 0) break` Newton guard).
    const isAirborne = (params._tireFz[i] || 0) <= 0

    // Phase 4: compute rMount (rotated body mount point offset) for suspension body force torque.
    // Must match the local offset used in stepSuspensionSubsteps for consistency.
    const isFrontW = i < 2
    const isLeftW  = i === 0 || i === 2
    const mLocalX = isLeftW
      ? -(isFrontW ? params.trackFront : params.trackRear) / 2
      :  (isFrontW ? params.trackFront : params.trackRear) / 2
    const mLocalZ = isFrontW
      ? -(params.wheelbase * params.weightRear)
      :  (params.wheelbase * params.weightFront)
    // Include suspensionBodyOffset so the suspension-force torque arm matches the mount used in
    // stepSuspensionSubsteps and getWheelPosition (BUG-05: all three mount-Y sites must agree).
    const mLocalY = -(params.cgHeight - params.wheelRadius) +
      (isFrontW ? (params.suspensionBodyOffsetFront || 0) : (params.suspensionBodyOffsetRear || 0))
    const rMount = params._rotateVector({ x: mLocalX, y: mLocalY, z: mLocalZ })

    // Phase 4.1: apply suspension spring force to body along strut axis (body_up direction).
    // Replaces the Phase 4 world-Y force vector — on a pitched body, the strut axis is NOT world-Y.
    // Applied regardless of airborne state: suspension spring still acts on body even when wheel lifts.
    // (When airborne, suspForce may be small/negative but damping still contributes, per D-15.)
    const suspBodyForce = up.clone().multiplyScalar(params._suspForceAccum[i])
    totalForce.add(suspBodyForce)
    totalTorque.add(new THREE.Vector3().crossVectors(rMount, suspBodyForce))

    // Airborne skip (D-14): skip Pacejka contacts loop for this wheel.
    // Omega integrator below still runs (lastFn=0 causes Newton to converge with no road reaction).
    if (isAirborne) {
      // Update omega debug for airborne wheels (CR-03: all wheels log omega every step)
      if (vehicleState.wheelDebug) vehicleState.wheelDebug[i].omega = vehicleState.wheelOmega?.[i] || 0
      // Fall through to omega integrator below — do NOT `continue` past it
      // (but we still need to run the integrator, so restructure to skip only the contacts loop)
      // Use lastFn=0 to signal airborne to the omega Newton loop.
      const wheelInertia_a = params.wheelInertia || 1.22
      const driveTorque_a  = getDriveTorque(i, vehicleState, params)
      const brakeTorque_a  = getBrakeTorque(i, vehicleState, params)
      const omega0_a       = vehicleState.wheelOmega?.[i] ?? 0
      const spinSign_a     = omega0_a >= 0 ? 1 : -1
      const brakeSigned_a  = brakeTorque_a * spinSign_a
      // Airborne: no road reaction, direct Euler step (Newton trivially converges with Flong=0)
      const omegaNew_a = omega0_a + (dt / wheelInertia_a) * (driveTorque_a - brakeSigned_a)
      if (brakeTorque_a > 0 && Math.sign(omegaNew_a) !== spinSign_a) {
        vehicleState.wheelOmega[i] = 0
      } else {
        vehicleState.wheelOmega[i] = omegaNew_a
      }
      if (vehicleState.wheelDebug) vehicleState.wheelDebug[i].omega = vehicleState.wheelOmega[i]
      continue  // skip the full Pacejka contacts loop + Newton omega below
    }

    // Hub world position (sphere center for contact queries)
    const hub  = getWheelPosition(i, vehicleState, params)
    const rHub = new THREE.Vector3(
      hub.x - vehicleState.position.x,
      hub.y - vehicleState.position.y,
      hub.z - vehicleState.position.z
    )

    // Hub velocity — used for tire slip angles
    const hubVel = vehicleState.velocity.clone().add(
      new THREE.Vector3().crossVectors(vehicleState.angularVelocity, rHub)
    )

    // Wheel-frame axes (steered for front wheels)
    const steer = (i < 2 && vehicleState.wheelSteerAngles)
      ? vehicleState.wheelSteerAngles[i]
      : (i < 2 ? vehicleState.steerAngle : 0)
    const steerQ     = new THREE.Quaternion().setFromAxisAngle(up, steer)
    const wheelFwd   = forward.clone().applyQuaternion(steerQ)
    const wheelRight = right.clone().applyQuaternion(steerQ)

    params._lateralVelocity      = hubVel.dot(wheelRight)
    params._longitudinalVelocity = hubVel.dot(wheelFwd)

    // Slip-velocity tire model with relaxation length (see tire.js header).
    // Per-tire state: vehicleState.slipLong[i], slipLat[i] — the "filtered" slip
    // displacements (m), evolved per-step via implicit Euler on ds/dt = v_slip − s·|v|/L.
    // Lazy-init so existing vehicleState shapes still work; arrays are tiny (4 floats each).
    if (!vehicleState.slipLong) vehicleState.slipLong = [0, 0, 0, 0]
    if (!vehicleState.slipLat)  vehicleState.slipLat  = [0, 0, 0, 0]

    // BUG-20: numeric floor only (keeps the relaxation denominator well-conditioned near rest).
    // Was 3.0 m/s — that large floor forced the stored slip displacement to bleed toward zero
    // below ~3 m/s, so the carcass spring could not hold at rest (no static friction: a braked
    // car ran away downhill) and the tire felt slippery under ~11 km/h. The blow-up at rest that
    // the old floor guarded against is now bounded by the friction-circle break-away clamp on
    // |(sLong,sLat)| below (sBreak) — the physically correct limiter.
    const SLIP_EPSILON = 0.05

    // Per-step bookkeeping for the ω integrator (Newton-iterated implicit Euler below).
    // Zero / null when airborne so road reaction = 0.
    let lastFn          = 0
    let lastSLongPrev   = 0   // sLong_old at this step's start (for Newton re-eval of s)
    let lastSLatNew     = 0   // sLat already committed (lateral doesn't iterate with ω)
    let lastLongVelCur  = 0
    let lastRelaxDen    = 1

    // Query every surface this wheel sphere overlaps (footprint=true: tire-envelope ground sampling).
    // qcPlus = analytic terrain/props/walls ∪ engine dynamic debris (FEAT-48 translation layer).
    const contacts = qcPlus(hub.x, hub.y, hub.z, params.wheelRadius, true)

    // BUG-38: the Pacejka tire is a per-WHEEL model with ONE slip state, so its friction must be
    // evaluated ONCE per wheel — NOT once per contact. Pick the support surface (normal most aligned
    // with world-up) as the tire patch. Wall / prop / ramp contacts already contributed their push-out
    // via _hubNormalXZ (stepSuspensionSubsteps) and must NOT each re-apply Pacejka grip — doing so
    // double-counted lateral + longitudinal force whenever a wheel straddled ground + a hard obstacle.
    // Fn (_tireFz[i]) is the SUMMED strut-axis load and is already ground-dominated: a wall's near-
    // horizontal normal projects ≈0 onto the strut axis, so it adds ~nothing to the tire's vertical load.
    let ground = null
    let bestUp = -Infinity
    for (const c of contacts) {
      if (c.normal.y > bestUp) { bestUp = c.normal.y; ground = c }
    }

    // Phase 4: Fn for Pacejka comes from params._tireFz[i] (computed by stepSuspensionSubsteps, per
    // D-03). computeNormalForce is a shim that reads _tireFz[i]. Body normal force is applied via
    // suspBodyForce above, NOT here. totalGroundFn (rolling-resistance gating) is accrued once per wheel.
    const Fn = computeNormalForce(i, vehicleState, params)
    if (ground && Fn > 0) {
      totalGroundFn += Fn

      const rContact = new THREE.Vector3(
        ground.contactPoint.x - vehicleState.position.x,
        ground.contactPoint.y - vehicleState.position.y,
        ground.contactPoint.z - vehicleState.position.z
      )
      const contactVel = vehicleState.velocity.clone().add(
        new THREE.Vector3().crossVectors(vehicleState.angularVelocity, rContact)
      )

      params._compression = ground.depth

      // FEAT-48: RELATIVE contact velocity. Against static ground (analytic terrain,
      // props — no .body) the support is at rest and this reduces exactly to the old
      // absolute-velocity formulation. Against a dynamic body (a rock rolling under
      // the wheel) slip and compression velocity are measured relative to the body's
      // own contact-point velocity — this one mechanism is what makes driving onto a
      // moving rock launch the car and kick the rock out, with no special cases.
      let groundVel = null
      if (ground.body != null) {
        groundVel = engine.getPointVelocity(ground.body, ground.contactPoint, _groundVelScratch)
        params._lateralVelocity      = (hubVel.x - groundVel.x) * wheelRight.x +
                                       (hubVel.y - groundVel.y) * wheelRight.y +
                                       (hubVel.z - groundVel.z) * wheelRight.z
        params._longitudinalVelocity = (hubVel.x - groundVel.x) * wheelFwd.x +
                                       (hubVel.y - groundVel.y) * wheelFwd.y +
                                       (hubVel.z - groundVel.z) * wheelFwd.z
        // Clamped: a debris body ricocheting off the rim can report a huge closing speed for a
        // frame; the tire damper term must not turn that into another force spike (same failure
        // family as the depth cap in qcPlus).
        const cvRel = -((contactVel.x - groundVel.x) * ground.normal.x +
                        (contactVel.y - groundVel.y) * ground.normal.y +
                        (contactVel.z - groundVel.z) * ground.normal.z)
        params._compressionVelocity = Math.max(-3, Math.min(3, cvRel))
      } else {
        params._compressionVelocity = -contactVel.dot(ground.normal)
      }

      // Phase 4.1 NOTE (D-06): do NOT add Fn*normal to totalForce here.
      // The strut-axis component of the contact normal flows through _suspForceAccum (spring pathway),
      // applied above via suspBodyForce = up * _suspForceAccum[i] along body_up.
      // The X/Z residual (off-axis component) flows through _hubNormalXZ, applied in Step 2.6 above.
      // This clean split ensures: on flat ground _hubNormalXZ[i] = (0,0,0) exactly →
      // existing m4-02/04/05/06 assertions remain unaffected by the Phase 4.1 changes.

      // Tire forces — slip-velocity Pacejka with relaxation length per tire.
      // The relaxation length L models tire carcass viscoelastic dynamics: the carcass
      // takes a characteristic distance L of vehicle travel to build up to its target
      // force. Implicit Euler on  ds/dt = v_slip − s·|v|/L  is unconditionally stable
      // and reduces effective stiffness dF/dω to the point where Newton-iterated implicit
      // Euler on the ω integrator (below) converges in 1-3 iterations at 60Hz.
      //
      // sLat is finalized here (depends on body lateral velocity, not on ω_new).
      // sLong is computed here at the current ω (for body-force application this step) but
      // re-evaluated and re-committed inside the ω Newton loop using the converged ω_new
      // — this is operator splitting: body force lags ω by one step, acceptable trade for
      // a clean Newton on ω alone.
      const longVelCur = params._longitudinalVelocity || 0
      const latVelCur  = params._lateralVelocity      || 0
      const omegaCur   = (vehicleState.wheelOmega?.[i] ?? 0) * params.wheelRadius
      const vCon       = Math.max(Math.abs(omegaCur), Math.abs(longVelCur), SLIP_EPSILON)
      const L          = params.tireRelaxationLength || 0.3
      const relaxDen   = 1 + dt * vCon / L
      const sLongPrev  = vehicleState.slipLong[i]
      let   sLatNew    = (vehicleState.slipLat[i] + dt * latVelCur) / relaxDen
      let   sLongCur   = (sLongPrev + dt * (omegaCur - longVelCur)) / relaxDen
      // BUG-20 friction-circle break-away clamp. The carcass stores deflection up to the static-
      // friction limit, then it slides. This gives honest static friction — the relaxation spring holds
      // up to ≈μ·Fn at rest so the car rests on any slope below atan(μ) — and bounds the stored
      // deflection so it can't blow up at low speed (the job the old 3.0 m/s SLIP_EPSILON floor did).
      // Clamping the COMBINED magnitude is the friction circle: longitudinal and lateral grip trade
      // against one shared limit. Replaces the old lateral steady-state (sLatSS) anti-slosh clamp.
      // The limit is expressed in Pacejka-ARGUMENT space (x = s/vRef ≈ slip-curve position), so
      // tireBreakawaySlip pins the break-away to a fixed point on the grip curve (≈ the peak) and the
      // actual displacement limit auto-scales with vRef. That keeps the break-away AT the peak as the
      // L/vRef "sloshiness" pair is retuned — otherwise a smaller vRef would push the clamp past the
      // peak into the unstable post-peak region and the static hold would creep on steep slopes.
      const vRef   = params.tireSlipVelRef || 1.0
      const sBreak = (params.tireBreakawaySlip || 0.18) * vRef
      const sMag   = Math.hypot(sLongCur, sLatNew)
      if (sMag > sBreak) { const k = sBreak / sMag; sLongCur *= k; sLatNew *= k }
      vehicleState.slipLat[i] = sLatNew

      const { Flong, Flat } = computeTireForces(sLongCur, sLatNew, Fn, params)

      // Save state for Newton iteration in ω integrator (re-evaluates sLong and F at ω_new).
      lastFn         = Fn
      lastSLongPrev  = sLongPrev
      lastSLatNew    = sLatNew
      lastLongVelCur = longVelCur
      lastRelaxDen   = relaxDen

      const wheelForce = wheelFwd.clone().multiplyScalar(Flong)
      // WR-02: lateral grip opposes lateral hub velocity (resists the slide), so positive Flat
      // from computeTireForces(positive slipVy) must be applied along -wheelRight.
      wheelForce.addScaledVector(wheelRight, -Flat)
      totalForce.add(wheelForce)
      totalTorque.add(new THREE.Vector3().crossVectors(rContact, wheelForce))

      // FEAT-48: equal-and-opposite onto the dynamic support — the tire's friction force
      // AND its normal load press on the body under the wheel at the contact point.
      // (Static supports have no .body; the terrain doesn't need its reaction.)
      //
      // The normal reaction is the CONTACT-LOCAL tire-spring force (stiffness × this contact's
      // capped depth), NOT the wheel's summed Fz: _tireFz[i] sums every contact the strut sees
      // (road + rock when straddling), and pushing the whole summed load into the rock alone
      // over-flung it. Bounded above by Fn — the rock can never receive more normal force than
      // the wheel is actually carrying.
      if (ground.body != null) {
        const FnContact = Math.min(Fn, params.tireStiffness * ground.depth)
        engine.applyForce(ground.body, {
          x: -wheelForce.x - FnContact * ground.normal.x,
          y: -wheelForce.y - FnContact * ground.normal.y,
          z: -wheelForce.z - FnContact * ground.normal.z,
        }, ground.contactPoint)
      }

      // Write debug data for logger — evaluated once per wheel against the chosen support surface (BUG-38).
      // NOTE: `sa` field now stores SLIP VELOCITY magnitude (m/s) instead of slip angle (rad).
      // Field name kept for log format stability; semantics document in GLOSSARY.
      if (vehicleState.wheelDebug) {
        vehicleState.wheelDebug[i].fn    = Fn
        vehicleState.wheelDebug[i].fy    = Flat
        vehicleState.wheelDebug[i].sa    = Math.hypot(sLongCur, sLatNew)
        vehicleState.wheelDebug[i].c     = params._compression
        vehicleState.wheelDebug[i].vLong = omegaCur - longVelCur
        vehicleState.wheelDebug[i].vLat  = latVelCur
      }
    }

    // Omega integrator — Newton-iterated implicit Euler. Runs once per wheel per step,
    // OUTSIDE the contacts loop (CR-03). Re-evaluates sLong(ω) and F_long(sLong) at each
    // Newton iteration so the iteration captures Pacejka saturation past peak — critical
    // for clean launch from rest, where a single linearized step would overshoot.
    //
    // The implicit equation we're solving for ω_new:
    //   ω_new = ω + dt/I · (T_drive − F_long(sLong_new(ω_new))·r − T_brake_signed)
    // where sLong_new(ω) = (sLong_old + dt·(ω·r − v_long)) / (1 + dt·|v_contact|/L)
    //
    // Newton converges in 1-3 iterations at 60Hz; the loop caps at 4 with a tight residual
    // tolerance. Airborne: lastFn = 0 ⇒ tireForce returns zero ⇒ ω evolves under drive/brake.
    {
      const wheelInertia = params.wheelInertia || 1.22
      const driveTorque  = getDriveTorque(i, vehicleState, params)
      const brakeTorque  = getBrakeTorque(i, vehicleState, params)
      const dsdo         = dt * params.wheelRadius / lastRelaxDen  // ∂sLong_new/∂ω_new
      const omega0       = vehicleState.wheelOmega?.[i] ?? 0
      const spinSign     = omega0 >= 0 ? 1 : -1
      const brakeSigned  = brakeTorque * spinSign

      // BUG-20: friction-circle limit, same as the force block (in Pacejka-argument space × vRef, so
      // it auto-scales with vRef). Lateral leg is fixed here (lastSLatNew), so the longitudinal leg
      // gets the remaining room on the circle.
      const sBreak    = (params.tireBreakawaySlip || 0.18) * (params.tireSlipVelRef || 1.0)
      const sLongMax  = Math.sqrt(Math.max(0, sBreak * sBreak - lastSLatNew * lastSLatNew))
      let omegaNew = omega0
      let sLongFinal = lastSLongPrev
      for (let iter = 0; iter < 4; iter++) {
        const omegaR    = omegaNew * params.wheelRadius
        let   sLongIter = (lastSLongPrev + dt * (omegaR - lastLongVelCur)) / lastRelaxDen
        if (sLongIter >  sLongMax) sLongIter =  sLongMax
        if (sLongIter < -sLongMax) sLongIter = -sLongMax
        sLongFinal = sLongIter
        if (lastFn <= 0) break  // airborne: no road reaction; Newton trivially converged
        const { Flong, dFmagDs } = computeTireForces(sLongIter, lastSLatNew, lastFn, params)
        const g  = omegaNew - omega0 - dt / wheelInertia * (driveTorque - Flong * params.wheelRadius - brakeSigned)
        // g'(ω) = 1 + dt·r/I · dF/dω,  with dF/dω = dFmagDs · dsdo
        const gp = 1 + dt * params.wheelRadius * dFmagDs * dsdo / wheelInertia
        const delta = g / gp
        omegaNew -= delta
        if (Math.abs(delta) < 1e-4) break
      }
      // Clamp: braking cannot reverse spin direction (brake stops the wheel, doesn't push through zero).
      // Must happen BEFORE committing sLong — if omega is clamped to 0 the Newton loop may have
      // diverged to a large unphysical omegaNew (wrong sign), so sLongFinal would be based on that
      // wrong omega. Re-evaluate sLong at the ACTUAL committed omega (0 when clamped) so the
      // slip state stays consistent with the wheel speed. Inconsistent sLong would generate a force
      // in the wrong direction on the next step (accelerating backward instead of braking).
      if (brakeTorque > 0 && Math.sign(omegaNew) !== spinSign) {
        vehicleState.wheelOmega[i] = 0
        // Recompute sLong at omega=0 so slip state matches actual wheel speed.
        sLongFinal = (lastSLongPrev + dt * (0 - lastLongVelCur)) / lastRelaxDen
        if (sLongFinal >  sLongMax) sLongFinal =  sLongMax
        if (sLongFinal < -sLongMax) sLongFinal = -sLongMax
      } else {
        vehicleState.wheelOmega[i] = omegaNew
      }

      // Commit sLong after clamp so the stored value is consistent with the actual committed omega.
      vehicleState.slipLong[i] = sLongFinal
    }

    // Update omega debug field — airborne wheels still log their evolving omega (CR-03)
    if (vehicleState.wheelDebug) {
      vehicleState.wheelDebug[i].omega = vehicleState.wheelOmega[i]
    }
  }

  // ── Step 3a: Rolling resistance — horizontal velocity-aligned drag scaled by ground load ──
  // Standard tire model: F_drag = -Cr · Σ Fn · v̂_horizontal. Vertical (Fn) carries the load,
  // so scaling by Σ Fn means the drag vanishes when airborne and matches static weight on flat ground.
  // 0.05 m/s deadband prevents creep oscillation at standstill.
  {
    const Cr = params.rollingResistanceCoeff || 0
    if (Cr > 0 && totalGroundFn > 0) {
      const vx = vehicleState.velocity.x
      const vz = vehicleState.velocity.z
      const vHoriz = Math.sqrt(vx * vx + vz * vz)
      if (vHoriz > 0.05) {
        const dragMag = Cr * totalGroundFn
        totalForce.x -= dragMag * vx / vHoriz
        totalForce.z -= dragMag * vz / vHoriz
      }
    }
  }

  // ── Step 3a-aero: Quadratic aerodynamic drag (FEAT-23) ─────────────────────
  // F_aero = -½·ρ·(Cd·A)·|v|·v on the horizontal velocity. Without it the geared drivetrain would
  // keep accelerating to an unrealistic top speed (rolling resistance alone is near-constant); this
  // is what settles top-gear cruise at a believable terminal speed. Applies in air too (body drag).
  // aeroDragArea is the lumped Cd·A [m²]; 0 disables. ρ ≈ 1.225 kg/m³ (sea-level air) folded into ½ρ.
  {
    const CdA = params.aeroDragArea || 0
    if (CdA > 0) {
      const HALF_RHO = 0.6125   // ½ · 1.225 kg/m³
      const vx = vehicleState.velocity.x
      const vz = vehicleState.velocity.z
      const vHoriz = Math.sqrt(vx * vx + vz * vz)
      if (vHoriz > 0.1) {
        const dragMag = HALF_RHO * CdA * vHoriz * vHoriz
        totalForce.x -= dragMag * vx / vHoriz
        totalForce.z -= dragMag * vz / vHoriz
      }
    }
  }

  // ── Step 3b: Hand the accumulated forces to the engine and step the world ──
  // FEAT-48 cutover: the semi-implicit Euler velocity integration, the BUG-27
  // accumulated-impulse body-contact solver, and the Step 4/5 position+quaternion
  // integration are all the ENGINE's job now (with full-tensor world-frame
  // inertia and gyroscopic terms the old world-diagonal integrator lacked).
  // totalForce/totalTorque are about the CG — the body origin — so center
  // application is exact. The engine also advances every debris body here:
  // ONE world step per physics tick, chassis↔debris↔terrain solved together.
  engine.applyForce(chassis, totalForce)
  engine.applyTorque(chassis, totalTorque)
  // 8 substeps (not the engine-default 4): the chassis carries the TUNED inertia, whose x-axis
  // value sits ~3× below the hull-natural tensor, and the soft-step solver converts some of a
  // flat bare-frame slam into rocking rebound when under-substepped. 8 halves that phantom
  // bounce (measured: e_eff 0.30 → 0.21 on a worst-case flat slam) and costs microseconds at
  // this body count. See test/body-contact-energy.mjs for the measured envelope.
  engine.step(dt, params.engineSubsteps ?? 8)

  // ── Step 3e: Pull the engine result back into the authoritative JS mirror ──
  engine.getTransform(chassis, vehicleState.position, vehicleState.quaternion)
  engine.getVelocity(chassis, vehicleState.velocity, vehicleState.angularVelocity)
  vehicleState.quaternion.normalize()
}

// Scratch for the dynamic-support ground velocity (avoids a per-contact alloc).
const _groundVelScratch = { x: 0, y: 0, z: 0 }

// Max contact depth a DYNAMIC body (debris under the wheel) may report into the tire spring.
// A loaded tire's real deflection is ~0.05 m; 0.09 allows a hard bump (~2× static corner load
// at current tireStiffness) while making the one-frame full-radius spike impossible. Static
// terrain contacts are untouched — their depth is already continuous.
const DYN_CONTACT_DEPTH_CAP = 0.09
