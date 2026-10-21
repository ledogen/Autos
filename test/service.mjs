// test/service.mjs — SM-3 service center gate (owner rulings 2026-10-20).
//
//   1. Repair quotes: pro rata on the missing condition, × the day tier; a part-priced class shares the
//      fitted part's price across its slot's tracks; a sound track quotes nothing.
//   2. repair(): charges, restores to 100%, adds the labour hours; a flat is re-aired and a bent wheel's
//      alignment straightened; a wallet that can't cover it changes nothing.
//   3. repairAll(): all or nothing.
//   4. Buy & fit: charges the part, bolts it on new, adds the socket's labour; the old part waits on
//      the bench until sold (half price × condition) or kept (into inventory WITH its wear, and its
//      puncture); refitting the kept part from inventory brings that wear back, on any corner for a
//      tire. A flat tire won't go on. Closing with a part on the bench keeps it.
//   5. A massless stock part (no lift) leaves nothing on the bench.
//   6. A part in inventory is repaired as its own item: a flat tire patched and renewed, for money
//      and hours; a sound one has nothing to repair.
//
// Pure node: no THREE, no DOM.
import { ServiceCenter } from '../src/service.js'
import { PartsSystem } from '../src/parts.js'
import { DamageModel } from '../src/damage.js'
import { InventorySystem } from '../src/inventory.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { PARTS, REPAIRS } from '../data/parts.js'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}
const near = (a, b) => Math.abs(a - b) < 1e-9

const params = { ...RANGER_PARAMS }
const damage = new DamageModel({ params })
const parts = new PartsSystem({ params, damage })
const inventory = new InventorySystem({ slotCap: () => 8 })
let wallet = 100, hours = 0, tier = 1
const svc = new ServiceCenter({
  damage, parts, inventory, tier: () => tier,
  money: () => wallet,
  spend: ($) => { if ($ > wallet + 1e-9) return false; wallet -= $; return true },
  earn: ($) => { wallet += $ },
  advanceHours: (h) => { hours += h },
})
parts.start(); inventory.start()

// ── 1. Quotes ─────────────────────────────────────────────────────────────────────────────────
check('a sound truck needs nothing', svc.repairRows().length === 0)
damage.set('tireRL', 0.99)
check('a hair of wear is not a repair line', svc.repairRows().length === 0)
damage.set('engine', 0.5)
let q = svc.repairQuote('engine')
check('engine at half: half the price and hours', near(q.price, REPAIRS.engine.price / 2) && near(q.hours, REPAIRS.engine.hours / 2), JSON.stringify(q))
tier = 1.5
check('…× the day tier', near(svc.repairQuote('engine').price, REPAIRS.engine.price / 2 * 1.5))
tier = 1
damage.set('springRear', 0)
check('a spring pair costs the fitted pair', near(svc.repairQuote('springRear').price, PARTS.springsRearOEM.price))

// ── 2. repair() ───────────────────────────────────────────────────────────────────────────────
wallet = 100; hours = 0
check('repair engine', svc.repair('engine') && damage.get('engine') === 1 && near(wallet, 100 - REPAIRS.engine.price / 2)
  && near(hours, REPAIRS.engine.hours / 2), `${wallet} ${hours}`)
damage.flat[1] = true
check('a flat on fresh rubber still quotes', svc.repairQuote('tireFR').price > 0)
svc.repair('tireFR')
check('repair re-airs the tire', !damage.flat[1] && damage.get('tireFR') === 1)
damage.set('alignFL', 0.4); damage.toeOffsetDeg[0] = 0.3; damage.camberOffsetDeg[0] = -1
svc.repair('alignFL')
check('repair straightens the wheel', damage.toeOffsetDeg[0] === 0 && damage.camberOffsetDeg[0] === 0)
wallet = 0.5; damage.set('radiator', 0)
check('can\'t afford: refused, nothing changes', !svc.repair('radiator') && damage.get('radiator') === 0 && wallet === 0.5)

// ── 3. repairAll() ────────────────────────────────────────────────────────────────────────────
const all = svc.repairAllQuote()
check('repair all refused short of the total', !svc.repairAll() && damage.get('radiator') === 0)
wallet = all.price + 1
check('repair all, all of it', svc.repairAll() && svc.repairRows().length === 0 && near(wallet, 1), wallet)

// ── 4. Buy, fit, sell / keep ──────────────────────────────────────────────────────────────────
wallet = 100; hours = 0
damage.set('damperRear', 0.2)
check('buy heavy-duty rear shocks', svc.buyAndFit('dampersRearHD') && near(wallet, 100 - PARTS.dampersRearHD.price)
  && params.suspensionDampingRear === PARTS.dampersRearHD.patch.suspensionDampingRear && damage.get('damperRear') === 1)
check('the socket\'s labour is on the clock', hours === 0.75, hours)
check('the old shocks wait on the bench with their wear', svc.off?.id === 'dampersRearOEM' && svc.off.cond === 0.2)
check('no second swap while one waits', !svc.buyAndFit('tireSport', 'tireFL'))
const before = wallet
svc.settleOff('sell')
check('sold for half price × condition', near(wallet - before, PARTS.dampersRearOEM.price * 0.5 * 0.2), wallet - before)

check('a tire needs a corner', !svc.buyAndFit('tireSport'))
damage.set('tireFL', 0.3); damage.flat[0] = true
svc.buyAndFit('tireSport', 'tireFL')
svc.settleOff('keep')
const kept = inventory.list().find(r => r.id === 'tireStandard')
check('the flat comes off and is kept, flat, with its wear', !!kept && kept.flat && kept.cond === 0.3, JSON.stringify(kept))
check('a flat tire won\'t go on', !svc.fitFromInventory(kept.index, 'tireRR'))
damage.set('tireFL', 0.6)
svc.buyAndFit('tireOld', 'tireFL'); svc.settleOff('keep')
const idx = inventory.list().findIndex(r => r.id === 'tireSport')
check('the worn sport tire is in inventory', idx >= 0 && inventory.list()[idx].cond === 0.6 && !inventory.list()[idx].flat)
svc.fitFromInventory(idx, 'tireRR')
check('refit on another corner brings the wear back', parts.fitted('tireRR') === 'tireSport' && damage.get('tireRR') === 0.6
  && !inventory.list().some(r => r.id === 'tireSport'))
svc.close()
check('closing with a part on the bench keeps it', !svc.off && inventory.list().filter(r => r.id === 'tireStandard').length === 2)

// ── 5. Nothing to bench ───────────────────────────────────────────────────────────────────────
svc.buyAndFit('liftKit')
check('no lift leaves nothing on the bench', svc.off === null)

// ── 6. Repairing a part as its own item ───────────────────────────────────────────────────────
const owned = svc.ownedRepairRows()
const flat = owned.find(r => r.flat)
check('the flat tire in the bed is on the list', !!flat && flat.price > 0, JSON.stringify(owned))
wallet = 100; hours = 0
check('repair it', svc.repairOwned(flat.index) && near(wallet, 100 - flat.price) && near(hours, flat.hours))
check('…it comes back new and holding air', inventory.list().some(r => r.id === 'tireStandard' && r.cond === 1 && !r.flat))
check('a part with nothing missing isn\'t on the list', svc.ownedRepairRows().every(r => r.cond < 1 || r.flat))


// ── 7. A tire to carry ────────────────────────────────────────────────────────────────────────
wallet = 100
const spares = () => inventory.list().filter(r => r.id === 'spareTire').length
check('buy a spare to carry: charged, new, in the bed', svc.buyToBed('spareTire') && near(wallet, 100 - PARTS.spareTire.price)
  && spares() === 1 && inventory.list().find(r => r.id === 'spareTire').cond === 1)

console.log(fails ? `\n${fails} FAILED` : '\nservice gate: ALL OK')
process.exit(fails ? 1 : 0)
