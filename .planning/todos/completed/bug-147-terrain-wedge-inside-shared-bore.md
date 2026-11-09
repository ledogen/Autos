---
id: BUG-147
type: bug
status: closed
severity: major
opened: 2026-11-08
source: Spare, found while shooting BUG-67's miter before/after (pre-existing on main)
relates: BUG-67 (shared bore), BUG-138 (a solid in a bore before its portal)
---
lane: B

# BUG-147: a terrain rock wedge stands inside the tunnel bore at an underground Y

Seed 4076238903: the terrain surface (not the lining) pokes into the bore at the underground Y near (1734, −1393).
Seen from run g:1734063,-1393102,-1:2,-3,0 looking back at the node. It is the last before/after pair on Spare's
BUG-67 review page (https://claude.ai/artifact/7jCXeEf38d7wUpJzvwuECW); present on main before the miter too.
Possibly BUG-138's family (something solid standing in a sibling's bore).

## Acceptance

- [ ] Cause found: why the terrain under/around the shared bore is not carved clear at that spot.
- [ ] No terrain surface inside any bore at that site; a headless check (rays down the bore, or the carve vs the
      tube) pins it, and a census over random seeds says how common it was.
- [ ] Mesh == physics: whatever is drawn inside the bore is what the truck hits.

## Root cause and fix (Lane B, 2026-11-08, `land/bug-147`)

**The node is a T promoted into its trunk's bore, and its side road is a trench, not a tube.** Node
`1734063,-1393102,-1` sits 25.0 m under the hill (deck 96.6, hill 121.6). The trunk (A `g:1,-3,0:…` out at −22°, B
`…:2,-3,0` out at 155°) bores both ways from it. The T slide could not move it: no open-air fork existed, and a T
always beats no T. The side road C (`…:2,-2,1`, out at 52°) leaves the node at exactly `cutMax` (25 m), so its
profile classes it CUT: a 25 m trench falling to 7 m at 40 m out, then its own bore from 52 m. BUG-67's shared bore
merges TUBES only, so C's open lane ran straight into A's and B's closed linings:

- **Drawn:** a lane ray from 20 m out on C in to the node hits A's tube 10.5–11.8 m along it and B's 12.8–13.1 m
  (6 of 6 rays at lat −3/0/+3, 1 and 2.5 m up; main 78842e81 with the miter).
- **Collider:** the engine's static layer (road-tile 27,−22, the lining) is hit 6.3–8.6 m across C's lane.
- **The wedge Spare saw:** C's trench and the pad carve the skin to the deck beside the node, and the bore mound
  over A stands 8 m up. The triangles between span A's tube, and no mouth capsule discards them: 165 drawn skin
  points inside A's tube 2–5 m from the node.

**Fix (`road.js _boreOpenLegsAtUndergroundNodes`, before the crossing clip):** at a node of degree ≥ 3 where some
leg's span reaches the node, every leg that leaves it in the open is bored from the node. The bore runs until the
leg is clear of every sibling's tube AND shallower than a portal's stop depth (`boreStopDepth`, factored out of
`extendBorePortals`: bore radius + cover, or the cut = bore price crossover, whichever is deeper). A bore further
out within `MIN_BORE_M` joins it. The node is then an ordinary shared bore: the miter drops the linings inside each
other's tubes, and C gets a real mouth (portal ring, skin cut) 15 m out, 15 m clear of A's axis. The deck is
untouched; only the span changes. Mesh, heightfield slot, lining collider and skin all read the spans, so MESH ==
PHYSICS by construction. Degree 2 is left alone: a bore ending at a degree-2 node is the road's own portal.

**Measured at the site (fix):** C's spans `[52.3, 185.2]` → `[0, 15]` + `[52.3, 185.2]`. Every lane ray at the
node is clear (A, B and C in to the node, the A ↔ B chord): 0 lining hits, against 6. Engine rays along C's lane are
clear 25 m on the terrain and static layers. 0 drawn skin points inside a tube within 30 m (main 165).

**Census — two instances.**
- **This site:** seed 4076238903 (pond no-go world, R 1300 round the origin). The pass fires on 1 leg in 13 seeds:
  this one, and 0 on 2944481254, 2190890674, 3488188357, 1854438471, 511595902, 3636674384, 1841917782, 272419146,
  6, 11, 7 and 3.
- **Corpus seed 18:** found by `bore-junction-clearance`'s own world (string seed, r 1400, no pond no-go), node
  `1998416,642902,-1`, the same shape. The trunk `g:3,0,1:…` (out 142°) and `…:2,1,1` (out −37°) both bore from the
  node. The side road `g:2,0,2:…` (out −105°) left it open; it is now bored [0, 37.0] to a real mouth that stands in
  no pad. Lane rays: main 6 of 6 hit A's tube 9.6–13.6 m in; fix 0.

**Gate:** `portal-clear` (BUG-138's, the same class: something solid in a bore at a T) adds seed 4076238903 and an
open-lane check. At every node of degree ≥ 3 with a bored leg, a leg's lane (lat −4/0/+4, 1 m up, 1–30 m out)
where it is not in its own bore must not be inside a sibling's driving envelope. The perpendicular foot must lie
inside the sibling's span, so a lane running up to a portal is not "in" it. With the pass off: 1 fail (this lane,
1 m out). With the fix: 0 of 60 legs, and 41 rings (C's new one included) with none inside another bore.

**`bore-junction-clearance` (BUG-67's ceiling census) made shared-bore aware** (agreed with the orchestrator and
Spare). Its header still said "there is no machinery to MERGE two bores", so on seed 18 the fix's new sibling pairs
read 1 → 3 overlaps and 19 → 20 portals in a pad. Now:
- (1) counts a pair only when `siblingTubeTest` does not list each as the other's sibling. Its own node index is
  read, so a node-sharing pair the merge does not take still counts.
- (2) and (3) count the node-nearest span end only when `isMouth` says it is a portal.
- Ceilings drop to the measured values: MAX_OVERLAP 1 → 0, MAX_IN_PAD 19 → 17, MAX_AT_NODE 12 → 7. These are
  identical on main f5a6c0df and on the fix.
- On main + Spare's BUG-146 the in-pad count is 18: its seed-18 portal `g:-1,0,1:0,0,2` is a real mouth whose pad
  reach grew. Whoever lands second sets MAX_IN_PAD = 18.

## Resolution (2026-11-09)

Landed on main as **09ea7d66** (merge of land/bug-147 @ da8199de, main 5da5d243 + BUG-146 merged in; bore-junction-clearance MAX_IN_PAD 18). Affected gates 74/74 green; cdp-smoke 26/26, zero console errors.
