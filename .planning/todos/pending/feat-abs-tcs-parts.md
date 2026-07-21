---
id: FEAT-40
type: feature
status: open
opened: 2026-07-20
severity: minor
source: user-request
relates_to: >
  FEAT-39 driver assists (software counterpart — ABS/TCS assist toggles gate on this hardware),
  FEAT-23 drivetrain/parts architecture (src/drivetrain.js), jalopy parts pool (SM milestone 3),
  vehicle input (src/vehicle.js), tire slip (src/tire.js), story mode (SM-INV-7/9/10)
note: "ABS and traction-control as installable VEHICLE PARTS (hardware), distinct from FEAT-39's
software driver-assists. A jalopy either has anti-lock / traction-control hardware or it doesn't —
a described-not-scored part property (SM-INV-10) that shapes the truck's character and gates the
matching FEAT-39 assist. Reserve-the-idea capture; design against the parts pool when SM-3 lands."
---

# FEAT-40: ABS + traction control as installable parts

## Context

Separate from the FEAT-39 **driver-assist software layer**, the owner wants to **reserve the option**
of ABS and traction control as **actual hardware parts** a vehicle can have. The distinction:

- **FEAT-39** = a difficulty/accessibility layer that modulates *driver input* — freely toggleable.
- **FEAT-40 (this)** = whether the *truck itself* is equipped with anti-lock brakes / a traction-
  control system — a **part**, rolled into the jalopy like any other component, that the player can
  find/install/lose.

A 2002 Ranger may or may not have these; making them parts turns "does this truck have ABS?" into
part of re-reading the jalopy at run start (SM-INV-7) and a meaningful find mid-run.

## Design intent (capture — build at SM-3 parts-pool planning)

- **Described, never scored (SM-INV-10).** The truck *has* anti-lock or it doesn't — no "braking:
  +12%". Its presence changes what the truck *does* under threshold braking / hard throttle, exactly
  like the open-vs-LSD diff already framed in DESIGN.md.
- **Breadth, not floor (SM-INV-9/7).** ABS/TCS in the parts pool is another axis of jalopy variety,
  not a strict upgrade — a truck without them is a *different, more demanding* drive (arguably the
  more honest one), not an unwinnable one. First-run winnability holds without them.
- **Gates the FEAT-39 assist.** The ABS/TCS **assist toggles** in the assists menu should be
  **available only when the hardware is installed** (in story mode). No hardware → the anti-lock /
  traction-control assist is greyed out; you drive the truck you've got. Understeer/oversteer
  reduction have no hardware and stay pure difficulty aids regardless.
- **Mechanism shared with FEAT-39.** The *behavior* of installed ABS/TCS reuses FEAT-39's input-
  modulation passes (`src/vehicle.js`) — this ticket is mostly the **part model + pool + gating**, not
  a second implementation of the anti-lock/TCS logic.

## Open questions (planning)

- Are ABS/TCS **per-axle** (front ABS only, etc.) or whole-vehicle?
- Does hardware ABS/TCS have a **condition/wear track** (fails as it wears, like other parts) or is it
  binary present/absent?
- Free roam: expose as a spawn/vehicle-config option, or story-mode-only (parts pool)? Likely
  vehicle-config in free roam, jalopy-rolled in story mode.
- Interaction with the FEAT-39 gain sliders when it's hardware — fixed factory behavior vs. still
  tunable?

## Acceptance

- ABS and traction control exist as **parts** in the vehicle/jalopy part model (FEAT-23 architecture),
  present/absent per truck, **described not scored** (SM-INV-10).
- When installed, they drive FEAT-39's anti-lock / traction-control input-modulation behavior; when
  absent, the truck locks up / spins wheels honestly and the matching assist toggle is unavailable
  (story mode).
- A truck without either is still fully run-winnable (SM-INV-7); their presence is variety, not power
  (SM-INV-9).
- Deterministic / headless-safe (part state is fixed input, not per-frame randomness).

## Related

- Software counterpart & shared mechanism: `feat-driver-assists.md` (FEAT-39).
- Parts architecture: `feat-vehicle-drivetrain-architecture.md` (FEAT-23); jalopy parts pool: SM
  milestone 3 (`.planning/story-mode/MILESTONES.md`).
- Invariants: `.planning/story-mode/DESIGN.md` SM-INV-7 (first-run winnable), SM-INV-9 (breadth not
  floor), SM-INV-10 (described not scored).
