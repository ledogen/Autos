// test/dist-assets.mjs — deploy-manifest gate.
//
// Every runtime asset fetched BY URL (GLBs, the route bundles) is invisible to the bundler, so
// vite.config.js's copyRuntimeAssets plugin is the only thing that puts it in dist/. That list
// silently drifted once already: models added after FEAT-60 were never added to it, so they 404'd
// in the DEPLOYED build only and rendered as model-service.js's pink-cube fallback. Dev never
// caught it — the Vite dev server serves the whole project root regardless of the plugin.
//
// This gate closes the loop WITHOUT running a build: for every model URL the registries declare,
// assert (a) the file exists on disk and (b) the copy plugin's rule actually covers it. The rule is
// "everything in RUNTIME_ASSETS, plus every *.glb in assets/models/", so (b) also means asserting
// the plugin still enumerates the directory rather than reverting to a hand-kept allowlist.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PROP_MODELS } from '../data/prop-models.js'
import { VEHICLE_MODELS } from '../data/vehicle-models.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const cfg = readFileSync(join(ROOT, 'vite.config.js'), 'utf8')

let failed = 0
const fail = (msg) => { console.error(`[FAIL] ${msg}`); failed++ }

// (b) the plugin must enumerate assets/models/ — an allowlist is the drift bug, by construction.
const globs = /readdirSync\(resolve\(root, 'assets\/models'\)\)/.test(cfg)
if (!globs) {
  fail("vite.config.js no longer enumerates assets/models/ — a hand-kept .glb allowlist WILL drift " +
       'and ship pink cubes to Pages. Keep the readdirSync glob.')
}

// Explicit entries the plugin lists by hand (route bundles, CREDITS.md). Without the glob those are
// ALL the copy plugin ships, so coverage falls back to the literal list and names each casualty.
const listed = new Set([...cfg.matchAll(/^\s*'([^']+)',$/gm)].map((m) => m[1]))
const covered = (url) => listed.has(url) || (globs && /^assets\/models\/[^/]+\.glb$/.test(url))

// (a) every declared model URL exists and is covered by the copy rule.
const urls = new Map()   // url → declaring keys
for (const [reg, table] of [['PROP_MODELS', PROP_MODELS], ['VEHICLE_MODELS', VEHICLE_MODELS]]) {
  for (const [key, spec] of Object.entries(table)) {
    if (!spec?.url) continue
    urls.set(spec.url, [...(urls.get(spec.url) ?? []), `${reg}.${key}`])
  }
}
for (const [url, keys] of urls) {
  if (!existsSync(join(ROOT, url))) fail(`${keys.join(', ')} → '${url}' does not exist on disk`)
  else if (!covered(url)) fail(`${keys.join(', ')} → '${url}' is not copied into dist/ by vite.config.js (it will 404 on Pages)`)
}

// Sanity: the directory the glob reads is non-empty and holds the default vehicle. Guards a
// mis-typed path in the plugin silently copying nothing.
const glbs = existsSync(join(ROOT, 'assets/models'))
  ? readdirSync(join(ROOT, 'assets/models')).filter((f) => f.endsWith('.glb'))
  : []
if (!glbs.includes('hilux.glb')) fail('assets/models/hilux.glb (default vehicle) missing from the model directory')

if (failed) {
  console.error(`\n[dist-assets] ${failed} failure(s)`)
  process.exit(1)
}
console.log(`[PASS] dist-assets: ${urls.size} registry model URL(s) exist and are copied into dist/ (${glbs.length} .glb enumerated)`)
