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
//                   gas can, fitting the spare and plugging a tire are the inventory screen's.
//
// Roadside tire work (owner, 2026-10-21; the factory jack and the bike pump are always aboard):
//   SPARE   90 min. The spare goes on the first flat corner, tire AND wheel (it is a mounted spare,
//           carried under the bed); the punctured pair comes off still mounted and goes where the
//           spare was — the carrier — as a flat spare.
//   PLUG    one plug per kit, on the truck's first flat or on a flat tire in the bed. It fixes the
//           hole, not the wear: the tire keeps its condition. Then the air: 2 h by hand with the
//           pump, 30 min with a compressor — each the WHOLE stop, plug included.
//
// The chip shows whenever the truck is parked in a story run — a tow is a phone call, not an event —
// and the card lists what fits the moment. Pure: main.js supplies the state and owns the DOM.


export const SPARE_FIT_H = 1.5                              // owner, 2026-10-21 (was 30 min)
export const PLUG_H = { pump: 2, compressor: 0.5 }          // the whole stop, by how the tire is aired up

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
 * onto the first flat corner. A spare is a tire mounted on a wheel, so both go on: its tire with its
 * wear, its wheel with its own (a new spare is data/parts.js `mounted`: a standard tire on a new steel
 * wheel) — a bent rim there is gone with it. The punctured pair comes off STILL MOUNTED, as a flat
 * spare that remembers its tire, wear and wheel (owner, 2026-10-20: roadside swaps keep the old part),
 * into the carrier the spare left — one entry, so it never needs two slots. A plug kit or the service
 * center makes it a spare again. Returns the corner, or -1 if there was nothing to do (a sound truck,
 * or a spare that is itself flat). The caller puts SPARE_FIT_H on the clock.
 */
export function fitSpare (parts, damage, inventory, spare) {
  const corner = damage.flat.indexOf(true)
  if (corner < 0 || spare.flat) return -1
  inventory.grant('spareTire', 1, parts.fitMounted(spare, corner))
  return corner
}

/** How a plugged tire can be aired up now: the pump always, the compressor if one is aboard. */
export function plugMethods (inventory) {
  return inventory.list().some(r => r.id === 'compressor') ? ['pump', 'compressor'] : ['pump']
}

/**
 * Plug a puncture and air the tire up `how` ('pump' | 'compressor'), spending one plug kit. The tire
 * is the truck's first flat corner, or the flat tire at inventory entry `bedIndex`. Its condition is
 * untouched. Returns the hours the stop takes, or -1 with nothing spent (no kit, no compressor for
 * 'compressor', or nothing flat there).
 */
export function plugTire (damage, inventory, how, bedIndex = null) {
  const owned = inventory.list()
  if (!owned.some(r => r.id === 'tirePlugKit') || !plugMethods(inventory).includes(how)) return -1
  if (bedIndex == null) {
    const corner = damage.flat.indexOf(true)
    if (corner < 0) return -1
    damage.flat[corner] = false
  } else {
    if (!owned[bedIndex]?.flat) return -1
    inventory.amend(bedIndex, { flat: false })
  }
  inventory.consume('tirePlugKit')
  return PLUG_H[how]
}
