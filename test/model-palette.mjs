// test/model-palette.mjs — curated recolour pool gate.
//
// A `palette` in data/prop-models.js is bound to the .glb by SUBSTRING MATCH on material name
// (ASSETS.md, "Untextured assets"). That binding is invisible at author time and fails silently at
// runtime: rename a material on re-export and the palette matches nothing, the model just always
// wears its authored colour, and nobody notices until someone asks why every gnome is blue. The
// same class of bug already shipped once as pink cubes (see dist-assets.mjs).
//
// So, without loading three.js or running a build, assert against the GLB's own JSON chunk:
//   (a) every palette key matches at least one material name that actually exists
//   (b) all arrays in one model's palette are the same length — the variant index is ONE number
//       for the whole model, so ragged arrays would silently desynchronise a coordinated outfit
//   (c) colours are 3 finite numbers in [0, 1]
//   (d) INDEX 0 EQUALS THE AUTHORED baseColorFactor. Variant 0 reuses the .glb's own material
//       rather than a clone, so if these two drift the default colour changes depending on whether
//       a spawner passed variant 0 or passed nothing — the worst kind of bug to chase.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PROP_MODELS } from '../data/prop-models.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EPS = 0.002        // generous: these are hand-typed linear values, not computed ones

let failed = 0
const fail = (msg) => { console.error(`[FAIL] ${msg}`); failed++ }

/** Materials out of a .glb's JSON chunk: name → baseColorFactor rgb (alpha dropped). */
function glbMaterials (path) {
  const buf = readFileSync(path)
  if (buf.readUInt32LE(0) !== 0x46546C67) throw new Error(`${path} is not a GLB`)
  let off = 12
  while (off < buf.length) {
    const len = buf.readUInt32LE(off)
    const type = buf.readUInt32LE(off + 4)
    off += 8
    if (type === 0x4E4F534A) {                       // 'JSON'
      const js = JSON.parse(buf.subarray(off, off + len).toString('utf8'))
      return (js.materials ?? []).map(m => ({
        name: m.name,
        rgb: (m.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1]).slice(0, 3),
      }))
    }
    off += len
  }
  throw new Error(`${path} has no JSON chunk`)
}

let checked = 0
for (const [key, spec] of Object.entries(PROP_MODELS)) {
  if (!spec.palette) continue
  const path = join(ROOT, spec.url)
  if (!existsSync(path)) { fail(`${key}: ${spec.url} does not exist`); continue }

  const mats = glbMaterials(path)
  const entries = Object.entries(spec.palette)
  const lengths = new Set(entries.map(([, cols]) => cols.length))

  // (b) one variant index drives the whole model
  if (lengths.size > 1) {
    fail(`${key}: palette arrays have different lengths (${[...lengths].join(', ')}). The variant ` +
         'index is one number for the whole model, so ragged arrays desynchronise the outfit.')
  }
  if ([...lengths][0] < 2) {
    fail(`${key}: a palette of ${[...lengths][0]} is not a pool — drop the field or add a colour.`)
  }

  for (const [matKey, colours] of entries) {
    // (a) the substring binding still resolves
    const hits = mats.filter(m => m.name.includes(matKey))
    if (!hits.length) {
      fail(`${key}: palette key '${matKey}' matches no material in ${spec.url} ` +
           `(has: ${mats.map(m => m.name).join(', ')}). Renamed on re-export?`)
      continue
    }
    if (hits.length > 1) {
      fail(`${key}: palette key '${matKey}' matches ${hits.length} materials ` +
           `(${hits.map(m => m.name).join(', ')}) — ambiguous, tighten the name.`)
    }

    // (c) well-formed linear colours
    colours.forEach((c, i) => {
      if (!Array.isArray(c) || c.length !== 3 || c.some(v => !Number.isFinite(v) || v < 0 || v > 1)) {
        fail(`${key}.${matKey}[${i}] is not 3 finite numbers in [0,1]: ${JSON.stringify(c)}`)
      }
    })

    // (d) index 0 IS the authored colour
    const authored = hits[0].rgb
    const drift = colours[0].map((v, i) => Math.abs(v - authored[i]))
    if (Math.max(...drift) > EPS) {
      fail(`${key}.${matKey}[0] = [${colours[0]}] but ${hits[0].name} is authored ` +
           `[${authored.map(v => +v.toFixed(4))}] in the .glb (max drift ` +
           `${Math.max(...drift).toFixed(4)} > ${EPS}). Variant 0 reuses the authored material, ` +
           'so these two must agree or the default colour depends on how it was spawned.')
    }
    checked++
  }
}

if (failed) {
  console.error(`\n[FAIL] model-palette: ${failed} problem(s)`)
  process.exit(1)
}
console.log(`[PASS] model-palette: ${checked} palette binding(s) resolve, index 0 matches the GLB`)
