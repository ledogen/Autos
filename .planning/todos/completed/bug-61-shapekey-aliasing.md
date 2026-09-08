---
id: BUG-61
type: bug
status: done
severity: minor
opened: 2026-09-07
closed: 2026-09-07
source: split out of BUG-60 by its handoff — one of three defects found in the adapter seam, and the only one of the three that has not yet caused an observed failure
relates: BUG-60, BUG-62, FEAT-48
---

> ## RESOLVED 2026-09-07 (folded into the BUG-60 branch)
>
> `_shapeKey` now multiplies by `2**32` instead of `0x10000`, so a recycled slot's generation cannot
> reach the next slot's key (exact for index1 up to ~2M, well inside `Number.MAX_SAFE_INTEGER`).
>
> Two of the three maps it fed are **gone entirely**: `_shapeHulls` and `_shapeSizeR` moved onto the
> body record, indexed by shape slot, so they die with the body and cannot alias at all.
> `_shapeToHandle` survives because engine contact callbacks hand us a shape id and nothing else.
>
> Gated in `test/collider-seam-churn.mjs`, which sweeps the 65535/65536 boundary against `_shapeKey`
> **as the pure function it is**. An earlier draft drove a real slot past 65536 generations with
> ~70k engine rebuilds; that is slow and stresses the engine rather than the invariant, and it was
> what surfaced the double free recorded in BUG-62.

# BUG-61: `_shapeKey` aliases silently once a shape slot's generation passes 65535

## The defect

`src/physics-engine.js`:

```js
_shapeKey (shapeId) { return shapeId.index1 * 0x10000 + shapeId.generation }
```

Two different live shapes get the SAME key as soon as any slot's `generation` exceeds `0xFFFF`:
slot *n* at generation 65536 collides with slot *n+1* at generation 0. Nothing asserts the bound,
and every one of the shape-keyed maps (`_shapeToHandle`, `_shapeHulls`, `_shapeSizeR`) would then
hand one shape's data to another.

## Why it is a slow fuse and not a hypothetical

`updateWheelRims` (`src/physics.js`) rebuilds a wheel-core hull whenever a strut moves 4 mm, and
`replaceHullLocal` destroys the old shape and creates the replacement in the SAME recycled slot —
so that slot's generation is monotonically climbing for as long as the game runs. Measured on the
FEAT-41 menu stage: **~380 hull replacements per 7-second drop**, i.e. roughly 55 per second per
wheel while the suspension is working. At that rate a single slot reaches generation 65536 in the
order of twenty minutes of driving — well inside one story-mode run.

Nothing has been observed to break yet, because a session has not been driven long enough with the
maps under scrutiny. That is the whole reason to fix it before it is a bug report.

## Fix

Widen the shift so the key cannot alias for any reachable generation (`index1 * 2**32 + generation`
exceeds `Number.MAX_SAFE_INTEGER` only past 2M slots, so it is safe), or assert the bound at
registration and fail loudly. Prefer the widened key — an assert converts a silent corruption into
a crash, which is better, but a key that cannot collide is better still.

## Acceptance

- A key derived from (index1, generation) is unique for generation values up to at least 2**32.
- A gate drives one shape slot past 65536 generations (a tight `replaceHullLocal` loop — no stepping
  needed) and asserts that no OTHER live shape's map entries were disturbed.
- `npm test` physics gates stay green; `box3d-determinism-gate` unchanged.
