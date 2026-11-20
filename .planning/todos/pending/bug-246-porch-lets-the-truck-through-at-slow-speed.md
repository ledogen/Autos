---
id: BUG-246
type: bug
status: open
severity: major
opened: 2026-11-20
source: owner, 2026-11-20 — "I like the assets, I like the targets, the physics is working great, overall great work. Collisions with the vehicle work mostly. Usually crashing into a porch stops the truck, but occasionally it also lets the truck through. And then the truck crashes into the house, but is clipping through the porch. This only happened at slow speed for me, specifically on the third house on the scenarios paper route. And land what you have because it's much better than bare circles."
relates: FEAT-295, BUG-185, src/poi.js, src/world-contacts.js, src/terrain-physics.js
---
lane: unplaced

# BUG-246: A route house's porch lets the truck through at slow speed

## Next steps
Owner: drive into the porches on `land/route-houses-2` (owed card route-houses-2-drive) and say land it or change it.

## Summary
The front tires rolled through the low porch floors of the route houses and the truck crept on until the house wall
stopped it. The tires are the analytic wheel query, and it did not list the route houses: only the engine body did.
Fixed by adding the route houses to the wheel query (PoiSystem.queryContact), next to the markers and their yards.

## Description
### Cause (reproduced headless, `test/porch-strike.mjs`)
- The porch floors stand 0.40 m (ranchDeck), 0.50 m (cottagePorch) and 0.72 m (cabinLanding). The bumper blade's
  bottom edge is 0.49 m up, the slab's undercarriage ~0.37 m, the axle 0.37 m.
- FEAT-295 built the house boxes as engine colliders (main.js `_syncPoiPhysics` → PoiPhysics), so the chassis hull
  met them. The wheels are not engine bodies: they read `world-contacts.js` makeQueryContacts, whose POI part is
  `PoiSystem.queryContact`: markers and their yard solids, NOT the route houses.
- So on the 0.40 m deck and the 0.50 m porch the blade passes over (or just clips) the floor, the approach chamfer
  slides the body 1–8 cm up onto it, and the front tires roll through the box. Measured on main: tires 1.37–1.74 m
  into the porch at every speed 0.5–8 m/s, square and ±30°: across the whole floor, stopped by the house wall.
  30 of 45 strikes fail. The 0.72 m landing stands above the blade, so the blade stopped the truck there every time:
  that is the "usually stops".
- Not (b) late colliders (they are up before the model streams), not (c) filter groups (GROUP_STATIC meets the
  chassis), not (d) sleep/tunnelling (the chassis never sleeps, `bullet: true`).
- Other low solids: none with the same hole. Props (trunks, rocks) are mirrored by `queryProps` reading the same
  collidables grid PropPhysics builds; POI markers and yard solids by `queryContact`; debris (crates, pallets) by
  the engine debris sphere; roads by the analytic surface. The route houses were the one engine-only static solid.

### Fix
`PoiSystem.queryContact` walks `_routeHouses` after the markers (same `_boxesContact`, same oriented boxes).
Every porch is now taller than the 0.368 m wheel radius, so a tire meets its face and stops: 2–5 cm pressed in at a
crawl, 21–25 cm at 8 m/s (past the 15 cm soft band, the rim meets the step, as on a 40 cm kerb at 18 mph). With the
throttle held at 30° the truck scrapes along the face. `fingerprint-physics` identical to main (no POI in it).

## Tracker
- [x] Reproduced headless: the wheels pass through the 0.40 / 0.50 m porches at 0.5–8 m/s (30/45 fail on main)
- [x] Root cause named with evidence: route houses missing from the wheel query
- [x] Fix in the shared path (PoiSystem.queryContact); `test/porch-strike.mjs` passes 45/45, registered fast gate
- [ ] Owner drive on the branch

## Files
`src/poi.js` · `test/porch-strike.mjs` · `test/gates.mjs`

## Log
- 2026-11-20: 5ae0ff54 fix + gate (main 30/45 FAIL, branch 45/45). fingerprint-physics ALL IDENTICAL to main 38e9bc50.
- 2026-11-20: proofs: affected gates 47/47 green (run-all --serial), cdp-smoke PASS 42 steps (one CDP socket flake in "runlog" on the first run, green on retry). Branch land/route-houses-2, served at http://m4air:8127. Not verified: an owner drive.
