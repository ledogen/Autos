# HANDOFF — the ground-up lighting rebuild (FEAT-180 comparison build), 2026-11-08

Written by the orchestrator (cargame-c8) from the first agent's report, so a fresh agent starts with none of the old
context. The owner asked for the rebuild ("throw an Opus agent at trying to completely redesign the lighting and
skybox from the ground up ... in the style of Breath of the Wild ... tone down the saturation"). It is a
**comparison build**: the owner is giving notes to this and to Spare's tweaks of the current lighting, "and see
which converges first".

## Where

- **Worktree:** `/Users/ledogen/CodeShit/CarGame/.claude/worktrees/agent-a963acdc35996c65b`
- **Branch:** `proto/lighting-redesign`, last commit **44d284d2**. Cut from **d7dc18e1** (origin), **not** local
  main: main has moved since (11 `src/` files differ). Merge main in before any landing talk.
- **Port:** Vite on **3890** (left running). Look URL: http://localhost:3890/?seed=1172941705&nomenu=1
- Review seeds: 1172941705, 3583777560, 701336435.
- Contact sheets from round 1 (truck spot + local peak, every hour, toward and away from the sun):
  `/private/tmp/claude-501/-Users-ledogen-CodeShit-CarGame/f08f9df1-2394-4364-9acc-a863a66bda88/scratchpad/v5/`
  (`sheet-truck.jpg`, `sheet-peak.jpg`, singles `truck-HHHHH-sun|away.jpg`, `peak-…`).

## Rules for this work (owner's standing hold: low-power mode)

- **Self-screenshots are allowed** for lighting work, one Chrome at a time via `tools/chrome-slot.sh`.
- **No gates, soaks or smokes** while the hold is on. Round 1 ran 11 affected gates and `test/cdp-smoke.mjs`,
  which the owner had not allowed. Don't repeat it; the orchestrator lifts the hold.
- Commit WIP at every step on the branch (`git commit -- <paths>`). Never touch main, never push.
- Don't save into the worktree while the owner is looking at :3890: a save reloads their page. Ask the orchestrator first.
- Report to the orchestrator (cargame-c8), not the owner. Gloss code/GPU terms inline (CLAUDE.md § Communicating).

## The architecture (round 1)

All in `src/sky.js` (rewritten); wiring in `src/main.js`.

1. **Real sun and moon** for 37.4° N on 21 June. Sunrise 05:33, sunset 20:18, noon sun 76°, full dark 21:18–04:33.
   Moon on the ecliptic at its phase angle; brightness by the measured phase law (full ≈ 10× quarter). Stars turn
   with sidereal time.
2. **Atmosphere integrated on the CPU** at each clock push (1.5–2.7 ms, about every 6 real seconds in story mode):
   Rayleigh + Mie + ozone + multiple scattering (Hillaire 2020, isotropic assumption), 16 samples per ray, baked
   into a 64×32 half-float sky table (`LUT_TEX`). The multiple-scatter table (`PSI`) costs ~20 ms, rebuilt only
   when the haze changes.
3. **Fog = a lookup into the sky** in the view direction (`HAZE_GLSL`), shared with the sky dome. The lowest rows
   repeat the sky at 2° (`HORIZON_Y`). Pixels under ~20 m of fog skip the lookup.
   Fog = "haze or edge, whichever is thicker". The edge term ramps from 0.6 × the built radius to full at the
   radius (~152 m on Normal). Haze densities were halved per quality tier in `main.js` (Normal 0.006 → 0.003).
4. **Ground light from the same model:** the sun's direct light is the transmitted sunlight; the ambient fill is the
   sky's irradiance × `skyGain`; the key light at night is the moon.
5. **Eye model on top:**
   - adaptation γ (`adapt`) with a night roll-off (`nightDark`);
   - rod-vision desaturation toward `NIGHT_TINT`, per colour by its own brightness;
   - partial white balance (`WB_ADAPT` 0.5, `WB_STRENGTH` 0.5);
   - `saturation` 0.82;
   - its own tone curve in place of ACES (keeps hues).
6. **POI ring curtains** are a lit (Lambert) material plus a daylight glow, so the headlights light them.

**The knobs** are in `SKY_PARAMS` (sky.js ~l.102): `aod` 0.02, `hazeAfternoon` 0.5, `multiScatter` 1, `skyGain`
2.5, `ambient` 1, `saturation` 0.82, `exposure` 1.25, `adapt` 0.16, `nightDark` 0.021, `glare` 6e-4, `glareG` 0.93,
`sunSize` 1.2, `stars` 1. The quality-tier `fogDensity` values are in main.js `QUALITY_PRESETS`.

New gate `test/sky-ephemeris.mjs` (registered in `test/gates.mjs`) pins the sun and moon hours.

## The owner's notes on round 1 (2026-11-08 ~21:30, verbatim)

> impressive first pass i dont hate it at all. fog looks like it appears far away but very suddenly it hides the
> edge of the world much better. i might prefer if it fades in a little closer to the player. the color is nice. it
> could maybe be a teensy bit bluer but not bothered by it. the colors of terrain and esp the truck look a little
> washed out compared to before. the shadows are also a lot brighter. overall there is less contrast. i would say as
> far as subjects the rebuild looks like a raw photo and the legacy looks like you put the same pic through
> lightroom. i prefer the stylized more contrasty image of the legacy see if we can push the rebuild in that
> direction. crush the shadows and pump the saturation a little i suspect it has to do with the "eye adaptation"
> sunrise and sunset skybox colors are epic. the desaturated subject look remains. nighttime: the stars are epic.
> there is practically no difference between new moon and full moon apparent brightness probably from the eye
> autoexposure. gotta fix that. also the headlights are way overpowered now probably from the same autoexposure. i
> can see like an entire mountain if the lights are shining. gotta fix that too.

The same notes and the owner's notes on the legacy build are in `.planning/todos/pending/feat-180-lighting-review.md`
§ Round 3 review.

## Round 2: do this

1. **Contrast and saturation on the subjects (terrain, the truck).** "Raw photo" vs "through Lightroom": shadows
   too bright, colours washed out. Suspects, in order:
   - `skyGain` 2.5 lifts the fill, so the shadows get brighter;
   - `ambient` (the fill);
   - `saturation` 0.82 applied to the light, which tints every albedo;
   - the replacement tone curve's toe (the dark end of the curve) being too soft;
   - `exposure`/`adapt` lifting the dark end.
   Crush the shadows (lower fill against the key light) and add saturation to the lit subjects. **Keep** the
   sunrise/sunset sky colours and the stars exactly as they are ("epic"). Compare side by side with :3887 (Spare's
   build, the owner's contrast reference). Screenshot both at the same hour and spot.
2. **Moon phase must read at night.** Full moon vs new moon look almost the same, because the eye adaptation
   normalises the brightness away. The owner loves the legacy's full-moon and new-moon brightness and "how
   challenging the visibility at nighttime is". Cap or remove adaptation in the dark, so a new-moon night is dark
   and a full-moon night is visibly brighter. Calibrate against :3887 at 23:00 with moon phase 0 and 0.5.
3. **Headlights are overpowered** ("i can see like an entire mountain"), same cause: the adapted exposure
   multiplies the headlight light at night. Headlight reach should match the legacy build.
4. **Fog fades in closer to the player**, not a sudden wall at the edge: start the edge ramp earlier (the 0.6 ×
   radius start) and/or give back some haze density. It must still hide the world edge. "A teensy bit bluer" is
   optional.
5. Then a contact sheet like round 1 (same hours and spots, plus 23:00 at moon 0 / 0.25 / 0.5, and a headlight
   frame at night), and report to the orchestrator: what changed, the knob values, before → after, frame cost.

Known gaps from round 1, unchanged: no clouds; random stars; moon ignores its orbital drift and 5° tilt; 05:00 is
peach-lilac; the clock steps the sun ~1.5° every 6 s; the tone curve changed how every asset looks (menu included);
conflicts with Spare's FEAT-180 work in `sky.js` and `main.js`.

## Round 2 done (2026-11-08 late, second agent)

Branch at **9fc6900d** (022a7499, 518125e5, 1b3be8bd, 9fc6900d), only `src/sky.js` + `src/main.js`. No gates ran
(hold); `sky-ephemeris` is owed a run when it lifts.

- **Land and sky now have separate grades.**
  - Land and truck go through ACES at the legacy exposure (0.5 day → 0.36 night) and adapt much less. The land
    keeps the light's colour cast, sunlit ground is warmer, and the ground bounce is cut to 0.35.
  - The sky keeps round 1's curve, grade and adaptation, so the sunrise/sunset sky and the stars are unchanged.
- **Moon:** the eye adapts away only 15 % of moonlight (`moonAdapt`). Full is ×1.7 the new moon's land
  brightness; the legacy is ×2.0.
- **Headlights:** match the legacy (0.0073 just ahead at new moon on both). No headlight code changed; round 1's
  adapted exposure was multiplying them.
- **Fog:** the edge ramp starts at 0.4 × r (was 0.6), haze up a third per tier (Normal 0.003 → 0.004).
- **Night fog cap** (`nightFog` 0.55 × flat-ground brightness after twilight; the stars and discs are added after
  it). This fixed the owner's mid-round note: night fog had been 4–8× brighter than the land under it.
- **New knobs** (debug GUI "Land (ACES)" folder, `moonAdapt` under Atmosphere): `landGain` 2.0, `moonAdapt`
  0.15, `landDepth` 1.62, `landTwilight` 2.0, `warmth` 0.2, `landCast` 1.0, `nightBlue` 1.5, `bounce` 0.35,
  `nightFog` 0.55.
- **Sheets:**
  `/private/tmp/claude-501/-Users-ledogen-CodeShit-CarGame/f08f9df1-2394-4364-9acc-a863a66bda88/scratchpad/r2/sheets/`
  (`sheet-drive`, `sheet-truck`, `sheet-peak`, `sheet-car`). The legacy column is Spare's ROUND 3 (0be79cae), not
  round 4.
- **Frame:** 6.9–7.2 ms GPU-complete at 1920×993; fog 0.25–0.33 ms, sky 0.1–0.2 ms; CPU push 1.83 ms.
- **Gaps:**
  - moonlit sky and fog are grey where the legacy's are blue;
  - the 20:00 land orange is weaker than the legacy's (saturation 0.21 vs 0.55);
  - dusk land facing the sun is darker than the fog behind it (`landTwilight` also moves golden hour);
  - distant grass is less saturated;
  - the POI ring glow is dimmer under ACES (`RING_GLOW` not retuned);
  - 05:00 is twilight here (sunrise 05:33) while the legacy is still dark;
  - round 1's gaps stand.

## Round 3 done (2026-11-09 early, same agent)

Branch at **5bfea3f5**, only `src/sky.js`. No gates ran (hold).

- **The sky has its own eye curve:** `skyAdapt` 0.45, `skyDepth` 1.3, `skyTwilight` 0.72 (replacing `adapt`/`nightDark`).
- **Sky exposure** 1.7, `skySat` 1.0, `skyCast` 0.5.
- **The tone curve's shoulder** (its top roll-off) now runs per colour channel, with whitening 0.3. This fixed both the murky noon fog and the hard-edged glow.
- **Teal twilight grade:** `duskSat` 0.3, `dusk` 1.3. A stylistic grade, not physics.
- **"Land beyond":** below the horizon the fog darkens to ≤ `beyond` (1.5) × flat ground at twilight only.
- Below-horizon fog is looked up by angle to the sun.
- **Stars** at a fixed displayed brightness, `stars` 2.5, which roughly doubled the visible count. Night has its own table set to
  `nightFog` × land.
- **Sky colour error vs legacy round 4:** mean 96.4 → 28.5 over 8 hours.
- Sheets: `…/scratchpad/r3/sheets/` (legacy r4 | r2 | r3).
- **Gaps:**
  - the anti-sun dusk sky is teal over a khaki band, where the legacy's is near-black;
  - the glow toward the sun is narrower than the legacy's;
  - the core on the horizon is yellow-white, where the legacy's is orange;
  - the land beyond is olive, where the legacy's is mauve;
  - the land's golden-hour orange is still weak;
  - the twilight moon disc is faint;
  - the CPU sky push read 10 ms at load average 6.5 (1.83 ms idle in round 2), so re-measure it idle.
- **Gate check (orchestrator, 11-09 ~01:10, on 5bfea3f5):** `node test/sky-ephemeris.mjs` → the 7 sun/moon
  schedule checks pass, and 4 brightness-ladder checks FAIL. They were written for round 1's single eye curve:
  noon white 1.72 vs ~1, sunset 0.12 vs 25–70 %, moonless 3.0 % vs < 1 %, full moon 11 % vs 1–5 %. Rounds 2–3 split
  the land and sky curves, so re-pin the ladder to the land's displayed brightness (or measure both) before this
  branch could land.
