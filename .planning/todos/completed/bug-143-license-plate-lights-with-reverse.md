---
id: BUG-143
type: bug
status: done
severity: minor
opened: 2026-11-07
source: owner, 2026-11-07 tracker inbox
relates: vehicle-model.js material substrings, ASSETS.md (stable material names)
---
lane: C

# BUG-143: the licence plate lights up with the reverse lamps

Owner, verbatim (2026-11-07 tracker inbox): "license plate lights up when the reverse lights do. obviously they should be different materials"

## Acceptance

- [x] The plate has its own material (the model and the substring match), and only the reverse lamps light in reverse.

## Resolution (2026-11-07, Lane C)

**Cause.** One white material, `RangerLens`, served the headlamps, the reverse lenses AND the rear plate.
vehicle-model.js `splitRearGroup` lights every face of `reverse.material` whose centroid is behind `rearZ`
(data/vehicle-models.js: `{ material: 'RangerLens', rearZ: 0 }`). The plate was 12 of those 52 rear faces.

**Fix.** `assets/models/src/ranger.py` gives the plate its own material, **`RangerPlate`**: same colour, roughness
0.45 (painted sheet). The substring match needed no change, since `'RangerPlate'` never contains `'RangerLens'`. It now
finds 40 rear faces, all of them lamp.

- `assets/models/ranger.glb` re-exported headless. Before the change the export was byte-identical to the committed
  file, so the only difference is the plate's material. Still 4002 tris, now 10 materials, and every audit is ok.
- **Gate:** `test/vehicle-lamps.mjs` checks every rear face of a model's reverse material against the ±0.3 m centre
  band where a plate hangs. It FAILS on the old .glb (12 faces in the band) and passes on the new one.
