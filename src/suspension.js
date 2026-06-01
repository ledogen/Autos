/**
 * src/suspension.js — Phase 1 suspension module.
 *
 * Exports the locked signatures for Phase 4 spring-damper replacement (D-05, D-06).
 * Phase 1 bodies return static values: equal weight distribution per axle, wheel positions
 * at fixed offsets from the vehicle CG.
 *
 * Do NOT import Three.js directly — caller passes a rotation helper via params._rotateVector
 * to keep this module pure math and testable outside the browser (no CDN Three.js available
 * in Node test contexts).
 *
 * getWheelPosition returns the wheel hub center (not the contact patch bottom).
 * physics.js passes the hub to queryContacts(hub, wheelRadius) to find actual contact patches,
 * which handles slopes, walls, and multiple simultaneous contacts correctly.
 *
 * getWheelPosition returns a plain {x, y, z} object, not THREE.Vector3, to avoid the Three.js
 * import dependency in this pure-math module. Physics.js wraps results in THREE.Vector3.
 *
 * Conventions: see docs/GLOSSARY.md
 * Wheel index convention (GLOSSARY.md §Wheel Index): 0=FL, 1=FR, 2=RL, 3=RR
 */

/**
 * Compute normal force on this wheel's contact patch.
 *
 * @param {number} corner - Wheel index 0-3 (0=FL, 1=FR, 2=RL, 3=RR per GLOSSARY.md §Wheel Index).
 * @param {object} vehicleState - Full vehicleState object (position, velocity, quaternion,
 *   angularVelocity, steerAngle, throttle, brake, wheelAngles). Unused in Phase 1 static bodies.
 * @param {object} params - RANGER_PARAMS; uses params.mass [kg], params.weightFront [-],
 *   params.weightRear [-]. Phase 4 will also use spring stiffness and compression state.
 * @returns {number} Fn [N] normal force on this wheel. Positive = pushing up against wheel.
 *   Phase 4 will compute from spring compression and body acceleration (load transfer).
 *   Phase 1: static distribution — front wheels get mass * g * weightFront / 2,
 *   rear wheels get mass * g * weightRear / 2.
 *
 * Phase 4 replacement: spring-damper Fn with load transfer between corners.
 * Phase 4 replaces this body only — signature and call site in physics.js do not change.
 */
export function computeNormalForce (corner, vehicleState, params) {
  // Phase 4: this is now a shim. stepSuspensionSubsteps (below) computes the actual tire-spring
  // force per D-03 and writes it to params._tireFz[corner]. This function simply reads it back
  // so the call site in physics.js (which expects computeNormalForce to return Fn) continues
  // working without refactoring the caller (RESEARCH §Pitfall 7 — easiest migration path).
  // If _tireFz is not yet populated (e.g., first call order issue), fall back to 0 safely.
  return (params._tireFz && typeof params._tireFz[corner] === 'number')
    ? params._tireFz[corner]
    : 0
}

/**
 * Compute world-space position of wheel contact patch center.
 *
 * NOTE on Three.js isolation strategy: This module must not import Three.js (pure-math
 * contract for testability). To rotate local offsets into world space, physics.js injects
 * a rotation helper into params before calling:
 *
 *   params._rotateVector = (v) => new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(vehicleState.quaternion)
 *
 * This keeps all Three.js usage inside physics.js while allowing suspension.js to be a
 * pure function of numbers and plain objects.
 *
 * @param {number} corner - Wheel index 0-3 (0=FL, 1=FR, 2=RL, 3=RR per GLOSSARY.md §Wheel Index).
 * @param {object} vehicleState - Full vehicleState; uses .position and .quaternion for world
 *   placement. Phase 4 will also use spring compression offsets.
 * @param {object} params - RANGER_PARAMS; uses wheelbase [m], trackFront [m], trackRear [m],
 *   cgHeight [m], wheelRadius [m], weightFront [-], weightRear [-].
 *   Also uses params._rotateVector (function) — injected by physics.js before calling.
 * @returns {{x:number, y:number, z:number}} World-space position of wheel contact patch center.
 *   Phase 4 will compute from spring-compressed ride height. Phase 1: fixed local offset rotated
 *   by vehicleState.quaternion, added to vehicleState.position.
 *
 * Phase 4 replacement: dynamic contact patch from spring-compressed suspension geometry.
 * Phase 4 replaces this body only — signature and call site in physics.js do not change.
 */
export function getWheelPosition (corner, vehicleState, params) {
  // Phase 1: fixed local offset per corner in body space.
  //
  // Car forward = -Z (GLOSSARY.md §Coordinate System). Axle positions relative to CG:
  //   Front axle longitudinal offset: -(wheelbase * weightRear) in -Z direction
  //     → local Z = -(wheelbase * weightRear)
  //   Rear axle longitudinal offset: +(wheelbase * weightFront) in +Z direction
  //     → local Z = +(wheelbase * weightFront)
  //
  // Lateral offsets (X):
  //   Left wheels (FL=0, RL=2): -trackFront/2 or -trackRear/2
  //   Right wheels (FR=1, RR=3): +trackFront/2 or +trackRear/2
  //
  // Vertical: wheel contact patch center (ground level, not wheel hub center).
  //   Wheel hub center in body space = -(cgHeight - wheelRadius) in local Y.
  //   Contact patch center is at the bottom of the wheel: local Y = -cgHeight
  //   (wheel center is at y=wheelRadius above ground; ground is 0; body CG is at cgHeight)
  //   So local Y offset = -(cgHeight - wheelRadius) for wheel center hub,
  //   and -cgHeight for contact patch (bottom of tire).
  //   Phase 1 uses wheelRadius contact patch (i.e., wheel center == contact point, flat ground).

  const isFront = corner === 0 || corner === 1
  const isLeft  = corner === 0 || corner === 2

  const localX = isLeft
    ? -(isFront ? params.trackFront : params.trackRear) / 2
    :  (isFront ? params.trackFront : params.trackRear) / 2

  const localZ = isFront
    ? -(params.wheelbase * params.weightRear)
    :  (params.wheelbase * params.weightFront)

  // Wheel hub center: (cgHeight - wheelRadius) below CG in body Y.
  // physics.js projects hub via queryContacts to find the actual contact patch.
  const localY = -(params.cgHeight - params.wheelRadius)

  // Rotate local offset into world space using the injected helper.
  // params._rotateVector is set by physics.js before calling this function.
  // If not set (e.g., in unit tests), fall back to identity (no rotation).
  const local = { x: localX, y: localY, z: localZ }
  let rotated

  if (typeof params._rotateVector === 'function') {
    rotated = params._rotateVector(local)
  } else {
    // Fallback for identity quaternion (unit tests without Three.js rotation).
    rotated = { x: localX, y: localY, z: localZ }
  }

  // Phase 4: if hubY[corner] is initialized (D-02), use it for the world Y position of the hub.
  // Hub XZ still tracks the body mount point XZ (no independent lateral hub kinematics in Phase 4).
  // This is the correct hub world position: hubY comes from the substep integrator, XZ from rotation.
  const hubWorldY = (vehicleState.hubY && typeof vehicleState.hubY[corner] === 'number')
    ? vehicleState.hubY[corner]
    : vehicleState.position.y + rotated.y

  return {
    x: vehicleState.position.x + rotated.x,
    y: hubWorldY,
    z: vehicleState.position.z + rotated.z
  }
}

/**
 * World-space positions of four body contact points (bumper corners).
 * These are small spheres on the car body that generate normal-only collision force,
 * stopping the body from clipping walls and ramp faces.
 *
 * @param {object} vehicleState - Full vehicleState; uses .position and .quaternion.
 * @param {object} params - RANGER_PARAMS; uses wheelbase, weightFront/Rear, trackFront, cgHeight.
 *   Also uses params._rotateVector (injected by physics.js).
 * @returns {Array<{x,y,z}>} Four world-space points: FL/FR front bumper, RL/RR rear bumper.
 */
/**
 * Quarter-car suspension sub-step loop. Integrates hub vertical state (hubY, hubVy) at dt/2
 * for stability, computes tire-spring and suspension-spring forces, applies ARB coupling.
 *
 * Called once per outer physics step by physics.js BEFORE the per-wheel Pacejka contacts loop.
 * Mutates vehicleState.hubY[i] and vehicleState.hubVy[i] in place.
 * Writes params._tireFz[i] (averaged across N substeps) — consumed by computeNormalForce shim
 * above and directly by physics.js Step 3 Pacejka Fn feed (per D-03).
 * Writes params._suspForceAccum[i] (averaged across N substeps) — applied as body force in
 * physics.js Step 3 totalForce accumulation (per D-07 bilinear-spring approximation).
 *
 * Locking decisions honored:
 *   D-01: quarter-car per corner — tire spring (ground↔hub) in series with suspension spring (hub↔body)
 *   D-03: Pacejka Fz = tire spring force, NOT suspension spring force
 *   D-06: ARB couples left/right suspension compression per axle
 *   D-07: ARB force uses same lever arm as main spring (bilinear-spring approx)
 *   D-08: N=2 fixed substeps; sdt = dt/N; vertical-only (no Pacejka inside substep)
 *   D-14: tireFz ≤ 0 ⇒ airborne; hub integrates under gravity + suspension only
 *   D-15: suspension spring term = 0 when compression < 0 (no tension at droop); damping acts both ways
 *
 * Pure-math module contract: no Three.js import. Uses params._rotateVector injected by physics.js
 * (fallback to identity if absent, e.g., in unit tests).
 *
 * @param {object} vehicleState - Mutable vehicle state. Reads: position, velocity, quaternion,
 *   angularVelocity, hubY[4], hubVy[4]. Mutates: hubY[4], hubVy[4].
 * @param {object} params - RANGER_PARAMS (augmented with underscore transients by physics.js).
 *   Reads: wheelMass, suspensionStiffness{Front,Rear}, suspensionDamping{Front,Rear},
 *     suspensionRestLength{Front,Rear}, arbStiffness{Front,Rear}, tireStiffness, tireDamping,
 *     wheelRadius, trackFront, trackRear, wheelbase, weightFront, weightRear, cgHeight,
 *     physicsDt, _rotateVector (injected function).
 *   Writes: _tireFz[4], _suspForceAccum[4].
 * @param {number} dt - Outer physics step in seconds (== PHYSICS_DT from main.js).
 * @param {function} queryContacts - (cx, cy, cz, r) → Array<{normal, depth, contactPoint}>.
 *   Same function passed to stepPhysics; used to compute tire compression depth per hub.
 * @returns {void}
 */
export function stepSuspensionSubsteps (vehicleState, params, dt, queryContacts) {
  // Paranoid guard (RESEARCH §Pitfall 4): if hubY/hubVy not initialized, skip to prevent NaN cascade.
  if (!vehicleState.hubY || vehicleState.hubY.length !== 4) return
  if (!vehicleState.hubVy || vehicleState.hubVy.length !== 4) return

  // Stability check — runs once (RESEARCH §Pitfall 2, D-10).
  // Tire spring is the stiffest spring; it determines the critical substep size.
  if (!params._suspStabChecked) {
    const omega_n_tire = Math.sqrt(params.tireStiffness / params.wheelMass)
    const sdt_check    = dt / 2
    if (sdt_check > 1.5 / omega_n_tire) {
      console.warn('[suspension] Sub-step too large for tire stiffness — potential instability.',
        'sdt=', sdt_check.toFixed(5), 'critical=', (1.5 / omega_n_tire).toFixed(5))
    }
    params._suspStabChecked = true
  }

  const N   = 2           // D-08: fixed 2 substeps
  const sdt = dt / N      // D-08: sdt = physicsDt / 2
  const m_u = params.wheelMass

  // Zero accumulator arrays for this outer step (RESEARCH §Pattern 2 + §Pitfall 3)
  params._tireFz[0] = params._tireFz[1] = params._tireFz[2] = params._tireFz[3] = 0
  params._suspForceAccum[0] = params._suspForceAccum[1] = params._suspForceAccum[2] = params._suspForceAccum[3] = 0

  for (let s = 0; s < N; s++) {
    // ── 1. Per-corner geometry pass ────────────────────────────────────────────
    // Body mount-point world position: same local X/Z as wheel hub offset, Y is body-attach height.
    // Local mount Y: hub center is (cgHeight − wheelRadius) below CG in body space.
    // So local mount Y = -(cgHeight - wheelRadius). (Pattern 3: reuse existing localY from getWheelPosition).
    // Hub world XZ tracks the body mount XZ each substep (D-04: no independent XZ hub state).
    // Mount velocity Y = (velocity + angularVelocity × rMount).y (RESEARCH §Pattern 3).
    const cornerData = []
    for (let i = 0; i < 4; i++) {
      const isFront = i < 2
      const isLeft  = i === 0 || i === 2

      const localX = isLeft
        ? -(isFront ? params.trackFront : params.trackRear) / 2
        :  (isFront ? params.trackFront : params.trackRear) / 2
      const localZ = isFront
        ? -(params.wheelbase * params.weightRear)
        :  (params.wheelbase * params.weightFront)
      const localY = -(params.cgHeight - params.wheelRadius)  // hub center height in body frame

      // Rotate local offset to world space using injected helper (preserves pure-math contract).
      // Falls back to identity (no rotation) if helper not injected (unit test contexts).
      const local = { x: localX, y: localY, z: localZ }
      const rMount = typeof params._rotateVector === 'function'
        ? params._rotateVector(local)
        : local

      const mountWorldX = vehicleState.position.x + rMount.x
      const mountWorldY = vehicleState.position.y + rMount.y
      const mountWorldZ = vehicleState.position.z + rMount.z

      // Mount velocity Y = (v + ω × rMount).y
      // (ω × rMount).y = ω.z·rMount.x - ω.x·rMount.z  (cross product Y component)
      const mountVelY = vehicleState.velocity.y +
        (vehicleState.angularVelocity.z * rMount.x - vehicleState.angularVelocity.x * rMount.z)

      const L_S = isFront ? params.suspensionRestLengthFront : params.suspensionRestLengthRear

      // suspComp: positive = spring compressed below rest length (hub is close to body)
      // Formula: L_S - (mountWorldY - hubY[i])  (D-15 notes: compression is deviation from rest)
      const suspComp = L_S - (mountWorldY - vehicleState.hubY[i])
      const suspVel  = vehicleState.hubVy[i] - mountVelY  // positive = compression (hub toward mount)

      cornerData.push({ mountWorldX, mountWorldY, mountWorldZ, rMount, suspComp, suspVel, isFront })
    }

    // ── 2. ARB pass — must come AFTER all suspComps computed, BEFORE force application ────────
    // (RESEARCH §Anti-Pattern: "Computing ARB after the suspension force is already applied to hub")
    // Convention per D-06: F_arb = k_ARB * (suspComp[left] - suspComp[right])
    //   arbForce[left]  = -F_arb  (positive arbForce = pushes hub down)
    //   arbForce[right] = +F_arb
    // Pure heave (both sides compress equally): delta=0 → F_arb=0 ✓ (D-06)
    const arbF = [0, 0, 0, 0]
    {
      const dF = params.arbStiffnessFront * (cornerData[0].suspComp - cornerData[1].suspComp)
      arbF[0] = -dF
      arbF[1] = +dF
      const dR = params.arbStiffnessRear  * (cornerData[2].suspComp - cornerData[3].suspComp)
      arbF[2] = -dR
      arbF[3] = +dR
    }

    // ── 3. Force + hub integration pass ────────────────────────────────────────
    for (let i = 0; i < 4; i++) {
      const { suspComp, suspVel, isFront, mountWorldX, mountWorldZ } = cornerData[i]
      const k_S = isFront ? params.suspensionStiffnessFront : params.suspensionStiffnessRear
      const c_S = isFront ? params.suspensionDampingFront   : params.suspensionDampingRear

      // Suspension spring force: D-15 no-tension clamp on spring term; damping acts both ways.
      const springTerm  = suspComp > 0 ? k_S * suspComp : 0
      const dampTerm    = c_S * suspVel
      const suspForce   = springTerm + dampTerm  // +ve = pushes hub down, body up

      // Tire spring force (ground↔hub): query contacts at hub world position.
      // Hub XZ tracks body mount XZ (Open Question #1: no independent hub XZ state).
      // Sum vertical component of all contacts for hub ODE (Open Question #2: sum, not split per contact).
      const hubContacts = queryContacts(mountWorldX, vehicleState.hubY[i], mountWorldZ, params.wheelRadius)
      let tireFz = 0
      for (const c of hubContacts) {
        // tireFnAtContact: tire spring force at this contact surface (D-14: airborne ≡ depth=0 → tireFz=0)
        // Damping: hub moving toward ground (hubVy < 0) increases compression velocity.
        // compressionVel ≈ -hubVy * c.normal.y for the vertical projection.
        const compressionVel = -vehicleState.hubVy[i] * c.normal.y
        const tireFnAtContact = Math.max(0,
          params.tireStiffness * c.depth + params.tireDamping * compressionVel
        )
        // Project onto vertical for hub ODE (flat ground: normal.y ≈ 1, so tireFz ≈ tireFnAtContact)
        tireFz += tireFnAtContact * c.normal.y
      }

      // Hub ODE (semi-implicit Euler — velocity updated first, then position) per D-01/D-08.
      // F_hub = tireFz − suspForce + arbForce − wheelMass·g
      // Note: arbForce convention — positive arbForce means "pushes hub down", same sign as suspForce.
      // Convention check: when suspended (tireFz>0, suspForce>0), static equilibrium gives F_hub=0 ✓
      const F_hub = tireFz - suspForce + arbF[i] - m_u * 9.81
      vehicleState.hubVy[i] += (F_hub / m_u) * sdt  // velocity first (semi-implicit Euler)
      vehicleState.hubY[i]  += vehicleState.hubVy[i] * sdt  // then position

      // Accumulate for outer step (RESEARCH §Pitfall 3 — average force across substeps)
      params._tireFz[i]         += tireFz    / N  // average tire-spring Fz for Pacejka feed
      params._suspForceAccum[i] += suspForce / N  // average suspension force for body torque
    }
  }
}

export function getBodyContactPoints (vehicleState, params) {
  const frontAxleZ = -(params.wheelbase * params.weightRear)
  const rearAxleZ  =  (params.wheelbase * params.weightFront)
  const localY     = 0.35 - params.cgHeight   // bumper at 0.35 m above ground in body space
  const halfW      = params.trackFront / 2 + 0.1

  const locals = [
    { x: -halfW, y: localY, z: frontAxleZ - 0.85 },
    { x:  halfW, y: localY, z: frontAxleZ - 0.85 },
    { x: -halfW, y: localY, z: rearAxleZ  + 0.65 },
    { x:  halfW, y: localY, z: rearAxleZ  + 0.65 },
  ]

  return locals.map(p => {
    const rotated = typeof params._rotateVector === 'function' ? params._rotateVector(p) : p
    return {
      x: vehicleState.position.x + rotated.x,
      y: vehicleState.position.y + rotated.y,
      z: vehicleState.position.z + rotated.z,
    }
  })
}
