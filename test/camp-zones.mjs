// test/camp-zones.mjs — FEAT-45 dispersed-camping zones gate (SM-1).
//
// Zones are worldgen-layer (a permission painted on the map), so SM-INV-12 applies in full:
//
//   1. Determinism — same seed → bit-identical zone list; a different seed differs.
//   2. WINDOW-INVARIANCE — a zone's existence/centre/radius is a pure fn of (seed, macro cell,
//      CAMP_PARAMS). Two regions built from different centres must agree exactly on every zone
//      whose centre lies in both.
//   3. THE REGION CLIP IS A POST-FILTER — build() may only decide whether a zone is KEPT, never
//      where it is: every kept zone must equal the raw cell-grid answer at its centre.
//   4. Coverage — the ratified "~20% of the map". Asserted on GLOBAL density over a large box:
//      per-region coverage is high-variance (a 2.5 km region only holds ~6 zones — seed 7's region
//      measures ~9% while its global density is ~18%), so a region-local assertion would flake on
//      arbitrary seeds. Global density is the tuned quantity; [15%, 25%] is the contract.
//
// Pure node: CampSystem's zone layer reads only (seed, params) — no road, terrain or water deps
// are touched by build()/zoneAt()/zoneAtRaw(), which is itself part of what this gate pins.
import { CampSystem, CAMP_PARAMS } from '../src/camp.js'

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

const key = (q) => `${q.x},${q.z},${q.r}`
const REGION_R = 2500

// ── 1. Determinism ──────────────────────────────────────────────────────────────────────────────
{
  const a = mkCamp(6).build({ x: 0, z: 0 }, REGION_R)
  const b = mkCamp(6).build({ x: 0, z: 0 }, REGION_R)
  check('same seed + centre → bit-identical zone list', JSON.stringify(a) === JSON.stringify(b))
  check('the region holds a sensible zone count (2–12)', a.length >= 2 && a.length <= 12, `n=${a.length}`)
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
  check('two centres agree on every shared zone', shared > 0 && missing === 0 && mismatched === 0,
    `shared=${shared} missing=${missing} mismatched=${mismatched}`)
}

// ── 3. The region clip is a post-filter ─────────────────────────────────────────────────────────
{
  const sys = mkCamp(6)
  const built = sys.build({ x: 0, z: 0 }, REGION_R)
  let agree = true
  for (const q of built) {
    const raw = sys.zoneAtRaw(q.x, q.z)          // straight off the cell grid, region ignored
    if (!raw || key(raw) !== key(q)) { agree = false; break }
  }
  check('every kept zone equals the raw cell-grid answer at its centre', agree)
  // And zoneAt (the play query) agrees with the built list it scans.
  const q0 = built[0]
  check('zoneAt hits inside a zone, misses outside every zone', sys.zoneAt(q0.x, q0.z) === q0
    && (() => {                                   // hunt a point in no zone (raw), assert miss
      for (let x = -4000; x <= 4000; x += 97) {
        for (let z = -4000; z <= 4000; z += 89) {
          if (Math.hypot(x, z) > REGION_R) continue
          if (!sys.zoneAtRaw(x, z)) return sys.zoneAt(x, z) === null
        }
      }
      return true                                 // no gap found (absurd at 20% coverage) — vacuous pass
    })())
}

// ── 4. Global coverage ≈ 20% (the ratified density), per seed ───────────────────────────────────
{
  // Deterministic lattice, no RNG: 200×200 samples over a 40×40 km box, offset off the cell grid
  // so lattice points never sit exactly on cell borders.
  for (const seed of [1, 6, 7, 42]) {
    const sys = mkCamp(seed)
    let hit = 0, n = 0
    for (let i = 0; i < 200; i++) {
      for (let j = 0; j < 200; j++) {
        const x = -20000 + 137.3 + i * 200
        const z = -20000 + 61.7 + j * 200
        n++
        if (sys.zoneAtRaw(x, z)) hit++
      }
    }
    const cov = hit / n
    check(`seed ${seed}: global zone density in [15%, 25%]`, cov >= 0.15 && cov <= 0.25,
      `${(cov * 100).toFixed(1)}%`)
  }
}

// ── 5. The 3×3-neighbourhood soundness guard ────────────────────────────────────────────────────
check('zone radius bounded by the cell (3×3 raw scan sound)', CAMP_PARAMS.campMaxRadiusM < CAMP_PARAMS.campCellM,
  `${CAMP_PARAMS.campMaxRadiusM} vs ${CAMP_PARAMS.campCellM}`)

console.log(fails === 0 ? '\nPASS camp-zones' : `\nFAIL camp-zones (${fails})`)
process.exit(fails === 0 ? 0 : 1)
