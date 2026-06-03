---
status: partial
phase: 02-scenario-system-debug-menu
source: [02-VERIFICATION.md]
started: 2026-05-28T00:00:00Z
updated: 2026-05-28T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Debug Slider Live Effect
expected: Open index.html, start driving, open debug panel (backtick), move Friction Coeff slider from 0.9 to 0.1 while driving. Car visibly slides more on same steering input with no restart. Returning slider to 0.9 restores grip.
result: [pending]

### 2. Frame Logger Record / Download
expected: Press `\` while driving, drive 3–5 seconds, press `\` again. Browser auto-downloads `rangersim-log-{timestamp}.json`. File has `fields` array (33 entries, first `t`, last `rr_c`) and `frames` array with non-zero `fl_fn`, `fl_fy`, `fl_sa`, `fl_c` values for frames recorded while on ground.
result: [pending]

### 3. IC Loader Error Handling
expected: Press Ctrl+I, select a non-JSON file (e.g. a .txt file). `console.error('[logger] Failed to parse IC file: ...')` appears in browser console. Sim continues without crash.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
