---
id: BUG-30
type: bug
status: closed-merged
opened: 2026-07-06
severity: major
source: user-observation (live session, seed testig) + capture dumps + headless investigation
relates_to: QUAL-14 (seed-change flow), PERF-02/05 (chunk streaming/pooling), main.js debouncedRebuildFull
note: "NOT reproduced from any fresh load — session-state corruption in a long-lived tab (14+ h,
multiple mid-session seed switches). Physics is provably intact at the artifact sites; the white
surfaces are render-side. Live-session road profile also diverges 27 cm from deterministic recompute
at a junction — the two together prove the session's world state drifted from what its own code
computes fresh."
---

# BUG-30: Long-session world-state corruption — white terrain-hugging surfaces + apparent fall-through

## Symptom (user report, 2026-07-06 ~22:45, seed `testig`)

- Large **pure-white surfaces** that hug the terrain: a draped band crossing the junction near
  (1365, -1) and a huge flat plain filling the valley near (1735, 733). Roads visually cut where
  the band crosses.
- "Seems like it's possible to fall thru terrain in some places" — driving onto the white reads
  as falling through; HUD in the user's screenshot shows all four wheels carrying load though.

## Evidence (captures in Logs/)

- `rangersim-capture-1783403142142.json` (mark 1364.9, -1.4, on-road):
  `gradeY game=153.9490 vs replay=153.6771` (**27 cm divergence**); hit/runKey/arcS/camber/minRadius
  all match. Replay at f15c8af (the morning's build) computes the SAME 153.6771 → the offset is
  NOT code vintage; the live session's road profile diverged from any deterministic recompute.
- `rangersim-capture-1783403226665.json` (mark 1734.9, 733.2, off-road):
  `groundY 111.99604767724831` matches headless `analyticHeight` to the last float digit →
  terrain/physics stack in the live tab is byte-identical to current code. Physics is solid;
  the artifact is render-side.

## Ruled out (all reproduced clean, seed testig, same marks)

1. Fresh load of current main (9ee962a) — headless screenshots clean at both marks.
2. Fresh load of f15c8af (pre-QUAL-11/16) — clean (small pad notch only, fixed by QUAL-11).
3. **Mid-session seed switch 6 → testig via the World Seed field** (CDP-driven, exactly the user
   flow) — clean at both marks, HUD confirmed switch.
4. Water: no ponds within 300 m of mark 2, no streams within either capture region
   (WATER_DEFAULTS == ranger.js values, so capture's dropped `params.water` is harmless).
   Water meshes render blue, not white.
5. NaN sources scanned headlessly: heights, streamCarveSample, stream records — all finite.
6. Chunk pooling bounding-sphere writes present at all 3 Y-write sites (terrain.js:968/1031/1544).

## Update 2026-07-06 ~23:20 — live minimal repro + more vintages ruled out

User reproduced IN the corrupted session: freecam to the switchback at ~(1668,713) → renders clean;
fly just out of render distance and back → the re-streamed area comes back WRONG (angular flat
white plate at the saddle + changed terrain shape + sawtooth cut-wall edge). So re-streaming bakes
chunks/road tiles against session state that has drifted — first build in the same session is fine.

Debug panel Build stamp: 2026-07-06 08:05 UTC (= 01:05 PDT, the FEAT-23 merge) — but main.js has
not changed since 8250cdd, so this only proves the tab loaded ≥ 01:05. gradeY fingerprints:
8250cdd → 150.1614 (QUAL-13 moved junction grading +3.5 m), f15c8af/current → 153.6771,
live → 153.9490. Live matches NO vintage → drift is session state, not code vintage.

Headless leave-and-return (freecam to spot → 3 km out → back, CDP-driven) does NOT reproduce on:
current main (direct testig load), current main (after mid-session seed switch 6→testig via the
World Seed field), f15c8af. Before/after screenshots pixel-identical in all three.
Conclusion: a poisoning event earlier in the user's long session (multiple seed switches: pinto →
6 → testig, possibly slider changes) corrupted a shared cache; every subsequent re-stream reads it.

## Leading hypotheses (need live-session evidence)

- A debounced rebuild flow (`debouncedRebuildFull`, main.js:~440-508) aborted mid-flight
  (exception in the awaited `_importSessionOrBundledRoutes()` / `_reseatTruckAtSpawn()`), stranding
  old-seed terrain chunks / half-rebuilt state — the documented "toggle the seed to fix it" class
  (main.js:505 comment).
- Stale route/profile cache surviving a rebuild (explains the 27 cm gradeY divergence in isolation).

## Diagnostics to gather from a live corrupted session BEFORE refresh

1. DevTools console errors (worker crash / exception during a rebuild).
2. Does forcing a chunk rebuild (draw-distance preset change or terrain slider nudge) clear the
   white? Yes → stale terrain-chunk state. No → separate mesh (water/road leftovers).
3. Chronology: did the white first appear right after a mid-session seed change / slider change?

## Acceptance

- Root cause identified and the offending rebuild flow made atomic/idempotent (or cache properly
  epoch-invalidated), OR the live diagnostics above exonerate the rebuild flows and re-scope this.
- A long session with several seed switches + slider changes shows no white surfaces and
  `replay.mjs` gradeY parity at a junction afterwards.

## RESOLUTION 2026-07-07: merged into BUG-25 (root cause identified)

The A/B place captures (fresh empty-cache session, same location, before/after leaving render
distance) prove a crossing-cull EDGE SWAP, not session-state poisoning:

- `1783407241688` (1715.4, 711.5): game ON `g:2,1,2:3,2,0` — fresh replay build: NO road (hit=0).
- `1783407427401` (1709.8, 704.6): game ON `g:2,1,2:3,2,0` — fresh replay build has the OTHER
  crossing strand `g:2,0,1:2,1,2` there (arcS 462.5, minRadius 877 vs game 34).
- `1783407444786` (1728.4, 720.6): game ON `g:2,1,2:3,2,0` — fresh replay: NO road.

Exactly BUG-25's render-radius-bounded crossing DETECTION → tie-break drops a different survivor
per window. The white surfaces / regraded terrain / "fall thru" are the QUAL-11/13/16 junction pad +
carve machinery rebuilding against the flipped edge set. All findings and evidence move to BUG-25
(promoted to major).
