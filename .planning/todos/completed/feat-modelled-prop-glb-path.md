---
id: FEAT-59
type: feature
status: completed
severity: minor
opened: 2026-08-03
updated: 2026-08-15
closed: 2026-08-15
source: news-roll-asset
relates: FEAT-06, FEAT-61 (news roll — the proof consumer), FEAT-60/46 (POI markers), FEAT-36 (debris), BUG-49 (deploy gate)
---

# FEAT-59: A model import service for hand-modelled (`.glb`) assets

## Resolution (2026-08-15) — SHIPPED; closed on a code check, not on age

`src/model-service.js` (92 lines) + `data/prop-models.js`. Every core acceptance line is met:

| Acceptance | Where |
|---|---|
| Data-only registry; adding an asset is a `.glb` drop + one entry | `data/prop-models.js` (`PROP_MODELS`), documented at the top of the file |
| `getModel(key)` async, cached, concurrent callers share one fetch | `_records` Map holds the **promise**, so the promise *is* the dedup and the cache |
| Spawn a `THREE.Mesh`/`Group`, shadow-casting toggleable per spawn | `spawnModel(key, { castShadow, receiveShadow })` |
| Async, never stalls worldgen or the frame loop | Returns a group immediately and populates it when the load resolves |
| Failure → 0.5 m pink cube, never null, never a silent no-op | `_fallbackTemplate()` (`0xff00ff`); **`getModel` never rejects** — unknown key *and* failed fetch both log and resolve to the fallback |
| Collision metadata carried verbatim | `rec.collision` → `root.userData.collision` |
| **Proof: `news-roll` spawns in-world via the service** | `main.js:1918` and `main.js:2515` — and it did not stay a stub, it carries the FEAT-61 paper route |

**It outgrew its own proof, which is the real reason to close it.** The ticket asked for consumer A
(mission items) and pencilled consumer B (static POI dressing) as "later, may split". Both shipped,
plus a third the ticket filed under *"Future (not this ticket): physics"*:

- **Mission items** — the thrown newspaper roll (FEAT-61).
- **Static POI markers** — `main.js:2202` spawns `trailerHomeA` with shadows on, as mom's and
  Larry's houses.
- **Physics props** — `src/debris.js` calls `getModel` directly and builds colliders from the loaded
  mesh (FEAT-36/FEAT-48). The authored `collision` metadata the service was told to carry "unused
  today" now has a live consumer.

The path is also **gated**: `test/dist-assets.mjs` (added by BUG-49, registered in `test/gates.mjs`
under `infra`) asserts every registry model URL exists and is copied into `dist/` by
`vite.config.js` — the allowlist drift that shipped pink cubes to Pages. The fallback proved itself
in production before it was fenced.

**Deferred criteria stay deferred, exactly as written:** palette/scatter integration
(`InstancedMesh`, one draw call per variant) was conditional — *"only if/when a modelled asset needs
density scatter"* — and nothing does yet. Placed POI props are small counts on the per-mesh path,
which is what the ticket specified. If a modelled asset ever needs scatter density, that is a new
ticket against FEAT-06's palette, not a reopen of this one.

**Not closed by this:** several built assets are still unregistered — ASSET-09 (winnebago),
ASSET-29 (barrel-plastic), ASSET-30 (three drum variants). That is one `PROP_MODELS` entry each plus
somewhere to place them; the service they were "blocked by" has not blocked them for some time.

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
