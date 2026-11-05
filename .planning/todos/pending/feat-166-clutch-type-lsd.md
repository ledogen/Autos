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

## Built — 2026-11-05 (Lane B, feature/machine 26efa8cc · add05d70)

- **Physics** (`src/drivetrain.js` splitRearAxle, rearDiffMode `'clutch'`): friction packs that hold until
  the torque across them passes their capacity, capacity = preload + ramp × |axle torque| (the side
  gears' separating force loads the packs), × the packs' condition. Below capacity the packs lock on the
  welded diff's coupling. At 0 the coupling is exactly the open diff's. Our own drivetrain; no engine
  joint.
- **Wear:** a new damage track, `diff` ("Diff clutches"), worn by the heat the packs slip,
  `diffSlipW = |couple × Δω|` (`durDiffClutch`, J). Every diff shares the slot's track, but only the
  clutch type wears it or shows it (`clutchOnly`, as the manual's transmission is `manualOnly`). Only
  the clutch mode writes the slip field, so every other truck's state is byte-identical (fingerprint
  unchanged).
- **Rebuild:** `REPAIRS.diff` plus a part flag `rebuild` is new packs, straight to 100% (not capped at
  80%), and only for the clutch type, fitted or carried. Priced pro rata on the gap like every repair.
- **Parts:** `diffClutchLSD` "Clutch-type limited-slip differential", uncommon. The old `diffLSD` is now
  the **helical** LSD (name + desc: nothing in it wears). Stock weight 1 (helical 0.25), and a mission
  reward row at A–S.
- **Gate** `test/diff-clutch.mjs` (split grip 0.35, floored to 10 m/s, a driver holding the line):

| diff | time | wheel-speed gap max |
|---|---|---|
| open | 9.70 s | 41.3 m/s |
| clutch, new | 5.88 s | 36.6 m/s |
| clutch, worn out | 9.70 s (= open, step for step) | 41.3 m/s |
| helical | 4.23 s | 4.9 m/s |
| welded | 4.23 s | 4.1 m/s |

At 0.6 grip the new packs already match the helical (3.35 s, against 4.95 open). A worn-out-tire
launch to 10 m/s slips 9.5 kJ through the packs: −0.48 % of their life.

**Owner numbers — all `[DEFAULT]` until set:**

| knob | value |
|---|---|
| price `diffClutchLSD.price` | $25 |
| rebuild, 0 → 100 %, before the day tier (`REPAIRS.diff`) | $30 / 3 h |
| pack life `durDiffClutch` | 2.0 MJ of clutch slip (≈ 210 hard one-wheel launches; a corner is ~100 W, so honest driving lasts days and burnouts minutes) |
| new-pack preload `diffClutchPreload` | 140 N·m (a real Traction-Lok breaks away at ~100–200) |
| torque ramp `diffClutchRamp` | 0.05 of the axle torque (keeps it under the helical at full first-gear torque) |

The acceptance's MILESTONES.md § Alpha row was already there.
