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

**ROOT CAUSE (2026-08-24, measured — two distinct mechanisms):**

**(a) The screenshot tear IS a sanctioned merge TAPER BAND.** At node -3,1,1 the merge
planner planned AND APPLIED: `g:-3,1,1:-4,2,0` cedes 0–96 m to `g:-3,1,1:-3,3,2`
(off-curve band 0–142 m). The ceded strand rides the winner's deck exactly — the throat
stitches. The tear is the FORK: from 96 m the loser departs the winner's course and regains
its own solved profile, packing **4.4 m of height divergence** into the ~50 m taper while
still within shared-earthworks distance (<18 m lateral) — the floating shelf over the carved
bench at (-1583, 1352), 12 m from the owner's camera. capture-classify and the gates SANCTION
off-curve bands as intended geometry, so this prints CLEAN while looking torn — **owner
ruling 2026-08-24: that sanctioning is wrong as a quality bar; junction stitching "should be
red until every intersection stitches nicely."**

**(b) The sibling tear at node -2,3,1 is an UNAPPLIED planned merge.** The planner planned
`-2,3,1|-3,4,2` ceding ~101 m at the node, but that run also carries a MID-SPAN merge
(294–466 m to `-3,4,2|-2,5,1`) and `_v2MergeFor` allows one merge per run when a mid-span is
involved — it takes the longer spec ALONE even though the two regions are disjoint. The
planned end merge is silently discarded; 74 m / 5.3 m-gap tear at (-967, 2522).

## The pass (per owner rulings 2/3, 2026-08-25)

**The bar**: a car must be able to drive straight through on the through-road without being
launched or hitting a wall from the third road. The screenshot fork fails because the minor
leg joins at a very shallow angle — it occupies the through-leg's XZ space for so long that
the constraints pulling it into its own Y space conflict. "It's begging to be a T instead of
a Y. We need to figure out how to get out of its way."

1. **Y→T departure shape, EMERGENT**: give the minor leg a departure boundary condition at
   the junction — an exit heading across the through-axis (the through-axis is already
   computed per node for pads/pins; the corridor search already accepts start-heading pins) —
   and let terrain do the rest. The leg exits the through-road's XZ clearance before its Y
   diverges; if it must run parallel eventually, it first diverts outside a clearance width.
   Do NOT hand-code a taper shape or a co-grade choreography (the earlier co-grade-taper idea
   is REPLACED by this ruling). Routing change ⇒ affected edges re-route; expect network
   character changes at shallow-angle junctions — map A/B for the owner.
2. **The honest stitching gate** (owner ruling: "should be red until every intersection
   stitches nicely"): a check that measures the drive-through bar — deck coplanarity /
   obstruction within the through-road's clearance corridor at every junction, INCLUDING
   sanctioned taper bands (sanctioning is what let the screenshot print CLEAN). Allowed to be
   red until this pass lands.

(Mechanism (b) — the discarded end merge at −2,3,1 — is now BUG-57's business: that pair has
an unsanctioned crossing and its longer member dies under the crossing rung. The
midspan+end-merge composition idea is demoted to a structural watch in the plan doc.)

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
