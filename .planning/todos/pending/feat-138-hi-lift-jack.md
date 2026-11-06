---
id: FEAT-138
type: feature
status: open
severity: minor
opened: 2026-10-22
source: owner, 2026-10-22 (item setup page) — items.md §7 "Hi-lift jack" row; FEAT-121 row
lane: B (back from Spare 2026-11-06, orchestrator; queued after FEAT-162)
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
  instant the truck passes the balance point; 5 s real-time cooldown.** Lane **B → Spare** (orchestrator,
  2026-11-01; B has no session).

## Ruled (owner, 2026-10-31)

- Likelihood tier: **rare**. As a reward it is gated **A–S**.
- Input: **from the inventory menu** — select the hi-lift, then a left / right choice in a menu. No new
  buttons, no contextual press; the GUI does it.

## Acceptance

- [x] An ITEMS row (items session) and thumbnail; REWARDS, shelf price and likelihood rows.
- [x] Usable only when the truck is not on its wheels and the run is not over; the player picks left or
      right; a roll torque goes through the physics adapter seam for the set time; then the cooldown.
- [x] It sometimes fails to right the truck, from the physics, not from a dice roll.
- [x] A headless gate: a truck on its side, the jack applied, comes back onto its wheels on flat ground;
      the cooldown refuses a second use; a truck on its wheels refuses it.

## Built (Spare, 2026-11-01)

- `src/hilift.js` — pure. Roll φ about the forward axis (0 upright, +90 on its right side, ±180 roof)
  splits into four basins at the two balance angles: wheels, right side, left side, roof. A heave applies
  `10.5 N·m/kg × (mass + stowed kit)` about the forward axis and is cut the step φ leaves the basin it
  started in, or at 3 s. The 5 s cooldown is real time (`performance.now`).
- The torque goes in as `vehicleState.jackTorque`, which `stepPhysics` adds to the chassis torque it
  hands the engine — the adapter seam, nothing new in it.
- `physics.js rollBalance(params)` — the balance angles from the real collision geometry: wheels ↔ side
  on the tire's outer edge (atan(0.84 / 0.55) = 56.5°), side ↔ roof on the cab roof edge
  (180° − atan(0.78 / 0.97) = 141.2°). The ticket's estimate used a 1.15 m roof; the hull's is 0.97.
- Data: ITEMS `hiLiftJack` (13 kg tool; the thumbnail `assets/items/hiLiftJack.png` was already there),
  REWARDS A–S from the auto shop, stranded motorists and Larry (he rolls everything, 10-31), shelf
  price **$20 [DEFAULT]** (the middle of the owner's $10–30; the day tier scales it), STOCK_WEIGHT 1
  (Rarely).
- Input: the inventory's hi-lift row shows **Heave it left / Heave it right** (the truck's own left and
  right); while it can't be used the row shows why (on its wheels / catching your breath / the run is
  over). Starting a heave closes the inventory so you watch it. The inventory still opens only when
  parked — a rolled truck at rest takes the Space tap like any other.
- Gate `test/hilift.mjs` (flat ground): on its side (settles at φ 101.5°) → upright, cut at the balance
  point after **0.43 s**; cooldown, on-its-wheels and run-over refusals.
- **From the roof it took ONE press, not two.** The heave cuts at the roof balance (0.77 s), and the fall
  from there to the side releases about 5 kJ (0.4 m of CG drop × 1360 kg × g) against the 2.2 kJ the
  side → wheels climb needs, so the truck rolls on through its side onto its wheels. That is the physics,
  not a rule; the gate accepts one or two presses and prints which. A softer landing (mud, a slope) can
  stop it on the side, and then the second press does the rest.

## Owner, 2026-11-06 (feat138-press, no option tapped) — back to Lane B, queued after FEAT-162

"shelf price is good. i tried it on a flipped truck on a level road. it gets some angular momentum up but wasnt
able to get on its wheels. i propose the torque is held for longer but is scaled down when angular momentum is
high. basically \"high torque, low speed\" to try to get the flip to be more reliable."

- The $20 shelf price stands.
- The press becomes a long, gentle push: hold the torque longer, and back it off as the roll rate builds, so the
  truck walks over its tipping point instead of being flung.
- Measure the success rate before and after: from the roof and from the side, on the level and on a slope.
