---
slug: qaf-sphere-contact-model
date: 2026-05-28
status: in-progress
---

# Sphere Contact Model + Body Collision

## Problem
- `getWheelPosition` returns body-rotated tire bottom — wrong on slopes (contact patch not below wheel)
- Only 4 wheel contact points — car body clips through ramp faces
- `terrain(x,z) → {height,normal}` can't represent walls or multiple contacts

## Solution
Replace per-wheel `terrain(x,z)` with `queryContacts(cx,cy,cz,r)` → Array<{normal,depth,contactPoint}>.
Each wheel becomes a sphere (hub center + wheelRadius); all contacts iterated independently.
Add 4 body contact points (bumper corners) that apply normal-only force.
Ramp modeled as a solid with top surface, back face, and side faces.

## Files
- `suspension.js` — hub center offset + new `getBodyContactPoints`
- `physics.js` — rewrite per-wheel loop + body contact loop + queryContacts signature
- `main.js` — add `RAMP_END_Z`, `queryContacts`, update stepPhysics call
- `ranger.js` — add bodyContactStiffness/Damping/Radius

## Tasks
- [ ] suspension.js: hub center + getBodyContactPoints
- [ ] physics.js: new contact loop
- [ ] main.js: queryContacts + ramp solid faces
- [ ] ranger.js: body params
- [ ] Commit
