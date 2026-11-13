# Cost map and architecture review — November 2026 (PERF-48)

One canned playtest (the PERF-40 bench: a 300 s story-mode drive with an edge leg and an off-road leg, the map open
30 s, parked 30 s), three pinned random seeds (1768572700, 17535907, 759313244), profiled end to end. Main checkout
c43385c7 merged into `feature/perf` (a4dd2998). M4 MacBook Air, headless Chrome 157 on the real GPU (ANGLE on Metal),
2090 × 1226 device pixels at Normal. Seed 6 is not in it: these are random seeds, not "the world".

**Audio path.** This Mac's audio service is stuck (PERF-47), so every run used Chrome's `--disable-audio-output` fake
sound device. Its clock runs at 1.0 s per s, so the game's audio code runs as it does for a player. Nothing reached the
speakers. A host with working audio should read the same; PERF-47 measured the healthy and fake paths equal (154 vs
153 ms/s parked).

## The ranked lever list (read this first)

"ms/s" is milliseconds of one CPU core per second of play: 1000 ms/s is a whole core. Main-thread numbers are at the
clock this Mac picks for an unprofiled run (see "the clock trap" below). GPU load is in active cycles (Mcyc/s = busy
fraction × clock in MHz), the only GPU measure that holds still on this machine.

| # | Lever | Cost today | Expected gain | Risk to picture / physics | Effort | Ticket |
|---|---|---|---|---|---|---|
| 1 | **Stop the HUD forcing a style recalculation every frame.** ~~Write the energy and hunger strips only when their drawn pixel moves, stop the hidden debug panel's live sliders~~ (done, below); the cluster's `ctx.font` left as is: with nothing dirty it forces nothing. | ~45 ms/s main thread, driving and parked (21 % of the main thread) | **measured 2026-11-13** (3 seeds, A-B unprofiled, fake audio): recalcs 60 → 13 /s driving, 58 → 3 parked, 57 → 6 map; recalc time 38 → 8.5 / 32 → 2.4 / 44 → 8.7 ms/s; postStream 52 → 24 / 46 → 20 / 82 → 60 ms/s; CPU 1.11 → 0.98 / 0.77 → 0.70 / 0.69 → 0.53 W | the energy/hunger bars step one device pixel at a time: a still differs only in the anti-aliased column of each hour tick and band edge, and in the band labels' glyph edges (0 px on the device grid) | small (2 files) | PERF-48 lever 1 (PERF-45 §3) |
| 2 | ~~**The map's overlay: stop redrawing the region dimming every frame.**~~ **Void, measured 2026-11-13: the dimming was never the cost.** `_drawRegion` holds the frame's FIRST `ctx.font` assignment, and that assignment is where a dirty page pays its forced style recalculation (the recalc lever 1 cut). The dim fill itself is 0.01–0.09 ms a frame. | was ~60 ms/s with the map open; of it ~44 ms/s was the forced recalc (lever 1 took it to 8.7) | **measured (in-page timers, seed 1768572700, lever 1 in):** `map2d.render` 0.86 ms/frame still, 0.86 panning, 0.98 zooming; `_drawRegion` 0.32–0.36, of which `ctx.font =` 0.16–0.24 (the 9 recalcs/s left, ~8 ms/s, paid there) and the dim fill 0.01–0.09 (≤ 5.5 ms/s). Knocking `_drawRegion` out changes `render` by nothing: its recalc moves to the next font setter. Baking the dim would buy ≤ 5 ms/s, so not built. | — | — | PERF-46; the real map levers are in its Next steps (whole-map skip when nothing changed, ~50 ms/s still; the 10 Hz writers' recalcs) |
| 3 | ~~**Physics at rest: memo the ground query of a tyre that has not moved.**~~ **Void, measured 2026-11-13: a parked tyre never repeats its hub bits.** The chassis quaternion and the strut compressions change every step at rest (9/9 spots, three seeds), and each hub moves 1e-8 to 1.4e-4 m per step. The tyre carcass spring leaks through the 0.05 m/s `SLIP_EPSILON` floor, so a parked truck creeps at 0.4–6.7 mm/s; with the floor removed it rocks instead. | ~33 ms/s parked (the road carve stack, 58 % of parked physics); 0–140 ms/s by spot | an exact memo: **0 % hits**, so not built. A plane-shifted reuse across steps (qcPlus's within-step rule) would save ~30 ms/s but is an approximation: an owner call | exact: none possible; reuse: ~1e-8 m on smooth ground, ≤ the hub move at a kerb crease | — | PERF-45 §1 (Open questions: leave / plane-shift reuse / fix the carcass leak) |
| 4 | ~~**Static objects stop recomputing their world matrices, and far POI groups leave the scene walk.**~~ **Measured 2026-11-13: the walk is ~20 ms/s, not 67** (67 is the whole `render()` call). Parked, 1400–1618 scene nodes are walked every frame, every one with automatic matrices, so `updateMatrix` runs 1417–1635 times a render. Half the nodes (654–716) sit under a hidden parent: three.js skips a hidden subtree when it draws, but still walks it for matrices. Of the 1400 on seed 1768572700: POI groups 703 (~640 hidden past the ring), the road-barricade models 457, the truck 65, terrain chunks 52, road meshes 46, the rest ~80. | `scene.updateMatrixWorld()` timed in-page: 24.7 / 17.0 / 23.7 ms/s (0.3–0.4 ms a frame, ~0.29 µs a node) on the three seeds, parked | **upper bound, skipping the walk entirely** (in-page A-B, 6 × 3 s windows interleaved, unprofiled, fake audio): render 96.6 → 82.5, 61.8 → 54.7, 92.5 → 91.5 ms/s, i.e. 1–14 ms/s (mean 7). The clock trap eats the rest. A real build reaches ~78 % of that (POI groups + barricades) | an object marked static that moves would freeze; the scene root must go static too, or its own recompose forces every world matrix anyway | small if narrowed to the two big kinds | PERF-45 §2 (stopped at the measurement: an orchestrator call, see its Open questions) |
| 5 | **A frame-rate cap setting (60 / 30 / display).** `requestAnimationFrame` runs at the display's rate; on a 120 Hz screen the game renders 120 frames a second. Physics stays at its fixed 60 Hz step either way. | unknown here (this Mac is 60 Hz); on a 120 Hz display ~2× the render CPU and the GPU | up to half of the render CPU and GPU on high-refresh screens | none (a setting) | small | new — owner: is the "faster MacBook" a 120 Hz ProMotion screen? |
| 6 | **Bake the terrain's material into a per-chunk texture** (what engines call runtime virtual texturing: the expensive blend of surface maps and noise is evaluated once into a texture, and each pixel then reads it). | terrain is 50–60 % of GPU cycles (PERF-41, before its 7–14 % cut); the GPU is ~2 W of the ~3.7 W package | estimate 20–30 % of GPU cycles (~150–200 Mcyc/s, ~0.4–0.6 W). Needs a prototype; published results range from "slight" to large. | medium: texel density near the camera must match today's look; owner signs off | large | new (PERF-41 follow-on) |
| 7 | **A lower render rate while parked with the camera still** (for example 30 fps). | parked GPU = driving GPU, ~710 Mcyc/s | ~half the parked GPU, ~1 W | visible: wind on grass, smoke, needles at 30 fps | small | new — an owner look |
| 8 | **Measure multisample anti-aliasing (MSAA) once.** It is on (`antialias: true`) at 2.56 M pixels. | unmeasured | unknown; on a tile-based GPU MSAA is usually cheap | AA off is visible | one A/B | PERF-44 |
| 9 | **Cheaper ground samples while driving** (the spikes): the road carve stack is 48 % of driving physics. Cut its per-sample maths (PERF-43's unbuilt levers 1–3, exact), or sample a cached height lattice (an approximation: an owner call). | physics 57 ms/s driving (p50 50, p99 144); 5.3 % of moving seconds over 100 ms/s (PERF-42 target ≤ 5 %) | exact levers: unknown, PERF-43 measured small; a lattice: ~25 ms/s | exact: none; lattice: changes the physics (mm at kerb lips) | medium–large | PERF-42 (owner closed PERF-43 as "not worth the squeeze") |
| 10 | Bench hygiene: under `?prof=1` the game mirrors every bucket into `performance.measure`, which the page keeps forever (148–155 k entries a session). Clear them from the bench page. | a bench-only cost (heap growth, and ~10 ms/s whenever a trace records user timing) | cleaner bench numbers; nothing for players | none (test/ only) | trivial | PERF-40 |

Levers 1–3 were to be small, exact and invisible; lever 1 is built, levers 2 and 3 measured void (2026-11-13).
The map's ~50 ms/s turned out to be lever 1's recalc, not lever 2's fill (lever 2 is void). Lever 6 is the only large GPU lever left, and the GPU is where this Mac's heat is. Lever 5
needs one fact from the owner. The deep-dive page is not needed yet: levers 1–4 need no owner call, and 5–7 are one
question each (listed in the ticket's open questions).

**What is already right** (no lever): the fixed-step loop and its spiral brake, the on-demand and cached shadow maps,
the time-sliced streaming, the quiet workers, the low garbage-collection cost, and skipping the 3D render under the map.
Details in the review.

## The clock trap: why main-thread ms/s is not a work measure on this Mac

The same build on the same seeds, run twice:

| | profiled run (tracing on) | control run (no tracing) |
|---|---|---|
| CPU package power, driving | 3.11 W | **0.82 W** |
| main thread, driving (sum of buckets) | 135 ms/s | **216 ms/s** |
| main thread, map open | 53 ms/s | 176 ms/s |
| main thread, parked | 95 ms/s | 184 ms/s |

The profiled run does MORE work (the tracer's overhead) in FEWER milliseconds. The tracer kept the CPU busy enough for
macOS to run the main thread on a fast core at a high clock. Unprofiled, the game is light enough that macOS runs it
slowly, on an efficiency core or a low clock. This is the CPU version of the GPU effect PERF-40 found: the clock
follows the load, so time per second stays roughly level whatever the load does. Every bucket scales by about the
same factor (render 1.65×, physics 1.58×, postStream 1.77× driving), so the profile's SHARES are sound.

So in this document:
- **function-level splits come from the profiled run as shares**, then are converted to ms/s at the control run's clock;
- **per-second spreads (median / p99 / worst) come from the control run**, because tracing adds its own hitches (the
  profiled run's worst frames were 130–220 ms; the control's were 19–48 ms);
- **heat is CPU and GPU watts**: driving, the CPU package is 0.8 W, the GPU ~2.0 W and memory 0.9 W. The GPU is the
  larger heat source by about 2.5×. Main-thread levers buy frame-time headroom on slower machines (PERF-46's Windows
  laptop) more than they buy heat here.

## The cost map

### Per phase, per thread (control run, three seeds pooled; ms/s)

| thread | drive | map | park |
|---|---|---|---|
| renderer main thread, game buckets: mean (per-second p50 / p99 / worst) | 216 (207 / 313 / 614) | 176 (179 / 219 / 219) | 185 (184 / 223 / 223) |
| renderer process, all threads (`ps`) | ~370 (37 % of a core) | ~335 | ~320 |
| GPU process, all threads (`ps`) | ~125 | ~85 | ~130 |
| frames: p95 / worst per session | 17.6 / 22–48 ms | 17.8–17.9 / 27–154 ms | 17.4–17.5 / 19 ms |
| GPU active cycles | 720 Mcyc/s | 61 | 710 |
| power: CPU / GPU / memory | 0.82 / ~2.0 / 0.90 W | 0.37 / 0.07 / 0.17 W | 0.51 / ~2.0 / 0.64 W |

GPU watts swing ±50 % between sessions at the same active cycles (1.4–2.3 W driving), as PERF-40 found; read cycles.

The profiled run's traces resolve the threads by name. Busy ms/s, profiled clock:

| thread | drive | map | park |
|---|---|---|---|
| renderer main (`CrRendererMain`), every task | 158–164 | 54–80 | 107–141 |
| GPU process main (`CrGpuMain`: decodes and validates the WebGL command stream, then calls Metal through ANGLE) | 53–54 | 11 | 40–43 |
| renderer thread pool (V8's background compile and GC marking, canvas raster) | 16–17, plus ~5 threads at 1.5 each | 3–5 | 7–8 |
| compositor (renderer) + Viz compositor (GPU process) | 8.5 + 5 | 5 + 2.5 | 7.5 + 4.5 |
| terrain worker (`DedicatedWorker`, a background JS thread) | 1.3–1.5 | 0 | 0 |

The road-network workers did nothing measurable in any phase: story mode builds its region before the drive, and the
pools stay quiet after that (FINDINGS' PERF-09 retraction holds).

### The main thread by bucket (control run, ms/s: mean, per-second p50 / p99 / worst)

| bucket | drive | map | park |
|---|---|---|---|
| render (three.js's `render()` call) | 67 (67 / 84 / 87) | 0 | 61 (61 / 68 / 68) |
| physics (the fixed-step block) | 57 (50 / 144 / 229) | 65 (48 / 116 / 116) | 57 (46 / 92 / 92) |
| postStream (HUD, cluster, map, audio, camera) | 55 (56 / 68 / 72) | 92 (95 / 128 / 128) | 52 (51 / 65 / 65) |
| props.update (prop streaming) | 12 (2 / 67 / 162) | 2 | 1 |
| terrain.update (chunk streaming) | 8 (1 / 59 / 192) | 2 | 1 |
| preStream | 7 | 8 | 6 |
| ribbon.sync | 4 | 4 | 4 |
| water.warm / shadowBake | 2.5 / 2 | 3 / 0 | 3 / 0 |

Physics, driving: 5.3 % of moving seconds were over 100 ms/s (per seed 2.0 / 9.2 / 4.8 %); median 47–52.

### Inside each bucket over ~5 % of the main thread (profiled run; shares, then ms/s at the control clock)

**postStream → the gauge cluster's update, 83 % of the bucket driving (~46 ms/s), 80 % parked (~41).**
- The profile charges 20–23 ms/s (profiled clock) to `_drawOdometer`'s first line, `ctx.font = 'bold 10px …'`.
- It is not the text. Measured alone, the odometer draws in 6.7 µs (0.4 ms/s) and the whole cluster in 21 µs.
- The trace shows a style recalculation (`UpdateLayoutTree`, the browser re-deriving the CSS of changed elements)
  inside the game loop on every frame: 60/s, ~0.33 ms each, 19–21 ms/s at the profiled clock. All of them come from
  that line. None run outside the loop.
- Why: setting a canvas font makes the browser resolve the font against the page's current style. Earlier in the
  frame the HUD wrote inline styles: the energy and hunger strips' `transform` (43/s each) and the hidden debug panel's
  live slider fills (87/s, lil-gui's `.listen()`). So the style is dirty, and the font setter forces the
  recalculation then and there (a "forced synchronous style recalc").
- Measured (`wip/perf-48/recalc.mjs`, story mode, parked, 15 s each): with the two strips' and the slider fills'
  writes frozen, recalcs fell from 900 to 142 per 15 s, recalc time 29.9 → 4.5 ms/s, the loop 152 → 133 ms/s. The
  rest (9.5/s) are 10 Hz writers: the POI prompt, the recovery icon, the debug readouts.
- Side cost of the same panel: 27 live controllers each run their own `requestAnimationFrame` loop, 1600 callbacks a
  second. Their JS is small (~1–2 ms/s); their slider writes feed the recalc above.

**render → three.js, driving 67 ms/s (profiled: 38–41; 88 % in three.js, 12 % in WebGL calls).**
- `updateMatrixWorld` 16 %: every object's world matrix recomputed every frame. The census (per seed, mid-drive): 655–923
  objects in the visible tree, every one with automatic matrix updates on.
- The frustum walk (`projectObject`, `intersectsObject`) ~9 %: 455–624 visible meshes are tested; 119–132 are on
  screen. One top-level `Group` holds 458–722 objects of which 0–15 are in view (POI models across the region).
- Per draw: `renderObject`, `renderBufferDirect`, `setProgram`, uniform uploads (`update`, `copyArray`) and
  `bindVertexArray`, ~35 %, for 122–128 draw calls (worst 205).
- Triangles: 885 k a frame driving (p50; worst 1157 k), 983 k parked. PERF-41 showed triangles are cheap on this GPU.

**physics, driving 57 ms/s (profiled 31–37).** By file: the road carve stack (`road.js`) 48 %, Box3D (the engine's
WebAssembly plus its JS glue) 18 %, terrain noise 7 %, POI pad contacts 4 %, our own vehicle model (`physics.js`,
`tire-contact.js`, `suspension.js`) under 5 %. The Pacejka tyres and struts are not a cost. The ground query is.
Parked it is 58 % road carve, 5 % Box3D: the truck at rest pays the full tread solve each step (PERF-45). Seed
17535907's park spot sits in a departure band (`_bandTangent` 7.3 ms/s profiled), which is PERF-40's "the spot
decides the cost".

**Map open: postStream 92 ms/s, all of it `map2d.render`.** `_drawRegion` is 64 % of it (~59 ms/s). Corrected
2026-11-13 (lever 2): that time is NOT its full-canvas dim fill. It is the forced style recalculation that the frame's
first `ctx.font` assignment pays when the page's style is dirty, and `_drawRegion` happens to make that first
assignment. The trace shows 60 forced recalcs a second, all inside the frame's `requestAnimationFrame` callback; lever 1
removed most of them. The fill costs 0.01–0.09 ms a frame. `_drawTunnels` 7 %. Physics keeps running (the truck idles): 65 ms/s.

**Streaming (props.update, terrain.update).** Means 12 and 8 ms/s, but p99 59–67 and worst 162–192 ms/s: they
arrive in bursts as chunks enter. Inside: water stream lookups, road `queryNearest`, Box3D body creation for props, the
terrain carve table. The worst driving frame in the control run was 22–48 ms, so the time slicing holds.

### GPU by pass (profiled run, timer queries)

The page wrapped three.js's render and shadow calls in GPU timer queries (`EXT_disjoint_timer_query_webgl2`: the GPU
stamps the time at two points of its command stream). Per second, median (p99 / worst):

| pass | drive | park |
|---|---|---|
| all timed passes | 809 (865 / 919) ms/s | 794 (831 / 831) |
| main pass (the world to the screen) | 705–725 | 772–787 |
| shadow pass (near map every moving frame; far cascade on its 64 m snap or a sun step) | 74 (108 / 147) | 0 (on demand: nothing moved) |
| offscreen (impostor re-bakes, sky cube map) | 10 | 1–3 |

GPU milliseconds are not load here (the clock moves), but their shares split the measured cycles: driving, the main pass
is ~89 % of timed GPU work and the shadow pass ~9 % (~65 Mcyc/s). The timed passes cover ~86 % of the GPU's busy time
(809 ms/s against ~94 % busy). The rest is compositing, the cluster and map canvases, and presenting the frame. Those
are not separable with these tools.

What the tools cannot resolve: the split INSIDE the main pass by object. The GPU is tile-based (it shades the screen in
small tiles, deferring work per tile), so a timestamp around one draw call does not measure that draw's work; Apple's
own guidance is to time per pass. PERF-41's ablations stand in for it (hide one thing, read cycles): terrain hidden
−50 to −60 %, all props −12 to −28 %, ground cover −7 to −20 %, the near shadow light −12 to −23 % (casting plus
receiving). Lever 1 of PERF-41 has since cut the terrain shader 7–14 %.

Map open: the 3D render is skipped (PERF-38) and the GPU drops to 61 Mcyc/s at its lowest clock.

### Memory: allocation and garbage collection (profiled run)

Garbage collection (GC) is the JS engine reclaiming memory nobody references. The young generation (short-lived
objects) is collected by a quick "scavenge" (MinorGC); everything else by a slower mark-compact (MajorGC).

| | drive | map | park |
|---|---|---|---|
| main thread allocation rate (freed by MinorGC) | 46–55 MB/s | 24–96 MB/s | 22 MB/s |
| MinorGC | 1.8–2.1 a second, 1.1 ms/s total, worst pause 1.3 ms | 1–3.5/s, ≤ 0.8 ms/s | ~0.9/s, 0.3 ms/s |
| MajorGC | one every ~9 s, 0.35–0.4 ms/s, **worst 11–12 ms** | none | rare, worst 4 ms |
| JS heap (main) | 160–325 MB sawtooth | 180–310 | 170–240 |
| terrain worker | 1.6–1.9 MB/s, worst major pause 7–11 ms (off the main thread) | | |

GC costs ~1.5 ms/s of main thread: negligible. The one thing worth watching is the 11–12 ms mark-compact every ~9 s
while driving. On this Mac it fits inside the frame (worst frame 22–48 ms in 900 s of driving). On a slower machine it
could be a dropped frame every ~9 s. The heap's top includes the bench's own leak (lever 10).

## The architecture review

For each large cost: what shipped games do, what we do, what closing the gap is worth here.

### 1. HUD and gauges (lever 1; ~45 ms/s)

- **Practice.** A game HUD updates only what changed, and draws text from pre-rendered glyphs. On the web the rule is
  "write, never read style mid-frame": reading anything style-dependent after a DOM write forces the browser to redo
  style or layout early (web.dev, "layout thrashing"). For canvas, MDN's own optimisation guide says to pre-render
  repeated drawing to an offscreen canvas, render only differences, and "avoid text rendering whenever possible".
- **Ours.** The HUD writes transforms every frame even when the change is a fraction of a pixel. The debug panel,
  hidden, still live-updates its sliders. The cluster sets a canvas font every frame, and that forces the recalc.
- **Worth.** ~35–45 ms/s main thread, measured, invisible.
- **Built (2026-11-13, lever 1).** The two strips write their `transform` only when the snapped device-pixel position
  changes (~1 write/s each instead of 60); the hidden debug panel's `.listen()` controllers stop while it is hidden
  (`syncDebugLive` in debug.js). The cluster's `ctx.font` stays: a forced recalc only costs when something is dirty,
  and the render step would pay that same recalc anyway. Bench A-B (`perf-runs/p48-l1`, 6/6 valid, load 0.3/core,
  mediaanalysisd busy on one core throughout): per-second recalcs driving p50 60 → 10, p99 63 → 60, worst 64 → 61;
  parked p50 60 → 2–8; map p50 60 → 6–9. Main thread per second, driving p50 203 → 186, p99 310 → 294; parked p50
  177 → 170, p99 222 → 202 (the clock trap shrinks the totals; postStream and CPU watts are the clean reads).
  Left: 9 recalcs/s from the 10 Hz writers (the POI prompt's `innerHTML`, the hidden debug HUD's Fz read-outs), and
  7 % of driving seconds still at 60/s, all at walking pace or stuck (something animates per frame there; not found yet).

### 2. Rendering CPU (lever 4; 67 ms/s main + ~125 ms/s GPU process)

- **Practice.** Engines separate static from dynamic: static objects never recompute transforms (three.js's own
  manual: set `matrixAutoUpdate = false` on static objects), static geometry is merged or batched to cut per-draw setup
  (Unity's SRP Batcher: "the real CPU cost comes from that setup", not the draw), and identical meshes are instanced.
  Newer APIs record static draws once and replay them (WebGPU render bundles; three.js reported 23.7 → 15.9 ms for
  8000 meshes in its PR).
- **Ours.** Props are already instanced and count-compacted (PERF-10); ~130 draw calls a frame is low. But all 650–960
  objects keep automatic matrices, and 450–740 out-of-view POI objects are walked and frustum-tested every frame. In
  Chrome every WebGL call is also serialised into a command buffer that the GPU process decodes and validates
  (Chromium design doc), so per-draw state changes cost twice: here and in the GPU process.
- **Measured (2026-11-13, PERF-45 §2).** The matrix walk is ~20 ms/s parked (17–25 by seed), timed in-page around
  `scene.updateMatrixWorld()`; the rest of the 67 is the frustum walk, the render lists and the WebGL calls. Skipping
  the walk outright buys 1–14 ms/s of render ms/s (mean 7) under the clock trap. Probe: `wip/perf-45/matrix-probe.mjs`.
- **Worth.** ~~15–25 ms/s main~~ 1–14 ms/s realised at most (above), plus part of the GPU process. WebGPU is NOT proposed: three.js users report its renderer
  slower on the CPU than WebGL for many-mesh scenes (r183), and it is a rewrite.

### 3. Physics: the ground query (levers 3 and 9; 57 ms/s driving, 57 parked)

- **Practice.** A shipped car game's wheel is a raycast (Unity's wheel collider is "a single Physics raycast"), about
  a microsecond against a collision mesh or heightfield. PhysX caches each wheel's hit plane and lets later updates
  reuse it. Simulation-grade titles spend more: Forza Motorsport moved to 8 contact points at 360 Hz; BeamNG runs nodes
  at 2000 Hz and calls collision ~30 % of its CPU. Box2D/Box3D v3 use soft-step sub-stepping (Erin Catto recommends
  starting at 4 substeps).
- **Ours.** The vehicle model is cheap (under 5 % of physics). The cost is the tread solve's ~65 height samples per
  wheel per step through the analytic road carve stack (48–63 % of physics), and Box3D's 8 substeps (5–18 %). The
  per-step reuse of one ground query across the suspension substeps is already the PhysX pattern.
- **Worth.** At rest, exact: nothing (lever 3 is void: rest is never bit-still, see the row). While driving, the exact levers are PERF-43's measured-small ones; the
  big step (a raycast-and-plane wheel) is out of bounds, see below.

### 4. Shadows (no lever; ~9 % of GPU driving, 0 parked)

- **Practice.** Cache what does not move and redraw only what does: Insomniac scrolls cached cascades (SIGGRAPH 2012),
  CryEngine has cached shadow cascades that recentre near the border, Cyberpunk 2077 splits static and dynamic shadow
  slices (SIGGRAPH 2021).
- **Ours.** The same design. The far cascade is cached, snapped to 64 m and redrawn only on a snap or a sun step. The
  near map redraws only on frames where something moved. PERF-41 showed ground cover's shadow casting costs ~0.
- **Already right.** A scrolled near map (static casters cached, only the truck redrawn) could save part of the 74
  ms/s of GPU time, i.e. ≤ 9 % of GPU cycles, at the cost of a second map and its edge redraws. Not worth it now.

### 5. The terrain shader (lever 6; the largest GPU cost)

- **Practice.** Open-world engines stop evaluating a layered terrain material per pixel per frame. They bake it into a
  virtual texture once per region (Unreal's runtime virtual texturing "as a cache for an auto-material, so the GPU
  doesn't re-process the material each frame"), amortised over frames as pages are needed.
- **Ours.** The terrain fragment shader evaluates surface maps, noise and baked-shadow taps for every pixel every frame
  (PERF-41's inventory), now with a baked noise texture.
- **Worth.** An estimate of 20–30 % of GPU cycles. Published results vary from "slight" to large, so it needs a
  prototype on one chunk ring first. ART-STYLE's flat colours help: the bake can be low resolution.

### 6. Streaming (no lever)

- **Practice.** A time budget per frame for loading work: Unreal's `s.AsyncLoadingTimeLimit` (ms per frame), Unity's
  `asyncUploadTimeSlice`.
- **Ours.** The same: a per-frame stream budget (PERF-14's 3 ms slices), workers for chunk heights and routing, and a
  worst driving frame of 22–48 ms over 900 s. **Already right.**

### 7. Frame pacing and rate (levers 5 and 7)

- **Practice.** A fixed physics step with an accumulator and a cap on catch-up (Gaffer on Games, "Fix your
  timestep"); a frame-rate limit in the settings; menus and idle screens drawn at a lower rate.
- **Ours.** The fixed step and the catch-up brake (PERF-32) are textbook. **Already right.** There is no frame-rate
  cap: `requestAnimationFrame` follows the display ("75 Hz, 120 Hz and 144 Hz are also widely used", MDN), so a
  high-refresh screen doubles render and GPU cost for no physics gain. Parked costs the GPU the same as driving.

### 8. Garbage collection (no lever)

- **Practice.** Allocation-free hot loops and object pools, so the young generation stays nearly empty (the
  long-standing advice for real-time JS). V8's scavenger is parallel and its cost tracks the live objects, not the
  garbage (V8 blog, "Orinoco").
- **Ours.** 46–55 MB/s of short-lived allocation driving, at ~1.5 ms/s total GC. **Already right enough.** Only the
  11–12 ms mark-compact every ~9 s is worth a look on slow machines.

### Out of bounds — the price of each rule

| lever | rule it breaks | what it would buy here |
|---|---|---|
| Physics in a Web Worker (its own thread) | physics on the main thread at a fixed step | ~57 ms/s off the main thread (26 %), no heat saving (same work, another core) |
| Rendering through an OffscreenCanvas in a worker | no OffscreenCanvas | ~67 ms/s render + the cluster's font cost off the main thread; no heat saving |
| An engine raycast wheel or vehicle controller | the vehicle model stays ours | physics ~57 → ~15 ms/s (Box3D plus a raycast per wheel), and with it our tread solve |
| Engine types outside `physics-engine.js` (calling Box3D's batch APIs directly) | the adapter seam | at most part of Box3D's 18 %, ~10 ms/s |

None of these is recommended. Each moves or removes work the owner has ruled is part of the product.

## Method and files

- `node test/playtest-bench.mjs --profile --fake-audio --out=perf-runs/p48-profile` (profiled) and the same without
  `--profile` (`perf-runs/p48-control`). `--profile` (new): a Chrome trace per phase (every thread of every process,
  the JS sampling profiler, GC events), GPU timer queries per pass, the JS heap each second, a scene census mid-drive and
  mid-park. `--fake-audio` (new): Chrome's fake sound device. No `--record`.
- `node test/bench-trace-report.mjs perf-runs/p48-profile` (new): per trace, busy ms/s per thread with per-second spread,
  JS time by frame-loop section and by function and file, GC per thread. A 300 s drive trace is ~85 MB gzipped, over a
  GB raw, so it streams line by line.
- `wip/perf-48/` (git-invisible): `persec.mjs` (per-second bucket spread), `recalc.mjs` (the forced-recalc A/B),
  `dom.mjs` (HUD writes per second), `odo.mjs` (the odometer micro-benchmark), `run.sh`.
- Raw runs: `perf-runs/p48-profile`, `perf-runs/p48-control` in the perf worktree (gitignored).
- Machine: held quiet by the orchestrator for both runs (load 0.13–0.30 per core); the OS's photo-analysis service was
  using ~1 core throughout.

## Sources

- Gaffer on Games, Fix your timestep: https://gafferongames.com/post/fix_your_timestep/
- PhysX 3.3.4 Vehicles (cached hit planes): https://archive.docs.nvidia.com/gameworks/content/gameworkslibrary/physx/guide/3.3.4/Manual/Vehicles.html
- Unity wheel colliders: https://docs.unity3d.com/Manual/wheel-colliders-introduction.html
- Forza Motorsport tyre model, 8 contact points at 360 Hz: https://gamingbolt.com/forza-motorsports-48x-improved-tire-physics-showcased-in-new-comparison-clip
- BeamNG nodes and collision: https://documentation.beamng.com/modding/vehicle/sections/nodes/
- Box2D v3.0 release (soft step, substeps): https://box2d.org/posts/2024/08/releasing-box2d-3.0
- three.js manual, matrix transformations: https://threejs.org/manual/en/matrix-transformations.html
- three.js forum, updateMatrixWorld cost: https://discourse.threejs.org/t/updatematrixworld-performance/3217
- three.js BatchedMesh: https://threejs.org/docs/api/en/objects/BatchedMesh.html
- Unity SRP Batcher: https://docs.unity3d.com/2019.4/Documentation/Manual/SRPBatcher.html and https://blog.unity.com/de/technology/srp-batcher-speed-up-your-rendering
- Chromium GPU command buffer: https://chromium.googlesource.com/chromium/src.git/+/fafff21/docs/security/research/graphics/gpu_command_buffer.md
- WebGPU render bundles: https://toji.dev/webgpu-best-practices/render-bundles and three.js PR https://github.com/mrdoob/three.js/pull/28347
- three.js forum, WebGPURenderer CPU cost: https://discourse.threejs.org/t/webgpurenderer-2x-slower-cpu-and-5-10x-slower-first-frame-than-webglrenderer-on-many-mesh-scenes-r183-same-on-both-backends/91904
- Insomniac, CSM scrolling (SIGGRAPH 2012): https://advances.realtimerendering.com/s2012/insomniac/Acton-CSM_Scrolling(Siggraph2012).pdf
- CryEngine cached shadows: https://cryengine.com/docs/static/engines/cryengine-3/categories/1114113/pages/21267738
- Cyberpunk 2077 shadows (SIGGRAPH 2021): https://history.siggraph.org/wp-content/uploads/2022/06/2021-Talks-Dybisz_Shadows-Optimizations-in-Cyberpunk-2077.pdf
- Unreal virtual texturing: https://dev.epicgames.com/documentation/en-us/unreal-engine/virtual-texturing-in-unreal-engine and https://medium.com/gamedev4k/use-runtime-virtual-textures-to-improve-landscape-performance-in-unreal-engine-e927f77f3dcc
- Unreal streaming settings: https://dev.epicgames.com/documentation/en-us/unreal-engine/streaming-settings-of-the-unreal-engine-project-settings
- Unity asyncUploadTimeSlice: https://docs.unity3d.com/2021.3/Documentation/ScriptReference/QualitySettings-asyncUploadTimeSlice.html
- MDN, Optimizing canvas: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
- MDN, requestAnimationFrame: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- web.dev, layout thrashing: https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing
- V8, Orinoco parallel scavenger: https://v8.dev/blog/orinoco-parallel-scavenger
- Construct, low-garbage real-time JS: https://www.construct.net/en/blogs/construct-official-blog-1/write-low-garbage-real-time-761
- Apple, tile-based deferred rendering: https://developer.apple.com/documentation/metal/tailor-your-apps-for-apple-gpus-and-tile-based-deferred-rendering and Metal counters: https://developer.apple.com/videos/play/tech-talks/10001/
