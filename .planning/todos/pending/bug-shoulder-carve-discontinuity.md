---
id: BUG-15
type: bug
status: open
opened: 2026-06-21
source: phase-09-capture-replay
severity: high
capture: Logs/rangersim-capture-1782068814989.json
---

# BUG-15: Carve↔ground surface discontinuity at the road shoulder threshold → wheels go airborne then slam

## Request

Driving so the truck straddles the road edge (lateral offset crossing the crown→shoulder transition),
the truck shows "weird glitchy behavior" — it bounces/launches as it crosses the shoulder threshold.
Captured live as a `kind:"event"` capture (seed 6): `Logs/rangersim-capture-1782068814989.json`
(143 frames, t 116.3→118.7). Confirmed from the capture telemetry, not yet reproduced headless
(needs the Phase-5 physics-replay driver — this event is the intended first Phase-5 target).

## Symptom detail (from the capture telemetry, 2026-06-21)

As the CG lateral offset `rd_lat` crosses the road-crown edge at `roadHalfWidth` (= 5 m) heading into
the shoulder (toward `roadHalfWidth + roadShoulderWidth` = 7.5 m):

- **Carve surface vs sampled ground diverge.** `rd_gy` (road carve gradeY, what the road delivers)
  minus `rd_gh` (`terrain.analyticHeight`, the actual ground the physics rides) is ~0.0 m at lat = 5.0 m
  but **balloons to 0.55–0.62 m** by lat ≈ 5.5 m. The two surfaces agree on-crown and disagree in the
  shoulder band — a discontinuity as a function of lateral position right at the threshold.
- **`rd_gh` jumps ~0.5 m frame-to-frame** in the shoulder band (e.g. 112.47 → 111.96 in one tick at
  t≈117.95) — a position discontinuity, not a smooth ramp.
- **Wheels lose contact.** All four tire spring forces `*_fz` read 0 N across the crossing
  (t≈117.57–117.85) — the truck is airborne over the step.
- **Then it slams.** Front-right `fr_fz` spikes **0 → 1948 → 5948 → 8389 N** at t≈117.92–117.95 as the
  wheel re-contacts the lower shoulder surface; `vy` snaps −4.7 → −2.9 m/s. That launch-and-slam is the
  felt "glitch."

Same family as BUG-14 (a surface step the suspension rides over), but here the step is LATERAL (across
the crown→shoulder blend) rather than longitudinal (across a tile seam), and larger (~0.55 m vs the
known ~0.18 m hairpin residual).

## Suspected root cause (to confirm in code)

The road's crown/shoulder cross-section and the terrain carve don't agree across the shoulder band
`lat ∈ [roadHalfWidth, roadHalfWidth + roadShoulderWidth]`:

- Physics/road resolution applies a crown→shoulder blend `blendW = max(0, 1 − (latDist − halfWidth) /
  shoulderWidth)` (road.js ~1983 / ~2615), tapering the crown contribution to 0 across [5, 7.5].
- The terrain carve (`terrain.js _buildCarveTable` / `collectChunkSplinePoints` + nearest-XZ assignment)
  lowers the ground toward the road but evidently with a DIFFERENT lateral profile / cutoff, so on-crown
  (lat < 5) the two match (gap ≈ 0) while in the shoulder band they diverge ~0.55 m and the nearest-sample
  carve assignment jumps frame-to-frame (the ~0.5 m `rd_gh` steps).
- Net: the physics rides `analyticHeight` (carve), which steps/diverges from the crowned road surface at
  the shoulder edge → airborne → slam.

Confirm by comparing, as a function of lateral offset across [0, 8 m] at a fixed arcS, the road crown
profile vs `analyticHeight` — the gap should be ~0 everywhere; it is not in the shoulder band.

## Fix directions

- Make the terrain carve's lateral cross-section match the road's crown/shoulder profile exactly across
  the shoulder band (single shared cross-section function used by both the carve and the physics blend),
  so `analyticHeight` over the road footprint == the road's delivered surface (gap → 0) with no lateral
  step. Mirrors the BUG-14 "mesh == physics by construction" direction, applied laterally.
- Kill the frame-to-frame `rd_gh` jumps (nearest-discrete-sample carve assignment) the same way the
  longitudinal path was made continuous (project, don't snap to nearest discrete sample).

## Repro / reproduction (harness)

- Capture: `Logs/rangersim-capture-1782068814989.json` (kind:event, seed 6).
- Phase 5: `node test/replay.mjs <capture>` replays the input timeline through headless physics and
  diffs the trajectory → should reproduce the airborne+slam at t≈117.6–117.95 (first-divergence frame).
- Add a headless gate: at a fixed on-road arcS, sweep lateral offset across [0, halfWidth+shoulderWidth+ε]
  and assert |roadCrownSurface(lat) − analyticHeight(lat)| < ε (no lateral step at the shoulder).

## Acceptance

- Straddling/crossing the road shoulder edge produces no airborne step or slam; tire contact stays
  continuous (`*_fz` never drops to 0 from a surface step). The lateral carve↔crown gap stays < ε across
  the shoulder band. Headless lateral-shoulder gate passes; the BUG-15 event capture replays without the
  contact-loss/slam signature.
