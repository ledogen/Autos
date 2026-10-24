/**
 * FEAT-97 fragile cargo — the load's HEALTH, from the shocks it feels through its strap.
 *
 * Pure: no engine, no Three.js. main.js feeds it one number per fixed step — the acceleration the
 * load actually feels, in g: the weld's force on it ÷ its mass, plus gravity (physics-engine.js
 * jointForce). At rest that is 0 whatever the truck's attitude, so only real motion counts. Mass
 * does not enter: a piano and a vase feel the same g over the same bump and differ only in what
 * they can take (`shockFloorG` / `onePctG` / `breakG` on their data/offers.js tier).
 *
 * EVENTS, priced on their PEAK — the bump-stop / rim-strike shape in damage.js: a run of steps above
 * the floor is held at its peak and banked once the signal falls back to the floor or below half its
 * peak (damage.js eventDecayFrac). One bank costs
 *
 *     ((peak − floor) / (break − floor))^p     of health, clamped to [0, 1]
 *
 * — superlinear with a floor at zero (design-amendments-2026-08-17 §4): chatter below the floor is
 * free, one hit at `breakG` destroys the load outright. Health only goes down. The exponent p is set
 * per row so ONE hit at `onePctG` costs exactly 1 % (owner, 2026-10-24: the 1 % line stayed where the
 * old p = 2 curve put it while the break moved up). A row without `onePctG` gets that p = 2 point,
 * a tenth of the way from floor to break.
 * ponytail: translation only — a yaw jolt that spins the load without moving it is not counted; add
 * the joint torque term if a real case shows the gap.
 */

export const G = 9.81
const EVENT_DECAY_FRAC = 0.5   // same release rule as damage.js eventDecayFrac

/** Felt acceleration in g from the strap's force on the load [N] and its mass [kg]. */
export function feltG (force, massKg) {
  return Math.hypot(force.x / massKg, force.y / massKg - G, force.z / massKg) / G
}

/** Where one hit costs 1 % of health, in g. */
export const onePctG = (row) => row.onePctG ?? row.shockFloorG + 0.1 * (row.breakG - row.shockFloorG)

/** Health cost of one event that peaked at `peakG`, on a row's { shockFloorG, onePctG?, breakG }. */
export function shockCost (peakG, row) {
  const floor = row.shockFloorG, span = row.breakG - floor
  if (!(peakG > floor)) return 0
  const p = Math.log(0.01) / Math.log((onePctG(row) - floor) / span)
  return Math.min(1, ((peakG - floor) / span) ** p)
}

/**
 * A fragile load's condition. `row` is its data/offers.js tier ({ shockFloorG, onePctG, breakG }).
 * step(g) returns the banked event `{ peakG, cost }` on the step one lands, else null.
 */
export function makeFragile (row) {
  const floor = row.shockFloorG
  let peak = 0
  const s = {
    health: 1,
    step (g) {
      if (s.health <= 0) return null
      if (g > peak) { if (g > floor) peak = g; return null }   // still building
      if (peak > floor && (g <= floor || g < peak * EVENT_DECAY_FRAC)) {
        const cost = Math.min(s.health, shockCost(peak, row))
        const peakG = peak
        peak = 0
        s.health = Math.max(0, s.health - cost)
        return { peakG, cost }
      }
      if (g <= floor) peak = 0
      return null
    },
  }
  return s
}
