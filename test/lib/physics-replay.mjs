// test/lib/physics-replay.mjs — headless input-timeline physics replay (plan 09, Phase 5).
//
// replay.mjs lazy-imports this for kind:"event" captures. We rebuild the REAL road + a headless
// analytic terrain from world.seed+params, seat the vehicle at the captured initial state, then drive
// the SAME fixed-step loop the game runs (vehicle Ackermann → stepPhysics) feeding the recorded
// per-tick inputs, and diff the resulting trajectory against the captured frames.
//
// Why it reproduces: the physics (src/physics.js stepPhysics) is a pure function of
// (vehicleState, params, dt, contact-queries); JS float math is deterministic. The only surface the
// wheels ride is analyticHeight, which we reproduce to < 1 cm in the bug window (see the terrain
// self-check below). So a deterministic bug — e.g. BUG-15's airborne+slam over the shoulder step —
// re-emerges headlessly, and the first frame where replay leaves the recorded trajectory localizes it.
//
// Alignment (src/main.js:1141-1171 fixed loop): each tick runs updateVehicle → stepPhysics →
// captureFrame, so frame[i] is the POST-step state of tick i and inputTimeline[i] (same .t) holds the
// resolved steer/thr/brk applied during tick i (logger.js:202). initialState == frame0 (capture.js:116).
// Therefore replay starts at frame0 and, for i = 1..N-1, applies input[i], steps, and compares to
// frame[i]. updateVehicle's only physics-relevant outputs are steerAngle→wheelSteerAngles + thr/brk, so
// we set those directly and replicate ONLY the Ackermann block (vehicle.js:111-136) — no DOM `keys`.
// (handbrake is not in the telemetry; assumed false — true only if the driver held Space.)

import { RoadSystem } from '../../src/road.js'
import { stepPhysics } from '../../src/physics.js'
import { makeTerrainHeadless } from './terrain-headless.mjs'

// Static-equilibrium strut compression fallback when a capture predates the *_sc telemetry columns.
// (vehicle.js's SPAWN_STATE is NOT imported — it transitively pulls camera.js's DOM listeners, which
//  break under node. This capture seeds strutComp from frame0 telemetry, so this is rarely used.)
const STRUT_FALLBACK = [0, 0, 0, 0]

const TERRAIN_SELFCHECK_HARD = 0.1   // m — worst |analyticHeight − rd_gh| above this ⇒ headless model wrong
const DIVERGE_TOL            = 0.10  // m — position error that counts as "left the recorded trajectory"

// Ackermann per-wheel steer angles — VERBATIM logic from src/vehicle.js:116-133.
function ackermann(steerAngle, params) {
    const phi = steerAngle
    if (Math.abs(phi) < 1e-6) return [0, 0, 0, 0]
    const sinPhi = Math.sin(phi)
    const cosPhi = Math.cos(phi)
    const twoL = 2 * params.wheelbase
    const phiLeft  = Math.atan(twoL * sinPhi / (twoL * cosPhi - params.trackFront * sinPhi))
    const phiRight = Math.atan(twoL * sinPhi / (twoL * cosPhi + params.trackFront * sinPhi))
    return [phiLeft, phiRight, 0, 0]
}

/**
 * Replay a kind:"event" capture through the headless physics loop and report.
 * @param {object} capture — validated event capture
 * @param {{THREE: object}} ctx — Three.js namespace (contact vectors + vehicle math primitives)
 * @returns {Promise<{ok: boolean}>} ok=false only on a HARD harness failure (terrain model wrong)
 */
export async function replayEvent(capture, { THREE }) {
    const { seed, params } = capture.world
    const ev = capture.event
    const F = ev.fields
    const ix = Object.fromEntries(F.map((f, i) => [f, i]))
    const col = (row, k) => (ix[k] != null ? row[ix[k]] : undefined)
    const frames = ev.frames
    const N = frames.length

    if (!N || !ev.initialState) { console.log('  [event] no frames/initialState — nothing to replay'); return { ok: true } }

    // ── Build the real road headless, streamed to cover the trajectory ────────────────────────────
    // Use the last recorded stream center (closest to the event); the road is window-invariant for the
    // drivable surface (memory: project_invariance_harness), and this matched rd_gh to < 1 cm in-spike.
    const sch = ev.streamCenterHistory || []
    const center = sch.length ? sch[sch.length - 1] : { x: col(frames[0], 'px'), z: col(frames[0], 'pz') }
    const road = new RoadSystem(seed, params)
    road.update(new THREE.Vector3(center.x, 0, center.z))
    const terrain = makeTerrainHeadless(seed, params, road)

    // Per-step suspension scratch arrays — stepSuspensionSubsteps expects these pre-allocated on
    // params (main.js:83-92). They are recomputed-not-integrated, so a one-time allocation suffices.
    params._tireFz         = [0, 0, 0, 0]
    params._suspForceAccum = [0, 0, 0, 0]
    params._hubNormalXZ    = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]

    // ── Headless contact queries — Sierra-world branches of src/main.js (grid/ramp omitted) ───────
    const queryContacts = (cx, cy, cz, r) => {
        const hits = []
        const terrainH = terrain.analyticHeight(cx, cz)
        const gd = terrainH + r - cy
        if (gd > 0) {
            const n = terrain.analyticNormal(cx, cz)
            hits.push({ normal: new THREE.Vector3(n.x, n.y, n.z), depth: gd, contactPoint: new THREE.Vector3(cx, terrainH, cz) })
        }
        return hits
    }
    const queryVertexContacts = (px, py, pz) => {
        const hits = []
        const terrainH = terrain.analyticHeight(px, pz)
        if (py < terrainH) {
            const n = terrain.analyticNormal(px, pz)
            hits.push({ normal: new THREE.Vector3(n.x, n.y, n.z), depth: terrainH - py })
        }
        return hits
    }

    // ── (A) Terrain self-check: does headless analyticHeight match the recorded rd_gh column? ──────
    // This is the live drift detector for terrain-headless.mjs. Sample at every recorded CG position.
    let worstGh = 0, worstGhAt = -1
    const hasGh = ix['rd_gh'] != null
    if (hasGh) {
        for (let i = 0; i < N; i++) {
            const px = col(frames[i], 'px'), pz = col(frames[i], 'pz'), gh = col(frames[i], 'rd_gh')
            if (gh == null) continue
            const d = Math.abs(terrain.analyticHeight(px, pz) - gh)
            if (d > worstGh) { worstGh = d; worstGhAt = i }
        }
    }
    console.log(`\n  (A) TERRAIN SELF-CHECK (headless analyticHeight vs recorded rd_gh)`)
    if (hasGh) {
        const ok = worstGh <= TERRAIN_SELFCHECK_HARD
        console.log(`        ${ok ? '✓' : '✗'} worst |analyticHeight − rd_gh| = ${worstGh.toFixed(4)} m over ${N} frames (frame ${worstGhAt}, tol ${TERRAIN_SELFCHECK_HARD} m)`)
        if (!ok) {
            console.log('        → headless terrain model has drifted from the game — fix terrain-headless.mjs before trusting the replay.')
            return { ok: false }
        }
    } else {
        console.log('        · rd_gh not in capture — skipping (older capture).')
    }

    // ── Seat the vehicle at frame0 (== initialState), seeding strut + omega from the telemetry ─────
    const is = ev.initialState
    const f0 = frames[0]
    const sc = ['fl_sc', 'fr_sc', 'rl_sc', 'rr_sc'].map(k => col(f0, k))
    const om = ['fl_omega', 'fr_omega', 'rl_omega', 'rr_omega'].map(k => col(f0, k))
    const haveSc = sc.every(v => v != null)
    const haveOm = om.every(v => v != null)
    const mkState = () => ({
        position:        new THREE.Vector3(is.position.x, is.position.y, is.position.z),
        velocity:        new THREE.Vector3(is.velocity.x, is.velocity.y, is.velocity.z),
        quaternion:      new THREE.Quaternion(is.quaternion.x, is.quaternion.y, is.quaternion.z, is.quaternion.w),
        angularVelocity: new THREE.Vector3(is.angularVelocity.x, is.angularVelocity.y, is.angularVelocity.z),
        steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0,
        wheelAngles: [0, 0, 0, 0],
        wheelSteerAngles: [0, 0, 0, 0],
        strutComp:    haveSc ? sc.slice() : STRUT_FALLBACK.slice(),
        strutCompVel: [0, 0, 0, 0],
        wheelDebug:  [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
        wheelOmega:   haveOm ? om.slice() : [0, 0, 0, 0],
        handbrake: false,
    })
    const vs = mkState()

    // ── Replay loop: for i = 1..N-1 apply input[i], step, compare to frame[i] ───────────────────────
    const tl = ev.inputTimeline
    const replayFz = []          // per-frame [fl,fr,rl,rr] tire spring force from replay (frame0 = seed 0s)
    replayFz.push([0, 0, 0, 0])
    let firstDiverge = -1, firstDivergeErr = 0
    const posErr = []
    posErr.push(0)
    for (let i = 1; i < N; i++) {
        const inp = tl[i] || { steer: 0, thr: 0, brk: 0 }
        vs.steerAngle = inp.steer
        vs.throttle = inp.thr; vs.smoothThrottle = inp.thr
        vs.brake = inp.brk;    vs.smoothBrake = inp.brk
        vs.wheelSteerAngles = ackermann(inp.steer, params)

        stepPhysics(vs, params, 1 / 60, queryContacts, queryVertexContacts)

        replayFz.push([0, 1, 2, 3].map(w => vs.wheelDebug[w]?.fz ?? 0))

        const fx = col(frames[i], 'px'), fy = col(frames[i], 'py'), fz = col(frames[i], 'pz')
        const dx = vs.position.x - fx, dy = vs.position.y - fy, dz = vs.position.z - fz
        const err = Math.sqrt(dx * dx + dy * dy + dz * dz)
        posErr.push(err)
        if (firstDiverge < 0 && err > DIVERGE_TOL) { firstDiverge = i; firstDivergeErr = err }
    }

    // ── (B) First-divergence frame ─────────────────────────────────────────────────────────────────
    console.log(`\n  (B) TRAJECTORY DIFF (replay vs recorded, pos tol ${DIVERGE_TOL} m over ${N} frames)`)
    if (firstDiverge < 0) {
        console.log(`        ✓ replay tracks the recording within tol for the whole window (worst ${Math.max(...posErr).toFixed(3)} m) — bug is NOT in the rigid-body step alone.`)
    } else {
        const t = col(frames[firstDiverge], 't')
        console.log(`        first divergence at frame ${firstDiverge} (t=${t?.toFixed(2)}) — pos error ${firstDivergeErr.toFixed(3)} m.`)
        console.log(`        → the recorded and replayed trajectories part here; this localizes the event.`)
    }

    // ── (C) Bug signature: airborne (all *_fz==0) then slam (fr_fz jump) ────────────────────────────
    // Detect in the RECORDED frames, then report whether replay reproduces the contact loss.
    const recFz = (i) => ['fl_fz', 'fr_fz', 'rl_fz', 'rr_fz'].map(k => col(frames[i], k) ?? 0)
    const allZero = (a) => a.every(v => Math.abs(v) < 1e-6)
    let recAirStart = -1, recAirEnd = -1
    for (let i = 0; i < N; i++) {
        if (allZero(recFz(i))) { if (recAirStart < 0) recAirStart = i; recAirEnd = i }
        else if (recAirStart >= 0 && recAirEnd >= 0) break   // first contiguous airborne window
    }
    console.log(`\n  (C) BUG SIGNATURE (airborne → slam)`)
    if (recAirStart >= 0) {
        const t0 = col(frames[recAirStart], 't'), t1 = col(frames[recAirEnd], 't')
        // slam = first big positive fr_fz jump just after the airborne window
        let slamAt = -1, slamFz = 0
        for (let i = recAirEnd; i < Math.min(N, recAirEnd + 12); i++) {
            const fr = col(frames[i], 'fr_fz') ?? 0
            if (fr > 4000) { slamAt = i; slamFz = fr; break }
        }
        console.log(`        recorded: all-wheels airborne frames ${recAirStart}..${recAirEnd} (t ${t0?.toFixed(2)}..${t1?.toFixed(2)})` +
            (slamAt >= 0 ? `, then fr_fz slam → ${slamFz.toFixed(0)} N at frame ${slamAt} (t ${col(frames[slamAt], 't')?.toFixed(2)})` : ''))
        // replay reproduction: does replay also lose all-wheel contact somewhere in/around that window?
        let repAir = false, repAirAt = -1
        for (let i = Math.max(1, recAirStart - 4); i <= Math.min(N - 1, recAirEnd + 4); i++) {
            if (allZero(replayFz[i])) { repAir = true; repAirAt = i; break }
        }
        const repMaxFz = Math.max(0, ...replayFz.slice(Math.max(1, recAirEnd - 2)).map(a => a[1] || 0))
        console.log(`        replay:   ${repAir ? `✓ reproduces all-wheel contact loss (first at frame ${repAirAt})` : '✗ did NOT lose all-wheel contact in the window'}` +
            `; peak replay fr_fz after window ≈ ${repMaxFz.toFixed(0)} N`)
        console.log(`        → ${repAir ? 'BUG-15 airborne+slam REPRODUCED headlessly (surface step over the shoulder edge).' : 'replay diverged before the airborne window — see (B).'}`)
    } else {
        console.log('        recorded telemetry shows no all-wheel airborne window — no airborne/slam signature in this capture.')
    }

    return { ok: true }
}
