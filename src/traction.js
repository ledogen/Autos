/**
 * src/traction.js — FEAT-159: the two traction assists, between the driver's drive pedal and the
 * drivetrain (owner, 2026-11-02 — two assists, two jobs):
 *
 *   THROTTLE ASSIST — a skilled foot. Trims the pedal so the driven rears sit just under peak grip
 *     instead of spinning past it. Never brakes a wheel. Steps aside (the cap ramps back to full) when
 *     the handbrake is held (a U-turn), when the truck oversteers (the player is rotating it: a power
 *     slide or a held drift — the same yaw test TC uses to stop one) and above taMaxSpeed — "at low
 *     speeds". No hidden gesture: a burnout is the assist switched off (owner 2026-11-02: "no double
 *     press").
 *   TRACTION CONTROL — the automotive system. Brakes the FASTER rear when it out-turns the other by
 *     more than tcSplit (a brake-based limited-slip: the open diff's equal torque split can then
 *     push the gripping wheel harder), and cuts engine torque when both rears spin (slower rear past
 *     tcSlip), when the faster one passes tcSlipHi (the rear brake alone cannot hold it — 495 N·m
 *     against the whole axle's torque on split grip) or when the truck oversteers. It never steps
 *     aside: stopping a drift is its job.
 *
 * In this tire model a spinning tire still pulls at ~100 % of peak (the break-away clamp,
 * tireBreakawaySlip, holds the slip state at the Pacejka crest — the same finding abs-stop.mjs made for
 * a locked tire), so neither assist makes a launch faster. What they buy is tread (wear ∝ slip speed,
 * damage.js) and the rears' lateral grip, which a spinning tire spends entirely along its slip.
 *
 * Like src/abs.js it sees only what a real controller sees, sampled once per physics step: four
 * wheel-speed sensors, a yaw-rate gyro, the steering angle, the handbrake and the drive pedal. The
 * reference ground speed is the undriven fronts' mean, the classic rear-drive TC sensor. Oversteer is
 * ESC's test: the truck yawing faster than its steering's kinematic (no-slip) rate, or against the
 * countersteer, by more than tracYawMargin — so a gripping, understeering truck never trips it.
 *
 * Outputs:
 *   t.cap   ∈ [0,1] — the most pedal the engine may have; stepDrivetrain takes min(pedal, cap).
 *   t.p[i]  ∈ [0,1] — TC brake pressure at rear wheel i (fraction of line pressure, abs.p's unit);
 *                     getBrakeTorque (physics.js) takes the stronger of it and the service brake.
 *
 * The pedal cap is an integral controller on the judged rear's slip: it moves tracGain × (slip −
 * target) per second, down from whatever the engine is actually getting, up toward full. (An ABS-style
 * dump/re-apply valve was tried first: its 0.25-per-step cuts collapsed the slip to nothing every
 * cycle and lost 19 % of the launch. The engine and converter smooth the plant over ~6 steps, which an
 * integrator tracks without pulsing.) Oversteer under TC cuts at the fixed tracDumpRate instead.
 * With both assists on, TC's stricter target and its oversteer cut govern the one cap.
 *
 * Pure: no DOM, no engine types, no Three.js. State lives in the object makeTraction returns.
 */

export function makeTraction () {
  return { cap: 1, p: [0, 0, 0, 0], active: false }
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
    t.cap = 1; t.p[2] = 0; t.p[3] = 0
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
  const dump = params.tracDumpRate ?? 15
  for (const [i, vi, vj] of [[2, v2, v3], [3, v3, v2]]) {
    const ex = vi - vj - (params.tcSplit ?? 1)
    t.p[i] = tc && drive > 0 && ex > 0
      ? Math.min(1, t.p[i] + (params.tcBrakeGain ?? 2) * ex * dt)
      : Math.max(0, t.p[i] - dump * dt)
  }

  // ── The pedal cap ────────────────────────────────────────────────────────────────────────────────
  const rRef = vRefSigned * Math.tan(vs.steerAngle || 0) / params.wheelbase
  const oversteer = vRef > 2 && Math.sign(yawRate) * (yawRate - rRef) > (params.tracYawMargin ?? 0.1)
  const aside = !tc && (vs.handbrake || oversteer || Math.hypot(vForward, vLat) > (params.taMaxSpeed ?? 15))
  if (drive <= 0) { t.cap = 1; return }                                  // foot off: nothing to trim
  if (aside) { t.cap = Math.min(1, t.cap + dump * dt); return }          // out of the way — ramped, never a snap
  const e = (tc ? Math.max(sLo - (params.tcSlip ?? 0.35), sHi - (params.tcSlipHi ?? 0.6)) : sHi - (params.taSlip ?? 0.35))
  const from = Math.min(t.cap, drive)                                    // cut from what the engine is getting
  t.cap = oversteer ? Math.max(0, from - dump * dt)
    : e > 0 ? Math.max(0, from - (params.tracGain ?? 10) * e * dt)
    : Math.min(1, t.cap - (params.tracGain ?? 10) * e * dt)
}
