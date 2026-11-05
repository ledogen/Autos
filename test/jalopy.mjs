// test/jalopy.mjs — SM-3 jalopy gate (owner rulings 2026-10-21).
//
//   1. Every track starts inside its class's range (alignment through the bent geometry's readout).
//   2. Only the ruled parts vary: tires standard or old, the front bar stock or gone; everything else
//      is the stock part — stock springs, shocks and brakes, the open diff, no lift.
//   3. Over many runs the rare branches all show up: an old tire, no front bar, a run with no spare.
//   4. The spare, when there is one, is in the inventory with its wear in range.
//   5. A seed is a truck: the same seed rolls the same jalopy.
//
// Pure node: no THREE, no DOM.
import { rollJalopy, JALOPY_COND, JALOPY_PARTS, JALOPY_SPARE } from '../src/jalopy.js'
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
    const allowed = JALOPY_PARTS[takes(s)] ? Object.keys(JALOPY_PARTS[takes(s)]) : [stockPart(s)]
    if (!allowed.includes(id)) { partsOk = false; badDetail = `${s} ${id} seed ${seed}` }
    seen.add(id)
  }
  if (j.spare) {
    spares++
    const [lo, hi] = JALOPY_SPARE.cond
    if (j.spare.cond < lo || j.spare.cond > hi) { spareOk = false; badDetail = JSON.stringify(j.spare) }
  }
}
check('1. every track starts inside its range', inRange, badDetail)
check('2. only the ruled parts vary; the rest is stock', partsOk, badDetail)
check('3. the rare branches show up: an old tire, no front bar, runs with and without a spare',
  seen.has('tireOld') && seen.has('arbFrontNone') && spares > 0 && spares < N, `spares ${spares}/${N}`)
check('   …a spare about as often as ruled', Math.abs(spares / N - JALOPY_SPARE.p) < 0.08, `${spares}/${N}`)
check('4. the spare is in the inventory with its wear in range', spareOk, badDetail)
check('5. the same seed rolls the same jalopy', JSON.stringify(roll(77)) === JSON.stringify(roll(77)))

console.log(fails ? `\n${fails} FAILED` : '\njalopy gate: ALL OK')
process.exit(fails ? 1 : 0)
