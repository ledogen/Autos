// test/sky-ephemeris.mjs — the sky's clock and its brightness ladder (lighting redesign).
//
// sky.js puts the sun and moon where they really are (37.4° N, 21 June) and reads every natural light
// from one simulated atmosphere through an eye-adaptation curve. The properties that must not drift:
//
//   1. The owner's times: sunrise 05:33, sunset 20:18 (apparent upper limb on the horizon), total
//      darkness from an hour after sunset to an hour before sunrise (nightWeight ≡ 1 there).
//   2. The moon keeps its phase's hours: full rises at sunset and is up all night, first quarter
//      crosses the meridian about six hours after the sun, new moon stays beside the sun.
//   3. The brightness ladder the owner asked for (FEAT-180): noon reads 1, a sunset is mostly
//      compensated, a moonless night is near black (under 1 % of noon), a full moon is dim but more
//      than the new moon (1–5 % of noon), and the LUT is finite and non-negative at every hour.
//
// Pure node: SkySystem gets plain three objects and a stub renderer. The push cost is REPORTED only.
import * as THREE from 'three'
import { SkySystem, sunAt, moonAt, nightWeight, SUNRISE_H, SUNSET_H } from '../src/sky.js'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}
const D = Math.PI / 180
const hm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
// The hour in [a, b] where f changes sign (bisection).
const cross = (f, a, b) => { for (let i = 0; i < 60; i++) { const m = (a + b) / 2; (f(a) * f(m) <= 0) ? b = m : a = m } return (a + b) / 2 }

// 1. Sun.
const limb = (h) => sunAt(h).el + 0.267 * D   // upper limb (semi-diameter 16')
const rise = cross(limb, 4, 7), set = cross(limb, 19, 22)
check(`sunrise ${hm(rise)} ≈ 05:33`, Math.abs(rise - SUNRISE_H) < 0.5 / 60, `${((rise - SUNRISE_H) * 60).toFixed(2)} min off`)
check(`sunset ${hm(set)} ≈ 20:18`, Math.abs(set - SUNSET_H) < 0.5 / 60, `${((set - SUNSET_H) * 60).toFixed(2)} min off`)
const noonEl = sunAt((SUNRISE_H + SUNSET_H) / 2).el / D
check(`noon sun ${noonEl.toFixed(1)}° = 90 − 37.4 + 23.44`, Math.abs(noonEl - 76.04) < 0.1)
check('total darkness 21:18 → 04:33 (nightWeight 1), day at noon (0)',
  nightWeight(SUNSET_H + 1) > 0.999 && nightWeight(SUNRISE_H - 1) > 0.999 && nightWeight(2) > 0.999 && nightWeight(13) === 0,
  `21:18 ${nightWeight(SUNSET_H + 1).toFixed(3)} 04:33 ${nightWeight(SUNRISE_H - 1).toFixed(3)}`)

// 2. Moon.
const moonRise = (cyc) => { let prev = moonAt(0, cyc).el; for (let h = 0.02; h <= 24; h += 0.02) { const e = moonAt(h, cyc).el; if (prev < 0 && e >= 0) return h; prev = e } return null }
const fullRise = moonRise(0.5)
check(`full moon rises ${hm(fullRise)}, within 45 min of sunset, and is up at midnight`,
  Math.abs(fullRise - SUNSET_H) < 0.75 && moonAt(0, 0.5).el > 0)
let peakH = 0, peak = -9
for (let h = 0; h < 24; h += 0.05) { const e = moonAt(h, 0.25).el; if (e > peak) { peak = e; peakH = h } }
check(`first quarter culminates ${hm(peakH)}, ~6 h after the sun`, Math.abs(peakH - 12.925 - 6.2) < 0.8)
const nm = moonAt(12.9, 0.0), sn = sunAt(12.9)
check('new moon beside the sun', Math.abs(nm.el - sn.el) < 5 * D && Math.abs(nm.az - sn.az) < 5 * D)

// 3. Brightness ladder through the real SkySystem.
const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0, 0.003)
const sun = new THREE.DirectionalLight(), sunFar = new THREE.DirectionalLight(), ambient = new THREE.HemisphereLight()
const sky = new SkySystem({ scene, renderer: { toneMapping: 0, toneMappingExposure: 1 }, sun, sunFar, farSplit: 0.6, ambient })
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
// What a white horizontal surface reads (render units, /π like three's Lambert): key + fill.
const white = () => (lum(sun.color) * (sun.intensity + sunFar.intensity) * Math.max(0, sky.sunDirection.y) + lum(ambient.color)) / Math.PI
const lutOk = () => { const d = sky._skyMat.uniforms.skyLut.value.image.data; for (let i = 0; i < d.length; i++) { const v = THREE.DataUtils.fromHalfFloat(d[i]); if (!(v >= 0 && isFinite(v))) return false } return true }
const at = (h, cyc) => { sky.setMoonCycle(cyc); sky.setTimeOfDay(h); return white() }
const noon = at(12.925, 0.25)
const sunsetW = at(SUNSET_H, 0.25)
const newMoon = at(0.5, 0.0), fullMoon = at(0.5, 0.5)
console.log(`  white surface: noon ${noon.toFixed(3)}  sunset ${sunsetW.toFixed(3)}  full moon ${fullMoon.toFixed(4)}  new moon ${newMoon.toFixed(5)}`)
check('noon white surface reads ~1', Math.abs(noon - 1) < 0.25, noon.toFixed(3))
check('sunset mostly compensated (25–70 % of noon)', sunsetW > 0.25 * noon && sunsetW < 0.7 * noon, (sunsetW / noon).toFixed(3))
check('moonless night near black (< 1 % of noon)', newMoon < 0.01 * noon, (newMoon / noon).toFixed(4))
check('full moon dim but brighter than new (1–5 % of noon, > 2× new)', fullMoon > 0.01 * noon && fullMoon < 0.05 * noon && fullMoon > 2 * newMoon,
  (fullMoon / noon).toFixed(4))
let finite = true
for (let h = 0; h < 24; h += 0.25) { sky.setTimeOfDay(h); finite = finite && lutOk() && isFinite(white()) }
check('LUT finite and non-negative at every quarter hour', finite)

const t0 = performance.now(); for (let i = 0; i < 40; i++) sky.setTimeOfDay(4 + i * 0.45)
console.log(`  (report) setTimeOfDay ${((performance.now() - t0) / 40).toFixed(2)} ms per push`)

console.log(fails === 0 ? '\nPASS sky-ephemeris' : `\nFAIL sky-ephemeris (${fails})`)
process.exit(fails === 0 ? 0 : 1)
