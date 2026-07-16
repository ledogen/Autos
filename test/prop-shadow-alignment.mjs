// test/prop-shadow-alignment.mjs — PERF-07 baked-shadow alignment gate.
//
// The bake camera (prop-shadow-bake.js makeBakeCamera) renders each chunk's prop silhouettes into
// its atlas tile; the terrain fragment shader samples that tile back by pure world-XZ arithmetic
// (terrain.js: sh_tile = mod(floor(xz/64), N), sh_in = fract(xz/64)). The two mappings MUST agree
// per axis or every tile is mirrored and shadows detach from their casters — this shipped TWICE
// (X-mirror at first ship, then Z-mirror after a both-axes "fix", 9615b6e/5555890) because
// alignment was judged from screenshots. This gate makes it arithmetic:
//
//   1. AXIS/UV: project world points through the real camera (position+lookAt exactly as
//      ShadowBakeSystem.update does) and assert NDC→tile-UV equals the shader's fract(xz/CHUNK),
//      including points in negative-coordinate chunks.
//   2. SHEAR: the vertex-shader ground offset per metre of height (uShearXZ = -sunDir.xz/|sunDir.y|,
//      setSun) must land a point's silhouette exactly where the sun ray through that point hits the
//      ground — i.e. where the realtime shadow map would put it.
//   3. TILE: the toroidal tile index (pmod) matches the shader's mod(floor(...), N) for negative
//      chunks, and the live prop ring diameter fits inside ATLAS_N (no tile collisions).
//
// Pure node — no renderer; the camera frustum/view matrices are plain Three.js math.
import * as THREE from 'three'
import { makeBakeCamera, shearFromSun, shadowShearScale, ATLAS_N } from '../src/props/prop-shadow-bake.js'

const CHUNK = 64
let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}

// ── 1. AXIS/UV agreement: bake projection vs terrain-shader sampler ─────────────────────────────
const cam = makeBakeCamera(CHUNK)
const frac = (x) => ((x % 1) + 1) % 1
const sampleUV = (wx, wz) => ({ u: frac(wx / CHUNK), v: frac(wz / CHUNK) })
const bakeUV = (cx, cz, wx, wz) => {
  const wcx = cx * CHUNK + CHUNK / 2, wcz = cz * CHUNK + CHUNK / 2
  cam.position.set(wcx, 2000, wcz)
  cam.lookAt(wcx, 0, wcz)
  cam.updateMatrixWorld(true)
  const p = new THREE.Vector3(wx, 0, wz).project(cam)
  return { u: (p.x + 1) / 2, v: (p.y + 1) / 2 }   // NDC → in-tile UV (viewport = the chunk's tile)
}
// Off-centre points in a positive and a negative chunk — mirrors survive centre points, not these.
const PTS = [
  [0, 0, 10, 10], [0, 0, 10, 50], [0, 0, 50, 10], [0, 0, 32, 5],
  [-3, -2, -3 * CHUNK + 7, -2 * CHUNK + 55], [-1, 4, -CHUNK + 60, 4 * CHUNK + 3],
]
for (const [cx, cz, wx, wz] of PTS) {
  const s = sampleUV(wx, wz), b = bakeUV(cx, cz, wx, wz)
  const du = Math.abs(s.u - b.u), dv = Math.abs(s.v - b.v)
  check(`axis/UV chunk(${cx},${cz}) world(${wx},${wz})`, du < 1e-9 && dv < 1e-9,
    `sampler(${s.u.toFixed(4)},${s.v.toFixed(4)}) != bake(${b.u.toFixed(4)},${b.v.toFixed(4)})`)
}

// ── 2. SHEAR matches sun-ray ground intersection (what the realtime shadow map computes) ────────
// setSun: shear = -sunDir.xz / max(|sunDir.y|, 0.05). Vertex shader: ground = p.xz + h*shear.
// Ground truth: ray P - t*sunDir hits y=base at t = h/sunDir.y → xz = P.xz - h*sunDir.xz/sunDir.y.
for (const sun of [new THREE.Vector3(0.4, 0.8, 0.2), new THREE.Vector3(-0.3, 0.6, 0.7)]) {
  sun.normalize()
  const shear = new THREE.Vector2(-sun.x / Math.max(Math.abs(sun.y), 0.05),
                                  -sun.z / Math.max(Math.abs(sun.y), 0.05))
  const P = new THREE.Vector3(12.3, 6.5, -4.2), base = 1.5, h = P.y - base
  const shaderXZ = new THREE.Vector2(P.x + h * shear.x, P.z + h * shear.y)
  const t = h / sun.y
  const rayXZ = new THREE.Vector2(P.x - t * sun.x, P.z - t * sun.z)
  check(`shear sun(${sun.x.toFixed(2)},${sun.y.toFixed(2)},${sun.z.toFixed(2)})`,
    shaderXZ.distanceTo(rayXZ) < 1e-9, `shader(${shaderXZ.x},${shaderXZ.y}) != ray(${rayXZ.x},${rayXZ.y})`)
}

// ── 2b. Per-instance ground fit (shadowShearScale) vs analytic slope intersections ──────────────
// On a PLANE of grade g along the shadow direction, the ray dropping Δ sits at along-track distance
// Δ·|S|, so the hit solves h0 − Δ = g·Δ·|S| → k = Δhit/h0 = 1/(1 + g·|S|). Downhill (g<0) → k>1
// (shadow reaches farther), uphill → k<1. This is the slope detachment found live at (334,-108).
{
  const sun = new THREE.Vector3(0.5, 0.5, 0.3).normalize()   // low sun — long shadows, worst case
  const S = shearFromSun(sun, new THREE.Vector2())
  const mag = S.length(), ux = S.x / mag, uz = S.y / mag
  const h0 = 8, bx = 100, bz = -50, by = 30
  for (const g of [0, 0.3, 0.6, -0.25, -0.45]) {
    const plane = (x, z) => by + g * ((x - bx) * ux + (z - bz) * uz)
    const k = shadowShearScale(bx, by, bz, h0, S.x, S.y, plane)
    const kTrue = 1 / (1 + g * mag)
    check(`ground-fit plane grade ${g} (|S|=${mag.toFixed(2)})`, Math.abs(k - kTrue) < 0.01,
      `k=${k.toFixed(4)} analytic=${kTrue.toFixed(4)}`)
  }
  // flat ground → exactly the old behaviour
  check('ground-fit flat == 1', Math.abs(shadowShearScale(bx, by, bz, h0, S.x, S.y, () => by) - 1) < 1e-3)
  // cliff (terrain drops away, ray never lands) → clamped, finite
  const kCliff = shadowShearScale(bx, by, bz, h0, S.x, S.y, () => -1e6)
  check('ground-fit cliff clamps finite', kCliff > 1 && kCliff <= (h0 + 48) / h0, `k=${kCliff}`)
}

// ── 3. Toroidal tile index parity + ring fits the atlas ─────────────────────────────────────────
const pmod = (a, n) => ((a % n) + n) % n                          // JS side (update())
const glslTile = (w) => pmod(Math.floor(w / CHUNK), ATLAS_N)      // shader: mod(floor(xz/64), N)
for (const cx of [-25, -13, -1, 0, 7, 30]) {
  check(`tile index cx=${cx}`, pmod(cx, ATLAS_N) === glslTile(cx * CHUNK + 1),
    `js=${pmod(cx, ATLAS_N)} glsl=${glslTile(cx * CHUNK + 1)}`)
}
// Prop ring (main.js QUALITY presets propRing ≤ 3 → diameter 7) + the ±1 neighbour bake margin
// must fit ATLAS_N or live chunks alias onto one tile. Read the live values from main.js.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const HERE = dirname(fileURLToPath(import.meta.url))

// ── 3b. DPR tripwire: the bake must address atlas tiles via renderTarget.viewport/scissor (raw
// pixels), NEVER renderer.setViewport/setScissor — those multiply by the canvas pixelRatio, so on
// a Retina display (DPR 2) every tile was written at 2× its offset: shadows landed in other
// chunks' tiles while DPR-1 headless verification looked perfect. Found live 2026-07-15; no
// headless GPU here, so pin the API choice at the source level.
{
  const bakeSrc = readFileSync(join(HERE, '../src/props/prop-shadow-bake.js'), 'utf8')
  const code = bakeSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')   // strip comments
  check('bake never calls renderer.setViewport/setScissor (DPR-scaled)',
    !/\.(setViewport|setScissor|setScissorTest|getViewport|getScissor)\s*\(/.test(code))
  check('bake targets tiles via rt.viewport + rt.scissor',
    /_rt\.viewport\.set\(/.test(code) && /_rt\.scissor\.set\(/.test(code))
}

const mainSrc = readFileSync(join(HERE, '../src/main.js'), 'utf8')
const rings = [...mainSrc.matchAll(/propRing:\s*(\d+)/g)].map((m) => +m[1])
check('propRing values found in main.js', rings.length > 0)
const maxRing = Math.max(...rings, 0)
check(`prop ring diameter fits atlas (2*(${maxRing}+1)+1 ≤ ${ATLAS_N})`, 2 * (maxRing + 1) + 1 <= ATLAS_N)

if (fails) { console.error(`\nprop-shadow-alignment: ${fails} FAILED`); process.exit(1) }
console.log('\nprop-shadow-alignment: all checks passed')
