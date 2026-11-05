---
id: FEAT-166
type: feature
status: open
severity: major
opened: 2026-11-04
source: owner, 2026-11-04 (page inbox) — "We should roadmap this for before the alpha release. I'd like to implement clutch style limited slip differentials This would be seen as an inferior option to the helical style limited sub differential Which would mimic the one that we currently have in game The clutch style ones would simulate the traction lock factory limited sub differentials that were found in the ford ranger They would wear out over time making them a temporary upgrade rather than a permanent one The worn out clutch type LSD would revert to an open diff when fully worn This way we can dangle a carat between open diff and helical LSD giving us a better progression ladder. You would also be able to pay a lot of money to rebuild the clutch type LSD, making it a cash drain that you could trade for performance."
relates: data/parts.js diffOpen / diffLSD / diffWelded, the rear-diff model in physics.js (rearDiffMode), the wear calibration (MILESTONES.md SM-3), feat-vehicle-drivetrain-architecture
---
lane: B

# FEAT-166: the clutch-type LSD, a step between open and helical that wears out

**Alpha** (owner, 2026-11-04: before the alpha release).

## What

A new rear-diff part: a **clutch-pack LSD**, modelled on the Ford Ranger's factory Traction-Lok. Today's
`diffLSD` is the helical (Torsen-style) one and stays the top step.

- **Physics:** the clutch pack transfers torque by friction, so the locking torque is a preload plus a
  term that rises with input torque. It is not a torque-bias ratio like the helical. Its locking capacity
  falls as the clutches wear.
- **Wear:** the pack wears with slip across it (energy dissipated in the clutches). Fully worn = it
  behaves exactly like the open diff.
- **Rebuild:** a shop service restores it to new, at a high price (a cash drain the player trades for
  performance).
- **Ladder:** open → clutch LSD (temporary) → helical LSD (permanent).

## Acceptance

- [ ] `diffClutchLSD` part row; its physics in the existing diff model behind the adapter rules (our
      drivetrain, no engine joint).
- [ ] Wear on the diff track; at full wear the headless split-grip launch equals the open diff's within
      noise; at zero wear it sits between open and helical.
- [ ] Rebuild service at the shop.
- [ ] Owner numbers, marked `[DEFAULT]` until set: price, rebuild price, wear life (km or MJ of clutch
      slip), new-pack preload.
- [ ] A row in MILESTONES.md § Alpha.
