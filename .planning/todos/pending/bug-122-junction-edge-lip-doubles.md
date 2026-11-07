---
id: BUG-122
type: bug
status: open
opened: 2026-11-07
severity: major
source: Lane B's drive soak (test/drive-soak.mjs, on feature/machine), reported to the orchestrator 2026-11-07
owner: Spare (road / carve), after BUG-121
relates_to: BUG-82 (pads weld to ribbons), BUG-74 (roadwork seam), the asphalt clearanceMargin lip
---

# BUG-122: the asphalt edge lip doubles (0.15 → 0.31 m) on a junction approach

## What happens

Away from junctions the asphalt edge stands the designed ~0.15 m lip (clearanceMargin) above the carved
shoulder dirt. On a junction approach the junction's ruled top rises while the shoulder dirt beside it stays
down, so the lip doubles to ~0.31 m. A wheel riding the shoulder that climbs back on takes a hard hit.

## Evidence (seed 6, the test seed; re-check on random seeds)

- Run `g:-298049,-987064,-1:-1,-2,1`, its south leg ~15 m before the junction node (−298, −987), east edge at
  about (−299.7, −1002.1). The physics ground (carved terrain, what `queryContacts` returns) drops 0.31 m within
  0.1 m laterally: −0.220 at 4.9 m from the centreline, −0.531 at 5.0 m (hub-relative).
- `sampleRoadTopY − dirt` grows 0.15 → 0.29 over the last 2 m before that point.
- The soak's front-right wheel climbs back on at 15.1 m/s: strut load 4.9 → 75.5 kN in one 1/60 s step, hub up
  18 cm, a 2.8 m/s jolt. Reproduces on replay.
- Capture: `CarGame-machine/wip/drive-soak/try4/6-strut-1.json`;
  `SOAK_TRACE=2 node test/drive-soak.mjs --replay=<capture>` prints the cross-section.
- Contrast: the soak's other flag at (−302.5, −945.9), 9.9 m/s, 56 kN, is the normal 0.14 m lip, the designed kerb.

## Acceptance

- [ ] Root cause named: why the junction's top rises without the shoulder carve following it.
- [ ] Along every junction approach on a random-seed sample, the edge lip stays at the designed ~0.15 m
      (MESH == PHYSICS: mesh and collider agree).
- [ ] A gate pins it (sampled, reported as a sample).
- [ ] The capture replays without the strut spike; `fingerprint-world` changes are explained.
