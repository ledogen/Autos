# Phase 9: Road Surface - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the queryable road splines (Phase 8) into a **physical asphalt ribbon in the world**: a fixed-width
mesh swept along the splines, shaped with crown + curvature camber, carved into the terrain (cut-and-fill),
with a procedural worn-asphalt look and a 5-zone material system, feeding **height AND normal** into physics
so the truck rides the real surface. **Road intersections are IN SCOPE** (scoped in deliberately to keep
mesh-building clean — see D-12..D-16), built as merged at-grade paved junctions.

**In scope:** ribbon mesh (SURF-01), procedural asphalt + worn-quality markings (SURF-02), crown + camber
(SURF-03), physics height+normal (SURF-04), cut-and-fill terrain carve + shoulder blend (SURF-05), pothole
hook / stretch (SURF-06), **meshed road intersections (SURF-07, new)**, slope-based terrain material
(cliff vs level), and the BUG-08 window-invariant-spline fix (prerequisite for stable junctions).

**Out of scope:** grade-separated crossings (overpasses/bridges) — at-grade only; truck body/lights
(FEAT-04); dust trails (FEAT-03).
</domain>

<decisions>
## Implementation Decisions

### Asphalt appearance & worn-quality system
- **D-01:** Procedural dark-grey asphalt, **no asset files**. Lane markings vary by a seeded road-quality tier.
- **D-02:** Road quality varies in **~500 m stretches along each road**, each stretch's tier derived
  deterministically from the world seed + along-road position (reproducible, no flicker on re-stream),
  **blended at stretch boundaries** so markings don't snap. Tiers:
  - **High** — solid centerline + solid edge lines, fully opaque
  - **Mid** — solid centerline + **intermittent** edge lines, faded (less opaque)
  - **Low** — very translucent centerline only (no edge lines)
- **D-03:** SURF-06 pothole/crack severity is driven by the **same per-stretch `roadQuality` value** —
  high = smooth, low = frequent/deep. Carry a labeled `roadQuality` hook on the surface so the visual
  markings and the physical bumps come from one source. (Implement bumps if P9 lands under budget; the
  hook ships regardless.)

### Crown & camber
- **D-04:** **Subtle / realistic** — banking ~2–6° proportional to curve tightness + a small
  water-shedding centerline crown, expressed as **real surface geometry/normal** (felt through suspension,
  verified on the surface itself, NOT via body-roll). Expose **camber-strength + crown-height debug
  sliders**; realistic values are the defaults.

### Terrain carve — cut-and-fill
- **D-05:** **Cut-and-fill via ONE signed cross-section**: `delta = roadDesignGrade − groundHeight` at each
  point across road+shoulder. `delta > 0` ⇒ **fill** (raised dirt embankment); `delta < 0` ⇒ **cut** (notch
  into high ground). Yields cut faces on steep/switchback ground and a raised dirt foundation on rolling
  ground automatically; on a hillside it's a bench cut (uphill cuts, downhill fills) in one cross-section.
- **D-06:** Requires a **smoothed road "design grade"** (a vertical profile smoother than raw terrain) —
  this is what creates cut vs fill in the first place. Smoothing amount is a research/tuning item.
- **D-07:** Raised height on rolling ground defaults to a **low ~1–2 m causeway**; expose **fill-height +
  dirt-slope-angle debug sliders**.
- **D-08:** Cut side uses a steeper (rock-ish) slope; fill side uses a gentler dirt slope. Continuous by
  construction (cut/fill depth → 0 at the crossover ⇒ seamless transition). Honors the carve-continuity
  gate: **steep-but-continuous faces are allowed; only degenerate vertical seams are disallowed.**

### Surface materials — 5 zones, feathered blends
- **D-09:** Five procedural material zones, **feathered/blended at every boundary** (no hard lines), from
  two drivers:
  - *Carve sign (roads):* **asphalt** (road ribbon) · **engineered cutout** (cut faces, `delta<0`) ·
    **dirt foundation** (fill slopes, `delta>0`)
  - *Terrain slope (independent of roads):* **natural cliff** (steep natural ground) · **general terrain**
    (mostly-level, existing look)
- **D-10:** Engineered road **cutout ≠ natural cliff** — cutout reads man-made/uniform, cliff reads
  wild/weathered, even though both are rocky.
- **D-11:** Slope-based terrain shading (cliff vs level) is kept in P9 but is **splittable** to a small
  terrain-appearance follow-up if P9 grows too large.

### Road intersections (scoped in — folds FEAT-05)
- **D-12:** Intersections are built **from the start** (junction-aware mesh ⇒ cleaner than retrofitting):
  **merged paved footprint, at-grade only**, asphalt material with markings broken through the box.
- **D-13:** Construction approach (intended direction): detect crossings (pairwise XZ segment intersection
  over `this._network` → shared node); gather the **legs** leaving the node; connect each adjacent pair of
  legs' **outer edges with tangent fillet arcs** → a closed **footprint polygon**; **fill** it as paved
  surface (triangulate); **trim** each leg ribbon back to the footprint; apply the **same signed carve** to
  embed the box in terrain ("project downward"). **Crown is flattened** inside the box (drivable all ways).
- **D-14:** At-grade ⇒ both roads reconcile to **one shared node elevation**; each road's design grade
  **blends to that elevation approaching the node**.
- **D-15:** The **merged-footprint junction algorithm is the PRIMARY RESEARCH TARGET** for plan-phase —
  fillet math at arbitrary/acute crossing angles, footprint triangulation, shared-elevation reconciliation,
  leg trimming, determinism + window-stability. Drop to a `/gsd-spike` only if research finds it too gnarly.

### Stability (folds BUG-08)
- **D-16:** **BUG-08 window-invariant splines** are folded in — junctions and the ribbon mesh require
  stable geometry so they don't pop/rebuild while driving. Splines (and derived junctions) must be a pure
  function of `(seed, world coords, params)`, NOT of the streaming window/history.

### Carried-forward (LOCKED — not re-discussed; treat as hard constraints)
- Single `height(x,z)` / `analyticHeight` shared by mesh + physics.
- Carve via `chunk.carveWeights` Float32Array — **never baked into `chunk.heights`** (post-read blend).
- Carve applied **identically** in the Worker mesh build and the physics sampler.
- Road router stays on pure `coarseHeight` — do NOT modify routing.
- No asset files, no new dependencies, Worker-safe height fn, `queryContacts` stays cheap (60 fps).

### Claude's Discretion
Exact magnitudes behind sliders (raise height, camber/crown, shoulder/blend widths, design-grade smoothing,
fillet radii) — pick realistic defaults and expose debug sliders to tune live on Pages.

### Folded Todos
- **FEAT-05** (`feat-road-intersections.md`) — road intersections/junctions. Folded into P9 scope (D-12..D-15)
  so the mesh is junction-aware from the start.
- **BUG-08** (`bug-road-restream-pop.md`) — roads re-shape as you fly (window-variant geometry). Folded in
  (D-16) because stable junctions/mesh require window-invariant splines.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope, requirements, locked decisions
- `.planning/ROADMAP.md` (Phase 9: Road Surface) — goal, success criteria, exit gates (height-agreement,
  carve-continuity), UI hint.
- `.planning/REQUIREMENTS.md` — SURF-01..06 + **SURF-07 (meshed junctions, added this phase)** traceability.
- `.planning/PROJECT.md` (Key Decisions / Constraints) — locked carve decisions: `chunk.carveWeights`
  post-read blend never baked into `chunk.heights`; single `height(x,z)` for mesh + physics; cut-bias;
  router uses pure `coarseHeight`.

### Folded todos (intent + prior analysis)
- `.planning/todos/pending/feat-road-intersections.md` (FEAT-05) — junction intent, current crossing behavior.
- `.planning/todos/pending/bug-road-restream-pop.md` (BUG-08) — window-variance root cause + fix directions.

### Code integration points
- `src/terrain.js` — `analyticHeight` / `analyticNormal` (physics height+normal source), `sampleHeight`
  (height-agreement test path), `_flushPendingQueue` (main-thread chunk build), Worker `height()` (mesh
  build). Carve must hook BOTH the Worker mesh build and `analyticHeight`/`sampleHeight` identically.
- `src/road.js` — `queryNearest` / `ensureTile` / `this._tiles` (spline consumption — commented "Phase 9
  consumption"); `_streamNetwork` (window-invariance target for BUG-08); `this._network` (junction detection).
- `src/debug.js` — Roads folder slider pattern (model for new camber/crown/raise-height/shoulder sliders).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `road.js` `queryNearest(x,z)→{point,tangent}`, `ensureTile`, `this._tiles` per-tile splines — the ribbon
  sweep + junction detection consume these (already built for "Phase 9 consumption").
- `terrain.js` `analyticHeight` / `analyticNormal` — the physics height + normal source the carve feeds.
- `data/ranger.js` D-09 road params + `debug.js` Roads folder — established live-tunable-param pattern to
  follow for new surface/carve sliders.

### Established Patterns
- `chunk.carveWeights` Float32Array post-read blend (never baked into `chunk.heights`) — the anti-drift
  carve discipline; new carve must follow it.
- Single pure `height(x,z)` shared by Worker mesh + physics sampler.
- Determinism: every generator is a pure function of `(seed, world coords, params)` — applies to the new
  design grade, carve, materials, road-quality tiers, AND junctions (D-16).

### Integration Points
- New road-ribbon mesh consuming `road.js` splines; new carve hooking terrain Worker `height()` +
  `analyticHeight`/`sampleHeight`; junction detection over `this._network`; new debug sliders in the Roads
  folder.
</code_context>

<specifics>
## Specific Ideas

- Worn-world aesthetic: roads visibly degrade in long (~500 m) stretches — "good highway" vs "broken
  backroad" — with markings fading/dropping out and potholes tied to the same quality.
- "Better view while driving": rolling-ground roads sit raised on a graded dirt foundation.
- Cut-and-fill realism with a built-vs-wild material distinction (engineered cutout ≠ natural cliff).
- Intersection construction (user's sketch, D-13): tangent-fillet the road edges into a closed footprint,
  fill as road surface, project down via the carve.
</specifics>

<deferred>
## Deferred Ideas

- **Grade-separated crossings** (overpasses / bridges / underpasses) — at-grade only this phase; vertical
  separation is a future capability.

### Reviewed Todos (not folded)
- **FEAT-04** (`feat-truck-body-and-brake-reverse-lights.md`) — truck body + swappable styles + lights.
  Reviewed; not folded — it's vehicle-visual, independent of road surface.
- **FEAT-03** (`feat-dust-trails.md`) — dust trails. Reviewed; not folded — separate effect, not road surface.
- **BUG-06** (`bug-chase-cam-jitter.md`) — chase-cam jitter. Unrelated to road surface.
</deferred>

---

## Gap-Closure Context: Valid-by-Construction Centerline (added 2026-06-16)

**Gathered:** 2026-06-16
**Why:** BUG-12 (ribbon folds at sharp corners) is NOT a surface bug — the routed centerline
itself creases to ~1 m radius (near right-angle) at junctions and in the vertical plane.
Root cause: the generate-then-clean pipeline (A* soft turn-penalty → Catmull-Rom spline →
post-hoc `filletMinRadius`, which pins run endpoints so creases survive at junctions, and is
XZ-only). Mandate (QUAL-03): enforce curvature validity DURING generation so a crease can
never form, instead of cleaning up bad output.

<domain>
Make the routed road CENTERLINE valid-by-construction in the XZ plane: every corner ≥ min
turn radius as the spline is DRAWN, across segment AND run boundaries — so a ±halfWidth ribbon
can never fold. This deliberately REOPENS the Phase-8 router within P9 (the original P9 locked
"do not modify routing"; this gap-closure overrides that for the generation algorithm ONLY,
while preserving determinism / pure-`coarseHeight` / window-invariance — D-16).
</domain>

<decisions>
### Constraint model
- **VBC-01:** XZ (horizontal) min-radius is the **HARD** constraint — enforced during generation
  so the centerline never creases. **Radius is prioritized OVER grade**: it is OK for radius
  conformity to **violate max-grade** (a too-steep road is driveable; a folded corner is not).
  (Locks the session's "fail grade before radius" as: radius hard, grade soft.)
- **VBC-02:** **NO vertical / 3D radius constraint** — only XZ radius is enforced. The current
  vertical profile / valley-exit character is "working well enough"; do NOT change it.
- **VBC-03:** **Grade-change-rate is a SEPARATE tunable parameter** (soft smoothness knob for
  crests/dips), NOT a hard solve constraint and NOT coupled to the radius solve.
- **VBC-04:** Do NOT pursue "start the incline earlier / land-bridge" for valley exits — user
  finds it jarring/unrealistic and likes the current character.

### Generation approach
- **VBC-05:** Enforce min-radius at the ROAD-BUILDING / GENERATION stage, not via post-hoc
  spline-cleaning passes (the pattern that just bit us). The exact mechanism (heading-aware
  curvature-constrained search vs arc-spline draw vs other) is a RESEARCH/PLANNER target — not
  locked here.
- **VBC-06:** Constraint applies **PER-ROAD only**. Do NOT add extra curvature constraints on a
  road merely because it is NEAR another road — that would over-constrain an already-tight solve.

### Corrective passes
- **VBC-07:** Keep `_removeLoops` / `_removeSelfCrossings` / `_filletMinRadius` as a safety net
  when the new generator lands; delete them in a FOLLOW-UP once crease-free is confirmed in-sim
  across varied seeds. (Do not delete in the same change.)

### Junctions (intended direction — see scope split)
- **VBC-08:** Handle intersections at the BUILD stage as TWO cases, not via spline cleanup:
  (a) **Near-parallel** approaches → COMBINE into a single road (with a solvable min approach
  angle), then RE-DIVERGE to complete a 4-way crossing.
  (b) **Orthogonal-ish** approaches → mesh-blend with the min-radius fillet rules (inner-angle
  fillets) — the existing 09-04 merge direction.
- **VBC-09:** (stretch / vision) Tie road STARTS/ENDS to other roads to reduce random dead-ends
  → requires 3-way (T) intersection handling.

### Scope of THIS gap-closure (locked: "generation-only, crease-free")
- **Deliver:** XZ-curvature-valid open-road centerline by construction — kills the open-road
  crease class of BUG-12.
- The broader QUAL-03 road.js shrink + valley-exit-search isolation is a LATER milestone.
- The junction REDESIGN (VBC-08 parallel-merge, VBC-09 tie-ends + 3-way) is a SEPARATE, larger
  effort — likely its own plan(s)/follow-up. **Open question for planning:** does the immediate
  junction crease (screenshot) close from clean per-road legs + the existing merge, or does it
  need a build-stage junction tweak now? Researcher/planner to determine.
</decisions>

<canonical_refs>
- `.planning/todos/pending/qual-road-system-simplify.md` (QUAL-03) — guiding philosophy
  (valid-by-construction centerline, swept cross-section, line-count reduction). MUST read.
- `src/road.js` — `_streamNetwork` (generation), `_protoConnect`/`_protoAnchor` (A* router:
  8-dir grid, soft turn PENALTY only — the thing to make a hard curvature constraint),
  `filletMinRadius` call site, `_removeLoops`/`_removeSelfCrossings` (corrective passes to
  retire per VBC-07), `_assignSlice` (per-tile CR spline the ribbon sweeps), `_detectJunctions`
  (09-04 merge).
- `src/road-carve.js` — `filletMinRadius` (pure XZ-only, endpoint-pinned curvature-relax — the
  post-hoc pass being superseded).
- `src/road-mesh.js` — `sweepRibbon` (the ±halfWidth sweep that folds on sub-radius corners).
- Memory `project_centerline_validity_mandate` — the mandate + screenshot evidence.
</canonical_refs>

<deferred>
- **QUAL-03 full road.js shrink** + isolate the valley-exit/switchback search into one bounded
  module — later milestone (not this effort).
- **Junction redesign** — near-parallel road merge+re-diverge (VBC-08a), tie road ends to other
  roads + 3-way/T handling (VBC-09) — larger follow-up; not the open-road crease fix.
- **Vertical / 3D radius constraint** — explicitly NOT wanted (VBC-02).
</deferred>

---

*Phase: 9-road-surface*
*Context gathered: 2026-06-11 (surface); 2026-06-16 (valid-by-construction centerline gap-closure)*
