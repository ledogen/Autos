---
id: FEAT-39
type: feature
status: open
opened: 2026-07-20
severity: minor
source: user-request
relates_to: >
  vehicle input/steer accumulation (src/vehicle.js — steerAngle, smoothThrottle/smoothBrake,
  steerRate/steerDecayRate/throttleRampRate/brakeRampRate), tire slip (src/tire.js slipAngle/
  slipRatio), physics (src/physics.js), debug GUI (src/debug.js lil-gui), FEAT-41 game menus
  (assists page lives there), FEAT-40 ABS/TCS as hardware parts (reconcile — see below),
  story-mode difficulty (SM-INV-2 honest physics / SM-INV-10 described-not-scored)
note: "Driver-assist / difficulty-modifier layer modeled on BeamNG's assists — throttle assistant
(traction control), brake assistant (ABS), understeer reduction (steering-angle cap where grip is
lost), oversteer reduction (auto countersteer). An 'Assists' menu page with per-assist toggles, a
gain slider per assist, plus driving-feel sliders (steering rate, throttle/brake ramping — several
already exist as params). These are INPUT-MODULATION software aids for accessibility/difficulty;
the *hardware* ABS/TCS parts are the separate FEAT-40 — reconcile the overlap."
---

# FEAT-39: Driver assists / difficulty modifiers (BeamNG-style)

## Context

RangerSim's core value is *honest physics* — a truck that drifts, rolls, and rewards literacy. That
same honesty makes it punishing for newer players and hard to dial as a difficulty axis. This ticket
adds an optional **driver-assist layer** that modulates the player's raw steer/throttle/brake input
before it reaches the physics, plus a menu to tune it. Inspiration: **BeamNG.drive's assists.**

The assists are **input-modulation software**, not vehicle hardware. They sit in the input path
(`src/vehicle.js`, where raw keys already ramp into `smoothThrottle`/`smoothBrake`/`steerAngle`) and
read slip signals the tire/physics layer already computes. Nothing about the physics model changes —
an assist only shapes what the driver commands.

## The four assists (BeamNG naming, owner-specified)

1. **Throttle assistant (traction control / TCS).** Limits engine power delivery when a driven wheel
   exceeds a slip-ratio threshold (wheelspin). Reads rear-wheel slip ratio (RWD — `src/tire.js`),
   clamps `throttle` down while slipping. Gain = how aggressively it cuts.
2. **Brake assistant (ABS).** Prevents lockup: when a braked wheel's slip ratio crosses the lock
   threshold, modulates `brake` down for that axle so the wheel keeps rotating. Gain = intervention
   strength / how much lock it tolerates.
3. **Understeer reduction.** When the front tires exceed their grip (front slip angle past peak, the
   truck plowing straight), **reduce commanded steering angle** toward what the front axle can
   actually use — stops the player sawing in more lock that only scrubs speed. Gain = how hard it
   claws steering back.
4. **Oversteer reduction.** **Automatic countersteer** — when the rear steps out (yaw rate vs.
   commanded path / rear slip angle), inject corrective opposite steer to catch the slide. Gain =
   countersteer authority. (This is the one that most changes the driving *feel* — at high gain the
   truck refuses to drift; that tension is the point of the slider.)

## The Assists menu page

Lives as a page in the FEAT-41 game-menu system (and mirrored into the free-roam debug GUI). Controls:

- **Per-assist toggle** (on/off) for each of the four above.
- **Per-assist gain slider** — strength of that assist's input modulation (0 = off … 1 = maximal
  intervention). Lets a player run, e.g., light ABS but no oversteer reduction.
- **Driving-feel sliders** (input shaping, distinct from the assists):
  - **Steering rate** — already `params.steerRate` / `steerDecayRate` in `src/vehicle.js`; surface
    them player-facing.
  - **Throttle ramping** — already `params.throttleRampRate`.
  - **Brake ramping** — already `params.brakeRampRate`.
  - (These three exist today as debug params; the menu gives them a non-debug home.)

## Technical approach (proposal)

- **One assist pass in `src/vehicle.js`**, applied after raw input is read and before/around the
  existing ramp step, reading slip from the tire/physics state of the *previous* step (assists are
  inherently a feedback loop — last-step slip is fine and keeps it out of the force solver). Each
  assist is a pure `(command, slipSignals, gain) → command'` function; toggles gate them; gain scales
  intervention. Keep them small and independently testable (tire.js-style pure math).
- **No change to `physics.js`/`tire.js` force math** — assists only reshape driver command. This keeps
  the "honest physics" invariant intact: the tires still do exactly what the physics says; the assist
  just decided not to ask for more than they can give.
- **Determinism:** assists are a pure function of state + fixed params → headless-safe. A gate can pin
  assists OFF (the honest baseline the physics gates already assume) and optionally add an assists-on
  regression later. Default OFF so existing physics gates/behavior are unchanged.

## Reconcile with FEAT-40 (ABS/TCS as hardware parts)

Overlap to resolve at planning: assist **#1 (TCS)** and **#2 (ABS)** are *software aids* here, but
FEAT-40 makes ABS and traction control **installable hardware** on the truck. Proposed split:
- **Free roam / difficulty layer:** the four assists are freely toggleable aids (accessibility +
  difficulty knob), independent of what's bolted to the truck.
- **Story mode:** whether the jalopy *has* ABS/TCS hardware (FEAT-40) is a part property (SM-INV-10
  described-not-scored — the truck either has anti-lock or it doesn't, no number). The ABS/TCS assist
  toggles may then be **gated by hardware presence** — you can't enable ABS the truck doesn't have.
  Understeer/oversteer reduction have no hardware analog, so they stay pure difficulty aids.
This split is a **design question, not settled** — flag for owner at planning.

## Story-mode fit (flag)

Heavy assists undercut the "re-read the honest truck at minute one" premise (SM-INV-7) and the
honest-physics core value. Likely: assists default **off** in story mode (or exposed only as an
explicit accessibility layer), full range in free roam. Where the assists menu lives relative to the
story-mode **debug lockout** (RATIFIED 2026-07-16 — sliders fixed in story mode) needs an owner call:
assists are *player* settings, not debug tuning, so they probably survive the lockout — but confirm.

## Acceptance

- Four assists implemented as input-modulation passes in `src/vehicle.js`, each toggleable with a
  gain slider; all default OFF (baseline physics unchanged, existing gates green).
- TCS cuts wheelspin; ABS prevents lockup under hard braking; understeer reduction caps steering when
  the front washes out; oversteer reduction countersteers a slide — each visibly does its job in-game
  and scales with its gain.
- An **Assists menu page** (in FEAT-41's menu system) exposes the toggles + gains + steering-rate /
  throttle-ramp / brake-ramp sliders (the last three surfacing existing `src/vehicle.js` params).
- No change to `tire.js`/`physics.js` force math; assists are pure input shaping; `npm test`
  unaffected with assists off.
- Overlap with FEAT-40 (hardware ABS/TCS) resolved or explicitly deferred with the split above.

## Related

- Hardware counterpart: `feat-abs-tcs-parts.md` (FEAT-40).
- Menu host: `feat-game-menus-ui.md` (FEAT-41).
- Input seams: `src/vehicle.js` (steerAngle, smoothThrottle/smoothBrake, ramp params); slip signals:
  `src/tire.js`; force solver (untouched): `src/physics.js`.
- Story constraints: `.planning/story-mode/DESIGN.md` (honest physics, SM-INV-7/10, debug lockout).
