---
id: FEAT-76
type: feature
status: pending
severity: medium
---

# FEAT-76 — route reuse: replace the post-hoc wye with a T-junction the router chooses

**Owner proposal, 2026-09-04.** Today, when the cheapest thing for two roads is to run along the
same ground, they route *independently*, land near each other by coincidence, and the plan layer
merges them afterwards — building a wye where they diverge past a separation threshold. The
proposal inverts that: let a routing centerline see that a neighbour has **already justified** a
path, use any of it at a discount, and diverge wherever it is genuinely most efficient to leave.
The junction then falls out of the search — a T, or any angle — instead of being reconstructed from
two accidental near-parallel runs.

Background analysis, measurements, and the code trace behind every claim below:
`.planning/research/ROUTER-REUSE-AND-PARALLELISM.md`.

## Sequencing — UNBLOCKED 2026-09-06

This ticket was held behind the character retune, because its central acceptance line ("T-junctions
visibly emerge at a ρ that leaves road character intact") had no settled reference to be judged
against. That reference now exists, and it is the CURRENT SHIPPED DEFAULTS.

QUAL-28 landed (the gate cleanup) and QUAL-29 closed with **no knob change**: the owner drove the
whole bracket and kept `roadV2` exactly as shipped — `cTurn: 45`, `wGrade: 180`. Read QUAL-29's
resolution before touching ρ; it records why the v1-at-reanchor column is a historical reference and
NOT a target, so a character A/B here is scored against main as it stands, not against v1.

**The baseline for this ticket's A/B is therefore main's road at the shipped defaults.** Capture the
`road-character.mjs` column before the first ρ change so the comparison is like-for-like; the shipped
column is tabulated in QUAL-29 and can be copied rather than re-measured.

One caveat carried in from QUAL-29's measurements: **BUG-58** (isolated stations blowing past
`cutMax` and single 6 m-vertical-radius crests) is live at the shipped defaults. Those outliers
dominate the earthwork MAX and the crest MAX in any report this ticket produces. Compare on means
and p99s, or fix BUG-58 first — do not read an outlier as a reuse regression.

## Why this is not a small change

Routing today is a **pure function of one edge**. `routeEdgeV2` (`corridor-router.js:1001`) sees only
the spec built by `_v2EdgeSpec` (`road.js:2661`): two node positions, their pinned heights, pond
discs, departure pins, cost list. Nothing about any other edge. Three mechanisms depend on that:

- the per-edge cache `_proto.cls` (`road.js:2610`), direction-canonical (A→B routed, B→A its exact
  reverse);
- the route Worker pool, which completes jobs in arbitrary order (`road-worker.js`), pinned
  byte-identical to the sync path by `test/road-worker-parity.mjs`;
- **window invariance** — the world streams in a moving window, so which edges exist and the order
  they route depends on approach direction. Order-dependent geometry is BUG-25's failure mode
  (whole edges flipping on re-stream).

The naive form of the proposal — "if it is already routed, it is free" — is order-*dependent* and
would break all three. The design below buys the same determinism a different way.

## Design

### D1 — deterministic priority order, not arrival order

Replace "already routed" with a **rank**. Edge *e* may reuse only edges that strictly outrank it,
drawn from a **radius-bounded** neighbourhood. Rank must be a pure function of the settled
post-drop graph — the same discipline the deg-2 departure pins already follow (`road.js:2603`:
"a pure fn of the settled post-drop adjacency, so every window derives the identical pins").

This turns "who went first" into a fixed dependency DAG. Route level by level; edges of equal rank
are mutually independent and still dispatch together.

**RULED (owner, 2026-09-05): rank = chord length, descending, with the canonical edge key as
tiebreak.** The longer edge outranks the shorter, so the long-haul road is the trunk and the short
spur joins it — which is how road networks actually accrete. It is a pure function of the two node
positions, so window-invariance is immediate and needs no separate derivation; the tiebreak makes it
a strict total order, which D1 requires (reuse is only permitted *strictly* up-rank, so ties must
never be mutually reusable).

Rejected, with reasons, so they are not re-proposed:

- *Trunk-ness / expected traffic.* There is no road-class, traffic, or site-importance score
  anywhere in the road graph today — verified 2026-09-05. It would have to be invented first.
- *Local degree / betweenness.* The closest honest proxy for traffic, but betweenness is inherently
  a global measure; clamping it to the radius-bounded neighbourhood the cache requires turns it into
  a different and much less meaningful number, and makes the invariance proof harder for no gain.
- *Canonical key alone.* Free and invariant, but gives no reason a minor road would not become the
  trunk a major road joins — the outcome this section exists to prevent.

### D2 — reuse is a SNAP, not a discount

A "nearby cells are cheaper" cost term produces two roads 3 m apart, which is worse than either
outcome — a fake shared corridor the merge ladder then has to clean up anyway.

Instead: **inject the higher-ranked centerline's vertices into the A\* lattice as traversable
low-cost edges.** Reuse then literally means walking the trunk's own polyline, so the shared span is
*exactly* coincident by construction. Leaving the polyline costs a turn penalty; the exit vertex is
the junction.

Reuse cost is a multiplier ρ on cost/m along injected edges. ρ = 0 (free) is degenerate — every road
would snake to the nearest existing road. Start at ρ ≈ 0.2–0.3 and tune against road character.

**This must not become injected character.** Per `feedback_emergent_over_injected`, the T-junctions
have to *emerge* from ρ and the turn penalty. If they only appear when ρ is forced low enough to
distort routes, the idea has failed and should be reported as such, not propped up.

### D3 — the divergence vertex becomes a real graph node (THE HARD PART)

The exit vertex splits the trunk edge → the trunk's node degree changes → departure pins change →
routing changes. That is the pins→routes→degree→pins cycle the plan layer already fights with its
two-pass `_planRev` trick (`road.js:2693`, where deletions are judged on layer-0 precisely to break
the cycle).

**Do not start construction until this has a written fixpoint story.** Likely shape: the split is
decided on the same frozen layer-0 pins the delete verdicts use, so reuse never feeds back into the
ranks or pins that produced it. Needs to be proven, not assumed.

### D4 — what happens to `_v2NodeMerges`

If D1–D3 land, coincident spans are coincident by construction and the merge ladder
(`road.js:2896`) should shrink to a residue: pairs that still arrive near-parallel without a shared
ancestor. **Scope note:** this ticket does not delete the merge ladder. It measures how much of it
goes idle. Removal is a follow-up, once the residue is characterised.

## Build order

1. **Instrument first.** ✅ DONE 2026-09-06 — `test/route-sharing-census.mjs`; numbers and reading
   in the research memo (§1, "MEASURED — the step-1 sharing census"). Headline: **3.2% of network
   length is shared, and ZERO of it is between disjoint roads** — all 40 sharing pairs across 5
   seeds at radius 1400 are legs of the same junction (1 of 44 at radius 2400). The merge ladder
   already sanctions 35 of 40; the NOTHING residue is 0.14% of network. **This changes what D2 has
   to prove:** there is no pool of accidental overlap to convert, so reuse must CREATE sharing that
   independent routing does not produce — which puts the whole weight of the ticket on the ρ
   character A/B rather than on tidying up coincidences. Owner ruling wanted before step 2.
   Count how much sharing exists today: registered-run pairs within
   `mergeProxM`, their span lengths, how many produce a merge vs a shove vs nothing. This is the
   baseline the feature has to beat, and it is cheap.
   **Output shape RULED (owner, 2026-09-05): a headless rainy-day script in `test/` that walks
   several seeds and prints the sharing census per seed** — pair count within `mergeProxM`, the
   span-length distribution, and the merge / shove / nothing split. Multi-seed is the point: a
   single-seed dump explains the mechanism but cannot say whether a later change generalises. Not a
   registered gate (it measures, it does not assert). A Map2D overlay of shared spans was considered
   and deferred — the numbers come first.
2. **D1 rank + neighbourhood**, with a headless test proving rank is window-invariant (same edge,
   several stream windows, identical rank set) before any router change.
3. **D2 lattice injection** behind a debug slider (ρ, turn penalty), no graph-node split yet — roads
   may share ground but the junction is still whatever the existing plan layer makes of it. This is
   already A/B-able for character.
4. **D3 node split** only after the fixpoint story is written and reviewed.
5. **D4 measure** the merge ladder residue.

Stop after any step whose A/B fails on road character. Per `feedback_visual_regression_revert_first`,
the owner's eyes are the gate on 3 and 4.

## Interaction with perf

- The DAG order costs the **play** path no parallelism, because the play network build is already
  fully serial inside one worker (see the research memo §2). It costs Map2D and the mission planner
  a little, recoverable by dispatching per DAG level.
- Cache validity becomes `(edge, seed, params, higher-ranked neighbours)` instead of
  `(edge, seed, params)`. The network worker's whole perf story is that its `RoadSystem` persists
  across builds with warm routes intact — a priority neighbourhood that shifts as the window slides
  would drop warm routes on every move. **A radius-bounded, window-invariant neighbourhood solves
  the invariance risk and the cache risk with one decision.** Treat them as one requirement.
- Possible speed win, unmeasured: a reusing edge's A\* terminates early on reaching the injected
  polyline, and a shared span means one corridor search where there were two.

## Acceptance

- [ ] Rank + reuse neighbourhood proven window-invariant by a headless gate (identical for an edge
      across ≥ 3 stream windows that contain it), registered in `test/gates.mjs`
- [ ] `world-determinism` and `road-worker-parity` unchanged — reuse must not make a route depend on
      *which thread or window* produced it
- [ ] `graph-topology` passes; zero census crossings (`crossing-census`) — reuse must not
      reintroduce the BUG-57 crossing class
- [ ] T / arbitrary-angle junctions visibly emerge at a ρ that leaves road character intact
      (owner A/B, per `feedback_emergent_over_injected`)
- [ ] Merge-ladder residue measured before/after; `junction-stitch` row count reported (movement is
      expected here — it must be *explained*, not silently accepted)
- [ ] The D3 fixpoint story is written down in the research memo before the node split is built
- [ ] Worldgen bench (`test/bench-worldgen.mjs`) reported before/after; a regression is acceptable
      only with an owner ruling

## Risks

- **D3 is a genuine fixpoint problem.** If no clean layering exists, the honest outcome is to ship
  D1+D2 (shared ground, existing junction machinery) and close D3 as not-worth-it.
- **Character regression.** Cost-sharing routers tend toward tree-like networks. This world's
  character is sparse and valley-following; a strong ρ could make it look like a road *system*
  rather than roads that happened. That is the thing to watch in the A/B.
- **Connectivity.** Per `feedback_connectivity_over_culling`, reuse must add options, never remove
  roads. If a reusing edge ever declines to exist because sharing was cheaper, that is a bug.
