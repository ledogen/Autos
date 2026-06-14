---
id: QUAL-02
type: quality
severity: minor
status: open
opened: 2026-06-11
source: scribe-session
---

# QUAL-02: Improve sky, fog color, and skybox overall

## Request

Make the environment backdrop look better — improve the **sky color**, the **fog color**, and
possibly the **skybox as a whole** (not just tweaking the two flat colors, but the overall sky
treatment if warranted).

## Notes

- Visual / atmosphere polish — not physics.
- Current sky is a flat color (`0x87ceeb` blue) with neutral white lighting and distance fog
  (set during earlier debugging). This request is to elevate that — richer sky, better-matched
  fog, and optionally a real skybox/gradient rather than a flat clear color.
- Fog color should harmonize with the sky so the horizon blends (avoid a hard band where fog
  meets sky).
- "Maybe skybox as a whole" = open scope: could be a gradient shader sky, a procedural sky, or a
  proper skybox — decide at planning. Keep within no-asset / single-origin constraints (prefer
  procedural/gradient over image cubemaps unless an asset is acceptable).
- Captured live via scribe session during Phase 9 work; promote via `/gsd:review-backlog` when ready.
