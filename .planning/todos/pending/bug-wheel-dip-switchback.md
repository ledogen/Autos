---
id: BUG-18
type: bug
status: open
opened: 2026-06-24
severity: minor
source: user-observation
relates_to: FEAT-09
note: "Visual wheel dips below the rendered road surface on tight switchbacks, especially the INSIDE of the turn. User hypothesis (plausible): the collision probe is a SINGLE SPHERE at the wheel center, so it 'falls away' at the tire edge — the wide wheel mesh's inner edge overhangs where the curved/cambered road surface is lower, but the center-only contact never sees it. Fix is the multi-point tire-footprint phase of FEAT-09."
---

# BUG-18: Wheel dips below the road surface on tight switchbacks (inside of the turn)

## Observed

On tight switchbacks the visual wheel intersects / sinks below the rendered road surface, worst on the
**inside of the turn**.

## Likely cause (user hypothesis — plausible)

The wheel collision is a **single sphere probed at the wheel center** (`queryContacts(hub, wheelRadius)`),
resolved against the road/terrain surface at that one point. The real tire is a wide cylinder; on a tight
turn the **inner edge** of the tire sits at a different lateral/arc position than the center, where the
curved + cambered road surface is lower. The center-only contact never sees the edge, so the visual wheel
mesh overhangs and dips below the surface. Standard fix: sample the tire **footprint at multiple points**
(across width and/or fore-aft), not just the center.

## Other suspects to rule out first

- **Camber/crown cross-section:** on a banked switchback the inside is lower by design; the wheel resting
  at centerline height naturally has its inner edge below the cambered surface. Check whether the dip
  matches `camberProfile` magnitude × tire half-width.
- **Visual vs collision radius/width mismatch:** confirm the wheel *mesh* radius/width matches the
  collision sphere `wheelRadius` (a fat visual wheel on a thin collider would dip independent of turns).
- **Tight-radius surface curvature:** the road centerline curvature at a switchback apex is near the min
  radius; verify the ribbon/carve cross-section there isn't itself dipping (separate from contact).

## Fix direction

This is the **multi-point tire-footprint** item under **FEAT-09** (generic contact pipeline). Sampling the
contact at several footprint points and taking the highest/combined surface gives the inner edge support
the single sphere misses — and it composes with the rest of FEAT-09 (debris, FEAT-08 overpasses). Could
also be mitigated cheaply by a small per-wheel lateral offset sample on the inside of the turn, but the
footprint approach is the real fix.

## Acceptance

- [ ] Classify the dip: footprint geometry (sphere-edge) vs camber-by-design vs mesh/collider mismatch.
- [ ] If footprint: multi-point tire contact eliminates the dip on tight switchbacks without destabilizing
      normal-speed feel (gate against `test/assert-m4-*.mjs`).
