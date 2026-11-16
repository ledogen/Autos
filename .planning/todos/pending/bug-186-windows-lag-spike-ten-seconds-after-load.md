---
id: BUG-186
type: bug
status: open
severity: major
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "This is gonna be a really tricky bug to track down I think If I load up a world on the Windows machine and start driving about 9 or 10 seconds in, I get hit with a huge lag spike in frame drop Probably down to an average of 5 frames per second Very sporadic, not an even 5 fps It feels like the world catching up Also, sometimes when I drive for a very long time, it'll hit me again for like 5 or 10 minutes of driving It's the absolute worst if you spawn in and just immediately take off Especially if you're loading a save where the vehicle is already in motion. I haven't observed it on the Mac yet, but if it's from a newer build I haven't been testing on the Mac and it's very heavily loaded so I can't easily test on it without stopping everything. Or it could just be that the Mac is faster."
relates: PERF-50, PERF-45, FEAT-227, src/main.js, src/terrain.js
---
lane: Perf

# BUG-186: Windows: a lag spike to about 5 fps roughly 10 s after loading, and again on long drives

## Next steps
Orchestrator: land `land/bug-186` (two src files), then the owner drives off at once on Windows on main (m4air:8001). If it still
drops, the owner adds `?hitch=1` to the URL, drives into the spike, opens the console (F12) and runs `__hitchDump()`: say whether
the slow lines carry "+N shaders".

## Summary
On the Windows machine, 9 to 10 s after a world loads and the truck drives off, the frame rate drops to an uneven 5 fps for a while
("feels like the world catching up"). It recurs after long drives, and is worst when taking off at once or resuming a save already in
motion. Cause found on the Mac by counting: the late lamp-variant sweep (PERF-21) made the main thread WAIT on every late shader
compile, about 14 waits per newly seen material, one per frame. Fixed: the sweep now issues the compiles and draws only when they are done.

## Description
### What runs after "world ready" and while streaming (main 4a5bdcbe)
| Work | Trigger | When | Scales with speed? |
|---|---|---|---|
| **Late lamp-variant sweep** (`_lampSweepStep`, main.js; `compileLightState`, vehicle-model.js) | any frame whose shader-program count moved (a material type seen for the first time) | 1st new prop/road/water material type: about 3–8 s after take-off; again whenever a new type streams in (a first pond, a new POI model on a long drive) | yes: faster driving meets new types sooner and in clusters; every restart sweeps all 15 light states again, one per frame |
| Boot prewarm (`prewarmLightPrograms` + campfire) | load | before `_worldReady`, behind the load caption | no |
| Far shadow pass (sunFar) | truck crosses a 64 m snap, sun moves, streamed geometry count changes | about every 2.5 s at 25 m/s | linear, one pass per crossing, no backlog |
| Terrain chunk streaming + bake (PERF-48, DEC-234) | ring moves | per chunk, capped at BAKES_PER_FRAME | bounded per frame, no burst |
| Road-network worker adoption + prop intrusion sweep (PERF-30/33) | a network lands | adopt between frames; the prop sweep paid 2 chunks a frame | bounded per frame |
| Prop impostor atlas | sky look change | rebake = uniforms only | no |
| 2D map tile builds | map open / panned | timers in map2d.js | no (only with the map open) |
| Autosave (FEAT-42) | every 1 s in a story run | constant | no |

### Evidence (free roam, seed 1768572700, full throttle from the first frame, CDP CPU throttle 4×)
Counts are the evidence; the Mac is loaded, so every ms below is wall-clock and report-only. "Blocking first use" = a draw that reads
a program's link status before the driver ever said its compile was done (the main thread waits on the GPU process there).
| Build | Programs linked 3–9 s | Blocking first uses 3–9 s | of them inside the sweep | Blocking, 60 s total |
|---|---|---|---|---|
| main 4a5bdcbe | 68 | **86** | 72 | 138 |
| pushed 736266b5 (Pages) | 30 | 3 | 0 (it only called `renderer.compile`) | 51 |
| land/bug-186 | 72 | **3** | 0 | 48 |
Example: the first water material arrived at 7 s: 15 programs, 1 by the world render and 14 by the sweep, each of those 14 a
blocking draw on main. Worst frame 7–9 s (timing): main 150 ms, fix 134 / 67 ms; fps those seconds main 14/13, fix 18/28.
Why Windows and not the Mac: the macOS wait is short (link-status waits summed 46 ms over 60 s), while Chrome on Windows compiles
through ANGLE into D3D HLSL, whose compiler is the slow step (public Mozilla and Khronos WebGL reports: the time sits in the D3D compiler,
3–10× slower than native GL; old data, not re-checked against today's Chrome). 72 waits in 6 s at even 50 ms each is 3.6 s of stall in 6 s: the owner's uneven ~5 fps.
Two changes since the pushed build made it: BUG-175 (c74264e5) made the late sweep DRAW each state (blocking) instead of
`renderer.compile` (issued, never waited on), and the light cull (ec6d28e7) raised the states from 10 to 15 (+50 % variants).
The Windows build assumed: main served from m4air:8001 (Vite dev on the main checkout, the "newer build"). On the pushed Pages
build the sweep cannot block, so if the owner saw it THERE this fix does not cover that case.

### Fix (land/bug-186)
`_lampSweepStep` issues each state with `renderer.compile` (vehicle-model.js `compileLightState(..., draw = false)`), then polls
`program.isReady()` (KHR_parallel_shader_compile, never blocks) over every program, and does BUG-175's 1-pixel draw only once all are
ready. BUG-175's pipeline warm-up is kept; it just no longer forces the compile.

### Not covered / residual
- The world render's own first use of each new material (≈ 45–50 blocking in 60 s, same as the pushed build) still waits. Hiding
  that needs new materials compiled before they enter the frustum: a separate change, only if the owner still sees spikes.
- Story mode was not reproduced headless (the probe's story entry stalled); free roam exercises the same sweep.
- Not run on Windows or D3D: no Windows box here.

## Tracker
- [x] What is scheduled about 10 s after load (shader pre-warm sweeps, far shadow, road network adoption, chunk backlog) listed with costs
- [x] Reproduced, or the reason it cannot be on the Mac stated (the mechanism counted at cpu×4; the Mac's short compile wait hides the fps drop)
- [x] Fixed or bounded: blocking shader waits 3–9 s after take-off, 86 → 3 (worst frame timing-only)
- [ ] Owner confirms on Windows

## Links
- Probe: `wip/bug-186/probe.mjs <port> <seed> <cpuRate> <s> <out.json>` + `summ.mjs <out.json>` (perf worktree, git-invisible)
- https://www.khronos.org/webgl/public-mailing-list/public_webgl/1702/msg00051.php (ANGLE/D3D compile cost, 2017)

## Files
src/main.js (`_lampSweepStep`), src/vehicle-model.js (`compileLightState`)

## Log
- 2026-11-16: filed from the owner's inbox note.
