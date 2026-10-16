// test/load-verdict.mjs — FEAT-112 gate: fits / warning / overload, for the truck as configured.
//
//   1. WEIGHT  concrete (670), cinder blocks (785), four drums (804) warn on the stock Ranger with the
//              soft-limit message; an 830 kg fixture is "too heavy"; every other posted load fits —
//              except the railway ties, which overhang the gate 0.86 m (owner 2026-10-16: a warning).
//   2. LENGTH  a 12 ft board is too long for the bed; an 8 ft board overhangs it, and is too long in a car.
//   3. FORM    a loose load spills off an open deck; a load wider than the walls is too wide.
//   4. PARTS   the weakest part sets the limits: heavy-duty springs alone move nothing, the package does.
//   5. DATA    every posted bed load has a form and a measured model size.
//   6. SM-INV-12  the board is the same whatever truck its cards were drawn for.
//   7. TIRES   below the 600 kg onset a fresh tire cannot pop; past it the cap rides the ramp.

import { truckConfig, loadVerdict, tireCondCap, SOFT_WEIGHT_TEXT } from '../src/load-verdict.js'
import { DEFAULT_VEHICLE_MODEL } from '../data/vehicle-models.js'
import { FREIGHT } from '../data/freight.js'
import { PROP_MODELS } from '../data/prop-models.js'
import { THINGS } from '../data/offers.js'
import { OfferBoard } from '../src/offer-board.js'
import { DamageModel } from '../src/damage.js'

let fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }

const STOCK = truckConfig(DEFAULT_VEHICLE_MODEL)
const cargoOf = (key) => ({ massKg: FREIGHT[key].massKg, size: PROP_MODELS[FREIGHT[key].model].collision.size, form: FREIGHT[key].form })
const v = (cfg, cargo) => loadVerdict(cfg, cargo)
const texts = (r) => r.reasons.map(x => x.text).join(', ')
const board = (lenM) => ({ massKg: 20, size: [0.15, 0.05, lenM], form: 'long' })

console.log('§1 weight, on the stock Ranger')
ok(Math.abs(STOCK.lengthM - 1.8355) < 1e-9 && Math.abs(STOCK.widthM - 1.40) < 1e-9, `bed ${STOCK.lengthM.toFixed(3)} × ${STOCK.widthM.toFixed(2)} m, off the collider`)
for (const k of ['concretePallet', 'cinderBlockPallet', 'drumStack']) {
  const r = v(STOCK, cargoOf(k))
  ok(r.verdict === 'warning' && r.reasons[0].text === SOFT_WEIGHT_TEXT, `${k} (${FREIGHT[k].massKg} kg): ${r.verdict} — ${texts(r)}`)
}
{
  const r = v(STOCK, { ...cargoOf('cinderBlockPallet'), massKg: 830 })
  ok(r.verdict === 'overload' && r.reasons[0].text === 'too heavy', `830 kg fixture: ${r.verdict} — ${texts(r)}`)
}
const POSTED = [...new Set(THINGS.map(t => t.load).filter(Boolean))]
{
  const ties = v(STOCK, cargoOf('railwayTies'))
  ok(ties.verdict === 'warning' && texts(ties) === 'overhangs', `railway ties: ${ties.verdict} — ${texts(ties)}`)
  const odd = POSTED.filter(k => !['concretePallet', 'cinderBlockPallet', 'railwayTies'].includes(k))
    .filter(k => v(STOCK, cargoOf(k)).verdict !== 'fits')
  ok(odd.length === 0, `every other posted load fits (${POSTED.length - 3} loads)${odd.length ? ' — not: ' + odd.join(', ') : ''}`)
}

console.log('§2 length')
const CAR = { ...STOCK, lengthM: 1.0, widthM: 1.0, containment: 'enclosed', overhangMaxM: 0 }   // a trunk + folded seat
ok(v(STOCK, board(3.66)).verdict === 'overload' && texts(v(STOCK, board(3.66))) === 'too long', '12 ft board in the bed: overload, too long')
ok(v(STOCK, board(2.44)).verdict === 'warning' && texts(v(STOCK, board(2.44))) === 'overhangs', '8 ft board in the bed: warning, overhangs')
ok(v(CAR, board(2.44)).verdict === 'overload' && texts(v(CAR, board(2.44))) === 'too long', '8 ft board in a car: overload, too long')

console.log('§3 form and width')
const OPEN = { ...STOCK, containment: 'open' }
const bundle = { massKg: 165, size: PROP_MODELS.firewoodBundleA.collision.size, form: 'loose' }
ok(v(STOCK, bundle).verdict === 'fits', 'loose firewood in the walled bed: fits')
ok(v(OPEN, bundle).verdict === 'warning' && texts(v(OPEN, bundle)) === 'will spill', 'loose firewood on an open deck: warning, will spill')
ok(v(STOCK, { massKg: 50, size: [1.45, 0.5, 1.0], form: 'boxed' }).verdict === 'overload', '1.45 m wide in a 1.40 m bed: overload, too wide')
{
  const r = v(STOCK, { massKg: 900, size: [0.2, 0.2, 3.0], form: 'long' })
  ok(r.verdict === 'overload' && r.reasons.length === 2, `worst reason first, all kept: ${texts(r)}`)
}

console.log('§4 the weakest part sets the limits')
const HD = { softKg: 750, hardKg: 1000 }
const springs = { apply: c => ({ ...c, springs: HD }) }
const dampers = { apply: c => ({ ...c, dampers: HD }) }
const ltTires = { apply: c => ({ ...c, tires: { ...HD, popKg: 800 } }) }
ok(v(truckConfig(DEFAULT_VEHICLE_MODEL, [springs]), cargoOf('concretePallet')).verdict === 'warning', 'heavy-duty springs alone: concrete still warns')
ok(v(truckConfig(DEFAULT_VEHICLE_MODEL, [springs, dampers, ltTires]), cargoOf('concretePallet')).verdict === 'fits', 'springs + dampers + LT tires: concrete fits')
ok(STOCK.springs.softKg === 570, 'folding upgrades never mutates the stock config')

console.log('§5 data')
{
  const bad = POSTED.filter(k => !FREIGHT[k] || !['boxed', 'loose', 'long'].includes(FREIGHT[k].form)
    || !(PROP_MODELS[FREIGHT[k].model]?.collision?.size?.length === 3))
  ok(bad.length === 0, `every posted bed load has a form and a model size${bad.length ? ' — missing: ' + bad.join(', ') : ''}`)
}

console.log('§6 SM-INV-12: the verdict never feeds the roll')
{
  const POIS = [
    { id: 'poi:1|2', type: 'generalStore' }, { id: 'poi:3|4', type: 'workSite' }, { id: 'poi:5|6', type: 'farm' },
    { id: 'poi:7|8', type: 'firewoodYard' }, { id: 'poi:9|10', type: 'residence', modelKey: 'trailerHomeA' },
    { id: 'poi:11|12', type: 'gasStation' }, { id: 'poi:13|14', type: 'autoShop' },
  ]
  const dump = (b) => b.sources().map(id => b.offers(id, 6).map(o => JSON.stringify(b.spec(o))).join(';')).join('\n')
  const ref = dump(new OfferBoard({ seed: 11, pois: POIS, nowH: 6 }))
  const drawn = (cfg) => {
    const b = new OfferBoard({ seed: 11, pois: POIS, nowH: 6 })
    for (const id of b.sources()) for (const o of b.offers(id, 6)) {
      const row = FREIGHT[b.spec(o)?.load]
      b.card(o, { nowH: 6, verdict: row ? loadVerdict(cfg, cargoOf(b.spec(o).load)) : null })
    }
    return dump(b)
  }
  ok(drawn(STOCK) === ref && drawn(CAR) === ref, 'same seed → the same board, cards drawn for the Ranger or a car')
}

console.log('§7 overloaded tires')
{
  const d = new DamageModel({ params: { engineIdleRPM: 750, engineRedlineRPM: 5500 } })
  const kN = (m) => d.punctureThreshold(Math.min(1, tireCondCap(STOCK, m))) / 1000
  ok(kN(0) === Infinity && kN(570) === Infinity && kN(600) === Infinity, '≤ 600 kg: a fresh tire cannot pop')
  ok(tireCondCap(STOCK, 601) <= 0.5 && isFinite(kN(601)), 'past 600 kg it reads as a ≤ 50 % tire and can')
  for (const [m, want] of [[670, 78], [785, 48], [804, 38]]) {
    ok(Math.abs(kN(m) - want) < 1.5, `${m} kg: pops a fresh tire at ${kN(m).toFixed(1)} kN (ticket ~${want})`)
  }
  ok(tireCondCap(STOCK, 2000) === 0.10, 'past the hard cap it holds at 10 %')
  ok(tireCondCap(truckConfig(DEFAULT_VEHICLE_MODEL, [ltTires]), 785) === 1, 'LT tires move the onset: 785 kg reads fresh')
}

console.log(fail ? '\nFAIL' : '\nPASS')
process.exit(fail)
