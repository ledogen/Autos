// test/soak-site.mjs — what stands at a drive-soak capture's site (test/drive-soak.mjs). NOT a gate: a reading aid.
//   1. Across 3 m of the site: the nearest road (run, lateral, arc, inside a bore?), and the raw terrain, the carved
//      (analytic) ground and the road top there.
//   2. Steps in the carved ground within r m: adjacent samples 0.1 m apart that differ by more than 0.15 m — the
//      designed asphalt lip shows as ≤ 0.19 m at ~5 m from a centreline; anything bigger or farther out is a seam
//      (BUG-129's fill-edge cliff read 1.04 m at ~19 m).
//
//   node test/soak-site.mjs <capture.json> [r=4]
import { readFileSync } from 'node:fs'
import { buildWorld } from './lib/world-rig.mjs'
import { RANGER_PARAMS } from '../data/ranger.js'
import { makeVehicleState } from '../src/vehicle-state.js'

const cap = JSON.parse(readFileSync(process.argv[2], 'utf8')), R = +(process.argv[3] ?? 4), D = 0.1
const P = { ...RANGER_PARAMS }
const w = await buildWorld(cap.seed, P, makeVehicleState(P), { radius: cap.radius })
const a = cap.hitAt ?? cap.at
w.stream(a.x, a.z)
const ground = (x, z) => w.terr.analyticHeight(x, z, w.road.carveHint(x, z), a.y)
const near = (x, z, r) => { const nr = w.road.queryNearest(x, z, r); return nr?.point ? { nr, lat: Math.hypot(nr.point.x - x, nr.point.z - z) } : null }

console.log(`seed ${cap.seed} · ${cap.kind} at (${a.x}, ${a.z})`)
for (const dz of [-1.5, -0.5, 0, 0.5, 1.5]) {
  const x = a.x, z = a.z + dz, n = near(x, z, 40), top = w.road.sampleRoadTopY(x, z)
  const bore = n && !!w.road.tunnelSpanAt(n.nr.runKey ?? '', n.nr.arcS ?? 0)
  console.log(`  dz ${dz}: road ${n?.nr.runKey ?? '-'} lat ${n ? n.lat.toFixed(2) : '-'} arcS ${n?.nr.arcS?.toFixed(1) ?? '-'}${bore ? ' IN A BORE' : ''}`
    + ` · raw ${w.terr.rawHeightWorld(x, z).toFixed(2)} ground ${ground(x, z).toFixed(2)} roadTop ${top == null ? '-' : top.toFixed(2)}`)
}

const steps = []
for (let dx = -R; dx <= R; dx += D) for (let dz = -R; dz <= R; dz += D) {
  const x = a.x + dx, z = a.z + dz, h = ground(x, z)
  for (const [ex, ez] of [[D, 0], [0, D]]) {
    const d = ground(x + ex, z + ez) - h
    if (Math.abs(d) > 0.15) steps.push({ x: +x.toFixed(2), z: +z.toFixed(2), along: ex ? 'x' : 'z', d: +d.toFixed(2) })
  }
}
steps.sort((p, q) => Math.abs(q.d) - Math.abs(p.d))
console.log(`  ${steps.length} ground steps > 0.15 m per 0.1 m within ${R} m; the biggest:`)
for (const s of steps.slice(0, 10)) {
  const n = near(s.x, s.z, 40)
  console.log(`    ${JSON.stringify(s)} · ${n ? `${n.lat.toFixed(2)} m from ${n.nr.runKey}` : 'no road within 40 m'}`)
}
w.dispose()
process.exit(0)
