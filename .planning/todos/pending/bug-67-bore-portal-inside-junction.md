---
id: BUG-67
type: bug
status: pending
severity: major
opened: 2026-09-14
source: >
  Owner capture /Users/ledogen/Downloads/autos-capture-1788933513716.json (seed 0, mark
  (-266.8, -1763.2)), plus a 20-seed headless census taken while triaging it.
---

# BUG-67 — a tunnel portal that opens inside a junction

## What the owner saw

> "The combination of junctions and tunnels leads to problems. We don't have machinery to do a
> merge of two tunnel bores, instead the wall of one cuts off the opening of the other. And since
> they generate close to junctions, sometimes they intersect with one another."

The capture reproduces exactly: run `g:-1,-3,1:-1,-2,2` carries a 130 m bore whose span starts at
**arc 0** — the portal IS node -1,-3,1. The node sits 26.7 m below its own spot height, so the deck
is already in BORE class at station 0 and there is nowhere for a headwall to stand.

## Census (20 seeds, 1400 m, 204 bores) — what is actually common

| class | count | share |
|---|---|---|
| portal inside a real junction pad's reach (`padReachNodes()`) | **51 / 204** | 25 % |
| portal within one profile station (12 m) of its own node | 15 / 204 | 7 % |
| two bore cylinders interpenetrating (centrelines < 2·boreRadius) | **1 / 204** | 0.5 % |
| …of those, on PARALLEL (non-adjacent) edges | **0** | 0 % |

So the owner's instinct that parallel edges would also be a problem is not (yet) borne out: every
interpenetration in the sweep is a pair **sharing a node** — seed 18, runs
`g:3,0,1:1998416,642902,-1` and `g:1998416,642902,-1:2,1,1`, centrelines **0.4 m** apart at
(1999, 643), which is also the most deeply buried node in the sweep (28.1 m).

The dominant failure is not bore-vs-bore at all. It is **portal-vs-pad**: the junction pad carves
its apron flat over exactly the hillside the tunnel was going to enter, so the pad's cut face
slices the headwall off. That reads in game as "the wall of one cuts off the opening of the other".

## Both remedies the owner proposed are ruled out by measurement

**"Omit them a certain distance from junctions"** — clipping the span back is strictly worse.
Every portal in the corpus opens at **~25 m of cover**, because `BORE` is not a state the router
prefers, it is the class `classOf()` is FORCED into once the deck is more than `roadV2.cutMax`
(25 m) below ground. Cover then climbs steeply inward — 40-90 m within the first 40 m. Dropping a
span therefore leaves the deck 25 m+ under the hill *with no tube at all*: an open canyon at the
junction instead of a broken portal.

**"Enforce greater clearance"** — nothing downstream of routing can move the portal. The deck is
PINNED at the node (`_v2NodeHeight`, the shared-node boundary condition), so the class at station 0
is decided by terrain alone and no cost term can change it.

Bounding node burial at `cutMax` was tried headlessly and does **not** work either: portals inside
a pad went 51 → 50 over the same 20 seeds, because most cases are not the deeply-buried-node class
— the ground simply rises past 25 m within one station of an ordinary node.

## What would actually work (owner's call — both reroute the world)

1. **Price a near-node portal in the corridor search** (`src/corridor-router.js`). `cPortal` is
   already a per-transition charge; making it rise as the station approaches either end would make
   the STAGE-1 alignment leave a node along a bearing that does not dive straight into a hill.
   This is the emergent-from-the-cost-model answer and the one that matches the project's own rule.
   Cost: every edge re-routes, so every seed's world moves.
2. **Make the junction pad yield to the bore** (carve composition, `_sampleCarveWorld` / the pad
   plane). The pad must not carve the ground inside a bore's footprint plus a headwall margin —
   the same shape as the existing FEAT-40 bore-ownership rule. Contained, no reroute, but it sits
   inside the junction-pad machinery that junction-stitch / BUG-59 are actively editing.

Sequencing: both were held behind the BUG-65/66 junction work, which **merged 2026-09-20**
(`9b38013` — dead-winner re-plan + B7 departure clearance). The ceiling gate was re-run against it:
the corpus gained one bore (62 -> 63) and all three ceilings still hold, so nothing is blocked any
more. Remedy (2) still lands inside the junction-pad machinery those tickets touched, so check
BUG-69 / BUG-70 (their re-ticketed residue) before starting it.

## Not the fix (recorded so it is not retried)

`_v2SliceRun`'s span clip keeps any span longer than 1e-6 m, where `_v2GradePts` and
`_clipTunnelSpansAtCrossings` both enforce a 12 m minimum — which is why seed 18's shorter member
is a 5 m stub. Raising that clip to 12 m is **wrong**: the 12 m floor elsewhere applies to a solved
segment that only just dipped past `cutMax` (shallow, harmless to drop), whereas a spliced stub is
the TAIL of a deep bore and dropping it punches a hole in the tunnel.

## Instruments

- `test/bore-junction-clearance.mjs` — registered gate, pins the census as a CEILING (seeds
  0/2/13/16/18/19 at 1400 m: 1 interpenetration, 18 portals in a pad, 12 portals at a node) so the
  class cannot silently worsen and a fix has a number to move. ~32 s.
- `test/scratch-bore-clearance.mjs` — rainy-day: portal-to-node distance, the cover profile walking
  out of each portal, and bore-vs-bore separation for any seed list.
- `test/scratch-bore-prevalence.mjs` — rainy-day: the whole-sweep version, plus node-burial stats.

## Ruling (owner, 2026-09-17)

**Ticket it, do not fix now.** Asked to choose between the two remedies below, the owner's answer
was to mint the ticket and leave it. So this stays `pending` with no remedy selected — the choice
is still open and still theirs, and the ceiling gate holds the line in the meantime.

## Acceptance

- [ ] Owner picks remedy (1) or (2) above
- [ ] `bore-junction-clearance` ceilings come DOWN with the fix (target: 0 interpenetrations, 0
      portals within 12 m of a node; portals-in-pad materially reduced)
- [ ] The capture reproduces clean: seed 0 run `g:-1,-3,1:-1,-2,2` no longer portals at arc 0

## Owner, 2026-11-01

> "Keep in mind there are still big issues with tunnels having intersections near portals causing
> clipping and obstructions and otherwise messy generation. Separate issue/ticket tho."

This is that ticket. Not in the alpha queue yet; BUG-81 item 4 (the tube from outside) goes first.

## Remedy (2) prototyped — 2026-11-01 (Spare), NOT landed (owner's pick pending)

Branch **`proto/bug-67-pad-yield`** (`7f29e11f`, off main bcd1f671): `_junctionPadCarve` returns null
OUTSIDE the pad's own asphalt (its rim hold and feather band) at points behind a portal line within the
collar's half-width + 1 m (`_behindPortal`). Inside the ring the pad is road and stays as built. No span
moves, no route or par changes. Probes and shots: `CarGame-spare/wip/bug-67/`.

**Census on the gate corpus (seeds 0/2/13/16/18/19, 1400 m) — current main, after item 4 and BUG-77:**
the gate's own three numbers are unchanged and remedy (2) cannot move them (they are positions, not
carving): 1 interpenetration · 18 portals in a pad's reach · 12 at their node.

The defect (2) targets needed its own metric: the PAD'S share of the ground behind a portal (2/4/6/10 m
in, lateral ±11 m) — the drawn skin with the pad carve vs without it (the mouth notch is by design and
is cut on every portal, so absolute height is the wrong test; a no-pad control proves the metric clean).

| | before | after (2) |
|---|---|---|
| portals in a pad's reach whose headwall the pad carved | **5 of 21** (mean worst gap 9.3 m) | **0 of 21** |
| control: portals with no pad near | 0 of 107 | 0 of 107 |

**But it does not change what the owner sees.** Before/after screenshots of seeds 2, 13 and 18 are
identical: the carving it undoes sits behind the ring and under the hill (the terrain shader already
cuts the skin there). The visible clipping — seed 13's shot: a junction AT the mouth, a leg's asphalt
across the ring's foot — is the at-node class (12 in the corpus), which only remedy (1) can reach,
because the junction itself stands where the hill should be.

**Recommendation for the pick:** (2) is cheap and safe but a near no-op visually; the clipping the owner
reported is (1)'s — routing that keeps a node's legs from diving straight into a hill. (1) re-routes
every world.

## RULED — owner, 2026-11-01: remedy (1), price near-node portals

> "unfortunately I think we have to price near node portal if the only two options are the ones you
> presented. My only concern with changing every routed world is scenarios becoming obsolete.
> Overall not a big deal if that happens though."

Remedy (1) it is: a bore whose portal would land inside a junction pad's reach (or at the node
itself) is priced in the corridor search so the router prefers a seat where the headwall has hill
to stand in. Every world re-routes, so this goes in BEFORE FEAT-62 authors any scenario — a
scenario built after it stays valid. The proto/bug-67-pad-yield branch (remedy 2) stays parked:
it fixed the census and nothing visible. Lane: Spare, after BUG-64.

## Remedy (1) measured — Spare, 2026-11-01: the corridor is not the lever; the NODE HEIGHT is

Remedy (1) was built as ruled (not landed; reverted): a near-node portal charge in `corridorSearch`,
`cPortalNear` at the node falling quadratically to 0 at `portalNearM`, on the cell the portal opens
into. Census (`bore-junction-clearance`, seeds 0/2/13/16/18/19 at 1400 m) — interpenetrating / in a
pad's reach / at the node:

| | interpenetrations | in pad reach | at node |
|---|---|---|---|
| main | 1 | 18 of 64 | 12 |
| cPortalNear 2000 over 96 m | 2 | 17 of 59 | 12 |
| cPortalNear 20000 over 128 m | **11** | **24** | **18** |
| burial capped at cutMax − 3 (no charge) | 2 | 18 | 12 |
| burial cap + 2000 / 96 m | 3 | 17 of 59 | 11 |
| burial cap + 6000 / 96 m | 4 | 19 of 59 | 12 |

Stronger pricing makes it WORSE. The corridor plans on a 32 m lattice over the smoothed (K=4)
field, while these portals are created within one 10 m PROFILE station of the node. So the charge
only shoves the planned transitions around, and the profile DP is still forced into the bore by
the fine ground.

**The mechanism (`wip/bug-67/classify.mjs`).** Every one of the 12 at-node portals has its node
pinned **15–29 m below its own spot height** (6 at 0 m: 26–29 m buried; 6 at one station: 15–24 m
buried, with the ground rising another 7–35 m in the first 20 m). `_v2NodeHeight` pins a node to the
LOWEST of 12 ring samples 22 m out, plus 0.35·22 = 7.7 m — the FEAT-68 convex-edge rule, so a
DOWNHILL leg can reach the valley. It takes that minimum over all twelve directions, including ones
no road leaves along. A node on a side-slope therefore sinks to the low side's level, and its UPHILL
leg starts in (or within one station of) a > 25 m cut: a forced bore at the junction. The two
promoted-T cases (seed 18's interpenetrating pair) are the same node seen by two legs.

**Proposed lever, which still re-routes every world: the node height from its OWN legs.** Take the
ring minimum only along the bearings of the node's actual graph edges (the Urquhart band graph is
window-invariant in its interior, so every incident edge still computes the identical height — node
agreement holds), and/or cap the burial so the uphill legs keep a cut under cutMax. Not prototyped:
it changes the node-height rule FEAT-68 owns, which is wider than the ruled remedy. Waiting on a go.

## Own-legs node height — prototyped, Spare 2026-11-01, NOT landed (owner's go/no-go)

Branch **`proto/bug-67-node-height`**. `_v2NodeHeight` takes its ring minimum only from samples
within 30° of a bearing to one of the node's own Urquhart neighbours (`_v2LegBearings`). The
bearings come from a LOCAL graph band around the node's macro-cell, memoised per site. A first
version that read the streaming `_proto.graph` broke network-worker-parity, because the pre-warm
band differs, so the leg set must be window-free. Switches: `BUG67_LEGS=1`, plus `BUG67_BURY=n`
for the optional burial cap at cutMax − n. Probes: `CarGame-spare/wip/bug-67/` (node-moves.mjs,
classify.mjs).

| corpus (seeds 0/2/13/16/18/19, 1400 m) | main | own legs | own legs + burial cap (cutMax − 3) |
|---|---|---|---|
| bores | 64 | 62 | 62 |
| interpenetrating | 1 | 1 | 1 |
| portals in a pad's reach | 18 | **16** | 16 |
| portals at their node (< 12 m) | 12 | **10** | 10 |
| nodes whose height moves (of 340) | — | 82, all RAISED: median 1.5 m, p90 6.0 m, max 10.8 m (14 over 5 m) | 86 (median 1.6, p90 6.0, max 10.8) |
| play-area rungs (cap · fine · relief · ceiling · re-routed) | 12915 · 6 · 103 · 366 · 2 | 12853 · 3 · 98 · 361 · 3 | 12832 · 3 · 98 · 351 · 3 |

Gates with own legs:
- **Green:** play-area, par-oracle, mission-network, scenario-route (both descents' poses still
  sit on the road), world-determinism, road-connectivity, invariance, restream-invariance,
  road-worker-parity, network-worker-parity.
- **RED: paper-tour.** On its seed the world moves, and the top rung's 15-customer round goes
  14.77 → 16.09 km, against the 15.5 km hard limit. It is one seed (n = 1): a re-route side
  effect, not the mechanism.

**The burial cap adds nothing** over own legs: the same census, and 4 more nodes move.

**Why only 2 of 12.** The other at-node portals are nodes whose LOW ring sample really is along
one of their own legs: a junction seated on a steep face, with one leg diving downhill (it needs
the node low, because the fill ceiling is 8 m) and another climbing 15–35 m in its first 20 m (it
needs the node high). No node HEIGHT serves both. The lever left is the node SEAT: site placement
that avoids steep faces, since sites already valley-snap. That would be a third remedy, and it
moves every node in the world, not only heights.

## Owner, 2026-11-01 (evening) — reseat questioned; junction cutting to prototype first

Owner: "why do we need to move nodes to get a resolution? ... as long as there is a min spacing
between nodes there should be a valid solution for generating legs even if they tunnel ... otherwise
im down to implement a conditional node reseat but performance here is always a huge concern."

Orchestrator's answer, which the owner ruled "follow recommendation": the ten leftover cases are one
node whose two legs want opposite heights (one dives, one climbs). The legs DO have solutions; the
defect is only where the climbing leg's portal lands, and that is the PROFILE solver's choice (10 m
stations), not the corridor search's (32 m lattice) — which is why remedy (1) in the corridor search
did nothing. Lever to try before any reseat: **forbid BORE within the junction's reach (~30 m) of a
node and let the profile solver price those stations as an open cutting even past cutMax** — a
walled junction cutting, as real roads do. Same mechanism as BUG-58's stub re-solve. No corridor
re-routes, no node moves. A leg infeasible under the rule falls back to today's bore; that residue
is where a conditional reseat would earn its cost, bounded by (failing nodes / total) × routing
budget. Spare prototypes with the census plus each node's needed cutting depth; the owner decides.

## Owner, 2026-11-03 — the defect is SIBLING tunnels colliding at a junction, not a portal at a node

> "there's no issue here. Clearly you've misunderstood the problem. This may be a junction, but if it's a junction of
> n equals 2, then there's no way that the legs self-intersect where the tunnel mouth is. You don't need to fix this
> occurrence." — on seed 19 `-3,2,1` (the one at-node portal re-seat + the 40 m cut left).
> "both tunnels are undriveable due to them intersecting. the wall of one tunnel literally prevents you from entering
> the other and vice versa. fix this. not n=2 non-issue tunnels … reassess the solution space and let me know what
> works with minimal overhead"

So the census metrics above (portal in a pad's reach, portal at its node) measured the wrong thing. A lone tunnel at a
degree-2 node is fine. The defect is **two or more legs of one junction (degree ≥ 3, promoted Ts included) whose bores
or portals collide**. That was metric (1), "interpenetrating" (1 in the 6-seed corpus), which every fix so far treated
as the rare case.

Three owner captures, all seed 163384989, free roam, on main (orchestrator probe: every bore within 250 m of each mark):

| capture | junction | what collides |
|---|---|---|
| `autos-capture-1793661489778` (the worst) | promoted T `-27029134,40835686,-1` (deg 3) | ALL THREE legs are in bores that start at the T itself (0 m): the trunk's 12 m stub and two legs of 133 m and 168 m, centrelines 0–4 m apart. The T was promoted onto the trunk where the trunk was already underground. |
| `autos-capture-1793661400345` | site node `-31,48,0` (deg 3) | two legs bore from 10 m and 20 m out, side by side, centrelines 15.9 m apart (< 2R = 16 m): the tubes overlap. |
| `autos-capture-1793661187695` | site node `-13,10,0` (deg 3) | two legs' bores (portals 106 m and 141 m from the node) come within 29 m centreline to centreline near (−8259, 6847). |

Also from the owner's screenshot (seed 19, (−1210, 1837), on the re-seat + cut build): the tube there shows open sky
past the portal. Not yet checked on main.

The re-assessment, with this definition, is running (orchestrator's subagent, on proto/node-reseat).

## RULED — owner, 2026-11-03: "approve the call"

The sibling-tunnel re-assessment is on proto/node-reseat (0b0f9956; its last two sections of this ticket hold the
census and the per-class fixes; probe `wip/reseat/sibling.mjs`). Of 442 junctions in 54 windows, 5 collide. Approved
order:
1. **T slide + re-seat at a 50 m relief trigger, first.** T slide: in `_v2PromotableProbe`, never fork a T within
   25 m of its trunk's bore if an open-air candidate exists; otherwise the old placement stands (no T deleted).
   Re-seat: a site whose 22 m ring relief exceeds 50 m moves to the nearest seat ≤ 25 m relief within 60 m (3 of 340
   nodes move; seed 20's node stays, so its doubled road does not happen).
2. **Then the shared bore** (an underground Y: overlapping sibling tubes drop the lining inside each other, and a
   portal ring inside the other tube is skipped; meshes and colliders only). Only simulated so far.
Before/after screenshots of the moved sites go to the owner before each step lands. The junction cut
(proto/bug-67-junction-cut) is not needed. Lane: Spare. FEAT-62's scenarios come after (every world re-routes slightly).

## Built — Spare, 2026-11-04 (feature/spare), NOT landed until the owner's OK

### Step 1 — T slide + re-seat at 50 m, the default (915c966c, re-pins 32df8c82; land at 3df62151)

Ported from proto/node-reseat 0b0f9956 with the switches dropped: constants `RESEAT_TRIGGER_M` 50, `RESEAT_FIT_M` 25,
`RESEAT_REACH_M` 60, `T_SLIDE_M` 25 (road.js). Full suite 116/119 + smoke 21/21; the three reds are the predicted
ones, each re-pinned with its reason in the gate:

- vertical-curvature: junction ceiling 204 → 205 — seed 6 origin 30 → 32 kinks, the legs of node 1,0,0 re-seated
  40 m, both under the 0.11 /m line (main 203).
- adopt-reconcile: the flip's T matched by shape — the T slid 8 m (635643,448649 → 627737,447586), flip unchanged.
- demolition-site: "a farm or work site posts a demolition offer" over the fixture, not per seed — seed 6's
  roster moved with its re-seat; seed 1 still posts one, and every placement check passes on both.

What moves (main vs step 1, `wip/bug-67/moved.mjs`): nothing in corpus seeds 0/2/16/18/19; seed 13 node -1,2,2
re-seats 30 m and its T moves ~100 m onto another trunk; **seed 6 (the default world)** node 1,0,0 re-seats 40 m
and its legs re-plan (the T at (1067,−294) goes, Ts at (1024,305) and (733,541) appear, a road through there that
main lacks); capture 1793661400345 node -31,48,0 re-seats 40 m; s115's T slides ~32 m out of its trunk's portal.
Sibling probe: 3 of the 5 known collisions fixed. Shots: `CarGame-spare/wip/bug-67/shots/step1/`.

### Step 2 — the shared bore (85625eff, 8eab4d90, and the run-on after it)

`road.siblingTubeTest(runKey)` → a test (x, y, z) → inside the bore of another run sharing one of its nodes
(radius tunnelBoreRadius about that run's centreline, from 1.5 m under its deck up, within one of its spans), or
null when no sibling bores (memoised per network revision). `road.isMouth(runKey, s)`: a span end inside a
sibling's tube is not a mouth. The readers (MESH == PHYSICS):
- buildTunnelTube drops a lining triangle when ALL its corners are inside a sibling's tube. A centroid test (the
  first build) left a sawtooth seam with triangle-sized gaps, and the first shots showed sky through them.
- At a span end that is not a mouth, the tube runs on straight by a full radius (8 m) instead of the 1.5 m lip.
  Two legs ending square at the T left a wedge open on the outside of the bend (sky through it at capture 1);
  what of the run-on lies inside the sibling is dropped with the rest of the overlap.
- buildPortalRing builds no ring at a non-mouth end; terrain.js _tunnelPortals cuts no skin there.
- queryTunnelWallContact returns no wall where its contact point is inside a sibling's tube.
- NOT changed: the mouth-funnel notch (_boreNotchCS) still measures from a non-mouth end. Measuring only from real
  mouths was tried and made it worse: other claimants (the junction's pad, the trunk's open approach) then carved
  the skin over capture 1's T down to the deck (160 m) instead of the funnel's 169 m (1 m over the crowns). So the
  hill over an underground T keeps main's funnel pit, seen from outside. A pad that yields at an underground node
  would remove it; not built.
The trimesh colliders, bore slot and lid follow the meshes as before.

Sibling probe with the REAL rule (`REAL=1`, the game's own siblingTubeTest decides what B still builds):
**0 of the 5** known collisions. Full suite 119/120 + smoke: the smoke flaked twice under other lanes' load
(`reset`, then `map`, load average 9–11) and passed 21/21 alone.

**The two decks drift inside the overlap** (`wip/bug-67/drift.mjs`): at the T they are equal by construction,
and they part as the legs diverge (~55–60° apart, so the tubes overlap for the first ~16 m):

| junction | 8 m out | 12 m out | 16 m out |
|---|---|---|---|
| capture 1793661489778 | 0.19–0.51 m | 0.46–0.82 m | 0.82–1.19 m |
| s77 | 0.26–1.26 m | 0.24–1.92 m | up to 2.6 m |

The physics floor follows the lane you are on (within 0.07 m of its own deck everywhere measured), so the drift
reads as two ribbons at slightly different heights where they overlap, and as a step if you cross from one lane
to the other inside the Y. A blended deck through the overlap would remove it; not built.
