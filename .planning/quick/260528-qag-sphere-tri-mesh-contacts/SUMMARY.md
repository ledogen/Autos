---
status: complete
completed: 2026-05-28
---
Rewrote queryContacts to use closestPointOnTriangle + RAMP_TRIS. All ramp face contacts now resolve via sphere-vs-triangle closest point. Edge and corner contacts produce a single geometrically correct normal pointing from the closest surface point to the sphere center. Ground half-space unchanged.
