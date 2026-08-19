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
