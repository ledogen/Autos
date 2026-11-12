---
id: PERF-40
type: infra
status: open
opened: 2026-11-12
severity: major
source: owner, 2026-11-12 — "let's figure out how to automate the playing side of this and find a good alternative to the
  power metrics that doesn't require an admin password. That way, you're able to automate a playtest performance
  measurement on your own and I don't have to be in the loop. And we can run this regularly when weighing changes that
  might impact performance and as an occasional health check so we don't accidentally regress like we did here."
  Design approved the same day, with one concern: "concerned an autopilot would crash and then the test wouldnt include
  terrain streaming."
relates: [PERF-37 (the regression this would have caught; sessions 1–3 are the manual version), PERF-41 (the GPU budget
  it measures first), PERF-08 (test/profile.mjs, the scenario harness this supersedes for whole-session play),
  test/drive-soak.mjs (the autopilot it ports)]
branch: perf/perf-37-tire-map — worktree /Users/ledogen/CodeShit/CarGame-perf37
---

# PERF-40 — an automated playtest that measures power, without the owner

## Why

PERF-37 took three owner-driven sessions: the owner played in a harness window and ran `sudo powermetrics` by hand. A
regression of about +1 W from the BUG-70 tread solve shipped and was only found by heat. This makes the measurement
something a session can run on its own: to weigh a change before landing it, and as an occasional health check.

## Design (approved 2026-11-12)

1. **Power without root: `test/lib/ioreport.py`.** It reads the IOReport energy counters `powermetrics` reads: CPU
   Energy, GPU Energy and DRAM, plus the GPU P-state residency weighted by pmgr's `voltage-states9` frequency table.
   It gives CPU / GPU / DRAM watts, GPU busy % and GPU MHz, from `python3 -I`. The frequency table matched the owner's
   `powermetrics` output exactly (338 / 618 / 796 / … / 1470 MHz).
   - **The comparison metric is GPU active cycles** (busy % × MHz), not GPU ms or raw watts. The GPU lowers its clock
     as its load drops, so GPU timer queries stay near 12 ms a frame whatever changes. GPU watts swing ±50 % over 6 s
     at a steady state. Active cycles held to within 1–12 % between two identical baselines (PERF-37 session 3).
2. **The driver: a virtual gamepad.** The game polls `navigator.getGamepads()` (`src/gamepad.js`). An injected page
   script presents a gamepad whose axes the autopilot sets each frame. The real game loop runs with streaming,
   rendering, physics and the map, exactly as with the owner's controller. **No change to `src/`.** The autopilot is
   `drive-soak.mjs`'s road pursuit (it steers toward a point a set distance ahead on the route), ported to read the
   live `window.__road()` network and `window.__vs`.
3. **It must not crash out of the test (owner's concern).** A truck that stops making progress stops streaming, and the
   run would then report a cheap world. So:
   - **Recover.** Stuck (under 1 m/s for 4 s with throttle on), flipped, or off the route by more than 15 m: re-seat
     onto the route at the next point AHEAD with `window.__teleport`, the way drive-soak re-seats. That keeps the
     streaming front moving.
   - **Count the recoveries** in the report, with time and place.
   - **Invalid unless it streamed.** The drive phase must cover its distance (≥ 3 km a seed) and build a minimum
     count of new terrain chunks and road tiles. Otherwise the run fails loudly and is not reported as a number.
4. **One scripted session, about 6 minutes a seed.**
   - Enter story mode and wait for the region warm.
   - Drive a road route at play speeds, with one off-road leg.
   - Open the map: pan and zoom for 30 s.
   - Park for 30 s (the GPU-only cost).
5. **Measured per phase:**
   - fps, p95 and the worst frame;
   - main-thread ms per second by `__perfData` bucket;
   - CPU % per Chrome process (`ps` cumulative CPU time; the renderer minus the main thread is the workers);
   - CPU / GPU / DRAM watts and GPU active cycles;
   - triangles and draw calls.
6. **The run setup:**
   - **Seeds:** three seeds drawn at random once and pinned in the script, so runs compare (not a default world: CLAUDE.md
     § Seeds).
   - **Screen:** headless at the owner's canvas (2090 × 1226 device px, dpr 2, Normal tier), on the real M4 GPU (ANGLE
     Metal, confirmed). `--headed` for a look.
7. **A/B: `--a=<checkout> --b=<checkout>`** runs the two builds alternately, A-B-A-B, each on its own Vite. The fanless
   Air heats over a run, and alternating cancels that drift. The report gives each delta with its noise band.
8. **Health check.** Each run appends one line to `.planning/perf/history.jsonl` (committed). A run that is worse than
   the last good one by more than the noise band says so. Not in `npm test`: a run is about 20 min and wants a quiet
   machine (the shared-CPU cap applies: one bench at a time, and not while lanes run heavy gates).

## The autopilot is a module, for AI cars later (owner, 2026-11-12)

"general purpose autopilot will be very valuable for AI cars in game. develop your solution with the intent to expand
it to that later". So the driver is `test/lib/autopilot.mjs`, kept separate from the bench:

- **Pure.** No DOM, no window, no Three.js, no engine. One instance per car. Vehicle state goes in, and the controls a
  driver would give come out: steer as a road-wheel angle (+ = left, the `vehicleState.steerAngle` convention),
  throttle, brake.
- **Pieces that swap separately:**
  - the route (`makeRoute`, a random walk; an AI car with a destination swaps in a shortest path);
  - the speed plan (corner speed from the next 90 m of curvature);
  - pure pursuit (steer at the route point 0.9 s ahead);
  - `detour(to)`, which leaves the road and rejoins the route ahead.
- **It reports trouble and never acts on it.** The reports are stuck, flipped, off the route and a route jump.
  `resume()` gives the pose to re-seat at, and what to do with it is the consumer's choice.
- **Self-check:** `node test/lib/autopilot.mjs` runs a kinematic bicycle on a 100 m ring. Measured: 0.68 m off the
  line, 20.6 m/s top, and 'stuck' reported with the wheels locked.
- **The bench is one consumer.** It puts the controls on the virtual pad. It turns trouble into a `__teleport`, then
  holds I to crank (a seat is a dead, parked truck) and presses RB to release the park brake. It hands the page its
  own copy of the module (a `data:` import), so an A/B against an older checkout drives both builds identically.
- **Missing for AI cars:** other cars and obstacles, lanes, junction right-of-way, reversing out of a dead end.
  `drive-soak.mjs` still has its own pursuit; fold it onto the module when convenient.
- **Promotion:** move the file to `src/` when the AI-car consumer lands. Until then nothing in `src/` imports it.

## Acceptance

- [ ] `test/lib/ioreport.py` checked in, with a self-check (a sample has CPU and GPU watts and a GPU MHz on the table).
- [ ] `node test/playtest-bench.mjs` runs unattended to the end on three seeds, drive phase ≥ 3 km a seed with streaming
      verified, recoveries counted.
- [ ] Two runs of the same build agree within the reported noise band.
- [ ] `--a/--b` on main 07581275 vs this branch shows the PERF-39 tire saving (physics ms/s down) and the PERF-38 map
      saving (map phase main-thread ms/s down).
- [ ] CLAUDE.md § Diagnostic tools names it; LAYOUT.md lists the files.
