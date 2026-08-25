# Road redesign close-out plan (living doc, opened 2026-08-24, reshaped 2026-08-25)

The owner is batching rulings; this doc accumulates them and orders the work. Tickets stay the
source of truth for each item's detail — this is the ordering + ruling ledger.

## The governing ruling (2026-08-25): the CROSSING INVARIANT

> "If two legs cross on the way from one node to another I just want to get rid of one of
> those legs so there are no crossings left. If connectivity suffers as a result of this then
> it's likely that terrain is making the world unconnectable — if that's the case we should
> just fall back to a different seed gen instead of forcing the square peg in the round hole."

Rationale: the set of defective intersections is INFINITE in a procedural world; threshold
edge-case detectors (floors, deck-gap conditions, angle conditions) can never enumerate it —
"band-aids on band-aids" risks a one-in-a-million unplayable world. The merge ladder stays
(it was the bountiful fix); after it, any surviving unsanctioned crossing condemns the longer
leg, UNCONDITIONALLY — connectivity is VALIDATED, not guarded per-deletion.

**Measured 2026-08-25 (simulation, 8 windows across seeds 3/6/7/20/11/67):**
- With the shipped tear rung ON: 0–2 additional victims per window, zero crossings remain,
  **connectivity never changes** (seed 67's 2 components pre-existed unchanged).
- With the shipped tear rung OFF: the crossing rule alone re-derives **every shipped deletion
  with the identical victim** (seed-6 ×2, seed-7 ×2, seed-20 ×1 incl. the nest winner
  `g:-4,3,2:-3,3,2` — no cluster machinery involved), PLUS the cases the guarded rung
  refused: the seed-3 origin 'detour' decline, seed-11's two census-stuck pairs, and all
  three hairpin stacks (one victim `3,1,0|4,1,1` clears three crossing pairs). Connectivity
  unchanged in every window.
- The ORDER-FREE form ("edge X dies iff some unsanctioned-crossing pair has X as its longer
  member") produced the same victim set as the minimal evaporation walk in every sampled
  window — and it is a pure per-pair function: trivially window-invariant, no graph context,
  no deep boxes, no ordering.

**Consequence: BUG-57 is re-scoped to THE CROSSING RUNG, replacing the tear-grade delete rung
and its guard machinery** (floors, angle shield, one-shot vetting, the nest resolver) after a
parity verification. The stack-floor ruling (60→30 m) is MOOT — withdrawn.

## Rulings ledger

1. **Crossing invariant** (above) — supersedes Option-1-with-thresholds. → BUG-57.
2. **Junction stitching bar = drivability of the through-road** (2026-08-25): a car must
   drive straight through on the through-road without getting launched or hitting a wall from
   the third road. The screenshot tear is a third road joining at a very shallow angle,
   occupying the through-leg's XZ space so long that the constraints pulling it into its own
   Y space conflict — "it's begging to be a T instead of a Y. We need to figure out how to
   get out of its way." → BUG-56.
3. **No coded taper choreography** (2026-08-25): make the leave-the-way behavior EMERGENT —
   a departure boundary condition (T-ish exit heading), terrain does the rest; or divert
   outside a clearance width before running parallel. Not a hand-coded taper shape. → BUG-56.
4. **Deletion review protocol: map A/B** before accepting each new deletion class.
5. **graph-topology (f) node-departure: retire** (probable — owner "retire probs"; confirm at
   the touch). Note ruling 2/3 cuts the other way for MINOR legs at junctions: BUG-56 wants
   departure headings CONTROLLED there. (f) as a chord-alignment character check still
   retires; the new departure discipline gets its own check if needed.
6. **(932,793) leftover: closed, not a defect** (17.7 m apart, decks within 0.4 m — census
   threshold artifact).
7. **Junction stitching "should be red until every intersection stitches nicely"** — the
   sanctioning of merge taper bands in classify/gates hides real tears; BUG-56 ships an
   honest stitching check, red until the pass lands.

## Work order

### Build phase
1. **BUG-57 — the crossing rung** (re-scoped 2026-08-25). Implement the order-free crossing
   rule on pure pre-registration samples (census-style: planned offCurve spans sanction,
   30 m shared-node throat exemption); teach the bundle/assembly to drop a deleted LOSER
   (mirror of the shipped dead-winner rule — victim `3,1,0|4,1,1` is a bundle loser); run the
   parity battery; then DELETE the superseded machinery (tear nomination guards, one-shot
   vetting, cluster resolver, deep boxes). Connectivity becomes a GATE (components unchanged
   across the seed battery); the seed re-roll valve is designed only if a seed ever trips it.
2. **BUG-56 — junction departure shape (Y→T) + stitching gate.** Minor legs leave a junction
   across the through-axis (a departure-heading boundary condition via the existing pin
   machinery; the corridor search + terrain make the rest emergent), so they exit the
   through-road's XZ space before their Y diverges. The co-grade-taper idea is REPLACED by
   this; the midspan+end merge composition is DEMOTED to a watch (its motivating tear at
   −2,3,1 dies under BUG-57's crossing rule). Plus the honest stitching gate (ruling 7).
3. **PERF-28 — hitch attribution + fix.** Note: BUG-57's machinery deletion likely REDUCES
   the per-window scan cost (the delete rung's +270–360 ms was the top hitch suspect) —
   run the attribution first anyway.

### Late phase (after building)
4. Re-triage sweep of stale road tickets (BUG-42/47/48/51/52, BUG-25 watch) against v2.
5. Merge feature/corridor-router → main (settle the five booked reds deliberately; re-bake
   the default-seed route cache; close FEAT-68; re-derive BUG-51 on v2).

### Deferred
- Gate-debt: road-smoothness lone-pine 16 cm canary. ((f) retires per ruling 5; (j) expected
  green via BUG-57.)
- Structural watches: region-boundary connectivity (bites when region-gating lands); QUAL-23
  per-region routing character; midspan+end merge composition (demoted from BUG-56).

## Pending rulings

- **At-grade X crossings** (small): the crossing classifier flat-merges a handful of
  legitimate crossings into at-grade intersections (GRAPH-FLAT-MERGES green: "6 crossings,
  every one merges flat"). These are sanctioned geometry and the simulations did NOT count
  them. Confirm they LIVE (they are proper intersections, they stitch) — recommend yes; the
  invariant then reads "no unsanctioned crossings".
- **Scope of the machinery deletion** (confirm): the nest resolver shipped 3 days ago and the
  parity battery shows the crossing rule re-derives its result. Recommend deleting it with
  the rest of the guard machinery — less code for the next session to misread. Alternative:
  leave it dormant behind the rung. Recommend: delete.
- (space for the owner's next batch)
