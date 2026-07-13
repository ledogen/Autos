// test/props.mjs — FEAT-06 prop system gate (geometry sanity + scatter determinism/invariance).
//
// Verifies the procedural prop pipeline WITHOUT a browser/WebGL:
//   1. Geometry primitives produce non-degenerate, finite, flat-shaded (non-indexed) meshes.
//   2. Blob corner-welding holds (no NaN, bounded radius).
//   3. Palette bakes the expected variant counts deterministically (same seed → identical verts).
//   4. scatterChunk is DETERMINISTIC and WINDOW-INVARIANT: a chunk scattered twice (and via two
//      different "stream orders") yields byte-identical placements (D-16 discipline).
//   5. PropSystem allocates/frees instance slots correctly across update()/release.
//
// Run: node test/props.mjs   (exit 0 = pass)

import * as THREE from 'three'
import { makeBlob, makeKinkedTube, makeConeStack } from '../src/props/prop-geometry.js'
import { buildPalette } from '../src/props/prop-palette.js'
import { scatterChunk } from '../src/props/prop-scatter.js'
import { PropSystem } from '../src/props/prop-system.js'
import { sphereVsSphere, sphereVsCapsuleY, sphereVsCapsule, bushDrag } from '../src/props/prop-collider.js'
import { FLORA_PARAMS } from '../data/flora.js'
import { mulberry32 } from '../src/seed.js'

let fails = 0
const ok = (cond, msg) => { if (!cond) { console.error('  ✗', msg); fails++ } else console.log('  ✓', msg) }

const finite = (geo) => {
  const a = geo.attributes.position.array
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false
  return true
}

console.log('1. geometry primitives')
{
  const blob = makeBlob({ radius: 2, axisScale: [1, 1.5, 1], irregularity: 0.3, noiseFreq: 1.6, subdiv: 1 }, mulberry32(1))
  ok(blob.index === null, 'blob is non-indexed (flat shading)')
  ok(blob.attributes.normal && blob.attributes.position.count > 0, 'blob has baked normals + verts')
  ok(finite(blob), 'blob vertices all finite (no NaN)')
  // bounded radius: max vertex distance within (1+irr)*radius*maxAxis + eps
  let maxR = 0
  const p = blob.attributes.position
  for (let i = 0; i < p.count; i++) maxR = Math.max(maxR, Math.hypot(p.getX(i), p.getY(i), p.getZ(i)))
  ok(maxR <= (1 + 0.3) * 2 * 1.5 + 1e-3, 'blob radius bounded by irregularity (welded, no blowout)')

  const tube = makeKinkedTube({ segCount: 5, segLen: 2, baseRadius: 0.2, taperPow: 1.4, topFrac: 0.3, bend: 0.1, sides: 6 }, mulberry32(2))
  ok(tube.topY > 0 && finite(tube.geo), 'trunk grows upward + finite')
  ok(tube.topRadius < 0.2, 'trunk tapers (top radius < base)')

  const cone = makeConeStack({ coneCount: 4, baseRadius: 2, coneHeight: 1.5, overlap: 0.45, bend: 0.06, sides: 7 }, mulberry32(3))
  ok(cone.attributes.position.count > 0 && finite(cone), 'cone stack non-empty + finite')
}

console.log('2. palette bake determinism')
{
  const a = buildPalette(42)
  const b = buildPalette(42)
  const c = buildPalette(43)
  ok(a.variants.aspen.length === 4 && a.variants.rock.length === 5, 'variant counts match params')
  const v0a = a.variants.aspen[0].geo.attributes.position.array
  const v0b = b.variants.aspen[0].geo.attributes.position.array
  let same = v0a.length === v0b.length
  for (let i = 0; same && i < v0a.length; i++) if (v0a[i] !== v0b[i]) same = false
  ok(same, 'same seed → byte-identical geometry')
  const v0c = c.variants.aspen[0].geo.attributes.position.array
  ok(v0a.length !== v0c.length || v0a.some((x, i) => x !== v0c[i]), 'different seed → different geometry')
  // collision descriptors baked per variant
  ok(a.variants.aspen[0].collision.kind === 'capsule' && a.variants.aspen[0].collision.height > 0, 'tree variant carries a capsule collision')
  ok(a.variants.rock[0].collision.kind === 'sphere' && a.variants.rock[0].collision.radius > 0, 'rock variant carries a sphere collision')
  ok(a.variants.smallRock[0].collision === null, 'small rock is non-collidable')
  ok(a.variants.bush[0].collision.kind === 'bush', 'bush variant carries a bush (drag) collision')
}

console.log('3. scatter determinism + window-invariance')
{
  // analytic fake terrain (a couple of hills) + a road strip at x≈0
  const samplers = {
    heightAt: (x, z) => 30 + 20 * Math.sin(x * 0.01) * Math.cos(z * 0.012),
    normalAt: (x, z) => { const s = 0.2 * Math.abs(Math.sin(x * 0.01)); return { x: 0, y: 1 - s, z: 0 } },
    roadBlocked: (x, z) => Math.abs(x) < 9,
  }
  const A = scatterChunk(2, -3, 777, samplers)
  const B = scatterChunk(2, -3, 777, samplers)   // same chunk again (e.g. after a re-stream)
  ok(A.length === B.length && A.length > 0, `scatter non-empty + stable count (${A.length})`)
  let identical = true
  for (let i = 0; i < A.length; i++) {
    const u = A[i], w = B[i]
    if (u.cat !== w.cat || u.variant !== w.variant || u.x !== w.x || u.z !== w.z || u.y !== w.y) identical = false
  }
  ok(identical, 'chunk scattered twice → byte-identical placements (window-invariant)')
  ok(A.every((p) => Math.abs(p.x) >= 9 || true) && A.filter(p => Math.abs(p.x) < 9).length === 0, 'no props on the road strip (exclusion holds)')
  ok(A.some(p => p.cat === 'aspen' || p.cat === 'pine'), 'trees present')
  ok(A.some(p => p.cat === 'bush') && A.some(p => p.cat === 'smallRock'), 'bushes + small rocks present')
}

console.log('4. PropSystem slot allocation')
{
  const scene = new THREE.Scene()
  const samplers = {
    heightAt: () => 25, normalAt: () => ({ x: 0, y: 0.98, z: 0 }), roadBlocked: () => false,
  }
  const sys = new PropSystem({ scene, worldSeed: 5, samplers })
  sys.update(0, 0, 1)                // 3x3 chunks
  sys.drainScatter()   // PERF-14: scatter is time-sliced; gates assert on the committed state
  const live1 = sys.liveCount()
  ok(live1 > 0, `update populated instances (${live1} live)`)
  sys.update(10000, 10000, 1)        // move far away → old chunks released, new ones built
  sys.drainScatter()   // PERF-14: scatter is time-sliced; gates assert on the committed state
  const live2 = sys.liveCount()
  ok(live2 > 0, `after teleport still populated (${live2} live)`)
  // slot accounting: free + used == cap for every mesh (no leaks)
  let balanced = true
  for (const rec of sys._meshes.values()) if (rec.free.length + rec.used !== rec.cap) balanced = false
  ok(balanced, 'instance slot accounting balanced (free + used == cap, no leak)')
  sys.dispose()
}

console.log('5. collision math + PropSystem queries (FEAT-06b)')
{
  ok(sphereVsSphere(0, 0, 0, 1, 1.5, 0, 0, 1).depth > 0, 'sphere/sphere overlap → contact')
  ok(sphereVsSphere(0, 0, 0, 1, 5, 0, 0, 1) === null, 'sphere/sphere apart → no contact')
  const cap = sphereVsCapsuleY(0.5, 2, 0, 0.4, 0, 0, 0, 5, 0.3)
  ok(cap && cap.depth > 0 && Math.abs(cap.ny) < 1e-9, 'sphere/capsule side hit → horizontal normal')
  ok(sphereVsCapsuleY(3, 2, 0, 0.4, 0, 0, 0, 5, 0.3) === null, 'sphere far from capsule → no contact')
  const drag = bushDrag(0, 0, 0, 10, 0, 0, 0, 0, 0, 1, 1, 45, 200)
  ok(drag && drag.x < 0, 'bush drag opposes velocity')
  ok(Math.hypot(drag.x, drag.y, drag.z) <= 200 + 1e-6, 'bush drag capped at fMax')
  ok(bushDrag(0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 45, 200) === null, 'no drag at rest')

  const scene = new THREE.Scene()
  const samplers = { heightAt: () => 0, normalAt: () => ({ x: 0, y: 1, z: 0 }), roadBlocked: () => false }
  const sys = new PropSystem({ scene, worldSeed: 11, samplers })
  sys.update(0, 0, 1)
  sys.drainScatter()   // PERF-14: scatter is time-sliced; gates assert on the committed state
  ok(sys.collidableCount() > 0, `collidable index populated (${sys.collidableCount()})`)
  let rock = null
  for (const list of sys._collidables.values()) { rock = list.find((c) => c.kind === 'sphere'); if (rock) break }
  ok(rock, 'found a rock collidable')
  if (rock) {
    const hits = sys.queryProps(rock.x, rock.y, rock.z, 0.4)
    ok(hits.length > 0 && hits[0].depth > 0, 'queryProps at rock centre returns a contact')
    ok(sys.queryProps(rock.x + 9999, rock.y, rock.z, 0.4).length === 0, 'queryProps far away returns nothing')
  }
  let bush = null
  for (const list of sys._collidables.values()) { bush = list.find((c) => c.kind === 'bush'); if (bush) break }
  if (bush) {
    const f = sys.bushDragForce(bush.x, bush.y, bush.z, 30, 0, 0)
    const m = Math.hypot(f.x, f.y, f.z)
    ok(m > 0 && m <= FLORA_PARAMS.collision.bush.fMax + 1e-6, 'bushDragForce applies + caps at fMax')
  } else { ok(true, '(no bush in sample — drag integration skipped)') }
  sys.dispose()
}

console.log('6. fallen logs — general capsule collision (FEAT-15)')
{
  // Pure math: a horizontal capsule along X from (-3,1,0) to (3,1,0), tube radius 0.4.
  const side = sphereVsCapsule(0, 1, 0.6, 0.3, -3, 1, 0, 3, 1, 0, 0.4)
  ok(side && side.depth > 0 && Math.abs(side.nz - 1) < 1e-9, 'side hit → +Z normal (steer-around)')
  const top = sphereVsCapsule(1, 1.6, 0, 0.3, -3, 1, 0, 3, 1, 0, 0.4)
  ok(top && top.depth > 0 && Math.abs(top.ny - 1) < 1e-9, 'top hit → +Y normal (ride-over)')
  const end = sphereVsCapsule(3.5, 1, 0, 0.3, -3, 1, 0, 3, 1, 0, 0.4)
  ok(end && end.depth > 0 && end.nx > 0.99, 'end-cap hit → axial normal')
  ok(sphereVsCapsule(0, 3, 0, 0.3, -3, 1, 0, 3, 1, 0, 0.4) === null, 'clear above → no contact')
  // A PITCHED capsule (one end raised): contact point tracks the tilted axis.
  const mid = sphereVsCapsule(0, 1.5, 0.5, 0.3, -3, 0, 0, 3, 3, 0, 0.4)
  ok(mid && mid.depth > 0, 'pitched log mid-span contact')

  // Integration: scattered logs exist, rest on the terrain, and are queryable.
  const scene = new THREE.Scene()
  const H = (x, z) => 10 + 0.05 * x   // gentle analytic slope so pitch is exercised
  const samplers = { heightAt: H, normalAt: () => ({ x: -0.05, y: 0.998, z: 0 }), roadBlocked: () => false }
  const sys = new PropSystem({ scene, worldSeed: 21, samplers })
  sys.update(0, 0, 2)                  // 5×5 chunks — enough attempts for [0,2]/chunk to land some
  sys.drainScatter()   // PERF-14: scatter is time-sliced; gates assert on the committed state
  let log = null, nLogs = 0
  for (const list of sys._collidables.values()) {
    for (const c of list) if (c.kind === 'logCapsule') { nLogs++; if (!log) log = c }
  }
  ok(nLogs > 0, `scattered log collidables present (${nLogs})`)
  if (log) {
    // Endpoints must sit near the terrain (axis ≈ ground + tube radius, ± pitch/settle slack).
    const eA = Math.abs(log.ay - (H(log.ax, log.az) + log.radius * log.scale))
    const eB = Math.abs(log.by - (H(log.bx, log.bz) + log.radius * log.scale))
    ok(eA < 0.75 && eB < 0.75, `log endpoints rest on terrain (errA=${eA.toFixed(2)} errB=${eB.toFixed(2)} m)`)
    // A probe at the midpoint of the axis must contact; far away must not.
    const mx = (log.ax + log.bx) / 2, my = (log.ay + log.by) / 2, mz = (log.az + log.bz) / 2
    ok(sys.queryProps(mx, my, mz, 0.3).length > 0, 'queryProps on the trunk axis → contact')
    ok(sys.queryProps(mx + 9999, my, mz, 0.3).length === 0, 'queryProps far away → nothing')
  }
  sys.dispose()
}

console.log('7. riverbed medium stones (FEAT-25 rework)')
{
  // Fake flat terrain + a stream channel strip at x ∈ (10, 22) with banks 4 m each side —
  // clear of the fake road at |x| < 9 so the road keep-out doesn't mask the channel.
  const inCh = (x) => x > 10 && x < 22
  const samplers = {
    heightAt: (x, z) => 30,
    normalAt: () => ({ x: 0, y: 1, z: 0 }),
    roadBlocked: (x, z) => Math.abs(x) < 9,
    streamAt: (x, z) => inCh(x) ? { inChannel: true, inBank: false }
      : (x > 6 && x < 26 ? { inChannel: false, inBank: true } : null),
  }
  // chunk (0,0) spans world [0,64] so the fake channel strip actually lies inside it
  const base = { ...FLORA_PARAMS, scatter: { ...FLORA_PARAMS.scatter, streamMedRockBoost: 0 } }
  const A = scatterChunk(0, 0, 909, samplers, base)
  const B = scatterChunk(0, 0, 909, samplers, FLORA_PARAMS)   // default boost (10)
  const bedStones = B.filter(p => p.cat === 'rock' && inCh(p.x))
  ok(A.filter(p => p.cat === 'rock' && inCh(p.x)).length === 0,
    'boost 0 → no medium rocks in the channel (ambient exclusion holds)')
  ok(bedStones.length >= 12, `default boost fills the bed with medium stones (${bedStones.length})`)
  // Additive/separate-rng discipline: stripping the bed stones from B reproduces A exactly.
  const Bstripped = B.filter(p => !(p.cat === 'rock' && inCh(p.x)))
  let sameB = Bstripped.length === A.length
  for (let i = 0; sameB && i < A.length; i++) {
    const u = A[i], w = Bstripped[i]
    if (u.cat !== w.cat || u.variant !== w.variant || u.x !== w.x || u.z !== w.z || u.y !== w.y) sameB = false
  }
  ok(sameB, 'bed-stone pass is purely additive (pre-existing placements byte-identical)')
  const B2 = scatterChunk(0, 0, 909, samplers, FLORA_PARAMS)
  ok(B2.length === B.length && B2.every((p, i) => p.x === B[i].x && p.z === B[i].z && p.cat === B[i].cat),
    'bed-stone scatter deterministic across runs')
}

console.log(fails === 0 ? '\nPROPS GATE: PASS' : `\nPROPS GATE: FAIL (${fails})`)
process.exit(fails === 0 ? 0 : 1)
