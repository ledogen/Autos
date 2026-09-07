# HANDOFF — merging `feature/bug41` into main — 2026-09-06

**BUG-41 Stages 1 and 2. Par now prices the arc the player actually drives, and `PAR_REF` has been
re-anchored on v2 roads — where it turned out to need no change. There is ONE conflict, in
`src/road.js`, and §1 gives the resolution verbatim. Read §4 before merging: this moves POI
positions on merged runs, and it fixes three gate checks nobody attributed to this ticket.**

Branch `feature/bug41` @ `ae7d36a`, six commits. Worktree `/Users/ledogen/CodeShit/CarGame-bug41`,
serving :3904.

**Everything below was measured on the MERGED tree.** Main moved a long way while this branch was
open — FEAT-76 landed (`29274b2`, 12 commits) — so a trial merge was performed, resolved, measured,
then aborted to leave the branch clean. The numbers here are what you get *after* merging, not what
the branch reported in isolation. That distinction matters: FEAT-76 changed the merge set this
ticket is measured against, and several figures moved a lot.

---

## 1. THE ONE RESOLUTION: `_pointSampler`'s comment block in `src/road.js`

`test/gates.mjs` auto-merges. `src/road.js` conflicts once, at the top of `_pointSampler` (~line 815).

It is an adjacent-edit collision, not a disagreement. FEAT-76 inserted its **PROMOTED node identity**
block (`PROMOTED_K` / `_promotedId` / `_isPromotedId`) immediately above `_pointSampler`; BUG-41
rewrote that function's doc comment and renamed its parameter `clArc` → `arc`. Both sides keep in
full.

**Resolution: take FEAT-76's PROMOTED block first, then BUG-41's sampler doc and signature.** Order
matters only for readability — each comment then sits against the thing it documents.

```js
const PROMOTED_K = -1
const _promotedId = (x, z) => [Math.round(x * 1000), Math.round(z * 1000), PROMOTED_K]
const _isPromotedId = (id) => !!id && id.length === 3 && id[2] === PROMOTED_K

// Samplers over a graded edge polyline: arc s → position / routed design Y.
// `arc` is ANY monotone per-point arc array — the caller picks the domain. edgeParData passes
// `clArc` (the routed centerline arc, exact inverse of the sampling in _assembleGraphEdges) for a
// plain run and `polyCum` (the driven chord-sum arc) for a merged one; see the BUG-41 invariant
// there. Used by edgeParData → par oracle (FEAT-29).
// BUG-53: points-backed stand-in for a trimmed run's centerline — .pointAt(s)/.length over the
// REGISTERED (spliced) polyline, in whichever domain _gradeSampler is given.
function _pointSampler(points, arc) {
```

⚠ **Take BUG-41's `function _pointSampler(points, arc)` signature, not main's `(points, clArc)`.**
The function BODY below the conflict marker auto-merges to `arc`; keeping main's signature leaves
the body referencing an undeclared name. Post-resolution, verify:

```bash
node --check src/road.js
grep -n 'function _pointSampler\|function _gradeSampler' src/road.js   # both must read (points, arc)
```

Nothing else in the FEAT-76 merge needs attention — `edgeParData` came through intact, and FEAT-76
added no new path needing the same domain fix.

```bash
bash ~/.claude/skills/worktree/scripts/wt.sh merge bug41
```

## 2. STAGE 1 — par prices the DRIVEN arc (`666cde0`)

`edgeParData()` handed consumers a sampler keyed on **`clArc`**, the PRE-MERGE routed centerline arc.
A run that BUG-53/55/57 re-seated onto another's course (`offCurveSpans`) has points following the
winner, whose arc is **`polyCum`**. On those runs the sampler indexed a road that was not there and
`centerline.length` came out short. Par is the FEAT-53 payout denominator, so par was holding the
player to a time computed for a shorter road.

Owner ruling 2026-09-06, option (a) of the diagnosis handoff §1: re-parameterise onto `polyCum`.

**What made (a) the only defensible option: `polyCum` was already the project-wide convention.**
`_buildRunProfile` accumulates `arcPos` from the points' own XZ segment lengths, so `runProfile` —
and the carve, ribbon and physics — is polyCum. Every span record (`cededSpans` / `offCurveSpans` /
`departureSpans`) is built from polyCum. `edgeParData` was the **last** clArc speaker.

`arcOrigin` measured **0.000 on all 60 runs**; it now throws if that ever changes rather than
silently restoring the offset.

**Plain runs deliberately keep the analytic centerline** — its length matches `clArc`'s end exactly,
polyCum agrees to 0.040%, and its `curvatureAt` is exact where `_pointSampler`'s ±3 m finite
difference is not. Par integrates curvature as its dominant term. Do not later "unify" this to make
the code look symmetric; the invariant is written into `edgeParData`'s comment block.

### A second live defect, same cause

`poi.js` compared an `s` from the clArc sampler against polyCum-domain `cededSpans` through a ±20 m
tolerance — against an error of tens of metres. That is the guard stopping a lay-by pad being seated
on ceded road (the winner's pavement, where the winner's own edge can seat a pad on the same spot).
Same-domain now.

## 3. STAGE 2 — `PAR_REF` re-anchored on v2, and nothing moved (`f973ede`…`fb4104c`)

`PAR_REF` had never been anchored on the roads it prices: passes (1)-(4) were all fitted against
router-**v1** drives, pass (4) landed 2026-08-16, and v2 took over 2026-08-18 (`7cff01d`) with
measurably different corners. mu prices corner speed, so this was a real gap.

Re-measured on a fresh corpus — **`runs-v2/`, 12 runs / 11 fittable, seeds 97/69/0** — kept apart
from the v1 corpus in `runs/` and tagged per run so the two can never be fitted together by accident.

**Result: the four felt-par drives land at mean ratio 0.879 against the post-(4) target of ~0.88.**
`runs-report`'s verdict is *"the standard is well calibrated on 'felt on par' runs"*. So
**mu 0.80 / accel 3.0 / brake 7.0 are RATIFIED, not re-fitted** — v2 changed the corners, the
constants did not need to change with them. Recorded as `PAR_REF` pass (5) in `src/par.js`.

`calibrate-par`'s own recommendation (mu 0.77 / accel 3.2 / brake 5.5) was **declined**, and the
reasoning lives in pass (5) so it is not re-litigated:

- the mu loss surface is **flat** — 0.74 → 0.1901, 0.78 → 0.1897, 0.82 → 0.1910. This corpus barely
  identifies mu, and 0.80 sits inside that band.
- **brake 5.5 is the value pass (3) explicitly rejected** when it moved to the measured 7.0, noting
  5.5 "under-priced every corner entry". A fit walking that back at n=11 is fitting noise.
- 11 fittable is still under calibrate-par's own *"20 is a hint, not a fit"* bar. Pass (5) ratifies
  rather than proves.

### The plumbing that came with it

- **`road_router`** on every run export, from `road.js` `ROAD_ROUTER_VERSION`. Same contract as
  `par_ref.slack` already inside the blob: a run recorded against a different standard has to say
  so. Stamped in `main.js` beside `seed`/`driver`/`felt` rather than in `buildRunExport` — that
  keeps `road.js` out of `mission.js`'s import closure, which matters because `par-oracle` imports
  `mission.js` and would otherwise rerun on every `road.js` edit.
- **`runs-add.mjs` / `runs-report.mjs` took a `--dir=`.** Both hardcoded `runs/`, which would have
  dumped the v2 corpus straight into the v1 one. `runs-add` backfills `road_router` for older
  exports (`--router` overrides) and logs it per file, so a wrong assumption is visible at import
  rather than months later inside a fit.
- Verified end to end: the last three runs were exported by the live build and arrived already
  carrying `road_router: 'v2'` — no backfill.

⚠ `~/Downloads` is sandbox-restricted for directory listing on this machine, so the bare
`npm run runs:add` crashes on `readdir`. Pass explicit paths. Documented in `runs-v2/README.md`.

## 4. READ THIS BEFORE MERGING

### 4a. POI positions move on merged runs. That is the point, not a regression.

Correcting the arc moves `L` and the ceded guard in `poi.js`, so house and pad sites shift on the
merged runs, changing paper-route customer sets and routes. Those sites were previously placed
against an arc that did not describe the road, so the new positions are the correct ones.

`story-poi` and `world-determinism` are unchanged, so placement is still a pure function of
(seed, pool). `poi.js` reads the graph and writes nothing back, so routing is untouched.

### 4b. Three gate checks fixed that the ticket never attributed to BUG-41

None is scope creep — all three share this ticket's root cause, and leaving them red would have
hidden the fix.

- **`mission-network` §7** — the two BUG-41 checks it was re-opened for.
- **`mission-network` §2** asserted object identity between a mission segment's centerline and the
  registered one. It sat at a permanent 33/39 — all 6 misses off-curve, 0 plain — because BUG-53
  *deliberately* hands merged runs a sampler (their registered primitive is stale). Identity is the
  wrong property for those runs. Now: identity for plain runs, geometric tracking of the registered
  polyline for merged ones.
- **`paper-tour`'s par-growth check was OURS.** This **corrects the diagnosis handoff §6**, which
  attributed both of paper-tour's failures to SM-INV-12. Only one was. *"par grows with the route"*
  failed at 78 → 661 → **655** → 979 because tier 3 was measured short; it now reads
  144 → 631 → 796 → 950, monotonic. The SM-INV-12 customer drop is real and remains, owner's call.

### 4c. The gate's instrument was wrong too

`mission-network` §7 compared two samplers at the same `s` **without checking `s` meant the same
thing in each** — precisely how this went unnoticed. It now asserts the domain FIRST, per run
(`|par length − driven length| < 0.5 m`, the 0.5 absorbing chord-vs-arc on a plain run). Its header
no longer documents the 2026-08-03 WONTFIX, which is dead.

## 5. VERIFICATION — measured ON THE MERGED TREE

`mission-network`, before → after the branch, both post-FEAT-76:

| check | before | after | licensed |
|---|---|---|---|
| interior p99 | 1.854 m ✗ | **0.045 m** ✓ | < 0.5 |
| interior max | 2.374 m ✗ | **0.050 m** ✓ | < 2.0 |
| band p99 | 400 m ✗ | **24 m** ✓ | ≤ 250 |
| end-band peak | 4.41 m ✓ | 3.59 m ✓ | ≤ 45 |
| domain (new check) | — | ✓ | < 0.5 m |

`par-oracle` PASS (SM-INV-2 holds). `npm run build` clean. On the pre-FEAT-76 tree the full affected
suite was 33/37 green — exactly the diagnosis handoff §5 standing-red set, with `mission-network`
4 → 1 FAIL and `paper-tour` 2 → 1. **Re-run `npm run test:all` after merging**, since FEAT-76 has
moved the road subsystem underneath those gates since that sweep.

## 6. STILL RED, AND NOT THIS TICKET

`mission-network` **§0** (`no routed-geometry cull exists`) fails, on main and here. It asserts
`culled === 0` on the FEAT-68 (2026-08-19) premise that the routed-geometry culls were deleted.
BUG-57's keep-the-connection ladder later re-introduced a **delete last-resort**, so a non-zero cull
share is now correct behaviour and the control is stale.

**FEAT-76 made it worse, which is the clearest evidence it is stale**: 2/26 (8%) before, **7/26 (27%)
after**. T-promotion restructures more edges; the control cannot tell that from a defect.

Router/BUG-57 territory, so untouched here. Same shape as `pond-route-around`'s NON-VACUOUS control:
**re-express it, do not delete it**, or the check passes vacuously. Consequence: `mission-network`
does NOT fully leave the standing-reds list, contrary to what the ticket's acceptance anticipated.

## 7. AFTER THE MERGE — Stage 3, and it got much smaller

BUG-41 stays **OPEN** for Stage 3 alone: re-derive the FEAT-53 `k` against the new par, once
(precedent `30544cb`). Stage 2 ratified `PAR_REF` unchanged and therefore moved no par times, so
**Stage 3 has to absorb Stage 1's shift alone.**

**And FEAT-76 shrank that shift by more than half.** Re-measured on the merged tree:

| | pre-FEAT-76 | post-FEAT-76 |
|---|---|---|
| affected runs | 10 of 52 | **9 of 60** |
| distance | −2.02% … **+7.15%** | −2.02% … **+2.37%** |
| par time | −2.14% … +2.04% | −0.44% … **+2.22%** |
| median \|Δ\| | 1.04% | **0.40%** |

A median par shift of 0.40% on 15% of runs is small enough that **`k` may not need re-deriving at
all** — that is the Stage 3 question, and it is the owner's call. Whoever takes it should re-measure
first rather than trusting either column here; both are single-seed (seed 6 @ (4500,600)).

Par moves less than distance and sometimes opposite it. That is correct, not an anomaly:
`curvatureAt` is `Δangle / 2h` with `h` in arc units, so spreading the same bend over its true longer
arc gives genuinely gentler curvature per metre and a higher corner-speed envelope.

**Do not judge Stage 1 by whether par times feel right** — that was Stage 2's job, and Stage 2 says
they already did. Stage 1 is judged on geometry: does `.length` equal the driven length. It does.

## 8. HISTORY NOTE

`f973ede`'s message describes four source files it does not contain — it was made with no paths and
only `runs-v2/` staged. Those files landed in `ae7d36a` instead. Content and rationale are unchanged;
if you squash on merge this disappears, and if you don't, `ae7d36a` says where they belong.
