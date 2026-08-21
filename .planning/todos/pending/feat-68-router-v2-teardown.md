---
id: FEAT-68
type: feature
status: open
severity: major
opened: 2026-08-18
source: owner decision after the BUG-51 grade-ceiling work (feature/seed20-road, unmerged) — full
  requirements Q&A recorded 2026-08-18
relates: BUG-51 (absorbed — grade ceiling becomes core spec), BUG-52 (planner weights, separate),
  FEAT-28 (unsatisfiable region — its "no compliant interface" case shrinks under this),
  FEAT-40 (tunnels — subsumed by the profile stage), PERF-03/PERF-27 (cold load), QUAL-05/BUG-16
  (arc quantization — dies with the old router)
---

# FEAT-68: Router v2 — tear down, rebuild two-stage, iterate against driven character

**Naming (2026-08-18):** the outgoing router is the **arc-lattice router (v1)** — fixed-angle arc
primitives searched over a heading-binned lattice, de-quantized post-hoc. The replacement is the
**corridor router (v2)**. Named by mechanism, not just version, because the lattice IS one of the
named motivations for its death. NOT part of either name: the blue-noise/Urquhart/cull topology
layer — that is a separate layer and it survives.

## Vocabulary (so checkpoint reports and owner share a language)

- **Routed edge (v1):** the final road geometry, produced by a sequential (position, heading)
  search that crawls A→B in fixed-radius arc steps. It answers "which way / what height / what
  curve" with one vocabulary that can only express curves — so it fakes height with LENGTH
  (wander, pigtails) and commits locally then compensates (bowing, crossings). The wander is not
  a bug; it is v1's only vertical vocabulary.
- **Corridor (v2 stage 1):** a SWATH, not a road — a ~100 m-wide highlighter stroke on the
  smoothed (octave-truncated) terrain answering only "which valley / which side / which saddle."
  No heading, no radii, no geometry. Small enough to search exhaustively → no greediness → no
  dive-and-recover.
- **Profile (v2 stage 2):** the 1-D exact solve along the corridor — per station: on-grade, cut,
  fill, bore, or bridge, each priced. Elevation is bought with money, never faked with length.
- **Curve (v2 stage 3):** the smooth centerline generated INSIDE the swath from corridor +
  profile, continuous-curvature by construction. Generated, not searched.
- Corridors can still legitimately overlap where geography funnels them (one good pass, two
  connections) — a real, rare event for the crossing classifier, not a search artifact. That
  distinction is what inventory item 9 verifies.

## Why a teardown and not another patch

The current router is an accretion: hybrid A* over quantized heading bins + a fixed radius palette
+ Dubins terminals + a de-quantize refit + a self-clearance repair wrapper + a corridor coarse pass
+ escape hatches + pond/corridor discs + (on the unmerged branch) a grade portfolio. Each layer was
measured and justified alone; the composition is rules stacked on rules, and it is slow — up to
**45 s of world-ready wait on older hardware**.

The disqualifying finding is structural, not tunable, and it is MEASURED (`test/grade-cap-survey.mjs`
on feature/seed20-road, 10 seeds × 267 edges — do not re-derive):

- **The search prices a road that does not get built.** The router prices grade on a causal EMA;
  the builder ships a centered-box+tanh profile. Same edge: 169% priced, 118% built. A hard
  40% router-side cap BUILT MORE violations than no cap (13 vs 8), and the cap→built mapping is
  chaotic (tightening 40%→34% doubled one edge's built grade 51%→92%). The gap cannot be modelled
  away — a centered kernel is not computable mid-search. Every downstream rule exists to patch
  consequences of this one split.
- **The vertical dimension is not a decision anywhere.** Y is always a function of the XZ path and
  the surface. The router cannot price height, cannot price a bore (seed 20: a 202 m, 13%-grade
  straight-shot tunnel with 157 m of cover loses to a 2 502 m detour that ships at 58% sustained),
  and cannot price a span. FEAT-40 is a post-pass rescue on an alignment chosen blind — raising
  `tunnelMaxLen` gates a decision that never arises.

**North star, one sentence: the price the search pays IS the road the player drives.** Priced ==
built by construction. That single property deletes the steer/enforcer split, the portfolio, the
refit, and the Goodhart bug class, and it is what makes bores and bridges *possible* — they are
just profile states with prices.

## Architecture (decided 2026-08-18)

**Two-stage: corridor, then profile.**

1. **Corridor stage** — a cheap, coarse search over terrain that picks the lateral corridor. It
   prices a LOWER BOUND of the profile stage's cost (so the corridor never excludes the alignment
   the profile stage would have chosen — the admissibility contract between the stages).
2. **Profile stage** — an exact solve of the vertical alignment along the corridor, with the full
   vocabulary as explicit states: **on-grade, cut, fill, bore, bridge**, each with a per-metre
   price. Tunnels and bridges EMERGE where they are cheapest — never injected
   (`feedback_emergent_over_injected`). The profile the solver outputs is byte-for-byte the
   profile that registers, carves, and drives.

Rejected at decision time (do not re-litigate without new evidence): **joint 3D search** (state
space recreates the perf problem); **keep the XZ/profile split with a better model** (preserves the
priced≠built gap that caused everything above).

### Scope fence

- **The run contract survives.** Downstream consumers (carve, mesh, physics, GPS, par, missions,
  map) read registered runs: centerline + graded profile + spans. Router v2 is a swap behind that
  contract, not a worldgen rewrite. Bores reuse FEAT-40's span/render/physics machinery; bridges
  are the one genuinely NEW downstream surface (deck mesh, physics, under-bridge space) and may
  ship visually crude first.
- **The topology layer stays.** Blue-noise sites + escape-score ranking + Urquhart + degree/
  crossing/clearance culls were just validated for connectivity (0.981 / 8-of-10) and are cleanly
  separable — the router's job is "connect this anchor pair", not "choose the pairs".
- **Streams keep causeways** (`project_stream_crossing_causeway`). Valley-spanning bridges do not
  reverse that ruling.
- **Terrain interface (read-side only — generation is untouchable).** Terrain co-design was
  considered and rejected on principle: terrain bending to meet roads inverts
  `feedback_emergent_over_injected` — the land must not negotiate back, or mountains stop being
  real. The carve (and now bores/bridges) is the only sanctioned "terrain adapts to road"
  mechanism: local, bounded, downstream. Two cheap ADDITIVE read APIs are in scope though, world
  byte-identical: (a) **octave-truncated sampling** — the corridor stage searches the coarse noise
  evaluated at its first K octaves: same world low-passed, faster per sample, and the low-octave
  skeleton of ridged noise is where the real passes/valleys live; (b) **analytic gradients** —
  simplex noise has closed-form derivatives, letting the profile stage price slope without the
  finite-difference sample burn v1 pays.
- **No verbatim worker mirror.** The ROUTE SYNC copied-string arrangement is a standing tax
  (byte-identical template-literal mirror + escaping + a gate). Router v2 must be architected so
  the worker and main thread share ONE canonical source (build-time splice or shared module), with
  the same determinism guarantee.

## Character spec (owner's words, 2026-08-18 — this is what checkpoints are judged against)

The umbrella is **fun to drive**, and it is NOT in tension with terrain honesty:

> "The most fun to drive road is one that does hug the terrain, that does switch back occasionally,
> dip into valleys, and give you zero g over hills if you're cooking."

> "A dead straight road, as an elevated bridge over terrain, because it's the easiest to drive,
> does not make it the most fun to drive."

- **Terrain-honest ≡ believable** — the owner ranks these as the same thing, and they are the
  non-negotiable. Roads negotiate with the land like a county with a budget: tunnels where a tunnel
  is obvious, no 2.5 km loops around a 200 m bore.
- **Crest airtime is a FEATURE.** The profile stage must not over-smooth vertical curvature at
  summits — zero-g moments over hills at speed are wanted. (A comfort-optimal vertical-curve
  standard is the wrong target.)
- **Bridges must be earned** — priced high enough to stay rare. Structures minimize grade cost;
  they must never become the default.
- Junctions mostly degree 2–3, occasional 4 fine (topology layer's job).
- Sparse forest-highway interconnection preserved, **but believability outranks sparsity**;
  sparsity is "just density tuning". Driving flow (smoothness, no crunchy wiggle, no quantization
  artifacts) "falls out naturally" from a continuous formulation — but note the old router's
  fixed-radius arc palette is one of the named motivations, so the new geometry representation
  should be continuous-curvature by construction, not quantized-then-refit.

## Priorities and fail-safe (carried + extended)

Priority order (standing, 2026-08-18): **connectivity > grade ceiling (≤ ~40% sustained-24 m,
variable) > performance**.

- **Runtime fail-safe: mark-and-ship.** When even the full vocabulary cannot produce a compliant
  road, the least-bad road ships marked — the network never disconnects. (Sustained-secant metric
  with junction-blend ends excluded, per the branch: `_maxSustainedGrade`.)
- **Dev fail-safe: a gate asserts ZERO marked edges across the eval seed set.** With bores and
  bridges available, a mark means the cost model has a bug — fix it, don't tune around it.
- **In-game stopgap disclaimer (owner-requested):** loading any seed that carries marked edges
  shows disclaimer text, so ad-hoc seeds with broken routing get flagged to the model for a fix
  that doesn't compromise the standard seeds.

## Performance target

- **First task of the effort: measure the router-attributable baseline** on the old hardware.
  The 45 s is NOT all router (PERF-27: ~25 s of story cold load is the reseed double world build;
  the bundled route cache hides routing on the default seed entirely). Declare victory against the
  right number.
- Target: **honest attempt at < 10 s cold-to-driving** on that hardware. Not a deal-breaker:
  **matching today's speed is acceptable if the 10-second version isn't fun** — that relief valve
  is why the old router survives on main until sign-off.

### Baseline measured 2026-08-18 (session zero — 4× proxy, dev machine)

**Headless (node, single-thread, 1×, this machine).** Cold road-network build (`test/bench-worldgen.mjs`
part A — real routing, no cache, no worker): seed 20 = **5.6 s**, seed 11 = **7.5 s**, seed 67 =
**6.9 s**. An instrumented split (depth-guarded timers wrapped around `_edgeCenterline` /
`_soloCenterline` / `_gradeEdgeInPlace`, script in gitignored `perf-runs/router-baseline.mjs` on the
worktree) attributes **98–99% of that to the route-search subtree** (arc search + corridor discs +
refit); grading is ~1 ms and graph assembly + geometry ~0.1 s per seed. The cold road build IS the
router, headlessly.

**Browser (built app, CDP `--cpu=4` old-hardware proxy, `test/story-coldload.mjs`, same sitting).**
Cold boot → driving in story mode:

| story seed | boot | entry | **total** |
|---|---|---|---|
| 20 | 4.65 s | 48.04 s | **62.57 s** |
| 11 | 4.38 s | 54.08 s | **68.29 s** |
| 67 | 4.41 s | 42.11 s | **56.78 s** |
| 6 (baked control) | 6.45 s | 12.17 s | **29.86 s** |

**Box caveat (same one PERF-27 hit):** `mediaanalysisd` + `mds_stores` were reindexing throughout
(load ~5), and the baked control came in at 29.9 s vs PERF-27's quiet-box 14.7 s — tonight's
absolutes are ~2× inflated. The deltas and shares are the assertion. **Checkpoint bench discipline:
every 4× bench re-runs the seed-6 baked control in the same sitting and compares against it, never
against a past absolute.**

**The right number.** Router-attributable cost = the unbaked−baked gap: **27–38 s at 4×** on the
eval seeds (tonight's box; ~13–19 s scaled to a quiet box). Composition checks out against PERF-27:
the reseed rebuild is 65% synchronous road streaming, and headlessly the road build is 98–99% route
search. What is NOT router-attributable is the baked-seed envelope itself (boot + ring + terrain +
props + story fixed costs) — ~15 s at 4× on a quiet box. Consequences:

- **v2 victory = closing the unbaked−baked gap** (eval-seed cold→driving ≈ the baked envelope,
  with no bundled route cache needed).
- The **< 10 s cold-to-driving target cannot be reached by the router alone** — the baked envelope
  already exceeds it at 4×. Hitting it also needs the double-world-build removal (PERF-27's lever,
  FEAT-41 boot-to-menu), which stays out of FEAT-68 scope. Judge v2 against the gap, not the total.

## Process: branch-parallel, checkpoint loop

- **Main keeps the old router untouched and shippable.** Router v2 lives on its own long-lived
  worktree/branch. No seam, no flags on main (QUAL-22 precedent: dark default-off code gets
  deleted). Swap = one merge after character sign-off.
- **Clean world break accepted.** Every seed's network changes. Contract gates survive re-baselined
  (determinism, window invariance, MESH==PHYSICS, smoothness, connectivity, grade/marked-edges);
  implementation gates die with the old router (dequantize, arc-router internals, route-worker-sync
  in its current form); route bundles rebake at the end. Seed numbers stop meaning what they meant;
  optionally curate new reference seeds after sign-off.
- **The loop:** the agent builds in the smallest possible pieces, and the owner drops in
  occasionally to judge character. **First checkpoint = a full (if crude) drivable network on 2–3
  eval seeds**, served on its own port with the 2D map — character is a network property and fun-
  to-drive cannot be judged from renders. Subsequent checkpoints accumulate on a gallery page (map
  renders + grade/curvature/detour/junction-degree metrics side-by-side with the old router via
  `test/dump-network.mjs` + `test/feel-diff.mjs`) so a visit triages in minutes and only promising
  checkpoints get driven.
- **Eval seeds:** fixed regression trio **20, 11, 67** (the measured hard cases: cliff spawn,
  stranded component, worst connectivity) plus fresh seeds every visit to prevent overfitting.

## Learnings from feature/seed20-road that ride in regardless of architecture

The branch is the **reference implementation** for these; its numbers are ground truth.

- The **sustained-24 m secant** grade metric (blend ends excluded) — robust to spikes and sawtooth,
  monotone under refinement. The per-sample max is lottery noise; never optimize against a max
  statistic over few seeds.
- The **Q1/Q2 survey method** (`test/grade-cap-survey.mjs`): before building an escalation
  mechanism, measure how often its trigger fires and whether its lever actually moves the target.
  Two afternoons of measurement killed four planned subsystems (widened-margin retry, drop pass,
  always-on router cap, tighten-and-retry loop).
- **Terrain is essentially never walled** at 40% (801 capped searches, 1 unroutable) — compliant
  alignments exist; the old router just couldn't afford to find them.
- **Routing is directional** — measuring an edge in the non-canonical direction gives different
  results than the game ships (cost a false lead once).
- **`[]`, never null** for "no result" through worker/cache seams — `[]` is truthy and cacheable;
  null livelocks the warm loop.
- The **deg-2 chain merge re-grades and can amplify violations** (measured 44% → 58%) — whatever
  replaces `_gradeEdgeInPlace`, the merged-chain path must be held to the same ceiling as edges.
- **Escape-score site ranking** (topology layer, shipped on the branch): connectivity 5/10 → 8/10
  fully-connected at unchanged sparsity. Cherry-pick or re-land — it is independent of the router.

## Session zero — for the agent taking this over cold

1. **Read first:** this ticket top to bottom, then memory `project_feat68_router_v2` and
   `project_bug51_grade_ladder`. The reference implementation and all ground-truth measurements
   live on the UNMERGED branch `feature/seed20-road`.
2. **Worktree:** create a fresh long-lived worktree/branch (suggest `feature/corridor-router`) off
   main. Main stays untouched except planning docs. **⚠ Never `wt.sh clean seed20-road`** — that
   helper DELETES the branch, which is the reference implementation and the owner's relief valve.
   (Its worktree folder may still exist with a dev server on :3304 serving the v1-ladder world for
   comparison; leave or remove the FOLDER only, keep the branch.)
3. **Perf measurement (owner decision 2026-08-18): 4× CPU throttle is the old-hardware proxy** —
   already calibrated (PERF-27's 42.8 s unbaked at 4× ≈ the owner's 45 s experience). The agent
   benches at 4× every checkpoint; the owner occasionally runs `node test/bench-worldgen.mjs` on
   the real old machine to keep the proxy honest. Absolute sign-off numbers are real-hardware.
4. **Order of work:** (a) router-attributable baseline at 4× (v1, this machine, published
   in-ticket); (b) the purity probe — inventory item 7 — because items 2 and 9 hinge on it;
   (c) M0: corridor + profile on single anchor pairs (seed 20's A→B ridge chord is the canonical
   test case: 202 m, 13% end-to-end, 157 m cover — a bore must EMERGE); (d) first checkpoint:
   crude drivable network on seeds 20/11/67, own port, 2D map, gallery entry. Then loop.
5. **Decisions during the loop are amended INTO THIS TICKET** (dated, like the sections above) —
   it is the single handoff document across sessions.

## Acceptance

- [x] Router-attributable cold-load baseline measured (4× proxy, 2026-08-18 — see "Baseline measured" above); owner real-hardware spot-check still keeps the proxy honest.
- [ ] Two-stage router on its own branch: corridor + full-vocabulary profile (cut/fill/bore/bridge),
      priced == built (a gate asserts the registered profile equals the solver's output).
- [ ] Seed 20's marks: the A→B ridge (the 202 m / 13% / 157 m-cover chord) resolves as a bore or
      a road ≤ the ceiling — chosen by cost, not injected.
- [ ] Zero marked edges across the eval seed set (gate); marked-seed disclaimer wired in-game.
- [ ] Connectivity ≥ the branch's floor (0.981 largest-component share, 8/10 fully connected) on
      the 10-seed sweep; sparsity within ~0.95× of today's km unless the owner re-tunes density.
- [ ] Character sign-off from driven checkpoints (owner), including at least one crest-airtime
      moment and one earned structure per eval seed region.
- [ ] Cold-to-driving on old hardware: < 10 s, or owner explicitly accepts the relief valve.
- [ ] Contract gates re-baselined green; implementation gates retired in the same commit that
      retires the code they tested; bundles rebaked; old router deleted from main in the swap merge.

## Junction plan (owner-confirmed 2026-08-18: geometry deferred, heights are not)

"Junctions" is three problems with three different fates — do not conflate them:

1. **WHERE junctions are — solved, out of scope.** The topology layer decides it. Untouched.
2. **Vertical agreement at nodes — IN from the FIRST checkpoint, non-negotiable.** Assign every
   junction node a height first (day one: terrain height at the site is fine); every profile
   solves with endpoints PINNED to those heights. This is a boundary condition on the solver, not
   "doing junctions" — and it is the by-construction fix for v1's node disease (the 30 m junction
   blend, the deg-2 chain merge, and the measured 44%→58% merge amplification all exist because
   independently-graded edges disagree at shared nodes). Deferring THIS re-imports all of it.
3. **Junction geometry (pads, fillets, aprons, approach headings) — DEFERRED, owner's call.**
   Early checkpoints ship naive meets: roads terminate at the shared point, drivable but ugly.
   Character judgment doesn't need pretty junctions. The later "band-aid" is mostly REATTACHMENT,
   not rewrite: the shipped pad/fillet/carve machinery (junction-flow pass, sloped pads,
   triple-overlay carve composition) consumes the run contract + node incidence, both of which
   survive. One genuinely new deferred item: v1's canonical approach headings make edges meet a
   node tangentially (G1); v2 corridors need an equivalent before sign-off or junctions read as
   spokes at raw angles. Cosmetic until then.

Bonus deletion: route **junction-to-junction THROUGH deg-2 nodes** (a pass-through node is just a
point on the corridor, not a route boundary). The deg-2 chain-merge machinery then dies entirely
instead of being guarded — no merge, no re-grade, no amplification class.

## Simplification inventory ("simplify, add lightness" — owner request 2026-08-18)

The pattern: find machinery that exists to fight a consequence of v1's design; check whether v2
removes the cause. Grouped by confidence.

**Dies by construction (certain if the architecture holds):**
1. **The fine search itself** — v1 expands up to 300k states/edge with a coarse pass bolted on as
   an accelerator; v2 searches ONLY coarse (octave-truncated terrain) and solves profile as 1-D
   dynamic programming along the corridor: exact global optimum, no heuristic, no inflation.
2. **The overlap-prevention subsystem** — solo+final double routing, `_edgeDeps` (per-edge Delaunay
   builds), corridor discs, priority ordering, the escape hatch, and the ≤16-iteration
   self-clearance repair loop all exist because the greedy quantized search WANDERS (bows past
   goals, pigtails to gain elevation). Coarse corridors don't wander; a profile stage with bores
   never spirals for height. Largest single deletion candidate.
3. **Quantize-then-repair geometry** — heading bins, radius palette, Dubins terminals, de-quantize
   refit. v2 fits continuous curvature once, as the primary representation.
4. **Worker mirror** (already fenced above) and — if the perf target is hit — the ENTIRE
   route-cache bake subsystem (bundles, bake script, parity gates, sig discipline): a cache for a
   problem that no longer exists. Delete, don't optimize.

**Strong bets (design for, verify early in the loop):**
5. **Junction heights as boundary conditions** — assign node heights first, solve each profile with
   pinned endpoints. Edges then cannot disagree at joints: the junction blend shrinks to cosmetics
   and the deg-2 merge loses its grade-repair job (which measurably amplified 44%→58% on the
   reference branch). Same by-construction move as priced==built, applied at nodes.
6. **One shared terrain pyramid** — ≥4 subsystems currently sample the same field with 4 separate
   caches. One octave-banded lattice-snapped pyramid serves corridor, profile, escape-score, and
   bore-cover probes. (Proven trick: the `_reliefH` memo, 265 ms → negligible.)
7. **Window invariance by purity** — the margin/ring/invariance-gate burden defends against
   inter-edge coupling. If v2 edges are pure fns of (terrain, anchor pair, node heights) with NO
   sibling coupling, invariance becomes a one-line argument. TEST THIS FIRST — if it holds, items
   2 and 7 compound.

**The tuning dividend:**
8. **Physical knobs** — replace ~15 interacting abstract weights with ~5 engineer-priced ones
   (cost/m³ cut, cost/m³ fill, cost/m bore, cost/m span, grade comfort). Directly serves the
   evaluation loop: the owner turns knobs with physical meaning between checkpoints.

**Layer 1 (topology) sheds weight PASSIVELY — expect it, verify it, don't pre-build it
(owner follow-up 2026-08-18):** sites + Urquhart are genuinely simple (the graph is planar by
construction: chords cannot cross — "every real crossing is a routing excursion", per the code's
own comment). Nearly all of Layer 1's complexity is the CULLS and their window-invariance
defenses, and those exist only because v1's routes wander:
9. **Crossing + clearance culls die with the wander.** Non-wandering corridors don't cross and
   don't run parallel-too-close → both culls, the one-ring universe, the wide shadow graphs, the
   drop memos, and the cull-radius-invariance gate go with them. Dominoes: the culls are the
   island generator (BUG-47, recorded) → no stranded components → FEAT-28's repair burden shrinks
   → the escape-score ranking's measured value (5/10→8/10 fully-connected) was compensation for
   cull damage, so its ~500 ms may become optional. Loop questions, in order: (a) do v2 corridors
   ever cross? (b) with culls off, do components ever strand? (c) does escape-rank still earn its
   cost? Kill in that order, by measurement.
10. **Resurrect QUAL-22 on honest costs** — cost-weighted Urquhart pruning (implemented, measured,
   deleted UN-SHIPPED for process reasons, reopen checklist in its completed ticket). Urquhart ⊇
   MST holds PER WEIGHT FUNCTION, so weight-pruning is connected BY CONSTRUCTION — no detour BFS,
   no guard. v1 had no honest weight to feed it; v2's corridor lower-bound (octave-truncated
   terrain) is exactly one. Expensive edges are then never PROPOSED, and the degree-cap machinery
   may reduce to a trivial post-filter. On record: QUAL-22 changed character (seed-6 switchbacks
   61→27) — loop-evaluated, never silent.

### Purity probe result (2026-08-18, session zero — item 7 TESTED, it holds)

Method (`perf-runs/purity-probe.mjs`, gitignored — numbers here are the record): on 6 seeds
(eval 20/11/67 + fresh 3/42/99), route EVERY pre-cull Urquhart edge in a r=1400 origin window as
v1's SOLO (pure fn of terrain + anchor pair, no sibling avoidance), then measure conflicts among
the pure routes. v1 solos wander MORE than v2 corridors will, so these are upper bounds.

| seed | edges | final≠solo (coupling bit) | crossings, node-sharing | crossings, disjoint | disjoint pairs < 30 m |
|---|---|---|---|---|---|
| 20 | 222 | 28% | 80 | 0 | 0 |
| 11 | 228 | 31% | 82 | 0 | 0 |
| 67 | 215 | 24% | 67 | 0 | 0 |
| 3 | 218 | 25% | 65 | 1 | 1 |
| 42 | 229 | 23% | 62 | 0 | 0 |
| 99 | 207 | 20% | 59 | 1 | 1 |

**Reading:** inter-edge conflict is ENTIRELY a shared-node phenomenon. Among the ~24k disjoint
pairs (no shared node) across 6 windows there are 2 crossings and ~0 sub-30 m near-parallels —
the "real overlap" class is empty-to-rare (and the 2 look like the legitimate geography-funnel
events the vocabulary section predicted). Every other crossing (59–82/seed) is two edges of the
SAME junction excursing near their shared node — v1's wander class, which the corridor-disc
machinery (biting on ~a quarter of edges) exists to manage.

**Consequences:** purity is viable — a v2 edge as a pure fn of (terrain, anchor pair, node
heights) needs NO sibling coupling; window invariance becomes structural (nothing an edge reads
depends on the stream window). Items 2 (overlap-prevention deletion) and 9 (cull deletion) are
upgraded from "strong bet" to "expected — verify by measurement in the loop" (loop questions in
item 9 unchanged: corridors crossing, stranding with culls off, escape-rank's residual value).

**Not simplified, ever:** the carve (MESH==PHYSICS), the determinism promise itself — only the
cost of keeping it. (The topology layer is no longer on this list: it isn't redesigned during the
build, but it is expected to shed its cull apparatus once v2's corridors land — see 9–10.)

## M0 record (2026-08-18, session zero (c) — mechanism proven on single pairs)

Built on `feature/corridor-router` (commit 926e993): `src/corridor-router.js` (pure module — no
engine types, no THREE, no module-scope caches; height fields arrive as closures) + workbench
tools `test/corridor-m0.mjs` (canonical + benign edge, priced==built check) and
`test/corridor-sweep.mjs` (full-network census). Not gates yet.

**Canonical case (acceptance item 3, proven in isolation):** on seed 20's BUG-51 cliff edge
`0,-1,2 : -1,0,2` (452 m chord, 177 m chord-line cover — my derivation of "the A→B ridge chord";
the ticket's 202 m / 13% / 157 m are the reference branch's portal-to-portal figures for the same
crossing), the profile stage EMERGES a **171 m bore under 170 m of cover at ≤15% bore grade**,
corridor detour ×1.12 where v1 ships ×2.51. Chosen by cost, nothing injected.

**priced == built is EXACT** — endpoint pins are solved as continuous values inside the DP (not
grid states), so the solver's reported cost equals an independent re-price of the shipped arrays
to the last digit. This is the future gate's assertion, already holding at M0.

**Speed:** all 222 seed-20 graph edges corridor+profile in ~0.8 s single-threaded ≈ **3–4 ms/edge,
~50× v1's ~160 ms/edge** — before any optimization. At this rate the route Worker and the entire
route-cache bake subsystem look deletable (inventory item 4), and even 4×-throttled cold routing
of a whole region lands in low single-digit seconds.

**Findings:**
- **kMax quantization bug (fixed):** flooring the DP transition window made the effective grade
  cap yStep-granular (30% instead of 35% at ds=9.993) and produced one false "infeasible" edge.
  Cap checks now carry a half-quantum tolerance (bounded ≤2.5%-grade overshoot instead of an
  unbounded undershoot). Post-fix: **0 infeasible on all 222 edges at K=2 AND K=3.**
- **Corridor K-blindness:** at K=2 the corridor cannot see octave-3/4 wrinkles (500/250 m
  wavelengths, ~56 m combined amplitude), so gullies become profile emergencies (a 140 m bridge
  climbing at ~30% appeared on a "benign" edge where the corridor drove into a wall only the
  profile could see). K=3 halves the >20%-grade mileage (28.6 km vs 39.2 km of ~180 km) at the
  same speed. **Working default for the first checkpoint: K=3.**
- **Structures are far too common at the initial prices** (62–77 bores, 22–27 bridges across 222
  edges — they must be EARNED). This is exactly the calibration the checkpoint loop + the owner's
  physical knobs (`V2_COSTS`) exist for; not tuned blind.

**Next:** session zero (d) — first checkpoint: integrate behind the run contract (junction node
heights pinned; junction-to-junction corridors THROUGH deg-2 sites, killing the chain merge; bore
segments mapped onto FEAT-40 span machinery; bridges may ship crude), stage-3 curve smoothing,
seeds 20/11/67 served with the 2D map.

## Checkpoint 1 record (2026-08-18, session zero (d) — v2 drives the full network)

On `feature/corridor-router` (commit 7cff01d), **served for judging: `http://localhost:3343`**
(worktree dev server; 2D map on M; seed via `?seed=20` / `?seed=11` / `?seed=67`). Seed 20's
canonical bore is AT SPAWN — the spawn road enters it within ~100 m. Screenshots from the
headless pass: a real portal + hillside road (the emergent bore, rendered by the FEAT-40
machinery), and a bridge as the agreed-crude floating tube at (419, 1480).

**Integration shape (the run contract held):** four narrow swaps in road.js — `_edgeCenterline`
(corridor + stage-3 curve), `_registerRun` (exact profile DP replaces design-grade + tunnel pass;
bore/bridge segs ship as FEAT-40 spans), the warm scan (neutered — the v1 Worker must not fill the
v2 cache; synchronous routing is ~3 ms/edge), and `routeCacheSig` v1→v2. Everything downstream
(carve, ribbon, physics colliders, map, spawn, missions) consumed v2 runs unmodified. The deg-2
chain merge re-registers through `_registerRun` and thereby BECAME the junction-to-junction
re-solve — deg-2 pins lift automatically on merged chains.

**Numbers (eval seeds 20/11/67, headless):** full network 240–550 ms (v1: 5.6–7.5 s); node
y-spread at shared nodes **0.000 m** (the junction blend disease is dead by construction); max
sustained-24 m grade **35% = the vocabulary cap**, zero runs over the 40% ceiling (v1 shipped
118% here); zero infeasible profiles; in-browser 60 fps on this machine.

**Stage 3 (new, in corridor-router.js):** dehairpin (one-cell A* stairs are noise, not
switchbacks) → Douglas-Peucker at ~1 cell (the swath owns that freedom) → Chaikin with
escalating passes → line-arc fillets into the repo's own `Centerline` primitives (real curvature
for camber; clothoid upgrade path open). Min fillet radius ≥ 8 network-wide (mostly ≥ 12).

**Two purity findings fixed en route (both measured):**
- **Routes are now direction-canonical.** The search is not direction-symmetric and windows ask in
  either order (v1's "routing is directional" gotcha): 36 m AB-vs-BA drift, killed by routing the
  id-ordered direction and returning its exact reverse for the other spelling. 0.00 m after.
- **cutMax 12 → 20 m.** A 12–20 m trench is an open rock cutting at road grade cap, not a tunnel;
  at 12 the bore's 18% cap rate-limited legitimate cliff descents (the one false "infeasible").

**Gate triage (25/30 green on the affected set):**
- *Die with v1 (retire in the teardown commits):* `road-tunnel.mjs` (tests the FEAT-40 tunnel
  PASS, which no longer runs — spans now come from the solver), `route-bundle-parity.mjs` (cache
  subsystem; sig-bumped off by design — inventory item 4 says delete the whole bake).
- *Re-baseline:* `graph-topology.mjs` — its window-invariance sub-check PASSED on substance
  (0 only-in-one-window edges, 0 grade mismatches) but its ≥4-interior-edges precondition fails
  because v2's non-crossing corridors leave fewer, longer merged runs; and its node-departure rule
  encodes v1's "node Y rides road grade, not terrain", which the ratified day-one node-height rule
  deliberately replaces.
- *Loop items (real, diagnosed, not blocking a character judgment):* `story-poi.mjs` — shared pads
  drift 20 m between stream windows because v2's naive deg-2 joints carry kinks, so the QUAL-16
  merge fillets now do real geometric work and merge extent is window-bounded; the by-construction
  fix is routing junction-to-junction THROUGH deg-2 nodes (junction plan bonus deletion, next).
  `paper-tour.mjs` — tier-2 dropped 4 customers that are on tier-3's route; mission-layer
  edge→merged-run arc mapping over the longer v2 chains, investigate in the loop.
- *Green and load-bearing:* world-determinism (byte-identical rebuilds), restream-invariance,
  carve-mesh-smoothness, centerline-curvature, pond-route-around (discs now block corridor cells),
  road-fill-support (taught that spans are structure — and a real 9.5 m v2 embankment measured
  fully supported, so the carve takes v2's deeper earthworks fine).

**What to judge while driving (calibration knobs are `V2_COSTS` in src/corridor-router.js):**
structures are still too COMMON (bores/bridges must read as earned); grade character (does 35%-max
hugging feel honest or harsh); crest airtime; whether corridors pick believable lines. Bridges
render as tubes and junctions are naive meets — both knowingly deferred, judge alignment not
dressing.

## Calibration pass 1 (2026-08-18, owner's first drive — rulings + fixes)

**Owner rulings (binding):**
- **Bridges are DE-SCOPED from the router vocabulary.** Real forest bridges are short (~30 m),
  same-elevation, and sit at water crossings; valley-spanning decks raise "why is there no road
  down there" (crossings at different heights). Machinery stays re-enableable
  (`V2_COSTS.bridgesOn`); the planned road back is a POST-ROUTER conversion of water crossings
  only (today's stream causeways are candidates). The occasional long suspension bridge is a
  someday-maybe, not vocabulary.
- **Tunnels: no visual difference in the mountaintop above a bore — carve a clean hole.** Cut
  pricing is the lever, not the carve.
- **Switchbacks must emerge; the solver was "too happy to tunnel, not happy to make tight turns."**

**Shipped on the branch (commits 1d063b2, e16ad9d):**
- **Tunnels were NEVER chassis-passable — fixed** (pre-dates v2, exists on main: owner-reported).
  The engine heightfield mirrors mesh Y, and the mesh keeps the mountain over a span, so the
  chassis hit an invisible wall at every portal (wheels would have passed — the analytic surface
  already resolves the bore floor). `TerrainPhysics.syncChunk` now cuts the bore slot (heights →
  deck−0.5 within tube radius inside spans): the engine collider aligns with the wheel surface, a
  deliberate span-bounded MESH≠PHYSICS exception. Verified by CDP drive-through of the canonical
  bore at 18–24 m/s. If v1 tunnels matter before the swap, this cherry-picks to main cleanly.
- **"No switchbacks" root cause: stage-3 smoothing, not the search.** The corridor A* was already
  building them — measured 949 m of deliberate descent zigzag collapsed by RDP/Chaikin into an
  infeasible 488 m plunge. Smoothing is now GRADE-GUARDED (a shortcut may not steepen the raw legs
  it replaces, on the truncated field). Hairpin census on eval seeds: 0 → 7/8/4.
- **Prices:** wGrade 40→120 (optimal climb grade g*=1/√wGrade: 16%→9% — length now beats sustained
  steepness, which is where switchbacks come from); cBoreM 8→12, cPortal 150→250 (tunnels earned);
  cCut2 = 0.12 quadratic cut depth (cut ≈ bore at ~9 m: portals emerge at bench depth — canonical
  approach cut 19.6 m → 10.9 m, mountaintop untouched).
- **Day-two node heights:** pin = terrain NEIGHBORHOOD (min over a 22 m ring + 35% climb-back),
  pure per node. Kills the convex-edge class where ground fell 24 m in 30 m off a pinned node and
  no bridge-less profile could follow.
- **Fail-safe ladder (per edge, deterministic, pure):** rung 1 fine yStep 0.25 → rung 2
  conservative corridor re-route (structureCap off: profile-infeasible corridors route AROUND
  hostile ground) → rung 3 solve at 38% (under the 40% ceiling) → mark-and-ship with run ends
  BLENDED onto node heights (marks can never re-open the node disease).
- **QUAL-24 deg-2 merge OFF under v2.** Its load-bearing half (joint grade continuity) is
  delivered by pinned node heights; its re-solve of window-clipped chains broke GRADEY-INVARIANT
  (road-band-coverage gate). Naive meets are checkpoint-sanctioned; the junction-to-junction
  pass-through design replaces it properly later. Turning it off ALSO fixed the story-poi pad
  drift and mission-network reds from checkpoint 1.
- **Fold floor by construction:** control-polygon radius repair (drop vertices that cannot admit
  an 8 m fillet) before the line-arc fit + shared tangent budgets. Worst exact radius 1.29 m →
  9.09 m over 1235 edges; centerline-curvature and road-minradius gates green.

**State after the pass (eval seeds 20/11/67):** 0/1/3 marked edges (seed 20 and effectively seed
11 clean); max sustained 35/40/76% — the 76% is a marked run; node y-spread 0.000 m everywhere;
hairpins 7/8/4; spans 15/10/16 (bores only). Gates 26/30 — remaining reds triaged: road-tunnel +
route-bundle-parity die with v1; graph-topology GRAPH-NODE-DEPARTURE encodes v1's "node Y rides
road grade" rule, replaced by the ratified day-two rule (re-baseline); paper-reroute is a
mission-layer margin threshold (re-plan DID beat stale, 15.12 vs 15.82 km).

**Loop items minted by this pass:**
- **Summit-knob nodes:** all 3 seed-67 marks share node `1,-2,1` (a 255 m peak with 60–120%
  faces — unbuildable without bridges from any direction). This is SITE PLACEMENT (topology
  layer): the escape-score ranking should never anchor a junction on a peak. Evidence for the
  item-9/10 topology work; not a router bug.
- **Post-router bridge conversion at water crossings** (owner's design): causeway → short deck
  where a stream crosses, same elevation both ends.
- The in-game marked-seed disclaimer (acceptance item) is still to wire.

### Owner capture 1787117526907 (2026-08-18): the steep-straight-shot mechanism — diagnosed, fix parked

Capture: seed 6, mark (1272, −467) — "should be switchbacks, not a steep straight shot." Taken on
the pre-pass-1 build (its runKey is a merged-chain key); on today's build the road there is edge
`g:2,-2,0:1,-1,1`: 888 m for a 719 m chord, descending 124 m (mean 13.9% — a 9% road exists at
~1.5×), shipping **35.1% sustained-24 m exactly at the marked station** with 108 m over 30%.
Legal (≤ the vocabulary cap), unmarked — and wrong per the character spec.

**Mechanism (valid, measured):** the corridor's structure cap prices every step at
min(onGrade, cBoreM) — beyond ~30% slope, onGrade exceeds 12 so ALL steeper ground costs the same
12/m. On a descent to a LOWER node no bore can substitute (nothing to pass under), yet the cap
still flattens the price — the corridor has no reason to trade length for grade on exactly the
faces that need switchbacks. Compounding: the smoothing grade-guard (GUARD_G 0.18) lets a 9%
zigzag be traded for a 17%-truncated chord unconditionally (25–30% on the full field).

**Tried and PARKED (reverted, uncommitted):** cover-gating the cap (structure discount only where
truncated terrain rises 10 m above the anchor-to-anchor chord line) + GUARD_G 0.12. At the
captured spot: worst 35.1% → 29.8%, over-30% mileage 108 m → 0, detour ×1.24 → ×1.18 — the
targeted cure works. But the canonical seed-20 crossing drifted ×1.25 → ×2.20 (bore 211 → 331 m,
portal moved s=20 → s=70) and the tunnel drive-through then BLOCKED at the new portal mouth
(cause not yet run down — portal-face collider vs the moved span). Reverted to e16ad9d per owner
instruction; drive-through re-verified green (31–36 m/s end to end).

**Next-pass shape:** re-land the cover-gated cap with (a) the canonical acceptance + drive-through
in the measurement loop from the first edit, (b) the portal-mouth blockage diagnosed first, and
(c) possibly a gentler gate (cover proxy relative to the local deck estimate, not the chord line)
so portal APPROACH flanks keep their discount and only true descent faces lose it.

## The switchback question (2026-08-19, owner ruling + structural diagnosis — DISCUSSION OPEN)

**Ruling:** grade-guarded smoothing REVERTED (commit c255fb3). It produced "at best a little
wiggle, hardly the cut across the mountain face" (owner, with capture 1787124538285), and it was
a rule defending a symptom — the accretion class this worktree exists to kill. Decisive number:
hairpin census 7/8/4 guarded vs 1/2/1 unguarded — the guard was preserving DITHER, not
switchbacks.

**Why the XZ corridor cannot produce switchbacks (three stacked structural reasons):**
1. **The state can't hold a grade budget.** Position-only state means grade is a per-step
   INCENTIVE on sampled ground Δh, so "buy grade with length" degenerates into one-cell
   side-dodging (lowering the sampled slope) — dither at the wrong wavelength, never traverses.
2. **The lattice can't stack traverses.** The search visits each cell once; a switchback stack
   needs the path to cross the same hillside repeatedly 20–40 m apart — inside one 32 m cell.
   Tight stacks are literally inexpressible, whatever the prices say.
3. **The structure cap flattens steep prices** (capture 1787117526907): past ~30% every slope
   costs the flat bore rate, deleting the incentive exactly where switchbacks should pay.

**Proposed no-compromise fix — the 2.5D corridor (one mechanism, several deletions):** add the
deck's height to the corridor state: (cell ~32 m, deck elevation ~3 m bins). Then: grade is a
HARD per-step budget on the deck (dither gains nothing — cost follows the grade you choose, not
the ground you sample); the same cell at two heights is two states (stacks become expressible and
emerge only where a face out-steepens the cap); terrain is priced per state as |deck − ground|
through the SAME cut/fill/bore vocabulary (the bore-cap flattening and the parked cover-proxy
dilemma both vanish — the state knows whether the deck is under or over ground). The exact 1-D
profile DP still refines on the final stations: priced == built untouched. Expected deletions:
the grade guard (done), the cover proxy, most of dehairpin's job, likely ladder rung 2.
**Cost:** state space ~4k → ~100–200k; estimate 10–40 ms/edge (vs 3–4), ~1–3 s per network at
1× — still 2–5× faster than v1. Fallback if too slow: TIER it (keep the cheap XZ route when its
profile is gentle; 2.5D only where the XZ route violates the character bound) — same mechanism,
applied where it matters.

**Rejected alternatives:** finer cells + honest pricing alone (measured: yields dither, not
stacks — reasons 1 and 2 stand); heading in the state (v1's lattice disease, banned by this
ticket); detect-steep-and-inject-zigzags (violates `feedback_emergent_over_injected`).

**Status: awaiting owner's pick before implementation.**

## The 2.5D corridor SHIPPED (2026-08-19, commit 8981406 — deck height in the search state)

Built as green-lit, and it delivered on the first network build. State = (32 m cell, 3 m deck
bin); grade is a hard per-step deck budget; terrain prices as deck-vs-ground offset through the
profile's own classOf/stationRate vocabulary; the same cell at two heights is two states, so
stacks are expressible. Full detail in the commit message; the measured story:

- **Switchbacks are REAL and visible** — hairpins 6/13/13 on the eval seeds (the deck PLANS them:
  e.g. the owner's captured descent plans 1424 m at ≤20% for a 719 m chord). The two spots the
  owner flagged (seed 6 screenshot + capture) both carry genuine hairpin stacks now.
- **Marks 4 → 1** — the 2.5D search solves two of the three summit-knob edges by spiraling.
- **Canonical bore: 150 m DEAD LEVEL under 164 m cover** — chosen by the search, and tunnels
  network-wide went 15 → 4 spans on seed 20: earned, not default.
- **Deletions, not additions:** dehairpin deleted (existed for the old search's dither, which the
  2.5D search cannot produce), structure-cap flattening + cover proxy gone. Two ADDED first-class
  costs, both physical knobs: `cTurn` (money per radian — a heading-free search otherwise prices
  twenty micro-zigzags the same as two traverses; v1's roadWTurn lesson) and the fillet
  length-loss budget (a corner may shortcut ≤18 m of the plan — sharp apexes get real hairpin
  radii, sweepers stay sweeping; max-radius fitting was eating 275 m of a switchback descent).
- Corridor field is now K=4 (full coarse — the plan must see what the profile pays), priced ==
  built exact, node y-spread 0.000.

**Open items from this pass:**
- **Perf: ~60 ms/edge search** (was 3–4), network 1.5–2.1 s at 1× headless. Cold-load acceptable;
  the real issue is per-edge synchronous routing now exceeds a frame → in-game streaming hitches
  (`paper-reroute`'s slicing gate is red on exactly this). Fix = the route Worker port, which the
  clean-module architecture was designed for (no verbatim mirror). Weighted A* (ε=1.15) + the
  relaxation heuristic + bore-band clamp are already in; further profiling belongs with the
  worker item.
- `story-poi` red = roster supply threshold on the changed network (13 viable sites vs roster 14)
  — re-baseline class. `road-fill-support` seed 7 = 1.0 m support shortfall on a fillMax-boundary
  fill measured against fine-noise raw while the profile grades against coarse — small real gap,
  loop item. `route-bundle-parity` + `graph-topology` node-departure unchanged (die-with-v1 /
  re-baseline).
- Residual ~30–35% pitches can appear near hairpin apexes where the fillet displaces the line off
  the planned bench (≤ ~19 m at a 135° apex) — second-order; judge in the drive.

## Big-bite session checkpoint (2026-08-19, autonomous — steps 1-2a of the agreed order done)

Owner-approved order: culls → deg-2 joints → worker port → feel-session prep.
- **DONE (acb42f3): culls DELETED.** Measured first: v1 95.7%/7-of-10 fully connected vs
  v2-with-culls 54.1%/0-of-10 — the culls deleted 11-21 good edges/seed while preventing ZERO real
  crossings. Culls off: **100%/10-of-10, zero crossings**, runs +50%, km at v1 coverage, hairpins
  15/21/20, seed-11 mark cleared. New gate `road-connectivity.mjs` (eval trio = one component +
  no real crossings). Re-baselined: shoulder-lateral-continuity (cross-run seams at naive meets
  are the junction pass's item), mission-network cull-share precondition inverted.
- **DONE (this commit): chain-merge machinery deleted** (was already off). Runs are 1:1 with edges.
- **OPEN — BUG-41 interior drift** (mission-network red): par-vs-carve elevation series diverge
  p99 2.8 m in run interiors on the bigger network; the clArc-vs-polyCum hypothesis was tested and
  DISPROVEN (sampler-domain swap moved nothing). Needs its own session.
- **NEXT, in order:** (1) deg-2 canonical approach headings (compute per node from settled
  degree-capped adjacency inside _assembleGraphEdges; enforce as first/last-step direction
  constraints in corridorSearch — ±~50° cone; skip the near-anchor absorb when a heading pin is
  active or it eats the constrained step); (2) worker port — extract a routeEdgeV2() orchestration
  (corridor→centerline→feasibility ladder) into corridor-router.js, rewrite src/road-worker.js as
  a MODULE worker importing it (kills the ROUTE SYNC mirror + its gate), re-enable _warmScan with
  v2 job specs {key, ax, az, yA, bx, bz, yB, margin, discs}, keep ingestRoutedConnections'
  descriptor protocol; (3) feel-session prep — cTurn {15,30,60} A/B map renders + fresh gallery
  shots so the owner can dial hairpin density on arrival. Also open: story-poi pad-flatness
  (1/14 pads, 1.27 m), paper-tour 1 dropped customer, fill-support seed-7 (1 m), perf ~30-60 ms/edge.

## HANDOFF — SUPERSEDED (2026-08-19 midday; kept for the step-2b design notes below)

**State:** branch `feature/corridor-router` at `30be9f9`, working tree CLEAN, dev server :3343.
Battery: seeds 20/11/67 → 56/50/55 runs, 1 component each, y-spread 0.000, hairpins 15/21/20,
marks 0/0/1 (the seed-67 summit knob), max sustained 35/35/63 (63 = the marked run). Gates: the
new `road-connectivity` green 6/6; standing reds = route-bundle-parity (dies with v1),
graph-topology node-departure (re-baseline), paper-reroute (slicing — worker port fixes),
mission-network BUG-41 interior-drift pair (booked, arc-domain hypothesis DISPROVEN),
road-fill-support seed-7 (1 m), story-poi pad-flatness (1/14, 1.27 m), paper-tour (1 dropped
customer). Battery tool: `node perf-runs/v2-integration-check.mjs` (gitignored, on the worktree).

**Next task (step 2b, design ready — was mid-implementation when context ran out):
deg-2 canonical approach headings.** The full design, worked out and ready to type:

1. `corridorSearch` gains `opts.startDir {x,z}` / `opts.goalDir {x,z}` (unit vectors). Enforce as
   DIRECTION CONES: for expansions FROM the start state (parent < 0), require
   dot(stepDir, startDir) ≥ 0.5 (60° cone — admits exactly the two nearest lattice dirs); for
   relaxations INTO the goal cell, same test against goalDir. If a constrained search returns
   null, road.js retries WITHOUT dirs (connectivity outranks joint tangency — a new cheap rung).
   Skip the near-anchor absorb loops at any end whose heading pin is active (they'd eat the
   constrained first step).
2. `_assembleGraphEdges` computes per-node THROUGH-directions from the settled post-drop
   adjacency it already holds (g.adj after the degree-drop deletions): for nodeKey with adjacency
   size == 2, neighbors sorted lexicographically (determinism), through = normalize(pos(n2) −
   pos(n1)). Per edge (c1,c2): startDir = through(c1) signed so dot(startDir, pos(c2)−pos(c1)) ≥ 0;
   goalDir = through(c2) signed the same way. Junctions (deg ≠ 2) get no pin (naive meets stay —
   junction geometry is its own deferred pass).
3. `_edgeCenterline(c1, c2, dirs)` plumb: canonical-direction recursion flips dirs
   (startDir' = −goalDir, goalDir' = −startDir) before reversePrimitives. CACHE-POISONING GUARD:
   tag cached centerlines with whether dirs were applied (e.g. `cl._v2Dirs = true`); on a cache
   hit where dirs are requested but the entry is dirless (edgeParData's standalone fallback can
   route first), re-route with dirs and overwrite — registration must always ship heading-ful
   geometry or window invariance breaks (fallback callers stay dirless: they only touch
   never-registered edges; comment this).
4. Stage 3 must not bend the pinned ends: `corridorCenterline` gains opts.keepEnds → simplifyRDP
   force-keeps path indices 1 and n−2, and enforceMinRadius exempts them unless the fold floor
   demands removal (fold floor > joint tangency).
5. Measure: per deg-2 node, angle between the two incident runs' meeting-end tangents
   (`centerline.tangentAt` at 0/length), report deviation from 180° — add worst-case to the
   battery print, screenshot one joint before/after (a known one: node `1,-1,1` on seed 6/7 had
   the convergent approaches). Then npm test + commit.

**Then (step 3): worker port** — extract `routeEdgeV2()` (corridor → centerline → feasibility
ladder, incl. dirs) into corridor-router.js; road.js sync path calls it; rewrite
`src/road-worker.js` as a MODULE worker (`new Worker(new URL(...), {type:'module'})`, Vite
bundles it) importing the same function — worker needs only {seed, the 4 coarse-noise params} at
init (NEVER whole RANGER_PARAMS) to rebuild noiseCoarse + hTrunc(K=4); jobs carry
{key, ax, az, yA, bx, bz, yB, margin, blockedDiscs, dirs}; replies stay primitive-descriptor
lists (ingestRoutedConnections already rebuilds via centerlineFromDescriptors). Re-enable
`_warmScan` to emit those specs. DELETE the ROUTE SYNC mirror + `route-worker-sync` gate in the
same commit. Verify sync-vs-worker descriptor parity on a few edges (determinism).

**Then (step 4): feel-session prep** — cTurn {15, 30, 60} A/B map renders (map-shot.mjs) + fresh
gallery shots + 4× bench with paired seed-6 control, so the owner dials hairpin density in one
visit. Owner is away ~20 h from 2026-08-19 early morning.

## Step 2b record (2026-08-19, autonomous — deg-2 canonical approach headings SHIPPED)

On `feature/corridor-router`: heading pins at deg-2 nodes, as designed in the handoff plus three
measurement-forced amendments. New battery metric: per deg-2 node (settled adjacency), deviation
of the two runs' meeting-end away-tangents from 180°.

**Measured (eval trio, before → after):** kink mean 107°/91°/61° → **35°/45°/54°**, worst
180°/164°/167° → **79°/82°/153°**. Everything else at handoff state: marks 0/0/1, comps 1/1/1,
y-spread 0.000, max sustained 35/35/63 (63 = the marked run), hairpins 17/21/24. Gate reds
unchanged — all 7 standing reds re-verified IDENTICAL on pre-change src (stash A/B), nothing new.
Before/after map shots of the killed seed-20 spike (node 1,2,0, 166° → <45°):
`perf-runs/shot-joint-120-{before,after}.png`.

**Amendments to the handoff design (all measured, in commit order of discovery):**
1. **Pin signing is by NEIGHBOR IDENTITY, not the edge's own chord.** `dot(dir, B−A) ≥ 0` signing
   reverses travel through a node that sits behind one neighbor along the through-chord (acute
   elbow) — a sanctioned cusp. through runs k1→k2 (sorted); leaving toward k2 pins +through,
   toward k1 −through; arrivals continue toward the OTHER neighbor.
2. **The cone binds over a TERMINAL REGION (2.5 cells), not one step.** A literal last-step cone
   was measured satisfiable by overshooting the goal and hooking back with a 150° jink on the
   final 23 m (seed 20's 166° spike — NOT an elbow; probe showed the raw path ran dot −0.7…−1.0
   against the pin until the last step). Near a pinned end no step may move against the pin
   (dot < 0); the strict 60° cone stays on the literal first/arrival step.
3. **The fold-floor override removes the pinned vertex's interior NEIGHBOR, not the vertex.**
   RDP collapses the wandering approach into a long chord; the corner AT the protected vertex
   then breaks the 8.5 m floor and removing IT re-aimed a kept 23 m end leg into the spike.
   Softening the approach (neighbor removal) keeps tangency; the pinned vertex goes only when
   nothing unprotected is left (fold floor > joint tangency, still).
4. **The ladder demotes pins on INFEASIBILITY too, not just on search-null:** pinned → unpinned →
   pinned-conservative → unpinned-conservative, first feasible profile ships. Without this, pins
   forced two new marked edges (seed 11 49%, seed 67 +1); with it both ship clean unpinned.
   Fallbacks are counted (`_v2DirFallbacks`/`_v2DirFallbackKeys`): exactly 1/seed on 11 and 67.

**Residual, understood:** worst kinks decompose into (a) the two fallback edges — the recorded
priority trade (seed 67's 153° node has fallback edge g:1,1,1:1,2,2 on the summit-knob flank);
(b) cone slack, up to 60°/side plus ≤~35°/side of anchor-snap swing (the exact anchor sits up to
half a cell diagonal off its lattice cell). Getting joints to true G1 needs either exact
end-tangent constraints in stage 3 or the junction-to-junction through-routing (the pass-through
deletion) — pins are the sanctioned cheap approximation until then. Also: the cache tag
`_v2Dirs` + poisoning guard keeps dirless fallback routing (edgeParData) from ever shipping into
registration; export/import carries the tag.

Known-joint note: the design's showcase node 1,-1,1 (seed 6/7) is no longer deg-2 — the cull
deletion changed the settled adjacency. Showcase moved to seed 20 node 1,2,0.

## Step 3 record (2026-08-19, autonomous — route Worker ported to a module import, mirror DELETED)

On `feature/corridor-router` (4620e78): `routeEdgeV2()` (corridor → stage-3 curve → feasibility
ladder, pins included) extracted into corridor-router.js as THE route function; sync path and
Worker import the same one. `src/road-route-worker.js` is a real ES module worker (Vite bundles
it, dev and build verified — dist ships it as its own 16 kB chunk); the QUAL-08 pool/pull-pump
survives on top. `_warmScan` re-enabled with v2 specs {key, ax, az, yA, bx, bz, yB, margin,
blockedDiscs, dirs}; a cached dirless entry for a pinned edge re-dispatches and the reply
upgrades it (window invariance holds through the worker path).

**Deleted (374 insertions vs 1979 deletions):** the ROAD_WORKER_SOURCE verbatim mirror
(~1300 lines) + `route-worker-sync` gate; the whole QUAL-14 dependency apparatus — _edgeDeps,
_corridorDiscsFor, _nodeAvoidDiscs, solo routes (clsSolo everywhere incl. map2d/main sharing),
solo-reuse adoption, _sitePairCmp priority, _routeOptsBetween/_edgeRouteSpec, PROTO_MARGIN.
Inventory items 2 and 4 (worker half) are now DONE, measured, not just predicted.

**New gate `road-worker-parity.mjs`:** pins the worker's height-field rebuild ({seed, 4 coarse
params} → bit-exact vs RoadSystem's closures) and asserts byte-identical descriptors on real
pinned edges. Green 0-mismatch. Verified live over CDP: forced re-route dispatched 147 jobs to
the module worker, pending drained to 0, cache refilled, no console errors. Battery byte-identical
to pre-port; npm test = the same 7 standing reds, nothing new.

**Note for the record:** the handoff hoped the worker port would clear `paper-reroute`; its red is
a mission-layer re-plan-length margin (12.25 vs 11.28 km), identical before and after the port —
still a standing loop item, not slicing.

## Step 4 record (2026-08-19, autonomous — feel-session prep, and the perf verdict)

Gallery for the visit: **`perf-runs/gallery.html`** on the worktree (open it directly; images sit
beside it). Drive from **`http://localhost:3343/?seed=20|11|67|6`**, map on **M**.

### The victory number — router-attributable cost is 27–38 s → 8.4–9.4 s

4× CPU throttle, built app, ALL runs in one sitting with a paired control (checkpoint discipline):

| run | boot | entry | total | gap vs baked control |
|---|---|---|---|---|
| seed 6 — **baked control** (v2 bundle) | 3.2 s | 8.9 s | **18.25 s** | — |
| seed 6 — same seed, routing live | 4.0 s | 10.3 s | 21.04 s | +2.8 s |
| seed 20 | 3.2 s | 16.9 s | 26.64 s | **+8.4 s** |
| seed 11 | 3.4 s | 17.8 s | 27.66 s | **+9.4 s** |
| seed 67 | 3.4 s | 16.9 s | 27.15 s | **+8.9 s** |

Baseline (v1, 2026-08-18) was a 27–38 s gap; totals 56.8–68.3 s. **Gap cut 3–4×.** Totals roughly
halved, but tonight's box was quieter than the baseline sitting — the gap is the honest half.
Routing a whole 2800 m region live now costs **~2.8 s at 4×** (the seed-6 pair, same seed both
ways). Still above the <10 s total target exactly as the ticket predicted: the residual ~18 s IS
the baked envelope, and that needs PERF-27's double-world-build removal (out of scope here).

**⚠ Bench trap discovered:** `routeCacheSig` is now `v2|…`, so the committed v1 bundles missed for
EVERY seed — the first bench run tonight had no baked control at all (its "seed 6" was routing
live). A paired control now requires re-baking. Any future 4× bench must confirm the control
actually loaded its bundle before quoting a gap.

### Route-cache bundles: 7.9 MB → 0.13 MB (60×), and `route-bundle-parity` is GREEN

Re-baked under v2 (`test/bake-route-bundle.mjs` fixed: clsSolo references removed, and the warm
pass now routes WITH deg-2 pins — a dirless bake entry is re-routed at load by the cache guard, so
a pin-less bake buys nothing). A v2 centerline is a handful of line/arc primitives where v1 stored
hundreds of quantized arc steps, and solo routes are gone. **The PERF-26 concern that motivated the
BASE/REGION split — 8.31 MB of asset, 24.85 MB of JSON parsed on the main thread — no longer
exists.** Gate green: 0 descriptor mismatches, 0 of 216 in-band edges uncached. Inventory item 4
("delete the whole bake subsystem") is now an owner call on a subsystem that costs ~130 KB and an
8 s bake, not the multi-megabyte tax it was.

Bake nit fixed en route: skipping degree-capped edges in the bake is WRONG — the bake centres on
the spawn BASE point and over-covers by BAKE_MARGIN, so its window is not the runtime's, and three
edges it called capped are live at runtime (measured). The bake routes the superset.

### NEGATIVE RESULT — do not re-attempt: strict pin-signature cache matching

Tried, measured, REVERTED. The cache-poisoning guard tags entries with whether they were routed
heading-ful (`_v2Dirs`, a boolean). The "obvious" hardening is to tag the pin SIGNATURE and reuse
an entry only on exact match, so no producer can hand back geometry routed under different pins.
**Measured cost: seed-6 baked cold load 18.25 s → 195 s (10×).** Mechanism: deg-2 pins are
window-invariant for INTERIOR edges (verified: 27 interior edges × 5 window sizes, 0
disagreements) but NOT at window frontiers, where membership itself differs — so two windows
alternate, each overwriting the other's entry, and those edges re-route on every stream. The
boolean's apparent sloppiness IS the stability that prevents the thrash: once an entry is pinned,
every pinned request accepts it. Any future attempt at strict matching must first solve frontier
pin agreement (junction-to-junction through-routing would, since deg-2 nodes stop being route
boundaries at all).

### cTurn A/B ready for the owner to dial on arrival

`V2_COSTS.cTurn` in `src/corridor-router.js` (money per radian) is the hairpin dial. Grade
compliance is IDENTICAL at all three values (35% max sustained, same marks) — it only trades
hairpin density against sweep. Map renders for all three are in the gallery.

| cTurn | hairpins 20/11/67 | spans 20/11/67 | km 20/11/67 |
|---|---|---|---|
| 15 | 20 / 38 / 32 | 10 / 6 / 7 | 45.8 / 39.7 / 41.8 |
| **30 (current)** | 17 / 21 / 24 | 9 / 7 / 8 | 45.1 / 39.3 / 41.2 |
| 60 | 17 / 15 / 11 | 11 / 7 / 9 | 44.6 / 38.4 / 40.2 |

## HANDOFF — SUPERSEDED (2026-08-19 evening; see the CURRENT HANDOFF at the end of this file)

**State:** branch `feature/corridor-router` at `103203e`, working tree CLEAN, dev server :3343.
Battery (`node perf-runs/v2-integration-check.mjs`, gitignored): seeds 20/11/67 → 56/50/55 runs,
1 component each, y-spread 0.000, marks 0/0/1 (the seed-67 summit knob), max sustained 35/35/63,
hairpins 17/21/24, deg-2 joint kink mean 35/45/54°.

**Gates: full suite 48/54.** `route-bundle-parity` and the new `road-worker-parity` are GREEN;
`route-worker-sync` is deleted with the mirror. The six standing reds are unchanged and all
pre-date this session: `mission-network` (BUG-41 interior drift, arc-domain hypothesis DISPROVEN —
needs its own session), `graph-topology` (node-departure encodes v1's "node Y rides road grade" —
re-baseline), `story-poi` (pad flatness 1/14, 1.27 m), `road-fill-support` (seed 7, 1.0 m),
`paper-tour` (1 dropped customer), `paper-reroute` (mission-layer re-plan margin — NOT slicing;
verified identical before and after the worker port).

**What the owner should do on arrival:** open `perf-runs/gallery.html`, then drive
`http://localhost:3343/?seed=20` (and 11 / 67 / 6). The one decision waiting is **cTurn** — the
hairpin dial, A/B'd at 15 / 30 / 60 in the gallery with map renders. Everything else is a judgment
call on character: are bores earned now (7–9 per seed), does 35%-max hugging feel honest, is crest
airtime there, do deg-2 bends read as one road.

**Next work, in order (nothing is blocked):**
1. **Owner's cTurn ruling** → set it, re-bake, re-shoot the gallery.
2. **Junction geometry** — the deferred pass. Naive meets are still naive; deg-2 joints are now
   tangent, so what remains is genuine junction geometry (pads/fillets/aprons at deg ≥ 3) plus
   the junction-to-junction through-routing that would make deg-2 nodes stop being route
   boundaries entirely (and would also unlock strict pin matching — see the negative result).
3. **BUG-41 interior drift** (mission-network) — the one real unexplained defect on the branch.
4. **Inventory item 4 close-out** — with bundles at 130 KB the "delete the bake subsystem"
   question is now cheap either way; owner's call.
5. Loop leftovers: story-poi pad flatness, road-fill-support seed 7, paper-tour's dropped customer.

## Route cache DELETED + debug panel rebuilt (2026-08-19 evening, owner instructions)

**Owner: "i think we can get rid of it for now."** Inventory item 4 is CLOSED by deletion
(`584674f`). Gone: both `data/route-cache-*.json.gz`, `src/route-store.js` (routeCacheSig + the
loaders), the bake script, `route-bundle-parity` (+ gate entry), `route-cache-miss-cost`, main.js's
boot await + lazy story-region fetch/import/idle-kick, story.js's `ensureRegionRoutes` dep, and the
vite copy entries. **Kept:** `_sessionRouteCache` — returning to a seed visited earlier in the
session is still instant, with no asset, signature or bake behind it.

Knock-on: `routeCacheSig` was the STATED reason POI_PARAMS / CAMP_PARAMS / DAY_PARAMS /
ECONOMY_PARAMS live outside RANGER_PARAMS. Those comments now cite the reason that survives — a
`road*` key re-routes the whole world.

**Cold load, this machine, no cache of any kind:** boot **1.4 s**; cold → driving in story mode
**6.8 s** (seed 6) / **8.5 s** (seed 20). At the 4× proxy: seed 6 18.25 → **21.94 s** (it was the
only seed the bundle ever helped), eval seeds unchanged at **27.2–28.4 s**. Every seed is now an
equal citizen — there is no "default world" fast path to mistake for the real cost.

### Debug panel rebuilt for v2 (`bb96f73`)

The Roads folder was still driving the arc-lattice router: **25 sliders bound params the v2 path
never reads** (wAlt/wGrade/wOver, Curve Penalty, Max Grade, Goal Blend, Earthwork Cap/Window, wDev,
Deviation Cap, both Self-Clear knobs, both Corridor Clearance knobs, Valley Depth Cap, the four Arc
radii, Heading Bins, Grade Samples, Heur Weight, Corridor 2-Pass/HScale, Solo Reuse, both Refit
knobs, and the five tunnel-PASS knobs). All removed.

New **`Router v2 (prices)`** sub-folder — the tuning dividend, everything in metres-of-flat-road:
`cTurn` (the hairpin dial, per radian), `wGrade` (router climbs at g* = 1/√wGrade), `cCutM`/`cCut2`/
`cFillM`, `cBoreM`/`cPortal`, `gMaxRoad`/`gMaxBore`, `cutMax`/`fillMax`. **`V2_COSTS` now rides each
route job** — a Worker is a separate module instance with its own copy, so without that a live knob
edit would price sync-routed and Worker-routed edges differently.

Deleted with the sliders (both already unreachable): `_gradeEdgeInPlace` (v1 design-grade
smoothing) and `_tunnelPassOpts` (FEAT-40's tunnel DETECTION pass). `tunnelBoreRadius` survives —
bore GEOMETRY is still real. `Min Turn Radius` renamed **Carve Footprint Cap**, which is all it has
clamped since v2 (the fold floor is the fillet rMin inside `corridorCenterline`). Junction sliders
are all still live and unchanged — junction geometry is deferred, not dead.

**Known remaining stale mass (NOT done, deliberately scoped out):** `src/road-carve.js` still
contains the entire v1 arc router (`arcPrimitiveConnect` + dubins + refit + self-clear repair) with
no callers, and ~25 now-inert `road*`/`tunnel*` keys remain in `data/ranger.js`. Both are clean
follow-up deletions; neither affects behaviour. `_smoothDesignGrade` is a third (legacy per-tile
path, reachable only from a dead test hook).

## v1 router deleted + the slider-aliasing bug (2026-08-20, owner instructions)

**Owner: "I guess we can take out roadcarve.js and all the road tunnel keys."** Done (`2149dec`).

- **`src/road-carve.js` 1823 → 430 lines, carve-only again.** The entire ROUTE SYNC region
  (`arcPrimitiveConnect` + search scratch + the QUAL-14 self-clearance repair loop + Dubins
  terminal/fillet + the de-quantize refit), `smoothGradeInPlace` and `applyTunnelPassInPlace` are
  gone. Every carve function stays — terrain.js WORKER_SOURCE still mirrors those (CARVE SYNC).
- **Also dead, also gone:** `_proto.params` (the D-09 weight block) and `_refreshParams()` that
  copied it every re-stream — nothing read either; the lazy `dg` wide-graph getter in
  `_degreeDrops` (its only consumer was the deleted cull); 23 orphaned debug tooltips.
- **Gates retired with their code:** `arc-router`, `road-dequantize` (v1 internals),
  `defect-b-grade` (smoothGradeInPlace). Registry 53 → 50.
- **`data/ranger.js` 218 → 177 keys** — 41 dead road*/tunnel* params removed with their comment
  blocks. `tunnelBoreRadius` stays: bore GEOMETRY (mesh, collider, containment) is real.

### The "v2 sliders don't update anything" bug — diagnosed, and the class removed

**It was module aliasing under hot-module reload, not a wiring fault.** On a *fresh* page load the
sliders always worked (measured over CDP: cTurn 30 → 90, route cache re-routes 154 → 149 entries).
But `V2_COSTS` was a module constant in `corridor-router.js` — a file being edited continuously
during the session — and a Vite HMR update can swap in a fresh module instance. The panel then
mutates the NEW copy while RoadSystem still holds the OLD one, so the knob moves nothing.

**Fix: the price list moved to `RANGER_PARAMS.roadV2`** — the same object every other road slider
binds, in a data module nobody edits mid-session, which removes the aliasing class rather than
patching this instance of it. `RoadSystem._v2Costs()` reads it fresh per route and hands it to each
job spec, so the Worker (a separate module instance with its own defaults) keeps pricing
identically. `V2_COSTS` survives in corridor-router.js as the headless default only.

**Worth remembering for the feel session:** a knob edit takes effect on the next re-route, which is
debounced 150 ms and then re-streams + re-carves; there is no separate invalidation to trigger.

**Remaining known-dead, not yet removed:** `_smoothDesignGrade` (legacy per-tile path, reachable
only from the dead `sampleDesignGradeAt` test hook) and `graph-topology.mjs`'s v1 sub-checks
(GRAPH-CORRIDOR-CLEARANCE / GRAPH-CROSSINGS-CULLED test machinery that no longer exists — part of
that gate's booked re-baseline).

## Price-slider feedback loop fixed (2026-08-20) — the map is the A/B surface

Two owner reports, one real bug and one visibility limit.

**BUG — the map ignored every router-price change (`b7dd8a3`).** `map2d._paramSig()` built its
rebuild signature with `s += '|' + k + '=' + p[k]`; for the nested `params.roadV2` that renders as
the constant `"[object Object]"`, so the signature never moved, `_checkParamChange` never fired,
and the map held a stale network while the real road re-routed underneath it. Object values are
JSON.stringify'd now. Verified with the map open: cTurn 30 → 120 rebuilds it (83 runs, fingerprint
moves, 15891 → 15023 sampled points).

**NOT a bug — "changing turn cost does nothing to the road."** It does; you cannot see it. Measured
in the browser, cTurn 30 → 120 moves the geometry fingerprint and takes the free-roam window from
7.86 → 7.60 km. But free roam streams only ~640 m of road and DRAWS ~160 m
(`project_draw_distance_160m`), so near a gentle spawn there are one or two segments in view and
cTurn's effect — hairpin density on STEEP faces — has almost nothing to act on there. The map was
the right instrument and it was the broken one.

**The loop the owner asked for, now measured:** with the map open, a price edit shows a first
visible change in **~2.5 s** and fully settles in **~9 s** at a 2000 m map radius (debounce 150 ms
→ fresh RoadSystem → progressive chunked re-stream on the worker pool). Flip values on the map,
then drop into freecam on the winner.

**New tool:** `window.__road()` now returns a geometry **fingerprint** (order-independent hash over
every registered run's points) plus `runs`/`pts`/`km`. Two builds with the same fingerprint are the
same roads — this is what makes a price A/B measurable instead of eyeballed, and it is how both
reports above were settled. Harness: `perf-runs/knob-ab.mjs`, `perf-runs/map-ab.mjs`,
`perf-runs/map-settle.mjs` (gitignored).

## Micro-crest fix + owner's weight review (2026-08-20, `6bea353`)

**Owner:** *"the road changes slope rather abruptly and I would like to add a smoother to the rate
of change of the slope. Basically there's lots of tiny microcrests and troughs that upset the
suspension a lot more than progressive steady curves would."* Plus a weights ruling: **grade
discomfort 120 → 180, turn cost 30 → 55** — *"this forces a little more turing without it being free
and everywhere."* Both applied.

**Diagnosed before building.** TWO stacked causes, both artifacts of how the profile is solved and
shipped — neither is anything the router meant:

1. **Grade quantisation.** The DP solves on a 0.5 m elevation grid at 10 m stations, so its smallest
   expressible grade is **5%**. A road wanting a steady −2.5% ships as a staircase alternating 0%
   and −5%. Measured on seed 20: every station grade a multiple of 5%, 219 sample steps jumping a
   full 5 pp.
2. **Station corners** — and this one dominates what the suspension feels. The solved profile is
   lerped onto the 4 m polyline, so grade is constant *within* a station and changes
   INSTANTANEOUSLY at each one: a corner every 10 m, unbounded vertical curvature, however small
   the step.

**Both fixed where the ticket already said to fix them** ("if lattice sawtooth shows up it gets
handled in stage 3, never priced away" — crest airtime is a FEATURE, so nothing was added to the
DP's cost model):
- `dequantizeProfile()` — fixed 3-pass binomial low-pass on interior stations. Deliberately NOT the
  user knob: it removes a solver artifact, so the GRID sets its size, not taste. (Driving it from
  the user knob was measured WORSE at large settings — heavy station smoothing fights the class
  clamps and the polyline rounding downstream.) Endpoints never move, no station may change
  bore/bridge status, and it is RE-PRICED through the new `priceProfile()`; if smoothing would break
  a grade cap the blend bisects back toward the solved profile, which is always feasible.
- Corner rounding on the shipped polyline, window `roadV2.vSmoothM`, displacement bounded to
  ±0.25 m = **half the solver's own elevation quantum**, so the shipped road never departs from the
  priced one by more than the solver could resolve.

**Measured** — vertical jolt (v²·dg/ds at 20 m/s, p99 over seeds 20/11):

| vSmoothM | jolt p99 | strongest crest | note |
|---|---|---|---|
| 0 m | 0.51 / 0.46 g | 0.31 g | the reported problem |
| **15 m (default)** | **0.24 / 0.24 g** | 0.25 g | halved; crest intact |
| 30 m | 0.48 / 0.45 g | 0.26 g | worse again |

**NOT monotone — more is not smoother.** Past ~2 stations the ±0.25 m bound clips and clipping puts
corners back, so the slider caps at 25 rather than offering a knob that degrades when turned up.
Station grades now read `-3.6 -3.2 -2.5 -1.5 -0.8 -0.7 -1.2 -2.3` where they read
`-3.0 -5.0 -3.8 0.0 0.0 0.0 0.0 -1.7`.

**Contract intact** on all three eval seeds: node y-spread 0.000, marks 0/0/1, sustained ceiling
respected, spans stable, one component each.

**Gate movement:** `road-fill-support`, `paper-tour` and `paper-reroute` went **GREEN** (a smoother
profile sits better on its embankments). `pond-route-around` has a NEW red — but only its
NON-VACUOUS precondition: the guarantee passes (0 of 13468 centerline points in water), while the
check that the router would *want* the water without the no-go discs no longer holds at the new
weights. Routing is untouched by the smoother (it runs after route selection), so that is the
weights, and it is benign. Standing reds now: `mission-network` (BUG-41), `graph-topology`
(re-baseline), `story-poi` (pad flatness), `pond-route-around` (this precondition).

**Owner has NOT yet reviewed:** cut, cut², fill, bore, portal, max road grade, max bore grade,
cut→bore depth, max fill. All in the same folder, all re-route live.

**Filed, not fixed (owner: "we don't have to fix this now"):** `BUG-53` — road edges cross away from
nodes. Records their ranked preference (delete a leg > trim to the crossing > legitimise it, with
their own "causes lots of chaos" doubt), why there are more now (the cull deletion was right on its
evidence, but that evidence predates the 2.5D corridor whose switchback stacks can excurse into a
neighbour), and the census that should decide the design — including the VERTICAL GAP at each
crossing, since with bores in the vocabulary some already pass under and are not defects.

## Grade cap honoured + the captured "terrain tear" diagnosed (2026-08-20)

### Max Road Grade was real, but the ladder overrode it (`0f4ac6e`)

**Owner:** *"does max road grade actually limit the grade? it seems like its not a hard cap, rather
it actually has very little influence."* Half right, and the half that was wrong mattered.

It IS a hard cap in the solver — sustained-24 m grade tracks it exactly (cap 20/25/30/35% →
shipped 22/27/30/35%). What ignored it was the **fail-safe ladder**: rung 3 re-solved with a LITERAL
`gMaxRoad: 0.38` whatever the setting. At a 20% cap, the few edges that could not solve at 20%
shipped at **38%** — and those are exactly the steep bits a driver notices, which is why the knob
felt inert. Measured on seed 20 at cap 0.20: 54 edges at the cap, **2 on rung 3**, and those 2 owned
the 38% maximum.

Relief is now **relative**: `min(0.38, gMaxRoad + 0.03)`. At the 0.35 default that is 0.38 —
byte-identical, verified against the battery. Honouring the cap alone made one thing WORSE (the
sweep caught it): a seed-11 edge fell all the way to mark-and-ship, and a marked run terrain-follows,
so it shipped at **106%** where a legal 38% road existed. So a **CEILING rung** now sits before the
mark — if even the relieved cap fails, solve at the 0.38 contract ceiling. Marking is for "no legal
road exists", not "your design cap was ambitious".

Net at cap 0.20: instantaneous max **38% → 23%** (seed 20), **106% → 31%** (seed 11), zero marks on
both. Ladder use is instrumented (`_v2Rung`), so "which rung did this edge land on" is answerable.

### The captured tear is NODE-SHARING OVERLAP — see BUG-53

`rangersim-capture-1787289162055.json` (seed 6, mark −4420, 1535, *"4 roads converging mostly to one
spot, huge tear in terrain"*). Replay says the world is **fine by every contract**: window-invariance
gradeΔ 0.000 m over 88 on-road points, fold radius 938 m against a 15 m design minimum. It is a
**degree-3** node (not four roads) whose three run ends agree to **0.000 m**.

The defect is lateral: two of the three runs leave the node nearly collinear and share earthworks
**out to 244 m at a 0.1 m minimum separation** — two roads carving the same dirt. This reframes
BUG-53: the disjoint-crossing class really is empty-to-rare as the purity probe found, but that same
probe recorded **59–82 node-sharing crossings per seed** and dismissed them as v1 wander managed by
the corridor discs — machinery v2 deleted with nothing in its place. **Node-sharing overlap is the
class that reaches the player.** And it is not the deferred junction pass in disguise: a pad dresses
a few metres, not a 244 m shared corridor. Full detail + the census to run: BUG-53.

---

# CURRENT HANDOFF (2026-08-20) — read this one

**Where the work lives.** Two tickets track it, both in `.planning/todos/pending/`:
- **`feat-68-router-v2-teardown.md`** (this file) — the corridor router itself. Everything above is a
  dated record, appended in order; this section is the only live "what now".
- **`bug-53-offnode-edge-crossings.md`** — road-overlap defects, filed 2026-08-20 from the owner's
  capture. Not started.

**Branch:** `feature/corridor-router` at `563c757`, worktree `/Users/ledogen/CodeShit/CarGame-corridor-router`,
dev server **:3343**. Main is untouched and still ships v1 — the swap is one merge at sign-off.
Battery: `node perf-runs/v2-integration-check.mjs`. Gallery: `perf-runs/gallery.html`.

**State (eval seeds 20/11/67):** 56/50/55 runs, 45.0/41.1/41.8 km, one component each, node y-spread
0.000 m, marks 0/0/1, sustained 35/33/63% (the 63 is that one marked run), hairpins 17/21/25.
Cold→driving, no route cache at all: **6.8–8.5 s on this machine**, 22–28 s at the 4× proxy.

**Gates: 4 standing reds**, all diagnosed, none blocking a character judgment:
| gate | what it is |
|---|---|
| `mission-network` | BUG-41 interior drift, p99 2.4 m. The one real unexplained defect. Arc-domain hypothesis DISPROVEN. Needs its own session. |
| `graph-topology` | Re-baseline: its node-departure rule encodes v1's "node Y rides road grade", and two sub-checks test culls that no longer exist. |
| `story-poi` | Pad flatness, 1 of 14 pads varies 1.27 m. |
| `pond-route-around` | Its GUARANTEE passes (0 of 13468 points in water); only the non-vacuity precondition fails at the new weights. |

## Next, in the order I'd take them

1. **Finish the price review (owner).** Reviewed: `cTurn 55`, `wGrade 180`. **Not yet reviewed:** cut,
   cut², fill, bore, portal, max bore grade, cut→bore depth, max fill — and **re-review Max Road
   Grade**, which only started behaving correctly today (it was being overridden by the ladder). All
   live in the `Router v2 (prices)` folder; the map A/B loop is ~2.5 s to first change, ~9 s settled.
2. **BUG-53 — node-sharing overlap.** The measured case is two runs sharing a node and sharing
   earthworks for 244 m at 0.1 m separation. Start with the census in that ticket; the owner's
   preference is to delete a leg (with the degree-cap's bounded-hop detour guarantee) over trimming
   to the crossing. NOT solved by the junction pass — a pad dresses metres, not 244 m.
3. **Junction geometry (deferred pass).** Naive meets at degree ≥ 3. Mostly REATTACHMENT of shipped
   machinery (pads/fillets/aprons consume the run contract + node incidence, both of which survive).
   The one genuinely new piece: canonical approach headings at junctions — deg-2 already has them.
4. **BUG-41 interior drift** — own session, own head.
5. **Gate re-baselines** (graph-topology, story-poi, pond-route-around's precondition).
6. **Acceptance leftovers before the swap merge:** wire the in-game marked-seed disclaimer; character
   sign-off from driven checkpoints; retire the remaining v1 gates' dead sub-checks; delete the old
   router from main in the swap commit. Also still known-dead: `_smoothDesignGrade` (legacy per-tile
   path, reachable only from a dead test hook).

## Two things a future session must NOT re-attempt

- **Strict pin-signature cache matching** — measured 18 s → 195 s cold load. Deg-2 pins are
  window-invariant for interior edges but NOT at window frontiers, so strict matching thrashes.
  Full write-up in the negative-result section above.
- **Restoring the crossing/clearance culls** to fix BUG-53 — they cost 11–21 good edges per seed and
  took connectivity to 54%. Connectivity outranks tidiness; fix the overlap directly.
