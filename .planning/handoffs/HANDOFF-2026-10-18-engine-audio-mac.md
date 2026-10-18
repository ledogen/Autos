# HANDOFF 2026-10-18 — Engine audio, Mac side (FEAT-120 "Engine" + "Engine muffler reference")

**Worktree:** `/Users/ledogen/CodeShit/CarGame-engine-audio` · **branch:** `feature/engine-audio`
(pushed, tracks `origin`) · **port:** none yet; pick one with the worktree skill when you first run
`npm run dev` here. Do the work in this worktree, never on main.

## State

- Commit 5365a0b set the branch up:
  - `.gitattributes` marks `*.flac` / `*.wav` binary.
  - `.gitignore` refuses `assets/audio/**/*.wav`. The owner ruled that audio commits as FLAC, raw
    takes included (2026-10-17).
  - `tools/dashboard/index.mjs` `TAKE_DIRS` also reads `assets/audio/src/<slug>/`.
  - FEAT-120's engine rows were rewritten: cards `engine` and `engine-muffler-reference`, both wip.
- The Windows job sheet is `.planning/handoffs/HANDOFF-2026-10-17-engine-sim-bake.md`. It covers
  the Vulcan 3.0 model in engine-sim, a **dry** recording (the stock impulse response, or IR, swapped
  for a unit impulse), 8 geometric rpm points × off/part/full plus free idle = 25 loops, and 3
  stock-IR reference takes (idle, 2340 part, 4140 full).
- **The Windows session is already working** (3 commits by 2026-10-18; read
  `assets/audio/src/engine/NOTES.md` for the full log). It was not reachable by cross-session
  message from the Mac. No takes are recorded yet; `takes.csv` lists the 28 planned files. Facts
  that change Mac-side work:
  - engine-sim v0.1.11a, **MIT** licence. Shipping is fine.
  - **44.1 kHz, not 48** (the owner's call, to match engine-sim's IRs). Read the rate from
    `manifest.json`.
  - **Two exhausts (one per bank), not one Y-pipe.** The owner A/B'd and chose this, because a single
    short collector sounded muffled. engine-sim mixes both outlets to mono anyway.
  - Dry takes have the noise knobs at **0**. The reference takes use the **owner's target sound**:
    stock IR `mild_exhaust_reverb` + LF noise 1.0 + HF noise 0.3. So the game's exhaust model must
    supply the muffler roll-off **plus breath noise after the muffler**. A dry/stock pair differs in
    both IR and noise.
  - The stock IR is mostly a steep low-pass. It peaks at 80–160 Hz, is −22 dB at 640–1280 Hz and
    −50 dB at the top. That makes it a ready first muffler: `ir/mild_exhaust_reverb.flac` in a
    ConvolverNode.
  - `cutter.py` is written (`assets/audio/src/engine/`). Its self-check passes, and so does an
    end-to-end run on synthetic FLAC.
- **Windows reply, 2026-10-18 — the recording method changed.** 0 of 28 takes recorded. The owner
  approved a **headless renderer** in place of loopback recording. The reason: engine-sim's
  synthesizer (`src/synthesizer.cpp`) has an always-on "leveler". That's a fast compressor:
  gain = 30000 / peak, with the peak decaying 0.1 %/sample (~23 ms), clamped 1e-5 … 1.9×, then a
  hard clip to int16. It evens out idle vs WOT and pumps between firing pulses, so relative levels
  can't be locked through the app. The pumping was the "crunch".
  - The renderer pins the leveler to a fixed gain. `bake.py` (coming to `assets/audio/src/engine/`)
    renders, level-locks and cuts in one command. It applies ONE scale factor across the dry grid, so
    the loudest take peaks at −3 dBFS. The references get the same factor, unless that would push them
    past −1 dBFS; then they get their own, with the dB offset logged in `raw/render_log.json`.
  - Part throttle = 0.30. Convolution = 1.0 (fully wet). The Z/X knob values are moot now.
  - The sim's audio rate is hard-coded at 44100 (`simulator.cpp`).
  - **The dry signal is very bright and bass-light.** The stock IR is mostly a +40 dB low-frequency
    lift (its DC sum is +138). Dry loops sound thin and quiet at idle on their own, so the game's
    muffler must supply that lift. The stock IR as the first convolver does it.
  - Blocker at the time of writing: building engine-sim from source. Master's C++ doesn't match the
    v0.1.11a scripts, so it's being rebuilt at the v0.1.11a tag. No ETA. Once it renders, the grid
    is minutes of work.
  - The engine-sim fork lives OUTSIDE the repo, in a local clone on branch `autos-renderer`. **Open
    risk:** if that clone is lost, the takes can't be re-rendered. Ask for the fork's diff to be
    committed as a `.patch` under `assets/audio/src/engine/`.
  - **Open question for the owner:** the owner picked the target sound (stock IR, LF 1.0, HF 0.3)
    by ear THROUGH the leveler. The headless references have the leveler pinned, so they may sound
    different from what was approved. Have the owner re-listen to the rendered references before
    tuning the muffler to them.
- `git pull` in the worktree to see new takes.

## Owner rulings this round

- Transport: everything in git, as FLAC.
- Loads: 3 (off / part ~30 % / full).
- The muffler lives on the **game side**, so parts are swappable and nothing has to be re-recorded
  per exhaust. It is applied after the pitch-shift, so its resonances stay fixed in Hz.
- The owner wants to **hear the reference takes for comparison**. Today they're dashboard cards.
  Later: an A/B of dry loop + our muffler against the reference.

## Next, when takes land

1. Engine sample player in `src/engine-audio.js` (it replaces or layers the FEAT-23 oscillator
   drone). Load `assets/audio/engine/manifest.json` and pick the bracketing rpm and load loops.
   Set `playbackRate = rpm / rpmMeasured` and crossfade by rpm (at the geometric midpoint) and by
   load. Always-running looped sources with modulated gains; no per-frame node creation (FEAT-120
   acceptance).
2. Muffler stage after the mix. Start with the stock IR (`assets/audio/src/engine/ir/`) in a
   `ConvolverNode` (WebAudio's convolution node), or with a biquad filter chain. It must be a
   swappable part. Check SM-3 parts/items docs before inventing a part slot.
3. A dashboard preview driver (`tools/dashboard/app.html`, beside `engine-sweep`) that plays a dry
   loop through the muffler, A/B'd against its `_stock` reference.
4. Add `assets/audio/engine/` to the `vite.config.js` copy plugin (fetched by URL, like `.glb`). Never
   `assets/audio/src/`, which doesn't ship. Verify on a Pages build (FEAT-120 acceptance).
5. Volume/enable sliders beside the existing audio sliders.

## Messaging the Windows session

It doesn't show in ListAgents from the Mac. The owner relays by hand. Its job sheet is
`HANDOFF-2026-10-17-engine-sim-bake.md`, and its live state is `assets/audio/src/engine/NOTES.md`.
