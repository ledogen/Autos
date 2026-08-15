---
id: BUG-46
type: bug
status: closed
severity: minor
opened: 2026-08-09
closed: 2026-08-09
source: owner drive — GPS on a paper round approaching a turnaround
relates: FEAT-39, FEAT-61
---

# BUG-46: GPS draws chevrons for both passes when a route drives the same road twice

## Report

> GPS takes me south towards the intersection. About 20 metres before I get to the intersection GPS
> briefly shows directions headed in both ways and then reroutes me back towards Larry's house. I
> can keep driving and it seems like it sorted itself out and wanted me to go north after all.

## What was actually happening

**The route really does turn around** — that part was the guidance telling the truth. A paper round
visits streets, and a street with a dead end is driven out and back. Measured:

| seed | tier | segments | edges re-driven | self-overlapping samples |
|---|---|---|---|---|
| 90 | 1 | 8 | 1 | 14 (closest 5.5 m) |
| 90 | 4 | 39 | 6 | 232 (closest **0.0 m**) |
| 6 | 2 | 13 | 2 | 106 (0.0 m) |
| 6 | 4 | 24 | 5 | 349 (0.0 m) |

So the round genuinely goes down and comes back, and the junction arrow at the turnaround correctly
said "turn around here" — which reads as "rerouting me back towards Larry's".

The defect is the **chevron lattice**. Chevrons are pinned to fixed world arcs `k · CHEV_SPACING`
ahead of the truck, and when the route reverses within that lookahead, the far chevrons land on the
*return* pass — which is the same tarmac the truck is on, with the glyphs pointing the other way.
Both passes drawn at once, on one road: "directions headed in both ways".

FEAT-39 was written for point-to-point missions, which never revisit a road, so this case had never
existed before FEAT-61's tour.

## Fix

`bakeRoute` now computes `route.revisit` — a per-vertex flag set when a vertex is within
`REVISIT_M` (10 m, a road width) of a vertex at least `REVISIT_ARC_M` (150 m, past any legitimate
hairpin) **earlier** along the route. A uniform grid keeps it linear; a 23 km round bakes ~3800
vertices and the pairwise form would be 14 M tests.

`_placeChevrons` skips a chevron whose sampled vertex is flagged. The first pass down a street
describes what to do now; the second is a promise about later, and later can speak for itself.

## What was investigated and found NOT to be the problem

`advanceProgress`'s full-scan fallback was the obvious suspect — on an exactly-overlapping route
both passes are equally "nearest", so it looked as though progress could flip onto the way back. It
cannot: `_scanNearest` keeps a candidate only on a **strict** improvement (`d < bd`), so an exact
tie goes to the earlier index, which is always the outbound pass. A margin guard was written,
measured against the gate, found to change nothing, and **reverted** — the note explaining why
self-overlap is already safe there stays, because it is not obvious from the code.

**Gate:** `test/gps-route.mjs` — an out-and-back route bakes to its full driven length, the way out
is flagged clean and the return pass is flagged, a route that never doubles back flags nothing (so
the suppression cannot eat an ordinary mission's chevrons), progress stays on the outbound pass and
stays monotonic, and a truck picked up far along the route still re-acquires.
