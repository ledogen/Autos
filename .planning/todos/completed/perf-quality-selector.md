---
id: PERF-06
type: perf
status: done
opened: 2026-06-29
resolved: 2026-06-30
severity: minor
source: user-request
note: "Master Quality selector that SUPERSEDES the existing 'Draw Distance' dropdown (Near/Normal/Far/Ultra, buried in the Terrain folder). The draw-distance preset becomes one input to a top-level Quality tier that ALSO drives shadows, prop render radius, and internal render resolution. User decisions LOCKED at capture: (1) replace & fold in (one master control, remove the old dropdown); (2) resolution is a FIXED internal-resolution cap (e.g. 720p on Low), implemented as a fractional pixelRatio = min(devicePixelRatio, targetH/innerHeight) — NOT a DPR multiplier. Normal/High/Ultra preserve today's look; LOW is the only genuinely new behaviour. (3) roadRadius becomes DERIVED from the ring — `(ring+0.5)·128` = 2× terrain axis half-width — keeping Low/Normal byte-identical (192/320) but trimming the High/Ultra outliers (512→448, 640→576) with no visible change, since the ribbon is terrain-bound and the trimmed area was beyond the rendered corner."
---

# PERF-06: Master Quality selector (Low / Normal / High / Ultra)

## Resolution (2026-06-30, uncommitted — 23 gates green)

Implemented as specified, with one deviation (resHeight, see the table note). Changes:
- **`src/main.js`** — `DRAW_DISTANCE_PRESETS` → `QUALITY_PRESETS` (Low/Normal/High/Ultra) with new
  `shadows` / `propRing` / `resHeight` fields; `applyDrawDistance` → `applyQuality`; new
  `applyRenderResolution()` (fractional-pixelRatio cap, `_qualityResHeight` module var); derived
  `roadRadius = (ring+0.5)·2·CHUNK_SIZE` (CHUNK_SIZE already imported from road.js); `PROP_RING` const →
  mutable `_propRing`; loop reads `_propRing`; per-frame shadow-follow guarded on `sun.castShadow`; resize
  handler now calls `applyRenderResolution()`; initDebug callback renamed.
- **`src/debug.js`** — removed the Terrain-folder Draw Distance dropdown; added a root-level **Quality**
  dropdown (default Normal) wired to `callbacks.applyQuality`.
- Stale-comment fixes in `src/main.js` + `src/terrain.js`.

**Verified headless:** `npm test` → all 23 gates green (presets live in main.js, which gates don't import;
no regression). On-load path unchanged (applyQuality not called at startup; baseline = Normal == today).

**Remaining = manual in-browser confirm** (can't be done headlessly): fps gain on Low vs Ultra; shadows
vanish/return without a recompile hitch; props thin on Low; 720p softening + survives resize; no carve-pop
at warm-margin corners when driving fast on High/Ultra (the derived-roadRadius trim risk).

## Symptom / motivation

There is no single "make it run faster" control. The only perf knob is a **Draw Distance** dropdown
(Near/Normal/Far/Ultra) hidden inside the Terrain folder (`src/debug.js:157-177`) that bundles terrain
ring + road stream radius + fog density + detail-shader scale (`DRAW_DISTANCE_PRESETS`, `src/main.js:809`).
It does not touch the other big GPU costs — **dynamic shadows**, **prop scatter radius**, or **render
resolution** — so a weak-GPU user has no honest "Low" escape hatch.

Promote that preset into a **top-level master Quality selector** that strips every non-gameplay cost on
Low while leaving Normal/High/Ultra at today's look.

## Scope / what changes

Extend the existing draw-distance preset into a `QUALITY_PRESETS` master keyed **Low/Normal/High/Ultra**.
Normal/High/Ultra rows = today's Near→Ultra draw-distance values verbatim (so existing behaviour is
untouched; "high and ultra are just fine" per user). Only **Low** is new.

| Field | Low | Normal | High | Ultra | Drives |
|---|---|---|---|---|---|
| `ring` / `warm` | 1 / 1 | 2 / 1 | 3 / 3 | 4 / 4 | terrain chunk radius (`setRingRadius`) |
| `roadRadius` (derived) | 192 | 320 | **448** | **576** | road **route/slice** radius (`setRadius`) |
| `fogDensity` | 0.012 | 0.006 | 0.004 | 0.003 | view distance (`scene.fog.density`) |
| `detailScale` | 0 (kills fbm) | 1.0 | 1.0 | 1.0 | per-pixel terrain/road shader |
| `shadows` | **false** | true | true | true | `sun.castShadow` |
| `propRing` | **1** | 2 | 2 | 3 | `propSystem.update()` radius |
| `resHeight` | **720** | null | null | null (native) | internal render resolution (pixelRatio) |

> **resHeight decision (deviation from the original 1080/1440 proposal):** capping Normal/High/Ultra
> would change on-load + higher-tier resolution on HiDPI screens, violating the "byte-identical on load"
> + "high/ultra are just fine" acceptance. Final: **only Low caps (720p)**; Normal/High/Ultra stay
> device-native (`resHeight: null` → `setPixelRatio(devicePixelRatio)`, exactly today). Low is the sole
> new render-resolution behaviour.

### `roadRadius` is now DERIVED from the ring, not a hand-tuned constant

`roadRadius` is **not a draw distance** — the road ribbon you *see* is built per active terrain chunk
(`roadMeshSystem.syncToChunkRing(terrainSystem.getActiveChunkKeys())`, `src/main.js:1291`) and is bounded
to the terrain ring ±1 tile (`roadTileKeepMargin`). `roadRadius` (`roadSystem.setRadius`) only sets how
far the road **network centerlines are routed + sliced** off-screen — a main-thread CPU cost whose work
scales with the circle's *area*.

A road circle has to enclose the *square* terrain ring out to its diagonal **corner** (axis × √2 ≈ 1.41),
plus a lead margin so a road is fully routed before it scrolls into view. Low/Normal already sit at
`road ÷ axis ≈ 2.0` (= corner × 1.41 lead); **High/Ultra were the outliers at 2.3× / 2.2×** — routed ~12%
farther than anything that can ever be rendered. Replace the four hand-tuned constants with:

```
roadRadius = (ring + 0.5) · 2 · CHUNK_SIZE      // = (ring+0.5)·128  (CHUNK_SIZE = 64)
```

→ Low 192, Normal 320 (**both byte-identical to today**), High 512→**448**, Ultra 640→**576**. Cuts
route/slice area ~23% on High/Ultra (radius² ratio: 448²/512² ≈ 0.77, 576²/640² ≈ 0.81) for **zero visible
change** — everything trimmed was beyond the rendered terrain corner. Tie it to `ring` so it can never
drift out of sync with the terrain extent again.

**Risk to verify:** today's High `roadRadius` (512) already sits *below* the generated-ring corner
(ring+warm = 6 chunks → corner ≈ 588 m), so warm-margin corner chunks already stream their road lazily as
they approach the visible ring — apparently fine. 448 stays comfortably above the *visible* corner (317 m),
so all rendered terrain keeps full road coverage, but confirm no brief carve-pop appears at a warm-margin
corner when driving fast on High/Ultra (drive a straight diagonal at speed, watch the leading corner).

### What Low disables (none of it touches gameplay)

1. **Dynamic shadows off** — flip `sun.castShadow = false` (NOT `renderer.shadowMap.enabled`, which forces
   a material/shader recompile; toggling the light's flag skips the shadow pass cleanly). Also
   short-circuit the per-frame shadow-frustum-follow block in the loop (`src/main.js:1262-1265`) when off.
2. **Prop render radius 2→1** — 4× fewer prop chunks scattered/streamed (`PROP_RING`, `src/main.js:78`,
   passed to `propSystem.update()` at `:1282`).
3. **720p internal resolution** — `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 720 /
   window.innerHeight))`. Fractional pixelRatio < 1 pins the backing buffer to ~720 lines tall
   (aspect-correct), the GPU shades ~4×+ fewer fragments on a HiDPI/1440p panel, and the `Math.min`
   clamp prevents upscaling past native on a small/1080p window. Softer image, zero functionality lost.
4. **Detail fbm shader off** (`detailScale 0`) + tightest fog + smallest terrain/road radius — inherited
   from today's "Near".

## Implementation notes

- **`src/main.js`**
  - `DRAW_DISTANCE_PRESETS` → `QUALITY_PRESETS`, rekeyed Low/Normal/High/Ultra, new fields added.
  - **Drop the per-tier `roadRadius` constant**; compute it in `applyQuality` from the tier's `ring`:
    `roadSystem.setRadius((p.ring + 0.5) * 2 * CHUNK_SIZE)` (import `CHUNK_SIZE` from `terrain.js`, or
    hardcode 128 with a comment). This is what makes Low/Normal byte-identical (192/320) while trimming
    High/Ultra (448/576) — see the "roadRadius is now DERIVED" section above.
  - `applyDrawDistance(name)` → `applyQuality(name)`: keep the existing ring/fog/detail logic; add the
    derived `setRadius` above, `sun.castShadow`, write the `_propRing` module var, and call a new
    `applyRenderResolution()` helper.
  - `const PROP_RING = 2` → mutable `let _propRing = 2`, written by `applyQuality`; loop reads `_propRing`.
  - Resize handler (`:1379`) must call `applyRenderResolution()` — the 720p cap depends on `innerHeight`,
    so it has to be re-applied on every resize (handler currently re-`setSize`s but never re-`setPixelRatio`s).
  - Loop shadow-follow (`:1262`): guard on `sun.castShadow` so it no-ops when shadows are off.
  - Update the `initDebug` callback object (`:836`): `applyDrawDistance` → `applyQuality`.
- **`src/debug.js`**
  - Remove the `drawDistance` dropdown from the Terrain folder (`:157-177`).
  - Add a **root-level** `Quality` dropdown `['Low','Normal','High','Ultra']` as the first control in
    `buildPanel` (user: "root up top is fine"), wired to `callbacks.applyQuality`. Default **Normal**
    (preserves current on-load behaviour — Normal == today's default ring 2 / road 320 / fog 0.006).

## Constraints / risk

- **Runtime shadow toggle:** use `sun.castShadow`, not `renderer.shadowMap.enabled` — the latter recompiles
  every material on toggle (visible hitch). Receivers keep `receiveShadow`; with the caster off they simply
  receive nothing. No recompile.
- **Headless gates unaffected:** `npm test` gates construct no renderer/GUI and never call `applyQuality`;
  keep `QUALITY_PRESETS` pure data so importing `src/main.js`-adjacent modules stays side-effect-free.
  (The presets live in `main.js`, which the gates don't import — confirm no gate regresses anyway.)
- **`propRing ≤ terrain ring`** invariant (noted at `src/main.js:76`): Low ring=1/propRing=1, Ultra
  ring=4/propRing=3 — all satisfy it.

## Acceptance

- [ ] Single top-level **Quality** selector (Low/Normal/High/Ultra) at the GUI root; old Terrain-folder
      "Draw Distance" dropdown removed. Default Normal; on-load behaviour byte-identical to today.
- [ ] Selecting **Low** at runtime: shadows disappear, props thin out (radius 1), terrain/road radius +
      fog tighten, detail shader off, and the internal render resolution drops to ~720p (visibly softer on
      a HiDPI screen). Switching back up restores each.
- [ ] `roadRadius` is derived `(ring+0.5)·128`, not a stored constant: Low=192 / Normal=320 unchanged;
      High=448 / Ultra=576 (trimmed ~12% radius / ~23% route-area). No visible road change on any tier;
      no carve-pop at warm-margin corners when driving fast on High/Ultra.
- [ ] 720p cap survives a window resize (resize re-applies the clamped pixelRatio).
- [ ] No shader-recompile hitch when toggling shadows (uses `sun.castShadow`).
- [ ] `npm test` stays green.
- [ ] In-browser: measurable fps gain on Low vs Ultra (stats.js), no broken gameplay (drive, collide with
      props, road surface intact).

## Files

- `src/main.js` (`QUALITY_PRESETS`, `applyQuality` + `applyRenderResolution`, `_propRing`, resize hook,
  loop shadow-follow guard, initDebug callback rename)
- `src/debug.js` (remove Terrain draw-distance dropdown; add root-level Quality dropdown)

## Relationships

- **PERF-03** (completed) — built `DRAW_DISTANCE_PRESETS` (ring + warm + road radius + fog + detailScale).
  PERF-06 absorbs it as the draw-distance input to the broader Quality tier; does not undo it.
- **PERF-05** (completed) — found residual low-end stutter is render/GPU-bound (Near + detailScale 0 +
  chunk pooling). PERF-06's Low tier extends that same insight (shadows off + 720p + prop radius) into one
  user-facing control.
- **FEAT-14** (cast vehicle lights, closed) — owns SpotLight shadow toggles (`HEAD_TUNE.shadows`, default
  off). Out of scope here; PERF-06 only touches the directional `sun` shadow. Could later be folded into
  the Low tier as a follow-on.
