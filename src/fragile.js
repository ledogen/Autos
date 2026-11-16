/**
 * FEAT-97 fragile cargo — the load's HEALTH, from the shocks it feels through its strap.
 *
 * Pure: no engine, no Three.js. main.js feeds it one number per fixed step — the acceleration the
 * load actually feels, in g: its own change in velocity across the step ÷ the step (feltG). At rest
 * that is 0 whatever the truck's attitude, so only real motion counts. Mass
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

/**
 * Felt acceleration in g: the load's own Δv across one fixed step [m/s] over the step [s].
 *
 * BUG-166 (owner 2026-11-14, "yes, a crash breaks it"; DEC-168): NOT the weld's joint force. Box3D
 * reports that from the LAST substep, which carries our tire and strut forces (spread over the step)
 * but none of a chassis contact (solved in the first substep or two): a 53 g body strike read 0.47 g.
 * The step-averaged Δv / dt is the same quantity, equal to the joint force to the hundredth in
 * driving (washboard 0.78 g, a 0.15 m ledge 3.39 g), and it sees strikes. Gravity is in Δv and in the
 * weld's force alike, so free fall reads 1 g in both and rest reads 0.
 */
export function feltG (v0, v1, dt) {
  return Math.hypot(v1.x - v0.x, v1.y - v0.y, v1.z - v0.z) / dt / G
}

/** Where one hit costs 1 % of health, in g. */
export const onePctG = (row) => row.onePctG ?? row.shockFloorG + 0.1 * (row.breakG - row.shockFloorG)

/** Where one hit costs 10 % of health, in g (the inverse of shockCost's curve; FEAT-237's grey tick). */
export const tenPctG = (row) => {
  const floor = row.shockFloorG, span = row.breakG - floor
  return floor + span * 0.1 ** (Math.log((onePctG(row) - floor) / span) / Math.log(0.01))
}

/** FEAT-237: the felt-g meter is logarithmic from JG_G0 g (the bottom) to `top` g: height 0..1 for a felt g. With
 *  JG_G0 = 0.8 and top = 1.2 x break, the 10 % tick lands at 49-53 % of the height on all three tiers. */
export const JG_G0 = 0.8
export const meterPos = (g, top) => g <= JG_G0 ? 0 : Math.min(1, Math.log(g / JG_G0) / Math.log(top / JG_G0))

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
