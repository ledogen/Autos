---
id: FEAT-59
type: feature
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
source: news-roll-asset
relates: FEAT-06
---

# FEAT-59: A model import service for hand-modelled (`.glb`) assets

## Request

`assets/models/news-roll.glb` exists and is export-clean, but **nothing in the game can load it**.
Only vehicles load GLBs today (`src/vehicle-model.js` + `data/vehicle-models.js`); the prop system in
`src/props/` is entirely procedural instanced geometry built in `prop-palette.js`. A modelled asset
needs code, not a file drop — `.planning/research/ASSETS.md` "Known limits" says as much.

This is the gap between "an artist can author an asset" and "the asset appears in the world". It
blocks any hand-modelled content: the newspaper roll, and every item in
`.planning/story-mode/items.md` that wants to be a real object rather than a procedural blob.

## Shape (ratified 2026-08-03)

Hand-modelled assets serve **several distinct use cases**, so this is a small core service with
consumers layered on top — not a single palette hook:

1. **Core: model import service.** Load a `.glb` once, cache it, and hand back a normalized record:
   geometry (merged or per-primitive), material(s), authored collision metadata, and origin
   convention (base-seated, forward = −Z per ASSETS.md). Async, promise-based, deduped by URL.
   This is the whole of what this ticket must ship as infrastructure.
2. **Consumer A (first, in this ticket): mission items.** Objects spawned at runtime by mission
   code — the newspaper roll, thrown from the moving vehicle and left behind. Low instance counts,
   so a plain `THREE.Mesh` per spawn (cloned from the cached record) is fine; no instancing
   required. The *flight arc* (parametric throw) is the mission implementation's job, **not** this
   ticket's — this ticket only guarantees the mission code can ask for a ready-to-place mesh.
3. **Consumer B (later, may split to its own ticket): static / scattered set dressing.** POI props
   that sit in the world and cast shadows. Small counts of placed POI props can use the same
   per-mesh path (shadow-casting on). If a modelled asset ever needs *scatter-density* placement,
   integrate with the palette instancing path (`buildPropPalette()` `{ geo, collision }` entries,
   one `InstancedMesh` per variant) — acceptance for that lives below as deferred criteria.
4. **Future (not this ticket): physics.** Once dynamic prop physics exists, these assets need
   collision. The service carries authored collision metadata *now* (shape + dims per asset, e.g.
   the roll is a ~90×420×74 mm capsule/box) so nothing has to be re-plumbed later; simulation is
   out of scope.

## Acceptance

**Core service + mission-item path (this ticket):**

- A registry (data-only, like `data/vehicle-models.js`) maps asset keys → `{ url, collision,
  ...metadata }`. Adding an asset is a `.glb` drop plus one registry entry.
- `getModel(key)` (or similar) resolves async to a cached record; concurrent callers share one
  fetch; a second call is a cache hit.
- Mission/game code can spawn an instance as a `THREE.Mesh`/`Group` with correct origin seating,
  shadow-casting toggleable per spawn.
- Loading is async and never stalls worldgen or the frame loop; a failed fetch logs and degrades:
  spawn returns a **0.5 m pink cube** placeholder (never null, never a silent no-op) — ratified
  2026-08-03.
- Collision metadata is carried on the record verbatim (unused today, consumed by future physics).
- **Proof:** the `news-roll` asset spawns in-world via the service (a debug spawn key or the
  mission stub is fine — it does not need the full delivery mission).

**Deferred criteria (palette/scatter integration — only if/when a modelled asset needs
density scatter):**

- A palette category sourced from a `.glb` resolves to the same `{ geo, collision }` entry shape,
  flows through the existing `InstancedMesh` path, one draw call per variant.
- Materials: decide explicitly between an extra material slot per GLB variant vs. atlasing into the
  palette material, and state the draw-call cost. Note the shadow-bake scratch meshes
  (`prop-system.js` ~line 253) and impostor bake assume the shared palette material.
- Instance capacity is allocated at construction (`prop-system.js` ~line 90), so a late-resolving
  variant needs its mesh created/re-capped post-hoc, and affected chunks re-committed.
- Scatter, collision, shadow-bake and impostor paths keep working, or opt-outs are stated.

## Implementation hints

- `GLTFLoader` is already imported by `src/vehicle-model.js`; reuse the bare loader (no Draco/KTX2
  decoder is attached — see ASSETS.md).
- `vite.config.js`'s copy plugin ships runtime assets via an explicit `RUNTIME_ASSETS` list (not a
  glob) — each new `.glb` needs a line added there.
- Keep the service dumb: no scatter params, no placement logic, no physics — those belong to the
  consumers.

## Notes

- The newspaper roll is the first asset built under the `assets/models/src/` source layout
  (`.blend` + generator beside the shipped `.glb`).
- Origin convention for that asset: base-seated (lowest point at z=0 in Blender / y=0 after the
  +Y-up export), long axis along Blender +Y → glTF −Z.
- First real consumer: the newspaper delivery mission type (roll thrown from the moving vehicle on
  a parametric arc; arc lives in mission code).
- Consumer B (static POI markers) is scoped as its own ticket: FEAT-60 (`feat-poi-models.md`).
