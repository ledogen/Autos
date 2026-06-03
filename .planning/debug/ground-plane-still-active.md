---
status: resolved
slug: ground-plane-still-active
trigger: "Phase 6 regression: old flat ground plane collision still active alongside terrain system, causing car to glitch/float on a grid-like plane instead of interacting with procedural terrain"
created: 2026-06-03
updated: 2026-06-03
phase: 06
---

## Symptoms

expected: Car interacts with procedural terrain — contact forces come from sampleHeight/sampleNormal, car pitches and rolls on hills, can roll over on slopes
actual: A flat grid-like plane collision is still active; car glitches and floats above the generated terrain mesh without natural terrain interaction. User observes a gridlike plane that the car "kinda does but kinda doesn't penetrate."
errors: none reported
timeline: Phase 6 regression — appeared after Phase 6 implementation
reproduction: Load the game, drive the car — car floats/glitches on an invisible flat plane above the procedural terrain mesh

## Current Focus

hypothesis: "Two residual flat-plane checks survived Phase 6: catastrophic failsafe in physics.js and terrain normal in queryVertexContacts"
test: ~
expecting: ~
next_action: "fixed"

## Evidence

- timestamp: 2026-06-03T00:00:00Z
  file: src/physics.js
  lines: 115-128
  finding: >
    Catastrophic penetration failsafe computed embed = params.wheelRadius - hub.y,
    treating y=0 as the ground surface. On terrain with positive height, this check
    fires constantly because hub.y > wheelRadius is only valid at y=0. At any terrain
    height above 0 the failsafe sees the hub as embedded in the flat y=0 plane and
    teleports the car upward, producing the grid-like snapping/floating behavior.
    This is the PRIMARY cause of the regression.

- timestamp: 2026-06-03T00:00:00Z
  file: src/main.js
  lines: 407
  finding: >
    queryVertexContacts correctly calls terrainSystem.sampleHeight for contact depth
    but pushes contacts with _flatNormal.clone() (hardcoded world-up {0,1,0}) instead
    of the terrain surface normal from terrainSystem.sampleNormal(). On slopes the
    body contact impulse always pushes straight up, not along the terrain face.
    This is a SECONDARY cause — bad normal on body contacts.

## Eliminated

- Visual ground mesh (THREE.PlaneGeometry): scene.remove(ground) was called correctly at line 524 — mesh is removed
- queryContacts: correctly calls terrainSystem.sampleHeight + sampleNormal for wheel sphere contacts — no flat-plane code
- queryVertexContacts terrain HEIGHT: correctly uses sampleHeight — only the NORMAL was wrong
- terrain.js sampleHeight: bilinear interpolation and chunk coordinate math verified correct

## Resolution

root_cause: >
  Two flat-plane assumptions survived the Phase 6 migration:
  (1) physics.js catastrophic failsafe (embed = wheelRadius - hub.y) assumed ground at y=0 —
  PRIMARY driver of the gridlike snap behavior on any terrain with non-zero height.
  (2) queryVertexContacts in main.js used _flatNormal instead of sampleNormal for body
  vertex contacts — caused body contacts to push straight up on slopes.
fix: >
  TERR-FIX-01 (physics.js lines 115-132): replaced flat-plane embed check with
  queryContacts(hub.x, hub.y, hub.z, wheelRadius) depth scan — failsafe is now
  terrain-aware and only fires for genuine deep tunnelling.
  TERR-FIX-02 (main.js lines 406-411): replaced _flatNormal.clone() with
  terrainSystem.sampleNormal(px, pz) in queryVertexContacts ground contact.
verification: manual test — drive on terrain, car should follow surface and not snap/float
files_changed:
  - src/physics.js
  - src/main.js
