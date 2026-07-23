# Handoff — QUAL-16 deg-2 kink: swept-arc connector + earthwork follow-up

**Date:** 2026-07-21
**Worktree:** `../CarGame-deg2-fit` · branch `feature/deg2-fit` (based on `origin/main` @ 9945bb8)
**Dev server (leave running for preview):** `http://localhost:8010/` (`npm run dev -- --port 8010 --strictPort` from the worktree)
**Status:** Core fix DONE + user-verified driveable. Earthwork polish on SHARP kinks is the open item — user chose "write a handoff, re-dispatch."

---

## The ask

Degree-2 nodes (a road bending through, not a real intersection) sometimes showed an ugly **gap** — the old
QUAL-11 junction *pad* built an elongated wedge polygon that read as a blobby plaza and left a
triangulation/weld hole on the outside of the bend. User: "curve-fit the cheapest arc to each incoming
segment — a clean mild-curvature solution so it's driveable."

## What shipped in this branch (2 files)

### 1. `src/road-mesh.js` — deg-2 connector is a swept ARC, not a pad
- `buildJunctionFootprint()` (~line 1037): added an early branch — **if `node.legs.length === 2`,
  return `_buildDeg2Ribbon(node, params, sampleY)`**; falls through to the old pad ladder only if that
  returns null (degenerate fillet).
- **`_buildDeg2Ribbon(node, params, sampleY)`** (new, ~line 1085): the whole fix.
  - Each mouth = run cross-section at `cutback + halfWidth/2` (the exact-weld point the ribbons end at),
    tangent sampled from `runProfile(mouthArc)` so the seam matches ribbon heading (no kink at the weld).
  - Fits the **largest-radius circular fillet that fits between the mouths** (gentlest driveable arc):
    intersect the two centreline rays → deflection δ → `Lt = min(t,r) − halfWidth/2`, `R = Lt/tan(δ/2)`.
    Guard `R < halfWidth` → return null (true hairpins fall back to the pad).
  - Centreline = `anchorA→cA` (ride the REAL ribbon via `runPointAt`, ~10 m overlap so the seam hides
    inside overlapped asphalt clear of the ragged trim) → `cA→PA` straight → fillet arc → `PB→cB` →
    `cB→anchorB` (ride ribbon). Densified ≤3 m.
  - Sweeps a constant full-width strip, vertex Y from `sampleY` (= `sampleRoadTopY`, so mesh == collision),
    up-facing winding guard, same attributes as `_buildPadGeometry` (position/color 0.15,0.15,0.17/aMark=0).
    No stripes (matches pad contract; markings feather at junctions anyway).

### 2. `src/road.js` — admit sharper deg-2 kinks
- `_detectNodeJunctions()` (~line 3376): **`KINK_MAX` raised 75° → 120°.** The old 75° cap existed only
  because a *pad* made a hairpin crescent at sharp kinks; the swept arc just curves tighter, so sharp
  kinks are fine. The `R < halfWidth` guard in `_buildDeg2Ribbon` catches true hairpins. `kinkMin`
  (roadJunctionKinkDeg, default 9°) low end unchanged.

**No param added/removed → no BUNDLE-SIG change → route cache NOT regenerated (confirmed).**
`KINK_MAX` is a hardcoded constant, not a slider.

## Verified (headless)

- Both original captures + the 87° case: `_buildDeg2Ribbon` USED, constant 10 m width, continuous,
  connector ends land ~18–20 m from node (cutback 10), 0 fall-back verts (all seat on `sampleRoadTopY`).
- Design radii: 21° kink → gentle; 46° → R≈11.8 m; 87° endpoint (101° at weld) → R≈8.6 m (> hardRadius-ish,
  driveable). All above the `R<halfWidth` pinch guard.
- User drove all of them: gap gone, feels like road. **This part is done.**

## THE OPEN ITEM — earthwork on sharp kinks

The connector **mesh** is correct everywhere. The **terrain carve (earthwork) is not** for sharp kinks:

- Carve follows the two **straight run corridors** + a small **node disc** (`roadJunctionCarveRadius`=7,
  via `_junctionCarve` widen). The connector follows the **swept arc**. The sharper the kink, the more
  the arc bulges off the corridors → worse earthwork.
- Measured (top-down carved-height renders, tool below):
  - 21° kink: clean.
  - 46° kink: faceted creases radiating from the node.
  - 87° kink: a **scoop/pit on the OUTSIDE of the bend** (terrain not filled to grade where the arc cuts
    the corner — `widen` is perpendicular to the run and can't reach the along-arc outside region).
- Tried & REJECTED (didn't fix the scoop, reverted): extending `_junctionCarveArcs` into a bench of widen
  discs along each leg. `widen` extends the flat core *perpendicular to the run centreline*; the scoop is
  *along the arc, off both centrelines*, so perpendicular widening can't reach it.

### Root cause (one line)
The connector is a mesh-only object; the carve/collision-surface field (`_resolveRoadSurface`) only knows
about **runs**, so terrain earthwork doesn't follow the fillet arc.

### Recommended fix — make the connector arc a first-class carve primitive
Thread the fillet arc (centreline + halfWidth + a grade/camber for the span) into the carve path so
**mesh, collision, AND terrain earthwork all follow the same arc** (mesh == collision mandate):

- **Compute the fillet arc once in `src/road.js`** (not road-mesh.js), cache per `_networkRev` alongside
  `_nodeJunctions` — a small `{ points[], polyCum[], tangent fn, gradeY fn }` per deg-2 node. Then
  `_buildDeg2Ribbon` READS it (instead of recomputing) and the carve path can too.
- **Injection point:** `_resolveRoadSurface(wx,wz)` (road.js ~3073) is the single resolver used by the
  carve table (`terrain.js _buildCarveTable` ~1201 → `_carveCrossSection`), physics (`_sampleCarveWorld`),
  and `sampleRoadTopY`. If the deg-2 arc is added as a candidate the resolver can project onto (returning
  point/tangent/arcS/runKey/camberSign like a run), the whole pipeline flattens the arc corridor for free.
  - Carve table build is MAIN-THREAD (`_buildCarveTable`) and transferred to the worker as a Float32Array,
    so **no WORKER_SOURCE / CARVE SYNC edit is needed** IF the change lives in `_resolveRoadSurface` /
    `_carveCrossSection` (both already main-thread and mirrored via the table, not the worker body).
    VERIFY this — if any new per-vertex carve math is added to the worker's inline height loop it WOULD
    need the CARVE SYNC mirror. Prefer keeping it in `_resolveRoadSurface` so it stays table-only.
- **Alternative considered (bigger, cleaner-in-theory, riskier):** inject the fillet as a real short
  *synthetic run* in `_network` (skip it in `_detectNodeJunctions` clustering via a flag to avoid
  re-clustering its endpoints). Then the normal ribbon sweep + carve handle it and `_buildDeg2Ribbon`
  could be DELETED entirely. Rejected for now: needs full profile/camber arrays + window-invariance +
  worker network parity. Only pursue if the resolver-candidate approach proves awkward.

### Scope notes / decisions still open
- If earthwork-along-arc is deferred: consider lowering `KINK_MAX` back to ~45–50° so only kinks with
  acceptable earthwork get the arc, and very sharp kinks stay as they were (raw). Trade-off: the 87°
  case reverts to a gap.
- **Out of scope for this branch:** the capture at (−1129, 669) / POS −1126,665 (image 8) is a genuine
  **degree-3 junction** using the existing QUAL-11 pad — a separate pre-existing "yucky pad" issue, NOT a
  deg-2 kink. File as its own ticket if it matters.

## Diagnostic tooling (kept in `test/`, `_`-prefixed, NOT gates)
- `test/_render-h.mjs <capture.json> [halfViewMeters]` — top-down hillshaded render of the **carved
  terrain surface** around the nearest node (base `road._coarseH*amp` blended with `_sampleCarveWorld`),
  writes `/tmp/h.ppm`. Convert + view: `sips -s format png /tmp/h.ppm --out /tmp/x.png`. THIS is how the
  scoop/facets were seen — use it to check any earthwork change.
- `test/_render-node.mjs <capture.json>` — same but overlays run-carve footprint (blue) + connector
  footprint (red).
- Rebuild a quick geometry probe from git history if needed (checked width/continuity/min-radius/
  fall-back-vert-count/arc-deviation — all were used and passed).

## Test captures (all seed 6, in `logs/` and `~/Downloads/`)
| capture | mark | node | kink | earthwork |
|---|---|---|---|---|
| rangersim-capture-1784693778798 | (1820, 6) | deg-2 | 21° | clean |
| rangersim-capture-1784693812400 | (157, −2457) | deg-2 | 46° | faceted |
| rangersim-capture-1784696322812 | (−1999, 1323) | deg-2 | 87° | **scoop (the target case)** |
| rangersim-capture-1784696425520 | (−1129, 669) | **deg-3** | — | separate pad issue (out of scope) |

## Gotchas
- Worktree has **no node_modules** — a symlink was added (`ln -s ../CarGame/node_modules`) so headless
  `node test/*.mjs` resolves `three`. It shows as `?? node_modules` in git status — **do NOT commit it.**
- No registered gate covers `src/road-mesh.js` (by design). Real gate for this work is visual + the
  render tool. `graph-topology.mjs` (junction-at-grade / step-free surface) is the nearest regression
  gate — run it (`test:all` or targeted) after any carve change since the collision surface could move.
- Deg-2 admission now applies cutback+carve to kinks in the 75–120° band that were previously untouched;
  the connector fills them. Sanity-check window-invariance if the carve path changes.
- Relevant memory: `project_qual11_qual16_pad_v2`, `project_qual13_sloped_pads`.

## Suggested next steps
1. Implement the resolver-candidate arc carve (above). Verify with `_render-h.mjs` on the 87° + 46° + 21°
   captures — the scoop/facets should vanish and the corridor should hug the arc.
2. Drive all four locations at `http://localhost:8010/`.
3. Run `graph-topology.mjs`; delete `test/_render-*.mjs` + the node_modules symlink; commit
   `feat(QUAL-16): deg-2 kink as swept fillet arc + arc-following earthwork`; merge to main.
