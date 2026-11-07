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
