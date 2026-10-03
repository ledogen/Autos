---
id: BUG-79
type: bug
status: pending
severity: minor
opened: 2026-10-02
relates: SM-3 (the damage model), QUAL-34 item A3 (where this was found)
---

# BUG-79 — alignment damage is published but never reaches the physics

## What

`src/damage.js` bends a wheel's alignment on hard impacts: `toeOffsetDeg[wheel]` and
`camberOffsetDeg[wheel]` accumulate (clamped to `alignMaxToeDeg` / `alignMaxCamberDeg`) and
`publish()` writes them onto the params as `_toeOffsetDeg` / `_camberOffsetDeg`.

Nothing reads those two arrays. `src/alignment.js` (`toeOffset`, `camberLean`) reads only the
static sheet values `params.toeFront/toeRear/camber*`. So a truck with a bent wheel still drives
dead straight. The damage HUD and the FEAT-90 damage screen both display the bend as if it acted.

Owner, 2026-10-02: "feels like it. car always drives straight."

## Fix

In `alignment.js`, add the per-wheel damage offset to the sheet value before converting:

- `toeOffset(corner, params)`: sheet toe + `params._toeOffsetDeg?.[corner] ?? 0`
- `camberLean(corner, params)`: sheet camber + `params._camberOffsetDeg?.[corner] ?? 0`

Signs: the damage offsets are already per-wheel and signed in the HUD's convention, so they must
NOT go through the left/right mirroring the sheet values do — add them after the mirror.

## Acceptance

- Headless: bend one front wheel's toe by `alignMaxToeDeg` and drive straight at 15 m/s with no
  steer input; the truck must yaw measurably (a few degrees over 100 m), the undamaged truck not.
- In game: after an impact that the damage screen shows as a bent wheel, the truck pulls to one
  side and the steering wheel has to hold against it.
- `test/tire-mu-wiring.mjs`-style gate pinning that the offsets reach `toeOffset` / `camberLean`.
