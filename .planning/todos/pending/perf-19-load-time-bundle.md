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
