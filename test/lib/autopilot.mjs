// test/lib/autopilot.mjs — a road autopilot. One instance per car: vehicle state in, driver controls out.
//
// PURE: no DOM, no window, no Three.js, no engine. It reads a plain state ({ position, velocity, quaternion } with x/y/z/w
// fields) and returns the controls a driver would give: steer as a road-wheel angle in radians, + = LEFT (the
// vehicleState.steerAngle convention), throttle and brake in [0, 1]. What applies them is the consumer's: PERF-40's bench
// maps them onto a virtual gamepad; drive-soak could set vehicleState directly; in-game AI cars (owner, 2026-11-12: "a
// general purpose autopilot will be very valuable for AI cars in game") would do the same per car. Promote this file to
// src/ when that consumer lands; until then nothing in src/ imports it.
//
// The pieces, each replaceable on its own:
//   makeRoute(edges, rng, from)  WHERE to go — a random walk over the network's edges (drive-soak's router). An AI car
//                                with a destination swaps this for a shortest path; the driver only needs { path, extend }.
//   speed plan                   HOW FAST — the curvature of the next 90 m, v = √(aLat·R + 2·aBrake·s) per point.
//   pure pursuit                 WHERE to point — steer at the route point a look-ahead ahead (0.9 s of travel).
//   trouble                      what the driver cannot fix by driving: stuck, flipped, off the route, a route jump.
//                                It is REPORTED, never acted on; the consumer re-seats (resume()) or does what it likes.
// Not here yet (an AI car needs them, the bench does not): other cars and obstacles, lanes and the side of the road,
// junction right-of-way, reversing out of a dead end.

const hyp = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az)
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a))

/** A random walk over road edges ({ points: [{x, z}…] }), joined into one polyline that grows on demand. Junctions are
 *  edge ENDS within 6 m of each other. A dead end, or only hairpins (> 100° from the arrival heading, not drivable by
 *  pursuit), JUMPS to a random edge elsewhere: the point carries `jump: true` and the driver reports it as trouble. */
export function makeRoute (edges, rng, from) {
  edges = edges.filter(e => e.points?.length >= 2)
  const ends = [], node = new Map(), nodes = []
  for (const e of edges) ends.push({ e, end: 0, p: e.points[0] }, { e, end: 1, p: e.points.at(-1) })
  // ponytail: O(ends × nodes) node match, ~40 ms on a 2500 m region; a spatial hash if networks get much bigger.
  for (const en of ends) {
    let n = nodes.find(m => hyp(m.x, m.z, en.p.x, en.p.z) < 6)
    if (!n) { n = { x: en.p.x, z: en.p.z, ends: [] }; nodes.push(n) }
    n.ends.push(en); node.set(en, n)
  }
  const endOf = (e, end) => ends.find(x => x.e === e && x.end === end)
  const heading = (a, b) => Math.atan2(b.z - a.z, b.x - a.x)
  const leaving = en => { const pts = en.e.points, k = Math.min(3, pts.length - 1); return en.end === 0 ? heading(pts[0], pts[k]) : heading(pts.at(-1), pts.at(-1 - k)) }
  const path = []
  const push = (en, jump = false) => {
    const pts = en.end === 0 ? en.e.points : [...en.e.points].reverse()
    pts.forEach((q, i) => path.push(i === 0 && jump ? { x: q.x, z: q.z, jump: true } : { x: q.x, z: q.z }))
  }
  // Start on the edge nearest `from`.
  let cur = null, bd = Infinity
  for (const en of ends) for (const q of en.e.points) { const d = hyp(q.x, q.z, from.x, from.z); if (d < bd) { bd = d; cur = en } }
  push(cur)
  const extend = () => {
    const n = node.get(endOf(cur.e, 1 - cur.end))
    const arrive = heading(path.at(-Math.min(4, path.length)), path.at(-1))
    const next = n.ends.filter(x => x.e !== cur.e && Math.abs(wrap(leaving(x) - arrive)) < 100 * Math.PI / 180)
    if (next.length) { cur = next[Math.floor(rng() * next.length)]; push(cur) }
    else { cur = endOf(edges[Math.floor(rng() * edges.length)], rng() < 0.5 ? 0 : 1); push(cur, true) }
  }
  return { path, extend, edges: edges.length }
}

/**
 * @param o.car      { wheelbase, maxSteerAngle, speedSteerRef } — the steer envelope is maxSteer / (1 + v/speedSteerRef),
 *                   the game's own speed-scaled limit (vehicle.js M1-08), so full lock here is full lock there.
 * @param o.route    { path, extend } from makeRoute (or anything shaped like it)
 * @param o.inBore   optional (x, z) => bool — inside a tunnel: shorter look-ahead, 10 m/s cap
 * @param o.vMax, o.aLat, o.aBrake   cruise speed (m/s), cornering and braking budget (m/s²)
 */
export function createAutopilot ({ car, route, inBore = () => false, vMax = 24, aLat = 3.5, aBrake = 3 }) {
  const { path } = route
  let idx = 0, dist = 0, clock = 0, detour = null, lastThr = 0, stuckT = 0, flipT = 0, lostT = 0
  const ahead = (i, m) => {   // the index `m` metres of route ahead of i, stopping short of a jump
    let acc = 0
    while (i < path.length - 2 && acc < m && !path[i + 1].jump) { acc += hyp(path[i].x, path[i].z, path[i + 1].x, path[i + 1].z); i++ }
    return i
  }
  const nearest = (p, lo, hi) => { let bi = lo, b = Infinity; for (let j = lo; j < hi; j++) { const d = hyp(path[j].x, path[j].z, p.x, p.z); if (d < b) { b = d; bi = j } } return bi }
  const reset = () => { stuckT = flipT = lostT = 0; lastThr = 0 }

  const ap = {
    get idx () { return idx }, get dist () { return dist }, get detouring () { return !!detour }, dbg: null,
    /** Snap the route position to the point nearest `p` (a car placed by someone else). */
    locate (p) { idx = nearest(p, 0, path.length); reset() },
    /** Where to re-seat the car to carry on: `m` metres ahead on the route, facing along it. Ends any detour.
     *  heading h has the nose at −(sin h, cos h), the convention of main.js teleportToGround. */
    resume (m = 25) {
      idx = path[idx + 1]?.jump ? idx + 1 : ahead(idx, m)
      while (path.length - idx < 300) route.extend()
      const a = path[idx], b = path[Math.min(idx + 3, path.length - 1)]
      detour = null; reset()
      return { x: a.x, z: a.z, heading: Math.atan2(-(b.x - a.x), -(b.z - a.z)) }
    },
    /** Leave the road for `to` (any {x, z}), then come back onto the route `rejoin` metres ahead of here. */
    detour (to, rejoin = 250) { detour = { to, back: ahead(idx, rejoin), leg: 0, t0: clock } },

    /** One control step. Returns { steer (rad, + left), throttle, brake, steerLimit (rad), trouble (null | string) }. */
    step (vs, dt) {
      clock += dt
      const p = vs.position, q = vs.quaternion, v = Math.hypot(vs.velocity.x, vs.velocity.z)
      dist += v * dt
      while (idx < path.length - 2 && !path[idx + 1].jump && hyp(path[idx + 1].x, path[idx + 1].z, p.x, p.z) <= hyp(path[idx].x, path[idx].z, p.x, p.z)) idx++
      while (path.length - idx < 300) route.extend()
      const out = { steer: 0, throttle: 0, brake: 0, steerLimit: car.maxSteerAngle / (1 + v / car.speedSteerRef), trouble: null }
      if (path[idx + 1]?.jump && hyp(path[idx].x, path[idx].z, p.x, p.z) < 6) { out.trouble = 'route jump'; return out }

      let target, vT
      if (detour) {
        target = detour.leg === 0 ? detour.to : path[detour.back]; vT = 9
        if (hyp(target.x, target.z, p.x, p.z) < 12) { if (detour.leg === 0) detour.leg = 1; else { idx = detour.back; detour = null } }
        else if (clock - detour.t0 > 90) { out.trouble = 'detour timed out'; return out }
      }
      if (!detour) {
        const bore = inBore(p.x, p.z)
        target = path[ahead(idx, bore ? Math.max(4, 0.6 * v) : Math.max(6, 0.9 * v))]
        // Speed plan: points ≥ 8 m apart over the next 90 m; at each, the corner speed √(aLat·R) plus what braking at
        // aBrake over the distance to it buys back.
        const pts = []
        for (let a = idx, arc = 0, lst = path[idx]; a < path.length - 1 && arc < 90; a++) {
          const n = path[a + 1]; if (n.jump) break
          const ds = hyp(lst.x, lst.z, n.x, n.z)
          if (ds >= 8 || !pts.length) { arc += ds; pts.push({ x: n.x, z: n.z, s: arc }); lst = n }
        }
        let vPlan = vMax
        for (let a = 0; a + 2 < pts.length; a++) {
          const A = pts[a], B = pts[a + 1], C = pts[a + 2]
          const cross = Math.abs((B.x - A.x) * (C.z - A.z) - (B.z - A.z) * (C.x - A.x))   // 2 × the triangle's area
          if (cross > 1e-6) vPlan = Math.min(vPlan, Math.sqrt(aLat * hyp(A.x, A.z, B.x, B.z) * hyp(B.x, B.z, C.x, C.z) * hyp(C.x, C.z, A.x, A.z) / (2 * cross) + 2 * aBrake * B.s))
        }
        vT = Math.min(bore ? 10 : vMax, vPlan)
      }

      // Pure pursuit: the arc through the target, from the body's heading. Forward is −Z rotated by q.
      const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y))
      const alpha = wrap(Math.atan2(target.x - p.x, target.z - p.z) - Math.atan2(fx, fz))
      const Ld = Math.min(15, Math.max(4, hyp(target.x, target.z, p.x, p.z)))   // a far target would be a circle of radius Ld/2
      const desired = Math.atan2(2 * car.wheelbase * Math.sin(alpha), Ld)
      if (Math.abs(desired) > 0.95 * out.steerLimit) vT = Math.min(vT, Math.max(4, 0.7 * v))   // ease off at full lock, never to a stall
      const e = vT - v
      out.steer = Math.max(-out.steerLimit, Math.min(out.steerLimit, desired))
      out.throttle = e > 0 ? Math.min(1, 0.25 + 0.35 * e) : 0
      out.brake = e < -1.5 ? Math.min(1, -0.15 * e) : 0
      ap.dbg = { alpha: +alpha.toFixed(2), vT: +vT.toFixed(1), vF: +(vs.velocity.x * fx + vs.velocity.z * fz).toFixed(1), detour: !!detour }

      // Trouble. Stuck: under 1 m/s for 4 s with throttle asked. Flipped: up-axis below 0.3 for 2 s. Off the route: over
      // 15 m from it for 3 s (not on a detour).
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z)
      stuckT = v < 1 && lastThr > 0 ? stuckT + dt : 0
      flipT = upY < 0.3 ? flipT + dt : 0
      const n = path[nearest(p, Math.max(0, idx - 5), Math.min(path.length, idx + 5))], lat = hyp(n.x, n.z, p.x, p.z)
      lostT = !detour && lat > 15 ? lostT + dt : 0
      lastThr = out.throttle
      out.trouble = stuckT > 4 ? 'stuck' : flipT > 2 ? 'flipped' : lostT > 3 ? 'off the route' : null
      return out
    },
  }
  return ap
}
