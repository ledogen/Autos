---
id: PERF-37
type: perf
status: open
opened: 2026-11-11
severity: major
source: owner playtest, 2026-11-11 — "the performance is definitely unacceptable, something has changed relatively recently"
relates: [FEAT-180 (its 11-09 frame-cost table is the only recent baseline), FEAT-34 (the dash cluster, drawn every frame),
  PERF-08 (test/profile.mjs, the harness to use), PERF-11 (Normal's 1200-line render cap), BUG-72 (precedent: a VRAM leak
  that grew over a session)]
---

# PERF-37 — Normal runs hot and slow on the M4 Air; something regressed recently

> **Owner priority: high.** Look at this before the next round of playtesting, so playtest feel is not judged on a
> machine that is struggling. Engine & world lane (perf tickets need no row in MILESTONES.md).

## What the owner saw

Playing at **Normal** on the M4 MacBook Air (fanless, built-in 2880×1864 panel, 60 Hz), the machine ran hot even
while idling in game. The owner's word is that the performance is "definitely unacceptable", and that it was not like
this until fairly recently. Not yet recorded: whether the symptom is low frame rate, stutter, heat, or all three
(see the open question at the bottom).

## Measured live, 2026-11-11 15:40 PST, owner playing at Normal

Read from outside the browser (`top`, `ps -M`, `ioreg`), because the owner's Chrome has no DevTools port.

| Process | Load |
|---|---|
| GPU (Apple M4) | **94 % device utilization**, steady across samples |
| Game tab's renderer (Chrome's per-tab process that runs the JavaScript) | 35–53 % of one core |
| WindowServer (macOS's screen compositor) | 23 % |
| Chrome's GPU process (hands draw commands to the GPU) | 18 % |

The other game tabs open at the time (two on :3887, one on :3890) sat in a minimized window. Chrome had paused them,
and they showed 0 % CPU. They were not the cause. Chrome's GPU process held 2.5 GB, part of it their graphics memory.

### It disagrees with the 11-09 baseline, by a lot

The FEAT-180 frame-cost run (2026-11-09, in `feat-180-lighting-review.md`, "Frame cost") measured main at Normal on
this same Air:
- **GPU:** 4.4–7.2 ms per frame uncapped, so about 30–45 % busy at 60 fps. Live, it read 94 %.
- **CPU:** 1.4–1.6 ms per frame, so about 9 % of a core at 60 fps. Live, the renderer was at 35–53 %: **4–6× more**.

**Caveat on the 94 %.** macOS reports GPU utilization relative to the GPU's *current* clock speed, and the clock
drops when load is light. So 94 % at a low clock can be fewer watts than 50 % at full clock. On its own, the GPU
figure is suggestive. The CPU gap is not affected by this, and it is the firmer of the two signals. Real watts need
`sudo powermetrics --samplers cpu_power,gpu_power -i 3000 -n 2`, run by the owner, since it asks for a password.

### Why the baseline may have missed it

The 11-09 run used **fresh boots**, **10–20 s windows**, **free roam only**, on a quiet machine. It also took main
*after* the Nov 7–8 landings as its baseline, so nothing from before them was ever measured. A regression from that
window, or one that only appears in long sessions or in story mode, would not show in it.

## Side finding, already fixed: the dev server was burning ~30 % of a core

Separate from the game, and fixed on 2026-11-11. It is noted here because it added heat to the same playtests.

- **What it was.** `fsevents` (macOS's native file-change notifier, an optional npm package) was missing from
  `node_modules`. Without it, Vite's file watcher (bundled chokidar 3) falls back to **polling**: it stats the repo's
  ~4,800 files several times a second. The :8000 server had used ~30 CPU-hours over 4 days doing this, game open or
  not.
- **The fix.** A fresh server idles at 0.0 %, against 28.4 % for the old one.
- **It will come back on a fresh install.** npm 11 tries to compile `fsevents@2.3.3` with node-gyp, which fails
  ("binding.gyp not found": the package ships a prebuilt binary and no build recipe). Because the package is optional,
  npm drops it without an error. That is how it went missing.
- **To restore it after an `npm ci`:**
  `npm pack fsevents@2.3.3`, check its sha512 against `package-lock.json`, then untar it into `node_modules/fsevents`
  with `--strip-components=1`. Do not use `npm install fsevents`: its failed build moved `esbuild` and `fdir` aside
  and left them there, and they had to be put back by hand.
- **Check it is working:** `top -pid <vite pid>` should idle near 0 %.

## Suspects, ranked, with the test for each

All of these go through `test/profile.mjs` (PERF-08), which reads the `?prof=1` dev handles: `__ri` (renderer.info —
draw calls, triangles, geometries, textures), `__perfData` (per-system buckets plus a frame-time ring), and
`__hitches()`. Use the 11-09 method for the GPU numbers: Chrome's `--disable-gpu-vsync --disable-frame-rate-limit`.
That way the frame time is the GPU's real time per frame, not the 16.7 ms vsync floor. Mind the Air's thermal drift:
idle 75 s between boots, rotate the build order, and repeat the first boot at the end. Keep heavy jobs ≤ 2 processes.

1. **A regression in the Nov 7–8 landing window.** About 40 first-parent merges touched `src/` from `4bead7a5` (main
   just before the burst) to now. The rendering-side ones:
   - FEAT-180 pieces 1–5: the horizon and sky, the curtains, the moon and night, the longer evening.
   - FEAT-34 rounds 1–2: the dash cluster, an offscreen canvas blitted every frame.
   - BUG-112: tunnel floor strips as their own geometry.
   - BUG-133: billboard LOD hysteresis.
   - BUG-132: props re-scatter on a re-carve.
   - The road-mesh seam batch: BUG-146/147/150/153–155.

   **Test:** run `--scenario=idle` and `--scenario=drive` at Normal on `4bead7a5` and on main, three random seeds,
   uncapped. Compare GPU ms per frame, CPU ms per frame, draw calls and triangles. If main is worse, bisect the
   first-parent merges. That takes about 6 steps (log₂ 40 ≈ 5.3).
2. **Growth over a session.** The renderer process was 8 days old at 1 GB. If draw calls, geometries or textures
   climb as you play (a leak, like BUG-72's pooled-geometry VRAM leak), a 10 s window on a fresh boot never sees it.
   **Test:** a 20-minute `drive`, sampling `__ri()` and `__perfData` once a minute. Minute 20 should match minute 1.
3. **Story-mode cost the benchmark never ran.** The 11-09 run was free roam. Story adds POI rings and curtains, the
   map card, the mission board and the day clock. Note that on main the clock push integrates the atmosphere for
   0.2–0.3 ms; only the FEAT-180 rebuild branch costs 4 ms there.
   **Test:** the same `idle`/`drive` windows in story mode against free roam, same seed.
4. **The CPU itself: what is the extra 4–6×?** It could be the main thread, the 8 workers (the terrain pool plus the
   road network and route workers), or the compositor. A road-network rebuild or a terrain re-stream that keeps
   re-firing while parked would look exactly like this.
   **Test:** `--trace`, then `test/trace-report.mjs` for per-thread busy time.

## Acceptance

- The cause is named, with before/after numbers from `test/profile.mjs` on the Air at Normal (GPU ms, CPU ms, draw
  calls, p95 frame time).
- After the fix, Normal is back to the pre-regression uncapped GPU and CPU frame cost, or the 11-09 figures if the
  regression predates them.
- A 20-minute session shows no growth in draw calls, geometries or textures.
- The owner confirms in a playtest at Normal that it no longer runs hot or slow.

## Open question for the owner

What does "unacceptable" look like: a low frame rate, stutter or hitches, heat, or all three? And in which mode
(story or free roam)? Each points the search at a different suspect above.
