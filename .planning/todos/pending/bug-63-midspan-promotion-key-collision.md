---
id: BUG-63
type: bug
status: pending
severity: medium
---

# BUG-63 — a mid-span promotion whose pair SHARES A NODE loses a road to a run-key collision

**On main** (verified 2026-09-07 at `2a5e275`, seed 6, T at (-3152.1, 5154.2)); found while taking
`junction-stitch` to zero on `feature/junction-stitch`. Present before that branch's changes.

## What happens

A mid-span pair promotes to TWO Ts (`_v2PromoteMidSpan` → `_v2CommitMidSpan`, FEAT-76): the trunk is
cut at P1 and P2 into three pieces, and the side road is cut into the half before P1 and the half
after P2. When the side road and the trunk **share a node N** — "two roads that part at their shared
node, go their own way, and come back together further out" is exactly the shape `_v2NodeMerges`
plans as mid-span — the side's first half runs N → P1 and the trunk's first piece runs N → P1 too.
Both are keyed `` g:${N}:${P1} ``. The second `_network.set` silently overwrites the first.

Reproducer: seed 6, window centred (-3152, 5154), r 1400. Side `g:-5,7,1:-6,8,2`, trunk
`g:-5,7,1:-5,8,1`. After the commit the network holds `g:-5,7,1:P1`, `g:P1:P2`, `g:P2:-5,8,1`,
`g:P2:-6,8,2` — four runs where five were built. `_proto.nodeInc` at P1 lists **two** legs.

## Consequences

- P1 is a promoted node with two legs: `_v2PromotedRole` returns null (fewer than three strands),
  so neither leg gets the promoted-node reconciliation, and the two runs meet at P1 as a step.
  `junction-stitch` reports it as a 2.5 m edge gap 12 m out (window `seed6 fork mark-B`, (-3160,5163)).
- One of the two N → P1 roads is gone from the world with no count, no skip reason.
- `test/promoted-node-id.mjs` asserts degree 3 for every core T, but only over its own windows;
  this node is outside all of them. A census over the battery would catch the class.

## Why it is not a one-line fix

Run keys are `` g:${cellA}:${cellB} `` and every consumer (`networkGraph()`, the mission planner's
edge ids, `edgeParData`, the union-find) treats a node pair as ONE edge. Two distinct roads between
the same two nodes are a multigraph, which nothing here represents. The candidates:

1. **Treat the shared-node end as node-anchored.** The side's N → P1 half is a road that arrives at
   the trunk at P1 — that IS a T with the side arriving from N. Keep the side half, drop nothing,
   and give the *trunk* piece N → P1 and the *side* half N → P1 distinct identities. Needs a key
   scheme that can name two runs between one node pair, and a decision about what the abstract
   graph shows there.
2. **Drop the side half, make P1 a degree-2 split.** Honest geometry (no step) but deletes ~200 m of
   road that reached P1 by its own path — against the standing rule that connectivity adds options.
3. **Decline the promotion when the pair shares a node and the spec is mid-span.** The pair then
   ships unsanctioned (the crossing rungs already stood down for it) — measured worse for the
   wye-era equivalent.

## Acceptance

- [ ] No `_network.set` in a promotion commit ever overwrites a live key; a collision is either
      resolved by design or declined with a counted reason
- [ ] Every promoted node has three legs in `_proto.nodeInc` — extend `promoted-node-id` (or
      `pad-census`) with a battery-wide census, not just the concentric windows
- [ ] The reproducer above ships both roads or a counted decline, and its `junction-stitch` row goes

## Side measurement from the BUG-25 closure (2026-09-21) — read before writing the census

Closing BUG-25 meant diffing 320 m vs 1500 m builds at 8 centres on 4 seeds, which walks straight
through this ticket's territory. Two facts fell out, both useful here:

- **Promotion EXISTENCE legitimately varies with the window, and that is not a bug.** At seed 6
  @(4500,600), `4,1,1|5,1,0` is one whole edge at r = 320 and is split at a promoted node
  (3337,1177) at r = 1500; likewise seed 0 and testig, 5 such splits on seed 6 alone. In every case
  the T partner is simply not streamed at the narrow radius — a road that is not registered cannot
  be T'd into. So the **census in the acceptance above must be "every promoted node that EXISTS in
  this window has three legs", never "the same Ts exist in every window"** — the latter is false by
  construction and would give you a permanently red gate chasing nothing. BUG-61's
  `promoted-node-id` sweep already takes the right form; keep it.
- **Promotion makes abstract edge KEYS useless as a cross-window comparison unit**, since one
  promotion turns one key into two. Any battery-wide check wanting "same roads?" has to measure
  surface coverage (grid sample, "road within 6 m?") or compare against a promotion-collapsed view.
  Measured that way, main is clean: zero surface divergence inside the 300 m play disc at r =
  320/576/1024/1500 across all 8 centres — so whatever this ticket's collision is costing, it is
  not visibly deleting road at those sites. The known loss is still the reproducer's seed 6 T at
  (-3152.1, 5154.2).

