---
id: FEAT-128
type: feature
status: done
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
- [x] Entering camp shuts the engine off; audio stops cleanly.
- [x] Leaving camp leaves it off — player cranks it.

## Resolution (2026-10-24)
`_makeCamp` (src/main.js) resets `vehicleState.ignition = makeIgnitionState(IGN_OFF)` inside the camp
fade. The drone is already gated on `state === 'running'` and fuel only drains while running, so both
stop with no audio change; break camp (`_closeCampUi`) never touches the ignition, so the truck stays
off and the FEAT-33 throttle hint prompts "hold I". Truck-sleep and mom's still go off only at sleep
(the existing `_sleepAtCamp` reset). In-game listen not yet done.
