---
id: BUG-121
type: bug
status: open
opened: 2026-11-07
severity: major
source: Lane A, found building BUG-118 (the tutorial GPS re-plan), reported to the orchestrator 2026-11-07
owner: Spare (road.js), after the BUG-105 loop trim lands
relates_to: BUG-118 (its smoke works around this by seating on the road), FEAT-63 (paper re-plan)
---

# BUG-121: `queryNearest` answers a far road point when the query is off every footprint

## What happens

`roadSystem.queryNearest(x, z)` answers a point up to ~160 m away when the query sits outside every road
footprint (half-width + shoulder, about 7.5 m). Inside a footprint the answer is right.

## Cause (Lane A's reading; not yet confirmed in road.js)

The D4 arm rule prefers any sample the query would be "interior" to, judged from that sample's tangent
alone. Nothing bounds how far along the road that sample is. So from about 12 m off a road, a sample
100 m up a bend whose straight continuation passes through the point beats the real nearest road.

## Evidence

- Seed 6 (test seed), `CarGame-run-shape/wip/bug118-qn.mjs`: 50 of 81 queries from POI markers answered a
  point more than 5 m farther than the POI's own road point; worst 164 m.
- The smoke hit it at the burger joint's pad: the answer was 108 m away.
- Re-measure on random seeds before and after (no default seed).

## Exposed callers

`main.js` `_resetToRoad` (the evening's R) · `paper-route.js` `roadOrigin` (FEAT-63 re-plan + BUG-118) ·
`main.js` spawn resolution (~691/723) · `poi.js:888` · `terrain.js:1458` · `camp.js` · `demolition.js`.

## Sketched fix (Lane A; not measured)

Count a sample as interior only if its distance is ≤ footprint + about 2 m (the sample spacing). Queries
inside a footprint are unchanged.

## Acceptance

- [ ] A headless probe on random seeds: every off-footprint query answers within a few metres of the true
      nearest road point (brute force over the network as the reference).
- [ ] A gate pins it (random-seed sample, reported as a sample).
- [ ] `fingerprint-world` on main vs the fix: any changed window is explained (poi.js and terrain.js read
      `queryNearest`, so POI or carve placement may move).
- [ ] BUG-118's smoke workaround (strayCheck seats on the road) can drop back to an off-road stray.

## Measured on random seeds (Spare, 2026-11-07, before any fix)

`wip/bug-121/probe.mjs`, seeds 1041979632, 2741256656, 2719853694 and 4162213362 (`wip/bug-121/seeds.txt`).
Queries step sideways off random road points, inside a 1100 m disc of a 1400 m window. Each answer is compared with
brute force: the nearest point on any run's polyline.

| offset from the road | answers > 5 m past the true nearest road | worst |
|---|---|---|
| 0, 4, 7 m (inside the 7.5 m footprint) | 0 / 627 each | +0.9 m |
| 9 m | 547 / 627 (87 %) | +189 m |
| 12 m | 557 / 627 | +186 m |
| 20 m | 551 / 627 | +178 m |
| 40 m | 512 / 627 | +156 m |

**Cause confirmed in `road.js` `queryNearest`.** The D4 interior test is `|signedLat| ≤ footprintHW`, measured
against the sample's tangent line, and that line is infinite. Nothing bounds the along-road offset. Any sample within
the 200 m search radius whose tangent line passes within 7.5 m of the query counts as interior, and an interior
sample beats the true nearest.

**Fix to build (after the BUG-105 landing):** count a sample as interior only when the along-road offset is also
within the sample spacing (about 2 m). It is one compare in the physics hot path, with no allocation. Then:
- rerun the probe: the 9–40 m rows go to 0, and the 0–7 m rows stay at 0;
- run `fingerprint-world`. Expect POI and carve moves, because `poi.js` and `terrain.js` read `queryNearest`
  off-footprint, and nearly every such query was wrong.
