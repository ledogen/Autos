---
id: BUG-221
type: bug
status: open
severity: major
opened: 2026-11-18
source: FEAT-293 driving-AI soak, 2026-11-18
---
lane: engine & world

# BUG-221: A truck climbing into a tunnel portal at about 37 % stops dead and cannot reverse out

## Next steps
Orchestrator: land `land/bug-221-portal-shelf` (fix + gate, proofs in the Log).

## Summary
Seed 1830183820 at (125, -42): 8.5 m/s to 0 in 1 s on a roughly 37 % climb at a tunnel portal; reversing does not free the truck. The one intervention in 40 km of AI driving.

## Description
Looks like a world or collider defect, not a driving one. A human driver would hit the same thing.

Cause, measured by the FEAT-293 close-out (2026-11-18): on run g:0,-1,0:0,0,2, 0.5 to 1.5 m before the bore starts (s 60.27), a level 1 m shelf of road mesh in tile 1,-1 stands 0.38 to 0.40 m above the 37 % deck. The tires never see it (the tire surface is the deck); only the body hits it. At (125.3, 82.2, -42.0), heading 135 deg, 8.3 m/s the belly catches the edge and is pinned: 95 kN on one tire. A human on the centreline hits it too; 2.65 m right of centre misses it. MESH == PHYSICS is broken at that shelf. Repro: `SOAK_LOG=1 node test/drive-ai-soak.mjs --seed=1830183820 --km=0.2`.

### Root cause (2026-11-18, lane agent)
Still there after BUG-216, unchanged to the centimetre. The shelf is the bore FLOOR's lip ring (`road-mesh.js`
`buildTunnelTube`). At a true mouth the tube is extruded one extra ring 1.5 m out of the hill along the end tangent, and
that ring reused the END ring's `gradeY`: it ran out LEVEL while the 37 % approach falls away under it, so the floor
(designed 0.14 m under the asphalt) stood 0.44 m above it 1.5 m out. The floor is a collider; the tires ride the
analytic deck and never see it. Fix: the lip ring's floor takes the run's profile (gradeY, camber) at s ± 1.5, so it is
the deck minus its designed drop by construction; the arch keeps the end frame (it meets the level masonry ring, and at
lat ±R it is off the road).

### Census (13 seeds: this one + 12 random, `wip/bug-221/census.mjs`)
Every road-collider vertex and triangle centroid on the lane band (|lat| ≤ 5 m, < 2 m up) vs `sampleRoadTopY`:
- Tunnel geometry (lining/floor/ring) above the deck within 30 m of a mouth: before worst 0.444 m, 38 of 296 mouths over
  2 cm (0.02–0.44 m, on 13/13 seeds); after worst −0.034 m (always under the deck), 0 mouths. Same everywhere.
- Ribbon/pads (unchanged by this fix, identical before/after): more than 25 m from a run end, worst 3.9–9 cm above
  the deck near mouths and 4.2–5.5 cm everywhere on 12 seeds (one outlier, 1.99 m on 948023748 at s 1097/1130, not
  examined); within 25 m of a run end (junction blends) up to 0.86 m. Not this bug: BUG-153's ribbon gate covers the
  run's own sections and reports the junction classes apart. Candidate for its own ticket.

## Tracker
- [x] Cause found (lip ring of the bore floor took the end ring's height)
- [x] Fix by construction (`buildTunnelTube`: lip floor on the run profile at s ± lip)
- [x] Gate: `portal-clear.mjs` checks every bore's lining/floor/ring against the deck within 30 m of a mouth (2 cm), seed 1830183820 added; main fails 10/63 bores (worst 0.444 m), branch 0
- [x] Repro drives through: 8.4–8.5 m/s at lat 0.14 m past (125, −42), no intervention

## Decisions

## Open questions

## Links
FEAT-293

## Files
src/road-mesh.js (buildTunnelTube), test/portal-clear.mjs, test/gates.mjs

## Log
- 2026-11-18 minted by the orchestrator.
- 2026-11-18 lane agent: fix 6fb376e4, gate 3a76a844. Shelf still there after BUG-216. Repro drives through
  (8.4–8.5 m/s, lat 0.14 m). fingerprint-world vs main: only `tiles` differ (5 of 6 windows; network/profiles/carve/
  surface identical); tutorial-seed green; affected gates 8/8 (serial). Census + picture: `wip/bug-221/` (sheet.jpg).
