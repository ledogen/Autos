// GATE (BUG-207): the chase camera never snaps in at a tunnel portal. The owner: "every time I drive out of a tunnel it
// quickly snaps in really close to the truck right at the exit". Cause: the boom's terrain test (camera-boom.js) read the
// analytic surface with no query height, which over a bore is the hill above it; at an exit (truck out, camera still in
// the bore) the boom bisected back to the portal face, 6.3–6.5 m in one frame on every portal of seed 717319401. Fix: each
// boom point is tested at its own height (terrain analyticHeight's queryY: the bore floor below the crown).
//
// The real probe (makeBoomProbe, main.js's mask GROUP_STATIC | GROUP_ROAD and ground (x, z, y)) over the real world (world
// rig: road tiles with their bores and portal rings, terrain, props), walked along tunnel spans on random seeds through
// both portals, both ways, at 15 m/s: desired camera = pivot + yaw·(0, 2.5, 6) (camera.js CHASE_OFFSET_LOCAL), pivot 0.9 m
// over the road top, the drawn boom by camera.js's rule (in at once, out eased with tau 0.12 s).
// RULE: honest geometry, no rate limit. Within 40 m of a portal the drawn boom never shortens more than STEP_MAX in one
// frame and never drops under MIN_BOOM.
import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { buildWorld } from './lib/world-rig.mjs'
import { makeBoomProbe } from '../src/camera-boom.js'
import { GROUP_STATIC, GROUP_ROAD } from '../src/physics-engine.js'

const SEEDS = (process.argv.find(a => a.startsWith('--seeds='))?.slice(8).split(',').map(Number)) ?? [717319401, 1489168038, 817490030, 1288525027, 843385398]   // random seeds with tunnels near the origin
const SPANS = 2, V = 15, DT = 1 / 60, OFFSET = 6.5   // m — |CHASE_OFFSET_LOCAL|
const STEP_MAX = 0.5   // m in one frame (the truck moves 0.25 m): anything more is a snap, not the geometry closing in
const MIN_BOOM = 3.0   // m
const NEAR = 40        // m either side of a portal
let fail = 0, runs = 0
let shown5 = 0
const ok = (c, m) => { if (!c) { if (shown5++ < 6) console.log(`  ✗ ${m}`); fail = 1 } }

const P = { ...RANGER_PARAMS }; P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]; P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
const eq = computeStaticEquilibrium(P)
for (const seed of SEEDS) {
  const vs = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), quaternion: new THREE.Quaternion(), angularVelocity: new THREE.Vector3(), strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0], wheelOmega: [0, 0, 0, 0] }
  const w = await buildWorld(seed, P, vs, { radius: 1000 })
  const groundAt = (x, z, y) => w.terr.analyticHeight(x, z, undefined, y)   // main.js's boom ground
  const probe = makeBoomProbe(w.engine, groundAt, GROUP_STATIC | GROUP_ROAD)
  const spans = []
  for (const e of w.road._network.values()) for (const sp of e.tunnelSpans || []) if (e.points.every(q => Math.hypot(q.x, q.z) < 950)) spans.push({ e, sp })
  let worst = 0, low = Infinity
  for (const { e, sp } of spans.slice(0, SPANS)) {
    const pts = e.points, cum = [0]
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z))
    const at = (s) => { let i = 1; while (i < pts.length - 1 && cum[i] < s) i++; const u = Math.max(0, Math.min(1, (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1))); return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u, z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * u } }
    for (const dir of [1, -1]) {
      runs++
      const a = Math.max(0, sp.s0 - NEAR), b = Math.min(cum.at(-1) - 2, sp.s1 + NEAR)
      let shown = 1, prev = null, streamed = -1e9
      for (let d = 0; d <= b - a; d += V * DT) {
        const s = dir > 0 ? a + d : b - d, p = at(s), q = at(s + dir * 2)
        if (d - streamed > 15) { w.stream(p.x, p.z); streamed = d }
        const pivot = { x: p.x, y: (w.road.sampleRoadTopY(p.x, p.z) ?? groundAt(p.x, p.z)) + 0.9, z: p.z }
        const hx = q.x - p.x, hz = q.z - p.z, hl = Math.hypot(hx, hz) || 1
        const raw = probe(pivot, { x: p.x - hx / hl * 6, y: pivot.y + 2.5, z: p.z - hz / hl * 6 })
        shown = raw < shown ? raw : raw - (raw - shown) * Math.exp(-DT / 0.12)
        const nearPortal = Math.min(Math.abs(s - sp.s0), Math.abs(s - sp.s1)) <= NEAR
        if (prev !== null && nearPortal) {
          const step = (prev - shown) * OFFSET
          worst = Math.max(worst, step); low = Math.min(low, shown * OFFSET)
          ok(step <= STEP_MAX, `seed ${seed} span ${sp.s0.toFixed(0)}–${sp.s1.toFixed(0)} ${dir > 0 ? '→' : '←'}: the boom shortened ${step.toFixed(2)} m in one frame at s ${s.toFixed(1)}`)
          ok(shown * OFFSET >= MIN_BOOM, `seed ${seed} span ${sp.s0.toFixed(0)}–${sp.s1.toFixed(0)} ${dir > 0 ? '→' : '←'}: boom ${(shown * OFFSET).toFixed(2)} m at s ${s.toFixed(1)}`)
        }
        prev = shown
      }
    }
  }
  console.log(`  seed ${seed}: ${spans.length} spans in reach, ${Math.min(SPANS, spans.length)} walked both ways · worst one-frame shortening by a portal ${worst.toFixed(2)} m, shortest boom ${low === Infinity ? '—' : low.toFixed(2)} m`)
  ok(spans.length > 0, `seed ${seed} has no tunnel in reach (pick another random seed with one)`)
  w.dispose?.()
}
console.log(fail ? `\nFAIL (${runs} runs)` : `\nPASS (${runs} portal runs, step ≤ ${STEP_MAX} m/frame at ${V} m/s, boom ≥ ${MIN_BOOM} m)`)
process.exit(fail)
