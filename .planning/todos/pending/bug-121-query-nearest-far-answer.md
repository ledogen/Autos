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
