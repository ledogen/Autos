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

## Ruled 2026-10-24

- **Rank gate A–S, $10–30, never a roadside find** (owner, items page 10-24).
- **Cooldown 5 s real time** (owner).
- **The torque** (owner asked "how much torque does it take to flip a car on its roof and for how long"):
  the jack has to lift the centre of gravity over the pivot line; past that balance point gravity finishes
  the roll. The peak torque is `m·g·d` with `d` the horizontal distance from the pivot to the CG, and it
  falls to zero at the balance angle. For the stock Ranger (data/ranger.js: 1360 kg, cgHeight 0.55 m,
  bodyWidth 1.66 m, roof ≈ 1.7 m):
  - **Roof → side.** Pivot = the roof rail; d = 0.83 m, CG 1.15 m above the roof. Peak 11.1 kN·m,
    balance at 36°, work 3.6 kJ.
  - **Side → wheels.** Pivot = the sill / outer tire edge; d = 0.55 m, CG 0.83 m out. Peak 7.3 kN·m,
    balance at 34°, work 2.2 kJ.
  - So a constant applied torque must beat the starting value or nothing moves. **Proposal:** apply
    `10.5 N·m per kg × mass` (≈ 14 kN·m stock, 1.3× the roof case, 2× the side case) for **up to 3 s**,
    cut the instant the truck passes the balance point. With that margin the balance point arrives in
    about 1 s from the roof and 1 s from the side (I ≈ 3400 / 2000 kg·m² about the pivot), so the 2–5 s
    window is plenty; the leftover time is what makes it look like a heave rather than a flick. A truck
    lying across a slope with its roof downhill, a heavier or armoured truck, or a wheel caught on a
    rock raises `d` or `I` and is how it "sometimes fails" from the physics.
  - On its side only the second stage applies; from the roof the same press is needed twice (one per
    stage), each with its own cooldown.

- **Torque APPROVED (owner, 2026-10-24): 10.5 N·m per kg of truck mass, applied for up to 3 s, cut the
  instant the truck passes the balance point; 5 s real-time cooldown.** Ready to build in Lane B
  (`.planning/handoffs/HANDOFF-2026-10-24-consolidation-and-alpha-lanes.md`).

## Ruled (owner, 2026-10-31)

- Likelihood tier: **rare**. As a reward it is gated **A–S**.
- Input: **from the inventory menu** — select the hi-lift, then a left / right choice in a menu. No new
  buttons, no contextual press; the GUI does it.

## Acceptance

- [ ] An ITEMS row (items session) and thumbnail; REWARDS, shelf price and likelihood rows.
- [ ] Usable only when the truck is not on its wheels and the run is not over; the player picks left or
      right; a roll torque goes through the physics adapter seam for the set time; then the cooldown.
- [ ] It sometimes fails to right the truck, from the physics, not from a dice roll.
- [ ] A headless gate: a truck on its side, the jack applied, comes back onto its wheels on flat ground;
      the cooldown refuses a second use; a truck on its wheels refuses it.
