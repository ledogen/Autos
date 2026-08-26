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
2. **Skip-and-reconnect (owner addition, 2026-08-26)**: alongside the departure boundary
   condition, apply BUG-57 session-2's technique to the fork itself — when the polyline points
   near the fork violate MIN RADIUS **or GRADE**, ignore them and look FURTHER OUT for a good
   point to connect the road in. This is the outward fork slide + direct-span band generalized
   to grade: today the fork lands at the conflict end and the solver must absorb the whole
   climb there (the measured +0.9 m-at-1 m table below); sliding the join out past the steep
   stretch and spanning it with fresh simple geometry lets the leg leave at the through deck
   and take its climb where it has room. Same ladder discipline as session 2: try the
   variants, measure against the fold floor and the grade caps, decline honestly — never
   relax the floors themselves, change the curve until it clears them.
3. **The honest stitching gate** (owner ruling: "should be red until every intersection
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

---

## PRIORITY + fresh reproducer (owner, 2026-08-26) — THIS IS THE NEXT BUILD ITEM

**Owner (2026-08-26, after accepting BUG-57's maps):** "my next main complaint is now these
undriveable intersections where one leg comes in above the other with lots of camber and no
junction pad is formed at all." Capture: `rangersim-capture-1787760371377.json`, seed 6, mark
**(−1582, 1333)** — the SAME node −3,1,1 as mechanism (a), photographed from the road this
time (blue truck parked on the high leg).

**Fresh measurement (2026-08-26, post-BUG-57 world, capture-classify + a probe along the
loser):** `g:-3,1,1:-4,2,0` cedes 0–95 m to the through spine `g:-3,1,1:-3,3,2` (offCurve
0–141). Deck agreement is EXACT through the ceded strand (dy 0.00 m). Then the fork:

| loser arc | lateral sep | dy above winner |
|---|---|---|
| 100 m | 1.0 m | **+0.88 m** |
| 123 m | 20.6 m | +5.56 m |
| 146 m | 39.4 m | +10.4 m |
| 205 m | 76.1 m | +15.7 m |

The leg must climb ~15 m and the profile solve front-loads the whole climb at the fork — the
fork Y is pinned to the winner's deck but nothing constrains the DEPARTURE GRADE, so at 1 m of
lateral separation the pavements already differ by 0.9 m (the lip in the screenshot), and the
band's own camber banks it against the through road. "No junction pad" is structurally true:
the node's pad is 95 m away at −3,1,1 — no pad vocabulary exists at FORKS, and none should:
the ruled fix is the departure boundary condition (item 1 above), which moves the leg OUT of
the through-road's XZ clearance before its Y diverges. The stitching gate (item 2) must
measure exactly this table: deck gap vs lateral separation at every fork/junction leg,
sanctioned bands included.

**Second reproducer (owner, 2026-08-26): the lone-pine road-smoothness canary is this same
class.** Seed `lone-pine` (via `parseWorldSeed` — a raw string seed builds the wrong world),
step of 16 cm at (713,654): `g:0,1,1:1,1,0` cedes its end to `g:0,0,2:1,1,0`, offCurve
351–630, the step at arc ~403 — a mid-span fork-band seam where one road meets another away
from any node. The stitching gate must include the lone-pine spawn window; the pass is
expected to turn road-smoothness green with it (see ROAD-CLOSEOUT-PLAN's road-to-50/50).

Where this sits: BUG-57 is CLOSED (crossing invariant + keep-the-connection relaxations +
ruling-3 machinery deletion all shipped; graph-topology 8/8 with (f) retired per ruling 7 and
the SURFACE-SMOOTH crossing-zone exclusion removed). The shove rung's deflections and the
direct-span Hermite bands are additional fork-like departures this pass should cover with the
same gate. Build order per ROAD-CLOSEOUT-PLAN: **BUG-56 (this) → PERF-28 → re-triage sweep →
merge to main.**

---

## BUILD PASS 1 (2026-08-26) — the DEPARTURE HOLD. Reproducer cleared; gate built; road-smoothness GREEN.

Branch `feature/corridor-router`, commits 90675b2 · 165a99d · 82562d8 · ae9d7da.

### The diagnosis changed the fix

The ruled pass assumed the leg's problem was its PLAN-VIEW departure — "it's begging to be a T",
pin an exit heading across the through-axis, expect re-routing and network character changes. That
turned out to be measurably wrong, and it is the most important finding of this session:

**The XZ departure was already fine.** At the owner's reproducer the band reaches 10 m of lateral
clearance in **17 m of arc** — a brisk ~36° departure. Measured across every merge in the window,
the good forks and the torn forks have the SAME clearance run (13–22 m); what separates them is the
deck gap accumulated over it (0.38 m on a fork that stitches, 3.46 m on the owner's, 4.97 m on the
worst). Nothing in the profile solve paced the leg's Y against its XZ clearance, so it front-loaded
its climb at the fork where it still had the through road underneath it.

So the ruled INVARIANT — "the leg exits the through-road's XZ clearance BEFORE its Y diverges" — is
enforced on the half that was actually broken, and **no routing changed at all**. There is no
network character change to review from re-routing (ruling 6's map A/B is therefore not owed on that
account); what did change is which merge variants build (see the battery below).

### What shipped

1. **`_v2DepartureHold`** (`src/road.js`). Walking a merge band's vertices away from its fork, every
   one still inside the through road's pavement corridor (2 × roadHalfWidth) is HELD: its deck is
   read off the winner's surface at its nearest point — exact, not solved — and the loser's own
   profile solve starts at the first vertex that is genuinely clear. The held length is whatever the
   geometry says: ZERO for a leg that leaves across the through-axis, i.e. a real T. Two conditioning
   rules earned by measurement: the hold is CONTIGUOUS from the fork (taking the last vertex inside
   the corridor re-armed on the far arm of a hairpinning winner and held a whole 60 m band), and the
   nearest-winner projection WALKS a rolling ±60 m window (a global search teleports to the winner's
   far end and put a 12.3 m step in the deck).
2. **Outward fork rungs generalised from tangled pairs to all pairs** — the owner's skip-and-reconnect
   addition applied to GRADE. Holding the through deck costs the strand climbing room; looking
   further out gives it a fork where it has room. Appended AFTER the standard ladder, so an ordinary
   cession still wins wherever it builds.
3. **The hold is a PREFERENCE, not an ultimatum.** If every rung declines held, the whole ladder runs
   again unheld and the fallback is counted (`unheld`). Rationale: BUG-57's ruling puts connectivity
   first — a lost merge unsanctions a crossing and condemns a leg. Without this the battery lost 7
   merges and gained 5 deletions.
4. **`test/junction-stitch.mjs`** — the honest stitching gate (registered in `test/gates.mjs`). ONE
   physical rule, centreline to centreline: `deck gap ≤ 0.15 m + separation / roadFillSlope`. Two
   decks may not diverge faster than the ground between them can slope; the 0.15 m floor is
   road-smoothness's WALL step. Sanctioned geometry is NOT discounted — that sanctioning is what let
   the owner's torn fork print CLEAN through capture-classify. Windows: both BUG-56 reproducers plus
   the crossing-rung battery. Pad-footprint hits are reported separately, not gating.

### Measured

| | before | after |
|---|---|---|
| owner's reproducer, deck gap inside the 10 m corridor | **3.24 m** (0.88 m at 1.0 m sep) | **0.00 m** |
| junction-stitch unstitched stretches (8 windows) | 44 | **18** |
| road-smoothness | RED (lone-pine 2 steps, worst 19 cm) | **GREEN, all 3 seeds** |
| battery merges / deletions | 71 / 9 | **74 / 9** |
| graph-topology | 8/8 | 8/8 |
| crossing-rung-parity | 0 REAL crossings, 1 component | unchanged |
| `npm run test:all` | 46/51 | **47/51** |

The lone-pine 16 cm canary is CLEARED, which is exactly what ROAD-CLOSEOUT-PLAN's road-to-50/50
item 1 predicted would ride this pass.

### Not done — what the 18 residual sites are

- **10 are the `leg` class**: two legs of ONE junction diverging 15–31 m from the node, just past the
  pad mouth, 12–18 m apart with 5–9 m of deck gap. Nothing to do with forks — this is the junction
  blend + pad's surface, and it is the next piece of BUG-56 if the owner wants it.
- **~7 are `fork` at 13–18 m separation** — a band that has left the winner's corridor and then
  passes the winner's OTHER hairpin arm, or a run whose own profile is marked (seed 6 `8,0,1|9,1,0`
  climbs 23 m in 24 m of arc; its 16.4 m entry is that, not a stitching defect). One,
  `g:5,3,2:6,3,0 × g:6,3,0:6,4,1`, is pre-existing and IMPROVED by this pass (3.44 m → 2.21 m).
- **MID-SPAN forks are deliberately NOT held.** The hold was built for them too and works on its own
  terms (seed 6 `−2,3,1|−3,4,2` went 1.05 m → 0.08 m), but moving a mid-span strand's solve boundary
  drifts its profile far enough by the JOIN that the seam where the analytic refine resumes reads as
  a 24 cm collision-only step at a junction pad. Measured trade: one junction-stitch site gained,
  road-smoothness lost. The collision-surface bar wins. Removed rather than parked; re-deriving the
  band's arc allocation from its XZ length instead of its vertex index halved the step (30 → 24 cm)
  but did not close it, and had no effect once the hold came out, so it was not kept either.
- The SHOVE rung's deflections are covered by the gate (it measures registered geometry, whatever
  produced it) but were not separately audited.

