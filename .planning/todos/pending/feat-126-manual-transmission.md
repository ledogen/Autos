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

## Open — ask at implementation

- **What low transmission condition does** beyond counting rejected shifts. Options: it starts
  popping out of gear, or shifts get slower. Repair price ties into the FEAT-69 re-price.
- **Which gearbox story mode seats you in.** Is the manual a part you buy or swap, or a run setting?
- **Keyboard clutch on Left Shift collides with the Shift+R (set spawn) and Shift+C (freecam)
  chords.** Holding the clutch and pressing R sets the spawn instead of resetting. Is that
  acceptable, or should the chords move?

## Acceptance

- The M5OD-R1 drives with no torque converter. Engine speed is locked to road speed through the
  engaged gear and clutch.
- With the assist on: no stall is possible, shifts need only up/down, and launches are smooth.
- With the assist off: a shift without the clutch is rejected and costs ~2 % transmission
  condition; a bog-down with the clutch engaged stalls (FEAT-109).
- R-N-1..5 sequential works, and reverse is refused at speed.
- The automatics are bit-identical (fingerprint-physics) whenever no manual is fitted.
