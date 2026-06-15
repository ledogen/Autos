---
id: BUG-13
type: bug
status: resolved
opened: 2026-06-14
resolved: 2026-06-14
source: phase-09-insim-verify
severity: high
---

> RESOLVED 2026-06-14 (`85b57ac`), confirmed in-sim by user. Removed the fillHeight cap from physics
> + carve so they track the true ribbon grade — no more causeway fall-through. Steep-fill-shoulder
> cosmetic follow-up still noted below.

# BUG-13: Physics falls through to terrain on raised-causeway road sections (undriveable)

## Request

Where the terrain falls away from the road (the road becomes a raised causeway / fill embankment),
the **collision surface drops and follows the terrain** instead of the road, so the truck falls through
the visible road. Makes those sections undriveable. (User images 2026-06-14.)

## Root cause (confirmed in code)

A `fillHeight` cap (`roadFillHeight`, default **2 m** — D-07 "low 1–2 m causeway on rolling ground")
is applied to the **physics** surface and the **terrain carve mesh**, but NOT to the visible ribbon:

- **Ribbon (visible):** `src/road-mesh.js:582` `designGradeY[_i] = _pt.y` — the true routed grade, NO cap.
- **Physics:** `src/road.js:1666-1667` `let designY = nr.point.y; if (delta > fillHeight) designY = rawAmp + fillHeight`.
- **Terrain carve:** `src/terrain.js:1024-1026` `if (delta > fillHeight) carveTargetY = rawH + fillHeight`.

So when the road grade is more than `fillHeight` above the raw terrain (a real causeway over falling
ground), physics and the carved foundation are clamped to `terrain + 2 m` and dive into the valley
following the terrain, while the asphalt ribbon stays level at grade. The truck rides the clamped
(terrain-following) surface → it sits/falls ~grade−(terrain+2 m) below the visible road. Height-agreement
violation on all fill sections taller than `fillHeight`.

## Fix directions (needs a small design decision)

- Decal contract says **physics rides the ribbon** → remove the `fillHeight` clamp from `_sampleCarveWorld`
  so physics tracks the true ribbon grade. The clamp's original intent (don't pile dirt high on gently
  rolling ground) is a *foundation-visual* concern, not a physics one.
- For the terrain carve mesh: either drop the cap too (let the dirt foundation rise to meet the ribbon —
  bigger embankments) or keep a capped foundation but ensure the ribbon's edge **skirts** span the gap so
  there's no visible/physical hole. Don't let the carve cap pull physics down.
- Make ribbon, physics, and carve use ONE grade source + ONE cap policy (height-agreement).

## Status (2026-06-14): FIXED (`85b57ac`), pending in-sim confirm

Removed the `fillHeight` cap from BOTH `_sampleCarveWorld` (physics) and `_buildCarveTable` (carve
mesh). Physics + foundation now track the true uncapped ribbon grade → no fall-through, height-agreement
on tall fills. On rolling ground (delta < fillHeight) the cap never fired, so no change there.

**Cosmetic follow-up (not blocking):** on a TALL causeway the fill shoulder drops from road grade to
terrain over `shoulderWidth` (~2.5 m), so the dirt slope is steep (near-vertical for big fills), and the
toe beyond `maxExt` can truncate (the carve query radius still sizes from the capped `fillHeight*fillSlope`).
Road surface is solid/driveable; only the embankment *look* is rough on tall fills. If wanted, size
`maxExt` + the fill toe from the actual local delta, or grade the shoulder over a longer run.

## Acceptance

- On a causeway crossing falling terrain, the truck stays ON the visible road (no fall-through).
- analyticHeight on the ribbon == ribbon vertex Y within tolerance on fill sections >2 m.
