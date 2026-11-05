// GATE (BUG-114, owner 2026-11-05: "the truck was teleported but maybe still upside down or somehow
// clipping through the ground because it got kinda launched rendering me upside down on the road
// outside the service center"): a tow seats the truck clear of the place it tows to.
//
// The shop tow used to seat at the pad centre, which is where an auto shop's placeholder cube stands
// (it has no model). Measured on flat ground: step 1 already spun the truck (|ω| 0.10 rad/s), it
// climbed onto the 1.6 m cube and came to rest perched on its belly 1.1 m above ride height. poi.js
// towSeat now seats a keyless pad on its road-side strip, and a pump island in its pump zone.
//
//   1. The auto shop is still KEYLESS with no yard — towSeat's strip assumes the cube is the only solid.
//   2. The shop seat is within the interaction radius (the brake opens the service screen) and the
//      truck's corners sit on the pad.
//   3. Real physics, every tow destination (a keyless shop at four road headings, every model with
//      pump zones at two): the truck seated at towSeat with the marker's colliders (PoiPhysics + the
//      wheel query) behaves exactly like the same seat on bare ground — no first-step spin, upright,
//      at rest, at the same height. The old pad-centre seat is reported for contrast.
//
// Run: node test/tow-seat.mjs
import * as THREE from 'three'
import { stepPhysics } from '../src/physics.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { PoiSystem, POI_PARAMS, POI_ROSTER, towSeat } from '../src/poi.js'
import { PoiPhysics } from '../src/terrain-physics.js'
import { padSd } from '../src/road-carve.js'
import { PROP_MODELS } from '../data/prop-models.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'

let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
    if (!ok) fails++
}

const DT = 1 / 60, DROP = 0.3   // main.js _towTo seats with drop 0.3
const P = { ...RANGER_PARAMS, _tireFz: [0, 0, 0, 0], _suspForceAccum: [0, 0, 0, 0],
    _hubNormalXZ: [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 })) }
const eq = computeStaticEquilibrium(P)

/** A pad record the way PoiSystem builds one, road heading `h` (forward (−sin h, −cos h)). */
const pad = (h, model = null) => {
    const tx = -Math.sin(h), tz = -Math.cos(h), nx = -tz, nz = tx   // n ⟂ t, the side away from the road
    const yaw = Math.atan2(nx, nz)
    return { id: `pad@${h}`, x: 0, z: 0, y: 0.25, baseY: 0, tx, tz, nx, nz, yaw, modelYaw: yaw,
        halfLen: POI_PARAMS.poiPadHalfLen, halfWid: POI_PARAMS.poiPadHalfWid, cornerR: POI_PARAMS.poiPadCornerR,
        collision: model?.collision ?? null, pumpZones: model?.pumpZones ?? null }
}

/** Seat at (x, z, heading) on flat ground, `marker` solid or absent; 2 s of physics. */
async function drop (seat, marker) {
    const vs = makeVehicleState(P)
    vs.position.set(seat.x, eq.bodyY + DROP, seat.z)
    vs.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), seat.heading)
    const ctx = await makeEngineCtx(vs, P, { groundFn: () => 0, extent: 32, cell: 2 })
    const pois = new PoiSystem({ getParams: () => ({}) })
    pois._list = marker ? [marker] : []
    if (marker) new PoiPhysics(ctx.engine).sync([marker], POI_PARAMS.poiCubeSize)
    const query = (cx, cy, cz, r) => {
        const hits = []
        if (r - cy > 0) hits.push({ normal: new THREE.Vector3(0, 1, 0), depth: r - cy, contactPoint: new THREE.Vector3(cx, 0, cz) })
        const h = pois.queryContact(cx, cy, cz, r)
        if (h) {
            const t = r - h.depth
            hits.push({ normal: new THREE.Vector3(h.nx, h.ny, h.nz), depth: h.depth,
                contactPoint: new THREE.Vector3(cx - h.nx * t, cy - h.ny * t, cz - h.nz * t) })
        }
        return hits
    }
    stepPhysics(vs, P, DT, query, ctx)
    const spin = vs.angularVelocity.length()
    let peak = vs.position.y
    for (let i = 0; i < 120; i++) { stepPhysics(vs, P, DT, query, ctx); peak = Math.max(peak, vs.position.y) }
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(vs.quaternion).y
    const out = { spin, peak, y: vs.position.y, up, v: vs.velocity.length(), moved: Math.hypot(vs.position.x - seat.x, vs.position.z - seat.z) }
    ctx.dispose()
    return out
}

// ── 1. The shop is keyless ────────────────────────────────────────────────────────────────────
const shop = POI_ROSTER.find(r => r.type === 'autoShop')
check('the auto shop is keyless with no yard (towSeat\'s road-side strip assumes the cube is its only solid)',
    shop && shop.model == null && !shop.modelPool && !shop.yard, JSON.stringify(shop))

// ── 2. Shop seat geometry ─────────────────────────────────────────────────────────────────────
{
    const q = pad(0.7), s = towSeat(q)
    const d = Math.hypot(s.x - q.x, s.z - q.z)
    check(`the shop seat is in reach of the service screen (${d.toFixed(2)} m ≤ poiInteractR ${POI_PARAMS.poiInteractR} m)`, d <= POI_PARAMS.poiInteractR)
    // The truck's footprint (physics.js CHASSIS_PROFILE: nose −2.05, tail 2.65, 0.85 half-width) on the pad.
    const fx = -Math.sin(s.heading), fz = -Math.cos(s.heading), rx = -fz, rz = fx
    const corners = [[-2.05, -0.85], [-2.05, 0.85], [2.65, -0.85], [2.65, 0.85]]
        .map(([back, side]) => padSd(q, s.x - fx * back + rx * side - q.x, s.z - fz * back + rz * side - q.z))
    check(`the truck's corners sit on the pad (worst ${Math.max(...corners).toFixed(2)} m inside the edge ≤ 0)`, Math.max(...corners) <= 0)
}

// ── 3. Physics: seated at towSeat, the marker changes nothing ─────────────────────────────────
const cases = [0, 0.7, 2.2, 4.1].map(h => ({ name: `keyless shop, road heading ${h}`, q: pad(h) }))
for (const [key, m] of Object.entries(PROP_MODELS)) {
    if (m.pumpZones) for (const h of [0, 2.2]) cases.push({ name: `${key} pump zone, road heading ${h}`, q: pad(h, m) })
}
for (const { name, q } of cases) {
    const s = towSeat(q)
    const bare = await drop(s, null), real = await drop(s, q)
    check(`${name}: no first-step spin (|ω| ${real.spin.toFixed(3)} rad/s), upright (up.y ${real.up.toFixed(4)}), at rest (|v| ${real.v.toFixed(3)} m/s), `
        + `at bare-ground height (Δy ${(real.y - bare.y).toFixed(3)} m), not shoved (${real.moved.toFixed(3)} m vs ${bare.moved.toFixed(3)})`,
        real.spin < 0.02 && real.up > 0.999 && real.v < 0.05 && Math.abs(real.y - bare.y) < 0.01 && Math.abs(real.moved - bare.moved) < 0.02)
}
{
    const q = pad(0.7), old = await drop({ x: q.x, z: q.z, heading: Math.atan2(-q.tx, -q.tz) }, q)
    console.log(`       for contrast, the old pad-centre seat: step-1 |ω| ${old.spin.toFixed(2)} rad/s, peak ${(old.peak - eq.bodyY).toFixed(2)} m over ride height, resting ${(old.y - eq.bodyY).toFixed(2)} m over it`)
}

console.log(fails ? `\n${fails} FAILED` : '\nall tow-seat checks passed')
process.exit(fails ? 1 : 0)
