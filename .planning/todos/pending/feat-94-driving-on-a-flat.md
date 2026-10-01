---
id: FEAT-94
type: feature
status: open
severity: minor
opened: 2026-09-30
source: owner, 2026-09-30 — "driving on a flat tire should moderately annihilate spring, damper and side
  durability so players are rather forced to deal with it. need a flat indicator so they dont feel like
  the sudden onset of damage is unfair. i want the tension between dropping their current mission (or
  dropping a rank) and screwing up the truck."
relates: FEAT-93 (hazard punctures), items.md §7 (patches, bike pump 2 h, compressor 30 min, spare 30 min),
  SM-3 damage model (`src/damage.js` — `flat[]`, `tireFlatRate`, `tireFlatMu`, per-corner tracks)
invariants: SM-INV-10 (no number on the HUD), SM-INV-1 (death is crash or breakdown only), SM-INV-4
  (payout continuous)
---

# FEAT-94: Driving on a flat wrecks that corner — and the player is told it's flat

## Request

Today a flat costs grip (×0.70 on that corner) and carcass stiffness (×0.05), and nothing else. Driving
on it is free. Make it expensive: **while a tire is flat and the truck is moving, that corner's
suspension and side take heavy, continuous damage.** Moderate, not instant — the player has time to
decide, but not time to finish a long job.

**The decision this creates:** stop now and fix it (30 min spare, 30 min patch + compressor, 2 h
patch + pump), which costs time against par and may drop the rank or lose the mission — **or** keep
driving to finish the job and pay for it in springs, dampers and bodywork. Both options cost something
real, in different currencies.

## What takes the damage

- **Springs and dampers** on the flat tire's axle (`springFront/Rear`, `damperFront/Rear` — these
  tracks are per axle).
- **The wheel/rim** on that corner (`wheelFL`…`wheelRR`) — ruled 2026-09-30: a rim running on a flat
  is what really gets destroyed.
- **A little side body panel** (`armorLeft` / `armorRight`) for the flapping carcass — a fraction of
  the rate above (proposed ~¼).

**Rate (owner, 2026-09-30): 4 km on a flat takes those tracks from 100% to 0.** Springs, dampers and
rim at the full rate; side armor at the fraction.

⚠ **SM-INV-5** says wear accrues on time + intensity, never distance — and "per km" is distance.
Proposed reconciliation: make the insult **superlinear in speed** (∝ v^n · dt, n ≈ 1.5–2), anchored so
**4 km at a reference speed (~50 km/h) is 100% → 0**. Then it is intensity, not odometer, and it adds
a lever: **limping slowly** costs less per km than driving on at full pace, so "crawl to the next
town" is a real third option between stopping and driving on. Owner to confirm the exponent and the
reference speed, or rule the plain per-km form as an exception to SM-INV-5.

The damage must stay a wear-track consequence, never an instant death: a written-off rim or spring can
still end in a breakdown under SM-INV-1, which is fine — that's the player's choice to keep driving.

## The flat indicator (required, ships with the damage)

The sudden damage is only fair if the player **knows** the tire is flat the moment it happens.

- **A dash warning light** — a tire-pressure symbol, lit per corner or just lit. It is a state, not a
  number, so SM-INV-10 holds.
- The **pop sound** already ships (`drainPops()` → the one-shot bang). Keep it.
- Optional, diegetic: a flapping-rubber loop while moving on a flat, and the visibly squashed wheel.

## Acceptance

- [ ] A headless gate drives 4 km on one flat tire at the reference speed and asserts that axle's
      springs and dampers and that corner's rim go 100% → ~0, and the side armor loses its fraction;
      the other corners and a parked truck lose nothing. Driving the same 4 km slower costs less.
- [ ] The flat indicator lights on the step the tire pops and clears when it's fixed (spare, patch +
      pump, patch + compressor).
- [ ] No condition percentage is shown (SM-INV-10).

## Open for the owner

- ~~What "side durability" means~~ — ruled: rim, plus a little side armor.
- ~~How far on a flat~~ — ruled: 4 km, 100% → 0.
- The SM-INV-5 reconciliation above: speed-superlinear anchored at ~50 km/h, or plain per-km.
