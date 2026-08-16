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
 *
 * ⚠ SM-INV-2 — PAR MUST NEVER READ CAMBER. DO NOT "improve" this by folding banking in.
 *
 * Par integrates CURVATURE and GRADE only, against a fixed reference mu. Adding camber would look
 * like an accuracy win and would quietly break the game, because camber is NOT a static property of
 * the road: the story layer drives the superelevation params (`camberKneeRadiusM`) as a run-layer
 * parameter state — the Highway's favour banks your sweepers harder the longer you stay on the
 * network, and flattens them when you take a shortcut (see
 * .planning/story-mode/spirits-and-pacts.md #05). A par that read camber would therefore scale with
 * run state, and SM-INV-2 is explicit that par scales with NOTHING — not the car, not run age.
 *
 * The whole design depends on this asymmetry: the road can get faster while par stays put. That is
 * how the Highway's boon is a real reward without ever touching the oracle, exactly as the Shortcut's
 * cuts are (a shorter route, not a modified par). Keep par blind to anything a run can change.
 */
export const PAR_REF = {
    // CALIBRATION (FEAT-30). Three passes:
    //
    // (1) 2026-07-20, headless: the constant-steer harness measured steady-state mu 0.577 mean,
    //     and mu was set to 0.577 × 0.85 = 0.49 assuming a human realizes only a FRACTION of the
    //     steady-state envelope. WRONG IN SIGN — the owner's lab skidpad laps recorded mu 0.743
    //     (R=25 m) and 0.724 (R=60 m), ABOVE the harness: its "settled trim" test rejects exactly
    //     the ragged, throttle-steered line a human actually corners on. (The R=150 m reading,
    //     0.647, is POWER limited, not grip limited — never average it in.)
    //
    // (2) 2026-07-20: mu = 0.62 ≈ 0.73 (human skidpad) × 0.85, guessing 0.85 as the fraction of a
    //     dedicated-skidpad limit that survives real corners.
    //
    // (3) 2026-08-01, fitted against 20 recorded human drives with subjective "felt" labels
    //     (test/calibrate-par.mjs over runs/*.json). That 0.85 discount ALSO had the sign
    //     backwards, for a different reason: the reference is CENTERLINE-BOUND, but a human cuts
    //     the corner with the full road width, so the effective centerline mu of a committed drive
    //     EXCEEDS physical skidpad grip — and the data shows it (at mu 0.62, drives that FELT
    //     "slow" still graded A at ratio 0.85, and the fit's twisty-route bias pointed straight at
    //     mu). mu is a DESIGN knob for the payout curve, not a grip claim. accel/brake moved to
    //     the MEASURED truck values (0-100 in ~8.5-9.5 s ⇒ ~3.0 m/s²; braking 7.0 m/s²) — the old
    //     brake 5.5 under-priced every corner entry.
    //
    // (4) 2026-08-16, THE RE-ANCHOR (owner). Pass (3) tuned mu so a felt-par drive landed ~0.92,
    //     because par was then the middle of the B band. Par no longer means that: par is now the
    //     C/D boundary — *the slowest you can drive without failing* — so a felt-par drive SHOULD
    //     price near 1.0, and the whole "felt-par ≈ 0.92, par stays ~8% generous" target of pass
    //     (3) is retired. Two consequences, and they are deliberately kept apart:
    //       • mu 0.90 → 0.80. A small, honest step back toward measured grip (skidpad 0.72-0.74)
    //         now that mu no longer has to carry the anchoring. Worth only ~2.5% of ratio.
    //       • the ~25% that actually moves par to the failing line is PAR_SLACK below, NOT mu.
    //         Reaching it through mu would require an implausible reference driver and would
    //         quietly turn a physical constant into a fudge factor.
    //
    // Measured 2026-08-16 while re-anchoring (test/, analytic drivetrain envelope): this reference
    // is PESSIMISTIC on acceleration at every speed and grade — the real truck delivers roughly
    // 2-3× PAR_REF.accel below 20 m/s. Par's difficulty lives almost entirely in mu (corner speed),
    // exactly as pass (1) said. Do not "fix" accel to match the truck without re-cutting the rank
    // thresholds in the same pass: it would slash par and inflate every letter.
    //
    // Note from pass (1): mu is the DOMINANT dial. vMax is nearly free (these roads are
    // curvature-limited essentially everywhere — 42.6 vs 30.0 m/s moved par by under a second),
    // and accel/brake are secondary. Tune HERE, never by touching the vehicle (SM-INV-2) — and
    // re-run test/calibrate-par.mjs when new labelled runs land in runs/.
    mu: 0.80,          // EFFECTIVE centerline friction — see (3)/(4): line-cutting, not tire grip
    accel: 3.0,        // powertrain-limited longitudinal accel on the flat (m/s²) — measured
    brake: 7.0,        // braking decel cap (m/s²) — measured; friction-circle limited below
    // vMax is the FLAT terminal speed, and it sets the drag coefficient (k = accel / vMax²)
    // rather than acting as a hard clamp. That matters: with a hard clamp, par hit the cap and
    // cruised regardless of gravity, so a long descent priced the same as flat ground — measured
    // at 0.3 s per 1500 m, against a driver who was demolishing par on downhill routes. With drag,
    // terminal speed solves a_pt + g·sin(-θ) = k·v² and rises downhill / falls uphill on its own.
    vMax: 28.0,        // m/s ≈ 101 km/h — terminal speed ON THE FLAT
    vCeil: 46.0,       // m/s — hard ceiling; the measured stock-truck vMax, never exceeded
    vMin: 2.5,         // speed floor so a hairpin can't price as infinite time (m/s)
    junctionRadius: 18, // effective corner radius when turning through a node (m)
    junctionDeadband: 0.14, // heading change below this (rad, ~8°) is not a corner at all
    g: 9.81,
}

/**
 * PAR_SLACK — how much slower than the committed reference drive is still a PASS.
 * [RATIFIED 2026-08-16, owner — the par re-anchor]
 *
 * Par used to be one number doing two jobs: a physical duration AND the standard the player is
 * measured against. Those pulled in opposite directions the moment par stopped meaning "the
 * expected drive" and started meaning "the slowest drive that isn't a failure", so they are now
 * separate:
 *
 *     referenceTime = computePar's physics      — road geometry × PAR_REF. Scales with nothing else.
 *     par           = referenceTime × PAR_SLACK — the standard. THE design knob.
 *     ratio         = elapsed / par             — 1.0 IS the C/D boundary, by construction.
 *
 * Why not fold this into PAR_REF: reaching a ~25% slower standard through mu/accel alone would
 * need a reference driver nobody believes in, and would turn a physical constant into a fudge
 * factor. SM-INV-2 is satisfied either way — par still scales with route geometry and nothing a
 * run can change — but this way the physics stays honest and the judgment stays legible and in
 * ONE place. Move the standard here; move the physics in PAR_REF.
 *
 * Changing this rescales every ratio in the game, so the rank thresholds and the payout line move
 * with it — see economy.js (they are derived as fractions of a PASS, not of the reference drive).
 *
 * Value fitted 2026-08-16 against the 20-run corpus (test/calibrate-par.mjs): 1.15 is the point
 * where every felt-"very slow" drive lands at or above ratio 1.0 (1.017 / 1.018 / 1.457) and every
 * committed or normal drive lands below it. That is the definition made measurable — the standard
 * is exactly where careless driving starts to fail.
 */
export const PAR_SLACK = 1.15

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
 * Sample a route into a flat profile in travel order. Exported so the run-export can report the
 * same curvature/grade profile par actually priced, rather than a re-derivation that could drift.
 * Returns parallel arrays: `d` (3D distance travelled to sample i), `kappa` (|1/m|),
 * `sinT`/`cosT` (grade), plus `capIdx`/`capV` for junction speed caps at segment joins.
 */
export function sampleRoute(segments) {
    const d = [], kappa = [], sinT = [], cosT = []
    const caps = []            // { i, v } hard speed caps injected at segment joins
    let stops = 0              // segment ends the driver must pull up at (FEAT-61)
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
        // FEAT-61: a WAYPOINT, not a corner. The paper route's stops are places the driver comes to
        // rest and sets off again — so the envelope is pinned to ZERO here (see the cap loop in
        // computePar for why this one ignores vMin) or the oracle prices a fifteen-stop round as an
        // uninterrupted blast: measured at 73 km/h average, with 2 of ~1150 samples below 3 m/s,
        // and those two were the first and the last.
        //
        // No dwell rides along with it. The whole cost is the braking and the re-acceleration,
        // which the forward/backward passes derive from the truck's own accel and brake figures —
        // owner, 2026-08-14: a paper goes out of the window on the move, so what a delivery really
        // costs is the stop itself, not time spent parked.
        if (segments[seg].stop) { caps.push({ i: d.length - 1, v: 0, stop: true }); stops++ }

        prevTangent = (() => { const t = centerline.tangentAt(s1); return { x: t.x * dir, z: t.z * dir } })()
    }
    return { d, kappa, sinT, cosT, caps, stops }
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
    const { d, kappa, sinT, cosT, caps, stops } = sampleRoute(segments || [])
    const n = d.length
    if (n < 2) return { time: 0, distance: 0, speeds: new Float64Array(0), dist: new Float64Array(0) }

    const gmu = ref.mu * ref.g
    const v = new Float64Array(n)

    // Drag coefficient implied by the flat terminal speed: at v = vMax on the flat, powertrain
    // accel is exactly cancelled by drag. Everything downhill/uphill then falls out of the physics.
    const kDrag = ref.accel / (ref.vMax * ref.vMax)
    const vCeil = ref.vCeil ?? ref.vMax

    // 1. Curvature envelope. Capped by the hard ceiling, NOT by vMax — on a descent the reference
    // is allowed past its flat cruise speed, which is the whole point.
    for (let i = 0; i < n; i++) {
        const kap = kappa[i]
        const vCorner = kap < EPS ? Infinity : Math.sqrt((gmu * cosT[i]) / kap)
        v[i] = Math.max(ref.vMin, Math.min(vCeil, vCorner))
    }
    // Junction caps sit on top of the envelope.
    //
    // A STOP is not a cap, it is a zero, and it is the one place the vMin floor must not apply
    // (FEAT-61). vMin exists so a hairpin cannot price as infinite time; a delivery is a genuine
    // halt, and floored at 2.5 m/s it would price as a slow roll past the porch. Pinned to zero,
    // the forward and backward passes below do the rest on their own — the reference brakes to
    // rest at the porch and pulls away from rest afterwards, so the cost is whatever the road and
    // the truck's real accel/brake say it is rather than a number somebody picked.
    // ORDER MATTERS, and it is not obvious: a porch sits at a segment JOIN, so the junction cap for
    // the next segment lands on the same sample index as the stop. Applied in array order the
    // junction cap comes second and floors the zero back up to vMin — a delivery at a bend priced
    // as a slow roll past the house, silently, on some stops and not others. So junctions first,
    // then stops, and a stop always wins the index it shares.
    for (const c of caps) {
        if (c.stop) continue
        const i = Math.min(n - 1, c.i)
        v[i] = Math.max(ref.vMin, Math.min(v[i], c.v))
    }
    for (const c of caps) {
        if (c.stop) v[Math.min(n - 1, c.i)] = 0
    }

    // 2. Forward (accel-limited), from rest. `a` may be NEGATIVE — above terminal speed, or on a
    // climb steeper than the powertrain can hold — and the reference then slows, which is correct.
    v[0] = 0
    for (let i = 1; i < n; i++) {
        const ds = d[i] - d[i - 1]
        const vv = v[i - 1]
        const a = Math.min(ref.accel, gripLimit(vv, kappa[i - 1], gmu))   // powertrain, grip-capped
            - ref.g * sinT[i - 1]                                        // gravity along the road
            - kDrag * vv * vv                                            // drag
        const vf = Math.sqrt(Math.max(ref.vMin * ref.vMin, vv * vv + 2 * a * ds))
        if (vf < v[i]) v[i] = vf
    }

    // 3. Backward (brake-limited), to rest. Gravity and drag BOTH help you slow going uphill and
    // hinder you going down, so they enter with the opposite sign to the forward pass.
    v[n - 1] = 0
    for (let i = n - 2; i >= 0; i--) {
        const ds = d[i + 1] - d[i]
        const vv = v[i + 1]
        const a = Math.max(0.15,
            Math.min(ref.brake, gripLimit(vv, kappa[i + 1], gmu))
            + ref.g * sinT[i + 1]
            + kDrag * vv * vv)
        const vb = Math.sqrt(Math.max(0, vv * vv + 2 * a * ds))
        if (vb < v[i]) v[i] = vb
    }

    // Integrate ds / v̄. Trapezoid on speed; the vMin floor keeps this finite at the ends.
    let time = 0
    for (let i = 1; i < n; i++) {
        const ds = d[i] - d[i - 1]
        const vbar = Math.max(ref.vMin * 0.5, 0.5 * (v[i] + v[i - 1]))
        time += ds / vbar
    }
    // PAR_SLACK turns the reference DURATION into the PASS STANDARD (see the constant). Applied
    // once, here, so every consumer — parForEdge, the paper route's whole-tour par, the mission
    // oracle — inherits it and there is no second definition of par anywhere in the codebase.
    // `speeds` is deliberately NOT scaled: it is the reference speed profile (a physical quantity
    // the GPS/par debug views read), not the standard.
    return { time: time * PAR_SLACK, distance: d[n - 1], speeds: v, dist: Float64Array.from(d), stops: stops || 0 }
}

/**
 * Longitudinal grip still available at speed `vv` on a corner of curvature `kap`.
 * Friction circle: a_long ≤ √((μg)² − a_lat²), with a_lat = v²·κ — whatever grip the corner is
 * already spending is not available to accelerate or brake with.
 */
function gripLimit(vv, kap, gmu) {
    const aLat = vv * vv * kap
    return Math.sqrt(Math.max(0, gmu * gmu - aLat * aLat))
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
 * Day-1 rank thresholds (ratio = elapsed/par). FEAT-53: economy.js derives day-tightened
 * tables from these and passes them back in — the difficulty ramp lives in the LETTERS, never
 * in par itself (SM-INV-2 as amended 2026-08-01).
 *
 * [RE-ANCHORED 2026-08-16, owner] **C is pinned at exactly 1.0, on every day of the run.** Par is
 * the C/D boundary — the slowest drive that is still a pass — so the letter that contains par is
 * the LAST passing letter, not the middle one. This reverses the 2026-08-01 ruling that "B is the
 * band that contains par" (and, for the paper route specifically, the 2026-08-14 confirmation of
 * it); see DESIGN.md SM-INV-3 and missions.md for the amendment.
 *
 * Why C never tightens while S/A/B do: par IS the pass line by definition. If C drifted below 1.0
 * on later days, a drive exactly at par would start failing, and par would stop meaning the one
 * thing this whole re-anchor exists to make it mean. The ramp squeezes the GOOD letters instead.
 * (Gated: test/economy.mjs pins C === 1.0 on every day — the replacement for the old B > 1.0 pin.)
 *
 * Fitted 2026-08-16 against the 20-run corpus at PAR_SLACK 1.15, cutting on the CLOCK rather than
 * the felt labels — the labels are demonstrably inverted here (median felt-"fast" is slower than
 * median felt-"par"), so they cannot separate the top bands. Resulting spread: S 2 · A 8 · B 7 ·
 * C 0 · D 3. The empty C band is the "scraped past" gap the corpus happens not to contain.
 */
export const RANK_THRESHOLDS_DEFAULT = { S: 0.69, A: 0.80, B: 0.90, C: 1.00 }

/**
 * Grade a finished run against par. Margin is par-relative so it reads the same on a 2-minute
 * hop and a 20-minute haul; the letter is a bucketing of that ratio.
 *
 * The letter is DISPLAY bucketing of the continuous ratio (SM-INV-3 as amended: rank is
 * result-card only, display only) — payout is computed from the ratio, never from the letter.
 * `thresholds` is injected by the caller (economy.js day ramp); nothing here may learn what a
 * run day is, and `day` must never reach computePar.
 */
export function gradeRun(elapsed, par, thresholds = RANK_THRESHOLDS_DEFAULT) {
    const ratio = par > 0 ? elapsed / par : Infinity
    let letter = 'D'
    if (ratio <= thresholds.S) letter = 'S'
    else if (ratio <= thresholds.A) letter = 'A'
    else if (ratio <= thresholds.B) letter = 'B'
    else if (ratio <= thresholds.C) letter = 'C'
    return { ratio, letter, margin: par - elapsed }
}
