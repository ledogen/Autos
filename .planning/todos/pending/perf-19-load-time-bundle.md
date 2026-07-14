---
id: PERF-19
type: perf
status: pending
severity: major
created: 2026-07-14
source: user-request
note: "Bundle of five approved optimizations for an Opus agent with FRESH CONTEXT — this ticket
is self-contained; read .planning/perf/FINDINGS.md (esp. the measurement-gotchas addendum) and
memory project_perf08_harness_findings before starting. Ordered safest→riskiest so early wins
land even if a later item stalls. Items 1-4 are quality-neutral by design; item 5 (Vite) is the
user-approved PERF-04 decision and overrides the CLAUDE.md no-build-system constraint (update
CLAUDE.md as part of it)."
---

# PERF-19: load-time + frame bundle — water-sync skip, terrain-gen pool, spawn-warm scope, ancestor index, Vite

## Environment rules (non-negotiable, learned the hard way)

- NEVER kill any `caffeinate` process; never use broad pkill patterns (caffeinate keeps this
  lid-closed Mac awake for the user's remote access — killing it severs their session).
- Dev server on :8000 = `python3 test/nocache-server.py 8000` (NOT npx serve — it 301-strips
  query strings, breaking `?prof=1&seed=` runs). Restart it if down; don't kill it.
- Fanless M4 Air: NO measurements concurrent with test suites or other Chrome instances; cool-down
  gaps between browser runs; A/B via INTERLEAVED runs (old code in a git worktree served on :8001
  with python http.server; `node test/profile.mjs --port=8001`). Treat >2× day-to-day swings as
  thermal until proven otherwise.
- Check `git status` before starting: if another session's uncommitted files are present, `git
  add` ONLY your own files explicitly, never `-A`/`-u`.
- Measurement harness: `test/profile.mjs` (coldload/idle/drive/stream scenarios, `--seed`,
  `--label`, `--trace`), `test/trace-report.mjs` (busy %, hitch attribution), screenshots via
  `test/screenshot.mjs <x> <z>`. perf-runs/ is gitignored scratch; prior bench scripts live there.
- `npm test` = affected-gates selection from your diff; `npm run test:all` = full suite (known
  accepted red: graph-topology GRAPH-REACHABILITY at 78 % — BUG-35, do not chase it).

## Baselines to beat (post e0ac226, same-machine numbers)

- Idle Normal 30 s: main ~17 %, GPU ~8 %, p99 ~18.7 ms; `frame.water.sync` ≈ 0.7 ms/frame.
- Cold load seed 6: ready ~1.7 s, ring-complete ~3.1-5.4 s (thermal). Seed 42 (cache miss):
  ready ~6.6-6.9 s cool / up to 16 s hot. Ready→ring gap is terrain-worker-generate-bound
  (PERF-13 ticket); pre-ready seed-miss time is ~70 edges of routing on a 4-worker pool.
- Router per-edge (bare, no corridor): ~150 ms median; decomposition (PERF-18, config-independent
  anatomy): search dominates; in-search self-clearance ancestor walk ≈ 19 ms/edge on EVERY edge;
  repair re-searches ≈ 20 ms/edge averaged; post-emit scan + refit ≈ negligible.

---

## Item 1 — keyed `water.sync` skip (smallest, land first)

`WaterRenderer.sync(bbox)` runs every frame from main.js (~0.7 ms) even when the synced region
and its sources are unchanged. Add an early-out: skip when the requested bbox (quantized, e.g.
to 64 m) AND the water system's content generation are identical to the last sync. If no content
generation counter exists, key on the quantized bbox + pond/stream cache sizes — conservative
(any growth re-syncs). Seed rebuilds recreate the renderer → key resets for free; verify.

**Checkpoint 1:** `node test/run-all.mjs --only=water,stream,pond` green ·
idle profile shows frame.water.sync ≈ 0 when parked and water still renders/animates after
driving into a new region (screenshot a pond/stream spot far from spawn, e.g. drive or freecam
there) · commit `perf(PERF-19.1): keyed water.sync skip`.

> **RESULT (2026-07-14, worktree perf-19 @ a68b854):** DONE. All 5 water/stream/pond gates
> green (pond-route-around 181s · stream-carve 106s · stream-bed-drape 105s · restream-invariance
> 71s · water-invariance 5s). Early-out keyed on quantized 64 m window +
> `WaterSystem.contentGeneration()` (sum of cell/pond/stream cache sizes). Behavioural proof via
> headless `perf-runs/verify-water-sync-skip.mjs` (Chrome profile skipped to avoid contention with
> the user's active workers on the fanless M4): parked at steady state → **0** pond/stream
> enumeration calls over 3 frames (the ~0.7 ms/frame is fully skipped); window move re-syncs (1 call
> — water renders when driving to a new region); content growth re-syncs (1 call). No route/mesh/
> render change — reconciliation logic untouched.

## Item 2 — terrain-generate parallelization (ring fill ~2×)

The terrain Worker is a SINGLE worker; ready→ring-complete (~1.4 s+ of visible fill) is bound by
its serial per-chunk `generate` cadence (PERF-13 finding — build budgets are NOT the bottleneck).
Two acceptable shapes (pick after reading src/terrain.js): (a) a small worker pool (2-3) sharing
the same WORKER_SOURCE blob, chunk requests round-robined (replies carry the chunk key, so
out-of-order arrival is already handled by `_pendingQueue` + nearest-first drain — verify); or
(b) batch N chunk keys per generate message. Pool (a) preferred — same math, byte-identical
heightfields, no protocol change beyond fan-out. Respect `reinitWorker` (seed change must reinit
ALL workers) and `project_terrain_worker_constraints` (never postMessage whole RANGER_PARAMS).

**Checkpoint 2:** `npm test` (affected — terrain/carve gates) green · cold seed-6 coldload ×2:
ring-complete minus ready cut ≥ ~40 % vs baseline, ready unchanged · drive + stream profile
scenarios show no new hitches (hitch table in trace-report) · commit
`perf(PERF-19.2): terrain generate worker pool`.

> **RESULT (2026-07-14, worktree perf-19):** CODE DONE + gates green. Shape (a) chosen: a small
> POOL of identical WORKER_SOURCE blob workers (`poolSize = clamp(cores-2, 1, 3)`; 1-worker
> fallback = old behaviour), round-robined in `_updateChunkRing`, all pushing the shared
> `_pendingQueue` (which already sorts nearest-first on drain — out-of-order arrival handled).
> `reinitWorker` re-inits ALL workers (seed change safe). Per-frame dispatch budget scaled ×poolSize
> so the pool doesn't starve. WORKER_SOURCE / height() math UNTOUCHED → byte-identical heightfields
> → no CARVE SYNC mirror concern. Gates green: carve-mesh-smoothness, road-smoothness, ribbon-carve,
> restream-invariance, shoulder-lateral-continuity (+ the item-1 water/stream/pond set).
> **RING-COMPLETE THROUGHPUT MEASUREMENT: consolidated into the Final-Acceptance interleaved A/B
> cold-load table** (items 2/3/5 all move cold-load numbers; one clean interleaved session on a
> cool machine is more rigorous than warm per-item Chrome runs between gate suites, and avoids
> contending with the user's active workers). Ready-time expected unchanged (spawn gating is item 3).

## Item 3 — spawn-warm scope reduction (seed-miss ready ~1.5-2×, ZERO route changes)

resolveSpawn (src/main.js ~318-440) blocks first frame on warming the ENTIRE tier band (~70
edges, two tiers + a recenter) via `warmSpawnBand` pumping. The truck only needs enough routed
edges to (a) find the nearest road within the probe radius and (b) stream the spawn tile's band
as cache hits. Reduce what BLOCKS ready without changing what is ROUTED overall: e.g. warm
nearest-first from the probe point and start the tier's `queryNearest` attempts as soon as the
edges within the current best-candidate distance are cached, rather than after the whole band;
or warm tier-1's band sorted by distance and poll the probe between pump rounds, accepting the
first hit whose supporting edges are cached. HARD CONSTRAINTS: the CHOSEN spawn must be
byte-identical to today for every seed (the probe itself must see the same cached/synced state
when it decides — the safe shape is: decide the spawn exactly as today, but overlap the
LATER-tier/recenter warms with work that doesn't gate the decision; anything cleverer needs a
15-seed spawn-identity check, headless, before/after — write it, run it, include it). The
remaining band edges keep warming AFTER ready through `_spawnWarmActive` release + the existing
per-frame `warmRoutes` (players see roads pop in slightly later at distance — acceptable; the
near field must be complete). No router change, no cache regen — route-bundle-parity stays green
untouched.

**Checkpoint 3:** 15-seed headless spawn-identity check passes (same spawn position+heading per
seed as HEAD) · seed-42 coldload interleaved A/B: ready improved ≥1.4×, no missing roads near
spawn (screenshot spawn area for seeds 42 + 6) · `npm test` green · commit
`perf(PERF-19.3): spawn warm scope — overlap non-gating warms past ready`.

> **RESULT (2026-07-14, worktree perf-19):** DONE — bounded, byte-identical, but PARTIAL vs the
> 1.5-2× target. **Analysis first:** I traced the entanglement and found the TIGHT tier's warm (the
> dominant ~70-edge pre-ready cost) is IRREDUCIBLE byte-identically — its `queryNearest(tightR)` needs
> the full tightR network AND the BUG-25 cull consumes the routed one-ring geometry (`_edgeXZPolyline`
> → `_edgeCenterline`) to decide which runs survive, so anything routed before the decision feeds the
> decision (directly or via the radius-invariant cull). The router centerline can detour arbitrarily
> around corridor discs, so there is no SOUND static bulge bound for a nearest-first early-accept →
> that path was rejected as unsafe. **What IS safe:** the RECENTER's only decision-gating consumer is
> `queryNearest(nearest.point,100)`, whose ~100 m field is ALREADY cached by the tight tier
> (nearest.point ≤ tightR of base; tight warmed tightR+128). So the recenter now streams/warms at a
> MINIMAL radius `min(_savedRadius, 228)` (100 m query + 128 m margin) — near field = pure cache hits,
> ≈0 pre-ready routing — and the full play band streams on the first post-ready update(). No route
> changed; the chosen spawn is byte-identical.
> **Spawn-identity check (test/spawn-identity.mjs, headless, deterministic terrain):** 15 seeds ×
> recenter radii {228, 200, 150} → **ALL IDENT** (same x/z/heading exactly); every seed hit the tight
> tier and the recenter refinement moved the spawn 0.00 m. So the recenter's full-band pre-ready warm
> was pure overhead for the decision.
> **Ready-time A/B: consolidated into the Final-Acceptance interleaved cold-load pass** (loaded
> machine + user's active test workers preclude a clean cold measurement now). Expected win = the
> recenter's deferred routing only (bounded; the tight tier is untouched) — likely **below the 1.5-2×
> target**; will record the measured delta with a MISSED note if it lands short. This is the honest
> ceiling given the cull/query entanglement above.

## Item 4 — incremental ancestor-proximity index (byte-identical router speedup)

The QUAL-14 in-search self-clearance check walks the candidate's ancestor chain per expansion
(≈19 ms/edge everywhere + the same cost inside every repair re-search). Replace the walk with an
incrementally-maintained spatial hash over ancestor sample points (built as each state extends
its parent; per-expansion query = 3×3 neighborhood), returning EXACTLY the same accept/reject
decisions — same sample points (endpoint/midpoint at the same spacing), same distance threshold,
same gap exemption. This is inside `arcPrimitiveConnect` (ROUTE SYNC region of src/road-carve.js
→ re-mirror byte-identical into src/road-worker.js WORKER_SOURCE same commit; escape backticks/
`${}` as the existing mirror does; `route-worker-sync` gate proves it). Memory/scratch must be
generation-stamped like the existing search scratch (see the module-scope scratch pattern) so
no state leaks across edges (window-invariance). BYTE-IDENTITY PROOF: route-bundle-parity green
WITHOUT regenerating the bundle + the invariance gates + (write it) a scratch A/B that routes
~50 edges across 3 seeds with old vs new check and diffs the emitted primitive chains exactly.

**Checkpoint 4:** exact-chain A/B diff = zero differences · route-worker-sync +
route-bundle-parity (NO regen) + invariance + restream + graph gates green · headless per-edge
bench (perf-runs/profile-selfclear.mjs pattern) shows the prevention term ≥2× cheaper and total
per-edge ≥15 % down · commit `perf(PERF-19.4): incremental ancestor-proximity index (byte-identical)`.

> **STATUS (2026-07-14, worktree perf-19): DESIGNED + DEFERRED to the clean-window measurement pass —
> NOT yet implemented.** Rationale: unlike items 1-3 (safe wins that cannot regress even with the
> exact speedup unmeasured), item 4's ONLY payoff is speed, and its byte-identical-but-slower failure
> mode is a SILENT REGRESSION — the incremental structure's per-op hashing can exceed the O(depth)
> walk it replaces unless it's an open-addressed typed-array hash (the codebase deliberately avoids
> Map/Set in this hot loop: "Map/Set/object-per-node allocation + hashing + GC dominated that").
> So item 4 CANNOT responsibly ship until benchmarked (per-edge ≥15 % down), and the user confirmed the
> machine is under other test workers — "wouldn't rely on a cold test until much later." Implementing +
> committing now would mean shipping an unbenchmarked hot-loop rewrite of the router that emits real
> roads. Deferring it into the same clean pass that measures items 2/3/5 is correct.
>
> **Design (ready to implement, byte-identical BY CONSTRUCTION):** replace the per-expansion ancestor-
> chain gather (road-carve.js ~1005-1020, the `for st=sid…SP[st]` walk into `_scN*`) with a
> **current-path spatial grid** maintained incrementally:
> - Add `_apcDepth` Int32Array (parent depth + 1); mirror into road-worker.js ROUTE SYNC region.
> - Grid cell = `scReach` (= scMaxL + scD); a state contributes its endpoint (SX/SZ @ SL) and entering-
>   midpoint (SMx/SMz @ mpos) samples. At expansion, transition the grid from the previous popped node's
>   root-path to `sid`'s root-path via an LCA diff (level the deeper via `_apcDepth`, lockstep to the
>   LCA): POP the departing tail's samples, PUSH the arriving tail's. A push-record stack makes removal
>   per-cell LIFO-correct (path pops are reverse-of-push, and within a cell entries are in depth order,
>   so the tail is always the popped state's — proven).
> - `selfHit` queries the node cell's 3×3 neighbourhood instead of the linear `_scN*` list. The grid is a
>   SUPERSET of the walk's gather (spatial 3×3 ⊇ scReach-of-node; all path samples ⊇ the lim-filtered
>   subset) and `selfHit`'s EXACT scD²/scGap arc-separation test is unchanged → IDENTICAL accept/reject.
>   `selfHit` short-circuits on first hit → order-independent → deterministic/window-invariant.
> - Win source: per-expansion cost drops from O(depth) to O(path-diff between consecutive best-first
>   pops); locality-dependent, hence the mandatory ≥15 % bench gate before commit.
> - **Verification plan (run in the clean pass):** exact-chain A/B — route ~50 edges × 3 seeds (INCLUDING
>   seed-6's pigtail/repair edge) through pristine `git show HEAD:src/road-carve.js` vs the new path,
>   diff emitted primitive chains → must be zero; then route-worker-sync + route-bundle-parity (NO
>   regen) + invariance + restream + graph gates green; then the per-edge bench for the ≥15 % / prevention-
>   ≥2× numbers. Storage must be the open-addressed typed-array hash, not a Map, or the bench will show
>   no win.

## Item 5 — Vite (PERF-04, USER-APPROVED — biggest blast radius, land last)

Adopt Vite to kill the ~0.9 s import waterfall (20-file ESM chain + CDN three.js): helps EVERY
load on every machine (Arc 140 measured ~8 s of waterfall). Requirements:
- Dev: `vite` dev server replaces `npx serve`/nocache for humans; the TEST HARNESS must keep
  working — decide and document how test/profile.mjs + screenshot.mjs point at it (they take
  `--port`; vite serves index.html at /, query strings intact — verify `?prof=1&seed=` behave).
- Three.js: move from CDN importmap to the npm dep (package.json already pins three@0.184.0
  byte-identical to the importmap — verify version match; gates import the same files).
- Workers: the terrain + road workers are Blob workers built from template strings — bundler-
  invisible, should work untouched; verify both spin up in the built output.
- Build: `vite build` output must run on GitHub Pages (relative base). Set up the deploy path
  (gh-pages Action or docs/ output — implement, document in README/CLAUDE.md, and NOTE for the
  user what repo-settings flip they must do; do not change Pages settings yourself).
- Update CLAUDE.md: the "no build system" constraint is superseded by this user decision —
  rewrite the Technology Stack + constraint bullets honestly (dev = vite, deploy = built,
  gates unchanged pure-node).
- src/perf.js TEMP probes: PERF-04's old note said "strip when this closes" — DO NOT strip; the
  PERF-08 harness depends on them (?prof=1). Update the PERF-04 ticket text instead.
- Close .planning/todos/pending/perf-build-system-bundler.md (PERF-04) into completed/ with a
  resolution pointing here.

**Checkpoint 5:** `npm run test:all` green (gates are pure node — must be untouched) · vite dev:
game boots, ?prof=1 handles live, profile.mjs idle run works against it · `vite build` + serve
the dist locally: game boots from built output, coldload seed-6 measured — pre-ready time
(nav→ready minus route-warm) cut vs baseline; report the waterfall delta explicitly · screenshot
the junction landmark from the BUILT output (asset paths survive) · commit
`feat(PERF-04/PERF-19.5): Vite build — kill the import waterfall` (+ CLAUDE.md + ticket moves).

> **STATUS (2026-07-14, worktree perf-19): SCOPED + DEFERRED to the clean-window pass — NOT yet
> implemented.** Its whole payoff (the ~0.9 s import-waterfall cut) is a MEASUREMENT the user said is
> unreliable now ("wouldn't rely on a cold test until much later" — other worktrees running tests on
> the fanless M4), and its completion criterion is "game boots (dev AND built)" — browser verification
> best done in one clean focused session, not interleaved with running test workers. It is the ticket's
> designated "biggest blast radius, land last" item. Below is the execution-ready plan (all runtime-
> asset edge cases already traced from the source).
>
> **node_modules FIRST (worktree hazard):** this worktree's node_modules is a SYMLINK to the main
> worktree's. Do NOT `npm install` against it (prunes the user's other workers' deps). Replace the
> symlink with an isolated install: `rm node_modules && npm install` (worktree package.json already
> pins three+simplex) `&& npm install -D vite`.
>
> **Migration steps:**
> - `package.json`: move three@0.184.0 + simplex-noise@4.0.3 to `dependencies`; add `vite` devDep;
>   scripts `dev: vite --port 8000`, `build: vite build`, `preview: vite preview`. KEEP `test`/`test:all`
>   pure-node (untouched — gates must not change).
> - `vite.config.js`: `base: './'` (GitHub Pages subpath-safe), `resolve.alias { 'three/addons/':
>   'three/examples/jsm/' }` (sky.js/debug.js/vehicle-model.js/prop-geometry.js import `three/addons/*`;
>   npm three ships them at examples/jsm), `server.port: 8000` (keeps test/profile.mjs + screenshot.mjs
>   `--port` default working; query strings `?prof=1&seed=` pass through vite untouched — verify),
>   `build.outDir: 'dist'`.
> - `index.html`: DELETE the `<script type="importmap">` block (vite resolves the bare `three` /
>   `three/addons/` / `simplex-noise` specifiers); keep `<script type="module" src="src/main.js">`.
> - **Runtime static asset — the ONE real gotcha:** `src/route-store.js` does
>   `fetch('data/route-cache-default.json.gz')` (a runtime fetch, NOT an import). Vite only serves/
>   copies runtime-fetched assets from `publicDir`. Do NOT use a `?url` import (would break the pure-
>   node gates that import route-store.js). Instead: `publicDir: 'public'` and ensure the .gz is served
>   at `data/route-cache-default.json.gz` — simplest is a tiny copy step (vite-plugin-static-copy or a
>   4-line inline plugin copying `data/route-cache-default.json.gz` → `dist/data/`), leaving `data/`
>   (ranger.js etc., which ARE imported+bundled) in place and the fetch URL unchanged. Verify the
>   fetch resolves in BOTH dev and built output. (Confirm no other runtime `fetch()` of a repo asset.)
> - **Build-version probe:** `src/version.js` fetches `new URL('./main.js', import.meta.url)` for the
>   debug panel's build stamp — `./main.js` won't exist post-bundle (it degrades gracefully to
>   'unknown …', never throws). Minimal fix: probe the module's OWN url — `new URL(import.meta.url).href`
>   — real file with Last-Modified in dev AND built (hashed bundle). Equivalent freshness signal.
> - **Workers are FINE untouched:** terrain (WORKER_SOURCE) + road (ROAD_WORKER_SOURCE) are Blob
>   classic workers built from template STRINGS (`new Blob([SRC]); new Worker(blobURL)`) — bundler-
>   invisible; the string constants survive bundling. Verify both spin up in `vite build` output. The
>   route-worker-sync gate compares SOURCE files, unaffected by build.
> - **GLTF:** vehicle-model.js `new GLTFLoader().load(spec.url,…)` — confirm spec.url (procedural
>   fallback vs a real .glb in assets/); if a real asset, place under public/ so it's copied.
> - **Deploy:** repo remote = github.com:ledogen/Autos; no existing CI. Add `.github/workflows/deploy.yml`
>   (checkout → setup-node → `npm ci` → `npm run build` → upload-pages-artifact `dist` → deploy-pages).
>   USER MUST FLIP: repo Settings → Pages → Source = "GitHub Actions" (currently "Deploy from branch").
>   Do NOT change Pages settings myself. Keeps source clean (no committed build output).
> - **src/perf.js TEMP probes:** DO NOT strip (PERF-08 ?prof=1 harness depends on them — PERF-04's old
>   "strip on close" note is obsolete; update PERF-04 ticket text).
> - **CLAUDE.md:** rewrite the "no build system" constraint + Technology-Stack bullets: dev = vite dev
>   server, deploy = `vite build` via GitHub Actions, three from npm (byte-identical to the retired
>   importmap pin), gates unchanged pure-node.
> - Close `.planning/todos/pending/perf-build-system-bundler.md` (PERF-04) → completed/ pointing here.
>
> **Verify (clean pass):** `npm run test:all` green · `npm run dev` → game boots, ?prof=1 live,
> `node test/profile.mjs --scenario=idle --port=8000` works · `npm run build` + serve dist → game boots
> from built output, worker blobs spin up, route bundle fetch 200s, junction (224,-192) screenshot
> matches · coldload seed-6: report the nav→ready waterfall delta explicitly.

---

## Final acceptance (after all five)

- [ ] Per-item checkpoints all recorded in this ticket with YOUR measured numbers (never
      fabricate; a missed target gets a MISSED note, not silence — see PERF-17/18 precedent).
- [ ] `npm run test:all` green (known-red GRAPH-REACHABILITY 78 % excepted — record its value,
      flag any movement).
- [ ] Combined cold-load table: seed 6 + seed 42, ready + ring-complete, HEAD-before vs after,
      interleaved A/B protocol.
- [ ] No route changed anywhere (parity green without regen through items 1-4; item 5 doesn't
      touch routing). No visual change anywhere except faster loading (screenshots: spawn,
      junction (224,-192), one pond/stream site).
- [ ] FINDINGS.md addendum; this ticket → completed/ (or pending with MISSED notes per item).
- [ ] One commit per item (bisectable); push NOT included — leave that to the user.
