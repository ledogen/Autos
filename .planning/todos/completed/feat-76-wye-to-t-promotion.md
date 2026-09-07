---
id: FEAT-76
type: feature
status: completed
severity: medium
---

# FEAT-76 — promote wye departures to real T intersections

## RESOLUTION — closed 2026-09-06 (owner: "overall it looks fantastic")

Shipped on `feature/feat76` as `da187f2` + the role fix that followed it. The trunk is sliced at the
departure point P into two ordinary runs, P is a real degree-3 node with an ordinary junction pad, and
the side road starts there — it does not exist over the shared ground at all. **The routing did not
change**: `g`, `g.adj`, the drop set, the frozen deletes and every departure pin are byte-identical, so
the pins→routes→degree→pins cycle never closed. The argument was written and checked before any code:
`.planning/research/T-PROMOTION-FIXPOINT.md`.

Measured, 5 seeds at 1400 m, against the wye baseline:

| | wye | T |
|---|---|---|
| pairs sharing >= 30 m | 40 | 8 |
| shared ground | 3.2% of network | 0.2% |
| forks built as wye / as T | 35 / 0 | 0 / 4 |
| departure corner, tightest (median) | 41.4 m | 60.8 m |
| under `roadMinTurnRadius` (15 m) | 4 of 37 | 1 of 37 |
| ceded vertices in shipped geometry | 946 | 0 |
| `junction-stitch` unstitched stretches | 91 | 79 |
| fork camber residual (BUG-56 B4) | 46 rows | 0 |
| worldgen, seed 6 | 41 s | 5 s |

Owner reviewed ten junctions as before/after plates with an overhead render of each:
https://claude.ai/code/artifact/8ba8cd2f-7a4a-491c-bff0-58286163a765

Gates: no new reds. `junction-stitch`, `mission-network`, `paper-tour` and `pond-route-around` were
already red on main and stay red. New gate `promoted-node-id.mjs` proves a T derives a byte-identical
id, position, deck height and degree from four overlapping stream windows.

### Decisions taken during the build that differ from the ticket text below

- **`offCurveSpans` is KEPT.** The ticket listed it for deletion with `cededSpans`/`departureSpans`,
  but `_v2RegisterShoved` owns it independently for the BUG-57 shove rung, and the T's departure blend
  needs it for the same honest reason (points off the primitive). The other two go.
- **B6's cap changed.** For a wye a fixed `gMaxRoad` was right, because steepness at the fork was the
  departure hold's artefact. A T has no hold, so its departure grade is just the grade of the road
  there — seed 6's `g:5,1,0:5,2,2` already ships 25% on its own length. The rule is now "a T may not
  put a hump in a road": the run's own worst 12 m plus `roadJunctionBlendMaxGrade`, the allowance every
  other junction arrival already gets. Testing against the old fixed cap condemned real roads and cost
  a pair its merge, which shipped as a `road-connectivity` crossing.
- **B3 is measured on the junction-blended departure, outside the pad footprint.** Inside the pad the
  pad plane IS the surface and the pad's own rules govern it. Measured on the raw solve instead, it
  rejected all 11 of seed 6's forks for a wall the pad dresses.
- **The departure blend decays as `(1-u)^2`, not a smoothstep.** `w'(0) = -2` puts the ANGLE at the
  node where the pad owns it. A smoothstep leaves P parallel to the trunk, which is a wye drawn a
  different way, and every one of seed 6's forks failed the deck seam on it.
- **Fork placement got a rule the wye never needed**: rank candidates by deck agreement, and reject any
  fork that does not actually END the sharing. A wye owned the ground up to its fork; a T owns nothing,
  so a fork placed mid-stretch rebuilds the defect by accident.
- **`_v2PromotableFor` asks the question at plan time**, on the samples, so a pair with no possible T
  stops blocking the crossing rung. Without it seed 67 shipped real crossings.

### What did NOT land

**The deletion.** It is dead in the live path but still in the file, and it is now **QUAL-30**, which
carries the full inventory and the one design question (routing disjoint pairs through the promotion)
that has to be settled before `_v2RegisterMidSpan` can go.

### Residue, stated plainly

Two of the ten reviewed plates carry a deck step where the two roads part slowly and the departure has
least room: 1.00 m at 20 m out (seed 7, -1633.6,-40.2) and 2.17 m at 20 m out (seed 3, -1787.7,1336.7),
both where the roads are still about 11 m apart. Everything else on the ten measures zero. Four sharing
pairs across the five seeds still promote to nothing and are counted, not hidden
(`_v2MergeSkipped('promote'|'promote-accept'|'promote-infeasible')`).

Separately, the review turned up **BUG-59**: junction pads across the network sit on a 13.5 m floor
rather than a size derived from their legs — 47 of 70 junctions on three seeds. It predates this work
(site nodes and promoted Ts floor at the same rate); the T promotion only made it visible.

---
# FEAT-76 — promote wye departures to real T intersections

**Owner, 2026-09-06 (this ticket is a REWRITE — see "What was tried and rejected" before starting):**

> take legs that use parallel routing and wye departure and turn them into parallel routing with
> t departures … i just want them promoted to real intersections so we don't have to maintain this
> weird wye specific intersection machinery and can just do "new leg departs from old road, blend
> and ship"

**The routing does not change. Only the departure does.** Two roads sharing a corridor is existing,
wanted behaviour that arises on its own from the cost model. What is being replaced is the *shape of
the split at the end of the shared stretch*, and the ~1100 lines of machinery that build it.

## Why a T and not a wye

A wye is **one-sided**. Two roads run together and peel apart through a taper band, so the junction
is a smooth fork in one direction of travel and an ambiguous merge in the other. A T is symmetric —
it drives the same from all three approaches, it needs no band, no gore, no ownership bookkeeping,
and it is a shape the junction pad machinery already handles because it is just a degree-3 node.

The secondary win is deletion. The wye is carried by a large, interlocking body of code that exists
for no other purpose (inventory below).

## What happens today

Two runs leave a node (or meet mid-span), stay within `mergeProxM` (18 m) for a while, and the plan
layer merges them:

1. `_v2NodeMerges` (`road.js:2892`, ~325 lines) — per-node plan. Walks the conflict interval, picks
   roles (`aWins = A.S.L > B.S.L`, tiebreak `A.ck < B.ck` — **the winner is the LONGER ROUTE**, which
   is already the "older road" notion this ticket needs; do not invent a new rank), locates the fork
   abreast on the loser, and sizes a taper band off `TAPER_LADDER`.
2. `_v2RegisterMerged` (`road.js:5031`, ~420 lines) — builds the loser's registered geometry as
   `[ceded strand][taper band][its own line]`, re-solves the outer profile with fork pins, and runs
   an acceptance ladder (band length × hold fraction × seam × grade).
3. The loser's entry carries three span sets: `cededSpans` (these vertices ARE the winner's),
   `offCurveSpans` (ceded + band — tells the ribbon and the analytic refine to stay off the
   primitive), `departureSpans` (BUG-56 B4).

## What is wanted

```
BEFORE (wye)
  N ======================\___ B      side road cedes, tapers, forks
    ======================

AFTER (T)
  N ==========P===========            through road, SPLIT at P
              \___ B                  side edge STARTS at P
```

**RULED (owner, 2026-09-06): one road on the shared ground, full stop.** The side edge does not
exist over the shared stretch — not as geometry, not as a ceded bookkeeping entry. `P` is a real
degree-3 graph node and gets an ordinary junction pad. The side edge's key becomes `P→B`, not `N→B`.

This is the maximum-deletion option and it was chosen deliberately over the cheaper one (keep the
ceded entry, promote only the fork), because keeping the ownership bookkeeping keeps most of the
machinery this ticket exists to remove.

**The through road does not move** (owner ruling 2026-09-06, carried over): it was already built, and
the add-on is grafted onto it. `A–P` and `P–B` are SLICES of the trunk's existing registered
polyline. Nothing re-routes. A through road that bends to meet its side road is a wye again.

## The hard part: node identity

Every node in the graph today is a blue-noise site, id `[cmx, cmz, k]`, positioned by
`_siteAt` → `_anchorSites`. A promoted T has no site. It needs a synthetic id that:

- **never collides** with a real site id;
- is **byte-identical in every stream window** that contains it (BUG-25's failure mode is geometry
  that depends on approach direction) — so it must derive from window-invariant inputs only:
  the trunk's canonical edge key plus a quantised arc position is the obvious candidate;
- **survives `key(id)` = `` `${id[0]},${id[1]},${id[2]}` ``** and `cellA.join(',')`, because that is
  how four modules outside the road system consume node identity:
  `mission.js` (mission edge identity), `map2d.js` (anchor nodes, coloured by degree),
  `paper-route.js`, `world-validate.js` (union-find connectivity — a synthetic node that does not
  join correctly reads as a disconnected world);
- has a **position and a height**: `_nodePos` and `_v2NodeHeight` must answer for it. The height is
  the trunk's own deck at that arc — it is a point on an existing road, so there is no freedom here.

Related: run keys are `` `g:${key(c1)}:${key(c2)}` `` (`_edgeClsKey` uses `c1.join('_')`), and the
"one registered run per graph edge" assumption is stated at `road.js` (search `runs stay 1:1 with
graph edges, which every consumer already assumes`). Splitting the trunk breaks that unless the
split is expressed as two real graph edges, which is what this design does.

## The fixpoint, and why it is smaller than it looks

Promoting `P` changes the trunk's node degree, and degree feeds departure pins, and pins feed
routing. That is the `pins→routes→degree→pins` cycle the plan layer already fights with its two-pass
`_planRev` trick (`road.js`, search `R4: settle the crossing-rung delete set FIRST`).

**Slice-don't-reroute is what breaks it here.** `A–P` and `P–B` inherit the trunk's polyline verbatim;
they are not re-routed, so their geometry cannot depend on the pins the split creates. The side edge
`P–B` likewise keeps the geometry it already had past the fork. Nothing re-solves, so nothing feeds
back. **Write this argument down in the research memo and have it checked before building** — if it
turns out a re-solve is unavoidable somewhere (the pad plane at `P`, most likely), that is the moment
to stop and re-scope, not to paper over it.

## What gets deleted

Measure this before and after; the deletion is half the point. Current footprint in `src/road.js`
(10,595 lines total):

| Method | Line | Size | Fate |
|---|---|---|---|
| `_v2NodeMerges` | 2892 | ~325 | the conflict walk survives (it finds the shared span); role resolution survives; the band ladder, `FORKWIN`, `TAPER_LADDER`, `RFLOOR/RFLOOR_MIN`, `MINSPAN` fork sizing all go |
| `_v2RegisterMerged` | 5031 | ~420 | mostly goes — `endData`, the taper build, the hold, the band×hold×seam×grade acceptance ladder, the fork-pinned outer re-solve |
| `_v2MidSpanPair` | 3433 | ~69 | review — mid-span pairing still identifies where a T lands |
| `_v2BundleSolve` | 4488 | ~162 | exists to negotiate fork decks across a bundle of merges; a T has no fork deck |
| `_v2DisjointFor` | 3524 | ~99 | review |
| `_v2WinCamber` / `_v2CamAtArc` | 4963 | ~15 | only the seam test uses them |
| `buildTaper` | — | — | delete |
| `cededSpans` / `offCurveSpans` / `departureSpans` | — | — | delete the concept |

Consumers that lose their special case: `map2d.js:1732` (`_surfaceSlices` filters ceded spans to stop
double ink, plus the absent-winner rule), `poi.js:849` (skips POIs on ceded stretches). Gates that read
these spans and will need rewriting rather than deleting: `crossing-census`, `crossing-rung-parity`,
`graph-topology`, `junction-stitch`, `overlap-census`, `capture-classify`, `network-worker-parity`
(field list).

**Do not delete the acceptance tests' INTENT.** BUG-56 B6 (departure grade — the steepest 12 m a
driver meets in the departure) and B3 (the seam — two decks may not diverge faster than the ground
between them can slope) exist because real defects shipped without them. A T departure still needs
both checks; it just does not need them expressed as a band-ladder rung. `mergePadArrivalMax`
(~0.12) is the pad-side equivalent already in place for ordinary junctions.

## Build order

1. **Baseline first.** `node test/route-sharing-census.mjs` and `node test/taper-band-census.mjs`
   (both on this branch, both rainy-day). Record the wye inventory: how many merges, where, span
   lengths, band radii. This is what "the wyes are gone and nothing else moved" will be judged
   against.
2. **The fixpoint argument, written down and reviewed**, before any code (see above).
3. **Synthetic node identity** — id shape, `_nodePos`/`_v2NodeHeight`, and a headless gate proving
   the same T derives an identical id from ≥3 stream windows containing it. This is the piece that
   touches four modules outside `src/road.js`; do it first and alone.
4. **The split** — trunk run sliced at `P` into two registered runs, side edge re-keyed to start at
   `P`, `P` gets a pad through the existing degree-3 path (`_detectNodeJunctions`).
5. **Delete the wye machinery**, one method at a time, with the gates green between each.
6. **Re-measure** and report the deletion in lines, plus the before/after wye→T counts.

## Acceptance

- [ ] Every wye that ships today is either a T or explained. No taper bands remain in registered
      geometry (`offCurveSpans` gone as a concept, not merely unused)
- [ ] `world-determinism`, `road-worker-parity`, `network-worker-parity` unchanged — a promoted node
      must not make geometry depend on which thread or window produced it
- [ ] Synthetic node ids proven window-invariant by a registered gate (≥3 windows, identical id)
- [ ] `graph-topology` green, `crossing-census` zero real crossings — the BUG-57 crossing invariant
      still holds with split trunks
- [ ] **Connectivity strictly non-decreasing.** Run count and reachability may not fall. A side road
      that ends up shorter is correct; a side road that ceases to exist is a bug
      (`feedback_connectivity_over_culling`)
- [ ] `world-validate`'s union-find still sees one connected world with synthetic nodes in it
- [ ] Owner drives a promoted T and confirms it reads as an intersection from all three approaches
- [ ] Deletion reported in lines; `bench-worldgen` before/after (a regression needs an owner ruling)

## Risks

- **Node identity leaks.** Four modules consume `cellA`/`cellB` as opaque triples. A synthetic id
  that stringifies differently, or collides, will surface as missing POIs / broken missions / a
  "disconnected" world rather than as an obvious crash.
- **The trunk split is a graph mutation mid-build.** Order and window-invariance are the whole risk;
  the deg-2 departure pins (`road.js`, `a pure fn of the settled post-drop adjacency`) are the
  discipline to copy.
- **Deleting acceptance tests with the machinery that hosted them.** B6 and B3 are real. Port the
  checks, do not drop them.

## What was tried and REJECTED — do not rebuild this

An earlier reading of this ticket (commits `a0d3d42`…`b37f50e`, `src/` reverted at
`feature/feat76`) built a **router-side reuse discount** — a `rideRho` knob that made a road cheaper
to build along an existing road, so sharing would be *created*. **The owner rejected it on sight:**
it changes where roads go, and at seed 6 (791,−2075) it produced tangles and an extra leg, strictly
worse than the default. **This ticket does not want more sharing. The sharing that exists is
correct.** The `src/` changes are reverted; the two censuses were kept.

Measurements that survive from that pass and are worth not re-deriving:

- **Sharing is 3.2% of network length, and ZERO of it is between disjoint roads** — every one of 40
  sharing pairs across seeds 6/20/11/7/3 @1400 is legs of the same junction (1 of 44 at radius 2400).
  So the wye inventory this ticket converts is *entirely* the junction-leg class.
- **The merge ladder already sanctions 35 of 40**; the unsanctioned residue is 0.14% of network.
- **R5's `wSibDepart` does not bind.** Swept 0 / 3 (shipped) / 12 it moves sharing 3.11% / 3.18% /
  2.93%, 39 / 40 / 39 pairs — not even monotone. Sibling-leg sharing is TERRAIN-determined, not
  bearing-determined. Do not reach for that knob.
- **Taper bands are mostly geometrically fine** (per-band tightest corner median 41.4 m vs
  `roadMinTurnRadius` 15 m; 4 of 37 below it). **This is not an argument against the ticket** — the
  owner's objection to wyes is SHAPE and one-sidedness, not corner radius. A gentle wye is still a wye.

Full write-up: `.planning/research/ROUTER-REUSE-AND-PARALLELISM.md` §1.

## Known adjacent bug (NOT this ticket)

The wye departure **does not render on the map view**, which is currently how the owner spots wyes
(`map2d.js:1732` `_surfaceSlices` is the place to look — it subtracts `cededSpans` from the drawn
polyline to avoid double ink). Useful for troubleshooting right now, so leave it; it should be
captured separately and will likely disappear on its own when `cededSpans` does.
