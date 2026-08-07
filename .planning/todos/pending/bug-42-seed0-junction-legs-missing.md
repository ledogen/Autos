---
id: BUG-42
type: bug
status: open
severity: major
opened: 2026-08-07
source: owner-report
relates: BUG-25, QUAL-24, FEAT-40
---

# BUG-42: a deg-3 junction on the map is a dead end in the world (seed 0, story mode)

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
