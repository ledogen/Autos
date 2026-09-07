---
id: BUG-62
type: bug
status: pending
severity: major
opened: 2026-09-07
source: split out of BUG-60 by its handoff — measured while fixing it; this is the one that leaks continuously while DRIVING, not just on the menu stage
relates: BUG-60, BUG-61, FEAT-48, QUAL-25
---

# BUG-62: every hull `replaceHullLocal` ever built is retained until `dispose()`

## Measured

`src/physics-engine.js` pushes every `b3CreateHull` result into `this._hulls` and frees the array
only in `dispose()`. Nothing prunes it when the shape that used the hull is destroyed.

FEAT-41 menu stage, 40 scripted drops (`node test/bug60-rock-contact.mjs`):

```
_hulls retained    294 → 11288          (~275 per drop)
```

and in a longer run of the same script, `354 → 15841`. **This is not a menu-stage artefact.** The
source is `updateWheelRims` → `replaceHullLocal`, which fires whenever a strut moves 4 mm — so it
leaks continuously while the player is *driving*, at roughly 55 hulls per second per working wheel.

The practical consequence was hit during the BUG-60 session: a headless Chrome running the
reproducer, plus the dev server, was killed by the OS for memory pressure with the page carrying
~15 000 live hulls.

## What is NOT yet established

`addCylinder`'s comment asserts the shape copies the hull data ("hull data is shared/copied by the
shape; free on dispose"), which would mean each hull can be destroyed immediately after its shape
is created. **That has not been verified against the vendored bindings, and a wrong call here is a
use-after-free that presents as random garbage collisions — much worse than a leak.** Verify before
shipping.

Evidence gathered but NOT sufficient to close on: an experimental `replaceHullLocal` that destroyed
the retired hull right after creating the replacement kept `_hulls` flat (8 → 50 over 12 churn
cycles), and the physics gates stayed green. That is consistent with the data being copied, but a
use-after-free can be silent, so it is a lead, not a proof.

## Fix

Establish the ownership rule from the bindings/engine source first. Then either:
- destroy the retired hull in `replaceHullLocal` and the body's hulls in `destroyBody` (if copied), or
- keep a per-shape owner reference and free on shape destruction (if shared).

Either way `_hulls` becomes a bounded set, and `dispose()` stops being the only reclaim path.

## Acceptance

- The ownership rule is stated in a comment at `addHull`/`addCylinder`, sourced from the bindings.
- `_hulls.length` is bounded across a long churn run (extend `test/collider-seam-churn.mjs`, which
  already runs ~5760 shape rebuilds — assert the retained count does not grow per cycle).
- `node test/bug60-rock-contact.mjs --drops=40` shows `_hulls retained` flat rather than ~11 000.
- Physics gates + `box3d-determinism-gate` green; no change in contact behaviour.
