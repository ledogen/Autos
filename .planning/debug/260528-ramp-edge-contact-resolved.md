---
slug: 260528-ramp-edge-contact
status: resolved
trigger: manual
goal: find_and_fix
created: 2026-05-28
resolved: 2026-05-28
---

# Debug Session: 260528-ramp-edge-contact

## Symptoms

1. Tire crossing the sharp edge between two ramp faces feels unnatural — normal force and friction forces spike or drop discontinuously at the transition point between ramp faces.
2. Can still drive up the side or back of the ramp by approaching face-parallel and steering a front tire into it — ramp face is not blocking lateral entry properly.

## Current Focus

### hypothesis
Both bugs are in `queryContacts` in `src/main.js`. Resolved.

### next_action
None — both issues fixed and file written.

## Evidence

- timestamp: 2026-05-28T00:00:00Z
  file: src/main.js
  lines: 224-279 (queryContacts function)
  finding: |
    Bug 1 — The ramp top surface used `u >= -r` as its lower extent bound, where
    `u` is the along-slope distance from the ramp toe. This allowed the ramp top
    to fire up to one wheel radius (0.37 m) before the ramp toe. In that overlap
    zone the ground half-space also fires (cy < r), producing two simultaneous
    normals: (0,1,0) and (0,cos10°,sin10°). The combined push is significantly
    larger than either alone, causing a lurch or pop as the tire crosses the toe.

- timestamp: 2026-05-28T00:00:00Z
  file: src/main.js
  lines: 234-244 (outer x-range guard vs top surface inner block)
  finding: |
    Bug 2 — The outer guard `Math.abs(cx) <= RAMP_WIDTH/2 + r` extended one
    sphere-radius beyond each side of the ramp, and the ramp top surface block
    inside had no lateral check of its own. A tire approaching from the side at
    cx = RAMP_WIDTH/2 + 0.05 m triggered the ramp top surface, which pushed it
    upward with the ramp normal rather than outward. The side face test
    (`cx >= RAMP_WIDTH/2`) also fired, but the top face redirected momentum onto
    the ramp, allowing lateral climbing.

## Investigation Log

- 2026-05-28: Read src/main.js, src/physics.js, src/suspension.js, src/tire.js.
  Traced queryContacts geometry for both bugs. Fixed in queryContacts in src/main.js.

## Resolution

### root_cause
Bug 1: ramp top surface `u >= -r` bound allowed the contact to fire one wheel-radius
before the ramp toe, overlapping with the ground half-space. Dual normals at the edge
caused a force spike.

Bug 2: ramp top surface block lacked a lateral bound check. Spheres up to one radius
outside the ramp footprint still received the ramp top-face normal, pushing them onto
the ramp rather than being blocked by the side walls.

### fix
Both fixes are in `queryContacts` in `src/main.js`:

1. (Bug 1) Moved the ramp top surface block inside a `Math.abs(cx) <= RAMP_WIDTH/2`
   guard (replaces the bare `{}` block that inherited only the outer `+r` guard).
   Changed `u >= -r` to `u >= 0` so the top surface never fires before the ramp toe,
   eliminating the ground/ramp overlap zone.

2. (Bug 2) The same `Math.abs(cx) <= RAMP_WIDTH/2` guard added to the top surface
   block ensures spheres outside the ramp footprint never receive the ramp top normal.
   The existing side-face logic then handles them correctly.
