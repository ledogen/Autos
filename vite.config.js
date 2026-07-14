// vite.config.js — RangerSim build (PERF-04 / PERF-20.5).
//
// Replaces the retired CDN importmap: `npm run dev` serves src/main.js on :8000 (dev port kept so
// test/screenshot.mjs + test/profile.mjs `--port` default and `?prof=1&seed=` query strings keep
// working); `npm run build` bundles to dist/ for the GitHub Actions Pages deploy.
//
// three + simplex-noise resolve from node_modules (byte-identical to the old importmap pin). The
// Blob-classic terrain + road workers are built from template STRINGS inside src/*.js and are
// bundler-invisible — the string constants survive bundling untouched.
import { defineConfig } from 'vite'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// Runtime assets fetched by URL (NOT ES imports), so the bundler never sees them — they must be
// copied into dist verbatim at their existing paths so the runtime fetch/loader URLs keep resolving:
//   data/route-cache-default.json.gz  ← src/route-store.js fetch() (pre-warmed route bundle)
//   assets/models/hilux.glb           ← src/vehicle-model.js GLTFLoader().load() (default vehicle)
//   assets/models/CREDITS.md          ← license attribution shipped beside the model
// The Vite dev server already serves project-root files, so these 200 in dev with no plugin; this
// plugin only fixes the BUILD (vite build ships imports + publicDir, and these are neither). We do
// NOT move them under public/ — that would change the fetch URLs and break the pure-node gates that
// read data/*.js directly. (route-store.js keeps its fetch URL; do NOT convert it to a ?url import.)
const RUNTIME_ASSETS = [
  'data/route-cache-default.json.gz',
  'assets/models/hilux.glb',
  'assets/models/CREDITS.md',
]

function copyRuntimeAssets () {
  let root = process.cwd()
  return {
    name: 'rangersim-copy-runtime-assets',
    configResolved (cfg) { root = cfg.root },
    closeBundle () {
      const outDir = resolve(root, 'dist')
      for (const rel of RUNTIME_ASSETS) {
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
