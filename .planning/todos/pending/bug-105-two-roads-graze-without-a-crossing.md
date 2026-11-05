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
