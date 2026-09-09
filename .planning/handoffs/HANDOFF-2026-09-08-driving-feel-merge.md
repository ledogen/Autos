# HANDOFF — merging `feature/driving-feel` into main — 2026-09-08

**Three owner complaints, one branch: tires that never stopped gaining grip with load (FEAT-80),
crests and 4 m wobbles that launched the car (FEAT-81), and intersections that dropped you half a
metre in and out (FEAT-82) — plus the previously unmerged `feature/junction-stitch` work it was
ruled to be built on, and a par re-anchor to the new grip. Owner verdict on the merged tree:
"a, b and c feel great."**

Branch `feature/driving-feel`, worktree `/Users/ledogen/CodeShit/CarGame-driving-feel`, dev server
:3100. Main has NOT moved since the branch point (`2a5e275`), so the merge is conflict-free:

```bash
bash ~/.claude/skills/worktree/scripts/wt.sh merge driving-feel
```

`feature/junction-stitch` is CONTAINED in this branch (snapshot commit `3dc2574`, merged at
`7624d38`). After this merge, that branch and its worktree (`CarGame-junction-stitch`, :3417) can be
cleaned; the `height-aware-road-clearance` session that owned it was idle for over an hour when
the snapshot was taken and its tree was not otherwise touched.

---

## 1. What changed, by ticket

| ticket | one line | knobs |
|---|---|---|
| FEAT-80 | `tire.js gripLoad(Fn)`: μ falls with load (pDy2) and grip drops hard past the 9 kN rated load, floored. Peak force = μ·D·gripLoad(Fn). | `tireNominalLoad` 3400 · `tireLoadSensitivity` 0.12 · `tireRatedLoad` 9000 · `tireOverloadDrop` 0.60 (Vehicle → Tires → Load Sensitivity) |
| FEAT-81 | `_interpolateRunProfile` is a cubic Hermite (C¹ shipped profile); `corridor-router.js roundCrests` reshapes the solved profile so the wheels keep `crestHold`·g at the local par corner speed, re-priced. | `roadV2.crestHold` 0.5 · `roadV2.sagLoad` 1.0 (Roads → Router v2); 0 = the old behaviour |
| FEAT-82 | `roadJunctionPadTerrainBias` 3.0 → 0 (pad plane through the roads, not the terrain median); `_recoverFromHold` bends the deck-hold handoff into a vertical curve under the same rule. | `roadJunctionPadTerrainBias` 0 |
| par | `PAR_REF.mu` 0.80 → 0.72, note (6) in `src/par.js`. 8 new drives in `runs-v2/` (0013–0020). | — |
| junction-stitch | deck hold, BUG-59 per-leg pad reach, BUG-61, the FEAT-77 road-clearance rule + gate, BUG-63/64 tickets. | `roadV2.clearEdgeM` 12 · `clearThroatM` 30 |

The "crest airtime is a FEATURE" ruling is overruled by the owner (2026-09-08); the notes on
`profileSolve` and `dequantizeProfile` now say so.

## 2. Numbers (test/ride-probe.mjs, 54 km over seeds lone-pine/6/7/1517161527, at par speed)

| | main | merged branch |
|---|---|---|
| airborne length (lift ≥ 1 g) | 11 m | **0 m** |
| worst lift | 1.71 g | 0.87 g |
| lift p99.9 at 1.25× par | 0.94 g | 0.85 g |
| worst 1 m second difference (the "wobble") | 180 mm | 65 mm |
| pad rings on the circle fallback | 22 / ~200 | 1 / 210 |
| lab skidpad (owner, 25/60/150 m) | mu 0.72–0.74 | 0.65 / 0.65 / 0.64 |

Skidpad harness (`measure-vehicle-limits.mjs`, now booting again on the FEAT-48 engine ctx):
balance moved toward progressive understeer, limit trim 0.52 → 0.64 g at 4° steer.

## 3. Gates — READ THIS

`npm test` on the merged tree: **48 of 52 affected gates green.** The four reds, and whose they are:

- `junction-stitch` — 5 unstitched stretches, down from 66 on main. 4 are on the junction-stitch
  snapshot itself (seed 6 fork −3,1,1 · seed 6 gate window · seed 7 origin · seed 11 origin); the 5th
  is this branch's: seed 20 (950,403), an 8 cm edge step between two still-overlapping legs 16 m
  out where their hold recoveries differ. Owner's bar (zero) not met; the 3 m humps are gone.
- `road-clearance` — NEW gate from junction-stitch, **red by that branch's design** "until the
  residue is zero". Not this branch's to fix.
- `mission-network` — one check, "the drop-point road still exists when the PLAY system streams
  there: 1/6 evaporated 5,-2,2|6,-2,0". Identical on the junction-stitch snapshot → inherited.
- `paper-reroute` — was red on junction-stitch (scenario shift, 4.1 % vs a 5 % margin); the margin
  is re-baselined to 1 % on this branch per the owner's ruling and the gate is green here. If it
  shows red after the merge, something else moved.

`npm run test:all` was NOT run; the unaffected 18 are terrain/water gates with no import overlap.

## 4. Things a future session should know

- **The projection engine.** `corridor-router.js projectProfile` is one function under both
  `roundCrests` (10 m stations, strict grade cap + bore/fill box) and `_recoverFromHold` (4 m
  samples past a hold). Two lessons paid for: the grade cap and the box must be INSIDE the sweep
  (a clamp after convergence broke a flank and the strict re-price refused everything), and the
  hold recovery must be accepted on its RESIDUAL, not the sweep's step size (it creeps at 1e-3 for
  hundreds of sweeps while the curve is already within 2 mm — the first version discarded every
  attempt and shipped the smoothstep unchanged).
- **`priceProfile` has no half-quantum tolerance, the DP does.** A solve riding 0.25 on a 0.24 cap
  was silently refused by `dequantizeProfile` and shipped as a 25 % staircase. `roundCrests` now
  legalises those (cheaper, too: 6062 → 6054 on the measured run). If you touch the cap logic,
  keep the two in step.
- **The ruler.** `node test/ride-probe.mjs <seeds> [--top=N] [--over=1.25]` walks every run at
  par speed and prints lift, crest radii, the worst sites with distance-to-run-end and blend
  offset. Rainy-day script, not a gate. Any future "the road launched me" starts there.
- **Promoted-T sides on a banked trunk still hump** (seed 6 (−926,−501): +3 m over the 11 m hold)
  because the trunk keeps its banking by ruling. The recovery now bends it within the crest rule,
  but a banked T is the next thing to look at if intersections still feel wrong.
- The three `autos-capture-1788933*.json` files the owner dropped with the runs carry no
  complaint text and replay clean (turn radii 28–143 m, within design) — nothing to act on.

## 5. After merging

```bash
bash ~/.claude/skills/worktree/scripts/wt.sh clean driving-feel
bash ~/.claude/skills/worktree/scripts/wt.sh clean junction-stitch     # contained in this merge
```
Tickets FEAT-80/81/82 are already in `completed/` with resolution notes; BUG-59/61 came across as
completed from junction-stitch; BUG-63/64 arrived pending.
