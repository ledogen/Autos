/**
 * src/lab.js — the testing lab: an isolated flat world with instrumented tracks.
 *
 * WHY THIS EXISTS. Grid world (D-18, retired 2026-07-20) hid the terrain chunks and nothing else,
 * so the road ribbons, props and water stayed floating at their real elevations while the truck sat
 * on a plane at y=0 — the flat world read as "parked underneath the real one" — and every worldgen
 * system kept streaming and drawing underneath it. The lab is a real mode: the generated world is
 * torn down (hidden AND stopped, see enterLab in main.js), and what's left is a bare plane with
 * instrumented tracks. It replaces grid world outright.
 *
 * WHAT IT MEASURES. `test/measure-vehicle-limits.mjs` measures the truck's ENVELOPE headlessly —
 * the ceiling. It cannot measure transitions (turn-in, trail-braking, getting an open-diff RWD
 * truck back on the power at exit), which is where a human's time actually goes. The lab measures
 * the fraction of that ceiling a human converts into lap time. That fraction is the `k` in
 * `PAR_REF = k × measured` (FEAT-30) — the last number in the par calibration, and the only one a
 * machine can't produce.
 *
 * The skidpad is the money test: a lap time gives `v = 2πR / t`, hence `mu_realized = v² / (g·R)`,
 * directly comparable to the harness's steady-state `mu`. Their ratio IS k, per radius.
 *
 * The rumble lanes are for the damage/wear model (SM-INV-5, DESIGN.md "Damage, wear & repair"),
 * whose stated calibration anchor is severity thresholds, not linear accumulation: light bump-stop
 * contact must NOT damage the suspension, hard contact must. Three graded lanes give a repeatable
 * ladder of input severity to place that threshold against.
 *
 * SM-INV-2: nothing here feeds par at runtime. It prints numbers for a human to freeze into
 * PAR_REF by hand.
 *
 * LAYOUT (everything shares the +X axis so the facility stays compact — drive right to go faster,
 * turn off into a lane or a pad):
 *
 *      z=+86  ────────────  rumble: large  (200 mm @ 1000 mm)
 *      z=+72  ────────────  rumble: med    (125 mm @  625 mm)
 *      z=+58  ────────────  rumble: small  ( 50 mm @  250 mm)
 *      z=+40  ============  DRAG STRIP →  start ▏100 200 300▕ finish(400) ▕ brake board(470)
 *      z=  0     ▲ ramp                  (the D-19 jump rig, kept: it is a suspension input too)
 *      z=-35   ── every pad's near edge lines up here ──────────────────────
 *               ( 25 )   (   60   )        (         150         )   skidpads
 *
 * Timing is fully automatic — gates fire on crossing, there is no button to fumble mid-run.
 */

import * as THREE from 'three'

const G = 9.81
const PAINT_Y = 0.02      // m — paint sits just above the plane (avoids z-fighting)
const MIN_LAP = 4.0       // s — secondary sanity floor on lap time
// A lap must actually GO AROUND. Timing purely on line crossings lets a driver idling near the
// line wobble across it and bank a nonsense "lap" (caught by test/lab-timing.mjs: 4.02 s on the
// 60 m pad, which would report a mu of ~4). We accumulate the unwrapped angle swept about the pad
// centre and require very nearly a full turn.
const LAP_ANGLE = 1.9 * Math.PI   // rad — swept angle required to count a lap

// ── drag strip: runs along +X at z = STRIP_Z ────────────────────────────────────────────────────
const STRIP_Z = 40        // m — clear of the ramp rig at the origin
const LANE = 8            // m — drag-strip lane width
const DRAG_LEN = 400      // m — the timed acceleration run
const STRIP_RUNOFF = 140  // m — pavement past the finish
const BRAKE_MARK = 470    // x — painted "brake here" board (visual aid only; see the braking test)
const BRAKE_ARM_V = 27    // m/s (~97 km/h) — braking test arms above this speed

// ── rumble lanes: parallel to the strip, for suspension / damage-model testing ──────────────────
// Amplitude is peak height above the plane; spacing is crest-to-crest. The profile is a raised
// cosine (C1 continuous), NOT a sawtooth: a discontinuous slope would hand the solver an unbounded
// impulse and measure the integrator rather than the suspension.
const RUMBLE_LEN = 120        // m — nominal length; each lane is snapped to whole crests (below)
const RUMBLE_W = 6            // m — lane width
const RUMBLE_FADE = 2.0       // m — longitudinal ramp-in/out so entering a lane is not a kerb
// Lateral feather at the lane edges. Deliberately NARROW: the crests must be CONSTANT HEIGHT
// across the working width — a bump that ramps down toward both edges is not the input we want to
// measure, and at the old 1.0 m it read as the whole lane sloping into the ground. The feather
// exists only so the surface has no vertical wall at the lane edge: a step discontinuity would
// give the contact normal an undefined (infinite-gradient) direction exactly where a tyre
// straddles the edge. 25 cm out of 6 m ⇒ 5.5 m at full height.
const RUMBLE_EDGE = 0.25      // m
const RUMBLE_SAMPLES = 12     // mesh samples per crest

// Each lane is snapped to a WHOLE NUMBER OF CRESTS, and tessellated at exactly RUMBLE_SAMPLES per
// crest. Without the snap the sample grid drifts against the crest spacing and the mesh quietly
// misses the peaks: at the nominal 120 m, 0.35 m crests do not divide evenly and the med lane's
// worst visual crest measured 93.3% of its specified 100 mm (small and large happened to divide
// exactly and were fine). The physics surface is analytic and was never affected — this is purely
// about the mesh telling the truth about the surface it depicts.
const _lane = (name, z, amp, spacing) => {
    const crests = Math.round(RUMBLE_LEN / spacing)
    return { name, z, amp, spacing, crests, len: crests * spacing }
}
// small / med / large all share the SAME crest STEEPNESS (amp / spacing = 0.2) and differ only in
// scale and wavelength — so a run across the three isolates the wavelength variable instead of
// confounding it with slope aggression. med is the arithmetic midpoint of the other two.
const RUMBLES = [
    _lane('small', 58, 0.050, 0.250),
    _lane('med',   72, 0.125, 0.625),
    _lane('large', 86, 0.200, 1.000),
]

// Skidpad rings: radius + centre, strung along +X just below the strip.
// 25 m ≈ a tight switchback, 60 m ≈ a typical mountain corner, 150 m ≈ a fast sweeper —
// bracketing the radii the router actually produces (hard floor 8 m, most corners 20–120 m).
//
// Each pad gets its OWN centre-z so that all three NEAR EDGES line up on PAD_NEAR_Z — a common
// tangent 75 m off the strip. Sharing one centre-z instead would push the near edge of the 25 m
// pad 125 m further out than the 150 m pad's, and the whole site would sprawl to fit the biggest
// ring. This way you turn off the strip and the entry to every pad is the same distance away.
const PAD_NEAR_Z = -35        // z of every pad's strip-side edge
const _pad = (r, cx, name) => ({ r, cx, cz: PAD_NEAR_Z - r, name })
const PADS = [
    _pad(25,   40, 'skidpad 25 m'),
    _pad(60,  150, 'skidpad 60 m'),
    _pad(150, 400, 'skidpad 150 m'),
]

const COL = { paint: 0xe8e8e0, start: 0x5ad06a, finish: 0xff5a3c, brake: 0xffcf3c, lane: 0x8a8a80 }
// Line weights are generous on purpose: at 400 m down the strip, or on the far side of the 150 m
// ring, a realistically-thin 0.15 m line is sub-pixel and you cannot see the thing you are meant
// to be following. This is an instrument, not a photograph.
const W_GATE = 1.4, W_MARK = 0.7, W_RING = 1.0, W_LANE = 0.45

// Note e1 < e0 is legal and means a DESCENDING edge (1 below e1, 0 above e0) — the lateral lane
// feather is written that way. Only the degenerate e0 === e1 needs a guard; an earlier
// `if (e1 <= e0) …` bailout silently flattened every rumble lane to zero.
const smoothstep = (e0, e1, x) => {
    if (e0 === e1) return x < e0 ? 0 : 1
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)
}

/**
 * Rumble-lane surface height at a world XZ, and its gradient.
 * Pure math, exported so the physics contact query and the visual mesh are guaranteed to be the
 * SAME surface (the road system's whole history is bugs where mesh and collision disagreed).
 * Returns { y, dydx, dydz } — y is 0 everywhere outside a lane.
 */
export function rumbleSurface(x, z) {
    for (const r of RUMBLES) {
        const dz = Math.abs(z - r.z)
        const half = RUMBLE_W / 2
        if (dz > half || x < 0 || x > r.len) continue

        // Lateral feather and longitudinal fade — both smoothstep, so the lane edge is a ramp,
        // not a step the tyre would slam into.
        const wz = smoothstep(half, half - RUMBLE_EDGE, dz)
        const wx = smoothstep(0, RUMBLE_FADE, x) * smoothstep(r.len, r.len - RUMBLE_FADE, x)
        const w = wz * wx
        if (w <= 0) continue

        const k = 2 * Math.PI / r.spacing
        const prof = 0.5 * (1 - Math.cos(k * x))          // 0 … 1
        const dprof = 0.5 * k * Math.sin(k * x)
        const y = r.amp * prof * w

        // d/dx of (amp·prof·wz·wx): wz has no x dependence; wx's derivative is only non-zero in the
        // 2 m fades, where prof·dwx is a small correction — include it for an honest normal.
        const eps = 1e-3
        const wxF = smoothstep(0, RUMBLE_FADE, x + eps) * smoothstep(r.len, r.len - RUMBLE_FADE, x + eps)
        const wxB = smoothstep(0, RUMBLE_FADE, x - eps) * smoothstep(r.len, r.len - RUMBLE_FADE, x - eps)
        const dwx = (wxF - wxB) / (2 * eps)
        const dydx = r.amp * (dprof * wz * wx + prof * wz * dwx)

        const wzF = smoothstep(half, half - RUMBLE_EDGE, Math.abs(z + eps - r.z))
        const wzB = smoothstep(half, half - RUMBLE_EDGE, Math.abs(z - eps - r.z))
        const dydz = r.amp * prof * wx * (wzF - wzB) / (2 * eps)
        return { y, dydx, dydz }
    }
    return { y: 0, dydx: 0, dydz: 0 }
}

export class LabSystem {
    /**
     * @param {THREE.Scene} scene
     * @param {() => {x:number,z:number,speed:number,brake:number,throttle:number}} getCar
     */
    constructor(scene, getCar) {
        this._scene = scene
        this._getCar = getCar
        this._group = new THREE.Group()
        this._group.name = 'testing-lab'
        this._group.visible = false
        this._built = false
        this._active = false

        this._prev = null            // previous car XZ, for gate-crossing tests
        this._runs = []              // finished results, newest first
        this.best = new Map()        // track name → best result

        // Live run state
        this._drag = null            // { t, v100, v0 }
        this._brake = null           // { x0, z0, v0 }
        this._laps = new Map()       // pad name → { t, swept, theta }
        this.status = 'drive through a green gate to start timing'
    }

    // ── ground surface (physics + visual read the same function) ────────────────────────────
    /** Surface height at a world XZ inside the lab. Flat except on the rumble lanes. */
    groundHeight(x, z) { return this._active ? rumbleSurface(x, z).y : 0 }

    /** Surface normal at a world XZ inside the lab. Straight up except on the rumble lanes. */
    groundNormal(x, z, out) {
        const n = out || { x: 0, y: 1, z: 0 }
        if (!this._active) { n.x = 0; n.y = 1; n.z = 0; return n }
        const { dydx, dydz } = rumbleSurface(x, z)
        if (dydx === 0 && dydz === 0) { n.x = 0; n.y = 1; n.z = 0; return n }
        const inv = 1 / Math.hypot(dydx, 1, dydz)
        n.x = -dydx * inv; n.y = inv; n.z = -dydz * inv
        return n
    }

    // ── geometry ────────────────────────────────────────────────────────────────────────────
    _line(x0, z0, x1, z1, color, w = 0.35) {
        const len = Math.hypot(x1 - x0, z1 - z0)
        const geo = new THREE.PlaneGeometry(len, w)
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color, toneMapped: false,
            polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
        }))
        m.rotation.x = -Math.PI / 2
        m.rotation.z = -Math.atan2(z1 - z0, x1 - x0)
        m.position.set((x0 + x1) / 2, PAINT_Y, (z0 + z1) / 2)
        this._group.add(m)
        return m
    }

    /**
     * Upright distance post. Flat paint vanishes into a couple of pixels down a 400 m strip; a
     * 3 m post keeps its silhouette against the sky and stays countable from the seat.
     */
    _post(x, z, color, h = 3.0) {
        const m = new THREE.Mesh(
            new THREE.BoxGeometry(0.45, h, 0.45),
            new THREE.MeshBasicMaterial({ color, toneMapped: false }),
        )
        m.position.set(x, h / 2, z)
        this._group.add(m)
        return m
    }

    _ring(cx, cz, r, color, w = 0.35) {
        const geo = new THREE.RingGeometry(r - w / 2, r + w / 2, 192)
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color, side: THREE.DoubleSide, toneMapped: false,
            polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
        }))
        m.rotation.x = -Math.PI / 2
        m.position.set(cx, PAINT_Y, cz)
        this._group.add(m)
        return m
    }

    /**
     * Rumble-lane mesh, built by SAMPLING rumbleSurface — the same function the contact query
     * uses. Mesh and collision cannot drift apart, which is the failure this codebase has paid
     * for repeatedly on the road (see QUAL-07, BUG-15, the carve/ribbon gates).
     */
    _rumbleMesh(r) {
        // Exactly RUMBLE_SAMPLES per crest over a whole number of crests, so every peak and every
        // trough lands ON a vertex row — heights are then exact and only the chord between peak and
        // trough is approximated.
        //
        // 12 samples/crest, measured on an M4 Air with the camera down on the lane deck: doubling
        // from 6 took the scene 43 k → 81 k triangles with NO measurable frame-time change (dt p50
        // 16.6 → 16.7 ms, i.e. still vsync-locked; 48 samples/crest and 309 k triangles was also
        // free). Geometry density is simply not the constraint at lab scale — three static meshes
        // built once. The budget worth guarding is terrain/props at world scale, where vertex count
        // multiplies by ~49 live chunks that regenerate as you drive (see PERF-22).
        //
        // Silhouette is the only thing this buys. computeVertexNormals already smooths the INTERIOR
        // shading, but no normal trick fixes an outline against the sky — that needs real edges.
        const segsX = r.crests * RUMBLE_SAMPLES
        const half = RUMBLE_W / 2

        // NON-UNIFORM rows across the lane. A uniform PlaneGeometry cannot do this job: at 4 rows
        // across 6 m the vertices sit at z = ±3, ±1.5, 0, so the mesh linearly interpolated the
        // edge feather across a metre and a half and every bump visibly ramped down to the ground
        // long before the lane edge — the surface was constant-height, the MESH was not. Put the
        // rows where the surface actually varies (a few across the 25 cm feather) and span the
        // constant-height interior with a single row of quads.
        const zs = []
        const EDGE_ROWS = 4
        for (let i = 0; i <= EDGE_ROWS; i++) zs.push(-half + RUMBLE_EDGE * (i / EDGE_ROWS))
        for (let i = EDGE_ROWS; i >= 0; i--) zs.push(half - RUMBLE_EDGE * (i / EDGE_ROWS))
        const nz = zs.length, nx = segsX + 1

        const verts = new Float32Array(nx * nz * 3)
        for (let iz = 0; iz < nz; iz++) {
            const wz = r.z + zs[iz]
            for (let ix = 0; ix < nx; ix++) {
                const wx = r.len * ix / segsX
                const o = (iz * nx + ix) * 3
                verts[o] = wx; verts[o + 1] = rumbleSurface(wx, wz).y; verts[o + 2] = wz
            }
        }
        const idx = []
        for (let iz = 0; iz < nz - 1; iz++) {
            for (let ix = 0; ix < nx - 1; ix++) {
                const a = iz * nx + ix, b = a + 1, c = a + nx, d = c + 1
                idx.push(a, c, b, b, c, d)
            }
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
        geo.setIndex(idx)
        geo.computeVertexNormals()
        geo.computeBoundingSphere()

        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            color: 0x6a6f75, roughness: 0.95, metalness: 0,
            // The troughs sit at exactly y=0, coplanar with the lab floor, and coplanar surfaces
            // z-fight: which one wins is decided by float rounding, so it flickers per-pixel as the
            // camera moves. Bias this mesh toward the viewer in the DEPTH BUFFER ONLY — the geometry
            // does not move, so physics and the visual surface stay identical.
            polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        }))
        m.receiveShadow = true
        this._group.add(m)
        // Edge stripes so the lane reads from a distance, plus a start bar.
        this._line(0, r.z - RUMBLE_W / 2, r.len, r.z - RUMBLE_W / 2, COL.lane, W_LANE)
        this._line(0, r.z + RUMBLE_W / 2, r.len, r.z + RUMBLE_W / 2, COL.lane, W_LANE)
        this._line(0, r.z - RUMBLE_W / 2, 0, r.z + RUMBLE_W / 2, COL.brake, W_GATE)
        return m
    }

    _build() {
        if (this._built) return
        this._built = true
        const zL = STRIP_Z - LANE / 2, zR = STRIP_Z + LANE / 2

        // ── drag strip: +X, lane edges + 100 m marks + start/finish/brake boards ────────────
        this._line(0, zL, DRAG_LEN + STRIP_RUNOFF, zL, COL.lane, W_LANE)
        this._line(0, zR, DRAG_LEN + STRIP_RUNOFF, zR, COL.lane, W_LANE)
        // Distance marks. A bare line at 100/200/300 tells you nothing about WHICH mark it is, and
        // flat paint 400 m away is a few pixels from the driver's seat — the strip's length was
        // genuinely unreadable in screenshots. So each mark carries its hundreds as a row of
        // upright POSTS beside the lane: one post at 100 m, two at 200, three at 300, four at the
        // 400 m finish (those in red). Posts have height, so they stand against the sky and stay
        // countable the length of the strip; and it needs no font atlas.
        for (let d = 100; d <= DRAG_LEN; d += 100) {
            const isFinish = d === DRAG_LEN
            if (!isFinish) this._line(d, zL, d, zR, COL.paint, W_MARK)
            const n = d / 100
            for (let b = 0; b < n; b++) {
                const off = 4 + b * 4.5                     // m outboard of the lane edge, per post
                this._post(d, zL - off, isFinish ? COL.finish : COL.paint)
                this._post(d, zR + off, isFinish ? COL.finish : COL.paint)
            }
        }
        this._line(0, zL, 0, zR, COL.start, W_GATE)                  // start
        this._line(DRAG_LEN, zL, DRAG_LEN, zR, COL.finish, W_GATE)   // finish
        this._line(BRAKE_MARK, zL, BRAKE_MARK, zR, COL.brake, W_GATE) // "brake here" board

        // ── rumble lanes ───────────────────────────────────────────────────────────────────
        for (const r of RUMBLES) this._rumbleMesh(r)

        // ── skidpads: the ring to follow, a lane band either side, and a timing radial ──────
        for (const p of PADS) {
            this._ring(p.cx, p.cz, p.r, COL.paint, W_RING)              // the line to follow
            this._ring(p.cx, p.cz, p.r - 3, COL.lane, W_LANE)           // lane band, inner
            this._ring(p.cx, p.cz, p.r + 3, COL.lane, W_LANE)           // lane band, outer
            // Timing line: radial on the pad's NEAR (+Z) side — the edge you meet coming off the
            // strip, so the lap starts where you join rather than half a lap later.
            this._line(p.cx, p.cz + (p.r - 4.5), p.cx, p.cz + (p.r + 4.5), COL.start, W_GATE)
        }

        this._scene.add(this._group)
    }

    // ── lifecycle ───────────────────────────────────────────────────────────────────────────
    enter() {
        this._build()
        this._group.visible = true
        this._active = true
        this._prev = null
        this._drag = null; this._brake = null; this._laps.clear()
        this.status = 'drive through a green gate to start timing'
    }

    exit() {
        this._group.visible = false
        this._active = false
        this._drag = null; this._brake = null; this._laps.clear()
    }

    isActive() { return this._active }

    /**
     * Spawn pose: staged on the drag-strip start line, pointing down it (+X).
     * heading is the map2d/teleport convention, atan2(tangentX, tangentZ); -π/2 aims body-forward
     * (-Z) at +X. See _seatOnGroundPlane in main.js, which puts the front axle at local -Z and
     * rotates by heading about +Y.
     */
    spawnPose() { return { x: -0.35, z: STRIP_Z, heading: -Math.PI / 2 } }

    results() { return this._runs }

    // ── per-frame ───────────────────────────────────────────────────────────────────────────
    /**
     * Cheap: one segment-crossing test per gate. Called from the fixed step with sim dt.
     */
    update(dt) {
        if (!this._active) return
        const car = this._getCar()
        const p1 = { x: car.x, z: car.z }
        const p0 = this._prev
        this._prev = p1
        if (!p0) return
        const zL = STRIP_Z - LANE / 2, zR = STRIP_Z + LANE / 2

        // Advance live timers first, so a gate that closes this step reports the right total.
        if (this._drag) {
            this._drag.t += dt
            // 0→100 km/h split, caught on the way past.
            if (this._drag.v100 == null && car.speed >= 100 / 3.6) this._drag.v100 = this._drag.t
        }
        for (const l of this._laps.values()) l.t += dt

        // ── drag strip ──────────────────────────────────────────────────────────────────────
        // The truck stages ON the line (spawnPose), so a run normally begins from rest. The entry
        // speed is recorded and reported either way: a rolling start flatters the 0–100 badly
        // (30 m of run-up turned 9.5 s into 5.7 s in testing), and a number that silently means
        // two different things is worse than no number.
        if (this._crossed(p0, p1, 0, zL, 0, zR)) {
            // Only arm when heading down the strip (+X), so rolling back over the line is inert.
            if (p1.x > p0.x) { this._drag = { t: 0, v100: null, v0: car.speed }; this.status = 'timing: drag 400 m' }
        }
        if (this._drag && this._crossed(p0, p1, DRAG_LEN, zL, DRAG_LEN, zR)) {
            const d = this._drag; this._drag = null
            // 8 km/h, not 0: the truck stages with its BODY CENTER on the line, and releasing the
            // parking brake rolls it ~0.35 m before the center crosses — inherently ~6 km/h. That
            // costs ~0.4 s on the 0–100 split (9.08 s in the lab vs 9.48 s from rest headless).
            const standing = d.v0 < 8 / 3.6
            this._finish('drag 400 m', d.t, {
                detail: `trap ${(car.speed * 3.6).toFixed(0)} km/h`
                    + (d.v100 ? ` · 0–100 in ${d.v100.toFixed(2)} s` : '')
                    + (standing ? '' : ` · ROLLING from ${(d.v0 * 3.6).toFixed(0)} km/h`),
                derived: (d.v100 && standing) ? `implied accel ${((100 / 3.6) / d.v100).toFixed(2)} m/s²` : null,
            })
        }

        // ── braking: armed by the DRIVER'S BRAKE INPUT at speed, not by a line ──────────────
        // A trigger line is gameable — you can cross it and keep accelerating, which is exactly
        // what happened in testing (a 210 m "braking distance" that was mostly throttle). Arming on
        // "brake applied above BRAKE_ARM_V, and stay off the throttle" measures the thing itself.
        // The painted yellow board stays as a visual "brake here" cue for a repeatable entry point.
        if (!this._brake && car.brake > 0.5 && car.speed >= BRAKE_ARM_V) {
            this._brake = { x0: p1.x, z0: p1.z, v0: car.speed }
            this.status = `timing: braking from ${(car.speed * 3.6).toFixed(0)} km/h`
        }
        if (this._brake) {
            if (car.throttle > 0.1) { this._brake = null; this.status = 'braking run voided (throttle)' }
            else if (car.speed < 0.5) {
                const b = this._brake; this._brake = null
                const dist = Math.hypot(p1.x - b.x0, p1.z - b.z0)
                if (dist > 3) {
                    this._finish('braking', dist, {
                        unit: 'm',
                        detail: `from ${(b.v0 * 3.6).toFixed(0)} km/h`,
                        derived: `implied decel ${(b.v0 * b.v0 / (2 * dist)).toFixed(2)} m/s²`,
                    })
                }
            }
        }

        // ── skidpad laps ────────────────────────────────────────────────────────────────────
        for (const pad of PADS) {
            const live = this._laps.get(pad.name)
            // Accumulate swept angle about the pad centre (unwrapped), so a lap can only close
            // after very nearly a full turn — see LAP_ANGLE.
            if (live) {
                const th = Math.atan2(p1.z - pad.cz, p1.x - pad.cx)
                let d = th - live.theta
                while (d > Math.PI) d -= 2 * Math.PI
                while (d < -Math.PI) d += 2 * Math.PI
                live.swept += d
                live.theta = th
            }
            const x = pad.cx
            if (!this._crossed(p0, p1, x, pad.cz + (pad.r - 4.5), x, pad.cz + (pad.r + 4.5))) continue
            const start = () => this._laps.set(pad.name, {
                t: 0, swept: 0, theta: Math.atan2(p1.z - pad.cz, p1.x - pad.cx),
            })
            if (!live) { start(); this.status = `timing: ${pad.name}`; continue }
            if (live.t < MIN_LAP || Math.abs(live.swept) < LAP_ANGLE) continue   // not a lap
            const v = 2 * Math.PI * pad.r / live.t
            const mu = v * v / (G * pad.r)
            start()                                            // rolling laps: one closes, the next opens
            this._finish(pad.name, live.t, {
                detail: `${(v * 3.6).toFixed(1)} km/h`,
                // The whole reason the lab exists: mu a human actually realized at this radius.
                derived: `mu ${mu.toFixed(3)}`,
                mu,
            })
        }
    }

    _finish(track, value, { unit = 's', detail = '', derived = null, mu = null } = {}) {
        const rec = { track, value, unit, detail, derived, mu, at: this._runs.length }
        this._runs.unshift(rec)
        if (this._runs.length > 12) this._runs.pop()
        // Best = lowest for times AND for braking distance (both are "less is better").
        const prev = this.best.get(track)
        if (!prev || value < prev.value) this.best.set(track, rec)
        this.status = `${track}: ${value.toFixed(unit === 's' ? 2 : 1)} ${unit}`
            + (derived ? ` — ${derived}` : '')
    }

    /**
     * Did the segment p0→p1 cross the gate segment (ax,az)–(bx,bz)? Standard XZ segment test.
     * Both endpoints strictly on opposite sides of the other segment's line.
     */
    _crossed(p0, p1, ax, az, bx, bz) {
        const d = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px)
        const d1 = d(ax, az, bx, bz, p0.x, p0.z)
        const d2 = d(ax, az, bx, bz, p1.x, p1.z)
        if ((d1 > 0) === (d2 > 0)) return false
        const d3 = d(p0.x, p0.z, p1.x, p1.z, ax, az)
        const d4 = d(p0.x, p0.z, p1.x, p1.z, bx, bz)
        return (d3 > 0) !== (d4 > 0)
    }
}

export { PADS, RUMBLES, STRIP_Z, LANE, DRAG_LEN, RUMBLE_LEN, RUMBLE_W }
