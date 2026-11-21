// src/difficulty.js — a run's rules (FEAT-296, DEC-433): the difficulty rows of data/difficulty.js, applied.
//
// A run's rules are one level name per row, `{ damage, hunger, cost, endless }`: RUN state, saved with the run and never
// part of a world (DEC-012: worldgen never sees them, the world code does not carry them). Applying writes the resolved
// numbers ABSOLUTELY, from the defaults captured when this module loads, into the params the systems already read (the
// src/world-presets.js pattern), so no system branches on a difficulty:
//   damage   wear  → DAMAGE_PARAMS.wearScale (every class) · onset → every key in ONSET_KEYS · cap → springEventCap.
//            `off` (none) is not a number: main.js reads it as damageModel.held, the tutorial's own "takes nothing".
//   hunger   graceH → DAY_PARAMS.hungerGraceH · energy → hungryRate − 1 and starvingRate − 1
//   cost     growth → ECONOMY_PARAMS.dayTierTable (economy.js dayTierCurve), which parts, repairs, fuel, food and the
//            tow all ride (FEAT-168)
//   endless  on → main.js _endRun: the expedition camp shows its card and the run goes on
//   hunger   off → DAY_PARAMS.hungerOn false (DEC-475)
//   fuel     burn → RANGER_PARAMS.fuelBurnScale (DEC-475)
//   tows, death  are read by main.js where they act (_towQuote, _endRun → _loseLife); nothing to write
// Classic writes back exactly the captured defaults, and main.js applies only on a CHANGE of rules, so a Classic run
// never writes at all (and a debug slider tweak stands). A tweak to a scaled key lasts until the rules next change.

import { DIFFICULTY_ROWS, CLASSIC_RULES, RULE_ALIASES } from '../data/difficulty.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { DAMAGE_PARAMS } from './damage.js'
import { DAY_PARAMS } from './day.js'
import { ECONOMY_PARAMS, dayTierCurve } from './economy.js'

// The damage onsets: where an event starts costing anything. Each curve's far end moves with its start (the spring's
// reference hit, the alignment's full bend, the crash's full-loss speed), so a low-damage event never costs more than
// it does today at any force. The rims' overload scales (rimFull*) and the fatal crash speeds do not move.
export const ONSET_KEYS = [
  'springForceFloorFront', 'springForceFloorRear', 'springBumpRefNFront', 'springBumpRefNRear',   // a bump hurts a spring
  'alignBumpFloorN', 'alignBumpFullN', 'alignMinMph', 'alignMaxMph',                               // …bends the alignment
  'punctureAtHalf', 'punctureAtKnee', 'punctureAtFloor',                                           // …pops a worn tire
  'rimPinchRoadMult', 'rimYieldMult', 'rimYieldRoadMult',                                          // a rim strike pops a tire, bends a rim
  'hazardPunctureMult', 'hazardPinchEnergyJ',                                                      // a rock pops a tire
  'impactArmor.floorMph', 'impactArmor.fullMph', 'impactWheel.floorMph', 'impactWheel.fullMph',    // a crash starts to cost
]
const path = (k) => k.split('.')
const read = (o, k) => path(k).reduce((a, p) => a[p], o)
const write = (o, k, v) => { const p = path(k), last = p.pop(); p.reduce((a, q) => a[q], o)[last] = v }

const BASE = {
  onset: Object.fromEntries(ONSET_KEYS.map(k => [k, read(DAMAGE_PARAMS, k)])),
  wearScale: { ...DAMAGE_PARAMS.wearScale },
  springEventCap: DAMAGE_PARAMS.springEventCap,
  hungryRate: DAY_PARAMS.hungryRate,
  starvingRate: DAY_PARAMS.starvingRate,
  fuelBurnScale: RANGER_PARAMS.fuelBurnScale,
}

/** `r` with every renamed level read by its new name, and every missing or unknown level replaced by Classic's. */
export function legalRules (r) {
  const out = {}
  for (const row of Object.keys(CLASSIC_RULES)) {
    const lv = RULE_ALIASES[row]?.[r?.[row]] ?? r?.[row]
    out[row] = Object.hasOwn(DIFFICULTY_ROWS[row], lv) ? lv : CLASSIC_RULES[row]
  }
  return out
}

/** The resolved numbers of rules `r`: { damage: {...}, hunger: {...}, cost: {...}, endless: {...} }. */
export const resolveRules = (r) => {
  const l = legalRules(r)
  return Object.fromEntries(Object.keys(l).map(row => [row, DIFFICULTY_ROWS[row][l[row]]]))
}

/** Write rules `r` into DAMAGE_PARAMS / DAY_PARAMS / ECONOMY_PARAMS. Idempotent; Classic restores the defaults. */
export function applyRules (r) {
  const { damage: d, hunger: h, cost: c, fuel: f } = resolveRules(r)
  for (const k of ONSET_KEYS) write(DAMAGE_PARAMS, k, BASE.onset[k] * d.onset)
  for (const k of Object.keys(BASE.wearScale)) DAMAGE_PARAMS.wearScale[k] = BASE.wearScale[k] * d.wear
  DAMAGE_PARAMS.springEventCap = Math.min(BASE.springEventCap, d.cap)
  DAY_PARAMS.hungerOn = !h.off
  DAY_PARAMS.hungerGraceH = h.graceH
  DAY_PARAMS.hungryRate = 1 + (BASE.hungryRate - 1) * h.energy
  DAY_PARAMS.starvingRate = 1 + (BASE.starvingRate - 1) * h.energy
  ECONOMY_PARAMS.dayTierTable = dayTierCurve(c.growth)
  RANGER_PARAMS.fuelBurnScale = BASE.fuelBurnScale * f.burn
}

/** Rules `r` as the run shows them: 'damage low · hunger normal · cost low · endless on'. */
export const rulesLine = (r) => Object.entries(legalRules(r)).map(([row, lv]) => `${row} ${lv}`).join(' · ')

/** The debug panel's "Difficulty (FEAT-296)" folder: every [DEFAULT] number of a non-Classic level, live. A change calls
 *  `reapply` (main.js writes the rules in play again). */
export function addRulesGui (gui, reapply) {
  const f = gui.addFolder('Difficulty (FEAT-296)')
  const L = DIFFICULTY_ROWS
  f.add(L.damage.low, 'wear', 0, 1, 0.05).name('damage low: × wear').onChange(reapply)
  f.add(L.damage.low, 'onset', 1, 2, 0.05).name('damage low: × onsets').onChange(reapply)
  f.add(L.damage.low, 'cap', 0.005, 0.2, 0.005).name('damage low: bump cap').onChange(reapply)
  f.add(L.hunger.low, 'graceH', 0, 4, 0.25).name('hunger low: grace (h)').onChange(reapply)
  f.add(L.hunger.low, 'energy', 0, 1, 0.05).name('hunger low: × drain').onChange(reapply)
  f.add(L.cost.low, 'growth', 1, 1.065, 0.005).name('cost low: × per day').onChange(reapply)
  f.add(L.fuel.low, 'burn', 0, 1, 0.05).name('fuel low: × burn').onChange(reapply)
  f.close()
}
