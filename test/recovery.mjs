// test/recovery.mjs — SM-3 Recovery card gate.
//
//   1. Can't continue = dry with no gas can, or a dead engine. A flat alone is not.
//   2. Options fit the moment: gas can when dry and aboard; the spare on a flat (disabled with none);
//      the fuel tow only when dry; the service-center tow any time; each tow priced against the wallet.
//   3. End run only when stuck AND nothing on the card can be done.
//   4. fitSpare: the spare goes on the first flat corner with its wear, the flat is gone, and the
//      punctured tire is kept as a FLAT spare with its own wear; a flat spare is never fitted.
//
// Pure node: no THREE, no DOM.
import { recoveryCard, fitSpare } from '../src/recovery.js'
import { InventorySystem } from '../src/inventory.js'
import { DamageModel } from '../src/damage.js'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}
const tow = (price) => ({ price, km: 2, hours: 1 })
const base = { dry: false, gasCan: false, engineDead: false, flats: [], spare: false, money: 20, fuelTow: tow(14), shopTow: tow(16) }
const acts = (c) => c.opts.map(o => o.act + (o.enabled ? '' : '-')).join()

// ── 1–3. The card ─────────────────────────────────────────────────────────────────────────────
let c = recoveryCard(base)
check('a sound parked truck: roadside, not stuck, the shop tow only', c.head === 'roadside' && !c.stuck && acts(c) === 'towShop')
c = recoveryCard({ ...base, flats: [2] })
check('a flat is not stuck; no spare greys the option', c.head === 'flat tire' && !c.stuck && acts(c) === 'spare-,towShop')
c = recoveryCard({ ...base, dry: true, gasCan: true })
check('dry with a can: not stuck, can first, both tows', !c.stuck && acts(c) === 'gas,towFuel,towShop')
c = recoveryCard({ ...base, dry: true, money: 15 })
check('dry, no can: stuck, fuel tow affordable, shop tow not', c.stuck && acts(c) === 'towFuel,towShop-' && !c.canEnd)
c = recoveryCard({ ...base, dry: true, money: 5 })
check('dry and broke: the run can end', c.stuck && c.canEnd)
c = recoveryCard({ ...base, engineDead: true, money: 5, fuelTow: null, shopTow: null })
check('dead engine, no tow can reach: the run can end', c.head === "engine won't start" && c.canEnd)
c = recoveryCard({ ...base, flats: [0], money: 0 })
check('a flat and broke never ends the run', !c.canEnd)

// ── 4. fitSpare ───────────────────────────────────────────────────────────────────────────────
const damage = new DamageModel()
const inv = new InventorySystem({ slotCap: () => 8 })
inv.start()
check('nothing to do without a flat', fitSpare(damage, inv) === -1)
damage.flat[2] = true; damage.set('tireRL', 0.35)
check('nothing to do without a spare', fitSpare(damage, inv) === -1)
inv.grant('spareTire', 1, { cond: { tire: 0.9 } })
check('the spare goes on the flat corner', fitSpare(damage, inv) === 2)
check('…with its wear, and holds air', damage.get('tireRL') === 0.9 && !damage.flat[2])
const flatSpare = inv.list().filter(r => r.id === 'spareTire')
check('the punctured tire is kept as a flat spare with its wear',
  flatSpare.length === 1 && flatSpare[0].flat && flatSpare[0].cond.tire === 0.35)
damage.flat[0] = true
check('a flat spare is never fitted', fitSpare(damage, inv) === -1 && damage.flat[0])

console.log(fails ? `\n${fails} FAILED` : '\nrecovery gate: ALL OK')
process.exit(fails ? 1 : 0)
