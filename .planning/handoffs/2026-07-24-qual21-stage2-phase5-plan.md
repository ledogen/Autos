# QUAL-21 Stage 2 Phase 5 — junction rework + PERF-25 + connector deletion (EXECUTION HANDOFF)

Handoff 2026-07-24. All work on `feature/qual-21` (worktree `CarGame-qual-21`, Vite on :3671).
Read the ticket's "Stage 2 Phases 2+4 IMPLEMENTED" section + this doc before touching code.

## State entering Phase 5 (all committed, all gates green both flag states)

- Phase 0 `6daabd0`: cull-on-coarse DISPROVEN (entry checkpoint failed; user approved skipping
  Phase 1). Measurement harness: `test/stage2-crossing-agreement.mjs`.
- Phase 2 `1da347f`: degree pass settles SPEC-TIME via the canonical `_degreeDropSet`
  (assembly + 3 warm paths + cull ring + `_nodeThroughPairs` all share it); the Stage-1
  `_degreeCulledNbrsAt` simulation is deleted. Doomed edges never route (162→153, 11.8→11.2 s).
- Phase 4 `c7fbe38`: `_spliceOrphanedPairs` — post-cull analytic Dubins terminal splices at
  cull-orphaned deg-2 nodes (descending-rho 80/50/30/hardR + 2×-cut retry; weld reads
  `spliceLeaveA/B`; `_proto.cls` never touched; `dubinsPrimitives` re-exported OUTSIDE the ROUTE
  SYNC region). Census kink max 75°→13.2°, 11/14 under the 9° connector admission.
  **USER A/B PASSED (2026-07-24, 6-node screenshot pairs): "they all look totally fine."**
- PERF-25 harness `ac2904e`: `test/perf25-pad-jitter.mjs` — parked-on-pad EXACT 68 / JITTER 142 /
  off-pad 13 µs/frame ⇒ **10.8× (exit bar: ≤1.5×)**. Jitter height deltas sub-mm.
- `__roadParam` CDP handle `4c6aa14` (?prof=1) + `ab-shots.tmp.mjs` pattern for headless A/B
  screenshots (untracked scratch; recreate as needed).

## Phase 5 goal (the original Stage 2 payload)

Collapse the junction machinery to TWO canonical shapes with rotated-arrival support, make the
junction surface cheap per physics sample under jitter (PERF-25), then delete the deg-2
connector subsystem and flip deg-3/4 pairing on.

## Survey pointers (road.js, line numbers at handoff time)

- `_detectNodeJunctions` (~4325): builds per-node records {pos, legs, plane, deg2 arc,
  ringMaxR}; cached per `_networkRev`; `_deg2ArcTiles` tile index for the resolver.
- `_junctionRingWeld` (~4471) + `_cornerJoin`: the FILLET LADDER (exact-weld fillets →
  shrunk fillets → legacy circle pad), rung-verified by `_ringSelfIntersects`.
- Physics sample path `_sampleCarveWorld` (~3990–4070): `_carveCrossSection` (per-run resolve +
  crown/camber + `_junctionCarve` ease) merged with `_connectorCarve` and
  `_junctionPadCarve(memo=true)` (the 5-pt neighbourhood-MIN — PERF-24/25 hot spot), then the
  on-ribbon / on-pad asphalt overlays (PAD_EDGE_FEATHER rim handoff).
- `_carveDirtY` (~4142): ruled inter-leg grade blend (exponential gap weighting) — the
  crease-fix that makes every pad sample touch MULTIPLE leg resolves.
- Deg-2 connector subsystem (deletion target, ~490 lines): `_buildDeg2ArcGeom`,
  `_buildDeg2Ribbon`, `_connectorCarve`, `_deg2ArcTiles` + the resolve path branch +
  `roadJunctionKinkDeg` admission.

## Design direction (NOT locked — design first, propose to user if it deviates)

- **Per-node cached surface**: at `_detectNodeJunctions` time, bake per node everything a
  sample needs (pad plane, leg cross-section frames at the ring, fillet ring polyline, blend
  weights) so `_junctionPadCarve`+ruled-blend collapse to one cached-table evaluation per
  sample. The PERF-24 lesson is a HARD constraint: never quantize the QUERY — cache the
  EXPENSIVE INTERMEDIATE keyed per (node, run), evaluate exactly at (wx,wz).
- **Two canonical shapes**: deg-3 = through-stroke + T-branch; deg-4 = through × through.
  Rotated arrivals: legs arrive at PRESCRIBED/SPLICED headings (read `_edgeLeaveHeading` +
  `spliceLeaveA/B`), so pads must weld to ACTUAL arrival cross-sections — the Stage-1 scope-cut
  evidence (1.67 m lateral step at a cleanly-paired deg-4) is the regression to design against.
- **Connector deletion criterion**: census `stroke-spike.mjs §4` shows 3 residual over-9°
  readings that are CHORD-PROXY overshoot (true tangent kink ≈0 — router hardR terminal arcs).
  Either move the admission to true tangents (then connector catches 0 → delete) or keep the
  elbow-pad fallback for 2-leg clusters only. Do not delete while any real kink still needs it.
- **deg-3/4 pairing flip LAST** (Phase 2 scope note): only after rotated-arrival pads are in
  and gated (shoulder-lateral-continuity is the tripwire — it caught the Stage-1 tear).

## Exit criteria (merge gate — user: "not broken and more performant")

1. `test/perf25-pad-jitter.mjs`: jitter-on-pad ≤ 1.5× off-pad; surface within float noise
   (no 0.7 m shifts); replay capture 1784909578369 green; bounded per-node cache.
2. `npm run test:all` green flag-off, route data byte-identical to main's bundle.
3. Flag-on: 9-gate road matrix + graph-cull-radius-invariance green; census ≈100% under
   admission (post-true-tangent fix); seed-6 bank marginal re-checked.
4. Cold build ≤ 11.2 s Phase-2 number (junction rework must not regress it).
5. User drive sign-off; default-on decision as its OWN step (bundle regen + gate re-baselines).

## Commit boundaries

(5a-1) per-node cached pad surface + PERF-25 green, geometry unchanged ·
(5a-2) two canonical shapes + rotated arrivals, gates green ·
(5b-1) admission on true tangents + connector deletion (census-driven) ·
(5b-2) deg-3/4 pairing flip + full matrix. Each leaves both flag states green.
