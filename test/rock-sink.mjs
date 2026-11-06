// test/rock-sink.mjs — BUG-54 follow-up (owner, 2026-11-06 "go"): every rock is sunk by its OWN variant's radius.
//
// prop-scatter.js placeBlob sank every rock by the LARGEST radius in its category's range, so a small variant sat
// as if it were up to ~3.5× its size: deep where the bury draw was over half, lifted clear where it was under —
// measured on real terrain (5 seeds × 25 chunks, wip/bug-54-sink/floatprobe.mjs) that floated 1 rock and 5 small
// rocks and left 207 small rocks touching the ground by less than 2 cm. The palette knows each variant's drawn
// radius; the scatter can't replay its rng, so PropSystem hands them over on the samplers (prop-palette.js blobRadii).
//   1. PropSystem passes the palette's radii to the scatter.
//   2. Each rock's height: (y − ground) / (its own radius × axis-y × scale) lies in 0.5 − its category's bury range.
//      With the nominal radius (the old sink) a small variant leaves that range — the check has teeth.
//   3. Posed as prop-system.js draws it (yaw, tilt, scale), no rock floats (its lowest point above the ground) and
//      none is out of sight, on flat ground, 45° and 60° (rocks have no slope limit; they favour steep ground).
//   4. Bushes keep their category sink (only rocks were ruled).
// Rock colliders are built from the same placement record (y, scale, rotY) and the same variant triangles
// (terrain-physics.js PropPhysics), so MESH == PHYSICS moves with it by construction.
//
// Pure node: three, the real palette and scatter, analytic planes.
import * as THREE from 'three'
import { PropSystem } from '../src/props/prop-system.js'
import { scatterChunk } from '../src/props/prop-scatter.js'
import { buildPalette, blobRadii } from '../src/props/prop-palette.js'
import { FLORA_PARAMS as F } from '../data/flora.js'

let fails = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fails++ }
const SEED = 7, ROCKS = ['rock', 'boulder', 'medRock', 'smallRock']
const pal = buildPalette(SEED).variants, radii = blobRadii(pal)

console.log('§1 PropSystem hands the palette\'s radii to the scatter')
{
  const sys = new PropSystem({ scene: new THREE.Scene(), worldSeed: SEED, samplers: { heightAt: () => 0, normalAt: () => ({ x: 0, y: 1, z: 0 }), roadBlocked: () => false } })
  ok(JSON.stringify(sys._samplers.blobRadius) === JSON.stringify(radii) && ROCKS.every(c => radii[c]?.length === F[c].variants) && !radii.bush,
    `rock, boulder, medium and small rock radii, one per variant (rocks ${radii.rock.map(r => r.toFixed(2)).join(' ')} m; the old sink used ${F.rock.blob.radius[1]} for all)`)
}

/** A plane of grade `g` (rise per metre along +x) and its unit normal. */
const plane = (g) => { const k = Math.hypot(g, 1); return { heightAt: (x) => g * x, normalAt: () => ({ x: -g / k, y: 1 / k, z: 0 }), roadBlocked: () => false } }
const v = new THREE.Vector3(), q = new THREE.Quaternion(), qt = new THREE.Quaternion(), m = new THREE.Matrix4(), e = new THREE.Euler(), ax = new THREE.Vector3()
const scatter = (s) => { const out = []; for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) out.push(...scatterChunk(cx, cz, SEED, s)); return out }

console.log('§2 each rock sits by its own size')
{
  const flat = plane(0)
  const rel = (pls, own) => pls.filter(p => ROCKS.includes(p.cat)).every(p => {
    const b = F[p.cat], r = own ? radii[p.cat][p.variant] : b.blob.radius[1]
    const k = (p.y - p.gy) / (r * b.blob.axisScale[1] * p.scale)
    return k >= 0.5 - b.buryFrac[1] - 1e-9 && k <= 0.5 - b.buryFrac[0] + 1e-9
  })
  const now = scatter({ ...flat, blobRadius: radii }), old = scatter(flat)
  ok(rel(now, true), `${now.filter(p => ROCKS.includes(p.cat)).length} rocks: (y − ground) / (own radius × axis-y × scale) within 0.5 − bury`)
  ok(!rel(old, true), '…the old nominal-radius sink leaves that range for a small variant')
  const bush = (pls) => pls.filter(p => p.cat === 'bush').map(p => p.y)
  ok(bush(now).length > 0 && JSON.stringify(bush(now)) === JSON.stringify(bush(old)), `bushes unchanged (${bush(now).length})`)
}

console.log('§3 posed as drawn, no rock floats and none is out of sight')
for (const [g, label] of [[0, 'flat'], [1, '45°'], [Math.sqrt(3), '60°']]) {
  const s = plane(g), k = Math.hypot(g, 1)
  let n = 0, floats = 0, hidden = 0, worst = -Infinity
  for (const p of scatter({ ...s, blobRadius: radii })) {
    if (!ROCKS.includes(p.cat)) continue
    const a = pal[p.cat][p.variant].geo.attributes.position
    e.set(0, p.rotY, 0); q.setFromEuler(e)
    if (p.tilt) { ax.set(Math.cos(p.tiltAz), 0, Math.sin(p.tiltAz)); qt.setFromAxisAngle(ax, p.tilt); q.multiply(qt) }
    m.compose(v.set(p.x, p.y, p.z), q, new THREE.Vector3().setScalar(p.scale))
    let lo = Infinity, hi = -Infinity
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i).applyMatrix4(m)
      const d = (v.y - g * v.x) / k   // signed distance to the plane
      lo = Math.min(lo, d); hi = Math.max(hi, d)
    }
    n++; if (lo > 0) floats++; if (hi < 0) hidden++; worst = Math.max(worst, lo)
  }
  ok(n > 0 && !floats && !hidden, `${label}: ${n} rocks, none floating (the shallowest is ${(-worst * 100).toFixed(1)} cm into the ground), none out of sight`)
}

console.log(fails ? `\n${fails} FAILED` : '\nrock-sink: ALL OK')
process.exit(fails ? 1 : 0)
