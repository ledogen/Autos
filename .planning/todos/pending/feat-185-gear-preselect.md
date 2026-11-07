---
id: FEAT-185
type: feature
status: open
severity: minor
opened: 2026-11-07
source: owner, 2026-11-07 tracker inbox
relates: FEAT-125 (gearbox), FEAT-126, the shift timer
---
lane: B

# FEAT-185: mash to any gear: the shift time is spent after the gear is chosen

Owner, verbatim (2026-11-07 tracker inbox): "Due to the duration that each shift takes, you can't mash buttons to get through the gears to a specific one. For example, if I want to go from 4th to neutral, I have to pace myself and click slowly. On a real age pattern, 4th and neutral is super quick and easy, and can be done in one move. My proposal is we allow the player to pre-select any gear that they want, mash through them, and the delay will just be enforced after the gear is selected. Basically you can button mash any gear that you want and the shift timer will still be enforced before the gear lands and the clutch can be released."

## Acceptance

- [ ] Presses during a shift move the TARGET gear; the shift timer runs once, from the last press, before the gear lands.
- [ ] 4th → N in one burst of presses; the gearbox gate pins it.
