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
    // (5) 2026-09-06, THE v2 RE-ANCHOR (owner) — MEASURED, AND NOTHING MOVED.
    //     Passes (1)-(4) were all fitted against drives on ROUTER-V1 roads. Pass (4) landed
    //     2026-08-16; router v2 took over the whole network 2026-08-18 (`7cff01d`) with measurably
    //     different geometry — QUAL-28 measured 10.4% of length in >200 m straights against v1's
    //     5.2%, and 17 switchbacks against 52. Since mu prices CORNER SPEED and v2 changed the
    //     corners, PAR_REF had never been anchored on the roads it prices (BUG-41 Stage 2).
    //
    //     Re-measured on a fresh v2 corpus — `runs-v2/`, 12 runs / 11 fittable, seeds 97/69/0,
    //     kept apart from the v1 corpus in `runs/` and tagged `road_router` per run so the two can
    //     never be fitted together by accident. Result: the four felt-par drives land at mean
    //     ratio 0.879 against the post-(4) target of ~0.88. **The v1-fitted constants were already
    //     correct on v2 roads**, so mu 0.80 / accel 3.0 / brake 7.0 are RATIFIED, not re-fitted.
    //
    //     calibrate-par's own recommendation (mu 0.77 / accel 3.2 / brake 5.5, loss 0.1897 against
    //     0.1957) was declined on two grounds, both worth keeping so it is not re-litigated:
    //       • the mu loss surface is FLAT — 0.74 → 0.1901, 0.78 → 0.1897, 0.82 → 0.1910. This
    //         corpus barely identifies mu at all, and 0.80 sits inside that band.
    //       • brake 5.5 is the value pass (3) explicitly rejected when it moved to the MEASURED
    //         7.0, noting 5.5 "under-priced every corner entry". A fit walking that back at n=11
    //         is fitting noise, not physics.
    //     11 fittable runs is still under calibrate-par's own "20 is a hint, not a fit" bar, so
    //     this ratifies rather than proves. Re-run if the corpus grows; `on par` is the anchor
    //     label and `slow`/`very_slow` are the thinnest (n=1, n=2).
    //
    // Note from pass (1): mu is the DOMINANT dial. vMax is nearly free (these roads are
    // curvature-limited essentially everywhere — 42.6 vs 30.0 m/s moved par by under a second),
    // and accel/brake are secondary. Tune HERE, never by touching the vehicle (SM-INV-2) — and
    // re-run test/calibrate-par.mjs when new labelled runs land. NOTE THE DIRECTORY: v2 drives go
    // to `runs-v2/` (`node test/calibrate-par.mjs runs-v2`); `runs/` is the frozen v1 corpus and
    // must never be fitted together with it — see (5) and runs-v2/README.md.
    // (6) 2026-09-08, FEAT-80 (owner: "weaken par to match this new default friction coef").
    //     The tire model gained load sensitivity and the lab skidpad fell from mu 0.72–0.74 to
    //     0.64–0.65 across 25/60/150 m — an 11 % grip cut, uniform across radii, that the owner
    //     kept ("a, b and c feel great"). Corner speed goes as √mu, so par's mu scales with the
    //     grip: 0.80 × 0.65/0.73 = 0.71. Cross-checked against 8 fresh drives on the new grip
    //     (runs-v2 0019–0026 — renumbered from 0013–0020 at the 2026-09-09 merge, where rank-weights had already claimed 0013–0018; 20 runs total at the time): calibrate-par's basin is FLAT from 0.70 to 0.80
    //     (loss 0.289–0.293), best 0.76, felt-par mean 0.860 against a 0.88 target — the corpus
    //     cannot tell 0.71 from 0.76, so the physics ratio decides. 0.72 = the old physical
    //     skidpad number, and nothing else in PAR_REF moves.
    // (7) 2026-09-10 (owner: "archive the old-grip runs, make sure par is based on new-grip runs").
    //     runs-v2/ now holds ONLY drives on the FEAT-80 tire (0019–0026); the pre-FEAT-80 corpus is
    //     archived in runs-v2/pre-feat80-grip/. calibrate-par over the 7 fittable new-grip runs:
    //     loss 0.089–0.096 across mu 0.66–0.90 — FLAT again — with the minimum at 0.85 only because
    //     the fitter also drops accel 3.0→2.8 and brake 7.0→5.5, both MEASURED numbers it must not
    //     move. Seven runs with partly inverted felt labels (a "very fast" 0.805 above a "par"
    //     0.785) cannot tell 0.72 from 0.85, and 0.85 would put par ABOVE the pre-FEAT-80 0.80 on
    //     11 % less grip, which is physically backwards. 0.72 stands on the grip ratio; re-fit when
    //     the new-grip corpus reaches ~15 labelled point-to-point drives.
    mu: 0.72,          // EFFECTIVE centerline friction — see (3)/(4)/(6)/(7): line-cutting, not tire grip
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
 * Fitted 2026-08-16 against four v1-road drives the owner labelled with the letter each SHOULD
 * have earned — ratio 0.687 "solid S" · 0.712 "barely S" · 0.809 "mid C" · 0.910 "middle C" — which
 * forced S 0.72 / A 0.76 / B 0.80 with two 0.04-wide middle bands.
 *
 * [RE-CUT 2026-09-07, owner — THE v2 BAND RE-CUT.] Those anchors were recorded on ROUTER-V1 roads,
 * and v2 took the whole network on 2026-08-18. PAR_REF survived that transition unchanged (pass (5)
 * above re-measured it and nothing moved), but the LETTERS did not: v2 geometry shifted where
 * committed human driving actually lands, and the bands stayed where v1 put them. Measured over the
 * 18-run `runs-v2/` corpus, the old cut graded S 0 · A 1 · B 5 · C 11 · D 0 — S was unreachable and
 * C held two thirds of every drive ever recorded.
 *
 * Two facts made that unambiguous rather than a matter of taste:
 *   • the ONE run that scored S (`0015`, ratio 0.668) did not drive the route it was priced on. Its
 *     trace skips 471 m of a 2762 m route (17%), peaking 210 m off the centerline — driven path
 *     2274 m against a routed 2762 m. Excluded as a driving data point. The off-route shortcut is a
 *     separate problem AND ALREADY RULED ON — it is the Highway's intentional-non-shortcut-skip
 *     (>~200 m of road distance saved off-network), priced by a graded penalty, and the detector is
 *     owed by FEAT-52 §5. Do not propose a fix here and do not add a corridor check to mission.js.
 *   • with it excluded, **no honest drive in 17 has ever gone below ratio 0.740** — the old S line
 *     of 0.72 had never been cleared by anyone, and A (0.76) exactly once.
 * Residual correlations from `runs-report` against curvature, grade, straight-fraction and distance
 * are all |r| < 0.4, so par is not biased by route type. This is a pure re-cut of the letters, NOT
 * evidence against PAR_REF — do not "fix" it by touching mu.
 *
 * The new cut lands S 2 · A 5 · B 5 · C 5 · D 0 over the 17 honest v2 runs, i.e. every band is
 * populated and the best drive on record earns an S. It relaxes the 2026-08-16 anchors deliberately
 * — the owner ruled that a felt-"slow" drive landing B (0.830) and a felt-"par" one landing A
 * (0.803) is the price worth paying, on the grounds recorded below.
 *
 * ⚠ THE FELT LABELS CANNOT ARBITRATE THIS and no future refit should let them. The corpus has a
 * felt-"very fast" drive at 0.833 and a felt-"par" drive at 0.803 — the label ordering is partly
 * INVERTED against the clock, exactly as calibrate-par.mjs's own health warning says. Fit the bands
 * to the ratio DISTRIBUTION and to owner letter-targets; use `felt` only as a tie-break.
 *
 * ⚠ UNRESOLVED, recorded so it is not rediscovered (and now WORSE on v2, not better): the whole
 * observed dynamic range from flat-out to dawdling is ratio 0.74 → 0.97. **D has never been
 * reached** — both drives the owner labelled "very slow" scored 0.903 and 0.950, comfortably
 * passing. Par is supposed to be the line where careless driving starts to fail, and on v2 roads
 * nothing fails. That is a SPREAD problem: par prices two routes ~10% apart for the same felt pace,
 * so no threshold set and no PAR_SLACK value can fix both ends at once (slack is a pure rescale —
 * it slides every ratio together and thresholds absorb it exactly). Only par discriminating better
 * between routes can widen the range. Needs more labelled runs before chasing.
 *
 * ⚠ [MERGE NOTE 2026-09-09] The re-cut above was measured at PAR_REF.mu 0.80. The same day's
 * sibling branch (FEAT-80, note (6) above) moved mu to 0.72 — for TIRE GRIP, not for the letters —
 * and the two landed on main together. The 0.85/0.81/0.77 lines have NOT been re-graded under
 * mu 0.72, and the corpus is now mixed-grip: `runs-v2/` 0001–0018 were driven on the pre-FEAT-80
 * tire, 0019–0026 on the new one. Owner's call whether the bands follow; do not move them from a
 * one-session re-grade (see the 2026-09-09 merge handoff for the numbers).
 */
/*
 * [B WIDENED 2026-10-01, owner.] B 0.85 → 0.87, on seeing the bands laid out on the live rank timer
 * (FEAT-87): "makes sense to have A be tight, B be wider, C wider" — a 0.04 / 0.06 / 0.13 ladder
 * instead of 0.04 / 0.04 / 0.15. S, A and C do not move; the late-day set keeps its flat −0.02.
 */
export const RANK_THRESHOLDS_DEFAULT = { S: 0.77, A: 0.81, B: 0.87, C: 1.00 }

/**
 * Grade a finished run against par. Margin is par-relative so it reads the same on a 2-minute
 * hop and a 20-minute haul; the letter is a bucketing of that ratio.
 *
 * The letter is DISPLAY bucketing of the continuous ratio (SM-INV-3 as amended: rank is
 * display only — the result card, and live on the FEAT-87 rank timer) — payout is computed from the ratio, never from the letter.
 * `thresholds` is injected by the caller (economy.js day ramp); nothing here may learn what a
 * run day is, and `day` must never reach computePar.
 */
/*
 * FEAT-88 — the HAUL letter (owner, 2026-10-05): "the letter grade should be an overall ranking
 * on how you performed a mission". A courier job is all clock, so its letter is gradeRun's. A haul
 * is clock AND load, so its letter blends the two, each first put on one LETTER SCALE (C = 1,
 * B = 2, A = 3, S = 4; D below 1):
 *   time  — 4 at the S line, 3 at A, 2 at B, 1 at C (par), linear between; past S it keeps
 *           climbing at the A→S slope up to HAUL_TIME_CAP ("screaming fast"), past par it keeps
 *           falling at the B→C slope.
 *   load  — 4 at HAUL_LOAD_S of the pieces delivered, HAUL_LOAD_SLOPE letters per whole load
 *           (1.5 letters per 10 %), capped at 4: a full bed is S-level, never better.
 * The letter is the AVERAGE. Owner's anchors: S time with 90 % delivered = S; 40 % delivered,
 * screaming fast = (5 − 3.5) / 2 = 0.75 = D. Display only, like every letter (SM-INV-3) — pay is
 * the ratio × the share aboard, never this.
 */
export const HAUL_LOAD_S = 0.9
export const HAUL_LOAD_SLOPE = 15
export const HAUL_TIME_CAP = 5

/** A run's time on the letter scale (C = 1 … S = 4), from its par ratio. */
export function timeScore(ratio, t = RANK_THRESHOLDS_DEFAULT) {
    const pts = [[t.S, 4], [t.A, 3], [t.B, 2], [t.C, 1]]
    if (ratio <= t.S) return Math.min(HAUL_TIME_CAP, 4 + (t.S - ratio) / (t.A - t.S))
    for (let i = 1; i < pts.length; i++) {
        const [r0, s0] = pts[i - 1], [r1, s1] = pts[i]
        if (ratio <= r1) return s0 + (s1 - s0) * (ratio - r0) / (r1 - r0)
    }
    return 1 - (ratio - t.C) / (t.C - t.B)
}

/** A haul's letter: the average of its time and load on the letter scale. */
export function haulGrade(ratio, share, thresholds = RANK_THRESHOLDS_DEFAULT) {
    const time = timeScore(ratio, thresholds)
    const load = Math.min(4, 4 + (share - HAUL_LOAD_S) * HAUL_LOAD_SLOPE)
    const score = (time + load) / 2
    const letter = score >= 4 ? 'S' : score >= 3 ? 'A' : score >= 2 ? 'B' : score >= 1 ? 'C' : 'D'
    return { letter, score, time, load }
}

export function gradeRun(elapsed, par, thresholds = RANK_THRESHOLDS_DEFAULT) {
    const ratio = par > 0 ? elapsed / par : Infinity
    let letter = 'D'
    if (ratio <= thresholds.S) letter = 'S'
    else if (ratio <= thresholds.A) letter = 'A'
    else if (ratio <= thresholds.B) letter = 'B'
    else if (ratio <= thresholds.C) letter = 'C'
    return { ratio, letter, margin: par - elapsed }
}
