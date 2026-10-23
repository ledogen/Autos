---
id: FEAT-138
type: feature
status: open
severity: minor
opened: 2026-10-22
source: owner, 2026-10-22 (item setup page) — items.md §7 "Hi-lift jack" row; FEAT-121 row
relates: SM-3 (recovery), SM-INV-1, FEAT-121 (item tracker), FEAT-137 (shop shelf), src/recovery.js
---

# FEAT-138: Hi-lift jack — right a rolled truck where it lies

## Why

A rollover that didn't break anything shouldn't need a tow. The hi-lift is the roadside answer to that
case: the player rights the truck themselves, live, the way Halo's vehicle flip works. It's a recovery
mechanic, so it belongs with the parts/recovery work (src/recovery.js), not in the item catalog alone.

## Ruled (owner, 2026-10-22)

- **When:** on **any roll the death check did not end**. The death check runs first (SM-INV-1); only a
  roll it lets stand is the jack's.
- **What:** it **applies a roll torque for a set time (2–5 s)** to a truck that is not on its wheels,
  in **the direction the player chooses**.
- **Live, not a timeskip:** it happens in the physics and the player watches it.
- **A cooldown** stops abuse, and **it won't flip the truck every time**. Terrain and pose can beat it.
- **The item:** a carried tool, 13 kg (a real 48″ hi-lift). Separate from the quick-jack. Sold at the
  auto shop; a reward from the auto shop and stranded motorists.

## Open (the owner's call)

- Rank gate, price, likelihood (data/stock-weights.js), and whether it's ever a roadside find.
- The torque, its duration within 2–5 s, and the cooldown length.
- Its input: which press uses it, and how the direction is chosen (controller button budget:
  the B menu or an existing contextual press before a fresh button).

## Acceptance

- [ ] An ITEMS row (items session) and thumbnail; REWARDS, shelf price and likelihood rows.
- [ ] Usable only when the truck is not on its wheels and the run is not over; the player picks left or
      right; a roll torque goes through the physics adapter seam for the set time; then the cooldown.
- [ ] It sometimes fails to right the truck, from the physics, not from a dice roll.
- [ ] A headless gate: a truck on its side, the jack applied, comes back onto its wheels on flat ground;
      the cooldown refuses a second use; a truck on its wheels refuses it.
