// test/particle-shade.mjs — FEAT-243: dust, smoke and spray in a hill's shadow take the shade.
//
// The particle shaders look the shade up in the sun's far shadow map (dust.js SUN_SHADE_VERT, GPU only; the boot smoke
// compiles them) and mix the light from SkySystem.particleShadeTint (full shade: fill only) to 1 (sun). This pins the
// tint, through the real SkySystem: a shaded puff is darker at noon and at dusk, never brighter in any channel at any
// hour; with no key light the tint is 1 (nothing to take away).
// Pure node: plain three objects and a stub renderer, as sky-ephemeris.mjs.
import * as THREE from 'three'
import { SkySystem } from '../src/sky.js'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}

const scene = new THREE.Scene()
const sun = new THREE.DirectionalLight(), sunFar = new THREE.DirectionalLight(), ambient = new THREE.HemisphereLight()
const sky = new SkySystem({ scene, renderer: { toneMapping: 0, toneMappingExposure: 1 }, sun, sunFar, farSplit: 0.6, ambient })
const tint = new THREE.Color(), mx = (c) => Math.max(c.r, c.g, c.b), mn = (c) => Math.min(c.r, c.g, c.b)
let never = true
for (let h = 0; h < 24; h += 0.25) {
  sky.setTimeOfDay(h)
  sky.particleShadeTint(tint); if (mx(tint) > 1 + 1e-9) never = false
}
check('shaded puff is never brighter, any channel, any quarter hour', never)
const report = []
for (const h of [12, 18, 19.5, 2]) {
  sky.setTimeOfDay(h); sky.particleShadeTint(tint)
  report.push(`${h}h ${tint.r.toFixed(2)}/${tint.g.toFixed(2)}/${tint.b.toFixed(2)}`)
}
sky.setTimeOfDay(12); sky.particleShadeTint(tint); const noon = mx(tint)
sky.setTimeOfDay(19.5); sky.particleShadeTint(tint); const dusk = mx(tint)
check(`shade darkens at noon (${noon.toFixed(2)}) and at dusk (${dusk.toFixed(2)})`, noon < 0.9 && dusk < 0.9)
sun.intensity = 0; sunFar.intensity = 0; sky.particleShadeTint(tint)
check('no key light: tint 1 (nothing to take away)', Math.abs(mn(tint) - 1) < 1e-9)
console.log(`  (report) shade tint r/g/b: ${report.join(' · ')}`)

console.log(fails === 0 ? '\nPASS particle-shade' : `\nFAIL particle-shade (${fails})`)
process.exit(fails === 0 ? 0 : 1)
