---
id: BUG-137
type: bug
status: open
severity: major
opened: 2026-11-07
source: Lane B drive soak run8 (6 random seeds × 6 km, with BUG-116)
relates: BUG-122 (junction-edge lip; its gate pins "no dirt above the pad" on 2 seeds), road×stream causeways, MESH == PHYSICS
---
lane: B

# BUG-137: a carve cliff on the pavement at a T over water

Seed 917338424. At the T node (−204.2, −536.3), three runs meet over a causeway: the site reads `streamChannelAt`
and `pondSkirtAt` both true. On run `g:-2,-2,2:-204227,-536297,-1` near arcS 611, 1.5–1.7 m from its centreline
(inside the pavement), the carved ground (`analyticHeight`) climbs to 0.35 m above `sampleRoadTopY`. That is
0.21 m above the road-tile collider. It ends in a 0.44–0.50 m cliff along x ≈ −203.7, z −539.4…−540.1.

- Along z = −539.7: ground 122.32 → 122.67, then 122.24 at x −203.6; road top 122.31; collider 122.46.
- `carveHint` answers the same run and arcS on both sides. So the step is inside `analyticHeight`'s composition
  (the junction blend, or the stream/pond carve), not a hint switch.
- The tires ride the dirt: at 7 m/s a 137 kN strut, two wheel flags, 18 flags in 2 s. Since MESH == PHYSICS, the
  dirt should also show through the pad.

Capture: `CarGame-machine/wip/drive-soak/run8-bug116/917338424-strut-3.json`
(`SOAK_TRACE=1 node test/drive-soak.mjs --replay=<capture>`, `node test/soak-site.mjs <capture>`,
`node wip/drive-soak/step-hint.mjs <capture> -204.6,-539.7 -202.6,-539.7 10`).

## Acceptance

- The site's ground never stands above the road top inside the pavement, and has no step over 0.25 m.
- The cause is named, and fixed where every causeway junction routes through it.
- The junction-edge-lip check covers a causeway T (this seed), on top of its 2 seeds.
