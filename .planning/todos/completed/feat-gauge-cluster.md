---
id: FEAT-49
type: feature
status: completed
opened: 2026-07-30
closed: 2026-08-03
severity: minor
relates_to: FEAT-50 (fuel model), FEAT-51 (coolant temp model), story mode (jalopy identity)
---

# FEAT-49: 1992 Ford Ranger gauge cluster overlay

## Resolution — SHIPPED (merged `54cc10d`), closed 2026-08-03

Every acceptance line is met on main: `src/cluster.js` (`GaugeCluster`) is constructed in
`src/main.js:1262` against the `#cluster` canvas, updated every frame (`main.js:4244-4247`) off
`vehicleState.velocity` + `drivetrain.engineRPM`, hidden while the 2D map is open
(`setVisible(!map2d.isOpen())`), and re-seeded on story entry (`main.js:3494`). The text HUD's
SPEED/GEAR/RPM lines are gone (`speedVal`/`gearVal`/`rpmVal` deleted — the wheelspin diagnostic
stays, `main.js:4149`).

The ticket sat in `pending/` with the work merged; this close is bookkeeping, not new work.

**What the close does NOT cover** — the two placeholder needles, by design (owner ruling above):
`setFuelLevel` / `setCoolantTemp` still sit at static targets until **FEAT-50** (fuel) and
**FEAT-51** (coolant temp) drive them. Both remain open in `pending/`. The odometer's per-run
re-seed is likewise interim until the run/save layer gives the jalopy a persistent identity
(SM-4 / FEAT-42).

## Request

A skeuomorphic 2D gauge cluster overlay, bottom-right of the screen, modeled on the early-90s
Ford Ranger cluster (user-supplied reference photo). The right-hand oil-pressure / battery pod
is trimmed off. Kept: temp + fuel small gauges (left), tachometer (0–6 ×1000, redline band),
speedometer (0–120 MPH with inner km/h ring), six-digit odometer. Procedurally drawn on a
canvas — no image assets. Visible in chase, hood and freecam; hidden while the 2D map (`M`)
is open; must not clash with the existing dialog panels (mission panel, POI prompt, Quick Job
button — the latter moves up above the cluster).

The cluster **replaces** the text-HUD speed/gear/RPM readout (those lines are removed; the
wheelspin diagnostic stays on the text HUD).

## Decisions (owner, 2026-07-30)

- **Fuel + temp needles are placeholders** — wired and rotatable via `setFuelLevel(frac)` /
  `setCoolantTemp(frac)`, sitting at believable static targets until the fuel model (FEAT-50)
  and coolant temp model (FEAT-51) drive them.
- **Odometer = jalopy mileage**: seeds to a random high number (80k–160k mi), accumulates real
  miles driven during the run, and re-seeds on the next run's jalopy. Interim wiring: re-seed on
  every story-mode entry. Once runs have a persistent jalopy identity (story-mode run/save
  layer), the seed must key off the jalopy and persist with the run — revisit then.

## Acceptance

- Cluster renders bottom-right in chase, hood and freecam; hides while the map is open.
- Speedo needle tracks vehicle speed (MPH), tach tracks `drivetrain.engineRPM`; needles are
  smooth (per-frame, lightly damped), not 10 Hz-steppy.
- Odometer accumulates miles and the ones digit rolls; re-seeds on story entry.
- Quick Job button no longer overlaps the cluster.
- Text HUD no longer shows SPEED/GEAR/RPM.
