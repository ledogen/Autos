---
id: FEAT-33
type: feature
status: done
opened: 2026-07-16
closed: 2026-08-22
severity: minor
source: user-request
relates_to: FEAT-23 (drivetrain / engineRPM), FEAT-26 + SM milestone 3 (wear/condition model), story mode (SM-INV-5/7/10/1/6/12)
note: "A real starter: a key that cranks the engine to life and shuts it off. Press when off →
engage the starter (hold to crank); the engine catches after cranking and idles. Press when running
→ kill the ignition, engine shuts off. More damaged / older vehicles take LONGER to catch, so you
crank (hold the starter) longer to get them going. Turns 'the truck is a beater' from a number into
a ritual you feel every morning."
---

# FEAT-33: Ignition + starter — crank it to life, kill it to stop

## Context

The engine is always on today: `drivetrain.js` (`applyDrivetrain`) floors `engineRPM` to
`engineIdleRPM` (750) unconditionally — there is no OFF, no start, no stall. This feature adds an
**ignition state machine** and a **starter** the player operates like a real key: cranking a cold or
beat-up engine takes real time, and a worse truck takes longer.

The payoff is mostly for story mode. A jalopy from the pool of crap (SM-INV-7) that coughs and
cranks for four seconds before it catches tells you exactly what you're driving *before you've
moved* — the truck's condition made tactile, not a stat on a screen (SM-INV-10). And it's a
diegetic bookend to the day: you turn the key off when you make camp (SM-INV-6), and you find out
in the cold morning whether it'll start.

## Desired behaviour

- Vehicle carries an **ignition state**: `OFF → CRANKING → RUNNING` (and back to `OFF` on shutoff /
  stall). One field on the vehicle state; the drivetrain reads it.
- A **starter key** (keybind, user-owned — NOT `R`, which is reset-to-spawn):
  - **Press-and-hold when OFF/stalled** → engage the starter: the engine spins to a low **crank RPM**
    (~200–300) and, after it has cranked long enough (see catch model), **catches** and settles to
    idle (RUNNING). Release the starter before it catches → it does NOT start; you have to crank
    again. This is the whole "hold it longer for a worse truck" feel.
  - **Press when RUNNING** → cut the ignition: engine leaves RUNNING, RPM spins down to 0 (OFF).
    A tap, not a hold.
- **Catch model — worse truck cranks longer.** The crank time (or catch probability per crank-second)
  scales with the vehicle's **condition** (age / wear / a bad starter or battery in the parts roll).
  A healthy truck fires almost immediately; a beater cranks for seconds. This must **read the same
  wear/condition the breakdown model reads** — not a scripted per-vehicle timer — per
  [[feedback_emergent_over_injected]] and the "ONE shared condition model" plan (FEAT-26 / SM
  milestone 3). Without that model wired (free roam, today), the catch time is a single nominal
  constant.
- **Drivetrain coupling:** the `engineIdleRPM` floor in `applyDrivetrain` becomes **conditional on
  RUNNING**. OFF → engineRPM 0 (no idle torque, no creep, no engine braking). CRANKING → held at
  crank RPM by the starter, makes no drive torque. RUNNING → today's behaviour exactly.
- **Audio:** a starter crank loop, a catch/fire transient, and a shutoff, through the existing
  WebAudio engine (`engine-audio.js`; `ensureEngineAudio` already unlocks on first keypress — the
  starter press IS a valid user gesture). No engine drone while OFF.

## Why it fits the story invariants

- **SM-INV-5 (wear on time + abuse):** a hard-starting engine is wear you *feel*, every morning.
- **SM-INV-7 (randomized jalopy):** "will it even start" is the perfect minute-one read of a fresh
  crap truck; a mid-run starter/battery find lands as an event.
- **SM-INV-10 (parts described, never scored):** "cranks forever when cold" is a described condition,
  no number attached — exactly the cursed-item-nobody-authored texture.
- **SM-INV-1 / SM-INV-6 (death = crash/breakdown; camping is a button gated by campable ground —
  *phrasing corrected, SM-INV-6 was reversed 2026-07-19*):** turning the key off is the
  diegetic end of the day; a truck that won't catch at a bad camp is a breakdown-flavored slow death,
  legible the whole way down — reinforces the "bad night" fiction already in the doc.
- **SM-INV-12 (determinism):** ignition/crank is a **live run-layer** mechanic; condition comes from
  the run-layer wear/jalopy roll (allowed randomness). Worldgen is untouched. Headless gates must
  default the engine to **RUNNING** and flag-gate the starter OFF (FEAT-26 precedent) so physics
  gates don't have to crank first.

## Open design questions (decide at planning)

- **Free roam vs story scope:** does the ignition ritual apply in free roam at all (nominal
  near-instant catch, since there's no damage there), or is it story-mode-only? A global mechanic
  with a trivial free-roam catch time is the likely answer — confirm.
- **Does the engine stall on its own?** The user described player-initiated on/off only. But a starter
  implies stall recovery. Can the engine stall (manual bog-down, breakdown event) and force a mid-
  drive restart, or is OFF purely a deliberate key press? Big tonal + scope lever.
- **Catch model: deterministic threshold vs probabilistic.** "Hold N seconds → catches" (N grows with
  wear) is simplest and readable; a per-crank-second catch *chance* rising with condition is more
  texture but less predictable. Lean simple-threshold unless the randomness earns its keep.
- **Battery / over-crank spiral (optional, likely later):** real starters drain a battery; cranking a
  reluctant engine too long could flatten it → a fail-to-start breakdown vector. Natural, but it's
  another subsystem — flag as a follow-on, not v1.
- **Flooding / throttle-on-crank (optional flavor):** feathering the gas to catch a cold engine, or
  flooding it by over-cranking — real, probably over-scope for v1.
- **Spawn / teleport / reset state:** does the truck spawn RUNNING (free roam convenience) or OFF (you
  fire it up)? Reconcile with the teleport reseat (`_reseatTruckAtSpawn`, starts in a held-input
  state) and `R` reset. Story likely wants "start the day by starting the truck."
- **Doze interaction:** while dozing, controls drop but the engine stays RUNNING (you don't lose the
  key) — confirm that's the intent (it should be; a stall mid-doze would be a different, harsher game).
- **Keybind choice** — user-owned; pick at implementation (`I` for ignition is the obvious mnemonic).

## Acceptance

- A starter key: hold-when-off cranks the engine (low crank RPM, no drive torque) and it catches to
  idle after a crank interval; releasing early aborts the start. Press-when-running shuts the engine
  off (RPM → 0, no idle/creep/engine-braking while off).
- Catch time scales with vehicle condition when the wear/condition model is present (reads that model,
  not a bespoke timer); a fixed nominal catch time when it isn't.
- Ignition state lives on the vehicle state; `applyDrivetrain`'s idle floor is gated on RUNNING; the
  three-place vehicleState convention is honored ([[project_vehiclestate_three_places]]).
- Starter/catch/shutoff audio through `engine-audio.js`; no drone while off.
- Headless gates default to RUNNING with the starter flag-gated off; `npm test` stays green
  (drivetrain / physics gates unaffected).
- New tunables (crank RPM, nominal catch time, wear→catch scaling, keybind) exposed as USER-OWNED
  params / sliders where the debug panel is live (free roam; story mode locks sliders per DESIGN.md).

## Related

- FEAT-23 drivetrain (`src/drivetrain.js` `applyDrivetrain`, `vehicleState.drivetrain`,
  `engineIdleRPM`) — the engine-state substrate this extends: [[project_feat23_drivetrain.md]].
- The shared wear/condition model that drives "damaged cranks longer": FEAT-26 + story milestone 3
  (`.planning/story-mode/DESIGN.md` "The economy" — damage/wear confirmed required 2026-07-16).
- Engine audio hook: `src/engine-audio.js` (`ensureEngineAudio` / `updateEngineAudio`).
- vehicleState field discipline: [[project_vehiclestate_three_places]].
- Story invariants + camping/doze framing: [[project_story_mode_framing.md]].


---

## Resolution (2026-08-22, `feature/ignition`)

Shipped. `src/ignition.js` is the state machine (OFF → CRANKING → RUNNING), `I` is the key, and the
cluster grew an ignition switch in its bottom-right corner.

**Owner rulings taken at implementation (2026-08-22)** — these close four of the open design
questions above:

- **Scope:** global mechanic. Story mode re-seats you with a DEAD truck (the SM-INV-6 bookend);
  free roam / lab / scenario spawn RUNNING so a debug reset is never gated behind a keypress.
  Sleeping at camp also leaves the truck off, so you start the morning by starting it.
- **Stalling: OUT of v1.** The engine only stops when the player turns the key. Stall is deferred
  until the manual transmission exists — tracked as **FEAT-70**.
- **Kill at speed: allowed at any speed.** You really can turn the key off at 50 mph.
- **Engine braking with the key off (owner's correction):** a dead engine in an automatic left in
  gear does NOT freewheel — above the converter's coupling speed the turbine drags the impeller and
  the whole engine round, so the truck coasts down on pumping and friction losses. Modelled as
  `engineOffDrag` N·m per 1000 rpm of dragged engine speed, faded out below `engineOffCouplingRPM`
  so a key-off roll frees up as you slow toward a stop.
- **Catch model:** deterministic threshold, not a per-crank-second probability roll.
- **The starter keeps turning while the key is held**, even after the engine has caught — an
  over-crank against a running engine is a thing you can do, and letting go is how the player ends
  it. So the crank audio is a LEVEL driven by `_starterEngaged()` (state === cranking OR the key is
  still held), not an edge; the catch and shutoff stay one-shot edges. The lit barrel on the cluster
  reads the same predicate so the two can never disagree.
- **Sound shape:** starter grinding → its own catch sound → the normal idle drone. The starter is
  built on filtered NOISE (bandpass ~1.5 kHz for ring-gear teeth, lowpass <240 Hz for compression,
  each amplitude-modulated at its own rate) rather than oscillators, which read as a beep. Owner
  expects to replace all of it with a sampled start eventually — this is a placeholder that only has
  to read as mechanical.

**Wear seam.** Catch time interpolates `ignitionCatchTime` (0.25 s, healthy) → `ignitionCatchTimeWorn`
(4 s, beater) on `vehicleState.engineHealth`. Nothing writes that field yet — SM-3 / FEAT-26 does.
Absent ⇒ 1 ⇒ a single nominal catch time, exactly as this ticket specified.

**Files:** `src/ignition.js` (new) · `src/drivetrain.js` (ignition gate + dead-engine drag) ·
`src/vehicle.js` (the `I` key, gated by free-cam and the doze attenuation) · `src/cluster.js`
(the switch: a small dial tucked into the housing's existing bottom-right corner, 420×204 canvas, merged indent, 10/12/2 detents, live key) · `src/engine-audio.js`
(starter loop, catch bark, shutoff thump; the drone goes silent whenever the engine is not firing) ·
`src/main.js` (state + reset + sleep + audio events + cluster wiring + `window.__vs` handle) ·
`src/logger.js` (`ign` column) · `src/debug.js` (Ignition & Starter sliders incl. Engine Health) ·
`data/ranger.js` (params) · `test/ignition-starter.mjs` + `test/gates.mjs` (new physics gate).

**Verified:** `test/ignition-starter.mjs` green (state machine, wear scaling, drivetrain gating, and
the absent-ignition ⇒ RUNNING default every other headless gate relies on); the full affected gate
set green; and driven live in-browser over CDP — boot/off/held/running plus a health-0 crank caught
in the act at 250 rpm with the barrel lit, no console errors.

**Deferred, unchanged:** battery / over-crank spiral and flooding / throttle-on-crank were flagged
as follow-ons in this ticket and stay that way.
