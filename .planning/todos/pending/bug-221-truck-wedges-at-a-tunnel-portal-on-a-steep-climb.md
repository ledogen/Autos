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
Reproduce headless at the seed and spot; find what the truck hits (portal collider, deck step, lining). The FEAT-293 close-out agent is writing up the reproduction.

## Summary
Seed 1830183820 at (125, -42): 8.5 m/s to 0 in 1 s on a roughly 37 % climb at a tunnel portal; reversing does not free the truck. The one intervention in 40 km of AI driving.

## Description
Looks like a world or collider defect, not a driving one. A human driver would hit the same thing.

Cause, measured by the FEAT-293 close-out (2026-11-18): on run g:0,-1,0:0,0,2, 0.5 to 1.5 m before the bore starts (s 60.27), a level 1 m shelf of road mesh in tile 1,-1 stands 0.38 to 0.40 m above the 37 % deck. The tires never see it (the tire surface is the deck); only the body hits it. At (125.3, 82.2, -42.0), heading 135 deg, 8.3 m/s the belly catches the edge and is pinned: 95 kN on one tire. A human on the centreline hits it too; 2.65 m right of centre misses it. MESH == PHYSICS is broken at that shelf. Repro: `SOAK_LOG=1 node test/drive-ai-soak.mjs --seed=1830183820 --km=0.2`.

## Tracker
- [ ] Cause found
- [ ] Fix and a gate

## Decisions

## Open questions

## Links
FEAT-293

## Files

## Log
- 2026-11-18 minted by the orchestrator.
