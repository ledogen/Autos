---
id: PERF-23
type: perf
status: open
opened: 2026-07-19
severity: minor
source: user-observation (M4 MacBook Air, Ultra tier)
relates_to: PERF-21 (GPU pass / prop-LOD rings, merged 50a8913), FEAT-06c (billboard impostors),
  PERF-22 (terrain geometry LOD — the other half of full-draw cost), PERF-05 (iGPU-bound history)
note: "User report the day after the PERF-21 merge: on an M4 MacBook Air at Ultra, once all the
LOD'd props stream in at full draw distance it gets pretty stuttery. User's read: 'there's just a
ton of freaking props.' This is the exact risk the PERF-21 merge handoff flagged as a known
follow-up: Ultra's billboard-only ring is ~289 scattered chunks (was 81 pre-branch)."
---

# PERF-23: Ultra tier stutters at full draw once the prop LOD rings fully load (M4 Air)

## Symptom

On an M4 MacBook Air at the **Ultra** quality preset, the game runs fine while the world is
still streaming, but once the full prop complement is resident — near ring full-3D, far ring
billboards, and the big billboard-only outer ring (`bbRing` U8, ~17²-chunk worst case) — frame
time gets visibly stuttery at full draw distance. Steady-state, not just stream-in hitching.

## Context / prior art (read before touching)

- PERF-21 final prop-LOD design: three zones (lodRing / propRing / bbRing) per tier; tree
  capacities were raised 4000→8000 per species for the Ultra worst case; boulders stay full-3D
  to `bbRing`; bushes/rocks/logs are not rendered in the billboard-only zone.
- The merge handoff (`.planning/handoffs/2026-07-16-gpu-graphics-merge.md`, "Known follow-ups")
  predicted this exact case and named the first two levers:
  1. **Trim Ultra's `bbRing`** (QUALITY_PRESETS in `src/main.js`) — cheapest, pure config.
  2. **Trees-only scatter fast path** for billboard-only chunks (skip the full placement /
     record machinery for chunks that will only ever draw tree impostor instances).
- Distinguish which cost it actually is before pulling levers:
  - **Steady-state draw cost** (instanced quads are cheap per-instance but ~8k×2 species×many
    chunks adds up; boulders full-3D to the horizon; overdraw from big near billboards).
  - **Streaming/promotion churn** (outer-ring chunk stream + shadow-tile bakes on promotion
    into propRing) — the M4 Air is also thermally limited, so sustained churn can read as
    steady-state stutter.
  - **Terrain vertices** — every chunk is still a full 65×65 grid at any distance; at Ultra draw
    distance PERF-22 may be the real payer, with props as the marginal straw.
- Diagnosis tools: PERF-08 profiling harness (`?prof=1` handles), `window.__impAtlasStats()`,
  renderer.info draw-call/triangle counts at a static Ultra viewpoint, and the PERF-05 lesson
  that Apple iGPU stutter is usually GPU-bound (check with a Chrome GPU trace before optimizing
  CPU-side).

## Acceptance

- [ ] Profiled at Ultra on the M4 Air (or a stand-in): identified whether the stutter is draw
      cost, streaming churn, or terrain-vertex bound (→ hand off to PERF-22 if the latter).
- [ ] A fix or retune ships: e.g. Ultra `bbRing` trimmed, per-tier instance budgets, scatter
      fast path, or an explicit "Ultra assumes desktop-class GPU" note with a better-fitting
      default for Apple iGPUs.
- [ ] Ultra on the M4 Air holds steady frame pacing at full draw with all rings resident, or
      the user signs off on a documented tier recommendation instead.
