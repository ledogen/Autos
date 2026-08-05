// FEAT-61 — aiming and the thrown newspaper.
//
// Deliberately its own module and deliberately NOT in the mission. The roll is a projectile with a
// launch state and a landing point; the paper route is a scoring system that happens to consume
// landing points. Keeping them apart is what makes the box-physics upgrade a later ticket with one
// obvious place to land instead of a rewrite of the mission.
//
// THREE-free and DOM-free on purpose — the ballistics are the part worth gating headlessly, and a
// gate should not have to construct a renderer to ask where a paper lands.

export const THROW_PARAMS = {
    throwSpeed:  16,      // m/s along the aim direction. Roughly a hard overarm throw; the truck's
                          // own velocity is added on top, so a paper thrown forward at 20 m/s lands
                          // a long way down the road and one thrown backward barely leaves your hand.
    gravity:     9.81,    // m/s². The only force. No drag, no bounce, no spin (owner ruling) — a
                          // rolled newspaper is dense and the flight is short, so drag would be a
                          // parameter nobody could feel and a bounce would move the scoring point
                          // away from where the player watched it hit.
    maxFlightS:  8,       // s — integration bail-out. A throw off a cliff must terminate; it also
                          // stops a NaN ground sample from spinning the loop forever.
    stepS:       1 / 120, // s — fixed integration step, half the physics tick. Fine enough that the
                          // landing point does not depend on frame rate, which it must not: two
                          // players throwing identically have to score identically.
}

/**
 * Integrate one throw to the ground and return where it lands.
 *
 * @param {{x,y,z}} p0        launch position (world)
 * @param {{x,y,z}} v0        launch velocity (world) — aim × speed, plus the truck's velocity
 * @param {(x:number,z:number)=>number} groundY  surface height; road where there is road, terrain
 *                                               otherwise. Must be finite over the flight path.
 * @param {object}  P         THROW_PARAMS override
 * @returns {{x,y,z,t,steps}|null}  landing point and flight time, or null if it never came down
 *
 * The landing point is the SEGMENT/GROUND intersection, not the first sample under the surface —
 * linear interpolation across the step that crossed. At 1/120 s and ~16 m/s a step is 13 cm, and
 * scoring reads distance-from-centre in metres against a 3 m circle, so a whole step of error is
 * 4% of the target radius. Interpolating costs one divide and removes the question.
 */
export function simulateThrow (p0, v0, groundY, P = THROW_PARAMS) {
    let x = p0.x, y = p0.y, z = p0.z
    let vx = v0.x, vy = v0.y, vz = v0.z
    const dt = P.stepS
    const maxSteps = Math.ceil(P.maxFlightS / dt)

    let gy = groundY(x, z)
    if (!isFinite(gy)) return null
    // Launched already below ground (thrown into a bank at point-blank range): land immediately
    // rather than integrate away from the surface and pretend it flew.
    if (y <= gy) return { x, y: gy, z, t: 0, steps: 0 }

    for (let i = 1; i <= maxSteps; i++) {
        const px = x, py = y, pz = z
        // EXACT for constant acceleration — the ½g·dt² term is the whole difference between this
        // and semi-implicit Euler, and it is not cosmetic: Euler's per-step bias accumulates to
        // ~4 cm of range over a 1.4 s flight, which is 1.4% of the 3 m target radius and would show
        // up as papers scoring a hair worse the higher they were thrown. Gravity is the only force
        // here, so there is no reason to accept any integration error at all.
        x += vx * dt
        y += vy * dt - 0.5 * P.gravity * dt * dt
        z += vz * dt
        vy -= P.gravity * dt

        const g = groundY(x, z)
        if (!isFinite(g)) return null
        if (y <= g) {
            // Interpolate the crossing. f is where in THIS step the paper met the ground, solving
            // (py − pgy) + f·((y − g) − (py − pgy)) = 0 with the surface itself linearised across
            // the step — which is what makes this exact on a flat pad and honest on a slope.
            const pg = groundY(px, pz)
            const h0 = py - (isFinite(pg) ? pg : g)
            const h1 = y - g
            const f = h0 === h1 ? 1 : Math.min(1, Math.max(0, h0 / (h0 - h1)))
            const lx = px + (x - px) * f, lz = pz + (z - pz) * f
            const ly = groundY(lx, lz)
            return { x: lx, y: isFinite(ly) ? ly : g, z: lz, t: (i - 1 + f) * dt, steps: i }
        }
    }
    return null   // still airborne after maxFlightS — off a cliff, or aimed at the sky
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
