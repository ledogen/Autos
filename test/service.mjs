// test/service.mjs — SM-3 service center gate (owner rulings 2026-10-20, repair rules 2026-10-22).
//
//   1. Repair targets: REPAIR_STEP multiples above the condition, up to REPAIR_CAP; nothing at or
//      above the cap; none for a replace-only class (tire, brake, filter, headlights); alignment only
//      straight. Quotes pro rata on the gap repaired, × the day tier; a part-priced class uses the
//      fitted part's price.
//   2. repair(): charges, sets the target (never past the cap), adds the labour hours; refuses a
//      target off the list; straightening zeroes the bent geometry; a wallet that can't cover it
//      changes nothing. The shop patches a flat: air back in, condition unchanged.
//   3. Buy & fit off the shelf: priced by condition × tier (buyQuote, the Shop tab's price and hours), charges, empties the slot, bolts the part on
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
//  11. FEAT-202: the oil change — a flat price × tier, straight back to new oil, its hours on the clock; no
//      job on new oil or past the wallet. A run save written before the oil track loads with new oil.
//  10. FEAT-196: a corner swap trades two corners' mounted pairs (each part's wear, the puncture with its tire) for
//      four hub swaps; a mounted pair's wheel in the inventory is straightened on the bench, still mounted.
//  12. FEAT-212: the cart — queued jobs show on the truck at once and pay at checkout exactly what they cost one by one,
//      once, the clock run once; discard is exact; taking a line out replays the rest (a line that needed it comes out
//      too); short of the wallet the jobs queue and checkout waits; the free repair and mom's tire are used once.
//
// Pure node: no THREE, no DOM.
import { ServiceCenter } from '../src/service.js'
import { PartsSystem } from '../src/parts.js'
import { DamageModel } from '../src/damage.js'
import { InventorySystem } from '../src/inventory.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { PARTS, SLOTS, REPAIRS, REPAIR_SETUP as SU, REPAIR_CAP, SEIZED_REPAIR_X, PATCH, OIL_CHANGE, BEAD, HUB } from '../data/parts.js'
import { repairTargets } from '../src/service.js'
import { worstUnder } from '../src/service-screen.js'
import { applyRules } from '../src/difficulty.js'
import { CLASSIC_RULES } from '../data/difficulty.js'
import { dayTier } from '../src/economy.js'

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
check('a spring pair is priced at the spring rate (FEAT-285)', near(svc.repairQuote('springRear', 0.8).price, SU.price + REPAIRS.spring.price * 0.8))
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
check('FEAT-212: the Shop tab\'s quotes — to carry is the shelf price in no time; fitted adds the fitting\'s price and hours',
  near(svc.buyQuote(0).price, PARTS.dampersHD.price) && svc.buyQuote(0).hours === 0
  && near(svc.buyQuote(0, 'dampersRear').price, PARTS.dampersHD.price + SU.price) && svc.buyQuote(0, 'dampersRear').hours === 0.75)
check('buy heavy-duty rear shocks, fitted for the shop\'s minimum charge', svc.buyAndFit(0, 'dampersRear') && near(wallet, 100 - PARTS.dampersHD.price - SU.price)
  && params.suspensionDampingRear === PARTS.dampersHD.patch.suspensionDampingRear && damage.get('damperRear') === 1)
check('…the slot is empty now', shelf[0] === null && !svc.buyAndFit(0, 'dampersRear'))
check('the socket\'s labour is on the clock', hours === 0.75, hours)
// BUG-213 / FEAT-285: the labour (the setup charge) scales with the tier exactly as the part does; a spring or damper rebuild's part rate is $4.
check('FEAT-285: spring and damper repair rate $4; labour and part both ride the tier (BUG-213)', REPAIRS.spring.price === 4 && REPAIRS.damper.price === 4
  && [1, 2].every(t => (tier = t, near(svc.fitLabour('springsHD', 'springsFront').price, SU.price * t)
    && near(svc.repairQuote('springFront', 1, 0.5).price, (SU.price + 4 * 0.5) * t))) && (tier = 1))
check('an exchange off the tires pays the minimum charge too, × tier', svc.fitLabour('springsHD', 'springsFront').price === SU.price
  && (tier = 2, svc.fitLabour('springsHD', 'springsFront').price === 2 * SU.price) && (tier = 1))
check('the air filter fits for a third of the minimum charge, in 15 min (owner, 2026-11-06)',
  svc.fitLabour('airFilterStock', 'airFilter').price === Math.round(SU.price / 3 * 100) / 100 && svc.fitLabour('airFilterStock', 'airFilter').hours === 0.25)
// BUG-213 / DEC-475: labour rides the difficulty's cost row exactly as the part does, "off" included (day 12 = day 1).
{
  const labour = () => [svc.fitLabour('springsHD', 'springsFront').price, svc.fitLabour('airFilterStock', 'airFilter').price,
    svc.beadQuote().price, svc.oilQuote().price], part = () => svc.sellValue('dampersOEM')
  const at = (lv, day) => { applyRules({ ...CLASSIC_RULES, cost: lv }); tier = dayTier(day); return { l: labour(), p: part(), t: tier } }
  const rows = ['off', 'low', 'normal'].map(lv => ({ lv, d1: at(lv, 1), d12: at(lv, 12) }))
  applyRules(CLASSIC_RULES); tier = 1
  for (const r of rows) console.log(`  cost ${r.lv}: tier day12 ${r.d12.t}; labour day1 ${r.d1.l} → day12 ${r.d12.l}; part ${r.d1.p} → ${r.d12.p}`)
  check('BUG-213: every labour line scales day 1 → day 12 by the same ratio as the part, per cost level; "off" holds day-1 prices',
    rows.every(r => r.d12.l.every((x, i) => Math.abs(x / r.d1.l[i] / (r.d12.p / r.d1.p) - 1) < 0.02))
    && rows[0].d12.l.every((x, i) => x === rows[0].d1.l[i]) && rows[2].d12.t > rows[1].d12.t && rows[1].d12.t > 1)
}
{
  const w0 = wallet, h0 = hours
  damage.set('oil', 0.3); tier = 2
  check('FEAT-202: the oil change is a flat price × tier, its hours on the clock, straight to new oil',
    near(svc.oilQuote().price, OIL_CHANGE.price * 2) && svc.changeOil() && damage.get('oil') === 1
    && near(w0 - wallet, OIL_CHANGE.price * 2) && near(hours - h0, OIL_CHANGE.hours))
  tier = 1
  const w1 = wallet; wallet = OIL_CHANGE.price - 0.01; damage.set('oil', 0.3)
  check('…no job on new oil, nor past the wallet', !svc.changeOil() && damage.get('oil') === 0.3 && (damage.set('oil', 1), wallet = w1, !svc.changeOil()) && wallet === w1)
  const snap = parts.snapshot(); delete snap.condition.oil; damage.set('oil', 0.2); parts.restore(snap)
  check('…and a save from before the oil track loads with new oil', damage.get('oil') === 1)
}
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
check('re-arch it to the cap: priced at the spring rate (FEAT-285)', svc.repairOwned(spr.index, REPAIR_CAP) && near(wallet, 100 - SU.price - REPAIRS.spring.price * 0.4)
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

// ── 10. FEAT-196: corner swap at the shop, and a mounted pair's wheel on the bench ───────────────
{
    damage.setAll(1); damage.flat.fill(false)
    damage.set('tireFL', 0.3); damage.flat[0] = true; damage.set('wheelFL', 0.5); damage.set('tireRR', 0.9)
    const fl = parts.fitted('tireFL'), rr = parts.fitted('tireRR')
    wallet = 100; hours = 0
    check('a corner swap is four hub swaps', near(svc.cornerSwapQuote().price, 4 * HUB.price) && near(svc.cornerSwapQuote().hours, 4 * HUB.hours))
    check('a corner can\'t swap with itself', !svc.swapCorners(0, 0) && wallet === 100)
    check('swap FL ↔ RR: tire and wheel move with their wear, the flat with its tire', svc.swapCorners(0, 3)
      && near(damage.get('tireRR'), 0.3) && damage.flat[3] && near(damage.get('wheelRR'), 0.5) && near(damage.get('tireFL'), 0.9) && !damage.flat[0]
      && parts.fitted('tireRR') === fl && parts.fitted('tireFL') === rr && near(wallet, 100 - 4 * HUB.price) && near(hours, 4 * HUB.hours),
      JSON.stringify({ rr: damage.get('tireRR'), fl: damage.get('tireFL'), w: wallet, h: hours }))
    wallet = 0
    check('…refused short of the wallet', !svc.swapCorners(0, 3) && near(damage.get('tireRR'), 0.3))
    damage.setAll(1); damage.flat.fill(false)

    inventory.grant('spareTire', 1, { cond: 0.7, wheelCond: 0.4 })
    const mi = inventory.list().findLastIndex(r => r.id === 'spareTire' && r.wheelCond === 0.4)
    check('a mounted pair\'s wheel has the bench\'s targets', svc.ownedWheelTargets(mi).join() === '0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8', String(svc.ownedWheelTargets(mi)))
    wallet = 100; hours = 0
    const wq = svc.ownedQuote(mi, 0.8, true)
    check('…priced as a wheel off the truck (the charge, no access time)', near(wq.price, SU.price + REPAIRS.wheel.price * 0.4) && near(wq.hours, REPAIRS.wheel.hours * 0.4), JSON.stringify(wq))
    check('…straightened, still mounted, the tire untouched', svc.repairOwned(mi, 0.8, true) && inventory.list()[mi].id === 'spareTire'
      && near(inventory.list()[mi].wheelCond, 0.8) && near(inventory.list()[mi].cond, 0.7) && near(wallet, 100 - wq.price) && near(hours, wq.hours),
      JSON.stringify(inventory.list()[mi]))
    check('…a target off the list is refused', !svc.repairOwned(mi, 0.9, true))
    inventory.amend(mi, { wheelCond: 0 })
    check('…a collapsed one is scrap', svc.ownedWheelTargets(mi).length === 0)
    inventory.take(mi)
}

// expedition-rewards option 2: the crew's line owes one repair — $0 while it is held, the labour still on the clock, one use.
{
    let owed = 1, w = 100, h = 0
    const dm = damage
    const free = new ServiceCenter({ ...svc, money: () => w, spend: ($) => { if ($ > w + 1e-9) return false; w -= $; return true },
        advanceHours: (x) => { h += x }, freeRepairs: () => owed, useFreeRepair: () => { owed-- } })
    dm.set('engine', 0.5)
    const fq = free.repairQuote('engine', 0.7)
    check('a free repair quotes $0 and keeps its hours', fq.price === 0 && fq.hours > 0, JSON.stringify(fq))
    check('…the repair takes nothing from the wallet and uses it up', free.repair('engine', 0.7) && w === 100 && owed === 0 && h > 0)
    dm.set('engine', 0.5)
    check('…and the next one is paid again', free.repairQuote('engine', 0.7).price > 0)
}

// FEAT-184 (DEC-151): the tutorial's tire is on mom — the part once, its fitting once; the next of each is paid.
{
    let w = 0
    const owes = { part: true, labour: true }
    const mom = new ServiceCenter({ ...svc, money: () => w, spend: ($) => { if ($ > w + 1e-9) return false; w -= $; return true },
        onMom: (id, k) => id === 'spareTire' && owes[k], useMom: (id, k) => { owes[k] = false } })
    stock(['spareTire'], ['spareTire'])
    check('on mom: the mounted tire and its fitting quote $0', mom.shelfPrice(0) === 0 && mom.fitLabour('spareTire', 'tireFL').price === 0)
    check('…a broke player buys it, and the part is used up', mom.buyToInventory(0) && w === 0 && !owes.part && owes.labour)
    check('…the next tire is paid again', mom.shelfPrice(1) > 0 && !mom.buyToInventory(1))
    const i = inventory.list().findIndex(r => r.id === 'spareTire' && !r.flat)
    check('…and fitting it is free, once', mom.swapPair(i, 0) && w === 0 && !owes.labour && mom.fitLabour('spareTire', 'tireFL').price > 0)
}

// ── 12. FEAT-212: the cart ────────────────────────────────────────────────────────────────────
// Queued jobs change the truck and the inventory at once and the wallet, the clock and the shelf only at checkout, which
// charges exactly what the same jobs one by one would have. Discard puts back EXACTLY what was there; taking a line out
// replays the rest, and a line whose part only the removed one brought comes out with it. Short of the wallet, the jobs
// still queue and checkout waits.
{
    const truck = () => JSON.stringify([parts.snapshot(), damage.toeOffsetDeg, damage.camberOffsetDeg, inventory.snapshot()])
    const world = () => JSON.stringify([wallet, hours, shelf])
    const setup = () => {
        svc.discard()
        damage.setAll(1); damage.flat.fill(false); parts.start(); inventory.start()
        damage.set('engine', 0.5); damage.set('oil', 0.4); damage.set('tireFL', 0.3); damage.flat[0] = true; damage.set('wheelRR', 0.5)
        damage.toeOffsetDeg[1] = 0.6; damage.set('alignFR', 0.7)
        inventory.grant('dampersHD', 1, { cond: 0.6 })
        stock(['tireSport', 0.8], ['springsHD'], ['tirePlugKit'])
        wallet = 1000; hours = 0
    }
    const flatTire = () => inventory.list().find(r => r.flat)?.index
    // Each job's args are read when it runs (the inventory moves under them).
    const JOBS = {
        swap: () => ['swapCorners', [0, 3]],               // FL's flat tire goes to RR, RR's bent wheel to FL…
        wheel: () => ['repair', ['wheelFL', 0.8]],         // …which is then straightened where it is now
        oil: () => ['changeOil', []],
        align: () => ['align', []],
        plug: () => ['buyToInventory', [2]],
        tire: () => ['buyAndFit', [0, 'tireRR']],          // the flat comes off into the inventory…
        shocks: () => ['exchange', [inventory.list().findIndex(r => r.id === 'dampersHD'), 'dampersFront']],
        sell: () => ['sellOwned', [flatTire()]],           // …and is sold
    }
    const run = (names) => names.every(n => { const [m, a] = JOBS[n](); return svc[m](...a) })
    const queue = (names) => names.every(n => { const [m, a] = JOBS[n](); return svc.queue(m, a, n) })
    const ALL = Object.keys(JOBS)

    setup()
    const s0 = truck(), w0 = world()
    check('cart: the jobs one by one all go through', run(ALL), JSON.stringify(inventory.list().map(r => r.id)))
    const s1 = truck(), paid = 1000 - wallet, worked = hours, shelf1 = JSON.stringify(shelf)
    setup()
    check('cart: …and the same jobs queue', truck() === s0 && queue(ALL) && svc.cart.length === ALL.length)
    check('…the truck and the inventory show them at once', truck() === s1)
    check('…the wallet, the clock and the shelf wait', world() === w0 && svc.pending())
    check('…the subtotal is what they cost one by one, money and hours', near(svc.total().price, paid) && near(svc.total().hours, worked),
        JSON.stringify({ total: svc.total(), paid, worked }))
    check('checkout pays it once and runs the clock once', svc.checkout() && near(1000 - wallet, paid) && near(hours, worked) && JSON.stringify(shelf) === shelf1
        && truck() === s1 && !svc.cart.length && !svc.pending(), JSON.stringify({ wallet, hours }))

    setup()
    queue(ALL)
    svc.discard()
    check('discard puts back exactly what was there', truck() === s0 && world() === w0 && !svc.cart.length)

    const without = (n) => { setup(); run(ALL.filter(x => x !== n)); return truck() }
    for (const n of ['oil', 'plug', 'align']) {   // 'plug' moves every later inventory row up one: found again by what it is
        const want = without(n)
        setup(); queue(ALL)
        const dropped = svc.remove(ALL.indexOf(n))
        check(`taking "${n}" out: the rest replayed, as if it had never been queued`, dropped === 0 && truck() === want && svc.cart.length === ALL.length - 1
            && world() === w0, `dropped ${dropped}, ${svc.cart.map(l => l.label)}`)
    }
    setup(); queue(ALL)
    check('taking the tire out takes the sale of the tire it took off with it', svc.remove(ALL.indexOf('tire')) === 1
        && svc.cart.map(l => l.label).join() === ALL.filter(n => n !== 'tire' && n !== 'sell').join() && world() === w0)
    setup(); queue(ALL)
    check('taking the corner swap out takes the wheel repair (that wheel is not on FL now) and the sale (the flat never comes off)',
        svc.remove(ALL.indexOf('swap')) === 2 && svc.cart.map(l => l.label).join() === 'oil,align,plug,tire,shocks' && damage.get('wheelFL') === 1 && damage.get('wheelRR') === 0.5)
    svc.discard()
    check('…and a discard after it is still exact', truck() === s0 && world() === w0)

    setup(); wallet = 10
    check('short of the wallet: the job still queues', svc.queue('repair', ['engine', 0.7], 'engine') && svc.short() > 0)
    check('…checkout waits, nothing paid or clocked', !svc.checkout() && wallet === 10 && hours === 0 && svc.cart.length === 1)
    svc.discard()
    check('…and a discard is exact', truck() === s0 && damage.get('engine') === 0.5)

    setup(); wallet = 0
    const d0 = inventory.list().findIndex(r => r.id === 'dampersHD')
    check('a sale in the cart pays for the work beside it', svc.queue('sellOwned', [d0], 'sell') && svc.queue('patch', ['tireFL'], 'patch')
        && svc.short() === 0 && svc.checkout() && near(wallet, PARTS.dampersHD.price * 0.5 * 0.6 - PATCH.price) && near(hours, PATCH.hours), wallet)

    setup()
    svc.preview(0, 'tireFL')
    check('a shelf item fitted for a look is pending too (no autosave)', svc.pending())
    svc.unpreview()

    // The free repair and mom's tire are used once across the cart, and only by its checkout.
    setup()
    let owed = 1
    const owes = { part: true, labour: true }
    const once = new ServiceCenter({ ...svc, freeRepairs: () => owed, useFreeRepair: () => { owed-- },
        onMom: (id, k) => PARTS[id]?.slot === 'tire' && owes[k], useMom: (id, k) => { owes[k] = false } })
    damage.set('radiator', 0.5)
    check('cart: the free repair covers the first repair only', once.queue('repair', ['engine', 0.7], 'e') && once.queue('repair', ['radiator', 0.7], 'r')
        && once.cart[0].price === 0 && once.cart[1].price > 0 && owed === 1)
    check('…mom\'s tire is free once in the cart', once.shelfPrice(0) === 0 && once.queue('buyAndFit', [0, 'tireFL'], 't') && once.cart[2].price === 0
        && once.fitLabour('tireSport', 'tireFR').price > 0 && owes.part && owes.labour)
    once.discard()
    check('…a discard owes them again', owed === 1 && owes.part && once.shelfPrice(0) === 0)
    once.queue('repair', ['engine', 0.7], 'e'); once.queue('buyAndFit', [0, 'tireFL'], 't')
    check('…a checkout uses them', once.checkout() && owed === 0 && !owes.part && !owes.labour)
    svc.discard()

    // BUG-197 (owner, 2026-11-17): re-selecting a repair already on the cart corrects that line, never adds a second.
    // The bar edits from where the part began (the line's `from`), so a nudge left from the queued target is offered.
    setup()
    const p70 = svc.repairQuote('engine', 0.7), p60 = svc.repairQuote('engine', 0.6)
    svc.queueRepair('repair', ['engine', 0.7], 'Repair engine to 70%')
    check('BUG-197: the queued line remembers where the part began', svc.cart.length === 1 && svc.repairLine('repair', 'engine')?.from === 0.5)
    check('…the bar still offers the steps below the queued target', svc.targets('engine', svc.repairLine('repair', 'engine').from).includes(0.6)
        && near(svc.repairQuote('engine', 0.6, 0.5).price, p60.price))
    svc.queueRepair('repair', ['engine', 0.6], 'Repair engine to 60%')
    check('…re-selected at 60 %: still one line, at the 60 % price, the engine at 60 %', svc.cart.length === 1 && near(svc.cart[0].price, p60.price)
        && damage.get('engine') === 0.6 && svc.cart[0].label.endsWith('60%'), JSON.stringify(svc.cart.map(l => [l.label, l.price])))
    svc.queue('changeOil', [], 'oil')
    svc.queueRepair('repair', ['engine', 0.7], 'Repair engine to 70%')
    check('…the other lines stay, the corrected one goes last', svc.cart.map(l => l.m).join() === 'changeOil,repair' && near(svc.total().price, svc.cart[0].price + p70.price))
    const hd = inventory.list().findIndex(r => r.id === 'dampersHD')
    svc.queueRepair('repairOwned', [hd, 0.7], 'a'); svc.queueRepair('repairOwned', [hd, 0.65], 'b')
    check('…same for a part in the inventory', svc.cart.filter(l => l.m === 'repairOwned').length === 1 && inventory.list()[hd].cond === 0.65)
    svc.discard()
    check('…and a discard puts the engine back', damage.get('engine') === 0.5)
}

// FEAT-232: the dinner meal — bought and eaten on the spot, in the cart, never stowed
{
    let fed = 0, w = 100, h0 = hours
    const meal = new ServiceCenter({ ...svc, money: () => w, spend: ($) => { if ($ > w + 1e-9) return false; w -= $; return true }, eat: (x) => { fed += x } })
    stock(['dinnerMeal'])
    const slots = inventory.slotsUsed()
    check('dinner meal: quote is its price and 30 min', meal.buyQuote(0).price === 4 && meal.buyQuote(0).hours === 0.5)
    check('dinner meal: cannot be stowed', !meal.buyToInventory(0) && inventory.slotsUsed() === slots)
    check('dinner meal: queued, nothing eaten or paid until checkout', meal.queue('buyAndEat', [0], 'eat') && fed === 0 && w === 100 && inventory.slotsUsed() === slots)
    check('dinner meal: a discard eats nothing', (meal.discard(), fed === 0 && w === 100))
    meal.queue('buyAndEat', [0], 'eat')
    check('dinner meal: checkout pays $4, runs 30 min, holds hunger 8 h, stows nothing', meal.checkout() && w === 96 && fed === 8 && hours - h0 === 0.5 && inventory.slotsUsed() === slots)
}

// FEAT-244: every level of the Maintenance tree wears the worst condition under it — a flat tire (0) reaches its
// corner and its category, a clean sibling does not hide it, a node with nothing that wears has none.
{
  const tire = { c: worstUnder(0, []) }, wheel = { c: worstUnder(0.9, []) }
  const corner = { c: worstUnder(Math.min(0, 0.9), [tire, wheel, '<html row>']) }
  const cat = { c: worstUnder(null, [corner, { c: worstUnder(0.95, []) }, { c: worstUnder(null, ['x']) }]) }
  check('FEAT-244: a flat tire is 0 at the tire, its corner and its category', tire.c === 0 && corner.c === 0 && cat.c === 0)
  check('FEAT-244: the worst sibling wins, a node with nothing that wears is null', worstUnder(null, [{ c: 0.7 }, { c: 0.4 }, { c: null }]) === 0.4 && worstUnder(null, ['row']) === null)
}

console.log(fails ? `\n${fails} FAILED` : '\nservice gate: ALL OK')
process.exit(fails ? 1 : 0)
