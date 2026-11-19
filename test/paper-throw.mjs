// GATE (FEAT-277): a thrown paper is an engine body on the debris path and scores where it comes to REST.
//
// Owner 2026-11-17: "throw the paper at the wall of a house or the front door and have it fall down into the circle …
// detect when the paper has come to rest for more than a quarter second, and then count the shot scored where it lies
// … almost no rebound … very high friction … prevent it from rolling". Built on the real DebrisSystem and the real
// throw.js PaperThrows (main.js calls the same two, once per physics step, after the engine step):
//   (1) DETERMINISTIC — the same throw in two fresh worlds rests at bit-identical poses on the same step;
//   (2) SCORED AT REST, NOT AT FIRST CONTACT — the rest event comes > restS after the first touch, every step of that
//       last restS is under the speed and spin thresholds, and the rest point is where the body is;
//   (3) A WALL STOPS IT DEAD — broadside into a house wall, it drops within 1 m of the wall onto the ground;
//   (4) ON A ROOF it rests on the roof and is scored there (the owner's "it can land on top of the POI");
//   (5) IT DOES NOT ROLL — set down across a 20° bank it moves < 0.1 m; thrown onto flat grass from a truck at
//       0–15 m/s it slides ≤ 2 m from where it first touched;
//   (6) A PAPER THAT NEVER RESTS (off a cliff) is settled at maxFlightS, flagged timedOut, its body gone;
//   (7) BOUNDED — twelve throws in a burst never hold more than liveCap bodies, and once all rest none is left.
// Cost per live paper per step is REPORT-only (wall clock).
//
// Run: node test/paper-throw.mjs

import fs from 'node:fs'
import * as THREE from 'three'
// model-service loads GLBs by relative URL: hand it the shipped file as a data: URL. The news roll carries a texture
// GLTFLoader cannot decode headless, so its mesh falls back to the pink cube (one warning, dropped here); its COLLIDER
// is the authored throw.js paperHull and does not come from the mesh, so the physics under test is the shipped one.
globalThis.ProgressEvent ??= class extends Event { constructor (t, o = {}) { super(t); Object.assign(this, o) } }
THREE.DefaultLoadingManager.setURLModifier(u => u.startsWith('data:') ? u
  : 'data:application/octet-stream;base64,' + fs.readFileSync(new URL('../' + u, import.meta.url)).toString('base64'))
const _warn = console.warn
console.warn = (...a) => { if (!String(a[0]).includes("'newsRoll' GLB load failed")) _warn(...a) }
const { createPhysicsEngine } = await import('../src/physics-engine.js')
const { DebrisSystem } = await import('../src/debris.js')
const { THROW_PARAMS: P, PaperThrows, launchVelocity } = await import('../src/throw.js')

const DT = 1 / 60
let fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }
const f2 = (v) => v.toFixed(2)

/** A world: a heightfield `groundFn` (grass μ 0.8, as terrain-physics.js) and optional static boxes (POI μ 0.8, e 0). */
async function world (groundFn, boxes = []) {
  const engine = await createPhysicsEngine()
  if (groundFn) {
    const N = 129, cell = 0.5, ext = 32, h = new Float32Array(N * N)
    for (let zi = 0; zi < N; zi++) for (let xi = 0; xi < N; xi++) h[zi * N + xi] = groundFn(-ext + xi * cell, -ext + zi * cell)
    engine.addHeightfield(engine.createBody({ type: 'static', position: { x: -ext, y: 0, z: -ext } }), h, N, N, cell, { friction: 0.8 })
  }
  for (const b of boxes) engine.addBox(engine.createBody({ type: 'static', position: b.c }), b.h, { friction: 0.8, restitution: 0 })
  const debris = new DebrisSystem(engine, { add () {}, remove () {} })
  await debris.load('paper')
  return { engine, debris, pt: new PaperThrows(debris) }
}

/** Step until every paper rests (or `maxS`); returns the events in order, each stamped with its step. */
function run (w, maxS = 12, each = null) {
  const out = []
  for (let i = 0; i < maxS / DT && (w.pt.live.length || i === 0); i++) {
    w.debris.beforeStep(null, null)
    w.engine.step(DT, 4)
    for (const e of w.pt.step(DT)) out.push({ ...e, step: i })
    each?.(i)
  }
  return out
}
const side = (pitchDeg, u = 0) => {
  const r = pitchDeg * Math.PI / 180
  return launchVelocity({ x: Math.cos(r), y: Math.sin(r), z: 0 }, { x: 0, y: 0, z: -u })
}
const P0 = { x: 0, y: 2.1, z: 0 }   // above the cab: main.js launches at the truck's origin + 1.5 m, origin ~0.6 m up

// ── (1) determinism ──────────────────────────────────────────────────────────────────────────────────────────────
console.log('(1) the same throw rests at the same pose:')
{
  const poses = []
  for (let k = 0; k < 2; k++) {
    const w = await world(() => 0)
    w.pt.throw(P0, side(8, 10))
    const r = run(w).find(e => e.type === 'rest')
    const q = r.mesh.quaternion
    poses.push([r.step, r.x, r.y, r.z, q.x, q.y, q.z, q.w])
    w.engine.dispose()
  }
  ok(JSON.stringify(poses[0]) === JSON.stringify(poses[1]), `two fresh worlds: step ${poses[0][0]}, (${poses[0].slice(1, 4).map(f2).join(', ')}) both times, bit-identical`)
}

// ── (2) scored at rest, not at first contact ─────────────────────────────────────────────────────────────────────
console.log('(2) scored at rest, not at the first touch:')
{
  const w = await world(() => 0)
  const f = w.pt.throw(P0, side(5, 15))
  let contactAt = null
  const lin = {}, ang = {}, still = []
  const ev = run(w, 12, () => {
    if (!w.pt.live.includes(f)) return
    if (contactAt == null && f.contactT != null) { const p = new THREE.Vector3(); w.engine.getTransform(f.body, p, new THREE.Quaternion()); contactAt = p }
    w.engine.getVelocity(f.body, lin, ang)
    still.push(Math.hypot(lin.x, lin.y, lin.z) < P.restV && Math.hypot(ang.x, ang.y, ang.z) < P.restW)
  })
  const c = ev.find(e => e.type === 'contact'), r = ev.find(e => e.type === 'rest')
  ok(c && r && c.step < r.step, `one contact event (step ${c?.step}) BEFORE the rest event (step ${r?.step})`)
  ok(r && r.f.t - r.f.contactT > P.restS, `rest comes ${f2(r.f.t - r.f.contactT)} s after the first touch (> restS ${P.restS} s)`)
  const need = Math.ceil(P.restS / DT)
  ok(still.length >= need && still.slice(-need).every(Boolean), `the last ${need} steps before rest were all under ${P.restV} m/s and ${P.restW} rad/s`)
  const moved = Math.hypot(r.x - contactAt.x, r.z - contactAt.z)
  ok(moved > 0.05 && !r.timedOut, `it slid ${f2(moved)} m after the first touch and the score is taken where it STOPPED, not where it touched`)
  w.engine.dispose()
}

// ── (3) a wall stops it dead ─────────────────────────────────────────────────────────────────────────────────────
console.log('(3) broadside into a house wall at x = 8 m, it drops at the wall:')
for (const [pitch, u] of [[0, 0], [10, 0], [20, 0], [0, 8], [10, 8], [20, 8]]) {
  const w = await world(() => 0, [{ c: { x: 8.5, y: 3, z: 0 }, h: { x: 0.5, y: 3, z: 12 } }])
  w.pt.throw(P0, side(pitch, u))
  const ev = run(w)
  const c = ev.find(e => e.type === 'contact'), r = ev.find(e => e.type === 'rest')
  ok(8 - r.x < 1.0 && r.y < 0.3 && !r.timedOut, `pitch ${pitch}° truck ${u} m/s: rests ${f2(8 - r.x)} m off the wall, on the ground (centre y ${f2(r.y)} m)${c ? '' : ' — no contact event'}`)
  w.engine.dispose()
}

// ── (4) on a roof ────────────────────────────────────────────────────────────────────────────────────────────────
console.log('(4) dropped onto a flat 3 m roof, it rests up there:')
{
  const w = await world(() => 0, [{ c: { x: 6, y: 1.5, z: 0 }, h: { x: 3, y: 1.5, z: 3 } }])
  w.pt.throw({ x: 6, y: 5, z: 0 }, { x: 1, y: 0, z: 0 })
  const r = run(w).find(e => e.type === 'rest')
  ok(r && Math.abs(r.y - 3.07) < 0.1 && Math.abs(r.x - 6) < 3 && !r.timedOut, `rests at y ${f2(r.y)} m (the roof is 3 m) and is scored there, (${f2(r.x)}, ${f2(r.z)})`)
  w.engine.dispose()
}

// ── (5) it does not roll ─────────────────────────────────────────────────────────────────────────────────────────
console.log('(5) no rolling:')
for (const deg of [10, 20]) {
  const tg = Math.tan(deg * Math.PI / 180)
  const w = await world((x) => -tg * x)
  w.pt.throw({ x: 0, y: 0.1, z: 0 }, { x: 0, y: 0, z: 0 })   // long axis across the fall line: the way it rolls
  const r = run(w).find(e => e.type === 'rest')
  ok(Math.hypot(r.x, r.z) < 0.1 && !r.timedOut, `set down across a ${deg}° bank, it moves ${f2(Math.hypot(r.x, r.z))} m`)
  w.engine.dispose()
}
{
  const slides = []
  for (const u of [0, 5, 10, 15]) for (const pitch of [5, 15, 30]) {
    const w = await world(() => 0)
    const f = w.pt.throw(P0, side(pitch, u))
    let c = null
    const r = run(w, 12, () => { if (!c && f.contactT != null && w.pt.live.includes(f)) { c = new THREE.Vector3(); w.engine.getTransform(f.body, c, new THREE.Quaternion()) } }).find(e => e.type === 'rest')
    slides.push(Math.hypot(r.x - c.x, r.z - c.z))
    w.engine.dispose()
  }
  const mx = Math.max(...slides), mean = slides.reduce((a, b) => a + b, 0) / slides.length
  ok(mx <= 2, `thrown onto flat grass (truck 0–15 m/s, pitch 5–30°): slide after the first touch mean ${f2(mean)} m, worst ${f2(mx)} m (≤ 2 m)`)
}

// ── (6) never rests: timeout ─────────────────────────────────────────────────────────────────────────────────────
console.log('(6) off a cliff (no ground at all):')
{
  const w = await world(null)
  const f = w.pt.throw(P0, side(10))
  const r = run(w, 20).find(e => e.type === 'rest')
  ok(r && r.timedOut && Math.abs(r.f.t - P.maxFlightS) < DT * 1.5, `settled at ${f2(r.f.t)} s (maxFlightS ${P.maxFlightS}), flagged timedOut`)
  ok(w.debris.count === 0 && !w.pt.live.includes(f), 'its body is gone')
  w.engine.dispose()
}

// ── (7) bounded body count + cost ────────────────────────────────────────────────────────────────────────────────
console.log('(7) twelve throws in a burst:')
{
  const w = await world(() => 0)
  let peak = 0, rests = 0, ms = 0, paperSteps = 0
  for (let i = 0; i < 12; i++) {
    w.pt.throw({ x: 0, y: 2.1, z: i * 0.5 }, side(25))
    peak = Math.max(peak, w.debris.count)
    w.debris.beforeStep(null, null); w.engine.step(DT, 4)
    rests += w.pt.step(DT).filter(e => e.type === 'rest').length
  }
  const ev = run(w, 12, () => { peak = Math.max(peak, w.debris.count) })
  rests += ev.filter(e => e.type === 'rest').length
  ok(peak <= P.liveCap, `peak live bodies ${peak} (liveCap ${P.liveCap})`)
  ok(rests === 12 && w.debris.count === 0, `all 12 settled (${rests}); bodies left ${w.debris.count}`)
  // Cost: 8 papers in the air and settling vs an empty world, same steps.
  const timeIt = async (n) => {
    const w2 = await world(() => 0)
    for (let i = 0; i < n; i++) w2.pt.throw({ x: 0, y: 2.1, z: i * 1.5 }, side(25))
    const t0 = performance.now(); let s = 0
    for (; s < 90; s++) { w2.debris.beforeStep(null, null); w2.engine.step(DT, 4); w2.pt.step(DT) }
    const t = (performance.now() - t0) / s
    w2.engine.dispose()
    return t
  }
  const t0 = await timeIt(0), t8 = await timeIt(8)
  ms = (t8 - t0) / 8; paperSteps = 90
  console.log(`  · report: ${(ms * 1000).toFixed(1)} µs per live paper per step (engine + drag + rest clock; ${paperSteps} steps, 8 papers vs none, wall clock)`)
  w.engine.dispose()
}

console.log(fail ? '\nPAPER-THROW: FAIL' : '\nPAPER-THROW: ALL CHECKS PASSED')
process.exit(fail)
