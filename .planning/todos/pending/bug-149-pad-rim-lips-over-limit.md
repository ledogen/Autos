---
id: BUG-149
type: bug
status: open
severity: minor
opened: 2026-11-08
source: Spare, junction-edge-lip run on 9 random seeds (identical on main and the BUG-146 branch)
relates: BUG-145 (pad rim), BUG-122/123 (junction-edge steps)
---
lane: B

# BUG-149: pad rim lips of 0.28–0.39 m on seed 1074499174

Seed 1074499174: pad rim lips of 0.28 / 0.36 / 0.39 m (the limit is 0.25 m) at (742–743, 420.5), and a leg lip of
0.263 m on g:745990,432424,-1:0,1,1 at s 12. Pre-existing on main (after BUG-145's one duck cap).

## Acceptance

- [ ] Rim and leg lips at that site under 0.25 m, mesh == physics.
- [ ] junction-edge-lip passes there; the seed joins the gate if it is a new shape.
