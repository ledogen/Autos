/**
 * src/lab.js — the testing lab: an isolated flat world with instrumented tracks.
 *
 * WHY THIS EXISTS. Grid world (D-18) hid the terrain chunks and nothing else, so the road ribbons,
 * props and water stayed floating at their real elevations while the truck sat on a plane at y=0 —
 * the flat world read as "parked underneath the real one", and every worldgen system kept streaming
 * and drawing. The lab is a real mode: the generated world is torn down (hidden AND stopped), and
 * what's left is a bare plane with painted tracks.
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
 * SM-INV-2: nothing here feeds par at runtime. It prints numbers for a human to freeze into
 * PAR_REF by hand.
 *
 * Timing is fully automatic — gates fire on crossing, there is no button to fumble mid-run.
 */

import * as THREE from 'three'

const G = 9.81
const LANE = 8            // m — drag-strip lane width
const PAINT_Y = 0.02      // m — paint sits just above the plane (avoids z-fighting)
const MIN_LAP = 4.0       // s — secondary sanity floor on lap time
// A lap must actually GO AROUND. Timing purely on line crossings lets a driver idling near the
// line wobble across it and bank a nonsense "lap" (caught by test/lab-timing.mjs: 4.02 s on the
// 60 m pad, which would report a mu of ~4). We accumulate the unwrapped angle swept about the pad
// centre and require very nearly a full turn.
const LAP_ANGLE = 1.9 * Math.PI   // rad — swept angle required to count a lap
const DRAG_LEN = 400      // m — the timed acceleration run
const BRAKE_MARK = -450   // z — painted "brake here" board (visual aid only; see the braking test)
const BRAKE_ARM_V = 27    // m/s (~97 km/h) — braking test arms above this speed

// Skidpad rings: radius + center, laid out along +X with clear gaps between them.
// 25 m ≈ a tight switchback, 60 m ≈ a typical mountain corner, 150 m ≈ a fast sweeper —
// bracketing the radii the router actually produces (hard floor 8 m, most corners 20–120 m).
const PADS = [
    { r: 25,  cx: 120, cz: 0, name: 'skidpad 25 m' },
    { r: 60,  cx: 300, cz: 0, name: 'skidpad 60 m' },
    { r: 150, cx: 650, cz: 0, name: 'skidpad 150 m' },
]

const COL = { paint: 0xe8e8e0, start: 0x5ad06a, finish: 0xff5a3c, brake: 0xffcf3c, lane: 0x8a8a80 }
// Line weights are generous on purpose: at 400 m down the strip, or on the far side of the 150 m
// ring, a realistically-thin 0.15 m line is sub-pixel and you cannot see the thing you are meant
// to be following. This is an instrument, not a photograph.
const W_GATE = 1.4, W_MARK = 0.7, W_RING = 1.0, W_LANE = 0.45

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
        this._drag = null            // { t, v100: number|null }
        this._brake = null           // { z0, v0 }
        this._laps = new Map()       // pad name → { t, swept, theta }
        this.status = 'drive through a green gate to start timing'
    }

    // ── geometry ────────────────────────────────────────────────────────────────────────────
    _line(x0, z0, x1, z1, color, w = 0.35) {
        const len = Math.hypot(x1 - x0, z1 - z0)
        const geo = new THREE.PlaneGeometry(len, w)
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, toneMapped: false }))
        m.rotation.x = -Math.PI / 2
        m.rotation.z = -Math.atan2(z1 - z0, x1 - x0)
        m.position.set((x0 + x1) / 2, PAINT_Y, (z0 + z1) / 2)
        this._group.add(m)
        return m
    }

    _ring(cx, cz, r, color, w = 0.35) {
        const geo = new THREE.RingGeometry(r - w / 2, r + w / 2, 192)
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false }))
        m.rotation.x = -Math.PI / 2
        m.position.set(cx, PAINT_Y, cz)
        this._group.add(m)
        return m
    }

    _build() {
        if (this._built) return
        this._built = true

        // ── drag strip: origin → -Z, lane edges + 100 m marks + start/finish gates ──────────
        this._line(-LANE / 2, 0, -LANE / 2, -DRAG_LEN - 120, COL.lane, W_LANE)
        this._line(LANE / 2, 0, LANE / 2, -DRAG_LEN - 120, COL.lane, W_LANE)
        for (let d = 100; d < DRAG_LEN; d += 100) this._line(-LANE / 2, -d, LANE / 2, -d, COL.paint, W_MARK)
        this._line(-LANE / 2, 0, LANE / 2, 0, COL.start, W_GATE)                  // start
        this._line(-LANE / 2, -DRAG_LEN, LANE / 2, -DRAG_LEN, COL.finish, W_GATE) // finish
        this._line(-LANE / 2, BRAKE_MARK, LANE / 2, BRAKE_MARK, COL.brake, W_GATE) // "brake here" board

        // ── skidpads: the ring to follow, a lane band either side, and a timing radial ──────
        for (const p of PADS) {
            this._ring(p.cx, p.cz, p.r, COL.paint, W_RING)              // the line to follow
            this._ring(p.cx, p.cz, p.r - 3, COL.lane, W_LANE)           // lane band, inner
            this._ring(p.cx, p.cz, p.r + 3, COL.lane, W_LANE)           // lane band, outer
            // Timing line: radial on the -Z side, spanning the lane. Crossing it either way laps.
            this._line(p.cx, p.cz - (p.r - 4.5), p.cx, p.cz - (p.r + 4.5), COL.start, W_GATE)
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
     * Spawn pose: on the drag strip, a little behind the start line, pointing down it.
     * heading 0 = body forward (-Z) points at -Z — see _seatOnGroundPlane in main.js, which
     * places the front axle at local -Z and rotates by heading about +Y.
     */
    spawnPose() { return { x: 0, z: 0.35, heading: 0 } }   // staged AT the line (body center)

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
        if (this._crossed(p0, p1, -LANE / 2, 0, LANE / 2, 0)) {
            // Only arm when heading down the strip (-Z), so rolling back to the line doesn't start a run.
            if (p1.z < p0.z) { this._drag = { t: 0, v100: null, v0: car.speed }; this.status = 'timing: drag 400 m' }
        }
        if (this._drag && this._crossed(p0, p1, -LANE / 2, -DRAG_LEN, LANE / 2, -DRAG_LEN)) {
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
            if (!this._crossed(p0, p1, x, pad.cz - (pad.r - 4), x, pad.cz - (pad.r + 4))) continue
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

export { PADS }
