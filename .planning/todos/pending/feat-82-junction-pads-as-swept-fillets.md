---
id: FEAT-82
type: feature
status: pending
severity: high
---

# FEAT-82 — junction pads as swept fillet surfaces, not a plane painted on the terrain

**Owner, 2026-09-08:** junction pads "1. don't look great (when they are circular in shape, convex.
I would prefer fillets) 2. resemble the road surface being 'painted onto' the terrain whereas the
incoming roads are smooth swept curves. It often feels like you drop 50 cm off the road into the
intersection and then have to climb back out … a combination of insufficient earthwork (but needs
to be nuanced) and us building the pad from the terrain instead of a separate swept curve between
each road drop-off. Make intersections smooth, continuous and driveable."

## Where it stands

- The vertical half is on the UNMERGED `feature/junction-stitch` branch (deck hold, per-leg pad
  reach BUG-59, BUG-61): a leg rides the pad plane until its pavement has parted from its sibling's.
  Ruling: bring that in FIRST; this ticket stacks on it.
- The pad ring ladder is weld → circle → hull (`_junctionRingWeld` / `_junctionRingLegacy`). The
  convex circle the owner dislikes is the fallback, firing on ~22 of ~200 nodes where the mouths are
  so close the weld self-intersects.
- The pad SURFACE is a plane fitted to the terrain neighbourhood (`_junctionPadPlane`), grade-capped
  at `roadJunctionPadMaxGrade` 0.07, with the leg decks blended onto it. The legs are swept ribbons;
  the pad is not.

## Direction (QUAL-11's plan, now ruled)

Between each pair of adjacent legs, join the leg EDGES with a tangent fillet arc (the deg-2
connector already does this for two legs, `_buildDeg2Ribbon`); the pad surface is then swept /
lofted between the leg cross-sections and those fillets so its height is a continuation of the
incoming decks, and the terrain is carved to THAT surface. The plane becomes a fallback, not the
definition.

## Built (branch `feature/driving-feel`, 2026-09-08, on top of the junction-stitch merge)

Measured first (`test/.scratch/blend-sources.mjs`, seeds 6/7): at 6 of 15 three-leg nodes every leg
agreed with its siblings at the node and every one was bent by exactly **3.00 m** — the
`roadJunctionPadTerrainBias` cap — onto a plane the terrain median had pulled off the roads. That IS
"the pad built from the terrain". After the junction-stitch merge (deck hold) the ride probe got
WORSE at mouths (airborne at par 6 → 33 m per 54 km): the hold replaced the hump with a kink where
the leg leaves the plane, sized by a grade limit only.

1. **`roadJunctionPadTerrainBias` 3.0 → 0.** Every leg's endpoint offset at site nodes is now 0.00;
   the pad plane passes through the roads' shared node height and the terrain is carved to it.
2. **Curvature-bounded hold recovery** (`_recoverFromHold`, road.js): past the deck hold the handoff
   to the leg's own profile is a vertical curve satisfying the FEAT-81 crest/sag rule at the
   junction-approach design speed (brake-limited outward from par's junction corner speed, under the
   run's curvature envelope and the 28 m/s cap), via the shared `projectProfile` engine; the free
   window widens ×1.5 until the curve fits (≤ 45 % of the run). Samples inside the hold (the pad
   plane / trunk surface) and beyond the window are pinned.
3. Convex circle pads: after the merge the ring ladder lands on weld 208 / circle 1 / hull 1 of 210
   real junctions (pad-census) — BUG-59's per-leg pad reach did that; nothing further built here.

| 54 km, 4 seeds, at par speed | merge only | + bias 0 + curved recovery |
|---|---|---|
| airborne (lift ≥ 1 g) | 33 m | **0 m** |
| worst lift | 1.70 g | 0.87 g |
| lift p99.9 at 1.25× par | 1.37 g | 0.85 g |

**Residuals:** the junction-stitch gate reports 5 unstitched stretches vs the snapshot's 4 — the new
row is seed 20 (950,403): an 8 cm edge step between two still-overlapping legs 16 m out, where the
two recoveries differ. Promoted-T sides held on a BANKED trunk climb the superelevation for the
hold length (seed 6 (-926,-501): +3 m over 11 m) — the trunk keeps its banking by ruling
("Trunk unchanged at a T"); the recovery now bends that down within the rule, but the hump remains.

## Acceptance

- [x] no circle-fallback pads in the seed 6/7/11 battery; every ring is fillet-bounded (1 circle, 1 hull of 210).
- [~] `junction-stitch` gate: 5 residual rows (4 inherited); the 3 m "drop in and climb out" is gone.
- [ ] pad mesh == pad physics (the pad-census / carve-mesh-smoothness gates stay green).
- [ ] owner drive-through at speed: no bump entering or leaving a junction.
