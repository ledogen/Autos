---
id: BUG-118
type: bug
status: open
severity: major
opened: 2026-11-06
source: owner, 2026-11-06 playtest (relayed by the orchestrator, verbatim) — "If you end up way off the path in the tutorial the GPS doesn't update and give you the right direction to go."
relates: FEAT-39 (the GPS), FEAT-63 (the paper route's re-plan), FEAT-170 (the evening leg), FEAT-147 / BUG-117 (mom's casserole)
---
lane: A (the D-pad half of the same note went to Lane B)

# BUG-118: off its line, the tutorial's GPS keeps pointing down the old one

The GPS (`gps.js`) draws a route that was planned once. It never plans again. The evening's way home is planned the
first time it is asked for, from the burger joint (`main.js _homeGuide`). The casserole's line is the job's own
route, planned from mom's. Drive well away from either, and the chevrons and the turn arrow still point along the
old line, from wherever it is nearest.

The paper route has re-planned from the truck since FEAT-63, on the owner's ruling that once you have left the
line the best guidance is the shortest way to finish from where you are (2026-08-11). The tutorial had none of it.

## Built (Lane A, 2026-11-07)

- **The tutorial's GPS follows the truck** (`main.js _tutDetourTick`, on the ~10 Hz run-HUD poll). Once the
  truck is more than 45 m from the line for 2 s, the line is re-planned from the truck's own road point to the
  same door. Those two numbers are the paper route's own trigger (`paper-route.js RR_PARAMS.offM / offS`), so one
  pair of dials covers both.
- **Both tutorial legs:** the evening's drive to mom's, and the casserole to Larry's (`_tutLeg`).
- **Guidance only.** The job's route, its par and its arrival never read the re-plan. The GPS gets a new route
  object and re-bakes on its identity, the same seam FEAT-63 uses.
- **No re-plan storm.** The next re-plan waits until the truck has moved 45 m from the last one. A truck parked off
  the tarmac does not re-plan every 2 s. A failed plan keeps the old line. That happens with the truck already on
  the door's own road, or off every road by more than 200 m.
- **Cost, measured** (`wip/bug118-probe.mjs`, seed 6 — the test seed — 2200 m region, from each of 26 POIs' road
  points to mom's door): 0.78 ms per re-plan at the median, 2.1 ms at p90, 2.5 ms worst, with warm edge caches. It
  runs synchronously on the HUD poll, at most once per 2 s. Every plan ended exactly on her road point (0.0 m). One
  start found no plan and keeps its line.
- The truck's road point as a planner stop was a private method of the paper route (`_originPoint`). It is now the
  exported `roadOrigin(road, car)`, which both use.

## Known limit: off the tarmac, the road point can be wrong

The re-plan starts at `roadSystem.queryNearest(truck)`. When the truck is **outside every road's footprint**
(half-width + shoulder, ~7.5 m), that answer can be a point far along a nearby road instead of the nearest one.
D4's arm rule (`road.js queryNearest`) prefers any sample whose footprint would contain the query if the road ran
on straight past it, and it has no bound on how far away that sample is. So from a pad ~12 m off its road, a sample
100 m up a bend whose straight continuation passes through the truck wins. On seed 6 (the test seed), 50 of 81
queries from POI markers answered a point more than 5 m farther than the POI's own road point, worst 164 m (from
`wip/bug118-qn.mjs`). The smoke hit it at the burger joint's pad: the re-planned line started 108 m from the truck.

That is a `road.js` issue with every caller exposed (the evening's R reset, the paper route's re-plan, spawn
resolution), so it is reported to the orchestrator, not fixed here. A likely fix is one bound, sketched not
measured: count a sample as interior only within the footprint plus the ~2 m sample spacing. Queries inside a
footprint would be unchanged. It needs the world fingerprint proof, because world-gen reads it too (POI placement
`poi.js:888`, terrain chunks `terrain.js:1458`, camp sites). Until then, a driver who strays OFF-road can get a line that starts up to ~160 m along the road. On a
road, which is where a driver who took a wrong turn is, the answer is exact.

## Not done

- **Ordinary jobs still show their planned route only.** The tutorial was the report. The same `_tutLine` /
  `_tutDetourTick` pair would cover any point-to-point job if the owner wants it there. A fetch is guided leg by
  leg (FEAT-102), so it would need the leg's door instead.

## Acceptance

- [x] `paper-route` + `paper-reroute` gates green on the moved helper.
- [ ] cdp-smoke `strayCheck`: in the evening and on the casserole, the truck seated on the road at a POI 150 m off
      the line gets a new GPS route within 6 s, starting within 20 m of the truck and ending within 30 m of the old
      line's end. (Story step green on 07c3c4ec; the evening's half runs in the opening step.)
- [ ] Owner: drive way off the line in the tutorial, and the GPS turns you round toward the door.
