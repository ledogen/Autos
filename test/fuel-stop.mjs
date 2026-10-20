// GATE (FEAT-50): the pump visit and the tow price. Pure: FuelStop is a state machine stepped by
// hand, and the pump zones are checked against the gasPump registry entry and the pad they sit on.
//
// What it locks down (owner, 2026-10-16):
//   1. F must be HELD: nothing flows until it is, and letting go pauses (press again to resume).
//   2. A full 16.5 gal tank takes 10 s of held F.
//   3. The counter stops at a full tank or at what the wallet can pay, whichever comes first, and
//      says so ('full' — the auto-shutoff), never running past either.
//   4. Settling charges exactly the counter (to the cent) and closes the pump.
//   5. One bell per whole gallon.
//   6. Both pump zones lie on the 14 x 8 m pad and clear the island's collision box.
//   7. The tow costs (flat + per-km) × day tier.
//
// Run: node test/fuel-stop.mjs

import { FuelStop, towPrice, towHours } from '../src/fuel-stop.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { PROP_MODELS } from '../data/prop-models.js'
import { POI_PARAMS } from '../src/poi.js'
import { ECONOMY_PARAMS } from '../src/economy.js'

const DT = 1 / 60
let failures = 0
const check = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) failures++ }
const P = { ...RANGER_PARAMS }
const run = (stop, fuel, secs, held, wallet = Infinity) => {
  const events = []
  for (let t = 0; t < secs - 1e-9; t += DT) { stop.step(DT, held, fuel, P, wallet); if (stop.event) events.push(stop.event) }
  return events
}

console.log('\n1. held F only')
{
  const s = new FuelStop(), fuel = { gal: 0, floorGal: 0, dry: true }
  s.open('poi:1', 0.5)
  run(s, fuel, 2, false)
  check(s.gal === 0 && s.state === 'open', 'nothing flows until F is held')
  const ev = run(s, fuel, 1, true)
  check(ev[0] === 'start' && s.state === 'pumping' && !fuel.dry, `holding F starts the flow (${s.gal.toFixed(2)} gal in 1 s) and the tank is no longer dry`)
  const at = s.gal
  const ev2 = run(s, fuel, 1, false)
  check(ev2[0] === 'stop' && s.gal === at && s.state === 'open', 'letting go pauses it, the counter holds')
  run(s, fuel, 0.5, true)
  check(s.gal > at, '…and F again resumes')
}

console.log('\n2. a full tank in 10 s')
{
  const s = new FuelStop(), fuel = { gal: 0, floorGal: 0, dry: true }
  s.open('poi:1', 0.5)
  let t = 0, full = null
  while (t < 15 && full === null) { s.step(DT, true, fuel, P, Infinity); t += DT; if (s.event === 'full') full = t }
  check(full !== null && Math.abs(full - 10) <= 0.1, `16.5 gal from empty in ${full?.toFixed(2)} s (10 ± 0.1)`)
  check(Math.abs(fuel.gal - P.fuelTankGal) < 1e-9 && Math.abs(s.gal - P.fuelTankGal) < 1e-9, 'the tank is exactly full and the counter shows exactly what went in')
  const atFull = s.gal
  run(s, fuel, 1, true)
  check(s.gal === atFull && s.state === 'open', 'holding on past full pumps nothing more')
  let ev = []
  for (let i = 0; i < 120; i++) { fuel.gal -= 1e-4; s.step(DT, true, fuel, P, Infinity); if (s.event) ev.push(s.event) }
  check(ev.length === 0 && s.gal === atFull, `idling at the pump with F held stays shut off (${ev.length} events)`)
  run(s, fuel, 0.1, false)
  ev = run(s, fuel, 0.5, true)
  check(ev.length === 1 && ev[0] === 'full' && Math.abs(fuel.gal - P.fuelTankGal) < 1e-9, 'releasing and pressing F again tops it back off')
}

console.log('\n3. the wallet is the limit')
{
  const s = new FuelStop(), fuel = { gal: 2, floorGal: 0, dry: false }
  s.open('poi:1', 0.5)
  const ev = run(s, fuel, 10, true, 3.00)
  check(Math.abs(s.sale - 3) < 1e-9 && ev.includes('full'), `$3.00 in the wallet stops the counter at $${s.sale.toFixed(2)} (${s.gal.toFixed(2)} gal), with the shutoff`)
  check(Math.abs(fuel.gal - 8) < 1e-9, '…and the tank holds just what was paid for')
}

console.log('\n4. settle')
{
  const s = new FuelStop(), fuel = { gal: 5, floorGal: 0, dry: false }
  s.open('poi:1', 0.5)
  run(s, fuel, 3.7, true)
  const shown = s.sale
  const r = s.settle()
  check(r.sale === Math.round(shown * 100) / 100 && r.gal === s.receipt.gal, `settling charges the counter to the cent ($${r.sale.toFixed(2)} for ${r.gal.toFixed(3)} gal)`)
  check(s.state === 'idle' && !s.isOpen && s.event === 'settle', 'and closes the pump')
  const p = new FuelStop(); p.open('poi:2', 0.5)
  check(p.settle().sale === 0, 'a visit that pumped nothing costs nothing')
}

console.log('\n5. the bell')
{
  const s = new FuelStop(), fuel = { gal: 0, floorGal: 0, dry: true }
  s.open('poi:1', 0.5)
  const ev = run(s, fuel, 12, true)
  check(ev.filter(e => e === 'gallon').length === 16, `one bell per whole gallon (${ev.filter(e => e === 'gallon').length} for 16.5 gal from empty)`)
}

console.log('\n6. pump zones on the pad')
{
  const spec = PROP_MODELS.gasPump, [bx, , bz] = spec.collision.size
  const hl = POI_PARAMS.poiPadHalfLen, hw = POI_PARAMS.poiPadHalfWid
  check(spec.pumpZones?.length === 2 && Math.sign(spec.pumpZones[0].z) !== Math.sign(spec.pumpZones[1].z), 'two zones, one each side of the island')
  for (const z of spec.pumpZones) {
    check(Math.abs(z.x) + z.halfX <= hl && Math.abs(z.z) + z.halfZ <= hw, `zone at z ${z.z} lies on the ${2 * hl} x ${2 * hw} m pad`)
    check(Math.abs(z.z) - z.halfZ >= bz / 2 + 0.2, `…and clears the island's collision face by ≥ 0.2 m (${(Math.abs(z.z) - z.halfZ - bz / 2).toFixed(2)} m)`)
    check(2 * z.halfX >= P.bodyLength && 2 * z.halfZ >= P.bodyWidth, `…and takes the ${P.bodyLength} x ${P.bodyWidth} m truck`)
  }
  check(bx > 0, 'the island has a collision box to clear')
}

console.log('\n7. the tow')
{
  const E = ECONOMY_PARAMS
  check(towPrice(2, 1, E) === Math.round((E.towFlat + 2 * E.towPerKm) * 100) / 100, `day 1, 2 km: $${towPrice(2, 1, E).toFixed(2)} = flat + per-km`)
  check(Math.abs(towPrice(2, 2.31, E) - towPrice(2, 1, E) * 2.31) < 0.01, 'both terms ride the day tier')
  check(towHours(2, E) === E.towBaseHours + 2 * E.towHoursPerKm, `and costs ${towHours(2, E)} h on the clock`)
}

console.log(`\n${'═'.repeat(64)}`)
if (failures) { console.log(`FUEL-STOP GATE: ${failures} FAILURE(S)`); process.exit(1) }
console.log('FUEL-STOP GATE: all checks passed ✓')
