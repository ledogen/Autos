---
id: FEAT-128
type: feature
status: open
severity: minor
opened: 2026-10-19
source: owner, 2026-10-19 — "shut off truck at camp"
relates: FEAT-33 (ignition), FEAT-118 (camp planning pause), FEAT-50 (fuel)
---

# FEAT-128: Truck shuts off at camp

## Request
Making camp should turn the engine off (`ignition.state = OFF`), so it isn't idling (sound,
fuel) through the camp screen. Restart with the key as normal.

## Acceptance
- [ ] Entering camp shuts the engine off; audio stops cleanly.
- [ ] Leaving camp leaves it off — player cranks it.
