---
id: BUG-83
type: bug
status: fixed
severity: critical
opened: 2026-10-12
closed: 2026-10-12
source: owner recording (2026-10-12) — "crazy glitchy", truck climbed a ~47° cut bank beside a
  junction at full throttle and kept tumbling upward. Capture autos-capture-1791785045220
  (seed 2344865028, free roam, start (2157.9, 1248.1)).
relates: BUG-57 (polar-cap continuation at a run end), PERF contact-path hint reuse in
  terrain.js analyticNormal, BUG-76 (replay water no-go)
---

# BUG-83 — Truck wall-climbs a junction end-cap bank (wrong contact normal)

## Symptom

Off the road at full throttle into the cut bank beyond a run end, the truck climbs 35 m up a 47°
face, falls back, climbs again. Wheel loads flip 0 → 40–90 kN tick to tick. Mechanical energy
rises 350 J/kg in ~2 s (250–425 kW against a ~110 kW engine) — impossible physics.

## Root cause

Heights were right; the **normal** was wrong. The BUG-57 polar cap prices the junction wedge at
`lat' = max(|lat|, radius to the terminus)`, and the resolver froze that radius into the hit as
`endRadial`. `analyticNormal` resolves the road ONCE at the wheel centre and reuses the hit for its
four ±0.5 m finite-difference samples (the contact-path perf hint). The lateral re-projects per
sample but `endRadial` stayed at its centre value, so the slope term from the radius vanished:
the bank read ~6° instead of ~47°, leaning the wrong way. Struts pushed straight up, tire force
acted in a near-flat plane, gravity never resisted along the slope — the truck climbed the cut
like a ladder.

| point x | true slope | slope the wheels saw |
|---|---|---|
| 2178 | 47.2° | 6.8° |
| 2185 | 47.0° | 5.9° |
| 2193 | 63.1° | 45.4° |

Headless proof: hint on the **normal only** reproduces the climb (y 174 m, +415 J/kg); hint on the
height only does not; no hint → honest stall at 47° tilt with ~3 kN/wheel and roll-back.

The mesh and `rd_gh` never saw it (they resolve per point), so MESH == PHYSICS gates stayed green.
The replay harness could not see it either: `terrain-headless.mjs` ignored `nrHint`, and the event
path of `physics-replay.mjs` built its road without the water no-go (BUG-76 put it only in the
`place` path), failing the terrain self-check by 29 m before anything else ran.

## Fix

- `src/road.js _carveCrossSectionBlended`: recompute the radius live as
  `hypot(wx − nr.point.x, wz − nr.point.z)` instead of reading `nr.endRadial` (equal to 7e-15 at the
  resolved point, so mesh and `rd_gh` are unchanged; only the hinted off-centre samples move).
- `test/lib/terrain-headless.mjs`: thread `nrHint` exactly as `terrain.js` does, including the
  one-hit-for-four-samples normal.
- `test/lib/physics-replay.mjs`: wire `setWaterNoGo` on the event path.

## Verification

- Hinted headless replay of the capture after the fix: stall at 47° tilt, y 138 m vs the
  recording's 165 m, energy bounded, ~3 kN per wheel.
- `node test/replay.mjs <capture>`: terrain self-check 0.0000 m over 889 frames (was 29.4 m).
- `npm test`: 44/46 green; the two reds are the known road-tunnel (BUG-77) / road-clearance (FEAT-77).
