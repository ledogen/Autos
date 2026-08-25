# Road redesign close-out plan (living doc, opened 2026-08-24)

The owner is batching rulings; this doc accumulates them and orders the work. Build items
first, structural items after all building is done. Tickets stay the source of truth for each
item's detail — this is the ordering + ruling ledger.

## Rulings so far (2026-08-24)

1. **Hairpin stacks: Option 1 — resolve through the BUG-55 ladder (merge/suppress a leg).**
   Hairpins remain DESIRED in principle; these three are not hairpins — "tangled messes of
   roads that don't drive nice", not even tight corners (stack 1 turns only 49°). The 'angle'
   ruling (2026-08-23) is narrowed, not repealed: a >135° pair still never MERGES (a U-turn
   fork is nonsense), but angle no longer shields a TEAR-GRADE pair from the delete rung.
   → BUG-57 (blocker matrix + the one open ruling: the stack floor).
2. **(932,793) "benign leftover": CLOSED, not a defect.** Owner cannot see it; measured: two
   runs 17.7 m apart (shoulders nearly touching) with decks aligned within 0.4 m. The census
   flags it only because 17.7 < the 18 m proximity threshold. Nothing to fix.
3. **Junction stitching is a correctness bar: "truthfully should be red until every
   intersection stitches nicely."** The capture-classify / gate practice of SANCTIONING the
   merge taper band as intended geometry hides real visual tears (the BUG-56 screenshot is a
   sanctioned taper band with a 4.4 m deck wall). BUG-56 gets an honest stitching check that
   measures deck coplanarity through taper bands — red until the pass lands.
4. **Ordering**: the re-triage sweep of stale road tickets and the merge to main are LATE
   items — after all building. Gate-debt passes and structural watches deferred.

## Work order

### Build phase
1. **BUG-57 — hairpin-stack fall-through** (small–medium). Lift the angle shield for
   tear-grade pairs; add the stack floor (pending ruling below); teach the bundle to drop a
   deleted LOSER (mirror of the shipped dead-winner rule) so stack 2's victim can die without
   the measured 87 m carve crease. Full BUG-55 regression battery again (prior deletions must
   re-verify — the widened vetting makes byte-identity no longer structural; the cluster
   machinery is the safety net).
2. **BUG-56 — junction stitching pass** (medium–large). Two mechanisms, both measured:
   (a) the taper-band tear — the merge applies, then the loser regains its own profile within
   shared-earthworks distance, packing 4–8 m of height into ~50 m at <18 m lateral: constrain
   the parting pair to co-grade until lateral separation exceeds mergeProxM;
   (b) the midspan-vs-end spec drop — a run allowed only ONE merge takes the longer (mid-span)
   spec and silently discards a planned, disjoint end merge (node −2,3,1's tear): compose
   disjoint midspan+end specs. Plus the honest stitching gate (ruling 3).
3. **PERF-28 — hitch attribution + fix** (diagnosis first; likely the census/conflict-scan
   consolidation already booked in BUG-55).

### Late phase (after building)
4. **Re-triage sweep**: BUG-42/47/48/51/52 + the BUG-25 watch against the v2 world — close,
   re-scope, or keep each with evidence.
5. **Merge feature/corridor-router → main**: settle the five booked gate reds deliberately
   (fix or re-baseline with written rationale), re-bake the default-seed route cache, close
   FEAT-68. BUG-51's fix on feature/seed20-road gets re-derived on v2, not merged.

### Deferred (named so they are not lost)
- Gate-debt passes = the standing red checks that need their own calibrated fix rather than a
  fit-to-current loosening: graph-topology (f) node-departure bearings (avg 28.4°/worst 106°
  vs bounds 22/60), road-smoothness lone-pine 16 cm canary. (j) is expected to go green with
  BUG-57.
- Structural watches = known gaps that only bite when something else lands: region boundaries
  not modelled in delete-detour connectivity (bites when region-gated connectivity lands),
  QUAL-23 per-region routing character.

## Pending rulings

- **BUG-57 stack floor** (the "something else blocks stack 1" answer — it was the 60 m
  substantiality floor, not angle): stacks 1 and 3 measure 52 m and 48 m of leftover tear —
  under the 60 m floor that gates delete nomination. Proposal: shelf-grade tears (deck gap
  ≥ 3 m) nominate at leftover ≥ 30 m; the BFS possible-victim vetting widens in lockstep
  (same geometry-only test). Consequence to accept: prior deletions are no longer
  byte-guaranteed (wider vetting can re-route a one-shot detour); the cluster machinery
  catches refusals and the full battery re-verifies every mark. Alternative: keep 60 m — then
  stack 3 stays torn and stack 1 survives only if stack 2's deletion evaporates its pair.
- (space for the owner's next batch)
