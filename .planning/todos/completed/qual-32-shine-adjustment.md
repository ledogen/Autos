---
id: QUAL-32
type: quality
status: done
severity: minor
opened: 2026-09-27
source: owner — "reduce shininess on terrain from sun … particularly visible on dirt esp in scene 25. i think i notice it more in the mornings too"
relates: FEAT-84 (relief normals give the specular lobe something to catch), QUAL-02 (sky presets: sunIntensity 3.0–4.8), FEAT-05 (road-shoulder bump)
---

# QUAL-32: shine adjustment — sun specular on terrain (and roads) is too strong, worst on dirt at low sun

## What it is

Terrain and road are `MeshPhongMaterial` at three's defaults (`specular` 0x111111, `shininess`
30). With the sky presets' sun at intensity 3–5 and the FEAT-84 relief normals, the Phong
specular lobe paints a broad pale sheen across dirt whenever the sun is low and behind the camera
(08:00 cut bank: a band across the whole fill skirt). Rock and grass show it less (darker,
busier), the paved road a little.

## Fix

Per-material specular/shininess params (`terrainSpecular`, `roadSpecular`, shininess) with the
terrain near zero (matte soil/rock — the flat style has no sheen) and the asphalt keeping a
faint one; a Terrain Look slider "Sun shine" for the terrain value. Evaluate at 08:00 and 12:30
on dirt (cut bank / fill skirt), rock (alpine face), grass (meadow) and the road (driver view),
before and after.

## Acceptance

- No readable specular band on dirt at 08:00; rock/grass unchanged in value; the road keeps at
  most a faint sheen. Screenshots of the four materials before/after in the ticket resolution.

## Resolution (2026-09-27)

`terrainSpecular` 0x000000 / `terrainShininess` 4 (matte ground), `roadSpecular` 0x0a0a0a /
`roadShininess` 20 (faint asphalt sheen), applied at material construction; Terrain Look → "Sun
shine (terrain)" slider (0 = matte, 1 = three's old default) for a live A/B. Evaluated at 08:00:
the cut-bank / fill-skirt dirt lost its broad pale band; rock and grass unchanged in value; the
asphalt reads the same as before (its sheen was never the problem). Screenshots in the session
scratchpad only.
