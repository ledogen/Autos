---
id: BUG-138
type: bug
status: open
severity: major
opened: 2026-11-07
source: Lane B drive soak run8 (6 random seeds × 6 km, with BUG-116)
relates: BUG-107 (tunnel mouth at a bend), BUG-67 (shared bores), BUG-126 (NOT this class: an autopilot steer into a 7.9 m wall)
---
lane: B

# BUG-138: a solid in the lane inside a bore, just before its portal

Seed 717319401. In the tunnel of run `g:-1,-1,2:0,-1,0` (bore [359, 518]), at arcS 514–517, 1–4 m before its
portal. The run ends at a T node (14.8, −75.0), 10 m past the portal. From the same node, the leg
`g:0,-1,0:-1,0,2` enters its own bore at its arcS 10.

- A road-tile solid (`{kind: road, key "0,-2"}`) stands 0.89 m from the centreline at arcS 514.7 and 2.21 m at
  516.7. It runs from 0.3 m to at least 1.5 m above the road top, with two vertical faces at right angles.
- Everywhere else in that bore the lining is 7.8–8.0 m out on both sides.
- The struck face is 10.5 m from the other leg's centreline at its arcS 8.7, 1.3 m outside that leg's portal.
  Reading, not yet proven: the second tunnel's portal structure intrudes into the first one's bore.
- The truck was on the line at 5.8 m/s and hit the face with its front-right corner: a 10.4 m/s jolt.

Capture: `CarGame-machine/wip/drive-soak/run8-bug116/717319401-jolt-1.json`
(`node wip/drive-soak/bore-scan.mjs <capture>`).

## Acceptance

- Nothing solid inside a bore's driving envelope; the cause is proven, not read.
- A census of portals that meet another tunnel's bore within a few metres, on random seeds: the count before and after.
- A gate pins this seed.
