---
id: BUG-37
type: bug
status: resolved
opened: 2026-07-23
resolved: 2026-07-23
severity: major
source: user-observation (post-FEAT-40 merge re-drive)
relates_to: FEAT-40
note: "The car does not collide with tunnel bore WALLS — it drives straight through the curved
concrete half-tube sides. FEAT-40's collision carve resolves the bore FLOOR only (bore-ownership
rule → the in-bore probe rides the road floor, per the road-tunnel gate 'in-bore probe rides the
road floor'), but the tube walls / crown are MESH-only with no collision geometry. So a wheel that
leaves the road floor laterally passes through where the wall visually is."
---

# BUG-37: No collision with tunnel bore walls (car drives through the tube sides)

## RESOLUTION (2026-07-23, commit af9fcd9)

`RoadSystem.queryTunnelWallContact()` — a cylinder-containment contact test in the bore's own
cross-section frame (same `rightDir` as `buildTunnelTube`, so collision == rendered tube), returning
the `{normal, depth, contactPoint}` shape the wheel/body contact solver already consumes. Wired into
`queryContacts` (reusing the already-resolved carve hint — no extra tile scan) and
`queryVertexContacts`. FULL-cylinder test, not upper-arch-only: camber tilts the physics floor but
not the rendered arch, so on the low side of a banked bore the wheel legitimately sits below the
springline right at the wall — a hard `h<0` cutoff killed contact exactly there (caught in the
follow-up drive). `road-tunnel` gate grew 4 checks: wall contact at ρ≈R, below-springline contact,
no false hit above the crown, no false hit outside the span — all green, floor checks unchanged.

## Observed

Driving through a FEAT-40 bore, the truck does **not** collide with the tunnel walls — steer into
the curved half-tube side and the car passes straight through the concrete, out into the hillside.
The drivable bore floor works (the car rides it correctly), but the walls and crown are visual mesh
only.

## Why (hypothesis)

FEAT-40's collision path (`_sampleCarveWorld` bore-ownership branch → `_boreNotchCS` / the bore
floor) gives the wheel a surface to ride ONLY where it's below the bore apex — the road floor. The
concrete half-tube (`src/road-mesh.js` bore/portal meshes) has no matching collision representation,
so lateral motion off the floor sees raw terrain (already carved away) or nothing, not a wall.

Confirmed today the *floor* collision is correct — the `road-tunnel` gate passes
("in-bore probe rides the road floor: 5/5", "raw hill stays overhead mid-bore: 5/5"). The gap is
purely the walls.

## Desired behaviour

Wheels/body should collide with the bore wall surface — the truck is contained within the tube
cross-section (floor + curved walls) instead of driving through the sides. Ideally the collision
wall == the rendered half-tube (mesh == collision, the project invariant), so a wall probe returns
the tube's inner radius surface rather than raw terrain.

## Acceptance

- Steering into a bore wall stops/deflects the truck at the concrete surface (no pass-through).
- The wall collision surface matches the rendered half-tube cross-section (no float / no gap at the
  floor↔wall seam).
- Bore floor behaviour and the `road-tunnel` gate stay green; add a wall-containment assertion to
  that gate (a lateral probe inside the bore hits the tube wall at ≈ bore radius, not raw terrain).

## Notes / leads

- Tunnel design + invariants: `.planning/todos/completed/feat-40-tunnels.md`, handoff
  `.planning/handoffs/2026-07-23-feat40-merge.md`, memory `project_feat40_tunnels`
  (bore-ownership rule, `tunnelBoreRadius` default 8 m).
- Physics is a rigid-body wheel/contact model — a "wall" likely means either a collision surface in
  `_sampleCarveWorld` that returns the tube's inner-wall Y as a function of lateral offset, or a
  separate contact test against the half-tube. Scope the cheapest option that keeps mesh==collision.
