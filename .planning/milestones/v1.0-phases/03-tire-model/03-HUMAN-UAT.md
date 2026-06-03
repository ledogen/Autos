---
status: partial
phase: 03-tire-model
source: [03-VERIFICATION.md]
started: 2026-05-30T00:00:00Z
updated: 2026-05-30T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Drift behavior
expected: Hold Space while steering at ~30 km/h; rear should step out controllably and recover when Space released
result: [pending]

### 2. Wheelspin
expected: Full throttle from rest; rear wheelOmega should visibly outrun car speed (check HUD/logger), no instant lock-up
result: [pending]

### 3. Pacejka canvas
expected: Backtick (`) opens debug panel with 300x200 canvas; FL/FR operating-point dots move and color-cycle during cornering; no ReferenceError in console
result: [pending]

### 4. Slip angle thresholds
expected: Confirm D-14 (5/10 deg) vs M3-07 (5/15 deg) orange threshold is acceptable in practice
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
