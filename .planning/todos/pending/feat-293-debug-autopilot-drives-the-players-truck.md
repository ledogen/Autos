---
id: FEAT-293
type: feature
status: open
severity: major
opened: 2026-11-18
source: owner, in chat, 2026-11-18 (DEC-428)
relates: DEC-428, DEC-084, PERF-40, feat-multi-vehicle-ai-traffic, src/autopilot.js, src/auto-drive.js
---
lane: engine & world

# FEAT-293: Driving AI V1: a debug option that drives the player's truck, random turn at every junction, until any input

## Next steps
Owner: watch it drive (owed card feat293-driving-ai-watch). Then land `land/feat-293-driving-ai`. Open follow-ups: the
tunnel-portal wedge on a 37 % climb (seed 1830183820, see Description), ML (see "What an ML driver would need").

## Summary
A debug-panel option hands the truck to a driving AI. It drives the road on its own lane, takes a random turn at every
junction, turns round at dead ends, and drives indefinitely. Any driving input from the player takes control back.

## Description
### How to use it
Backtick (debug panel) → folder **Driving AI (FEAT-293)** → tick **AI drives (any input: yours)**. Any driving key (W A S
D, Space, Shift, E, Q, I) or a pad pedal / the left stick hands the truck back at once and unticks it. Camera, map, pause
and menus do not. **Reset when stuck** (default off): when the AI gives up, the game re-seats the truck 40 m on along its
route (the teleport) and it drives on; off, it latches the park brake, says why in **Status**, and hands back.
**Status** reads: state · speed → planned speed · the next turn (left / right / straight on, metres, how many ways) · the
last trouble.

### Architecture (V1): the classical stack, kept
The steer was to weigh a learned policy against the classical stack; the code says classical for V1. It existed, it is
pure and headless-testable, and every failure is explainable. Each layer got good rather than replaced.
`src/autopilot.js` (pure: no DOM, no Three.js, no engine types, one instance per car, an rng handed in):
1. **Route**: reads the LIVE network (`road._network`) at each junction, so it only ever plans over roads that are built.
   It takes a random exit (never the road it came on, never a > 150° switchback). A dead end, or the fence (a story
   region's wall, 150 m inside), ends the route. The driver stops 8 m short, makes a three-point turn (forward on full left
   lock, back on full right lock, each leg ending at the deck's edge), and the route comes back down the same road.
2. **Speed plan**: stations every 8 m out to the stopping distance (90–260 m). Each bend's speed is √(aLat·R), with
   aLat = 0.42·μ·g (μ is the tire's own frictionCoeff · pacejkaD · the worst wear scale, so worn tires slow it). Then a
   backward pass v_i = min(v_bend, √(v_{i+1}² + 2·a_dec·Δs)), with a_dec = 0.38·μ·g·cosθ + g·sinθ: a descent brakes worse,
   a climb better. Add a stop at the end of the known route, and a sight-distance cap (it must stop inside 90 m on this
   slope). That cap is what slows it on steep descents: 23 m/s flat, ~14 m/s at −20 %, ~6 m/s at −30 %.
3. **Path tracking**: pure pursuit on its own lane: a quarter deck (2.5 m) right of the centreline on the 10 m two-lane
   deck, tapered to the centre in bends tighter than 60 m, centred in bores. The look-ahead is 0.8 s of travel + 3 m
   (5–22 m), cut to 0.8·R in a tight bend so it does not chord a hairpin.
4. **Actuation**: a PI speed loop with grade feed-forward. It has a careful foot: the throttle rises at most 1.5 /s, is
   held back as the bend uses the lateral budget (friction circle), and lifts on oversteer (yaw rate above the steering's
   kinematic rate: the first soak spun the truck at full throttle, rear-drive). It never brakes at a standstill (on the
   automatic that is reverse); the handbrake holds. Gears: the default 4R44E automatic shifts itself. On the M5OD manual
   the AI picks the gear (up at 78 % of the redline, down under 1700 rpm, or when a climb pins the throttle under 2200)
   and sends shift requests through the clutch assistant (needs the assistant on, the default).
5. **Recovery**: engine off → holds the key until it runs (8 s). Stuck (throttle down, under 0.4 m/s for 3 s) → back up
   ~6 m and try again, three times a minute. Off the deck (> 2.5 m past the edge for 1.5 s) → drives back onto it at
   walking pace. It gives up, with the reason, on: its side / its roof, a flat tire, an empty tank, a seized engine, a
   dead engine, three failed tries, lost the road (> 40 m off it), could not turn round.

`src/auto-drive.js` is the game's consumer. Its controls go through `src/vehicle.js` `setAutoDriver`, the player's own
path: unramped pedals as on a pad, position steering slewed at the pad's rate inside the speed envelope, the ignition,
the park latch, the clutch assistant, a doze's slack hands. It never writes a force. PERF-40's bench drives the same
module in its old mode (`keepRight: false, recover: false, deadEnd: 'jump'`).

**Story systems**: run as for a player. The clock, fuel, energy and hunger go on, and a doze drops its hands
(SM-INV-1). Proposal: a story run keeps the option (it is debug-only), and nothing gates missions on it. If the owner
wants it, a run that used it could carry an "assisted" mark on its result. Not built.

### Numbers (headless soak, `node test/drive-ai-soak.mjs`, real physics + world, 4R44E automatic)
13 random seeds (`wip/feat-293/seeds*.txt`, never seed 6), 40.1 km, 68 junctions, 3–4 km a seed, radius 1500 m.
Grade band = the road grade under the truck at that moment.

| Grade band | km driven | Interventions | km between interventions |
|---|---|---|---|
| under 8 % | 18.2 | 0 | none in 18.2 km |
| 8–15 % | 12.2 | 0 | none in 12.2 km |
| 15–24 % | 8.7 | 1 | 8.7 |
| over 24 % | 1.0 | 0 | none in 1.0 km |

- Speed: top 88 km/h (vMax 24 m/s); mean 51 km/h against a planned 60 km/h (the gap is the careful throttle out of
  bends and up climbs).
- Lateral error from its own lane: the per-seed median is 0.09–0.30 m; the per-seed p99 is 1.6–6.4 m (near-hairpin
  junction turns at full lock run wide). Worst 15.8 m (seed 1170310009 at (182, −505), 6.7 m/s, a 42 m radius
  junction turn: it left the deck and drove itself back on, a `rejoin`).
- Time off the deck: 25.8 s in 40 km (a few junction turns). Manoeuvres: 4 three-point turns, 2 reverse-outs, 2 rejoins.
- Tire wear: 0.11 % a km (no human baseline measured to compare with).
- Cost: the median per physics step is 16–30 µs (one seed 2.5 µs: it sat wedged); the p99 is 60–300 µs (the bore query,
  polled at 4 Hz). The worst single steps are 3–35 ms, in plain `drive`, not at junctions; garbage collection or JIT is
  suspected, not traced.
- **The one intervention is a world defect (for a new ticket; measured 2026-11-18)**: seed 1830183820, run
  `g:0,-1,0:0,0,2`, bore span s 60.27–279.55. The road deck climbs at ~37 % (0.38 m/m) into the portal. From arcS
  ~58.8 to ~59.8, 0.5–1.5 m BEFORE the span starts, a road-mesh surface in road tile `1,-1` sits nearly LEVEL
  (y 81.75 on the centreline, 81.37 at −2.5 m, 82.05 at +2.5 m) while the deck rises under it: a 1 m shelf whose
  downhill edge stands 0.38–0.40 m above the deck (at arcS 58.9: 81.76 over 81.38), merging into the deck at ~59.8.
  The tires never see it (`sampleRoadTopY` and the analytic ground both give the continuous deck), so MESH ≠ PHYSICS
  for the wheels; only the chassis hull meets it. At t 7.70 s, heading 135°, 8.3 m/s, pitch 21°, the truck is at
  (125.3, 82.2, −42.0). The hull's belly catches the shelf's edge and the engine resolves the overlap along the
  shelf's face normal (≈ straight DOWN): the hull ends up pinned under it. Contact impulse 4.8e5 N·s per step, rear
  right tire load 95 kN (×30), front wheels off the ground, pitch 29°. Throttle and reverse then cannot move it.
  **A human driver hits it too**: on the centreline at 9 m/s the hull scrapes it (1.5e3 N·s) and is thrown, rear
  wheels in the air, then drives on. 2.65 m right of centre the hull misses it. The AI wedges because the bore entry
  tapers its lane to the centreline. Reproduce: `SOAK_LOG=1 SOAK_T0=6 SOAK_T1=10 node test/drive-ai-soak.mjs
  --seed=1830183820 --km=0.2` (stops at t ≈ 7.7 s). Probes (git-invisible): `wip/feat-293/wedge.mjs`
  (per-step contacts, `--lane=0` / `--cap=0`) and `wip/feat-293/column2.mjs` (every collider surface in a column).
- Gate (`test/drive-ai.mjs`, seed 909892992, 0.6 km, radius 800 m): green, 133 s.

### What an ML driver would need later (and what V1 gives it for free)
- **A rig that steps the real physics headlessly**: `test/drive-ai-soak.mjs` already does, at about 0.5× realtime per
  process on this Mac (stepPhysics, the damage model, the streamed colliders). An RL loop needs many of these in
  parallel, or a faster cut (no props, fewer colliders).
- **A reward / trouble signal**: progress along the route (ds), minus lateral error from the lane, minus tire slip wear
  (the damage model's), and a large penalty for each `trouble` (the give-up causes above, already classified).
- **An observation vector**: forward speed, lateral offset from the lane, heading error, steer angle, yaw rate, wheel
  slips, μ, gear and rpm, plus the speed plan's next ~30 stations (curvature, grade, distance). The plan already computes
  exactly that preview each step.
- **Imitation data for free**: log (observation, controls) pairs from this controller over the soak. Behaviour cloning
  gives a starting policy that already drives, then RL fine-tunes it where V1 is weakest (steep climbs, tight junctions).
- **A drop-in seam**: a learned policy would replace layers 3–4 (tracking + actuation) behind the same `step(vs, dt)` →
  controls interface. The route and the recovery stay classical. A small MLP (two 64-wide layers) costs a few µs per
  step in plain JS.

## Tracker
- [x] Architecture chosen and stated (V1), with what an ML driver would need later
- [x] Debug option; any input hands control back
- [x] Drives indefinitely on gentle roads: km between interventions measured
- [x] Steep roads measured: where and why it fails
- [x] Gates and the PERF-40 bench still work on the shared autopilot
- [ ] Owner has watched it

## Decisions
DEC-428, DEC-084.

## Open questions
- Should a story run that used the AI be marked "assisted" on its result? (Proposal: no gate, maybe a mark.)

## Links
DEC-084, PERF-40. Owed card: feat293-driving-ai-watch.

## Files
src/autopilot.js, src/auto-drive.js, src/vehicle.js (setAutoDriver), src/debug.js (the folder), src/main.js (attach +
step), test/drive-ai-soak.mjs, test/drive-ai.mjs (gate), test/playtest-bench.mjs, test/cdp-smoke.mjs (`autoDrive` step).

## Log
- 2026-11-18 minted by the orchestrator from the owner's chat message.
- 2026-11-18 V1 built on `land/feat-293-driving-ai` (worktree CarGame-land-feat34): src/autopilot.js promoted from
  test/lib/autopilot.mjs, src/auto-drive.js + the debug folder, the soak and the gate. Soak 40 km / 13 seeds, one
  intervention (the portal wedge). Affected gates green; fingerprint-physics identical to main; smoke `autoDrive` passes
  (W and D hand back). App look on seed 909892992: three junctions in 100 s, then W handed back.
