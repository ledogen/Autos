/**
 * Gate: BUG-190 — the whip antenna must not stretch when the truck is teleported (new game, load, reset, tow).
 * Steps the real createAntenna, jumps the base 1 km, and asserts the tip stays within its mast length (plus
 * the bend) every frame afterwards and settles back to rest.
 */
import * as THREE from 'three'
import { createAntenna } from '../src/vehicle-model.js'
import { DEFAULT_VEHICLE_MODEL } from '../data/vehicle-models.js'

const a = DEFAULT_VEHICLE_MODEL.antenna
const L = new THREE.Vector3(...a.tip).sub(new THREE.Vector3(...a.base)).length()
const { mesh, step } = createAntenna(a, new THREE.MeshBasicMaterial())
const state = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }
let clock = 0
performance.now = () => clock
const frame = () => { clock += 16; step(state) }
const arr = mesh.geometry.attributes.position.array
const tip = () => { const n = arr.length; return [arr[n - 9], arr[n - 8], arr[n - 7]] }   // a top-cap vertex
let fail = 0
const check = (ok, msg) => { if (!ok) { fail++; console.error('FAIL ' + msg) } }

for (let i = 0; i < 120; i++) { state.position.x += 0.4; frame() }   // cruising
let worst = 0
state.position.set(1000, 0, 1000)                                  // the teleport
for (let i = 0; i < 300; i++) { frame(); worst = Math.max(worst, Math.hypot(...tip())) }
check(worst < 1.3 * L, `tip reached ${worst.toFixed(2)} m with a ${L.toFixed(2)} m mast after a 1 km jump`)
const t = tip()
check(Math.hypot(t[0], t[1] - L, t[2]) < 0.03 + a.radius, `tip not at rest after settling (${t.map(x => x.toFixed(3))})`)
console.log(fail ? 'antenna-teleport: FAIL' : 'antenna-teleport: PASS')
process.exit(fail ? 1 : 0)
