# HANDOFF 2026-08-27 — BUG-56, half done. The next piece is CAMBER.

Read this, then `.planning/todos/pending/bug-56-junction-fork-disjunction.md` → **"BUILD PASS 1"**,
then `.planning/ROAD-CLOSEOUT-PLAN.md`. Memory: `[[project_bug56_departure_hold]]`,
`[[project_bug57_crossing_rung_state]]`, `[[project_road_closeout_plan]]`.

## Where things are

| | |
|---|---|
| Code | worktree `/Users/ledogen/CodeShit/CarGame-corridor-router`, branch `feature/corridor-router`, dev **:3343** |
| Docs / tickets | `/Users/ledogen/CodeShit/CarGame` (main) — the established split, keep it |
| Shipped this session | `90675b2` gate · `165a99d` departure hold · `82562d8` hold conditioning · `ae9d7da` mid-span removed · `+1 more` band arc allocation |
| Gate suite | `npm run test:all` → 47/51. Reds: `junction-stitch` (BUG-56, allowed red), `paper-tour`, `mission-network`, `pond-route-around` (all three are booked instrument re-baselines in the close-out plan) |

## THE NEXT TASK — camber through a fork departure

**The owner drove the reproducer on 2026-08-27 and rejected it.** Their words:

> "i still see a road come in perpendicular, rotate to be parallel last second and aggressive camber
> holding it at a 30deg deck angle to the mid edge its merging on"

They are right, and the fix that shipped does not address it. Do not re-litigate the height work —
it is measured and it holds. This is a second, independent mechanism.

### What is already known (measured 2026-08-27 — do not re-derive)

At seed 6, mark `(−1582, 1333)`, loser `g:-3,1,1:-4,2,0` ceding 0–95 m to `g:-3,1,1:-3,3,2`:

| loser arc | lateral sep | camber | winner camber | relative deck angle |
|---|---|---|---|---|
| 86–96 (throat) | 0.0 m | −13.1° | −13.1° | 0° — the ceded strand is fine |
| 106 | 4.5 m | −1.0° | −0.5° | 0.5° |
| 111 | 8.9 m | +5.6° | 0° | 5.7° |
| **121** | 18.4 m | **+17.8°** | 0° | **17.8°** |
| **151** | 42.8 m | **−17.3°** | 0° | **−17.3°** |

The leg rotates 31° between the throat and 25 m past the fork — that is the owner's "30 deg deck
angle" — and then reverses the full bank again over the next 30 m. Before/after the departure hold
these numbers are **identical** (17.7° vs 17.8° at arc 121), because the hold only ever governed
centreline height.

### Ruled out already — do NOT spend time here

- **The band's fold floor is not the cause.** `RFLOOR = 6` in the merge planner while the road's own
  `roadMinTurnRadius` is 15, which looks like the smoking gun. It is not: measured at RFLOOR 6, 10
  and 15, camber still saturates at 17.7° in all three. The bank comes from the **loser's own
  course**, which the band inherits by construction (`_v2BuildTaper`: the band IS the loser's line
  carrying a decaying lateral offset). Raising the floor only lengthens the band.
- **Camber has no span hook.** `_computeCamberArrays` is a pure function of the polyline —
  windowed curvature → saturating bank (`camberMaxAngleDeg` 20, `camberKneeRadiusM` 60) → forward
  slew-rate march (`roadCamberRate` 1.5 °/m). Nothing reads `cededSpans` / `offCurveSpans`. The
  ceded strand matches the winner only because its vertices are literally the winner's.

### The proposed fix, and why it follows precedent

`_applyJunctionBlend` **already kills camber** within `roadJunctionBlendLength` (30 m) of a
`flatCamber` endpoint — i.e. a true ≥3-way node — with a smoothstep ramp, applied as a post-pass to
the camber array in both consumers (`_buildCamberProfile` for the ribbon/carve, `_buildRunProfile`
for physics). A fork is a junction in everything but graph topology. The rule to add is the exact
symmetric partner of the one that shipped:

> The departure hold says: *while you are on top of the through road, your DECK is its deck.*
> The camber rule says: *while you are on top of the through road, your BANK is its bank.*

Concretely: record the departure extent on the registered run at assembly time (the arc range is
already known — `_v2DepartureHold` returns `holdK`, and `endData` builds the held vertex list), then
add `_applyDepartureCamber(runKey, arcPos, camberRad)` mirroring `_applyJunctionBlend`'s ramp, easing
from the winner's bank at the fork to the leg's own bank by the time it is laterally clear.

**This is a FEEL change across every merge in the world.** Game feel is the owner's authority
(CLAUDE.md). They were asked on 2026-08-27 and had not answered when the session ended — get the nod
before shipping it, and produce a map/screenshot A/B (ruling 6).

### The gate has a hole — fix it in the same pass

`test/junction-stitch.mjs` compares **centrelines only**, which is exactly why it printed this fork
as fixed while the owner was looking at a 30° deck. Extend it to the ribbon **edges**: at each
sample take `y ± halfWidth·sin(camber)` on both runs and apply the same rule to the edge pair. The
probe that produced the table above did precisely this and is trivial to fold in — see the
`runProfile(arcS, runKey).camberRad` + `arcOf` pattern.

## Everything else that is open, in order

1. **BUG-56 camber** — above. Blocks owner acceptance.
2. **BUG-51 — RULED, not built.** Owner 2026-08-27: *"condemn it, validate connectivity, reroll the
   seed if the world is genuinely unconnectable."* Ticket carries the ruling, the implementation
   notes (where the veto goes so it stays acyclic — model on `_v2DeleteFor`, NOT inside
   `_v2GradePts`), and the two remaining coordinates: **seed 7 (−1756, 1596) at 87 %** and
   **seed 6 (5736, 885) at 115 %**. Down from 6 runs to 2 — four were band artefacts, killed by the
   arc-allocation fix. Two of `junction-stitch`'s residual sites are this bug, not a stitching one.
3. **PERF-28** — hitch attribution then fix. Also inherits BUG-55's census/`_v2ConflictPairs` scan
   consolidation.
4. **Re-triage sweep** — BUG-47/48/52 + the BUG-25 watch against the v2 world. BUG-42 and BUG-55 are
   CLOSED (2026-08-27 / 2026-08-26); BUG-55's live residue is merged into BUG-57 under
   "CARRIED FORWARD FROM BUG-55".
5. **Merge to main** — settle the three remaining gate reds per the close-out plan's road-to-50/50
   section, re-bake the default-seed route cache, close FEAT-68.

## TRAPS — every one of these cost real time this session

1. **NEVER `git checkout` `src/road.js` in the worktree the owner is viewing.** A/B measurements this
   session swapped that file a dozen times while a dev server served it; the owner reloaded mid-swap,
   saw the baseline, and reported the fix as not working. Vite's transform cache also went stale
   across the swaps. **Use a throwaway worktree**: `git worktree add --detach /tmp/… <sha>`, symlink
   `node_modules`, measure there.
2. **A long-lived Vite server can serve stale modules.** If a change "doesn't show up", kill the
   server, `rm -rf node_modules/.vite`, restart, and verify with
   `curl -s localhost:3343/src/road.js | grep <your marker>`.
3. **String seeds must go through `parseWorldSeed`.** A raw `'lone-pine'` builds a garbage world.
   This has now burned two sessions.
4. **The departure hold is CONTIGUOUS from the fork and its projection WALKS a rolling window.**
   Both rules were earned by measurement (a hairpinning winner re-arms a "last vertex inside"
   rule and holds a 60 m band; a global nearest-point search teleports to the winner's far end).
   See `82562d8`.
5. **The hold is a PREFERENCE with a counted `unheld` fallback.** Remove that and the battery loses
   7 merges and gains 5 deletions — connectivity outranks stitching (BUG-57's ruling).
6. **Mid-span forks are deliberately NOT held.** Measured trade: +1 stitch site, −road-smoothness
   (a 24 cm collision-only step at a junction pad). Do not "finish the job" without re-measuring.
7. **`_v2Infeasible` does not bound grade damage** — 6 runs were over the 40 % ceiling while only 4
   were marked.

## Instruments

| | |
|---|---|
| `node test/junction-stitch.mjs [--verbose] [--top=N] [--window=<substr>]` | the BUG-56 gate — deck gap vs lateral separation, one rule: `≤ 0.15 m + sep / roadFillSlope` |
| `node test/capture-classify.mjs 6 -1582 1333` | what is at a mark and which guard skipped it |
| `node test/crossing-rung-parity.mjs` | deletions, components, REAL crossings across the battery |
| `node test/road-smoothness.mjs` | the collision surface — **green on all 3 seeds**, keep it that way |
| `node test/graph-topology.mjs` | 8/8, keep it that way |

Rainy-day probes used this session (camber table, grade census, play-vs-map stream A/B) were written,
used and deleted — the measurements they produced are recorded in the tickets, which is where they
belong. Re-create from the patterns above if needed.

## Owner context

Engineer, not a programmer — fluent on physics, geometry, maths, git and ops; needs one inline gloss
for JS/browser/CS-notation terms. **Density is the failure mode, not difficulty**: one idea per
sentence, expand the acronym once, prefer a plain sentence to a compressed one. They asked for
exactly this on 2026-08-27 ("really unclear from your prose"). They own game feel, pacing and
character calls — camber is one of those.
