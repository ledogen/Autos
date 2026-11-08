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

## The rim lips are BUG-150's cap (Lane B, 2026-11-08, `land/bug-150`)

The three rim lips were `_mergeCarve`'s duck cap, the same cap behind BUG-150's dirt wall but on the drop side. Here
the pad's dirt stands more than 1.2 m above the leg's section, so the cap held the dirt that far below the pad's rim.
On `land/bug-150`, where the cap is removed, Spare's census (`lip-census.mjs 1074499174`) reads: rim lips 0.281 /
0.360 / 0.389 m → none over 0.25 m (the seed's worst rim lip is then 0.158 m, elsewhere).

**Still open:** the 0.263 m leg lip on g:745990,432424,-1:0,1,1, side 1, at s 12. It is the same on main and on
`land/bug-150`, so it does not come from the cap. That is a leg's asphalt edge 12 m out from the node (LIP, not RIM).
