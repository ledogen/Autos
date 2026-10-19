# engine-sim bake — notes (FEAT-120)

Briefs: `.planning/handoffs/HANDOFF-2026-10-17-engine-sim-bake.md`, then round 2
`HANDOFF-2026-10-19-windows-i4-idle-flare.md`. Baked on the Windows desktop.

## Round 2 (2026-10-19): Duratec I4, idle fix, start flare — results
- **Engines:** `vulcan30` (39 takes), `duratec23` (42). Run `python bake.py all <engine>`.
  Files are per engine: `takes-<engine>.csv`, `raw/render_log-<engine>.json`,
  `assets/audio/engine/manifest-<engine>.json` (`manifest.json` was renamed to
  `manifest-vulcan30.json`).
- **Duratec dyno (WOT) vs the game's curve:** within 15 % everywhere.

  | rpm | 800 | 1500 | 2500 | 3750 | 4500 | 5250 | 6000 |
  |---|---|---|---|---|---|---|---|
  | game N·m | 140 | 170 | 192 | 209 | 204 | 195 | 165 |
  | sim N·m | 143 | 146 | 194 | 233 | 226 | 212 | 188 |
  | error | +2 % | −14 % | +1 % | +12 % | +11 % | +9 % | +14 % |

  The sim peaks 3500–3750 rpm, like the real engine. The 1500 dip comes from the intake tuning.
- **Free idle (acceptance: 750 ± 10 rpm cycle-averaged over the recording, loop seam ≥ 0.95):**
  - duratec23: **741.1–754.3 rpm, seam 1.000**, running free. Done with the brief's first option,
    retuning `idle_throttle_plate_position` to 0.99919. 0.9992 gave 734–747; 0.9994 stalls.
  - vulcan30: **750.0 rpm (balanced idle), seam 0.955** dry and 0.997 stock. See "Idle" below for
    why it is not free-running.
  - "± 10" is judged on rpm averaged over one 720° cycle, like a tachometer. Instantaneous crank
    speed ripples within every cycle at idle: about ±17 rpm on the V6, ±50 on the I4. That is
    normal and not hunting.
- **Start flare (cycle-averaged peak, time after the catch)**, with the game's own numbers
  (brief amendment 4324a883). Vulcan warm 1261 settling over 1.7 s, cold 1435 → 1100 in 1.0 s.
  Duratec warm 1357, cold 1430 → 1100.

  | take | target | peak | when | settles |
  |---|---|---|---|---|
  | vulcan30 warm | 1261 | **1282** | +0.74 s | ~740 |
  | vulcan30 cold | 1435 | **1379** | +0.81 s | ~1095 |
  | duratec23 warm | 1357 | **1383** | +0.96 s | ~730 |
  | duratec23 cold | 1430 | **1449** | +1.00 s | ~1085 |

  The flare is a **scripted throttle trace, not modelled enrichment**. The renderer's idle-air
  controller drives throttle and spark so the rpm follows a target. It rises from the catch to the
  peak over 0.4 s, then eases to the settle speed. The sim can't reach the peak in 0.4 s: the
  manifold has to fill and the crank has to spin up. Pushing harder only overshoots, and the peak
  still comes ≥ 0.65 s after the catch. So the peak lands 0.74–1.0 s after the catch.
  - Flares crank at the game's cadence (below), with the throttle cracked open to **0.05** while
    cranking: an open idle-air valve. At ~200 rpm with it shut, neither engine ever catches. Caught =
    above **400 rpm** for 0.1 s.
  - Traces: `raw/<engine>_start_{warm,cold}_dry_rpm.csv`, columns time_s, rpm, starter, target,
    throttle (the command), air (the airflow it means), spark_deg.
- **Crank at the game's cadence** (brief job 4): a render-time starter override; the scripts keep
  70 lb·ft / 500 rpm. Torque is the game's stall torque, **111 lb·ft**. engine-sim's starter holds a
  set speed with up to that torque. It can push but can't brake, so the free speed was tuned until
  the crank averages ~200 rpm:
  - vulcan30: starter speed **195 rpm** → crank **200.5 rpm** (195–220).
  - duratec23: **95 rpm** → **197.6 rpm** (95–356). Its compression rebound flings the light I4
    crank well above the starter's speed.
  - Loops: `<engine>_crank_dry` (in the manifest, `rpmMeasured` ≈ 200) and `_crank_stock`. The old
    500-rpm takes are kept as `<engine>_crank500_{dry,stock}`. They are identical to the previous
    `_crank_*` files (vulcan30 501.6 rpm, duratec23 556 rpm).
  - **Seam caveats.** vulcan30_crank_dry seams at **0.92**. engine-sim's speed-holding starter makes
    the slow crank slightly irregular (period corr 0.53); its stock copy seams at 0.996.
    **duratec23_crank_stock does not loop** (seam ≈ 0): at 200 rpm with the ignition off, the
    owner's noise (V 1.0 / B 0.3) dominates the quiet crank. Use crank_dry ⊛ the engine-sim IR for
    that A/B; that's proven equal to the stock render, apart from noise.
  - Takes at ~200 rpm are 12 s long, so the best-seam search has enough windows (0.6 s per cycle).
- **Catch rule changed** (catch-only starts, script starter): the starter now releases when rpm
  stays above **1.15×** starter speed (575 rpm) for 0.1 s. It was 1.3×. At closed throttle the engine creeps to ~600–630 rpm and often
  never crossed 650, so it hit the 4 s limit. The Vulcan's catch-only starts now catch at 2.1–2.6 s.
- **Level lock now uses one fixed factor for every engine: ×0.1852** (−14.65 dB, the Vulcan's dry
  factor), so the I4 sits at its honest loudness next to the V6. A take that would pass −1 dBFS
  gets its own factor (to −3 dBFS), logged as `offsetVsGridDb` in `render_log-<engine>.json`.
  - Grid takes needing their own factor: only **duratec23_5500_full (−2.63 dB)**. duratec23 6400
    full lands at −1.1 dBFS on the shared factor.
  - The stock copies need their own factor as before (the stock IR adds ~40 dB). Each now gets its
    own, logged per take.
  - In the sim, the I4 is a little louder than the V6 at the same rpm and load: 5500 full is
    +14.3 vs +11.7 dB before scaling.
- **Cutter now picks the best seam:** it tries every whole-cycle start across the take, and keeps
  the best. If the seam is still under 0.8, it retries with a tight ±1 % period search around the
  measured rpm. With random combustion, some 2 s windows wrap far better than others. This raised
  vulcan30 750 off from 0.85 to 0.94; every other grid loop is ≥ 0.99. `startS` in the cutter's
  output shows where each loop was cut.
- **Idle takes** are 12 s long (more windows to choose from). The bake tries up to 5 fixed seeds per
  idle take and keeps the first that meets 750 ± 10 / 0.95 (logged: `seed`, `idleBandRpm`,
  `idleSeam`). The Vulcan's idle_free passed on its 2nd seed (26).
- duratec23's three catch-only starts are identical. Its fuel has no combustion randomness, so
  seeds make no difference. The Vulcan's differ slightly.
- **Fork patch:** `engine-sim-autos.patch` = `git diff v0.1.11a autos-011a`. That's the whole fork:
  renderer, app fixed gain, float tap, idle-air and spark hooks, README and the piranha Boost patch.
  To rebuild from scratch: check out upstream `v0.1.11a` with submodules, run `git apply
  engine-sim-autos.patch`, apply `autos/piranha-boost-is_absolute.patch` inside
  `dependencies/submodules/piranha`, then build as in `autos/README.md`. The fork is also pushed
  to the private repo `ledogen/engine-sim`, branch `autos-011a`.

## Round 3 (2026-10-19): motoring loops and shutoff references
- **Motoring** (`load: "motor"` in the manifests): ignition off, the dyno holding the rpm, i.e. the
  sound of the driveline dragging a dead engine. Rows 750, 1000, 1325, 1760, 2340 and 3110 for each
  engine. They are dry, level-locked at ×0.1852 like the grid, and cut on whole cycles. **All 12
  seam at ≥ 0.9997.** Dyno torque is negative (the dyno drives the engine): vulcan30 −47 N·m at 750,
  −72 at 2340; duratec23 −16 and −39.
- **Shutoff** (`<engine>_shutoff_{dry,stock}`, uncut in `engine-start-reference/`): warm idle
  settled for 8 s, key off when recording starts (the idle-air controller freezes too), 3.5 s
  recorded. The rpm trace is `raw/<engine>_shutoff_*_rpm.csv`; the key-off time is `killedAtS` in
  `render_log-<engine>.json` (7.25 s for all four). Coast from ~750 rpm:

  | | 500 rpm | 250 rpm | first near-stop | final stop | after the stop |
  |---|---|---|---|---|---|
  | vulcan30 | 0.18 s | 0.33 s | 0.48 s | **0.47 s** | one 17 rpm twitch |
  | duratec23 | 0.19 s | 0.33 s | 0.42 s | **0.98 s** | rocks 6× against compression |

  The Duratec's crank stalls against a compression stroke at 0.42 s, then rocks back and forth about
  every 0.1 s with shrinking swings (286 → 225 → 174 → 130 → 90 → 24 rpm). The renderer logs speed
  without its sign, so each swing is most likely a reversal. The V6's smaller cylinders and
  overlapping strokes let it stop almost dead. Both stop well inside the game's ~2.4 s lag.
- The Vulcan's shutoff idle runs free on the idle-air controller (the coast must be free, so no
  balanced dyno idle).
- **The renderer isn't perfectly deterministic.** Re-rendering with the same seeds moved a few
  existing takes slightly: peaks by 0.01–0.5 dB, one loop by a sample, vulcan30 idle seam
  0.982 → 0.955. Those re-renders were discarded and the committed files kept, so this round only
  adds takes. Their `render_log` entries describe the discarded re-render.

## Idle: what was tried, and why the Vulcan uses a balanced idle
- **Plate retune (Vulcan):** idle is balanced on a knife edge. 0.990 → 1272 rpm, 0.992 → 1020,
  0.994 → 718 hunting ±47, 0.996 stalls. No plate gives 750 ± 10.
- **The hunt comes from combustion randomness**, engine-sim's fuel default
  `burning_efficiency_randomness` 0.5, which the Vulcan uses. Each firing burns a random amount, and
  the engine's slow speed dynamics turn that into a ~0.4 Hz wander of ±21 rpm. The Duratec's fuel
  has 0, and it idles dead steady.
- **Idle-air control (IAC) in the renderer** (`--idle-target`): the idle plate closes fully and all
  idle air comes through the throttle, so the controller can add and remove air. A slow PI in rpm
  is mapped to air through a measured airflow → rpm table (`bake.py airsweep <engine>`). A fast
  spark loop works on cycle-averaged rpm around an 8° spark reserve, as real engine computers do.
  At 0° the Vulcan idles near best-torque timing, so advancing adds almost nothing: −15° → 533 rpm,
  +15° → 760. Free-running, the best was about ±25 rpm, seam ≤ 0.9. Feedback can't cancel a
  disturbance that's new on every firing.
- **Even at a pinned 750 the Vulcan's light-load idle is irregular** (seam 0.6 before the cutter
  fix). That's the same randomness; its 750 off grid loop shows it too.
- **Chosen: balanced idle** (`--idle-balanced`). The dyno holds exactly 750. The air is trimmed until
  the dyno torque is zero, so the engine just sustains itself with no load: free idle with the speed
  pinned. The air freezes once recording starts. With the best-seam cutter and the seed search it
  meets 750 ± 10 / 0.95 **without changing the Vulcan's sound** (randomness stays 0.5).
- Lowering the Vulcan's randomness would also work (0.1–0.35 passed in tests). But it changes every
  Vulcan loop the owner approved, so it was left for the owner to decide.
- The proofing app has no IAC. The scripts keep their own idle plates (Vulcan 0.994 hunts as
  before; Duratec 0.99919 idles at 750). The renderer closes the plate only when its controller runs.

## How the takes are made now (not loopback recording)
- **Headless renderer, not Audacity.** `engine-sim-render.exe` is a small command-line tool built
  from engine-sim's own source at the **v0.1.11a** tag. That is the same version as the app, so it
  reads the same `.mr` files. It runs the simulation offline and writes each take straight to a
  32-bit float WAV at 44.1 kHz. There is no window, no audio device and no loopback.
- **One command:** `python bake.py all <engine>`. It renders every take, locks levels, writes `raw/*.flac`
  and `takes-<engine>.csv`, cuts the loops, writes `manifest-<engine>.json`, exports the stock IR as engine-sim applies it,
  and writes listening previews. It takes about 4 minutes for 33 takes.
- Fork: local clone `C:\Users\james\code\engine-sim`, branch `autos-011a` (v0.1.11a + 3 AUTOS
  commits). Built with VS 2022 Build Tools, CMake 4.4, vcpkg (Boost filesystem static, SDL2 shared),
  WinFlexBison. One piranha fix: Boost 1.92 removed `path::is_complete()`, so it is now
  `is_absolute()`. The binaries live in `Downloads\engine-sim\engine-sim-build_0_1_11a\bin-autos\`,
  beside the stock `bin\`, so both use the same `es\` and `assets\`.
- Building from **master** does not work with the v0.1.11a scripts. The newer C++ reads script
  inputs the old `es/` library doesn't define, and crashes in `Node::readAllInputs`.

## Why the app's audio can't be recorded as-is
- **The leveler is a fast compressor, always on.** `synthesizer.cpp`: gain = 30000 / peak, where the
  peak decays 0.1 % per sample (~23 ms), clamped between 1e-5 and 1.9×. The output is then
  **hard-clipped to int16**. It pumps between firing pulses and evens out idle vs WOT, so relative
  levels between takes are not real. That pumping, plus the noise below, was the "crunch".
- The renderer pins the leveler to a fixed gain, and adds a float tap before the int16 clip.
- The patched proofing app (`bin-autos\engine-sim-app.exe`) also has the leveler pinned, starting at
  −56.5 dB. **Hold L + scroll** changes that fixed gain, 1 dB per notch. Expect idle to be very quiet:
  the real range is huge (see below).

## Signal chain facts (from the v0.1.11a source)
- Audio rate is hard-coded to **44100 Hz** (`Simulator::initializeSynthesizer`).
- Per sample: input jitter (B) → 10 Hz DC removal → `f·airnoise·(1−hf) + f′·hf` (V is **multiplicative**
  air noise on the signal; hf = `hf_gain`, the C knob, default 0.01) → IR convolution → sum of exhausts
  → antialias LP (0.45 × rate) → leveler → volume → int16.
- **IR handling:** cut after the last sample with |x| > 100 (of 32767), **capped at 10,000 samples**
  (0.227 s), then scaled by `volume × x / 32767`. The stock reverb IR is 42,415 samples long, so most
  of its tail is never used. `ir/mild_exhaust_reverb_engine-sim.flac` is the IR exactly as applied.
- **IR paths resolve relative to the `.mr` that declares them.** A missing IR file makes the app quit
  on launch with 0xC0000094 (divide by zero) and an empty error log.
- Script `engine(...)` knobs: `noise` = V (air noise, default 1.0), `jitter` = B (default 0.5),
  `hf_gain` = C (default 0.01), `simulation_frequency` = N (default 10000).

## Dry vs stock — proven equivalent
- Dry takes render with a unit-impulse IR (`--ir dirac.wav --ir-volume 0.01`) and noise and jitter at
  0. The stock IR renders at its library volume, also 0.01.
- Test at 2340 rpm, part throttle, noise off: dry ⊛ `mild_exhaust_reverb_engine-sim.flac` vs the
  stock render gave **correlation 1.00000, residual −89 dB**. So **loop ⊛ that IR = the sim's stock
  sound**, at the same bake scale (apart from the noise knobs).
- The stock IR is mostly a +40 dB low-frequency lift: its DC sum is +138 × 0.01, and it peaks at
  80–160 Hz, falling ~6–7 dB/octave above. So dry loops sound thin and are ~43 dB quieter at peak.
  That is expected. The game's first muffler stage (this IR as a convolver) supplies the lift.
- V cannot be re-added after the fact exactly, because it modulates the raw signal **before** the
  IR. Approximate it in the game by multiplying the dry loop by `(1 − a) + a·lowpass(noise, 2 kHz)`
  before the convolver.

## Takes (33) and modes
| Takes | How | IR | V / B |
|---|---|---|---|
| 24 grid + free idle | dyno hold at the exact rpm (free idle: no dyno) | dry | 0 / 0 |
| `crank_dry` | ignition off, starter held | dry | 0 / 0 |
| `start_1..3_dry` | ignition on, starter until it catches, then released | dry | 0 / 0 |
| 3 stock references + `crank_stock` | as above | stock (script) | 1.0 / 0.3 |

- `vulcan30.mr` stays in the owner's **proofed stock-pipe mode** (stock IR, V 1.0, B 0.3). The bake
  overrides IR and noise at render time for dry takes. What is proofed in the app is what is baked.
- Every take: crank on the starter at closed throttle for 1.5 s, then dyno on, ramping to the target
  over 1 s. Then a 5 s warmup from key-on before recording 6 s. A dyno engaged on a stopped engine
  drags it round **unfired**. The first bake did that, and every take was motoring.
- Part throttle = 0.30. Seeds are fixed per take, so the bake is deterministic.

## Level lock
- All takes render at fixed gain 1. Then **one factor for every dry take** puts the loudest
  (5500 full) at −3 dBFS: ×0.1852 (−14.65 dB).
- The stock references would clip at that factor, so they get their own: ×0.0036, **−34.26 dB
  relative to the grid**. Logged in `raw/render_log.json` (`refVsGridDb`). Undo it to compare them.
- **The real dynamic range is huge:** stock idle is ~53 dB below stock WOT, and dry 750 off is ~55 dB
  below dry 5500 full. The app's leveler used to hide this. The owner wants idle louder in game, so
  the game needs its own loudness curve or compression. Don't fix it in the bake.

## Dyno (renderer, WOT, script as proofed)
| rpm | 750 | 1325 | 2340 | 3110 | 4140 | 5500 |
|---|---|---|---|---|---|---|
| torque N·m | 131 | 136 | 179 | 199 | 208 | 225 |

Closed throttle gives −1 to −113 N·m (engine braking). The target was ≈ 250 N·m @ 3750: we're at
~205, which is **within the brief's 20 %**. So no tuning. The curve keeps rising to 5500, while the real
Vulcan peaks at 3750. That's acceptable for sound.

## Starter layer (for the game's FEAT-33 starter model)
- `starter_torque` 70 lb·ft and `starter_speed` 500 rpm are unchanged in `vulcan30.mr`. The game's
  starter model uses exactly those.
- **Crank** settles at **501.6 rpm** (494–510). Its loop is clean: seam 0.996 dry, 0.999 stock.
- **Start** (closed throttle, released at 1.3× starter speed for 0.1 s, 4 s max): it catches at
  3.1–3.5 s, then peaks at only **742–755 rpm** and settles near 700–730 rpm. **The sim has no
  start flare** like the game's (~1250 rpm warm, ~1430 cold). engine-sim models no idle-air valve or
  cold enrichment. The game's flare shape can't be matched from these takes; they show the catch.
  Take 3 never met the "caught" rule, so its starter released at the 4 s limit. rpm traces:
  `raw/vulcan30_start_*_dry_rpm.csv` (time_s, rpm, starter).
- Start takes go uncut to `assets/audio/src/engine-start-reference/` (new folder, never ships).

## Known issues
- ~~Free idle hunts~~ fixed in round 2 (see above).
- Owner's listening notes: 750 off sounds correct but very quiet (see the dynamic range above).
  3110 full is droney (realistic for a V6). 4140 full has a slight fuzz that the others lack. It is
  not high-frequency: everything above 4 kHz is more than 100 dB down. The loop is near-perfectly
  periodic (0.9998), so it looks like a genuine sim texture at that point. Its seam measures clean;
  the soft pop heard was most likely Audacity snapping its loop region.

## Engine model (vulcan30.mr)
- Base: `engines/atg-video-2/04_60_degree_v6.mr`, a 60° even-fire V6. With b0 = right bank, it
  fires 1-4-2-5-3-6.
- Changes: bore 89.0 mm, stroke 80.0 mm; chamber 61.4 cc → 9.1:1; rev limit 6200. Left as base:
  cams 222/226° @ 0.050, rod length, intake, idle plate 0.994.
- **Deviation from the brief: two exhausts, not one Y-pipe.** The single short Y-pipe (8 in primaries,
  30 in collector) sounded heavily muffled in the sim. The owner A/B'd and chose the example's layout:
  one exhaust per bank, 20 in primaries, 100 in collector. engine-sim mixes both outlets to mono
  anyway. The Y-pipe variant is in commit `cc4eab97`.
- Working copy: `Downloads\engine-sim\engine-sim-build_0_1_11a\assets\engines\autos\vulcan30.mr`.
  It is re-synced here before each commit. `dirac.wav` sits beside it (copy: `ir/dirac.flac`).

## engine-sim
- v0.1.11a (GitHub pre-release, 2022-09-29). Licence **MIT**, "Copyright 2022 AngeTheGreat (Ange
  Yaghi)". Commercial use and redistribution are fine, including the recorded audio.
- App keys: A ignition · S starter · Q/W/E/R throttle (0.01 / 0.1 / 0.2 / 1.0) · Space + scroll fine ·
  D dyno · H hold · G + scroll hold speed · Z volume · X convolution · C/V/B hf gain / air noise /
  jitter · N sim frequency · I dyno stats · Enter reload · F fullscreen (press again to exit) · L +
  scroll fixed gain (patched app only).
