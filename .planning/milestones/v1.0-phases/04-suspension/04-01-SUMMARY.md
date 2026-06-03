---
phase: 04-suspension
plan: "01"
subsystem: validation-infrastructure
tags:
  - suspension
  - validation
  - scenarios
dependency_graph:
  requires: []
  provides:
    - scenarios/m4-02-asymmetric-bump.json
    - scenarios/m4-04-static-vs-braking.json
    - scenarios/m4-05-wheel-lift-ramp.json
    - scenarios/m4-06-bump-response.json
  affects:
    - src/logger.js (openInitialCondition — consumer of these ICs)
tech_stack:
  added: []
  patterns:
    - Five-key scenario JSON schema (description, position, velocity, quaternion, angularVelocity) matching straight-60kph.json
key_files:
  created:
    - scenarios/m4-02-asymmetric-bump.json
    - scenarios/m4-04-static-vs-braking.json
    - scenarios/m4-05-wheel-lift-ramp.json
    - scenarios/m4-06-bump-response.json
  modified: []
decisions:
  - Excluded extra keys (e.g., hubY seed) because loader silently ignores unknowns, creating false confidence — description field is the sole intent record per D-13
metrics:
  duration: "~5 minutes"
  completed: "2026-05-31"
  tasks_completed: 1
  tasks_total: 1
---

# Phase 04 Plan 01: Wave 0 Validation Scenario JSON Files Summary

**One-liner:** Four IC scenario files seeding the per-wheel independence, load transfer, airborne-wheel, and damping-characterization assertions (M4-02 / M4-04 / M4-05 / M4-06).

## What Was Built

Four JSON initial-condition files in `scenarios/` conforming exactly to the canonical five-key schema established by `scenarios/straight-60kph.json`. Each file is loadable via `src/logger.js openInitialCondition` (Ctrl+I) without modification to the loader.

| File | IC State | Requirement |
|------|----------|-------------|
| m4-02-asymmetric-bump.json | At rest (all velocities zero), identity quaternion | M4-02 per-wheel hub independence |
| m4-04-static-vs-braking.json | 60 km/h forward (-Z), identity quaternion | M4-04 dynamic Fz / load transfer, M4-07 longitudinal |
| m4-05-wheel-lift-ramp.json | 50 km/h forward (-Z), identity quaternion | M4-05 airborne wheel / D-14 |
| m4-06-bump-response.json | At rest (all velocities zero), identity quaternion | M4-06 unsprung-mass damping ζ≈0.4 |

All four use `position.y = 0.55` (settled spawn height), identity quaternion `{x:0, y:0, z:0, w:1}`, and `angularVelocity = {x:0, y:0, z:0}`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Author four Wave 0 scenario JSON files | 5da8ea1 | scenarios/m4-02-asymmetric-bump.json, scenarios/m4-04-static-vs-braking.json, scenarios/m4-05-wheel-lift-ramp.json, scenarios/m4-06-bump-response.json |

## Verification Results

Automated check passed:

```
for f in scenarios/m4-{02,04,05,06}-*.json; do node -e "validate 5 keys + quaternion.w"; done
OK
```

All four files:
- Parse as valid JSON (no SyntaxError)
- Contain exactly five top-level keys: description, position, velocity, quaternion, angularVelocity
- Have `quaternion.w === 1` (identity orientation)
- Have `position.y = 0.55` (within settled spawn band 0.50–0.60)
- Have `angularVelocity = {x:0, y:0, z:0}`
- Name the requirement ID (M4-02 / M4-04 / M4-05 / M4-06) in the description field

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. These are pure data files; no UI rendering or data-source wiring involved.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced. T-04-01 (user-supplied JSON through openInitialCondition) is already mitigated by the existing try/catch in logger.js; the Task 1 verify command catches malformed JSON at author time.

## Self-Check: PASSED

- scenarios/m4-02-asymmetric-bump.json: EXISTS
- scenarios/m4-04-static-vs-braking.json: EXISTS
- scenarios/m4-05-wheel-lift-ramp.json: EXISTS
- scenarios/m4-06-bump-response.json: EXISTS
- Commit 5da8ea1: EXISTS
