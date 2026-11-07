// test/service.mjs — SM-3 service center gate (owner rulings 2026-10-20, repair rules 2026-10-22).
//
//   1. Repair targets: REPAIR_STEP multiples above the condition, up to REPAIR_CAP; nothing at or
//      above the cap; none for a replace-only class (tire, brake, filter, headlights); alignment only
//      straight. Quotes pro rata on the gap repaired, × the day tier; a part-priced class uses the
//      fitted part's price.
//   2. repair(): charges, sets the target (never past the cap), adds the labour hours; refuses a
//      target off the list; straightening zeroes the bent geometry; a wallet that can't cover it
//      changes nothing. The shop patches a flat: air back in, condition unchanged.
//   3. Buy & fit off the shelf: priced by condition × tier, charges, empties the slot, bolts the part on
//      with its condition, adds the socket's labour; the old part goes straight into the inventory WITH
//      its wear and its puncture (owner 11-04: no sell / keep prompt) and sells from there (half price ×
//      condition); exchanging it back on brings that wear back, on any corner for a tire. A flat tire
//      won't go on.
//   4. The live preview: fit a shelf item for a look, revert EXACTLY (params, conditions, durability,
//      the fitted map, the flats); nothing charged or clocked; closing reverts too.
//   5. A massless stock part (no lift) puts nothing in the inventory.
//   6. A part in inventory follows the same rules: a flat tire is patched (wear kept), a worn one has
//      no repair; a worn spring pair is re-arched up to the cap.
//   7. A shelf item bought to carry goes into the inventory with its condition; a part you own sells
//      for half price × condition; only parts sell.
//   8. A mounted pair (the spare, or the flat pair a roadside swap left) swaps with a corner's tire and
//      wheel for two hub swaps; the corner's pair takes its place, still mounted. A flat pair won't go on.
//   1b. FEAT-162: a collapsed wheel (at 0) is scrap, never straightened; a seized engine (at 0) is rebuilt
//      only whole, to the cap, at SEIZED_REPAIR_X × the full-wear price.
//   9. Tire work is bead jobs and hub swaps (owner, 2026-10-23): a loose tire onto a corner is 2 hub +
//      2 bead, charged with the shelf price; split and combine are one bead job each, every part keeping
//      its wear and the tire its puncture; split needs a free slot; only a loose tire meets a loose wheel.
//
// Pure node: no THREE, no DOM.
import { ServiceCenter } from '../src/service.js'
import { PartsSystem } from '../src/parts.js'
import { DamageModel } from '../src/damage.js'
import { InventorySystem } from '../src/inventory.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { PARTS, SLOTS, REPAIRS, REPAIR_SETUP as SU, REPAIR_CAP, SEIZED_REPAIR_X, PATCH, BEAD, HUB } from '../data/parts.js'
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
// The shop's shelf (src/shop-stock.js in the game): set by hand here, one item per slot.
let shelf = []
const stock = (...items) => { shelf = items.map(([id, cond = 1]) => ({ id, cond: PARTS[id] ? cond : null, expiresAt: 1e9 })) }
const svc = new ServiceCenter({
  stock: () => shelf, unstock: (i) => { shelf[i] = null },
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
check('engine 50 → 70%: the setup, then a fifth of the price and hours', near(q.price, SU.price + REPAIRS.engine.price * 0.2) && near(q.hours, SU.hours + REPAIRS.engine.hours * 0.2), JSON.stringify(q))
check('default quote runs to the cap', near(svc.repairQuote('engine').price, SU.price + REPAIRS.engine.price * 0.3))
tier = 1.5
check('…× the day tier', near(svc.repairQuote('engine', 0.7).price, (SU.price + REPAIRS.engine.price * 0.2) * 1.5))
tier = 1
damage.set('springRear', 0)
check('a spring pair is priced off the fitted pair', near(svc.repairQuote('springRear', 0.8).price, SU.price + PARTS.springsOEM.price * 0.8))
check('worn brakes: nothing to repair', (damage.set('brakeFront', 0.2), svc.targets('brakeFront').length === 0))
check('a collapsed wheel is replaced, never straightened', repairTargets('wheel', 0).length === 0 && repairTargets('wheel', 0.01)[0] === 0.05)
damage.set('engine', 0)
check('a seized engine is rebuilt whole, to the cap, never a cheap first step', svc.targets('engine').join() === String(REPAIR_CAP))
check('a seized engine rebuilds at 3× the full-wear price', SEIZED_REPAIR_X === 3
  && near(svc.repairQuote('engine').price, (SU.price + REPAIRS.engine.price * REPAIR_CAP) * 3), JSON.stringify(svc.repairQuote('engine')))
damage.set('engine', 0.01)
check('…a hair above 0 is an ordinary rebuild', near(svc.repairQuote('engine', 0.05).price, SU.price + REPAIRS.engine.price * 0.04))
damage.set('engine', 0.5)

// ── 2. repair() ───────────────────────────────────────────────────────────────────────────────
wallet = 100; hours = 0
check('a target off the list is refused', !svc.repair('engine', 0.9) && !svc.repair('engine', 0.52) && wallet === 100)
check('repair engine to 70%', svc.repair('engine', 0.7) && damage.get('engine') === 0.7 && near(wallet, 100 - SU.price - REPAIRS.engine.price * 0.2)
  && near(hours, SU.hours + REPAIRS.engine.hours * 0.2), `${wallet} ${hours}`)
svc.repair('engine')
check('…and on to the cap, never past it', near(damage.get('engine'), REPAIR_CAP) && svc.targets('engine').length === 0)
damage.flat[1] = true; damage.set('tireFR', 0.6); wallet = 100; hours = 0
check('the shop patches a flat: air back, wear kept', svc.patch('tireFR') && !damage.flat[1] && damage.get('tireFR') === 0.6
  && near(wallet, 100 - PATCH.price) && near(hours, PATCH.hours))
check('no flat, no patch', !svc.patch('tireFR'))
// FEAT-167: alignment is ONE job for all four corners — a flat price, one setup plus each corner's gap.
check('straight: no alignment job', !svc.bent() && !svc.align())
damage.set('alignFL', 0.4); damage.toeOffsetDeg[0] = 0.3; damage.camberOffsetDeg[0] = -1
damage.set('alignRR', 0.9); damage.toeOffsetDeg[3] = 0.1
wallet = 100; hours = 0
check('a corner on its own is refused', !svc.repair('alignFL', 1) && wallet === 100)
check('align: one flat price, one setup + every gap', svc.align() && near(wallet, 100 - REPAIRS.alignment.price)
  && near(hours, SU.hours + REPAIRS.alignment.hours * (0.6 + 0.1)), `${wallet} ${hours}`)
check('…all four straight, geometry zeroed', ['alignFL', 'alignFR', 'alignRL', 'alignRR'].every(id => damage.get(id) === 1)
  && damage.toeOffsetDeg.every(x => x === 0) && damage.camberOffsetDeg.every(x => x === 0) && !svc.bent())
wallet = 0.5; damage.set('radiator', 0)
check('can\'t afford: refused, nothing changes', !svc.repair('radiator', 0.8) && damage.get('radiator') === 0 && wallet === 0.5)
damage.setAll(1)

// ── 3. Buy off the shelf, fit, sell / keep ────────────────────────────────────────────────────
wallet = 100; hours = 0
damage.set('damperRear', 0.2)
stock(['dampersHD'], ['tireSport', 0.5], ['tirePlugKit'])
check('a used part is priced by its condition, × tier', near(svc.shelfPrice(1), PARTS.tireSport.price * 0.5)
  && (tier = 2, near(svc.shelfPrice(1), PARTS.tireSport.price)) && (tier = 1) && svc.shelfPrice(2) > 0)
check('buy heavy-duty rear shocks, fitted for the shop\'s minimum charge', svc.buyAndFit(0, 'dampersRear') && near(wallet, 100 - PARTS.dampersHD.price - SU.price)
  && params.suspensionDampingRear === PARTS.dampersHD.patch.suspensionDampingRear && damage.get('damperRear') === 1)
check('…the slot is empty now', shelf[0] === null && !svc.buyAndFit(0, 'dampersRear'))
check('the socket\'s labour is on the clock', hours === 0.75, hours)
check('an exchange off the tires pays the minimum charge too, × tier', svc.fitLabour('springsHD', 'springsFront').price === SU.price
  && (tier = 2, svc.fitLabour('springsHD', 'springsFront').price === 2 * SU.price) && (tier = 1))
check('the air filter fits for a third of the minimum charge, in 15 min (owner, 2026-11-06)',
  svc.fitLabour('airFilterStock', 'airFilter').price === Math.round(SU.price / 3 * 100) / 100 && svc.fitLabour('airFilterStock', 'airFilter').hours === 0.25)
const oldShocks = inventory.list().find(r => r.id === 'dampersOEM')
check('the old shocks go straight into the inventory with their wear', !!oldShocks && oldShocks.cond === 0.2, JSON.stringify(oldShocks))
const before = wallet
check('…and sell from there for half price × condition', svc.sellOwned(oldShocks.index) && near(wallet - before, PARTS.dampersOEM.price * 0.5 * 0.2), wallet - before)

check('a tire needs a corner', !svc.buyAndFit(1, 'tire') && !svc.buyAndFit(1, 'wheelFL'))
damage.set('tireFL', 0.3); damage.flat[0] = true
check('a used tire goes on with its wear', svc.buyAndFit(1, 'tireFL') && damage.get('tireFL') === 0.5 && !damage.flat[0])
const kept = inventory.list().find(r => r.id === 'tireStandard')
check('the flat comes off and is kept, flat, with its wear', !!kept && kept.flat && kept.cond === 0.3, JSON.stringify(kept))
check('a flat tire won\'t go on', !svc.fitFromInventory(kept.index, 'tireRR') && !svc.exchangeOptions('tireRR').some(r => r.index === kept.index))
stock(['tireOld'], ['liftKit'], ['spareTire', 0.6], ['tirePlugKit'])
svc.buyAndFit(0, 'tireFL')
const idx = inventory.list().findIndex(r => r.id === 'tireSport')
check('the worn sport tire is in inventory', idx >= 0 && inventory.list()[idx].cond === 0.5 && !inventory.list()[idx].flat)
hours = 0
check('exchange: offered for any corner, fitted with its wear', svc.exchangeOptions('tireRR').some(r => r.index === idx)
  && !svc.exchangeOptions('wheelRR').some(r => r.index === idx) && svc.exchange(idx, 'tireRR')
  && parts.fitted('tireRR') === 'tireSport' && damage.get('tireRR') === 0.5 && !inventory.list().some(r => r.id === 'tireSport'))
check('…for 2 hub swaps and 2 bead jobs, the old tire into the inventory', near(hours, 2 * HUB.hours + 2 * BEAD.hours)
  && inventory.list().filter(r => r.id === 'tireStandard').length === 2)
svc.close()

// ── 4. The live preview ───────────────────────────────────────────────────────────────────────
// Fit a shelf item for a look, then revert: params, conditions, durability, the fitted map and the
// flats come back EXACTLY, and nothing is charged or clocked.
damage.flat[2] = true; damage.set('tireRL', 0.42)
const state = () => JSON.stringify([params, parts.snapshot(), wallet, hours, shelf])
const at = state()
check('preview the lift kit: it is on', svc.preview(1, 'lift') && parts.fitted('lift') === 'liftKit'
  && params.suspensionBodyOffsetFront === PARTS.liftKit.patch.suspensionBodyOffsetFront)
svc.unpreview()
check('…and off again, exactly', state() === at)
svc.preview(0, 'tireRL'); svc.preview(1, 'lift')
check('a tire on the worst corner, then another item: one at a time', parts.fitted('tireRL') !== 'tireOld' && parts.fitted('lift') === 'liftKit')
svc.close()
check('closing reverts the preview exactly', state() === at)
check('nothing to preview off an empty slot or the wrong socket', !svc.preview(5, 'lift') && !svc.preview(0, 'lift') && state() === at)
damage.flat[2] = false

// ── 5. Nothing comes off ──────────────────────────────────────────────────────────────────────
const carried = inventory.list().length
svc.buyAndFit(1, 'lift')
check('no lift puts nothing in the inventory', inventory.list().length === carried)

// ── 6. Repairing a part as its own item ───────────────────────────────────────────────────────
let owned = svc.ownedRepairRows()
const flat = owned.find(r => r.flat)
check('the flat tire in the inventory is on the list, to patch only', !!flat && flat.targets.length === 0, JSON.stringify(owned))
wallet = 100; hours = 0
check('patch it', svc.patchOwned(flat.index) && near(wallet, 100 - PATCH.price) && near(hours, PATCH.hours))
check('…holding air, wear kept', inventory.list()[flat.index].flat === false && inventory.list()[flat.index].cond === 0.3)
check('a worn tire isn\'t on the list', !svc.ownedRepairRows().some(r => r.index === flat.index))
inventory.grant('springsHD', 1, { cond: 0.4 })
owned = svc.ownedRepairRows()
const spr = owned.find(r => r.id === 'springsHD')
check('a worn spring pair is, up to the cap', spr?.targets.at(-1) === REPAIR_CAP)
wallet = 100; hours = 0
check('re-arch it to the cap: priced off the part', svc.repairOwned(spr.index, REPAIR_CAP) && near(wallet, 100 - SU.price - PARTS.springsHD.price * 0.4)
  && near(hours, REPAIRS.spring.hours * 0.4)   // off the truck: no access time
  && near(inventory.list()[spr.index].cond, REPAIR_CAP))
inventory.take(spr.index)

// ── 7. Off the shelf to carry; selling what you own ───────────────────────────────────────────
wallet = 100
const spares = () => inventory.list().filter(r => r.id === 'spareTire')
check('buy a used spare to carry: charged, worn, in the inventory', svc.buyToInventory(2) && near(wallet, 100 - (PARTS.tireStandard.price * 0.6 + PARTS.wheelSteel.price + BEAD.price))
  && spares().length === 1 && spares()[0].cond === 0.6 && shelf[2] === null)
check('a plug kit too: no condition', svc.buyToInventory(3) && inventory.list().some(r => r.id === 'tirePlugKit' && r.cond === null))
const sold = inventory.list().find(r => r.id === 'tireStandard')
wallet = 0
check('sell a part from the inventory: half price × condition', svc.sellOwned(sold.index) && near(wallet, PARTS.tireStandard.price * 0.5 * sold.cond))
check('a mounted tire sells as its tire plus its wheel', near(svc.ownedValue({ id: 'spareTire', tire: 'tireSport', cond: 0.5, wheel: 'wheelSteel', wheelCond: 0.25 }),
  PARTS.tireSport.price * 0.5 * 0.5 + PARTS.wheelSteel.price * 0.5 * 0.25))
check('only parts sell', !svc.sellOwned(inventory.list().find(r => r.id === 'tirePlugKit').index))

// ── 8. Swapping a mounted pair ────────────────────────────────────────────────────────────────
svc.close(); inventory.start(); hours = 0
const sp = () => inventory.list().find(r => r.id === 'spareTire')
inventory.grant('spareTire', 1, { cond: 0.7, flat: true, tire: 'tireSport', wheel: 'wheelSteel', wheelCond: 0.5 })
check('a flat pair won\'t go on', !svc.swapPair(sp().index, 0))
inventory.amend(sp().index, { flat: false })
const was = { tire: parts.fitted('tireFL'), cond: damage.get('tireFL') }
check('swap the pair onto a corner: its tire, wear and wheel', svc.swapPair(sp().index, 0) && parts.fitted('tireFL') === 'tireSport'
  && damage.get('tireFL') === 0.7 && damage.get('wheelFL') === 0.5 && near(hours, 2 * HUB.hours))
check('…and the corner\'s pair takes its place, mounted', sp().tire === was.tire && sp().cond === was.cond
  && sp().wheelCond === 1, JSON.stringify(sp()))

// ── 9. Bead jobs and hub swaps ────────────────────────────────────────────────────────────────
svc.close(); inventory.start(); wallet = 100; hours = 0
stock(['tireOffroad'])
check('buy & fit a tire: the part plus 2 hub + 2 bead', svc.buyAndFit(0, 'tireRL')
  && near(wallet, 100 - PARTS.tireOffroad.price - 2 * HUB.price - 2 * BEAD.price), wallet)
inventory.start(); wallet = 100; hours = 0
inventory.grant('spareTire', 1, { cond: 0.6, flat: true, tire: 'tireSport', wheel: 'wheelSteel', wheelCond: 0.4 })
check('split: a tire and a wheel, each with its wear, the puncture on the tire', svc.split(sp().index)
  && !sp() && inventory.list().some(r => r.id === 'tireSport' && r.cond === 0.6 && r.flat)
  && inventory.list().some(r => r.id === 'wheelSteel' && r.cond === 0.4)
  && near(wallet, 100 - BEAD.price) && near(hours, BEAD.hours), JSON.stringify(inventory.list()))
const ti = inventory.list().find(r => r.id === 'tireSport').index, wi = inventory.list().find(r => r.id === 'wheelSteel').index
check('a tire is offered the wheel, and only loose ones', svc.combineOptions(ti).map(r => r.index).join() === String(wi)
  && svc.combineOptions(wi).map(r => r.index).join() === String(ti))
check('combine: one mounted tire, both wears kept', svc.combine(wi, ti) && inventory.list().filter(r => r.kind === 'part').length === 1
  && sp()?.tire === 'tireSport' && sp().cond === 0.6 && sp().flat && sp().wheel === 'wheelSteel' && sp().wheelCond === 0.4
  && near(wallet, 100 - 2 * BEAD.price), JSON.stringify(inventory.list()))
check('a mounted tire combines with nothing', svc.combineOptions(sp().index).length === 0)
const full = new InventorySystem({ slotCap: () => inventory.slotsUsed() })   // the pack + the spare: no room
const tight = new ServiceCenter({ ...svc, inventory: full, off: null })
const si = full.list().findIndex(r => r.id === 'spareTire')
check('split needs a free slot', si >= 0 && !tight.split(si) && full.list()[si].id === 'spareTire', JSON.stringify(full.list().map(r => r.id)))

console.log(fails ? `\n${fails} FAILED` : '\nservice gate: ALL OK')
process.exit(fails ? 1 : 0)
