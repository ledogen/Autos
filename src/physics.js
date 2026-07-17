/**
 * src/physics.js — Physics integrator for RangerSim.
 *
 * 6DOF rigid body step using quaternion orientation (see GLOSSARY.md §Quaternion Integration Convention).
 * Imports computeTireForces (combined-slip Pacejka) from tire.js and
 * computeNormalForce/getWheelPosition/getBodyContactPoints from suspension.js.
 *
 * Contact model: each wheel is a sphere (hub center + wheelRadius). The caller supplies
 * queryContacts(cx, cy, cz, r) → Array<{normal, depth, contactPoint}> which returns every
 * surface the sphere overlaps. Forces are applied independently per contact, enabling
 * slopes, walls, and multiple simultaneous contacts.
 *
 * Body contact points (bumper corners) use the same queryContacts path but generate
 * normal-only force — no tire lateral/longitudinal forces.
 *
 * Exports:
 *   stepPhysics(vehicleState, params, dt, queryContacts) — mutates vehicleState in-place
 *   getDriveTorque(wheelIndex, vehicleState, params) — Phase 1 RWD flat torque stub (M1-14)
 *
 * Conventions: see docs/GLOSSARY.md
 * Forbidden: body rotation must always use THREE.Quaternion, never bodyMesh.rotation
 */

import * as THREE from 'three'
import { computeTireForces } from './tire.js'
import { computeNormalForce, getWheelPosition, getBodyContactPoints, stepSuspensionSubsteps } from './suspension.js'
import { stepDrivetrain } from './drivetrain.js'

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
//
// BUG-27 history: this was pinned to 0 because the solver AMPLIFIED any e > 0. The old sweep did
// `dN = -(1+e)·vn` off the CURRENT vn every pass, so restitution was re-applied 8 passes × 6
// coincident undercarriage probes — a nominal 0.05 landed at ~0.15 effective and launched the car.
// The conclusion drawn then ("a steel frame does not rebound") was really a workaround for that
// amplification: e=0 is the one value the buggy formulation happens to handle correctly, because
// driving vn → 0 is idempotent no matter how many times you re-apply it.
//
// Fixed properly (2026-07-16) with the standard restitution BIAS: each contact's approach velocity
// is sampled ONCE before the solver and the passes drive vn toward a FIXED target (−e·vnApproach)
// instead of recomputing the target from the velocity the previous pass just changed. Convergence
// is now to that target, so e means what it says and does not compound with probe count or pass
// count. That makes restitution a real, tunable parameter — hence the slider.
const BODY_RESTITUTION_DEFAULT = 0.21   // slight rebound on hard slams; 0 = the old fully-plastic thud
// Restitution applies only to genuine IMPACTS. Below this approach speed the bias is 0, so resting /
// settling contact stays dead-stopped and cannot jitter or creep (the job the removed BUG-27-era
// REST_VEL_THRESHOLD used to do, reinstated now that e > 0 is back on the table).
const REST_VEL_THRESHOLD = 1.0   // m/s — |vn| below this → no bounce, pure plastic stop
// BUG-27b: body contact is SLIPPERY — damp the NORMAL (arrest sink-in, no launch) but do NOT
// arrest tangential/forward slide. At mu=0.6 a bumper grazing the road while crossing the shoulder
// saturated friction (jf = vt/invEffMassT ≤ 0.6·accumN) and stopped the truck DEAD. A low mu caps
// the tangential impulse well below full arrest, so the frame slides along the surface (steel-on-
// dirt is slippery) while the plastic normal still kills the springy bounce. Only the normal is damped.
const BODY_FRICTION_MU  = 0.1   // slippery body contact — normal-damped, tangential slides (BUG-27b)

export function stepPhysics (vehicleState, params, dt, queryContacts, queryVertexContacts) {
  // ── Step 0: Rotation helper ────────────────────────────────────────────────
  params._rotateVector = (v) => new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(vehicleState.quaternion)

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
      const contacts = queryContacts(hub.x, hub.y, hub.z, params.wheelRadius)
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
  stepSuspensionSubsteps(vehicleState, params, dt, queryContacts)

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
  const totalForce  = new THREE.Vector3(0, -params.mass * 9.81, 0)
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

    // Query every surface this wheel sphere overlaps
    const contacts = queryContacts(hub.x, hub.y, hub.z, params.wheelRadius)

    for (const { normal, depth, contactPoint } of contacts) {
      const rContact = new THREE.Vector3(
        contactPoint.x - vehicleState.position.x,
        contactPoint.y - vehicleState.position.y,
        contactPoint.z - vehicleState.position.z
      )
      const contactVel = vehicleState.velocity.clone().add(
        new THREE.Vector3().crossVectors(vehicleState.angularVelocity, rContact)
      )

      params._compression         = depth
      params._compressionVelocity = -contactVel.dot(normal)

      // Phase 4: Fn for Pacejka comes from params._tireFz[i] (computed by stepSuspensionSubsteps,
      // per D-03). computeNormalForce is now a shim that reads _tireFz[i].
      // Phase 4: body normal (vertical) force is applied via suspBodyForce above, NOT here.
      // We still track totalGroundFn for rolling resistance gating.
      const Fn = computeNormalForce(i, vehicleState, params)
      if (Fn <= 0) continue
      totalGroundFn += Fn

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

      // Write debug data for logger — last contact wins (most steps have exactly one contact).
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

  // ── Step 3b-pre: Integrate force → velocity BEFORE body contact (semi-implicit Euler) ──
  // Gravity and accumulated forces must hit the velocity BEFORE the body-contact impulse
  // solver runs. Previously velocity was integrated in Step 4 (after the solver), so each
  // frame the solver nulled the contact velocity and gravity was re-added immediately after —
  // leaving a body-at-rest in a perpetual sink-and-correct micro-jitter (observed as vy pinned
  // at ~-0.8 m/s and roll rate flipping sign every frame when resting upside-down). Integrating
  // first lets the solver see the gravity-loaded velocity and cancel it to a true rest.
  vehicleState.velocity.addScaledVector(totalForce, dt / params.mass)
  vehicleState.angularVelocity.x += totalTorque.x / params.inertiaRoll  * dt
  vehicleState.angularVelocity.y += totalTorque.y / params.inertiaYaw   * dt
  vehicleState.angularVelocity.z += totalTorque.z / params.inertiaPitch * dt

  // ── Step 3b: Body contact — sphere probes + sequential-impulse solver ───────────────
  // Sphere probes at body contact points. Contact normal comes from
  // sphere-center-to-closest-triangle-point (queryContacts). Impulse: instantaneous velocity
  // change sized to resolve the contact this step. Baumgarte correction bleeds out residual
  // penetration. Contacts are gathered once, then solved over several Gauss-Seidel passes so
  // coincident points (e.g. four roof corners when upside-down) settle to a consistent rest
  // instead of fighting in a single pass.
  {
    // BUG-27: Baumgarte tamed. The position correction below pushes the body OUT of penetration
    // but injects gravitational PE with no matching velocity sink — on a deep slam (depth up to
    // ~0.16 m across the coincident undercarriage probes) the old beta=0.25 lifted the body ~4 cm
    // per step every step, compounding into the upward "launch/creep" after the bounce. Lower beta
    // + a hard per-step clamp let deep penetration bleed out over a few frames instead of catapulting
    // (true tunnels are still caught by the Step 1 failsafe). The velocity solver already dead-stops
    // the contact (restitution 0), so the residual depth is small and a gentle correction suffices.
    const BAUMGARTE_BETA = 0.1     // was 0.25 — softer positional push, less PE injected per step
    const MAX_CORRECTION = 0.02    // m — cap the per-step de-penetration so a deep hit can't launch
    const SLOP = 0.005
    const SOLVER_ITERATIONS = 8     // sequential-impulse passes for coincident-contact convergence

    // Gather all body contacts once — queryContacts is expensive, so don't re-run it per pass.
    const bodyPts = getBodyContactPoints(vehicleState, params)
    const bodyContacts = []
    for (const bp of bodyPts) {
      const contacts = queryContacts(bp.x, bp.y, bp.z, params.bodyContactRadius)
      for (const { normal, depth, contactPoint } of contacts) {
        const rContact = new THREE.Vector3(
          contactPoint.x - vehicleState.position.x,
          contactPoint.y - vehicleState.position.y,
          contactPoint.z - vehicleState.position.z
        )
        const rCrossN = new THREE.Vector3().crossVectors(rContact, normal)
        const iInvRCrossN = new THREE.Vector3(
          rCrossN.x / params.inertiaRoll,
          rCrossN.y / params.inertiaYaw,
          rCrossN.z / params.inertiaPitch
        )
        const invEffMass = 1 / params.mass + rCrossN.dot(iInvRCrossN)
        // Restitution bias, sampled ONCE here from the pre-solve approach velocity (see
        // BODY_RESTITUTION_DEFAULT). vnApproach < 0 = closing on the surface; the solver then drives
        // vn up to +bias instead of merely to 0. Computing it here — not inside the pass loop — is
        // what stops e from compounding across passes/probes (the BUG-27 launch).
        const vApproach = vehicleState.velocity.clone().add(
          new THREE.Vector3().crossVectors(vehicleState.angularVelocity, rContact)
        )
        const vnApproach = vApproach.dot(normal)
        const e = params.bodyRestitution ?? BODY_RESTITUTION_DEFAULT
        const bias = vnApproach < -REST_VEL_THRESHOLD ? -e * vnApproach : 0
        bodyContacts.push({ normal, depth, rContact, iInvRCrossN, invEffMass, bias })
      }
    }

    // Velocity solver — accumulated-impulse projected Gauss-Seidel (BUG-27).
    // The previous solver applied a FRESH full normal impulse (−vn/invEffMass) every pass without
    // tracking the accumulated impulse. On a hard slam the body probes are coincident but at very
    // different lever arms (front/rear undercarriage + bumpers span ~4 m in z), and that
    // non-accumulated sweep did NOT converge to the inelastic resting solution in 8 passes — it
    // pumped a large phantom PITCH rotation (ω_z ≈ −2 rad/s from a pure vertical drop) plus net
    // UPWARD velocity, i.e. it CREATED energy and launched the car. Accumulating each contact's
    // impulse and clamping the TOTAL to be non-negative (the standard sequential-impulse / Box2D
    // formulation) converges to the true LCP solution: the body stops dead, no phantom spin,
    // mechanical energy strictly removed. Resting contact is unchanged (it already sat at vn ≈ 0).
    for (const c of bodyContacts) { c.accumN = 0 }

    for (let iter = 0; iter < SOLVER_ITERATIONS; iter++) {
      for (const c of bodyContacts) {
        const { normal, rContact, iInvRCrossN, invEffMass, bias } = c

        // ── Normal impulse: drive vn → the fixed bias target, accumulate & clamp ≥ 0 ──
        // bias = 0 (resting / slow contact) → vn → 0, the old fully-plastic behaviour, unchanged.
        // bias > 0 (impact)                → vn → +bias, i.e. it leaves with e × its approach speed.
        // The target is a CONSTANT for the whole solve, so re-running this pass is idempotent once
        // converged — that's why restitution no longer amplifies with pass/probe count (BUG-27).
        let vertVel = vehicleState.velocity.clone().add(
          new THREE.Vector3().crossVectors(vehicleState.angularVelocity, rContact)
        )
        const vn = vertVel.dot(normal)
        let dN = -(vn - bias) / invEffMass
        const newN = Math.max(0, c.accumN + dN)   // total normal impulse can never pull the body down
        dN = newN - c.accumN
        c.accumN = newN
        if (dN !== 0) {
          vehicleState.velocity.addScaledVector(normal, dN / params.mass)
          vehicleState.angularVelocity.x += iInvRCrossN.x * dN
          vehicleState.angularVelocity.y += iInvRCrossN.y * dN
          vehicleState.angularVelocity.z += iInvRCrossN.z * dN
        }

        // ── Coulomb friction: tangential impulse opposing slide, capped at μ · accumulated normal ──
        if (c.accumN > 0) {
          vertVel = vehicleState.velocity.clone().add(
            new THREE.Vector3().crossVectors(vehicleState.angularVelocity, rContact)
          )
          const vnNow = vertVel.dot(normal)
          const vt    = vertVel.clone().addScaledVector(normal, -vnNow)  // tangential velocity
          const vtMag = vt.length()
          if (vtMag > 1e-6) {
            const tDir      = vt.clone().multiplyScalar(-1 / vtMag)   // oppose sliding
            const rCrossT   = new THREE.Vector3().crossVectors(rContact, tDir)
            const iInvRCrossT = new THREE.Vector3(
              rCrossT.x / params.inertiaRoll,
              rCrossT.y / params.inertiaYaw,
              rCrossT.z / params.inertiaPitch
            )
            const invEffMassT = 1 / params.mass + rCrossT.dot(iInvRCrossT)
            const jf = Math.min(vtMag / invEffMassT, BODY_FRICTION_MU * c.accumN)
            if (jf > 0) {
              vehicleState.velocity.addScaledVector(tDir, jf / params.mass)
              vehicleState.angularVelocity.x += iInvRCrossT.x * jf
              vehicleState.angularVelocity.y += iInvRCrossT.y * jf
              vehicleState.angularVelocity.z += iInvRCrossT.z * jf
            }
          }
        }
      }
    }

    // Baumgarte position correction — applied once after the velocity solver converges.
    // BUG-27: clamped to MAX_CORRECTION so a deep slam de-penetrates over several frames rather
    // than teleporting up in one (which injected unbounded PE → the launch).
    for (const { normal, depth } of bodyContacts) {
      const correction = Math.min(Math.max(0, depth - SLOP) * BAUMGARTE_BETA, MAX_CORRECTION)
      if (correction > 0) {
        vehicleState.position.x += normal.x * correction
        vehicleState.position.y += normal.y * correction
        vehicleState.position.z += normal.z * correction
      }
    }
  }

  // ── Step 4: Integrate position (velocity already integrated in Step 3b-pre + contacts) ──
  vehicleState.position.addScaledVector(vehicleState.velocity, dt)

  // ── Step 5: Integrate quaternion orientation (angular velocity already integrated above) ──
  const omega    = vehicleState.angularVelocity
  const angSpeed = omega.length()
  if (angSpeed > 1e-10) {
    const axis = omega.clone().normalize()
    const dq   = new THREE.Quaternion().setFromAxisAngle(axis, angSpeed * dt)
    vehicleState.quaternion.premultiply(dq).normalize()
  }
}
