// ── SM-3: the Recovery card — what you can do about the truck from where it stands ───────────────
//
// DESIGN.md "Death & the tow decision": a survivable breakdown is a PREDICAMENT, not a fail state —
// fix it here, limp it to a shop, or pay for a tow. Only can't-continue AND can't-afford ends the run
// (SM-INV-1, "you broke down").
//
//   CAN'T CONTINUE  out of fuel with no gas can aboard, or an engine at 0% (it never catches —
//                   src/ignition.js). A flat is not: the truck still drives on one (FEAT-94).
//   OPTIONS         the tows only (owner, 2026-10-20): to the nearest gas station when dry, to the
//                   nearest service center any time, each with its distance and cost. Pouring the
//                   gas can and fitting the spare are the inventory screen's (ITEMS[].use).
//
// The chip shows whenever the truck is parked in a story run — a tow is a phone call, not an event —
// and the card lists what fits the moment. Pure: main.js supplies the state and owns the DOM.

import { TIRE_IDS } from './damage.js'

export const SPARE_FIT_H = 0.5   // owner, 2026-09-30: fitting the spare costs 30 min

/**
 * @param {object} s
 *   dry, gasCan, engineDead   booleans
 *   flats                     flat corner indices (0=FL 1=FR 2=RL 3=RR) — the headline only
 *   money                     the wallet
 *   fuelTow, shopTow          { price, km, hours } to the nearest gas station / service center, or null
 * @returns {{ head: string, stuck: boolean, opts: Array<{act, enabled, tow?}>, canEnd: boolean }}
 */
export function recoveryCard (s) {
  const stuck = (s.dry && !s.gasCan) || s.engineDead
  const head = s.engineDead ? "engine won't start" : s.dry ? 'out of fuel' : s.flats.length ? 'flat tire' : 'roadside'
  const opts = []
  // A tow to the pump is only an answer to an empty tank; the service center takes anything.
  if (s.dry && s.fuelTow) opts.push({ act: 'towFuel', enabled: s.money + 1e-9 >= s.fuelTow.price, tow: s.fuelTow })
  if (s.shopTow) opts.push({ act: 'towShop', enabled: s.money + 1e-9 >= s.shopTow.price, tow: s.shopTow })
  return { head, stuck, opts, canEnd: stuck && !opts.some(o => o.enabled) }
}

/**
 * The spare's inventory effect: bolt `spare` (its entry, already out of the inventory — inventory.use)
 * onto the first flat corner, with its wear. The punctured tire comes off as ITSELF, flat and with its
 * wear, into the inventory (owner, 2026-10-20: roadside swaps keep the old part, no sale) — a patch
 * kit or the service center brings it back. Returns the corner, or -1 if there was nothing to do (a
 * sound truck, or a spare that is itself flat). The caller puts SPARE_FIT_H on the clock.
 */
export function fitSpare (parts, damage, inventory, spare) {
  const corner = damage.flat.indexOf(true)
  if (corner < 0 || spare.flat) return -1
  const off = parts.fit('spareTire', spare.cond, TIRE_IDS[corner])
  inventory.grant(off.id, 1, { cond: off.cond, flat: true })
  return corner
}
