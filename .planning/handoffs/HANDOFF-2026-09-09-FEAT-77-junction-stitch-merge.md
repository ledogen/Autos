# HANDOFF — merging `feature/junction-stitch` into main — 2026-09-09

**Read §1 before doing anything. The driving-feel handoff of 2026-09-08 says this branch is
"contained" in `feature/driving-feel` and can be cleaned after that merge. That was true when it
was written and is NOT true now: `feature/driving-feel` carries the 2026-09-07 snapshot of this
tree (`3dc2574`) but not the FEAT-77 commit that came after it (`d1b1263`). Cleaning
`junction-stitch` on the strength of the older handoff throws away the refined clearance rule,
the legacy-T fallback, the second routing pass and the mission-roll fence.**

Branch `feature/junction-stitch` @ `d1b1263` (+ this handoff), worktree
`/Users/ledogen/CodeShit/CarGame-junction-stitch`, dev server :3417.
Base: main `2a5e275`. Main has since taken one commit (`ba48edd`, a Ranger model tweak) and has an
uncommitted `assets/models/src/ranger.py` edit. Neither touches this branch's files.

---

## 1. Merge order and the one conflict

Two branches are waiting on main and they share history:

```
main 2a5e275 ─┬─ 3dc2574 (snapshot) ─┬─ d1b1263 (FEAT-77)          = feature/junction-stitch
              │                      └─ 7624d38 merge ─ 5e26cb3 … 3d91079 = feature/driving-feel
              └─ ba48edd (main today)
```

Merged either order, the result is the same tree and the same single conflict: the import line at
the top of `src/road.js`. `junction-stitch` adds `clearReq` to the corridor-router import;
`driving-feel` adds `roundCrests, stationSpeeds, projectProfile` to the same line plus a `PAR_REF`
import from `par.js`. The resolution is the union, and it was tested (§3):

```js
import { truncatedHeightField, routeEdgeV2, profileSolve, profileSolveBundle, dequantizeProfile, roundCrests, stationSpeeds, projectProfile, CLS, V2_COSTS, V2_TRUNC_K, clearReq } from './corridor-router.js'   // FEAT-68: …
import { PAR_REF } from './par.js'   // FEAT-82: the junction recovery is a vertical curve at par's junction-approach speed
```

Everything else auto-merges: driving-feel's road.js work is in `_interpolateRunProfile`,
`_profileTangents` and the new `_recoverFromHold`; FEAT-77's is in the merge planner, the fork
candidates and the router. `corridor-router.js` auto-merges (different functions).

Recommended sequence, from the main checkout:

```bash
bash ~/.claude/skills/worktree/scripts/wt.sh merge driving-feel        # conflict-free vs main
bash ~/.claude/skills/worktree/scripts/wt.sh merge junction-stitch     # ONE conflict: the import line above
npm run test:all                                                       # desktop; ~9 min wall on 8 cores
```

Then, and only then, clean BOTH worktrees:

```bash
bash ~/.claude/skills/worktree/scripts/wt.sh clean driving-feel
bash ~/.claude/skills/worktree/scripts/wt.sh clean junction-stitch
```

`wt.sh merge` does a `pull --ff-only` on main first. Main's uncommitted `ranger.py` edit does not
collide with either branch, but commit or stash it before the merge so the checkout is clean.

## 2. What this branch ships (beyond the snapshot driving-feel already carries)

The snapshot `3dc2574` holds: the junction DECK HOLD (each leg keeps the junction plane's grade and
roll until its pavement parts from its sibling's), BUG-59 per-leg pad reach, BUG-61 (the promoted
T node id is decided at plan time on pure samples, so it is window-invariant), the POI keep-out
against a neighbouring road, and the first cut of the FEAT-77 gate. The driving-feel handoff
describes those. `d1b1263` adds:

- **The clearance rule, refined to the physical case** (`clearReq` in `corridor-router.js`, one
  copy, called from `_v2ClearReq`). Two roads need 12 m of daylight between pavement edges,
  22 m centre to centre, plus earthwork when the earthwork of one would reach the other: an upper
  road on fill spilling under a lower one, or a lower road's cut undermining an upper one. Two
  fills or two cuts facing each other are benign and ask only the floor. Slopes and the apron cap
  are the carve's own numbers (`roadFillSlope`, `roadCutSlope`, `roadMaxEmbankmentToe`), so the
  rule can never disagree with what gets built. Hard cap 28.5 m centre to centre.
- **The rule drives the T machinery, not a spacing convention.** A pair inside the rule is a
  conflict; the merge planner resolves it into a T whose fork lands where the rule holds. Inside
  30 m of a shared node (`clearThroatM`) the old 18 m proximity still decides, or every throat
  would be a conflict.
- **Legacy-T fallback.** Where the wider rule makes a T's fork impossible, the pair re-plans under
  the old 18 m rule (`promote-legacy`) so no T that main had is lost. Owner ruling after the
  screenshot review: main's Ts looked better than two roads.
- **Sibling forks stagger** on a shared trunk; the abreast cap follows the band; a departure band
  may not overshoot across its trunk.
- **Second routing pass.** A loser that ends inside the rule but never inside 18 m re-routes with
  the winner's first-pass line priced as occupied (`dirs.occupied`, cost `wClear`). Honest
  result: it moves only 1–5 of the 15 residue pairs even at ten times the price, because the
  corridor grid is 32 m and the terrain price dominates. It is kept because it is cheap and never
  makes a pair worse.
- **Free-roam mission rolls fenced to the streamed band** (`mission.js _roll`), which took
  `mission-network` from red to green: the evaporating drop-point road was a frontier T that only
  exists in the play band.

Knobs, all in `data/ranger.js roadV2`: `clearEdgeM` 12, `clearThroatM` 30. `wClear` is read by the
router as `C.wClear ?? 12` and is NOT declared in `roadV2` yet. Add it beside the other two if
anyone needs to tune it.

## 3. Gate state

Full suite (`npm run test:all`), run on this branch and on a trial merge with driving-feel
(detached worktree, import conflict resolved as in §1, since discarded):

| | main | this branch | branch + driving-feel |
|---|---|---|---|
| gates green | see QUAL-28 memory: 4 standing red | 67 / 70 | 68 / 71 |
| `junction-stitch` unstitched stretches | 66 | **3** | 3 |
| `road-clearance` violating pairs (refined rule, 9 windows) | 32 pairs · 1.3 km | **14 · 0.5 km** | 15 · 0.5 km |
| `mission-network` | red (evaporating drop road) | green | green |
| `paper-reroute` | red | green (keep-out side effect) | green |
| `story-poi` | green | **red** | red |
| `play-area` 5 seeds | — | green, 1 component each | green |

The three reds, and what each needs:

- **`road-clearance`, 14 pairs.** New gate, gating at zero by the owner's bar. Of the 32 pairs main
  would show under the same ruler, 21 are fixed, 2 new ones are marginal (within 1 m of the cap),
  and 12 persist because the pair is too far apart to become a T and the second pass cannot move
  them. Four are substantive and worth a drive: seed 3 (619,−626) two legs 13 m apart for 120 m;
  seed 7 (−564,−423) two legs overlapping for 100 m; seed 6 (80,2694) 15 m for 88 m; seed 6
  (5057,306) 21 m under 20 m of height for 80 m. The merged tree adds seed 6 (5315,1452), 28.3 m
  against a 28.5 m rule over 4 m, from driving-feel's pad plane change. Nothing here is worse than
  main; main simply had no ruler.
- **`junction-stitch`, 3 stretches.** BUG-63 (a mid-span promotion key collision, seed 6 mark-B),
  the seed 7 shape-E pair at (−1652,1626) that is also a clearance violator, and a 1.2 m lip 61 m
  out at seed 7 (−573,−428). The owner's bar is zero. Each is a ticket, not a tuning.
- **`story-poi`, one check.** "A 50 m spawn drift does not swap mom and Larry." Mom's house on
  seed 6 now sits 980 m from spawn, and the roster's near-spawn ring is 1000 m, so the drift
  crosses the ring and re-picks her pad. Roads and the POI pool are byte-identical across the
  drift; only the ring membership flips. Green on main because main's roads put her elsewhere.
  This is roster fragility, and the fix is hysteresis on the ring (or ranking by drive distance),
  which is the owner's call. Not a road defect.

Verification before the merge: `restream-invariance`, `world-determinism`, `promoted-node-id`
(25 core T nodes, 0 violations), `road-worker-parity`, `network-worker-parity`, `road-connectivity`,
`graph-topology` (70 nodes, one component), `wye-release`, `pad-census`, all green on both trees.

## 4. Open items this branch leaves behind

Tickets in `.planning/todos/pending/`:

- **BUG-63** mid-span promotion key collision (one junction-stitch row).
- **BUG-64** class B: carve-made walls between roads 40–60 m apart with single-digit height
  difference. 45 sites reported by `road-clearance` (report-only ruler). A carve composition
  defect, not clearance.
- **FEAT-77** stays open until `road-clearance` is zero. Next levers, in preference order: a
  finer corridor grid near an occupied line (the 32 m cell is why the second pass cannot dodge),
  a post-fit clearance predicate that shoves the loser's polyline the way `_v2ShoveFor` does for
  crossings, or a routing-level berth. The owner prefers adjusting machinery over creating it.
- **QUAL-26** carries the ruling that the two-pass router stays banked and clearance is enforced
  by conflict.

Owner decisions outstanding: story-poi ring hysteresis; whether `road-clearance` stays gating red
while the four substantive residue pairs are worked; whether BUG-64 B is worth a pass now.

## 5. Traps

- Do not `git checkout src/road.js` in a worktree the owner is viewing on :3417; the dev server
  reloads and their drive vanishes.
- `test/screenshot.mjs` needs `--` before negative coordinates:
  `node test/screenshot.mjs -- -564 -423 --seed=7 --port=3417`.
- `_v2PromoteMidSpan` still declines split sides; `_v2PromoteOne` handles them. If a mid-span
  promotion looks wrong, that asymmetry is the first suspect.
- The sibling stagger uses the rule-based fork specs even when the sibling is a legacy re-plan.
  Harmless today; it would matter if a legacy fork ever landed inside the stagger window.
- The review artifact with before/after overheads of every changed site is at
  https://claude.ai/code/artifact/22b2c9aa-852b-43aa-aef0-ddf04e85383d.
