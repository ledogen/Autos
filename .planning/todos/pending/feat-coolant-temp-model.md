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
