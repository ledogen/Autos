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
  WAV to restore. It is declared in `vulcan30.mr` as `dry_ir`, at volume 0.01 (the library's own
  scale). The level is brought up with Z.
- **Stock (reference takes):** `ir_lib.mild_exhaust_0_reverb` = `new/mild_exhaust_reverb.wav`, at
  library volume 0.01. This is what the V6 example shipped with. A copy is at
  `ir/mild_exhaust_reverb.flac` (44.1 kHz, 16-bit, 42,415 samples).
- The switch is the two `impulse_response:` lines, in `exhaust0` and `exhaust1`. Keep them the same.
- **The stock IR is mostly a steep low-pass.** It peaks at 80–160 Hz and is −7 dB one octave up. It is
  −22 dB at 640–1280 Hz, −26 dB at 1.3–2.6 kHz and −50 dB at the top. So dry is 20–40 dB brighter
  than stock above ~600 Hz. That is expected, and the game's exhaust model has to supply that
  roll-off.
- Dry vs stock A/B at 2340 rpm:

## Noise knobs must be ZERO for dry takes
- engine-sim adds synthetic flow noise: B = HF noise, V = LF noise. It appears to be mixed in
  **before** the IR. The stock IR's low-pass hides most of it.
- With the unit impulse, the noise comes through unfiltered. It is a constant fuzz at about the same
  level from idle to WOT, so at idle it sounds as loud as the engine.
- This was the "crunch" that cost an afternoon. Fixes that did **not** help: a quieter dry IR, a higher
  simulation frequency (N), and gentle treble-cut IRs. B and V at 0 fixed it at once.
- The reference takes use B = V = 0 as well, so each dry/stock pair differs only in the IR.
- If the truck needs breath noise, the game can add it after its muffler.

## Locked knob values (set once at 5500 full, dry IR, never changed)
- Volume:
- Convolution: fully wet =
- HF gain:
- LF noise (V): 0
- HF noise (B): 0
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
  - dry IR on both exhausts
- Left as base: cams 222/226° @ 0.050, rod length, intake, idle plate 0.994, vehicle, transmission,
  and the whole exhaust layout (see the deviation below).
- With B = V = 0 and the dry IR, the owner's verdict was "sounds pretty good".

## DEVIATION from the brief: two exhausts, not one Y-pipe
- The brief asked for both banks into **one** short exhaust system (the Y-pipe), stopping there.
- That was built and tested: one exhaust for all six cylinders, 8 in primaries, a 30 in collector,
  and +12 in left-bank crossover. With noise at zero it sounded **heavily muffled**. With all six
  cylinders' pulses through one short collector, the pulses lose their edge, so in the sim it acts
  like a restriction.
- Kept instead: the example's layout. That is **one exhaust per bank** (`exhaust0` right,
  `exhaust1` left), with 20 in primaries and a 100 in collector each. The owner A/B'd it and chose it.
- Why it should not matter for the game: engine-sim mixes both outlets into one mono signal anyway.
  The loops stay dry. The game's exhaust model (Y-pipe, cat, muffler, tail) applies after the
  pitch-shift as planned. What is lost is the sim's own Y-pipe pulse interaction. That is a subtle
  tonal detail, and it was not worth the muffling.
- The Y-pipe variant is in git history (stage 1 commit `cc4eab97`, with dry volume 0.2) if the Mac
  wants to revisit it.
- Dyno torque check (target ≈ 250 N·m @ 3750, ≈ 145 hp @ 4750):
- Sound check (stock IR, idle and 4000 full):

## Free idle
- Settled rpm (dry):
- Settled rpm (stock):

## Anything odd
- engine-sim renders at 44.1 kHz, the same rate as its IRs (to confirm in Audacity). The brief asks
  for 48 kHz. Recording at 48 kHz means Windows resamples engine-sim's output on the way to the
  loopback. The cutter accepts either rate and writes the real one into `manifest.json`.
