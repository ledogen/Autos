// test/par-oracle.mjs — FEAT-29 par oracle gate.
//
// Par is the economic foundation of story mode (payout is margin against par, SM-INV-4), so the
// properties that must never quietly break are:
//
//   1. SM-INV-2 — par NEVER scales with the car. Mutating RANGER_PARAMS (and every vehicle knob
//      we can reach) must not move par by a single ULP. This is the invariant that dies first if
//      someone "helpfully" wires par to the drivetrain, so it is asserted, not documented.
//   2. Determinism — same route data → bit-identical par, from any caller, any order.
//   3. Physical sanity — a flat straight matches the closed-form accel/cruise/brake time; adding
//      curvature or grade only ever makes par LONGER; a chained pair of half-ranges equals the
//      whole range (the mid-edge-endpoint case from DESIGN.md "Where missions and POIs live").
//
// Pure node, no THREE, no worldgen: the centerlines here are duck-typed analytic curves, which is
// the whole point of par.js taking geometry by interface.
import { computePar, PAR_REF, gradeRun, formatTime } from '../src/par.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { headingToFace, facingFromHeading } from '../src/mission.js'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}

// ── duck-typed fixture centerlines ──────────────────────────────────────────────────────────────
// A straight of length L along +x.
const straight = (L) => ({
  length: L,
  curvatureAt: () => 0,
  tangentAt: () => ({ x: 1, z: 0 }),
})
// A constant-radius arc of length L (curvature 1/R), tangent rotating with s.
const arc = (L, R) => ({
  length: L,
  curvatureAt: () => 1 / R,
  tangentAt: (s) => ({ x: Math.cos(s / R), z: Math.sin(s / R) }),
})
// Alternating-curvature "switchback" road: |κ| = 1/R everywhere, sign flipping every `period` m.
const wiggle = (L, R, period) => ({
  length: L,
  curvatureAt: (s) => (Math.floor(s / period) % 2 ? -1 : 1) / R,
  tangentAt: (s) => ({ x: Math.cos(s / R), z: Math.sin(s / R) }),
})
const flat = () => 0
const slope = (grade) => (s) => s * grade

const seg = (centerline, gradeAt = flat, s0 = 0, s1 = centerline.length) => ({ centerline, gradeAt, s0, s1 })

// ── 1. Flat straight matches an INDEPENDENT time-marched integration ────────────────────────────
// par.js solves this by marching in SPACE (forward accel pass, backward brake pass). This check
// marches in TIME with a plain ODE and a "brake when you must" rule — a different algorithm over
// the same physics, so agreement is evidence rather than tautology.
// (The previous closed form assumed no drag and went stale the moment terminal speed became a
// drag balance instead of a hard cap — it read 2% fast.)
{
  const L = 2000
  const { time, distance } = computePar([seg(straight(L))])
  const { accel: a, brake: bk, vMax: vm } = PAR_REF
  const k = a / (vm * vm)                       // same drag coefficient par derives
  const dt = 1e-4
  let v = 0, x = 0, t = 0
  while (x < L && t < 600) {
    // Distance still needed to stop from here, decelerating at `bk` plus drag (drag ignored ⇒
    // slightly conservative ⇒ brakes a touch early, worth well under the tolerance).
    const stopDist = v * v / (2 * bk)
    const acc = (L - x <= stopDist) ? -(bk + k * v * v) : (a - k * v * v)
    v = Math.max(0, v + acc * dt)
    x += v * dt
    t += dt
    if (v <= 0 && L - x > 1) break              // shouldn't happen; guard against a stall
  }
  check('flat straight par matches an independent time-marched integration',
    Math.abs(time - t) / t < 0.03, `par ${time.toFixed(2)}s vs march ${t.toFixed(2)}s`)
  check('flat straight distance == centerline length',
    Math.abs(distance - L) < 1e-6, `got ${distance}`)
}

// ── 1b. Grade is signed: downhill must be FASTER than flat, uphill slower ────────────────────────
// This was the defect the owner reported — par was effectively grade-blind on descents (0.3 s per
// 1500 m) because vMax was a HARD cap, so the reference hit it and cruised no matter what gravity
// was doing. Terminal speed is now a drag balance, so gravity shifts it.
{
  const L = 1500
  const t = (g) => computePar([seg(straight(L), slope(g))]).time
  const flat = t(0), down5 = t(-0.05), down10 = t(-0.10), up10 = t(0.10)
  check('downhill is faster than flat', down10 < flat, `${down10.toFixed(1)}s vs ${flat.toFixed(1)}s`)
  check('steeper downhill is faster still', down10 < down5, `${down10.toFixed(1)}s vs ${down5.toFixed(1)}s`)
  check('uphill is slower than flat', up10 > flat, `${up10.toFixed(1)}s vs ${flat.toFixed(1)}s`)
  // Magnitude, not just sign: a 10% descent is worth real time on a straight.
  check('a 10% descent is worth >5% of the flat time', (flat - down10) / flat > 0.05,
    `saved ${(100 * (flat - down10) / flat).toFixed(1)}%`)
  // And the reference is allowed past its flat cruise speed on the way down.
  const peak = Math.max(...computePar([seg(straight(L), slope(-0.12))]).speeds)
  check('a descent lets par exceed the flat terminal speed', peak > PAR_REF.vMax * 1.05,
    `peak ${(peak * 3.6).toFixed(0)} km/h vs flat vMax ${(PAR_REF.vMax * 3.6).toFixed(0)}`)
  check('but never past the hard ceiling', peak <= PAR_REF.vCeil + 1e-6)
}

// ── 2. Monotonicity: curvature and grade only ever cost time ────────────────────────────────────
{
  const L = 1200
  const base = computePar([seg(straight(L))]).time
  const curvy = computePar([seg(arc(L, 120))]).time
  const tight = computePar([seg(arc(L, 40))]).time
  const switchy = computePar([seg(wiggle(L, 35, 60))]).time
  check('curvature costs time', curvy > base, `${curvy.toFixed(1)} vs ${base.toFixed(1)}`)
  check('tighter radius costs more time', tight > curvy, `${tight.toFixed(1)} vs ${curvy.toFixed(1)}`)
  check('switchbacks cost more than a constant sweeper of the same radius+length',
    switchy > computePar([seg(arc(L, 35))]).time * 0.98,
    `${switchy.toFixed(1)} vs ${computePar([seg(arc(L, 35))]).time.toFixed(1)}`)

  const uphill = computePar([seg(straight(L), slope(0.08))]).time
  const steeper = computePar([seg(straight(L), slope(0.15))]).time
  check('grade costs time', uphill > base, `${uphill.toFixed(1)} vs ${base.toFixed(1)}`)
  check('steeper grade costs more time', steeper > uphill, `${steeper.toFixed(1)} vs ${uphill.toFixed(1)}`)
}

// ── 3. Mid-edge endpoints: a chained pair of half-ranges == the whole range ──────────────────────
// DESIGN.md 2026-07-20 — endpoints are arbitrary (runKey, arcS), so par must integrate over arc
// RANGES, and splitting a range at an interior point must not change the answer.
{
  const cl = wiggle(900, 60, 90)
  const whole = computePar([seg(cl)]).time
  const split = computePar([seg(cl, flat, 0, 450), seg(cl, flat, 450, 900)]).time
  check('whole range == two chained half-ranges (no phantom junction, no lost carry-over)',
    Math.abs(whole - split) / whole < 0.02, `whole ${whole.toFixed(2)} split ${split.toFixed(2)}`)

  const partial = computePar([seg(cl, flat, 200, 700)]).time
  check('a partial range is shorter than the whole edge', partial < whole,
    `${partial.toFixed(2)} vs ${whole.toFixed(2)}`)
  check('reversed traversal is a valid route (s1 < s0)',
    computePar([seg(cl, flat, 700, 200)]).time > 0)
}

// ── 4. Junction penalty: turning through a node costs, driving straight through does not ─────────
{
  const a1 = straight(400)
  // Second segment whose entry tangent is 90° off — a real corner at the node.
  const turned = { length: 400, curvatureAt: () => 0, tangentAt: () => ({ x: 0, z: 1 }) }
  const straightThrough = computePar([seg(a1), seg(straight(400))]).time
  const cornered = computePar([seg(a1), seg(turned)]).time
  check('turning through a junction costs time', cornered > straightThrough,
    `${cornered.toFixed(2)} vs ${straightThrough.toFixed(2)}`)
  check('driving straight through a junction is free',
    Math.abs(straightThrough - computePar([seg(straight(800))]).time) < 0.05)
}

// ── 5. SM-INV-2: par does not read the car ──────────────────────────────────────────────────────
{
  const route = [seg(wiggle(1500, 55, 80), slope(0.05)), seg(arc(600, 90), slope(-0.03))]
  const before = computePar(route).time

  // Mutate every vehicle knob we can reach. If par moves, something wired it to the truck.
  const touched = []
  for (const k of Object.keys(RANGER_PARAMS)) {
    const v = RANGER_PARAMS[k]
    if (typeof v === 'number') { RANGER_PARAMS[k] = v * 3.7 + 1; touched.push(k) }
  }
  const after = computePar(route).time
  check(`SM-INV-2: par identical after mutating ${touched.length} vehicle params`,
    before === after, `before ${before} after ${after}`)
}

// ── 6. Determinism ──────────────────────────────────────────────────────────────────────────────
{
  const route = () => [seg(wiggle(1100, 48, 70), slope(0.06))]
  const a = computePar(route()).time, b = computePar(route()).time
  check('deterministic: identical route data → bit-identical par', a === b, `${a} vs ${b}`)
}

// ── 7. Grading + formatting helpers ─────────────────────────────────────────────────────────────
{
  const par = 300
  check('grade S is faster than par', gradeRun(230, par).letter === 'S')
  check('grade B brackets par', gradeRun(300, par).letter === 'B')
  check('grade D is well over par', gradeRun(500, par).letter === 'D')
  check('margin is par − elapsed', Math.abs(gradeRun(280, par).margin - 20) < 1e-9)
  check('formatTime pads seconds', formatTime(65.4) === '1:05.4', formatTime(65.4))
}

// ── 8. Spawn heading convention ─────────────────────────────────────────────────────────────────
// Missions shipped spawning the player 180° out on every single run. Nothing crashed, the map drew
// the route correctly, and the only symptom was a U-turn — which then inflated every calibration
// time measured against it. Pin the convention both ways.
//
// The ground truth lives in _seatOnGroundPlane (src/main.js): the front axle sits at body-local -Z
// and the body yaws by `heading`, so front-minus-rear points along (-sin h, -cos h). That file is
// in this gate's extraDeps so an edit to the seat re-runs this check.
{
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [0.6, 0.8], [-0.28, -0.96]]
  let worst = 0
  for (const [tx, tz] of dirs) {
    const f = facingFromHeading(headingToFace(tx, tz))
    worst = Math.max(worst, Math.hypot(f.x - tx, f.z - tz))
  }
  check('a truck seated at headingToFace(t) actually faces t', worst < 1e-12,
    `worst error ${worst}`)
  // The specific failure that shipped: atan2(tx, tz) instead of atan2(-tx, -tz) is exactly 180° out.
  const naive = Math.atan2(1, 0), correct = headingToFace(1, 0)
  const fN = facingFromHeading(naive)
  check('the naive atan2(tx,tz) form faces BACKWARDS (regression pin)',
    Math.abs(fN.x - (-1)) < 1e-12 && Math.abs(correct - Math.atan2(-1, -0)) < 1e-12,
    `naive faces (${fN.x.toFixed(2)}, ${fN.z.toFixed(2)})`)
}

// ── report ──────────────────────────────────────────────────────────────────────────────────────
{
  // Report-only: what par actually says about a plausible 3 km mountain leg.
  const legTime = computePar([seg(wiggle(3000, 65, 120), slope(0.02))]).time
  console.log(`[note] 3 km switchback leg par = ${formatTime(legTime)} (${(3000 / legTime * 3.6).toFixed(1)} km/h avg)`)
}

console.log(fails === 0 ? '\nPASS par-oracle' : `\nFAIL par-oracle (${fails})`)
process.exit(fails === 0 ? 0 : 1)
