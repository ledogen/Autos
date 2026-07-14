---
id: PERF-18
type: perf
status: pending
severity: major
created: 2026-07-14
source: user-request
note: "Follow-on to PERF-17 (corridor, 1.5-2×). Attacks the ~42 ms/edge FIXED floor (self-clearance
scan + refit) the corridor cannot touch, plus a segment-based coarse pass. Combined target: ≥3×
cold-load vs the PRE-corridor baseline. Items 1-2 must be byte-identical (route-bundle-parity
green WITHOUT cache regen is the proof); item 3 changes corridor hints → regen + feel check."
---

# PERF-18: cut the per-edge fixed floor — skip-scan pre-check, refit span-skipping, segment coarse pass

Post-PERF-17 per-edge median ≈ 82 ms ≈ 12 ms coarse pass + ~28 ms corridor-constrained fine
search + **~42 ms fixed floor** (self-clearance backstop scan + refit), paid on every edge
regardless of search cost. Measured profile: perf-runs/profile-edges.mjs + bench-corridor.mjs
(PERF-17 artifacts). Design discussion 2026-07-14: segments-for-the-FINE-pass was considered and
REJECTED (re-opens the post-hoc-fit fold era; violates the centerline-validity mandate — see
memory project_centerline_validity_mandate); the safe kernels below were approved.

## Work items (land + verify separately, in order)

1. **Skip-scan pre-check (byte-identical).** `_selfClearScan` runs at full resolution on every
   emitted chain, but in-search prevention (QUAL-14 ancestor rejection) already guarantees >99 %
   of edges are clean simple open curves. Add a cheap conservative pre-check that proves "no two
   far-apart-in-arc-length points can be near in XZ" without the 4 m sampling walk — e.g. a
   coarse-sampled (~16-32 m) version of the same hash test, escalating to the full 4 m scan ONLY
   on a coarse hit (conservative: coarse spacing must be ≤ clearance so a real graze cannot slip
   between coarse samples — derive the bound, comment it). Full scan must still run whenever the
   pre-check cannot prove cleanliness. RESULTS MUST BE BYTE-IDENTICAL — the pre-check may only
   decide whether the expensive path runs, never what it returns.
2. **Refit span-skipping + refit-aware clearance (byte-identical where applicable).**
   (a) The κ box-filter / re-integration re-validates spans the Dubins shortcut never modified —
   skip re-validation for untouched spans (identical output, less work). (b) Make the shortcut's
   existing validation walk also test candidate spans against the REST of the chain (self-
   clearance), so refit can no longer introduce violations. NOTE: (b) may REJECT shortcuts that
   previously introduced grazes → routes can change on the rare affected edge → this sub-item is
   NOT byte-identical in general; measure how many edges change (expect ~zero: the backstop
   repair loop was already catching these) and if >0, it needs the cache regen + a note. If (b)
   proves clean it also strengthens the case for pre-check skips in (1).
3. **Segment-based coarse pass (corridor hint only).** The coarse pass's output never ships —
   replace its arc palette with straight segments (state = cell only, no heading bins) to cut its
   ~12 ms toward ~4 ms. Corridor hints change → fine routes may change where the corridor binds →
   bundled cache regen + landmark screenshots (same set as PERF-17: junction (224,−192),
   switchbacks, parallel) + escape-hatch rate re-measured (<5 %).
4. **Fine-lattice dial — ONLY if after 1-3 the combined cold load is still short of 3× vs the
   PRE-corridor baseline** (seeds 42/1337/9001 headless: 20.7/23.6/15.2 s; browser seed-42 ready
   6.6-6.9 s same-conditions). It is a global geometry-quality dial; needs regen + feel check.

## Hard requirements (inherited from PERF-17 — see that ticket for detail)
- Determinism / window-invariance; ROUTE SYNC canonical+mirror byte-identity per commit
  (route-worker-sync gate); solo/final symmetry; never weaken pond rejection, min-radius-by-
  construction, in-search self-clearance semantics, escape hatches, maxRoadGrade.
- Items 1 + 2a: prove byte-identity by running route-bundle-parity WITHOUT regenerating the
  bundle (green = routes unchanged), plus the invariance gates.
- GRAPH-REACHABILITY largest-component: record before/after (currently 70 % post-corridor;
  known-red BUG-35) — flag any further drop.

## Acceptance
- [ ] Per-edge floor measured before/after per item (profile-edges.mjs pattern).
- [ ] Items 1-2 byte-identical proof (parity green, no regen) or honest documentation of the
      (b) exceptions.
- [ ] Combined headless ≥3× vs pre-corridor baseline (target); browser seed-42 interleaved A/B
      (worktree on :8001 via python http.server — FINDINGS.md gotchas).
- [ ] npm run test:all green (known-red excepted); escape-hatch rate <5 % after item 3.
- [ ] Landmark screenshots for user review after item 3; FINDINGS.md addendum; ticket moved to
      completed/ with honest numbers (or left pending with a MISSED note, PERF-17 style).

---

## STATUS 2026-07-13: floor RE-MEASURED — ticket premise refuted; no net-win item found. PENDING.

Attacked the ~42 ms/edge floor per the work order. The headline result is a **corrected
measurement**: the floor is NOT "self-clearance backstop scan + refit" as the ticket assumed —
those are 0.05 ms and 0.7 ms/edge. The floor is the self-clearance **prevention + repair**
machinery, which the hard-requirements forbid weakening. None of items 1–4 yields a net speedup.

### Measured floor decomposition (seed 42, corridor-60 active, per-edge; perf-runs/profile-selfclear.mjs)

| component | ms/edge | notes |
|-----------|---------|-------|
| bare corridor-constrained search (no selfclear/refit) | 65.8 | the hybrid-A* itself |
| **+ in-search self-clear prevention (A)** | **+18.9** | QUAL-14 per-expansion ancestor walk; runs on EVERY edge |
| + refit (shortcut+box-filter+terminal+validate) (B) | +0.7 | cheap; its value is PREVENTING repairs, not its own cost |
| + post-emit `_selfClearScan` (C) | +0.05 | **item 1's entire target** |
| **+ self-clear repair re-searches** | **+20.3 (avg)** | ~20/143 edges "dirty"; each pays ≤16 full re-searches |
| = wrapper total | ~101–105 | matches PERF-17's 82–90 (thermal-dependent) |

The "42 ms floor" ≈ A(18.9) + repairs(20.3) + C(0.05) + B(0.7) ≈ 40 ms — **almost entirely the
self-clearance prevention (A) + repair loop, not scan/refit.**

### Item disposition

1. **Skip-scan pre-check — REJECTED (premise refuted).** `_selfClearScan` = **0.05 ms/edge**. A
   pre-check to skip it saves nothing and only adds a code path that could skip a needed scan (the
   brief's "missed self-intersection = shipped defect"). A speculative "search without prevention →
   scan → re-run with prevention only if dirty" reorder was considered — it would save the 18.9 ms
   (A) on clean edges — but is NOT rigorously byte-identical (the in-search prevention samples at
   half-primitive spacing with a midpoint test, the 4 m scan at a different resolution; 4 m-clean does
   not strictly imply prevention-clean), so per invariance > speed it was not shipped.
2. **Refit span-skip (2a) — REJECTED (premise refuted).** Refit = **0.7 ms/edge**; span-skipping
   saves a fraction of it. **Refit-aware clearance (2b) — ALREADY IMPLEMENTED:** the `scPick` guard
   (`road-carve.js` ~L1323) already ships the pre-refit chain whenever refit would *increase*
   self-clearance violations, so refit cannot introduce net-new grazes. Route-change count from "adding
   2b" = **0** (it is already there). No action.
3. **Segment coarse pass — IMPLEMENTED, MEASURED NET-REGRESSIVE, REVERTED.** Replaced the coarse
   pass's inherited 4-radius fine palette with a 2-member `[gentleR, hardR]` "segment" palette + fixed
   `hbins=8` (`CORRIDOR_COARSE_HBINS`). Coarse pass got **5.73 → 2.32 ms/edge** (deterministic, real).
   BUT the changed coarse route perturbs the corridor capsule → downstream fine-search + self-clear
   repair cost rises MORE than the coarse saving: interleaved seed-42 full-flow **OLD 100.6/100.8 vs
   NEW 104.4/104.5 ms/edge (~+4 ms, a slight regression)**. Character held (hairpin (224,−192) intact,
   perf-runs/perf18-junction.png; parity green after regen; escape ≤0.7 %) — but a route-changing
   change that does not speed up the total fails invariance>quality>**speed**. Reverted src + cache.
4. **Fine-lattice / heur dial — REJECTED (spent post-corridor).** `roadArcHeurWeight` 1.5→2.5:
   **102.4 → 101.9 ms/edge** (negligible). The corridor already bounds the search, so the A*
   heuristic-inflation lever (a PRE-corridor speedup) has almost nothing left to prune. Not a global
   geometry change worth making for ~0 %.

### Conclusion + real follow-on levers

**The ≥3× bar is unreachable without weakening the self-clearance safety machinery, which the hard
requirements forbid ("NEVER weaken in-search self-clearance").** The corridor already cut the search
~2×; the residual floor IS the prevention (A) + repair loop. The genuine levers, for a future ticket
scoped around them (NOT the scan/refit micro-ops this ticket assumed):
- **Cheapen the in-search ancestor walk (A, 18.9 ms, every edge):** it re-walks the full SP ancestor
  chain per expansion (O(depth)/expansion). A byte-identical incremental ancestor-proximity index
  could cut it, but is subtle (ancestor sets branch per state) and must stay window-invariant.
- **Cheapen the repair re-searches (20.3 ms, ~14 % dirty edges):** each dirty edge pays ≤16 full
  re-searches. Keeping the corridor during repairs (instead of dropping it after 3 iters) makes
  re-searches cheaper but risks wall-pinning (the CORRIDOR_SELFCLEAR_MAXIT trap) — needs its own
  character check.
- Corridor width is still character-bound at 60 m (PERF-17), so no help there.

No src change ships from PERF-18. GRAPH-REACHABILITY unchanged (no route change) — 70 % post-corridor
(known-red BUG-35). Bench/profile scripts: perf-runs/profile-selfclear.mjs, profile-split.mjs,
pcoarse.mjs, ab-quick.mjs, item4-heur.mjs.

### Post-revert note (2026-07-14): PERF-17 corridor REVERTED by user (road character at seed-6
spawn). The corridor-kept-repair lever above is moot; the incremental ancestor-proximity index
lever still applies to the bare router (the prevention walk + repair loop dominate there too).
Cold load stands at the pre-corridor baseline by choice.
