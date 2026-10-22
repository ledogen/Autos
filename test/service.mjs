// test/service.mjs — SM-3 service center gate (owner rulings 2026-10-20, repair rules 2026-10-22).
//
//   1. Repair targets: REPAIR_STEP multiples above the condition, up to REPAIR_CAP; nothing at or
//      above the cap; none for a replace-only class (tire, brake, filter, headlights); alignment only
//      straight. Quotes pro rata on the gap repaired, × the day tier; a part-priced class uses the
//      fitted part's price.
//   2. repair(): charges, sets the target (never past the cap), adds the labour hours; refuses a
//      target off the list; straightening zeroes the bent geometry; a wallet that can't cover it
//      changes nothing. The shop patches a flat: air back in, condition unchanged.
//   4. Buy & fit: charges the part, bolts it on new, adds the socket's labour; the old part waits on
//      the bench until sold (half price × condition) or kept (into inventory WITH its wear, and its
//      puncture); refitting the kept part from inventory brings that wear back, on any corner for a
//      tire. A flat tire won't go on. Closing with a part on the bench keeps it.
//   5. A massless stock part (no lift) leaves nothing on the bench.
//   6. A part in inventory follows the same rules: a flat tire is patched (wear kept), a worn one has
//      no repair; a worn spring pair is re-arched up to the cap.
//   7. A tire bought to carry goes into the inventory new.
//   8. A mounted pair (the spare, or the flat pair a roadside swap left) swaps with a corner's tire and
//      wheel for a tire's labour; the corner's pair takes its place, still mounted. A flat pair won't go on.
//
// Pure node: no THREE, no DOM.
import { ServiceCenter } from '../src/service.js'
import { PartsSystem } from '../src/parts.js'
import { DamageModel } from '../src/damage.js'
import { InventorySystem } from '../src/inventory.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { PARTS, SLOTS, REPAIRS, REPAIR_CAP, PATCH } from '../data/parts.js'
import { repairTargets } from '../src/service.js'

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

// ── 1. Targets and quotes ─────────────────────────────────────────────────────────────────────
check('targets: 5% steps above, up to the cap', repairTargets('spring', 0.43).join() === '0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8')
check('targets: on a step, the next one', repairTargets('engine', 0.5)[0] === 0.55)
check('targets: at or above the cap, nothing', repairTargets('engine', REPAIR_CAP).length === 0 && repairTargets('wheel', 0.95).length === 0)
check('replace-only classes never repair', ['tire', 'brake', 'filter', 'headlights'].every(c => repairTargets(c, 0.1).length === 0))
check('alignment goes only straight', repairTargets('alignment', 0.4).join() === '1' && repairTargets('alignment', 0.99).length === 0)
damage.set('engine', 0.5)
let q = svc.repairQuote('engine', 0.7)
check('engine 50 → 70%: a fifth of the price and hours', near(q.price, REPAIRS.engine.price * 0.2) && near(q.hours, REPAIRS.engine.hours * 0.2), JSON.stringify(q))
check('default quote runs to the cap', near(svc.repairQuote('engine').price, REPAIRS.engine.price * 0.3))
tier = 1.5
check('…× the day tier', near(svc.repairQuote('engine', 0.7).price, REPAIRS.engine.price * 0.2 * 1.5))
tier = 1
damage.set('springRear', 0)
check('a spring pair is priced off the fitted pair', near(svc.repairQuote('springRear', 0.8).price, PARTS.springsRearOEM.price * 0.8))
check('worn brakes: nothing to repair', (damage.set('brakeFront', 0.2), svc.targets('brakeFront').length === 0))

// ── 2. repair() ───────────────────────────────────────────────────────────────────────────────
wallet = 100; hours = 0
check('a target off the list is refused', !svc.repair('engine', 0.9) && !svc.repair('engine', 0.52) && wallet === 100)
check('repair engine to 70%', svc.repair('engine', 0.7) && damage.get('engine') === 0.7 && near(wallet, 100 - REPAIRS.engine.price * 0.2)
  && near(hours, REPAIRS.engine.hours * 0.2), `${wallet} ${hours}`)
svc.repair('engine')
check('…and on to the cap, never past it', near(damage.get('engine'), REPAIR_CAP) && svc.targets('engine').length === 0)
damage.flat[1] = true; damage.set('tireFR', 0.6); wallet = 100; hours = 0
check('the shop patches a flat: air back, wear kept', svc.patch('tireFR') && !damage.flat[1] && damage.get('tireFR') === 0.6
  && near(wallet, 100 - PATCH.price) && near(hours, PATCH.hours))
check('no flat, no patch', !svc.patch('tireFR'))
damage.set('alignFL', 0.4); damage.toeOffsetDeg[0] = 0.3; damage.camberOffsetDeg[0] = -1
svc.repair('alignFL', 1)
check('straighten: back to 100%, geometry zeroed', damage.get('alignFL') === 1 && damage.toeOffsetDeg[0] === 0 && damage.camberOffsetDeg[0] === 0)
wallet = 0.5; damage.set('radiator', 0)
check('can\'t afford: refused, nothing changes', !svc.repair('radiator', 0.8) && damage.get('radiator') === 0 && wallet === 0.5)
damage.setAll(1)

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
let owned = svc.ownedRepairRows()
const flat = owned.find(r => r.flat)
check('the flat tire in the inventory is on the list, to patch only', !!flat && flat.targets.length === 0, JSON.stringify(owned))
wallet = 100; hours = 0
check('patch it', svc.patchOwned(flat.index) && near(wallet, 100 - PATCH.price) && near(hours, PATCH.hours))
check('…holding air, wear kept', inventory.list()[flat.index].flat === false && inventory.list()[flat.index].cond === 0.3)
check('a worn tire isn\'t on the list', !svc.ownedRepairRows().some(r => r.index === flat.index))
inventory.grant('springsRearHD', 1, { cond: 0.4 })
owned = svc.ownedRepairRows()
const spr = owned.find(r => r.id === 'springsRearHD')
check('a worn spring pair is, up to the cap', spr?.targets.at(-1) === REPAIR_CAP)
wallet = 100
check('re-arch it to the cap: priced off the part', svc.repairOwned(spr.index, REPAIR_CAP) && near(wallet, 100 - PARTS.springsRearHD.price * 0.4)
  && near(inventory.list()[spr.index].cond, REPAIR_CAP))
inventory.take(spr.index)

// ── 7. A tire to carry ────────────────────────────────────────────────────────────────────────
wallet = 100
const spares = () => inventory.list().filter(r => r.id === 'spareTire').length
check('buy a spare to carry: charged, new, in the inventory', svc.buyToInventory('spareTire') && near(wallet, 100 - PARTS.spareTire.price)
  && spares() === 1 && inventory.list().find(r => r.id === 'spareTire').cond === 1)

// ── 8. Swapping a mounted pair ────────────────────────────────────────────────────────────────
svc.close(); inventory.start(); hours = 0
const sp = () => inventory.list().find(r => r.id === 'spareTire')
inventory.grant('spareTire', 1, { cond: 0.7, flat: true, tire: 'tireSport', wheel: 'wheelSteel', wheelCond: 0.5 })
check('a flat pair won\'t go on', !svc.swapPair(sp().index, 0))
inventory.amend(sp().index, { flat: false })
const was = { tire: parts.fitted('tireFL'), cond: damage.get('tireFL') }
check('swap the pair onto a corner: its tire, wear and wheel', svc.swapPair(sp().index, 0) && parts.fitted('tireFL') === 'tireSport'
  && damage.get('tireFL') === 0.7 && damage.get('wheelFL') === 0.5 && hours === SLOTS.tireFL.hours)
check('…and the corner\'s pair takes its place, mounted', sp().tire === was.tire && sp().cond === was.cond
  && sp().wheelCond === 1, JSON.stringify(sp()))

console.log(fails ? `\n${fails} FAILED` : '\nservice gate: ALL OK')
process.exit(fails ? 1 : 0)
