---
id: BUG-230
type: bug
status: open
severity: minor
opened: 2026-11-18
source: BUG-221 census (wip/bug-221/census.mjs), 2026-11-18
relates: BUG-221, BUG-153, BUG-223, BUG-90, FEAT-10, src/road-mesh.js, src/road.js
---
lane: Engine & world

# BUG-230: Road ribbon and junction pads stand up to 0.86 m above the deck the tires use, near run ends

## Next steps
Owner call (Open questions 1): how the bank should meet at a bare degree-2 join. Then build the chosen option with a
gate on `wip/bug-230/joins.mjs`'s measure. Mint two follow-ups: the 948023748 self-crossing and `sampleRoadTopY` at pads.

## Summary
The 0.86 m was the census's reference, not the mesh. `sampleRoadTopY` is not the surface the tires ride. Against the
real tire surface (terrain `analyticHeight`, what main.js `groundH` calls), pads and run ends agree with the deck
except in hairline slivers. The one real class is the **bare degree-2 join** (two runs meeting with no connector):
there the deck itself steps, up to 0.27 m at the road edge, in both mesh and physics.

## Description
Re-census 2026-11-18 on main f97cd76e (`wip/bug-230/census2.mjs`; 13 seeds, the 12 random ones from BUG-221 plus
1830183820; tiles to 1000 m). It takes every collider SURFACE triangle that RoadPhysics keeps, its vertices and its
centroid, on the lane band (|lat| < 4.95 m, < 2 m up). Each point is compared with `analyticHeight(x, z, -, y + 0.3)`,
potholes off. A "sliver" means the deck comes back to the mesh within 0.1 m.

| class | sites | > 5 cm | > 20 cm | worst |
|---|---|---|---|---|
| ribbon mid-run | 9210 | 8 (all at lat ≥ 4.83: edge band) | 0 | 0.133 |
| ribbon ≤ 25 m of a connector end (deg-2) | 181 | 0 | 0 | 0.018 |
| ribbon ≤ 25 m of a deg-3 end | 433 | 3 (lat ≥ 4.83) | 0 | 0.153 |
| ribbon ≤ 25 m of a bare join | 74 | 0 | 0 | 0.036 |
| ribbon over another run's deck | 23 | 1 | 1 | 0.224 (bare join, below) |
| deg-2 connector strip | 46 | 4 | 0 | 0.130 |
| deg-3 pad | 71 | 1 | 0 | 0.054 |
| causeway (≤ 15 m of a stream) | 373 | 0 | 0 | 0.025 |
| bore (floor, lining, ring) | 666 | 0 | 0 | −0.067 (always under) |
| slivers, all classes | 161 | 161 | 0 | 0.150 (= clearanceMargin) |

- **The old 0.86 m**: inside a ≥ 3-leg pad, physics and the pad mesh both ride `_nodeSurfaceTop` (they agree to 0.000).
  `sampleRoadTopY` uses the free `_resolveRoadSurface`, which at a pad's tear line picks another leg. It reads up to
  0.863 m under the pad (3524018126 (25.2, 583.7): mesh 86.42, deck 86.42, `sampleRoadTopY` 85.66). Its consumers
  `_groundSampleY` (truck seat), camp.js `nearRoadInfo` and the paper drop can therefore read under a pad.
- **The 1.99 m (948023748, s 1097/1130)**: run g:1,0,2:0,1,1 crosses ITSELF. It spirals through its s 980–1063 bore,
  and its centrelines pass 0.20 m apart at s 920 (deck 139.05) and s 1103 (deck 138.13). The vertex is the upper
  stretch's ribbon, counted against the lower stretch's deck. It is real geometry: an at-grade self-crossing with decks
  0.9–2.0 m apart. A truck can drop off it or hit it. This is a routing defect, not this ticket.
- **Slivers**: a 0.15 m step in a band < 0.1 m wide at a drawn edge. Causes: a connector chord against its arc
  (co.lat 5.003), a ring against a snapped pad mouth (3.6 cm outside the ring), a leaf end (4 cm). No body or wheel
  meets them.
- **Edge band**: on curves the drawn edge sits 0.1–0.17 m outside the physics asphalt edge (the DEC-190 family).
- **Connector strip**: on 4 of 46 strips the drawn surface stands up to 0.13 m above the deck inside the strip
  (1830183820 (−393.1, 698.5), co.lat 4.56). The strip triangles are coarse over a creased field.

### Bare degree-2 joins (the real class)
`wip/bug-230/joins.mjs` walks the deck across each join along the shared tangent at lat ±2.5 and ±4.5, in 5 cm steps.
On the 13 seeds there are 12 bare joins (first-chord kink ≤ `roadJunctionKinkDeg` 9°, no connector). 5 of them step
by more than 5 cm and 2 by more than 20 cm (0.267 m, 0.232 m). The 41 connector joins step by 0.008 m at worst, except
one 124° elbow (0.146 m, the straight walk leaves the road). The mesh shares these steps. Three causes, all in `src/road.js`:
- (a) `_runEndpointJunctions` sets BUG-90's `inside` for every deg-2 kink under 60°, so `_applyJunctionBlend`'s
  `bankCrest` runs ONE leg's bank off to flat even where no connector is built. The other leg keeps its bank,
  seeded from the raw end (`_runEndCamber`). 3343754777 (406.4, 137.3): −3.42° meets 0°, step 0.267 m.
  Gating `inside` on `kink > roadJunctionKinkDeg` was tested: 0.267 → 0.028 m. But it makes (c) worse at 2832975687
  (0.062 → 0.103 m), so it was reverted (004c002d, f58b5c68).
- (b) end-end and start-start joins pass no camber seed (`_predecessorRunKey` links only head to tail), so the two banks
  are independent at the node. 3299356612 (−361.3, 667.8): 0° meets 3.01°, step 0.232 m.
- (c) at a kinked bare join, physics frames each run on its own end tangent, and the mesh frames it on the FEAT-10 weld
  bisector. The two runs' sections overlap on the inside of the kink. The deck steps by about overlap × edge grade
  (0.07–0.10 m), and the drawn ribbon sits up to 8 cm under physics.

## Tracker
- [x] Census re-run on main, by junction class, with the count of mouths over 5 cm (table above).
- [x] The 1.99 m outlier explained: a self-crossing run (948023748), real, a routing defect, not this bug.
- [ ] Each class fixed as a plain defect, or shown to the owner if a fix has a cost. Pads, run ends, causeways and
      bores need no fix. The bare-join class waits on the owner (Open questions 1).

## Decisions
- DEC-068 (pads weld), DEC-190 (2.5 cm seam bar), DEC-260 (fix by construction) govern this. None conflicts with the options.

## Open questions
1. Bare deg-2 join banking (owner). Recommended: **A**.
   A. Every bare join is a bank junction: both legs ease their bank to the MEAN of the two banks at the node, as grade
      already does (owner 2026-10-12, mean rule). The `inside` gate (a) goes with it, and physics frames on the weld
      bisector (c). C0 by construction. Banking changes within ~6 m of the 12 joins.
   B. Flatten the bank at every deg-2 join (flatCamber). Simpler, but it kills banking through joins nobody can see,
      against "a degree-2 pass-through keeps its banking/flow".
   C. `roadJunctionKinkDeg` 9 → 0, so every join gets a connector strip. More strips along the roads, which QUAL-16
      ruled out ("no pad spam").
2. Follow-up tickets to mint: the self-crossing route (948023748), and `sampleRoadTopY` reading up to 0.86 m under
   ≥ 3-leg pads (a seat or camp check made there lands under the pad).

## Links
BUG-221 (census origin), BUG-153 (ribbon frame gate), BUG-90 (bankCrest), FEAT-10 (join weld), BUG-223.

## Files
`src/road.js` (`_runEndpointJunctions`, `_applyJunctionBlend` bankCrest, `_runEndCamber`, `sampleRoadTopY`);
probes in `wip/bug-230/` (census2.mjs, joins.mjs, probe.mjs, pt.mjs, xsec.mjs, line.mjs, selfpass.mjs, runinfo.mjs).

## Log
- 2026-11-18 minted by the orchestrator from BUG-221's census.
- 2026-11-18 lane agent, branch land/bug-230-ribbon-above-deck: re-census on main f97cd76e, 13 seeds (table). The
  0.86 m came from the `sampleRoadTopY` reference. The 1.99 m is a self-crossing. The real class is bare deg-2 joins
  (5 of 12 step > 5 cm). Fix (a) was tried and reverted (f58b5c68). No src change on the branch. Waiting on the owner.
