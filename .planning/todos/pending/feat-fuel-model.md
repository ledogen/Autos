---
id: FEAT-50
type: feature
status: open
opened: 2026-07-30
severity: minor
relates_to: FEAT-49 (gauge cluster), FEAT-23 (drivetrain), story mode (DESIGN.md — run economy)
---

# FEAT-50: Fuel consumption model

## Request

A real fuel model so the cluster's fuel gauge (FEAT-49) reads an honest level. The gauge side is
already wired — `GaugeCluster.setFuelLevel(frac 0..1)` rotates the needle; this ticket owns the
tank state and burn rate.

## Scope sketch

- Tank state on the vehicle (gallons; 2002 Ranger ≈ 16.5 gal — pick the sim truck's real spec).
- Burn rate driven by the drivetrain: a function of engine RPM and throttle/load (idle burn when
  stopped, rising with power output). Simple two-term model is fine; it must feel plausible, not
  be a BSFC map.
- Feed `setFuelLevel(tank / capacity)` from the main loop.
- Story-mode hooks are a separate concern: DESIGN.md invariants govern whether running dry ends
  a run, whether fuel is purchasable, and how it interacts with the run economy — read
  `.planning/story-mode/DESIGN.md` before wiring any consequence beyond the needle. Free roam:
  a debug refill (or no-consequence floor) is acceptable initially.

## Acceptance

- Needle falls over time in proportion to driving intensity; idling burns visibly slower than
  full-throttle climbs.
- Deterministic given the same driving inputs (no RNG in the burn).
- No story-mode consequence wired without checking DESIGN.md invariants first.
