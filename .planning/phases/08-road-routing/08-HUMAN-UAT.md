---
status: partial
phase: 08-road-routing
source: [08-VERIFICATION.md]
started: 2026-06-10T20:30:00Z
updated: 2026-06-10T20:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. D-06 seam exit gate (browser)
steps: Serve the repo over HTTP (`npx serve .`) and open `test/test-road-seam.html` in a browser (real Three.js r184 via CDN importmap); read the DevTools console.
expected: Console reports `EXIT GATE D-06: PASS` with every checked seam C0 < 0.01 m and C1 < 5°, totalSeams >= 1, and the determinism assertion (tile 3,-7 same-seed tangent diff < 1e-9) passing. No FAIL lines.
result: [pending]

### 2. Road viz + live re-route (browser)
steps: Open `index.html` over HTTP, enable the "Show Road Splines" checkbox in the Roads debug folder, drive/free-cam around the lone-pine world.
expected: Cyan centerline splines appear (and are OFF by default before the checkbox), follow the valleys, wrap around high ground rather than climbing it, and stream continuously as the view moves. Moving the Max Grade / wAlt / wGrade / wOver / wTurn sliders re-streams the network after a short debounce.
result: [pending]

### 3. Truck spawn on road (browser)
steps: Spawn the truck (initial load + R-reset) on lone-pine.
expected: The truck spawns sitting on a road, oriented facing down the road (heading from the road tangent), not floating or buried, and not on bare terrain when a road is within 200 m of the seeded spawn offset.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
