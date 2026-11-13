---
id: FEAT-186
type: feature
status: open
severity: minor
opened: 2026-11-07
source: owner, 2026-11-07 tracker inbox
relates: FEAT-162 (a wheel at 0 % collapses onto its rim), FEAT-94 (flats)
---
lane: B

# FEAT-186: a wheel that has given out shows the bare rim at full deformation

Owner, verbatim (2026-11-07 tracker inbox): "A wheel that has given out appears as just a shrunken down regular wheel and tire. Instead, just stop rendering the tire, show only the wheel, and show it at max deformation. The fact that it is not turning will sell the effect"

## Acceptance

- [ ] At 0 % the tire is not drawn; the rim shows at its maximum deformation.
- [ ] Physics unchanged (fingerprint-physics identical).

## Built (Lane B, 2026-11-08, feature/machine 73390d34)

- `src/vehicle-model.js`: at 0 % the tire mesh is hidden. The rim keeps the 0 % runout already baked into it
  (`wheelRunoutAtZero` 40 mm peak-to-peak, the most a wheel bends). It no longer scales the whole wheel down to the
  0.18 m contact radius, which shrank the rim to about half size. Only the rim is scaled, so that its radius where
  it meets the road equals the contact radius: k = 0.18 / (rimRadius + the runout offset at the contact). The spin is
  locked, so the bent shape stays put. MESH == PHYSICS.
- `src/suspension.js`: that offset is `runoutAtContact()`, which `effectiveWheelRadius()` now calls. It is the same
  arithmetic, and `fingerprint-physics` is identical (round and out-of-round).
- Seen in game (seed 6, FL set to 0 via `window.__damage`): a bare steel rim on the road at the dropped corner.
  Probe `wip/feat-186/shot.mjs`.
