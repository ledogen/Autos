/**
 * src/park-brake.js — the parking-brake latch (feature/teleport; FEAT-194's release rules). vehicle.js
 * feeds it one step's controls; test/park-brake.mjs drives it directly. Pure: no DOM, no engine types.
 *
 *   Moving (≥ PARK_SPEED): nothing latches; the handbrake is momentary, Space held (vehicle.js).
 *   Near rest: a Space TAP latches it, and it keeps holding after the release.
 *   Latched, it lets go on another Space tap (the lever itself), the THROTTLE, or — manual — a shift that
 *     lands in a gear. FEAT-194 part 1 (owner, 2026-11-11: "Tapping or holding the brakes with the parking
 *     brake on should not release it"): the brake pedal never does, tapped or held. DEC-255 (owner, 2026-11-15)
 *     refines it: on the AUTOMATIC, S / LT at rest is the reverse pedal (drivetrain.js autoReverse) and releases the latch
 *     like gas; on the MANUAL it stays a pure brake. vehicle.js classifies the input and passes it as `throttle`.
 *   BUG-249 / DEC-435 (owner 2026-11-20: "gate the automatic brake release on an action that actually moves the
 *     truck"): vehicle.js passes `throttle` / `gearIn` only when they can drive — the engine running, and for the
 *     throttle on the manual a gear in with the clutch out. Engine off, only the tap (the handbrake button) does.
 *   Locked (FEAT-194 part 2: a menu that needs the truck parked is up — main.js _parkLocked): the
 *     handbrake is on whatever the latch says (vehicle.js), and neither the throttle nor a gear releases
 *     the latch, so a stray tap behind a card cannot roll the truck. The Space tap still does: it is the lever.
 */
export const PARK_SPEED = 1.389   // m/s ≈ 5 km/h

/** The latch after one step. `throttle` / `gearIn` are booleans for this step, `tap` Space's rising edge. */
export function stepParkBrake (parked, { tap, throttle, gearIn, speed, lock }) {
  if (parked) return !(tap || (!lock && (throttle || gearIn)))
  return tap && speed < PARK_SPEED
}
