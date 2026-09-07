---
id: BUG-59
type: bug
status: pending
severity: medium
---

# BUG-59 — junction pads sit on their floor instead of their geometry

**Reference case: FEAT-76 review plate 08 — seed 7, (-1633.6, -40.2).** The owner read that render as
"the pad doesn't form". It does form; it forms at the smallest size the ladder can produce, which
reads the same way from the air. Capturing the general case here.

## What was measured (light pass — a deep dive is owed, see below)

`_detectNodeJunctions()` builds and caches a welded pad-boundary RING per junction; `ringMaxR` is that
ring's reach from the node centre. Nominal pad extent is `roadJunctionCutback (10) + roadHalfWidth (5)
= 15 m` — that is the number `_computePadPlane` itself uses for its terrain-bias sampling disc.

Across seeds 6, 7 and 11 at a 1400 m radius, 70 junctions of degree >= 3:

```
ringMaxR    min 13.5 · p10 13.5 · median 13.8 · max 32.4 m
under 15 m  47 of 70
```

**Min, p10 and median are all essentially the same number.** That is not a distribution, it is a floor
being hit — two thirds of the network's intersections land on it. Plate 08's node is one of them: 12
ring points, `ringMaxR` 13.5 m, pad plane present.

The tightest eight span both node classes and a wide range of leg geometry:

```
13.5 m  seed 6  (-884,-487)   3 legs  narrowest 40 deg  site node
13.5 m  seed 6  (1839,-744)   3 legs  narrowest 43 deg  promoted T
13.5 m  seed 7  (-863,378)    3 legs  narrowest 43 deg  site node
13.5 m  seed 11 (-1754,-280)  3 legs  narrowest 41 deg  promoted T
13.5 m  seed 7  (-1452,-811)  3 legs  narrowest 32 deg  site node
13.5 m  seed 11 (1740,320)    3 legs  narrowest 86 deg  site node
13.5 m  seed 7  (483,812)     3 legs  narrowest 35 deg  promoted T
13.5 m  seed 11 (270,872)     4 legs  narrowest 42 deg  promoted T
```

Two things that matter for scoping:

1. **This is not FEAT-76.** Site nodes and promoted Ts floor at the same rate (26 of 45 promoted, and
   the plain site nodes are no better), and the floor value is identical for both. The T promotion
   made these junctions *visible* by turning wyes into intersections you look at; it did not create
   the sizing problem.
2. **`pad-census` is green and will stay green.** That gate asks whether every >= 3-leg junction gets
   a pad at all (BUG-56 B0 — 27 of 176 shipped a naked gap). Existence is not the question here;
   SIZE is, and nothing currently measures it.

## Why it reads wrong

A pad whose reach barely exceeds one carriageway half-width is not a plaza, it is a slightly fattened
corner. From the air the two roads appear to touch and part rather than meet at an intersection, which
is exactly the complaint plate 08 drew. The acute-throat cases are the worst of it — where two legs
leave 32-43 deg apart the gore between them wants MORE paved ground, not the minimum — but the 86 deg
case on the list says the acute angle is not the whole mechanism.

## Where to look

`_buildJunctionRing` / `buildJunctionFootprint` in `src/road.js` (search `THE LAST RUNG (BUG-56 B0)`).
The ring ladder is **weld -> circle -> hull**, and the hull rung is seeded with a half-width disc. If
most junctions are settling on that seeded disc rather than on their own leg mouths, `ringMaxR` would
pin near `roadHalfWidth` + cutback slack, which is what the numbers look like. `pad-census` already
prints which rung each pad landed on — start there, it may answer the whole question.

`roadJunctionCutback` (10 m) is the other suspect: it sets how far back each leg's mouth is cut, so it
bounds the ring directly. It has never been retuned against v2 geometry.

## Acceptance

- [ ] Name the mechanism: which ring rung the floored junctions land on, and why that rung produces a
      constant rather than a size derived from the legs
- [ ] Pad reach becomes a function of the junction's own geometry — leg count, leg widths and the
      narrowest throat — instead of a floor two thirds of the network shares
- [ ] A gate (extend `pad-census`) reports the ringMaxR distribution and fails on a floor, so this
      cannot silently come back
- [ ] Owner drives plate 08's node (seed 7, -1633.6,-40.2) and reads it as an intersection
- [ ] No regression in `junction-stitch`, `carve-mesh-smoothness` or `road-apex-sliver` — the pad ring
      is the carve region, so growing it moves real earthwork

## Not in scope

The 1.00 m deck step at plate 08 is a separate finding, recorded on FEAT-76's close-out: the two roads
part slowly there and the departure has little room. A bigger pad may hide it; it will not fix it.
