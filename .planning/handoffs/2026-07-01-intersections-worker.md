# HANDOFF → intersections-beautification worker (QUAL-10)

**From:** lead session (2026-07-01)
**Ticket:** QUAL-10 — `.planning/todos/pending/qual-junction-visual-blend.md`
**Rides on:** FEAT-19 (graded junctions) — **DONE** (commit 9b91d9a; junctions now ease toward a
slope-preserving grade LINE, not a flat `nodeY`). Your surface already follows the road grade; your job
is the **visual mesh blend** on top of it.
**Read first:** `2026-07-01-COORDINATION.md` (shared-file map), then the QUAL-10 ticket.

---

## TL;DR

The goal: intersections should read as **roads flowing together** — flared/feathered ribbon ends,
tangent corner fillets, continuous surface + shading — not several ribbons butt-ending at a flat pad.

**⚠️ There is already uncommitted QUAL-10 work in the tree — it is YOURS. Commit it first.** It adds
real graph-node junction detection + a terrain carve that digs/fills the plaza. It does NOT yet do the
fillet/flare/seam-shading polish that is the heart of the ticket.

---

## §1 — The uncommitted work (verified `git status` 2026-07-01)

```
 M src/road.js       ← _detectNodeJunctions() + _junctionCarve() + _carveDirtY hook (~L2740–2980)
 M src/road-mesh.js  ← build pads for NODE junctions (not just mid-span crossings) (~L835–860)
 M data/ranger.js    ← roadJunctionCarveRadius: 13 (junction terrain-carve radius param)
 M src/debug.js      ← "Terrain Carve Radius (m)" slider in the Junctions folder
```

**What it does (already written, not yet committed):**
- `_detectNodeJunctions()` — finds the **real graph intersections**: where ≥3 streamed runs meet at a
  shared anchor. `_detectJunctions()` only found mid-span *crossings*, which graph mode culls — so without
  this the shipped graph network got **no pads at all**. Clusters streamed run **endpoints** (the run-join
  seal welds them to a point) → pure fn of the streamed network, cached by `_networkRev`. Emits records
  matching `buildJunctionFootprint`'s shape (`{pos, nodeY, legs, kind:'AT_GRADE', simpleMerge}`).
- `_junctionCarve(runKey, arcSEff)` — near a node, returns `{frac, widen}`: `frac` eases crown/camber to
  **flat** (a crossing is a flat plaza; an extrapolated crown would dome the pad), and `widen` grows the
  flat carve core so terrain is dug/filled out to the pad disc instead of the fillet corners clipping
  through at embankment height. `frac`=1 at the node → 0 at radius `R`. Wired into `_carveDirtY` (crown/
  camber ease) and the carve half-width.
- `road-mesh.js` now builds pads for **both** node junctions and mid-span crossings (they never coincide:
  node = run endpoint, crossing = run interior; in graph mode `_detectJunctions` is empty).

**Assess before committing:** run `npm test` (carve/smoothness/road gates) and eyeball in-browser
(`npx serve .`, drive a graph-mode T/X junction on a slope). If green + looks right, commit as
`feat(QUAL-10): node-junction pads + terrain carve to the plaza` (or fold into your first polish commit).
If a gate is red, it's this in-flight code — fix before building on it. **This unblocks everyone else's
clean base** (see COORDINATION land-order), so commit it early.

## §2 — What remains (the actual ticket — the visual polish)

The in-flight work makes junctions **detected + carved**; it does **not** make them **pretty**. From the
ticket's "Direction", still to do:

1. **True tangent fillets.** Corners today are sampled at the node-centred *average* radius `rAvg`
   (`road-mesh.js:938–946`) — approximate, so the pad boundary doesn't land on the ribbon edges. Build
   each corner as a real fillet arc **tangent to the two adjacent leg outer edges** (`R_f =
   halfWidth·tan(θ/2)`, `road-mesh.js:912`, done geometrically). Acute crossings (<20°) currently collapse
   to a straight bevel (`road-mesh.js:917`) — decide the acute treatment.
2. **Precise leg trim / flare.** Close the deferred D-13 per-ribbon trim (`road-mesh.js:849–852`): trim
   each ribbon to the pad boundary, optionally **flare** the last span (widen approaching the node so lanes
   fan in). Ribbon end and pad edge should **share/weld vertices** — no seam, no gap/overlap.
3. **Continuous surface + shading across the seam.** The pad is currently a separate flat-coloured patch
   (`(0.15,0.15,0.17)`, crown=0, camber=0, `road-mesh.js:978–980`) → a hard shading/colour break. Carry
   the ribbon's crown/camber into the pad edge and ease to the interior; match vertex colour + normals at
   the boundary. **Coordinate with the FEAT-19 graded surface** — the pad Y already follows the graded
   line via `sampleRoadTopY` (the in-flight carve keeps mesh==collision); don't re-bake a flat-`nodeY`
   assumption into the new fillet geometry.
4. **Marking feather.** Markings are hard-cut inside the junction (`inJunction`, `road-mesh.js:187–189`).
   Fade/feather them into the junction instead of stopping dead; consider a subtle apron tint so the
   plaza reads as intentional.

## §3 — Files & entry points

- `src/road-mesh.js` — `buildJunctionFootprint` (`:862`, the pad polygon), the fillet sampling
  (`:912–946`), the pad material/colour (`:978`), the marking suppression (`:187`), and the pad-build
  dispatch (`:835`, already edited to feed node junctions).
- `src/road.js` — `_detectNodeJunctions` / `_junctionCarve` (yours, uncommitted) + `sampleRoadTopY`
  (`~L2790`, the asphalt-TOP sampler the pad rides). `camberProfile` / `runProfile` for crown/camber to
  carry into the pad edge.
- `data/ranger.js` — `roadJunctionRadiusScale` (1.35), `roadJunctionApronLift` (0.0),
  `roadJunctionCarveRadius` (13, yours). Add flare/fillet knobs here.

## §4 — Acceptance (from the ticket)

- Reads as roads flowing together: flared/feathered ends, tangent fillets, no butt-end, no gap/overlap.
- Pad↔ribbon seam continuous in surface + shading (no flat-patch colour/normal break).
- Holds at T, four-way, and acute (<20°) crossings.
- **Window-invariant** (identical regardless of approach / draw distance / which tile built it),
  **mesh == collision** (QUAL-07), `npm test` green, no new per-frame cost (once-per-build cached path).

## §5 — Watch-outs / coordination

- **`src/road.js` is shared** with the router (dispatcher, L1145–1240) and ponds/streams. Your region
  (~L2740–2980) is disjoint, but serialize commits — see COORDINATION. Work in a git worktree.
- **FEAT-19 is done** — build the blend on the *graded* surface, not a level pad. `_junctionCarve` already
  keeps the plaza flat *laterally* (crown/camber→0) while the *longitudinal* grade line is preserved by
  FEAT-19; make sure your fillet/flare geometry samples `sampleRoadTopY`, not `nodeY`, for vertex Y.
- **`data/ranger.js` params** — keep your block commented + grouped (you already did). Don't reorder keys.
- Coordinate any change to `_detectNodeJunctions`'s **public record shape** with `road-mesh.js`
  (`buildJunctionFootprint` reads `node.legs` / `node.pos` / `node.kind`).
- The user explicitly hoped QUAL-10 improves junction smoothness further (FEAT-19 resolution note) — this
  is the ticket that delivers on that. Prioritize the seam continuity + flare (items 2–3); that's what
  makes it *feel* like roads flowing together.
