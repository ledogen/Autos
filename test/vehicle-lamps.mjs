// GATE (BUG-143): the reverse split lights only the reverse lamps.
//
// vehicle-model.js splitRearGroup takes every face of a model's `reverse.material` (by substring) whose centroid
// sits behind `rearZ` and lights it in reverse. Anything else wearing that material at the tail lights with the
// lamps: the Ranger's licence plate did (owner, 2026-11-07: "license plate lights up when the reverse lights do").
// The reverse lamps sit at the tail's corners, so every one of those faces must lie outboard of the centre band
// where a plate hangs. Reads the raw GLB in mesh-local coordinates, as the split does.
//
//   node test/vehicle-lamps.mjs [--glb=<path>]    (--glb: check that file against the first spec with `reverse`)
import fs from 'fs'
import { VEHICLE_MODELS } from '../data/vehicle-models.js'

const CENTRE_M = 0.3   // half-width of the centre band; a licence plate is 0.30 m wide
const ARG = process.argv.find((a) => a.startsWith('--glb='))?.split('=')[1]

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}

/** Centroids (x, z) of every triangle of the materials whose name contains `sub`, mesh-local. */
function centroids (path, sub) {
  const buf = fs.readFileSync(path)
  const jl = buf.readUInt32LE(12)
  const js = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'))
  const bin = 20 + jl + 8
  const view = (i) => {
    const a = js.accessors[i], bv = js.bufferViews[a.bufferView]
    const off = bin + (bv.byteOffset || 0) + (a.byteOffset || 0)
    const T = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType]
    const n = a.count * ({ SCALAR: 1, VEC3: 3 }[a.type])
    return new T(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + n * T.BYTES_PER_ELEMENT))
  }
  const out = []
  for (const mesh of js.meshes) {
    for (const pr of mesh.primitives) {
      if (!js.materials[pr.material]?.name.includes(sub)) continue
      const p = view(pr.attributes.POSITION)
      const idx = pr.indices != null ? view(pr.indices) : Uint32Array.from({ length: p.length / 3 }, (_, i) => i)
      for (let t = 0; t < idx.length; t += 3) {
        const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]]
        out.push([(p[3 * a] + p[3 * b] + p[3 * c]) / 3, (p[3 * a + 2] + p[3 * b + 2] + p[3 * c + 2]) / 3])
      }
    }
  }
  return out
}

const specs = Object.entries(VEHICLE_MODELS).filter(([, s]) => s.reverse)
for (const [key, spec] of ARG ? specs.slice(0, 1) : specs) {
  const { material, rearZ } = spec.reverse
  const rear = centroids(ARG ?? spec.url, material).filter(([, z]) => z > rearZ)
  const inside = rear.filter(([x]) => Math.abs(x) < CENTRE_M)
  check(`${key}: ${rear.length} rear ${material} faces, all at the lamps (outboard of ±${CENTRE_M} m)`,
        rear.length > 0 && inside.length === 0, `${inside.length} in the centre band (a plate?)`)
}

if (fails) { console.log(`\nvehicle-lamps: ${fails} FAIL`); process.exit(1) }
console.log('\nvehicle-lamps: all ok')
