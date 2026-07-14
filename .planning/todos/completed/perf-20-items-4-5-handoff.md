---
id: PERF-20
type: perf
status: completed
severity: major
created: 2026-07-14
resolved: 2026-07-14
resolution: "Item 5 (Vite) SHIPPED — see PERF-04 (perf-build-system-bundler.md) resolution for the full
  change + verify. Item 4 (ancestor-proximity index) WONTFIX after profiling: on a clean machine the
  prefilter walk it targets is only ~31-34 ms/edge (~19%% of a single search) at 6 ns/iteration — a
  tight cache-linear typed-array loop. An open-addressed hash-grid maintained by LCA path-diff must
  beat 6 ns/iter amortized to clear the mandated bench gate, but its per-sample constant (hash+probe+
  bucket-append+removal-record, 3x3 query) almost certainly exceeds that, and O(path-diff) is not
  reliably < O(depth) for best-first pops (avg depth ~54, frontier jumps). Even the free-maintenance
  ceiling (~31 ms/edge -> ~2 s/world) is OFF the main thread (road worker) and PRE-WARMED (warmRoutes)
  — invisible to the frame budget; per PERF-19, cold load is fill/seat-bound, not routing-bound. High
  risk (byte-identical mirror into 2 sync regions, likely bench-gate rejection) for a marginal off-hot-
  path gain. User agreed to skip. Measurement kept: perf-runs/probe-walk.mjs (+ the __PROBE edit was
  reverted from src/road-carve.js)."
note: "Handoff for the two DEFERRED items of the PERF-19 bundle — item 4 (byte-identical router
speedup) and item 5 (Vite build). Self-contained for a FRESH Opus session. PERF-19.1-3 shipped +
merged to main (3cb6627); read perf-19-load-time-bundle.md for their measured results and the
cull/build-bound findings. Read memory project_perf19_load_bundle + project_perf08_harness_findings
before starting."
---

# PERF-20: PERF-19 items 4 (ancestor-proximity index) + 5 (Vite) — deferred continuation

PERF-19 shipped items 1-3 (water.sync skip, terrain worker pool, spawn recenter scope) — merged to
main at 3cb6627, all byte-identical, measured real-but-sub-target. Items 4 and 5 were deferred
because both NEED a clean machine (item 4 must be benchmarked before it can ship; item 5's payoff IS
a cold measurement) and the fanless M4 was buried under macOS mediaanalysisd/mds for hours. This
ticket carries them forward with the full designs + the measurement harness already built for them.

## Environment rules (unchanged from PERF-19 — non-negotiable)

- NEVER kill any `caffeinate`; keep pkill patterns narrow. Fanless M4: NO reliable cold timing while
  `mediaanalysisd`/`mds_stores` (Photos/Spotlight) are busy — they inflated cold loads 6.6s→20s+ and
  gave 34× run-to-run variance during PERF-19. Gate every timing run on sustained-idle (below).
- Check `git status` first: main often carries ANOTHER session's uncommitted WIP (param-drift cleanup
  in src/debug.js + src/terrain.js, affected-gates infra in test/gates.mjs + run-all.mjs, CLAUDE.md,
  package.json). `git add` ONLY your own files explicitly; never `-A`/`-u`. To land a branch, snapshot
  their WIP (`git diff > patch`, back up files), `git stash -u`, merge, `git stash pop` — verified
  conflict-free in PERF-19 because the regions are disjoint.
- **Known boot gotcha:** as of this writing main HEAD does NOT boot in a browser UNTIL the other
  session commits its debug.js fix (it removes a stale `roadFillHeight` lil-gui slider — the param was
  dropped from data/ranger.js but debug.js still `.add()`s it → `initDebug` throws during bootstrap →
  `window.__rsReady` never fires → any harness times out on ready). If it's still uncommitted when you
  start, apply the same one-line removal LOCALLY (uncommitted) to boot, or commit it if the other
  session is done. terrain.js already tolerates the missing param via `?? 2.0`.

## Measurement harness already built (in main/perf-runs/, gitignored scratch)

- `perf-runs/PROBE-changeSeed.patch` — adds `window.__changeSeed(v)` under `?prof=1` (fires a Path-B
  world regen for a new seed WITHOUT reloading → isolates world-gen from the ~0.9s import-waterfall +
  Chrome-boot common-mode). Re-apply with `git apply` (measurement-only, uncommitted). THE key probe
  for fast cold-load A/B.
- `perf-runs/ab-preset.mjs <Preset> <distinct,seeds>` — two persistent Chromes (NEW vs OLD baseline),
  applies a preset (Ultra = ring 4 = 289 chunks — where terrain generation actually matters), fires
  __changeSeed per DISTINCT seed (each a cache-MISS), measures `seat` (spawn routing) + `fill` (terrain
  rebuild), interleaved NEW/OLD. This is the method that produced PERF-19's clean numbers.
- `perf-runs/ab-seedchange.mjs`, `ab-coldload.mjs` — earlier variants (default ring / full restart).
- `perf-runs/auto-retry-ab.mjs` — polls `os.loadavg()` (1/5/15-min → "cooled a while, not a dip") +
  mediaanalysisd/mds CPU + `pmset -g therm`; fires the A/B automatically on sustained idle, logs the
  thermal timeline. No SMC temp without sudo — load history is the proxy. Run it and walk away.
- `perf-runs/boot-diag.mjs <port> <cdp> <seed>` — loads over CDP, captures console/exceptions/module
  errors + boot state. Use FIRST on any browser change (it caught the debug.js boot throw + confirmed
  the 3-worker terrain pool inits).
- A/B setup: NEW = the working tree served by `python3 test/nocache-server.py 8002` from repo root;
  OLD = a baseline worktree (`git worktree add ../CarGame-baseline <base-commit>`) served on :8001.
  nocache-server (NOT `npx serve` — strips query strings). Serve, don't reload between A/B runs.

---

## Item 4 — incremental ancestor-proximity index (byte-identical router speedup)

**Goal:** replace the per-expansion ancestor-chain walk in `arcPrimitiveConnect`'s self-clearance
prefilter (src/road-carve.js ~1005-1020, the `for st=sid…SP[st]` gather into `_scN*`) with a
current-path spatial grid, returning EXACTLY the same accept/reject decisions. ~19 ms/edge today
(same cost inside every repair re-search).

**Why it was deferred, not shipped:** its ONLY payoff is speed → a byte-identical-but-slower impl is a
SILENT REGRESSION. It MUST be benchmarked (per-edge ≥15% down; prevention term ≥2× cheaper) before
commit, on a clean machine. PERF-19 couldn't get one. Also the codebase deliberately avoids Map/Set in
this hot loop ("Map/Set/object-per-node allocation + hashing + GC dominated that") — so the grid must
be an OPEN-ADDRESSED TYPED-ARRAY hash, not a Map, or the bench shows no win.

**Design (byte-identical BY CONSTRUCTION):**
- Add `_apcDepth` Int32Array (parent depth + 1); mirror into the ROUTE SYNC region + src/road-worker.js
  ROAD_WORKER_SOURCE (route-worker-sync.mjs gate enforces byte-identity, modulo `export`/backtick
  escaping).
- Grid cell = `scReach` (= scMaxL + scD). Each state contributes its endpoint (SX/SZ @ SL) + entering-
  midpoint (SMx/SMz @ mpos) samples. At each expansion, transition the grid from the previous popped
  node's root-path to `sid`'s root-path via an LCA diff (level the deeper node via `_apcDepth`, walk
  both up in lockstep to the LCA): POP the departing tail's samples, PUSH the arriving tail's. A
  push-record stack makes per-cell removal LIFO-correct (path pops are reverse-of-push; within a cell,
  entries are in depth order → the tail is always the popped state's — proven).
- `selfHit` queries the node cell's 3×3 neighbourhood instead of the linear `_scN*` list. This is a
  SUPERSET of the walk's gather (3×3 of cell=scReach ⊇ scReach-of-node; all path samples ⊇ the
  lim-filtered subset), and `selfHit`'s EXACT scD²/scGap arc-separation test is UNCHANGED → identical
  accept/reject. `selfHit` short-circuits on first hit → order-independent → deterministic/window-
  invariant. Memory/scratch must be generation-stamped like the existing `_apcGen` scratch.
- Win source: per-expansion cost O(depth) → O(path-diff between consecutive best-first pops); locality-
  dependent, hence the mandatory bench gate before commit.

**Verification (run on a clean machine):**
1. Exact-chain A/B: route ~50 edges × 3 seeds (INCLUDE seed-6's known pigtail/repair edge — the one
   the self-clearance repair loop fires on) through pristine `git show <base>:src/road-carve.js` vs the
   new path; diff emitted primitive chains → MUST be zero. (perf-runs/ has prior item-4 profiling
   scripts: profile-selfclear.mjs, profile-item34.mjs, item4-heur.mjs — reuse/extend.)
2. Gates green WITHOUT regen: route-worker-sync + route-bundle-parity + invariance + restream-invariance
   + graph-topology + graph-cull-radius-invariance.
3. Per-edge bench: prevention term ≥2× cheaper AND total per-edge ≥15% down. Open-addressed typed-array
   hash, NOT a Map.

Commit `perf(PERF-20.4): incremental ancestor-proximity index (byte-identical)` ONLY if all three pass.

---

## Item 5 — Vite build (was PERF-04, USER-APPROVED — biggest blast radius, land last)

**Goal:** kill the ~0.9s import waterfall (20-file ESM chain + CDN three) that hits EVERY load on
every machine. USER-APPROVED; overrides the CLAUDE.md "no build system" constraint (rewrite it).

**Payoff is itself a COLD measurement** → needs the idle window + the ab harness above; also completion
requires "game boots (dev AND built)" via boot-diag.mjs. Hence deferred.

**node_modules FIRST (worktree hazard):** if you work in a worktree, its node_modules may be a SYMLINK
to another worktree's — do NOT `npm install` against it (prunes other workers' deps). Give the worktree
its own: `rm node_modules && npm install && npm install -D vite`.

**Migration:**
- `package.json`: move three@0.184.0 + simplex-noise@4.0.3 to `dependencies`; add `vite` devDep; scripts
  `dev: vite --port 8000`, `build: vite build`, `preview: vite preview`. KEEP test/test:all pure-node.
- `vite.config.js`: `base: './'` (GitHub Pages subpath-safe); `resolve.alias { 'three/addons/':
  'three/examples/jsm/' }` (sky.js/debug.js/vehicle-model.js/prop-geometry.js import `three/addons/*`;
  npm three ships them at examples/jsm); `server.port: 8000` (keeps profile.mjs/screenshot.mjs `--port`
  default + query strings working — verify `?prof=1&seed=` pass through); `build.outDir: 'dist'`.
- `index.html`: DELETE the `<script type="importmap">` block (vite resolves the bare specifiers); keep
  `<script type="module" src="src/main.js">`.
- **Runtime static asset — the one real gotcha:** src/route-store.js `fetch('data/route-cache-default
  .json.gz')` is a runtime fetch, NOT an import. Do NOT convert to a `?url` import (breaks the pure-node
  gates that import route-store.js). Serve it via `publicDir` / a 4-line copy plugin (data/*.gz →
  dist/data/), leaving `data/` (ranger.js etc., which ARE bundled) in place and the fetch URL unchanged.
  Verify the fetch 200s in dev AND built. (Confirm no other runtime `fetch()` of a repo asset.)
- **Build-version probe:** src/version.js fetches `new URL('./main.js', import.meta.url)` — won't exist
  post-bundle (degrades gracefully to 'unknown', never throws). Minimal fix: probe `new
  URL(import.meta.url).href` (the module's own hashed bundle — real Last-Modified in dev + built).
- **Workers are FINE untouched:** terrain (WORKER_SOURCE) + road (ROAD_WORKER_SOURCE) are Blob classic
  workers built from template STRINGS (`new Blob([SRC]); new Worker(blobURL)`) — bundler-invisible; the
  string constants survive bundling. Verify BOTH spin up in `vite build` output (boot-diag shows the
  terrain-worker init lines). The route-worker-sync gate compares SOURCE files → unaffected by build.
- **GLTF:** vehicle-model.js `new GLTFLoader().load(spec.url,…)` — confirm spec.url (procedural fallback
  vs a real .glb); if a real asset, place under public/.
- **Deploy:** remote = github.com:ledogen/Autos; no existing CI. Add `.github/workflows/deploy.yml`
  (checkout → setup-node → `npm ci` → `npm run build` → upload-pages-artifact `dist` → deploy-pages).
  USER MUST FLIP: Settings → Pages → Source = "GitHub Actions" (do NOT change Pages settings yourself;
  just NOTE it). Keeps source clean (no committed build output).
- src/perf.js TEMP probes: DO NOT strip (the ?prof=1 harness depends on them; update PERF-04's old
  "strip on close" note).
- Rewrite CLAUDE.md's "no build system" constraint + Technology-Stack bullets: dev = vite dev, deploy =
  vite build via GitHub Actions, three from npm (byte-identical to the retired importmap pin), gates
  unchanged pure-node. Close the old PERF-04 ticket (perf-build-system-bundler.md) into completed/.

**Verify (clean pass):** `npm run test:all` green (gates untouched) · `npm run dev` → boot-diag clean,
?prof=1 live, `node test/profile.mjs --scenario=idle --port=8000` works · `npm run build` + serve dist →
boots from built output, worker blobs init, route-bundle fetch 200s, junction (224,-192) screenshot
matches · coldload seed-6: report the nav→ready waterfall delta explicitly.

Commit `feat(PERF-04/PERF-20.5): Vite build — kill the import waterfall` (+ CLAUDE.md + ticket moves).

## Key learnings from PERF-19 (save yourself the rediscovery)

- **Fill is main-thread-BUILD-bound, not generation-bound** at the shipped rings — the terrain pool
  (19.2) only bought ~8-18% at Ultra and ~0 at the default ring. If item 5 or a future item chases
  ring-fill time, the lever is the main-thread build in `_flushPendingQueue` (geometry/carve/normals/
  vertex-colors), not more workers.
- **Interleaved runtime seed-change (__changeSeed) is the fast, low-noise cold-load A/B method** — skips
  the import waterfall + Chrome boot. Use DISTINCT seeds (each cache-miss) for routing/spawn metrics;
  reused seeds cache after round 0 and stop testing the cold path.
- **Always boot-diag before timing** — a single throw in synchronous bootstrap (e.g. a debug slider on
  a missing param) silently blocks `__rsReady` and every harness times out at 120s looking like
  "contention."
