---
status: partial
phase: 07-free-cam-seeded-layered-terrain
source: [07-VERIFICATION.md]
started: 2026-06-08T00:00:00Z
updated: 2026-06-08T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. TERR-05 — 60fps performance checkpoint (blocking per plan)
expected: Drive the truck on open ground with ~25 chunks loaded while watching the FPS HUD; sustain >= 55 fps with analyticHeight physics sampling active.
result: [pending]

### 2. TERR-01/06 — Sierra terrain visual match (P7-3)
expected: Fly free-cam over the `lone-pine` seed terrain and compare to `references/km elev ref.png` — steep escarpments + flat valley floors; fine layer noticeably bounces the truck suspension at speed.
result: [pending]

### 3. P7-2 — height-agreement gate (browser reconfirmation)
expected: Open `tests/height-agreement-test.html` via a local HTTP server; console prints `P7-2 PASS: height agreement verified` (re-run because 07-04 changed coarseAmplitude 350→150 and coarseOctaves 5→4 after the original P7-2 pass).
result: [pending]

### 4. Esc pause menu + grid world (D-17/18/19)
expected: Esc from chase → menu appears; "grid world" → flat grid + ramp visible, car at origin; "return to world" → terrain streaming resumes and truck re-seats; no ramp in Sierra world; no menu flash when Esc pressed in free-cam.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
