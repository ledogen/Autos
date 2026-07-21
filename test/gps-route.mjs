// test/gps-route.mjs — FEAT-39 GPS assist route gate.
//
// The GPS overlay is only ever as honest as its route bake. Three things must not quietly break:
//
//   1. TRAVEL ORDER. mission.js hands GPS segments where s1 < s0 means the edge is driven
//      BACKWARDS, and the first/last edge are partial arc ranges (DESIGN.md "Where missions and
//      POIs live"). Baking in centerline order instead of travel order points every chevron the
//      wrong way down half the route — and it looks fine on any route that happens to run forward.
//   2. TURN SIGN. +ve = right. Driver forward × up = right (X × Y = Z), so with forward = +X the
//      right-hand direction is +Z. Getting this backwards sends every playtester the wrong way at
//      every junction, which is worse than no GPS at all.
//   3. PROGRESS RE-ACQUISITION. The windowed nearest search must stay monotonic while you drive
//      the route, and must recover the right place after a wrong turn — otherwise a tester who
//      strays once gets chevrons for the rest of the run pointing at a stale index.
//
// Pure node: the centerlines here are duck-typed analytic curves, same trick as par-oracle.mjs.
// THREE is imported only for the placement section — its scene graph is renderer-free, so the
// real GpsSystem runs headlessly and the arrow/chevron transforms can be asserted, not eyeballed.
import * as THREE from 'three'
import { GpsSystem, bakeRoute, classifyTurn, advanceProgress, sampleRoute } from '../src/gps.js'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}

// ── duck-typed fixture centerlines (pointAt + length is the whole interface GPS needs) ──────────
/** Straight of length L from (x0,z0) along unit (dx,dz). */
const straight = (L, x0, z0, dx, dz) => ({
  length: L,
  pointAt: (s) => ({ x: x0 + dx * s, z: z0 + dz * s }),
})
const level = () => 0
const seg = (centerline, s0, s1, gradeAt = level) => ({ centerline, gradeAt, s0, s1 })

// ── 1. bake: arc length, travel order, reversed edges ───────────────────────────────────────────
{
  // Two straights meeting at the origin: in along +X, out along +Z (a RIGHT turn).
  const a = straight(200, -200, 0, 1, 0)          // (-200,0) → (0,0)
  const b = straight(200, 0, 0, 0, 1)             // (0,0)   → (0,200)
  const r = bakeRoute([seg(a, 0, 200), seg(b, 0, 200)])

  let mono = true
  for (let i = 1; i < r.n; i++) if (!(r.cum[i] > r.cum[i - 1])) mono = false
  check('baked arc length is strictly increasing', mono)
  check('baked length == sum of traversed arc ranges', Math.abs(r.length - 400) < 1e-6,
    `got ${r.length}`)
  check('the shared join vertex is not duplicated', r.junctions.length === 1 && r.n === Math.ceil(200 / 6) * 2 + 1,
    `n=${r.n} junctions=${r.junctions.length}`)

  // Travel order: first vertex is edge A's s0 end, last is edge B's s1 end.
  check('bake runs in travel order (start → end)',
    Math.abs(r.px[0] + 200) < 1e-6 && Math.abs(r.pz[r.n - 1] - 200) < 1e-6,
    `start=(${r.px[0]},${r.pz[0]}) end=(${r.px[r.n - 1]},${r.pz[r.n - 1]})`)

  // A REVERSED edge (s1 < s0) must bake from s0 down to s1, not from the centerline's own s=0.
  const rev = bakeRoute([seg(b, 200, 0)])
  check('reversed edge (s1 < s0) bakes in travel order, not centerline order',
    Math.abs(rev.pz[0] - 200) < 1e-6 && Math.abs(rev.pz[rev.n - 1]) < 1e-6,
    `start z=${rev.pz[0]} end z=${rev.pz[rev.n - 1]}`)

  // Partial first/last ranges (the mid-edge endpoint case).
  const part = bakeRoute([seg(a, 50, 200), seg(b, 0, 120)])
  check('partial first/last arc ranges are honoured', Math.abs(part.length - 270) < 1e-6,
    `got ${part.length}`)
}

// ── 2. turn classification ──────────────────────────────────────────────────────────────────────
{
  // +X then +Z: forward × up = right ⇒ right is +Z ⇒ this is a RIGHT turn.
  const right = bakeRoute([
    seg(straight(200, -200, 0, 1, 0), 0, 200),
    seg(straight(200, 0, 0, 0, 1), 0, 200),
  ])
  check('+X → +Z classifies as a RIGHT turn',
    right.junctions[0].turn === 'right' && right.junctions[0].angle > 0,
    `turn=${right.junctions[0].turn} angle=${(right.junctions[0].angle * 180 / Math.PI).toFixed(1)}°`)

  const left = bakeRoute([
    seg(straight(200, -200, 0, 1, 0), 0, 200),
    seg(straight(200, 0, 0, 0, -1), 0, 200),
  ])
  check('+X → -Z classifies as a LEFT turn',
    left.junctions[0].turn === 'left' && left.junctions[0].angle < 0,
    `turn=${left.junctions[0].turn}`)

  // A gentle kink must NOT raise an arrow — that deadband is what keeps the overlay minimal.
  const kinkA = 6 * Math.PI / 180
  const kink = bakeRoute([
    seg(straight(200, -200, 0, 1, 0), 0, 200),
    seg(straight(200, 0, 0, Math.cos(kinkA), Math.sin(kinkA)), 0, 200),
  ])
  check('a 6° kink classifies as straight (no arrow)', kink.junctions[0].turn === 'straight',
    `turn=${kink.junctions[0].turn}`)
  check('classifyTurn deadband is symmetric',
    classifyTurn(0.1) === 'straight' && classifyTurn(-0.1) === 'straight' &&
    classifyTurn(1) === 'right' && classifyTurn(-1) === 'left')
}

// ── 3. progress: monotonic along the route, re-acquires after a detour ──────────────────────────
{
  // Three legs round a hairpin block: +X, then +Z for 120 m, then -X. The last leg runs back
  // parallel to the first only 120 m away — a full-scan nearest can and does snap onto the wrong
  // leg there, which is exactly what the windowed search exists to prevent.
  const route = bakeRoute([
    seg(straight(300, -300, 0, 1, 0), 0, 300),       // (-300,0) → (0,0)
    seg(straight(120, 0, 0, 0, 1), 0, 120),          // (0,0)    → (0,120)
    seg(straight(300, 0, 120, -1, 0), 0, 300),       // (0,120)  → (-300,120)
  ])
  check('three-edge route bakes two junctions', route.junctions.length === 2)
  check('both hairpin joins are right turns', route.junctions.every(j => j.turn === 'right'),
    route.junctions.map(j => `${j.turn}@${j.s.toFixed(0)}`).join(' '))

  let idx = 0, prevS = -1, mono = true, worstLat = 0
  for (let s = 0; s <= route.length; s += 3) {
    const p = sampleRoute(route, s, idx)
    const g = advanceProgress(route, p.x, p.z, idx)
    idx = g.idx
    if (g.s < prevS - 1e-6) mono = false
    prevS = g.s
    worstLat = Math.max(worstLat, g.lat)
    if (Math.abs(g.s - s) > 2.0) mono = false     // and it tracks the true arc, not just any arc
  }
  check('progress is monotonic and tracks true arc along the whole route', mono, `last s=${prevS}`)
  check('lateral error on-route stays under 1 m', worstLat < 1, `worst ${worstLat.toFixed(3)} m`)

  // Stale index (the driver was teleported / took a wrong turn and came back somewhere else):
  // the windowed search around n-1 sees nothing near, so the full-scan fallback must fire.
  const at = sampleRoute(route, 150, 0)
  const off = advanceProgress(route, at.x, at.z - 6, route.n - 1)
  check('a stale index re-acquires via the full-scan fallback', Math.abs(off.s - 150) < 10,
    `re-acquired at s=${off.s.toFixed(1)} (expected ~150)`)
  // ...and while merely windowed, it must NOT snap to the parallel leg 120 m away.
  const near = sampleRoute(route, 60, 0)
  const held = advanceProgress(route, near.x, near.z, 10)
  check('the windowed search does not snap onto the parallel return leg',
    Math.abs(held.s - 60) < 10, `s=${held.s.toFixed(1)}`)
}

// ── 4. elevation comes from gradeAt, and cum is 3-D ─────────────────────────────────────────────
{
  const slope = (k) => (s) => k * s
  const r = bakeRoute([seg(straight(100, 0, 0, 1, 0), 0, 100, slope(0.1))])
  check('baked Y follows gradeAt', Math.abs(r.py[r.n - 1] - 10) < 1e-6, `end y=${r.py[r.n - 1]}`)
  check('cum is 3-D arc (a 10% climb is longer than its XZ run)',
    r.length > 100 && Math.abs(r.length - Math.hypot(100, 10)) < 1e-6, `len=${r.length}`)
}

// ── 5. placement: the overlay lands ON the route, pointing the way you travel ───────────────────
// THREE's scene graph is renderer-free, so the real GpsSystem runs headlessly. This pins the two
// conventions that look fine right up until they are 180° out: rotY maps local +Z onto
// (sin, cos) — the chevron's travel axis — and the arrow hangs at the junction, not at the car.
{
  const mission = {
    segments: [
      seg(straight(300, -300, 0, 1, 0), 0, 300),     // (-300,0) → (0,0), heading +X
      seg(straight(300, 0, 0, 0, 1), 0, 300),        // (0,0)    → (0,300), heading +Z: a RIGHT turn
    ],
  }
  const car = { x: -300, y: 0, z: 0 }
  const gps = new GpsSystem(new THREE.Scene(), { getRoute: () => mission, getCar: () => car })
  gps.update(1 / 60)

  const m = new THREE.Matrix4(), pos = new THREE.Vector3()
  const quat = new THREE.Quaternion(), scl = new THREE.Vector3(), fwd = new THREE.Vector3()
  // Chevrons live on a fixed world lattice (arc = k * CHEV_SPACING), NOT at an offset ahead of
  // the truck. Every visible one must land on a 15 m multiple of route arc — here, x ≡ 0 (mod 15).
  // NB: read the raw basis, not Matrix4.decompose — decompose reports scale (1,1,1) for a
  // degenerate zero-scale matrix, so it cannot tell a hidden instance from a live one.
  const visible = () => {
    const out = []
    for (let i = 0; i < gps._chev.count; i++) {
      gps._chev.getMatrixAt(i, m)
      const e = m.elements
      if (Math.hypot(e[0], e[1], e[2]) < 0.5) continue      // scaled to zero == hidden
      m.decompose(pos, quat, scl)
      out.push({ x: +pos.x.toFixed(3), y: +pos.y.toFixed(3), z: +pos.z.toFixed(3), q: quat.clone() })
    }
    return out
  }
  check('chevrons are shown while a route is live', gps._chev.visible && visible().length > 0)
  const lattice0 = visible()
  check('every chevron sits on the fixed 15 m route lattice',
    lattice0.every(c => Math.abs(((c.x % 15) + 15) % 15) < 0.02),
    JSON.stringify(lattice0.map(c => c.x)))
  check('chevrons hover CHEV_HOVER above the routed surface',
    lattice0.every(c => Math.abs(c.y - 0.35) < 1e-6), `y=${lattice0[0]?.y}`)
  fwd.set(0, 0, 1).applyQuaternion(lattice0[0].q)
  check('chevron local +Z points along travel (rotY convention)',
    Math.abs(fwd.x - 1) < 1e-6 && Math.abs(fwd.z) < 1e-6,
    `local +Z → (${fwd.x.toFixed(3)}, ${fwd.z.toFixed(3)})`)

  // THE point of the lattice: drive 7 m (less than one step) and the chevrons must not have
  // budged. If they track the truck they slide 7 m and this fails.
  car.x = -293
  gps.update(1 / 60)
  const lattice1 = visible()
  const held = lattice0.filter(a => lattice1.some(b => Math.abs(a.x - b.x) < 1e-6))
  check('chevrons are STATIC in world space as the truck advances',
    held.length >= lattice0.length - 1,
    `${held.length}/${lattice0.length} held: ${JSON.stringify(lattice0.map(c => c.x))} → ${JSON.stringify(lattice1.map(c => c.x))}`)
  car.x = -300
  gps.update(1 / 60)

  check('no arrow while the junction is beyond ARROW_IN', !gps._arrow.visible)

  car.x = -40                                        // 40 m short of the junction at (0,0)
  gps.update(1 / 60)
  check('turn arrow raises inside ARROW_IN', gps._arrow.visible)
  // The glyph must bend to the ACTUAL turn, not a fixed 90°: a fixed quarter-turn at a hairpin
  // points into open ground, which is worse guidance than none.
  check('turn arrow uses a RIGHT-turn geometry bent to the real angle (90°)',
    gps._arrowKey === 'right:90', `key=${gps._arrowKey}`)
  {
    const hairpin = { segments: [
      seg(straight(300, -300, 0, 1, 0), 0, 300),
      seg(straight(300, 0, 0, -Math.cos(Math.PI / 6), -Math.sin(Math.PI / 6)), 0, 300),
    ] }
    const g2 = new GpsSystem(new THREE.Scene(), { getRoute: () => hairpin, getCar: () => ({ x: -40, z: 0 }) })
    g2.update(1 / 60)
    check('a 150° hairpin bends the glyph, capped at ARROW_MAX_DEG',
      g2._arrowKey === 'left:150', `key=${g2._arrowKey}`)
    check('each distinct turn angle is built once and cached', g2._arrowGeo.size === 2,
      `${g2._arrowGeo.size} geometries`)
    g2.dispose()
  }
  check('turn arrow hangs over the junction, not the car',
    Math.abs(gps._arrow.position.x) < 1e-6 && Math.abs(gps._arrow.position.z) < 1e-6 &&
    gps._arrow.position.y > 3.8 && gps._arrow.position.y < 4.2,
    `at (${gps._arrow.position.x.toFixed(2)}, ${gps._arrow.position.y.toFixed(2)}, ${gps._arrow.position.z.toFixed(2)})`)
  fwd.set(0, 0, 1).applyQuaternion(gps._arrow.quaternion)
  check('turn arrow tail is aligned with the INCOMING travel direction',
    Math.abs(fwd.x - 1) < 1e-6 && Math.abs(fwd.z) < 1e-6,
    `local +Z → (${fwd.x.toFixed(3)}, ${fwd.z.toFixed(3)})`)

  // Approaching the drop: the destination ring appears; disabling kills the whole overlay.
  car.x = 0; car.z = 200
  gps.update(1 / 60)
  check('destination ring appears on the final approach', gps._ring.visible)
  gps.setEnabled(false)
  gps.update(1 / 60)
  check('setEnabled(false) hides everything and stops updating',
    !gps._chev.visible && !gps._arrow.visible && !gps._ring.visible)
  gps.dispose()
}

console.log(fails === 0 ? '\nPASS gps-route' : `\nFAIL gps-route (${fails})`)
process.exit(fails === 0 ? 0 : 1)
