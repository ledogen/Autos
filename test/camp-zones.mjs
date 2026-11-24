// test/camp-zones.mjs — FEAT-45 dispersed-camping zones gate (SM-1), FEAT-299 runs of road.
//
// A zone's SEED is worldgen-layer, so SM-INV-12 applies to it in full:
//
//   1. Determinism — same seed → bit-identical seed list; a different seed differs.
//   2. WINDOW-INVARIANCE — a seed's existence/position/size roll is a pure fn of (seed, macro cell,
//      CAMP_PARAMS). Two regions built from different centres must agree exactly on every seed
//      that lies in both.
//   3. THE REGION CLIP IS A POST-FILTER — build() may only decide whether a seed is KEPT, never
//      where it is: every kept seed equals its own cell's roll.
//   4. growArea (FEAT-299, DEC-437) on a hand-made network: one piece that carries on through the
//      junction it meets, the target's road and no more, a road piece smaller than that taken whole,
//      no tunnel in its lines; zoneAt is the tether corridor beside them.
//
// Pure node: build() reads only (seed, params) — no road, terrain or water deps are touched,
// which is itself part of what this gate pins. (The zones on real regions: camp-reach.mjs.)
import { CampSystem, CAMP_PARAMS, growArea } from '../src/camp.js'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}

const mkCamp = (seed) => new CampSystem({
  getSeed: () => seed,
  getParams: () => ({}),          // zone layer must not need road params — throwing here would fail
  getRoad: () => { throw new Error('zone layer touched the road') },
  getTerrain: () => { throw new Error('zone layer touched terrain') },
  getWater: () => { throw new Error('zone layer touched water') },
  treesNear: () => { throw new Error('zone layer touched the scatter') },
})

const key = (q) => `${q.x},${q.z},${q.u}`
const REGION_R = 2500

// ── 1. Determinism ──────────────────────────────────────────────────────────────────────────────
{
  const a = mkCamp(6).build({ x: 0, z: 0 }, REGION_R)
  const b = mkCamp(6).build({ x: 0, z: 0 }, REGION_R)
  check('same seed + centre → bit-identical seed list', JSON.stringify(a) === JSON.stringify(b))
  check('the region holds a sensible seed count (2–12)', a.length >= 2 && a.length <= 12, `n=${a.length}`)
  const c = mkCamp(7).build({ x: 0, z: 0 }, REGION_R)
  check('a different seed lays out differently', JSON.stringify(a) !== JSON.stringify(c))
  const sys = mkCamp(6)
  const first = sys.build({ x: 0, z: 0 }, REGION_R)
  check('rebuild of the same region is idempotent (same array back)', sys.build({ x: 0, z: 0 }, REGION_R) === first)
}

// ── 2. Window-invariance across region centres ──────────────────────────────────────────────────
{
  const cA = { x: 0, z: 0 }, cB = { x: 800, z: -600 }
  const A = mkCamp(6).build(cA, REGION_R)
  const B = mkCamp(6).build(cB, REGION_R)
  const inR = (q, c) => Math.hypot(q.x - c.x, q.z - c.z) <= REGION_R
  const mapB = new Map(B.map(q => [key(q), q]))
  let shared = 0, mismatched = 0, missing = 0
  for (const q of A) {
    if (!inR(q, cB)) continue                    // centre not in B's region — B owes nothing
    shared++
    if (!mapB.has(key(q))) missing++
    else if (JSON.stringify(mapB.get(key(q))) !== JSON.stringify(q)) mismatched++
  }
  check('two centres agree on every shared seed', shared > 0 && missing === 0 && mismatched === 0,
    `shared=${shared} missing=${missing} mismatched=${mismatched}`)
}

// ── 3. The region clip is a post-filter ─────────────────────────────────────────────────────────
{
  const sys = mkCamp(6), S = CAMP_PARAMS.campCellM
  const built = sys.build({ x: 0, z: 0 }, REGION_R)
  const raw = (q) => sys._cellZone(Math.floor(q.x / S), Math.floor(q.z / S), 6, sys._P())   // a seed lies in its own cell
  check('every kept seed equals its own cell\'s roll', built.every((q) => raw(q) && key(raw(q)) === key(q)))
}

// ── 4. growArea on a hand-made network ──────────────────────────────────────────────────────────
// A — 1000 m east — B, and at B a junction: B — 600 m north — C, B — 600 m south — D. A second road E — 300 m — F
// stands alone 2 km off. The A–B road has a 40 m bore at 100..140 m.
{
  const line = (x0, z0, x1, z1, n) => {
    const pts = [], cum = []
    for (let i = 0; i <= n; i++) { pts.push({ x: x0 + (x1 - x0) * i / n, z: z0 + (z1 - z0) * i / n }); cum.push(Math.hypot(x1 - x0, z1 - z0) * i / n) }
    return { pts, cum, L: cum[n] }
  }
  const segs = [
    { ka: 'A', kb: 'B', ...line(0, 0, 1000, 0, 100), tun: [{ s0: 100, s1: 140 }] },
    { ka: 'B', kb: 'C', ...line(1000, 0, 1000, 600, 60) },
    { ka: 'B', kb: 'D', ...line(1000, 0, 1000, -600, 60) },
    { ka: 'E', kb: 'F', ...line(0, 2000, 300, 2000, 30) },
  ]
  const a = growArea(segs, { x: 800, z: 30 }, 1000)   // seeded 200 m short of the junction
  const on = (k) => a.spans.filter((s) => s.ka + s.kb === k).reduce((t, s) => t + s.s1 - s.s0, 0)
  check('the area holds its target road (± 1 m)', Math.abs(a.len - 1000) <= 1, `${a.len.toFixed(1)} m`)
  check('it is seeded on the road nearest the point', Math.abs(a.x - 800) < 1e-6 && Math.abs(a.z) < 1e-6, `(${a.x}, ${a.z})`)
  // A ball of driving distance ρ: 800−ρ..1000 on A–B plus ρ−200 down each leg: 3ρ − 200 = 1000 → ρ = 400.
  check('it carries on through the junction, down both legs alike', Math.abs(on('BC') - 200) <= 1 && Math.abs(on('BD') - 200) <= 1
    && Math.abs(on('AB') - 600) <= 1, `AB ${on('AB').toFixed(0)} BC ${on('BC').toFixed(0)} BD ${on('BD').toFixed(0)}`)
  check('it is one stretch per road (one piece)', a.spans.length === 3, JSON.stringify(a.spans))
  const small = growArea(segs, { x: 150, z: 2010 }, 1000)
  check('a road piece shorter than the target is taken whole', Math.abs(small.len - 300) <= 1e-6 && small.spans.length === 1)
  const big = growArea(segs, { x: 120, z: 0 }, 400)
  check('a bore is in the area but not in its lines (no camping in a tunnel)', Math.abs(big.len - 400) <= 1
    && !big.lines.some((l) => l.some((p) => p.x > 100.5 && p.x < 139.5)) && big.lines.length === 2)
  const sys = mkCamp(6)
  sys._list = [a]
  const t = sys.tetherM()
  check('zoneAt: on its road, and within the tether beside it', sys.zoneAt(900, 0) === a && sys.zoneAt(1000, 140) === a && sys.zoneAt(900, t - 0.5) === a)
  check('zoneAt: past the tether, and on road beyond the area', sys.zoneAt(900, t + 0.5) === null && sys.zoneAt(1000, 200 + t + 1) === null && sys.zoneAt(300, 0) === null)
}

console.log(fails === 0 ? '\nPASS camp-zones' : `\nFAIL camp-zones (${fails})`)
process.exit(fails === 0 ? 0 : 1)
