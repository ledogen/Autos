---
id: FEAT-191
type: feature
status: open
severity: minor
opened: 2026-11-08
source: owner, item setup page `turbo` card 2026-11-08 19:53Z
relates: FEAT-189 (power mods; the turbo and supercharger rows), FEAT-190 (engines), src/drivetrain.js, src/fuel.js
---
lane: B

# FEAT-191: turbo and supercharger — a simplified physical sim, one virtual turbo per engine

## Owner, verbatim (turbo card)

"no straight delay and power ramp i want exhaust flow estimated from throttle position and turbo speed. i never
got super into the engine building math but i figure you can build a simplified sim that gives us realistic turbo
response. to keep it simple for the player we should model a different virtual turbo per engine so the gains are
realtively consistent across the different powertrain options. one in game item to rule them all tho."

Boost onset ~2500 rpm and ~1 s lag: "just a guess go off enthusiast mods data on forums, etc. then build a sim of
that turbo and engine and match rough performance" / "just a guess go off the sim."

Supercharger (powermods card): "supercharged will sit about 25hp lower but have the instant torque".

## What

- **Turbo:** a shaft-speed state. Exhaust energy is estimated from airflow (rpm × displacement × throttle ×
  manifold pressure). It spins the turbine against the compressor's load and the rotor inertia. Boost is a
  function of shaft speed, capped by a wastegate. Torque scales with the manifold pressure ratio. Lag and onset
  come out of the sim; they are not authored.
- **Supercharger:** boost is a fixed fraction of engine rpm (belt-driven), so there's no lag. The belt's parasitic
  draw is why it sits ~25 hp under the turbo at the peak.
- **One item, a per-engine virtual turbo:** the I4, V6 and V8 each get a compressor/turbine sized so that a maxed
  build lands on FEAT-189's targets (275 / 350 / 425 hp).
- Fuel follows: boosted airflow raises fuel power through the FEAT-50 Willans line, and heat follows fuel (FEAT-51).
- Calibrate against published dyno / forum data for a turbocharged Duratec 2.3, a 4.0 or 3.0 V6, and a 5.0 V8.
  State the sources in the ticket.

## Acceptance

- [ ] Shaft-speed and boost state integrated in the fixed step. No per-frame diagnostics in `src/`.
- [ ] A headless gate: a WOT pull from 2000 rpm shows boost building over a time that comes out of the sim
      (state it); the supercharger shows none; maxed builds land within ±5 % of 275 / 350 / 425 hp.
- [ ] One `turbo` item in ITEMS/REWARDS; the engine picks its virtual turbo.
- [ ] Debug sliders for the turbo sizing (the calibration knobs).
