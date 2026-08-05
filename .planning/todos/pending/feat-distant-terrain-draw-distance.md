---
id: FEAT-56
type: feature
status: open
opened: 2026-08-01
severity: major
relates_to: campsite view score (src/camp.js skylineView), PERF-21 (GPU pass), story mode (DESIGN.md — site quality)
---

# FEAT-56: Distant terrain — the world ends at 160 m

## The finding

Measured 2026-08-01 while building the campsite view score. The rendered world is far smaller than
the simulated one, and nothing currently tells the player otherwise:

| | distance |
|---|---|
| Terrain mesh exists | **~160 m** (`RING_RADIUS` 2 × `CHUNK_SIZE` 64, +½ chunk); ~288 m on Ultra (ring 4) |
| Fog (`FogExp2`, density 0.006 Normal / 0.003 Ultra) | 76% opaque at 200 m, **96% at 300 m** (Normal) |
| Camera far plane | **1000 m** hard clip (`main.js`, `new THREE.PerspectiveCamera(60, …, 0.1, 1000)`) |

There is no distant-terrain LOD in `src/` — no far shell, no horizon mesh. The chunk ring is the
whole visible world, and the fog is tuned to hide its edge rather than to sit in front of anything.

## Why it matters now

The campsite view score (`skylineView`) judges how much of your field of vision is filled by terrain
that is extremely far away — its reach is 2 km and its "fully far" distance is 1200 m, i.e. *past the
camera's far plane*. It samples `rawHeightWorld`, which is analytic and defined everywhere, so it
scores mountains that are never drawn. Measured over campable ground the score spreads properly
(median ~0.1, p90 ~0.75, 4–9% maxing out), so it is ranking real differences in the height field —
but out of the windshield a 1.0-view campsite and a 0.0-view campsite both end in haze at ~200 m.

The owner ratified keeping the scan at 2 km rather than shrinking it to the fog (2026-08-01): the
score is knowingly ahead of the renderer, and shrinking it would reduce "an epic view" to "you can
see 200 m", which is not the thing worth scoring. This ticket is the other half of that decision.

This is not only a camping concern — it is the reason the world reads as a corridor rather than a
landscape from any high road.

## Acceptance

- Terrain is visible to at least ~2 km, at whatever fidelity is cheap: a coarse far shell built from
  the same `rawHeightWorld` noise, well below chunk resolution, outside the streaming ring.
- Camera far plane raised to cover it.
- Fog re-tuned so it reads as *atmosphere over distance* rather than as a curtain hiding the ring
  edge — it must not swallow the new terrain it exists to blend.
- MESH == PHYSICS is NOT required here and must not be attempted: the far shell is scenery only,
  never collided against, never resolved. The chunk ring stays the authority for anything the truck
  can touch.
- Costs nothing measurable on the frame budget (target 60 fps mid-range laptop, CLAUDE.md) — one
  coarse mesh, rebuilt rarely, no per-frame work.
- Quality presets keep a lever: the far shell scales down or off on Low.

## Notes / prior art in-repo

- The noise is already available carve-free and window-invariantly via `TerrainSystem.rawHeightWorld`
  — the same sampler `skylineView` walks. A far shell needs no new worldgen, only new geometry.
- Road carve, water carve and props are all irrelevant at this range; the shell wants raw noise only.
- PERF-21's baked-sky and impostor work is the closest precedent for "cheap thing far away".
- Verify by eye from a high campsite the view score rates near 1.0 — those coordinates are now easy
  to find (see the campable-population sweep described in `CAMP_PARAMS.campViewShapeLo/Hi`).
