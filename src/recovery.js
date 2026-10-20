// ── SM-3: the Recovery card — what you can do about the truck from where it stands ───────────────
//
// DESIGN.md "Death & the tow decision": a survivable breakdown is a PREDICAMENT, not a fail state —
// fix it here, limp it to a shop, or pay for a tow. Only can't-continue AND can't-afford ends the run
// (SM-INV-1, "you broke down").
//
//   CAN'T CONTINUE  out of fuel with no gas can aboard, or an engine at 0% (it never catches —
//                   src/ignition.js). A flat is not: the truck still drives on one (FEAT-94).
//   OPTIONS         pour the gas can · fit the spare (a flat, owner 2026-09-30: 30 min) · tow to the
//                   nearest gas station (when dry) · tow to the nearest service center (any time)
//
// The chip shows whenever the truck is parked in a story run — a tow is a phone call, not an event —
// and the card lists what fits the moment. Pure: main.js supplies the state and owns the DOM.

export const SPARE_FIT_H = 0.5   // owner, 2026-09-30: fitting the spare costs 30 min

/**
 * @param {object} s
 *   dry, gasCan, engineDead   booleans
 *   flats                     flat corner indices (0=FL 1=FR 2=RL 3=RR)
 *   spare                     a good spare tire is aboard
 *   money                     the wallet
 *   fuelTow, shopTow          { price, km, hours } to the nearest gas station / service center, or null
 * @returns {{ head: string, stuck: boolean, opts: Array<{act, enabled, tow?}>, canEnd: boolean }}
 */
export function recoveryCard (s) {
  const stuck = (s.dry && !s.gasCan) || s.engineDead
  const head = s.engineDead ? "engine won't start" : s.dry ? 'out of fuel' : s.flats.length ? 'flat tire' : 'roadside'
  const opts = []
  if (s.dry && s.gasCan) opts.push({ act: 'gas', enabled: true })
  if (s.flats.length) opts.push({ act: 'spare', enabled: s.spare })
  // A tow to the pump is only an answer to an empty tank; the service center takes anything.
  if (s.dry && s.fuelTow) opts.push({ act: 'towFuel', enabled: s.money + 1e-9 >= s.fuelTow.price, tow: s.fuelTow })
  if (s.shopTow) opts.push({ act: 'towShop', enabled: s.money + 1e-9 >= s.shopTow.price, tow: s.shopTow })
  return { head, stuck, opts, canEnd: stuck && !opts.some(o => o.enabled) }
}

/**
 * Bolt the spare onto the first flat corner. The punctured tire comes off into the inventory as a
 * FLAT spare, keeping its wear (owner, 2026-10-20: roadside swaps keep the old part, no sale) — a
 * patch kit can bring it back when one exists. Returns the corner, or -1 if there was nothing to do.
 * The caller puts SPARE_FIT_H on the clock.
 */
export function fitSpare (damage, inventory) {
  const corner = damage.flat.indexOf(true)
  const index = inventory.list().findIndex(r => r.id === 'spareTire' && !r.flat)
  if (corner < 0 || index < 0) return -1
  const id = ['tireFL', 'tireFR', 'tireRL', 'tireRR'][corner]
  const spare = inventory.take(index)
  const worn = damage.get(id)
  damage.set(id, spare.cond?.tire ?? 1)
  damage.flat[corner] = false
  inventory.grant('spareTire', 1, { cond: { tire: worn }, flat: true })
  return corner
}
