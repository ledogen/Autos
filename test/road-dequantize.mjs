// test/road-dequantize.mjs — BUG-16 + FEAT-20 gate: the de-quantize refit passes inside
// arcPrimitiveConnect (opts.refitShortcut / opts.refitWindow, src/road-carve.js).
//
//   1. STRAIGHTENS-BOW      — startHeading 5°/7.5° off the goal bearing on flat ground: the raw
//                             router bows 20–30 m laterally (BUG-16 serpentine); the refit stays
//                             within the geometric bound of a single big-radius correction arc.
//   2. NEGATIVE CONTROL     — refit OFF still bows > 10 m (proves the fixture reproduces BUG-16).
//   3. κ-CONTINUITY         — max |Δκ| between adjacent 2 m samples of the refit chain is bounded
//                             (clothoid ramps, no palette-arc κ jumps); raw exceeds it.
//   4. ENDPOINT + DETERMINISM — refit end pose == raw end pose (< 1e-6; the G1-join contract) and
//                             two identical calls emit identical descriptor arrays.
//   5. MIN-RADIUS           — exact primitive minRadius ≥ hardR (valid by construction: κ-averaging
//                             can only shrink |κ|; shortcut/terminal Dubins rho ≥ hardR).
//   6. SWITCHBACK PRESERVATION — steep-ramp fixture: the shortcut must NOT flatten the switchback
//                             stack through grade (excess-integral acceptance guard).
//   7. TIMING               — refit ≤ 2× raw route time (loose; prints the measured overhead %).
//
// Run: node test/road-dequantize.mjs   (exit 0 = all green)

import { arcPrimitiveConnect } from '../src/road-carve.js'
import { centerlineFromDescriptors } from '../src/centerline.js'

const HARD_R = 8
// Game-like router opts (palette + weights from data/ranger.js) so the fixture reproduces the
// in-game bow; refit opts added per-case.
const GAME = { hardR: HARD_R, gentleR: 75, radii: [200, 90, 35, 8], hbins: 24, gradeSamples: 2,
               wCurv: 8000, wHeur: 1.5, maxGrade: 0.15, emitPrimitives: true }
const REFIT = { refitShortcut: true, refitWindow: 30 }
const A = [0, 0], B = [500, 0]
const flat = () => 0

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}

// Max lateral deviation from the A→B chord (chord lies on z = 0 in these fixtures).
const maxLat = (prims) => {
    const cl = centerlineFromDescriptors(prims)
    let m = 0
    for (let s = 0; s <= cl.length; s += 2) m = Math.max(m, Math.abs(cl.pointAt(s).z))
    return m
}
// Max |Δκ| between adjacent ds-spaced samples of the exact centerline.
const maxDK = (prims, ds = 2) => {
    const cl = centerlineFromDescriptors(prims)
    let m = 0, prev = cl.curvatureAt(0)
    for (let s = ds; s <= cl.length; s += ds) {
        const k = cl.curvatureAt(s)
        m = Math.max(m, Math.abs(k - prev))
        prev = k
    }
    return m
}
// Max sampled grade of the chain against a height fn.
const maxGradeOf = (prims, hf, ds = 2) => {
    const cl = centerlineFromDescriptors(prims)
    let m = 0, pp = cl.pointAt(0), ph = hf(pp.x, pp.z)
    for (let s = ds; s <= cl.length; s += ds) {
        const p = cl.pointAt(s), h = hf(p.x, p.z)
        m = Math.max(m, Math.abs(h - ph) / ds)
        ph = h
    }
    return m
}
const endPose = (prims) => {
    const cl = centerlineFromDescriptors(prims)
    const p = cl.pointAt(cl.length), t = cl.tangentAt(cl.length)
    return [p.x, p.z, Math.atan2(t.z, t.x)]
}

// 1 + 2: BUG-16 bow — startHeading off the chord bearing on flat ground.
// Refit bound is GEOMETRIC: the accepted shortcut is one Dubins correction arc at rho ≤ 0.8·chord,
// whose lateral swing for a heading offset α is ≤ rho·(1 − cos α) — at 500 m / 7.5° (half a heading
// bin, the worst representable offset) that is 400·(1−cos 7.5°) ≈ 3.43 m. Bound 5 m ≈ 1.45× margin;
// visually a ≤5 m/500 m bow reads straight, vs the >10 m serpentine of the raw chain.
for (const deg of [5, 7.5]) {
    const th = deg * Math.PI / 180
    const base = { ...GAME, startHeading: th, goalHeading: 0 }
    const raw = arcPrimitiveConnect(A[0], A[1], B[0], B[1], flat, base)
    const on  = arcPrimitiveConnect(A[0], A[1], B[0], B[1], flat, { ...base, ...REFIT })
    const rawL = maxLat(raw), onL = maxLat(on)
    log(onL < 5, `STRAIGHTENS-BOW:${deg}°`, `refit maxLat=${onL.toFixed(2)}m (< 5 m geometric bound) over 500 m`)
    log(rawL > 10, `NEGATIVE-CONTROL:${deg}°`, `raw (refit off) maxLat=${rawL.toFixed(2)}m (> 10 m — fixture reproduces BUG-16)`)
}

// Peak fixture: refit on a genuinely TURNING route (detour around a 220 m summit).
const peak = (x, z) => 220 * Math.exp(-(((x - 250) ** 2 + z * z) / (2 * 60 * 60)))
const peakBase = { ...GAME, startHeading: 0, goalHeading: 0 }
const peakRaw = arcPrimitiveConnect(A[0], A[1], B[0], B[1], peak, peakBase)
const peakOn  = arcPrimitiveConnect(A[0], A[1], B[0], B[1], peak, { ...peakBase, ...REFIT })

// 3: κ-continuity. Interior filter step is ≤ 2·ds/(W·hardR) ≈ 0.0167 (box window W=30 shifting by
// ds=2 swaps one κ ≤ 1/hardR sample in/out of ~W/ds); the terminal Dubins seam adds ≤ 1/rho_term +
// |κ̄| ≈ 1/40 + ε ≈ 0.025–0.028 measured. Bound 0.06 ≈ 2× margin over the worst measured fixture.
{
    const flatOn = arcPrimitiveConnect(A[0], A[1], B[0], B[1], flat, { ...GAME, startHeading: 7.5 * Math.PI / 180, goalHeading: 0, ...REFIT })
    const dkF = maxDK(flatOn), dkP = maxDK(peakOn), dkRaw = maxDK(peakRaw)
    log(dkF < 0.06 && dkP < 0.06, 'KAPPA-CONTINUITY', `refit max|Δκ|/2m: flat=${dkF.toFixed(4)}, peak=${dkP.toFixed(4)} (< 0.06; interior ≈ 2·ds/(W·hardR) = 0.0167, terminal seam ≈ 1/40)`)
    log(dkRaw > 0.06, 'KAPPA-CONTROL', `raw peak max|Δκ|/2m = ${dkRaw.toFixed(4)} (> 0.06 — instant palette-arc jumps the refit removes)`)
}

// 4: endpoint pose exactness + determinism.
{
    const e = endPose(peakOn)
    const err = Math.hypot(e[0] - B[0], e[1] - B[1]) + Math.abs(e[2] - 0)
    log(err < 1e-6, 'ENDPOINT-EXACT', `refit end pose error=${err.toExponential(2)} vs (500, 0, θ=0) — G1-join contract`)
    const on2 = arcPrimitiveConnect(A[0], A[1], B[0], B[1], peak, { ...peakBase, ...REFIT })
    const same = JSON.stringify(peakOn) === JSON.stringify(on2)
    log(same, 'DETERMINISM', `two refit calls → identical descriptor arrays = ${same} (${peakOn.length} prims)`)
}

// 5: exact min-radius (valid by construction).
{
    const rF = centerlineFromDescriptors(arcPrimitiveConnect(A[0], A[1], B[0], B[1], flat, { ...GAME, startHeading: 5 * Math.PI / 180, goalHeading: 0, ...REFIT })).minRadius()
    const rP = centerlineFromDescriptors(peakOn).minRadius()
    const floor = HARD_R * (1 - 1e-9)
    log(rF >= floor && rP >= floor, 'MIN-RADIUS', `exact minRadius: flat=${rF.toFixed(2)}m, peak=${rP.toFixed(2)}m (≥ hardR=${HARD_R}m)`)
    // and the refit route still detours AROUND the peak (shortcut may not cut over the summit)
    const cl = centerlineFromDescriptors(peakOn)
    let hMax = 0
    for (let s = 0; s <= cl.length; s += 2) { const p = cl.pointAt(s); hMax = Math.max(hMax, peak(p.x, p.z)) }
    log(hMax < 180, 'DETOUR-PRESERVED', `max terrain under refit path=${hMax.toFixed(0)}m (< 180 m; 220 m summit)`)
}

// 6: switchback preservation — a 35% ramp forces a zigzag stack; the shortcut's excess-integral
// acceptance must refuse to cut it (a straight would hold 0.35 grade for 300 m).
{
    const ramp = (x) => Math.max(0, x) * 0.35
    const base = { ...GAME, startHeading: 0, goalHeading: 0 }
    const raw = arcPrimitiveConnect(0, 0, 300, 0, ramp, base)
    const on  = arcPrimitiveConnect(0, 0, 300, 0, ramp, { ...base, ...REFIT })
    const gRaw = maxGradeOf(raw, (x) => ramp(x)), gOn = maxGradeOf(on, (x) => ramp(x))
    const lRaw = centerlineFromDescriptors(raw).length, lOn = centerlineFromDescriptors(on).length
    log(gOn <= gRaw * 1.10, 'SWITCHBACK-GRADE', `refit max grade=${gOn.toFixed(3)} ≤ raw ${gRaw.toFixed(3)}·1.10 (stack not cut through grade)`)
    log(lOn > lRaw * 0.5, 'SWITCHBACK-LENGTH', `refit len=${lOn.toFixed(0)}m vs raw ${lRaw.toFixed(0)}m (zigzag kept, not a ${300}m straight)`)
}

// 7: timing — loose 2× assert; the real ≤+25% cold-route budget is reported for the record.
{
    const base = { ...GAME, startHeading: 5 * Math.PI / 180, goalHeading: 0 }
    const N = 10
    for (let i = 0; i < 2; i++) { arcPrimitiveConnect(A[0], A[1], B[0], B[1], peak, base); arcPrimitiveConnect(A[0], A[1], B[0], B[1], peak, { ...base, ...REFIT }) } // warm
    let t0 = performance.now()
    for (let i = 0; i < N; i++) arcPrimitiveConnect(A[0], A[1], B[0], B[1], peak, base)
    const off = (performance.now() - t0) / N
    t0 = performance.now()
    for (let i = 0; i < N; i++) arcPrimitiveConnect(A[0], A[1], B[0], B[1], peak, { ...base, ...REFIT })
    const on = (performance.now() - t0) / N
    log(on < off * 2, 'TIMING', `route ${off.toFixed(1)}ms → refit ${on.toFixed(1)}ms — overhead ${((on / off - 1) * 100).toFixed(1)}% (budget ≤ +25%; loose 2× assert, wall-clock gates flake)`)
}

console.log(`\n================================================================`)
console.log(`ROAD-DEQUANTIZE GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
