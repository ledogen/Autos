---
id: PERF-55
type: perf
status: done
severity: minor
opened: 2026-11-22
source: owner, 2026-11-22 — free roam on High felt like it slowed down as if thermally throttled; suspects the recent shadow changes compound on High
relates: PERF-40, PERF-41, BUG-217, BUG-229, FEAT-243, FEAT-223, src/main.js, test/playtest-bench.mjs
---
lane: perf

# PERF-55: What each quality preset costs on the M4 Air, and why High is slow

## Next steps
Owner: pick what High should be (as shipped, or with a render-height cap: 1400 lines holds 60 fps cool, 1600 holds
60 fps but reaches heavy thermal pressure). Orchestrator: land the bench options (land/perf-55-preset-cost).

## Summary
The owner's High session held no frame times, so this measures it. The bench gains `--quality` and `--window`
(the preset and the canvas), a thermal-pressure read, and per-second fps stats. Results below.

## Description
### The owner's own session (2026-11-22 22:35–22:42, built game, fresh tab, free roam, full screen)
Machine: 15-inch M4 Air (Mac16,13), panel 2880 × 1864, macOS "looks like" 1710 × 1107 points, so Chrome reports
devicePixelRatio 2 and a full-screen canvas on High is 3420 × 2214 device px (7.6 Mpx; macOS then scales the frame down
to the panel). Normal caps at 1200 lines: 1854 × 1200 (2.2 Mpx). High full screen shades 3.4× Normal's pixels.
Outside samples (test/lib/ioreport.py, 1 Hz):
- Normal, 4 min: GPU 81 % busy at ~880 MHz ≈ 715 Mcycles/s active, 1.2 W.
- High from 22:38:58: GPU 99 % busy at 1468 MHz (top clock 1470) ≈ 1455 Mcycles/s, 11–13 W: saturated at once, ~10× the GPU power.
- From 22:40:28 the clock sagged to 1430–1436 MHz and GPU power fell 13.2 → 11.5 W; the owner felt the lag from ~22:40.
- Hitch log (?hitch=24) at 22:41: frames of 40–52 ms carrying only 3–4 ms of main-thread CPU (frame.render ~2 ms):
  GPU-bound, not main-thread-bound. pmset recorded no thermal warning.
Raw: `wip/run-logs/perf-1123/` (capture 1795416091914) in the main checkout; the io samples were in the orchestrator's scratchpad (owner-io.jsonl).

### Bench at the owner's full-screen canvas (2026-11-22/23, main 27dd34b1 + bench options)
`--window=1710,1194` gives the 1710 × 1107 CSS viewport of a full-screen window on this panel (the headless window
loses 87 px to browser chrome). Before every session the GPU idle baseline was read (ioreport 1 s × 5): 0–2 Mcycles/s
on all 27 sessions; load 0.9–2.3. `--fake-audio`, pinned seeds 1768572700 / 17535907 / 759313244.
Presets, one rep per seed, order rotated per seed for heat (N H L · H L N · L N H), 300 s drive, all 9 valid:

| preset | canvas | phase | fps (median s) | s < 55 fps | p99 / worst ms | GPU Mcyc/s @ MHz | Mcyc/frame | main Minstr/s | CPU / GPU W | thermal |
|---|---|---|---|---|---|---|---|---|---|---|
| Low | 1112 × 720 | drive | 60.0 (60) | 0.2 % | 18.6 / 110 | 181 @ 422 | 3.0 | 1208 | 0.7 / 0.5 | 0 |
| Normal | 1853 × 1200 | drive | 59.9 (60) | 0.2 % | 18.6 / 61 | 674 @ 724 | 11.3 | 1462 | 0.9 / 1.9 | 0 |
| High | 3420 × 2214 | drive | 45.2 (45) | 88 % | 94 / 122 | 1410 @ 1417 | 31.2 | 1646 | 0.9 / 14.1 | 2 |
| Low | | map | 60.0 (60) | 0 % | 18.7 / 146 | 190 | 3.2 | 881 | 0.5 / 0.5 | 0 |
| Normal | | map | 60.0 (60) | 0 % | 18.9 / 226 | 674 | 11.2 | 949 | 0.5 / 2.1 | 0 |
| High | | map | 47.7 (49) | 100 % | 82 / 117 | 1325 @ 1327 | 27.8 | 1268 | 0.7 / 12.5 | 2 |
| Low | | park | 60.0 (60) | 0 % | 18.6 / 19 | 179 | 3.0 | 715 | 0.6 / 0.6 | 0 |
| Normal | | park | 60.0 (60) | 0 % | 18.7 / 19 | 661 | 11.0 | 786 | 0.5 / 2.1 | 0 |
| High | | park | 49.0 (49) | 100 % | 65 / 69 | 1323 @ 1323 | 27.0 | 830 | 0.5 / 12.5 | 2 |

Thermal is macOS's thermal-pressure level (`notifyutil -g com.apple.system.thermalpressurelevel`, no root; 0 nominal,
1 moderate, 2 heavy). Every High session reached level 2 about 2 min into its drive (level 2 for 48–62 % of the drive,
100 % of map and park), and the GPU clock was then held near 1320 MHz instead of its 1470 top: 10 % fewer cycles a
second for a load that already needed more than the top clock. Normal and Low never left level 0. `pmset -g therm`
reports nothing on Apple silicon, which is why the owner's pmset read was empty.
The bench's default canvas (2090 × 1226, the 1045 × 700 window) is 2.6 Mpx; High full screen is 7.6 Mpx (2.9×), so a
default-window High run (936 Mcyc/s in a 60 s check) does not show the owner's problem.

### High − Normal by lever (one at a time on Normal, owner canvas, 180 s drive, seeds 1768572700 + 759313244)
GPU load is read as Mcycles per frame (active cycles ÷ fps): a saturated run cannot show more cycles a second, but it
shows them per frame. Deltas are per-seed matched, then averaged. Temporary overrides on a scratch branch only
(`scratch/perf-55-levers`, a `window.__qp` handle + bench `--qset`, never landed).

| lever (on Normal) | drive Mcyc/frame Δ | share of High − Normal | park Δ | main Minstr/s Δ (drive) |
|---|---|---|---|---|
| (a) resolution native (3420 × 2214) vs the 1200-line cap | +14.7 | 76 % | +12.9 | −45 (fewer frames) |
| (b) ring 3 / warm 3 vs 2 / 1 | +2.0 | 11 % | +1.5 | +246 |
| (d) prop rings 3 / 2 / 6 (measured on top of (b): it needs the bigger ring) | +1.8 | 9 % | +1.7 | +102 |
| cover density / fade + fog (one seed; the other was 30 m short of the 1.5 km bar) | +0.5 | 2 % | +0.6 | +23 |
| (c) shadow map 4096 + atlas 384 vs 3072 + 256 | +0.1 | 0.4 % | +0.1 | −4 |
| sum | 19.0 | | | |
| High measured | +19.2 (10.1 → 29.2) | 100 % | +15.7 | +196 (at 47 fps) |

At 60 fps High would need 29.2 × 60 = 1750 Mcycles/s; the GPU tops out at 1470 and sustains ~1320 under heavy
pressure. Normal needs ~610. The frame is GPU-bound (the owner's hitch log: 40–52 ms frames with 3–4 ms of main-thread
CPU), so the main-thread columns are context.

Options (High with a render-height cap, everything else High; owner canvas, same two seeds):

| option | canvas | drive fps / s < 55 | Mcyc/s (per frame) | GPU W | thermal |
|---|---|---|---|---|---|
| High as shipped | 3420 × 2214 | 47.0 / 84 % | 1373 (29.2) | 13.2 | 2 |
| High, cap 1600 lines | 2471 × 1600 | 60.0 / 0.6 % | 1242 (20.7) | 8.4 | reached 2 on one seed (31 % of drive), 1 on the other |
| High, cap 1400 lines | 2162 × 1400 | 60.0 / 0.3 % | 1062 (17.7) | 4.2 | 0 |
| Normal | 1853 × 1200 | 60.0 / 0.3 % | 606 (10.1) | 1.9 | 0 |

### Did the shadow work move High's cost? (A-B-A-B, High at the bench's default 2090 × 1226 canvas)
Head (land branch on main 27dd34b1; its later commits are docs only) against 8a3636d3, the parent of the first BUG-217
shadow commit (bfc280b7): BUG-217, BUG-229, FEAT-243 and the 139 first-parent commits since. FEAT-223 (11-16) is in
both. The default canvas keeps High below saturation, so cycles a second still measure load. 2 seeds × 2 reps, order
flipped each pair, 8 of 8 valid, idle baselines 0–2 Mcycles/s.

| seed | phase | before Mcyc/frame | head Mcyc/frame | Δ | rep-to-rep spread |
|---|---|---|---|---|---|
| 1768572700 | drive | 18.22 | 18.68 | +0.46 (+2.5 %) | 0.01–0.04 |
| 759313244 | drive | 15.80 | 16.00 | +0.20 (+1.2 %) | 0.18–0.23 |
| 1768572700 | park | 15.63 | 15.91 | +0.29 (+1.8 %) | 0.05 |
| 759313244 | park | 16.00 | 16.27 | +0.27 (+1.7 %) | 0.14–0.47 |

So everything since 11-18 adds about 2 % GPU work per frame on High: ~0.3 Mcycles/frame, against the +14.7 that the
native resolution adds at the owner's canvas. Not the cause. fps is 60 in all eight. The main thread did grow more:
+133 Minstr/s while driving (1666 → 1799, +8 %) on both seeds. That is not shadow work (shadow passes are GPU work),
and the frame is GPU-bound, so it is noted, not chased here.

### Sustained High (one 32-minute session: 4 back-to-back reps on seed 1768572700, owner canvas, no cooling gaps)
Same seed, same route every rep, so rep 1 and rep 4 compare like for like.

| rep (start) | drive fps / s < 55 | p99 / worst ms | GPU Mcyc/s @ MHz | Mcyc/frame | GPU W | thermal level 2 |
|---|---|---|---|---|---|---|
| 1 (0 min) | 42.3 / 98 % | 104 / 132 | 1367 @ 1369 | 32.3 | 13.1 | 77 % of the drive |
| 2 | 40.2 / 99 % | 110 / 133 | 1259 @ 1260 | 31.3 | 10.3 | 100 % |
| 3 | 39.7 / 100 % | 114 / 145 | 1231 @ 1232 | 31.0 | 9.8 | 100 % |
| 4 (~26 min) | 39.4 / 100 % | 115 / 147 | 1222 @ 1223 | 31.0 | 9.6 | 100 % |

The work per frame stays put (31–32 Mcycles) while macOS walks the GPU clock down, 1470 → 1369 → 1223 MHz, and fps
follows it: −7 % from the first drive to the last (the first two minutes of each drive: 46.9 / 46.6 fps in rep 1 against
40.0 / 41.6 in rep 4). The main thread's clock does not move (2.51 → 2.46 GHz). That is the owner's "slows down as if
throttled": it is throttled, on a load already 20 % past the GPU's top clock before any throttling.

### Conclusion
High's cost is the native render resolution, not shadows. At the owner's full-screen canvas High shades 3.4× Normal's
pixels, and that alone is 76 % of the extra GPU work per frame. Ring 11 %, prop rings 9 %, cover and fog 2 %, shadow map
and atlas 0.4 %. The shadow work since 11-18 adds about 2 % per frame. High needs ~1750 Mcycles/s for 60 fps; the GPU
gives 1470 at most and ~1220 once heavy thermal pressure sets in after ~2 min. Preset numbers are the owner's call; the
measured options are in the table above (a 1400-line cap holds 60 fps at 4.2 W and thermal level 0).

## Tracker
- [x] Bench `--quality=<tier>` (applied once story is live, terrain settled), recorded in output and history rows
- [x] Low / Normal / High per phase at main's head, same seeds, heat-balanced order
- [x] High − Normal split by lever (resolution, ring, shadow map + atlas, prop rings)
- [x] High at main vs High before BUG-217 (A-B-A-B)
- [x] One long High session: fps and clocks first 5 min vs last 5 min
- [x] Owner: High's resolution: capped at 1400 lines (DEC-485)

## Open questions
- (answered 2026-11-24: cap High at 1400 lines, DEC-485.)

## Files
`test/playtest-bench.mjs`

## Log
- 2026-11-22: ticket opened; bench options on land/perf-55-preset-cost.
- 2026-11-23: 36 measured sessions + 7 checks, all at an idle GPU baseline of 0–3 Mcycles/s. Invalid: one cover/fog lever
  session (1.47 km < 1.5) and the first full-screen check (CDP timeout at 3420 × 2040; not reproduced in 13 later High
  full-screen sessions). Bench: `--quality`, `--window`, thermal-pressure read, per-second fps stats (f4afa547); 0 gates cover it.
  Raw runs: perf-runs/perf-55/ in the CarGame-perf55 worktree (git-ignored; agg.py reads them). Lever overrides: branch scratch/perf-55-levers, never land.
- 2026-11-24: owner picked "Cap High at 1400 lines"; High resHeight 1400 in QUALITY_PRESETS (DEC-485). Last open item; closed.
