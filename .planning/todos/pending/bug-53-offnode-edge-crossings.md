---
id: BUG-53
type: bug
status: open
severity: major
opened: 2026-08-20
source: owner observation while evaluating the v2 network on the 2D map (2026-08-20)
relates: FEAT-68 (corridor router v2 — the culls that used to police this were deleted in it),
  BUG-25 (v1's crossing-cull edge-flip class, retired with the cull), QUAL-10/QUAL-16 (junction
  pads — where a LEGITIMISED crossing would have to land)
---

# BUG-53: road edges overlap each other away from junctions

**Owner, 2026-08-20:** "there are lots of edge intersections that don't happen at nodes. We used to
try to avoid this, maybe there's a way we can work it in, though I feel like it causes lots of chaos
so we will probably just want to choose to delete one of the legs or trim it to the crossing."

## What this is

Two registered runs cross in plan view at a point that is not a graph node. Nothing there is a
junction: no pad, no fillet, no apron, no vertical agreement — the two roads simply intersect, and
whichever one carves second wins the surface. It reads as a defect and it is one.

**Why there are more of them now.** FEAT-68 deleted the crossing + clearance culls (commit acb42f3)
on measured evidence: across 10 seeds they removed 11–21 GOOD edges per seed, collapsing
connectivity from 95.7% to 54.1% mean largest-component share, while preventing ZERO crossings
between non-adjacent runs *at that time*. That measurement was taken on the pre-2.5D corridor. The
2.5D search (8981406) then made routes far more three-dimensional — switchback stacks, spiralling
descents — and those excursions can cross a neighbour. So the cull deletion was right on its
evidence and this is the follow-on it did not predict, not a reason to restore the culls
(connectivity outranks tidiness, and the culls cost 11–21 edges a seed to buy it).

## Owner's stated preference for the fix

Ranked in the quote, and worth honouring in this order:

1. **Delete one of the legs** at the crossing — simplest, and it is what the topology layer already
   does for degree caps. Needs the detour guarantee the degree cap uses (drop only if the endpoints
   reconnect within a bounded hop count) so it can never strand a component.
2. **Trim to the crossing** — turn the intersection into a real node: split both runs there, register
   four half-edges, let the junction machinery pad/fillet it. Correct-looking but it manufactures
   nodes the site layer never placed, and every downstream consumer keyed on site ids
   (`cellA`/`cellB`, POIs, missions, par) would have to accept them.
3. **"Maybe there's a way we can work it in"** — the owner's own doubt is recorded: *"I feel like it
   causes lots of chaos"*. Do not build 2 before measuring how often 1 is sufficient.

## MEASURED 2026-08-20 — the dominant class is NODE-SHARING overlap, not disjoint crossings

The owner captured a spot on seed 6 (`rangersim-capture-1787289162055.json`, mark −4420, 1535) —
*"4 roads converging mostly to one spot, huge tear in terrain."* Replayed and probed:

- `test/replay.mjs` says the world is **fine by every contract**: surface window-invariance holds
  (gradeΔ 0.000 m, hitΔ 0 over 88 on-road points) and the local centerline radius is 938 m against a
  15 m design minimum. So this is NOT a streaming tear, a fold, or a carve-composition bug.
- The spot is a **degree-3 node** (`-7,2,0` at −4418, 1535), not four roads, and its three run ends
  agree in height to **0.000 m** — the node-height rule is doing its job.
- The defect is **lateral**. Two of the three runs (`g:-7,2,0:-6,2,1` and `g:-8,1,1:-7,2,0`) leave
  the node nearly collinear and their carve footprints overlap **out to 244 m, with a minimum
  centre separation of 0.1 m**. Two roads are laid on top of each other for a quarter kilometre,
  each carving its own profile into the same dirt. THAT is the "huge tear".
  (Two roads need ≈18 m of centre separation not to share earthworks: 2 × (halfWidth 5 + shoulder
  2.5) + carve extra 3.)

### Second and third captures (2026-08-20, same day) — MID-SPAN crossings, and the census

The owner then captured two more spots (`…3171385`, `…3164102`, seed 6) — *"points where I just
cross mid-span"* — and asked where this sits in the plan. Both are **two runs that share a node
somewhere, crossing each other far from it**: at 72%/53% and 72%/18% along their respective lengths,
with vertical gaps of 31 m and **7.95 m**. That is a THIRD geometry, distinct from the near-parallel
departure above, and the first framing of this ticket did not cover it.

**Census over the eval seeds** (`node test/crossing-census.mjs`), excluding crossings within 40 m of
a shared node (expected junction geometry) and crossings where one run is inside a bore (the
vocabulary working):

| seed | runs | REAL crossings | node-sharing | disjoint | under 6 m vertical gap |
|---|---|---|---|---|---|
| 6 | 52 | **11** | 11 | 0 | 11 of 11 |
| 20 | 56 | **13** | 13 | 0 | 10 of 13 |
| 11 | 50 | **4** | 4 | 0 | 3 of 4 |

Distance from the nearest run end: **58–473 m** — genuinely mid-span, not junction spill. Vertical
gaps run 0.1–4.9 m on the bad ones: two roads at the same height crossing with nothing to separate
them.

**What this settles.** The DISJOINT class really is empty — 0 across three seeds, consistent with the
purity probe. Every real crossing is between runs that share a node elsewhere. So the fix does not
need a global all-pairs search: for each node, only its own incident edges can collide, which makes
this a bounded, local problem.

**And it falsifies the claim that retired the culls.** FEAT-68 deleted the crossing/clearance culls
on the finding that they prevented ZERO crossings while costing 11–21 good edges per seed. That
measurement was taken on the pre-2.5D corridor and is now STALE: the 2.5D search produces 4–13 real
crossings per seed. The conclusion to draw is NOT "restore the culls" — they were blunt (they
dropped edges for mere proximity and took connectivity from 95.7% to 54.1%) — but "the targeted
replacement they were standing in for is now genuinely needed".

Note this is NOT the deferred junction-geometry pass in disguise. A pad or fillet dresses the first
few metres; it does nothing about two roads sharing a corridor for 244 m. The owner's own instinct
— delete one of the legs, or trim it — is the right shape of fix.

## Before building anything — measure (the Q1/Q2 discipline this ticket family runs on)

- **DONE — the crossing census** (`test/crossing-census.mjs`, table above). Re-run it after any
  routing change; it is the measurement this ticket is judged on.
- **Still to measure — the OVERLAP kind** (distinct from crossing): per eval seed, for every pair of
  runs meeting at a node, the arc length over which their centres stay within ~18 m (the
  shared-earthworks threshold) and the minimum separation. The seed-6 `-7,2,0` case (244 m at 0.1 m)
  is the shape to hunt. A pair can overlap without ever crossing, so the census above does not see
  it. (The FEAT-68 purity probe already has the geometry for this: it
  counted crossings among pure routes and found the disjoint-pair class empty-to-rare on the OLD
  search — that number needs re-taking on the 2.5D corridor.)
- **What kind?** Split them: (a) a genuine geography funnel — one good pass, two connections, the
  legitimate case the vocabulary section always allowed for; (b) a switchback stack whose arms
  wander into a neighbour; (c) two long runs genuinely overlapping. Each wants a different answer.
- **Would deleting a leg strand anything?** Run the degree-cap's bounded-hop detour test on each
  candidate before costing the rest of the design.
- **Vertical separation:** a "crossing" in plan view where the two decks are metres apart in Y is
  not the same defect — with bores in the vocabulary some of these may already pass under. Report
  the Y gap at each crossing; those may need nothing at all.

## Acceptance

- [ ] A census per eval seed of BOTH classes — node-sharing overlap (arc length within 18 m, min
      separation) and disjoint crossings — with the vertical gap at each.
- [ ] No pair of runs sharing a node runs within shared-earthworks distance for more than ~the
      junction pad radius; the seed-6 `-7,2,0` case (244 m at 0.1 m) is the regression test.
- [ ] Zero non-node crossings that read as defects on the eval seeds (a bore passing under a road is
      not a defect and should be reported separately).
- [ ] Connectivity unchanged: still 1 component per eval seed, ≥ the 0.981 / 10-of-10 floor on the
      10-seed sweep — whatever the fix, it may not cost the connectivity the cull deletion bought.
- [ ] A gate: the `road-connectivity` gate already asserts "no real crossings" on the eval trio —
      confirm what it currently measures and tighten it to this definition.
