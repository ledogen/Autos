// test/particle-shade.mjs — FEAT-243: dust, smoke and spray born in a hill's shadow take the shade.
//
// sky.js sunVisibility is the CPU horizon test main.js runs at the truck (the terrain is the caster the sun's
// cascades exist for); SkySystem.particleShadeTint turns it into the spawn tint the particles bake into their colour.
// The properties that must not drift:
//   1. Flat ground is fully lit; a wall toward a low sun shades; the same wall behind the point does not;
//      a high sun clears it; across the edge the visibility is continuous and monotone in sun elevation.
//   2. Through the real SkySystem: a sunlit spawn is untinted (tint ≡ 1); a shaded one is darker at noon and at dusk,
//      never brighter in any channel at any hour; with no key light the tint is 1 (nothing to take away).
// Pure node: plain three objects and a stub renderer, as sky-ephemeris.mjs.
import * as THREE from 'three'
import { SkySystem, sunVisibility } from '../src/sky.js'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}
const D = Math.PI / 180
const dirAt = (elDeg, azX = 1) => new THREE.Vector3(azX * Math.cos(elDeg * D), Math.sin(elDeg * D), 0)

// 1. The horizon test. A 30 m wall from x = 40 m on: its top is 31° up from the origin at y = 0.5.
const flat = () => 0
const wall = (x) => (x >= 40 ? 30 : 0)
check('flat ground: fully lit at 5°', sunVisibility(flat, 0, 0.5, 0, dirAt(5)) === 1)
check('wall toward a 10° sun: shaded', sunVisibility(wall, 0, 0.5, 0, dirAt(10)) === 0)
check('wall behind a 10° sun: lit', sunVisibility(wall, 0, 0.5, 0, dirAt(10, -1)) === 1)
check('60° sun clears the wall', sunVisibility(wall, 0, 0.5, 0, dirAt(60)) === 1)
let mono = true, prev = -1, edge = []
for (let el = 20; el <= 45; el += 0.05) {
  const v = sunVisibility(wall, 0, 0.5, 0, dirAt(el))
  if (v < prev - 1e-12) mono = false
  if (v > 0 && v < 1) edge.push(el)
  prev = v
}
check('monotone in sun elevation across the edge', mono)
check(`penumbra is a soft band (${edge.length ? (edge[edge.length - 1] - edge[0]).toFixed(1) : 0}° wide, not a step)`,
  edge.length > 5 && edge[edge.length - 1] - edge[0] < 3)

// 2. The tint, through the real SkySystem.
const scene = new THREE.Scene()
const sun = new THREE.DirectionalLight(), sunFar = new THREE.DirectionalLight(), ambient = new THREE.HemisphereLight()
const sky = new SkySystem({ scene, renderer: { toneMapping: 0, toneMappingExposure: 1 }, sun, sunFar, farSplit: 0.6, ambient })
const tint = new THREE.Color(), mx = (c) => Math.max(c.r, c.g, c.b), mn = (c) => Math.min(c.r, c.g, c.b)
let lit1 = true, never = true
for (let h = 0; h < 24; h += 0.25) {
  sky.setTimeOfDay(h)
  sky.particleShadeTint(1, tint); if (Math.abs(mx(tint) - 1) > 1e-9 || Math.abs(mn(tint) - 1) > 1e-9) lit1 = false
  sky.particleShadeTint(0, tint); if (mx(tint) > 1 + 1e-9) never = false
}
check('sunlit spawn is untinted at every quarter hour', lit1)
check('shaded spawn is never brighter, any channel, any quarter hour', never)
const report = []
for (const h of [12, 18, 19.5, 2]) {
  sky.setTimeOfDay(h); sky.particleShadeTint(0, tint)
  report.push(`${h}h ${tint.r.toFixed(2)}/${tint.g.toFixed(2)}/${tint.b.toFixed(2)}`)
}
sky.setTimeOfDay(12); sky.particleShadeTint(0, tint); const noon = mx(tint)
sky.setTimeOfDay(19.5); sky.particleShadeTint(0, tint); const dusk = mx(tint)
check(`shade darkens at noon (${noon.toFixed(2)}) and at dusk (${dusk.toFixed(2)})`, noon < 0.9 && dusk < 0.9)
sun.intensity = 0; sunFar.intensity = 0; sky.particleShadeTint(0, tint)
check('no key light: tint 1 (nothing to take away)', Math.abs(mn(tint) - 1) < 1e-9)
console.log(`  (report) shade tint r/g/b: ${report.join(' · ')}`)

let n = 0; const hAt = (x, z) => { n++; return wall(x) }
const t0 = performance.now(); for (let i = 0; i < 1000; i++) sunVisibility(hAt, 0, 0.5, 0, dirAt(10 + i % 30))
console.log(`  (report) sunVisibility: ${n / 1000} height samples per test, ${((performance.now() - t0)).toFixed(2)} µs each on a trivial height`)

console.log(fails === 0 ? '\nPASS particle-shade' : `\nFAIL particle-shade (${fails})`)
process.exit(fails === 0 ? 0 : 1)
