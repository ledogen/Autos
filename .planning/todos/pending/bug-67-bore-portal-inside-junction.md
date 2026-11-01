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
