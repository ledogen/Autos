---
id: BUG-55
type: bug
status: closed
severity: major
opened: 2026-08-22
closed: 2026-08-26
source: owner instruction 2026-08-22 after four rounds of captures on the FEAT-68 proximity merge —
  "bring out a more powerful model to reassess and figure out how to clean up all the mid-edge
  crossings once and for all"
relates: FEAT-68 (the corridor router this lives inside; BUG-53 was absorbed there and the whole
  merge lineage is recorded in its dated sections), BUG-25 (window invariance — the constraint that
  shapes every design here), QUAL-22 (cost-weighted pruning — measured contraindicated, see below)
---

> **CLOSED 2026-08-26 — owner instruction: "close bug 55 and merge any open work into 57".**
>
> All five phases shipped (`4c72378`); the owner accepted the area. The delete rung and the nest
> resolver this ticket built were then SUPERSEDED by BUG-57's crossing invariant, and the machinery
> was deleted under BUG-57 ruling 3 — so this ticket's implementation no longer exists in the code,
> and its lessons live on as BUG-57's do-not-reattempt list. The residue of the "Open items" list
> below was audited item by item and merged into BUG-57's ticket under
> **"CARRIED FORWARD FROM BUG-55"**: items 1, 2, 3 and 4a are done, 4b goes to PERF-28, 4c is
> recorded there as an unowned gap in the census's reasoning (not a live defect).
>
> One acceptance criterion here was never met and is NOT silently dropped: #4's "infeasible 0, zero
> runs over the 40% ceiling". Measured 2026-08-26, 6 of 467 runs exceed the 40% ceiling in their
> interior, worst 115%. That is **BUG-51**, which stays open with the measurement recorded.
>
> Sections 1–8 below stay as written — the measured taxonomy, the three walls and especially
> §5 "Settled by measurement — do NOT re-attempt" are the most valuable thing this ticket produced.

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

---

## CURRENT HANDOFF (2026-08-23, session 2) — ALL FIVE PHASES SHIPPED; what remains is owner acceptance

Code on `feature/corridor-router` (worktree `CarGame-corridor-router`, dev :3343):
`2568d1a` census → `b6d4012` bundle → `1306eeb` mid-span ON → `bdd09f2` phase-4 WIP →
`6696445` phase 4 closed → `5f6d423` delete rung → `f28d90e` cleanup (map2d/poi/gate) →
`3daadc5` dry-run built-ness → `4726151` leftover-aware nomination + deletable plan-winners
→ `4c72378` ordered cluster deletes (the nest resolver — 2026-08-24 session 3, the SHIPPED
section below). Docs here on main.

### Owner rulings (2026-08-23 session 2, binding — added to the earlier set)

- **deleteDetourHops = 6** (slider "Delete Detour Cap", 0 disables). Chosen over 4 (fires on
  nothing known) and 8 (also deletes seed-20's 2 km trunk at 7 hops).
- **Victim = the LONGER member confirmed** (tie → lexicographic). The wanderer dies, the direct
  connection survives.
- **One-machinery-per-run stays STRICT** — a node-merge winner refuses the disjoint-loser role
  even when the intervals don't overlap (the drift class stays impossible by construction).
- **2026-08-24, at the stacked-pair capture: cull ONE leg of a tangle, never both.** And the
  recorded "dropping would strand" for that pair was WRONG — a window-EDGE census artifact
  (measured centered: 3 hops either member, 5 both). The census sim's drop lines are advisory
  only; never cite them without a centered re-measure. Owner also flagged: a region boundary
  could cut a detour and revive a stranding claim — region-aware connectivity is not modelled;
  single-leg culls + the short hop cap keep detours local, revisit if it bites.
- **2026-08-24 upgrades (`4726151`)**: (1) covered = the buildable plan's ACTUAL ceded length
  (dry-run returns the building variant's |lOut−lIn|); leftover = nearLen − covered ≥ 60
  nominates — a PARTIAL merge no longer shields the rest of its pair. (2) The 'wins a plan'
  role-block is GONE: (3) the assembly drops any spec whose winner is deleted, so the loser
  registers on its own line and the conflict dies with the winner (window-invariant, acyclic).
  Vetting stays LONGER-ONLY — a shorter-member fallback was tried and REVERTED: it forces
  vetting to exclude both members of every substantial pair and deadlocks every detour into a
  tear-dense node. Consequence: **seed-20's disjoint tear RESOLVED** (its real blocker was the
  role-block, not the hop count — one deletion at 4 hops clears both its pairs; census seed 20
  is now 0/0/0 and its CENSUS-DISJOINT entry stamps resolved(deleted)). Census total 10.

### Phase 4 (closed at `6696445`)

The (3328,−27) non-resolution was DIAGNOSED, not fixed — the planner declines correctly: pair 1
declines 'taper' (65° fork on a 76 m interval, best swept R 2.1 m vs floor 6 at every band; too
short for any shrink combo), pair 2 declines 'bore' (winner tunnel span clArc 499–659 exactly
where the in-fork lands for every combo but [0.55,0], which then fails taper-out 5.8 vs 6.0 at a
54° divergence). Both pairs share the 1867 m run `5,0,1:6,0,0` as their longer member — the
delete rung's case. Instruments finished: overlap-census DISJOINT branch + node-sharing helper +
crossing-census all carry the three-way offCurveSpans sanction (A→B, B→A, both→one spine);
`_v2CensusStampResolved()` stamps census disjoint entries `resolved: 'merged'|'deleted'|false`
at read time (the census walks pure pre-registration samples and cannot know).

### Phase 5 (shipped `5f6d423` + `f28d90e` + `3daadc5`)

**The delete rung.** `_v2ConflictPairs` (geometry-only per-edge conflict enumeration: route vs
wide chords, node-sharing partners INCLUDED, 30 m junction THROAT TRIMMED off intervals — trim,
never discard: discarding hid (932,793)'s 332 m overlap that merely begins 16 m from its node) →
`_v2DeleteFor` nominates when a tear-grade pair ≥ 60 m has no merge plan THAT WOULD BUILD, then
BFS with `_degreeDropSet`'s no-candidate-as-detour discipline applied lazily (vet path edges
with the same geometry-only ≥60 m possible-victim test, re-BFS excluding failures) — every
deletion reconnects through edges that cannot vanish, so simultaneous deletions never strand.
The wide box grew margin 8→10 to hold the cap-6 reach (PERF-26 argument). `g.adj` deliberately
untouched (consistently stale pins beat inconsistently fresh — method header has the argument).

Load-bearing subtleties, each measured in:
- **Same-spine pairs count as planned** — both ceding to one winner is the junction bundle;
  deleting a bundled leg measured an 87 m carve crease at the shared node's chunk.
- **'angle' (>135°) never falls to delete** — recorded on the node-planner memo
  (`out.declinedAngle`), read invariantly.
- **A victim that wins any BUILDABLE plan declines 'role'.**
- **"Planned" means A PLAN THAT BUILDS**: `_v2RegisterMidSpan` gained a `dry` mode (identical
  walk and guards, no side effects, boolean result) because only a solved profile answers the
  pad-arrival cap — (932,793)'s spec had six variants, all died at 19–20% > cap 12%, and the
  doomed plan both shielded the pair and role-blocked its winner. End-anchored specs keep
  spec-exists semantics (conservative; no mark is blocked on one) — booked follow-up.
- **The 60 m substantiality floor is LOCKSTEP** between nomination and BFS vetting (deleted ⇒
  possible-victim must hold). Without it, throat-overflow pairs blackballed every detour path.
- Reporting: capture-classify prints "resolved by DELETING <key> (detour n hops)" from
  `road._v2Deleted` (a mark over deleted tarmac never silently prints CLEAN); map2d
  `_surfaceSlices` slices ceded spans like tunnel spans (absent-winner rule kept); poi.js
  rejects lay-by candidates inside a ceded span (taper band stays eligible — the loser owns its
  surface there); graph-topology re-baselined — (f) exempts merged-loser endpoints, (h) RETIRED
  (tested a deleted cull flag), (j) has the three-way sanction.

### The eleven-mark scorecard (acceptance #1 evidence, all via capture-classify at `3daadc5`)

- **8 CLEAN**: all seven seed-3 marks + seed-6 (−1091,2792).
- **2 resolved by DELETION at the mark**: (932,793) — `g:1,1,2:2,1,0`, 4 hops (kills the origin
  weave; the "benign leftover" there is CLOSED 2026-08-24 — owner cannot see it, and measured
  it is two runs 17.7 m apart with decks within 0.4 m, flagged only by the 18 m census
  threshold — not a defect) · (3328,−27) — `g:5,0,1:6,0,0`,
  5 hops, one deletion clears BOTH tears.
- **RESOLVED at `4c72378` (session 3): the stacked pair (−1710,1760)/(−1712,1743)** — was
  the last open case (mutual-victim NEST; full diagnosis preserved in the SHIPPED section
  below). The ordered cluster delete resolves it: nest of 4, the winner `g:-4,3,2:-3,3,2`
  deletes at rank 1 (3-hop detour), the loser registers plain via the dead-winner rule.
  **Both marks now come back CLEAN** — the 84 m leftover and the 0.7 m-deck crossing are
  gone. Window-invariant: identical resolution from the origin, (−1091,2792), and
  (−1692,1759) window centers. The kept members' own smaller tears stay declined
  (their detours would lean on the nest's deletions) and are censused, not silent — measured
  coords at `4c72378`, seed 6:
  · `g:-2,3,1:-3,3,2 × g:-2,3,1:-3,4,2` — ~108 m raw alongside (74 m past the throat trim)
    out of node -2,3,1 (-870, 2486); closest 0.2 m @(-940, 2515); worst deck gap **4.9 m
    @(-967, 2522)**.
  · `g:-3,1,1:-3,3,2 × g:-3,1,1:-4,2,0` — ~120 m raw (66 m trimmed) out of node -3,1,1
    (-1533, 1247); closest 0.0 m @(-1533, 1247); worst deck gap **4.4 m @(-1583, 1352)**.
    **This is the owner's BUG-56 screenshot spot** (POS −1576/1361 is 12 m from the worst
    gap) — the "junction disjunction" they flagged IS this tear's throat.

### Verification (all at `3daadc5`)

Census conflicts **4/1/4/2 = 11** (entry baseline 15, phase-4 baseline 14); seed-6's weave gone;
one component per seed; y-spread 0.000. `npm run test:all` **45/50** — the five booked reds, two
now improved inside: road-smoothness = lone-pine 16 cm canary only; graph-topology **7/9** —
SURFACE-SMOOTH (the shape-E red — died with the (3328,−27) deletion) and FLAT-MERGES now green,
(f)+(j) stay red DIAGNOSED (below). carve-mesh-smoothness 2/2 WITH deletions live. Origin
deletions: seed 6 ×1, seed 7 ×2, seeds 20/11/67 ×0. Delete-rung cost, interleaved A/B:
**+270–360 ms per origin build** (~7%; includes dry-run solves and the wider box) — vs the
2.3–4.1 s budget this is above noise and honestly booked; consolidating the census walk with
`_v2ConflictPairs` (two per-edge scans today) is the identified lever if it matters.

Session 3 (`4c72378`): the full pre/post sweep (all eleven marks + six origin probes +
overlap-census) shows the ONLY behavioural deltas are the seed-6 nest deletion and
nest-annotated decline messages — every shipped deletion byte-identical (fast path, by
construction), overlap-census byte-identical, `npm run test:all` 45/50 = the same five booked
reds with identical internals (road-smoothness lone-pine 16 cm canary only; graph-topology 7/9,
(f) 28.4/106 unchanged). Interleaved A/B bench (seeds 3/6/7, 2 rounds): no delta above noise —
the cluster path is lazy (deep box + growth only on windows with a one-shot 'detour' failure).

### Open items — all owner-side or booked follow-ups

1. **Owner drives it** (acceptance #7): map judgment + driven pass. **2026-08-24: the owner
   free-cammed the nest area and called it great** — the remaining defect they flagged there is
   the junction-surface class, ticketed as BUG-56 (fork disjunction, not a BUG-55 pair). Still
   worth eyeballing: (932,793) and (3328,−27); the seed-7 deletions at (−1650..−1315, 310..837)
   and (−640..−247, −429..11).
2. **The hairpin stacks** — graph-topology (j)'s remaining violations, re-measured 2026-08-24
   at `4c72378` (seed 6, gate window (4500,600)): THREE pair-violations, not the two the
   session-2 note recorded — the first two share the run `3,1,0|4,1,1`, i.e. one switchback
   ladder doubling back twice:
   · `3,1,0|4,1,1 × 3,-1,1|3,1,0` — closest **1.2 m @(2549, 685)**, ~35 m stretch
   · `4,1,1|5,1,0 × 3,1,0|4,1,1` (the booked 153°) — closest **1.3 m @(3118, 1026)**, ~20 m
   · `6,3,0|6,4,1 × 5,3,2|6,3,0` (the booked 138°) — closest **1.2 m @(4217, 2291)**, ~30 m
   **RULED 2026-08-24 (Option 1): these are not wanted hairpins — "tangled messes of roads
   that don't drive nice" — and fall through to the delete rung. The 'angle' ruling is
   NARROWED, not repealed: merge stays angle-blocked; delete no longer is. Work + measured
   blocker matrix (floor for stack 1, angle+bundle for 2, angle+floor for 3): BUG-57.**
3. **(f) NODE-DEPARTURE bounds** (avg<22/worst<60 vs measured 28.4/106 over 24 endpoints):
   predate chord-pin demotions; needs its own pass, not a fit-to-current loosening.
4. Booked code follow-ups: dry-run for END-anchored specs (`_v2RegisterMerged`); the
   census/`_v2ConflictPairs` scan consolidation (perf); disjoint both-to-same-spine planned
  check (node case is measured, disjoint analog is not).

### SHIPPED (2026-08-24 session 3, `4c72378`): ordered cluster deletes — the nest resolver

Executed as planned below, with four measured deviations, each forced by evidence:

1. **The fast-path split is one-shot-FIRST, not cluster-size.** The shipped one-shot rule runs
   untouched for every nominated edge; the cluster path engages only on its 'detour' failure.
   This makes the six shipped deletions byte-identical BY CONSTRUCTION (a size-split would have
   re-routed any of them that happen to sit in a multi-member cluster through the walk).
2. **Growth adjacency is the detour ELLIPSE, not endpoint balls.** "Within cap hops of an
   endpoint" is a union of two 6-hop balls — measured: it pulled tear candidates from 2 km away
   into seed-6's nest and the diameter bound declined everything. The correct reach is
   dist(kA,·) + 1 + dist(·,kB) ≤ cap — exactly the edges that can appear on a ≤cap detour
   (superset of on-path edges, so the safety argument is unharmed; symmetric, so every seed
   grows the same component).
3. **One-shot-succeeding members join as non-expanding LEAVES, and are PRE-APPROVED.** Even
   ellipse growth chained seed-6's compact 3-member core to 8 members spread >6 hops through
   independently-deletable edges. A member whose own (deep-universe) one-shot succeeds deletes
   standalone via its own fast path, so it needs no coordination: it joins only to be treated
   as gone — pre-approved before the walk (closing the mixed-path hole where a member skipped
   by evaporation but really deleted by its own fast path could serve as another member's
   detour) — and its ellipse never extends growth. Only one-shot-FAILING members expand the
   frontier; their closure forms well-separated components (walk members are provably unique to
   one cluster; only leaves can be shared, and a leaf's verdict is member-intrinsic).
4. **`rec.cluster.approved`, never "deleted".** The walk's approved set over-approximates
   actual deletions — a member deletes only where it also NOMINATES at its own registration
   (planner state the geometry-pure walk deliberately never reads; measured live: the seed-6
   leaf `-1,3,0|-2,3,1` is approved-gone but never nominates, and stands). Reports print
   "approved gone", and safety only needs deletions ⊆ approved.

Mechanics as shipped: `_v2ClusterResolve` (memoized per member ck, rev-scoped) + factored
`_v2VictimFreePath`; the deep universe is a LAZY wider Urquhart box on the `_degreeDrops` entry
(margin gMargin + NEST_DIAMETER_HOPS + cap + 1 = 16, built at most once per window rev, only on
nest suspects) with its own degree pass, and `_v2ConflictPairs` memos deep calls under `D|` keys
so the everyday universe stays byte-identical. New decline reasons: 'cluster' (nest wider than
6 hops / tear dies with deleted nest partner); walk-declines keep 'detour' with a nest
annotation. NEST_DIAMETER_HOPS = 6 is a fixed module constant, deliberately not a slider.

The original plan (executed, kept for the record):

### The plan as written (2026-08-24, owner-approved direction): ordered cluster deletes

**Goal.** Delete rung learns to clean a NEST — a cluster of tangled roads where every detour
runs through another delete candidate — by resolving the cluster's candidates in a fixed order
instead of refusing them as a group. Target reproducer: seed 6 (−1692,1759). Expected outcome
there: the winner `g:-4,3,2:-3,3,2` deletes first (clearing BOTH its tears — the 164 m pair
with the loser and the 349 m pair with `g:-4,2,0:-4,3,2`), the loser's spec is dropped by the
already-shipped dead-winner rule and it registers plain, and the tangle is gone.

**Why the one-shot rule cannot do this.** It checks each candidate's detour against a world
where EVERY other candidate is assumed gone. That is what makes uncoordinated per-window
deletions safe — and what makes a nest unresolvable: at (−1692,1759) all three roads into node
-3,3,2 are candidates, so no detour survives the assumption. Keep the one-shot rule as the
FAST PATH for isolated victims (it produced all six shipped deletions — those must not change).

**The ordered walk (the census SIM's greedy shape, made window-safe).**
1. CLUSTER: grow from the nominated edge over "candidates within deleteDetourHops of each
   other's endpoints" adjacency. Candidates found via _v2ConflictPairs (geometry-only,
   memoized). Cluster of one → fast path (one-shot rule, unchanged).
2. ORDER: sort members by (a) total unresolved tear length (sum of leftovers across their
   pairs), then (b) longer edge, then (c) lexicographic ck. Pure inputs, same order everywhere.
3. WALK: for each member in order, BFS its endpoints on (graph − approvals so far), within the
   cap. Reconnects → approve. Each approval re-evaluates later members' pairs first: a pair
   with a deleted member EVAPORATES (this is what guarantees a pair never loses both legs —
   the owner's one-leg rule holds structurally).
4. FINAL PASS: after the walk, re-check every approved member's detour on (graph − ALL
   approvals), in the same order; any failure un-approves it and restarts the pass. Terminates
   (the approved set only shrinks). This closes the induction gap where a later approval
   removes an edge an earlier detour used: connectivity survives the greedy walk by induction,
   but the ≤cap PROMISE needs the final-graph check.
5. Memoize the resolution per cluster (key: sorted member cks) so every member's registration
   reads one answer.

**Window invariance — the load-bearing argument.** A cluster's resolution is a pure function
of (members, their pairs, the graph within cap hops of every member). Every window registering
any member must derive the identical cluster. So: (a) cluster growth is clipped at a fixed
diameter bound B = 6 graph hops between members — a cluster that would exceed B declines ALL
its members ('cluster', counted, censused) — and (b) the graph context comes from a LAZY wider
Urquhart box (margin ≈ gMargin + B + cap + 1 ≈ 16 cells), built once per window rev ONLY when
a multi-member cluster is detected. The everyday margin-10 box and every scan on it stay
untouched — nest windows pay for nests, nothing else does. Two windows seeing any member both
grow the same component inside their (sufficient) boxes, or both detect it exceeds B and
decline — identical either way.

**Integration points.**
- `_v2DeleteFor`: nomination unchanged; replace the BFS section with fast-path/cluster split.
- Assembly needs no change (the dead-winner spec-dropping shipped in `4726151` already handles
  losers of deleted winners; degree drops and `g.adj` policy unchanged).
- capture-classify: print the cluster ("cluster of 3: DELETED g:… (rank 1, detour 3) · kept
  g:… (detour would exceed cap)").

**Verification battery (run all before hand-back).**
1. (−1692,1759): winner deleted, loser plain, mark reports the deletion; check what leftover
   remains between the loser and the third road afterwards.
2. Regression: (932,793), (3328,−27), seed-7 ×2 and seed-20 origin deletions BYTE-IDENTICAL
   (fast path); all eleven marks; origin probe counts.
3. Gates: carve-mesh (junction -3,3,2's pad rebuilds from two legs — watch for steps),
   road-smoothness, invariance + restream (THE risk class for clusters), road-connectivity,
   graph-topology, census (seed-6 total should drop ~2 pairs). `npm run test:all` at the end.
4. Bench interleaved (cluster path is lazy — expect ~zero delta off-nest).

**Watch-outs from tonight's dead ends.** Do NOT widen BFS vetting to shorter members (it
deadlocks every tear-dense node — reverted once already). Do NOT re-try mergeFlareM 80 for this
pair (fused interval forces the fork into the crossing; measured strictly worse). The pad at a
node that loses a leg is registration-derived and window-consistent — stale-pin concerns stay
answered by the g.adj-untouched policy.

### Traps discovered this session (append to the do-not-reattempt list)

1. **Raw census tear thresholds nominate half the network** on node-sharing pairs — junction
   throats have minSep ≈ 0 by construction. Trim 30 m, never discard the interval.
2. **A conservative possible-victim test without the 60 m floor deadlocks the BFS** — every
   throat-overflow pair blocks every path. Nomination and vetting must share one floor.
3. **Plan-existence is NOT resolution** — a spec whose variants all die on apply guards must
   neither shield its pair nor role-block its winner. Dry-run the walk; never re-guess the
   solved profile at plan level (that is negative result #10's lesson from the other side).
4. **Deleting a bundled leg tears the junction carve** (87 m second-diff) — same-spine pairs
   are planned, full stop.
5. **zsh does not word-split `$m`** — use `${=m}` in capture-classify sweep loops.
6. **Endpoint-ball cluster growth chains the valley** — candidates 2 km apart share a 6-hop
   ball; the detour ellipse (dist(kA,·)+1+dist(·,kB) ≤ cap) is the reach that matches what a
   detour can actually touch.
7. **Expanding a leaf's ellipse dissolves the compactness** — one-shot-succeeding members must
   not extend growth, or every independently-deletable edge within reach chains nests together
   until the diameter bound kills them all.
8. **The walk's approved set is NOT the deletion set** — nomination still decides per edge;
   naming the field `deleted` (first draft) had capture-classify printing standing roads as
   deleted.
