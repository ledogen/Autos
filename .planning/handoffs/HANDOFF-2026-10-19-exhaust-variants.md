# HANDOFF 2026-10-19 — Exhaust variants: stock / sport / race / open headers (FEAT-120 follow-up)

**Worktree:** `/Users/ledogen/CodeShit/CarGame-engine-audio` · **branch:** `feature/engine-audio`
(local commit `8b1b67e` on top of the main merge `c851170` — NOT pushed yet) · **port:** 3102
(`node node_modules/vite/bin/vite.js --port 3102 --strictPort` from the worktree; `node_modules` is a
symlink to main's, excluded via `.git/info/exclude`). Work here, never on main.

## Where the engine sound is (shipped on this branch, owner: "sounds amazing… really accurate cabin audio")

- `src/engine-audio.js` "FEAT-120: baked engine loops": 24 engine-sim loops (8 rpm rows × off/part/full)
  always running, crossfaded by log-rpm and throttle, `playbackRate = rpm / rpmMeasured`. Only the
  engine named in `assets/audio/engine/manifest.json` (`vulcan30`) uses them; the Duratec I4 keeps the
  FEAT-23 drone.
- Chain: loops → `ConvolverNode` (stock IR `assets/audio/engine/muffler-stock.flac`, `normalize = false`)
  → split: **cabin** (hood cam, plain) / **exterior** (chase + freecam: high shelf +15 dB > 800 Hz, low
  shelf −12 dB < 120 Hz, 0.6 ms ground reflection at 0.7, trim −3.5 dB) → trim −35 dB → out.
- Sliders (Drivetrain & Brakes): Engine Idle Lift (`engineAudioDynamics` 0.5), Chase Engine Bright
  (`engineChaseBrightDb` 15), Chase Engine Boom (`engineChaseBoomDb` −12 — owner's value).
- **Lesson that cost a build:** engine-sim's air noise (V) only multiplies the 0.99·f half of its signal;
  the dry signal is dominated by the 0.01·f′ half (f′ = df/dt ×44100). Multiplying whole loops by noise
  made hiss. There is NO air-noise stage now: dry ⊛ IR matches the V 1.0 references within ±1 dB per
  octave (scratch measurement; the method is in the commit message and the code comment).
- Offline audio measuring on the Mac: no numpy/soundfile. Decode with `ffmpeg -f f32le -ac 1 -` in node
  and convolve directly (10 k-tap IR × 1 s ≈ seconds). In-browser level check: tee every connect to
  `AudioDestinationNode` into an `AnalyserNode` via `Page.addScriptToEvaluateOnNewDocument` (headless
  Chrome renders audio even with `--mute-audio`; the first runs read silence once, then fine).

## The task (owner, 2026-10-19)

Four exhausts — **stock, sport, race, open headers** — each with its own sound AND its honest power
change, switchable in the **Drivetrain menu**, and built as **real items** in the catalog (no
thumbnails yet).

### Owner rulings this round

1. **Taxonomy:** exhausts are their own ladder. The items.md §3d OEM/Sport/Off-road/Heavy-duty families
   are for chassis components only — "an engine can only really get more powerful". Written into
   items.md §3d as a scope note (uncommitted, this worktree).
2. **Power comes from real-world figures**, rpm-shaped (not engine-sim dyno, not a flat %).
3. **Fitting: dev menu only for now.** The items exist in `data/items.js`, but fitting waits for the
   general fitted-parts system (not built for any part yet — `data/items.js` header says so).
4. **Side effect: fuel use** — and nothing else (no durability/wear track this pass).

### Plan

1. **`data/exhausts.js`** — a registry, sibling of `data/engines.js` / `data/transmissions.js`. Per entry:
   - `torqueMult: [[rpm, ×], …]` — rpm-shaped multiplier on the engine's WOT curve. Starting figures
     (typical Vulcan/Ranger dyno results, owner picked "real-world"; tune by feel):
     | Exhaust | Low end (≤2000) | ~3000 | Top (≥4500) |
     |---|---|---|---|
     | stock | 1.00 | 1.00 | 1.00 |
     | sport (freer cat-back muffler) | 1.00 | 1.02 | 1.03 |
     | race (straight-through) | 0.98 | 1.02 | 1.05 |
     | open headers (nothing after the collectors) | 0.92 | 1.00 | 1.07 |
     Open headers lose low end because the stock cam is tuned for the pipe's back-pressure wave; with
     nothing after the collector the low-rpm scavenging goes.
   - `ir`: the muffler IR file in `assets/audio/engine/`, plus optional cabin/exterior defaults.
   - `params.exhaust: 'stock'` in `data/ranger.js`; a selector in `src/debug.js` next to Engine and
     Transmission.
2. **Apply the multiplier in ONE place.** `engineTorqueAt(rpm, curve)` is called in `src/drivetrain.js`
   (Tair heat and Teng) and `src/fuel.js` (the fuel map builds from `engineTorqueCurve`, lines 38 / 58,
   and caches on a key of the params at line 84). Grep every caller (`damage.js` too). Either derive an
   effective curve once, or add the multiplier to the shared lookup. Then fuel follows power by
   construction, which IS the owner's "fuel use" side effect. Add `exhaust` to the fuel-map cache key,
   or the table won't rebuild on a swap. A freer exhaust also cuts pumping loss. If you want that
   honestly, it's a small cut in `pumpingK`; ask before adding it.
3. **Sound — game-side IR swap, no re-bake.** engine-sim v0.1.11a ships candidate IRs (MIT, same repo):
   `es/sound-library/new/{mild_exhaust, mild_exhaust_reverb (= stock now), minimal_muffling_01..03}.wav`,
   `es/sound-library/sharp/sharp_01.wav`, `smooth/smooth_*.wav`. Fetch them raw from
   `github.com/ange-yaghi/engine-sim/v0.1.11a/...`. Before use, apply engine-sim's IR handling: cut after
   the last |x| > 100 of 32767 and cap at 10 000 samples (NOTES.md "IR handling"). Rough mapping to
   audition: sport ≈ `mild_exhaust`, race ≈ `minimal_muffling_0x`, open headers ≈ `sharp_01` or the
   dry loop nearly untouched (dirac + a little low end). With nothing after the outlet, the dry loop
   physically IS open headers. The owner picks by ear, so make each one a selector option and give
   them A/B on the running game.
   - Each IR has its own gain, so `MUFFLER_GAIN_DB` (35, measured for the stock IR) becomes
     per-exhaust. Measure each one's lift on `vulcan30_5500_full` the way the commit did (peak after
     convolution), so a swap doesn't jump 10 dB. The same goes for the exterior trim.
   - Swap = set `convolver.buffer` (no graph rebuild); load the IRs once in `loadBake`.
   - **Engine-sim second pass, only if a game-side IR can't get there:** the bake's exhaust geometry
     (20 in primaries + 100 in collector per bank, `vulcan30.mr`) is baked in. A true "headers"
     resonance change would need a re-bake (Windows: `python bake.py all`). Don't start there.
4. **Items** in `data/items.js`, `kind: 'part'`. `desc` must have no digits (SM-INV-10, gated), and no
   use hook. Mass is real load: cargo.md lists a muffler at 10–30 kg. Ids stay stable forever, so pick
   them carefully. No thumbnails (owner). Not fitted anywhere (ruling 3). Run the items/inventory gates.
5. Gates: the ranger.js/drivetrain/fuel edits light up the physics + fuel gates (`test/fuel-map.mjs`
   pins the V6 mpg bands — the stock exhaust must leave them byte-identical; prove it with
   `node test/fingerprint-physics.mjs` main-vs-branch at `exhaust: 'stock'`). Then
   `node test/cdp-smoke.mjs`.

## Still open (carry forward)

- **Rev-limiter fuel cut** (second pass, `HANDOFF-2026-10-18-engine-audio-mac.md` "Second pass"): the
  game's limiter holds 5700 rpm with no cut, so there's no stutter in-game; it's a drivetrain call.
- **Start-flare references:** the Windows session offered starts with a throttle blip during cranking.
  The owner hasn't answered.
- **Background-tab mute:** owner heard audio keep playing on tab switch. Not reproducible in Chrome on
  the branch or main (ctx suspends on `document.hidden`). Probably a stale :3120 tab. Ask the browser
  if it recurs.
- Not built yet: the dashboard A/B page (dry + our muffler vs `_stock` reference); the recorded crank
  loop (`vulcan30_crank_dry`) instead of the synthesised crank; distance falloff/panning for freecam;
  a Duratec I4 bake (it plays the drone).
- engine-sim fork lives outside the repo on the Windows box: ask for its `.patch` under
  `assets/audio/src/engine/` (open risk from the 10-18 handoff).
- Branch not pushed; merge to main when the owner says.
