---
id: BUG-89
type: bug
status: open
severity: minor
opened: 2026-10-19
source: owner, 2026-10-19 — "slides too far when truck is on side add friction so you self right or roll more often"
relates: QUAL-25 (chassis collision mesh)
---

# BUG-89: Truck on its side slides too far

## Symptom
Once the truck is on its side (body/cab contact, not tires), it skates a long way instead of
digging in. Real body-on-dirt friction is high (μ ~0.5–0.8 plus gouging), which converts sliding
energy into either a self-right or a further roll.

## Acceptance
- [ ] Body-vs-ground friction raised (adapter seam / chassis collider material) so side-slides
      scrub off speed quickly; numbers verified headlessly (slide distance from a fixed tip-over
      speed, before/after).
- [ ] Rollover/self-right still emerge from physics — no scripted flip.
- [ ] `fingerprint-physics` diff is expected; physics gates green.
