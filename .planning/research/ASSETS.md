# 3D Asset Convention: format, location, authoring

Where hand-authored 3D models live and what format they must be in. Applies to anything modelled
externally (Blender et al.) and loaded at runtime: vehicles today, props once they are sideloaded
as `.glb` (planned).

Verified against `src/vehicle-model.js`, `data/vehicle-models.js`, and `vite.config.js` as of
2026-08-03.

## Save location

    assets/models/<name>.glb

That path is load-bearing in three places — it is not a loose convention:

1. `data/vehicle-models.js` references it as a **relative URL** (`url: 'assets/models/hilux.glb'`),
   fetched at runtime by `GLTFLoader`.
2. `vite.config.js`'s inline copy plugin ships `assets/models/*.glb` into `dist/` at the *same*
   path for the GitHub Pages build. It is **not** an ES import — do not convert it to `?url`
   (CLAUDE.md: that breaks the pure-node gates that read runtime assets by path).
3. `assets/models/CREDITS.md` records attribution. Third-party or licensed models **must** get an
   entry there (most free-model licenses require it); own work doesn't need one.

### Sources live in a sibling `src/`

    assets/models/<name>.glb          shipped model  (committed; matched by the vite copy-glob)
    assets/models/src/<name>.blend    Blender source
    assets/models/src/<name>.py       parametric generator, if the asset has one

`src/` sits *outside* the `assets/models/*.glb` copy-glob, so sources never reach `dist/`. Keeping it
a separate directory also means it can be gitignored wholesale later if the `.blend` files grow —
`.glb` is the only artefact the game needs. `*.blend1` (Blender autosave) is already gitignored.

## Format: glTF 2.0 Binary (`.glb`), textures embedded

The loader is a bare `new GLTFLoader()` (`src/vehicle-model.js`) — no `DRACOLoader`, no
`KTX2Loader` attached. Consequences:

- **`.glb`, not `.gltf`.** Separate `.gltf + .bin + textures` means extra round-trips per model
  (PERF-19 spent real effort killing exactly that kind of load waterfall); embedded-JSON `.gltf`
  base64-bloats the payload.
- **No Draco mesh compression. No KTX2/basis textures.** Either one fails to parse without a
  decoder wired up first. If a model ever gets big enough to want Draco, that is a loader change
  plus a decoder asset — a deliberate task, not an export checkbox.
- Textures packed inside the `.glb`, **≤2K**, and no larger than the asset's on-screen size earns.
  The 60fps mid-range-laptop budget is the constraint.

**Power-of-two is NOT required** (checked 2026-08-03). An earlier draft of this document asserted it;
that was inherited game-asset lore, not a constraint this project has. Three.js r184 removed the
WebGL1 path in r163, so `WebGLRenderer` always gets a WebGL2 context, where NPOT textures support
mipmaps and `RepeatWrapping` exactly like PoT ones. Under WebGL1 they could not — an NPOT texture with
repeat wrap rendered black — which is where the rule comes from. The project already relies on this:
`src/props/prop-impostor.js` allocates the impostor atlas at `ceil(√n)·256 × ceil(n/cols)·256`
(1024×768 at 11 variants) with `generateMipmaps: true` and `LinearMipmapLinearFilter`, and it ships.

Two reasons to still *prefer* round dimensions, neither load-bearing: a power-of-two halves to a clean
mip chain (551 → 275 → 137 truncates at each odd level, nudging texel centres off-grid and softening
minified text), and block-compressed formats need 4-pixel alignment — relevant only if KTX2 is ever
wired up, which the loader section above rules out. **Prefer dimensions divisible by 4; don't re-bake
a working texture just to reach a power of two.**

## Blender export settings

| Setting | Value | Why |
|---|---|---|
| Format | **glTF Binary (.glb)** | single file, textures packed |
| Compression (Draco) | **off** | no decoder attached |
| +Y up | on (default) | matches Three.js |
| Apply Modifiers | on | modifiers don't survive export |
| Materials | Principled BSDF only | procedural node trees don't survive — bake to image textures first |

Apply transforms in Blender before exporting.

## Conventions the vehicle loader depends on

`src/vehicle-model.js` is generic — adding a vehicle is data-only (drop the `.glb`, add a
`VEHICLE_MODELS` entry, point `createVehicleModel` at it) — but only if the model honours these:

- **Forward is −Z.** Model the nose pointing −Z, or correct with `yaw` in the spec.
- **Material names are the API.** Paint, tail lamps, and reverse lens are found by *substring match*
  on material name (`spec.paint` / `spec.tail` / `spec.reverse.material`). Give them stable,
  distinctive names — `Material.001` is not addressable, and renaming on re-export silently drops
  the recolor/lighting hookup.
- **Wheels stay separate objects.** The loader strips the model's own wheels (detected as child
  nodes much smaller than the body, deliberately *not* by name so re-exports keep working) so the
  procedural wheels — which spin, steer, and show suspension travel — show through. A single merged
  node keeps its static, non-animating wheels.
- **Scale is automatic.** `targetLength` rescales the longest horizontal axis; real-world units are
  convenient but not required. `bodyScale` / `shiftRear` / `shiftDown` are the fine-alignment knobs.

Full field reference for a spec: the header comment in `data/vehicle-models.js`.

## Untextured assets: flat colours + runtime recolour

Not every asset needs a texture. A low-poly POI can be **flat material colours with no UVs at all**
— `trailer-home-a` is the reference for this class. It costs no texture memory, needs no bake step,
and makes recolouring free.

- **One material per colour**, and the material *name is the runtime API* — same substring-match
  convention the vehicle loader uses for paint. Give recolourable surfaces stable, distinctive names
  (`TrailerBody`, `TrailerAccent`); renaming on re-export silently drops the hookup.
- Recolouring is then one `material.color.set()` per material. No texture multiply, no tint shader,
  no white-albedo trick.
- **Say in the ticket which materials are recolourable and which are fixed.** A model with seven
  materials where only two may be driven is not self-documenting.
- The cost is **draw calls: one per material.** Fine for a POI placed a handful of times; not fine
  for anything scatter-density, which wants one shared material and the instancing path.
- Objects with colour-only materials need no UVs — but they will if the project ever atlases.

## Known limits

- **Props are not wired for GLB *yet*.** The prop system is procedural instanced geometry today,
  and sideloading pure `.glb` props is planned — so the format and save location above are the
  target for prop models too. Until that loading path exists, a modelled prop needs code, not just
  a file drop.
- **No git-LFS, no asset pipeline.** `.glb` is binary, so every re-export stores a full new blob in
  history rather than a diff. Fine for a handful of models; heavy iteration on one mesh will grow
  the repo. Prefer iterating outside the repo and committing at milestones.
