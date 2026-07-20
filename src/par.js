/**
 * src/par.js — FEAT-29 par oracle: a physics-honest reference time for any route.
 *
 * Par is the time a FIXED reference point mass on a friction circle would take to drive a
 * route. It is the economic foundation of story mode: mission payout is margin against par
 * (SM-INV-4), so par must be a pure function of ROAD GEOMETRY and fixed reference constants —
 * never of the player's car.
 *
 * SM-INV-2 — par NEVER scales with the car. Nothing in this module may read RANGER_PARAMS,
 *   vehicleState, the drivetrain, or any live vehicle quantity. The only tuning knobs are
 *   PAR_REF below, which are DESIGN constants, not vehicle stats. (Gate: par-oracle.mjs
 *   asserts par is bit-identical before/after mutating vehicle params.)
 * SM-INV-3 — this module computes a number. It renders nothing and knows nothing about a HUD.
 *
 * Pure math: no THREE, no DOM, no globals. Consumers pass duck-typed geometry
 * (`curvatureAt(s)`, `tangentAt(s)`, `length`) plus a `gradeAt(s)` elevation callback, so this
 * imports nothing and runs headlessly like tire.js.
 *
 * DESIGN.md ("Where missions and POIs live", RATIFIED 2026-07-20): mission endpoints and POIs
 * are arbitrary (runKey, arcS) points on an edge, never snapped to graph nodes. So the unit of
 * work here is an ARC RANGE on one centerline, and a route is a chain of ranges — the first and
 * last partial. The speed profile is solved across the WHOLE chain, not per-segment, or a fast
 * approach into a slow corner one edge later would price as free.
 */

/**
 * Fixed reference vehicle (SM-INV-2). A competent driver in a competent truck — deliberately
 * NOT the Ranger, and deliberately not tied to it: these are design knobs for the payout curve.
 */
export const PAR_REF = {
    // CALIBRATION NOTE: these are first-pass numbers. Par currently prices a winding mountain
    // leg at ~55-60 km/h average, which is a hard but not absurd target in the Ranger. They are
    // meant to be re-tuned against recorded human drives (FEAT-29 acceptance: "within plausible
    // bounds of a recorded human drive, report-only") — that is what the beta mission harness is
    // for. Tune HERE, never by touching the vehicle (SM-INV-2).
    mu: 0.75,          // reference friction coefficient (dimensionless)
    accel: 2.8,        // powertrain-limited longitudinal accel on the flat (m/s²)
    brake: 5.5,        // braking decel cap (m/s²) — also friction-circle limited below
    vMax: 28.0,        // reference top/cruise speed (m/s ≈ 101 km/h)
    vMin: 2.5,         // speed floor so a hairpin can't price as infinite time (m/s)
    junctionRadius: 18, // effective corner radius when turning through a node (m)
    junctionDeadband: 0.14, // heading change below this (rad, ~8°) is not a corner at all
    g: 9.81,
}

const DS = 2.0        // profile sample spacing along the route (m) — 2 m is well below the
                      // shortest primitive the router emits, so κ is never aliased.
const EPS = 1e-9

/**
 * One traversed piece of one edge, in TRAVEL order.
 * @typedef {object} ParSegment
 * @property {{ curvatureAt(s:number):number, tangentAt(s:number):{x:number,z:number}, length:number }} centerline
 * @property {(s:number)=>number} gradeAt   — routed design elevation at centerline arc s (m)
 * @property {number} s0                    — arc position where this segment is entered (m)
 * @property {number} s1                    — arc position where it is left (m). s1 < s0 means
 *                                            the edge is driven against its own arc direction.
 */

/**
 * Sample a route into a flat profile in travel order.
 * Returns parallel arrays: `d` (3D distance travelled to sample i), `kappa` (|1/m|),
 * `sinT`/`cosT` (grade), plus `capIdx`/`capV` for junction speed caps at segment joins.
 */
function sampleRoute(segments) {
    const d = [], kappa = [], sinT = [], cosT = []
    const caps = []            // { i, v } hard speed caps injected at segment joins
    let dist = 0
    let prevTangent = null

    for (let seg = 0; seg < segments.length; seg++) {
        const { centerline, gradeAt, s0, s1 } = segments[seg]
        const dir = s1 >= s0 ? 1 : -1
        const span = Math.abs(s1 - s0)
        if (span < EPS) continue
        const n = Math.max(1, Math.ceil(span / DS))

        // Junction cap: heading change between the previous segment's exit tangent and this
        // segment's entry tangent. A node is not a curve the router smoothed — each edge was
        // graded standalone — so the corner through it must be priced explicitly.
        const t0 = centerline.tangentAt(s0)
        const entry = { x: t0.x * dir, z: t0.z * dir }
        if (prevTangent) {
            const dot = Math.max(-1, Math.min(1, prevTangent.x * entry.x + prevTangent.z * entry.z))
            const turn = Math.acos(dot)
            if (turn > PAR_REF.junctionDeadband) {
                // Effective radius shrinks toward junctionRadius as the turn approaches 90°+.
                const t = Math.min(1, turn / (Math.PI / 2))
                const rEff = PAR_REF.junctionRadius / Math.max(EPS, t)
                caps.push({ i: Math.max(0, d.length - 1), v: Math.sqrt(PAR_REF.mu * PAR_REF.g * rEff) })
            }
        }

        for (let i = 0; i <= n; i++) {
            const s = s0 + dir * span * (i / n)
            const dsXZ = span / n
            const k = Math.abs(centerline.curvatureAt(s))
            // Grade from the routed design elevation, differenced over the sample step.
            const sBack = s - dir * dsXZ * 0.5, sFwd = s + dir * dsXZ * 0.5
            const dy = gradeAt(clamp(sFwd, centerline.length)) - gradeAt(clamp(sBack, centerline.length))
            const theta = Math.atan2(dy, dsXZ)   // + uphill in travel direction

            if (i > 0) dist += dsXZ / Math.max(0.2, Math.cos(theta))   // 3D distance
            // The join sample is shared: skip the duplicate at i===0 of later segments.
            if (i === 0 && d.length > 0) continue
            d.push(dist); kappa.push(k); sinT.push(Math.sin(theta)); cosT.push(Math.cos(theta))
        }
        prevTangent = (() => { const t = centerline.tangentAt(s1); return { x: t.x * dir, z: t.z * dir } })()
    }
    return { d, kappa, sinT, cosT, caps }
}

function clamp(s, len) { return s < 0 ? 0 : (s > len ? len : s) }

/**
 * computePar(segments, ref) → { time, distance, speeds }
 *
 * Three passes over the sampled route:
 *   1. Curvature envelope — v² ≤ μ·g·cosθ·R bounds cornering speed at every sample.
 *   2. Forward pass — accel-limited, the reference starts from rest.
 *   3. Backward pass — brake-limited, the reference arrives at rest.
 * Longitudinal capability is friction-circle coupled: whatever grip the corner is already
 * using is not available to accelerate or brake with. Integrating ds/v_avg gives the time.
 *
 * @param {ParSegment[]} segments — the route, in travel order
 * @param {object} [ref] — PAR_REF override (tests / tuning only)
 * @returns {{ time:number, distance:number, speeds:Float64Array, dist:Float64Array }}
 */
export function computePar(segments, ref = PAR_REF) {
    const { d, kappa, sinT, cosT, caps } = sampleRoute(segments || [])
    const n = d.length
    if (n < 2) return { time: 0, distance: 0, speeds: new Float64Array(0), dist: new Float64Array(0) }

    const gmu = ref.mu * ref.g
    const v = new Float64Array(n)

    // 1. Curvature envelope.
    for (let i = 0; i < n; i++) {
        const kap = kappa[i]
        const vCorner = kap < EPS ? Infinity : Math.sqrt((gmu * cosT[i]) / kap)
        v[i] = Math.max(ref.vMin, Math.min(ref.vMax, vCorner))
    }
    // Junction caps sit on top of the envelope.
    for (const c of caps) {
        const i = Math.min(n - 1, c.i)
        v[i] = Math.max(ref.vMin, Math.min(v[i], c.v))
    }

    // 2. Forward (accel-limited), from rest.
    v[0] = 0
    for (let i = 1; i < n; i++) {
        const ds = d[i] - d[i - 1]
        const a = longCap(v[i - 1], kappa[i - 1], ref.accel, ref, sinT[i - 1], +1)
        const vf = Math.sqrt(Math.max(0, v[i - 1] * v[i - 1] + 2 * a * ds))
        if (vf < v[i]) v[i] = vf
    }

    // 3. Backward (brake-limited), to rest.
    v[n - 1] = 0
    for (let i = n - 2; i >= 0; i--) {
        const ds = d[i + 1] - d[i]
        const a = longCap(v[i + 1], kappa[i + 1], ref.brake, ref, sinT[i + 1], -1)
        const vb = Math.sqrt(Math.max(0, v[i + 1] * v[i + 1] + 2 * a * ds))
        if (vb < v[i]) v[i] = vb
    }

    // Integrate ds / v̄. Trapezoid on speed; the vMin floor keeps this finite at the ends.
    let time = 0
    for (let i = 1; i < n; i++) {
        const ds = d[i] - d[i - 1]
        const vbar = Math.max(ref.vMin * 0.5, 0.5 * (v[i] + v[i - 1]))
        time += ds / vbar
    }
    return { time, distance: d[n - 1], speeds: v, dist: Float64Array.from(d) }
}

/**
 * Longitudinal accel available at speed `vv` on a corner of curvature `kap`, given a
 * powertrain/brake cap and the grade. `sign` is +1 accelerating, -1 braking (the returned
 * magnitude is always ≥ 0 in the direction of travel of that pass).
 * Friction circle: a_long ≤ √((μg)² − a_lat²), a_lat = v²κ. Grade adds/removes g·sinθ.
 */
function longCap(vv, kap, cap, ref, sinTheta, sign) {
    const gmu = ref.mu * ref.g
    const aLat = vv * vv * kap
    const grip = Math.sqrt(Math.max(0, gmu * gmu - aLat * aLat))
    let a = Math.min(cap, grip)
    // Uphill costs the forward pass and helps the backward (braking) pass, and vice versa.
    a -= sign * ref.g * sinTheta
    return Math.max(0.15, a)   // floor: the reference never stalls outright
}

/**
 * Convenience: par for a single whole edge (the s0=0 → s1=length case).
 */
export function parForEdge(centerline, gradeAt, ref = PAR_REF) {
    return computePar([{ centerline, gradeAt, s0: 0, s1: centerline.length }], ref)
}

/**
 * Format a par/elapsed time as m:ss.t for HUD copy.
 */
export function formatTime(sec) {
    if (!isFinite(sec)) return '--:--'
    const m = Math.floor(sec / 60), s = sec - m * 60
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`
}

/**
 * Grade a finished run against par. Margin is par-relative so it reads the same on a 2-minute
 * hop and a 20-minute haul; the letter is a bucketing of that ratio.
 */
export function gradeRun(elapsed, par) {
    const ratio = par > 0 ? elapsed / par : Infinity
    let letter = 'D'
    if (ratio <= 0.80) letter = 'S'
    else if (ratio <= 0.92) letter = 'A'
    else if (ratio <= 1.05) letter = 'B'
    else if (ratio <= 1.25) letter = 'C'
    return { ratio, letter, margin: par - elapsed }
}
