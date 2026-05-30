---
phase: 03-tire-model
plan: 04
subsystem: debug
tags: [bug-fix, scope, pacejka, canvas]
dependency_graph:
  requires: [03-03]
  provides: [M3-09-runtime-correct]
  affects: [src/debug.js]
tech_stack:
  added: []
  patterns: [module-scope-let-bindings]
key_files:
  created: []
  modified:
    - src/debug.js
decisions:
  - "Promote plotCanvas/plotCtx to module-level let bindings initialized to null, assigned inside initDebug — this is the minimal fix that does not change any other behavior (CR-01 resolution)"
metrics:
  duration: "< 5 minutes"
  completed: "2026-05-30"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
---

# Phase 03 Plan 04: Fix plotCanvas/plotCtx Module Scope Bug Summary

**One-liner:** Promoted `plotCanvas` and `plotCtx` from `const` locals inside `initDebug` to module-level `let` bindings, eliminating the `ReferenceError` thrown by `updatePacejkaCurve` on every render frame.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Promote plotCanvas/plotCtx to module scope | 79aead6 | src/debug.js |

## Changes Made

**src/debug.js** — three precise edits:

1. Added `let plotCanvas = null` and `let plotCtx = null` at module scope (lines 23–24), directly below the `import { GUI }` line. A comment explains they are module-level so `updatePacejkaCurve` can read them.

2. Inside `initDebug`, changed `const plotCanvas = document.createElement('canvas')` and `const plotCtx = plotCanvas.getContext('2d')` to plain assignments (`plotCanvas = ...`, `plotCtx = ...`). This assigns the module-level bindings rather than shadowing them with new `const` locals.

3. In `updatePacejkaCurve`, replaced the early-return check `if (plotCanvas.style.display === 'none') return` with `if (!plotCanvas || !plotCtx || plotCanvas.style.display === 'none') return` — guards against calls before `initDebug` has run.

## Verification Results

All acceptance criteria passed:
- `grep -n '^let plotCanvas' src/debug.js` → line 23 (exactly one match at module scope)
- `grep -n '^let plotCtx' src/debug.js` → line 24 (exactly one match at module scope)
- `grep -c 'const plotCanvas' src/debug.js` → 0
- `grep -c 'const plotCtx' src/debug.js` → 0
- `grep -n 'if (!plotCanvas' src/debug.js` → line 113 (inside `updatePacejkaCurve`)
- Node smoke test: `updatePacejkaCurve` called without DOM/initDebug → prints `OK: no ReferenceError`, exits 0

## Gap Closure

- **VERIFICATION.md gap 1 (plotCanvas scope)**: CLOSED — module-level bindings are now in place
- **REVIEW.md CR-01**: RESOLVED — `const` shadowing eliminated

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan fixes a scope bug; no data stubs introduced.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- `src/debug.js` exists with correct changes: FOUND
- Commit 79aead6 exists: FOUND
- No file deletions in commit: CONFIRMED
