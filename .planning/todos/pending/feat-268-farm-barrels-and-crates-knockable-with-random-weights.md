---
id: FEAT-268
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "Barrels and crates at the farm should get this treatment as well. Give the crates and the barrels realistic but randomized weights. Max crate weight should be 200 kilograms."
relates: FEAT-251, FEAT-149, FEAT-71, FEAT-65, src/main.js, src/poi.js, data/prop-models.js
---
lane: unplaced (land/feat-268-farm-knockables)

# FEAT-268: The farm's barrels and crates knock over, at realistic randomized weights

## Next steps
Lane agent: build on land/feat-268-farm-knockables, then an owner drive.

## Summary
FEAT-251's knockable path (a sleeping rigid body near the truck, woken by contact) extended to the farm's drums,
plastic barrels and crates. Each one's weight is drawn per placement from the seed, so a world is the same every
visit and nothing is saved. Also: find why the flamingo "got launched pretty hard".

## Description
Owner, on card feat251-lawn-drive (2026-11-17): "It's worth landing now. I did have some of the lighter props
pinging off the truck. Specifically the flamingo got launched pretty hard. However, it's worth landing now because
it's better than them being a brick wall. Barrels and crates at the farm should get this treatment as well. Give
the crates and the barrels realistic but randomized weights. Max crate weight should be 200 kilograms."

## Tracker
- [ ] Farm drums, plastic barrels and crates are knockable through FEAT-251's path
- [ ] Weights deterministic per (seed, placement), realistic ranges, crate ≤ 200 kg; inertia consistent with the load
- [ ] Hit cost at 20 / 40 / 60 km/h measured (lightest / median / heaviest)
- [ ] Flamingo launch: measured, cause named, fixed at the root if an artefact
- [ ] Demolition targets unchanged
- [ ] Owner has driven it

## Decisions
- 2026-11-17, owner: DEC-405 (the ticket's source quote).

## Files
data/prop-models.js, src/main.js, src/poi.js, test/lawn-knock.mjs
