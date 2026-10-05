// test/model-variant.mjs — BUG-43 per-instance recolour gate.
//
// Object3D.clone() shares materials by reference, so a naive recolour of one spawned model bleeds
// into every instance. model-service's answer is to SWAP material objects from a palette built once
// at load. This runs that exact path (buildPalette + instantiate, the code spawnModel calls) on a
// GLTFLoader.parse() of the shipped trailer, headless, and asserts:
//   (a) two instances on different variants wear different TrailerBody materials and colours
//   (b) materials NOT in the palette stay the SAME object across instances — the fix must not
//       silently regress into cloning everything
//   (c) variant 0 is the template's own material, and the template is never mutated
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { PROP_MODELS } from '../data/prop-models.js'
import { buildPalette, instantiate } from '../src/model-service.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const spec = PROP_MODELS.trailerHomeA
const buf = readFileSync(join(ROOT, spec.url))
const gltf = await new Promise((res, rej) =>
  new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), '', res, rej))

const rec = { template: gltf.scene, palette: buildPalette(gltf.scene, spec) }
const mat = (root, name) => {
  let m = null
  root.traverse((o) => { if (o.isMesh && o.material.name.startsWith(name)) m = o.material })
  return m
}

let failed = 0
const check = (ok, msg) => { if (!ok) { console.error(`[FAIL] ${msg}`); failed++ } }

const authoredHex = mat(rec.template, 'TrailerBody').color.getHexString()
const a = instantiate(rec, 0), b = instantiate(rec, 1), c = instantiate(rec, 2)

check(mat(a, 'TrailerBody') !== mat(b, 'TrailerBody'), '(a) variants 0 and 1 share a TrailerBody material')
check(mat(a, 'TrailerBody').color.getHexString() !== mat(b, 'TrailerBody').color.getHexString(),
  '(a) variants 0 and 1 have the same TrailerBody colour')
check(mat(b, 'TrailerAccent') !== mat(c, 'TrailerAccent'), '(a) variants 1 and 2 share a TrailerAccent material')
for (const fixed of ['TrailerRoof', 'TrailerSkirt', 'TrailerTrim', 'TrailerDoor', 'TrailerCurtain', 'TrailerMetal']) {
  check(mat(a, fixed) === mat(b, fixed) && mat(b, fixed) === mat(c, fixed),
    `(b) ${fixed} is not in the palette but was cloned per instance`)
}
check(mat(a, 'TrailerBody') === mat(rec.template, 'TrailerBody'), '(c) variant 0 is not the authored material')
check(mat(instantiate(rec, 4), 'TrailerBody') === mat(b, 'TrailerBody'), '(c) variant 4 should wrap to the shared variant-1 material')
check(mat(rec.template, 'TrailerBody').color.getHexString() === authoredHex, '(c) the template was mutated')

if (failed) { console.error(`\n[FAIL] model-variant: ${failed} problem(s)`); process.exit(1) }
console.log('[PASS] model-variant: per-instance palette swaps without bleed; fixed materials stay shared')
