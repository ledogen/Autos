/**
 * src/abs.js — anti-lock brakes: a period 4-channel ABS controller between the brake pedal and the
 * four wheel cylinders (owner, 2026-10-21: "mimic a real anti-lock system, not the theoretical ideal").
 *
 * It sees only what a real ECU sees — four wheel-speed sensors and a longitudinal deceleration
 * sensor, sampled once per loop — and never the truck's true speed or the tire model. Per loop:
 *   • REFERENCE SPEED: the fastest wheel, but never allowed to fall faster than the truck is
 *     measured to be slowing (+ absRefMargin, capped at absRefDecel). When every wheel slips at once
 *     (ice, a slide) the reference keeps sliding down at the truck's real rate, so the slip still
 *     shows up. A wheel-only reference at a fixed worst-case slope cannot do this — it falls with the
 *     wheels and the truck spins on undetected rear lock-up — which is why 4x4 ABS (Ford's 4WABS
 *     trucks among them) and every modern 4-channel system carry the decel sensor.
 *     The sensor is an accelerometer, so it reads SPECIFIC force: braking downhill it over-reads by
 *     g·sin(grade), uphill it under-reads — the real one's flaw, kept.
 *   • per wheel, slip = (ref − wheel) / ref and the wheel's own circumferential deceleration, then a
 *     three-state solenoid valve (the classic Bosch phases, simplified):
 *       DUMP  slip > absSlipDump, wheel still      — lock-up: vent the cylinder at absDumpRate, but
 *             slowing                                only until the wheel turns round — venting on
 *                                                    while it already recovers throws away clamp
 *       HOLD  wheel decel > absDecelHold           — no truck can slow that fast, the wheel is
 *                                                    heading for lock: isolate the cylinder
 *       HOLD  wheel accel > absAccelHold           — still spinning back up after a dump: wait until
 *                                                    it is back at road speed. This is what keeps the
 *                                                    reference honest — every cycle, a recovered wheel
 *                                                    re-syncs it to the truck's real speed
 *       BUILD otherwise                            — straight from the master cylinder until the
 *                                                    channel first dumps; after that a fast build
 *                                                    (absBuildRate) back to absReapplyFrac of the
 *                                                    pressure the wheel last locked at, then stepped
 *                                                    up at absReapplyRate so it hovers just under lock
 *   • below absMinSpeed of reference the valves open and the pedal goes straight through — the wheels
 *     lock in the last metre, as on the real thing.
 * Finite dump/reapply rates are what make it pulse (≈5–10 Hz) rather than sit on peak slip.
 *
 * Pressure is normalised: p[i] ∈ [0, pedal] is the fraction of full line pressure at wheel i, which
 * getBrakeTorque (physics.js) uses in place of the pedal. ABS can only take pressure away.
 * ponytail: the ECU loop is the physics step (60 Hz); period controllers ran ~100–200 Hz. A faster
 * loop would need the wheel ω integrated in substeps — nothing new to sample at 60 Hz otherwise.
 *
 * Pure: no DOM, no engine types, no Three.js. State lives in the object makeAbs returns.
 */

const BUILD = 0, HOLD = 1, DUMP = 2

export function makeAbs () {
  return { ref: 0, vel: null, accel: 0, v: [0, 0, 0, 0], vPrev: [0, 0, 0, 0], p: [0, 0, 0, 0], mode: [BUILD, BUILD, BUILD, BUILD],
    cycled: [false, false, false, false], pLock: [0, 0, 0, 0], pulse: false, active: false }
}

/**
 * One ECU loop.
 * @param {object} a       makeAbs() state (mutated: a.p is the per-wheel pressure output)
 * @param {number} pedal   brake pedal ∈ [0,1]
 * @param {number[]} omega wheel ω [rad/s] at the sample (the start of the physics step)
 * @param {object} vel     chassis velocity {x,y,z} [m/s] — differenced, never read as a speed: it
 *                         stands in for the accelerometer
 * @param {object} fwd     chassis forward unit axis {x,y,z} — the accelerometer's sensing axis
 * @param {object} params  vehicle params (abs toggle, wheelRadius, abs* tuning)
 * @param {number} dt      s — the loop period
 */
export function stepAbs (a, pedal, omega, vel, fwd, params, dt) {
  // Decel sensor: specific force (acceleration minus gravity) along the chassis axis, low-passed like
  // the real part (τ = absAccelTau).
  const pv = a.vel ??= { x: vel.x, y: vel.y, z: vel.z }
  const f = ((vel.x - pv.x) * fwd.x + (vel.y - pv.y) * fwd.y + (vel.z - pv.z) * fwd.z) / dt + 9.81 * fwd.y
  pv.x = vel.x; pv.y = vel.y; pv.z = vel.z
  a.accel += (f - a.accel) * Math.min(1, dt / (params.absAccelTau ?? 0.1))

  const v = a.vPrev, vPrev = a.v                  // swap: last loop's speeds become vPrev
  a.v = v; a.vPrev = vPrev
  let vMax = 0
  for (let i = 0; i < 4; i++) {
    v[i] = Math.abs(omega[i] || 0) * params.wheelRadius   // sensors read speed, not direction
    if (v[i] > vMax) vMax = v[i]
  }
  // Off the pedal nothing is braked, so the fastest wheel IS the truck: re-sync (also clears a stale
  // reference after a teleport or respawn).
  const slope = Math.min(params.absRefDecel ?? 11.8, Math.max(0, -a.accel) + (params.absRefMargin ?? 1))
  a.ref = pedal > 0 ? Math.max(vMax, a.ref - slope * dt) : vMax
  a.pulse = false
  a.active = !!params.abs && pedal > 0 && a.ref > (params.absMinSpeed ?? 2.2)

  for (let i = 0; i < 4; i++) {
    if (!a.active) {
      a.p[i] = pedal; a.mode[i] = BUILD; a.cycled[i] = false
      continue
    }
    const slip = (a.ref - v[i]) / a.ref
    const decel = (vPrev[i] - v[i]) / dt
    const slipping = slip > (params.absSlipDump ?? 0.2)
    const mode = slipping && decel > 0 ? DUMP
               : slipping || decel > (params.absDecelHold ?? 15.7) || -decel > (params.absAccelHold ?? 10) ? HOLD : BUILD
    if (mode === DUMP) {
      if (a.mode[i] !== DUMP) { a.pulse = true; a.pLock[i] = a.p[i] }   // a fresh dump: the pedal kicks back
      a.cycled[i] = true
      a.p[i] = Math.max(0, a.p[i] - (params.absDumpRate ?? 15) * dt)
    } else if (mode === BUILD) {
      const fast = a.p[i] < (params.absReapplyFrac ?? 0.8) * a.pLock[i]
      a.p[i] = a.cycled[i] ? a.p[i] + (fast ? params.absBuildRate ?? 15 : params.absReapplyRate ?? 3) * dt : pedal
    }
    a.p[i] = Math.min(a.p[i], pedal)              // the pump can only vent, never boost
    a.mode[i] = mode
  }
}
