// ── SM-3: the Recovery card — what you can do about the truck from where it stands ───────────────
//
// DESIGN.md "Death & the tow decision": a survivable breakdown is a PREDICAMENT, not a fail state —
// fix it here, limp it to a shop, or pay for a tow. Only can't-continue AND can't-afford ends the run
// (SM-INV-1, "you broke down").
//
//   CAN'T CONTINUE  FEAT-162 (owner, 2026-11-06), any of:
//                   · out of fuel with no gas can aboard;
//                   · the engine seized (its track at exactly 0, ignition.js seized) — a worn one
//                     still starts, gutless;
//                   · a wheel collapsed (damage.js collapsed) and no spare left to put on it — a flat
//                     still drives (FEAT-94) until its rim gives out;
//                   · on its side or roof with no hi-lift jack aboard.
//   OPTIONS         the tows (owner, 2026-10-20): to the nearest gas station when dry, to the nearest
//                   service center any time, each with its distance and cost; and the mobile tire
//                   service (FEAT-162 amendment 5) for a flat, a ruined tire or a collapsed wheel.
//                   Pouring the gas can, fitting the spare and plugging a tire are the inventory screen's.
//   THE END         can't continue, and no option that cures it is affordable: the run ends by itself
//                   ("You broke down.", SM-INV-1) — main.js, once the truck is at rest.
//
// Roadside tire work (owner, 2026-10-21; the factory jack and the bike pump are always aboard):
//   SPARE   2 h, less with tools (spareFitHours). The spare goes on the corner the player picks, tire AND wheel (it is a mounted
//           pair, carried in the inventory). Any corner, flat or not (owner, 2026-10-22: "swap any
//           tire for any reason at any time"); the pair that comes off goes into the inventory still
//           mounted, flat if it was.
//   PLUG    one plug per kit, on a flat corner or a flat tire in the inventory, whichever the player
//           picks. It fixes the hole, not the wear: the tire keeps its condition. Then the air: 2 h
//           by hand with the pump, 30 min with a compressor — each the WHOLE stop, plug included.
//   The player picks on the damage screen's pictogram (DamageScreen.pick), which shows each corner's
//   tire, wheel and flat, and the time, before a confirm.
//
// Field repairs (items.md §7, owner 2026-10-20/21): zip ties and duct tape, each use a 15 min stop on
// one part picked the same way (FIELD_REPAIR). The jerry can pours like the emergency gas (pourCan).
//
// The chip shows whenever the truck is parked in a story run — a tow is a phone call, not an event —
// and the card lists what fits the moment. Pure: main.js supplies the state and owns the DOM.


import { PARTS, SLOTS, REPAIR_CAP, HUB, BEAD, PATCH, stockPart } from '../data/parts.js'
import { ITEMS } from '../data/items.js'
import { TIRE_IDS, WHEEL_IDS } from './damage.js'

/**
 * Hours to change a tire for the spare (owner, 2026-10-22): 2 h with the factory jack and wrench; a
 * compressor (an impact gun off it) takes 30 min off, a quick-jack 1 h, and they stack — 30 min with
 * both. Neither shortens a plug: "you don't need to jack to plug" (owner).
 */
export const spareFitHours = (inventory) => {
  const has = (id) => inventory.list().some(r => r.id === id)
  return 2 - (has('compressor') ? 0.5 : 0) - (has('quickJack') ? 1 : 0)
}
export const PLUG_H = { pump: 2, compressor: 0.5 }          // the whole stop, by how the tire is aired up

/**
 * @param {object} s
 *   dry, gasCan, seized, hiLift   booleans
 *   rolled                    0 on its wheels, ±1 on a side, 2 on its roof (hilift.js basin)
 *   flats, collapsed          corner indices (0=FL 1=FR 2=RL 3=RR): the flat tires, the collapsed wheels
 *   spares                    mounted tires aboard that can go on (a sound wheel; air, or a plug kit for it)
 *   money                     the wallet
 *   fuelTow, shopTow          { price, km, hours } to the nearest gas station / service center, or null
 *   tireService               tireServiceQuote(), or null
 * @returns {{ head: string, why: string[], stuck: boolean, opts: Array<{act, enabled, tow}>, canEnd: boolean, cure: object|null }}
 *   why     what strands the truck: 'dry' · 'seized' · 'wheel' · 'rolled' (empty: it can go on)
 *   canEnd  stuck, and no option that cures every `why` is affordable; `cure` is the cheapest such option
 */
export function recoveryCard (s) {
  const why = []
  if (s.dry && !s.gasCan) why.push('dry')
  if (s.seized) why.push('seized')
  if (s.collapsed.length > s.spares) why.push('wheel')
  if (s.rolled && !s.hiLift) why.push('rolled')
  const words = { dry: 'out of fuel', seized: 'the engine seized', wheel: 'a wheel gave out', rolled: s.rolled === 2 ? 'on its roof' : 'on its side' }
  const head = words[why[0]] ?? (s.dry ? words.dry : s.collapsed.length ? words.wheel : s.flats.length ? 'flat tire' : 'roadside')
  // What each one cures: the service center takes anything, the pump only the tank, the tire service
  // only the wheels — and a tow truck sets a rolled truck back on its wheels wherever it takes it.
  const opts = []
  const opt = (act, tow, cures) => opts.push({ act, tow, cures, enabled: s.money + 1e-9 >= tow.price })
  if (s.dry && s.fuelTow) opt('towFuel', s.fuelTow, ['dry', 'rolled'])
  if (s.shopTow) opt('towShop', s.shopTow, ['dry', 'seized', 'wheel', 'rolled'])
  if (s.tireService) opt('tireService', s.tireService, ['wheel'])
  const cures = opts.filter(o => why.every(w => o.cures.includes(w))).sort((a, b) => a.tow.price - b.tow.price)
  const stuck = why.length > 0
  return { head, why, stuck, opts, canEnd: stuck && !cures.some(o => o.enabled), cure: cures[0] ?? null }
}

/**
 * FEAT-162 amendment 5 (owner, 2026-11-05): the mobile tire service — a call-out that fixes, on the spot,
 * every corner with a flat, a ruined tire (at 0) or a collapsed wheel, no spare needed. A dead tire or
 * wheel is replaced with the stock part, new; a sound tire with no air is patched. Dearer than the shop
 * [DEFAULT]: (the shop's price for the same parts + its labour) × roadsideMarkup, plus the tow's
 * call-out, all × the day tier. The time [DEFAULT]: the tow's wait from the nearest shop (`shopTow`),
 * then the fitting. The dead parts go with the service — each sells for half its price × 0.
 * Returns { price, km, hours, jobs: [{ corner, tire, wheel }] }, or null (nothing to fix, no shop).
 */
export function tireServiceQuote (damage, shopTow, tier, params) {
  if (!shopTow) return null
  let price = 0, hours = 0
  const jobs = []
  for (let c = 0; c < 4; c++) {
    const tire = damage.get(TIRE_IDS[c]) <= 0, wheel = damage.collapsed(c)
    if (tire || wheel) {   // the shop's fitLabour for a loose tire or wheel: 2 hub swaps, 2 bead jobs
      price += (tire ? PARTS[stockPart(TIRE_IDS[c])].price : 0) + (wheel ? PARTS[stockPart(WHEEL_IDS[c])].price : 0) + 2 * HUB.price + 2 * BEAD.price
      hours += 2 * HUB.hours + 2 * BEAD.hours
    }
    if (!tire && damage.flat[c]) { price += PATCH.price; hours += PATCH.hours }
    if (tire || wheel || damage.flat[c]) jobs.push({ corner: c, tire, wheel })
  }
  if (!jobs.length) return null
  return { price: Math.round((price * params.roadsideMarkup + params.towFlat) * tier * 100) / 100,
           km: shopTow.km, hours: shopTow.hours + hours, jobs }
}

/** Do quoted tire service `q`: the new parts on, every flat holding air. The wallet and the clock are the caller's. */
export function tireService (parts, damage, q) {
  for (const { corner, tire, wheel } of q.jobs) {
    if (tire) parts.fit(stockPart(TIRE_IDS[corner]), 1, TIRE_IDS[corner])
    if (wheel) parts.fit(stockPart(WHEEL_IDS[corner]), 1, WHEEL_IDS[corner])
    damage.flat[corner] = false
  }
}

/**
 * Bolt the spare at inventory entry `index` onto `corner` (0=FL 1=FR 2=RL 3=RR). A spare is a tire
 * mounted on a wheel, so both go on: its tire with its wear, its wheel with its own (a new spare is
 * data/parts.js `mounted`: a standard tire on a new steel wheel) — a bent rim there is gone with it.
 * The corner's pair comes off STILL MOUNTED, as a spare that remembers its tire, wear, wheel and
 * puncture (owner, 2026-10-20: roadside swaps keep the old part), into the room the spare left — one
 * entry, so there is always room. A plug kit or the service center makes a flat one a spare again.
 * Returns the corner, or -1 with nothing changed (not a spare, a flat spare, no such corner). The
 * caller puts spareFitHours() on the clock.
 */
export function fitSpare (parts, damage, inventory, index, corner) {
  const r = inventory.list()[index]
  if (r?.id !== 'spareTire' || r.flat || !(corner >= 0 && corner < 4)) return -1
  inventory.grant('spareTire', 1, parts.fitMounted(inventory.take(index), corner))
  return corner
}

/**
 * Fit a part the player can swap by hand (`roadside: true` in data/parts.js — the spare air filter,
 * items.md, ratified): the part at inventory entry `index` goes on its socket with its wear, and the one
 * that comes off takes the room it left, with its own. Returns the labour hours (the socket's), or -1
 * with nothing changed.
 */
export function fitRoadside (parts, inventory, index) {
  const r = inventory.list()[index], p = PARTS[r?.id]
  if (!p?.roadside) return -1
  const off = parts.fit(r.id, r.cond, p.slot)
  if (!off) return -1
  inventory.take(index)
  if (off.id && PARTS[off.id].massKg > 0) inventory.grant(off.id, 1, { cond: off.cond })
  return SLOTS[p.slot].hours
}

/** How a plugged tire can be aired up now: the pump always, the compressor if one is aboard. */
export function plugMethods (inventory) {
  return inventory.list().some(r => r.id === 'compressor') ? ['pump', 'compressor'] : ['pump']
}

/**
 * Plug a puncture and air the tire up `how` ('pump' | 'compressor'), spending one plug kit. The tire
 * is the truck's `corner`, or the tire at inventory entry `index`. Its condition is untouched. Returns
 * the hours the stop takes, or -1 with nothing spent (no kit, no compressor for 'compressor', or that
 * tire isn't flat).
 */
export function plugTire (damage, inventory, how, { corner = null, index = null }) {
  const owned = inventory.list()
  if (!owned.some(r => r.id === 'tirePlugKit') || !plugMethods(inventory).includes(how)) return -1
  if (corner != null) {
    if (!damage.flat[corner]) return -1
    damage.flat[corner] = false
  } else {
    if (!owned[index]?.flat) return -1
    inventory.amend(index, { flat: false })
  }
  inventory.consume('tirePlugKit')
  return PLUG_H[how]
}

/**
 * What each field repair mends, by how much, and how long a use takes. Zip ties: a headlight, a body
 * panel or the radiator; duct tape: a body panel only. Neither takes a part past REPAIR_CAP, the
 * service center's own ceiling [DEFAULT — no field cap was ruled].
 */
const PANELS = ['armorFront', 'armorLeft', 'armorRight', 'armorRear']
export const FIELD_REPAIR = {
  zipTies:  { gain: 0.10, hours: 0.25, tracks: [...PANELS, 'headlightL', 'headlightR', 'radiator'] },
  ductTape: { gain: 0.20, hours: 0.25, tracks: PANELS },
}
export const fieldRepairable = (damage, track) => damage.get(track) < REPAIR_CAP - 1e-9
export const fieldRepairTo = (damage, id, track) => Math.min(REPAIR_CAP, damage.get(track) + FIELD_REPAIR[id].gain)

/**
 * One use of field repair `id` on `track`: the part gains its share up to the cap, and one use is spent.
 * Returns the hours the stop takes, or -1 with nothing spent (none aboard, not its part, at the cap).
 */
export function fieldRepair (damage, inventory, id, track) {
  const fr = FIELD_REPAIR[id]
  if (!fr?.tracks.includes(track) || !fieldRepairable(damage, track) || !inventory.list().some(r => r.id === id)) return -1
  damage.set(track, fieldRepairTo(damage, id, track))
  inventory.consume(id)
  return fr.hours
}

/**
 * Pour the can at inventory entry `index` into the tank: as much as it holds or the tank takes. The
 * can stays, lighter. Returns the gallons poured, or 0 with nothing moved (not a can, empty, tank full).
 */
export function pourCan (fuel, tankGal, inventory, index) {
  const r = inventory.list()[index]
  if (!ITEMS[r?.id]?.capGal) return 0
  const g = Math.min(r.gal, tankGal - fuel.gal)
  if (g < 0.05) return 0
  fuel.gal += g
  fuel.dry = false
  inventory.amend(index, { gal: r.gal - g })
  return g
}
