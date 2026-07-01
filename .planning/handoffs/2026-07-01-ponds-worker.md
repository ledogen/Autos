# HANDOFF → ponds worker (FEAT-22 foundation + FEAT-17 ponds)

**From:** lead session (2026-07-01)
**Tickets:** FEAT-22 — `feat-water-placement-foundation.md` · FEAT-17 — `feat-water-ponds.md`
**Read first:** `2026-07-01-COORDINATION.md`, then both tickets (they were freshly SCOPED 2026-07-01 —
the "SCOPING DECISIONS" blocks are locked; don't re-litigate them), then memory
`project_water_features_scope.md`.

---

## TL;DR

You own **two tickets, in this order**: build **FEAT-22** (the deterministic water-placement
foundation — basins, flow traces, saddles) as `src/water.js`, then build **FEAT-17** (ponds) on top of
it. FEAT-22 is *shared* — the streams worker (FEAT-18) consumes its flow-trace + saddle half. You build
FEAT-22 because you need the **basin index** first; coordinate the API surface with the streams worker
before they start (see §4).

The enabling fact (why this is tractable): `terrain.analyticHeight(wx,wz)` is a **pure analytic function**
of `(seed,x,z,params)` with **no chunk lookup** — samplable anywhere, streamed or not. So water detection
over a **bounded region** is computable + window-invariant by construction (the same discipline the road
router uses when it valley-seeks). Water is **not** limited to loaded chunks.

---

## §1 — FEAT-22 foundation (build first): `src/water.js`

Four things, all pure fns over `analyticHeight` / `analyticNormal`, keyed to macro-cells (bounded rings,
never an unbounded flood):

1. **Basin index (pond sites)** — sample analytic height on a bounded coarse grid (~30–50 m spacing,
   mirror the router's valley-seeking), find local minima (below all 8 neighbours), refine with a few
   gradient-descent steps. A minimum qualifies **only if it has a closed basin within a bounded ring**
   (rim above a threshold on all sides). **The closure threshold IS the rarity dial** — no random roll.
2. **Flow trace (for streams)** — gradient descent from a source: step along −∇height (central
   differences, already in `analyticNormal`) until a local minimum. A trace **always** ends at a basin →
   "streams end at ponds" falls out for free; don't add confluence logic.
3. **Saddle detection (stream sources / spill points)** — critical point where ∇height≈0 and the 2×2
   Hessian (second differences) has **mixed-sign eigenvalues**. A saddle is the uphill basin's spill point
   AND the downhill stream's source — the generator that couples the whole system.
4. **Generic `submerged` CG hook** — a water-plane-vs-CG test any water feature reuses. CG world Y =
   `vehicleState.position.y + cgHeight`. Hook: *CG-XZ inside a water footprint AND cgWorldY < waterY →
   set `vehicleState.submerged = true` + `submergedDepth`*. v1 SETS the flag only (buoyancy/hydrolock
   later). **Add `submerged`/`submergedDepth` to vehicleState in all THREE places** —
   see memory `project_vehiclestate_three_places` (`vehicle.js` SPAWN_STATE + `main.js` literal +
   `main.js` reset).

**Window-invariance is non-negotiable:** every basin/saddle/flow decision is a pure fn of a *bounded
neighbourhood* keyed to a macro-cell — NOT an unbounded flood over the loaded window. Extend the
`invariance` / `restream-invariance` gates: a basin/stream/saddle must resolve identically regardless of
stream center or draw distance, and must not pop. **Add a `water-invariance` + basin-determinism gate to
`test/run-all.mjs`.**

**FEAT-22 acceptance:** deterministic basin index + flow-trace API + saddle list, identical for a given
(seed, region, params) from any stream center; `submerged` flag exists + flips correctly; new gate green;
`npm test` green.

## §2 — FEAT-17 ponds (build second, on the foundation)

Locked scope (from the ticket's SCOPING DECISIONS — do not deviate):
- **Detection = FEAT-22 basin index.** Rarity = the closure threshold, not a dice roll.
- **Fill = Plan B (rim-heuristic), NOT true watershed.** Fill to a fixed depth below the local minimum's
  surrounding rim; skip true spill-saddle fill. Trivially window-invariant + cheap. (Accepts a small
  basin-mismatch risk — fine at pond scale.)
- **PONDS, not lakes — small.** Footprint capped ~100 m (`pondMaxRadius` ≈ 50 m). Rare.
- **Visuals = a SIMPLE shader.** Procedural (no-asset): a clipped flat plane, simple water material
  (transparency + light normal/tint, optional `src/sky.js` tie-in later). Don't over-build the first cut.
- **Submerged hook wired HERE** — ponds are the first place you drive into water. Consume FEAT-22's
  `submerged` test against the pond plane. v1 sets the flag only.
- **Roads route AROUND pond + skirt** (contrast streams, which are bridged). A tunable `pondSkirtWidth`
  ring excludes road gen and is handed to FEAT-06 scatter as vegetated shoreline ground.

**Road route-around integration (the one road.js touch):** the router must reject/penalize edges entering
the pond+skirt disc. Decide at planning: drop anchors inside the footprint, OR add a routing
hard-exclusion / cost zone. **Routing runs in TWO places** — the main-thread synchronous fallback AND the
Worker pre-warm (`arcPrimitiveConnect`, ROUTE SYNC region). ⚠️ **After the router worker (QUAL-08) lands,
the ROUTE SYNC region lives in `src/road-worker.js`, NOT `src/terrain.js`.** Keep the pond exclusion
window-invariant + identical on both paths (a pure fn of seed+coords the router can evaluate anywhere —
same shape as valley-seeking). Simplest window-invariant option: make the pond footprint a pure fn the
router queries (like `queryNearest`) and skip/penalize any anchor or arc sample inside it.

**FEAT-17 acceptance:** ponds fill valley bottoms, each contained by its rim (no overflow/floating water),
different ponds at different heights; roads route cleanly AROUND every pond (no road in pond or skirt);
vegetated skirt via FEAT-06 scatter; deterministic + window-invariant; tunable frequency / min basin size
/ fill level / `pondSkirtWidth` (debug sliders, USER-OWNED param set — reserve values for the user);
`npm test` green (carve, smoothness, road-band coverage, route-worker-sync).

## §3 — Files

- **NEW `src/water.js`** — FEAT-22 detection (basins/flow/saddles) + FEAT-17 pond records + `submerged`
  test. Pure over `analyticHeight`/`analyticNormal`; imports nothing from road (keep it a leaf).
- **NEW** pond render (clipped plane + simple water material) — a small `src/water-render.js` or fold into
  `water.js`; keep render decoupled from detection.
- **EDIT `src/road.js`** — the route-around hook (pond disc + skirt exclusion) in the anchor/route path.
  Small + independent of the router's dispatcher region (L1145–1240) and QUAL-10's node-junction region
  (L2740–2980). Serialize road.js commits per COORDINATION.
- **EDIT `src/vehicle.js` + `src/main.js`** — `submerged`/`submergedDepth` vehicleState (3 places) +
  system wiring (instantiate, per-frame `submerged` test, seed-reset rebuild).
- **EDIT `data/ranger.js`** — basin-closure threshold, min basin size, coarse-grid spacing, `pondMaxRadius`,
  fill depth, `pondSkirtWidth`. Own commented block; don't reorder existing keys. **USER-OWNED values.**
- **`test/`** — water-invariance + basin-determinism gates; register in `run-all.mjs`.

## §4 — Coordination (critical)

- **FEAT-22 is shared with the streams worker.** They consume the **flow trace** (gradient descent from a
  saddle) + **saddle list**. Agree the `src/water.js` public API with them **before either of you writes
  much** — at minimum: `basinsNear(region) → [{center, waterY, radius}]`, `saddlesNear(region) →
  [{pos}]`, `traceFlow(source) → polyline ending at a basin`, `submergedAt(cgX, cgY, cgZ) → {submerged,
  depth}`. You build + own `water.js`; they import it. **Streams depends on FEAT-22 existing → land FEAT-22
  before streams starts.**
- **Streams terminate at ponds for free** — because `traceFlow` ends at a basin (a pond). Don't build
  confluence/hydrology; it's a property of the trace.
- **Router (QUAL-08) ordering:** the pond route-around edits `road.js` routing; the router worker moves
  the ROUTE SYNC region from `terrain.js` to `road-worker.js`. Land after the router split so your
  exclusion sits on the final routing shape, OR coordinate so the exclusion is a pure fn the router calls
  (insulated from where the router code physically lives).
- **Skirt → FEAT-06 scatter:** the prop system takes injected samplers (`roadBlocked` etc., see the
  FEAT-06 merge handoff). Add a `pondSkirt(x,z)` sampler the scatter prefers — coordinate the sampler
  signature with whoever owns the prop wiring in `main.js`.

## §5 — Watch-outs

- Do NOT introduce a **carve** for ponds unless the bed genuinely needs a gentle bowl (ticket leans
  render-only surface). If you do carve, it's CARVE SYNC discipline (canonical `road-carve.js` /
  `seed.js`, mirrored into `WORKER_SOURCE`) — and see COORDINATION (the router is editing that string).
- Keep `water.js` a **leaf** (no road/terrain-system imports; take `analyticHeight` as an injected fn like
  the prop scatter does) so it stays headless-testable.
- `pondMaxRadius ≈ 50 m` — resist scope creep to lakes. Rare + small is the locked design.
- Physics beyond the flag is v2. Just don't let the car fall through to void — the flag + the pond plane
  as a soft floor is enough for v1.
