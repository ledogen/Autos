---
id: BUG-49
type: bug
status: closed
opened: 2026-08-15
closed: 2026-08-15
severity: major
source: user-observation (Windows machine, GitHub Pages build)
relates_to: FEAT-59 (model-service pink-cube fallback), FEAT-36 (debris), PERF-04 (Vite build),
  test/dist-assets.mjs
---

# BUG-49: Every model added after FEAT-60 renders as a pink cube in the DEPLOYED build

## Observed

On the Windows machine, playing the GitHub Pages build: thrown physics objects (rock, barrel) render
as pink cubes. Physics still runs on them correctly — only the visual is wrong.

## Cause

Not platform-specific and nothing to do with Box3D. `vite.config.js`'s `copyRuntimeAssets` plugin
copies URL-fetched runtime assets into `dist/` from a **hand-maintained allowlist**, and that list had
drifted badly — it named only `hilux.glb`, `news-roll.glb` and `trailer-home-a.glb`. Every model added
since (`test-rock`, `test-barrel`, `barrel-plastic`, `broken-car`, `drum-closed/-crushed/-open`,
`tent`, `winnebago`) was never added, so those nine 404'd in the deployed build and
`src/model-service.js` did exactly what it is designed to do: resolve to the loud 0.5 m pink-cube
fallback. Physics was unaffected because the collider comes from the registry record, not the GLB.

Dev could never catch it: the Vite dev server serves the whole project root, so the plugin is a
**build-only** code path. The bug was invisible on `npm run dev` and visible only on Pages.

## Fix

`vite.config.js` — the model directory IS the manifest now. The plugin enumerates
`assets/models/*.glb` with `readdirSync` instead of listing them; the explicit list keeps only the
two route bundles and `CREDITS.md`. Build verified: `dist/assets/models/` went from 3 GLBs to 12.

This also restores the CLAUDE.md promise that adding a vehicle/prop is *data-only* — dropping the
`.glb` in `assets/models/` is genuinely all it takes again.

## Gate

`test/dist-assets.mjs` (new, `infra`/`fast`): for every URL declared in `PROP_MODELS` and
`VEHICLE_MODELS`, assert the file exists on disk **and** that the copy plugin's rule covers it — and
assert the plugin still enumerates the directory, since reverting to an allowlist re-arms the drift.
Verified red against the pre-fix `vite.config.js`, green after.
