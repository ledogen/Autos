// src/autopilot.js — the driving AI (FEAT-293, DEC-428; grown from PERF-40's bench autopilot, DEC-084). One instance per
// car: vehicle state and a road view in, driver controls out.
//
// PURE: no DOM, no window, no Three.js, no engine types. It reads a plain vehicle state (position / velocity / quaternion
// with x/y/z/w fields; ignition, drivetrain and fuel when present) and returns what a driver's hands and feet would do:
// steer as a road-wheel angle in radians (+ = LEFT, the vehicleState.steerAngle convention), throttle and brake in [0, 1],
// the handbrake, the ignition key, a gear request (manual box). It never writes a force. The consumer maps the controls
// onto the player's own control path (src/auto-drive.js → src/vehicle.js), or onto a virtual pad (test/playtest-bench.mjs),
// or straight onto vehicleState (test/drive-ai-soak.mjs). Deterministic: the only randomness is the rng it is handed.
//
// The classical stack, each layer replaceable on its own:
//   makeRoute(edges, rng, from)  WHERE — the road network as it streams in; a random exit at every junction (never the road
//                                it came on, never a > 150° switchback), so it drives for ever. A dead end (or the edge of
//                                the fence) ends the route: the driver stops there, three-point-turns and the route comes
//                                back down the same road. The bench may ask for the old teleport instead (deadEnd 'jump').
//   speed plan                   HOW FAST — stations 8 m apart over the stopping distance (90–260 m): each bend's speed
//                                √(aLat·R), aLat a share of the tire's own μ (worn tires lower it), then a backward pass
//                                v_i = min(v_bend, √(v_{i+1}² + 2·a_dec·Δs)) with a_dec the braking budget less the grade's
//                                g·sinθ (a descent brakes worse, a climb better), a stop at the route's end, and a
//                                sight-distance cap (stop inside 90 m) that is what slows it on steep descents.
//   path tracking                WHERE TO POINT — pure pursuit on its own lane (keeps right on the two-lane deck, a quarter
//                                deck right of the centreline, tapered to the centre in tight bends), the look-ahead 0.8 s of
//                                travel, cut to 0.8·R in a tight bend so it does not chord a hairpin.
//   actuation                    a PI speed loop with grade feed-forward onto throttle / brake (never the brake at a
//                                standstill: on the automatic that IS reverse), the handbrake to hold. On a manual the
//                                driver's own clutch foot and gear hand (footwork, below; BUG-240): it works with the
//                                player's clutch assistant on or off.
//   recovery                     stalled → crank; stuck → reverse out and try again (3 times); off the deck → drive back
//                                onto it; dead end → three-point turn. What a driver cannot fix — on its side or roof, a
//                                flat, an empty tank, a dead engine, three failed tries — stops it with `trouble` set,
//                                handbrake on. The consumer decides what then (hand back, a tow, a re-seat).
// Not here yet (an AI car needs them, the player's truck does not): other cars, right of way at junctions, obstacles.

import { makeClutchAssist, stepClutchAssist } from './clutch-assist.js'

const hyp = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az)
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a))
const clamp = (x, a, b) => x < a ? a : x > b ? b : x
const G = 9.81, DEG = Math.PI / 180
const JOIN_M = 6           // m — edge ends this close are one junction (road.js's node weld is tighter)
const MAX_TURN = 150 * DEG // a junction exit turning more than this is a switchback back the way it came: not taken

/** The route: a random walk over road edges ({ points: [{x, y, z}…] }), joined into one polyline that grows on demand.
 *  `edges` is the LIVE network — a function returning an iterable of edges (or an array), read again at every junction, so
 *  roads that streamed in since are seen and roads not built yet are never planned through. Junctions are edge ENDS within
 *  JOIN_M of each other. `keep(x, z)` fences it: an edge with a point outside is not taken (a story region's wall).
 *  deadEnd 'stop': at a dead end extend() returns false (the driver stops and turns round, then turnAround()).
 *  deadEnd 'jump' (the bench): it jumps to a random edge elsewhere, the point carrying `jump: true`. */
export function makeRoute (edges, rng, from, { keep = () => true, deadEnd = 'stop' } = {}) {
  const list = typeof edges === 'function' ? edges : () => edges
  const ok = e => e.points?.length >= 2 && e.points.every(q => keep(q.x, q.z))
  const path = []
  let cur = null   // { e, end }: the edge being driven, entered at `end`
  const heading = (a, b) => Math.atan2(b.z - a.z, b.x - a.x)
  const push = (e, end, mark = null) => {
    const pts = e.points, n = pts.length
    for (let i = 0; i < n; i++) {
      const q = pts[end === 0 ? i : n - 1 - i], last = path[path.length - 1]
      const d = last ? hyp(last.x, last.z, q.x, q.z) : 0
      if (last && d < 0.5) continue   // where two edges join the junction point is held twice
      const p = { x: q.x, y: q.y ?? 0, z: q.z, s: last ? last.s + d : 0 }
      if (mark) { Object.assign(p, mark); mark = null }
      path.push(p)
    }
    cur = { e, end }
  }
  // Start on the edge nearest `from`, heading whichever way is nearer the edge's far end from there (a random pick when
  // the caller has no heading; `from.dir` {x, z} picks the way the car faces).
  let bd = Infinity, be = null, bi = 0
  for (const e of list()) if (ok(e)) e.points.forEach((q, i) => { const d = hyp(q.x, q.z, from.x, from.z); if (d < bd) { bd = d; be = e; bi = i } })
  if (!be) return { path, extend: () => false, turnAround: () => false, edges: 0 }
  let end = rng() < 0.5 ? 0 : 1
  if (from.dir) { const p = be.points, a = p[Math.max(0, bi - 1)], b = p[Math.min(p.length - 1, bi + 1)]; end = (b.x - a.x) * from.dir.x + (b.z - a.z) * from.dir.z >= 0 ? 0 : 1 }
  push(be, end)

  const route = {
    path, junctions: 0,
    /** Append the next edge. Returns true if it grew, false at a dead end (deadEnd 'stop'). */
    extend () {
      const E = path[path.length - 1], P = path[Math.max(0, path.length - 2)], A = path[Math.max(0, path.length - 4)]
      const arrive = heading(A, E)
      const cands = []
      for (const e of list()) {
        const pts = e.points
        if (!pts || pts.length < 2) continue
        for (let end = 0; end < 2; end++) {
          const q = end ? pts[pts.length - 1] : pts[0]
          if (hyp(q.x, q.z, E.x, E.z) > JOIN_M) continue
          const q2 = end ? pts[pts.length - 2] : pts[1]
          if (hyp(q2.x, q2.z, P.x, P.z) < 1.5) continue                       // the road it arrived on
          const k = Math.min(3, pts.length - 1), qk = end ? pts[pts.length - 1 - k] : pts[k]
          const turn = wrap(heading(q, qk) - arrive)
          if (Math.abs(turn) > MAX_TURN || !ok(e)) continue
          cands.push({ e, end, turn })
        }
      }
      if (cands.length) {
        const c = cands[Math.floor(rng() * cands.length)]
        route.junctions++
        // turn: + = LEFT, degrees (the atan2(z, x) frame turns the other way: a left is negative there)
        push(c.e, c.end, { turn: Math.round(-c.turn / DEG), exits: cands.length })
        return true
      }
      if (deadEnd !== 'jump') return false
      const all = [...list()].filter(ok)
      if (!all.length) return false
      const e = all[Math.floor(rng() * all.length)], end0 = rng() < 0.5 ? 0 : 1
      const n0 = path.length
      push(e, end0)
      if (path[n0]) path[n0].jump = true
      return true
    },
    /** The U-turn: the edge just driven, back the other way (after the driver has turned the car round). */
    turnAround () {
      if (!cur) return false
      const n0 = path.length
      push(cur.e, 1 - cur.end, { turn: 180, exits: 0 })
      if (path[n0]) path[n0].uturn = true
      return true
    },
    get edges () { let n = 0; for (const e of list()) if (ok(e)) n++; return n },
  }
  return route
}

/**
 * @param o.car      the vehicle's params (RANGER_PARAMS shape): wheelbase, maxSteerAngle, speedSteerRef (the game's
 *                   speed-scaled steer envelope, vehicle.js M1-08), frictionCoeff · pacejkaD · _tireMuScale (the tire's μ),
 *                   transmissionType / gearRatios / finalDrive / wheelRadius / engineRedlineRPM (a manual box), roadHalfWidth.
 * @param o.route    makeRoute(...)
 * @param o.inBore   optional (x, z) => bool — inside a tunnel: shorter look-ahead, 10 m/s cap
 * @param o.flat     optional () => bool — a flat tire (src/damage.js flat[]); the driver stops for it
 * @param o.keepRight  drive its own lane on the two-lane deck (default true); false keeps the centreline (the bench)
 * @param o.recover  true (default): fix what a driver can (above); false (the bench): report every trouble at once
 * @param o.vMax, o.kLat, o.kBrake   cruise (m/s); the cornering and braking budgets as shares of μ·g
 */
export function createAutopilot ({ car, route, inBore = () => false, flat = () => false, vMax = 24, kLat = 0.42, kBrake = 0.38,
  keepRight = true, recover = true } = {}) {
  const { path } = route
  const halfW = car.roadHalfWidth ?? 5
  const NS = 40, sx = new Float64Array(NS), sz = new Float64Array(NS), sy = new Float64Array(NS), ss = new Float64Array(NS), sv = new Float64Array(NS)
  let idx = 0, dist = 0, clock = 0, ended = false, retryT = 0, detour = null
  let state = 'drive', stateT = 0, trouble = null, leg = 0, legs = 0, tries = [], integ = 0, shiftCool = 0, gearWant = null, grNow = 0
  let offNow = 0, bore = false, boreT = 0, thrLast = 0, stuckT = 0, flipT = 0, offT = 0, crankT = 0, revFrom = null, lat = 0, latC = 0, vTlast = 0
  const out = { steer: 0, throttle: 0, brake: 0, hand: false, key: false, shift: 0, clutch: 0, steerLimit: 0, trouble: null, state: 'drive' }

  const ahead = (i, m) => {   // the index `m` metres of route ahead of i, stopping short of a jump
    const s0 = path[i].s
    while (i < path.length - 2 && path[i + 1].s - s0 < m && !path[i + 1].jump) i++
    return i
  }
  const nearest = (p, lo, hi) => { let bi = lo, b = Infinity; for (let j = lo; j < hi; j++) { const d = hyp(path[j].x, path[j].z, p.x, p.z); if (d < b) { b = d; bi = j } } return bi }
  // Signed distance from the centreline at segment idx→idx+1, + = right of travel; and the arc position along it.
  let projS = 0
  const lateral = (p) => {
    const a = path[idx], b = path[Math.min(idx + 1, path.length - 1)]
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1
    const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / l
    projS = a.s + clamp(t, -2, l + 2)
    return ((p.x - a.x) * -dz + (p.z - a.z) * dx) / l   // (−dz, dx) is right of travel
  }
  const go = (s) => { if (state !== s) { state = s; stateT = 0; leg = 0; legs = 0; integ = 0 } }
  const giveUp = (why) => { trouble = why; go('stopped') }
  const muNow = () => {
    const m = car._tireMuScale
    return (car.frictionCoeff ?? 0.8) * (car.pacejkaD ?? 1) * (m ? Math.min(m[0], m[1], m[2], m[3]) : 1)
  }
  const manual = () => car.transmissionType === 'manual'
  const reset = () => { stuckT = flipT = offT = crankT = 0; integ = 0; trouble = null; tries = []; go('drive') }

  // The gear a manual box should be in at forward speed v (m/s), by engine speed and load: up once the revs pass a point
  // that rises with the throttle (2500 rpm at a light foot, ~78 % of the redline floored) AND the next gear lands at 2000
  // or more (300 over the lugging line below, so it never drops straight back); down when the revs fall under ~1700 (no
  // bogging), or one below when the climb has the throttle pinned under 2200 rpm.
  const rpmIn = (g, v) => Math.abs(v) / (car.wheelRadius ?? 0.368) * car.gearRatios[g - 1] * (car.finalDrive ?? 3.73) * 60 / (2 * Math.PI)
  const wantGear = (v, cur, thr) => {
    const n = car.gearRatios.length, red = car.engineRedlineRPM ?? 5500
    if (cur < 1) return 1
    let g = cur
    if (g < n && rpmIn(g, v) > 2500 + thr * (0.78 * red - 2500) && rpmIn(g + 1, v) > 2000) g++
    else if (g > 1 && (rpmIn(g, v) < 1700 || (thr > 0.95 && rpmIn(g, v) < 2200 && rpmIn(g - 1, v) < 0.7 * red))) g--
    return g
  }

  // Throttle / brake for a forward target speed vT at forward speed vF on grade gr (rise / run, + uphill).
  const pedals = (vT, vF, gr, dt) => {
    const e = vT - vF
    if (Math.abs(e) < 2) integ = clamp(integ + 0.15 * e * dt, -0.2, 0.4)   // conditional integration: no wind-up while it accelerates
    const u = 0.3 * e + integ + clamp(0.12 + 3 * gr, -0.6, 0.8)
    // A careful foot on a rear-drive truck: the throttle rises at most 1.5 /s, is held back as the corner uses up the
    // lateral budget (the friction circle), and lifts when the truck yaws faster than its steering asks — oversteer
    // (the same test as traction.js's, done by the driver, so the assists' own setting is left as the player set it).
    const vs = ap._vs, r = vs.angularVelocity?.y ?? 0, rKin = vF * Math.tan(vs.steerAngle ?? 0) / car.wheelbase
    const aLatNow = Math.abs(r * vF), circle = clamp(1.3 - aLatNow / (kLat * muNow() * G), 0.2, 1)
    const over = Math.abs(r) > Math.abs(rKin) + 0.1 || (Math.abs(r) > 0.1 && Math.sign(r) !== Math.sign(rKin))
    const cap = over && vF > 3 ? 0.15 : circle
    out.throttle = vT < 0.3 ? 0 : Math.min(clamp(u, 0, 1), cap, thrLast + 1.5 * dt)
    thrLast = out.throttle
    // Below 1 m/s the brake pedal is not used: on the automatic it is the reverse pedal there. The handbrake holds instead.
    if (vF < 1 && vT < 0.3) { out.brake = 0; out.throttle = 0; out.hand = true; integ = 0 }
    else out.brake = u < -0.08 ? clamp(-0.6 * u, 0, 1) : 0
    if (out.brake > 0) out.throttle = 0
  }
  // Creep at signed speed vT (− = backwards) with the steer given, for the manoeuvres. On the automatic backwards is the
  // brake pedal at rest (drivetrain.js autoReverse); on the manual it is R and the throttle.
  const creep = (vT, vF, steer, dt) => {
    out.steer = steer
    const back = vT < 0
    if (manual()) gearTo(back ? -1 : 1)
    if (back) {
      if (vF > 0.5) { out.brake = 0.5; return }            // still rolling forwards: stop first
      const u = clamp(0.25 + 0.25 * (vF - vT), 0, 0.7)     // vF − vT > 0 means slower backwards than asked
      if (manual()) out.throttle = u; else out.brake = u
    } else {
      if (vF < -0.5) { out.throttle = manual() ? 0 : 0.5; out.hand = manual(); return }
      out.throttle = clamp(0.25 + 0.25 * (vT - vF), 0, 0.7)
    }
  }
  const gearTo = (g) => { gearWant = g }
  // BUG-240: the manual's footwork, after the speed loop has set the throttle. The clutch foot is the clutch assistant's own
  // law (src/clutch-assist.js) on a private instance, so it is a driver's foot whatever the player's setting: it bites as
  // the revs rise and slips into a launch, dips before the engine can be dragged to a stall, opens for a shift and comes
  // back as the revs match. The pedal it ends on goes out as out.clutch (1 = down); with the player's assistant on as
  // well, the sim takes the less engaged of the two. The gear hand: one press at a time towards gearWant, 0.35 s apart
  // (FEAT-185 lets a press move a shift in flight), never R rolling forwards. The right foot during a shift matches the
  // revs to the gear coming in: off for an upshift, a blip for a downshift. Hill start: the handbrake stays on until the
  // clutch carries the grade's holding torque at the disc, m·g·sinθ·r / (gear · final drive).
  const foot = makeClutchAssist(), footCar = Object.create(car, { clutchAssist: { value: true } })
  const footwork = (vs, vF, dt) => {
    const d = vs.drivetrain ?? {}, rpm = d.engineRPM ?? 0, cur = d.shifting ? d.shiftTo ?? 0 : d.mGear ?? 0
    let edge = 0
    if (gearWant !== null && gearWant !== cur && shiftCool <= 0 && !(gearWant < 0 && vF > 0.5)) { edge = Math.sign(gearWant - cur); shiftCool = 0.35 }
    const f = stepClutchAssist(foot, { pedal: 0, shift: edge, throttle: out.throttle }, { rpm, shifting: !!d.shifting }, footCar, dt)
    out.clutch = 1 - f.clutch; out.shift = f.shiftRequest
    if (foot.pending || d.shifting) {
      const g = d.shifting ? d.shiftTo : gearWant, idle = car.engineIdleRPM ?? 750
      out.throttle = g > 0 ? clamp((Math.max(idle, rpmIn(g, vF)) - rpm) / 1500, 0, 0.5) : 0
    }
    const g = d.mGear ?? 0
    if (g > 0 && out.throttle > 0 && vF < 0.3 && grNow > 0.02) {
      const hold = (car.mass + (car.stowedKg || 0)) * G * grNow / Math.sqrt(1 + grNow * grNow) * (car.wheelRadius ?? 0.368) / (car.gearRatios[g - 1] * (car.finalDrive ?? 3.73))
      if (f.clutch * (car.clutchMaxTorque ?? 450) < hold) out.hand = true
    }
  }

  const ap = {
    get idx () { return idx }, get dist () { return dist }, get detouring () { return !!detour },
    get state () { return state }, get trouble () { return trouble }, get lat () { return lat }, get offset () { return offNow }, get vT () { return vTlast },
    dbg: null, _vs: null,
    /** Metres off the route's line to drive, + = right of travel. With keepRight it is a quarter of the deck; the bench
     *  sets it (PERF-42 rides the road edge with it). */
    lane: keepRight && halfW >= 4 ? halfW / 2 : 0,
    /** Snap the route position to the point nearest `p` (a car placed by someone else) and start afresh. */
    locate (p) { idx = nearest(p, 0, path.length); reset() },
    /** Where to re-seat the car to carry on: `m` metres ahead on the route, facing along it (the bench's teleport). */
    resume (m = 25) {
      idx = path[idx + 1]?.jump ? idx + 1 : ahead(idx, m)
      while (path.length - idx < 300 && route.extend()) { /* grow */ }
      const a = path[idx], b = path[Math.min(idx + 3, path.length - 1)]
      detour = null; reset()
      return { x: a.x, z: a.z, heading: Math.atan2(-(b.x - a.x), -(b.z - a.z)) }
    },
    /** Leave the road for `to` (any {x, z}), then come back onto the route `rejoin` metres ahead of here (the bench). */
    detour (to, rejoin = 250) { detour = { to, back: ahead(idx, rejoin), leg: 0, t0: clock } },
    /** The next junction ahead: { turn (deg, + left), exits, m } or null. For a status line; not for the step. */
    nextTurn () {
      for (let j = idx + 1; j < path.length && j < idx + 400; j++) if (path[j].turn !== undefined) return { turn: path[j].turn, exits: path[j].exits, m: Math.round(path[j].s - path[idx].s) }
      return ended ? { turn: null, exits: 0, m: Math.round(path[path.length - 1].s - path[idx].s) } : null
    },

    /** One control step. Returns the reused controls object (copy what you keep). */
    step (vs, dt) {
      ap._vs = vs
      clock += dt; stateT += dt; shiftCool -= dt; gearWant = null; grNow = 0
      const p = vs.position, q = vs.quaternion
      const v = Math.hypot(vs.velocity.x, vs.velocity.z)
      const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y))   // forward is −Z rotated by q
      const fl = Math.hypot(fx, fz) || 1, vF = (vs.velocity.x * fx + vs.velocity.z * fz) / fl
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z)
      dist += v * dt
      out.steer = out.throttle = out.brake = out.shift = out.clutch = 0; out.hand = out.key = false; out.trouble = null
      out.steerLimit = car.maxSteerAngle / (1 + v / car.speedSteerRef)

      // ── where on the route ──
      while (idx < path.length - 2 && !path[idx + 1].jump && !path[idx + 1].uturn &&
        hyp(path[idx + 1].x, path[idx + 1].z, p.x, p.z) <= hyp(path[idx].x, path[idx].z, p.x, p.z)) idx++
      if (idx > 1500) { path.splice(0, 1000); idx -= 1000; if (detour) detour.back = Math.max(0, detour.back - 1000) }
      retryT -= dt
      if (!ended || retryT <= 0) {
        ended = false
        while (path.length - idx < 150) if (!route.extend()) { ended = true; retryT = 2; break }
      }
      latC = lateral(p); lat = latC - offNow
      if (path[idx + 1]?.jump && hyp(path[idx].x, path[idx].z, p.x, p.z) < 6) return report('route jump')

      // ── what a driver cannot drive through ──
      flipT = upY < 0.35 ? flipT + dt : 0
      if (flipT > 2) return report(upY < -0.3 ? 'on its roof' : 'on its side')
      const ign = vs.ignition?.state
      if (vs.fuel && vs.fuel.gal <= 0) return report('out of fuel')
      if ((vs.engineHealth ?? 1) <= 0) return report('engine seized')
      if (flat()) return report('flat tire')
      if (state === 'stopped') { out.hand = true; out.clutch = manual() ? 1 : 0; out.trouble = trouble; out.state = state; return out }
      if (ign && ign !== 'running') {
        if (!recover) return report('engine off')
        crankT += dt; out.key = true; out.hand = true; out.clutch = manual() ? 1 : 0; out.state = 'crank'
        if (crankT > 8) return report('engine will not start')
        return out
      }
      crankT = 0

      if ((boreT -= dt) <= 0) { boreT = 0.25; bore = inBore(p.x, p.z) }   // a road query: 4 Hz is plenty
      if (state === 'drive' && !detour) driveStep(p, fx / fl, fz / fl, v, vF, bore, dt)
      else if (detour) detourStep(p, fx / fl, fz / fl, v, vF, dt)
      else if (state === 'turn') turnStep(p, fx / fl, fz / fl, vF, dt)
      else if (state === 'reverse') reverseStep(p, vF, dt)
      else if (state === 'rejoin') rejoinStep(p, fx / fl, fz / fl, v, vF, dt)
      if (out.trouble) return out
      if (manual()) footwork(vs, vF, dt)

      // ── trouble a driver can do something about ──
      const pushing = out.throttle > 0.45 || (!manual() && out.brake > 0.3 && vF < 0.6)
      stuckT = pushing && Math.abs(vF) < 0.4 && state !== 'turn' ? stuckT + dt : 0
      if (stuckT > 3) {
        if (!recover) return report('stuck')
        stuckT = 0; tries = tries.filter(t => clock - t < 60); tries.push(clock)
        if (tries.length > 3) return report('stuck')
        revFrom = { x: p.x, z: p.z, steer: -0.5 * (vs.steerAngle ?? 0) }; go('reverse')
      }
      offT = Math.abs(latC) > halfW + 2.5 && state === 'drive' && !detour ? offT + dt : 0
      if (Math.abs(latC) > 40 && !detour && state !== 'reverse') return report('lost the road')
      if (offT > 1.5) { if (!recover) return report('off the route'); go('rejoin') }
      out.state = state
      return out
    },
  }

  function report (why) {
    if (recover) giveUp(why)
    out.steer = 0; out.throttle = 0; out.brake = 0; out.hand = true; out.clutch = manual() ? 1 : 0; out.trouble = why; out.state = recover ? 'stopped' : state
    return out
  }

  // Pure pursuit at the point `L` metres of arc ahead of the car's projection, shifted `off` m right of travel.
  function pursue (p, hx, hz, L, off) {
    const s1 = projS + L
    let j = idx
    while (j < path.length - 2 && path[j + 1].s < s1 && !path[j + 1].jump && !path[j + 1].uturn) j++
    const a = path[j], b = path[Math.min(j + 1, path.length - 1)]
    const sl = b.s - a.s, t = sl > 1e-6 ? clamp((s1 - a.s) / sl, 0, 1) : 0
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1
    const tx = a.x + dx * t - dz / l * off, tz = a.z + dz * t + dx / l * off
    const alpha = wrap(Math.atan2(tx - p.x, tz - p.z) - Math.atan2(hx, hz))
    const Ld = Math.max(3, hyp(tx, tz, p.x, p.z))
    return Math.atan2(2 * car.wheelbase * Math.sin(alpha), Ld)
  }

  function driveStep (p, hx, hz, v, vF, bore, dt) {
    // Stations every ≥ 8 m from the car out over the stopping distance.
    const mu = muNow(), aLat = kLat * mu * G, aBrk = kBrake * mu * G
    const H = clamp(v * v / (2 * Math.max(0.8, aBrk * 0.5)) + 40, 90, 260)
    let n = 0
    sx[0] = path[idx].x; sz[0] = path[idx].z; ss[0] = projS; sy[0] = path[idx].y; n = 1   // on the line: the car's own offset is no bend
    let terminal = false
    for (let j = idx + 1; j < path.length && n < NS; j++) {
      const c = path[j]
      if (c.jump || c.uturn) { terminal = true; break }
      if (c.s - ss[n - 1] < 8 && j < path.length - 1) continue
      sx[n] = c.x; sz[n] = c.z; sy[n] = c.y; ss[n] = c.s; n++
      if (c.s - projS > H) break
      if (j === path.length - 1) terminal = ended
    }
    // Bend speeds, then the backward pass with the grade in the braking budget.
    let rNear = Infinity
    for (let k = 0; k < n; k++) sv[k] = vMax
    for (let k = 1; k + 1 < n; k++) {
      const ab = hyp(sx[k - 1], sz[k - 1], sx[k], sz[k]), bc = hyp(sx[k], sz[k], sx[k + 1], sz[k + 1]), ca = hyp(sx[k + 1], sz[k + 1], sx[k - 1], sz[k - 1])
      const cross = Math.abs((sx[k] - sx[k - 1]) * (sz[k + 1] - sz[k - 1]) - (sz[k] - sz[k - 1]) * (sx[k + 1] - sx[k - 1]))
      const R = cross > 1e-6 ? ab * bc * ca / (2 * cross) : Infinity
      if (ss[k] - projS < 35) rNear = Math.min(rNear, R)
      sv[k] = Math.min(sv[k], Math.sqrt(aLat * R))
      if (k === 1) sv[0] = sv[1]   // the bend the car is in already
    }
    if (terminal) sv[n - 1] = 0
    for (let k = n - 2; k >= 0; k--) {
      const ds = Math.max(0.1, ss[k + 1] - ss[k])
      const gr = clamp((sy[k + 1] - sy[k]) / ds, -0.6, 0.6)
      if (k === 0) grNow = gr
      const sn = gr / Math.sqrt(1 + gr * gr), cs = 1 / Math.sqrt(1 + gr * gr)
      const aDec = Math.max(0.3, aBrk * cs + G * sn)
      // sight distance: whatever the plan says, stop inside 90 m on this slope
      sv[k] = Math.min(sv[k], Math.sqrt(sv[k + 1] * sv[k + 1] + 2 * aDec * ds), Math.sqrt(2 * aDec * 90))
    }
    let vT = Math.min(bore ? 10 : vMax, sv[0])
    if (terminal) vT = Math.min(vT, Math.sqrt(2 * 0.7 * aBrk * Math.max(0, ss[n - 1] - 8 - projS)))   // stop 8 m short of the end: room to turn round
    // Lane: a quarter deck right, tapered to the centre where the bend is tighter than 60 m (it would cut the inside).
    const off = bore ? 0 : ap.lane * clamp((rNear - 20) / 40, 0, 1)
    const L = clamp(0.8 * v + 3, 5, bore ? 10 : 22)
    offNow = ap.lane && !keepRight ? ap.lane : off
    const want = pursue(p, hx, hz, Math.min(L, Math.max(4, 0.8 * rNear)), offNow)
    if (Math.abs(want) > 0.95 * out.steerLimit) vT = Math.min(vT, Math.max(3, 0.7 * v))   // at full lock: ease off, never to a stall
    out.steer = clamp(want, -out.steerLimit, out.steerLimit)
    vTlast = vT
    pedals(vT, vF, grNow, dt)
    if (manual()) gearTo(vT < 0.3 && vF < 0.5 ? 1 : wantGear(vF, ap._vs?.drivetrain?.mGear ?? 0, out.throttle))
    ap.dbg = { vT, rNear, grade: grNow }
    // Stopped at the end of the road: turn round.
    if (terminal && vF < 0.6 && path[path.length - 1].s - projS < 25 && state === 'drive') {
      if (!recover) { report('dead end'); return }
      go('turn')
    }
  }

  // Three-point turn: forward on full left lock, backward on full right lock, until it faces back down the road. Each leg
  // ends where the bumper reaches the deck's edge (or the road's end), or after 8 s.
  function turnStep (p, hx, hz, vF, dt) {
    const E = path[path.length - 1], B = path[Math.max(0, path.length - 4)]
    const dx = E.x - B.x, dz = E.z - B.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l
    const err = Math.abs(wrap(Math.atan2(hx, hz) - Math.atan2(-ux, -uz)))
    const latOf = (x, z) => (x - E.x) * -uz + (z - E.z) * ux   // + right of travel (towards E)
    const along = (x, z) => (x - E.x) * ux + (z - E.z) * uz
    const lock = car.maxSteerAngle
    if (err < 30 * DEG && leg % 2 === 0 && vF > -0.3) {
      route.turnAround()
      for (let j = path.length - 1; j > 0; j--) if (path[j].uturn) { idx = j; break }
      ended = false; go('drive'); return
    }
    const fwd = leg % 2 === 0, sgn = fwd ? 1 : -1, bx = p.x + sgn * hx * 2.6, bz = p.z + sgn * hz * 2.6
    const edge = Math.abs(latOf(bx, bz)) > halfW - 0.4 || along(bx, bz) > 2
    if ((edge && stateT > 0.8) || stateT > 8) { leg++; stateT = 0; if (++legs > 9) { giveUp('could not turn round'); report(trouble) } return }
    // Settle at the turn of each leg before the pedal changes direction
    if (stateT < 0.5 && Math.abs(vF) > 0.3) { out.steer = fwd ? lock : -lock; out.hand = true; return }
    creep(fwd ? 1.8 : -1.5, vF, fwd ? lock : -lock, dt)
  }

  // Stuck: back up ~6 m (4 s at most) on half the opposite lock, then drive on.
  function reverseStep (p, vF, dt) {
    if (hyp(p.x, p.z, revFrom.x, revFrom.z) > 6 || stateT > 4) { out.hand = true; if (stateT > 4.6 || Math.abs(vF) < 0.2) go('drive'); return }
    creep(-1.5, vF, revFrom.steer, dt)
  }

  // Off the deck: drive back to the route 12 m ahead of the nearest point, at walking pace.
  function rejoinStep (p, hx, hz, v, vF, dt) {
    if (Math.abs(latC) < halfW - 1) { go('drive'); return }
    if (stateT > 25) { giveUp('off the road'); report(trouble); return }
    out.steer = clamp(pursue(p, hx, hz, 12, 0), -out.steerLimit, out.steerLimit)
    pedals(4, vF, 0, dt)
    if (manual()) gearTo(wantGear(vF, ap._vs?.drivetrain?.mGear ?? 0, out.throttle))
  }

  // The bench's off-road leg: out to `to`, back onto the route at `back`.
  function detourStep (p, hx, hz, v, vF, dt) {
    const tg = detour.leg === 0 ? detour.to : path[detour.back]
    if (hyp(tg.x, tg.z, p.x, p.z) < 12) { if (detour.leg === 0) detour.leg = 1; else { idx = detour.back; detour = null } }
    else if (clock - detour.t0 > 90) { report('detour timed out'); return }
    const alpha = wrap(Math.atan2(tg.x - p.x, tg.z - p.z) - Math.atan2(hx, hz))
    out.steer = clamp(Math.atan2(2 * car.wheelbase * Math.sin(alpha), clamp(hyp(tg.x, tg.z, p.x, p.z), 4, 15)), -out.steerLimit, out.steerLimit)
    pedals(9, vF, 0, dt)
    if (manual()) gearTo(wantGear(vF, ap._vs?.drivetrain?.mGear ?? 0, out.throttle))
  }

  return ap
}

// Self-check: `node src/autopilot.js`. A kinematic bicycle (yaw rate = v·tan(steer)/wheelbase; the brake at rest is reverse,
// as on the automatic) on (1) a 100 m ring road cut into four edges: it must hold its lane within 1.5 m, reach the ring's
// corner speed and report no trouble; (2) a 200 m dead-end street: it must stop at the end, turn round on the 10 m deck
// without leaving it, and drive back; (3) wheels that cannot turn: it must try reversing out, then report 'stuck'.
if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  let s = 1; const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const car = { wheelbase: 2.85, maxSteerAngle: 0.52, speedSteerRef: 15, frictionCoeff: 0.8, pacejkaD: 1, roadHalfWidth: 5 }
  const sim = (edges, from, h0, T, { stuck = false } = {}) => {
    const route = makeRoute(edges, rng, from), ap = createAutopilot({ car, route })
    ap.locate(from)
    let x = from.x, z = from.z, h = h0, v = 0, steer = 0, maxLat = 0, maxV = 0, trouble = null, states = new Set(), maxDeck = 0
    for (let t = 0; t < T && !trouble; t += 1 / 60) {
      const vs = { position: { x, y: 0, z }, velocity: { x: -Math.sin(h) * v, y: 0, z: -Math.cos(h) * v }, quaternion: { x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) } }
      const c = ap.step(vs, 1 / 60); trouble = c.trouble; states.add(c.state)
      steer += clamp(c.steer - steer, -4.8 / 60, 4.8 / 60)
      let a = 4 * c.throttle
      if (c.brake > 0) a = v > 0.556 ? -7 * c.brake : -2.5 * c.brake
      if (c.hand) a = -Math.sign(v) * Math.min(7, Math.abs(v) * 60)
      if (!stuck) v = clamp(v + a / 60, -3, 40)
      h += v * Math.tan(steer) / car.wheelbase / 60
      x -= Math.sin(h) * v / 60; z -= Math.cos(h) * v / 60
      if (t > 8 && c.state === 'drive') maxLat = Math.max(maxLat, Math.abs(ap.lat))
      maxDeck = Math.max(maxDeck, Math.abs(ap.lat + ap.offset))
      maxV = Math.max(maxV, v)
    }
    return { maxLat, maxV, trouble, states, km: ap.dist / 1000, maxDeck, x, z, ap }
  }
  const R = 100, arc = (a0) => ({ points: Array.from({ length: 53 }, (_, i) => { const a = a0 + i / 52 * Math.PI / 2; return { x: R * Math.cos(a), y: 0, z: R * Math.sin(a) } }) })
  const ring = [0, 1, 2, 3].map(k => arc(k * Math.PI / 2))
  const a = sim(ring, { x: R, z: 0, dir: { x: 0, z: 1 } }, Math.PI, 60)
  const street = [{ points: Array.from({ length: 51 }, (_, i) => ({ x: 0, y: 0, z: -4 * i })) }]
  const b = sim(street, { x: 2.5, z: -20, dir: { x: 0, z: -1 } }, 0, 120)
  const c = sim(ring, { x: R, z: 0, dir: { x: 0, z: 1 } }, Math.PI, 60, { stuck: true })
  console.log(`ring: max off its lane ${a.maxLat.toFixed(2)} m, top ${a.maxV.toFixed(1)} m/s (corner speed ${Math.sqrt(0.42 * 0.8 * G * R).toFixed(1)}), ${a.km.toFixed(2)} km, trouble ${a.trouble}`)
  console.log(`dead end: states ${[...b.states].join(' > ')}, worst off the centreline ${b.maxDeck.toFixed(2)} m, ${b.km.toFixed(2)} km, trouble ${b.trouble}`)
  console.log(`wheels locked: states ${[...c.states].join(' > ')}, trouble ${c.trouble}`)
  const ok = a.maxLat < 1.5 && a.maxV > 15 && a.maxV < 20 && !a.trouble &&
    b.states.has('turn') && b.maxDeck < 5.5 && b.km > 0.35 && !b.trouble &&
    c.states.has('reverse') && c.trouble === 'stuck'
  console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1)
}
