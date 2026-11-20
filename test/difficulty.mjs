// GATE (FEAT-296, DEC-433): the difficulty rows — damage, hunger, cost scaling, endless — and the presets.
//
//   1. CLASSIC IS TODAY: applying Classic over pristine params changes nothing, and Classic after Casual / Zen / none
//      restores DAMAGE_PARAMS, DAY_PARAMS and ECONOMY_PARAMS bit-exactly (deep-equal to a clone taken before anything ran).
//   2. PER ROW, the resolved value moves the system's own output the stated way:
//      damage low — a bump-stop slam costs the spring less (and a hit just past today's floor costs nothing), the biggest
//      slam is capped, a worn tire needs a harder hit to pop, a rim strike that pops a tire today does not, wear is less;
//      hunger low — the hungry drain starts an hour later and costs half the extra energy, the word stays 'peckish';
//      cost low — the day-12 price multiplier is lower, day 1 is still 1;
//      endless — Zen's rules resolve endless on, Casual's and Classic's off.
//   3. THE PRESETS are the owner's table: Casual low/low/low/off on the Casual world, Zen low damage + low cost + endless
//      on and Classic otherwise, Classic medium/normal/medium/off; no preset uses damage none.
//   4. RUN STATE: the rules round-trip through the run save; a save without them, or with junk, reads as Classic.
//
// Run: node test/difficulty.mjs   (self-checking; exits non-zero on failure)

import { isDeepStrictEqual } from 'node:util'
import { DAMAGE_PARAMS, DamageModel, TIRE_IDS } from '../src/damage.js'
import { DAY_PARAMS, DaySystem } from '../src/day.js'
import { ECONOMY_PARAMS, dayTier } from '../src/economy.js'
import { DIFFICULTY_PRESETS, CLASSIC_RULES } from '../data/difficulty.js'
import { applyRules, resolveRules, legalRules } from '../src/difficulty.js'
import { putRun, loadRun } from '../src/save.js'

let failures = 0
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) failures++ }
const pristine = () => structuredClone({ d: DAMAGE_PARAMS, y: DAY_PARAMS, e: ECONOMY_PARAMS })
const P0 = pristine()
const { casual: CASUAL, zen: ZEN, classic: CLASSIC } = DIFFICULTY_PRESETS
const rulesOf = (p) => ({ damage: p.damage, hunger: p.hunger, cost: p.cost, endless: p.endless })
const NONE = { ...CLASSIC_RULES, damage: 'none' }

console.log('classic is today')
applyRules(CLASSIC_RULES)
check(isDeepStrictEqual(pristine(), P0), 'Classic over pristine params changes nothing')
for (const [name, r] of [['casual', rulesOf(CASUAL)], ['zen', rulesOf(ZEN)], ['damage none', NONE]]) {
  applyRules(r)
  const moved = !isDeepStrictEqual(pristine(), P0)
  applyRules(CLASSIC_RULES)
  check((name === 'damage none' || moved) && isDeepStrictEqual(pristine(), P0), `Classic after ${name} restores every param bit-exactly`)
}
applyRules(rulesOf(CASUAL)); const once = pristine(); applyRules(rulesOf(CASUAL))
check(isDeepStrictEqual(pristine(), once), 'applying is idempotent')
applyRules(CLASSIC_RULES)

console.log('damage')
const STATIC = 3300   // N, a corner's static load (the rim multipliers' unit)
function bump (rules, peakN, tireCond = 1) {
  applyRules(rules)
  const m = new DamageModel()
  m.set(TIRE_IDS[0], tireCond)
  m._landBumpStop(0, peakN, null)
  const out = { spring: 1 - m.get('springFront'), flat: m.flat[0], wear: 0, pinch: false }
  m.wear('brakeFront', 1e8, DAMAGE_PARAMS.durBrake)
  out.wear = 1 - m.get('brakeFront')
  const r = new DamageModel()
  r._landRimStrike(0, P0.d.rimPinchRoadMult * STATIC * 1.01, STATIC, true)   // just past today's pinch-flat force
  out.pinch = r.flat[0]
  applyRules(CLASSIC_RULES)
  return out
}
const LOW = { ...CLASSIC_RULES, damage: 'low' }
const slam = 60000, nearFloor = DAMAGE_PARAMS.springForceFloorFront * 1.1
const cM = bump(CLASSIC_RULES, slam), cL = bump(LOW, slam)
check(cL.spring < cM.spring && cM.spring > 0, `a 60 kN front slam costs the spring less (${(cM.spring * 100).toFixed(2)} % → ${(cL.spring * 100).toFixed(2)} %)`)
check(bump(CLASSIC_RULES, nearFloor).spring > 0 && bump(LOW, nearFloor).spring === 0, 'a hit just past today\'s bump-stop floor costs nothing on low (onset raised)')
const huge = 2e6, hM = bump(CLASSIC_RULES, huge), hL = bump(LOW, huge)
check(Math.abs(hL.spring - resolveRules(LOW).damage.cap * resolveRules(LOW).damage.wear) < 1e-12 && hM.spring > hL.spring,
  `the biggest slam is capped on low (${(hM.spring * 100).toFixed(1)} % → ${(hL.spring * 100).toFixed(1)} %)`)
const popN = 80000   // pops a 30 % tire today (puncture 72–84 kN between the knee and the half)
check(bump(CLASSIC_RULES, popN, 0.3).flat && !bump(LOW, popN, 0.3).flat, 'an 80 kN hit pops a 30 % tire today, not on low')
check(bump(CLASSIC_RULES, slam).pinch && !bump(LOW, slam).pinch, 'a road rim strike just past today\'s pinch-flat force pops the tire today, not on low')
check(Math.abs(cL.wear / cM.wear - resolveRules(LOW).damage.wear) < 1e-9, `wear is × ${resolveRules(LOW).damage.wear} on low`)
check(resolveRules(NONE).damage.off === true && !resolveRules(LOW).damage.off && !resolveRules(CLASSIC_RULES).damage.off, 'damage none resolves off (main.js holds the model), low and medium do not')

console.log('hunger')
function hunger (rules) {
  applyRules(rules)
  const d = new DaySystem({ setTimeOfDay () {} })
  let h = 100
  d.clockH = () => h
  d._fedUntilH = 100
  const at = (x) => { h = 100 + x; return { hungry: d.hungry(), word: d.hungerWord() } }
  const out = { half: at(0.5), late: at(1.5), cost: d._hungerCost(100, 106) }
  applyRules(CLASSIC_RULES)
  return out
}
const hN = hunger(CLASSIC_RULES), hLo = hunger({ ...CLASSIC_RULES, hunger: 'low' })
check(hN.half.hungry && hN.half.word === 'hungry' && !hLo.half.hungry && hLo.half.word === 'peckish', 'half an hour past empty: hungry today, peckish on low')
check(hLo.late.hungry && hLo.late.word === 'hungry', 'past the grace, low is hungry too (the word agrees)')
// Today, 6 h past empty: ramp over 4 h (×1.25 → ×1.5) then ×1.5 for 2 h → extra = 0.25·4 + 0.25·4/2 + 0.5·2 = 2.5 h.
// Low: 1 h grace, the extra halved over the 5 h left → 0.125·4 + 0.125·4/2 + 0.25·1 = 1.0 h.
check(Math.abs(hN.cost - 2.5) < 1e-9 && Math.abs(hLo.cost - 1.0) < 1e-9, `6 h past empty costs ${hN.cost} h of energy today, ${hLo.cost} h on low`)

console.log('cost')
const tier = (r, day) => { applyRules(r); const t = dayTier(day); applyRules(CLASSIC_RULES); return t }
const CL = { ...CLASSIC_RULES, cost: 'low' }
check(tier(CLASSIC_RULES, 12) === 2 && tier(CL, 12) < 1.5 && tier(CL, 12) > 1, `day 12 costs ×${tier(CLASSIC_RULES, 12)} today, ×${tier(CL, 12)} on low`)
check(tier(CL, 1) === 1 && tier(CLASSIC_RULES, 1) === 1, 'day 1 is the authored price on both')

console.log('endless and the presets')
check(resolveRules(rulesOf(ZEN)).endless.on && !resolveRules(rulesOf(CASUAL)).endless.on && !resolveRules(CLASSIC_RULES).endless.on, 'endless: Zen on, Casual and Classic off')
check(isDeepStrictEqual(CASUAL, { world: 'casual', damage: 'low', hunger: 'low', cost: 'low', endless: 'off' }), 'Casual: the Casual world, low damage / hunger / cost')
check(isDeepStrictEqual(ZEN, { world: 'classic', damage: 'low', hunger: 'normal', cost: 'low', endless: 'on' }), 'Zen: Classic but low damage, low cost, endless on')
check(isDeepStrictEqual(rulesOf(CLASSIC), CLASSIC_RULES) && CLASSIC.world === 'classic', 'Classic: today on every row')
check(Object.values(DIFFICULTY_PRESETS).every(p => p.damage !== 'none'), 'no preset uses damage none')

console.log('run state')
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) } }
const st = mem()
putRun({ seed: '6', rules: rulesOf(ZEN), endlessWon: true }, st)
const back = loadRun(st)
check(isDeepStrictEqual(legalRules(back.rules), rulesOf(ZEN)) && back.endlessWon === true, 'the rules and the endless flag round-trip through the run save')
check(isDeepStrictEqual(legalRules(undefined), CLASSIC_RULES), 'a save from before FEAT-296 reads as Classic')
check(isDeepStrictEqual(legalRules({ damage: 'brutal', hunger: 'low', cost: 7 }), { ...CLASSIC_RULES, hunger: 'low' }), 'unknown levels fall back to Classic row by row')

console.log(failures ? `\nFAIL — ${failures} check(s)` : '\nPASS')
process.exit(failures ? 1 : 0)
