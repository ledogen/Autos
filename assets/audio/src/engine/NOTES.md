# engine-sim bake — notes (FEAT-120)

Brief: `.planning/handoffs/HANDOFF-2026-10-17-engine-sim-bake.md`. Baked on the Windows desktop.

## How the takes are made now (not loopback recording)
- **Headless renderer, not Audacity.** `engine-sim-render.exe` is a small command-line tool built
  from engine-sim's own source at the **v0.1.11a** tag. That is the same version as the app, so it
  reads the same `.mr` files. It runs the simulation offline and writes each take straight to a
  32-bit float WAV at 44.1 kHz. There is no window, no audio device and no loopback.
- **One command:** `python bake.py all`. It renders every take, locks levels, writes `raw/*.flac` and
  `takes.csv`, cuts the loops, writes `manifest.json`, exports the stock IR as engine-sim applies it,
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
- **Free idle hunts** (670–763 rpm dry, 687–766 stock), so its loop can't seam (seam corr ≈ 0). Use
  the 750 grid loops for idle until the idle is tuned (`idle_throttle_plate_position`, 0.994).
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
