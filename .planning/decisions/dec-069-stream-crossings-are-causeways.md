---
id: DEC-069
status: standing
decided: 2026-07-16
area: roads
governs: src/road.js, src/terrain-physics.js, streams, causeway
supersedes:
---

# DEC-069: Road-stream crossings are causeways; mesh equals physics

**Ruling.** Where a road crosses a stream it is a causeway, and the collision surface always mirrors the rendered mesh.

**Why.** A mesh the car can't feel, or a collider it can't see, is a bug either way.

**Replaces.** Nothing.

**Source.** memory project_stream_crossing_causeway. Date from the memory note. Agent wording, owner approved 2026-11-13.
