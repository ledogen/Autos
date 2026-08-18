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

## Acceptance

- [ ] Router-attributable cold-load baseline measured on the old hardware, published in-ticket.
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

**Not simplified, ever:** the carve (MESH==PHYSICS), the determinism promise itself — only the
cost of keeping it. (The topology layer is no longer on this list: it isn't redesigned during the
build, but it is expected to shed its cull apparatus once v2's corridors land — see 9–10.)
