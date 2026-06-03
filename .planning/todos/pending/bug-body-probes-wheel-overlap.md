---
id: BUG-05
type: bug
severity: moderate
status: open
opened: 2026-06-03
---

# BUG-05: Body collision spheres overlap wheel hubs at low ride height / lowered suspension

## Symptom

When `suspensionBodyOffset` or `suspensionRestLength` is tuned to lower the car significantly (e.g. sports car layout), the undercarriage body-contact spheres that sit adjacent to and between the wheel positions begin to overlap with the wheel hub spheres. This causes apparent wheel lift-off even when the car is sitting on flat ground (visible in the Pacejka slip plot — wheels going airborne while car is clearly grounded). Weird suspension jitter follows.

Additionally, the two center undercarriage probes (`{ x: 0, y: undY, z: ±0.3 }`) have a small footprint and the car tends to get "hung up" on them when sliding over obstacles or edges.

## Root cause analysis

### Probe positions (from `src/suspension.js` `getBodyContactPoints`)

```js
const undY  = params.wheelRadius - params.cgHeight  // undercarriage bottom
const trkW  = params.trackFront / 2                 // lateral position = exactly at-wheel
```

The four undercarriage probes (lines ~398–402) are placed at `x = ±trkW` — **exactly at the same lateral position as the wheel hub center** — and at `y = undY = wheelRadius - cgHeight`. At default cgHeight (~0.55 m) and wheelRadius (0.368 m), `undY ≈ -0.18 m` (body-local), which is well above the wheel centers. But when cgHeight is reduced (car lowered) or wheelRadius is small, `undY` drops toward the wheel equator, and the spheres of radius 0.15 m from the undercarriage probe overlap the wheel hub probe.

### The hub probe position

Wheel hub probes are placed at approximately `x = ±trackFront/2` laterally. The wheel radius also positions the contact point. When lowered:
- Undercarriage probe: `(±trkW, undY, near_axle_z)` with r=0.15 m  
- Hub probe: `(±trackFront/2, hubY_world, axle_z)` with r = wheelRadius (0.368 m)

At low ride height these spheres' influence regions overlap, and the impulse solver registers a false contact between them during ground contact resolution.

### Center probe hang-up

`{ x: 0, y: undY, z: ±0.3 }` places two small-radius probes at the centerline. When the car slides over a ramp edge or rock, these can catch on sharp geometry transitions because the center has no lateral clearance.

## Candidate fixes

1. **Move undercarriage probes inboard**: Change `trkW` for undercarriage points to `trkW * 0.65` (about 2/3 of half-track). This keeps them inside the wheel sweep at any ride height.
2. **Raise undercarriage probes**: Floor undY at a minimum that keeps clearance from wheel equator: `undY = max(wheelRadius - cgHeight, -0.05)` or parameterize as `undY = params.bodyUndertrayY ?? (wheelRadius - cgHeight)`.
3. **Widen center probes**: Replace the two `x=0` center points with four points at `x = ±0.2` to give a wider base that is less likely to catch on edges.
4. **Add a `suspensionBodyOffset`-aware adjustment**: When `suspensionBodyOffset` is negative (lowering), automatically shift the undercarriage probe Y up by the same offset to maintain clearance.

## Affected files

- `src/suspension.js` — `getBodyContactPoints` function (~line 381)
- `data/ranger.js` — `bodyContactRadius` (currently 0.15 m)

## Repro

1. Open debug panel, Suspension folder
2. Set `Front Body Offset` and `Rear Body Offset` to −0.10 m (maximum lowering)
3. Reduce `Front Travel` and `Rear Travel` to ~0.08 m
4. Observe the Pacejka slip plot — front wheels may show intermittent airborne gaps
5. Enable body contact debug spheres (backtick) to see visual sphere positions
