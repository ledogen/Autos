---
id: FEAT-34
type: feature
status: open
opened: 2026-07-16
severity: minor
source: user-request
relates_to: FEAT-23 (rpm/speed/gear), FEAT-33 (ignition key), FEAT-31 (radio/music), FEAT-14 (headlights), teleport parking-brake, FEAT-26 + SM milestone 3 (health → warning lights), SM-INV-10
note: "A diegetic instrument cluster GUI modeled on the real 2002 Ford Ranger layout — analog tach,
speedo, temp/fuel/oil/battery gauges, gear indicator, and a bank of warning tell-tale lights that
respond to vehicle health. Includes the FEAT-33 ignition as a visual key that physically turns
(OFF→ACC→ON→START), and hosts the FEAT-31 music integration as the in-dash 'radio'. Design north
star: Project Zomboid's clean, readable cluster + health-reactive warning lights; explicitly NOT the
busy overloaded mod look. Aggregates three other tickets — build the shell now, slot them in as they
land."
---

# FEAT-34: Instrument cluster GUI (with ignition key + warning lights + radio)

## Context

Today the only readout is the green debug text HUD (`src/debug.js` — SPEED / GEAR / RPM / FPS / Fz).
This ticket adds the **real thing**: a diegetic analog instrument cluster, modeled on the **2002 Ford
Ranger** layout (the sim's own vehicle — reference image provided by owner), that reads the truck's
actual state and, crucially, shows **health as warning lights**, gives the FEAT-33 ignition a **key
that turns**, and hosts the FEAT-31 music integration as the **radio**.

**Taste, ratified by owner:** the north star is Project Zomboid's cluster — clean, legible gauges with
a small row of warning tell-tales that light up. The busy overloaded-mod look (many redundant gauges,
digital clutter) is explicitly the anti-goal. Restraint is a design constraint here, not just polish:
model the honest Ranger cluster and stop.

## The layout — model on the 2002 Ranger [RATIFIED 2026-07-16]

Left → right, matching the real cluster:

- **Left stack (small gauges):** coolant **temp** (C–H) and **fuel** (E–F), with the little tell-tales.
- **Tachometer** (large): 0–7 ×1000 r/min, redline marked.
- **Speedometer** (large): MPH primary + km/h inner ring (dual, like the real one), with an
  **odometer / trip** readout and the **gear indicator** (P R N O D 2 1 for the auto, or the sim's
  actual gearing — reconcile with FEAT-23).
- **Right stack (small gauges):** **oil** pressure (L–H) and **battery** / voltage (L–H).
- **Warning tell-tale lights:** check-engine, battery/charge, oil, brake (parking brake), high-beam,
  turn signals, low-fuel, overheat, seatbelt, door-ajar — the standard idiot-light bank, lit from
  real state where it exists (see signal map) and from the health model as it lands.

## The three things the owner specifically wants

1. **Ignition as a key that turns (FEAT-33).** A rendered key in the cluster that rotates through
   `OFF → ACC → ON → START`, animating with the FEAT-33 ignition state — held at START while cranking,
   springs back to ON when it catches. This is the visual face of FEAT-33; it depends on that ticket's
   state machine existing.
2. **Warning lights that respond to vehicle health.** The tell-tales illuminate off the shared
   wear/condition model (FEAT-26 / SM milestone 3): a worn engine trips CHECK, a bad battery/starter
   trips the battery light, low oil condition trips oil, over-temp trips overheat. This is the payoff
   the owner called out — condition made legible as idiot lights, not numbers. Depends on that model
   for the *health* lights; the state-backed lights (below) work now.
3. **Radio = the music app (FEAT-31).** The FEAT-31 player-music / Spotify integration lives in the
   dash GUI as the "radio" — a small panel showing now-playing / transport. The real radio is in the
   center stack, not the cluster proper, so this is the broader **dashboard GUI** hosting the cluster
   plus a radio module. Depends on FEAT-31's chosen tier.

## Signal map — what backs each element (be honest about what exists)

**Live today (v1 can wire these for real):**
- Tach ← `vehicleState.drivetrain.engineRPM`; Speedo ← velocity; Gear ← `drivetrain.activeGear`.
- Brake tell-tale ← parking-brake latch (teleport feature, merged); High-beam / headlight tell-tales
  ← FEAT-14 light state; Ignition key + any ignition tell-tale ← FEAT-33 state.

**Needs a subsystem that does not exist yet (cosmetic placeholder, or gated on the subsystem):**
- **Fuel gauge + low-fuel light:** there is no fuel model today. A fuel/refuel subsystem is a real
  economy lever (ties to towns/camping) — big open question whether the game even has fuel. Until
  then the gauge is cosmetic or omitted.
- **Coolant temp + overheat:** the wear model lists **over-temp** as a wear input, so a temp state is
  plausibly coming; gauge/light gate on it.
- **Oil pressure, battery/voltage:** derive from the condition model (and FEAT-33's optional battery)
  once it exists; cosmetic/static until then.
- **Check-engine, battery, oil warning lights (the "health" ones):** gate on FEAT-26 / SM milestone 3.

v1 must not fake these as live — a gauge that reads a made-up number is worse than an honest static
one. Wire what's real; leave clean seams for the rest.

## Technical approach (proposal)

- **DOM overlay: SVG + HTML/CSS**, not canvas or in-Three geometry. Gauges are SVG (crisp at any
  scale, arcs + ticks authored once); **needles and the key rotate via CSS `transform`**; warning
  lights are elements toggled by class; the radio is a small HTML panel. Same DOM-overlay lane as
  lil-gui/stats already occupy — no new deps, no WebGL cost, and the most LLM-maintainable option.
- **Performance:** only touch changed elements per frame (needle transforms + light class flips are a
  handful of style writes) — must not threaten the 60fps target. No per-frame layout thrash; transforms
  only. Verify against the PERF-08 harness if in doubt.
- **Pure display, zero gameplay effect** → deterministic, headless gates unaffected (cluster is not
  built in headless). Cluster styling / dimensions are USER-OWNED.

## Why it fits the story invariants

- **SM-INV-10 (parts described, never scored):** warning tell-tales are the *canonical* described-not-
  scored surface — the oil light is *on*, there is no "oil: 43%". The cluster is the diegetic home for
  condition. **Guardrail:** do NOT let gauges drift into health bars / stat readouts; idiot lights and
  honest analog needles only.
- **SM-INV-3 (par is never a countdown):** the cluster shows speed/rpm/fuel, never par — safe.
- Free roam keeps the debug text HUD available; story mode (sliders/debug locked) uses the cluster as
  the only readout, which is exactly right.

## Open design questions (decide at planning)

- **Replace or complement the debug text HUD?** Likely: cluster is the player HUD, the green text HUD
  stays as a dev toggle (it carries Fz/FPS/slip a cluster shouldn't).
- **Screen placement + size:** bottom-center dash strip vs corner; always-on vs toggle vs compact/full.
  Must not obscure the road. The Ranger cluster is wide — how much screen does it earn?
- **Does the game get fuel?** The single biggest fork — a fuel gauge implies a fuel/refuel economy
  (owner call; ties to the story economy). Cosmetic-only is the fallback.
- **How many warning lights in v1** vs. gated on the wear model — wire the state-backed ones now
  (brake, high-beam, ignition), stub the health ones behind FEAT-26/milestone-3?
- **Radio placement + scope:** inside the cluster frame or a separate adjacent dash panel? Follows
  FEAT-31's tier (a Tier-0 focus-mode "radio" is basically just a mute/volume toggle).
- **Units + gear indicator:** MPH-primary dual dial (match the real Ranger); PRND auto indicator vs the
  sim's actual gearing (FEAT-23 auto Phase 1 → PRND fits, but confirm reverse/neutral handling).
- **Night/backlight look:** the cluster should read at night (FEAT-14 lights / sky time-of-day) — green
  Ranger backlighting is part of the vibe; how far to take it.

## Acceptance

- A **cluster shell** modeled on the 2002 Ranger renders as a clean DOM/SVG overlay: tach, speedo,
  temp/fuel/oil/battery gauge faces, gear indicator, and a warning-light bank, in the real layout —
  restrained, PZ-clean, not the busy-mod look.
- **Live from real state:** tach, speedo, gear read the actual drivetrain/velocity; brake / high-beam /
  ignition tell-tales read their real signals.
- **Ignition key** element rotates OFF→ACC→ON→START in step with FEAT-33 (held at START while cranking).
- **Warning lights respond to vehicle health** once the wear/condition model exists; state-backed
  lights work before then. No gauge fakes a live value it has no signal for.
- **Radio module** present as the FEAT-31 host (scoped to whatever FEAT-31 tier ships).
- Pure display: deterministic, `npm test` unaffected, 60fps preserved; styling USER-OWNED.

## Related

- Ignition/starter this visualizes: `feat-ignition-starter.md` (FEAT-33).
- Radio/music host: `feat-player-music-streaming.md` (FEAT-31).
- Health-light backing: FEAT-26 + `.planning/story-mode/DESIGN.md` "The economy" (shared wear/condition
  model); SM-INV-10 described-not-scored.
- State sources: FEAT-23 drivetrain (`src/drivetrain.js`), FEAT-14 cast lights (`src/vehicle-model.js`),
  parking brake (teleport feature — [[project_teleport_feature]]), current HUD (`src/debug.js`).
