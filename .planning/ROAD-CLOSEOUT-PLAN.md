# Road redesign close-out plan (RULED 2026-08-25 — build phase is a GO)

Ruling ledger + work order for closing out the road redesign. All rulings are in; no open
questions block the build. Tickets hold each item's detail; this doc is the contract.
Code lands on `feature/corridor-router` (worktree `CarGame-corridor-router`, dev :3343);
docs/tickets stay here on main — the established BUG-55 pattern.

## The governing ruling (2026-08-25): the CROSSING INVARIANT

> "If two legs cross on the way from one node to another I just want to get rid of one of
> those legs so there are no crossings left. If connectivity suffers as a result of this then
> it's likely that terrain is making the world unconnectable — if that's the case we should
> just fall back to a different seed gen instead of forcing the square peg in the round hole."

Rationale: the defective-intersection set is INFINITE in a procedural world; threshold
edge-case detectors (floors, deck-gap conditions, angle guards) can never enumerate it. The
merge ladder stays first (it was the bountiful fix); after it, any surviving unsanctioned
crossing condemns the LONGER leg, UNCONDITIONALLY — connectivity is VALIDATED (a gate), never
guarded per-deletion.

**Measured 2026-08-25 (simulations, 8 windows across seeds 3/6/7/20/11/67):**
- Rung-off parity: the crossing rule re-derives EVERY shipped BUG-55 deletion with the
  identical victim (nest winner `g:-4,3,2:-3,3,2` included — no cluster machinery), PLUS
  everything the guarded rung refused: seed-3 origin's 'detour' decline, seed-11's two
  census-stuck pairs, and all three hairpin stacks (`3,1,0|4,1,1` clears three crossing
  pairs; `5,3,2|6,3,0` the third stack).
- Connectivity NEVER changed in any window (seed 67's 2 components pre-existed unchanged).
- The ORDER-FREE form ("edge X dies iff some unsanctioned-crossing pair has X as its longer
  member; tie → lexicographic") matched the minimal evaporation walk everywhere — and it is a
  pure per-pair function: window-invariant with no graph context, boxes, or ordering.
- **The classifier finding (2026-08-25)**: the crossing classifier's "6 flat crossings" at
  the gate window are EXACTLY the three stacks' crossing points — there is NO healthy
  promoted-crossing population. The "at-grade intersections everywhere" are NODE junctions
  (T/Y/4-way at graph nodes, pads) — untouched by all of this.

## Ruling ledger (complete)

1. **Crossing invariant** (above) → BUG-57. The earlier Option-1-with-thresholds and the
   60→30 m floor proposal are WITHDRAWN as moot.
2. **Intersection vocabulary = Option A: nodes are the ONLY intersections** ("A for now, B if
   we need/want later"). Mid-span crossings are always defects; the rung culls them all;
   "zero unsanctioned crossings" becomes a permanent gate with `crossingList()` as its
   measuring instrument; the T/X-promotion concept RETIRES (nothing left to promote — the
   SURFACE-SMOOTH crossing-zone exclusion goes with it). Option B (deliberate, worldgen-
   created X intersections promoted to real nodes) stays available as future feature work.
3. **Machinery deletion: CONFIRMED.** After parity, delete the superseded BUG-55 guard
   machinery — tear nomination guards, one-shot victim-free BFS, the nest resolver
   (`_v2ClusterResolve`), deep boxes + 'D|' memo universe, NEST_DIAMETER_HOPS.
4. **BUG-56 = emergent Y→T departure**: a car must drive the through-road straight without
   launch or wall from the third road. Minor legs get a departure boundary condition across
   the through-axis (existing pin machinery); terrain makes the rest emergent — no hand-coded
   taper choreography. The co-grade-taper idea is replaced; midspan+end merge composition is
   demoted to a watch (its motivating tear dies under BUG-57).
5. **Junction stitching "should be red until every intersection stitches nicely"** — BUG-56
   ships an honest stitching check (taper bands NOT sanctioned away); red is acceptable until
   the pass lands.
6. **Deletion review protocol: map A/B** screenshots before accepting each new deletion class.
7. **graph-topology (f) node-departure: retire** ("retire probs" — confirm at the touch).
8. **(932,793) leftover: closed, not a defect** (17.7 m separation, decks within 0.4 m — an
   18 m-census-threshold artifact).
9. Hairpins in principle remain desired; the three (j) stacks are "tangled messes, not really
   hairpins" — resolved via ruling 1. The 'angle' merge-decline stays (a U-turn fork is
   geometric nonsense).

## Work order

### Build phase (serial, in this order)

> **Status 2026-08-26:** item 1 (BUG-57) is DONE and CLOSED — crossing invariant + the owner's
> keep-the-connection re-scope (tangle merges, shove rung, deletion demoted to last resort),
> ruling-3 machinery deletion executed, graph-topology 8/8 ((f) retired per ruling 7,
> SURFACE-SMOOTH exclusion removed per ruling 2), zero census crossings across the battery,
> owner map sign-off received. Item 2 (BUG-56) is NEXT — owner priority 2026-08-26
> ("undriveable intersections"); fresh reproducer + measured fork table in the BUG-56 ticket.

1. **BUG-57 — the crossing rung** (`.planning/todos/pending/bug-57-hairpin-stack-fallthrough.md`).
   Implement order-free crossing deletion on pure pre-registration samples; bundle learns to
   drop a deleted LOSER (dead-winner-rule mirror; watch acyclicity); parity battery; then the
   ruling-3 machinery deletion; connectivity gate (components unchanged across the seed
   battery); classifier reduced to the invariant's gate instrument; map A/B to the owner.
   Expected: graph-topology (j) green; the (−1692,1759) area unchanged (nest resolution
   parity); seed-3/11 tangles newly resolved.
2. **BUG-56 — junction departure shape + stitching gate**
   (`.planning/todos/pending/bug-56-junction-fork-disjunction.md`). The screenshot tear at
   node −3,1,1 (−1533,1247) is the reproducer; sibling class sweep after.
3. **PERF-28 — hitch attribution, then fix**
   (`.planning/todos/pending/perf-28-streaming-hitch-events.md`). Run the attribution AFTER
   BUG-57 lands — the deleted machinery was the top cost suspect, so measure the new baseline.

### Late phase (after building)
4. Re-triage sweep: BUG-42/47/48/51/52 + the BUG-25 watch against the v2 world.
5. Merge `feature/corridor-router` → main: settle the five booked gate reds deliberately
   (fix or re-baseline with written rationale), re-bake the default-seed route cache, close
   FEAT-68; re-derive BUG-51 on v2 rather than merging `feature/seed20-road`.

### Deferred (named so they are not lost)
- road-smoothness lone-pine 16 cm canary.
- Structural watches: region-boundary connectivity (bites when region-gating lands; also the
  seed-reroll valve of ruling 1 — design only if a real seed ever trips the connectivity
  gate); QUAL-23 per-region routing character; midspan+end merge composition; Option B
  deliberate X intersections.

## Kickoff (for the next agent) — updated 2026-08-26: the priority is INTERSECTIONS (BUG-56)

Start the session in `/Users/ledogen/CodeShit/CarGame` (main — memory + docs load from here)
and say: **"Start BUG-56 per .planning/ROAD-CLOSEOUT-PLAN.md."** Code edits go in the
`/Users/ledogen/CodeShit/CarGame-corridor-router` worktree (branch `feature/corridor-router`,
dev :3343), docs/ticket updates on main — the established split. BUG-57 is closed; read its
ticket's RESOLUTION section + `[[project_bug57_crossing_rung_state]]` before touching the
merge/shove/delete ladder.

BUG-56 in one paragraph: the owner's 2026-08-26 capture (seed 6, mark (−1582,1333), node
−3,1,1) shows the class — a leg that merges onto the through spine, rides it exactly (deck
gap 0.00 m through the ceded strand), then FORKS and front-loads its entire climb: +0.9 m
deck gap at 1 m lateral separation, +5.6 m at 20 m, with band camber on top and no pad (forks
have no pad vocabulary, and shouldn't). The ruled pass (ticket, "The pass" section): (1) a
DEPARTURE BOUNDARY CONDITION — the minor leg exits across the through-axis, out of the
through-road's XZ clearance BEFORE its Y diverges, via the existing heading-pin machinery;
terrain does the rest, no hand-coded taper choreography; (2) SKIP-AND-RECONNECT (owner
addition 2026-08-26) — when the polyline points near the fork violate min radius OR grade,
ignore them and connect further out at a good point: BUG-57 session-2's outward-slide +
direct-span ladder generalized to grade, so the leg leaves at the through deck and climbs
where it has room; same discipline — measure every variant against the fold floor and grade
caps, decline honestly, never relax the floors; (3) the HONEST STITCHING GATE that measures
deck-gap-vs-lateral-separation at every junction leg and fork, sanctioned bands INCLUDED
(sanctioning is what let this print CLEAN) — allowed red until the pass lands. The
shove rung's deflections and the direct-span Hermite bands are additional fork-like
departures the same gate must cover. Routing changes re-route affected edges: expect network
character changes at shallow junctions — map A/B to the owner (ruling 6). After BUG-56:
PERF-28 → re-triage sweep → merge to main (work order above).
