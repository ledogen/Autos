// test/jalopy.mjs — SM-3 jalopy gate (owner rulings 2026-10-21).
//
//   1. Every track starts inside its class's range (alignment through the bent geometry's readout).
//   2. Only the ruled parts vary: FEAT-325 (arc trial) four old tires and the four-cylinder, the front bar stock or
//      gone; everything else is the stock part — stock springs, shocks and brakes, the open diff, no lift.
//   3. Over many runs the rare branch shows up: no front bar.
//   4. Every run has the spare (FEAT-201), an old tire, in the inventory with its wear in range.
//   5. A seed is a truck: the same seed rolls the same jalopy.
//   6. FEAT-325 (arc trial, replacing FEAT-201's one old front tire): over 50 new games on RANDOM seeds — all four
//      tires old, the I4 fitted and its detuned curve on params; the old spare every time.
//
// Pure node: no THREE, no DOM.
import { rollJalopy, JALOPY_COND, JALOPY_PARTS, JALOPY_OLD_TIRES, JALOPY_ENGINE, JALOPY_SPARE } from '../src/jalopy.js'
import { PartsSystem } from '../src/parts.js'
import { DamageModel, TRACKS } from '../src/damage.js'
import { InventorySystem } from '../src/inventory.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { SLOTS, takes, stockPart } from '../data/parts.js'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}

function roll (seed) {
  const params = { ...RANGER_PARAMS }
  const damage = new DamageModel({ params })
  const parts = new PartsSystem({ params, damage })
  const inventory = new InventorySystem({ slotCap: () => 8 })
  parts.start(); inventory.start()
  rollJalopy({ parts, damage, inventory }, seed)
  return {
    cond: Object.fromEntries(Object.keys(TRACKS).map(id => [id, damage.get(id)])),
    fitted: Object.fromEntries(Object.keys(SLOTS).map(s => [s, parts.fitted(s)])),
    spare: inventory.list().find(r => r.id === 'spareTire') ?? null,
    engine: params.engine, peakNm: Math.max(...params.engineTorqueCurve.map(([, t]) => t)),
  }
}

const N = 400
let inRange = true, partsOk = true, spareOk = true, badDetail = ''
const seen = new Set()
let spares = 0
for (let seed = 1; seed <= N; seed++) {
  const j = roll(seed)
  for (const [id, c] of Object.entries(j.cond)) {
    // FEAT-166: the open diff has no clutch packs to wear; the track sits at new.
    const [lo, hi] = TRACKS[id].clutchOnly ? [1, 1] : JALOPY_COND[TRACKS[id].cls]
    if (c < lo - 1e-9 || c > hi + 1e-9) { inRange = false; badDetail = `${id} ${c} seed ${seed}` }
  }
  for (const [s, id] of Object.entries(j.fitted)) {
    const allowed = JALOPY_PARTS[takes(s)] ? Object.keys(JALOPY_PARTS[takes(s)])
      : JALOPY_OLD_TIRES.includes(s) ? ['tireOld'] : s === 'engine' ? [JALOPY_ENGINE] : [stockPart(s)]
    if (!allowed.includes(id)) { partsOk = false; badDetail = `${s} ${id} seed ${seed}` }
    seen.add(id === 'tireOld' ? `${s}:old` : id)
  }
  if (j.spare) {
    spares++
    const [lo, hi] = JALOPY_SPARE.cond
    if (j.spare.cond < lo || j.spare.cond > hi || j.spare.tire !== JALOPY_SPARE.tire) { spareOk = false; badDetail = JSON.stringify(j.spare) }
  }
}
check('1. every track starts inside its range', inRange, badDetail)
check('2. only the ruled parts vary; the rest is stock', partsOk, badDetail)
check('3. the rare branch shows up: no front bar', seen.has('arbFrontNone'))
check('4. every run has the old spare in the inventory, its wear in range', spareOk && spares === N, `spares ${spares}/${N} ${badDetail}`)
check('5. the same seed rolls the same jalopy', JSON.stringify(roll(77)) === JSON.stringify(roll(77)))

// 6. FEAT-201: new games on random seeds, as main.js rolls them (no default seed).
const seeds = Array.from({ length: 50 }, () => (Math.random() * 2 ** 32) >>> 0)
const bad = seeds.filter(seed => {
  const j = roll(seed)
  const old = ['tireFL', 'tireFR', 'tireRL', 'tireRR'].filter(s => j.fitted[s] === 'tireOld')
  return old.length !== 4 || j.engine !== 'duratec23' || Math.abs(j.peakNm - 209 * 0.9) > 0.01 || j.spare?.tire !== 'tireOld'
})
check('6. FEAT-325: 50 random new games — four old tires, the I4 at 188 N·m peak, an old spare every time', !bad.length,
  `seeds ${bad.join(', ')}`)

console.log(fails ? `\n${fails} FAILED` : '\njalopy gate: ALL OK')
process.exit(fails ? 1 : 0)
