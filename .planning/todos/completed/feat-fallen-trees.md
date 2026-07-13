---
id: FEAT-15
type: feature
status: closed
closed: 2026-07-07
resolution: "Implemented per scoped design. sphereVsCapsule (general segment) in prop-collider;
  'logCapsule' collidable kind with world endpoints baked in ensureChunk from the placement
  transform; palette bakes 3 horizontal kinked-trunk variants (FIXED 7 m nominal length so the
  scatter can ground both ends without reproducing palette rng; variety = kink/radius/scale
  0.65-1.5). Scatter grounds both ends via heightAt, pitches via the existing tilt machinery
  (tiltAz=pi/2), rejects: road keep-out + half-length (BUG-23), pond/stream channels, steep
  ground, float-guard pitch cap. Grid insertion uses boundR (half-length). LAST scatter pass ->
  all pre-existing placements keep exact rng draws. props.mjs section 6 covers side/top/end-cap
  normals + pitched span + scattered-log grounding (err 0.07 m) + query integration. Suite 30/31
  (known REACHABILITY red). Climb-over FEEL needs in-game verify: user, morning."

opened: 2026-06-28
severity: minor
source: user-request
phase_origin: props
note: "User request, scoped not built. Scope decided up front: a fallen tree is a DRIVABLE OBSTACLE
(downed trunk / log) with HARD collision the truck must climb over or steer around — static, baked
into the prop scatter + collision palette like standing trees and large rocks. NOT cosmetic-only and
NOT a dynamic rolling physics log (those remain possible later follow-ups)."
---

# FEAT-15: Fallen trees — drivable downed-log obstacles

## Context

The prop system already scatters standing trees (vertical `capsule` collision), rocks/boulders
(`sphere`), bushes (`bush` soft-drag), and decorative small rocks (`none`) — all procedural, instanced,
baked into a per-seed palette. Standing trees collide as an upright capsule (`sphereVsCapsuleY`, a
*vertical* axis-aligned segment). A fallen tree is the same trunk geometry laid down: a **horizontal
capsule lying on the ground at an arbitrary heading**, which the existing vertical-only collision can't
represent.

The user wants fallen trees as a new prop variant that reads as forest debris and behaves as a real
obstacle — the truck has to climb over a small log or steer around a big one.

## Desired behaviour

- A new scattered prop variant: a downed trunk lying on the terrain, random heading in the XZ plane,
  resting on (and following) the ground surface. Procedural + instanced, baked into the palette, same
  determinism/window-invariance discipline as the rest of the props.
- **Hard collision** (like standing trees / large rocks): the truck rides up and over a small log or is
  blocked / deflected by a large one — no pass-through. A log is a capsule whose axis is horizontal, so
  the truck's wheels contact it from the side and top.
- Size range so some are climbable (small branches/saplings) and some are genuinely blocking (mature
  trunks) — tunable, USER-OWNED param set (see Acceptance).
- Sits flat on terrain (rest the trunk on the ground height along its length; ideally tilt to follow the
  slope rather than float/clip at one end).

## Open design questions (decide at planning)

- **Collision shape — the core new work.** Standing trees use `sphereVsCapsuleY` (vertical segment).
  A log needs a **general capsule**: a swept sphere between two arbitrary world endpoints `A`–`B`
  (the trunk ends) with radius `r`. Add `sphereVsCapsule(point, A, B, r)` (closest-point-on-segment)
  alongside the existing `sphereVsCapsuleY`, and a new `collision.kind` (e.g. `'logCapsule'`) carrying
  the two endpoints (or centre + heading + length) in `prop-system.js queryProps`. Bake the endpoints
  at scatter time from the trunk geometry + chosen heading.
  (`src/props/prop-system.js:243` is the kind dispatch; `src/props/prop-palette.js` bakes geometry +
  `collision`; the sphere/capsule math lives in the prop collision helpers.)
- **Geometry:** reuse `makeKinkedTube` (the standing-trunk builder) laid horizontal — a tapered,
  slightly-bent log, maybe a torn root ball or broken end. Optionally a few stubbed branches. Keep it a
  single merged geometry per variant (palette convention).
- **Grounding:** sample terrain height at both ends and orient the log to lie on the slope (two-point
  ground sample → position + tilt), so it doesn't float on hills. Mind that props scatter per chunk —
  the terrain height query must be available at scatter time.
- **Climb-over feel:** validate that a small log produces a believable ride-over (suspension absorbs it)
  and a big one actually stops/deflects the truck. May need to tune the log radius vs ride-over —
  pairs with the existing `trunkRadiusScale` / `rockRadiusScale` collision scales.
- **Scatter rules:** density/where (e.g. only near tree clusters? a fraction of "dead" trees?). Keep
  logs OFF the road (same exclusion the other hard props use) so they don't recreate BUG-23
  (large rocks spawning on-road impassable) — see `bug-large-rocks-spawn-on-road-impassable.md`.

## Acceptance

- Fallen-log props scatter in the world, lying on the terrain at varied headings/sizes, procedural +
  instanced, deterministic + window-invariant.
- Hard collision: truck climbs over small logs and is blocked/deflected by large ones; no pass-through
  and no airborne-slam glitch. Logs never spawn on the road.
- New general-capsule collision test covered by a headless gate (extend the prop-collision gate or add
  one); `npm test` stays green.
- Tunable param set (size range, density, collision radius scale) — likely debug sliders, USER-OWNED.

## Related

- FEAT-06 props scatter / FEAT-06b prop collision (the system this extends) —
  [[project_feat06_props_scope]]; `completed/feat-rocks-and-trees.md`, `completed/feat-prop-collision.md`.
- BUG-23 large rocks spawn on road impassable (the on-road-exclusion pitfall to avoid) —
  `bug-large-rocks-spawn-on-road-impassable.md`.
- BUG-22 rock collision inaccurate / bump off-road (collision-accuracy neighbour) —
  `bug-rock-collision-inaccurate-bump-off-road.md`.
- Possible follow-ups (explicitly out of scope here): cosmetic-only debris logs; a *dynamic* log that
  can be knocked loose and rolls (would need a dynamic-prop path, not the static palette).
