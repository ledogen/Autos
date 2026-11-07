---
id: BUG-144
type: bug
status: open
severity: minor
opened: 2026-11-08
source: Lane B, BUG-137's scans
relates: BUG-137 (causeway-T cliff), BUG-122/123 (junction-edge steps), road.js _padRibbonMask
---
lane: B

# BUG-144: the pad tears where two nearly parallel legs' mouth bands meet

`_padRibbonMask` takes the heavier leg's own deck. Two nearly parallel legs, 28 m out from a big node, disagree by
0.13–0.23 m, so the pad steps where one band hands over to the other.

- Seed 1353361482 at (26.3, 721.3): 0.19 m per 5 cm.
- Seed 917338424 at (99.4, −1015.8): 0.14 m per 5 cm.

Probe: `CarGame-machine/wip/bug-137/mask-legs.mjs <seed> x,z`.

## Acceptance

- No step over the designed lip across a hand-over between two legs' bands at either site.
- junction-edge-lip (or a sibling check) covers both seeds; fingerprint-world shows only the pads that move.
