---
id: ASSET-67
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-96 (the farm POI — source of produce freight), ASSET-15 (the produce stall, the farm's
  placeholder until this set ships), ASSET-65 farmhouse · ASSET-66 barn · ASSET-67 tractor (the farm set)
---

# ASSET-67: Tractor

**Yard clutter** — parked at the farm, part of the farm-yard composite (FEAT-96). Static, not drivable.

## Request

A small, old utility tractor without a cab: saturated paint (red or green), big rear wheels, small front wheels, an exhaust stack, a seat on a sprung post. It should read as a working farm machine, not a toy.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤600** |
| Materials | flat colours per ART-STYLE.md, faceted; desaturated nature, saturated man-made |
| Real size | ~3.2 × 1.6 m footprint, ~2.0 m tall (no cab) |
| Origin | base-seated, centred on the footprint |
| Forward | −Z (the side that faces the road) |
| Collision | one box for the body; the wheels are part of it |

## Acceptance

- `assets/models/tractor.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Composites cleanly into the farm-yard model with the other two and the produce stall (FEAT-96
  "The farm"), the way `splitting-yard.glb` composites the awning.
