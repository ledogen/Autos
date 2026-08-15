---
id: BUG-44
type: bug
status: closed
severity: major
opened: 2026-08-07
closed: 2026-08-07
source: FEAT-61 Phase E2 — measured while building the tour gate
relates: FEAT-61, FEAT-60, FEAT-46
invariants: SM-INV-12
---

# BUG-44: a region cannot supply 15 newspaper customers — the candidate walk was too coarse

## RESOLUTION (owner-directed, 2026-08-07)

**`poiHouseSpacing` 90 m → 30 m.** Nothing else. The cliff cap, the target radius and the ring
geometry are all untouched, so none of the three trades proposed at the bottom of this ticket had
to be taken.

The owner's question was *"can we just use the same scaffolding we use for generic POIs — a pool of
>15 candidates, then populate only 15?"* That **is** what `buildHouses` does; the bug was that the
pool held 4–13, so the selection had nothing to select from. The pool was starved by one number:
`poiHouseSpacing` was documented as *"a house every ~90 m reads as a rural road, not a terrace"* —
conflating **how often the walk LOOKS** with **how far apart houses END UP**. The latter is
`poiHouseMinSep` (80 m) and always was. So the walk sampled six times too coarsely to find the flat
spots that do exist, and paid for it in customers.

Measured at the live 2500 m region radius, routable sites only:

| candidate step | seed 6 | seed 11 | seed 42 | closest chosen pair | ring settles at |
|---|---|---|---|---|---|
| 90 m (shipped) | 6/15 | 11/15 | 4/15 | 192–498 m | never fills |
| 45 m | 15/15 | 15/15 | 15/15 | **16 m** (minSep halved) | 1250–1750 m |
| **30 m** | **15/15** | **15/15** | **15/15** | **99–197 m** | **1250 m** |

30 m rather than 45 because at 45 the ring still cannot fill 15 at an 80 m separation on seed 6, so
`_pickSpread` halves the floor and puts two customers 16 m apart — the terrace the parameter exists
to prevent. At 30 m the 80 m floor is never reached at all.

Cost: `buildHouses` goes 35–42 ms → ~110 ms, once per region, behind the loading screen, against a
~15 s cold load. Free.

**Also fixed, and it needed no ruling:** `buildHouses` no longer sites a customer on an edge that
**straddles the region wall**, and the ring relax stops at `radius − REGION_MARGIN`. The tour plans
on the same region-filtered graph the missions do, so such a customer is unroutable — the round
would skip them silently, forever. Three of seed 6's sixteen were exactly that. This is the one
place "count is hard, distance relaxes" must yield: past the wall there is no route.

**Verified:** `test/paper-tour.mjs` now plans the full ladder — 4 customers / 2.61 km / par 2:32 at
tier 1, up to 15 / 23.0 km / par 23:49 at tier 4. `npm run test:all` green.

**Left open as balance rather than a bug** (folded into FEAT-61's open questions): a 23 km top-tier
round is 24 minutes of driving before the 1.2× deadline. That may be the right size for a full paper
round or it may not — a play judgement, and nobody has driven it.

---

## Original report — what was measured

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

> **Read with the resolution above.** This diagnosis is correct — the battery really does reject
> 97% of what it is shown — but it drew the wrong conclusion from it. The lever was not "reject
> less", it was **show it more**: a severe filter over a sparse sample yields nothing, and the same
> filter over a dense sample yields plenty. The three trades below were all avoided.

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

Three ways out, and the owner picks — **none of these was taken; see the resolution at the top**:

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
