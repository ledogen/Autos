// ── SM-3: the Recovery card — what you can do about the truck from where it stands ───────────────
//
// DESIGN.md "Death & the tow decision": a survivable breakdown is a PREDICAMENT, not a fail state —
// fix it here, limp it to a shop, or pay for a tow. Only can't-continue AND can't-afford ends the run
// (SM-INV-1, "you broke down").
//
//   CAN'T CONTINUE  out of fuel with no gas can aboard. Not a dead engine: it always starts, just
//                   gutless (owner, 2026-10-22). Not a flat: the truck still drives on one (FEAT-94).
//   OPTIONS         the tows only (owner, 2026-10-20): to the nearest gas station when dry, to the
//                   nearest service center any time, each with its distance and cost. Pouring the
//                   gas can, fitting the spare and plugging a tire are the inventory screen's.
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
// The chip shows whenever the truck is parked in a story run — a tow is a phone call, not an event —
// and the card lists what fits the moment. Pure: main.js supplies the state and owns the DOM.


import { PARTS, SLOTS } from '../data/parts.js'

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
 *   dry, gasCan               booleans
 *   flats                     flat corner indices (0=FL 1=FR 2=RL 3=RR) — the headline only
 *   money                     the wallet
 *   fuelTow, shopTow          { price, km, hours } to the nearest gas station / service center, or null
 * @returns {{ head: string, stuck: boolean, opts: Array<{act, enabled, tow?}>, canEnd: boolean }}
 */
export function recoveryCard (s) {
  const stuck = s.dry && !s.gasCan
  const head = s.dry ? 'out of fuel' : s.flats.length ? 'flat tire' : 'roadside'
  const opts = []
  // A tow to the pump is only an answer to an empty tank; the service center takes anything.
  if (s.dry && s.fuelTow) opts.push({ act: 'towFuel', enabled: s.money + 1e-9 >= s.fuelTow.price, tow: s.fuelTow })
  if (s.shopTow) opts.push({ act: 'towShop', enabled: s.money + 1e-9 >= s.shopTow.price, tow: s.shopTow })
  return { head, stuck, opts, canEnd: stuck && !opts.some(o => o.enabled) }
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
