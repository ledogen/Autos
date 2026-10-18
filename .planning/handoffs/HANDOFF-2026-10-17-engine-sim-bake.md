# HANDOFF 2026-10-17 — Engine-sim sound bake (Windows session)

**For:** a Claude Code session on the owner's Windows desktop.
**Ticket:** FEAT-120, rows *Engine* and *Engine muffler reference* (section "Engine bake").
**Branch:** `feature/engine-audio` on `origin` (github.com/ledogen/Autos). The Mac works the same branch
in its worktree `CarGame-engine-audio`. No dev server is needed on Windows.
**You touch only `assets/audio/`.** `src/`, `vite.config.js` and runtime playback are the Mac's job.

## The owner

An engineer, not a programmer. Fluent in vehicle dynamics, maths and git. When you name a
programming or audio-tooling term, gloss it in one clause and keep going. One idea per sentence.

## 0. Git — how files travel

The takes are committed to git as **FLAC** (a lossless compressed audio format, about half the size
of WAV, read natively by browsers and by Python's `soundfile`). This is deliberate: the game is played
from GitHub Pages, so whatever it plays must be in the repo. Raw takes are committed too, as source
material, the same way the `.blend` files sit in `assets/models/src/`. The repo is set up for this:

- `.gitattributes` marks `*.flac` / `*.wav` as binary, so Windows line-ending conversion
  (`core.autocrlf`) never corrupts a take.
- `.gitignore` refuses `*.wav` anywhere under `assets/audio/`. That's a guard so a stray WAV export
  can't double the history cost. **If `git status` doesn't show a file you expected, check whether
  it's a WAV.**

Setup, once:

```
git clone git@github.com:ledogen/Autos.git     # or `git fetch` in an existing clone
cd Autos
git switch feature/engine-audio
```

Every time you hand something back:

```
git pull --rebase
git add assets/audio
git commit -m "feat(120): engine bake — <what>"
git push
```

Commit in stages, not at the very end. A good order: the engine script and NOTES first, then the raw
takes, then the loops and manifest. Then the Mac can start integration before the grid is finished.
The Mac only edits outside `assets/audio/`, so the two sides never conflict.

## 1. Get engine-sim

- Download the prebuilt Windows release from https://github.com/ange-yaghi/engine-sim Releases. Do not
  build from source unless the release will not run.
- Read the `LICENSE` and the README before anything else. Confirm the licence allows shipping the
  recorded audio in a game. Write the licence name into `NOTES.md`. **If it doesn't allow shipping,
  stop and tell the owner.**
- Read the README's key bindings. You need: ignition, starter, throttle, dyno on/off, RPM hold,
  hold-speed adjust, and script reload. You also need the audio knobs: volume, convolution level,
  high-frequency gain and the noise levels. Write the ones you use into `NOTES.md`.
- Engines are defined in `.mr` script files under `assets/`. `assets/main.mr` picks which engine,
  vehicle and transmission load.

## 2. Model the engine

The game's engine is the **2002 Ranger 3.0 L Vulcan V6** (`data/engines.js`, `vulcan30`). An older line
in FEAT-120 said "4.0 Cologne"; that was stale.

| Spec | Value |
|---|---|
| Layout | 60° V6, even-firing (offset crankpins), OHV pushrod, 2 valves/cyl |
| Bore × stroke | 89.0 × 80.0 mm (2.99 L) |
| Compression | ~9.1 : 1 |
| Firing order | 1-4-2-5-3-6 (Ford numbering: 1-2-3 right bank front→rear, 4-5-6 left bank) |
| Exhaust (sim side) | two cast manifolds → Y-pipe. **Stop there.** The cat, muffler and tailpipe are the game's (§3) |
| Idle / redline | 750 / 5500 rpm (game values) |
| Torque (sanity check only) | ≈ 250 N·m @ 3750, ≈ 145 hp @ 4750 |

Steps:

1. Copy the bundled example engine closest to this layout (a V6 if one exists; otherwise any
   V-engine) to a new `vulcan30.mr`. Edit bank angle, cylinder count, firing order, bore, stroke,
   compression and exhaust layout to the table above. Both banks feed **one** exhaust system: that's
   the Y-pipe. Leave the runner lengths short, because cast log manifolds are short.
2. Set the sim's rev limiter to **≥ 6000 rpm** so the 5500 point holds clean, without limiter cuts.
3. Point `assets/main.mr` at it and reload.
4. Sound matters, not the dyno number. If torque on the sim's dyno is within ~20 % of the curve
   above, stop tuning. Do not spend the afternoon chasing horsepower.
5. Listen at idle and at full-throttle 4000, **with the stock muffler impulse response still on**
   (§3 explains). It should sound like a mild, slightly lumpy pickup V6, not a race engine. If the
   cam profile is aggressive (race example engine), soften it.

## 3. The exhaust split — record dry

**The game supplies the muffler.** The point is swappable parts. One dry engine recording plus a
muffler model on the game side means a new exhaust never needs a new recording. There's a physics
bonus as well. The game pitch-shifts each loop to fill the gaps between rpm points. The muffler is
applied *after* that shift, so its resonances stay fixed in Hz. A muffler baked into the take would
have its resonances dragged up and down with the playback rate.

How engine-sim makes sound: it simulates the gas pulse at the exhaust outlet. Then it convolves that
pulse with an **impulse response**, or IR. An IR is a short WAV that records how a muffler or space
responds to a single click. Convolving with it (running the signal through that echo fingerprint)
applies that muffler's character. The exhaust system node in the `.mr` script names its IR (look for
`impulse_response`; the IR WAVs live in engine-sim's sound library folder).

- **Dry = a unit impulse IR.** A unit impulse is a single sample at 1.0 followed by silence.
  Convolving with it returns the signal unchanged. Make one with the cutter's Python environment:
  `soundfile.write("dirac.wav", numpy.r_[1.0, numpy.zeros(4799)], 48000, subtype="PCM_24")`. Put it
  beside the library IRs, then declare and use it the same way the script declares the stock one.
  Read the library's `impulse_response` node definition for the exact syntax. Set convolution level
  to fully wet, so the output is 100 % through the IR. With a unit impulse, that's 100 % dry.
- **Reference = the stock IR.** Whatever the example engine shipped with. Note its file name in
  `NOTES.md`, and copy that IR into `assets/audio/src/engine/ir/` as FLAC. The Mac may use it as the
  first convolution muffler.
- Sanity check before recording the grid: A/B dry against stock at 2340 rpm. Dry should sound harsher
  and more "raw pipe" (more top end, sharper pulses). If they sound identical, the IR swap didn't
  take.

## 4. Capture setup (no extra driver needed)

engine-sim has no file export, so record its audio output with a **loopback** device, meaning a
recording input that captures whatever the computer is playing.

- Install **Audacity**. In Audio Setup: Host = **Windows WASAPI**, Recording device = the
  speakers/headphones entry marked **(loopback)**. Project rate **48000 Hz**. Mono is fine (one
  exhaust outlet). If engine-sim outputs stereo, mix to mono.
- Set the Windows output device to 48 kHz too (Sound settings → device properties → Advanced), so
  nothing is resampled.
- Silence notifications and every other app. Anything the PC plays lands in the take.
- **Level once, then lock it.** Use the dry IR, full throttle at 5500 under dyno hold (the loudest
  point). Adjust engine-sim's volume so Audacity peaks around **−3 dBFS** (dB below digital full
  scale; 0 is clipping). Then never touch the volume, convolution, high-frequency or noise knobs
  again for the whole grid. The game crossfades between recordings, so the relative levels must be
  real. Write every knob value into `NOTES.md`.
- The reference takes (§5) keep the same knobs. Only the IR changes. If a stock-IR take clips, lower
  the volume for the reference takes only, and write the exact dB change into `NOTES.md` so the Mac
  can undo it.

## 5. The takes — 25 dry + 3 reference

Use **dyno + RPM hold**, which holds the crank at a set speed regardless of throttle, so each take is
a true steady state.

**RPM points** are spaced geometrically (equal ratio, ≈ 1.33 between neighbours). With a crossfade at
the geometric midpoint, no loop is ever pitch-shifted more than about ±15 %. Beyond that, the
pitch-shift starts to sound artificial.

`750 · 1000 · 1325 · 1760 · 2340 · 3110 · 4140 · 5500` rpm

**Loads** at every RPM point (dry IR):

| Load | Throttle | What it is |
|---|---|---|
| `off`  | 0 % | overrun: the dyno drives the engine with the throttle shut |
| `part` | one fixed value, ~30 % | cruise. Pick it once and use the same value at every rpm |
| `full` | 100 % | wide open |

Plus **free idle** (dry): dyno off, throttle 0, let it settle, note the rpm it settles at.

Plus **3 reference takes with the stock IR**: free idle, `2340_part`, `4140_full`. Same throttle values
as their dry twins, so each one A/Bs directly against a dry loop.

Each take: let the rpm settle for ~2 s, then record **≥ 5 s**. Note the sim's displayed rpm for each
one. The dyno holds the target only approximately, and the measured value is what the game needs.

Export from Audacity as **FLAC**, 48 kHz, 24-bit. Never MP3: the encoder pads silence at both ends,
which puts a gap in every loop.

## 6. Cutting seamless loops

Each loop must be a **whole number of engine cycles**. One 4-stroke cycle is 2 revs, so the cycle
period is **T = 120 / rpm seconds** (0.16 s at 750, 0.0218 s at 5500). Any other length makes the
firing rhythm stumble at the seam.

Write `cutter.py` (numpy + soundfile; `pip install numpy soundfile`). Per raw take, it should:

1. Take the measured rpm as a first guess. Then refine the true cycle period by
   **autocorrelation**, meaning it finds the time shift at which the signal best matches itself.
   Search ±5 % around 120/rpm. Use that refined rpm in the manifest.
2. Pick a loop of **k cycles, with k chosen so the loop is ≈ 2 s**. Start it 1 s into the take, at
   a zero crossing.
3. Fine-tune the end point within ±2 ms to maximise correlation between the audio just after the
   start and the audio just after the end.
4. Apply a ~10 ms equal-power crossfade across the seam, using the audio that follows the loop
   end. Write the loop as FLAC.

Leave one runnable self-check in the script: synthesise a pulse train at a known rpm, run it
through the cutter, and assert that the refined rpm and the loop length come back right.

Cut the reference takes the same way.

Then **listen**. Open each loop in Audacity, loop playback (Shift+Space), and listen for a click
or a stumble at the seam. Re-cut any that fail by hand.

## 7. Where everything goes (commit all of it)

```
assets/audio/engine/                          ← SHIPS with the game
  vulcan30_<rpm>_<load>.flac                    24 grid loops, e.g. vulcan30_2340_part.flac
  vulcan30_idle_free.flac                       free-idle loop
  manifest.json
assets/audio/src/engine-muffler-reference/    ← never ships; the owner's A/B target
  vulcan30_idle_free_stock.flac
  vulcan30_2340_part_stock.flac
  vulcan30_4140_full_stock.flac
assets/audio/src/engine/                      ← never ships; source material
  raw/vulcan30_<rpm>_<load>.flac                all 25 dry raw takes
  raw/vulcan30_<...>_stock.flac                 the 3 reference raw takes
  ir/<stock-ir-name>.flac                       engine-sim's stock IR (§3)
  vulcan30.mr                                   the engine script as used
  cutter.py
  NOTES.md                                      engine-sim version + licence, every knob value,
                                                key bindings used, the stock IR's name, anything odd
```

The two loop folder names are what the dashboard reads. `npm run dash` → Sounds shows
`assets/audio/engine/` under the *Engine* card, and `assets/audio/src/engine-muffler-reference/` under
*Engine muffler reference*. Don't rename them.

`manifest.json`, one entry per grid loop (not the reference ones):

```json
{ "engine": "vulcan30", "sampleRate": 48000,
  "loops": [
    { "file": "vulcan30_2340_part.flac", "load": "part", "throttle": 0.30,
      "rpmTarget": 2340, "rpmMeasured": 2337.4, "cycles": 39, "samples": 96012 }
  ] }
```

`file` is relative to `assets/audio/engine/`. `load` is `off` | `part` | `full` | `idle` (the
free-idle take).

## Out of scope here

- Anything outside `assets/audio/`. The Mac does runtime playback: pick the nearest loops,
  `playbackRate = rpm / rpmMeasured`, crossfade by rpm and load, apply the muffler, and add
  `assets/audio/engine/` to the Vite copy plugin.
- Starter, catch and shutoff. Those are already synthesised (FEAT-33).
- Damaged-engine sounds (owner cut them).

## Done when

- [ ] Licence checked and recorded in `NOTES.md`.
- [ ] Dry vs stock IR sanity A/B passed (§3).
- [ ] 24 grid loops + 1 free-idle loop + 3 reference loops pass the listening check.
- [ ] Levels were locked across the whole dry grid; the loudest take peaks below −1 dBFS.
- [ ] `manifest.json` has a measured rpm for every grid loop.
- [ ] Everything in §7 committed and pushed to `feature/engine-audio`.
