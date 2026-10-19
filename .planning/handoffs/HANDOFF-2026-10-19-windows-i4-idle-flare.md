# HANDOFF 2026-10-19 — Windows bake, round 2: Duratec I4, free-idle fix, start flare (FEAT-120)

**For:** the Windows engine-sim session. **Branch:** `feature/engine-audio`. You still touch only
`assets/audio/`. State of your side: `assets/audio/src/engine/NOTES.md`.

**Mac side since your last push:** the Vulcan loops are in the game (`src/engine-audio.js`). The grid
plays through the stock IR in a convolver, crossfaded by log-rpm and throttle. The owner says it
"sounds amazing". The 2.3 L Duratec I4 is now a selectable engine (`data/engines.js` `duratec23`), but
it still plays the old oscillator drone. That is job 1.

## 1. Bake the 2.3 L Duratec I4 (`duratec23`)

- **Real engine:** 2002 Ranger 2.3 L Duratec 23 (Mazda MZR L3). Inline-4, DOHC, 4 valves/cyl,
  87.5 mm bore × 94 mm stroke, 9.7:1, firing order 1-3-4-2. 143 hp @ 5250, 209 N·m (154 lb·ft) @ 3750.
  Rev limiter 6250 rpm in the game. One exhaust (4-2-1 manifold into a single pipe).
- **Script:** `assets/audio/src/engine/duratec23.mr`. Base it on engine-sim's own inline-4 example
  closest to this. Leave its cams and intake as they are unless the dyno misses the target. Keep
  `starter_torque` / `starter_speed` the same as `vulcan30.mr`, because the game's starter model is
  shared by both engines.
- **Dyno check:** WOT torque within 20 % of the game's curve:
  800 → 140, 1500 → 170, 2500 → 192, 3750 → 209, 4500 → 204, 5250 → 195, 6000 → 165 N·m.
  Write the table into NOTES.md like the Vulcan's.
- **Grid:** the Vulcan's 8 rows (750 … 5500) **plus one row at 6400**. The game's I4 runs up to
  6450 rpm, and playing the 5500 loop that fast would pitch it 17 % sharp. Same 3 loads
  (off / part 0.30 / full), same crank, start and stock-reference takes.
- **Level lock:** use the **Vulcan's dry scale factor (×0.1852)**, not a fresh "loudest at −3 dBFS".
  Then the I4 sits at its honest loudness relative to the V6. If any I4 take would pass −1 dBFS at
  that factor, give it its own factor and log the dB offset in `render_log.json`.
- **Files:** `bake.py` takes the engine as an argument (`python bake.py all duratec23`). Loops are
  named `duratec23_<rpm>_<load>.flac`. Write the manifest as `assets/audio/engine/manifest-<engine>.json`.
  In the same commit, `git mv` the existing `manifest.json` → `manifest-vulcan30.json`. The Mac
  updates the loader to match.

## 2. Fix the free-idle hunt (both engines)

The Vulcan's free idle hunts between 670 and 763 rpm, so its loop can't seam (seam correlation ≈ 0).
A real engine holds idle with an **idle air control (IAC) valve**: a bypass around the throttle plate
that the engine computer opens and closes to hold the rpm.

- First try retuning `idle_throttle_plate_position` (0.994 now) in the script.
- If the hunt survives that, add an IAC to the renderer. That is a small **PI controller**
  (proportional-integral: a throttle correction from the rpm error right now, plus one from its
  running sum) on throttle around the idle plate, targeting 750 rpm. Keep it slow, so it damps the
  hunt rather than making its own oscillation.
- **Acceptance:** `<engine>_idle_free` holds 750 ± 10 rpm over the recorded 6 s, and its loop seam
  correlation is ≥ 0.95 (the grid loops sit at 0.95–0.999). Re-render the Vulcan's `idle_free` and
  `idle_free_stock`, and render the I4's.

## 3. Record the enriched start flare (both engines)

engine-sim has no cold enrichment and no IAC, so a start catches and peaks at only ~750 rpm. A real
truck flares, because the computer opens the IAC and runs rich for the first seconds. Emulate that
with the same controller from job 2, driving throttle to follow a **target rpm trace**:

- **Warm start:** catch → flare to ~1250 rpm within ~0.4 s → decay to 750 over ~1.5 s → hold.
- **Cold start:** catch → flare to ~1430 rpm → settle at a ~1100 rpm fast idle for the rest of the take.
- These targets are what the game's own crank dynamics produce (`test/ignition-starter.mjs`). Vulcan:
  1261 rpm warm, settling in 1.7 s; 1435 cold, onto 1100 in 1.0 s. Duratec I4: 1357 warm. Match those.
- Same start procedure as the current start takes (closed pedal, starter until it catches). 8 s each.
- **Takes:** `<engine>_start_warm_dry` and `<engine>_start_cold_dry`, each with its rpm CSV
  (`time_s, rpm, starter`, plus the throttle the controller commanded). Render a stock-IR copy of each
  for listening. They stay uncut, in `assets/audio/src/engine-start-reference/` like the others.
- Note in NOTES.md that the flare is a scripted throttle trace, not modelled enrichment.

## 4. Re-render the crank at the game's cadence (both engines)

The game's starter is now real dynamics (`src/drivetrain.js` `stepStart`): stall 150 N·m (≈ 111 lb·ft),
free speed 280 rpm, compression ripple 100 N·m. It cranks at **~185 rpm cold / ~210 warm**. Your
crank take settles at 501.6 rpm (70 lb·ft / 500 rpm), so the game would have to play it at ×0.4,
which drops the pitch about 1.3 octaves. That's too far.

- Render `<engine>_crank_dry` / `_crank_stock` with `starter_torque 111 lb_ft`, `starter_speed 280 rpm`
  as a **render-time override**. Leave the script's own values alone.
- Target ~200 rpm. If engine-sim's own compression and friction land it far off, tune the override
  until it sits at 190–210, and log the values you used.
- Cut on whole 720° cycles so it loops, as before. Log `rpmMeasured` in the manifest.
- Keep the old 500-rpm crank takes; don't delete them.
- This **supersedes** this brief's note that the starter values must match `vulcan30.mr` for the
  start takes. Render the flare takes (job 3) with the same override, so the crank leading into the
  catch matches the game.

## 5. Open risk from 10-18

Commit the engine-sim fork's diff (branch `autos-011a` vs `v0.1.11a`) as
`assets/audio/src/engine/engine-sim-autos.patch`. If that clone is lost, nothing can be re-rendered.

## Hand back

Commit in stages and push, as before: script + NOTES first, then the raw takes, then loops and
manifests. Report the I4 dyno table, the idle-free rpm band and seam, and each flare's peak rpm.
