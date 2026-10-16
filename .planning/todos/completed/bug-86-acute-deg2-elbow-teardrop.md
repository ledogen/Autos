---
id: BUG-86
type: bug
status: resolved
resolved: 2026-10-15
severity: major
opened: 2026-10-15
source: owner capture 2026-10-15 — "pretty yucky pretty ugly piece of road generation. lots of self
  overlapping and a busted 180deg hairpin at the end"
capture: .planning/bug-captures/bug-86-seed1813164377-acute-elbow.json (seed 1813164377, mark 300,-1520, story mode)
relates_to: FEAT-68 (deg-2 through pins, _v2NodeThrough), BUG-57 (crossing delete rung), BUG-53/FEAT-76
  (node-anchored merge → T), FEAT-17 (pond no-go)
---

# BUG-86 — an acute deg-2 elbow is pinned as a pass-through: teardrop hairpin + 600 m hug

## What happens (replay reproduces exactly: `node test/replay.mjs <capture>`)

Two runs share node 0,-3,2 (438,−1551):

- `g:0,-3,1:0,-3,2` — 1450 m for a 510 m chord.
- `g:-1,-3,1:0,-3,2` — 527 m.

They run 2–30 m apart for ~600 m and **cross three times** at 2–15 m of deck height, then both
hairpin out of node 0,-3,2 (the "busted 180"). Separately, `g:0,-3,1:0,-3,2` departs node 0,-3,1
at −117° against a 42° pin (router demoted it) and switches back at ~14 m radius over the T at
32432,-1920205,-1.

## The chain

1. **Ponds are the trigger.** Without `setWaterNoGo` this window builds clean (T at
   204513,-1467347,-1 on the shared corridor).
2. With ponds, the crossing delete rung kills `g:0,-3,2:1,-3,0` (2 unsanctioned crossings vs
   `0,-2,0|1,-3,0`).
3. Node 0,-3,2's built degree drops to 2, and both surviving neighbours lie WEST of it, 67° apart —
   an **acute elbow**.
4. `_v2NodeThrough` pins a deg-2 node to the neighbour-to-neighbour chord. At a 67° elbow that pin
   is ~120° off each leg's own chord, so both legs are forced to leave the node at right angles to
   where they are going: a teardrop, and the two legs run back west side by side.
5. The node merge declines on `frac` (the length rule makes the 527 m run the loser, and it is
   >85 % shared). Swapping roles clears `frac` but the T is then `promote-infeasible`
   (measured in a scratch worktree). The crossing rungs stand down for the planned merge, so the
   crossings ship.

`test/capture-classify.mjs` builds WITHOUT ponds, so it reports this capture CLEAN — it must wire
water the way replay.mjs does.

## Fix plan

- **A (this ticket):** a deg-2 node whose two neighbour bearings are within 90° is a turnaround,
  not a pass-through — no through pin. Pure fn of node positions → window-invariant.
- **B (if the hug survives A):** node-merge role choice when the shorter leg is the shared one +
  why the T is infeasible.
- capture-classify.mjs: wire ponds.

## A — built 2026-10-15 (feature/bug-86-acute-elbow)

`_v2NodeThrough` returns no through pin when the elbow is sharper than 75° (`ACUTE_ELBOW_COS`);
`_v2EdgeDirsBase` then gives each leg a CHORD pin toward its own neighbour, the BUG-53 junction rule
(degOf ≥ 3 → ≥ 2). Capture:
the 1450 m leg becomes 764 m and Ts onto the shared corridor at 221520,-1471652,-1 near the mark;
0 crossings (was 3); the start hairpin at 0,-3,1 is gone too (the leg now departs east). One
ordinary router switchback remains ~70 m before the T (139° at 11.9 m radius, above the 8 m fold
floor). capture-classify.mjs now routes round ponds like replay.mjs.

Why 75° and not 90°: the battery holds 46 deg-2 elbows at 65–89° (3–8 per window). At 90° every
one un-pins and two NEW junction-mouth rows appear (junction-stitch seed 11 (654,−682) 0.98 m edge
gap; road-clearance seed 6 mark-B (−1879,3879) 17.6 m over 72 m). At 75° (~10 nodes) and at 60°
both gates match main exactly. `npm test` (affected): 43/45, reds = road-tunnel + road-clearance
(its two known rows only).

## Acceptance

- [x] Capture no longer shows the teardrop at 0,-3,2; crossings between the two legs gone or
      resolved (capture-classify, pond-aware)
- [x] `npm run test:all` no new reds vs main (known reds: road-tunnel, road-clearance) — 90/92,
      same rows as main

## Resolution (2026-10-15)

First cut returned NO pin at all. test:all then failed paper-tour: the top tour went 14.59 → 16.41 km
(15.5 hard). Cause: seed 6 run g:6,-2,0:6,-1,2 went 552 → 854 m, because an unpinned leg leaves
wherever the router likes (the BUG-53 finding). Switched to the chord pin: paper-tour 14.77 km,
capture still clean (0 crossings), test:all 90/92 = main.

That run is still 848 m with the chord pin. It is the router's own switchback down a 109 m drop on
a 495 m chord: unpinned it routes the same. Main's 552 m line exceeds 20 % grade in 83 of its 20 m
windows vs 65 for the switchback. Main only avoided the switchback because the old through pin
forbade the NE start. Cost model working, not a defect.

Option B (node-merge role swap) stays unbuilt; reopen if acute-elbow hugs recur.
