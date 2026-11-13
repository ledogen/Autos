// test/drive-soak.mjs — THE DRIVE SOAK (orchestrator, 2026-11-06): the physics counterpart of the run soak. NOT a gate —
// a long-running finder. A headless autopilot drives the real physics (stepPhysics, the damage model) over the real world
// (test/lib/world-rig.mjs: road, terrain with its carves, every collider the game mirrors, the game's contact query) on
// random seeds — trunks, side roads, junctions, tunnels, causeways, bridges — with legs off the road onto rough ground
// and slopes, and flags, with seed + position + a replayable capture:
//   nan        any non-finite in the truck's state
//   fall       the CG more than 3 m under the surface (through the world)
//   body       the CG within 0.15 m of the surface or under it (the body sunk into terrain / road)
//   wheel      a hub more than 0.08 m under the surface
//   strut      a tire's normal force over STRUT_N on the road (a BUG-81-type seam — the open road peaks ~10 kN)
//   collider   a hard chassis hit with no prop / POI / bore within reach of it (something solid that isn't drawn)
//   jolt       a body Δv over JOLT_DV in one step (gravity removed) while on the road
//   stuck      throttle on, on a drivable road, under 0.5 m/s for 5 s
//   cargo      (--cargo=<data/freight.js key>, BUG-161) the strapped load more than CARGO_MM off its bed seat — welded
//              at strapPose as main.js _loadFreight does (box hull, the cargo-in-bed bullet flag), re-strapped on a seat
//   cargotire  (--cargo) a wheel's debris query pushed on the strapped load (the tire taking the truck's own cargo for a rock)
// Each flag writes a capture (the state 10 s before + every input since); `--replay=file` rebuilds that seed's world,
// seats the truck there, replays the inputs and reports whether the flag comes back.
//
//   node test/drive-soak.mjs [--seeds=4 | --seed=1234] [--km=8] [--radius=1500] [--out=wip/drive-soak/run] [--replay=file]
//                            [--cargo=sculptureB]
//
// Pure node (no browser): the world rig builds the real modules; per seed 5–30 s to build, then ~0.3–0.6× realtime
// (4 km ≈ 7–20 min wall). Random seeds only for claims about the world (seed 6 is a test seed).
//
// READING A FLAG. Replay it with the trace: `SOAK_TRACE=n node test/drive-soak.mjs --replay=<capture>` prints the last n
// steps per corner (tire load kN, hub height over the ground, lateral from the nearest road, road top over the ground),
// and on the flag step the surface profile along and ACROSS the worst wheel's track (ground vs road top vs what the
// contact query returns), a body strike's point / face / normal with the engine's terrain round it, and a ray into the
// struck face per layer naming the body's owner (userData: road tile, terrain chunk, prop, POI). `SOAK_LOG=1` prints a
// progress line every 10 sim-s; `SOAK_LOG=2` the autopilot's state (path index, lateral error, target) every 1 s;
// `--dump-path=a-b` prints the route's points a..b (spacing, turn, jumps) and exits. `node test/soak-site.mjs <capture>`
// reads the site (the road, a bore, raw/carved/road-top heights, steps in the carved ground). A capture recorded before
// a carve change may not replay (the world moved under it: BUG-129's fix buried run4's) — re-record it.
//
// WHAT IT HAS CAUGHT (2026-11-07): BUG-122 (a junction's road-edge lip doubled to 0.31 m: 75 kN in one step) and
// BUG-129 (an embankment fill that stops in a 1 m cliff ~19 m out). BUG-126 was the autopilot, not the world.
// FALSE-POSITIVE CLASSES — read these before routing a flag:
//   • the designed 0.15 m asphalt lip (≤ 0.19 m across its slope at 5.0–5.3 m): a strut / jolt where a wheel climbs back
//     from the shoulder at speed is a kerb strike, not a seam. The cross-section shows a single lip.
//   • the autopilot riding the shoulder or a ditch beside a junction, or off-road under an embankment at 15–20 m/s:
//     large loads (40–120 kN) on honest rough ground. site-steps finds no step over the lip there.
//   • a bore: the arch leans in, so a truck whose outer wheels pass ~7 m touches the lining (BUG-126's ruling). The
//     autopilot keeps out (no off-road leg, a shorter look-ahead and ≤ 10 m/s within a bore or 20 m of a portal); a
//     strike on a road tile's lining with the truck > 5.5 m off the centreline is still the autopilot.
//   • a hit that does not reproduce on replay: the capture starts 10 s before, from a snapshot, and a re-seat or a
//     streaming order can differ — treat it as noise unless it recurs.
//   • `stuck` right after a wall strike is the same event, not a second one.
//   • a truck already airborne or tumbling when its capture starts: the cause is before the window. Re-drive the seed
//     live with SOAK_LOG=2 to see it. So far always the autopilot — now handled: a re-seat's level drop by a fill edge
//     tipping it (no flags for SETTLE_S after a seat), or a corner tighter than its speed could steer, run wide off the
//     road at 14 m/s (it slows when the steering is pinned at its limit). Portal walls no longer read as "collider".
// A REAL finding reproduces on replay AND shows the world itself disagreeing: a step in the carved ground beyond the lip
// (soak-site.mjs), the physics surface differing from the drawn one, or a solid where nothing is drawn.
// STATE (2026-11-07): 26 random seeds, ~110 km; real findings BUG-122 and BUG-129; the last 8 seeds × 6 km found none.

import * as THREE from 'three'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { stepPhysics, readRimStrikes, classifyImpactRegion } from '../src/physics.js'
import { computeStaticEquilibrium, getWheelPosition } from '../src/suspension.js'
import { DamageModel } from '../src/damage.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { buildWorld } from './lib/world-rig.mjs'
import { ackermann } from './lib/physics-replay.mjs'
import { strapPose, inBedWell } from '../src/debris.js'
import { FREIGHT } from '../data/freight.js'
import { PROP_MODELS } from '../data/prop-models.js'
import { DEFAULT_VEHICLE_MODEL } from '../data/vehicle-models.js'
import { GROUP_DEBRIS } from '../src/physics-engine.js'

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d }
const DT = 1 / 60
const KM = +arg('km', 8), RADIUS = +arg('radius', 1500), OUT = arg('out', 'wip/drive-soak/run')
const STRUT_N = 40000          // N — [DEFAULT] a tire's normal force on the road past this is a seam, not a road
const JOLT_DV = 0.9            // m/s in one 1/60 s step (≈ 5.5 g) — [DEFAULT]
const HIT_IMPULSE = 1500       // N·s — a hard chassis hit (≈ 1.1 m/s of the truck) [DEFAULT]
const CAPTURE_S = 10
const SETTLE_S = 1.5           // s — no flags (bar nan / fall) after a re-seat: the harness's drop, not the world
const V_MAX = 24, A_LAT = 3.5, A_BRAKE = 3   // m/s, m/s² — the autopilot's cruise, its cornering and braking budgets
const OFFROAD_EVERY_KM = 2
const CARGO = arg('cargo', null), CARGO_MM = 10   // BUG-161: the strapped load, and how far off its seat is a finding [DEFAULT]

const seeds = arg('seed') ? [+arg('seed')] : Array.from({ length: +arg('seeds', 4) }, () => (Math.random() * 2 ** 31) >>> 0)

// ── The truck ─────────────────────────────────────────────────────────────────────────────────────────────────────
function freshParams () {
  const P = { ...RANGER_PARAMS }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  return P
}
function freshState (P, x, y, z, heading) {
  const eq = computeStaticEquilibrium(P)
  return {
    position: new THREE.Vector3(x, y, z), velocity: new THREE.Vector3(),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading), angularVelocity: new THREE.Vector3(),
    steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0, handbrake: false,
    wheelSteerAngles: [0, 0, 0, 0], wheelOmega: [0, 0, 0, 0], wheelPhase: [0, 0, 0, 0], slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0],
    drivetrain: { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },
    rimForce: [0, 0, 0, 0], rimHazard: [0, 0, 0, 0],
  }
}
const snapshot = (vs) => JSON.parse(JSON.stringify(vs))
function restore (vs, s) {
  for (const k of Object.keys(s)) {
    if (vs[k]?.isVector3 || vs[k]?.isQuaternion) Array.isArray(s[k]) ? vs[k].fromArray(s[k]) : vs[k].copy(s[k])   // a Quaternion's JSON is [x, y, z, w]
    else vs[k] = JSON.parse(JSON.stringify(s[k]))
  }
}
const finiteState = (vs) => [vs.position, vs.velocity, vs.angularVelocity].every(v => Number.isFinite(v.x + v.y + v.z))
  && Number.isFinite(vs.quaternion.x + vs.quaternion.y + vs.quaternion.z + vs.quaternion.w)
  && vs.strutComp.every(Number.isFinite) && vs.wheelOmega.every(Number.isFinite)

// ── The route: a random walk over the network's edges, joined into one polyline ─────────────────────────────────────
// Junctions are where edge ENDS meet (within 6 m), found geometrically — no assumption about which end is which cell.
function makeRouter (road, rng) {
  const edges = [...road._network.values()].filter(e => e.points?.length >= 2)
  const ends = []
  for (const e of edges) { ends.push({ e, end: 0, p: e.points[0] }, { e, end: 1, p: e.points.at(-1) }) }
  const node = new Map(), nodes = []
  for (const en of ends) {
    let n = nodes.find(m => Math.hypot(m.x - en.p.x, m.z - en.p.z) < 6)
    if (!n) { n = { x: en.p.x, z: en.p.z, ends: [] }; nodes.push(n) }
    n.ends.push(en); node.set(en, n)
  }
  const endOf = (e, end) => ends.find(x => x.e === e && x.end === end)
  let cur = endOf(edges[Math.floor(rng() * edges.length)], 0)   // travelling from this end
  const path = []
  const push = (en, jump = false) => {
    const pts = en.end === 0 ? en.e.points : [...en.e.points].reverse()
    pts.forEach((q, i) => path.push(i === 0 && jump ? { x: q.x, z: q.z, jump: true } : { x: q.x, z: q.z }))
  }
  push(cur)
  // At a junction, any other edge there; at a dead end (the region's rim, a stub) a U-turn is not drivable by pursuit,
  // so the route JUMPS to a random edge elsewhere and the truck is re-seated there when it gets to the end (a tow).
  // Only an edge leaving within 100° of the way the truck arrives: a hairpin turn at a junction is not drivable by
  // pursuit (it overshot one on seed 6 at (−298, −987) again and again) — none, and it is a tow too.
  const heading = (a, b) => Math.atan2(b.z - a.z, b.x - a.x)
  const leaving = (en) => { const pts = en.e.points, k = Math.min(3, pts.length - 1); return en.end === 0 ? heading(pts[0], pts[k]) : heading(pts.at(-1), pts.at(-1 - k)) }
  const extend = () => {
    const far = endOf(cur.e, 1 - cur.end), n = node.get(far)
    const arrive = heading(path.at(-Math.min(4, path.length)), path.at(-1))
    const next = n.ends.filter(x => x.e !== cur.e && Math.abs(Math.atan2(Math.sin(leaving(x) - arrive), Math.cos(leaving(x) - arrive))) < 100 * Math.PI / 180)
    if (next.length) { cur = next[Math.floor(rng() * next.length)]; push(cur) }
    else { cur = endOf(edges[Math.floor(rng() * edges.length)], rng() < 0.5 ? 0 : 1); push(cur, true) }
  }
  return { path, extend }
}

// ── The strapped load (--cargo): main.js _loadFreight + _bedPoint, on the load's measured collision box ───────────────
const BED = DEFAULT_VEHICLE_MODEL.bed
function makeStrap (w, vs) {
  const row = FREIGHT[CARGO], m = PROP_MODELS[row.model], [sx, sy, sz] = m.collision.size
  const half = { x: sx / 2, y: sy / 2, z: sz / 2 }, seat = strapPose(BED, half, m.floorSeated ? 0 : half.x)
  const pts = []; for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) pts.push(a * half.x, b * half.y, c * half.z)
  const st = { body: null, seat, off: 0, pushJ: 0 }
  // A wheel's debris query (physics.js Step 0.5) pushing on the load: the tire treating the truck's own cargo as a rock.
  const ai = w.engine.applyImpulse.bind(w.engine)
  w.engine.applyImpulse = (h, j, at) => { if (h === st.body) st.pushJ += Math.hypot(j.x, j.y, j.z); return ai(h, j, at) }
  const p = new THREE.Vector3(), v = new THREE.Vector3(), q = new THREE.Quaternion(), qi = new THREE.Quaternion()
  st.strap = () => {
    if (st.body) w.engine.destroyBody(st.body)   // the weld dies with its body
    w.engine.setTransform(w.chassis, vs.position, vs.quaternion)
    p.set(seat.x, seat.y, seat.z).applyQuaternion(vs.quaternion).add(vs.position)
    v.copy(p).sub(vs.position).cross(vs.angularVelocity).negate().add(vs.velocity)   // ω × r + v
    st.body = w.engine.createBody({ type: 'dynamic', position: p, quaternion: vs.quaternion, linearVelocity: v, angularVelocity: vs.angularVelocity })
    w.engine.addHull(st.body, new Float32Array(pts), { density: row.massKg / (sx * sy * sz), friction: 0.6, restitution: 0.1, group: GROUP_DEBRIS })
    w.engine.createWeldJoint(w.chassis, st.body, p)
  }
  const local = (out) => { w.engine.getTransform(st.body, p, q); return out.copy(p).sub(vs.position).applyQuaternion(qi.copy(vs.quaternion).invert()) }
  const r = new THREE.Vector3()
  st.beforeStep = () => w.engine.setBullet(st.body, inBedWell(local(r), BED, 0.1))   // DebrisSystem.beforeStep's cargo flag
  st.measure = () => (st.off = local(r).distanceTo(seat))
  // SOAK_TRACE on a replay: the load's offset from its seat (truck frame, mm) and what touched it this step (N·s).
  const J = { x: 0, y: 0, z: 0 }
  st.trace = () => {
    local(r); w.engine.contactImpulseOn(st.body, J)
    const vl = v.copy(vs.velocity).applyQuaternion(qi.copy(vs.quaternion).invert())
    return `v local (${vl.x.toFixed(2)}, ${vl.y.toFixed(2)}, ${vl.z.toFixed(2)}) at (${vs.position.x.toFixed(2)}, ${vs.position.y.toFixed(2)}, ${vs.position.z.toFixed(2)}) cargo off (${[r.x - seat.x, r.y - seat.y, r.z - seat.z].map(d => (d * 1000).toFixed(1)).join(', ')}) mm, contact J (${[J.x, J.y, J.z].map(d => d.toFixed(0)).join(', ')})`
  }
  return st
}

// ── One seed ────────────────────────────────────────────────────────────────────────────────────────────────────────
async function soakSeed (seed, replay = null) {
  const P = freshParams()
  const t0 = performance.now()
  let s = seed >>> 0
  const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const vs0 = freshState(P, 0, 0, 0, 0)
  const w = await buildWorld(seed, P, vs0, { radius: RADIUS })
  const ground = (x, z, y) => w.terr.analyticHeight(x, z, w.road.carveHint(x, z), y)
  const buildS = (performance.now() - t0) / 1000
  const vs = vs0
  const damage = new DamageModel({ params: P }); damage.setAll(1); damage.publish(P)
  const router = makeRouter(w.road, rng)
  // --dump-path=a-b: the route's points a..b (spacing, turn, jumps) and exit — why the autopilot left the route there.
  const dump = arg('dump-path', null)
  if (dump) {
    const [a, b] = dump.split('-').map(Number)
    while (router.path.length <= b + 2) router.extend()
    for (let i = a; i <= b; i++) {
      const p0 = router.path[i - 1], p1 = router.path[i], p2 = router.path[i + 1]
      const ds = Math.hypot(p1.x - p0.x, p1.z - p0.z), turn = Math.atan2(p2.z - p1.z, p2.x - p1.x) - Math.atan2(p1.z - p0.z, p1.x - p0.x)
      console.log(`  ${i} (${p1.x.toFixed(1)}, ${p1.z.toFixed(1)}) ds ${ds.toFixed(2)} turn ${(Math.atan2(Math.sin(turn), Math.cos(turn)) * 180 / Math.PI).toFixed(0)}°${p1.jump ? ' JUMP' : ''}`)
    }
    w.dispose(); return { seed, dumped: true }
  }
  const counts = { nan: 0, fall: 0, body: 0, wheel: 0, strut: 0, collider: 0, jolt: 0, stuck: 0, cargo: 0, cargotire: 0 }
  const worst = []
  const hist = []          // [{ s: snapshot every second }, inputs since]
  let inputs = [], snapT = 0, snap = null
  mkdirSync(OUT, { recursive: true })

  // Seats the truck on path point i AND moves the autopilot there: a re-seat that left idx behind had the pursuit
  // chase a point behind the truck, lose the route, and re-seat again every 4 s for ever (seed 6, (−298, −987)).
  const seatAt = (i) => {
    idx = i
    const a = router.path[i], b = router.path[Math.min(i + 3, router.path.length - 1)]
    const h = Math.atan2(-(b.x - a.x), -(b.z - a.z))
    // On the road's own top: a path point is on the ribbon, and in a bore the analytic ground "from above" is the hill
    // 50+ m over the tube — a re-seat there put the truck on the hilltop to follow the tunnel's line across raw slope
    // (seed 24316861: 235 kN, impulses of ~10⁶). sampleRoadTopY is the tunnel floor there and the asphalt everywhere else.
    const top = w.road.sampleRoadTopY(a.x, a.z)
    restore(vs, snapshot(freshState(P, a.x, (top ?? ground(a.x, a.z, 1e4)) + 1.0, a.z, h)))
    w.stream(a.x, a.z)
    inputs = []; snap = snapshot(vs); snapT = 0; snapAfterSeat = true
    // A re-seat drops the truck level, 1 m over the road top at a path point; by a fill's edge or in a junction its wheels
    // on one side hang over the slope and it can tip (seed 1615901410 rolled 0.5 s after one). The game never seats like
    // that (main.js fits the local plane, 0.5 m up), so the landing is the harness's: nothing but nan / fall is flagged.
    settleT = SETTLE_S
    strap?.strap()   // main.js _restrapFreight: a seat re-straps the load on the new pose
  }
  const strap = CARGO ? makeStrap(w, vs) : null
  let idx = 0
  let settleT = 0, snapAfterSeat = false
  if (replay) { w.stream(replay.start.position.x, replay.start.position.z); restore(vs, replay.start); settleT = replay.afterSeat ? SETTLE_S : 0; strap?.strap() } else seatAt(0)

  let dist = 0, offDist = 0, offroad = null, nextOff = OFFROAD_EVERY_KM * 1000, stuckT = 0, t = 0, steps = 0, lastStream = 0
  const flag = (kind, mag, extra = {}) => {
    if (settleT > 0 && kind !== 'nan' && kind !== 'fall') return null
    counts[kind]++
    const p = vs.position, rec = { seed, kind, mag: +mag.toFixed(3), t: +t.toFixed(2), at: { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) }, v: +vs.velocity.length().toFixed(2), offroad: !!offroad, ...extra }
    if (counts[kind] <= 3 && !replay) {
      const file = `${OUT}/${seed}-${kind}-${counts[kind]}.json`
      writeFileSync(file, JSON.stringify({ ...rec, radius: RADIUS, afterSeat: snapAfterSeat, start: snap, inputs }))
      rec.capture = file
    }
    worst.push(rec)
    return rec
  }
  const stepLimit = replay ? replay.inputs.length : Infinity
  const vPrev = new THREE.Vector3()
  const simCap = KM * 1000 / 4 + 120   // s — a seed that cannot average 4 m/s is reported, not waited on
  let lastLog = 0, stillT = 0, lostT = 0, resets = 0
  while (dist < KM * 1000 && steps < stepLimit && t < simCap) {
    // ── the autopilot (or the capture's inputs) ──
    let thr, brk, steer
    if (replay) ({ thr, brk, steer } = replay.inputs[steps])
    else {
      const p = vs.position, v = Math.hypot(vs.velocity.x, vs.velocity.z)
      // <=, not <: where two edges join the path holds the junction point TWICE, and a strict test never stepped off the
      // first copy — the index froze there, the pursuit target fell behind the truck and it turned back off the road
      // (seed 6, the 'junction stall' at (−298, −987) and point 139 before it).
      while (idx < router.path.length - 2 && !router.path[idx + 1].jump && Math.hypot(router.path[idx + 1].x - p.x, router.path[idx + 1].z - p.z) <= Math.hypot(router.path[idx].x - p.x, router.path[idx].z - p.z)) idx++
      while (router.path.length - idx < 80) router.extend()
      if (router.path[idx + 1]?.jump && Math.hypot(router.path[idx].x - p.x, router.path[idx].z - p.z) < 6) { seatAt(idx + 1); continue }
      let target, vT
      if (offroad) {
        target = offroad.to; vT = 9
        if (Math.hypot(target.x - p.x, target.z - p.z) < 8 || t - offroad.t0 > 40) {   // back to the route at its nearest point
          let bi = idx, bd = Infinity
          for (let j = Math.max(0, idx - 200); j < router.path.length; j++) { const d = Math.hypot(router.path[j].x - p.x, router.path[j].z - p.z); if (d < bd) { bd = d; bi = j } }
          idx = bi; offroad = null
        }
      }
      if (!offroad) {
        // In a bore (or within 20 m of a portal; a negative inset grows the span) the walls stand ~8 m off the centreline
        // and the arch leans in, so a truck whose outer wheels pass ~7 m touches it (BUG-126's ruling). The pursuit cuts
        // curves by about its look-ahead: there it looks nearer and drives no faster than 10 m/s.
        const nrB = w.road.queryNearest(p.x, p.z, 15), inBore = !!nrB && !!w.road.tunnelSpanAt(nrB.runKey ?? '', nrB.arcS ?? 0, -20)
        const L = inBore ? Math.max(4, 0.6 * v) : Math.max(6, 0.9 * v)
        let j = idx, acc = 0
        while (j < router.path.length - 1 && acc < L && !router.path[j + 1].jump) { acc += Math.hypot(router.path[j + 1].x - router.path[j].x, router.path[j + 1].z - router.path[j].z); j++ }
        target = router.path[j]
        // speed by the tightest turn in the next ~60 m: the circumradius of three points 8 m apart by ARC (index steps
        // met duplicate points where two edges join — zero-length chords with any heading — and read hairpins everywhere)
        // …and each corner's speed relaxed by the braking distance to it, so the truck arrives slow enough: v² = v_c² + 2·a·s
        const ahead = []
        for (let a = idx, arc = 0, last = router.path[idx]; a < router.path.length - 1 && arc < 90; a++) {
          const q = router.path[a + 1]
          if (q.jump) break
          const ds = Math.hypot(q.x - last.x, q.z - last.z)
          if (ds >= 8 || !ahead.length) { arc += ds; ahead.push({ ...q, s: arc }); last = q }
        }
        let vPlan = V_MAX
        for (let a = 0; a + 2 < ahead.length; a++) {
          const A = ahead[a], Bp = ahead[a + 1], C = ahead[a + 2]
          const ab = Math.hypot(Bp.x - A.x, Bp.z - A.z), bc = Math.hypot(C.x - Bp.x, C.z - Bp.z), ca = Math.hypot(A.x - C.x, A.z - C.z)
          const cross = Math.abs((Bp.x - A.x) * (C.z - A.z) - (Bp.z - A.z) * (C.x - A.x))
          if (cross > 1e-6) vPlan = Math.min(vPlan, Math.sqrt(A_LAT * ab * bc * ca / (2 * cross) + 2 * A_BRAKE * Bp.s))
        }
        const rMin = vPlan * vPlan / A_LAT
        vT = Math.min(inBore ? 10 : V_MAX, Math.sqrt(A_LAT * rMin))
        // BUG-126 (closed, not a game bug): inside a bore the leg's point 120–200 m to the side is behind the lining, so the
        // truck drove into the wall and sat pinned until the leg timed out. No leg in a bore or near a portal (inBore,
        // above): it waits, re-checked every step, until the truck is out.
        if (dist + offDist > nextOff && !inBore) {   // an off-road leg: 120–200 m out to one side, over whatever is there
          nextOff += OFFROAD_EVERY_KM * 1000
          const fx = -Math.sin(Math.atan2(-(target.x - p.x), -(target.z - p.z))), side = rng() < 0.5 ? -1 : 1, d = 120 + rng() * 80
          const hx = target.x - p.x, hz = target.z - p.z, hl = Math.hypot(hx, hz) || 1
          offroad = { t0: t, to: { x: p.x + (hx / hl) * 40 + (-hz / hl) * side * d, z: p.z + (hz / hl) * 40 + (hx / hl) * side * d } }
        }
      }
      // pure pursuit on the body's heading
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(vs.quaternion)
      const hdg = Math.atan2(fwd.x, fwd.z), want = Math.atan2(target.x - p.x, target.z - p.z)
      const alpha = Math.atan2(Math.sin(want - hdg), Math.cos(want - hdg))
      const Ld = Math.max(4, Math.hypot(target.x - p.x, target.z - p.z))
      const lim = P.maxSteerAngle / (1 + v / P.speedSteerRef)
      const desired = Math.max(-lim, Math.min(lim, Math.atan2(2 * P.wheelbase * Math.sin(alpha), Ld)))
      steer = vs.steerAngle + Math.max(-4.8 * DT, Math.min(4.8 * DT, desired - vs.steerAngle))
      if (process.env.SOAK_LOG === '2' && steps % 60 === 0) {
        let lat = Infinity; for (let j = Math.max(0, idx - 5); j < Math.min(router.path.length, idx + 5); j++) lat = Math.min(lat, Math.hypot(router.path[j].x - p.x, router.path[j].z - p.z))
        console.log(`      t ${t.toFixed(0)} idx ${idx} lat ${lat.toFixed(1)} v ${v.toFixed(1)}/${vT.toFixed(1)} alpha ${alpha.toFixed(2)} steer ${steer.toFixed(3)} (lim ${lim.toFixed(2)}) target ${Ld.toFixed(1)} m${offroad ? ' OFF-LEG' : ''}`)
      }
      // Steering pinned at its speed limit (the game's lim) means the corner is tighter than this speed can turn: the
      // curvature plan missed it, and the truck ran wide off the road at 13–15 m/s and launched (seed 856743250, t 49–54).
      // Slow until the wheel comes off the stop.
      if (Math.abs(Math.atan2(2 * P.wheelbase * Math.sin(alpha), Ld)) > 0.95 * lim) vT = Math.min(vT, 0.7 * v)
      const e = vT - v
      thr = e > 0 ? Math.min(1, 0.25 + 0.35 * e) : 0
      brk = e < -1.5 ? Math.min(1, -0.15 * e) : 0
    }
    inputs.push({ thr: +thr.toFixed(4), brk: +brk.toFixed(4), steer: +steer.toFixed(5) })
    vs.throttle = vs.smoothThrottle = thr; vs.brake = vs.smoothBrake = brk
    vs.steerAngle = steer; vs.wheelSteerAngles = ackermann(steer, P)

    // ── the game's fixed step (main.js): props' bush drag, stepPhysics, rim strikes, the damage model ──
    const pos = vs.position, vel = vs.velocity
    const f = w.props.bushDragForce(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, { x: 0, y: 0, z: 0 })
    if (f.x || f.y || f.z) { const k = DT / P.mass; vel.x += f.x * k; vel.y += f.y * k; vel.z += f.z * k }
    vPrev.copy(vs.velocity)
    strap?.beforeStep()
    stepPhysics(vs, P, DT, w.queryContacts, w.ctx)
    const hit = readRimStrikes(w.engine, w.chassis, vs.rimForce, DT, vs.rimHazard)
    damage.step(vs, P, DT)
    damage.feedContact(classifyImpactRegion(hit.point, hit.normal), hit.impulse, P.mass, DT, vs.velocity)
    t += DT; steps++; snapT += DT; settleT = Math.max(0, settleT - DT)

    // ── the flags ──
    if (!finiteState(vs)) { flag('nan', 0); if (replay) break; seatAt(Math.min(idx + 40, router.path.length - 1)); continue }
    const p = vs.position, gy = ground(p.x, p.z, p.y)
    const nr = w.road.queryNearest(p.x, p.z, 6), onRoad = !!nr && !offroad
    if (p.y < gy - 3) { flag('fall', gy - p.y); if (replay) break; seatAt(Math.min(idx + 40, router.path.length - 1)); continue }
    if (p.y - gy < 0.15) flag('body', gy - p.y + 0.15)
    for (let i = 0; i < 4; i++) {
      const hub = getWheelPosition(i, vs, P), hg = ground(hub.x, hub.z, hub.y)
      if (hub.y < hg - 0.08) { flag('wheel', hg - hub.y, { corner: i }); break }
    }
    const fz = Math.max(...P._tireFz)
    // SOAK_TRACE=n on a replay: the last n steps, per corner — tire load, the hub's height over the ground, its lateral
    // offset from the nearest road's centreline, and the road's top there (what each wheel is riding into).
    if (replay && process.env.SOAK_TRACE && steps > stepLimit - +process.env.SOAK_TRACE) {
      const cs = [0, 1, 2, 3].map(i => {
        const hub = getWheelPosition(i, vs, P), r = w.road.queryNearest(hub.x, hub.z, 15)
        const lat = r?.point ? Math.hypot(r.point.x - hub.x, r.point.z - hub.z) : NaN, top = w.road.sampleRoadTopY(hub.x, hub.z)
        return `${(P._tireFz[i] / 1000).toFixed(1)}kN h${(hub.y - ground(hub.x, hub.z, hub.y)).toFixed(2)} lat${lat.toFixed(1)} top-gnd${top == null ? '-' : (top - ground(hub.x, hub.z, hub.y)).toFixed(2)}`
      })
      console.log(`    ${steps} v ${vs.velocity.length().toFixed(1)} rim ${hit.impulse.toFixed(0)} | ${cs.join(' | ')}${strap ? ' | ' + strap.trace() : ''}`)
      // On the last step: the surface profile along the worst-loaded wheel's track, 1 m back to 1 m ahead — the carved
      // ground, the road top, and what the contact query (the physics) actually returns under a probe sphere.
      if (steps === stepLimit && hit.impulse > 0 && hit.point) {   // a body strike on the flag step: where, which face, and the engine's ground round it
        const hp = new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z).applyQuaternion(vs.quaternion).add(vs.position)
        const nw = hit.normal ? new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z).applyQuaternion(vs.quaternion) : null
        console.log(`    strike: (${hp.x.toFixed(2)}, ${hp.y.toFixed(2)}, ${hp.z.toFixed(2)}) ${(hp.y - ground(hp.x, hp.z, hp.y)).toFixed(2)} m over the drawn ground, normal ${nw ? `(${nw.x.toFixed(2)}, ${nw.y.toFixed(2)}, ${nw.z.toFixed(2)})` : '-'}, body-local (${hit.point.x.toFixed(2)}, ${hit.point.y.toFixed(2)}, ${hit.point.z.toFixed(2)})`)
        for (let dz = -1, ln = 0; dz <= 1.001; dz += 0.5, ln++) {
          const row = []
          for (let dx = -1; dx <= 1.001; dx += 0.5) {
            const x = hp.x + dx, z = hp.z + dz, g = ground(x, z, hp.y), t = w.engine.castRay({ x, y: g + 3, z }, { x: 0, y: -1, z: 0 }, 6, { collidesWith: 1n })
            row.push(t ? (t.point.y - g).toFixed(2) : '-')
          }
          console.log(`      terrain-ray minus drawn, dz ${dz.toFixed(1)}: ${row.join(' ')}`)
        }
        // into the struck face: from 0.6 m out along its normal, per layer — terrain (1), static (8: road tiles, POI and prop solids)
        if (nw) for (const [name, mask] of [['terrain', 1n], ['static', 8n]]) for (const dy of [-0.3, 0, 0.3]) {
          const o = { x: hp.x + nw.x * 0.6, y: hp.y + dy, z: hp.z + nw.z * 0.6 }, r = w.engine.castRay(o, { x: -nw.x, y: 0, z: -nw.z }, 1.5, { collidesWith: mask })
          console.log(`      into the face, ${name} ${dy >= 0 ? '+' : ''}${dy}: ${r ? `hit at ${r.distance.toFixed(2)} m, (${r.point.x.toFixed(2)}, ${r.point.y.toFixed(2)}, ${r.point.z.toFixed(2)}) normal (${r.normal.x.toFixed(2)}, ${r.normal.y.toFixed(2)}, ${r.normal.z.toFixed(2)}) body ${r.body ?? "?"} ${JSON.stringify(w.engine.getUserData(r.body))}` : "nothing"}`)
        }
      }
      if (steps === stepLimit) {
        const k = P._tireFz.indexOf(Math.max(...P._tireFz)), hub = getWheelPosition(k, vs, P)
        const vl = Math.hypot(vs.velocity.x, vs.velocity.z), ux = vs.velocity.x / vl, uz = vs.velocity.z / vl
        console.log(`    corner ${k} hub (${hub.x.toFixed(2)}, ${hub.y.toFixed(2)}, ${hub.z.toFixed(2)}), along (${ux.toFixed(2)}, ${uz.toFixed(2)})`)
        // across the road at the hub: from the centreline side outwards (the road's own normal)
        // (off-road, with no road within 15 m, there is no cross-section to take)
        const rn = w.road.queryNearest(hub.x, hub.z, 15), ox = rn?.point ? hub.x - rn.point.x : 0, oz = rn?.point ? hub.z - rn.point.z : 0, ol = Math.hypot(ox, oz)
        if (!rn?.point || !ol) console.log('      (no road within 15 m: no cross-section)')
        else for (let L = 4.2; L <= 6.001; L += 0.1) {
          const x = rn.point.x + ox / ol * L, z = rn.point.z + oz / ol * L, g = ground(x, z, hub.y), top = w.road.sampleRoadTopY(x, z)
          const hits = w.queryContacts(x, g + 0.4, z, 0.6) ?? [], surf = hits.length ? Math.max(...hits.map(h => h.contactPoint.y)) : NaN
          console.log(`      lat ${L.toFixed(1)}  ground ${(g - hub.y).toFixed(3)}  roadTop ${top == null ? '-' : (top - hub.y).toFixed(3)}  physics ${(surf - hub.y).toFixed(3)} (${hits.length})`)
        }
        for (let d = -1; d <= 1.001; d += 0.1) {
          const x = hub.x + ux * d, z = hub.z + uz * d, g = ground(x, z, hub.y), top = w.road.sampleRoadTopY(x, z), r = w.road.queryNearest(x, z, 15)
          const hits = w.queryContacts(x, g + 0.4, z, 0.6) ?? []
          const surf = hits.length ? Math.max(...hits.map(h => h.contactPoint.y)) : NaN
          console.log(`      d ${d.toFixed(1)}  ground ${(g - hub.y).toFixed(3)}  roadTop ${top == null ? '-' : (top - hub.y).toFixed(3)}  physics ${(surf - hub.y).toFixed(3)} (${hits.length} hits)  lat ${r?.point ? Math.hypot(r.point.x - x, r.point.z - z).toFixed(2) : '-'} run ${r?.runKey ?? '-'}`)
        }
      }
    }
    if (onRoad && fz > STRUT_N) flag('strut', fz)
    if (strap && strap.measure() * 1000 > CARGO_MM) flag('cargo', strap.off * 1000)
    if (strap?.pushJ) { flag('cargotire', strap.pushJ); strap.pushJ = 0 }
    const dv = Math.hypot(vs.velocity.x - vPrev.x, vs.velocity.y - vPrev.y + 9.81 * DT, vs.velocity.z - vPrev.z)
    if (onRoad && dv > JOLT_DV) flag('jolt', dv)
    if (hit.impulse > HIT_IMPULSE) {
      const hp = hit.point ? new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z).applyQuaternion(vs.quaternion).add(p) : p
      const near = w.props.queryProps(hp.x, hp.y, hp.z, 4, []).length || w.pois.queryContact(hp.x, hp.y, hp.z, 6)
        || (() => { const r = w.road.queryNearest(hp.x, hp.z, 15); return !!r && !!w.road.tunnelSpanAt(r.runKey ?? '', r.arcS ?? 0, -20) })()   // a bore, or a portal's walls
      // On the drawn terrain or road (a bank, a kerb, the deck): visible, whatever its slope — so its normal says nothing.
      const onSurface = Math.abs(hp.y - ground(hp.x, hp.z, hp.y)) < 0.5
      if (!near && !onSurface) {
        flag('collider', hit.impulse, { hitAt: { x: +hp.x.toFixed(2), y: +hp.y.toFixed(2), z: +hp.z.toFixed(2) }, surfaceY: +ground(hp.x, hp.z, hp.y).toFixed(2) })
        // SOAK_TRACE on a replay: what the ENGINE has round the hit — rays straight down from 3 m up, terrain-only and
        // static-only (GROUP_TERRAIN 1, GROUP_STATIC 8), against the drawn ground; and the hit's own normal.
        if (replay && process.env.SOAK_TRACE) {
          const nw = hit.normal ? new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z).applyQuaternion(vs.quaternion) : null
          console.log(`    collider: hit (${hp.x.toFixed(2)}, ${hp.y.toFixed(2)}, ${hp.z.toFixed(2)}) normal ${nw ? `(${nw.x.toFixed(2)}, ${nw.y.toFixed(2)}, ${nw.z.toFixed(2)})` : '-'} · truck (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`)
          for (let dz = -1.5; dz <= 1.501; dz += 0.5) {
            const row = []
            for (let dx = -1.5; dx <= 1.501; dx += 0.5) {
              const x = hp.x + dx, z = hp.z + dz, g = ground(x, z, hp.y)
              const t = w.engine.castRay({ x, y: g + 3, z }, { x: 0, y: -1, z: 0 }, 6, { collidesWith: 1n })
              const st = w.engine.castRay({ x, y: g + 3, z }, { x: 0, y: -1, z: 0 }, 6, { collidesWith: 8n })
              row.push(`${t ? (t.point.y - g).toFixed(2) : '  -  '}${st ? 'S' + (st.point.y - g).toFixed(1) : ''}`)
            }
            console.log(`      dz ${dz.toFixed(1)}: ${row.join(' ')}`)
          }
        }
      }
    }
    const v = vs.velocity.length()
    stuckT = onRoad && vs.throttle > 0.5 && v < 0.5 ? stuckT + DT : 0
    if (stuckT > 5) { flag('stuck', stuckT); stuckT = 0; if (replay) break; seatAt(Math.min(idx + 40, router.path.length - 1)); continue }
    // Anywhere else (off the road, a cliff, a pond) the autopilot is the thing stuck, not the road: put it back. Likewise
    // when it has lost its route (overshot a corner and circling) — an autopilot failure, not a finding.
    stillT = v < 0.5 ? stillT + DT : 0
    let lat = Infinity
    if (!offroad) for (let j = Math.max(0, idx - 3); j < Math.min(router.path.length, idx + 8); j++) lat = Math.min(lat, Math.hypot(router.path[j].x - p.x, router.path[j].z - p.z))
    lostT = lat > 8 ? lostT + DT : 0
    if ((stillT > 10 || lostT > 4) && !replay) { stillT = lostT = 0; offroad = null; resets++; seatAt(Math.min(idx + 15, router.path.length - 1)); continue }
    if (t - lastLog >= 10 && process.env.SOAK_LOG) { lastLog = t; console.log(`    t ${t.toFixed(0)} s · ${(dist / 1000).toFixed(2)} km · v ${v.toFixed(1)} · (${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}) ${onRoad ? 'road' : offroad ? 'off-road' : 'OFF'} · ${((performance.now() - t0) / 1000).toFixed(0)} s wall`) }

    // ── book-keeping: distance, streaming, the capture window ──
    const d = Math.hypot(vs.velocity.x, vs.velocity.z) * DT
    if (offroad) offDist += d; else dist += d
    if (t - lastStream > 1) { w.stream(p.x, p.z); lastStream = t }
    if (snapT >= CAPTURE_S && !replay) { snap = snapshot(vs); inputs = []; snapT = 0; snapAfterSeat = false }
  }
  w.dispose()
  const wall = (performance.now() - t0) / 1000
  return { seed, buildS: +buildS.toFixed(1), km: +(dist / 1000).toFixed(2), offKm: +(offDist / 1000).toFixed(2), simS: +t.toFixed(0), wallS: +wall.toFixed(0), resets, counts, worst }
}

// ── Main ───────────────────────────────────────────────────────────────────────────────────────────────────────────
if (arg('replay')) {
  const cap = JSON.parse(readFileSync(arg('replay'), 'utf8'))
  console.log(`replay ${arg('replay')}: seed ${cap.seed}, ${cap.kind} at (${cap.at.x}, ${cap.at.z}), ${cap.inputs.length} steps`)
  const r = await soakSeed(cap.seed, cap)
  console.log(`  flags on replay: ${JSON.stringify(r.counts)} — ${r.counts[cap.kind] ? 'REPRODUCED' : 'not reproduced'}`)
  process.exit(0)
}
const all = []
for (const seed of seeds) {
  const r = await soakSeed(seed)
  all.push(r)
  const c = Object.entries(r.counts).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(' · ') || 'clean'
  console.log(`seed ${seed}: ${r.km} km on the road + ${r.offKm} km off, ${r.simS} sim-s in ${r.wallS} s (build ${r.buildS} s, ${r.resets} autopilot re-seats) — ${c}`)
  writeFileSync(`${OUT}/summary.json`, JSON.stringify(all, null, 1))
}
const byKind = {}
for (const r of all) for (const f of r.worst) (byKind[f.kind] ??= []).push(f)
console.log('\nworst sites:')
for (const [k, fs] of Object.entries(byKind)) {
  fs.sort((a, b) => b.mag - a.mag)
  for (const f of fs.slice(0, 3)) console.log(`  ${k.padEnd(8)} ${String(f.mag).padStart(9)} · seed ${f.seed} (${f.at.x}, ${f.at.y}, ${f.at.z}) at ${f.v} m/s${f.offroad ? ' off-road' : ''}${f.capture ? ' · ' + f.capture : ''}`)
}
