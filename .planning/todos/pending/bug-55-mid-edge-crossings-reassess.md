---
id: BUG-55
type: bug
status: open
severity: major
opened: 2026-08-22
source: owner instruction 2026-08-22 after four rounds of captures on the FEAT-68 proximity merge —
  "bring out a more powerful model to reassess and figure out how to clean up all the mid-edge
  crossings once and for all"
relates: FEAT-68 (the corridor router this lives inside; BUG-53 was absorbed there and the whole
  merge lineage is recorded in its dated sections), BUG-25 (window invariance — the constraint that
  shapes every design here), QUAL-22 (cost-weighted pruning — measured contraindicated, see below)
---

# BUG-55: mid-edge crossings and overlaps — reassess the whole approach

**This ticket is a MANDATE TO RE-DESIGN, not a task to continue.** Four rounds of owner captures
have been worked with one mechanism (a post-hoc polyline merge, described below). It fixed most of
what was captured and then hit three walls that are structural, not incidental. The owner's call is
that the next pass should re-examine the frame, with everything already measured on the table.

Read this file first. `FEAT-68`'s dated sections hold the full build lineage; you do not need them
to start, and they are long. What is NOT re-openable is listed under "Settled by measurement".

---

## 1. The defect, in one paragraph

Two roads that should be one. The router prices each graph edge independently, so two edges between
nearby nodes frequently choose nearly the same corridor: they leave a junction together, or bow
apart and come back, and end up running within a few metres of each other for 100–250 m — sometimes
crossing at 1–5 m of vertical clearance, with no bridge (overpasses are de-scoped). From the cab and
on the map it reads as a doubled carriageway in the middle of nowhere. It is also a physical defect,
not only a cosmetic one: inside ~18 m the two roads write their cut/fill stencils into the same
terrain vertices, so the carve tears.

The owner's framing, which is the spec:

> "Evaluate where these come within some proximity of one another, then merge and share one run
> until they diverge again or hit a node."

> "Instead of coming up with a case for every single type of mid-edge crossing, we should come up
> with a catch-all for any type of mid-edge crossing."

---

## 2. The measured taxonomy

Five shapes, all confirmed against owner captures. Every one has a reproducer.

| # | shape | example | status |
|---|---|---|---|
| A | Legs leave a junction and stay alongside | seed 3 (−3505,1181): 236 m, 11.1 m deck gap | **fixed** |
| B | As A, with a crossing inside the overlap | seed 3 (−2309,2195): 136 m + a crossing | **fixed** |
| C | Legs bow apart 35–49 m, come back, run alongside (may cross inside the bow) | seed 3 (1044,7423): bows 49 m, crosses at 4.9 m clearance, forks at 108° | **fixed** |
| D | Legs part AT the junction, bow **82–121 m**, then run alongside 170–195 m | seed 6 (−1091,2792): bows 82 m then 170 m at a *constant 10.0 m* separation · seed 6 (−1710,1760): bows 121 m (25 m of height in the bow) then 195 m + 2 crossings | **BUILT, DISABLED** |
| E | Disjoint pairs — no shared node at all | seed 6 (3328,−27): 11 m apart, 31 m deck mismatch | **not attempted** |

A–C are node-anchored: the conflict interval starts at the shared node. D does not, which is why it
needs different machinery. E cannot be seen at all by per-node planning (see §6).

---

## 3. What ships today

Branch `feature/corridor-router`, worktree `/Users/ledogen/CodeShit/CarGame-corridor-router`,
dev server :3343. Merge machinery is in `src/road.js`; prices in `RANGER_PARAMS.roadV2`.

**The rule.** Two runs incident to a shared node CONFLICT while their centres are within
`mergeProxM` (18 m — the shared-earthworks distance: 5 m carriageway + 2.5 m shoulder each side +
3 m carve margin). The merge runs from the node out to the far end of the last conflict. The
**loser adopts the winner's polyline vertices verbatim** over that stretch, then **tapers** back onto
its own line. A crossing needs no rule of its own: two polylines that meet are already in conflict,
which is what let one predicate replace the crossing-anchored rule it descends from.

Load-bearing pieces, each measured in:

- **Flare bridging** (`mergeFlareM` 60 m, `mergeGapM` 200 m). A pair that swings apart and closes
  again is one road with a bulge. Without it, shapes C and (partly) A are not even candidates.
- **The spine wins** — the LONGER run owns the shared pavement. Under a proximity anchor both
  strands end at the same place, so the earlier "shorter node→fork strand" rule degenerated into a
  lexicographic coin flip, and at a three-leg junction it made the through-road a *loser*, barring
  it from serving the third leg.
- **The taper is a decaying LATERAL OFFSET on the loser's own course** — not a free curve from fork
  to join. See §5 for the two constructions that fail.
- **The guard is a measurement.** The band is scored on the curve the ribbon will actually sweep
  (same centripetal Catmull-Rom, three real vertices of context at each end, only the band scored),
  and a ladder of band lengths steps up until it clears 6 m. This replaced an angle limit, which is
  why wide forks now build — one capture forks at 108°.
- **Variants.** Only a solved profile can say whether the loser's remaining road still grades from
  the winner's deck, so the planner offers the full merge and then shorter ones (100/75/50%, each
  with up to three band lengths) and the assembly takes the first that builds.

**Two span lists, and the distinction matters** (conflating them is what an old `FORK_BLEND = 20`
fudge papered over):

| list | question it answers | who reads it |
|---|---|---|
| `cededSpans` | **ownership** — these vertices are the winner's; it draws and owns the surface (unless it is absent from this window, in which case the loser serves them) | the slicer, `_resolveRoadSurface`'s `consider()` |
| `offCurveSpans` | **curve validity** — ceded strand PLUS taper band, i.e. everywhere the points are not on the run's own primitive centerline | ribbon sweep, analytic refine, the points-backed sampler |

**Measured state.** Merges applied per radius-1400 origin window: 11/7/8/12 on seeds 6/20/11/67.
Census conflicts **47 → 15** (overlap 9/7/6/15 → 3/1/1/5; weave 0/0/1/1 → 1/0/1/0; single-cross
3/3/2/0 → 2/1/0/0). Six of the seven seed-3 owner captures are fully clean. Contract intact:
y-spread 0.000 m, one component per seed, infeasible 0, zero runs over the 40% ceiling.
`road-minradius` improved 5.70 → 7.40 m. Gates 45/50, the five booked reds.

---

## 4. The three walls

This is the part a re-design exists to answer.

### Wall 1 — the pad cliff (why shape D is disabled)

`roadV2.mergeMidSpan` defaults **false**. A mid-span merge cedes a stretch out of the middle and
forks at both ends, so the loser's tail is re-solved from the winner's deck. That steepens its
approach into its far node, and the junction pad there — `_nodeSurfaceTop + apronLift`, a near-flat
plaza the truck actually rides, built from all of that node's legs — ends up **above the leg it
serves**. Measured collision cliffs of **1.75 m (seed 7) and 2.37 m (seed 6)**, both ~14 m out from
the node, caught by `road-smoothness`. Surface ownership and the deck are smooth across the step;
the jump is `padTopY` vs the leg.

This is not something a guard inside the merge can answer — see the two that were tried in §5. It is
entangled with the deferred junction pass (naive meets at degree ≥ 3, FEAT-68 next-step 3).

### Wall 2 — the deck gap

Sharing pavement means the loser must **reach the winner's deck** at the fork. That is a hard
physical constraint, not bookkeeping. Where a pair is stacked — seed 6 at (−1710,1760) is 17 m apart
horizontally and **14.5 m vertically** — the loser's remaining road cannot grade to the winner's deck
within the cap, and the variant ladder falls back to merging only the sub-strand where the two decks
happen to be close. That pair merges 62 m of a 195 m parallel run and leaves an 84 m tail. Seed 3's
(−3505,1181) merges 176 m of 236 m for the same reason.

The current design solves each non-ceded strand **independently**, each pinned at a node on one end
and the winner's deck on the other. A joint solve over the whole bundle is the obvious thing that was
never tried.

### Wall 3 — window invariance bounds what can be seen

Merge plans are computed **per node, from that node's post-degree-drop 1-ring** — the identical
information every streaming window derives (the BUG-25 argument). That is why shape E (disjoint
pairs, no shared node) is not attempted: seeing it needs a spatial query whose answer depends on what
is streamed, and a plan that changes with the window tears the terrain at window frontiers. Any
redesign must state its invariance argument before it states its geometry.

---

## 5. Settled by measurement — do NOT re-attempt

Every one of these was built and measured. They are the expensive part of this ticket.

**On the fix's shape**
1. **Drop-a-leg alone cannot clear the class.** Simulated; leaves most pairs and costs connectivity.
2. **QUAL-22 cost-weighted Urquhart pruning makes it WORSE** — 16 → 24 defects on seed 20. The cost
   vote herds surviving edges into the same cheap valleys, concentrating exactly the corridors that
   overlap. (QUAL-22 stays re-openable for its own character goal; it is contraindicated here.)
3. **Restoring the old blunt crossing/clearance culls** takes connectivity 95.7% → 54.1%. Connectivity
   outranks tidiness. A targeted resolver is what this ticket is for.

**On the taper geometry**
4. **A lerp between the two courses zigzags on a wide fork.** The blend weight's derivative times a
   large course separation swamps the tangents.
5. **A cubic Hermite from fork to join bulges.** Its curvature goes as the angle between the START
   TANGENT and the CHORD, and at a fork those differ by most of a right angle — 3.4 m radius on an
   ordinary 23° fork, no better with a longer band. What works is a decaying lateral offset **in the
   loser's own frame**, where that same fork is a 16 m offset decaying over 40 m.
6. **A control-polyline curvature proxy is not good enough.** The ribbon sweeps a centripetal
   Catmull-Rom, which tightens a corner by about a third at 4 m spacing: a band admitted at 8 m came
   back at 5.50 m dense, exactly on the fold floor.
7. **Weld the band's end tangents to the ACTUAL neighbouring vertices** (`SPLICE_EPS`, shared by
   planner and assembly). A tangent anchored on an interpolated point at a fixed arc offset is not a
   weld — the assembly drops vertices near a splice, so the segment built leaves at a different
   heading. That seam alone folded the ribbon to **3.76 m**.
8. **An angle limit on the fork is the wrong guard.** The `≤30°` rule it replaced is what parked the
   whole wide-fork class; measuring the swept curve admits a 108° fork that builds fine.

**On the surface seam**
9. **Do not extend the ceded exclusion past the fork** (what the pre-taper `FORK_BLEND = 20` did).
   Measured **489 cm** steps: past the fork the loser's taper band is the ONLY road there — the winner
   has pulled away — so excluding the loser leaves nobody owning the surface and the terrain reverts
   to raw under a drawn road. The exclusion must end exactly at the ceded boundary.
10. **Capping the re-solved strand's max grade never fires.** The steepness lives in the
    junction-BLENDED profile near the node (`runProfile` diverges from `points[].y` there by design),
    not in the strand's own vertices.

**On the plumbing — the trap that cost the most**
11. **The slicer used to assume a ceded span is a prefix or a suffix.** True for node-anchored
    merges; false for mid-span ones. Its else-branch trimmed the kept window back to the START of the
    span, so a run 810 m long that ceded 405–649 had ribbon for **0–405 only** — while the carve, which
    reads `_resolveRoadSurface`, had the interval right. Result: **161 m of road carved into the
    terrain with no pavement on it**, which is what the owner captured. Fixed (the slicer keeps a list
    of ranges), but the lesson generalises: **whenever ceded spans change shape, re-audit every
    consumer**, because the ribbon and the carve read different sources and only agree by convention.
12. **Strict pin-signature route-cache matching**: 18 s → 195 s cold load. Deg-2 pins are
    window-invariant for interior edges but not at window frontiers.

**On measuring at all**
13. **Raw network-build timings swing 2× on a loaded machine.** Two separate wrong conclusions were
    nearly drawn from them this session. Always A/B in one session, ideally by disabling the feature
    in place rather than comparing against a remembered number.

---

## 6. What a redesign must respect

- **Window invariance first.** State the argument before the geometry (§4, Wall 3).
- **Connectivity outranks tidiness.** The graph, its components, and site ids must survive. One
  component per seed; y-spread 0.000 m at shared nodes is a hard invariant.
- **MESH == PHYSICS.** The ribbon and the collision surface are two readers of the same intent; the
  gates that enforce it are `road-smoothness` (collision steps) and `road-minradius` (ribbon fold,
  measured on the DENSE spline, floor 5.5 m).
- **Never force a guard.** The shipped discipline is skip-and-count, with a named reason readable by
  `test/capture-classify.mjs`.
- **Character is the owner's call, not the model's.** The visible dials are sliders under
  `Roads → Router v2 (prices)`; the map is the A/B surface.

---

## 7. Worth reopening (framing, not a plan)

The current mechanism merges **after** routing, by splicing polylines and re-solving profiles in
pieces. Every wall in §4 traces to that. Some frames that were never tried, listed so a reassessment
can weigh rather than rediscover them:

- **Merge in the router, not after it.** Route the second edge along the first's *corridor* so the two
  are one road by construction, and no splice, taper or re-solve is needed. Costs a routing-order
  dependency, which has to be reconciled with per-window determinism.
- **Deduplicate corridors before profiles are solved.** The corridor stage is a coarse swath; two
  edges choosing the same swath is exactly the defect, and it is visible there before any geometry
  is committed.
- **A first-class shared-pavement primitive.** Today a loser "adopts" a winner and the network still
  holds two runs. A bundle that is genuinely one run with several endpoints would delete the whole
  ownership/curve-validity split (§3) and the seam class in §5 items 9–11 with it.
- **Solve the profile jointly over a merged bundle** rather than strand-by-strand with pinned ends.
  This is the direct answer to Wall 2, and plausibly to Wall 1 as well, since the pad conflict is
  created by a strand solved in isolation from the node it arrives at.
- **Sequence against the junction pass.** Wall 1 is a pad-versus-leg disagreement. It may be cheaper
  to do junction geometry first and let merging assume a pad that follows its legs.

---

## 8. Instruments

- `node test/capture-classify.mjs <seed> <x> <z>` — point it at an owner capture mark: what is there,
  whether anything merged, and which named guard declined. **This is the acceptance tool.**
- `node test/overlap-census.mjs` — per-seed conflict census, per-pair detail (near-length, minSep,
  deck mismatch, detour feasibility). `test/crossing-census.mjs` for the crossing view. Both use a
  STRICT proper-crossing test on purpose — an inclusive one counts every shared vertex of a
  coincident merged strand as a crossing (168 phantoms on seed 6).
- `node perf-runs/v2-integration-check.mjs` — the v2 contract at a glance.
- `npm run test:all` — 45/50 with five booked reds (`mission-network` = BUG-41; `graph-topology`
  re-baselines + the disjoint tear of shape E; `road-smoothness` = one booked 17 cm step;
  `paper-tour` margin; `pond-route-around` precondition).
- Owner capture marks used so far — seed 3: (−3505,1181) (−2309,2195) (−105,2418) (2293,4118)
  (1598,5875) (1044,7423) (1668,7534); seed 6: (−1710,1760) (−1091,2792) (−1712,1743) (932,793).

---

## Acceptance

1. **All eleven owner capture marks come back CLEAN** from `capture-classify`, or are declined by a
   guard whose reason the owner has accepted.
2. **Shapes D and E are answered**, not deferred — that is what "once and for all" means here.
3. `road-smoothness` and `road-minradius` **green on every seed** (today: one booked 17 cm step; the
   mid-span cliffs must not return).
4. Contract unchanged: one component per seed, y-spread 0.000 m, infeasible 0, zero runs over the
   40% ceiling, deg-2 joint kinks unchanged.
5. No new gate reds; the five booked ones stay diagnosed.
6. Network build within noise of today's 2.3–4.1 s at 1× headless, A/B'd in one session.
7. **The owner drives it.** Map judgment then a driven pass over the forks is the character sign-off,
   as it has been for every step of FEAT-68.
