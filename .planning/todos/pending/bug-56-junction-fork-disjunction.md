---
id: BUG-56
type: bug
status: open
severity: major
opened: 2026-08-24
source: owner screenshot while freecamming the BUG-55 acceptance area (2026-08-24)
relates: BUG-55 (the nest fix is just down-network), FEAT-68 (v2 junction assembly),
  graph-topology (f) NODE-DEPARTURE (bearing debt at the same class of node — separate axis:
  that one is heading, this one is HEIGHT/surface)
---

# BUG-56: junction fork disjunction — minor leg arrives as a floating shelf over a stepped carve cliff

**Owner, 2026-08-24:** "junctions need a pass to fix the disjunction" — screenshot at
**seed 6, near (−1576, 1361)** (HUD POS line; free-cam view). A Y-fork where the minor leg's
ribbon rides in as a thin shelf hovering over a stepped carve wall, with a metres-tall vertical
tear where it should blend into the major road's surface. The terrain under the fork is cut in
visible stair-steps; the shelf has no earthwork under its outer edge at all.

The owner accepted the BUG-55 area itself as looking great — this is the junction-surface class
that remains around it.

## What we know going in (do the diagnosis fresh at the spot — do not assume)

- The v2 assembly grades each edge standalone and reconciles shared nodes via the junction
  blend + pad; the pad plane is clamped to ~7 % grade (mergePadArrivalMax exists precisely
  because arrival-grade vs pad-plane mismatch × pad reach is a measured collision-cliff class).
- Carve composition at forks is the triple-overlay; a stepped wall under a fork means the two
  legs' carve bodies disagree about the design height across the shared footprint.
- Deletions can rebuild a pad from fewer legs (BUG-55 phase 5 watch item) — this node is near
  the nest, so check whether it lost a leg and whether the rebuilt pad is the tear.
- graph-topology (f) NODE-DEPARTURE is booked separately (bearing); if one pass fixes both,
  fine, but do not fold its re-baselining into this ticket silently.

**IDENTIFIED (2026-08-24, measured):** the screenshot spot is the nest's second kept-member
tear — `g:-3,1,1:-3,3,2` (the BUG-55 loser) × `g:-3,1,1:-4,2,0`, both leaving node -3,1,1 at
(-1533, 1247): ~120 m raw alongside (66 m past the 30 m throat trim), separation 0–18 m, decks
up to **4.4 m apart @(-1583, 1352)** — 12 m from the owner's camera POS. The floating shelf is
the higher deck riding over the lower one's carve. Deletion of either leg was declined by the
cluster walk (detour would lean on the nest's deletions); the merge ladder declined earlier.
So this ticket's job at THIS node is a junction-surface reconciliation the resolution ladder
does not attempt: two legs that both survive, leaving one node within earthworks distance at
different grades. The sibling tear of the same class sits at node -2,3,1 (-870, 2486), worst
gap 4.9 m @(-967, 2522) — fix both, and sweep for more.

First moves: `node test/capture-classify.mjs 6 -1576 1361` for the runs/merge state at the node;
`RoadSystem.debugSampleAt` / carve-mesh probes across the fork for the height series of each
surface; identify WHICH surface (leg ribbon, pad, carve floor) owns the step.

## Acceptance

- At the captured fork: the legs and the junction surface meet with no vertical tear and no
  unsupported shelf — the carve under the fork is a single reconciled footprint, not stairs.
- A sweep of seed-3/seed-6 junctions (the eleven-mark windows are fine as the sample) shows no
  remaining floating-shelf forks.
- carve-mesh-smoothness and road-smoothness stay green (lone-pine canary allowed); no new reds
  in `npm run test:all`.
- MESH == PHYSICS holds at the fork (drive over it; no invisible step).
