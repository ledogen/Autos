/**
 * src/ignition.js — FEAT-33: the ignition switch and starter motor.
 *
 * A three-position key (OFF → CRANKING → RUNNING) operated by one keybind, held like a real key:
 *
 *   OFF      press and hold → CRANKING (starter engaged, engine spun to ignitionCrankRPM, no drive torque)
 *   CRANKING cranked long enough → RUNNING (engine catches, settles to idle)
 *   CRANKING released early → back to OFF, crank progress DISCARDED. You have to crank again.
 *   RUNNING  tap the key   → OFF (ignition cut; the engine is then dragged by the driveline, see drivetrain.js)
 *
 * The catch time is the whole point of the feature: it interpolates from ignitionCatchTime (a healthy
 * engine, ~0.25 s — barely a beat) to ignitionCatchTimeWorn (a beater, seconds of grinding) on
 * vehicleState.engineHealth ∈ [0,1]. That field is the seam for the SM-3 wear/condition model
 * (FEAT-26); until it exists engineHealth is absent and reads as 1 — a single nominal catch time,
 * exactly as the ticket specifies. It is deliberately NOT a bespoke per-vehicle timer.
 *
 * Deterministic threshold, not a per-crank-second probability roll: "hold it this long and it fires"
 * is readable, and a jalopy that sometimes refuses to start for no visible reason reads as a bug.
 *
 * Entering CRANKING requires a fresh PRESS, never a held key. That single rule is what stops the
 * shutoff tap from turning into an immediate restart when the driver keeps their finger down.
 *
 * Pure state machine — no Three.js, no DOM, no audio. vehicle.js feeds it the key state;
 * drivetrain.js reads vehicleState.ignition.state; cluster.js draws keyPosition(); the audio layer
 * consumes the one-shot `event` field. If vehicleState.ignition is ABSENT the engine is treated as
 * RUNNING (see drivetrain.js), so headless gates never have to crank the truck first.
 */

export const OFF = 'off'
export const CRANKING = 'cranking'
export const RUNNING = 'running'

/** Fresh ignition state. Defaults to RUNNING — free roam hands you a live truck (owner, 2026-08-22). */
export function makeIgnitionState (state = RUNNING) {
  return {
    state,
    crank: 0,          // s — how long the starter has been engaged this attempt (discarded on release)
    startHeld: false,  // key physically held at START — drives the 2 o'clock detent past the catch
    prevKey: false,    // key state last step — rising-edge detection (press, not hold)
    event: null,       // one-shot this step: 'crank' | 'catch' | 'abort' | 'shutoff'. Consumed by audio.
  }
}

/**
 * Catch time [s] for the current engine condition. health 1 → ignitionCatchTime, approaching 0 →
 * ignitionCatchTimeWorn, linear between. AT health 0 the engine never catches (owner, 2026-09-04:
 * a dead engine cranks forever — Infinity, so the starter grinds and nothing fires). Absent health
 * reads as 1 (headless gates build vehicleState by hand with no wear model).
 */
export function catchTime (vehicleState, params) {
  const health = Math.max(0, Math.min(1, vehicleState.engineHealth ?? 1))
  if (health <= 0) return Infinity
  const fresh = params.ignitionCatchTime ?? 0.25
  const worn = params.ignitionCatchTimeWorn ?? 1.0
  return fresh + (1 - health) * (worn - fresh)
}

/**
 * Step the ignition one fixed timestep.
 *
 * @param {object} vehicleState - mutates .ignition (created on first call if absent).
 * @param {object} params - RANGER_PARAMS: ignitionCatchTime, ignitionCatchTimeWorn.
 * @param {number} dt - fixed timestep [s].
 * @param {boolean} keyDown - is the ignition key held this step.
 * @returns {string|null} the one-shot event this step (also left on ign.event).
 */
export function stepIgnition (vehicleState, params, dt, keyDown) {
  const ign = vehicleState.ignition || (vehicleState.ignition = makeIgnitionState())
  const held = !!keyDown
  const press = held && !ign.prevKey
  ign.event = null

  if (ign.state === RUNNING) {
    // A TAP kills it — not a hold. Allowed at any speed (owner, 2026-08-22): you really can turn the
    // key off at 50 mph, and the truck then coasts on a dragged engine rather than freewheeling.
    if (press) { ign.state = OFF; ign.crank = 0; ign.startHeld = false; ign.event = 'shutoff' }
  } else {
    if (ign.state === OFF && press) {       // fresh press → engage the starter
      ign.state = CRANKING
      ign.crank = 0
      ign.startHeld = true
      ign.event = 'crank'
    }
    // Deliberately NOT an else-if: the starter is already turning on the step it engages, so that
    // step counts toward the catch. Otherwise every start costs one free frame of latency and the
    // measured catch time sits a step above ignitionCatchTime.
    if (ign.state === CRANKING) {
      if (held) {
        ign.crank += dt
        if (ign.crank >= catchTime(vehicleState, params)) {
          ign.state = RUNNING
          ign.crank = 0
          ign.event = 'catch'
          // startHeld stays true: a real key sits at START until the driver's hand lets go, so the
          // cluster keeps showing 2 o'clock for as long as they over-crank a running engine.
        }
      } else {
        ign.state = OFF
        ign.crank = 0
        ign.event = 'abort'
      }
    }
  }

  if (!held) ign.startHeld = false
  ign.prevKey = held
  return ign.event
}

/**
 * Where the key barrel sits, for the cluster. Absent state ⇒ 'on' (the RUNNING default).
 * @returns {'off'|'on'|'start'}
 */
export function keyPosition (ign) {
  if (!ign) return 'on'
  if (ign.state === CRANKING || ign.startHeld) return 'start'
  return ign.state === RUNNING ? 'on' : 'off'
}
