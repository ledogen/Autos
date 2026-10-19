# HANDOFF 2026-10-19 — starter-sounds merged into engine-audio; the starter-sound plan (FEAT-120)

**Worktree:** `/Users/ledogen/CodeShit/CarGame-engine-audio` · **branch:** `feature/engine-audio` ·
**port:** 3102 (`node node_modules/vite/bin/vite.js --port 3102 --strictPort` from the worktree).
Work here, never on main. `feature/starter-sounds` (worktree `CarGame-starter-sounds`, port 3429) is
merged in and can be retired once the owner says so.

## State

- `a74299b` merges `feature/starter-sounds`. The crank is now real dynamics (`drivetrain.js`
  `stepStart`): a starter torque line, a compression ripple, a catch flare fed by the full intake
  manifold, and idle-air control with cold fast idle. Measured by `test/ignition-starter.mjs`:
  - Cranking: 183 rpm cold, 207 warm, ±30 % ripple.
  - V6 flare: 1261 rpm warm, settling in 1.7 s. Cold: 1435, settling onto the 1100 fast idle in 1.0 s.
  - I4 flare: 1357 rpm warm.
- The merge DROPS `70cb079` (my scripted x·e^(1−x) flare from earlier today). The crank model makes the
  same curve without scripting it. Don't bring it back.
- `ad13ee5`: the Idle Lift default is 0.55 (was 0.5). It's about +2.8 dB at idle, and full throttle is
  unchanged.
- Gates on the merge: 62/64 pass. The two reds, road-tunnel and road-clearance, are the known reds on
  main. The ignition gate passes, `fingerprint-physics` is identical, and `cdp-smoke` passes.
- The Windows brief is `HANDOFF-2026-10-19-windows-i4-idle-flare.md`. It has 5 jobs:
  1. the Duratec I4 bake
  2. the free-idle hunt
  3. start-flare recordings, matched to the numbers above
  4. **crank re-rendered at the game's ~200 rpm** (new: engine-sim cranks at 501.6 rpm, so the game
     would play it at ×0.4)
  5. commit the engine-sim fork's diff as a `.patch`

## The starter sound — the owner wants it fixed without leaving the desk

**Synthesis is closed.** The starter branch tried four synth voices: gear whine, a noise band, a
motor growl, and a commutator buzz fitted to 0.2 dB per third-octave against a real 2000 Ranger. The
owner rejected all four. Don't re-propose them. The FEAT-33 synth crank is still what plays.
The Ranger clip, `CarGame/wip/audio/starter-crank-and-catch/reference-2000-ranger-cold-start.wav`
(3.5 s), has **no provenance** (no record of where it came from). It's a fit reference only. Never
ship it.

The plan has two layers. Each is a looped sample, played with
`playbackRate = live crank rpm / recorded rpm` and gated by `ignition.state === 'cranking'`. Build it
the same way the baked engine loops are built: always-running sources with modulated gains.

1. **Engine layer: the engine-sim crank** (Windows job 4). It has the compression chug and the
   exhaust pulses, which is most of what a crank sounds like from the cab. Route it through the
   muffler convolver like the grid loops, so cabin and chase come for free.
2. **Starter-motor layer: a CC0 library recording** (CC0 = public domain, ship it with no credit owed).
   It covers the whine and the pinion mesh that engine-sim doesn't model. The owner auditions these
   on the site; downloading the original needs a free Freesound login:
   - [Car not starting.wav — Ika.Komura, #520773](https://freesound.org/people/Ika.Komura/sounds/520773/):
     20 s of cranking with no catch. The best fit.
   - [cranks-but-not-start.mp3 — drdeath666, #687447](https://freesound.org/people/drdeath666/sounds/687447/):
     8.5 s, but an 81 kbps MP3 (lossy and low quality).
   - Shorter clips, each ending in a catch: #579213 (VW Bug, 7 s) and #322974 (Volvo 245, 7 s).
   - **Watch the rhythm.** A library crank carries its own engine's compression pulse: cylinders/2
     pulses per rev. If its pulse rate fights the game's ripple, play it at
     `(rpm·cyl/120) / recordedPulseHz` instead of the rpm ratio. That puts its chug on the tach's
     ripple. Measure the pulse rate with the `ffmpeg -f f32le` decode in node (no numpy on the Mac).
   - Every take goes to `wip/audio/<slug>/` first. That lets the dashboard's Sounds tab play it inline.
3. **Fallback: phone recording of the owner's Corolla** (~15 min outside).
   - Pull the EFI or fuel-pump fuse (the fuse-box lid or the owner's manual names it), so it cranks
     without catching.
   - Crank 5 s at a time, with ~30 s rests: starters overheat on long cranks.
   - Record two positions. First, the phone on the dash: that's what the hood cam hears. Second, the
     hood open with the phone near the starter, inside a sock to cut wind noise. On iPhone, set
     Voice Memos → Audio Quality → Lossless first.
   - One pass with the fuse back in gives a real catch-and-flare reference.
   - The Corolla is an I4, so its chug fits the Duratec directly. For the V6, use the pulse-rate
     playback above.
   - **Skip the Land Cruiser.** A push-button start runs its own crank logic, and a crank with no fuel
     can log a fault code. Its V8 rhythm (4 pulses/rev) also fits neither engine.

## Also open (Mac side, while the Windows bake runs)

- **Exhaust variants**: `HANDOFF-2026-10-19-exhaust-variants.md`. Stock / sport / race / open headers,
  each with its IR, rpm-shaped power, fuel and items. Not started. It's game-side only and doesn't wait
  on Windows.
- When the I4 loops land: load `manifest-<engine>.json` per engine instead of the one `manifest.json`
  (Windows job 1 renames it).
- When the free idle is fixed: use `idle_free` as the 750-off voice instead of the dyno-held loop.
- Carried over from the 10-18 notes: the rev-limiter stutter (a drivetrain call), the dashboard A/B
  page, freecam distance falloff, and the background-tab mute (it didn't reproduce).
- The branch is ahead of `origin` by the merge and this handoff. The owner approved pushing it for the
  Windows brief.
