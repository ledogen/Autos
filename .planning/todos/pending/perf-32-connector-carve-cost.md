---
id: PERF-32
type: perf
status: pending
severity: high
opened: 2026-09-07
source: >
  owner, driving seed 3301512992: "the game gets super laggy when the car is on this particular area
  of road — most likely has to do with a physics contact bug". Two captures:
  autos-capture-1788827643944.json (place) and autos-capture-1788827642709.json (event).
relates_to: >
  src/road.js (_connectorCarve / _connectorDesignAt / _runGradeAt), src/centerline.js (nearest),
  src/main.js (the fixed-step accumulator), QUAL-16 (the deg-2 connector), QUAL-24 (the
  "frontier-only" premise this violates), PERF-24 (carveHint's memo, which names this death spiral)
---

# PERF-32: a deg-2 connector makes the ground query 4x dearer, and the accumulator turns that into a 3 fps lock

## Symptom

Parked at (-128.6, -26.0) on seed 3301512992 the game runs at **3.1 fps**. Measured in-browser over
CDP, 400 frames, truck stationary: median frame **320 ms**, p90 376 ms. Fifty metres away on the same
road it is a clean 60. It is not a contact bug — see below.

## The physics is innocent

The event capture is 45 consecutive steps at the spot. All four wheels in continuous contact, tire
deflections 29-41 mm, the four normal forces summing to ~14 000 N against a 13 341 N vehicle weight,
no dropouts, no spikes, no penetration. Nothing in the contact chain misbehaves. (The truck is
creeping at 0.4-0.6 m/s, which matters — see the spiral.)

## Root cause 1 — the connector design is priced before it is rejected

The mark sits 2.8 m from `@deg2:-119.9,-27.4`, a QUAL-16 deg-2 kink connector, so `_sampleCarveWorld`
calls `_connectorCarve` for every ground sample. That calls `_connectorDesignAt`, which calls
`_runGradeAt` twice — each one a full run-polyline projection PLUS
`centerline.nearest(wx, wz, 0.25, sCL-20, sCL+20)`, a 40 m scan at 0.25 m = **162 analytic pose
evaluations**. The wheel contact path takes 33 tire-envelope stencil samples per query and 24 queries
per physics step (4 tunnelling failsafe + 16 suspension substeps + 4 Pacejka), so on a connector that
is **~257 000 centreline pose evaluations per physics step**.

Worse, `_connectorCarve` pays for the design *before* it can reject: the real gate is
`bestLat > toeExt`, which needs `cd.grade`. But `toeExt = Math.min(..., carveHalfWidth +
maxEmbankmentToe)` is bounded by a **constant 18 m**, and the arc list is scanned over a 3x3 CHUNK
block — so every ground sample within **192 m** of any connector paid ~250 us for a guaranteed-null
return. Mapped over the capture region, the wasted halo is a 190 m square.

Measured ground-query cost per physics step (headless, real road + real analyticHeight; the replay
harness's own terrain self-check puts this path within 7 mm of the recorded game):

| | baseline |
|---|---|
| on the connector | 8.5 ms |
| 30 m away (halo) | 7.3 ms |
| 60 m away (halo) | 6.4 ms |
| ordinary road | 2.2 ms |
| off-road | 0.6 ms |

## Root cause 2 — the accumulator amplifies it into a lock

`MAX_FRAME_TIME` (0.25 s) bounds the debt one frame may ADD; it does not stop the digging. Once a
single step costs more wall time than PHYSICS_DT of sim time, every frame ends owing more than it
paid: two steps, then three, settling at the clamp's 15 steps per frame — ~4 fps, self-sustaining.
That is the whole gap between the honest cost and the observed symptom: with the spiral braked but
the cost untouched, the same spot runs at **46.7 fps**, not 3.1.

carveHint's memo comment has named this failure since PERF-24 ("the death-spiral fires when the truck
is ~STATIONARY") and treated it as something to be survived by making each step cheaper. Cheaper
steps raise the bar; they do not remove it, because the bar is a ratio.

## Root cause 3 (NOT fixed here — owner's call) — the connector should not be there

`_connectorCarve`'s own doc comment (QUAL-24) states these survive only at the streaming FRONTIER,
"hundreds of metres past the ~160 m draw distance — reachable, never seen", and that is the stated
reason its cost was acceptable. This one is under the truck. Rebuilt from six different stream
centres (+/-300 m, +600/+600) it is present in every one, so it is not a frontier artifact:
`_mergeDeg2Chains` did not splice this node. The premise that licensed the cost is false.

The two fixes below make a connector cheap enough that this no longer hurts, so it is no longer
urgent — but a permanent deg-2 kink in the played area is either a merge bug or a doc that needs
correcting, and somebody should decide which.

## Fix

1. **Hoist the 18 m lateral reject above `_connectorDesignAt`** (`road.js`). Exact, not an
   approximation: `toeExt <= carveHalfWidth + maxEmbankmentToe` always, so anything past the ceiling
   was rejected either way. Kills the 192 m halo.
2. **Lipschitz-pruned `Centerline.nearest`** (`centerline.js`). Primitives are arc-length
   parameterized, so chord <= arc makes d(s) exactly 1-Lipschitz; after posing one grid point we can
   skip every point the bound proves cannot strictly beat the best distance seen. Same grid, same
   visit order, same strict-`<` rule, so the result is bit-identical — held by the new
   `centerline-nearest-parity` gate (489 000 queries, 0 mismatches, 122 -> 36 poses per call).
3. **Wall-clock catch-up budget** (`main.js`). If the fixed-step loop has already burned a full
   PHYSICS_DT of WALL time, abandon the debt and render. First step unconditional, so the sim never
   stalls; under overload it runs in slow motion, the same trade the 0.25 s clamp already makes,
   without waiting for 4 fps to make it. Insurance against the next slow spot, not load-bearing here.

## Result

In-browser, seed 3301512992, parked on the mark, 400 frames:

| | median frame | fps |
|---|---|---|
| baseline | 320.7 ms | **3.1** |
| brake only (cost untouched) | 21.4 ms | 46.7 |
| cost fixes only (no brake) | 16.6 ms | 60.2 |
| **both** | **16.7 ms** | **59.9** |

Ground query per physics step: 8.5 -> 5.3 ms on the connector, 7.3 -> 1.5 ms at 30 m, 6.4 -> 0.7 ms
at 60 m; ordinary road and off-road unchanged.

## Acceptance

- [x] the marked spot holds 60 fps in-browser at seed 3301512992
- [x] `centerline-nearest-parity` gate green: pruned `nearest` bit-identical to the linear scan
- [x] surface geometry provably unchanged — `junction-stitch` (cm-level deck geometry) reports
      byte-identical numbers with and without the change (it fails identically before and after; that
      failure is pre-existing BUG-56)
- [x] no regression on ordinary road or off-road cost
- [x] root cause 3 split out as **QUAL-31** — it is a road-graph/doc question, not a perf one, and
      PERF-32 does not wait on it (the halo fix helps every connector wherever it sits)
