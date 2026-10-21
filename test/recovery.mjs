// test/recovery.mjs — SM-3 Recovery card gate.
//
//   1. Can't continue = dry with no gas can, or a dead engine. A flat alone is not.
//   2. The card is the tows only (owner, 2026-10-20 — the gas can and the spare are inventory uses):
//      the fuel tow only when dry, the service-center tow any time, each priced against the wallet.
//   3. End run only when stuck AND no tow is affordable.
//   4. The spare (inventory.use → fitSpare): an ordinary inventory part (owner, 2026-10-21). It is a
//      mounted pair, so its tire goes on the first flat corner with its wear and its wheel with its own
//      (a bent rim there is gone); the flat is gone. The punctured pair comes off STILL MOUNTED, as a
//      flat spare that remembers its tire, wear and wheel, into the slot the spare left — so a full
//      inventory still has room. Plugged, it goes back on as itself. A sound truck, or a flat spare,
//      leaves the spare where it was.
//   5. The plug kit (owner, 2026-10-21): one plug per kit, on the truck's first flat or a flat tire in
//      the bed; the hole is fixed, the wear is not. The stop is 2 h by hand, 30 min with a compressor,
//      and the compressor is only offered when one is aboard. Nothing is spent when nothing happens.
//
// Pure node: no THREE, no DOM.
import { recoveryCard, fitSpare, plugTire, plugMethods, SPARE_FIT_H } from '../src/recovery.js'
import { InventorySystem } from '../src/inventory.js'
import { PartsSystem } from '../src/parts.js'
import { DamageModel } from '../src/damage.js'
import { RANGER_PARAMS } from '../data/ranger.js'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}
const tow = (price) => ({ price, km: 2, hours: 1 })
const base = { dry: false, gasCan: false, engineDead: false, flats: [], money: 20, fuelTow: tow(14), shopTow: tow(16) }
const acts = (c) => c.opts.map(o => o.act + (o.enabled ? '' : '-')).join()

// ── 1–3. The card ─────────────────────────────────────────────────────────────────────────────
let c = recoveryCard(base)
check('a sound parked truck: roadside, not stuck, the shop tow only', c.head === 'roadside' && !c.stuck && acts(c) === 'towShop')
c = recoveryCard({ ...base, flats: [2] })
check('a flat is not stuck, and the card is still just the tow', c.head === 'flat tire' && !c.stuck && acts(c) === 'towShop')
c = recoveryCard({ ...base, dry: true, gasCan: true })
check('dry with a can: not stuck, both tows', !c.stuck && acts(c) === 'towFuel,towShop')
c = recoveryCard({ ...base, dry: true, money: 15 })
check('dry, no can: stuck, fuel tow affordable, shop tow not', c.stuck && acts(c) === 'towFuel,towShop-' && !c.canEnd)
c = recoveryCard({ ...base, dry: true, money: 5 })
check('dry and broke: the run can end', c.stuck && c.canEnd)
c = recoveryCard({ ...base, dry: true, gasCan: true, money: 0 })
check('dry and broke with a can: the can is the way out, never the end', !c.canEnd)
c = recoveryCard({ ...base, engineDead: true, money: 5, fuelTow: null, shopTow: null })
check('dead engine, no tow can reach: the run can end', c.head === "engine won't start" && c.canEnd)

// ── 4. The spare ──────────────────────────────────────────────────────────────────────────────
const params = { ...RANGER_PARAMS }
const damage = new DamageModel({ params })
const parts = new PartsSystem({ params, damage })
const inv = new InventorySystem({ slotCap: () => 2, effects: { spare: (e) => fitSpare(parts, damage, inv, e) >= 0 } })
parts.start(); inv.start()
const spare = () => inv.list().find(r => r.id === 'spareTire')
inv.grant('spareTire', 1, { cond: 0.9 })
check('nothing to do without a flat: the spare stays', !inv.use('spareTire') && spare()?.cond === 0.9)
parts.fit('tireSport', 0.35, 'tireRL'); damage.flat[2] = true; damage.set('wheelRL', 0.4)
check('the spare goes on with the inventory full', inv.slotsUsed() === inv.slotCap() && inv.use('spareTire'))
check('…its tire on the flat corner, with its wear, holding air', parts.fitted('tireRL') === 'tireStandard' && damage.get('tireRL') === 0.9 && !damage.flat[2])
check('…on its own wheel, new', parts.fitted('wheelRL') === 'wheelSteel' && damage.get('wheelRL') === 1)
const off = spare()
check('the flat pair takes the spare\'s slot, still mounted: its tire, wear and wheel', off?.flat
  && off.tire === 'tireSport' && off.cond === 0.35 && off.wheel === 'wheelSteel' && off.wheelCond === 0.4
  && inv.pending() === null, JSON.stringify(off))
damage.flat[0] = true
check('a flat spare is never fitted', !inv.use('spareTire') && damage.flat[0] && spare()?.flat)
inv.amend(spare().index, { flat: false })   // a plug kit's work (section 5)
check('plugged, it goes back on as itself', inv.use('spareTire') && parts.fitted('tireFL') === 'tireSport'
  && damage.get('tireFL') === 0.35 && damage.get('wheelFL') === 0.4 && !damage.flat[0])

check('the spare takes 90 min', SPARE_FIT_H === 1.5)

// ── 5. The plug kit ───────────────────────────────────────────────────────────────────────────
const inv2 = new InventorySystem({ slotCap: () => 8 })
inv2.start()
const kits = () => inv2.list().find(r => r.id === 'tirePlugKit')?.n ?? 0
damage.flat.fill(false)
check('no kit, nothing happens', plugTire(damage, inv2, 'pump') === -1)
inv2.grant('tirePlugKit', 2)
check('a sound truck spends no plug', plugTire(damage, inv2, 'pump') === -1 && kits() === 2)
check('the pump is always there; no compressor, no compressor', plugMethods(inv2).join() === 'pump'
  && plugTire(damage, inv2, 'compressor') === -1)
damage.flat[1] = true; damage.set('tireFR', 0.6)
check('by hand: the whole stop is two hours', plugTire(damage, inv2, 'pump') === 2)
check('…the hole is fixed, the wear is not, one plug spent', !damage.flat[1] && damage.get('tireFR') === 0.6 && kits() === 1)
inv2.grant('compressor'); inv2.grant('tireSport', 1, { cond: 0.7, flat: true })
const bedTire = inv2.list().find(r => r.id === 'tireSport')
check('a compressor aboard offers both', plugMethods(inv2).join() === 'pump,compressor')
check('a flat tire in the bed, with the compressor: half an hour', plugTire(damage, inv2, 'compressor', bedTire.index) === 0.5)
const plugged = inv2.list().find(r => r.id === 'tireSport')
check('…it holds air, keeps its wear, and the last kit is gone', !plugged.flat && plugged.cond === 0.7 && kits() === 0)

console.log(fails ? `\n${fails} FAILED` : '\nrecovery gate: ALL OK')
process.exit(fails ? 1 : 0)
