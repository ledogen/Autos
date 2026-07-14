# PERF-08 Phase 2 — Performance Findings (2026-07-13)

Baseline: post visual-polish merge (`1103240`) + harness (`0baf3b6`). M4 MacBook Air, AC power,
Chrome headless `--use-angle=metal`, 1400×900. Harness: `test/profile.mjs` (scenarios + levers),
`test/trace-report.mjs` (thread-attributed busy %), `test/bench-worldgen.mjs` (headless routing).

## Methodology & caveats

- 19 sequential runs, fresh Chrome each, 75 s cooldown between runs; two CONTROL runs bracket the
  lever sweep (start + end) — they agree within ~2 pp on busy %, so thermal drift did not skew the
  ordering.
- **Headless caveat 1 — vsync pin:** every scenario holds 60 fps (p50 = 16.7 ms), so *frame time
  does not discriminate*. The discriminating metrics are renderer-main busy %, GPU-process busy %,
  per-worker busy %, draws, and triangles.
- **Headless caveat 2 — fragment cost unmeasured:** headless devicePixelRatio = 1 at 1400×900.
  The `pixelRatio` / `noaa` / fragment-side `detailScale` levers are structurally no-ops here.
  Retina fragment load (the likely biggest *GPU-watt* term on the Air's 2560×1664 panel) must be
  judged from a headed run or simply shipped per the pre-approved Normal resolution cap and felt.
- GPU timer ext (`EXT_disjoint_timer_query_webgl2`) IS available on this stack — future harness
  upgrade can read real GPU pass times instead of inferring.
- **Correction (post-sweep, PERF-09 closure): the wk%/thread column measures the COLD-LOAD WARM
  TAIL, not steady state.** Direct dispatch-count probing showed the route warm converges (~227
  jobs, pending→0, no re-dispatch) ~25 s after load and the pool then goes fully quiet; the sweep's
  idle windows opened ~10 s after nav and overlapped the tail. True steady-state worker busy ≈ 0 %.
  profile.mjs now drains the warm tail before opening the window; wk numbers below are historical.

## Idle @ Normal — single-lever A/B (30 s, traced; busy % = share of wall)

| lever                | draws | tris  | main% | gpu% | wk%/thread |
|----------------------|-------|-------|-------|------|------------|
| CONTROL (start)      | 158¹  | 2.26M | 31.6  | 13.3 | 58.2       |
| sunShadow:0          | 149   | 2.28M | 22.7  | 10.3 | 63.9       |
| propCastShadow:0     | 82    | 2.27M | 18.1  | 8.3  | 63.9       |
| propCountCompact:1   | 89    | 0.35M | 19.9  | 8.2  | 63.8       |
| detailScale:0        | 82    | 2.27M | 24.2  | 11.6 | 64.6       |
| pixelRatio:1 (no-op²)| 80    | 2.27M | 24.7  | 11.3 | 66.4       |
| shadowMapSize:1024   | 81    | 2.27M | 25.4  | 11.7 | 64.2       |
| shadowExtent:160     | 80    | 2.27M | 29.7  | 13.4 | 65.0       |
| ring:1               | 72    | 2.20M | 21.1  | 10.8 | 64.1       |
| noaa (no-op²)        | 81    | 2.27M | 19.1  | 9.3  | 62.8       |
| CONTROL (end)        | 85¹   | 2.31M | 29.7  | 14.0 | 65.2       |

¹ draw-call sample races the shadow-pass counter; tris and busy % are the stable columns.
² see headless caveat 2.

**Presets (idle 30 s):** Low main 15.1 / gpu 7.6 / wk 26.5, p99 20.3 · Normal ≈30 / ≈13.5 / ≈62,
p99 55–67 (!) · High 16.5 / 8.2 / 28.4, p99 21.1.
**Play (Normal):** drive wk 20.1 %, p99 18.7 · stream wk 27.8 %, p99 24.6.

## Where Normal's budget actually goes (ranked)

1. ~~Road-worker pool grinding at idle~~ — **RETRACTED (PERF-09 closed invalid).** The 58–68 %
   worker busy was the legitimate cold-load warm tail caught inside a too-early measurement
   window; the pool self-quiesces at ~25 s post-load and stays quiet (probe: 227 dispatches
   total, zero repeats, pending drains to 0). Residual truth: each page load costs ~25 s × ~3
   cores of one-time routing heat (PREWARM scope could shrink it if it ever matters), and the
   idle p99 55–67 ms spikes likely belong to the same tail (re-verify post-fix with the drained
   window).
2. **Props: hidden instances are ~85 % of all triangles.** Count compaction drops 2.26M → 0.35M
   tris. Every InstancedMesh draws full capacity (`mesh.count = perVariant`; ~24 k slots, hidden
   ones as zero-scale matrices) through the vertex stage — main *and* shadow pass. → **PERF-10**.
3. **Prop shadow-pass draws:** `propCastShadow:0` cuts main-thread busy 31.6→18.1 % and gpu
   13.3→8.3 % (−76 draw calls). The full shadow pass (`sunShadow:0`) is ~9 pp of main. Compaction
   (fix 2) shrinks the same shadow-pass work; the remaining policy call (which categories cast)
   is PERF-07's, post-compaction re-measure. → folded into **PERF-10**.
4. **Retina fragment cost — unmeasured here, pre-approved fix.** Ship the Normal render-resolution
   cap (~1200 lines) and judge by eye + feel on the Air. → **PERF-11**.
5. **Shadow map size/extent:** small in headless busy terms (≤1 pp); still worth scaling per
   preset for texel density + memory once PERF-10 lands, low priority. → **PERF-12**.
6. **HUD DOM writes:** Layout+Paint+PrePaint ≈ 0.8 % of wall in traces. NO ACTION — not worth the
   churn.
7. **detailScale / AA / ring:** no headless signal (fragment-bound / already streamed); revisit
   headed only if thermals persist after 1–4.

## Cold load

| case | ready (first frame) | ring-complete |
|---|---|---|
| seed 6 (bundled cache) ×2 | 1614 / 1684 ms | 3180 / 3270 ms |
| seed 42 (cache miss)      | 7089 ms        | 7992 ms        |

- Seed 6 is already good (1.6 s to drive, 3.2 s to full ring — matches QUAL-14's shipped number).
  The 1.6 s ready→ring gap is the 1-chunk/frame + 1-road-tile/frame trickle → **PERF-13**
  (initial-fill burst) can shave ~1 s of visible pop-in; modest win.
- Seed 42 pays ~5.5 s of live routing before first frame (workers 84.7 % busy through the run).
  Real fix is warm-scope reduction (route only spawn-critical connections first) — ticket-worthy
  but behind PERF-09/10/11. Headless bench corroborates: full cold network for one center ≈ 24 s
  of single-thread routing (seed 6, `test/bench-worldgen.mjs`); the pool + band scoping hide most
  of it.
- Terrain chunk main-thread stages are NOT a load-time problem: ~4.8 ms/chunk main-thread
  (carve 3.7 + normals 0.2 + colors 0.8), ≈ 0.12 s per Normal ring. Worker offload would only
  smooth hitches; deprioritized.

## Blessed baselines (post-merge, pre-fix)

- Idle Normal: main ~30 %, gpu ~13.5 %, tris 2.26M, p99 ~60 ms (window included warm tail —
  re-bless after PERF-10 with the drained window; steady-state workers ≈ 0 %).
- Drive Normal: p99 18.7 ms, dropped 0.44 %.
- Cold seed 6: ready ~1.65 s, ring ~3.2 s. Cold seed 42: ready ~7.1 s.
- Suite: `npm test` wall ~708 s on pool 8 (gate-cpu ~3556 s); known-red GRAPH-REACHABILITY.

## Phase 3 plan (from these numbers)

PERF-10 (prop count compaction + shadow policy) → PERF-11 (Normal res cap ~1200p) → PERF-12
(shadow map/extent per preset) → PERF-13 (initial-fill burst). PERF-09 closed invalid (no worker
loop). Deferred: seed-42 spawn scope, terrain-generate parallelization (the real ready→ring
lever — see PERF-13 outcome), carve-to-worker, HUD batching, warm-tail scope, PERF-04 (Vite —
the ~0.9 s pre-ready import waterfall is visible in the coldload traces for when that decision
runs).

## Phase 3 outcomes (all shipped 2026-07-13; measured with the warm-drained window)

| metric (idle Normal, seed 6) | before | after |
|---|---|---|
| triangles | 2.26M | **0.36M** |
| draw calls | ~158 | 80 |
| renderer main busy | ~30 % | **18.9 %** |
| GPU process busy (headless) | ~13.5 % | 10.5 % |
| p99 frame | ~60 ms | **18.7 ms** |
| dropped | ~2.5 % | 0.31 % |
| workers (steady state) | — | 0 % (quiet) |

Drive Normal post-fix: p99 18.6 ms, dropped 0.65 %. Cold seed 6: ready ~1.68 s, ring ~3.09 s
(PERF-13 saved only ~0.1–0.2 s — fill is terrain-worker-generate-bound; see ticket). The
PERF-11 Retina fragment win is NOT in these headless numbers — expect the largest thermal
improvement on-device from the Normal 1200-line cap. **User verification: play at Normal on the
Air and judge sharpness + chassis temperature; if soft, raise resHeight 1200 → 1300–1440.**
(User-confirmed 2026-07-13: GPU power at Normal idle gameplay ~8 W → ~0.8 W after PERF-10..12.)

## PERF-14/15 addendum (streaming stutter + cold-load investigation, 2026-07-13 evening)

- **Streaming stutter FIXED (PERF-14, c964e4a):** hitch attribution showed prop scatter ran
  100–190 ms synchronously per chunk-row entry (4.68 s of 4.9 s hitch time at 60 m/s freecam);
  sub-causes: lazy water detection first-touch (13–58 ms) + un-yielded FEAT-25 boost passes.
  Fixed with generator-sliced scatter (3 ms/frame budget, hard 3×3 around the vehicle), water
  `warmRegion` pump (2 ms/frame, 768 m lookahead). Result: 60 m/s sweep 39 hitches → 2 (dropped
  0.06 %), 120 m/s dropped 0.17 %. Residual rare hitches: single `_buildCarveTable` (~16 ms) and
  a single flow-trace unit — slice those if ever needed.
- **Cold load for NON-default seeds: ACCEPTED at 7–16 s (user decision 2026-07-13).** Bisect
  (worktree A/B, alternating runs) proved NO code regression — HEAD == a4828d8 == 0baf3b6; the
  spread is thermal-environment variance on the fanless Air. The cost is ~139 route jobs
  (~44–80 s worker CPU, dominated by a few 16-retry mountain edges per QUAL-14). Pool 4→8 was a
  measured REGRESSION (E-core stragglers + thermal spike) — cap stays 4; dispatch is now
  pull-model with in-flight 2 (PERF-15, 1075294), which removes bucket stragglers. Rejected
  structural options (recorded for posterity): async road pop-in (~2 s playable), smaller probe
  tier (spawn shift), IndexedDB persistence (vetoed 2026-07-06, not reopened).
- **Measurement discipline gotchas (fanless M4):** never measure with `npm test` or another
  Chrome running; the machine self-heats from repeated cold-load runs (each is ~1 min × 4 cores)
  — interleave A/B variants and treat >2× day-to-day swings as thermal until bisected.
  `npx serve` 301-strips query strings from /index.html URLs — profile/screenshot runs against a
  worktree need `python3 -m http.server` (or test/nocache-server.py).

## PERF-17 addendum (hierarchical corridor routing, 2026-07-13)

- **Corridor shipped at 60 m half-width** (`roadRouteCorridorHalfWidth`, slider): coarse pass
  (step ×4, cell ×2, hbins ÷2) → stay-inside disc capsule → unchanged fine pass + escape hatch.
  Headless band routing seeds 42/1337/9001: **1.5–1.9×** (median per-edge 152→90 ms); browser
  cold load seed 42 interleaved A/B: **ready 6.9 s → 4.4–4.8 s (~1.5×)**, ring 7.8 → 5.5 s.
  Escape rate ≤0.7 % of edges. GRAPH-REACHABILITY largest-component 78 % → 70 % at the shipped
  CELL_MULT 3 (red flag, reported; the CELL_MULT-2 variant measured 81 % but erased the seed-6
  junction hairpin — character won the trade). Routes changed once (accepted); landmark
  before/afters in perf-runs/.
- **Why not the 3× target:** corridor width is character-bound — 30–40 m reaches 2.7–3.4× but
  erases the seed-6 junction hairpin at (224,−192) regardless of coarse-pass fidelity (its loop
  needs ≈60 m half-width). And the corridor only cuts the SEARCH (~2×: 118.6→60.5 ms/edge);
  self-clearance + refit are a ~42 ms/edge fixed floor that now dominates. Next levers: dial
  experiments (stack multiplicatively), refit/self-clearance cost, or per-seed-class widths.
- Bench + regen scripts: perf-runs/bench-corridor.mjs, perf-runs/gen-default-route-cache.mjs.

## PERF-18 addendum (per-edge fixed-floor attack — negative result, 2026-07-13)

- **The "42 ms/edge floor" is self-clearance PREVENTION + REPAIR, not scan/refit.** Decomposed
  (seed 42, corridor active, per-edge; perf-runs/profile-selfclear.mjs): bare search **65.8**,
  in-search self-clear prevention (per-expansion ancestor walk) **+18.9** (every edge), refit
  **+0.7**, post-emit `_selfClearScan` **+0.05**, self-clear repair re-searches **+20.3** (avg;
  ~20/143 edges dirty, each ≤16 full re-searches) → ~101 ms/edge. So the floor ≈ 40 ms is A(18.9)
  + repairs(20.3), NOT the scan (0.05) + refit (0.7) the ticket assumed.
- **Items 1/2a target sub-ms costs → rejected.** Item 2b (refit must not introduce grazes) was
  **already implemented** (the `scPick` guard in the refit block ships the pre-refit chain when
  refit would raise the self-clear violation count) — route-change count 0.
- **Item 3 (segment coarse pass) is a NET REGRESSION.** A 2-radius `[gentle,hard]` palette + hbins=8
  cut the coarse pass **5.73 → 2.32 ms/edge** deterministically, but the changed coarse route
  perturbs the corridor → downstream fine-search + repair cost rose MORE: interleaved seed-42
  full-flow **OLD 100.6/100.8 vs NEW 104.4/104.5 ms/edge (~+4 ms)**. Character held (hairpin intact,
  parity green after regen) but no speed win → reverted. LESSON: cheapening the coarse pass is a
  false economy — it is ~5 % of the total and any change to it re-shapes the corridor, and the
  corridor shape drives the self-clear repair count that dominates.
- **Item 4 (heur dial) spent post-corridor.** `roadArcHeurWeight` 1.5→2.5: 102.4 → 101.9 ms/edge.
  The corridor already bounds the search; the A* heuristic-inflation lever (a pre-corridor speedup)
  has nothing left to prune.
- **Verdict: ≥3× is unreachable without weakening in-search self-clearance (forbidden).** No src
  change shipped. Real follow-on levers live inside the prevention/repair machinery: a byte-identical
  incremental ancestor-proximity index for the 18.9 ms in-search walk, or corridor-kept repair
  re-searches for the 20.3 ms repair loop — both need dedicated invariance work.
- **Measurement gotcha reinforced:** fanless-M4 node benchmarks still drift ~±4 ms/edge across
  separately-launched processes (esp. right after a CPU-heavy run). Interleave OLD/NEW via
  `git stash` within one shell session and take best-of-N; a single cross-process delta < ~5 % is
  noise. (Router bench profiles: profile-selfclear/split/pcoarse/ab-quick/item4-heur.mjs.)

## PERF-17 REVERTED (2026-07-14, user verdict)

The corridor router shipped in `aebc443` was fully reverted: the user found a road-character
regression at the seed-6 SPAWN area (in addition to the relocated hairpin already flagged in
review). "Interesting experiment, not what I want." Old router + old bundled cache restored
together; the ticket in pending/ keeps the full design + measurements for any future retry.
Cold-load numbers return to the pre-corridor baseline (seed-42 ready ~6.6-6.9 s same-conditions).
The PERF-18 decomposition remains valid FOR THE CORRIDOR CONFIG it measured; the bare-router
floor anatomy (prevention walk + repair loop dominate; scan/refit negligible) is
config-independent and still the guide for any future routing perf work.
