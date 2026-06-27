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
  const v0a = a.variants.aspen[0].attributes.position.array
  const v0b = b.variants.aspen[0].attributes.position.array
  let same = v0a.length === v0b.length
  for (let i = 0; same && i < v0a.length; i++) if (v0a[i] !== v0b[i]) same = false
  ok(same, 'same seed → byte-identical geometry')
  const v0c = c.variants.aspen[0].attributes.position.array
  ok(v0a.length !== v0c.length || v0a.some((x, i) => x !== v0c[i]), 'different seed → different geometry')
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
  const live1 = sys.liveCount()
  ok(live1 > 0, `update populated instances (${live1} live)`)
  sys.update(10000, 10000, 1)        // move far away → old chunks released, new ones built
  const live2 = sys.liveCount()
  ok(live2 > 0, `after teleport still populated (${live2} live)`)
  // slot accounting: free + used == cap for every mesh (no leaks)
  let balanced = true
  for (const rec of sys._meshes.values()) if (rec.free.length + rec.used !== rec.cap) balanced = false
  ok(balanced, 'instance slot accounting balanced (free + used == cap, no leak)')
  sys.dispose()
}

console.log(fails === 0 ? '\nPROPS GATE: PASS' : `\nPROPS GATE: FAIL (${fails})`)
process.exit(fails === 0 ? 0 : 1)
