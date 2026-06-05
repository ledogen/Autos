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
 * Compute world-space position of wheel hub center.
 *
 * Phase 4.1 (D-02): hub position is derived from strutComp and body orientation.
 * strutComp[i] positive = compressed (hub closer to body than rest).
 * hubWorld = mountWorld + strutLen * body_down, where strutLen = L_S - strutComp[i].
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
  // MUST include suspensionBodyOffset to match stepSuspensionSubsteps (line ~251). Without it the
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
 * Quarter-car suspension sub-step loop. Integrates strut compression state (strutComp, strutCompVel)
 * at dt/N for stability, computes tire-spring and suspension-spring forces, applies ARB coupling.
 *
 * Phase 4.1 changes from Phase 4:
 *   - State renamed: hubY/hubVy -> strutComp/strutCompVel (D-01)
 *   - Hub world position derived from strutComp along body_down axis (D-02)
 *   - Mount velocity projected onto strut axis (D-03)
 *   - Spring/damper/ARB act along strut axis; body sees reaction along body_up (D-04)
 *   - Gravity on hub = m_u * g * dot(body_up, world_up) = m_u * g * body_up.y (D-05)
 *   - Contact normal split: strut-axis component -> tireFz (hub ODE); X/Z residual -> _hubNormalXZ (D-06)
 *   - Bump and droop stops as linear penalty springs (D-08, D-09)
 *
 * Called once per outer physics step by physics.js BEFORE the per-wheel Pacejka contacts loop.
 * Mutates vehicleState.strutComp[i] and vehicleState.strutCompVel[i] in place.
 * Writes params._tireFz[i] (averaged across N substeps) — consumed by computeNormalForce shim
 * above and directly by physics.js Step 3 Pacejka Fn feed (per D-03).
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
 *     weightFront, weightRear, cgHeight, physicsDt, _rotateVector (injected function),
 *     _hubNormalXZ[4] (initialized by main.js).
 *   Writes: _tireFz[4], _suspForceAccum[4], _hubNormalXZ[4].
 * @param {number} dt - Outer physics step in seconds (== PHYSICS_DT from main.js).
 * @param {function} queryContacts - (cx, cy, cz, r) → Array<{normal, depth, contactPoint}>.
 *   Same function passed to stepPhysics; used to compute tire compression depth per hub.
 * @returns {void}
 */
export function stepSuspensionSubsteps (vehicleState, params, dt, queryContacts) {
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

  for (let s = 0; s < N; s++) {
    // ── 1. Per-corner geometry pass ────────────────────────────────────────────
    // Body mount-point world position: same local X/Z as wheel hub offset, Y is body-attach height.
    // Local mount Y: hub center is (cgHeight − wheelRadius) below CG in body space, plus body offset.
    // Mount velocity: full 3D velocity projected onto strut axis (D-03).
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
      // Phase 4.1 D-08: apply body offset to mount Y (default 0.0 = same as Phase 4)
      const localY = -(params.cgHeight - params.wheelRadius) +
        (isFront ? (params.suspensionBodyOffsetFront || 0) : (params.suspensionBodyOffsetRear || 0))

      // Rotate local offset to world space using injected helper (preserves pure-math contract).
      const local = { x: localX, y: localY, z: localZ }
      const rMount = typeof params._rotateVector === 'function'
        ? params._rotateVector(local)
        : local

      const mountWorldX = vehicleState.position.x + rMount.x
      const mountWorldY = vehicleState.position.y + rMount.y
      const mountWorldZ = vehicleState.position.z + rMount.z

      // Phase 4.1 D-03: Full 3D mount velocity, then projected onto strut axis.
      // mountVel = v_body + ω × rMount  (rMount is rotated body-local offset)
      const mountVelX = vehicleState.velocity.x +
        (vehicleState.angularVelocity.y * rMount.z - vehicleState.angularVelocity.z * rMount.y)
      const mountVelY = vehicleState.velocity.y +
        (vehicleState.angularVelocity.z * rMount.x - vehicleState.angularVelocity.x * rMount.z)
      const mountVelZ = vehicleState.velocity.z +
        (vehicleState.angularVelocity.x * rMount.y - vehicleState.angularVelocity.y * rMount.x)
      // mountVelStrut: scalar projection of mount velocity onto strut axis (body_down direction)
      // Positive = mount moving along body_down = compressing strut (mount approaching hub)
      const mountVelStrut = mountVelX * body_down.x + mountVelY * body_down.y + mountVelZ * body_down.z

      const L_S = isFront ? params.suspensionRestLengthFront : params.suspensionRestLengthRear

      // Phase 4.1 D-02: derive hub world position from strutComp along body_down axis.
      // strutComp[i] positive = compressed; strutLen = L_S - strutComp < L_S.
      const strutCompI   = vehicleState.strutComp[i]
      const strutLen     = L_S - strutCompI
      const hubWorldX    = mountWorldX + strutLen * body_down.x
      const hubWorldY    = mountWorldY + strutLen * body_down.y
      const hubWorldZ    = mountWorldZ + strutLen * body_down.z

      // strutCompVel[i]: pre-step compression velocity (used in explicit-Euler force equation)
      const strutCompVelI = vehicleState.strutCompVel[i]

      cornerData.push({
        mountWorldX, mountWorldY, mountWorldZ, rMount,
        hubWorldX, hubWorldY, hubWorldZ,
        strutCompI, strutCompVelI,
        mountVelStrut,
        isFront, L_S
      })
    }

    // ── 2. ARB pass — must come AFTER all strutComps computed, BEFORE force application ────────
    // (RESEARCH §Anti-Pattern: "Computing ARB after the suspension force is already applied to hub")
    // Convention: F_arb = k_ARB * (strutComp[left] - strutComp[right]) per axle.
    //   arbForce[left]  = -F_arb  (positive arbForce = pushes hub away from body, reduces compression)
    //   arbForce[right] = +F_arb
    // Pure heave (both sides compress equally): delta=0 → F_arb=0 ✓
    const arbF = [0, 0, 0, 0]
    {
      const dF = params.arbStiffnessFront * (cornerData[0].strutCompI - cornerData[1].strutCompI)
      arbF[0] = -dF
      arbF[1] = +dF
      const dR = params.arbStiffnessRear  * (cornerData[2].strutCompI - cornerData[3].strutCompI)
      arbF[2] = -dR
      arbF[3] = +dR
    }

    // ── 3. Force + strut integration pass ────────────────────────────────────────
    for (let i = 0; i < 4; i++) {
      const { strutCompI, strutCompVelI, hubWorldX, hubWorldY, hubWorldZ, isFront } = cornerData[i]
      const k_S = isFront ? params.suspensionStiffnessFront : params.suspensionStiffnessRear
      const c_S = isFront ? params.suspensionDampingFront   : params.suspensionDampingRear

      // Suspension spring: D-15 no-tension clamp on spring term (no tension when strut extended).
      const springTerm = strutCompI > 0 ? k_S * strutCompI : 0

      // Phase 4.1 D-06: Contact normal split into strut-axis component (tireFz) and X/Z residual (_hubNormalXZ).
      const hubContacts = queryContacts(hubWorldX, hubWorldY, hubWorldZ, params.wheelRadius)
      let tireFz = 0
      for (const c of hubContacts) {
        // compressionVel sign convention: positive = hub approaching ground = tire compressing.
        // strutCompVelI > 0 means strut shortening = hub moving UP = tire decompressing, so negate.
        const compressionVel = -strutCompVelI
        const tireFnAtContact = Math.max(0,
          params.tireStiffness * c.depth + params.tireDamping * compressionVel
        )
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
      vehicleState.strutCompVel[i] = newStrutCompVel
      vehicleState.strutComp[i]    += newStrutCompVel * sdt

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

export function getBodyContactPoints (vehicleState, params) {
  const fz     = -(params.wheelbase * params.weightRear)   // front axle Z in body space
  const rz     =  (params.wheelbase * params.weightFront)  // rear axle Z in body space
  const bumY   = 0.45 - params.cgHeight                   // bumper height (low side of body)
  const undY   = params.wheelRadius - params.cgHeight      // undercarriage bottom
  const topY   = 0.4                                       // top of visual body box (0.8m box / 2, centered at CG)
  const halfW  = params.trackFront / 2 + 0.1              // lateral extent (slightly past track)

  // BUG-05: the four near-wheel undercarriage probes used to sit at ±track/2 — exactly on the
  // wheel centerline — so their spheres straddled the wheel and stole its ground contact when
  // the car was lowered (false wheel lift-off + jitter). Pull them inboard so the probe's outer
  // edge stays inside the wheel's inner sidewall (track/2 − wheelHalfWidth) with a small margin.
  // Derived from geometry so it holds at any track width, wheel size, or bodyContactRadius.
  const WHEEL_HALF_WIDTH = 0.125
  const UND_MARGIN       = 0.05
  const undWFront = params.trackFront / 2 - WHEEL_HALF_WIDTH - params.bodyContactRadius - UND_MARGIN
  const undWRear  = params.trackRear  / 2 - WHEEL_HALF_WIDTH - params.bodyContactRadius - UND_MARGIN

  const locals = [
    // Front bumper — left and right
    { x: -halfW, y: bumY, z: fz - 0.85 },
    { x:  halfW, y: bumY, z: fz - 0.85 },
    // Rear bumper — left and right
    { x: -halfW, y: bumY, z: rz + 0.65 },
    { x:  halfW, y: bumY, z: rz + 0.65 },
    // Undercarriage — just in front of rear wheels (inboard of the wheel footprint)
    { x: -undWRear, y: undY, z: rz - 0.35 },
    { x:  undWRear, y: undY, z: rz - 0.35 },
    // Undercarriage — just behind front wheels (inboard of the wheel footprint)
    { x: -undWFront, y: undY, z: fz + 0.35 },
    { x:  undWFront, y: undY, z: fz + 0.35 },
    // Undercarriage — center (two points straddling CG)
    { x: 0, y: undY, z: -0.3 },
    { x: 0, y: undY, z:  0.3 },
    // Roof — four corners
    { x: -halfW, y: topY, z: fz - 0.85 },
    { x:  halfW, y: topY, z: fz - 0.85 },
    { x: -halfW, y: topY, z: rz + 0.65 },
    { x:  halfW, y: topY, z: rz + 0.65 },
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
