---
id: BUG-148
type: bug
status: open
severity: major
opened: 2026-11-08
source: Spare, junction-edge-lip run on 9 random seeds (identical on main and the BUG-146 branch)
relates: BUG-137, BUG-144, BUG-145 (pad tears and steps), BUG-146
---
lane: B

# BUG-148: a 9.46 m pad tear on seed 749163472

junction-edge-lip's SMOOTH check fails on seed 749163472 at (557.3, 717.0): the pad surface jumps 9.46 m within
5 cm — a cliff in the pad. Pre-existing on main. Census copy: CarGame-spare-base/wip/bug-146/lip-census.mjs <seeds>.

## Acceptance

- [ ] Cause found and fixed at the pad/leg level (mesh == physics).
- [ ] junction-edge-lip passes at that site; the seed joins the gate if no existing seed covers the shape.
