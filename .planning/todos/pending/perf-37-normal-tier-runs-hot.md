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

## A/B result, 2026-11-11 20:05–21:05 PST: no code regression from Nov 1 to main

Headless Chrome 157 on Metal, device pixel ratio 2, so a 2066 × 1200 canvas at Normal. Seed 3583777560, spawn spot.
Builds: Nov 1 = `21a29ea9`, Nov 6 = `871d7750` (just before the burst), main = `0f987b08`. Order alternated,
60 s idle between boots. Script: `ab.mjs` / `soak.mjs` in the session scratchpad (PERF-08's method plus a process-tree
CPU read via `ps`).

| Measure | Nov 1 | Nov 6 | main |
|---|---|---|---|
| Free roam idle, uncapped GPU frame median (ms) | 6.5 / 7.3 | 5.4 | 4.2 / 4.4 / 4.4 / 4.8 |
| Story idle (Larry's after the skip), uncapped median (ms) | 9.1 (entry unverified) | 7.9 (opening, not skipped) | 6.9 / 7.2 |
| Free roam drive at 60 Hz: renderer process, % of a core | 33 | 35 | 33 |
| Free roam drive: in-page CPU per frame (ms) | 2.46 | 2.62 | 2.46 |

- **Main is the cheapest of the three on the GPU**, by about 2 ms against Nov 1. CPU is level across all three.
- **A 20-minute story soak on main shows no growth.** Geometries held at 357, textures at 28 and programs at 260,
  draw calls held at 146–156, and the JavaScript heap stayed at 167–214 MB. The truck was mostly parked, so
  streaming growth is not covered. Suspect 2 is cleared for a parked session.
- **Story costs about 60–70 % more GPU per frame than free roam** (7 ms against 4.3 ms; 156 calls and 790k
  triangles against 107 and 460k). That is not new: it holds on every build.
- **Not tested: headed compositing.** The owner's WindowServer read 23 %, and headless Chrome does not composite to
  a real window. That is the one cost this A/B cannot see.
- **Environment at the time of the owner's reading:** Chrome had been running 9.5 days on 156.0.8078.76, with
  157.0.8103.39 (Nov 4) and 157.0.8103.78 (Nov 11) staged but unapplied. Its GPU process held 2.5 GB. The polling
  Vite server (above) added about 30 % of a core.

## After the owner relaunched Chrome, 2026-11-11 ~21:20 PST

The owner clicked Chrome's pending-update banner: a relaunch onto 157.0.8103.78, after 9.5 days on 156.0.8078.76.
Their word: "it seems totally fixed".

A headed check on the fresh Chrome 157 followed. A real 1440 × 900 window at the panel's native pixel ratio 2 gives a
2125 × 1200 canvas at Normal. Seed 3583777560, 20 s windows, the owner away from the machine:

| Run | Game tab renderer (% of a core) | Chrome GPU + browser | WindowServer | GPU util (median of samples) |
|---|---|---|---|---|
| Owner's reading on the old Chrome (above) | 35–53 | 18 (GPU process alone) | 23 | 94 |
| main, free roam drive | 31.1 / 32.3 | 17.5 / 17.7 | 30.1 / 29.6 | 82 / 82 |
| main, story idle at Larry's | 25.3 | 16.2 | 29.0 | 81 |
| Nov 1 `21a29ea9`, free roam drive | 32.5 | 16.7 | 33.4 | 93 |

- **Compositing did not regress either.** Nov 1 and main cost the same headed: WindowServer about 30 %.
- **Read from outside, the fresh Chrome is only modestly lighter** than the owner's reading: renderer about 5–20
  points lower, GPU utilization 82 against 94. That utilization figure is relative to the GPU's current clock, so it
  cannot settle the question. The old state, a 9.5-day Chrome with a 2.5 GB GPU process, cannot be recreated to
  test, so a hot-Chrome cause stays the likely reading, not a proven one.
- **The decisive number is watts:**
  `sudo powermetrics --samplers cpu_power,gpu_power -i 3000 -n 5` during play, now, and again if it heats up.
- **Next step:** close this on the owner's playtest confirmation (the acceptance's last line). If it recurs after
  days of Chrome uptime, the next suspect is Chrome's GPU process state, not the game.

### Watts after the relaunch (owner's `powermetrics`, 2026-11-11 21:45 PST, on AC power)

Idling out front of Larry's at the intro, Normal, fresh Chrome 157. Five samples, 3 s apart:

| Sample | CPU (W) | GPU (W) | GPU clock (MHz) | GPU busy (%) |
|---|---|---|---|---|
| 1 | 0.46 | 1.80 | 1091 | 89 |
| 2 | 0.40 | 2.04 | 1119 | 87 |
| 3 | 0.39 | 3.18 | 907 | 97 |
| 4 | 0.39 | 3.31 | 895 | 98 |
| 5 | 0.41 | 3.26 | 894 | 98 |

- **CPU + GPU together draw 2.3–3.7 W.** That is a moderate load for the fanless Air. It warms the chassis but sits
  well below where an M4 Air throttles. The performance cores stayed parked at 0 MHz: the efficiency cores carry the
  game's CPU work.
- **The GPU runs near-full busy at a low clock**, 98 % at about 900 MHz against a 1470 MHz top. That is Apple's
  power governor choosing the slowest clock that still makes the frame, the efficient setting, so there is headroom
  left.
- **The step at sample 3** (2.0 → 3.2 W) is most likely the intro scene changing, not drift.
- **Use this as the reference.** If it runs hot again, take the same reading. Several watts above about 4 W on the
  same spot means the cause is back.

- **Driving a fragile mission** (22:45, streaming new terrain): steady 2.2–2.4 W total. CPU 0.67–0.76 W
  (efficiency cores about 38 % busy, performance cores 16–21 % at about 1.6 GHz). GPU 1.5–1.7 W at about 1.2 GHz,
  85 % busy. Driving costs less than idling at Larry's intro (2.3–3.7 W), and sample-to-sample spread is ±0.1 W.

#### The owner's "throttling bad, stuttering" session (22:56–23:07, story, a haul of 16 bundles, 15:00 in game, lights on)

| Reading | CPU (W) | GPU (W) | GPU clock (MHz) | GPU busy (%) | Owner's feel |
|---|---|---|---|---|---|
| 22:56, on the way to the haul, map opened now and then | 0.63–1.08 | **3.9–7.6** | **1003–1217** | 93–100 | stuttering |
| 23:07, hauling, map closed the whole 15 s | 0.76–1.01 | 1.8–2.4 | 1364–1453 | 83–88 | "still felt slow" |

- **Steam was idle** (about 1 %), not the cause.
- **Headlights cost nothing by day.** The six spots always exist, cast no shadows, and only change intensity.
- **At 22:56 the GPU did about 4× the work** of the 22:45 drive: 7.6 W against 1.7 W. It was 100 % busy, yet its
  clock sat at 1.0–1.1 GHz, below the 1.47 GHz top. That is power or thermal capping, and it fits the stutter.
- **At 23:07, map closed:** the GPU is back to about 2 W but runs near its top clock (1.36–1.45 GHz) at about 86 %
  busy. That is near saturation at full clock, with little headroom left for a spike. At 22:45 the same load
  ran at 1.2 GHz. Something in this scene costs about 20 % more GPU: the bundles, the location, or the clock hour.
- **Suspect: the map.** While open it redraws a full-panel 2D canvas (2880 × 1864) every frame, blitting an
  overscanned background, on top of the 3D scene still rendering behind it. The CPU of an open map was measured
  (fine) but its GPU cost never was. A map-open reading is pending from the owner.

#### Recorded play session 1 (2026-11-11 23:25–23:36): the stutter is the MAIN THREAD, not the GPU

**Method.** This replaces the one-off readings. The owner plays in a headed Chrome that the harness opens (fresh
profile, `?prof=1`, sound on). It logs `__perfData` / `__ri` / map / screen / clock / speed each second, and F9 marks
a stutter. Beside it runs a 2 s `powermetrics` (GPU clock, busy, watts). The two are joined by wall time. Scripts:
`playlog.mjs`, `join.mjs`, and `profsum.mjs` in the session scratchpad. playlog now also keeps rolling 10 s CPU
profiles of any window with a bad second.

- **Run 1, 0–200 s:** a story run, no mission, full speed. Smooth: 60 fps, p95 under 18 ms, GPU about 950 MHz and
  88 % busy.
- **Run 2, from 200 s:** the owner gave up and restarted, then took Larry's paper route. From about 380 s, a couple
  of minutes into the route, frames degrade: 54–58 fps, p95 25–100 ms, two F9 marks at 560 s and 600 s. GPU 0.85–1.2
  GHz, 85–94 % busy, 1.5–3.7 W. Far from its power cap, so the GPU is not what stutters. Two CPU stalls on the main
  thread:
  1. **Map open: `frame.postStream` used 920–960 ms per second** (380–389 s, truck stopped), at 22–30 fps, and
     525–715 ms per second at 434 s and 490 s. Not reproduced headless: hovering and panning there cost about
     250 ms per second. Function unknown.
  2. **Map closed: `frame.physics` used 130–190 ms per second** (454, 543–544 and 611–613 s), against about 40
     normally. That is 50–80 ms frames. Papers are not bodies (`throw.js` is ballistic), so it is not a paper
     pile-up. Function unknown.
- **Triangles drawn rose from 630k to 1.03M** across the session (calls flat at about 150, geometries 307 → 456).
  It falls back to 900k late, so this is not clearly a leak. Watch it.
- **Side find:** an open map re-draws `_drawCampZones` every frame, about 3 ms (it is not in the cached background).
- **Next:** a second recorded session with the profiler on, to name the functions behind stalls 1 and 2.

#### Recorded play session 2 (2026-11-11 23:43–23:51, Larry's route again, CPU profiler on)

- **The owner's "frame drop every 9–10 s" was the harness.** `Profiler.stop` serialises the 10 s profile and stalls
  the main thread for 100–250 ms. The long frames sit exactly on the window boundaries, 10–11 s apart. For the next
  session: longer windows, or `Tracing` in place of `Profiler`.
- **Milder than session 1:** 60 fps held through most of it. CPU 1–6 W, GPU 1.3–2.6 W at 0.9–1.1 GHz, about 87 %
  busy.
- **The physics spikes, by function** (inclusive time, i.e. the function plus everything it calls, in the spike
  windows):

  | Function | Share of main-thread busy time |
  |---|---|
  | `stepPhysics` | 31 % |
  | `queryContacts` (world-contacts.js) | 26 % |
  | `tireContact` (tire-contact.js) | 25 % |
  | `treadContact` → `rho2` | 23 % |
  | `groundH` → `analyticHeight` | 22 % |
  | `road._sampleCarveWorld` (cross-sections, junction pads, centreline) | 19 % |

  The tread solve (BUG-70, `c9d8fe20`…`c3a35544`, 11-04 → 11-07, in Nov 6, not in Nov 1) samples ground height
  about 57+ times per wheel per physics step: 3 lines × (9 coarse + 10 golden-section steps per local minimum).
  Inside a carved road each sample runs the full carve stack. Physics peaks at 100–176 ms of CPU per second, against
  about 35 normally. The timing matches the owner's "3–5 days ago".
- **The map stall, by function:** `render` 29 % → `_stepBackground` 24 % → `_drawTopo` 19 %, `_paintGround` 15 %,
  `coarseHeight` 11 %. That is the background repaint after each pan or zoom settles, sampling terrain per pixel at
  pixel ratio 2.
- **Not yet profiled:** the workers (terrain chunks, road network). CPU power ran 1–6 W while the main thread was
  only about 25 % busy, so the workers carry real load.

#### Recorded play session 3 (2026-11-12 11:25–11:32, branch perf/perf-37-tire-map: PERF-38 map + PERF-39 tire)

Owner: "I don't think the computer is thermaling anymore but it's still getting quite toasty." 7 min of story play,
map in use. Harness: scratchpad `playlog3.mjs` (one continuous main-thread profile saved every 5 min instead of the
10 s restarts that stalled session 2; CPU % per Chrome process from `ps` cumulative CPU time).

- **60 fps, p95 17.5 ms** through the drive. **Package 2.6 W: CPU 1.15 W + GPU 1.48 W** (GPU ~1.05 GHz, 82–89 % busy).
- **Main thread 192 ms/s** (19 % of a core): render submit 76, physics 50, postStream 25, props 13, terrain 10.
  The profile is 78 % idle. Small CPU oddities: `cluster.js _drawOdometer` 4.7 ms/s, WebAudio `setTargetAtTime` 2.5 ms/s.
- **Renderer process 41 % of a core** → the workers and the compositor are ~22 %, about as much as the main thread.
  GPU process 13 %.
- **The GPU is now the larger half.** Triangles 0.9–1.1 M a frame, but triangles are cheap on this GPU.

**GPU split** (scratchpad `gpuab.mjs`, headless on the real M4 GPU at the owner's 2090 × 1226 canvas, parked after a
25 s drive, one switch at a time). GPU timer queries are misleading here: the GPU lowers its clock as load drops, so
ms per frame stays near 12. The measure is GPU active cycles (busy % × MHz), from the sudoless IOReport reader
(scratchpad `ioreport.py`). Savings, two random seeds:

| switch | seed 2654449719 | seed 1172941705 |
|---|---|---|
| terrain hidden | 60 % | 50 % |
| ¼ the pixels | 53 % | 45 % |
| 900-line cap (from 1226) | 30 % | 39 % |
| terrain detail shader off (`uDetailScale` 0) | 22 % | 40 % |
| terrain surface maps off (`uSurfOn` 0) | 12 % | 26 % |
| all props hidden | 12 % | 28 % |
| near (truck) shadow light off | 12 % | 23 % |
| grass / sage / rye hidden | 7 % | 20 % |
| far shadow light off / baked prop shadow off / rock bump off | 0–13 % | |

Single readings, about ±10 %. **The GPU cost is per pixel, and most of it is the terrain's fragment shader.** The
shadow pass runs on every frame while driving (the day clock moves the sun).

### Found while chasing the owner's map-open CPU burst: a Quality change in story loops the map (fixed)

Owner, 21:59: a 6 s CPU burst (0.7 → 5.0 W, performance cores at 4.0 GHz) while clicking in the auto shop menu and
briefly opening the map.

- **A clean map open in story is cheap**, about +6 points of a core and flat. So the map alone did not cause the
  burst. Its real cause is not identified: `powermetrics` does not split power by process.
- **The bug.** `applyQuality()` set play's road radius to the ring's 320 m, even inside a story region, where
  `pumpRegionWarm` had widened it to the region's 2800 m. `Map2D._pump` copies play's network only when play's
  radius covers the region. So after any Quality change mid-run, the map ran its own worker build instead, at 9
  roads against play's 183. `_playOutgrewMap()` then never settled, and the map rebuilt and repainted its
  background about every 5 frames while it was open. Renderer 125–217 % of a core; `frame.postStream` used
  8.8 s of CPU in a 10 s window.
- **The fix** (main.js): a new `_regionRoadR`, set by `pumpRegionWarm` and cleared by `releaseRegion`, which is
  story's only exit. While it is set, `applyQuality` leaves play's road radius alone.
- **After the fix:** a Quality change in story leaves play's radius at 2800 m. The map copies 183 roads, and an
  open map costs 30–36 % of a core. Affected gates 9/9 green, cdp-smoke 26 steps, zero console errors.
- **The owner did not change Quality** (21:59 session). So this bug is real but was not the burst. The burst, about 6 s at up to 5 W, is still unexplained. A one-off spike that short is not heat. The heat came from sustained load. If such spikes repeat, take a `--trace` of the action (auto shop, tire swap, first map open after a mission) and read the per-thread busy time.

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
