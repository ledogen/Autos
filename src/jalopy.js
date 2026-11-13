// ── SM-3: the jalopy — the truck a story run starts in (SM-INV-7) ────────────────────────────────
//
// A seeded roll over the parts and every damage track (owner, 2026-10-21): a used Ranger that still
// runs. The architecture stays the factory's — stock springs, shocks and brakes, the open diff, no
// lift — and the roll is WEAR, plus one old tire and sometimes no front bar, so every run is still
// winnable. Each corner and each axle draws its own number.
//
// Run-layer randomness (DESIGN.md: "jalopy rolls" stay free): main.js hands it a fresh seed per run,
// the gate a fixed one. Pure: no THREE, no DOM.

import { SLOTS, takes } from '../data/parts.js'
import { TRACKS } from './damage.js'
import { mulberry32 } from './seed.js'

/** Starting condition per damage class, [lo, hi], drawn evenly per track. */
export const JALOPY_COND = {
  tire: [0.4, 0.8], wheel: [0.7, 1], alignment: [0.75, 1],
  spring: [0.5, 0.85], damper: [0.4, 0.8], brake: [0.35, 0.75],
  engine: [0.55, 0.85], filter: [0.4, 0.8], radiator: [0.5, 0.9], transmission: [0.5, 0.85],
  headlights: [0.6, 1], armor: [0.5, 0.9],
}
/** The sockets that don't always get the stock part: per kind of socket, part id → weight. */
export const JALOPY_PARTS = {
  arbFront: { arbFrontStock: 90, arbFrontNone: 10 },
}
// FEAT-201 (owner, 2026-11-12: "only one old tire and it's in the front … the car still drives quite well
// but you do have some debt to take care of"): two old rears made the truck squirrely. Exactly one old
// tire, on a front corner drawn evenly; the other three are the stock tire.
export const JALOPY_OLD_TIRE = ['tireFL', 'tireFR']
/** The spare in the inventory: always one (FEAT-201), an old tire on the steel wheel, worn. */
export const JALOPY_SPARE = { tire: 'tireOld', cond: [0.4, 0.8] }

/**
 * Roll the run's truck onto `parts`, `damage` and `inventory` (all freshly started: stock, new, the
 * starting kit). The caller republishes the damage model.
 */
export function rollJalopy ({ parts, damage, inventory }, seed) {
  const rand = mulberry32(seed)
  const span = ([lo, hi]) => lo + (hi - lo) * rand()
  const pick = (w) => {
    let r = rand() * Object.values(w).reduce((a, b) => a + b, 0)
    return Object.keys(w).find(id => (r -= w[id]) < 0)
  }
  // Parts first: fitting one sets its track new, and the wear goes on after.
  for (const socket of Object.keys(SLOTS)) {
    const w = JALOPY_PARTS[takes(socket)]
    if (w) parts.fit(pick(w), null, socket)
  }
  parts.fit('tireOld', null, JALOPY_OLD_TIRE[Math.floor(rand() * JALOPY_OLD_TIRE.length)])
  for (const [id, t] of Object.entries(TRACKS)) {
    if (t.clutchOnly) continue   // FEAT-166: the jalopy's diff is open; clutch packs fitted later come new
    const range = JALOPY_COND[t.cls]
    // Alignment is bent GEOMETRY with the track as its readout (damage.js _bendWheel): a bend of at
    // most 1 − lo of full keeps the readout inside the range.
    if (t.cls === 'alignment') damage._bendWheel(t.wheel, span([0, 1 - range[0]]))
    else damage.set(id, span(range))
  }
  inventory.grant('spareTire', 1, { tire: JALOPY_SPARE.tire, cond: span(JALOPY_SPARE.cond) })
}
