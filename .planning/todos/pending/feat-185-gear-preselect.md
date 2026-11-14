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

## Built (Lane B, 2026-11-08, feature/machine c8b32b65)

- `src/drivetrain.js` stepManual: a press during a shift steps the shift's TARGET on from the gear already chosen and
  restarts the shift time. So the time runs once, after the last press. The checks are unchanged and apply to each
  press: with the clutch in, a press is rejected (missShift); R only from N, and refused while moving; the gate's
  ends hold.
- `src/clutch-assist.js`: the assistant forwards a press during a shift too (its clutch is already open). Before,
  it dropped those presses.
- `test/manual-gearbox.mjs` §14: four presses from 4th land N after one shift time, measured from the last press
  (0.317 s = 0.25 s + 3 steps); through the assistant, two quick presses take 2nd → 4th; mashing past 5th stays in
  5th; mashing down from 1st while rolling stops at N.
- The gear readout still shows N until the gear lands (FEAT-126's rule), so it does not show the chosen target
  mid-shift. Say if it should.
