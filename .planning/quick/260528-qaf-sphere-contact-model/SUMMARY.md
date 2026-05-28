---
slug: qaf-sphere-contact-model
date: 2026-05-28
status: complete
commit: 962a88b
---

# Summary

Replaced the single `terrain(x,z) → {height,normal}` contact interface with
`queryContacts(cx,cy,cz,r) → [{normal,depth,contactPoint}]`. Each wheel is now
a sphere (hub center + wheelRadius) cast against all solid geometry; forces are
applied independently per contact.

Changes:
- `suspension.js`: `getWheelPosition` returns hub center; new `getBodyContactPoints` (4 bumper corners)
- `physics.js`: per-wheel loop iterates all contacts; body contact loop (normal-only)
- `main.js`: `queryContacts` implements ground plane + ramp top/back/side faces as bounded half-spaces
- `ranger.js`: `bodyContactStiffness`, `bodyContactDamping`, `bodyContactRadius` added
- `terrain(x,z)` kept as M1-13 height-field stub for Phase 6
