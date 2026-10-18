---
id: FEAT-51
type: feature
status: open
opened: 2026-07-30
severity: minor
relates_to: FEAT-49 (gauge cluster), FEAT-23 (drivetrain)
---

# FEAT-51: Coolant temperature model

## Request

A coolant temperature model so the cluster's temp gauge (FEAT-49) reads an honest warm-up and
load response. The gauge side is already wired — `GaugeCluster.setCoolantTemp(frac 0..1, C..H)`
rotates the needle; this ticket owns the thermal state.

## Scope sketch

- First-order thermal model: heat input from engine power (RPM × throttle/load proxy from the
  drivetrain), cooling from a thermostat-regulated baseline plus an airflow term (vehicle speed).
- Cold start at C, warm-up to the thermostat setpoint (needle just under mid) over a few minutes
  of driving; sustained high load (long climbs, towing-grade throttle) pushes it above mid;
  overheat into the red H band should be possible but rare — reserved for future damage/jalopy
  mechanics, no consequence wired in this ticket.
- Feed `setCoolantTemp(frac)` from the main loop.

## Acceptance

- Needle starts at C on boot, settles near mid after a warm-up period, and responds to
  sustained load; backs off when load drops.
- Deterministic given the same driving inputs.
- No damage/consequence mechanics — needle only.

## Re-scoped and built (owner, 2026-10-16) — branch `feature/overheat`

The "no consequence" scope above is superseded: the owner ruled the full radiator → overheat chain
in, with **no coolant mechanic** (radiator condition is the cooling capacity directly).

- Heat follows fuel: `stepDrivetrain` publishes `st.fuelPowerW` (pre-damage, 7 kW idle floor,
  117 kW at stock peak). **This is the seam FEAT-50 (fuel) should drain the tank from** — one signal.
- `DamageModel._stepTemp` integrates `engineTempC` through a 100 °C thermostat. Capacity linear in
  radiator condition through two anchors at 109 °C: 0% holds idle, 50% holds full load.
- Over 110 °C: torque derate 3%/°C (temporary) + engine wear 0.1%/s per °C. No gasket meter — the
  engine track at 0% is the blown gasket. Clamp 130 °C. Engine off soaks to ambient (cold mornings).
- Two clocks (owner, same day): warm-up + engine-off cooling on GAME time (cold → 100 °C in ~24 s
  real idling); overheating on REAL time (0% radiator, full load, 100 → 110 °C in ~45 s).
  `engineWarmMass` / `engineThermalMass` in data/ranger.js. Hood steam over 110 °C (src/smoke.js).
- Gauge C/mid/H = 90/100/110 °C. Debug: Damage (SM-3) → Engine Temp. Gate: `damage-engine-temp`.
- Docs re-ruled in DESIGN.md (radiator), MILESTONES.md (radiator spec), items.md (coolant jug
  struck → stop-leak, +15% radiator).

**Close when** the owner has driven it (a poked-down radiator on a long WOT climb) and is happy
with the pace.
