---
id: BUG-44
type: bug
status: open
severity: major
opened: 2026-08-07
source: FEAT-61 Phase E2 — measured while building the tour gate
relates: FEAT-61, FEAT-60, FEAT-46
invariants: SM-INV-12
blocks: the FEAT-61 tier ladder above rung 1
---

# BUG-44: a region cannot supply 15 newspaper customers — the cliff test rejects 97% of sites

## What was measured

FEAT-61 ratified **15 newspaper customers inside a 1 km ring** (owner, 2026-08-05), with the
count hard and the radius relaxing. Measured at the **live 2500 m region radius** on the story-poi
gate's centre, with `test/paper-tour.mjs`'s harness:

| seed | viable sites in the region | routable¹ | inside 1 km | inside 1.5 km |
|---|---|---|---|---|
| 6  | 16 (7 inside the wall) | 6 | 1 | 3 |
| 11 | 26 | 11 | 3 | 3 |
| 42 | 17 | 4 | 1 | 2 |

¹ on an edge lying wholly inside `regionRadius − REGION_MARGIN`, i.e. one the tour can actually
route. See "already fixed" below.

So the shipped world offers roughly **a third of one round**, not four rungs of a ladder. The
paper route is the income floor, and above tier 1 it currently saturates: every rung plans the
same round.

## Why — it is the reject battery, not the world

Tallying `_evaluateHouse`'s rejects over all 1844 candidate sites on seed 6:

| reject | count |
|---|---|
| **target circle exceeds `poiHouseMaxDrop`** | **1787** |
| water | 9 |
| junction pad | 7 |
| tunnel | 4 |
| accepted | 37 |

`poiHouseMaxDrop` is **1.5 m of height spread across the target circle's rim**. It was authored when
`poiHouseTargetR` was 3 m; the radius went **3 → 5 m on 2026-08-07** and the rim samples moved two
metres further out, but the cap did not move with them. A 1.5 m spread over a 10 m circle is a 15%
cross-slope — tighter than most rural verges.

Sweeping the cap (all three seeds, live region radius, routable sites only):

| `poiHouseMaxDrop` | seed 6 in 1 km / region | seed 11 | seed 42 |
|---|---|---|---|
| 1.5 (shipped) | 1 / 6 | 3 / 11 | 1 / 4 |
| 2.0 | 2 / 14 | 5 / 28 | 3 / 17 |
| 2.5 | 8 / 32 | 5 / 37 | 5 / 35 |
| 3.0 | 17 / 65 | 9 / 57 | 13 / 64 |
| 4.0 | 33 / 136 | 19 / 116 | 25 / 136 |

**3.0 m is where all three seeds can supply 15 within about 1.5 km**, which is the ratified shape
(count hard, ring relaxes a little).

## The catch, and why this is a ruling and not a slider tweak

**The target ring cannot draw on ground that steep.** The ring is a cylinder curtain 1.2 m tall sunk
0.5 m (`_TARGET_RING_H` / `_TARGET_RING_SINK` in main.js), seated at one Y. A 3 m spread buries it
1.5 m on the uphill side and floats it 1.5 m on the downhill side. So raising the cap to 3.0 without
touching the ring trades "not enough customers" for "the target circle looks broken", which is
exactly what `poiHouseMaxDrop` exists to prevent.

Three ways out, and the owner picks:

1. **Raise the cap AND make the ring drape.** Cap ~3.0, and draw the target as ground-conforming
   geometry (a sampled ring or a projected decal) instead of a flat-seated cylinder. Costs a small
   renderer change; keeps 15 customers and keeps the circle honest on a hillside.
2. **Raise the cap to ~2.0–2.5 and lower the count.** ~14 / 28 / 17 sites region-wide at 2.0. A
   ladder of, say, 4 → 6 → 8 → 10 fits the world as it is drawn today. Cheapest, and it changes a
   ratified number.
3. **Site customers on flat ground only and accept a smaller ring.** Put `poiHouseTargetR` back to
   3 m, which is what the 1.5 m cap was written for. That reverses the 2026-08-07 radius change,
   which was itself a playability fix.

## Already fixed in this pass (unambiguous, needs no ruling)

`buildHouses` now rejects any site whose **edge straddles the region wall** and stops relaxing the
ring at `radius − REGION_MARGIN`. Such a customer is unroutable — the tour plans on the same
region-filtered graph the missions do, so a house on a wall-crossing edge is a person the round
silently skips forever. Three of seed 6's sixteen customers were exactly that. This is the one place
"count is hard, distance relaxes" must yield: past the wall there is no route.

## Acceptance

- A live region supplies the top rung's customer count, or the ladder is re-ratified to what it
  supplies. Measured on at least seeds 6, 11 and 42.
- The target circle reads as a circle on the ground it is sited on, at whatever cap is chosen.
- `test/paper-tour.mjs`'s supply NOTE goes quiet (it prints whenever the window saturates the
  ladder), and its `min(asked, supply)` checks tighten to `asked`.
