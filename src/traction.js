/**
 * src/traction.js — FEAT-159: the two traction assists, between the driver's drive pedal and the
 * drivetrain (owner, 2026-11-02 — two assists, two jobs):
 *
 *   THROTTLE ASSIST — a skilled foot. Trims the pedal so the driven rears sit just under peak grip
 *     instead of spinning past it. Never brakes a wheel. Steps aside (the cap ramps back to full) when
 *     the handbrake is held (a U-turn), when the truck is sideways (a drift: sideslip past
 *     taDriftAngle) and above taMaxSpeed — "at low speeds". No hidden gesture: a burnout is the
 *     assist switched off (owner 2026-11-02: "no double press").
 *   TRACTION CONTROL — the automotive system. Brakes the FASTER rear when it out-turns the other by
 *     more than tcSplit (a brake-based limited-slip: the open diff's equal torque split can then
 *     push the gripping wheel harder), and cuts engine torque when both rears spin (slower rear past
 *     tcSlip) or the truck oversteers. It never steps aside: stopping a drift is its job.
 *
 * In this tire model a spinning tire still pulls at ~100 % of peak (the break-away clamp,
 * tireBreakawaySlip, holds the slip state at the Pacejka crest — the same finding abs-stop.mjs made for
 * a locked tire), so neither assist makes a launch faster. What they buy is tread (wear ∝ slip speed,
 * damage.js) and the rears' lateral grip, which a spinning tire spends entirely along its slip.
 *
 * Like src/abs.js it sees only what a real controller sees, sampled once per physics step: four
 * wheel-speed sensors, a yaw-rate gyro, the steering angle, the handbrake and the drive pedal. The
 * reference ground speed is the undriven fronts' mean, the classic rear-drive TC sensor. The one
 * exception is the throttle assist's drift test, which reads the truck's true sideslip — a driver SEES
 * the truck is sideways; a foot has no sensor set.
 *
 * Outputs:
 *   t.cap   ∈ [0,1] — the most pedal the engine may have; stepDrivetrain takes min(pedal, cap).
 *   t.p[i]  ∈ [0,1] — TC brake pressure at rear wheel i (fraction of line pressure, abs.p's unit);
 *                     getBrakeTorque (physics.js) takes the stronger of it and the service brake.
 *
 * The pedal cap is the ABS valve mirrored: while the judged rear's slip is over target and still
 * rising, DUMP the cap (remembering where it spun); over target but falling, HOLD; under target,
 * BUILD — fast to tracReapplyFrac of the spin cap, then a slow creep. A rear wheel spins up within one
 * step at full torque, so a fast cut with a slow re-apply is what hovers it just under spin.
 * With both assists on, TC's stricter target and its oversteer cut govern the one cap.
 *
 * Pure: no DOM, no engine types, no Three.js. State lives in the object makeTraction returns.
 */

const BUILD = 0, HOLD = 1, DUMP = 2

export function makeTraction () {
  return { cap: 1, capSpin: 1, cycled: false, mode: BUILD, sPrev: 0, p: [0, 0, 0, 0], active: false }
}

/**
 * One controller loop.
 * @param {object} t        makeTraction() state (mutated: t.cap, t.p)
 * @param {number} drive    the pedal driving the engine ∈ [0,1] — W, or S in the automatic's reverse
 * @param {object} vs       vehicleState: wheelOmega[4], steerAngle, handbrake
 * @param {number} vForward chassis velocity along its forward axis [m/s]
 * @param {number} vLat     chassis velocity along its right axis [m/s]
 * @param {number} yawRate  body yaw rate [rad/s], positive counter-clockwise from above (= steer-left)
 * @param {object} params   vehicle params (throttleAssist, tractionControl, the ta-, tc- and trac- tuning)
 * @param {number} dt       s — the loop period
 */
export function stepTraction (t, drive, vs, vForward, vLat, yawRate, params, dt) {
  const ta = !!params.throttleAssist, tc = !!params.tractionControl
  t.active = ta || tc
  if (!t.active) {   // both off: pass-through, nothing touched
    t.cap = 1; t.cycled = false; t.mode = BUILD; t.p[2] = 0; t.p[3] = 0
    return
  }
  const r = params.wheelRadius, w = vs.wheelOmega
  const vRefSigned = 0.5 * ((w[0] || 0) + (w[1] || 0)) * r          // undriven fronts
  const vRef = Math.abs(vRefSigned)
  const v2 = Math.abs(w[2] || 0) * r, v3 = Math.abs(w[3] || 0) * r
  // Slip ratio as the tire sees it (s = slip × tireRelaxationLength), floored at 1 m/s so a launch from
  // rest is controllable: at rest ANY rotation already drives the tire's slip state to the crest.
  const slip = (v) => (v - vRef) / Math.max(v, vRef, 1)
  const sHi = slip(Math.max(v2, v3)), sLo = slip(Math.min(v2, v3))

  // ── TC brake: the faster rear, by how far it out-turns the other — only while the engine drives ──
  for (const [i, vi, vj] of [[2, v2, v3], [3, v3, v2]]) {
    const ex = vi - vj - (params.tcSplit ?? 1)
    t.p[i] = tc && drive > 0 && ex > 0
      ? Math.min(1, t.p[i] + (params.tcBrakeGain ?? 2) * ex * dt)
      : Math.max(0, t.p[i] - (params.tracDumpRate ?? 15) * dt)
  }

  // ── The pedal cap ────────────────────────────────────────────────────────────────────────────────
  const speed = Math.hypot(vForward, vLat)
  const aside = !tc && (vs.handbrake || speed > (params.taMaxSpeed ?? 15) ||
    (speed > 3 && Math.atan2(Math.abs(vLat), Math.abs(vForward)) > (params.taDriftAngle ?? 0.175)))
  const build = params.tracBuildRate ?? 4
  if (aside || drive <= 0) {   // out of the way (ramped, never a snap), or the foot is off: start fresh
    t.cap = drive <= 0 ? 1 : Math.min(1, t.cap + build * dt)
    t.cycled = false; t.mode = BUILD; t.sPrev = 0
    return
  }
  // ESC's oversteer test: rotating faster than the steering asks, or against the countersteer.
  // r_ref is the kinematic (no-slip) yaw rate, so a gripping, understeering truck never trips it.
  const rRef = vRefSigned * Math.tan(vs.steerAngle || 0) / params.wheelbase
  const oversteer = tc && vRef > 2 && Math.sign(yawRate) * (yawRate - rRef) > (params.tcYawMargin ?? 0.1)
  const s = tc ? sLo : sHi
  const over = s > (tc ? params.tcSlip ?? 0.15 : params.taSlip ?? 0.3) || oversteer
  const rising = s > t.sPrev
  t.sPrev = s
  const mode = over && (rising || oversteer) ? DUMP : over ? HOLD : BUILD
  if (mode === DUMP) {
    const from = Math.min(t.cap, drive)
    if (t.mode !== DUMP) t.capSpin = from                     // a fresh cut: remember where it spun
    t.cycled = true
    t.cap = Math.max(0, from - (params.tracDumpRate ?? 15) * dt)
  } else if (mode === HOLD) {
    t.cap = Math.min(t.cap, drive)
  } else {
    const fast = t.cap < (params.tracReapplyFrac ?? 0.8) * t.capSpin
    t.cap = t.cycled ? Math.min(1, t.cap + (fast ? build : params.tracReapplyRate ?? 1) * dt) : 1
  }
  t.mode = mode
}
