# HANDOFF — PERF-32 connector ground-query cost, ready to merge — 2026-09-07

**Branch `feature/connector-cost`, worktree `CarGame-connector-cost`, one commit, tree clean. Merge
is conflict-free against main @ `2a5e275` (verified with `git merge-tree`; main has not moved since
the branch point). Purely additive — 317 insertions, 0 deletions, 6 files.**

```
cadf13d  perf(32): a deg-2 connector cost 3 fps; the accumulator made it a lock
```

Owner drove the build on the reported spot and signed off ("looks good").

---

## 1. The report, and what it was not

> "the game gets super laggy when the car is on this particular area of road … most likely has to do
> with a physics contact bug"

Two captures, seed 3301512992: a place capture at **(-128.64, -26.02)** and an event capture of 45
consecutive physics steps at the same spot.

**It was not the contact chain.** The event capture shows all four wheels in continuous contact, tire
deflections 29–41 mm, the four normal forces summing to ~14 000 N against a 13 341 N vehicle weight,
no dropouts, no spikes, no penetration. Nothing to fix in physics. The one thing the capture *does*
show that matters is the speed: **0.4–0.6 m/s**, a near-stationary truck, which is the precondition
for the amplifier below.

Measured in-browser over CDP, parked on the mark, 400 frames: **median frame 320.7 ms, 3.1 fps.**
Fifty metres away on the same road, a clean 60.

## 2. Two independent defects, and they compound

### (a) the connector design is priced before it is rejected

The mark sits 2.8 m from `@deg2:-119.9,-27.4`, a QUAL-16 deg-2 kink connector, so `_sampleCarveWorld`
calls `_connectorCarve` for every ground sample. That calls `_connectorDesignAt` → two `_runGradeAt`,
each a full run-polyline projection **plus** `centerline.nearest(wx, wz, 0.25, sCL-20, sCL+20)` — a
40 m scan at 0.25 m, **162 analytic pose evaluations**. The wheel contact path takes 33 tire-envelope
stencil samples per query and 24 queries per physics step (4 tunnelling failsafe + 16 suspension
substeps + 4 Pacejka), so on a connector that is **~257 000 centreline pose evaluations per step**.

And `_connectorCarve` paid for the design *before* it could reject. The real gate is
`bestLat > toeExt`, which needs `cd.grade` — but `toeExt = Math.min(…, carveHalfWidth +
maxEmbankmentToe)` is bounded by a **constant 18 m**, and the arc list is scanned over a 3×3 CHUNK
block. So every ground sample within **192 m** of any connector paid ~250 µs for a guaranteed-null
return. Mapped over the capture region that is a 190 m square of pure waste.

### (b) the accumulator turns a slow spot into a lock

`MAX_FRAME_TIME` (0.25 s) bounds the debt one frame may **add**; it does not stop the digging. Once
one step costs more wall time than `PHYSICS_DT` of sim time, every frame ends owing more than it paid
— two steps, then three, settling at the clamp's 15 steps/frame ≈ 4 fps, self-sustaining.

**This is the whole gap between the honest cost and the symptom.** With the spiral braked and the
cost untouched, the same spot runs at **46.7 fps**, not 3.1. Worth carrying forward as a general
fact: *a 2× cost regression anywhere in the physics step presents as a total lock, not as a 2×
slowdown.*

carveHint's memo comment has named this failure since PERF-24 ("the death-spiral fires when the truck
is ~STATIONARY — a slow frame dispatches many catch-up steps at one spot") and treated it as
something to be survived by making each step cheaper. Cheaper steps raise the bar; they do not remove
it, because the bar is a ratio.

## 3. The fix — three changes, none of which move the drivable surface

| file | change | why it is exact |
|---|---|---|
| `road.js` | hoist the 18 m lateral reject above `_connectorDesignAt` | `toeExt <= carveHalfWidth + maxEmbankmentToe` always, so past the ceiling the point was rejected either way |
| `centerline.js` | Lipschitz-pruned `nearest()` | primitives are arc-length parameterized ⇒ chord ≤ arc ⇒ `d(s)` exactly 1-Lipschitz ⇒ grid points the bound rules out cannot strictly win. Same grid, same visit order, same strict-`<` rule ⇒ **bit-identical** |
| `main.js` | wall-clock catch-up budget: if the fixed-step loop has burned a full `PHYSICS_DT` of wall time, drop the debt and render | first step unconditional, so the sim never stalls; under overload it runs in slow motion — the same trade the 0.25 s clamp already makes, without waiting for 4 fps to make it |

## 4. Numbers

In-browser, seed 3301512992, parked on the mark, 400 frames:

| build | median frame | fps |
|---|---|---|
| baseline | 320.7 ms | **3.1** |
| brake only, cost untouched | 21.4 ms | 46.7 |
| cost fixes only, no brake | 16.6 ms | 60.2 |
| **both (shipped)** | **16.7 ms** | **59.9** |

Ground query per physics step (headless, real road + real `analyticHeight`; the replay harness's own
terrain self-check puts this path within **7 mm** of the recorded game):

| spot | before | after |
|---|---|---|
| on the connector | 8.5 ms | 5.3 ms |
| 30 m away (halo) | 7.3 ms | 1.5 ms |
| 60 m away (halo) | 6.4 ms | 0.7 ms |
| ordinary road | 2.2 ms | 2.2 ms |
| off-road | 0.6 ms | 0.6 ms |

Note row 3 of the fps table: **the cost fixes carry it alone.** The accumulator brake is insurance
against the next slow spot, not load-bearing here. If it ever proves unwelcome it can be reverted on
its own without giving back the 60 fps.

## 5. Verification

- **New gate `centerline-nearest-parity`** (registered in `test/gates.mjs`): 489 000 queries across
  163 centrelines, **0 mismatches** on every returned field, 122 → 36 pose evaluations per call. It
  also asserts the **unit-speed premise** the prune stands on, so a future primitive type with a
  non-arc-length parameterization trips the gate instead of silently making the prune unsound.
- **`npm run test:all` — 69/70 green.** The single failure is `junction-stitch`, which fails
  **identically on the unmodified baseline**: 66 unstitched pair-stretches, 9 deck, 529 edge, 2891
  samples, byte for byte with and without this branch. That is pre-existing BUG-56. Since that gate
  measures deck geometry to the centimetre, its numbers being unchanged is independent evidence the
  surface did not move.
- Ordinary-road and off-road cost unchanged; 60 fps at both on baseline and fix (vsync-capped, so
  those confirm no regression rather than showing headroom — headroom is the ms/step table).

## 6. Traps — recorded in the code, do not re-litigate

- **Do not narrow `nearest`'s window or coarsen its DS.** That is the easy 5×, and it changes the
  road height the wheels ride on *and* the mesh carve table samples — a mesh-vs-physics disagreement.
  The prune gets the win without touching the answer. Both are explained inline at
  `centerline.js:nearest`.
- **Do not memoize `_runGradeAt` on a quantized cell.** It was prototyped (8.4 → 2.6 ms/step,
  tempting) and rejected: unlike `carveHint`'s memo — which caches the *run selection* and then
  re-projects the exact point, staying continuous — a grade memo produces a genuinely discontinuous
  height field, ~7.5 mm cliffs every 5 cm, which the tire envelope's 33-sample max would latch onto.
- **The hoisted reject is exact, not a tolerance.** If someone later makes `toeExt` able to exceed
  `carveHalfWidth + maxEmbankmentToe`, that hoist becomes wrong. The `Math.min` that guarantees it is
  four lines below the hoist.

## 7. What is left

- **PERF-32 closes on merge** — move `.planning/todos/pending/perf-32-connector-carve-cost.md` to
  `completed/`. Every acceptance box is ticked.
- **QUAL-31 is new and open** (`low`), split out of this work: `_connectorCarve`'s QUAL-24 comment
  says connectors survive only at the streaming frontier, "hundreds of metres past the ~160 m draw
  distance — reachable, never seen", and that premise is *why the path was allowed to be expensive*.
  The one in this capture is under the truck and present from all six stream centres tested, so it is
  not a frontier artifact — `_mergeDeg2Chains` did not splice that node. Either the merge has a gap
  or the comment is stale. It is `low` because PERF-32 removed the sting for every connector wherever
  it sits; it is worth answering because a stale comment tells the next reader that path is cold.
