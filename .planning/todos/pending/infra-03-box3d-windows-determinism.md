---
id: INFRA-03
type: infra
status: open
opened: 2026-08-15
severity: minor
source: FEAT-48 Phase 0 deferred axis (owner decision — ship first, test on Windows after)
relates_to: FEAT-48 (the Box3D adoption's determinism contract), INFRA-01 (the Windows thin client),
  test/box3d-determinism.mjs + test/box3d-determinism.expected + test/box3d-determinism-gate.mjs
---

# INFRA-03: Run the Box3D determinism hash on the Windows machine

## ⏰ REMINDER (owner asked to be reminded — surface this when the Windows machine is next used)

The FEAT-48 physics engine's determinism was verified on THREE of four axes (run-to-run,
cross-process, node-vs-browser — all hash `ba6be98f42bc3b83`, now a standing gate). The
**machine-vs-machine axis is untested**: SIMD paths differ across CPUs (SSE2/Neon;
`BOX3D_DISABLE_SIMD` exists in the engine) and cross-platform determinism usually breaks
exactly there. The owner ships first; this is the follow-up.

## What to run (5 minutes)

On the Windows thin client, in the repo:

```
node test/box3d-determinism.mjs --hash-only
```

Compare against line 1 of `test/box3d-determinism.expected` (`ba6be98f42bc3b83`).

- **Match** → close this ticket; the determinism contract holds on all four axes.
- **Mismatch** → cross-machine physics divergence is REAL. Consequences to weigh before any
  cross-machine replay/leaderboard feature (missions.md anti-cheat re-simulation): either pin
  such features to same-machine, or investigate a SIMD-disabled engine build (measure the perf
  cost — FEAT-48 Phase 0 notes). Worldgen determinism (SM-INV-12) is unaffected either way —
  it never touches the physics engine.
