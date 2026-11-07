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

## Built 2026-11-06, Lane B — the long gentle press (feature/machine b5a4725d)

- **The press** (`src/hilift.js` step):
  - The full 10.5 N·m/kg until the roll rate in the push direction reaches half of `rollRate`. From there it
    backs off linearly to zero at `rollRate`, 0.6 rad/s (34°/s) `[DEFAULT]`. The jack only pushes; it never brakes.
  - Held up to `maxS` 8 s `[DEFAULT]` (was 3).
  - From the roof it no longer stops at the roof's balance point. It pushes on through the side and is cut when
    the truck reaches its wheels' balance point. So one press walks it roof → side → wheels (3.6 s on the level).
  - From a side it stops if it goes over onto the roof (the wrong direction).
  - $20 shelf price unchanged.
- **Measured** (`test/hilift.mjs` §3 grid: roof and side × level and ±8°/±15° cross-slopes × three settle poses ×
  both push directions; 45 trials):

  | | before (constant 14 kN·m, cut at each balance, 3 s) | after |
  |---|---|---|
  | roof, level, one press | 4/6 | **6/6** |
  | roof, slopes, one press / two | 21/24 / 24/24 | 22/24 / 24/24 |
  | side, all, one press | 15/15 | 15/15 |
  | fastest roll on the level | 5.0 rad/s | **3.0 rad/s** |

  The push itself never rolls faster than 0.6 rad/s. The remaining 3.0 is gravity finishing the fall past each
  balance point.
- **Rates tried:** with the linear back-off from zero, 0.3 rad/s fell to 7/24 on the slopes. Slower means more
  time on a sliding roof. 0.6 with full torque to half-rate is the slowest that matches or beats the old press
  on every row.
- **Flagged — the slope misses are a sliding roof, not the jack.** The body's pair friction is BUG-27b's 0.1, so
  bumpers slide off a shoulder. That is below tan 5.7°, so a truck on its roof slides down any steeper slope:
  20–480 m during a press here. Real roof metal on asphalt (μ ~0.4) would sit still on 8°. A body friction that
  depends on the contact (low for a glancing bumper, high for a resting roof) is the complete model. It's
  BUG-27b's call, not this ticket's.
- **Flagged — a pure torque at the CG is the approximation.** A real hi-lift pushes up at one point with its
  foot on the ground. That is a force, and the torque comes from its lever arm. The rate limit reproduces what
  matters (a slow, displacement-limited push); the rest is unchanged.
- **Not reproduced:** the owner's in-game miss on a level road (the old press did 6/6 within two presses on the
  bench). The new one rights every level case in one press. The owner's next try is the check.

## Rework after the owner's try (2026-11-06), and why it stays open

- **The owner's try (tracker item `feat138-press`, 2026-11-06):** "it gets some angular momentum up but wasnt able
  to get on its wheels". The owner proposed "high torque, low speed": hold the torque longer, and scale it down when
  the roll is fast.
- **Built the same day:** `c03fa062` (Lane B, landed alone by the orchestrator). The press now pushes at full torque
  until the roll rate reaches half of 0.6 rad/s, then backs off, and holds for up to 8 s. Roof → side → wheels takes
  one press. `test/hilift.mjs` gained a reliability grid: on level ground, one-press success went from 4/6 to 6/6, and
  peak roll from 5.0 to 3.0 rad/s.
- **Stays open (Spare's sweep, 2026-11-07).** Every acceptance box is met on main. What is missing is the owner's own
  try of the reworked press. The owner's last try failed, and nobody has tried the fix in game. Same rule as BUG-115:
  close on the owner's word.
