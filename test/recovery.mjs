// test/recovery.mjs — SM-3 Recovery card gate.
//
//   1. Can't continue = dry with no gas can. A flat is not, and nor is a dead engine (it always starts).
//   2. The card is the tows only (owner, 2026-10-20 — the gas can and the spare are inventory uses):
//      the fuel tow only when dry, the service-center tow any time, each priced against the wallet.
//   3. End run only when stuck AND no tow is affordable.
//   4. The spare (fitSpare, on the corner the player picks): an ordinary inventory part (owner,
//      2026-10-21). It is a mounted pair, so its tire goes on with its wear and its wheel with its own
//      (a bent rim there is gone); the flat is gone. The corner's pair comes off STILL MOUNTED,
//      remembering its tire, wear, wheel and puncture, into the room the spare left — so a full
//      inventory still has room. Plugged, it goes back on as itself. Any corner, flat or not (owner,
//      2026-10-22); a flat spare never goes on.
//   5. The plug kit (owner, 2026-10-21): one plug per kit, on the flat the player picks — a corner or a
//      tire in the inventory; the hole is fixed, the wear is not. The stop is 2 h by hand, 30 min with
//      a compressor, and the compressor is only offered when one is aboard. Nothing is spent when
//      nothing happens.
//   6. A part you swap by hand (the spare air filter, items.md): it goes on with its wear for the
//      socket's labour (15 min); the old one comes off into the inventory with its own. Anything else
//      is refused.
//
// Pure node: no THREE, no DOM.
import { recoveryCard, fitSpare, plugTire, plugMethods, spareFitHours, fitRoadside } from '../src/recovery.js'
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
const base = { dry: false, gasCan: false, flats: [], money: 20, fuelTow: tow(14), shopTow: tow(16) }
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

// ── 4. The spare ──────────────────────────────────────────────────────────────────────────────
const params = { ...RANGER_PARAMS }
const damage = new DamageModel({ params })
const parts = new PartsSystem({ params, damage })
const inv = new InventorySystem({ slotCap: () => 2 })
parts.start(); inv.start()
const spare = () => inv.list().find(r => r.id === 'spareTire')
const fit = (corner) => fitSpare(parts, damage, inv, spare()?.index ?? -1, corner)
inv.grant('spareTire', 1, { cond: 0.9 })
check('no such corner: the spare stays', fit(4) === -1 && spare()?.cond === 0.9)
parts.fit('tireSport', 0.35, 'tireRL'); damage.flat[2] = true; damage.set('wheelRL', 0.4)
check('the spare goes on the picked corner with the inventory full', inv.slotsUsed() === inv.slotCap() && fit(2) === 2)
check('…its tire on the flat corner, with its wear, holding air', parts.fitted('tireRL') === 'tireStandard' && damage.get('tireRL') === 0.9 && !damage.flat[2])
check('…on its own wheel, new', parts.fitted('wheelRL') === 'wheelSteel' && damage.get('wheelRL') === 1)
const off = spare()
check('the flat pair takes the spare\'s slot, still mounted: its tire, wear and wheel', off?.flat
  && off.tire === 'tireSport' && off.cond === 0.35 && off.wheel === 'wheelSteel' && off.wheelCond === 0.4
  && inv.pending() === null, JSON.stringify(off))
damage.flat[0] = true
check('a flat spare is never fitted', fit(0) === -1 && damage.flat[0] && spare()?.flat)
inv.amend(spare().index, { flat: false })   // a plug kit's work (section 5)
check('plugged, it goes back on as itself', fit(0) === 0 && parts.fitted('tireFL') === 'tireSport'
  && damage.get('tireFL') === 0.35 && damage.get('wheelFL') === 0.4 && !damage.flat[0])
damage.set('tireRR', 0.5)
check('a sound corner swaps too, and its pair comes off holding air', spare().flat && (inv.amend(spare().index, { flat: false }), fit(3) === 3)
  && damage.get('tireRR') === 1 && !spare().flat && spare().cond === 0.5, JSON.stringify(spare()))

const tools = new InventorySystem({ slotCap: () => 8 }); tools.start()
check('the spare takes 2 h with the factory jack', spareFitHours(tools) === 2)
tools.grant('compressor')
check('…1 h 30 with a compressor', spareFitHours(tools) === 1.5)
tools.grant('quickJack')
check('…30 min with a quick-jack as well', spareFitHours(tools) === 0.5)

// ── 5. The plug kit ───────────────────────────────────────────────────────────────────────────
const inv2 = new InventorySystem({ slotCap: () => 8 })
inv2.start()
const kits = () => inv2.list().find(r => r.id === 'tirePlugKit')?.n ?? 0
damage.flat.fill(false)
check('no kit, nothing happens', plugTire(damage, inv2, 'pump', { corner: 1 }) === -1)
inv2.grant('tirePlugKit', 2)
check('a tire holding air spends no plug', plugTire(damage, inv2, 'pump', { corner: 1 }) === -1 && kits() === 2)
check('the pump is always there; no compressor, no compressor', plugMethods(inv2).join() === 'pump'
  && plugTire(damage, inv2, 'compressor', { corner: 1 }) === -1)
damage.flat[1] = true; damage.set('tireFR', 0.6)
check('by hand: the whole stop is two hours', plugTire(damage, inv2, 'pump', { corner: 1 }) === 2)
check('…the hole is fixed, the wear is not, one plug spent', !damage.flat[1] && damage.get('tireFR') === 0.6 && kits() === 1)
inv2.grant('compressor'); inv2.grant('tireSport', 1, { cond: 0.7, flat: true })
const looseTire = inv2.list().find(r => r.id === 'tireSport')
check('a compressor aboard offers both', plugMethods(inv2).join() === 'pump,compressor')
check('a flat tire in the inventory, with the compressor: half an hour', plugTire(damage, inv2, 'compressor', { index: looseTire.index }) === 0.5)
const plugged = inv2.list().find(r => r.id === 'tireSport')
check('…it holds air, keeps its wear, and the last kit is gone', !plugged.flat && plugged.cond === 0.7 && kits() === 0)

// ── 6. The spare air filter ───────────────────────────────────────────────────────────────────
damage.set('airFilter', 0.15)
inv2.grant('airFilterStock', 1, { cond: 0.9 })
const filt = () => inv2.list().find(r => r.id === 'airFilterStock')
check('a part with no roadside fit is refused', fitRoadside(parts, inv2, inv2.list().findIndex(r => r.id === 'compressor')) === -1)
check('the filter goes on in 15 min, with its wear', fitRoadside(parts, inv2, filt().index) === 0.25 && damage.get('airFilter') === 0.9)
check('…and the clogged one comes off into the inventory', filt()?.cond === 0.15, JSON.stringify(filt()))

console.log(fails ? `\n${fails} FAILED` : '\nrecovery gate: ALL OK')
process.exit(fails ? 1 : 0)
