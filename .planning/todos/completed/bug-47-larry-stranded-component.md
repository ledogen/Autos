---
id: BUG-47
type: bug
status: closed
severity: major
opened: 2026-08-11
closed: 2026-08-27
source: measured during the FEAT-61 rung-radius pass (2026-08-11)
relates: FEAT-28, FEAT-61, BUG-42, BUG-25, QUAL-14, QUAL-19
---

> **CLOSED 2026-08-27 — measured fixed on the v2 world (`feature/corridor-router`).**
>
> This ticket's own metric, re-run: **seed 11, region centre (4500, 600), radius 2500 m —
> 16 customers placed, 16 ROUTABLE from Larry**, a 14.9 km tour. It recorded **4 of 16**.
> Two more windows check the same way: seed 11 @(0,0) 16/16, seed 90 @(0,0) 16/16.
>
> The region's road graph is now **ONE component** (81 runs, 65 km, zero condemned, zero node-pin
> violations), so there is no stranded island for Larry to be on. The FEAT-61 consequence goes with
> it: `radiusForTier` widening the ring now finds new customers, because the ring was never the
> constraint and the constraint is gone.
>
> Not fixed by one change — the v2 corridor router, BUG-57's keep-the-connection ladder, and
> BUG-56's B2/B0/C between them. `test/play-area.mjs` and `src/world-validate.js` now gate
> "one component" as a first-class assertion, so a regression here fails a gate rather than
> silently capping a paper route at four stops.


# BUG-47: the paper route saturates at four customers on seed 11 — Larry is on a stranded graph component

## The measurement

Seed 11, region centre `(4500, 600)`, live region radius 2500 m. Placement puts **16 customers** in
the region. `planTour` reaches **4 of them**. The other twelve are not "too far" and not outside the
region wall — they are **unreachable from Larry through the region-filtered graph at any radius**,
including one that sits **124 m from the region centre**.

The consequence for FEAT-61 is that rungs 2, 3 and 4 are all the same four-stop route on this seed:
`radiusForTier` widens the ring and finds nobody new, because the ring was never the constraint.
The ladder does not dead-end a run (rung 1 is fine) but it stops progressing, silently.

```
seed 11 sp15/sep10 : 16 placed,  4 ROUTABLE
    unreachable poi:6,1,1|7,0,1              617 m from centre
    unreachable house:5,1,1|6,1,1:3          903 m
    unreachable house:4,-1,1|4,0,0:35       1240 m
    …
```

## It is NOT the 2026-08-11 rung change — it is older, and that change slightly improved it

Measured both placement configurations against the same seed-11 network:

| placement | placed | routable |
|---|---|---|
| pre-change (`poiHouseSpacing 30`, `poiHouseMinSep 80`) | 16 | **3** |
| post-change (`15` / `10`) | 16 | **4** |

So the hard per-rung rings did not cause this and are not hiding it. The change merely made it
visible, because a saturating ladder is obvious where a single relaxing ring was not.

Note what the pre-change row implies: a customer **124 m from the region centre** was unroutable
under the shipped configuration too. This has been true for as long as customers have existed.

## What it almost certainly is

The known island risk, seen from a new angle. `project_reachability_window_noise` records it:
the aggressive edge cull that gives the forest-road character can strand components, the
reachability metric is window-noisy, and **detect-and-bridge was rejected** — the agreed fix is
**FEAT-28's region-gated connectivity validation**. BUG-42 is the same family (a map junction that
is a dead end in the world).

What is new here is the *severity of the exposure*. A mission planner failing to route one errand
re-rolls and nobody notices. The paper route asks the graph for fifteen reachable points around a
FIXED origin, so a stranded Larry converts a topology defect into a progression wall that a player
hits every run on that seed.

**Not diagnosed further.** Whether Larry's component is genuinely tiny, or whether the region
filter (`buildGraphAdj` + the `region.r − margin` wall) is dropping the edges that would join it,
has not been separated. Both are one measurement away and neither was in scope.

## Why it is filed and not fixed

FEAT-28 owns the fix and is unscheduled. Anything done inside FEAT-61 would be detect-and-bridge by
another name, which is explicitly rejected. The one thing worth deciding before FEAT-28 lands is
whether the paper route should *notice* — see Acceptance.

## Acceptance

Not "seed 11 supplies 15 customers" — that is FEAT-28's job, and it may legitimately conclude that
seed 11's region is small. This ticket is satisfied when:

1. **The defect is separated**: a measurement that says whether Larry's connected component is
   genuinely small in the world, or whether the region filter is stranding him. One headless script
   over a handful of seeds, reporting component sizes around the spawn.
2. **Placement stops spending customers on unreachable ground.** `buildHouses` already applies THE
   WALL (an edge with a node past the region boundary is dropped, because the tour could never
   reach it). Reachability from the spawn is the same argument one step further in, and it is the
   difference between a fifteen-house roster and a four-house one on this seed. Whether it belongs
   in placement or is FEAT-28's to guarantee is the open design question.
3. **A saturating ladder is visible rather than silent** — at minimum a console warning when a rung
   plans fewer customers than it asked for AND the ring was not the binding constraint.

## Do not

- **Do not detect-and-bridge.** Rejected design (`project_reachability_window_noise`); it fights the
  cull that gives the road network its character.
- **Do not widen `tierR` to compensate.** Measured: the ring is not the constraint here. A wider
  ring finds the same four customers and makes every other seed's route longer for nothing.
- **Do not loosen `_evaluateHouse`.** These sites passed placement. The failure is downstream, in
  routing.
