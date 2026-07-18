# Worldgen cold-load proposals (road routing first)

> **STATUS 2026-07-17:** user drove the candidates and APPROVED the shipped preset:
> `roadCorridorTwoPass=true` (heuristic, hScale 1.0) + `roadSoloReuse=true` +
> `roadGraphWTurn=1750` (was 800 — straighter, fewer-turn roads chosen as part of the same
> feel pass). Defaults flipped, bundle re-baked (8.9 s — the new router baking itself),
> BUNDLE-SIG + PARITY green. Solo-reuse gained a window-invariance fix during the rebake:
> adoption now ALWAYS resolves the edge's own solo (pure per-edge fn) — an adopted-vs-searched
> decision must never depend on what a wider stream window happened to cache.
> **2026-07-18:** P0 + P5 DESCOPED (random seed every run — persistence never re-hits);
> junction thinning shipped default-on. Open: P3 (re-measure) + P4.

Session 2026-07-16, worktree `CarGame-perf-worldgen`. All numbers measured on the M4 Air,
headless node harness, seed 6 unless noted. Two windows used: the **bench window** (spawn-style
stream at origin, ~50 edges, baseline **26.8 s** single-threaded) and the **landmark window**
(road-character window, cx=-975 cz=765 r=1400, ~43 runs / 39 km, baseline **57.4 s**).
The browser's ~15 s cold load is this same work split across the 2–4 route workers (PERF-15
pull-model pool; 8 workers measured slower — fanless thermals).

## Where the time actually goes (measured)

| What | Number |
|---|---|
| Road routing share of cold load | ~99% (search-ms 26.5 s of 26.8 s bench window) |
| Searches per cold stream | 122 for ~50 edges (solo routes + final routes + repairs) |
| Node expansions | 11.45 M total, ~94 k per search, 2.3 µs each |
| Searches that never reach goal | 13 (escape hatch: 5 full re-searches) |
| Terrain main-thread cost | 5.2 ms/chunk (~0.15 s per ring) — **not a problem** |
| Water / props at load | not visible in the profile — **not a problem** |

**The architectural root cause** (confirms the user's instinct): the A* heuristic prices only
distance (wHeur·wDist ≈ 1.5/m) while the real cost is dominated by the valley/grade terms
(≥ ~80/m at baseline altitude). The heuristic is ~2% of true cost → the search floods the
lattice near-Dijkstra. That flooding is also what finds the pretty valley lines — feel and
cost share one mechanism, which is why micro-optimization can't fix this.

**Dead ends, measured so far** (do not retry):
- Expansion-loop micro-opts (trig hoisting via angle-addition): 0% in a clean A/B; V8 already
  optimal there; breaks route-bundle byte-parity for nothing. Reverted.
- Disc-test micro-opts (r² precompute + bbox early-out): byte-identical, kept, but within noise.
- PERF-19.4 ancestor index: WONTFIX on a prior clean-machine profile (6 ns/iter walk).
- More workers: 8 measured slower than 4 (PERF-15).
- wHeur 2.5: topology changed AND slower than wHeur 2.0 (greed → more self-clear repairs).
- hbins 24→16: ×1.67 but grade max +6.9 pt and topology churn; combined with wHeur 2.0 it
  wrecks the feel (straight% +13.8 pt, grade p95 +21.5 pt).
- Corridor **tube** mode (built, kept behind `roadCorridorMode:'tube'`): only ×1.25 — the fine
  search still fills ~70% of the tube — with worse feel damage than heuristic mode.

## The feel contract (how we make "feel" objective)

`test/dump-network.mjs` + `test/feel-diff.mjs` (new, this worktree) compare a candidate world
against the shipped baseline on three layers:

1. **Topology** — which runs exist (runKey set). Changes here = the network itself changed.
2. **Geometry** — per-kept-run lateral deviation in metres (did the road move on the hillside).
3. **Character** — length-weighted curvature-band shares (sweep/gentle/medium/hairpin),
   straight %, grade p95/max — the distributions the road feel was tuned on.

Proposed acceptance bands (user to ratify): byte-equivalent = topology identical + max lateral
< 1 m. "Same feel" = topology identical + character deltas < 2 pt (user drives it to confirm).
Anything with topology changes = new world character → map2d screenshots + drive test before
adoption. `test/road-character.mjs --json` remains the deep-dive tool; these two are the gate.

## Proposals, ranked

### P0 — Per-seed persistent route cache (IndexedDB). **DESCOPED 2026-07-18 (user):** too
much data storage, and story-mode runs will use a "random" seed every run — a per-seed
persistent cache never gets a second hit. The 2026-07-06 "no IndexedDB hoard" decision
stands after all; the in-session Map + bundled default-seed asset remain the only caches.
Consequence: FIRST-generation cost is THE cost — the router speedups (shipped) and P4 are
the whole game. Original proposal kept below for the record.
`exportRouteCache()`/`importRouteCache()` + `routeCacheSig()` already exist; an in-session Map
already does this for seed toggles, and the default seed ships as a bundled asset. Add an IDB
layer keyed by `routeCacheSig(seed, params)` (same staleness guard: sig mismatch = miss).
NOTE: this was explicitly rejected 2026-07-06 ("no per-world IndexedDB hoard", cleanup line
still in main.js) — the user re-approved persistent caching 2026-07-16 for this effort.
Story-mode fit: roguelike runs revisit seeds → second visit free. Cost: ~1 day incl. eviction
policy (LRU by seed, cap ~50 MB) + gate.

### P1 — Solo-reuse precheck (`roadSoloReuse`, built, default off). ×1.24, near-identical feel.
Half of all final searches return a byte-identical copy of the edge's solo route. When the
sibling corridor discs never come within 2 m-sampled reach of the cached solo, adopt it as the
final — no second search, and in the browser no worker job at all.
Measured (landmark window): ×1.24, all 43 kept runs byte-identical, **one extra edge appears**
(a cull flip from one changed final). Needs: user map2d look at the added edge; bundle rebake.

### P2 — Corridor-heuristic router (`roadCorridorTwoPass` + `mode:'heuristic'`, built, default
off). **×2.3–2.6, biggest single lever.** Same character bands, different individual roads.
Coarse lattice (24 m cells, 12 heading bins, same cost model & discs) floods BACKWARD from the
goal in ~4 ms/edge; its per-cell min cost becomes the fine search's heuristic — the search
finally knows the real remaining terrain cost and stops flooding (11.45 M → 5.2 M expansions).
Measured at hScale 1.0 (landmark window): ×2.57; topology 4−/11+ (network +8.4 km, +21% —
straighter-to-goal routes cross siblings less → fewer culls); every kept run moved (mean 27 m);
character bands preserved within ≤4.4 pt. `roadCorridorHScale` trades speed vs closeness to
the current optimum (sweep results below). This is a **new world character** in the same style —
needs a drive test. If approved, it also re-tunes cleanly: the windiness levers (wAlt, maxGrade,
wTurn) all still work, priced identically in both passes.
  - hScale sweep (landmark window): **1.0 → ×2.57**, topology 4−/11+, mean lateral 27 m,
    +8.4 km. 0.8 → ×2.42 with NO feel benefit (3−/13+, 29 m — don't bother). 0.6 → ×1.60,
    visibly closer to baseline (2−/5+, 21 m, +2.9 km, grade p95 Δ+0.2) — the fallback setting
    if 1.0 fails the drive test.

**P1 + P2 stack** (bench window, both flags on): 26.8 s → **10.5 s (×2.55)**, 122 → 182
searches but 11.45 M → 4.56 M expansions — the floods are many and cheap.
Multi-seed (landmark windows, vs each seed's own baseline): seed 42 **×3.16**
(200.6 s → 63.5 s), seed 1337 **×3.03** (128.0 s → 42.3 s). Character bands stable within
~3 pt on both; topology churn similar to seed 6 (3−/12+ and 4−/9+); grade *max* (worst single
sample — volatile by construction) moved +26 pt on 42 and −15 pt on 1337 while grade p95
stayed within ±1.3 pt — check 42's worst spot on the map during the drive test.

### P3 — wHeur 1.5 → 2.0 (`roadArcHeurWeight`). ×1.37, smallest feel delta of the lot.
Topology identical, 40/43 runs byte-identical, 3 runs move (worst 51 m), character Δ ≤ 1 pt.
Cheapest approval: no code, one param. Stacks with P1 (multiplicative, both touch different
waste). Does NOT stack well with P2 (P2's field replaces the distance heuristic's role;
re-measure the pair if P2 is adopted).

### P4 — Prune the not-found tail. 13 searches/stream burn caps without reaching the goal
(some at the full 300 k maxNodes ≈ 0.7 s each). Options, all deterministic: (a) escape-hatch
earlier via a stall detector (bestD2 not improving for N expansions); (b) in corridor-heuristic
mode the backward flood already knows unreachability — skip the fine search outright when the
start cell's field is Infinity. (b) is free with P2 and exact; (a) needs feel-diff validation.
Est. ~5–10% on top of whatever else ships.

### P5 — Pre-baked route bundles for curated story seeds. **DEAD by the same 2026-07-18
decision:** every story run is a random seed, so there is no curated list to bake.

## Quality presets (low / med / high / ultra)

Hard rule (user, 2026-07-16): determinism holds — same seed ⇒ same road topology, terrain
heights, prop placement/density on every machine at every preset. Collision props are gameplay.
So presets must NOT touch: any `road*` routing param, terrain noise params, prop scatter.

What presets MAY vary (all pacing/memory, not world state):
- **Generation radius & staging**: how far ahead the band pre-warms (PREWARM margins), spawn
  ring size (PERF-19.3 already caps recenter at min(radius,228)).
- **Active-cache policy** (the user's "load more world then unload" idea): generate → keep the
  serialized route/chunk data in RAM/IDB → drop live meshes past a preset-sized ring →
  re-hydrate from cache on approach. World identical; only resident memory/GPU load varies.
- **Frame budgets**: chunk-build ms/frame, routing-job dispatch depth — slower machines stretch
  generation over more frames (world identical, arrival slower — hidden by the existing
  can't-outrun-generation margin).
- Render-side quality (draw distance, shadows, LOD, prop *rendering* density if and only if
  culling is visual-only) — owned by the other worktree; see HANDOFF-SEAM.md.

Preset sketch: LOW = smallest warm ring + smallest resident cache + lowest frame budgets;
MED = current defaults; HIGH = wider pre-warm + bigger resident cache; ULTRA = full PERF-02/03
draw distances + aggressive pre-warm. The routing speedups above shrink the *time*; presets
shrink the *concurrent load*.

## Terrain / water / props (the "second" ask)

Measured: already cheap at load (terrain 5.2 ms/chunk main-thread; water/props not visible).
The wins here are frame-time, not load-time, and mostly belong to the other worktree. One
worldgen-side item worth doing opportunistically: move carve-table/normals/colors to the
terrain worker (the bench's "move to Worker" prize, ~5.2 ms/chunk of main-thread stutter during
streaming) — but it's a streaming-smoothness win, not a cold-load win.

## Sequencing recommendation

1. User reviews this doc; drives P2 — the worktree dev server runs at
   **http://localhost:3859** and the debug menu's road folder now has
   `Corridor 2-Pass (perf)`, `Corridor HScale`, and `Solo Reuse (perf)` toggles (live
   re-route on change; M for the 2D map). Look at P1's one added edge and P3's three moved
   runs on map2d. (The bundled default-seed cache was re-signed for the new params — parity
   gate green — so seed 6 still boots from cache with the flags off.)
2. Ship P0 (caching) regardless — it's feel-free and makes everything else matter less.
3. Whichever of P1/P2/P3 gets approved: flip defaults, **re-bake
   `data/route-cache-default.json.gz`** (any new `road*` param already changes `routeCacheSig`,
   so the bundle MUST be regenerated in the same commit — the parity gate enforces this),
   run `npm run test:all`.
4. P4(b) rides with P2; P5 waits on the FEAT-28 seed-curation decision.

Cold-load outlook if P0+P1+P2 ship: new seed ~15 s → **~5–6 s** wall-clock on the M4 Air
(×2.5–3 on the routing that is 99% of it); revisited seed **< 1 s**.
