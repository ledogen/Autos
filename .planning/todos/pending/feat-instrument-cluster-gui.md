---
id: FEAT-34
type: feature
status: open
opened: 2026-07-16
updated: 2026-08-15
severity: minor
source: user-request
relates_to: FEAT-49 (gauge cluster — SHIPPED, this ticket's shell), FEAT-50 (fuel model), FEAT-51 (coolant temp), FEAT-23 (rpm/speed/gear), FEAT-33 (ignition key), FEAT-58 (radio/music), FEAT-14 (headlights), teleport parking-brake, FEAT-26 + SM milestone 3 (health → warning lights), SM-INV-10
note: "A diegetic instrument cluster GUI modeled on the real 2002 Ford Ranger layout — analog tach,
speedo, temp/fuel/oil/battery gauges, gear indicator, and a bank of warning tell-tale lights that
respond to vehicle health. Includes the FEAT-33 ignition as a visual key that physically turns
(OFF→ACC→ON→START), and hosts the FEAT-58 music integration as the in-dash 'radio'. Design north
star: Project Zomboid's clean, readable cluster + health-reactive warning lights; explicitly NOT the
busy overloaded mod look. Aggregates three other tickets — build the shell now, slot them in as they
land."
---

# FEAT-34: Instrument cluster GUI (with ignition key + warning lights + radio)

## State (alpha audit, Lane A, 2026-11-07) — two of the three consumers have moved

- **Ignition key: built.** FEAT-33 closed (`completed/feat-ignition-starter.md`). The cluster draws the key in its own
  well and sweeps it between detents (`src/cluster.js` `setIgnition`, `KEY`).
- **The two needles are live.** Fuel comes from FEAT-50 (`setFuelLevel`, `src/fuel.js`), and coolant from FEAT-51
  (`setCoolantTemp` ← `DamageModel.tempGaugeFrac()`).
- **Two lamps are lit from real state, and only with the key on:** low fuel (FEAT-50) and tire pressure (FEAT-94,
  any flat tire).
- **Still missing:**
  - the parking-brake and headlight / high-beam tell-tales (state-backed, buildable now);
  - any health lamp from SM-3's wear model (check engine, charge, oil);
  - the radio (FEAT-58 is still a thinking surface).
- **Owner's call owed:** which lamps the alpha's bank carries, and whether the radio is in the alpha at all.

## Owner, 2026-11-07 (alpha-audit-calls) — and what was built

Verbatim: "brake and headlight lamps are approved. not sure what the other damage tracks would take form as."

**Built (Lane B, 2026-11-07): the 2002 Ranger's BRAKE and high-beam lamps** (`src/cluster.js`), matched to the 2002
Ranger Owner Guide's cluster drawing (pages 10–13). Colours follow FMVSS 101: a brake telltale is red (§S5.5.2),
high beam blue. No photo of a lit 2002 cluster could be fetched; the listing sites block scripted downloads.
- **BRAKE**: "((!))" over the word BRAKE. The 2002 sets it at the tach's lower left; here it sits in the tach's empty
  lower right, because this face's scale starts at the lower left. Its sender is `vehicleState.handbrake`, which
  covers the latched park, Space held while rolling, and the mission launch hold. It also lights at START: the guide
  says it "momentarily illuminates at start up to ensure the circuit is functional". Dark with the key off (it is on
  the ignition feed).
- **High beam**: "≡D" in the fuel pod, mirroring the low-fuel lamp; the 2002 sets it beside its fuel gauge. Lit at
  headlight mode 2 (`vehicle-model.js` gains `getHeadlightMode`). It is on the headlamp circuit, so it lights with
  the key off too.
- **The 2002 has no "headlamps on" lamp.** "Headlight lamp" is therefore the high-beam indicator.

**The damage-track lamps: the owner's call, put cheaply.** Sheet: https://claude.ai/artifact/XJrmfoRMYu4Rd77onpbAmF.
Of the 29 damage tracks, a real 2002 has a lamp for two: CHECK ENGINE (engine condition; proposed at 50 %, where the
power loss steepens) and CHECK GAGE (the engine running past H, which a worn radiator causes). Everything else has
none. Options: A both (recommended), B CHECK ENGINE only, C neither. Nothing built until the call.

Noticed: the game's low-fuel dot and tire-pressure lamp are not 2002 lamps. The 2002 folds low fuel into CHECK GAGE,
and its tire-pressure lamp arrived on later trucks. Both are already shipped; no action asked.

## ⚑ STATUS 2026-08-15 — the shell SHIPPED as FEAT-49; what's left is the three consumers

**The cluster itself exists on main.** FEAT-49 (`src/cluster.js`, `GaugeCluster`, merged `54cc10d`,
closed 2026-08-03) built and shipped the readout this ticket asked for. Do **not** re-plan the shell;
read `src/cluster.js` first and plan only the deltas below.

**Rulings the shipped cluster settled — these override the proposals further down this file:**

| This ticket proposed | What actually shipped (FEAT-49) |
|---|---|
| DOM overlay, SVG + CSS transforms | **Canvas 2D**, procedurally drawn, no image assets, no new deps |
| 2002 Ranger layout | **Early-90s Ranger** reference (matches the jalopy), right-hand oil/battery pod **trimmed off** |
| Placement TBD (bottom-center strip vs corner) | **Bottom-right**, hidden while the 2D map (`M`) is open, visible in chase/hood/freecam |
| Replace or complement the text HUD? | **Replaces** it for speed/gear/rpm — those lines are deleted; the wheelspin diagnostic stays on the text HUD as a dev readout |
| "Does the game get fuel?" — the big fork | **Yes** — ratified 2026-08-01, *"there should 100% be fuel in the game and gas stations"*; the model is FEAT-50, tank rescaled to a 16 h day by FEAT-54 |

Also landed since: an **odometer** (seeds 80k–160k mi, accumulates real miles, re-seeds per run until
the run/save layer gives the jalopy a persistent identity — SM-4/FEAT-42) and a **24 h run clock** on
the story HUD (`14fbb66`).

**What remains in FEAT-34 — all three are blocked on their own subsystem, none on the cluster:**

1. **Warning tell-tale bank** — the ticket's actual payoff, and nothing of it shipped. Still gated on
   the wear/condition model (FEAT-26 / SM-3). The state-backed lights are buildable *now* against live
   signals: brake (parking-brake latch), high-beam / headlights (FEAT-14). SM-INV-10 guardrail stands
   — idiot lights, never "oil: 43%".
2. **Ignition key that turns** (OFF→ACC→ON→START) — blocked on FEAT-33's state machine, still open.
3. **Radio module** hosting FEAT-58 — FEAT-58 is still a thinking surface, not a committed build, and
   the owner flagged it as possibly too cheesy. Scope follows whatever tier it lands at, if any.

The two placeholder needles are **not** this ticket's debt: `setFuelLevel` / `setCoolantTemp` sit at
static targets by design until **FEAT-50** and **FEAT-51** drive them. Honest-signal rule held — no
gauge fakes a live value.

## Context

Today the only readout is the green debug text HUD (`src/debug.js` — SPEED / GEAR / RPM / FPS / Fz).
This ticket adds the **real thing**: a diegetic analog instrument cluster, modeled on the **2002 Ford
Ranger** layout (the sim's own vehicle — reference image provided by owner), that reads the truck's
actual state and, crucially, shows **health as warning lights**, gives the FEAT-33 ignition a **key
that turns**, and hosts the FEAT-58 music integration as the **radio**.

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
3. **Radio = the music app (FEAT-58).** The FEAT-58 player-music / Spotify integration lives in the
   dash GUI as the "radio" — a small panel showing now-playing / transport. The real radio is in the
   center stack, not the cluster proper, so this is the broader **dashboard GUI** hosting the cluster
   plus a radio module. Depends on FEAT-58's chosen tier.

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
  FEAT-58's tier (a Tier-0 focus-mode "radio" is basically just a mute/volume toggle).
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
- **Radio module** present as the FEAT-58 host (scoped to whatever FEAT-58 tier ships).
- Pure display: deterministic, `npm test` unaffected, 60fps preserved; styling USER-OWNED.

## Related

- Ignition/starter this visualizes: `feat-ignition-starter.md` (FEAT-33).
- Radio/music host: `feat-player-music-streaming.md` (FEAT-58).
- Health-light backing: FEAT-26 + `.planning/story-mode/DESIGN.md` "The economy" (shared wear/condition
  model); SM-INV-10 described-not-scored.
- State sources: FEAT-23 drivetrain (`src/drivetrain.js`), FEAT-14 cast lights (`src/vehicle-model.js`),
  parking brake (teleport feature — [[project_teleport_feature]]), current HUD (`src/debug.js`).

## Owner, 2026-11-07 (feat34-lamps) — round 2, built (Lane B, feature/machine)

Verbatim: "lamps i want: check engine (as a symbol), overheating coolant (mimic low fuel with a light under the high
side of coolant gauge), flat tire, parking brake, low fuel stays the same. you pulled a great reference image for the
actual ranger dash. could i also have the rpm "circle" combined with the speedo like the reference. so the circles
overlap instead of being fully separate"

- **The tach and speedo share one face**, as the 2002 owner guide's cluster drawing (pp. 10–13) has them. Measured
  off that drawing: the hubs sit 0.71 of the summed radii apart (here 96 px of 132), and the 2002's tach is a short
  arc (0 at about half past eight, the top numeral at about twenty to one). So the tach's sweep went 195° → 130°
  (160° → 290°), which ends its scale before the cusp where the two rims meet. The speedo's 0–30 mph now sit in the
  tach's old lower right. The faces are painted as one region: inside the tach's disc each pixel keeps the lighter of
  the two shadings, so no rim line divides them (`_paintJoinedWell`). The cluster is 42 px narrower (W 420 → 378).
- **Moved to stay left of the cusp:** BRAKE to the tach's lower left (where the 2002 has it); RPM x1000 to the top
  under the numerals (as the 2002 prints it); the UNLEADED / FUEL ONLY legend low and right of the gear.
- **The temp pod mirrors the fuel pod**, a lamp each side of its glyph:
  - CHECK ENGINE, amber, as the ISO engine symbol on the C side. Lit at the engine track's knee
    (`DAMAGE_PARAMS.engineKnee`, 50 %), where its power loss steepens. It also lights at START: the 2002 guide's bulb
    check for this lamp, the same as BRAKE.
  - Overheat, a dot under H: the low-fuel lens's twin. Red, FMVSS 101's colour for a coolant-temperature telltale
    (the low-fuel dot is amber). Lit past H (`tempGaugeFrac() > 1`, i.e. over `tempHotC` 110 °C), where engine damage
    and power loss start.
- **Unchanged:** flat tire (speedo), parking brake (BRAKE), low fuel.
- **The headlamp lamp — owner, 2026-11-08 (the feat34-lamps check), verbatim:** "green low beams blue high beams and
  red if your lights are both dead and you try to turn them on". The high-beam lamp's lens now follows the switch:
  the low-beam symbol (beams angled down) in green at low beam, the high-beam symbol ("≡D", beams level) in blue at
  high, and the switched-on symbol in red when both headlamps are at 0 % (`headlightL` and `headlightR`). Dark when
  the lights are off. It is on the headlamp circuit, so it lights with the key off too. `setHeadlights(mode, dead)`
  replaces `setHighBeam`.
- The 2002's text CHECK GAGE lens is not built (the owner chose the dot).
- Render harness: `wip/feat-34/cluster-shot.{html,mjs}` (git-invisible), which knows `checkEngine` and `overheat`.

## Owner, 2026-11-08 (feat34-r2-look) — round 3, built (Lane B, feature/machine)

Choice "changes". Verbatim: "headlight light should be on if either headlight is dead. the outline and overall
cluster shape is a little awkwardly slanted from older opus struggling with svgs can you straighten it out and make it
a little more symmetric. blow up all the gauges like 15% the numbers are getting a little small. maybe skip every other
10 mph too. so 0-20-40-60 and so on. its getting there though. lights are nice. get rid of unleaded fuel only. shifts
are good. hi lift good"

Kept as they are: the lamps, the shifts (FEAT-185), the hi-lift (FEAT-138).

- **Headlamp lamp:** red when the lights are switched on and EITHER headlamp is at 0 % (was: both). The sender in
  `main.js` is now `headlightL <= 0 || headlightR <= 0`. It is still dark with the switch off, per the 11-08 ruling
  ("… and you try to turn them on").
- **Straight and symmetric.** The layout is now mirror-symmetric about the dial axis (`AXIS`, the hubs' line):
  - The temp/fuel pod stands upright, centred on the axis. It used to lean 20° off vertical, temp high and inboard.
  - The key sits on the axis at the speedo's 3 o'clock. It used to hang off the bottom-right corner, which pulled
    the bottom edge into a slope. Its three distances to the speedo are unchanged (93.3 px).
  - The housing's two ends have one shape: the pod's corner circles, mirrored on the right around the key.
  - The top and bottom edges are one arch each (a quadratic leaving both corners along their tangents), and the
    bottom arch is the top one's mirror.
  - The old construction (a hull with tangent lines and a 22 px visor lift) is gone, along with its two helpers.
- **15 % bigger:** a single `SCALE = 1.15` on the canvas transform, so every balanced distance scales with it. The
  canvas goes from 378 × 204 to 453 × 235 CSS px; the layout grew 16 units wider for the right end. The Quick Job
  button rides 31 px higher to stay clear of it (`bottom: 257px`).
- **Speedo numerals every 20 mph, from 0:** 0 · 20 · … · 120. The ticks stay major every 10, minor every 5. The 0 sits
  where the UNLEADED legend was.
- **UNLEADED / FUEL ONLY removed.**

**Polish (Lane B, 2026-11-09), seen in real Chrome:** the dial numerals are placed by their own extent along the
radius (`_numeralAt`), so the wide ones at 3 and 9 o'clock ("100", "20") no longer run into their ticks; the km/h ring
moved inside the mph numerals (160 read as "160100"); the odometer window (`ODO`) sits lower and narrower so the 40
and 80 clear its corners.

Shots: real headless Chrome at 2×, round 2 beside round 3 and eight round-3 states (idle, cruise, 92 mph on high
beams, every lamp lit, low beams, one lamp dead, START, key off) plus one in-game frame:
`wip/feat-34/r3-chrome/sheet.png` (machine worktree, git-invisible). Harness `wip/feat-34/cluster-shots.mjs` +
`cluster-shot.html` (the real `GaugeCluster` in a state from the query string) and `ingame-shot.mjs`. The only gate
that covers `cluster.js` is cdp-smoke (the orchestrator's).

## Round 5 (Lane B, 2026-11-15) — built, awaits the owner's look

Owner on card feat34-r4-look: "move the key back to the bottom right corner. then grow the speedo and tach gauges so they fill the rectangular frame nicely. it looks like we could bump their size 10%..." (DEC-267, DEC-268).
Key now in the bottom-right corner (`END_X`, `KEY_CORNER`); tach well 68 → 75, speedo 76 → 84, POD_E 39 → 46, W 466, H 240; needles, odometer and lamp offsets follow. Frame grew to fit (the key cannot sit nearer the corner than 103 from the speedo hub, so the right end is wider than round 4's).
Shots: `wip/feat-34/shots/r5/{before,after,after-lamps}.png` (before = round 4 at 55 mph). Not run: gates (cluster.js is not in a gate's closure; node import ok).

## Round 6 (Lane B, 2026-11-15) — built, awaits the owner's look

Owner on the round-5 look card (DEC-283): "keep all sizes. move the key away from the speedo near the corner of the rectangular frame, then move the tach right a smidge. the speedo right a little bit more so ther Put KPH above MPH and move them both down a bit" (cut off at "so ther"; not acted on).
Layout units (canvas px before SCALE 1.15): `TACH_SHIFT` 5, `SPEEDO_SHIFT` 10, `KEY_AWAY` 10 (key 103 → 113 from the speedo hub, still in the corner; END_X and W grow 20, W 486), `KMH_DY` 38 / `MPH_DY` 47 (km/h centred above MPH; MPH was +34, km/h +46 at the right). Sizes untouched.
Shots: `wip/feat-34/shots/r6/` (after, after-lamps, sheet-r5-r6). Gates: `npm test` selects only the app gate; cdp-smoke is the orchestrator's.

## Round 7 (Lane B, 2026-11-15) — built, awaits the owner's look

Owner: the FULL round-5 note plus the round-6 reply (DEC-284, supersedes DEC-283; refines DEC-267). Positions are now DERIVED, not typed: `GAP` 12 (housing between pod indent and tach indent, and between speedo indent and key indent: equal) and `TACH_SPEEDO` 135 (hub to hub; round 6 was 117, +18 so the tach's last numeral clears the speedo's 20/40).
Result (layout px): tach hub 190 (was 186), speedo hub 325 (was 303), key centre (END_X 449, AXIS+POD_E 166) = the corner arc's centre (was 410.6), W 511 (was 486). Sizes unchanged. Tach sweep 130 → 170: scale end 290° (about 12:40) → 330° (2 o'clock), start 160° as before.
Lamps: brake, tire pressure, check engine, headlamp in one row at tach hub y +47, pitch 24, centred on the tach hub, glyphs scaled to about 6.6 half-size (`LAMP_DY`, `LAMP_PITCH`, `_lampAt`). Low fuel and overheat stay as dots under E and H. The word BRAKE under its lamp is dropped (it broke the row). The reading "all 4" = the four symbol lamps is a guess; there are six lamps.
Shots: `wip/feat-34/shots/r7/` (after, after-lamps, sheet-r6-r7).
