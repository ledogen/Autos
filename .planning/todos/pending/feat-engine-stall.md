---
id: FEAT-70
type: feature
status: open
opened: 2026-08-22
severity: minor
source: user-request
relates_to: FEAT-33 (ignition + starter — the state machine this extends), manual transmission (not yet ticketed), FEAT-26 + SM milestone 3 (wear/condition)
note: "The engine can die on its own — bog it down, or break it — and you have to restart on the
roll. Deliberately DEFERRED at FEAT-33's implementation (owner, 2026-08-22): stalling is a
manual-transmission mechanic, and with an automatic + torque converter there is nothing honest to
stall against. Open this when the manual gearbox exists."
---

# FEAT-70: Engine stall — the truck dies on its own

## Context

FEAT-33 shipped the ignition and starter, but OFF is *only* ever the player turning the key. The
owner ruled at implementation (2026-08-22): **no stall until the manual transmission is added.**

That ruling is a design call, not a scoping compromise. Today's drivetrain is an automatic behind a
torque converter (FEAT-23), and a converter is precisely the component that makes stalling
impossible — it slips instead of stopping the engine, which is why `converterStallRPM` is a *held
speed*, not a death. Adding a stall to an automatic would mean inventing a failure the machine
doesn't have. With a manual gearbox and a clutch there is a real one: let the revs fall below idle
with the clutch out and the engine dies, exactly as it should.

## Desired behaviour (sketch — re-spec at planning)

- **Bog-down stall (needs the manual gearbox):** engine speed dragged below a stall threshold with
  the clutch engaged kills the engine → `ignition.state = OFF`, and you restart with the key.
  Restarting on the roll must work, since that is the recovery.
- **Breakdown stall (needs the wear model):** a condition-driven failure that cuts the engine
  mid-drive. SM-INV-1 lists breakdown as one of the two deaths, so this is the mechanic that makes
  the phrase literal rather than decorative.
- **The state machine already supports both.** `stepIgnition` (src/ignition.js) only ever moves
  RUNNING → OFF on the key today; a stall is one more transition into the same OFF state, and every
  consumer — drivetrain gating, the cluster key springing back to 10 o'clock, the audio shutoff —
  already handles it. Nothing here needs re-plumbing, only a trigger.

## Why it is not free

- **It has to be forgiving before it is realistic.** A stall that fires while you are threading a
  loaded truck down a grade is a death sentence you did not read coming. Needs a warning band (revs
  sagging, the engine audibly labouring) before the cut, and a restart that is quick when the engine
  is healthy.
- **It interacts with the doze (SM-INV-1).** Inputs drop during a doze; they never invert. A doze
  that bogs the engine to a stall would turn a warning into a punishment, which the day-clock design
  explicitly rejects. Decide the interaction before building.

## Acceptance

- (Draft — re-derive at planning, after the manual transmission lands.) The engine can enter OFF
  without a keypress; the player is warned before it happens; restarting mid-roll works; and the
  doze can never be the proximate cause of a stall.

## Related

- FEAT-33 ignition + starter, `.planning/todos/completed/feat-ignition-starter.md` — the state
  machine, the params, and the four owner rulings this ticket was carved out of.
- `src/ignition.js`, `src/drivetrain.js` (the ignition gate + dead-engine drag).
