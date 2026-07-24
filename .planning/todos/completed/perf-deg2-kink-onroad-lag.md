---
id: PERF-24
type: perf
status: resolved
opened: 2026-07-23
resolved: 2026-07-23
severity: major
source: user-observation (post-junction-merge re-drive) + test/replay.mjs characterization
relates: [QUAL-16 (deg-2 kink connector), FEAT-40/junction merge (triple-overlay carve), PERF-08 (profiling harness)]
capture: "Logs/rangersim-capture-1784869575819.json (Downloads original; Logs/ is gitignored — capture
  kept locally). seed 1402567980 'quotient', mark (582.6, -233.5)."
note: "Severe frame lag when the car SITS ON a specific tight deg-2 kink corner. replay.mjs pins it to
  a sub-design-min kink: local centerline radius 11.1 m = 74% of the 15 m design min (hard floor 10 m),
  runKey g:1,-2,2:0,-1,1, arcS 2214.8. The tight kink is exactly where the deg-2 connector + pad-fallback
  + carve-resolve machinery is heaviest per physics sample, so the on-road carve query cost spikes."
---

# PERF-24: Severe on-road lag at a tight deg-2 kink corner

## RESOLUTION (2026-07-23)

**Root cause (measured, not guessed).** A headless micro-benchmark at the captured mark (build the real
road from seed+params, replay the physics contact pattern `carveHint + 5× _sampleCarveWorld` = the
`analyticNormal` shape) pinned the cost precisely:

- One wheel-contact at the kink = **273 µs** vs **3 µs** on a plain ribbon 40 m back — **~90×**.
- Of a single `_sampleCarveWorld` (52.7 µs), **`_junctionPadCarve` was 50.4 µs — essentially ALL of it.**
- `_junctionPadCarve` does a **5-point neighbourhood-MIN**, each point a full `sampleRoadTopY` whose cost
  is dominated by a fresh **`_resolveRoadSurface` (7.4 µs — abnormally high here because the tight node
  packs many overlapping run slices into the 3×3 tile block)**. So one pad carve = 5 resolves, and the
  pad carve runs on all 5 samples of a wheel-normal → **~25 fresh resolves per wheel-contact.** The
  `carveHint` memo only collapsed the *centre* resolve, never these.

**Fix (cost-only, surface byte-identical).** Added `_resolveRoadSurfaceMemo` — an **EXACT-position**
(NOT quantized), rev-keyed, size-bounded resolve memo alongside `carveHint`, and route the pad
neighbourhood-min through it on the physics path (`_junctionPadCarve(..., memo=true)` from
`_sampleCarveWorld`; the terrain mesh `_buildCarveTable` passes no memo → exact, untouched). Exact keys
make every hit identical to a fresh resolve — the neighbourhood-min's crease-duck at a Voronoi knife-edge
is never shifted. The hits come from the ±0.5 m neighbourhood offsets coinciding IEEE-exactly with the
`analyticNormal` ±0.5 m offsets across a wheel-contact's 25 calls (0.5 is a power of two), plus
exact-repeat dwelling samples across the death-spiral's catch-up substeps.

> A first attempt reused `carveHint` (0.05 m-quantized) for the neighbourhood samples — REJECTED: at a
> degenerate-node Voronoi knife-edge the quantization defeated the crease-duck and shifted the physics
> surface by **0.7 m**. Exact keying was required. (The neighbourhood-min is a MESH-interpolation fix, so
> physics arguably doesn't need it at all — but removing it changes the drivable surface, out of scope
> for a cost-only ticket.)

**Result (patched vs original, same benchmark):**
- **WARM** (dwelling on the corner — the actual symptom / death-spiral regime): **273 → 83 µs (3.3×)**.
- **COLD** (fast-driving, no cross-substep reuse — pessimistic bound): **277 → 188 µs (1.47×)**.
- Surface: a 6936-point grid dump of full `_sampleCarveWorld` gradeY diffed **0.0000 mm** vs the stashed
  original (byte-identical). `npm test` (25 affected road/terrain/carve gates incl. road-smoothness,
  shoulder-lateral-continuity, carve-mesh-smoothness, window-invariance) all green.

**Remaining:** in-game 60 fps confirmation on the Mac Air is the user's to eyeball (headless proves the
on-kink carve cost dropped 3.3× and the surface is unchanged; the actual fps depends on the rest of the
frame). If still short, the next lever is `_resolveRoadSurface`'s own 7.4 µs at dense nodes (helps
centre + neighbourhood + mesh, bigger change). Router-side: the 11.1 m kink is below the 15 m design min
— tightening generation would also cap the worst case (tracked separately; the perf path is cheap now
regardless).

---


## Observed

While driving on one particular deg-2 (kink) corner the frame rate tanks badly — the lag is tied to
the car being **on** that corner (leaves when the car leaves). Reproduced from a place-capture at
mark **(582.6, −233.5)**, seed **"quotient"** (1402567980). Screenshot: the pinch/kink where the
road bends hard around the pad. (image #15 in the 2026-07-23 re-drive.)

## Characterization (test/replay.mjs)

`node test/replay.mjs Logs/rangersim-capture-1784869575819.json`:

- runKey `g:1,-2,2:0,-1,1`, arcS 2214.8, camber 0.209.
- **FOLD METRIC: local centerline turn radius = 11.1 m — 74% of design min (15 m), just above the
  10 m hard floor → flagged KINK "tighter than the router should emit."**
- Surface window-invariance passes (173 on-road pts, gradeΔ 0.000 m) — so this is NOT a geometry tear;
  the surface is stable. The cost is in how much WORK each on-road carve/resolve query does here.
- Secondary observation (may be unrelated / capture-timing): replay gradeY 105.39 vs game 111.50 — a
  ~6 m reproduction mismatch at the mark while hit/runKey/arcS/camber/minRadius all match. Worth a
  glance when investigating (could be a live-vs-headless profile difference), but the lag is the
  headline.

## Hypothesis

The physics per-frame contact sampling calls `_sampleCarveWorld` several times per wheel per step.
On a tight deg-2 kink that path now runs the full triple-overlay compose (bore resolve → blended run
cross-section incl. the QUAL-10 pad-plane inter-leg RULED blend over every near-node leg via
`_projectLegNearNode` → deg-2 connector `_connectorCarve` projection onto the arc → `_mergeCarve`
pad merge). Near a sub-design-min kink the connector arc is short/tight and the pad ring + ruled-leg
enumeration is at its most expensive, so the cost multiplies right where the car dwells. Likely
levers: cache/memoize the per-position resolve within a frame, cheapen `_projectLegNearNode`
enumeration, or quick-reject the connector/pad work when the query is clearly on the plain ribbon.

## Acceptance

- Driving on the captured corner holds the 60 fps target (no visible frame lag) on the mid-range
  laptop baseline.
- The fix is a COST reduction only — surface geometry unchanged: `road-smoothness`,
  `shoulder-lateral-continuity`, `carve-mesh-smoothness`, and the window-invariance in this capture
  stay green (mesh == collision preserved).
- Profile the hot path with the PERF-08 harness (`?prof=1` / trace-report) before and after to show
  the `_sampleCarveWorld` on-kink cost dropping.

## Notes / leads

- Triple-overlay carve composition + the `_projectLegNearNode` array (every local-min limb blended)
  are documented in memory `project_junction_fillet_merge_pending`.
- PERF-08 profiling harness: memory `project_perf08_harness_findings`.
- Possible dupe-lever with the tight-kink itself: the router emitted an 11.1 m kink below the 15 m
  design min — if that's avoidable at generation time it also reduces the worst-case here (but the
  perf path should be cheap regardless; don't block PERF-24 on router tuning).
