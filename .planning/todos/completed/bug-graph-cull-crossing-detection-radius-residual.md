---
id: BUG-25
type: bug
status: open
opened: 2026-06-30
severity: major   # promoted 2026-07-07 — see "Escalation" below; was minor
source: user-observation (in-sim graph-mode map vs 3D desync) + headless scan; escalated by BUG-30 investigation (merged in)
relates_to: FEAT-13 (graph road network), QUAL-11/13/16 (junction pads amplify the flip), BUG-30 (merged, .planning/todos/completed/bug-session-state-white-terrain-fallthru.md)
---

# BUG-25: Graph crossing-cull picks a different survivor edge at a few centers (crossing-DETECTION is still render-radius-bounded)

## Symptom

In graph mode the 2D map (`map2d`, streams ~1500 m) and the 3D world (streams ~320 m) occasionally show a
**single different edge** near a junction — the cull dropped one strand of a crossing in one view and the
*other* strand in the other. Down from the original gross desync ("map culls a bunch of roads the 3D
keeps"), which was the dominant bug and is FIXED (see below). What remains is a 1-edge tie-break flip at a
small number of centers.

Headless repro (seed 67): of the scanned centers, two far-corner ones — `(-2000,-1600)` and `(-2000,-400)`
— still differ by exactly one edge between a 320 m build and a 1500 m build at the same center. Seed 6 is
fully clean across all tested centers.

## Escalation 2026-07-07 (BUG-30 investigation merged in — severity minor → major)

The flip is NOT only map-vs-3D and NOT only cosmetic. In the 3D world itself, re-streaming the same
place with a different window (drive/fly out of render distance and back) can flip the cull to the
OTHER crossing strand — a whole edge appears/disappears between two visits. Proven with A/B place
captures at the same spot in a fresh empty-cache session (seed `testig`, ~(1715, 710)):

- `Logs/rangersim-capture-1783407241688.json` — game ON `g:2,1,2:3,2,0`; fresh replay build: NO road.
- `Logs/rangersim-capture-1783407427401.json` — game ON `g:2,1,2:3,2,0`; fresh replay build has the
  OTHER strand `g:2,0,1:2,1,2` at the same world position.
- `Logs/rangersim-capture-1783407444786.json` — same edge in game; fresh replay: no road.

User-visible fallout (screenshots 2026-07-06 22:45–23:20): giant light/white angular plates and
draped bands at junctions (QUAL-11/13/16 pad boundary+fill rebuilt against the flipped leg set),
terrain re-carved to a different road (sawtooth cut-wall edges), road length changing between
visits, junction gradeY drifting 27 cm from fresh compute (`1783403142142`), and pad/fill surfaces
with no collision behind them — reads as "car falls through terrain". Physics heightfield itself
stays exact (groundY matched headless to the last float digit off-road).

Also ruled out along the way: code vintage (8250cdd/f15c8af/current all replay-consistent with
each other, none match the flipped live state), session-cache poisoning (fresh empty-cache reload
reproduces), water (no ponds/streams at the sites; water renders blue), NaN in heights/carve.

## What was already fixed (the dominant half)

`_cullCrossings` (src/road.js) ran its bounded-hop **detour BFS** over the render-bounded `this._network`,
so a small play-radius window (≈14 edges) found no detour → every crossing looked like a bridge → 0 culls,
while the wide map window found detours → culled ~6. The detour BFS now runs over a DEDICATED wide,
window-invariant Urquhart graph (`_buildUrquhart(..., persist=false, marginOverride = roadGraphMargin +
maxHops + 1)`), so the detour answer is render-radius-independent. `_cullCrossings(mx0,mx1,mz0,mz1)` takes
the band; junction-degree mutation still targets `this._proto.graph`. 23 gates green.

## Root cause of the residual

The cull's candidate set is `this._crossingList` (from `_detectJunctions`), which detects crossings from
the **routed centerlines of in-band edges** — still bounded by the render radius. At a small radius a
crossing whose strands extend differently (or whose far strand isn't routed) is detected differently than
at the wide map radius. The detour graph is now invariant, but the *pair list* fed to the cull isn't, so:
- a crossing present in both → same cull (good);
- a crossing detected in one view but not the other → its tie-break (`da < db ? ka : kb`, else `ka < kb`)
  drops a different survivor → the 1-edge difference.

## Fix direction

Make crossing DETECTION window-invariant too: detect cull-candidate crossing pairs from the wide Urquhart
**chord geometry** (straight node→node segments over the same wide graph the detour BFS uses) instead of
from `this._crossingList` (routed, in-band). Chords-cross ≈ routed-edges-cross for the cull's purpose; it
makes the candidate pair set a pure function of (seed, params, region), independent of render radius.
Risk: chord-vs-routed crossing differs at curvy edges → may over/under-cull; re-validate GRAPH-FLAT-MERGES,
GRAPH-SURFACE-SMOOTH, GRAPH-CROSSINGS-CULLED, GRAPH-REACHABILITY.

## Acceptance

- A radius-invariance check (build at 320 m and 1500 m at the same center; compare the post-cull edge set
  within the smaller window) shows **zero** edge differences across a grid of centers for seeds 6 and 67
  (and a couple more) — both "world-only" and "map-only-near" counts are 0.
- Register that check as a gate in `test/run-all.mjs` (the gross-desync regression guard FEAT-13 lacked).
- No regression on the existing 23 gates; in-sim map and 3D agree on the network in the overlap.

## Files

- `src/road.js` — `_cullCrossings` (swap candidate-pair source to wide-graph chord crossings),
  possibly a small chord-intersection helper; `_buildUrquhart` (already takes `marginOverride`).
- `test/` — new `graph-cull-radius-invariance.mjs` gate; register in `run-all.mjs`.

## Notes

~~Low severity — drivable, cosmetic, only a single edge at a few centers. Deferred pending in-sim re-test of
the dominant fix; promote if the residual is visually noticeable while driving.~~ PROMOTED 2026-07-07:
the residual is very noticeable in-sim (see Escalation) — edge flips on re-stream at the player's
location, with junction-pad machinery amplifying a flipped edge into large visual corruption and
apparent fall-through. The acceptance's radius-invariance gate should ALSO sweep same-center
re-stream sequences (arrive from different directions), not just 320 m-vs-1500 m one-shot builds,
and include seed `testig` (1746687325) around (1668, 713) / (1365, -1) as a known-flipping fixture.

## Resolution (2026-07-07)

**Fixed — but the root cause was broader than the ticket's diagnosis.** Three window-variant inputs
were found and removed, the third in `_cullClearance` (QUAL-14 Part B), which the ticket did not
suspect:

1. **Candidate detection** — as diagnosed: the crossing pairs came from `this._crossingList`
   (in-band routed edges only). BUT the proposed chord-geometry fix is geometrically impossible:
   the Urquhart graph is PLANAR (⊆ Delaunay), so straight chords NEVER cross — empirically 0 chord
   crossings vs 17–19 routed crossings per window, and 100% of routed crossings are between edges
   that SHARE a node (routing excursions). Implemented instead: detection over the **one-ring** of
   the registered edges (`_oneRingEdges`) — every wide-graph edge incident to a registered edge's
   endpoint node, using its routed centerline (`_edgeXZPolyline`, same `_edgeCenterline` cache the
   assemble path uses). A pure function of (seed, params, region).
2. **Mid-pass detour mutation** — the cull deleted each dropped edge from the detour BFS adjacency,
   so each decision depended on which OTHER crossings the window happened to process (at the wide
   radius a far crossing's drop depleted a near crossing's detour → "bridge" → kept; narrow window
   culled it). The detour graph is now STATIC per pass; a shared droppedSet handles resolution.
3. **`_cullClearance` (not in the ticket)** — its violation pairs came from the registered
   (render-bounded) polylines: seed 6 @ (4180,280) kept `g:5,0,1:4,1,1` at 320 m while the 1500 m
   window (partner `g:3,1,0:4,1,1` registered there) clearance-dropped it. Both culls now run under
   one orchestrator (`_cullNetwork`) sharing the one-ring universe, one static detour, one droppedSet.

Also: `warmSpawnBand` now pre-warms the one-ring edges (they're routed by the cull each re-stream;
without warming, cold spawn would pay ~5–7 s synchronous routing — the QUAL-14 win preserved).
Junction-degree mutation still targets `this._proto.graph`; `_detectJunctions`/`crossingList` keep
their other consumers unchanged. No ROUTE SYNC / CARVE SYNC mirror touched (cull is main-thread
network assembly).

**Gate:** `test/graph-cull-radius-invariance.mjs` (registered in `run-all.mjs`) — 5/5 green:
- RADIUS: 320 m vs 1500 m post-cull edge sets, 2 centers/seed — seed 6 (incl. the new
  (4180,280) clearance fixture): 15 compared, 0 diff; seed 67 ((-2000,-1600)/(-2000,-400)):
  17 compared, 0 diff; testig ((1668,713)/(1365,-1)): 16 compared, 0 diff.
- APPROACH: testig (1668,713) direct vs west-in-steps vs NE-in-steps, and (1365,-1) direct vs
  west: 0 missing / 0 extra / 0 grade mismatch.
- Verified the assertion catches pre-fix code: on HEAD it fails with worldOnly=1 + mapOnlyNear=1
  at (1668,713), flagging the exact ticket fixture edge `g:2,1,2:3,2,0`.

The invariant survivor at the testig site is `g:2,0,1:2,1,2` (matches capture 1783407427401's
fresh-replay strand); replay of that capture is deterministic (3 identical runs). GRAPH-REACHABILITY
(standing red, QUAL-15) unchanged-to-slightly-better (76%→78% largest component).

**Open follow-up:** `data/route-cache-default.json.gz` doesn't contain the one-ring routes
(route-bundle-parity only checks the intersection, so it stays green); regenerating the bundle
with the new warmSpawnBand edge set would shave the worker warm at cold boot.

## Reclassification 2026-07-15 (user decision — benign residual demoted to a WATCH, not a hard gate)

The `roadSelfClearGap` default drop 80→50 (fixes seed-7 self-overlap blobs) re-threads long alpine
switchback edges and re-surfaced ONE testig radius-flip: `g:1,2,2:1,3,2` @(1668,713) is `worldOnly`
(320-kept / 1500-culled). Investigated to ground truth before accepting:

- **Direction is the benign one.** `worldOnly` = a real, DRIVABLE, *redundant* (has-a-detour) road
  present at play radius but omitted by the 1500 m 2D-map view. The dangerous inverse `mapOnlyNear`
  (a road drawn on the map that isn't there when you drive up) stays **0**.
- **The play world never culls it.** Play road-radius is a fixed player-centred window
  `(ring+0.5)·2·CHUNK_SIZE` → 320 m Normal … **576 m Ultra (ceiling)**; it does not grow as the world
  loads. Measured at the edge's own center: present at r=320/448/576/768/1024, only culled at ~1500 m.
  So the edge is reachable + stable at every play tier and approach — the in-play re-carve/disappear
  bug (the 2026-07-07 escalation) does NOT occur here; only the separate map RoadSystem under-draws it.
- **APPROACH-invariance still passes** (the actual in-play guard) — drive-out-and-back reproduces the
  same network.

**Gate change (`test/graph-cull-radius-invariance.mjs`):** made check (1) asymmetric by real-world risk.
`mapOnlyNear` (phantom map roads) and the APPROACH check stay **HARD FAIL**. `worldOnly` (benign map
omission of a redundant drivable road) is now a **non-blocking `[WARN]`** — printed every run so a
regression still surfaces, but it doesn't red the suite. Net: BUG-25's gameplay-affecting cases remain
gated; the cosmetic map-omission is a documented watch. Possible future cleanup: give the map's 1500 m
RoadSystem the same play-radius cull behavior (or none) so map == world exactly.
