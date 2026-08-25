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
