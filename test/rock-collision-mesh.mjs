// test/rock-collision-mesh.mjs — BUG-22c gate: boulders collide against their ACTUAL visible mesh.
//
// No sphere proxy fits a lumpy ~20 m boulder — it either overshoots into "air" (the old boundingSphere)
// or sits inside the rock (the mean-bulk proxy). Boulders are rare + low-poly (subdiv 2 = 320 tris), so
// queryProps now tests the vehicle probe vs the boulder's triangles directly (sphereVsMeshInstance).
// This gate locks:
//   (1) boulders carry a triangle-soup collider (kind 'mesh'), not a sphere;
//   (2) a probe grazing the surface contacts with a sane OUTWARD normal + small depth;
//   (3) NO overshoot: a probe just outside the real surface — but inside the enclosing boundingSphere —
//       misses (the exact defect a single sphere could not avoid on a lumpy/flattened boulder);
//   (4) the instance transform (offset + Y-rotation + uniform scale) round-trips correctly.
//
// Run: node test/rock-collision-mesh.mjs   (exit 0 = pass)

import { buildPalette } from '../src/props/prop-palette.js'
import { sphereVsMeshInstance, sphereVsSphere } from '../src/props/prop-collider.js'
import { FLORA_PARAMS } from '../data/flora.js'

let fails = 0
const ok = (cond, msg) => { if (!cond) { console.error('  ✗', msg); fails++ } else console.log('  ✓', msg) }

const P = FLORA_PARAMS
const R_PROBE = 0.4

// Geometry helpers over the triangle soup. bs = boundingSphere radius; support(d) = reach along d;
// outVert = the farthest-from-centre vertex (used as a known ON-SURFACE point + its radial ~ normal).
const meshStats = (tris) => {
  let bs = 0, outVert = [0, 0, 0]
  for (let i = 0; i < tris.length; i += 3) {
    const d = Math.hypot(tris[i], tris[i + 1], tris[i + 2])
    if (d > bs) { bs = d; outVert = [tris[i], tris[i + 1], tris[i + 2]] }
  }
  const support = (dx, dy, dz) => {
    let m = -Infinity
    for (let i = 0; i < tris.length; i += 3) {
      const p = tris[i] * dx + tris[i + 1] * dy + tris[i + 2] * dz; if (p > m) m = p
    }
    return m
  }
  return { bs, support, outVert }
}
const norm3 = (v) => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L] }

console.log('1. boulders carry a mesh collider (triangle soup), not a sphere proxy')
{
  const { variants } = buildPalette(2024, P)
  let allMesh = true, allTris = true, n = 0
  for (const e of variants.boulder) {
    n++
    if (e.collision.kind !== 'mesh') allMesh = false
    const t = e.collision.tris
    if (!(t instanceof Float32Array) || t.length < 9 || t.length % 9 !== 0) allTris = false
  }
  ok(n >= 1, `boulder variants present (${n})`)
  ok(allMesh, "every boulder collision.kind === 'mesh'")
  ok(allTris, 'every boulder carries a non-empty triangle-soup (Float32Array, multiple of 9)')
  // subdiv 2 icosphere = 180 triangles ((detail+1)² per face × 20 faces)
  ok(variants.boulder[0].collision.tris.length === 180 * 9, `tri count = 180 (${variants.boulder[0].collision.tris.length / 9})`)
}

console.log('2. a probe grazing the surface contacts with an outward normal + small depth')
{
  const { variants } = buildPalette(2024, P)
  const tris = variants.boulder[0].collision.tris
  const { outVert } = meshStats(tris)
  const dir = norm3(outVert)                        // radial ≈ outward normal at the outermost vertex
  const rV = Math.hypot(outVert[0], outVert[1], outVert[2])
  // probe centred R_PROBE - 0.1 radially outside that surface vertex → penetration ~0.1
  const q = [dir[0] * (rV + R_PROBE - 0.1), dir[1] * (rV + R_PROBE - 0.1), dir[2] * (rV + R_PROBE - 0.1)]
  const hit = sphereVsMeshInstance(q[0], q[1], q[2], R_PROBE, tris, 0, 0, 0, 0, 1)
  ok(hit !== null, `probe touching the surface contacts (outer vertex at ${rV.toFixed(2)} m)`)
  ok(hit && hit.depth > 0 && hit.depth < 0.25, `contact depth small & positive (${hit ? hit.depth.toFixed(3) : 'none'} m)`)
  ok(hit && (hit.nx * dir[0] + hit.ny * dir[1] + hit.nz * dir[2]) > 0.9, 'contact normal points outward (radial), not launching')
}

console.log('3. NO overshoot: probe outside the real surface but inside the boundingSphere → MISS')
{
  const { variants } = buildPalette(2024, P)
  const tris = variants.boulder[0].collision.tris
  const { bs, support } = meshStats(tris)
  // narrowest of the 6 axes (a flattened boulder is short in y) — where a sphere overshoots most.
  const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]
  let dn = dirs[0], sMin = Infinity
  for (const d of dirs) { const s = support(d[0], d[1], d[2]); if (s < sMin) { sMin = s; dn = d } }
  // probe 0.3 m OUTSIDE the real surface along the narrow axis
  const dist = sMin + R_PROBE + 0.3
  const qx = dn[0] * dist, qy = dn[1] * dist, qz = dn[2] * dist
  const meshHit = sphereVsMeshInstance(qx, qy, qz, R_PROBE, tris, 0, 0, 0, 0, 1)
  const sphereHit = sphereVsSphere(qx, qy, qz, R_PROBE, 0, 0, 0, bs)   // the OLD enclosing-sphere proxy
  ok(sMin + 0.3 < bs, `narrow axis reach ${sMin.toFixed(2)} m << boundingSphere ${bs.toFixed(2)} m (overshoot band exists)`)
  ok(sphereHit !== null, 'old boundingSphere proxy WOULD have contacted here (spurious air-hit)')
  ok(meshHit === null, 'mesh collider correctly reports NO contact 0.3 m outside the real surface')
}

console.log('4. instance transform (offset + Y-rotation + uniform scale) round-trips')
{
  const { variants } = buildPalette(2024, P)
  const tris = variants.boulder[0].collision.tris
  const { outVert } = meshStats(tris)
  const O = [12, -4, -7], rotY = 0.7, scale = 1.5
  const c = Math.cos(rotY), s = Math.sin(rotY)
  // world position + world outward direction of the local outer-surface vertex under Ry(rotY)·scale
  const wvx = c * outVert[0] + s * outVert[2], wvz = -s * outVert[0] + c * outVert[2], wvy = outVert[1]
  const sfx = O[0] + wvx * scale, sfy = O[1] + wvy * scale, sfz = O[2] + wvz * scale
  const wdir = norm3([wvx, wvy, wvz])
  // probe centred R_PROBE - 0.1 outside that world surface point → world penetration ~0.1
  const qx = sfx + wdir[0] * (R_PROBE - 0.1), qy = sfy + wdir[1] * (R_PROBE - 0.1), qz = sfz + wdir[2] * (R_PROBE - 0.1)
  const hit = sphereVsMeshInstance(qx, qy, qz, R_PROBE, tris, O[0], O[1], O[2], rotY, scale)
  ok(hit !== null, 'transformed boulder: probe at the rotated/scaled surface contacts')
  ok(hit && Math.abs(hit.depth - 0.1) < 0.1, `world depth ≈ 0.1 m (${hit ? hit.depth.toFixed(3) : 'none'})`)
  ok(hit && (hit.nx * wdir[0] + hit.ny * wdir[1] + hit.nz * wdir[2]) > 0.85,
    'world contact normal matches the rotated surface direction')
}

console.log(fails === 0 ? '\nROCK-COLLISION-MESH GATE: PASS' : `\nROCK-COLLISION-MESH GATE: FAIL (${fails})`)
process.exit(fails === 0 ? 0 : 1)
