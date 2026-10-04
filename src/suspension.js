/**
 * src/suspension.js — the strut model: four quarter-car spring-dampers on a rigid body.
 *
 * Each corner is a hub that slides along the body's own up/down axis (the strut). Its state is
 * strutComp / strutCompVel (compression in metres, positive = compressed). Per physics step,
 * stepSuspensionSubsteps integrates the four hubs at dt/4 against the tire spring (which reads the
 * ground through queryContacts) and publishes three per-corner results for physics.js to apply:
 *   params._tireFz[i]         strut-axis tire load      → the Pacejka normal force
 *   params._suspForceAccum[i] spring + damper + ARB     → body force along the strut
 *   params._hubNormalXZ[i]    off-axis contact residual → body force (what slides a truck downhill)
 *
 * Pure math, no Three.js import (testable in node). The body rotation arrives as
 * params._rotateVector, injected by physics.js each step; without it the body is taken as upright.
 * Positions are plain {x, y, z}.
 *
 * Conventions: see docs/GLOSSARY.md. Wheel index: 0=FL, 1=FR, 2=RL, 3=RR.
 */

/**
 * The tire's normal load on one corner [N] — params._tireFz[corner], as written by the last
 * stepSuspensionSubsteps. 0 before the first step and for an airborne wheel.
 */
export function computeNormalForce (corner, vehicleState, params) {
  return (params._tireFz && typeof params._tireFz[corner] === 'number')
    ? params._tireFz[corner]
    : 0
}

/**
 * World-space position of one wheel's hub CENTRE (not the contact patch — physics.js hands the
 * hub and the wheel radius to queryContacts, which finds the patch on slopes and walls alike).
 *
 * hubWorld = mountWorld + strutLen * body_down, where strutLen = L_S - strutComp[i] (D-02).
 *
 * @param {number} corner - Wheel index 0-3 (0=FL, 1=FR, 2=RL, 3=RR per GLOSSARY.md §Wheel Index).
 * @param {object} vehicleState - Full vehicleState; uses .position, .quaternion, .strutComp.
 * @param {object} params - RANGER_PARAMS; uses wheelbase, trackFront, trackRear, cgHeight,
 *   wheelRadius, weightFront, weightRear, suspensionRestLengthFront/Rear.
 *   Also uses params._rotateVector (function) — injected by physics.js before calling.
 * @returns {{x:number, y:number, z:number}} World-space position of wheel hub center.
 */
export function getWheelPosition (corner, vehicleState, params) {
  const isFront = corner === 0 || corner === 1
  const isLeft  = corner === 0 || corner === 2

  const localX = isLeft
    ? -(isFront ? params.trackFront : params.trackRear) / 2
    :  (isFront ? params.trackFront : params.trackRear) / 2

  const localZ = isFront
    ? -(params.wheelbase * params.weightRear)
    :  (params.wheelbase * params.weightFront)

  // Wheel hub center: (cgHeight - wheelRadius) below CG in body Y (mount point in body space).
  // MUST include suspensionBodyOffset to match stepSuspensionSubsteps (_mountLocal). Without it the
  // Pacejka contact query places the hub at the wrong height when ride height is tuned, so
  // queryContacts finds no ground contact while the suspension is loaded — wheels report Fn=0/SA=0
  // and the truck slides frictionlessly even though the strut is bearing weight (BUG-05 real cause).
  const localY = -(params.cgHeight - params.wheelRadius) +
    (isFront ? (params.suspensionBodyOffsetFront || 0) : (params.suspensionBodyOffsetRear || 0))

  // Rotate local offset into world space using the injected helper.
  const local = { x: localX, y: localY, z: localZ }
  const rotated = typeof params._rotateVector === 'function'
    ? params._rotateVector(local)
    : { x: localX, y: localY, z: localZ }

  // Phase 4.1 (D-02): derive hub world position from strutComp along body_down axis.
  // strutLen = L_S - strutComp[i]; hubWorld = mountWorld + strutLen * body_down.
  const L_S_corner = isFront
    ? params.suspensionRestLengthFront
    : params.suspensionRestLengthRear
  const strutComp_corner = (vehicleState.strutComp && typeof vehicleState.strutComp[corner] === 'number')
    ? vehicleState.strutComp[corner]
    : 0
  const strutLen_corner = L_S_corner - strutComp_corner

  // body_down: rotate (0,-1,0) by body quaternion. Falls back to world-down if helper absent.
  const body_down_g = typeof params._rotateVector === 'function'
    ? params._rotateVector({ x: 0, y: -1, z: 0 })
    : { x: 0, y: -1, z: 0 }

  return {
    x: vehicleState.position.x + rotated.x + strutLen_corner * body_down_g.x,
    y: vehicleState.position.y + rotated.y + strutLen_corner * body_down_g.y,
    z: vehicleState.position.z + rotated.z + strutLen_corner * body_down_g.z
  }
}

/*
 * ── Out-of-round tires (SM-3) ───────────────────────────────────────────────────────────────────
 *
 * `params.wheelRunout` is the PEAK-TO-PEAK radius variation in metres (0 = perfectly round), so the
 * amplitude about the nominal radius is half of it: a 0.02 m runout means +/-0.01 m.
 *
 * The SHAPE is set by RUNOUT_HARMONIC — how many high spots there are around the carcass, which is
 * the whole character of the defect:
 *
 *   n = 1  ECCENTRIC. One high spot. r(theta) = R + A*sin(theta + phi), which to first order is a
 *          round tire whose centre is offset from the axle — a bent rim, a flat spot, a tire mounted
 *          with its high point off the valve. ONE hop per revolution, at wheel frequency.
 *   n = 2  OVAL. Two high spots, 180 deg apart, so the carcass is squashed across one diameter and
 *          stretched across the other. Uneven wear, a pinched rim, a heat-set carcass. TWO hops per
 *          revolution, at twice wheel frequency — the same runout therefore shakes at half the road
 *          speed an eccentric tire would, and reads unmistakably as a wheel that is not round.
 *
 * n = 2 is the shipped model: "out of round" means OVAL here (owner, 2026-08-20). Changing this one
 * number changes both the physics and the mesh together — carcassRadialOffset() below is derived
 * for general n, and test/wheel-runout-mesh.mjs re-checks the agreement at whatever n is set.
 *
 * Either way the vertical force gets a sinusoid at n * (omega / 2*pi) Hz — the classic wheel hop /
 * steering-wheel shimmy that grows with speed.
 *
 * Each corner carries a fixed phase offset so the four wheels do not hop in lockstep (a real set of
 * tires is never phase-matched, and in-phase hop would read as pure heave).
 *
 * The hub CENTER is unaffected — runout is tire-carcass geometry, not axle position — so only the
 * contact-query radius uses this, never getWheelPosition(). An oval tire on a straight axle is
 * exactly that: the axle runs true, the rubber around it does not.
 */

/**
 * Soft band between the wheel's rigid core and the visual tire radius — the depth range the
 * analytic tire spring owns. Past it there is no rubber left and the rim is bearing directly.
 * (0.15 m, raised from 0.07 on 2026-08-15: a thicker band gives the suspension more travel-time to
 * absorb fast hits before the rigid core engages — high-speed rock hits felt chassis-hard.)
 */
export const WHEEL_SOFT_BAND = 0.15

export const TIRE_DAMP_ENGAGE = 0.04   // m — debris contacts: full tire damper by one static deflection of depth (see tireContactForce)

/**
 * THE tire contact law — the normal force [N] one contact of depth `depth` [m] produces, for a
 * tire whose air carries `rate` (1 = inflated, →0 flat) of its stiffness. Used by the suspension
 * (the force on the hub) AND by physics.js for the equal-and-opposite force on a debris body under
 * the wheel, so the two sides are the same law by construction (Newton's third law).
 *
 * Three pieces, each explained where it was derived:
 *   · OBSTACLE ENGAGEMENT `env` (sizeR given ⇒ a debris body): the carcass wraps an object smaller
 *     than its own patch, so the engaged fraction is the indenter's contact area over the tire's
 *     nominal patch area — min(1, 2π·sizeR·depth / tireContactAreaM2), progressive from first touch.
 *     Terrain and static props envelope GEOMETRICALLY in the analytic query instead (sizeR absent).
 *   · PROGRESSIVE CARCASS `carcass − 1`: the rate climbs as the sidewall is used up,
 *     1 / (1 − (depth/sidewall)²), clamped at 0.94 of the sidewall (≈8.6×) — deeper is the rim's
 *     and the failsafe's problem, not this spring's. Scaled by NOTHING: a flat tire still stacks up
 *     against its rim, which is what stops the wheel sinking through the road.
 *     Its rate is `tireCarcassStiffness`, NOT the air rate `tireStiffness` (2026-10-03). Past the
 *     soft band this term IS the rim contact, so tying it to the air rate made a harder-pumped tire
 *     a harder RIM: at 200 kN/m every hit big enough to bottom the tire anyway (an angled rock, the
 *     foot of a steep dip) met a rim twice as stiff and peaked ~√2 higher. test/rim-angle-lab.mjs.
 *   · AIR SPRING and DAMPER, both × `rate`: a puncture lets the air out; what is left is the carcass.
 *
 * @param {number} depth          penetration [m], ≥ 0 meaningful
 * @param {number} compressionVel closing speed [m/s], positive = compressing (caller's convention)
 * @param {number|undefined} sizeR obstacle size for the engagement factor; undefined = ground
 * @param {number} rate           params._tireRateScale[i] (1 when no damage model runs)
 * @param {object} params         RANGER_PARAMS (tireStiffness, tireDamping, wheelRadius, rimRadius, tireContactAreaM2)
 */
/** Rate of the progressive carcass / bottoming term [N/m]; the air rate where a preset has none. */
export function carcassStiffness (params) {
  return params.tireCarcassStiffness ?? params.tireStiffness
}

export function tireContactForce (depth, compressionVel, sizeR, rate, params) {
  const env = (sizeR !== undefined)
    ? Math.min(1, 2 * Math.PI * sizeR * Math.max(0, depth) / (params.tireContactAreaM2 || 0.0166))
    : 1
  const sidewall = (params.wheelRadius || 0.368) - (params.rimRadius || 0.1905)
  const dNorm = Math.min(0.94, Math.max(0, depth) / sidewall)
  const carcass = 1 / (1 - dNorm * dNorm)
  const airTerm    = params.tireStiffness * rate * depth
  const bottomTerm = carcassStiffness(params) * depth * (carcass - 1)
  return Math.max(0, airTerm + bottomTerm + params.tireDamping * rate * compressionVel) * env
}

const RUNOUT_PHASE = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]
export const RUNOUT_HARMONIC = 2   // 1 = eccentric (one high spot), 2 = oval (two)

/**
 * Peak-to-peak radial runout in effect on one corner, in metres.
 *
 * `params.wheelRunout` is the manual slider (a whole-vehicle test value); `params._wheelRunout[i]`
 * is the per-wheel value the SM-3 damage model publishes from that wheel's condition, in the same
 * `params._` scratch convention as every other damage effect. Undefined means no damage model is
 * running — headless gates, damage off — and the slider alone applies. Defaults to 0 both ways, so
 * a stock truck rolls on perfectly round wheels and the whole path short-circuits.
 *
 * This is the ONE place slider and damage are resolved; everything else asks here.
 */
export function wheelRunoutOf (corner, params) {
  return params._wheelRunout ? params._wheelRunout[corner] : (params.wheelRunout || 0)
}

/**
 * Effective (rolling-surface) tire radius for one corner at its current spin angle.
 *
 * Phase comes from vehicleState.wheelPhase — integrated by physics.js at the FIXED physics step,
 * never at the render rate, or the ride becomes framerate-dependent (INFRA-03 determinism). It is
 * also the angle vehicle-model.js spins the wheel MESH by, whose tire has the same runout baked
 * into its geometry, so the visible high spot is the one being contacted here.
 *
 * @param {number} corner - 0-3 (FL, FR, RL, RR).
 * @param {object} vehicleState - uses .wheelPhase[corner] (rad, integrated in physics.js).
 * @param {object} params - uses wheelRadius, plus wheelRunout / _wheelRunout via wheelRunoutOf().
 * @returns {number} radius in metres.
 */
export function effectiveWheelRadius (corner, vehicleState, params) {
  const runout = wheelRunoutOf(corner, params)   // slider + this wheel's damage-driven runout
  if (runout === 0) return params.wheelRadius
  const theta = (vehicleState.wheelPhase && vehicleState.wheelPhase[corner]) || 0
  return params.wheelRadius + 0.5 * runout * Math.sin(RUNOUT_HARMONIC * theta + RUNOUT_PHASE[corner])
}

/**
 * Radial offset of the out-of-round tire CARCASS at build-frame carcass angle `psi`, for one corner.
 *
 * The mesh half of effectiveWheelRadius(): vehicle-model.js displaces its tread vertices by this so
 * the tire you can SEE is the tire the contact query is rolling on. It lives here, next to the
 * radius it must agree with, because the two are one model — edit one, edit both.
 *
 * Derivation. The wheel geometry is built with its spin axis along +X, so a vertex sits at carcass
 * angle psi = atan2(z, y). syncMeshesToState spins the wheel group about +X by −phase, and the
 * LEFT-side assembly is pre-flipped by rotation.y = PI. Pushing a vertex through that chain and
 * asking which one lands at the contact patch (angle PI) at spin phase `a` gives
 *
 *     psi = PI + a   (right side)        psi = PI − a   (left side)
 *
 * so requiring the offset there to equal effectiveWheelRadius's A*sin(n*a + phi) — substitute
 * a = psi − PI on the right, a = PI − psi on the left — gives the two branches below directly, for
 * any harmonic n. (test/wheel-runout-mesh.mjs walks that chain numerically and checks it holds.)
 *
 * @param {number} corner - 0-3 (FL, FR, RL, RR). 0 and 2 are the left, mirrored side.
 * @param {number} psi - carcass angle in the build frame [rad].
 * @param {number} runout - params.wheelRunout, PEAK-TO-PEAK [m].
 * @returns {number} signed radial offset [m], amplitude runout/2.
 */
export function carcassRadialOffset (corner, psi, runout) {
  const A = 0.5 * (runout || 0)
  if (A === 0) return 0
  const phi = RUNOUT_PHASE[corner]
  const n   = RUNOUT_HARMONIC
  return (corner === 0 || corner === 2)
    ? A * Math.sin(n * (Math.PI - psi) + phi)
    : A * Math.sin(n * (psi - Math.PI) + phi)
}

/**
 * Quarter-car suspension sub-step loop. Integrates strut compression state (strutComp, strutCompVel)
 * at dt/N for stability, computes tire-spring and suspension-spring forces, applies ARB coupling.
 *
 * The model (Phase 4.1 decisions, still binding):
 *   - Hub world position derived from strutComp along body_down axis (D-02)
 *   - Spring/damper/ARB act along strut axis; body sees reaction along body_up (D-04)
 *   - Gravity on hub = m_u * g * dot(body_up, world_up) = m_u * g * body_up.y (D-05)
 *   - Contact normal split: strut-axis component -> tireFz (hub ODE); X/Z residual -> _hubNormalXZ (D-06)
 *   - Bump and droop stops as linear penalty springs (D-08, D-09)
 *
 * Called once per outer physics step by physics.js BEFORE the per-wheel Pacejka contacts loop.
 * Mutates vehicleState.strutComp[i] and vehicleState.strutCompVel[i] in place.
 * Writes params._tireFz[i] (averaged across N substeps) — the Pacejka normal force physics.js
 * Step 3 reads through computeNormalForce (D-03).
 * Writes params._suspForceAccum[i] (averaged across N substeps) — applied as body force along
 * body_up in physics.js Step 3 totalForce accumulation.
 * Writes params._hubNormalXZ[i] (averaged across N substeps) — X/Z residual contact normal force
 * applied as direct body force + torque in physics.js Step 2.6.
 *
 * Pure-math module contract: no Three.js import. Uses params._rotateVector injected by physics.js
 * (fallback to identity if absent, e.g., in unit tests).
 *
 * @param {object} vehicleState - Mutable vehicle state. Reads: position, velocity, quaternion,
 *   angularVelocity, strutComp[4], strutCompVel[4]. Mutates: strutComp[4], strutCompVel[4].
 * @param {object} params - RANGER_PARAMS (augmented with underscore transients by physics.js).
 *   Reads: wheelMass, suspensionStiffness{Front,Rear}, suspensionDamping{Front,Rear},
 *     suspensionRestLength{Front,Rear}, suspensionTravel{Front,Rear}, suspensionBodyOffset{Front,Rear},
 *     bumpStopStiffness, DROOP_STOP_STIFFNESS, arbStiffness{Front,Rear},
 *     tireStiffness, tireDamping, wheelRadius, trackFront, trackRear, wheelbase,
 *     weightFront, weightRear, cgHeight, _rotateVector (injected function),
 *     _hubNormalXZ[4] (initialized by main.js).
 *   Writes: _tireFz[4], _suspForceAccum[4], _hubNormalXZ[4].
 * @param {number} dt - Outer physics step in seconds (== PHYSICS_DT from main.js).
 * @param {function} queryContacts - (cx, cy, cz, r, footprint, corner) → Array<{normal, depth, contactPoint}>.
 *   physics.js passes its qcPlus (analytic ground ∪ engine debris); gives the tire compression
 *   depth per hub. Debris contacts also carry depthRate and sizeR. `corner` lets the caller reuse
 *   one ground answer per wheel per step; a plain query ignores it.
 * @returns {void}
 */
// Scratch for stepSuspensionSubsteps (one truck steps at a time; nothing here outlives a call).
const _mountX = [0, 0, 0, 0], _mountY = [0, 0, 0, 0], _mountZ = [0, 0, 0, 0]
const _arbF = [0, 0, 0, 0]

export function stepSuspensionSubsteps (vehicleState, params, dt, queryContacts) {
  // SM-3: reset the per-step peak bump-stop force before the substep loop accumulates this step's.
  if (vehicleState.bumpForce) { vehicleState.bumpForce[0] = 0; vehicleState.bumpForce[1] = 0; vehicleState.bumpForce[2] = 0; vehicleState.bumpForce[3] = 0 }
  // SM-3: peak RIM contact force per corner this step [N]. Reset here and written below whenever
  // the tire is squashed clean through its soft band; physics.js then folds the engine's own
  // hard-core contacts (debris) in on top with a max. Two paths, ONE signal — a rim does not care
  // whether it was the road or a rock that reached it, and the cores collide with debris only.
  if (vehicleState.rimForce) { vehicleState.rimForce[0] = 0; vehicleState.rimForce[1] = 0; vehicleState.rimForce[2] = 0; vehicleState.rimForce[3] = 0 }
  if (vehicleState.rimForceRoad) { vehicleState.rimForceRoad[0] = 0; vehicleState.rimForceRoad[1] = 0; vehicleState.rimForceRoad[2] = 0; vehicleState.rimForceRoad[3] = 0 }
  // Paranoid guard (Phase 4.1 D-01): if strutComp/strutCompVel not initialized, skip.
  if (!vehicleState.strutComp || vehicleState.strutComp.length !== 4) return
  if (!vehicleState.strutCompVel || vehicleState.strutCompVel.length !== 4) return

  // Stability check — runs once (RESEARCH §Pitfall 2, D-10).
  // Two constraints with explicit Euler:
  //   tire spring: sdt < 2/omega_n_tire (oscillator stability)
  //   suspension damping: c_S·sdt/m_u < 2 (damper explicit-Euler stability)
  // N=4 gives sdt=4.17ms at 60Hz: c_S·sdt/m_u ≈ 1.04 for current dampers — safe.
  // NOTE (Phase 4.1): bumpStopStiffness up to 10× main spring gives k_eff ≈ 363 000 N/m.
  // Verified: sdt^2 * k_eff / m_u = 0.35 << 4. No additional check required.
  if (!params._suspStabChecked) {
    const N_check      = 4
    const sdt_check    = dt / N_check
    const omega_n_tire = Math.sqrt(params.tireStiffness / params.wheelMass)
    if (sdt_check > 1.5 / omega_n_tire) {
      console.warn('[suspension] Sub-step too large for tire stiffness — potential instability.',
        'sdt=', sdt_check.toFixed(5), 'critical=', (1.5 / omega_n_tire).toFixed(5))
    }
    const c_max = Math.max(params.suspensionDampingFront, params.suspensionDampingRear)
    const alpha = c_max * sdt_check / params.wheelMass
    if (alpha > 2) {
      console.warn('[suspension] Damping too high for explicit Euler — raise N.',
        'alpha=', alpha.toFixed(2), 'limit=2.0')
    }
    // Tire damper drives the same hub ODE — same stability criterion applies.
    // alpha_tire > 1.5 → damping term overwhelms spring, force clamps to 0, wheel bounces.
    const alpha_tire = params.tireDamping * sdt_check / params.wheelMass
    if (alpha_tire > 1.5) {
      console.warn('[suspension] tireDamping too high for explicit Euler — reduce tireDamping or raise N.',
        'alpha=', alpha_tire.toFixed(2), 'limit=1.5, stable_max=',
        Math.floor(1.5 * params.wheelMass / sdt_check), 'N·s/m')
    }
    params._suspStabChecked = true
  }

  // N=4 substeps with explicit Euler on the damper.
  const N   = 4
  const sdt = dt / N
  const m_u = params.wheelMass

  // Zero accumulator arrays for this outer step (Phase 4.1: add _hubNormalXZ)
  params._tireFz[0] = params._tireFz[1] = params._tireFz[2] = params._tireFz[3] = 0
  params._suspForceAccum[0] = params._suspForceAccum[1] = params._suspForceAccum[2] = params._suspForceAccum[3] = 0
  // Zero _hubNormalXZ per corner (plain objects, NOT THREE.Vector3 — pure-math contract)
  if (params._hubNormalXZ) {
    params._hubNormalXZ[0].x = params._hubNormalXZ[0].y = params._hubNormalXZ[0].z = 0
    params._hubNormalXZ[1].x = params._hubNormalXZ[1].y = params._hubNormalXZ[1].z = 0
    params._hubNormalXZ[2].x = params._hubNormalXZ[2].y = params._hubNormalXZ[2].z = 0
    params._hubNormalXZ[3].x = params._hubNormalXZ[3].y = params._hubNormalXZ[3].z = 0
  }

  // Body axes — derived once per outer step (quaternion doesn't change within the substep loop).
  // body_down: (0,-1,0) rotated by body quaternion = world direction of strut axis pointing away from body.
  // body_up:   (0, 1,0) rotated by body quaternion = world direction toward body.
  const body_down = typeof params._rotateVector === 'function'
    ? params._rotateVector({ x: 0, y: -1, z: 0 })
    : { x: 0, y: -1, z: 0 }
  const body_up = typeof params._rotateVector === 'function'
    ? params._rotateVector({ x: 0, y: 1, z: 0 })
    : { x: 0, y: 1, z: 0 }

  // D-05: gravity on hub along strut = m_u * g * dot(world_up, body_up) = m_u * g * body_up.y
  // Tapers to zero when body is horizontal (body_up.y → 0), so hub gravity correctly follows
  // the strut axis orientation rather than always pulling world-downward (the Phase 4 bug).
  const gravDot = body_up.y  // = dot((0,1,0), body_up) = Y component of body_up

  // ── Per-corner mount point, in world space ───────────────────────────────────────────────────
  // The body pose does not change inside this function, so the mount is the same for all N
  // substeps; only the strut length under it moves. Local mount: the hub's rest offset from the
  // CG, (cgHeight − wheelRadius) below it, plus the ride-height body offset (D-08).
  for (let i = 0; i < 4; i++) {
    const isFront = i < 2
    const isLeft  = i === 0 || i === 2
    const localX = isLeft
      ? -(isFront ? params.trackFront : params.trackRear) / 2
      :  (isFront ? params.trackFront : params.trackRear) / 2
    const localZ = isFront
      ? -(params.wheelbase * params.weightRear)
      :  (params.wheelbase * params.weightFront)
    const localY = -(params.cgHeight - params.wheelRadius) +
      (isFront ? (params.suspensionBodyOffsetFront || 0) : (params.suspensionBodyOffsetRear || 0))
    const local = { x: localX, y: localY, z: localZ }
    const rMount = typeof params._rotateVector === 'function'
      ? params._rotateVector(local)
      : local
    _mountX[i] = vehicleState.position.x + rMount.x
    _mountY[i] = vehicleState.position.y + rMount.y
    _mountZ[i] = vehicleState.position.z + rMount.z
  }

  const sidewall = (params.wheelRadius || 0.368) - (params.rimRadius || 0.1905)   // for the rim-load residual below
  const sc = vehicleState.strutComp, scv = vehicleState.strutCompVel

  for (let s = 0; s < N; s++) {
    // ── 1. ARB pass — from every corner's compression BEFORE any corner integrates ────────────
    // (RESEARCH §Anti-Pattern: "Computing ARB after the suspension force is already applied to hub")
    // Convention: F_arb = k_ARB * (strutComp[left] - strutComp[right]) per axle.
    //   arbForce[left]  = -F_arb  (positive arbForce = pushes hub away from body, reduces compression)
    //   arbForce[right] = +F_arb
    // Pure heave (both sides compress equally): delta=0 → F_arb=0 ✓
    const arbF = _arbF
    {
      const dF = params.arbStiffnessFront * (sc[0] - sc[1])
      arbF[0] = -dF
      arbF[1] = +dF
      const dR = params.arbStiffnessRear  * (sc[2] - sc[3])
      arbF[2] = -dR
      arbF[3] = +dR
    }

    // ── 2. Force + strut integration pass ────────────────────────────────────────
    // Corner i reads only its OWN strut state, which nothing has integrated yet this substep, so
    // these are the pre-step values the explicit-Euler force equation wants.
    for (let i = 0; i < 4; i++) {
      const isFront = i < 2
      const strutCompI    = sc[i]
      const strutCompVelI = scv[i]
      // D-02: hub world position = mount + strut length along body_down (compressed ⇒ shorter).
      const strutLen  = (isFront ? params.suspensionRestLengthFront : params.suspensionRestLengthRear) - strutCompI
      const hubWorldX = _mountX[i] + strutLen * body_down.x
      const hubWorldY = _mountY[i] + strutLen * body_down.y
      const hubWorldZ = _mountZ[i] + strutLen * body_down.z
      // SM-3: sagged springs and dead dampers. params._springScale{Front,Rear} and
      // params._damperScale{Front,Rear} are published by src/damage.js; absent (headless gates,
      // damage off) they read as 1 and the suspension is exactly the stock one.
      const k_S = (isFront ? params.suspensionStiffnessFront : params.suspensionStiffnessRear)
                * (isFront ? (params._springScaleFront ?? 1) : (params._springScaleRear ?? 1))
      const c_S = (isFront ? params.suspensionDampingFront   : params.suspensionDampingRear)
                * (isFront ? (params._damperScaleFront ?? 1) : (params._damperScaleRear ?? 1))

      // Suspension spring: D-15 no-tension clamp on spring term (no tension when strut extended).
      const springTerm = strutCompI > 0 ? k_S * strutCompI : 0

      // Phase 4.1 D-06: Contact normal split into strut-axis component (tireFz) and X/Z residual (_hubNormalXZ).
      // Out-of-round tires: the contact query uses the radius AT THIS SPIN ANGLE, so the high
      // spot digs deeper into the surface (bigger depth -> bigger tire force) once per revolution.
      const hubContacts = queryContacts(hubWorldX, hubWorldY, hubWorldZ,
        effectiveWheelRadius(i, vehicleState, params), true, i)   // `i`: physics.js reuses the step's ground answer per corner
      let tireFz = 0
      for (const c of hubContacts) {
        // compressionVel sign convention: positive = hub approaching ground = tire compressing.
        // strutCompVelI > 0 means strut shortening = hub moving UP = tire decompressing, so negate.
        // Damper: for DEBRIS contacts (c.depthRate set by physics.js) use the contact's TRUE
        // closing rate — hit hard → high force, roll on slow → low force, straight from the
        // spring–damper law. HUNT–CROSSLEY engagement scaling (min(1, depth/ENGAGE)): a
        // constant damper is DISCONTINUOUS at first touch (force jumps from 0 to c·v the
        // instant contact begins), which punted crawled-into rocks like a kicked ball; scaling
        // the damper with penetration makes contact force continuous from zero — the standard
        // contact-mechanics form. A fast hit reaches full engagement within its first frame
        // (depth ≈ v·dt ≥ ENGAGE), so high-speed response is undiminished, with no speed terms.
        // Terrain contacts keep the strut-velocity approximation (their transients are
        // pre-spread by the footprint envelope, and the m4 calibration history rests on it).
        const compressionVel = (c.depthRate !== undefined)
          ? c.depthRate * Math.min(1, c.depth / TIRE_DAMP_ENGAGE)
          : -strutCompVelI
        // SM-3 flat tire: params._tireRateScale[i] collapses the air spring when the air is gone.
        const rate = params._tireRateScale ? params._tireRateScale[i] : 1
        const tireFnAtContact = tireContactForce(c.depth, compressionVel, c.sizeR, rate, params)

        // RIM CONTACT from the analytic path. Depth is measured from the tire's OUTER radius, so
        // once it exceeds the soft band the contact has reached the rim. A hard enough landing over
        // a shoulder step really does kiss the rim, and the engine's hard cores can never report it
        // because they collide with debris only, by construction.
        //
        // What is published is the RESIDUAL — the load beyond what the carcass alone carries when
        // fully compressed — not the whole contact force. That matters: the debris path reports
        // what the rigid core exchanges with a rock, which is already a residual, and the two must
        // be the same quantity or one yield threshold cannot serve both.
        //
        // It is NOT the same quantity, and measurement settled that rather than argument: a 2 m
        // drop reads 349 kN here against 0.3-5 kN for a rock strike on the core. Same name, two
        // different measurements — the core exchanges only what a rigid pinch transmits, this is
        // the whole squashed-carcass load past full compression. So they are published separately
        // and carry their own yield thresholds (rimYieldMult vs rimYieldRoadMult in damage.js).
        //
        // The reference is THIS tire's carcass, not a healthy one — `rate` belongs in it. A flat
        // tire carries almost nothing, so almost the whole load past the band goes straight into
        // the rim, which is the point of a flat: there is no air left to absorb it. Subtracting a
        // HEALTHY carcass's reference from a flat tire's force made the residual deeply negative
        // and reported no rim load at all, so a flat rim was SAFER than an inflated one — exactly
        // backwards (owner, 2026-08-23).
        if (vehicleState.rimForceRoad && c.depth > WHEEL_SOFT_BAND) {
          const bandNorm = Math.min(0.98, WHEEL_SOFT_BAND / sidewall)
          // The reference is what this tire's AIR carries at full compression — for a flat that is
          // almost nothing, so almost the whole load past the band is rim load.
          // Air and carcass each at their own rate — the same split tireContactForce makes.
          const atBand = rate * WHEEL_SOFT_BAND *
            (params.tireStiffness + carcassStiffness(params) * (1 / (1 - bandNorm * bandNorm) - 1))
          const residual = tireFnAtContact - atBand
          if (residual > vehicleState.rimForceRoad[i]) vehicleState.rimForceRoad[i] = residual
        }
        // D-06: split contact normal force into strut-axis and X/Z residual components
        // bodyUpDot = dot(c.normal, body_up): the fraction of contact normal force along the strut axis
        const bodyUpDot = c.normal.x * body_up.x + c.normal.y * body_up.y + c.normal.z * body_up.z
        const Fn_strut  = tireFnAtContact * bodyUpDot  // drives hub ODE (replaces Fn * c.normal.y)
        tireFz += Fn_strut
        // X/Z residual: (c.normal - bodyUpDot * body_up) * tireFnAtContact
        // Accumulated into _hubNormalXZ (averaged across N substeps via /N pattern)
        if (params._hubNormalXZ) {
          params._hubNormalXZ[i].x += tireFnAtContact * (c.normal.x - bodyUpDot * body_up.x) / N
          params._hubNormalXZ[i].y += tireFnAtContact * (c.normal.y - bodyUpDot * body_up.y) / N
          params._hubNormalXZ[i].z += tireFnAtContact * (c.normal.z - bodyUpDot * body_up.z) / N
        }
      }

      // Phase 4.1 D-08/D-09: bump and droop stops (linear penalty springs)
      const travel        = isFront ? (params.suspensionTravelFront || 0.12) : (params.suspensionTravelRear || 0.14)
      const DROOP_K       = params.DROOP_STOP_STIFFNESS || 20000
      // Bump stop: engages when strut is compressed past travel limit; pushes hub away from body (negative)
      const bumpOvershoot  = strutCompI - travel
      const bumpForce      = bumpOvershoot > 0 ? -params.bumpStopStiffness * bumpOvershoot : 0
      // SM-3 honest wear signal: peak bump-stop force this step, per corner. src/damage.js reads it
      // for the spring track. Peak (not mean) across substeps — a hard hit inside one substep is
      // exactly the severity this track is supposed to notice.
      if (vehicleState.bumpForce) {
        const bfMag = Math.abs(bumpForce)
        if (bfMag > vehicleState.bumpForce[i]) vehicleState.bumpForce[i] = bfMag
      }
      // Droop stop: engages when strut extends past rest (strutComp < 0); pulls hub back toward body (positive)
      const droopOvershoot = -strutCompI  // positive when strutComp < 0
      const droopForce     = droopOvershoot > 0 ? DROOP_K * droopOvershoot : 0

      // Strut-axis hub ODE (D-04/D-05):
      //   m_u * d(strutCompVel)/dt = tireFz - springTerm - c_S * strutCompVel + arbF
      //                              - m_u * g * gravDot + bumpForce + droopForce
      // Sign convention (Pitfall 4):
      //   tireFz positive: pushes hub toward body (compresses strut) — positive contribution
      //   springTerm positive: resists compression — negative contribution
      //   c_S * strutCompVelI: resists current compression velocity — negative contribution
      //   gravity term: m_u*g*gravDot pulls hub away from body along strut — negative contribution
      //   bumpForce negative (when engaged): resists over-compression — negative contribution
      //   droopForce positive (when engaged): resists over-extension — positive contribution
      const F_total = tireFz - springTerm - c_S * strutCompVelI + arbF[i]
                    - m_u * 9.81 * gravDot
                    + bumpForce + droopForce

      // Explicit Euler integration (D-10: same N=4 substep count as Phase 4)
      const newStrutCompVel = strutCompVelI + (F_total / m_u) * sdt
      scv[i] = newStrutCompVel
      sc[i] += newStrutCompVel * sdt

      // Body reaction accumulator (Newton's 3rd law on the strut spring).
      // Uses pre-step strutCompVelI for consistency with explicit Euler (Pitfall 4).
      // suspForce = spring + damper reaction on the body (positive = body pushed up along strut axis)
      const suspForce = springTerm + c_S * strutCompVelI

      // Accumulate for outer step (average force across substeps, /N pattern)
      params._tireFz[i]         += tireFz                / N  // average tire-spring Fz for Pacejka feed (D-06b)
      params._suspForceAccum[i] += (suspForce - arbF[i]) / N  // body force along strut: spring+damper + ARB reaction
      // _hubNormalXZ[i] accumulated in contacts loop above
    }
  }
}

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
export function computeStaticEquilibrium (p) {
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
