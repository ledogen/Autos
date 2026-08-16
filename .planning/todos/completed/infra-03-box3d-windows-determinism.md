---
id: INFRA-03
type: infra
status: closed
opened: 2026-08-15
closed: 2026-08-15
severity: minor
source: FEAT-48 Phase 0 deferred axis (owner decision — ship first, test on Windows after)
relates_to: FEAT-48 (the Box3D adoption's determinism contract), INFRA-01 (the Windows thin client),
  test/box3d-determinism.mjs + test/box3d-determinism.expected + test/box3d-determinism-gate.mjs
---

# INFRA-03: Run the Box3D determinism hash on the Windows machine

## ✅ RESOLVED 2026-08-15 — the hash matches; all four axes hold

The Windows machine returned `ba6be98f42bc3b83`, `same-process: true`, from the Pages build's
browser harness — **identical to the Mac**. The machine-vs-machine axis passes.

Consequences:

- **The SIMD divergence risk did not materialise.** SSE2-vs-Neon was the expected failure mode and
  it didn't happen; `BOX3D_DISABLE_SIMD` stays unnecessary, so there is no perf cost to pay.
- **Cross-machine replay is on the table.** The missions.md anti-cheat re-simulation idea no longer
  has to be pinned to same-machine. Treat this as evidence, not a guarantee — it is one CPU pair on
  one engine build (box3d.js 0.1.1). Re-run the page on any new machine before relying on it.
- `test/box3d-determinism.expected` records the result; a future hash change there is now a real
  engine/behaviour change rather than platform noise.

The browser harness stays shipped with the build (`vite.config.js` → `DIAGNOSTIC_ASSETS`, four
lines, unlinked from the game) — it is the cheapest possible way to re-check this on any future
machine. Delete those four lines to unship it.

## Original reminder (kept for provenance)

The FEAT-48 physics engine's determinism was verified on THREE of four axes (run-to-run,
cross-process, node-vs-browser — all hash `ba6be98f42bc3b83`, now a standing gate). The
**machine-vs-machine axis is untested**: SIMD paths differ across CPUs (SSE2/Neon;
`BOX3D_DISABLE_SIMD` exists in the engine) and cross-platform determinism usually breaks
exactly there. The owner ships first; this is the follow-up.

## What to run (1 minute, no repo and no node needed)

The harness now ships with the Pages build (`vite.config.js` → `DIAGNOSTIC_ASSETS`). On the Windows
machine, open:

```
https://<pages-url>/test/box3d-determinism.html
```

It prints `hash: <16 hex chars>` and `same-process: true` after a few seconds of compute. Compare
the hash against line 1 of `test/box3d-determinism.expected` (`ba6be98f42bc3b83`).

**The browser hash is the one that matters** — the game runs Box3D in a browser, and the
node-vs-browser axis is already proven identical on the Mac, so a browser match closes the
machine-vs-machine axis for what actually ships. (Verified 2026-08-15: the shipped page, served
over HTTP from a real `dist/`, reproduces `ba6be98f42bc3b83` in headless Chrome on the Mac — so a
mismatch on Windows is a genuine cross-machine signal, not a packaging artifact.)

Equivalent if the machine ever does get a repo + node (INFRA-01):

```
node test/box3d-determinism.mjs --hash-only
```

- **Match** → close this ticket; the determinism contract holds on all four axes.
- **Mismatch** → cross-machine physics divergence is REAL. Consequences to weigh before any
  cross-machine replay/leaderboard feature (missions.md anti-cheat re-simulation): either pin
  such features to same-machine, or investigate a SIMD-disabled engine build (measure the perf
  cost — FEAT-48 Phase 0 notes). Worldgen determinism (SM-INV-12) is unaffected either way —
  it never touches the physics engine.
