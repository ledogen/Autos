// test/gps-route.mjs — FEAT-39 GPS assist route gate.
//
// The GPS overlay is only ever as honest as its route bake. Three things must not quietly break:
//
//   1. TRAVEL ORDER. mission.js hands GPS segments where s1 < s0 means the edge is driven
//      BACKWARDS, and the first/last edge are partial arc ranges (DESIGN.md "Where missions and
//      POIs live"). Baking in centerline order instead of travel order points every chevron the
//      wrong way down half the route — and it looks fine on any route that happens to run forward.
//   2. WHAT COUNTS AS AN INTERSECTION. Only graph nodes of degree 3+ — places the driver actually
//      has a choice. A degree-2 node is the road bending through, and this network bends HARD at
//      those (QUAL-16 kinks), so no turn-angle threshold can separate the two. Get this wrong and
//      the overlay litters every curve with arrows, which is the failure mode it exists to avoid.
//   3. PROGRESS RE-ACQUISITION. The windowed nearest search must stay monotonic while you drive
//      the route, and must recover the right place after a wrong turn — otherwise a tester who
//      strays once gets chevrons for the rest of the run pointing at a stale index.
//   4. ROUTES THAT DRIVE THE SAME ROAD TWICE (FEAT-61). A point-to-point mission never revisits a
//      road; a paper round does, and lies on top of itself at 0.0 m. Both passes are then equally
//      "nearest", so progress could flip onto the return leg and the chevron lattice ahead drew
//      arrows on the tarmac under the truck pointing the other way.
//
// Pure node: the centerlines here are duck-typed analytic curves, same trick as par-oracle.mjs.
// THREE is imported only for the placement section — its scene graph is renderer-free, so the
// real GpsSystem runs headlessly and the arrow/chevron transforms can be asserted, not eyeballed.
import * as THREE from 'three'
import { GpsSystem, bakeRoute, advanceProgress, sampleRoute, markCoverage } from '../src/gps.js'

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

// ── 2. only REAL intersections raise an arrow ───────────────────────────────────────────────────
{
  // A hard 90° bend at a DEGREE-2 node is the road turning, not a junction. No angle threshold can
  // tell that apart from a T — this network kinks hard at degree-2 nodes (QUAL-16) — so the filter
  // is the node degree that mission.js tags onto each segment.
  const bend = bakeRoute([
    { ...seg(straight(200, -200, 0, 1, 0), 0, 200), endDeg: 2 },
    seg(straight(200, 0, 0, 0, 1), 0, 200),
  ])
  check('a 90° bend at a degree-2 node raises NO arrow', bend.junctions.length === 0,
    `${bend.junctions.length} junctions`)

  const tee = bakeRoute([
    { ...seg(straight(200, -200, 0, 1, 0), 0, 200), endDeg: 3 },
    seg(straight(200, 0, 0, 0, 1), 0, 200),
  ])
  check('the same geometry at a degree-3 node DOES raise one', tee.junctions.length === 1)
  check('the junction records the EXIT direction, not the entry',
    Math.abs(tee.junctions[0].ox) < 1e-9 && Math.abs(tee.junctions[0].oz - 1) < 1e-9,
    `exit=(${tee.junctions[0].ox.toFixed(3)}, ${tee.junctions[0].oz.toFixed(3)})`)

  // A crossroads driven STRAIGHT through is still a decision — you must not turn — so it keeps
  // its arrow. Degree, not angle, is the whole test.
  const cross = bakeRoute([
    { ...seg(straight(200, -200, 0, 1, 0), 0, 200), endDeg: 4 },
    seg(straight(200, 0, 0, 1, 0), 0, 200),
  ])
  check('a straight-through crossroads still raises an arrow', cross.junctions.length === 1)

  // A missing tag must fail LOUD (shown), not silently swallow every arrow.
  const untagged = bakeRoute([
    seg(straight(200, -200, 0, 1, 0), 0, 200),
    seg(straight(200, 0, 0, 0, 1), 0, 200),
  ])
  check('an untagged join defaults to being shown', untagged.junctions.length === 1)
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
  check('junctions land at the right arc positions',
    Math.abs(route.junctions[0].s - 300) < 1e-6 && Math.abs(route.junctions[1].s - 420) < 1e-6,
    route.junctions.map(j => j.s.toFixed(0)).join(' '))

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

// ── 4. elevation: the INJECTED profile wins, gradeAt is only the fallback ───────────────────────
// The defect this pins is the one that made the whole overlay unusable. `seg.gradeAt` is the par
// oracle's sampler — the routed design polyline — and it is NOT the surface the world builds; the
// carve, the ribbon and the physics all read RoadSystem.runProfile().gradeY, a later pipeline
// stage, and on this network the two disagree by a per-run offset of up to 27 m. Baking gradeAt put
// 5.6% of chevrons UNDER the road (depth-tested away: "they disappear") and 7.2% more than a metre
// over it ("floating in the sky"), and left the junction arrow a median 7 m off. So: whatever the
// caller injects is the elevation, gradeAt is used only where the injector declines, and a bake
// that fell back anywhere must SAY so — GpsSystem re-bakes `partial` routes as the network streams.
{
  const slope = (k) => (s) => k * s
  const r = bakeRoute([seg(straight(100, 0, 0, 1, 0), 0, 100, slope(0.1))])
  check('baked Y follows gradeAt when no profile is injected',
    Math.abs(r.py[r.n - 1] - 10) < 1e-6, `end y=${r.py[r.n - 1]}`)
  check('cum is 3-D arc (a 10% climb is longer than its XZ run)',
    r.length > 100 && Math.abs(r.length - Math.hypot(100, 10)) < 1e-6, `len=${r.length}`)
  check('a bake with no injector is not flagged partial', r.partial === false)

  // An injector that answers everywhere must fully override gradeAt — never blend, never average.
  const inj = bakeRoute([seg(straight(100, 0, 0, 1, 0), 0, 100, slope(0.1))], () => 42)
  let allInj = true
  for (let i = 0; i < inj.n; i++) if (inj.py[i] !== 42) allInj = false
  check('an injected profile overrides gradeAt at every vertex', allInj)
  check('a fully-answered bake is not partial', inj.partial === false)

  // ...and one that declines (run not streamed yet) falls back AND raises the flag, or the overlay
  // would silently keep the 27 m-wrong elevation for the far half of every long route.
  const half = bakeRoute([seg(straight(100, 0, 0, 1, 0), 0, 100, slope(0.1))],
    (_s, s) => (s < 50 ? 42 : null))
  check('a declined vertex falls back to gradeAt', Math.abs(half.py[half.n - 1] - 10) < 1e-6,
    `end y=${half.py[half.n - 1]}`)
  check('any fallback flags the bake partial (so it re-bakes as roads stream)', half.partial === true)
}

// ── 4b. chevrons lie in the road plane, not flat in XZ ──────────────────────────────────────────
// Reported defect 1: on a climb the chase cam meets a horizontal glyph almost exactly edge-on — the
// one orientation that hides a shape — so the chevrons thinned to a line just when you needed them.
// sampleRoute carries the span's grade, and _placeChevrons pitches by atan(grade) about local X.
{
  const climb = bakeRoute([seg(straight(100, 0, 0, 1, 0), 0, 100, (s) => 0.2 * s)])
  const p = sampleRoute(climb, 50, 0)
  check('sampleRoute reports the span grade (rise over horizontal run)',
    Math.abs(p.grade - 0.2) < 1e-6, `grade=${p.grade}`)
  const flat = sampleRoute(bakeRoute([seg(straight(100, 0, 0, 1, 0), 0, 100)]), 50, 0)
  check('a level route reports zero grade', Math.abs(flat.grade) < 1e-9, `grade=${flat.grade}`)
  const fall = sampleRoute(bakeRoute([seg(straight(100, 0, 0, 1, 0), 0, 100, (s) => -0.2 * s)]), 50, 0)
  check('grade is signed (a descent is negative)', Math.abs(fall.grade + 0.2) < 1e-6, `grade=${fall.grade}`)
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
  check('on level ground the chevron stays flat (local +Y is world up)',
    Math.abs(new THREE.Vector3(0, 1, 0).applyQuaternion(lattice0[0].q).y - 1) < 1e-6)

  // Reported defect 1: on a climb the glyph must LIE BACK INTO the road, so the chase cam sees the
  // same face of it that it sees of the tarmac instead of meeting it edge-on. Its travel axis takes
  // on the road's slope, and its normal tilts by the same angle out of world-up — no more, or the
  // chevron is standing up like a sign rather than painted on the deck.
  {
    const G = 0.2                                    // a 20% climb, about this network's steepest
    const hill = { segments: [seg(straight(300, -300, 0, 1, 0), 0, 300, (s) => G * s)] }
    const hcar = { x: -300, y: 0, z: 0 }
    const hgps = new GpsSystem(new THREE.Scene(), { getRoute: () => hill, getCar: () => hcar })
    hgps.update(1 / 60)
    let got = null
    for (let i = 0; i < 10 && !got; i++) {
      hgps._chev.getMatrixAt(i, m)
      m.decompose(pos, quat, scl)
      if (pos.y > -1000) got = quat.clone()          // hidden slots are parked at y = -1e4
    }
    const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(got)
    const up   = new THREE.Vector3(0, 1, 0).applyQuaternion(got)
    check('uphill: the chevron travel axis takes on the road grade',
      Math.abs(axis.y / Math.hypot(axis.x, axis.z) - G) < 1e-6,
      `axis rise/run=${(axis.y / Math.hypot(axis.x, axis.z)).toFixed(4)} want ${G}`)
    check('uphill: the chevron tilts UP the hill, not into it (apex end rises)', axis.y > 0)
    check('uphill: the glyph stays in the road plane (normal tilts by exactly the grade angle)',
      Math.abs(Math.acos(Math.min(1, up.y)) - Math.atan(G)) < 1e-6,
      `normal tilt=${Math.acos(Math.min(1, up.y)).toFixed(4)} want ${Math.atan(G).toFixed(4)}`)
  }

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
  check('junction arrow raises inside ARROW_IN', gps._arrow.visible)
  // y: ARROW_HOVER (2.0, owner-set) + the ±0.12 bob. The window is deliberately tight — the arrow
  // sitting at the wrong height was one of the three FEAT-39 defects, so a silent drift here is a
  // regression, not a tuning detail.
  check('junction arrow stands at the junction, not at the car',
    Math.abs(gps._arrow.position.x) < 1e-6 && Math.abs(gps._arrow.position.z) < 1e-6 &&
    gps._arrow.position.y > 1.85 && gps._arrow.position.y < 2.15,
    `at (${gps._arrow.position.x.toFixed(2)}, ${gps._arrow.position.y.toFixed(2)}, ${gps._arrow.position.z.toFixed(2)})`)

  // THE point of the board: its tip aims down the EXIT road (here +Z), and it stands UPRIGHT —
  // local +Y must still be world up, or it lies flat and the driver meets it edge-on again.
  fwd.set(1, 0, 0).applyQuaternion(gps._arrow.quaternion)
  check('arrow tip points down the EXIT road',
    Math.abs(fwd.x) < 1e-6 && Math.abs(fwd.z - 1) < 1e-6,
    `local +X → (${fwd.x.toFixed(3)}, ${fwd.z.toFixed(3)})`)
  fwd.set(0, 1, 0).applyQuaternion(gps._arrow.quaternion)
  check('arrow board stands upright (local +Y is world up)', Math.abs(fwd.y - 1) < 1e-6,
    `local +Y → (${fwd.x.toFixed(3)}, ${fwd.y.toFixed(3)}, ${fwd.z.toFixed(3)})`)
  {
    // Its geometry must live in a vertical plane: zero depth along local Z, real height along Y.
    gps._arrow.geometry.computeBoundingBox()
    const b = gps._arrow.geometry.boundingBox
    check('arrow geometry is a vertical board (flat in local Z, tall in local Y)',
      Math.abs(b.max.z - b.min.z) < 1e-9 && b.max.y - b.min.y > 2 && Math.abs(b.min.y) < 1e-6,
      `size (${(b.max.x - b.min.x).toFixed(1)}, ${(b.max.y - b.min.y).toFixed(1)}, ${(b.max.z - b.min.z).toFixed(1)}), minY=${b.min.y.toFixed(2)}`)
  }

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


// ── OUT AND BACK: a route that drives the same road twice (FEAT-61) ─────────────────────────────
//
// Owner-reported 2026-08-09: approaching the turnaround on a paper round the guidance "shows
// directions in both ways and then reroutes me back towards Larry's house". Measured on seeds 6
// and 90, a tour re-drives 1-6 of its edges and overlaps itself at 0.0 m.
{
  // Out 400 m along +Z, then straight back down the same road. The two passes are the SAME tarmac.
  const road = straight(400, 0, 0, 0, 1)
  const r = bakeRoute([seg(road, 0, 400), seg(road, 400, 0)])
  check('an out-and-back route bakes to its full DRIVEN length', Math.abs(r.length - 800) < 1e-6,
    `got ${r.length}`)

  // 1. COVERAGE IS RECORDED AS AN ARC, not a flag. firstArc[i] is where the route FIRST touches
  //    the ground at vertex i — its own arc on the way out, the outbound arc on the way back.
  let outClean = true, backPointsBack = true
  for (let i = 0; i < r.n; i++) {
    if (r.cum[i] < 400) { if (r.firstArc[i] !== r.cum[i]) outClean = false }
    else if (r.cum[i] > 550) { if (!(r.firstArc[i] < r.cum[i] - 150)) backPointsBack = false }
  }
  check('on the way OUT every vertex is its own first coverage', outClean)
  check('on the way BACK each vertex points at the outbound arc that covered it first', backPointsBack)

  // …and a route that never revisits must record nothing, or the suppression would eat an
  // ordinary mission's chevrons.
  const ra = straight(200, -200, 0, 1, 0), rb = straight(200, 0, 0, 0, 1)
  const plain = bakeRoute([seg(ra, 0, 200), seg(rb, 0, 200)])
  let plainClean = true
  for (let i = 0; i < plain.n; i++) if (plain.firstArc[i] !== plain.cum[i]) plainClean = false
  check('a route that never doubles back records no earlier coverage', plainClean)
  check('markCoverage is exported and agrees with the bake',
    [...markCoverage(r)].join(',') === [...r.firstArc].join(','))

  // THE REGRESSION THIS SECTION EXISTS FOR (owner, 2026-08-09: "turned me around and ended right
  // here"). Suppression must depend on WHERE THE TRUCK IS, not on which pass a vertex belongs to.
  // Driving OUT, the far chevrons that land on the return leg are ghosts and must be hidden.
  // Driving BACK, that same tarmac is the live pass and must be drawn — the first version keyed on
  // second-pass-ness alone and blanked every chevron for the rest of the round.
  const ghost = (sc, carS) => {
    const p = sampleRoute(r, sc, 0)
    const fa = r.firstArc[p.idx]
    return fa < sc - 150 && fa >= carS - 10
  }
  check('driving OUT at 100 m, a chevron 700 m along (on the return leg) is a ghost',
    ghost(700, 100))
  check('…while a chevron 200 m along (still outbound) is not', !ghost(200, 100))
  check('driving BACK at 600 m, the chevrons ahead of you are DRAWN, not suppressed',
    !ghost(650, 600) && !ghost(700, 600) && !ghost(780, 600))

  // 2. PROGRESS STAYS ON THE OUTBOUND PASS. Drive out and watch `s`: it must climb monotonically
  //    and never jump onto the return leg, which is 0.0 m away and equally "nearest".
  let idx = 0, prev = -1, monotone = true, jumped = false
  for (let z = 0; z <= 380; z += 4) {
    const p = advanceProgress(r, 0, z, idx)
    idx = p.idx
    if (p.s < prev - 1e-6) monotone = false
    if (p.s > 400) jumped = true            // snapped onto the way back while still driving out
    prev = p.s
  }
  check('driving OUT, progress never snaps onto the return pass', !jumped, `s reached ${prev}`)
  check('…and arc progress is monotonic the whole way', monotone)

  // 3. …AND A GENUINE RE-ACQUISITION STILL WORKS: the margin on the full-scan fallback must not
  //    cost a truck that is picked up somewhere unexpected its route.
  const far = advanceProgress(r, 0, 390, 0)
  check('a truck picked up far along the route still re-acquires', far.lat < 5,
    `lat ${far.lat.toFixed(1)} m`)
}

console.log(fails === 0 ? '\nPASS gps-route' : `\nFAIL gps-route (${fails})`)
process.exit(fails === 0 ? 0 : 1)
