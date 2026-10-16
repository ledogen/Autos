/**
 * src/load-verdict.js — FEAT-112: does this load fit the truck AS CONFIGURED? Pure, headless, no imports.
 *
 * Verdict ladder (owner 2026-10-16, .planning/todos FEAT-112):
 *   fits      inside every limit
 *   warning   mass past the soft limit, any overhang past the tailgate, a loose load on an open deck —
 *             takeable; the physics and the tire risk are the penalty
 *   overload  mass past the hard cap, too long, too wide — the job cannot be taken
 *
 * SM-INV-12: nothing here feeds the board's roll. The board never imports this; main.js computes a
 * verdict per card and hands it in, so the same seed posts the same board whatever the truck.
 */

/** Worst first: the verdict is the level of the worst reason. */
const LEVELS = ['fits', 'warning', 'overload']

/**
 * The truck's config: the vehicle model's stock rating, with every upgrade folded over it left to
 * right (each `u.apply(config)` returns the next config). FEAT-115 ships the parts; items.md §3f's
 * load-rating parts use the same hook.
 *
 * @param {object} model - a VEHICLE_MODELS entry with `bed` and `load` (data/vehicle-models.js)
 * @param {Array<{apply: (c: object) => object}>} [upgrades]
 */
export function truckConfig (model, upgrades = []) {
  const { bed, load } = model
  const stock = {
    lengthM: bed.tailZ - bed.frontZ,          // front wall to the closed tailgate's inner face
    widthM: 2 * bed.innerHalfW,               // between the walls (the wheelhouses carry what is wider)
    containment: load.containment,            // 'sides' | 'open' | 'enclosed'
    overhangMaxM: load.overhangMaxM,
    springs: load.springs, dampers: load.dampers, tires: load.tires,
  }
  return upgrades.reduce((c, u) => u.apply(c), stock)
}

/** The truck's soft limit and hard cap: the weakest of the three load-bearing parts sets each. */
export function massLimits (config) {
  const parts = [config.springs, config.dampers, config.tires]
  return { softKg: Math.min(...parts.map(p => p.softKg)), hardKg: Math.min(...parts.map(p => p.hardKg)) }
}

export const SOFT_WEIGHT_TEXT = 'this load exceeds the recommended weight limit'

/**
 * @param {object} config - truckConfig()
 * @param {{massKg: number, size: number[], form: 'boxed'|'loose'|'long'}} cargo - size is the model's
 *        [W, H, L] in metres, L down the bed (PROP_MODELS collision.size)
 * @returns {{verdict: 'fits'|'warning'|'overload', reasons: Array<{level: string, text: string}>}}
 */
export function loadVerdict (config, cargo) {
  const reasons = []
  const add = (level, text) => reasons.push({ level, text })
  const { softKg, hardKg } = massLimits(config)
  if (cargo.massKg > hardKg) add('overload', 'too heavy')
  else if (cargo.massKg > softKg) add('warning', SOFT_WEIGHT_TEXT)

  const [w, , l] = cargo.size
  const over = l - config.lengthM
  if (over > (config.containment === 'enclosed' ? 0 : config.overhangMaxM)) add('overload', 'too long')
  else if (over > 0) add('warning', 'overhangs')
  if (w > config.widthM) add('overload', 'too wide')
  if (cargo.form === 'loose' && config.containment === 'open') add('warning', 'will spill')

  reasons.sort((a, b) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level))
  return { verdict: reasons[0]?.level ?? 'fits', reasons }
}

/**
 * The highest tire condition the puncture curve may read under `massKg` in the bed (src/damage.js
 * tireCondCap). 1 up to the tires' pop onset; then 0.50 → 0.10 linear to the tires' hard cap; 0.10
 * past it. 0.50 is the first condition the curve can pop at all, so the onset is where a fresh tire
 * first becomes poppable. LT tires move both ends of the ramp.
 */
export function tireCondCap (config, massKg) {
  const { popKg, hardKg } = config.tires
  if (massKg <= popKg) return 1
  return Math.max(0.10, 0.50 - 0.40 * (massKg - popKg) / (hardKg - popKg))
}
