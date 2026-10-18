# engine-sim bake — notes (FEAT-120)

Brief: `.planning/handoffs/HANDOFF-2026-10-17-engine-sim-bake.md`. Recorded on the Windows desktop.

## engine-sim
- Version: v0.1.11a (GitHub pre-release, 2022-09-29), `engine-sim-build_0_1_11a.zip`
  (33,016,770 bytes). Run `bin/engine-sim-app.exe`.
- Licence: **MIT**, "Copyright 2022 AngeTheGreat (Ange Yaghi)". No restriction on commercial use or
  redistribution, so shipping recorded audio is fine. `vulcan30.mr` is derived from an MIT example
  and keeps the copyright line in its header.

## Key bindings used
| Key | Does |
|---|---|
| A | ignition on/off |
| S | starter (hold) |
| Q / W / E / R | throttle steps |
| Space + scroll | fine throttle |
| D | dyno on/off |
| H | RPM hold (needs dyno on) |
| G + scroll | hold speed |
| Z + scroll | volume |
| X + scroll | convolution level: set fully wet, then do not touch |
| C / V / B + scroll | HF gain / LF noise / HF noise: do not touch after levelling |
| N + scroll | simulation frequency |
| I | dyno stats in info panel |
| Enter | reload engine script (in-app knobs reset on reload; re-enter them from below) |

## Impulse responses (IR)
- IR syntax, confirmed in `es/sound-library/impulse_responses.mr` and `es/objects/objects.mr`:
  `impulse_response(filename: "<path>", volume: <gain>)`.
- **Paths resolve relative to the `.mr` file that declares the IR**, not to a fixed library folder.
  The library's `"new/mild_exhaust.wav"` works because `impulse_responses.mr` sits in
  `es/sound-library/`.
- **A missing IR file crashes engine-sim on launch.** It exits with 0xC0000094 (integer divide by
  zero) and leaves `error_log.log` empty. Found the hard way.
- Library IRs are 44.1 kHz, 16-bit, mono.
- **Dry:** `dirac.wav` beside `vulcan30.mr` (in engine-sim's `assets/engines/autos/`). It is a unit
  impulse: 1.0, then 4409 zeros, at 44.1 kHz, 16-bit. A copy is at `ir/dirac.flac`; export it back to
  WAV to restore. It is declared in `vulcan30.mr` as `dry_ir`, at volume 0.2. That roughly matches
  the stock IR's loudness: 0.01 × √(energy 464 of `mild_exhaust.wav`).
- **Stock (reference takes):** `ir_lib.mild_exhaust_0_reverb` = `new/mild_exhaust_reverb.wav`, at
  library volume 0.01. This is what the V6 example shipped with. A copy is at
  `ir/mild_exhaust_reverb.flac` (44.1 kHz, 16-bit, 42,415 samples).
- The switch is the one `impulse_response:` line in `exhaust_system exhaust0`.
- Dry vs stock A/B at 2340 rpm:

## Locked knob values (set once at 5500 full, dry IR, never changed)
- Volume:
- Convolution: fully wet =
- HF gain:
- LF noise:
- HF noise:
- Simulation frequency:
- Part-load throttle value:
- Peak level at 5500 full: dBFS
- Reference takes volume change (only if a stock take clipped): dB

## Capture
- Audacity version:
- Host: Windows WASAPI, device: (loopback)
- Project rate: Hz, channels:
- Windows output device format: Hz

## Engine model (vulcan30.mr)
- Working copy runs from `Downloads\engine-sim\engine-sim-build_0_1_11a\assets\engines\autos\`.
  The copy here is re-synced before each commit. `assets\main.mr` imports it, and
  `main.mr.orig` is the untouched original.
- Copied from: `engines/atg-video-2/04_60_degree_v6.mr`. It is a 60° even-fire V6 with offset
  crankpins, firing alternate banks front→rear. With b0 = right bank, that is 1-4-2-5-3-6.
- Changes:
  - bore 89.0 mm, stroke 80.0 mm
  - chamber 61.4 cc → 9.1 : 1
  - rev limit 6200 rpm
  - both banks into one exhaust system (the Y-pipe), length 30 in; it stops there
  - primary tube 8 in (short cast logs), left bank +12 in crossover
  - dry IR
- Left as base: cams 222/226° @ 0.050, rod length, intake, idle plate 0.994, vehicle, transmission.
- Dyno torque check (target ≈ 250 N·m @ 3750, ≈ 145 hp @ 4750):
- Sound check (stock IR, idle and 4000 full):

## Free idle
- Settled rpm (dry):
- Settled rpm (stock):

## Anything odd
- engine-sim renders at 44.1 kHz, the same rate as its IRs (to confirm in Audacity). The brief asks
  for 48 kHz. Recording at 48 kHz means Windows resamples engine-sim's output on the way to the
  loopback. The cutter accepts either rate and writes the real one into `manifest.json`.
