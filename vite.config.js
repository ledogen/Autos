// vite.config.js — RangerSim build (PERF-04 / PERF-20.5).
//
// Replaces the retired CDN importmap: `npm run dev` serves src/main.js on :8000 (dev port kept so
// test/screenshot.mjs + test/profile.mjs `--port` default and `?prof=1&seed=` query strings keep
// working); `npm run build` bundles to dist/ for the GitHub Actions Pages deploy.
//
// three + simplex-noise resolve from node_modules (byte-identical to the old importmap pin). The
// Blob-classic TERRAIN worker is built from a template STRING inside src/terrain.js and is
// bundler-invisible; the ROUTE worker (FEAT-68) is a real module worker — src/road-worker.js does
// `new Worker(new URL('./road-route-worker.js', import.meta.url), {type:'module'})`, which Vite
// detects and bundles as its own chunk in dev and build.
import { defineConfig } from 'vite'
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// Runtime assets fetched by URL (NOT ES imports), so the bundler never sees them — they must be
// copied into dist verbatim at their existing paths so the runtime fetch/loader URLs keep resolving:
//   data/route-cache-default.json.gz  ← src/route-store.js fetch() (BASE route bundle, boot)
//   data/route-cache-region.json.gz   ← src/route-store.js fetch() (story-region delta, lazy)
//   assets/models/CREDITS.md          ← license attribution shipped beside the models
//   assets/models/*.glb               ← ENUMERATED, not listed (see below)
// The Vite dev server already serves project-root files, so these 200 in dev with no plugin; this
// plugin only fixes the BUILD (vite build ships imports + publicDir, and these are neither). We do
// NOT move them under public/ — that would change the fetch URLs and break the pure-node gates that
// read data/*.js directly. (route-store.js keeps its fetch URL; do NOT convert it to a ?url import.)
//
// BUG: the .glb list used to be hand-maintained here and silently drifted — every model added after
// FEAT-60 (test-rock, test-barrel, the drums, winnebago, tent, broken-car, barrel-plastic) was
// missing from it, so those loads 404'd in the DEPLOYED build only and rendered as model-service.js's
// pink-cube fallback. Dev never caught it (the dev server serves the whole project root). The
// directory is now the manifest: dropping a .glb in assets/models/ is all "adding a vehicle is
// data-only" (CLAUDE.md) ever claimed it should take. test/dist-assets.mjs gates it.
const RUNTIME_ASSETS = [
  'data/route-cache-default.json.gz',
  'data/route-cache-region.json.gz',
  'assets/models/CREDITS.md',
]

// INFRA-03: the Box3D determinism harness, shipped so it can be run on a machine that has no repo
// and no node — open <pages-url>/test/box3d-determinism.html and read the hash off the page. The
// machine-vs-machine axis is the one FEAT-48 Phase 0 left untested, and the BROWSER hash is the
// one that matters: the game runs Box3D in a browser, and node-vs-browser is already proven
// identical (test/box3d-determinism.expected). Paths are repo-relative on purpose — the page
// imports './box3d-determinism.mjs', which imports '../vendor/box3d/dist/box3d.mjs', which fetches
// box3d.wasm from its own directory. Mirroring the tree keeps all three resolving with no edits.
// A standalone page, unlinked from the game: delete these four lines to unship it.
const DIAGNOSTIC_ASSETS = [
  'test/box3d-determinism.html',
  'test/box3d-determinism.mjs',
  'vendor/box3d/dist/box3d.mjs',
  'vendor/box3d/dist/box3d.wasm',
]

function copyRuntimeAssets () {
  let root = process.cwd()
  return {
    name: 'rangersim-copy-runtime-assets',
    configResolved (cfg) { root = cfg.root },
    closeBundle () {
      const outDir = resolve(root, 'dist')
      const glbs = readdirSync(resolve(root, 'assets/models'))
        .filter((f) => f.endsWith('.glb'))
        .map((f) => `assets/models/${f}`)
      for (const rel of [...RUNTIME_ASSETS, ...DIAGNOSTIC_ASSETS, ...glbs]) {
        const dest = resolve(outDir, rel)
        mkdirSync(dirname(dest), { recursive: true })
        copyFileSync(resolve(root, rel), dest)
      }
    },
  }
}

export default defineConfig({
  base: './',                       // GitHub Pages subpath-safe (relative asset URLs)
  resolve: {
    alias: {
      // sky.js / debug.js / vehicle-model.js import three/addons/* (the browser importmap path);
      // npm three ships those under examples/jsm — map one to the other so both dev and build resolve.
      'three/addons/': 'three/examples/jsm/',
    },
  },
  server: { port: 8000 },           // keep harness --port default + query-string passthrough
  // es2022 so the top-level `await` in src/main.js's boot sequence survives the build (default es2020
  // rejects TLA). TLA needs Chrome 89+/Safari 15+/Firefox 89+ — well inside the WebGL2 baseline the
  // sim already requires.
  build: { outDir: 'dist', target: 'es2022' },
  plugins: [copyRuntimeAssets()],
})
