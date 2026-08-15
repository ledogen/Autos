---
id: BUG-48
type: bug
status: open
severity: major
opened: 2026-08-15
source: owner-report 2026-08-14 (map screenshots + in-world chevrons), capture 2026-08-15
relates: QUAL-24, FEAT-39, FEAT-16, FEAT-63, BUG-42
note: "The route and the road are resolved by DIFFERENT RoadSystem instances. Read the QUAL-24
  chain-merge note at src/mission.js:806 before touching this — it predicts exactly this failure."
---

# BUG-48: the mission route cuts corners the road doesn't have — three networks, one arc range

## Report

On a regular POI mission the blue route line on the 2D map departs from the white road and takes a
chord across it, and **the in-world GPS chevrons follow the same false path** — off the tarmac,
across the grass. Owner-reported 2026-08-14 with two screenshots; a third on 2026-08-15 shows the
worst case, a **hairpin skipped entirely**: the road makes a U and the route draws a V across it,
both ends of the V sitting correctly on the road.

Capture: `.planning/bug-captures/bug-48-seed90-route-shortcut.json` (seed 90, mark 1072.5, 1743.0).

## What is ruled OUT

- **Not renderer resolution.** The map polyline samples at 25 m (`mission.js:812`) and the GPS bakes
  independently at 6 m (`gps.js` `BAKE_DS`) — and *both* show the same cut. A 25 m chord across a
  40 m-radius bend is ~2 m of sagitta, nowhere near a skipped hairpin, and 6 m is invisible. Two
  renderers agreeing on a wrong shape means the shape they were handed is wrong.
- **Not a surface tear.** `node test/replay.mjs` §2 reports geometry and `gradeY` identical across
  two stream centres — 147 on-road points, worst grade delta 0.000 m.
- **Not the paper route.** Owner hit it on an ordinary POI job; `mission.js` and `paper-route.js`
  build segments the same way, so both are exposed.

## The evidence, and what it points at

`node test/replay.mjs .planning/bug-captures/bug-48-seed90-route-shortcut.json`:

```
(1) REPRODUCTION DIFF @ mark (1072.5, 1743.0)
      ✓ hit      game=1.0000        replay=1.0000
      ✓ runKey   game=g:1,1,1:1,3,1 replay=g:1,1,1:1,3,1
      ✗ arcS     game=1497.8293     replay=1497.8269
      ✗ gradeY   game=231.1440      replay=232.7607
      ✗ camber   game=-0.1780       replay=-0.0793
      ✗ minRadius game=79.5614      replay=195.5222
```

Same seed, same run, same arc — and **the local centerline radius is 79.6 m in the game and 195.5 m
in the replay**. That is not float drift. It is the same place resolving to two different curves,
which is precisely the shape of defect that draws a straight line across a hairpin.

**THERE ARE THREE RoadSystem INSTANCES, and they are streamed over different windows:**

| instance | radius | built by | what reads it |
|---|---|---|---|
| **play** | ~320 m band | `roadSystem` in `main.js` | physics, carve, ribbon mesh, what you drive on |
| **planner** | `MISSION_PLAN_RADIUS` = 1400 m | `missionSystem.planner()` | `planTour` / `_roll()` — **the route's `segments`** |
| **map** | its own `setRadius(R)` (`map2d.js:350`) | `map2d._road` | **the white road you see** |

The route's geometry comes from the planner; the drawn road comes from the map's copy; the road you
actually drive comes from play. All three call `edgeParData(a, b)` and get back
`{ centerline, arcOffset, arcLength }` — **an arc-span VIEW of a merged run** — and QUAL-24's note in
`src/mission.js:806` already spells out why that is not window-stable:

> *"A runKey names a run GROUPING, and a deg-2 chain merge groups by the streamed band — so a mission
> planned at MISSION_PLAN_RADIUS can name a chain the 320 m play stream never forms."*

A segment is `(centerline, s0, s1)`. If the chain merge groups differently in two windows, the same
`(s0, s1)` names a different piece of road, and every consumer that re-samples it — the map polyline,
the GPS bake, the par oracle — draws or prices geometry the player never sees. That is the
hypothesis, and the 79.6-vs-195.5 radius split is consistent with it.

**It is a hypothesis, not a diagnosis.** Nobody has yet compared the three instances directly.

## The next measurement (small, and it settles it)

Build all three RoadSystems headlessly at the seed-90 capture point — play band, planner at 1400,
map at its radius — resolve **the same abstract edge** (site pair `cellA`/`cellB`, not the runKey,
per QUAL-24) in each, and compare:

1. `arcOffset` / `arcLength` — do the three agree on where this edge sits in its run?
2. `centerline.pointAt(s)` sampled every 5 m over the shared arc range — do the three trace the same
   curve, and where does the divergence start?
3. `curvatureAt` over that range — does one of them lose the hairpin (the 195 m reading) while
   another keeps it (79.6 m)?

If (2) diverges, the fix belongs in how `edgeParData` presents a merged chain — not in the renderers.

## Acceptance

- On the captured seed and position, the route polyline, the GPS bake and the drawn road agree to
  within the map polyline's own 25 m sampling error.
- A gate that resolves one abstract edge in two DIFFERENT stream windows and asserts the sampled
  centerline is identical over the shared arc range. This is the window-invariance property the road
  system already gates for *surfaces* (`test/replay.mjs` §2) extended to *route geometry*, which is
  the thing that was never checked.
- `mission-network` and `paper-tour` stay green.

## Do not

- **Do not fix this by sampling the map polyline more finely.** It would hide the chevrons' version
  of the bug while leaving the route mispriced — par integrates the same segments.
- **Do not key anything new on `runKey`.** QUAL-24 established the abstract edge (site pair) as the
  window-stable identity; a fix that reaches for the runKey is re-introducing the cause.
