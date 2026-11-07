---
id: BUG-129
type: bug
status: open
opened: 2026-11-07
severity: major
source: Lane B's drive soak (test/drive-soak.mjs on main), run4, 2026-11-07
owner: Spare (road carve / embankment fill), after BUG-127
relates_to: BUG-74 (roadwork seam: fill buries rock), the carve's fill feather, MESH == PHYSICS
---

# BUG-129: an embankment's fill stops in a ~1 m cliff instead of feathering down

## What happens

Random seed 24316861, road `g:-2,-3,2:-1,-2,0` near arcS 628, along a line ~19.0 m from its centreline around
(−482.0, −984.7 … −986.6). The road sits on fill 6 m above raw ground (raw 101.9 m, analytic 107.8 m, road top 110.7 m).
The fill ends at ~19 m instead of feathering down: `analyticHeight` drops up to 1.04 m within 0.1 m. There are 111
such steps > 0.15 m within 4 m of the site.

Mesh and physics share the analytic carve, so it should also show as a visible cliff.

## What it does

The soak's off-road leg drove onto it at 4.9 m/s. The front-right wheel's ground rose 0.68 m in one step while the hub
moved ~8 cm. The tire load went negative (−6.7 kN), and the wheel ended 0.25 m below ground. run2 flagged the same
place twice.

## Replay

- Capture: `CarGame-machine/wip/drive-soak/run4/24316861-wheel-1.json`; `SOAK_TRACE=2 node test/drive-soak.mjs
  --replay=<capture>` from main.
- Scan: `node CarGame-machine/wip/drive-soak/site-steps.mjs <capture> [r]` lists steps > 0.15 m per 0.1 m around a site.

## Acceptance

- [ ] Root cause named: why the fill ends in a step here (a clamp, a band edge, a min/max merge, a corridor cut-off).
- [ ] A census on random seeds: how many fill edges carry a step > 0.15 m per 0.1 m, before and after.
- [ ] The fill feathers down everywhere, with no step above that threshold.
- [ ] The capture replays without the wheel-under-ground event; `fingerprint-world` changes explained.
