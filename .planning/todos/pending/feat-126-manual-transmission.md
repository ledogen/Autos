---
id: FEAT-126
type: feature
status: open
severity: minor
opened: 2026-10-19
relates: FEAT-125 (controller — the pad layout this binds into), FEAT-124 (shift schedule — the
  automatic's side), FEAT-109 (engine stall — waits on THIS), FEAT-41 (settings page — hosts the clutch
  assistant toggle), feat-vehicle-drivetrain-architecture ("automatic / manual (with clutch)"), SM-3
  damage (src/damage.js TRACKS)
---

# FEAT-126: Manual transmission — real gearbox, binary clutch, clutch assistant

## Request

Owner, 2026-10-19. Add a **real manual gearbox**, not a manual-select mode on the automatic: no
torque converter, so a clutch couples the engine to the wheels. The period-correct box is the 2002
Ranger's **M5OD-R1 5-speed**, added as a `data/transmissions.js` entry and swapped like the
4R44E/5R55E are today.

## Rulings (owner, 2026-10-19)

- **The clutch is binary.** A standard pad's LB is a button, so smooth clutch-slip launches by hand
  are not possible. Held = disengaged, released = engaged.
- **Clutch assistant**, BeamNG-style, a toggle on the settings page (FEAT-41 Controls & Assists),
  **ON by default**:
  - It pulls the clutch in near idle, so the engine **cannot stall**.
  - It works the clutch for every shift, so the player only presses up/down.
  - It slips the clutch for launches (the smooth start a binary button can't give).
- **Assist OFF:** the player works the clutch. Dropping engine speed below idle with the clutch
  engaged stalls the engine; that is FEAT-109's bog-down stall, which was waiting on this ticket.
- **Clutch wear is not modelled.** A binary clutch has no slip the player controls, so there is
  no honest way to hurt it.
- **Transmission damage component**, for manual-gearbox trucks only, shown in the damage menu
  (`src/damage.js` TRACKS + `src/damage-screen.js`):
  - **A shift without the clutch is REJECTED**: the gear does not change.
  - It costs **~2 % transmission condition** (owner's figure, tunable).
  - The clutch assistant does the clutch for you, so with it on this never happens.
- **Sequential gate R-N-1-2-3-4-5.** A downshift from 1st goes to N, then R. Reverse is refused
  above walking pace. The automatic's "hold brake at a standstill to reverse" does not apply in a
  manual: brake is just brake.
- **Controls:**

  | Action | Pad | Keyboard |
  |---|---|---|
  | Clutch (hold) | LB | Left Shift |
  | Upshift | A | E |
  | Downshift | X | Q |

  The handbrake moves to **RB** on the pad (the Forza layout), and Space stays the handbrake on the
  keyboard. In the **automatic**, A/X and Q/E do nothing. The full pad layout lives in FEAT-125.

## Answered (owner, 2026-10-19)

- **A worn transmission shifts SLOWER.** Shift time stretches as condition falls, the way a worn
  synchro takes longer to match speeds.
  - It does NOT pop out of gear. With sequential up/down buttons the player has no good way to find
    the right gear again.
  - Repair price joins the FEAT-69 re-price.
- **Story mode stays automatic. The manual is a RUN SETTING** (picked at run start or in settings),
  not an economy part.
- **The Shift+R / Shift+C chords stay.** They are dev and free-roam tools; holding the clutch and
  pressing R simply sets the spawn.

## Architecture ruling (owner, 2026-10-19, plan review)

- **The clutch is ANALOG in the sim.** The drivetrain reads one engagement value,
  `vehicleState.clutch` ∈ [0,1]. Today's pad and keyboard command it binarily, and a future analog
  clutch axis maps straight onto it.
- **The clutch assistant stands BETWEEN the input and the sim.** It is a pure layer,
  `src/clutch-assist.js`, that turns the raw pedal and shift requests into the clutch command the sim
  sees. The sim knows nothing about the assist.
- The approved plan is in this session's plan file. It is summarised in the handoff once built.

## Acceptance

- The M5OD-R1 drives with no torque converter. Engine speed is locked to road speed through the
  engaged gear and clutch.
- With the assist on: no stall is possible, shifts need only up/down, and launches are smooth.
- With the assist off: a shift without the clutch is rejected and costs ~2 % transmission
  condition; a bog-down with the clutch engaged stalls (FEAT-109).
- R-N-1..5 sequential works, and reverse is refused at speed.
- The automatics are bit-identical (fingerprint-physics) whenever no manual is fitted.

## Build state (2026-10-19, `feature/feat-125-controller`)

SHIPPED, in four commits. The sim and the controls are complete.

**The sim** (`src/drivetrain.js` `stepManual`, branched only for `transmissionType: 'manual'`):
- The automatic path is fingerprint-identical.
- The M5OD-R1 is 3.72 / 2.20 / 1.50 / 1.00 / 0.79, R 3.40, per The Ranger Station / f150hub.
- **Analog clutch** `vehicleState.clutch`. Slip passes clutch × `clutchMaxTorque` (450 N·m) and
  integrates the flywheel (`engineInertia`: V6 0.18, I4 0.12 kg·m²).
- **Lock** couples the engine's reflected inertia, `Je·(gear·FD)²`, into the rear wheels through
  `params._drivenInertia` in `src/physics.js`. Without it a locked engine followed every tire jolt of
  a 1.22 kg·m² wheel and stalled on launches.
- **Stall** below `stallRPM` (450 / 500) with the clutch biting.
- **Engine braking** comes from the fuel model's own losses (`engineDragNm`), faded out over the first
  10 % of pedal. About 1.0 m/s² lifting in 3rd at 45 mph, against 0.34 clutch-out.
- **Idle governor** is additive to the throttle, which also catches a lugging launch.
- **S is always the brake** in a manual.

**Clutch assistant** `src/clutch-assist.js`:
- OFF: pass-through.
- ON:
  - centrifugal-style engagement off engine speed (`assistEngageRPM`, `assistLaunchRPM`,
    `assistLaunchThrottleRPM`);
  - opens the clutch for a shift and re-engages at `assistReengageRate`;
  - the pedal always wins.

**Controls:** keyboard Shift / E / Q; pad LB / A / X.

**Damage:** a `transmission` track, `manualOnly`. 2 % per forced shift; `_transShiftScale` runs
through a knee (0.5 → 1.2×, 0 → 3×). The damage screen lists the track only while a manual is fitted.

**Cluster:** a gear readout in the tach face. Manual R / N / 1–5; automatic D + gear / R.

**Debug:** Transmission selector + "Manual gearbox (FEAT-126)" folder.

**Gates:** `test/manual-gearbox.mjs` (sim layer with the clutch driven directly, assistant layer,
damage model); `test/pad-e2e.mjs` +4 manual checks in the real app.

**Still owed:**
- The **run-setting UI.** Gearbox auto/manual and the clutch assistant on the Controls & Assists page
  (FEAT-41). Until then the manual is reachable only through the debug swap.
- **Owner play-test** on both pads, with the assist on and off.
- Follow-ups not built: a gear-grind sound on a rejected shift (FEAT-120 list), rev-match assist.
