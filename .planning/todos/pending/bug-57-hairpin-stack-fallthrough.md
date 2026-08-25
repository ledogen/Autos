---
id: BUG-57
type: bug
status: open
severity: major
opened: 2026-08-24
source: owner rulings 2026-08-24 (Option 1 on the (j) stacks) + 2026-08-25 (the crossing
  invariant, which re-scoped this ticket and made the threshold approach moot)
relates: BUG-55 (whose tear-delete rung + nest resolver this SUPERSEDES after parity),
  BUG-56 (non-crossing junction tears — the class this rung does not touch),
  graph-topology (j), ROAD-CLOSEOUT-PLAN.md (the ruling ledger + measurements)
---

# BUG-57: the crossing rung — no unsanctioned crossings survive; the longer leg dies, unconditionally

**Owner ruling (2026-08-25):** "If two legs cross on the way from one node to another I just
want to get rid of one of those legs so there are no crossings left. If connectivity suffers,
terrain is making the world unconnectable — fall back to a different seed instead of forcing
the square peg." Threshold detectors (floors, deck-gap, angle guards) cannot enumerate an
infinite defect class; the invariant replaces them. The merge ladder stays first — merges are
the bountiful fix; this rung only judges what survives it.

## The rule (order-free, pure per-pair)

An edge DIES iff some pair (edge, partner) has an UNSANCTIONED proper crossing and the edge is
the pair's LONGER member (tie → lexicographic). Unsanctioned = outside planned merge geometry
(offCurve spans, three-way sanction incl. both-ceding-to-one-spine) and outside a 30 m
shared-node throat. **No flat-crossing carve-out** — ruling A (2026-08-25): nodes are the
ONLY intersections. The classifier's "flat crossings" were measured to be exactly the three
stacks' crossing points, so mid-span crossings are always defects; `crossingList()` becomes
the invariant's gate instrument ("zero unsanctioned crossings", permanent), the T/X-promotion
concept retires, and SURFACE-SMOOTH's crossing-zone exclusion is removed once crossings are
gone. Deliberate X intersections (Option B) stay possible future feature work. No detour vetting, no substantiality floor, no angle logic, no cluster
coordination — the verdict is a pure function of the two pre-registration routes plus their
merge plans, so it is window-invariant with no graph context at all.

Connectivity is VALIDATED, not guarded: a gate asserts component count unchanged across the
seed battery. The seed re-roll valve gets designed only if a real seed ever trips it.

## Measured (2026-08-25 simulations, 8 windows, seeds 3/6/7/20/11/67 — details in plan doc)

- Rung-off parity: the crossing rule re-derives EVERY shipped BUG-55 deletion with the
  identical victim — including the nest winner `g:-4,3,2:-3,3,2`, with no cluster machinery.
- It additionally resolves what the guarded rung refused: seed-3 origin's 'detour' decline
  (`0,-1,0|0,-1,1`), seed-11's two census-stuck pairs, and ALL THREE hairpin stacks — one
  victim `3,1,0|4,1,1` clears three crossing pairs; `5,3,2|6,3,0` clears the third stack.
  graph-topology (j) expected GREEN.
- Connectivity: unchanged in every window (seed 67's 2 components pre-existed).
- Order-free == minimal evaporation walk in every sampled window (no victim chains found).

## Work items

1. Implement the rung on pure pre-registration samples (the census's machinery is the model:
   `_v2RunSample` routes + planned offCurve sanction + throat trim + a proper-crossing test —
   `_v2ConflictPairs` can grow a `crosses` flag). Runs where `_v2DeleteFor` runs today.
2. **Bundle drops a deleted LOSER** — mirror of the shipped dead-winner rule; victim
   `3,1,0|4,1,1` is a bundle loser at node 4,1,1 (deleting one today is the measured 87 m
   carve-crease trap). Watch acyclicity through `_v2DisjointFor → _v2BundleSolve`.
3. Parity battery, then DELETE the superseded machinery: tear nomination guards, the one-shot
   victim-free BFS, `_v2ClusterResolve` + deep boxes + 'D|' memo universe, NEST_DIAMETER_HOPS.
   (The deleteDetourHops slider retires or becomes the rung's on/off.) Update BUG-55 ticket +
   memory to mark the nest resolver historical.
4. Connectivity gate: components-unchanged assertion across the census seeds; census/classify
   reporting updated (crossing-rung verdicts print like deletions today).
5. Map A/B screenshots of every changed window for the owner (ruling 4).

## Acceptance

- Zero unsanctioned crossings in every battery window; all prior marks stay CLEAN/resolved;
  victims match the parity table (any divergence investigated, not waved through).
- graph-topology (j) green; component counts unchanged across the seed battery.
- The superseded machinery is gone; `npm run test:all` shows no new reds; bench shows the
  delete-rung scan cost reduced or unchanged (feeds PERF-28).
- Owner map review of the changed windows.

---

## CURRENT HANDOFF (2026-08-25, build session 1) — rung BUILT, checkpoint pending owner review

Code on `feature/corridor-router` (worktree `CarGame-corridor-router`, uncommitted at session
end pending owner checkpoint). Work items 1, 2, and the gate halves of 4 are BUILT; ruling-3
machinery deletion is HELD until the owner reviews the parity table + maps below (kickoff order).

### What was built

1. **The crossing rung** (work item 1): `_v2ConflictPairs` grew a proper-crossing scan (strict
   open-interval seg×seg, the census's convention), bounded to conflict intervals, with the 30 m
   shared-node throat excluded at detection. `_v2DeleteFor` is now the order-free rule verbatim:
   an edge dies iff some pair has an UNSANCTIONED crossing and it is the longer member. No BFS,
   no cluster resolve, no tear thresholds — those bodies are now UNREACHABLE dead code awaiting
   ruling-3 deletion. `deleteDetourHops` 0 still disables the rung (slider retire pending).
2. **Sanction = BUILT merge extents, any winner** (`_v2CededExtents`): a crossing is sanctioned
   iff it lies inside a merge extent that will actually BUILD, on either run's own pure arc.
   Plan-union and spec-exists semantics were both tried and MEASURED WRONG: three battery
   leftovers sat between a planned extent and the built one (s6@0,0 built [0,112] planned to
   ~141 with the crossing at 140; s11; s6-nest a spec that never built shielding its pair).
   This closed BUG-55's booked "dry-run for END-anchored specs" gap: `_v2RegisterMerged` has a
   `dry` mode returning the band that would build. ANY winner sanctions (not just the pair
   partner): inside a ceded extent the registered geometry is the winner's pavement, so the
   crossing re-attributes to the winner's own pairs (this is what un-deleted the seed-67 false
   positive).
3. **Bundle drops a deleted loser** (work item 2): two-layer `_v2BundleSolve` — plan mode (no
   `wide` arg) for discovery/dry-runs/sanction (never reads a delete verdict → acyclic);
   assembly mode (`wide` passed, memo key 'A|') filters deleted members. All real registration
   paths thread `wide`; `_v2WinnerView`/`_v2RegisterMidSpan`/`_v2RegisterMerged` carry it.
4. **Polar-cap terminus coverage** (unplanned, root-caused): the crossing rung can delete the
   third leg of a junction, and the apex-sliver fallback's binary radial gate (endHW = 18 m)
   then ships as a WALL — measured 87 m second-difference at seed-6 node 1,0,0 (683,215), a
   deletion-degraded junction in a deep cut (carve-mesh-smoothness red). Fix in
   `_resolveRoadSurface` + `_carveCrossSectionBlended`: the fallback now covers to footHW with
   effective lateral = max(perpendicular lat, radius from terminus) — the bank cross-section
   rotates around the run end, continuous with the interior footprint across the end-ray,
   ordinary toe by 36 m. Mesh == physics (one choke point). Carve gate GREEN both seeds; seed 7
   IMPROVED 25.0 → 13.3 m (pre-existing wedges smoothed).
5. **Instruments**: `test/crossing-rung-parity.mjs` (battery: victims + components + census REAL
   crossings, with `--diff`); crossing-classifier BROADPHASE check accepts the zero-crossing
   network (full classifier reduction still pending ruling 3); road-connectivity CONNECTED is
   rim-honest (nodes beyond the stream radius contract into one OUTSIDE node — seed-11's
   "second component" was a 3-node rim chain at |p|≈2.3–2.6 km, shown connected at r 2000).

### Parity table (battery: 8 windows, seeds 3/6/7/20/11/67)

Every BUG-55-shipped victim re-derived IDENTICALLY (5/5): seed-6 nest winner -3,3,2|-4,3,2 (no
cluster machinery), 1,1,2|2,1,0, seed-7 -1,-1,2|-1,0,0 + -3,0,2|-3,1,2, seed-20 2,-1,0|2,-3,2.
Census REAL crossings: ZERO in every window (was 2/2/1/5/0/0/3/0). New resolutions, all
predicted classes: seed-3 origin 0,-1,0|0,-1,1 ✓ (the 'detour' decline) · seed-11 BOTH stuck
pairs ✓ (-1,-3,1|-2,-2,0, 1,-2,0|3,-2,1) · s6@0,0 1,-1,1|1,0,0 + 1,-3,0|2,-2,0 · s6-nest kept
member -2,3,1|-3,3,2 (the booked 74/66 m tears finally resolved) · gate window: 5,0,1|6,0,0
(parity) + BOTH stacks. graph-topology (j) CORRIDOR-CLEARANCE **GREEN** (8/9; only (f) red,
ruling 7 retires it). Components unchanged in every window (two apparent splits were window-rim
artifacts, disproven at wider radius).

### ⚠ DIVERGENCE for the owner (do not wave through — ruling 6)

At the gate-window tangle the plan's table promised ONE victim (`3,1,0|4,1,1` clearing three
crossing pairs). The real pure lengths are near-TIES: L(3,-1,1|3,1,0)=1136, L(3,1,0|4,1,1)=1126,
L(4,1,1|5,0,1)=1139 — so the order-free rule as RULED (longer member per pair, which is what
was implemented) deletes THREE of the four tangle legs (3,-1,1|3,1,0 and 4,1,1|5,0,1 are each
the longer member of their pair with 3,1,0|4,1,1, which itself dies to its pair with
4,1,1|5,1,0). The sim's "order-free == minimal evaporation walk" equivalence does NOT hold here
on real samples: a minimal walk would delete only 3,1,0|4,1,1 and let the other two pairs
evaporate. Connectivity is intact either way (verified r 2200: one component). The owner
decides: (a) accept the order-free form's 3 victims (map B_s6_4500_600.png shows the result),
or (b) rule the evaporation-walk form instead. Everything else in the battery is identical
under both forms.

### Checkpoint materials

- Maps: `.planning/bug57-maps/` — `A_*.png` = BUG-55 rung (shipped), `B_*.png` = crossing rung,
  five changed windows (s3@0,0 · s6@0,0 · s6@-1692,1759 · s6@4500,600 · s11@0,0).
- Parity dumps: scratchpad `parity-baseline.json` / `parity-new2.json` (regenerate with
  `node test/crossing-rung-parity.mjs <out.json>`; diff mode `--diff`).

### Still open (after owner review)

- Ruling-3 machinery deletion: `_v2VictimFreePath`, `_v2ClusterResolve`, deep boxes + 'D|' memo
  universe, NEST_DIAMETER_HOPS, tear/nomination fields (`tear`, `covered` path), the
  deleteDetourHops slider retire (or rename to the rung on/off). SURFACE-SMOOTH's crossing-zone
  exclusion removal. Classifier reduction to the zero-crossings instrument.
- Booked reds unchanged: road-smoothness (lone-pine canary), graph-topology (f) (retire at the
  touch), mission-network (BUG-41), paper-tour (margin), pond-route-around (precondition).
- Known residue (deterministic, censused): the dead-winner rule can void a plan at assembly
  after the sanction layer trusted it — the crossing then ships for one rev and the census
  reports it (same class BUG-55 accepted). Watch, don't guard.
- Edges under 60 m never enumerate conflict pairs (`_v2ConflictPairs` floor, pre-existing) — a
  crossing with a <60 m run is invisible to the rung; census would catch it (none seen).
