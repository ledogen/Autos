// test/gps-readout.mjs — BUG-205 (owner 2026-11-17: "the waypoint distance measure at top of screen is wrong"). The run HUD's
// "N km to go" reads the metres left along the line the GPS draws to the stop it leads to: on a multi-drop the current leg
// (guideRoute's), never the whole job; on a fetch the outbound leg, never out-and-back; and routeLeftM (the tutorial's and,
// since BUG-205, the waypoint's readout) the arc along a winding line, never the crow-flies chord. Pure node, synthetic
// lines: the census against the real planner on random seeds is test/gps-multistop-census.mjs.
import { MissionSystem, routeLeftM, polyCumOf } from '../src/mission.js'

let fails = 0
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); if (!ok) fails++ }

// A zig-zag road: 10 m vertices, 200 m east then 200 m north then 200 m east (600 m of road, a 447 m chord).
const poly = []
for (let i = 0; i <= 20; i++) poly.push({ x: i * 10, z: 0 })
for (let i = 1; i <= 20; i++) poly.push({ x: 200, z: i * 10 })
for (let i = 1; i <= 20; i++) poly.push({ x: 200 + i * 10, z: 200 })
const car = { x: 0, z: 0 }
const ms = new MissionSystem({ getRoad: () => null, getCar: () => car, getSeed: () => 1, getRegion: () => null,
                               teleport () {}, setMapOpen () {}, onChange () {} })
const at = (i) => { car.x = poly[i].x; car.z = poly[i].z }

// A two-drop: stop 1 at vertex 20 (the first corner, 200 m), the last at the end (600 m).
const multi = { poly, polyCum: polyCumOf(poly), end: poly.at(-1),
                legs: [{ end: poly[20], polyIdx: 20 }, { end: poly.at(-1), polyIdx: poly.length - 1 }] }
ms.mission = multi; ms.state = 'running'; ms.leg = 0; ms._polyIdx = 0
at(5)
check('multi-drop, leg 1: the metres to stop 1, not to the last stop', Math.abs(ms.routeRemaining() - 150) < 1e-6, `${ms.routeRemaining().toFixed(1)} m (job end 550 m)`)
at(15)
check('…and it counts down along the leg', Math.abs(ms.routeRemaining() - 50) < 1e-6, `${ms.routeRemaining().toFixed(1)} m`)
check('…and the total is that leg plus the legs after it (the whole job left)', Math.abs(ms.routeTotalRemaining() - 450) < 1e-6, `${ms.routeTotalRemaining().toFixed(1)} m`)
ms._polyIdx = multi.legs[0].polyIdx; ms.leg = 1   // acquire() at stop 1
at(30)
check('leg 2: the metres to the last stop', Math.abs(ms.routeRemaining() - 300) < 1e-6, `${ms.routeRemaining().toFixed(1)} m`)
check('…on the last leg the total IS the leg (one number, no parentheses)', ms.routeTotalRemaining() === ms.routeRemaining())
// A single-stop job (no legs): total = to go.
ms.mission = { poly, polyCum: polyCumOf(poly), end: poly.at(-1) }; ms.leg = 0; ms._polyIdx = 0
at(12)
check('single stop: the total equals the first number', ms.routeTotalRemaining() === ms.routeRemaining() && Math.abs(ms.routeRemaining() - 480) < 1e-6)

// A fetch: out to the pickup at the far end and back the same way (the poly retraces itself).
const fpoly = [...poly, ...poly.slice(0, -1).reverse()]
const fetch = { poly: fpoly, polyCum: polyCumOf(fpoly), end: poly[0], fetch: true,
                legs: [{ end: poly.at(-1), polyIdx: poly.length - 1 }, { end: poly[0] }] }
ms.mission = fetch; ms.leg = 0; ms._polyIdx = 0
at(10)
check('fetch, out: the metres to the pickup, not out and back', Math.abs(ms.routeRemaining() - 500) < 1e-6, `${ms.routeRemaining().toFixed(1)} m (out and back 1100 m)`)
check('…its total is out and back', Math.abs(ms.routeTotalRemaining() - 1100) < 1e-6, `${ms.routeTotalRemaining().toFixed(1)} m`)
for (let i = 11; i <= 58; i++) { at(i); ms.routeRemaining() }   // drive on to 20 m short of the pickup
check('…never matched onto the return beside it near the pickup', Math.abs(ms.routeRemaining() - 20) < 1e-6, `${ms.routeRemaining().toFixed(1)} m`)
ms._polyIdx = fetch.legs[0].polyIdx; ms.leg = 1
at(40)
check('fetch, back: the metres home from the pickup', Math.abs(ms.routeRemaining() - 400) < 1e-6, `${ms.routeRemaining().toFixed(1)} m`)

// The waypoint's (and the tutorial's) routeLeftM: the arc, never the chord.
const line = { poly, polyCum: polyCumOf(poly) }
const left = routeLeftM(line, 0, 0)
check('routeLeftM at the start is the road length, not the chord', Math.abs(left - 600) < 1e-6, `${left.toFixed(0)} m vs crow ${Math.hypot(400, 200).toFixed(0)} m`)
check('…and at the second corner the last leg', Math.abs(routeLeftM(line, 200, 200) - 200) < 1e-6)

console.log(fails ? `\nFAIL: ${fails}` : '\nALL OK')
process.exit(fails ? 1 : 0)
