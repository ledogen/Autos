# HANDOFF — merging `feature/bug41` into main — 2026-09-06

**BUG-41 Stage 1 only: par now prices the arc the player actually drives. There are NO conflicts and
no resolutions to make — one commit, zero file overlap with main's advance. The thing to read before
merging is §4: this changes POI positions on merged runs, which is intended, and it fixes two gate
checks that nobody attributed to this ticket.**

Branch `feature/bug41` @ `666cde0`, one commit off `4a0016b`. Worktree
`/Users/ledogen/CodeShit/CarGame-bug41`, serving :3904.

---

## 1. NO CONFLICTS — verified, not assumed

Main advanced by exactly one commit while this branch was open:
`30c02ec fix(ASSET-34): square the fender, square the indicators, real front overhang`.

File overlap with `666cde0` is **empty**. ASSET-34 touched `assets/models/*`, `data/ranger.js` and
`data/vehicle-models.js`; this branch touched `src/road.js`, `src/gps.js`, `src/poi.js`,
`test/mission-network.mjs`, `test/gates.mjs` and the ticket.

The one thing worth checking rather than assuming — ASSET-34 edited `data/ranger.js`, which every
road/par gate imports for `RANGER_PARAMS`. Its change is `bodyLength` 4.61 → 4.705, and the comment
it added says outright *"Documentation only; nothing reads it"*; the live values (`targetLength`,
`shiftRear`) are vehicle-model loader scaling. **Nothing in routing, par or POI placement reads any
of them**, so every measurement below survives the merge unchanged.

```bash
bash ~/.claude/skills/worktree/scripts/wt.sh merge bug41
```

## 2. WHAT THE BRANCH DID

`edgeParData()` handed consumers a sampler keyed on **`clArc`** — the PRE-MERGE routed centerline
arc. A run that BUG-53/55/57 re-seated onto another's course (`offCurveSpans`) has points following
the winner, whose arc is **`polyCum`**. So on those runs the sampler indexed a road that was not
there: `centerline.length` short by up to **6.80% (33.3 m)** on 10 of 52 runs. Par is the FEAT-53
payout denominator, so par was holding the player to a time computed for a shorter road.

Owner ruling 2026-09-06, option (a) of the diagnosis handoff §1: re-parameterise onto `polyCum` and
move the consumers.

**The fact that made (a) the only defensible option: `polyCum` was already the project-wide
convention.** `_buildRunProfile` accumulates `arcPos` from the points' own XZ segment lengths, so
`runProfile` — and the carve, ribbon and physics — is polyCum. Every span record (`cededSpans` /
`offCurveSpans` / `departureSpans`) is built from polyCum. `edgeParData` was the **last** clArc
speaker. This is a correction toward the existing convention, not a new one.

`arcOrigin` measured **0.000 on all 52 runs**, so `runProfile`'s domain equals polyCum exactly. It
now throws if that ever changes, rather than silently restoring the offset.

**Plain runs deliberately keep the analytic centerline.** Its length matches `clArc`'s end EXACTLY
(0.0000 m over 42 runs), polyCum agrees to 0.040%, and its `curvatureAt` is exact where
`_pointSampler`'s ±3 m finite difference is not. Par integrates curvature as its dominant term — do
not "unify" this later to make the code look symmetric; it would smear all 42 plain runs to buy
0.04%. The invariant is written into `edgeParData`'s comment block.

### A second live defect, same cause

`poi.js` compared an `s` from the clArc sampler against polyCum-domain `cededSpans` through a ±20 m
tolerance — against an error up to 33 m. That is the guard stopping a lay-by pad being seated on
ceded road (the winner's pavement, where the winner's own edge can seat a pad on the same spot).
Same-domain now.

## 3. VERIFICATION — what I ran

`npm test` (37 affected gates, 32 heavy): **33/37 green**, wall 171 s. The four failures are exactly
the standing-red set the diagnosis handoff §5 predicted — `junction-stitch`, `mission-network`,
`paper-tour`, `pond-route-around` — with **two of them reduced**. Nothing new went red.

| gate | main | after |
|---|---|---|
| `mission-network` | 4 FAIL | **1 FAIL** |
| `paper-tour` | 2 FAIL | **1 FAIL** |
| `par-oracle` | PASS | PASS — SM-INV-2 holds |
| `story-poi` | PASS | PASS — identical (11 viable pads, roster 11/14) |
| `world-determinism` | PASS | PASS — byte-identical rebuilds, placement still seed-pure |

`mission-network` §7, before → after: interior p99 **3.241 → 0.045 m**, interior max 4.713 → 0.050,
band p99 **400 → 152 m**, peak 6.49 → 3.59. All four checks green (the fourth is new — see below).
Much of what read as "junction end band" divergence was the arc offset all along.

**Re-run after merging** — both are cheap relative to the suite:

```bash
node test/mission-network.mjs     # expect 1 FAIL: §0 only (see §5)
node test/par-oracle.mjs          # expect PASS
npm run test:all                  # pre-merge discipline, INFRA-01
```

## 4. READ THIS BEFORE MERGING

### 4a. POI positions move on merged runs. That is the point, not a regression.

Correcting the arc moves `L` and the ceded guard in `poi.js`, so house and pad sites shift on the 10
merged runs. That changes paper-route customer sets and therefore routes — tier 1 goes 0.84 →
2.11 km on the reference seed. Those sites were previously placed against an arc that did not
describe the road, so the new positions are the correct ones.

`story-poi` and `world-determinism` are unchanged, so placement is still a pure function of
(seed, pool). **`poi.js` reads the graph and writes nothing back, so routing is untouched and the
FEAT-76 parallelism still holds** — this branch cannot move the metrics FEAT-76 is judged against.

### 4b. Two gate checks were fixed that the ticket did not attribute to BUG-41

Both were testing the wrong thing, not catching defects. Neither is scope creep — they are the same
root cause, and leaving them red would have hidden the fix.

- **`mission-network` §2** asserted object identity between a mission segment's centerline and the
  registered one. It sat at a permanent **33/39 — all 6 misses off-curve, 0 plain**, because BUG-53
  *deliberately* hands merged runs a sampler (their registered primitive is stale). Identity is the
  wrong property for those runs. Now: identity for plain runs, geometric tracking of the registered
  polyline for merged ones.

- **`paper-tour`'s par-growth check was OURS, and it now passes.** This **corrects the diagnosis
  handoff §6**, which attributed both of paper-tour's failures to one cause (tier 3 dropping a
  tier-2 customer, SM-INV-12). Only one of them was. *"par grows with the route"* failed at
  **78 → 661 → 655 → 979** because tier 3's route was being measured short; with the driven arc it
  reads **144 → 631 → 796 → 950**, monotonic. Tier 3 is 12.81 km against tier 2's 10.47 km, i.e.
  genuinely longer — which is what the invariant was trying to say. The SM-INV-12 drop
  (`house:7,2,1|7,3,0:3`) is real, unchanged, and still the owner's call.

### 4c. The gate's instrument was wrong too

`mission-network` §7 compared two samplers at the same `s` **without checking `s` meant the same
thing in each** — precisely how this went unnoticed for a month. It now asserts the domain FIRST,
per run (`|par length − driven length| < 0.5 m`; 0.5 absorbs the chord-vs-arc difference on a plain
run, measured max 0.39 m). Its header no longer documents the 2026-08-03 WONTFIX, which is dead.

## 5. STILL RED, AND NOT THIS TICKET

`mission-network` **§0** (`no routed-geometry cull exists`) fails at 2/26 (8%), **identically on
main**. It asserts `culled === 0` on the FEAT-68 (2026-08-19) premise that the routed-geometry culls
were deleted. BUG-57's keep-the-connection ladder later re-introduced a **delete last-resort**, so a
non-zero cull share is now correct behaviour and the control is stale.

That is router/BUG-57 territory with FEAT-76 live in it, so I did not touch it. Same shape as
`pond-route-around`'s NON-VACUOUS control: **re-express it, do not delete it**, or the check passes
vacuously.

Consequence: **`mission-network` does NOT fully leave the standing-reds list**, contrary to what the
ticket's acceptance anticipated. It drops from 4 reds to 1, and the remainder is a different subject.

## 6. AFTER THE MERGE

BUG-41 stays **OPEN**. Stage 1 of three; the order is forced (measure → fit → price).

- **Stage 2 — re-anchor `PAR_REF` on v2 roads. Blocked on the owner.** `PAR_REF` was fitted
  2026-08-16 against human drives on v1 roads; router v2 took over 2026-08-18. Needs a labelled
  corpus recorded on v2 roads **into a NEW directory** — `runs/` stays intact as the historical
  record of the anchor being replicated, and must not be averaged in. More drives is the single
  biggest quality lever; the harness's own bar is *"20 is a hint, not a fit"*. `mu` is OWNER-SET;
  `calibrate-par.mjs`'s recommendation is advisory.
- **Stage 3 — re-derive FEAT-53 `k`**, once, after both stages. Precedent `30544cb`.

**Stage 1's par delta, the Stage 3 input:** 10 affected runs of 52 — distance −2.02% … **+7.15%**;
par time −2.14% … +2.04%, median |Δ| **1.04%**.

Par moves less than distance and sometimes opposite it (`g:7,-1,0:6,0,0`: distance +7.15%, par
−2.09%). That is correct, not an anomaly: `curvatureAt` is `Δangle / 2h` with `h` in arc units, so
spreading the same bend over its true longer arc gives genuinely gentler curvature per metre and a
higher corner-speed envelope. **These are one seed and pre-FEAT-76** — FEAT-76 will move the merge
set, so re-measure at Stage 3 rather than carrying these numbers forward.

**Do not judge Stage 1 by whether par times feel right.** The anchor is still v1's until Stage 2.
Stage 1 is judged on geometry: does `.length` equal the driven length. It does.
