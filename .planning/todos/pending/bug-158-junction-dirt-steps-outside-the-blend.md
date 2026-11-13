---
id: BUG-158
type: bug
status: open
severity: minor
opened: 2026-11-09
source: Lane B, BUG-156's gore census (land/bug-156)
relates: BUG-156 (the limb-birth step, fixed in the ruled blend), BUG-130 / FEAT-40 (the resolver's rivals), QUAL-10 (_carveDirtY)
---

# BUG-158: hard steps in junction dirt that do not come from the ruled blend

BUG-156's census walked the gore dirt beside every padded leg on 8 random seeds, at 5 cm. BUG-156 removed the steps that
come from a leg limb appearing inside `_carveDirtY`. The steps below are the same on main a60e60db and on land/bug-156,
and each one traces to something outside the blend. In every case the physics ground jumps inside one 5 cm move.

| seed | where | step | what switches |
|---|---|---|---|
| 1074499174 | (735.4, 438.15 → 438.25), leg `g:0,0,1:745990,432424,-1`, side +1 | 0.43 + 0.16 m (gore line: 1.23 m at s 7.5, lat 12) | the resolver's winner flips from that leg to its neighbour `…:0,1,1`: a Voronoi seam (the line where the nearest leg changes) |
| 1074499174 | same leg, (735.4, 437.95 → 438.0) | 0.15 m | the winner's foot jumps arc 216.3 → 215.3 → 213.3 at a polyline kink (the inner-bisector frame) |
| 1074499174 | leg `…:1,1,1`, s 6.5, lat 13.6 | 0.87 m | the rival `…:0,1,1` switches between its end-cap frame and its interior frame (arc 0 ↔ 2.0) |
| 565500664 | leg `g:-142217,98499,-1:-1,0,0`, s 13, lat 12.05 | 2.42 m | flat wrap (the run circles the point at near-constant distance): the winner's foot hops arc 23.9 → 40.9, and `_junctionCarve` changes node to (−101, 88) |
| 11 | (−1396.75 → −1396.65, −740.3), junction (−1411, −726) | 0.85 + 2.88 m | `_connectorCarve` switches off between two samples 5 cm apart, while the winner's foot hops arc 871 → 851 |
| 917338424 | two gore lines | 0.55 m, 0.38 m | resolver class (winner or rival switch) |
| 169372896 | one gore line | 0.47 m | resolver class |

How each was traced: `wip/bug-156/pt.mjs` (in the land/bug-156 worktree, `/Users/ledogen/CodeShit/CarGame-land-156/wip/bug-156/`; wip is git-invisible, copy it before removing that worktree) walks a straight line at 5 cm and prints the
winner run, its arc, the rivals, the pad and the connector flag at each sample. `wip/bug-156/census.mjs` gives the
per-leg worst step and its class.

The seed-11 one is in fingerprint-world's `seed11 origin story` window. BUG-156 moves 14 carve vertices next to it,
which smooths the steps around it but leaves this one at 2.9 m.

## Acceptance
- [ ] Each site above: no step over 5 cm inside one 5 cm move, measured with the same walk.
- [ ] Re-run BUG-156's census (`wip/bug-156/census.mjs` + `cmp.mjs`) on its 8 seeds: no gore line worse than before.
