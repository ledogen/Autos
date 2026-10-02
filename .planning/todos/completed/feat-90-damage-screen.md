---
id: FEAT-90
type: feature
status: done
closed: 2026-10-01
severity: major
opened: 2026-09-29
source: owner, 2026-09-29 — "a minimal but tasteful pictogram of all the damageable vehicle parts …
  red means broken, green means fully fixed … gated behind parking … flash this icon on the left
  side of the screen when the vehicle takes damage"
relates: SM-3 (MILESTONES.md § Tooling — "Damage indicator GUI"), FEAT-34 (instrument cluster /
  diagnostic screen), FEAT-46 (the parking-brake trigger)
branch: feature/feat-90-damage-screen
---

# FEAT-90 — Player damage screen

The player-facing damage GUI: a top-down pictogram of the truck, every SM-3 track shaded by its
condition on the green → red ramp. Built in `src/damage-screen.js`. The old V-key text readout
(`damage-hud.js`) moved to the debug panel's Damage folder as "Diagnostic Readout".

## Owner rulings (2026-09-29)
- BeamNG's damage view is the gold standard, but this one is a little more iconographic. Springs
  (zigzag coil) and dampers (piston) must read differently.
- The screen is gated behind **parking**: V or a click on the icon opens it only while the parking
  brake is latched. Releasing the brake closes it.
- The left-edge icon is **translucent** at rest. A damage event (a landed impact, a puncture, or
  any part losing > 3 points in one 10 Hz sample) **flashes** it and holds it **opaque** with an
  alert card until the screen is opened. Opening it clears the alert.
- When not parked, the card shows the orange **P-in-a-circle** badge plus the key hints (Space, then
  V). That badge is now the shared "you are not parked" mark (`src/park-badge.js`), also used on the
  POI and camp "park to …" prompts.
- Hovering a part shows its name and health. The **?** toggle adds the consequence line to the same
  hover card.

## Acceptance
- [x] Every one of the 26 tracks has a hoverable glyph; paired tracks (springs, dampers, brakes)
      highlight both sides.
- [x] Flat tire draws dashed and reads FLAT; wheels show mm out of round; alignment shows camber/toe.
- [x] V while driving shows the park hint only; V while parked opens; unpark closes.
- [x] Damage flashes the icon; opening clears the alert; slow wear never flashes it.
- [x] The diagnostic readout is reachable from the debug panel, and V no longer opens it.
- [x] Owner sign-off (2026-10-01, after the second pass: P-only badge while driving, Ranger-true
      proportions, alignment as text under each wheel).

## Note
Radiator, headlights and alignment have condition tracks but no physics effect yet (SM-3 slice 3).
Their help text describes the designed consequence.

## Resolution (2026-10-01)
Shipped on `feature/feat-90-damage-screen`. Second pass per owner review: while driving the alert is
the P badge alone (30 px); stopped shows "(P) Space / V to open"; parked shows "V to open", with a
0.5/1.0 m/s hysteresis band between stopped and driving. Pictogram redrawn to the Ranger's plan
dimensions (aspect 2.7); alignment became text under each wheel; headlights share a row with the
grille, clear of the bumper.
