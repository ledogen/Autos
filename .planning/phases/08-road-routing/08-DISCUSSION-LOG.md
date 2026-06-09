# Phase 8: Road Routing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-09
**Phase:** 8-Road Routing
**Areas discussed:** Network density & shape, Grade limit & switchback feel, Routing character, Debug spline visualization

---

## Network Density & Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Sparse single route | One main road meanders through; you discover and follow it | |
| Sparse + occasional spurs | Trunk road with occasional fork/spur branches (seeded branch points) | ✓ |
| Connected web | Multiple interconnecting roads forming a navigable network | |

**User's choice:** Sparse + occasional spurs
**Notes:** Road stays a "find" in mostly-off-road terrain; spurs need deterministic seeded branch-point logic.

---

## Grade Limit & Switchback Feel

| Option | Description | Selected |
|--------|-------------|----------|
| ~12% moderate | Steeper mountain-road grade, tighter hairpins, Eastern-Sierra | ✓ |
| ~8% gentle | Mellow highway grade, long sweeping switchbacks | |
| ~15% aggressive | Steep, tight hairpins; less forgiving | |
| You decide | Derive from truck climb ability in research | |

**User's choice:** ~12% moderate
**Notes:** Steep-but-always-drivable. Folded in: expose max-grade as a live debug slider (live-tuning ethos).

---

## Routing Character

| Option | Description | Selected |
|--------|-------------|----------|
| Valley/pass-seeking | Hug low ground, cross at saddles/passes like real mountain roads | ✓ |
| Lowest slope-cost | Purely minimize grade cost wherever it lands | |
| You decide | Defer cost shaping to research | |

**User's choice:** Valley/pass-seeking
**Notes:** Cost function rewards low altitude + saddle crossings for a natural, hand-built feel.

---

## Debug Spline Visualization

| Option | Description | Selected |
|--------|-------------|----------|
| Centerlines + waypoints + grid | Splines + tile-edge waypoints + tile grid (diagnose seams) | |
| Centerlines only | Road splines only, debug-panel checkbox toggle | ✓ |
| Full introspection | Centerlines + waypoints + grid + highlighted switchback segments | |

**User's choice:** Centerlines only
**Notes:** Clean shipped viz via lil-gui checkbox. Folded in: planner may add a *temporary* waypoint/grid overlay during development to validate the seam-continuity exit gate, but it is not shipped.

---

## Claude's Discretion

- Per-tile A* internals + altitude doubling-back handling (research spike)
- Spur branch-point logic
- Spline sampling/resolution
- Exact valley-seeking cost weights
- Max-grade slider range
- Spline query API shape (kept clean for Phase 9)

## Deferred Ideas

- Road surface ribbon mesh / crown / camber / terrain carve — Phase 9
- POI anchors at road-adjacent low-slope sites — Phase 10
- Pothole/crack micro-noise — Phase 10 stretch
- Truck body styles + functional lights — backlog 999.1
- Dust trails (`feat-dust-trails.md` todo) — reviewed, not folded (unrelated to road routing)
