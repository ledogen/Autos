# Merge handoff — feature/gpu-graphics (PERF-21 GPU optimization pass)

**Branch:** `feature/gpu-graphics` (worktree `../CarGame-gpu-graphics`), based on main `4ad7a9f`
(includes the causeway merge + the 32a438f tunable-atlas commit).
**Scope:** GPU-side only — lighting, shadows, sky, props, dust, quality tiers. No routing, carve,
physics, or world-gen changes. Written for the merge agent; a world-gen/CPU worktree is in flight
in parallel — overlap analysis at the bottom.

## What changed and why

### 1. Baked prop-shadow stream-in hitch — root-caused and fixed (`prop-shadow-bake.js`, `prop-system.js`)
Each tile bake rendered the ENTIRE live prop population (~25k instances at Ultra; scissor clips
rasterization, not vertex work) × up to 8 tiles per stream-in frame. Now each bake renders a
per-tile scratch scene holding only the 3×3-chunk neighbourhood (~1k instances): `setTileSource`
hook on ShadowBakeSystem, wired automatically by `propSystem.setShadowBake`. Falls back to the old
full-scene path if unwired — headless gates unaffected.

### 2. Shadow atlas RGBA8 → R8 (`prop-shadow-bake.js`, `terrain.js` one line)
The atlas is a 1-channel mask; RGBA8 wasted 4× VRAM (Ultra 151 MB → 38 MB). Terrain samples `.r`
now; the bake projection shader writes red. **Terrain.js has exactly one changed line (`.a`→`.r`
at the atlas 5-tap)** — trivial to reconcile if the world-gen branch touches the same region.

### 3. Partial instance-buffer uploads (`prop-system.js`)
Streaming one chunk re-uploaded whole per-species capacity buffers (256 KB each). Dirty-span
tracking + `addUpdateRange` uploads only the touched slot range. Note: ranges are only ADDED at
flush (never cleared) — the renderer merges + clears on upload; clearing at flush would drop spans
when two flushes land between renders.

### 4. Baked sky (`sky.js`)
The Preetham shader was a full-screen per-frame fragment cost with a static sun. Default is now
baked mode: sky rendered once per look change into a HalfFloat cubemap (`scene.background`).
Live mode kept (GUI: Sky folder → "baked sky (perf)"); bake res selectable (256/512/1024, default
512). Sun disc is ~3 texels at 512 — if the user wants a crisper disc on Ultra, flip Ultra to live
or 1024 (see tier proposals). New `onLookApplied` hook on SkySystem (used by impostor rebake).

### 5. Prop billboard impostor LOD — FEAT-06c shipped (`prop-impostor.js` NEW, `prop-system.js`, `data/flora.js`, `prop-debug.js`)
Trees/boulders beyond `lodRing` chunks of the camera render as single cylindrical-billboard quads
sampling a per-variant atlas baked in-browser at boot (lit by the live sky look via
`skySystem.sunDirection` — NOT `sun.position`, which is a boot placeholder). Chunk-granular
re-pooling from retained placement records; baked ground shadows preserved (bake tile source reads
the records, not the pools). Headless-inert: without `setImpostors(renderer, …)` everything renders
3D exactly as before. A/B at Normal: −23% scene triangles at a static viewpoint, more in forest.
Ticket `feat-prop-lod-impostors.md` moved to completed (Mid-tier + cross-fade descoped).

### 6. Vehicle spotlight culling + program prewarm (`vehicle-model.js`, `main.js`)
Six SpotLights at intensity 0 still occupied every lit material's per-fragment spotlight loop (+2
cookie samples). Spots now set `visible=false` at zero intensity; the light-count shader variants
(lamps off / brake / night / reverse) are precompiled at boot with `compileAsync`
(`prewarmLightPrograms`) so toggling never compiles mid-drive. ~55 programs after boot is expected.

### 7. Dust: 180 draw calls → 1 (`dust.js`)
Sprite pool replaced with one instanced billboard mesh (custom shader with fog + ACES chunks —
ShaderMaterial does not auto-append tonemapping; without them dust would read brighter than the
SpriteMaterial it replaced). Emission/physics logic untouched.

### 8. Quality tiers (`main.js` QUALITY_PRESETS)
New `lodRing` per tier; `propRing` extended where billboards make it near-free:

| Tier   | lodRing (3D chunks) | propRing (was) | net effect |
|--------|--------------------|----------------|------------|
| Low    | 1                  | 2 (1)          | same 3D as before + NEW billboard ring |
| Normal | 1                  | 2 (2)          | outer prop ring → billboards (~64% of its tree tris) |
| High   | 2                  | 3 (2)          | same 3D as before + NEW billboard ring |
| Ultra  | 2                  | 3 (3)          | outer prop ring → billboards |

## Files touched (this branch, both commits + this doc's commit)

- `src/props/prop-shadow-bake.js` — tile source hook, R8 atlas, comment updates
- `src/props/prop-system.js` — placement records, dual pools, LOD sync, partial uploads, scratch bake scene
- `src/props/prop-impostor.js` — NEW
- `src/props/prop-debug.js` — "3D prop ring" slider
- `src/sky.js` — baked mode, setMode/setBakeRes, onLookApplied hook, GUI rows
- `src/dust.js` — instanced rewrite
- `src/vehicle-model.js` — spot visibility + prewarmLightPrograms
- `src/terrain.js` — ONE line (atlas sample `.a`→`.r`)
- `src/water-render.js` — stale "not wired" header comment fixed
- `src/main.js` — destructure prewarmLightPrograms + boot call; `_syncImpostors` hook +
  applyPropImpostors (boot / GUI rebuild / seed rebuild); QUALITY_PRESETS lodRing + applyQuality push
- `data/flora.js` — `lod: { ring3d }` param block
- `.planning/todos/` — FEAT-06c closed, PERF-22 (terrain geometry LOD) opened

## Overlap risks with the world-gen/CPU worktree

- **`src/terrain.js`**: my single line at the shadow-atlas sample (search `PERF-21`). If their
  branch rewrites the terrain fragment shader region, keep BOTH: their structure + `.r` swatch.
- **`src/main.js`**: my edits are additive and localized (QUALITY_PRESETS row values, one block in
  applyQuality, the applyPropImpostors block after applyPropShadowMode, one line in the seed-rebuild
  prop block, prewarm call after the first rAF). Conflicts should resolve by taking both sides.
- **`data/flora.js` / `data/ranger.js`**: flora gained the `lod` block at the tail; ranger untouched.
- Everything under `src/props/`, `sky.js`, `dust.js`, `vehicle-model.js` should be mine alone this cycle.

## Verify after merge

1. `npm run test:all` (33+ gates).
2. Boot the game: baked shadows under trees, distant trees billboard (toggle the Props →
   "3D prop ring" slider to 0 to see them near — they should read like pale-correct flat trees).
3. Sky: toggle Sky → "baked sky (perf)" off/on — horizon should not change.
4. Drive into a fresh region at Normal — the shadow snap-in hitch should be gone.
5. Headlights L-cycle + brake at night — no hitch (programs prewarmed).

## Further tier-scaling proposals (NOT implemented — user decisions)

- **`LIGHT_ENV.dayScale` → 0 on Low/Normal**: kills all 6 spotlight fragments by day even with
  lamps on (currently 0.1 → subtle daytime pools cost full spotlight loop when headlights are on,
  which is the default). Biggest remaining daytime fragment lever after the sky bake.
- **Sky bake res / live per tier**: Low 256, Normal 512, High 512, Ultra live (crisp sun disc).
- **PERF-22 terrain geometry LOD** (ticket filed): the last big vertex lever — High/Ultra resident
  terrain is 1.4M/2.4M tris of uniform 1 m grid. Needs coordination with the world-gen worktree.
- **Water tessellation** (`water-render.js` segments=48) and **dust pool size** per tier — small,
  only worth wiring if the tier table grows anyway.
- **`detailScale` 0.5 on Normal**: halves the terrain fbm bump strength cost visually gently —
  cheap A/B via the existing slider if the Air still runs warm at Normal.
