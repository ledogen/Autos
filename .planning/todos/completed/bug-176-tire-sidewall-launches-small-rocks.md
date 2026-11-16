---
id: BUG-176
type: bug
status: closed
severity: major
opened: 2026-11-15
source: owner, 2026-11-15 — "at low speed, below 5 miles per hour, if I rub the sidewall of the truck's tire up against a box 3D small rock ... it launches the rock off the tire at pretty high speed and in some cases even pops the tire. My best guess is this has to do with the spherical box 3d collision solver we use for modeling tire collisions with rigid bodies. I imagine there are also adverse side effects of this at high speeds."
---
lane: B

# BUG-176: Tire sidewall launches small rocks at low speed, can pop the tire

## Next steps
Landing on land/bug-176 (awaiting the orchestrator). Then the owner drives it: rub the debug rock with a sidewall at a
crawl, and answer the open question on high-speed tread-edge pinches.

## Summary
A slow sidewall rub should push a rock aside with about the truck's speed, not fire it. Cause found and fixed: the
tire's soft contact against debris was a 0.37 m SPHERE cut by the tire-width slab only as a yes/no filter, so a rock
1 mm over the sidewall plane read the sphere's depth — 17 cm at once (§0 of the repro). The engine query now also
tests the sidewall face as a separating axis and the shallower axis wins, so the depth grows from 0 at the plane.

## Description
Evidence (`node test/bug176-sidewall-rock.mjs`, fails on main): §0 steps the tire sideways across the resting rock
in 5 mm steps — main reads 0 → 17.4 cm the instant the rock touches the plane; the fix reads exactly the reach past it.
The stored spring energy launched the rock, v ≈ d·√(k/m) = 0.17·√(100 kN/m ÷ 50 kg) ≈ 7.6 m/s; measured 7.48 m/s off a
4 mph rub (truck 1.79 m/s); after: 0.29 m/s. A depth past the 15 cm soft band also reaches the rim pinch path, which is
how a rub could pop the tire (seen once, on an instant steer). At speed (half-size rock clipping the shoulder 1–6 cm)
main read 11–16 cm and kicked it at 5.5–10.5 m/s, mostly sideways; after: ≤ δ deep, 0.1–3.4 m/s at 30 and 60 mph.

## Tracker
- [x] Reproduced headless and the cause found by measurement (repro script, §0–§2)
- [x] Fixed in the adapter's narrow phase (`contactSphere` slab → sphere + face axes), physics gates green
- [ ] Owner: high-speed tread-edge pinches are rarer (see Open questions) — keep, or add entry-face memory
- [ ] Owner has looked / driven it

## Decisions
None new. DEC-075 (vehicle model ours) and DEC-089 (flag approximations) govern; no conflict.

## Open questions
- The face axis also wins when a rock STRADDLES the tread edge deeper than it overlaps the width, so a fast hit squeezes
  it out sideways instead of pinching it on the rim. damage-hazard-puncture §2: pops at 40–50 mph 11/14 → 7/14 lines,
  25–30 mph 3/14 → 3/14, 5–10 mph 0 → 0 (gate passes). Rigid-cylinder exact; a soft carcass would keep the face it was
  entered through. Restoring that needs per-wheel, per-rock entry memory in physics.js (state + hysteresis).
  Recommendation: keep it unless strikes at speed now feel too forgiving.

## Links
BUG-165 (the slab), BUG-99 (debris coupling), FEAT-93 (hazard puncture).

## Files
src/physics-engine.js (contactSphere, _specSpan) · src/physics.js (qcPlus slab) · test/bug176-sidewall-rock.mjs

## Log
- 2026-11-15 lane B: fixed on land/bug-176. 33/33 affected physics gates green (serial); fingerprint-physics ALL
  IDENTICAL (its scene has no debris). Flagged approximations: the sphere still stands in for the cylinder's radial
  side; the face contact lands at the rock's deepest vertex. Menu stage static rock (stage.js) still sphere-only.
- 2026-11-15: CLOSED. Owner on card bug176-rub: "fixed, keep it as it is" (the fewer high-speed pinches stand). On main since 59b989ff.
