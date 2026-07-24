---
id: BUG-36
type: bug
status: open
opened: 2026-07-18
severity: major
source: user-observation + capture analysis
relates_to: BUG-24 (penetration failsafe), QUAL-13 (junction grade spikes), BUG-25 (edge flip / window variance)
note: "Where two road-fill embankments meet, their side-slopes form a knife-edge spine ~3 m tall.
Driving across/along it, one wheel's terrain height snaps ~3 m in a SINGLE frame, which the Step-1
catastrophic-penetration failsafe reads as a tunnel and 'rescues' by teleporting the whole body up
onto the spine — a multi-metre vertical launch. Root cause is the terrain (two fills meeting), NOT
the failsafe; the failsafe just makes it violent. User: it is where two terrain fills meet."
---

# BUG-36: Two road-fills meet at a knife-edge spine → wheel clip → failsafe launches the truck

## Observed

Seed 6, near **(289, −120)** (place-mark at (282.16, −120.21); user sighting POS seed 6 / 316 / −136).
Two roads run close together here, each carried on a fill embankment at a DIFFERENT height. Their
embankment side-slopes meet in a sharp spine/berm (clearly visible in the in-game screenshot — the
truck is perched on the knife-edge between the lower-left road and the right-hand road that curves
downhill). Coasting across this spine, the truck is thrown several metres into the air.

## Evidence (headless, from the two captures in logs/)

Event capture `rangersim-capture-1784360375115.json` (the launch), truck coasting at 8.5 m/s,
throttle/brake 0:

```
 fr    t       py      vy     fl_gh   (front-left terrain height under the wheel)
173  104.117  156.58  -0.71   155.36
174  104.133  156.60  -0.75   158.38   <-- fl_gh jumps +3.02 m in ONE frame (truck moved 0.14 m in XZ)
175  104.150  159.09  -0.14   158.43   <-- body py teleports +2.49 m (failsafe fires)
...
189  104.383  158.86  -1.75   ...      rl_gh does the same +3.08 m snap
190  104.400  159.76  -0.16   ...      body py teleports +0.93 m again (rear-left wheel)
```

The `+2.5 m` / `+0.9 m` position changes are unexplained by integration (`|Δpy − vy·dt| ≫ 0.05`), i.e.
they are Step-1 failsafe position writes, not physics. They fire because `depth = terrainH + r − hub.y
≈ 3.0 m`, so the failsafe reads the wheel as ~3 m underground and lifts the body by that much —
depositing it on top of the spine.

Road-surface probe (RoadSystem.debugSampleAt, cold rebuild) confirms two co-located fills at
different grades sharing graph node `g:0,-1,0`:
- **Upper fill** run `g:0,-1,0:-1,0,0` — gradeY ≈ **159–160 m** across px 276–296 (cold-rebuild stable).
- **Lower fill** run `g:0,-1,0:1,0,0` — gradeY ≈ **156.3 m**, observed BY THE GAME at the place-mark
  (282.16, −120.21). ~3–3.6 m below the upper fill.

Between the two fills the terrain ramps/steps from the lower platform up to the upper one over a very
short horizontal distance — the spine — so a wheel crossing it sees a near-vertical ~3 m rise.

## Not the failsafe change (BUG-24 threshold widening, feature/failsafe-depth)

The penetration is ~3 m. That trips the failsafe at ANY threshold ≤ 3 m — it fired identically under
the old `depth > wheelRadius` (0.368 m) and the new `depth > 2·wheelRadius` (0.736 m). The snap is also
instantaneous (0 → 3 m in one frame, no intermediate values), so no threshold in that range changes the
outcome. This bug predates and is independent of that change. Do not chase it there.

## Replay note

`node test/replay.mjs logs/rangersim-capture-1784360846079.json` (the place-mark):
- **(2) surface window-invariance PASSES** over [182,382]×[−220,−20]: 121 on-road points, gradeΔ 0 — so
  this is NOT a fold/tear WITHIN a single run.
- **(1) reproduction diff FAILS**: the game resolved road (hit=1, gradeY 156.30, the lower run) at the
  mark, but the cold rebuild resolves NO road there (hit=0). The lower fill is present in-game but not in
  the centered cold rebuild — the two-fill overlap is exactly where road-presence resolution is fragile.

## Likely root cause (for the fix, NOT to be actioned in this ticket)

Two fill embankments belonging to different runs at the same graph node, ~3.5 m apart in grade, whose
side-slopes are allowed to meet at a knife-edge instead of being blended/merged or grade-reconciled.
Same family as QUAL-13 junction grade spikes and the carve-cliff / window-variance work. The terrain
side is owned by the road carve / earthwork; **an active road-routing workstream is in flight, so this
ticket is diagnosis-only — no terrain/carve edits here, to keep that merge clean.**

## Possible fix directions (to weigh at planning — pick one, do NOT prejudge)

- **Terrain (root):** reconcile grade or blend the two fills where their footprints overlap so the
  meeting is a ramp, not a knife-edge. Belongs with the earthwork/carve owner + the in-flight routing
  work — sequence after that lands.
- **Failsafe (mitigation, cheaper):** the Step-1 response is wrong for a LATERAL clip. A wheel 3 m
  *beside/inside* a bank should be blocked/stopped, not teleported vertically onto the bank top. A
  vertical `position.y += maxEmbed` is correct only for a wheel that fell THROUGH the floor. Distinguishing
  "under" from "beside" (e.g. gate the vertical teleport on the contact normal being roughly up, or on the
  penetration having appeared gradually rather than in one frame) would turn the launch into a stop.
  Lives in physics.js, so it can proceed independently of the routing work.

## Acceptance

- Driving across the fill-meeting spine at (289, −120) on seed 6 no longer launches the truck several
  metres into the air. Either the terrain no longer presents a ~3 m single-frame step there, or the
  failsafe no longer responds to a lateral bank-clip with a vertical teleport.
- Deterministic + window-invariant; `npm test` stays green.
- Captures `rangersim-capture-1784360375115.json` (event) and `-1784360846079.json` (place) in logs/
  are the repro references.

## Related

- BUG-24 penetration failsafe (the mechanism that launches; NOT the cause) — `test/penetration-failsafe.mjs`.
- QUAL-13 sloped pads / junction grade spikes — [[project_qual13_sloped_pads]].
- BUG-25 edge flip / crossing-cull window variance — [[project_bug25_edge_flip]].
