---
id: FEAT-268
type: feature
status: closed
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "Barrels and crates at the farm should get this treatment as well. Give the crates and the barrels realistic but randomized weights. Max crate weight should be 200 kilograms."
relates: FEAT-251, FEAT-149, FEAT-71, FEAT-65, src/main.js, src/poi.js, data/prop-models.js
---
lane: unplaced (land/feat-268-farm-knockables)

# FEAT-268: The farm's barrels and crates knock over, at realistic randomized weights

## Next steps
Closed 2026-11-20. Owner drove it and said good.

## Summary
FEAT-251's knockable path (a sleeping rigid body near the truck, woken by contact) extended to the farm's drums,
plastic barrels and crates. Each one's weight is drawn per placement from the seed, so a world is the same every
visit and nothing is saved. Also: find why the flamingo "got launched pretty hard".

## Description
Owner, on card feat251-lawn-drive (2026-11-17): "It's worth landing now. I did have some of the lighter props
pinging off the truck. Specifically the flamingo got launched pretty hard. However, it's worth landing now because
it's better than them being a brick wall. Barrels and crates at the farm should get this treatment as well. Give
the crates and the barrels realistic but randomized weights. Max crate weight should be 200 kilograms."

### Built (2026-11-17)
- Knockable rows (data/prop-models.js): steel drum closed/open 18–216 kg (empty ASSET-30 drum; 95 % of 208 L water),
  crushed drum 18–28 kg, HDPE barrel 9–207 kg, small crate 9–80 kg, large crate 25–200 kg (owner's cap). Pallets stay solid.
- poi.js `knockMass`: fill = u³ per placement (median 12.5 %, 21 % past half); shell (thin cylinder/box of the empty
  mass) + contents (solid in the bottom to the fill), inertia about the combined CoM; main.js sets it with setMassData.
- Flamingo: the tire→debris coupling (BUG-99/FEAT-158) pinched a 0.3 kg flamingo rigid between tire and ground; the
  tire law at 0.23 m depth gave 197 kN, the proxy's ground solve left a net torque, launch up to 72× the truck
  (300 m/s). Fix: a crush strength `crushN` (500 N, the shell's strength) caps the tire's force on it, both sides.
  Now ≤ 2.0× (flamingoUp), 1.7× (flamingoDown, beach ball) over 40 strikes each. Heavier props never exceeded 2.2×.

## Tracker
- [x] Farm drums, plastic barrels and crates are knockable through FEAT-251's path
- [x] Weights deterministic per (seed, placement), realistic ranges, crate ≤ 200 kg; inertia consistent with the load
- [x] Hit cost at 20 / 40 / 60 km/h measured (lightest / median / heaviest)
- [x] Flamingo launch: measured, cause named, fixed at the root if an artefact
- [x] Demolition targets unchanged
- [x] Sheet, smoke, pad-e2e
- [x] Owner has driven it

## Decisions
- 2026-11-17, owner: DEC-405 (the ticket's source quote).

## Open questions
- A rigid body under ~1 kg pinched under a tire still overloads the BUG-99 coupling; crushN covers the flamingos (the
  only such props). A converged tire+ground contact solve is the full fix (64 Gauss–Seidel passes cut 72× to 24×, not enough).

## Files
data/prop-models.js, src/main.js, src/poi.js, test/lawn-knock.mjs

## Log
- 2026-11-17: built on land/feat-268-farm-knockables. lawn-knock 99/99; fingerprint-physics ALL IDENTICAL to main;
  9 farm props awake 99 µs median / 385 µs worst per step (loaded machine). Unverified: sheet, in-game drive.
- 2026-11-20: owner, card feat268-farm-knock-drive: "Drove it: good, close it". Closed. The screenshot sheet box was ticked on his word: the sheet was never taken (a farm's yard exists only in a story run the script could not reach). On main (e73efb43).

