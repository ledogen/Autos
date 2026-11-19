// FEAT-61 — aiming and the thrown newspaper.
//
// Deliberately its own module and deliberately NOT in the mission. The roll is a body with a launch
// state and a rest point; the paper route is a scoring system that happens to consume rest points.
// FEAT-277 made the roll a real engine body (it used to be a ballistic solver with no bounce).
//
// THREE-free and DOM-free on purpose — the throw is the part worth gating headlessly, and a gate
// should not have to construct a renderer to ask where a paper comes to rest.

export const THROW_PARAMS = {
    throwSpeed:  16,      // m/s along the aim direction. Roughly a hard overarm throw; the truck's
                          // own velocity is added on top, so a paper thrown forward at 20 m/s lands
                          // a long way down the road and one thrown backward barely leaves your hand.
    // Quadratic air drag: a = −dragK·|v|·v. REVERSED FROM THE ORIGINAL RULING (owner, 2026-08-07 —
    // "it would feel better with some drag"); the first pass was gravity-only.
    //
    // One lumped coefficient rather than Cd/ρ/A/m spelled out, because only the lump is
    // identifiable from feel and four knobs that only ever move together are three knobs too many.
    // dragK = ½·Cd·ρ·A/m ≈ ½ · 0.9 · 1.225 · 0.015 m² / 0.25 kg ≈ 0.033 m⁻¹ for a tumbling roll,
    // which puts terminal velocity at √(g/dragK) ≈ 17 m/s — a dense little paper log, which is what
    // it is. At the 16 m/s launch it takes about as much speed out of the throw as gravity does,
    // so the arc drops off instead of sailing.
    // SIMPLIFIED: orientation-averaged (a real roll shows 0.006 m² end-on to 0.038 m² broadside) and no
    // lift or Magnus force from the spin. Applied as a force on the engine body each step (debris.js).
    dragK:       0.033,   // 1/m
    // ── FEAT-277: the paper is a rigid body (debris.js 'paper'); it scores where it comes to REST ──────────
    massKg:      0.25,    // kg — the mass dragK was derived on. A weekday paper rolled and banded.
    scale:       2,       // the collider AND the mesh at the drawn 2× (main.js has drawn it at 2× since 2026-08-05
                          // for readability): 180 × 132 × 840 mm, the asset's flattened oval section. MESH ==
                          // PHYSICS, so the roll you watch hit the wall is the one that stops there.
    // Contact, owner 2026-11-17: "almost no rebound … very high friction on the ground … prevent it from rolling".
    // The engine mixes a pair as μ = √(μa·μb) and e = max(ea, eb); ground and POI solids are μ 0.8 / road 0.9,
    // e 0 (terrain-physics.js), and below 1 m/s approach the engine makes every contact plastic.
    friction:    3,       // → pair μ 1.55 on grass and house walls, 1.64 on asphalt. Real paper on dry grass or
                          // concrete is ~0.5–0.7; the rest is a LUMP standing in for a soft roll ploughing into
                          // the turf (the owner asked for very high friction, not for paper's). At μ 1 the mean
                          // slide after landing measured 1.6 m (max 3.1) on flat grass, at 3 it is 0.9 m (max 1.6).
    restitution: 0,       // a soft paper log is near-perfectly plastic: it thuds, it does not bounce
    rollingResistance: 1, // the engine's rolling-resistance coefficient (Box3D, per contact): a soft roll flattens
                          // under its weight and its layers slip, so it stops rather than rolls. Measured: at 0 a
                          // paper set down on a 20° bank rolled 2.9 m in 8 s (30°: 8 m); at 1 it stays (1–3 cm).
    restV:       0.1,     // m/s  — "at rest": centre speed below this …
    restW:       1.0,     // rad/s — … and spin below this (a 74 mm half-section rolling at 1 rad/s creeps 7 cm/s) …
    restS:       0.25,    // s    — … for longer than this (owner: "more than a quarter second")
    maxFlightS:  8,       // s — hard timeout: a paper still moving 8 s after it left the truck (down a long hill,
                          // off a cliff) is scored where it is then.
    hullSides:   8,       // the collider's section, an octagon inscribed in the asset's oval
    liveCap:     8,       // papers simulated at once; a ninth throw settles the oldest where it is (see PaperThrows)
}

/**
 * FEAT-277: the paper's collider at the asset's own size (debris.js scales it with the mesh): a prism along Z of
 * the news-roll.glb envelope, 90 × 66 × 420 mm, its section an n-gon inscribed in that oval. The asset's own 186
 * vertices are past the engine's hull limit, and an authored hull is the same shape with no thinning pass.
 */
export function paperHull (n = THROW_PARAMS.hullSides, a = 0.045, b = 0.033, hz = 0.21) {
    const out = []
    for (let i = 0; i < n; i++) {
        const t = (i + 0.5) * 2 * Math.PI / n
        out.push(a * Math.cos(t), b * Math.sin(t), -hz, a * Math.cos(t), b * Math.sin(t), hz)
    }
    return out
}

/**
 * FEAT-277: the thrown papers, simulated by the engine through the debris path and settled where they REST.
 *
 * Owner 2026-11-17: "detect when the paper has come to rest for more than a quarter second, and then count the
 * shot scored where it lies" — on a lawn, against a wall, or on top of a POI. At rest = centre speed < restV and
 * spin < restW, held for > restS; a paper still moving maxFlightS after the throw is settled where it is then.
 * Settling ends the simulation (debris.js detach): the body goes, the mesh stays on the lawn where it scored and
 * is the caller's. So the live count is the papers between the throw and their rest, at most liveCap.
 *
 * Engine-free and THREE-free like the rest of this module: the debris system is handed in (main.js's, or a
 * gate's), and step() runs once per physics step, AFTER the engine steps.
 */
const _l = { x: 0, y: 0, z: 0 }, _a = { x: 0, y: 0, z: 0 }
export class PaperThrows {
    constructor (debris, P = THROW_PARAMS) { this._d = debris; this._P = P; this.live = []; this._forced = [] }

    /**
     * A paper leaves the truck at p0 with velocity v0 (launchVelocity), lying flat. Returns the flight { body, t, contactT, stillS } or null when the
     * model has not loaded yet (the first seconds of a cold boot): then no throw happened.
     */
    throw (p0, v0) {
        // Past liveCap the OLDEST is settled where it is now, flagged timedOut, and reported by the next step().
        if (this.live.length >= this._P.liveCap) this._forced.push(this._settle(0, true))
        // BROADSIDE, NO SPIN. Model −Z is the long axis; yaw θ puts it at (−sinθ, 0, −cosθ), across the heading.
        // Measured on a wall: broadside, the plastic hit stops the whole roll at once and it drops 0.1–0.6 m off
        // the wall; flown end-on (a javelin) the end sticks, the roll pivots on it and lands up to 2.4 m out.
        // No spin: the drag acts at the centre, so the roll lands exactly as it left, which is what makes the
        // landing predictable (a spin about the vertical turns it through a flight-time-dependent angle; a
        // backspin about the long axis measured no shorter slide). The flight is a pure function of p0 and v0.
        const th = Math.atan2(v0.z, -v0.x) / 2
        const body = this._d.spawn('paper', p0, v0, { pinned: true,
            quaternion: { x: 0, y: Math.sin(th), z: 0, w: Math.cos(th) }, spin: { x: 0, y: 0, z: 0 } })
        if (body == null) return null
        const f = { body, t: 0, contactT: null, stillS: 0 }
        this.live.push(f)
        return f
    }

    /**
     * Advance the rest clocks by one physics step of dt seconds. Returns this step's events, oldest flight
     * first: { type: 'contact', f } the first time a paper touches anything (the slap), and
     * { type: 'rest', f, x, y, z, mesh, timedOut } when one settles — x/z/y is its centre, where it scores.
     */
    step (dt) {
        const P = this._P, out = this._forced.splice(0)
        for (let i = 0; i < this.live.length;) {
            const f = this.live[i]
            if (!this._d.velocity(f.body, _l, _a)) { this.live.splice(i, 1); continue }   // reclaimed under us (clear)
            f.t += dt
            if (f.contactT == null && this._d.touching(f.body)) { f.contactT = f.t; out.push({ type: 'contact', f }) }
            const still = Math.hypot(_l.x, _l.y, _l.z) < P.restV && Math.hypot(_a.x, _a.y, _a.z) < P.restW
            f.stillS = still ? f.stillS + dt : 0
            if (f.stillS > P.restS || f.t >= P.maxFlightS) out.push(this._settle(i, f.t >= P.maxFlightS))
            else i++
        }
        return out
    }

    _settle (i, timedOut) {
        const f = this.live.splice(i, 1)[0]
        const mesh = this._d.detach(f.body)
        return { type: 'rest', f, x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, mesh, timedOut }
    }

    /** Drop every paper still moving, unscored (leaving the region, putting a round down). Returns the meshes of
     *  papers already settled but not yet reported, which the caller now owns (to take off the lawn). */
    clear () {
        this._d.remove(this.live.map(f => f.body)); this.live.length = 0
        return this._forced.splice(0).map(e => e.mesh)
    }
}

/**
 * Launch velocity for an aim direction: the throw itself, plus the truck's velocity.
 *
 * Inheriting the vehicle's velocity is the ruling and it is also the mechanic — the route is driven,
 * not parked at, so every throw has to be led. A paper thrown sideways out of a truck doing 15 m/s
 * travels forward as fast as it travels sideways, and learning that is the skill the accuracy axis
 * is measuring.
 */
export function launchVelocity (aimDir, carVel, P = THROW_PARAMS) {
    const l = Math.hypot(aimDir.x, aimDir.y, aimDir.z) || 1
    return {
        x: (aimDir.x / l) * P.throwSpeed + (carVel?.x ?? 0),
        y: (aimDir.y / l) * P.throwSpeed + (carVel?.y ?? 0),
        z: (aimDir.z / l) * P.throwSpeed + (carVel?.z ?? 0),
    }
}

/**
 * Accuracy of one landing against one target (FEAT-61's fifth axis).
 *
 *   q(0)        = 1.0    a dead-centre throw is worth a whole paper
 *   q(TARGET_R) = FLOOR  the worst throw that still counts is worth 0.30 of one
 *   q(> R)      = 0      not a delivery at all; the paper is spent
 *
 * Linear between, and the cliff at the rim is intentional: a delivery is binary, and the rim is the
 * property line. 2.99 m is a bad throw onto the lawn, 3.01 m is a paper in the road.
 */
export const ACC_FLOOR = 0.30

export function accuracyScore (dist, targetR, floor = ACC_FLOOR) {
    if (!(dist >= 0) || !(targetR > 0)) return 0
    if (dist > targetR) return 0
    return 1 - (1 - floor) * (dist / targetR)
}
