---
id: BUG-105
type: bug
status: open
severity: major
opened: 2026-11-03
source: owner capture /Users/ledogen/Downloads/autos-capture-1793661257788.json (seed 163384989, free roam, mark
  (−12734, 14911)) — "legs intersecting". Owner, 2026-11-03: "document this as another thing we need to fix, also on main"
relates: BUG-104 (two legs of ONE node overlap — a different pair shape), FEAT-77 (the clearance rule), test/lib/close-pairs.mjs,
  BUG-64 (earthwork between close roads)
---

# BUG-105 — two roads that share no node graze each other with no crossing

## What the capture shows (orchestrator probe, 2026-11-03)

The replay reproduces it exactly (`node test/replay.mjs <capture>`: run, arc and grade match the game). Two runs pass
within 120 m of the mark:

| run | length | end degrees | bores |
|---|---|---|---|
| `g:-20,23,1:-20,23,2` | 966 m | 2 / 3 | — |
| `g:-21,23,1:-12669676,14798347,-1` | 857 m | 2 / 3 (a promoted T) | 68–174 m |

They share NO node. Their centrelines come within **5.7 m** in plan, at **0.7 m** of height difference, at
(−12730, 14910), and stay within 12 m of each other for about 28 m. The pavements are ~7 m wide, so they overlap, and
no at-grade crossing is registered there. In game it reads as two roads running into each other.

This is not BUG-104's shape (two legs of one node lying on top of each other). It is two unrelated runs that either
should have crossed at a registered crossing or should have kept clear.

## Acceptance

- [ ] A census over enough seeds says how common it is (close pairs with no shared node and no registered crossing).
- [ ] At this mark, the two runs either cross at a registered crossing or keep the FEAT-77 clearance.
- [ ] The capture replays clean.
- [ ] The fix keeps every world window-invariant (the invariance and restream gates stay green).

## Second capture of the class — /Users/ledogen/Downloads/autos-capture-1793661187695.json (2026-11-03)

Sent as a tunnel collision; the BUG-67 re-assessment (proto/node-reseat, `wip/reseat/sibling.mjs`) found it is not one.
Two legs of site node `-13,10,0` (seed 163384989, mark (−8224, 6860)) come out of their tunnels and CROSS each other
76 m from the node with their decks 6.3 m apart vertically, and no structure or registered crossing there. The tubes
themselves stay 29 m apart. A second shape for this ticket: a grade-separated crossing with nothing to separate it.

## Measured (Spare, 2026-11-05) — census + the mechanism; the fix is a routing call

**Census** (`wip/bug-105/census.mjs`: road-clearance's FEAT-77 rule — closePairs + `_v2ClearReq` — on 16 worlds built
as the game builds them, with the pond no-go: the mark's window and 15 seeds at the origin, 623 km of road):
- pairs that share NO node and sit inside the rule: **1 — the mark itself**, nowhere else (5.7 m apart where the rule
  wants 23.0 m, 0.7 m of height, 52 m long — the capture's numbers, from a cold build);
- plan crossings that are neither at a shared node nor at a registered crossing, bores included (close-pairs skips
  ±80 m round every bore, so this was counted separately): **0**.

**The mechanism at the mark.** The grazing run `g:-21,23,1:-12669676,14798347,-1` ends at a PROMOTED T, and that T node
(−12670, 14798) is only **32 m** from the existing junction `-20,23,2` (−12645, 14819), which the other run ends at; a
32 m stub joins the two. The two roads are converging on what is really one junction split over two nodes, and graze
~150 m out from both — past the shared-node throat (≤ 120 m), and with no node in common, neither the planner's legs-
of-one-junction separation nor the gate's exemption sees them as related. Ways out (routing — the owner's call):
(a) a T promotion within some radius of an existing junction lands ON that junction instead, so both are legs of one
node and the leg separation applies; (b) the clearance planner treats nodes a stub apart as one junction.

**The second capture's shape** (legs of site node `-13,10,0`, seed 163384989, crossing 76 m out with decks 6.3 m apart)
does **not** reproduce in a cold build, on main or on this branch: the three legs come closest only at the node itself
(`wip/bug-105/mark2.mjs`). Like BUG-106, it may be a network adopted from an earlier window — the capture's
`streamCenterHistory` would tell; the captures are in ~/Downloads, which this session cannot read (asked to copy them
into wip/bug-106/).

## The mechanism, corrected (Spare, 2026-11-05 evening) — and a fix that moves the road

The note above was wrong on one point, and it changes which fix works. **In the plan graph the two roads ARE legs
of one node.** The side road's graph edge is `-21,23,1 → -20,23,2`; the T promotion moves its start to P only at
assembly. So the planner did see them as related, and options (a) "land the T on the junction" and (b) "count nodes
a stub apart as one" would only change which node the gate thinks they share. The graze 179 m out would stay
exactly where it is. Neither was built.

What actually happens at `-20,23,2` (`wip/bug-105/why.mjs`, `why2.mjs`):
- The two legs part at the node, swing **64 m** apart, and come back to **5.8 m** at ~179 m for ~50 m.
- The merge planner misses the pair. Its walk from the NW leg bridges the swing (the NW leg's samples stay inside
  the 60 m flare limit of the side road's line), so that walk calls it one 176 m node-anchored strand. Its walk
  from the side road does not (64.5 m > 60). One answer is < MINREG, so the pair skips the node-anchored path, and
  the mid-span search then starts past 176 + 60 m — beyond the graze. No plan. (Even with a plan, the side road
  already cedes to the trunk at that node, and a run may merge once per node.)
- FEAT-77's clearance pass then **defers** the pair, because it comes inside mergeProxM (18 m) "and the T machinery
  owns that". Nobody owns it.

**The fix (prototype `proto/bug-105` 33b041f1, worktree `CarGame-bug105`):** the clearance pass defers a close pair
to the T machinery only if the node's plan actually gives that pair a role. It asks the plan computed on the
PASS-1 lines (the lines the clearance pass itself reads), so it never reads a pass-2 route and no cycle forms
(`_v2NodeMerges` gains a quiet `pass1` mode; `pinHeld` reads base dirs, which are the same pins). A pair no plan
takes is an ordinary clearance violation, and the longer road takes the berth.

- At the mark: the NW leg keeps **52 m** (was 5.7 m), 966 → 921 m. The same window's one node-sharing violation
  (a road riding 150 m beside another at (−13879, 16279)) is fixed too: 913 → 665 m.
- A first, broader cut (4e5b7563: any short touch out on the span counts) flipped 121 pairs in 13 windows, most of
  them pairs the planner does merge. Rejected.
- **What else it moves** — 20 random seeds, 1 400 m round each origin, 767 km (`wip/bug-105/seeds.txt`,
  `narrow/moved-*.jsonl`): 7 sites. Three gain a road the crossing rule used to delete (connectivity up). One
  re-places two crowded Ts cleanly. One swaps a T for a different junction. Two shift a bend by ≤ 24 m (one of those
  gains a kink). The clearance census over the same seeds is unchanged (1 no-shared-node pair, 8 node-sharing
  pairs, on main and with the fix).
- **Not fixed — the other shape:** seed 158847947 (2020, 625), roads `1,0,0→3,0,2` and the trunk of T
  `2321413,700472`. They are 15.3 m apart and 8.5 m apart in height, side by side for 168 m. They share no node
  even in the graph, so it's the disjoint planner's hole (BUG-55 shape E: its winner must be "plain", and this
  trunk carries a T). A pass-1 forecast of that planner needs `_v2MergeFor`'s promotability probe, so it is a
  separate pass.
- Sheets: `CarGame-bug105/wip/bug-105/shots/sheet-{1-mark,2-elsewhere,3-open}.png` (map overlay + top/oblique
  frames, main :3885 vs fix :3886).

### Gates and the owner call (2026-11-05, late)

`npm run test:all` on proto/bug-105 33b041f1: **121/122. `vertical-curvature` is RED** on its seed-11 window. The
re-routes reshuffle which roads survive at (−1895, 184). Main tunnels through that ridge; the fix sends a road over
the saddle to a junction on the crest: a 0.183 /m crest (line 0.07; lift-off at 7.3 m/s) and a 0.552 /m junction
sag (line 0.11). So the fix cannot land as it stands. Sheets (sent to the owner): `sheet-1-mark` (fixed, 2 sites),
`sheet-2-elsewhere-a/b` (7 sites on 20 random seeds), `sheet-3-open` (the seed-11 crest, and the untouched disjoint
shape on 158847947).

**Spare's recommendation: park.** The defect is rare: this capture plus one disjoint sibling in ~1 400 km of
cold-built road. The fix moves ~8 sites for each one it repairs, and one of them gets worse. A fix with less
ripple has to mend the planner itself (its two walks disagree about where a node interval ends), which is a router
pass. Keep proto/bug-105 and this record. Owner's call: (a) park as recorded, or (b) one more pass to make the
fix land green (the seed-11 crest, then the s3192 kink).
