---
id: FEAT-05
type: feature
status: open
opened: 2026-06-11
source: scribe-session
---

# FEAT-05: Procedural texture on the dirt terrain

## Request

Add a procedural texture to the dirt/terrain surface so the ground reads as actual dirt
instead of a flat untextured shade. Texture should be generated procedurally (not an image
asset) to stay within the no-asset / single-origin constraints.

## Notes

- Visual / presentation feature on the terrain mesh — not physics.
- Procedural (shader / noise-based) so it tiles across streamed chunks without seams and needs
  no external image files.
- Should hold up across the chunked, streamed terrain (consistent look chunk-to-chunk; ideally
  keyed off world position / the existing terrain seed so it's deterministic and seam-free).
- Captured live via scribe session during Phase 9 work; promote via `/gsd:review-backlog` when ready.
