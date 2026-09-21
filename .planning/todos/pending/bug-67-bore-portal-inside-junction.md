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

Both land AFTER the BUG-65/66 junction work merges: (1) moves every baseline those tickets are
measured against, and (2) collides with them directly.

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
