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
