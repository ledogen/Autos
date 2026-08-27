---
id: BUG-42
type: bug
status: closed
severity: major
opened: 2026-08-07
updated: 2026-08-15
closed: 2026-08-27
source: owner-report
relates: BUG-48 (three RoadSystem instances — likely the same root), QUAL-24, BUG-47, BUG-25, FEAT-40
---

> **CLOSED 2026-08-27 — owner: "just close it out ill flag if it happens to bother us again".**
>
> Never reproduced headlessly, and on 2026-08-27 its named mechanism was measured absent on the v2
> world: 36 degree-3+ junctions across seeds 0/3/6/11/20/90, the 320 m PLAY stream rebuilt centred on
> each one and compared against the 1400 m MAP stream — **zero lost legs, 0.00 m deck disagreement**.
> The 5.3 m surface discrepancy this ticket recorded has no analogue. v1 grouped deg-2 chains by the
> streamed band (QUAL-24's note, which was this ticket's symptom stated in the abstract); v2
> registers per graph edge with window-invariant plans, and `restream-invariance` covers the live
> radius-churn path that a headless probe cannot.
>
> **If it is ever seen again**, the first move is the same test with real session state instead of a
> fresh build: capture at the dead end, then diff the live play instance against a
> `MISSION_PLAN_RADIUS` rebuild at the same spot. BUG-48 (three RoadSystem instances) stays open and
> is where that would land.

# BUG-42: a deg-3 junction on the map is a dead end in the world (seed 0, story mode)

## ⚑ UPDATE 2026-08-15 — a candidate root arrived: BUG-48

**Still open, still not reproduced. But this ticket's dead end — "no headless build reproduces it,
so it must be live session state" — now has a named mechanism, and it is not the one hypothesised
below.**

BUG-48 (filed 2026-08-15) establishes that **three separate `RoadSystem` instances are streamed over
different windows**: `play` (~320 m band — physics, carve, the ribbon mesh, *the road you drive*),
`planner` (`MISSION_PLAN_RADIUS` 1400 m), and `map` (`map2d._road`, its own `setRadius`, ***the white
road you see on the map***). QUAL-24's note at `src/mission.js:806` is the load-bearing part:

> *"A runKey names a run GROUPING, and a deg-2 chain merge groups by the streamed band — so a mission
> planned at MISSION_PLAN_RADIUS can name a chain the 320 m play stream never forms."*

**That is this ticket's symptom stated in the abstract.** "The map draws a deg-3 junction, the world
has one leg" is a map-instance-vs-play-instance disagreement by construction — the two artefacts the
owner compared are drawn from different `RoadSystem` objects streamed at different radii, and nothing
guarantees they group runs the same way.

It also explains the one anomaly this ticket could never place. The session resolved the dead-end
point to run `g:-2,-1,1:-1,-1,2` at a clamped `arcS 0.000000`; a fresh build attributes the *same
point* to a **different run**, `g:-1,-3,1:-2,-1,1`, 2159 m along. That is not a resolver clamp bug —
that is **the same place carrying two different run groupings in two different windows**, which is
precisely the defect BUG-48 measured directly at seed 90 (same seed, same run, same arc, local radius
**79.6 m in the game vs 195.5 m in a replay**). The clamp to `arcS 0` is then a *downstream symptom*:
project a point onto a run whose arc domain it does not belong to, and it pins to the origin — at the
wrong height, which is the 5.3 m surface discrepancy recorded below.

**Revised working hypothesis, superseding "the resolver clamps beyond the arc domain":** the
`_projectOntoRun` / `_resolveRoadSurface` family is where the symptom *surfaces*, not where it
*originates*. The origin is `edgeParData` presenting an arc-span view `(centerline, s0, s1)` of a
**merged** run, where the merge groups differently per window. Fix the presentation, not the
projection — and per BUG-48's "Do not", **do not key anything new on `runKey`**; the abstract edge
(site pair) is the window-stable identity.

**Investigate these two together.** BUG-48 has a live capture that reproduces *its* half on demand
(`bug-48-seed90-route-shortcut.json`) — which is exactly what this ticket lacks. Its "next
measurement" (build all three instances headlessly, resolve one abstract edge in each, compare
`arcOffset`/`arcLength`, sampled centerline, and `curvatureAt`) would, if it lands, either explain
this ticket or rule the family out. **Do not spend more effort reproducing BUG-42 first.**

### What this update does NOT claim

- **Not proven.** Nobody has compared the three instances at *this* site, and the seed-0 captures
  cannot be re-run against a hypothesis about an instance the capture never recorded.
- **The leg counts still do not line up.** Both windows carry three legs at this node (see the table
  below), so this is not a naive "the map sees an edge the play band never streams". And the leg the
  owner found missing, `g:-2,-1,1:-2,0,1`, is present at **every** radius 320…2000 with a 1701 m
  centerline. A grouping difference has to explain a *ribbon that was not assembled*, not just an
  edge that was absent — that step is still missing.
- **The eliminations below all stand.** They were measured, and BUG-48 does not touch any of them.

### One note discharged, one still open

The Notes' teleport suspicion has been **half answered**. The cross-mode leak it guessed at was real
and is **fixed**: a free-roam teleport set `_spawnOverride`, which outlived the mode switch, so story
entry seated the truck at the teleport point and `story.js._beginWarm` captured the region centre
**from the player instead of the seed** — the whole region, POIs included, moved. That was BUG-45's
mechanism, fixed in `2806718` and pinned by `test/world-determinism.mjs` §4.

Whether *this* capture's session was subject to it is **unknowable from the capture** — the region
centre is not recorded, only `streamCenterHistory` (which does show a ~1200 m jump at t≈66 s). Worth
knowing: the jump is well inside `REGION_RADIUS_M` (2500 m), so "the player teleported outside the
frozen region" is **ruled out** as an explanation. Teleporting *within* a frozen region remains
reachable in normal play — story mode's teleport lockout is still deliberately OFF.

## Report (owner, 2026-08-07)

Seed 0, **story mode**. At node `(-2,-1,1)` — world ≈ **(-755, -599)** — the 2D map draws a
**degree-3 junction**. In the world only **one** leg exists: the asphalt ribbon simply ends there.
Not a soft fade, not a carve seam — the road stops. The player drove in along the surviving leg.

Captures (kept in-repo because this could not be reproduced synthetically — see below):

- `.planning/bug-captures/bug-42-seed0-road-end.json` — marked AT the dead end, (-754.7, -599.4)
- `.planning/bug-captures/bug-42-seed0-surviving-leg.json` — 25 m back along the leg that exists,
  (-731.3, -578.5)

## Status: FILED, NOT DIAGNOSED

Owner's call (2026-08-07): **file it, don't work it** — it could not be reproduced on a fresh entry,
and there is not enough information to chase further without guessing. The investigation below is
recorded so the next attempt starts from the eliminations, not from scratch.

## The one anomaly in the captures

The dead-end sample resolves to `arcS` **exactly 0.000000** and `camber` **exactly 0.000000** on run
`g:-2,-1,1:-1,-1,2`. Exact zeros are a **clamp to the run's start**, not a measurement — the
projection fell off that run's arc domain and was pinned to its origin. The clamped surface sits
**5.3 m above** what a fresh headless build gives for the same point (96.79 vs 91.48), and the
session's terrain was carved to agree with the clamped value (`groundY` 96.86, 8 cm off `gradeY`).
A fresh build attributes that point to a **different** run, 2159 m along `g:-1,-3,1:-2,-1,1`.

The control capture 25 m back is entirely healthy: same run, `arcS` 25.08, `camber` -0.0338,
`minRadius` 430 m, `groundY` within 5 cm of `gradeY`. So the anomaly is local to the node.

**Working hypothesis (unproven):** the resolver clamps points beyond a run's arc domain to `arcS 0`
while the ribbon is only assembled *within* the domain — asphalt terminates while the ground still
reports a road, at the wrong height. That would make this the `_projectOntoRun` /
`_resolveRoadSurface` family (cf. "carve invisible cliff"), not routing and not the cull.

## Eliminated, each with a measurement

Run against the first capture on this branch and on `main` @ `ac53b2c` (identical output — **not**
caused by FEAT-60).

| Hypothesis | Evidence |
|---|---|
| Road-surface tear / window-invariance | `test/replay.mjs` passes: 124 on-road pts, worst ΔgradeY **0.000 m** |
| BUG-25 phantom map road (cull flips with radius) | `test/graph-cull-radius-invariance.mjs` passes on seed 0, `mapOnlyNear=0`. Site added as a permanent fixture |
| Free-roam streaming hole | Walked every map-drawn vertex to 900 m, re-streaming play (r=320) at each: **35/35** have surface |
| Frozen router over an incomplete region | Modelled the freeze (one build at region radius around spawn, then no updates): **0 of 867** map-drawn pts within 700 m lack surface |
| Warm radius short of the region | `REGION_WARM_RADIUS_M = REGION_RADIUS_M + WARM_MARGIN_M` — covers *more*. Both degraded paths (`warm failed`, `warm timed out`) enter **unfrozen** with streaming live, so an incomplete warm never freezes |
| Run registered but centerline missing (ribbon can't build) | All **6** runs within 900 m have centerlines matching their polyline to <0.1% |

## The unexplained fact worth starting from next time

The three legs at node `(-2,-1,1)` in headless builds:

| stream radius | legs |
|---|---|
| 320 (play) | `g:-2,-1,1:-2,0,1` · `g:-2,-2,0:-2,-1,1` · `g:-2,-1,1:-1,-1,2` |
| ≥640 (map) | `g:-2,-1,1:-2,0,1` · `g:-1,-3,1:-2,-1,1` · `g:-2,-1,1:-1,-1,2` |

The third leg is radius-dependent (out of band at 320, not culled — the gate confirms). But
`g:-2,-1,1:-2,0,1` is present at **every** radius 320…2000, with a 1701 m centerline, and it is
one of the legs that **did not exist in the world**. No headless build reproduces its absence.
That points at live session state — ribbon assembly, chunk bake ordering, or something that
happened during that particular entry — rather than at worldgen, which is why a place capture
cannot close it.

## What would close it

1. A capture from a **fresh story entry** to seed 0 that reproduces the dead end — establishes
   whether it is deterministic at all. (Owner could not reproduce, 2026-08-07.)
2. If it recurs, capture **while standing on the missing leg's ground**, not on the surviving leg —
   that separates "ribbon never built" from "ribbon built and evicted".
3. A ribbon-extent probe (mesh, not resolver): for each run near a mark, compare the assembled
   ribbon's arc coverage against the centerline domain. Every tool used above queries the resolver,
   so the mesh layer is still entirely unexamined — and the owner's symptom is about the mesh.

## Notes

- The first capture's `streamCenterHistory` contains large jumps (teleports). If the bug only
  follows a teleport, it is a much narrower bug than a worldgen one — worth checking first.
- Story mode's teleport lockout is deliberately held OFF (owner decision, see `src/story.js`), so
  teleporting inside a frozen region is reachable in normal play.

---

## RE-MEASURED ON THE v2 WORLD (2026-08-26) — the named mechanism is GONE; recommend demoting to a WATCH

Owner asked directly: "is this still an issue in v2? we improved connectivity."

Connectivity is not what this bug was about — BUG-48 named the mechanism as the **three RoadSystem
instances disagreeing**: the 320 m `play` stream (the road you drive) and the 1400 m `map`/`planner`
stream grouping the same ground differently. So that is what was measured, directly.

**Test** (`test/scratch-radius-ab.mjs`, rainy-day): for six degree-≥3 junctions per seed on
0/3/6/11/20/90, build the 1400 m map stream, then build a **fresh 320 m play stream centred on that
junction** — which is what the player does when they drive to one — and compare. Band truncation is
by design, so a map leg only counts as missing if its first 120 m out of the node lies inside the
play radius, i.e. the world plainly ought to have it.

| | result |
|---|---|
| junctions probed | 36 (6 seeds × 6) |
| junctions where the play stream lost a leg the map draws | **0** |
| worst deck disagreement on legs both streams registered | **0.00 m** |

Zero, and exactly zero on the surface height — the 5.3 m discrepancy this ticket recorded has no
analogue in the v2 world. That is consistent with what changed underneath: v1 grouped deg-2 chains by
the streamed band (QUAL-24's note, which was this ticket's symptom stated in the abstract), and v2
registers per graph edge with window-invariant plans. graph-topology's INVARIANCE check and
`restream-invariance` are both green.

**What this does NOT prove.** This ticket was never reproduced headlessly — the original note was
"no headless build reproduces it, so it must be live session state", and a headless probe cannot
disprove a live-session bug. The live path this test does not exercise is runtime `setRadius`
churn: teleport, recentre, and the quality-preset ring slider all change the play radius mid-session
and then stream incrementally rather than building fresh. `restream-invariance.mjs` is the gate that
covers that path and it is green.

**Recommendation (owner's call):** demote from `major` open bug to a **WATCH** — the named mechanism
is measurably absent and the covering gate is green, so there is nothing left to fix without a fresh
sighting. If it is ever seen again in a live session, the first move is to capture at the dead end and
diff the play instance against a `MISSION_PLAN_RADIUS` rebuild at the same spot, which is the test
above with real session state instead of a fresh build.

