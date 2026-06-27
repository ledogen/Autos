# HANDOFF → road/terrain worker: merge + wire the FEAT-06 prop foundation

**From:** the FEAT-06 (trees/rocks/bushes) session
**To:** the road/terrain bugfix worker (currently idle)
**Date:** 2026-06-27
**Type:** merge + integration request

---

## TL;DR

While you fixed BUG-15/BUG-21, I built the **FEAT-06 prop foundation** as **new files only** — zero
edits to any file you touched. Nothing conflicts. I deliberately did **not** commit (so I wouldn't
sweep your uncommitted work). I need you to:

1. **Commit your own uncommitted tail first** (see §1) so the two efforts stay as clean, separate
   commits.
2. **Commit the prop foundation** (additive new files — see §2).
3. **Wire `PropSystem` into `main.js`** (exact snippet, §3) — this is the only file that needs a
   real edit, and it's yours to own since you know the current main.js state.
4. **Register the gate + verify** (§4).

If you'd rather I (the prop session) do step 3 myself, just say so — but main.js may be in your
working set, so you're better placed to avoid clobbering.

---

## Current repo state (verified 2026-06-27)

Your bugfix commits are landed (HEAD `3ff41a4`). But the working tree still has an **uncommitted
tail** on files you own, plus my additive new files:

```
 M data/ranger.js          ← YOURS (uncommitted)
 M src/debug.js            ← YOURS (uncommitted)
 M src/road.js             ← YOURS (uncommitted)
 M src/terrain.js          ← YOURS (uncommitted)
 M .planning/todos/pending/bug-run-boundary-jolt.md   ← YOURS (uncommitted)
 M .planning/todos/pending/feat-rocks-and-trees.md    ← MINE (FEAT-06 ticket updates)
?? data/flora.js                                      ← MINE
?? src/props/                                         ← MINE (4 files)
?? test/props.mjs                                     ← MINE (gate)
?? test/prop-preview.html                             ← MINE (standalone visual)
?? .planning/todos/pending/feat-prop-collision.md     ← MINE (FEAT-06b)
?? .planning/todos/pending/feat-prop-lod-impostors.md ← MINE (FEAT-06c)
?? .planning/todos/pending/qual-carve-staircase-vertical-walls.md ← MINE (QUAL-06)
```

⚠️ **Do NOT `git add -A` blindly** — it would fold my files into your bugfix-tail commit. Use the
explicit file lists below.

---

## §1 — Commit your uncommitted tail (you)

Review and commit the changes you left on `ranger.js / debug.js / road.js / terrain.js /
bug-run-boundary-jolt.md` under your own message. Confirm `npm test` is green first (these are your
edits — I haven't run your in-flight changes through the gates).

```
git add data/ranger.js src/debug.js src/road.js src/terrain.js \
        .planning/todos/pending/bug-run-boundary-jolt.md
git commit -m "<your bugfix-tail message>"
```

---

## §2 — Commit the prop foundation (additive, no conflicts)

All new files. Geometry/scatter/instancing for trees, rocks, bushes. Headless gate passes (18/18).

```
git add data/flora.js src/props/ test/props.mjs test/prop-preview.html \
        .planning/todos/pending/feat-rocks-and-trees.md \
        .planning/todos/pending/feat-prop-collision.md \
        .planning/todos/pending/feat-prop-lod-impostors.md \
        .planning/todos/pending/qual-carve-staircase-vertical-walls.md \
        .planning/handoffs/2026-06-27-feat06-props-merge.md
git commit -m "feat(FEAT-06): procedural prop foundation — palette + scatter + instancing (trees/rocks/bushes)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**What's in it:**
- `data/flora.js` — all prop params (tunable; the FEAT-06 spec).
- `src/props/prop-geometry.js` — `makeBlob` / `makeKinkedTube` / `makeConeStack`, flat-shade,
  dependency-free `mergeGeometries`, `assembleTree`.
- `src/props/prop-palette.js` — `buildPalette(seed)` → variant geometries + shared Lambert
  (vertexColors) material.
- `src/props/prop-scatter.js` — `scatterChunk(cx,cz,seed,samplers)`, deterministic + window-
  invariant, cluster grouping + biome rules. **Dependency-injected** samplers — imports nothing
  from road/terrain.
- `src/props/prop-system.js` — `PropSystem`: one InstancedMesh per (category×variant) global pool,
  free-list slots, `update(x,z,ringChunks)` lifecycle. `frustumCulled=false` (PERF-05 gotcha).

---

## §3 — Wire into `src/main.js` (the only real edit)

The prop system is decoupled by design; main.js injects the real terrain/road samplers.

**a) Imports** (near the other `src/` imports, ~line 27–35):
```js
import { PropSystem } from './props/prop-system.js'
import { FLORA_PARAMS } from '../data/flora.js'
```

**b) Instantiate** — right after `roadSystem = new RoadSystem(...)` (~line 817):
```js
const PROP_RING = 2   // chunks of props around the view centre (tune; keep ≤ terrain ring)
let propSystem = new PropSystem({
  scene,
  worldSeed,
  samplers: {
    heightAt:    (x, z) => terrainSystem.analyticHeight(x, z),
    normalAt:    (x, z) => terrainSystem.analyticNormal(x, z),
    roadBlocked: (x, z) => !!roadSystem.queryNearest(x, z, FLORA_PARAMS.scatter.roadExclusion),
  },
})
```

**c) Per-frame update** — in `loop()`, immediately after
`if (roadSystem) roadSystem.update(streamCenter)` (~line 1161):
```js
if (propSystem) propSystem.update(streamCenter.x, streamCenter.z, PROP_RING)
```

**d) Seed-change / reset path** (~line 264, where you recreate `roadSystem` on a new seed): the
props are seed-deterministic, so they must be rebuilt too, or they'll show stale-seed scatter:
```js
if (propSystem) propSystem.dispose()
propSystem = new PropSystem({ scene, worldSeed, samplers: /* same as above */ })
```
(Refactor the samplers into a shared `const makePropSamplers = () => ({...})` to avoid duplicating
the closure in both spots.)

### Watch-outs
- `FLORA_PARAMS.chunkSize` (64) **must equal** `CHUNK_SIZE` from `road.js` (64). If you changed
  CHUNK_SIZE in your bugfix, update `data/flora.js` to match — scatter is keyed per chunk.
- `PROP_RING` is a flat constant for v1. If you want it to track the draw-distance preset, read
  `p.ring` in `applyDrawDistance` and store it; props ring can be ≤ terrain ring.
- LOD/impostors are **not** in this foundation (that's FEAT-06c) — at Ultra the raw instance count
  will tax the iGPU floor. Fine for Near/Normal; don't gate Ultra acceptance on this commit.
- Collision is **not** here (FEAT-06b) — props are visual-only until then.

---

## §4 — Register the gate + verify

**a)** Add to `test/run-all.mjs` `GATES` array (append):
```js
'props.mjs',            // FEAT-06: prop geometry sanity + scatter determinism/window-invariance + slot accounting
```

**b)** Verify:
```
node test/props.mjs     # → PROPS GATE: PASS (18 checks)
npm test                # → all gates green (your 14 + props = 15)
```

**c)** In-browser smoke (after §3 wiring): `npx serve .` → drive around and confirm:
- trees (aspen + pine), rocks, bushes appear, grouped, seam-free across chunk streams;
- **no props on the road ribbon/shoulder** (exclusion);
- no per-frame hitch from prop streaming; props don't pop/re-randomise when a chunk reloads.

You can also eyeball geometry in isolation (no game needed): `npx serve .` →
`/test/prop-preview.html` (Reseed / Wireframe buttons).

---

## Notes for the merge

- My work assumes the **public** terrain/road API only: `analyticHeight(x,z)`,
  `analyticNormal(x,z)→{x,y,z}`, `queryNearest(x,z,r)→null|{...}`. If your bugfix changed any of
  those signatures, the samplers in §3 are the single place to adjust.
- Memory written: `project_feat06_props_scope.md` has the full scope + build status.
- Remaining FEAT-06 follow-ups (not blocking this merge): debug-menu sliders for `FLORA_PARAMS`,
  density/colour tuning against real terrain, then FEAT-06b (collision) and FEAT-06c (LOD/impostors).

---
---

# ROUND 2 (2026-06-27) — feedback fixes + FEAT-06b collision core (UNCOMMITTED)

The foundation (§1–§4 above) is committed. Since then I did another prop round. **The working tree
is now a MIX of your road/QUAL-07 work and my prop work — both uncommitted.** Sort the commits per
the lists below; ⚠️ again, **do NOT `git add -A`**.

## Commit split (verified `git status` 2026-06-27)

**YOURS (commit first, your message):**
```
src/road.js
data/ranger.js
.planning/todos/completed/bug-run-boundary-jolt.md
.planning/todos/pending/qual-unify-carve-surface.md      (QUAL-07, new)
.planning/todos/pending/qual-carve-staircase-vertical-walls.md  (QUAL-06 subsumed-by edit)
```
> ⚠️ When you committed your road WIP, `npm test` showed 2 RED gates — `road-smoothness.mjs` and
> `road-fill-support.mjs`. Those are YOUR in-progress `road.js` (neither imports props). Get them
> green before/with your commit.

**MINE (commit as one — feedback fixes + FEAT-06b core):**
```
data/flora.js
src/main.js                       ← see ⚠️ below
src/props/prop-geometry.js
src/props/prop-palette.js
src/props/prop-scatter.js
src/props/prop-system.js
src/props/prop-collider.js        (new)
src/props/prop-debug.js           (new)
test/props.mjs
.planning/todos/pending/feat-prop-collision.md
```
> ⚠️ **`src/main.js` currently holds MY prop edits** (sampler `roadDist`; sun shadow-follow +
> widened frustum; `addPropGui` wiring; `_gui.foldersRecursive().forEach(f=>f.close())`). If you
> also edited main.js this round, `git diff src/main.js` and reconcile — these are additive and
> localized (sampler block, lighting block, after-`initDebug` GUI wire, in-loop shadow follow).

**Round-2 visual/behaviour changes (FYI):** solid pine cones (was see-through), white+black aspen
bark (was green — instanceColor was tinting the whole tree), bigger trunks, brighter canopies, more
rocks, small rocks on shoulder + sparse on road, +50% small-rock size, ground-sink (slope-float),
per-tree spawn tilt, all GUI folders collapsed by default.

---

# FEAT-06b — physics splice (do LAST, after your `road.js`/`queryContacts` is committed + stable)

The collision **core is built + gated** (`test/props.mjs` §5, all green): `prop-collider.js` (pure
math), per-variant collision shapes in the palette, and a spatial index + `queryProps` /
`bushDragForce` on `PropSystem`. Only the splice into YOUR contact code remains — ~10 lines, and it
must come after your contact/carve churn settles (it edits the exact functions you're in).

### Splice 1 — wheel sphere contacts (`queryContacts`, before `return hits`, ~line 732)
```js
if (propSystem) hits.push(...propSystem.queryProps(cx, cy, cz, r))
```

### Splice 2 — body-box vertex contacts (`queryVertexContacts`, before `return hits`, ~line 676)
```js
if (propSystem) hits.push(...propSystem.queryProps(px, py, pz, 0))   // point query (r=0)
```
`queryProps` returns `[{ normal: THREE.Vector3, depth }]` — the exact shape both functions already
push, so the solver handles tree (capsule) + rock/boulder (sphere) contacts with no other changes.
Small rocks are non-collidable by construction (no descriptor). Tilt is ignored for the trunk
capsule (vertical) — fine at ~10°.

### Splice 3 — bush soft-drag (chassis, once/frame, NOT a contact) near the `stepPhysics` call (~line 1134)
Bushes never produce a hard contact — apply a capped resistive force to the chassis CoM:
```js
if (propSystem) {
  const p = vehicleState.position, v = vehicleState.velocity   // both {x,y,z}
  const f = propSystem.bushDragForce(p.x, p.y, p.z, v.x, v.y, v.z)   // {x,y,z}, capped ~200 N
  // apply as an impulse to the body (your call on the exact hook — bodyMass from RANGER_PARAMS):
  const k = PHYSICS_DT / RANGER_PARAMS.mass
  v.x += f.x * k; v.y += f.y * k; v.z += f.z * k
  // (or feed `f` into a body force accumulator inside stepPhysics if you'd rather keep it in physics.js)
}
```

### Verify
- `node test/props.mjs` → PROPS GATE: PASS (incl. §5 collision).
- `npm test` → your road gates green + props green.
- In-browser: drive into a **tree** (stops/deflects) · into **bushes** (gentle drag, push through) ·
  over **small rocks** (no effect) · into a **large rock / buried boulder** (climb / can roll).

### Watch-outs
- `queryProps` allocates one `THREE.Vector3` per contact (matches `queryVertexContacts` style). If it
  shows on the contact hot path, pool it.
- Collision-scale params (`FLORA_PARAMS.collision`) are read LIVE — the debug Collision folder tunes
  capsule/rock radius + bush k/cap without a re-stream.
- `prop-collider.js` is pure (no THREE) → keep it that way; it's the headless-testable layer.
