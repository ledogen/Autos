---
id: PERF-16
type: perf
status: done
severity: minor
created: 2026-07-13
closed: 2026-07-13
---

# PERF-16 — Shadow-map on-demand updates + HUD 10 Hz throttle + hidden-widget skip

Three measured, low-risk frame-loop wins in `src/main.js`. Idle Normal is the target scenario
(parked truck, static sun) — the common case where the engine burns work on output that did not change.

## Problem

Measured baseline (idle · Normal · seed 6 · 30 s, this M4 Air, `test/profile.mjs --trace`):
renderer main busy **22.2%**, GPU process busy **11.5%**, p99 18.8 ms, Layout count **1802**,
Paint count 3604 (one per frame). Three cost centres, none of which depend on per-frame change:

1. **Sun shadow pass re-renders every frame.** `renderer.shadowMap.autoUpdate` defaults `true`, so
   the 1536² (Normal) sun shadow map is fully re-rendered each frame even when parked under a static
   sun with static geometry. Single-lever A/B (`__lever sunShadow 0`) measured sun shadow off ≈
   −9 pp main, −3 pp GPU.
2. **HUD DOM writes every frame.** speed/gear/RPM/spin/Fz/slip/throttle/brake/FPS/pos spans plus the
   Pacejka/travel/slip canvases were rewritten each frame → Layout+Paint+PrePaint+Layerize ≈ 1.7% of
   wall for numbers a human reads a few times a second (1802 Layouts / 30 s).
3. **Debug widgets while hidden** — audited; see Fix §3.

## Fix

**Win 1 — shadow map renders on-demand.** `renderer.shadowMap.autoUpdate = false` at renderer setup
(+ `needsUpdate = true` for the first frame). In the existing texel-snap shadow-follow block in
`loop()` (the `if (sun.castShadow)` body), re-arm `renderer.shadowMap.needsUpdate = true` only when the
shadow could actually change — a poll-and-compare of signals already present, no subsystem plumbing:
  - **texel-snapped frustum centre** moved (`snapR`/`snapU`, already computed there) — camera crossed a
    shadow texel;
  - **sun/key-light direction** moved (`skySystem.sunDirection`) — future-proofs the coming day/night
    cycle; SkySystem's `setTimeOfDay`/`update` write `sunDirection`, so the trigger batches shadow
    refreshes to however often the sun actually moves, with zero extra plumbing (verified — no
    duplicate trigger needed in sky.js);
  - **world geometry streamed** — a cheap numeric signature of existing counters:
    `terrainSystem._chunkMap.size`, `roadSystem.roadGeneration()`, `roadMeshSystem._tileMeshMap.size`,
    `propSystem._chunks.size`, `propSystem._blobs._used`. Any chunk/tile/prop pop-in changes one → the
    frozen shadow refreshes even while parked;
  - **vehicle in motion** (`velocity² > 0.0025`, i.e. > 0.05 m/s, or wheelspin > 0.1) — dirty every
    frame so the truck's own shadow tracks it; parked → frozen.
  Preset/lever paths that dispose or resize the shadow map (`applyQuality` PERF-12 block, and the
  `__lever` `sunShadow`/`shadowMapSize`/`shadowExtent` closures) now also set `needsUpdate = true`.
  Gating matches the existing PERF-06 `sun.castShadow=false` skip on Low (the follow block, and thus the
  re-arm, is already skipped when the tier has no shadows).

**Win 2 — HUD DOM/canvas writes throttled to ~10 Hz.** The whole span-write block + the
Pacejka/travel/slip canvas calls are gated behind `performance.now() - _lastHudWrite >= 100 ms`.
Engine audio (`updateEngineAudio` etc.) was pulled OUT of that block to keep running every frame — a
10 Hz pitch update would step audibly; audio is not a DOM write. Physics reads, the fixed accumulator,
`captureFrame`, and the logger are untouched.

**Win 3 — hidden debug widgets: already gated, no change.** `updatePacejkaCurve`, `updateTravelBars`,
`updateSlipVectors` (src/debug.js) each early-return when their canvas `style.display === 'none'`
(T-03-09 / T-04.1-07). Contact-sphere debug meshes are already gated behind `_dbgSpheresOn`. No work
was compute-per-frame-while-hidden, so nothing to fix. (Win 2 additionally caps them at 10 Hz when
visible.)

## Verified

Before/after, same machine, idle · Normal · seed 6 · 30 s, quiet ~45 s between runs:

| metric | before | after | delta |
|---|---|---|---|
| renderer main busy | 22.2% | 17.0% | **−5.2 pp** |
| GPU process busy | 11.5% | 8.0% | **−3.5 pp** |
| Layout count / 30 s | 1802 | 275 | **6.6× fewer** |
| Paint count / 30 s | 3604 | 550 | 6.6× fewer |
| p99 frame | 18.8 ms | 18.7 ms | ~flat |

GPU busy −3.5 pp confirms Win 1 (matches the ~−3 pp `sunShadow` A/B). Main busy −5.2 pp combines the
shadow-render setup no longer hitting the main thread each frame (Win 1) with the HUD Layout/Paint
drop (Win 2). Layout 1802→275 (~6×, as predicted) confirms Win 2. p99 flat — these were steady-state
costs, not hitches.

Correctness:
- **Shadows present + correct** — screenshot at `-38 183` (freecam lands far from spawn, ~-38/215):
  trees cast crisp shadows on ground and road. Second screenshot at `350 -520` (~350/-400): shadows
  equally correct at a completely different world location — proves the frustum-centre + geometry-stream
  re-arm works when the view is far from origin (a stale/blank shadow map would show none). No shadow
  acne, no visible one-frame lag.
- **Drive scenario** `--scenario=drive --preset=Normal --duration=20` runs clean, ~58.6 fps, no errors;
  the truck's shadow tracks it via the vehicle-motion trigger.
- `npm test` (affected) green — 2 gates selected (main.js edits select few, by design). Smoke
  `run-all --only=props,water` green (props 0-fail, water 9-pass).

## Deviations from the approved design
- The design listed `propSystem.liveCount()` and a shadow-blob `liveCount()` for the geometry signal;
  those methods don't exist. Used the equivalent existing counters — `propSystem._chunks.size` (prop
  chunks streamed) and `propSystem._blobs._used` (live blob count) — same "did geometry stream?"
  signal, no new methods, no plumbing.
- Combined the texel-centre and sun-direction triggers as two independent comparisons rather than
  reading them off the composed `sun.position` (the follow's `keepF` forward term makes `sun.position`
  drift sub-texel every frame, which would have defeated the parked-freeze). Comparing `snapR/snapU`
  and `sunDirection` directly is exact.

## Noticed, not touched
- `frame.render` (2.27 s / 30 s) and `frame.water.sync` (1.34 s / 30 s, 0.74 ms avg every frame even
  when the water region is unchanged) are the next two idle cost centres in the user_timing buckets —
  candidates for a future keyed-skip like the shadow re-arm.
- `FunctionCall` self-time is ~85% of main busy (the loop body) — expected; the wins shaved its Layout/
  Paint children and the shadow setup, not the JS itself.

## LIMITATION NOTE (2026-07-14): shadow half is idle-only — near-moot during driving BY DESIGN

The before/after in this ticket ("renderer main 22.2→17.0%, GPU 11.5→8.0%") was measured on the
**Idle Normal** profiling scenario — i.e. the vehicle PARKED under a static sun. Do NOT read those
numbers as a gameplay figure. RangerSim is an always-in-motion driving game, and the on-demand
re-arm's vehicle-motion trigger (`main.js:1763`, velocity > 0.05 m/s → `needsUpdate = true` every
frame) fires the entire time you're actually driving. So during steady-state play the shadow map
re-renders every frame — behaviorally identical to Three's default `autoUpdate = true`. The shadow
win lands ONLY in genuinely-stationary windows: spawn/cold-load (world streaming before you take
control), pause, stopped at a vista, menus. It is never a regression (strict subset of always-on),
just far smaller in play than the idle headline.

- The **HUD 10 Hz throttle** (Win 2, ~6.6× fewer Layouts) is the part of this commit that pays off
  every frame regardless of motion — that always-on win is real.
- Steady-state driving shadow cost is NOT addressable by making the pass LESS FREQUENT (that lever is
  spent — the moving truck legitimately needs a per-frame shadow, and Three re-renders the whole
  shadow camera / all casters, not just the truck). The remaining lever is making each unavoidable
  per-frame render CHEAPER by pulling props out of the caster set → that's **PERF-07**. The
  always-in-motion reality RAISES PERF-07's value relative to this ticket. See [[perf-bake-env-shadows-vs-dynamic]].
