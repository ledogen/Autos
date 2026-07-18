# Merge handoff — feature/gpu-graphics (PERF-21 GPU optimization pass)

**Branch:** `feature/gpu-graphics` (worktree `../CarGame-gpu-graphics`), 10 commits, rebased onto
main `7366b70` (2026-07-18). All work user-reviewed live over three feedback rounds; the final
prop-LOD design below is the user's settled call.
**Scope:** GPU-side only — lighting, shadows, sky, props, dust, quality tiers. No routing, carve,
physics, or world-gen changes. A world-gen/CPU worktree (corridor-heuristic router etc.) is in
flight in parallel — overlap analysis at the bottom.

## Final prop-LOD design (the biggest piece — read this before touching props)

Three chunk-ring zones around the camera, per quality tier (`QUALITY_PRESETS`, main.js):

| Zone | Radius (chunks) | Trees (aspen/pine) | Boulders | Bushes / rocks / small rocks / logs |
|------|-----------------|--------------------|----------|--------------------------------------|
| near | ≤ `lodRing` (L0/N1/H2/U2) | full 3D | full 3D | full 3D |
| far  | ≤ `propRing` (L1/N2/H3/U4) | **billboard impostors** | full 3D | full 3D |
| billboard-only | ≤ `bbRing` = ring+warm (L2/N3/H6/U8) | billboard impostors | **full 3D** (`BBONLY_3D_CATS`) | **not rendered** (sub-pixel at that range) |

- Impostors: one instanced-quad mesh per tree variant sampling a per-variant atlas
  (`src/props/prop-impostor.js`), baked in-browser at boot with the live sky-look lighting,
  re-baked on look change (`skySystem.onLookApplied`). Quads are cylindrical billboards built
  along each tree's OWN trunk axis (`aAxis` from the placement matrix) so the parametric lean
  survives the LOD swap; sun-side brightness modulation (`lod.litGain`, default 4.0, live GUI
  slider) approximates the lit face; quads pull 0.2×size toward the camera so cross-slope
  terrain doesn't depth-clip them ("buried" look).
- Boulders NEVER billboard (wide horizontal masses read badly as vertical quads from above) but
  persist as 3D to full `bbRing` distance — landmark visibility, ≤200 world-wide.
- Billboard-only chunks take **no shadow-bake tiles** (beyond the QUAL-18 fade reach; also keeps
  Ultra's radius from wrapping the 12×12 toroidal atlas). They bake on promotion into `propRing`.
- The outer ring streams ONLY when impostors are active → headless gates see the classic
  full-prop ring, byte-identical behavior. Tree capacities raised 4000→8000 per species for the
  Ultra 17²-chunk worst case.

## Everything else on the branch

1. **Baked-shadow stream-in hitch — root-caused and fixed** (`prop-shadow-bake.js`,
   `prop-system.js`): each tile bake was re-vertex-shading ALL ~25k live prop instances × 8
   tiles/frame. Now a per-tile scratch scene (3×3 chunk neighbourhood, ~1k instances) via
   `setTileSource`, fed from retained per-chunk placement records — so billboarded trees keep
   their baked ground shadows. Falls back to the old full-scene path if unwired (headless).
2. **Shadow atlas RGBA8 → R8** (Ultra 151 MB → 38 MB). `terrain.js` has exactly ONE changed
   line: the atlas sample `.a`→`.r` (search `PERF-21`).
3. **Partial instance uploads**: dirty-span `addUpdateRange` instead of full-capacity buffer
   re-uploads per chunk stream. Never `clearUpdateRanges` at flush — the renderer merges+clears
   on upload; clearing would drop spans when two flushes land between renders.
4. **Baked sky** (`sky.js`): Preetham rendered once per look change into a HalfFloat cubemap
   background (was a full-screen per-frame fragment cost). Live mode + bake res in the Sky GUI.
   Plus a below-horizon fog-coloured ground-fill disc in the bake scene (`GROUND_FILL_LIFT`
   eyeball constant) so the world doesn't read as a floating tile from altitude.
5. **Vehicle spotlights** (`vehicle-model.js`): `visible=false` at intensity 0 (6 spots + 2
   cookie samples were in every lit fragment's loop while dark); light-count shader variants
   precompiled at boot via `prewarmLightPrograms`/compileAsync (~55 programs post-boot is
   expected, not a leak).
6. **Dust**: 180 per-Sprite draw calls → 1 instanced billboard mesh. Custom ShaderMaterials must
   include `tonemapping_fragment`/`colorspace_fragment` manually (built-ins auto-append; dust and
   the impostor shader both do this).
7. **Tickets**: FEAT-06c (prop impostors) closed with resolution; PERF-22 (terrain geometry LOD
   — the last big vertex lever) and QUAL-20 (bake impostors from the sun's azimuth for a true lit
   face — deferred by user) opened.

## Debug/CDP handles added (keep — they're the fast probe for atlas bugs)

- `window.__impAtlasDump()` → PNG data-URL of the impostor atlas.
- `window.__impAtlasStats()` → per-tile content bounds vs expected (a healthy tile spans
  v ≈ [0.01, 0.99]; the "buried billboards" bug measured [0, 0.5] — camera-space vs world-space
  ortho frustum, see 456f169).

## Files touched

- `src/props/prop-system.js` — placement records, 3-mode pools, LOD sync, partial uploads,
  scratch bake scene, BBONLY_3D_CATS, capacities
- `src/props/prop-impostor.js` — NEW (atlas bake + billboard materials + debug handles)
- `src/props/prop-shadow-bake.js` — tile-source hook, R8 atlas
- `src/props/prop-debug.js` — '3D prop ring' + 'billboard lit gain' sliders
- `src/sky.js` — baked mode, ground fill, onLookApplied hook, GUI rows
- `src/dust.js` — instanced rewrite
- `src/vehicle-model.js` — spot visibility + prewarmLightPrograms
- `src/main.js` — QUALITY_PRESETS (lodRing/bbRing/propRing), applyQuality pushes, `_bbRing`,
  applyPropImpostors + `_syncImpostors` hook (boot / GUI rebuild / seed rebuild), prewarm call,
  loop passes `_bbRing` to propSystem.update
- `src/terrain.js` — ONE line (`.a`→`.r`)
- `src/water-render.js` — stale header comment only
- `data/flora.js` — `lod: { ring3d, litGain }` block
- `.planning/` — this handoff, tickets

## Overlap risks with the world-gen/CPU worktree

- **`src/terrain.js`**: my single line at the shadow-atlas 5-tap. If their branch touches that
  shader region, keep their structure + my `.r`.
- **`src/main.js`**: additive, localized edits (preset table values, one block in applyQuality,
  the applyPropImpostors block after applyPropShadowMode, one line each in the seed-rebuild prop
  block / GUI rebuild / frame-loop update call, prewarm call after the first rAF). Take both sides.
- **`data/flora.js`**: `lod` block appended at the tail.
- If their branch re-baked the route cache / changed road params: no interaction — this branch
  never touches routing or the route bundle.
- Everything under `src/props/`, `sky.js`, `dust.js`, `vehicle-model.js` is mine alone this cycle.

## Verify after merge

1. `npm run test:all` (34 gates — full suite was green on this branch 2026-07-17 pre-rebase;
   affected gates green after every later commit).
2. Boot at Normal: distant trees billboard past ~96 m and continue over ridge crests to the fog;
   trees LEAN with variety at all distances; no buried/floating trees on cross-slopes; boulders
   keep 3D shape at every distance.
3. Drive fast into fresh terrain: no shadow snap-in hitch.
4. Sky GUI → "baked sky (perf)" off/on: horizon unchanged. From a high peak, below-horizon shows
   the misty ground fill, not sky-void.
5. Headlight L-cycle + brake at night: no shader-compile hitch.
6. Perf sanity vs pre-branch main (A/B measured 2026-07-16: 255k→196k tris at a Normal static
   viewpoint, before the bbRing tree extension traded some of that back for draw distance).

## Known follow-ups (tickets filed, not blockers)

- QUAL-20: sun-azimuth impostor bake (billboards still darker than 3D from the sun side; the
  litGain slider is the stopgap).
- PERF-22: terrain geometry LOD (needs coordination with the world-gen worktree).
- Ultra's outer ring is ~289 scattered chunks (was 81) — time-sliced, but if fast driving at
  Ultra shows streaming cost, trim `bbRing` or add a trees-only scatter fast path.
