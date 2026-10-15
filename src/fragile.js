/**
 * FEAT-97 fragile cargo — the load's HEALTH, from the shocks it feels through its strap.
 *
 * Pure: no engine, no Three.js. main.js feeds it one number per fixed step — the acceleration the
 * load actually feels, in g: the weld's force on it ÷ its mass, plus gravity (physics-engine.js
 * jointForce). At rest that is 0 whatever the truck's attitude, so only real motion counts. Mass
 * does not enter: a piano and a vase feel the same g over the same bump and differ only in what
 * they can take (`shockFloorG` / `breakG` on their data/freight.js row).
 *
 * EVENTS, priced on their PEAK — the bump-stop / rim-strike shape in damage.js: a run of steps above
 * the floor is held at its peak and banked once the signal falls back to the floor or below half its
 * peak (damage.js eventDecayFrac). One bank costs
 *
 *     ((peak − floor) / (break − floor))²     of health, clamped to [0, 1]
 *
 * — steep and superlinear with a floor at zero (design-amendments-2026-08-17 §4): chatter below the
 * floor is free, one hit at `breakG` destroys the load outright. Health only goes down.
 * ponytail: translation only — a yaw jolt that spins the load without moving it is not counted; add
 * the joint torque term if a real case shows the gap.
 */

export const G = 9.81
const EVENT_DECAY_FRAC = 0.5   // same release rule as damage.js eventDecayFrac

/** Felt acceleration in g from the strap's force on the load [N] and its mass [kg]. */
export function feltG (force, massKg) {
  return Math.hypot(force.x / massKg, force.y / massKg - G, force.z / massKg) / G
}

/** Health cost of one event that peaked at `peakG`. */
export function shockCost (peakG, floorG, breakG) {
  if (!(peakG > floorG)) return 0
  const t = (peakG - floorG) / (breakG - floorG)
  return Math.min(1, t * t)
}

/**
 * A fragile load's condition. `row` is its data/freight.js row ({ shockFloorG, breakG }).
 * step(g) returns the banked event `{ peakG, cost }` on the step one lands, else null.
 */
export function makeFragile (row) {
  const floor = row.shockFloorG, brk = row.breakG
  let peak = 0
  const s = {
    health: 1,
    step (g) {
      if (s.health <= 0) return null
      if (g > peak) { if (g > floor) peak = g; return null }   // still building
      if (peak > floor && (g <= floor || g < peak * EVENT_DECAY_FRAC)) {
        const cost = Math.min(s.health, shockCost(peak, floor, brk))
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
