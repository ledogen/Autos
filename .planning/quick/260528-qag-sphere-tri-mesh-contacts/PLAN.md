---
slug: 260528-qag-sphere-tri-mesh-contacts
title: Sphere-vs-triangle-mesh contact detection
status: planned
created: 2026-05-28
---

# Task: Sphere-vs-triangle-mesh contact detection

## Goal

Replace the per-face half-space checks in `queryContacts` with a generic sphere-vs-triangle closest-point test so edge and corner contacts resolve correctly and additional meshes (terrain, roads, rocks) can be added as triangle lists.

## Context

**Current implementation (src/main.js lines 224–279):**

- `queryContacts(cx, cy, cz, r)` uses four hand-written half-space tests: inclined top face, back vertical face, and two side faces. Each test has custom spatial gating (x-range, z-range, height bounds) that has already required one patch (back-face z-guard). Edges and corners between faces produce either double-contact impulses or dead zones depending on gating overlap.
- The ground half-space (`y = 0`) is separate and must stay as-is — it is an infinite plane, not a triangle.
- The ramp is defined by five constants: `RAMP_ANGLE`, `RAMP_START_Z`, `RAMP_LENGTH`, `RAMP_WIDTH`, `RAMP_MAX_H`, `RAMP_END_Z`. The visual mesh is a `PlaneGeometry` positioned at `(0, RAMP_LENGTH/2 * tan(θ), RAMP_START_Z - RAMP_LENGTH/2)` and tilted `rotation.x = -PI/2 + RAMP_ANGLE`.
- `_rampNormal` and `_flatNormal` are pre-allocated `THREE.Vector3` constants. `_flatNormal` is still used by the ground hit; it can stay.

**How contacts are consumed (src/physics.js):**

- `stepPhysics` calls `queryContacts` once per wheel (sphere = hub center + `wheelRadius`) and once per body contact point (sphere radius = `params.bodyContactRadius`).
- Each returned contact must have: `normal` (Vector3, points away from solid toward sphere center), `depth` (penetration depth > 0), `contactPoint` (Vector3 on the surface).
- `Fn = computeNormalForce(...)` uses `params._compression = depth` and `params._compressionVelocity = -contactVel.dot(normal)`. Returning a contact with `depth <= 0` is harmless — `computeNormalForce` returns 0 and the contact is skipped — but it is wasteful. The new code should only emit contacts where `depth > 0`.

**Ramp geometry (world space, Y-up):**

The ramp rises in the −Z direction. Corners in world space (x from −W/2 to +W/2, where W = `RAMP_WIDTH = 4`):

```
Toe   (y=0):  z = RAMP_START_Z  = −15   → y = 0
Crest (y≈0.88): z = RAMP_END_Z  = −20   → y = RAMP_MAX_H ≈ 0.88
```

Six corners (half-width hw = 2):

| Name | x   | y          | z           |
|------|-----|------------|-------------|
| TL   | −hw | 0          | RAMP_START_Z |
| TR   | +hw | 0          | RAMP_START_Z |
| CL   | −hw | RAMP_MAX_H | RAMP_END_Z  |
| CR   | +hw | RAMP_MAX_H | RAMP_END_Z  |
| BL   | −hw | 0          | RAMP_END_Z  |
| BR   | +hw | 0          | RAMP_END_Z  |

Faces as triangles (counter-clockwise from outside normal = outward):

| Face        | Tri A          | Tri B          | Outward normal         |
|-------------|----------------|----------------|------------------------|
| Top incline | TL, TR, CR     | TL, CR, CL     | _rampNormal (0,cos,sin)|
| Back wall   | CL, CR, BR     | CL, BR, BL     | (0, 0, −1)             |
| Left side   | TL, CL, BL     | TL, BL, (TL·z=BL·z? no — TL.z=RAMP_START_Z, BL.z=RAMP_END_Z) | see note |
| Right side  | TR, BR, CR     | TR, CR, (see note) | (−1, 0, 0) mirrored |

**Left side face** (x = −hw): vertices TL(−hw,0,−15), BL(−hw,0,−20), CL(−hw,0.88,−20).
Triangle 1: TL, CL, BL. Normal: (−1, 0, 0).

**Right side face** (x = +hw): vertices TR(+hw,0,−15), BR(+hw,0,−20), CR(+hw,0.88,−20).
Triangle 1: TR, BR, CR. Normal: (+1, 0, 0).

(Each side face is a single triangle — it is planar with 3 unique corners.)

## Implementation Steps

### Step 1 — Add `closestPointOnTriangle` helper

Add a pure function above `queryContacts` in `src/main.js`:

```
function closestPointOnTriangle(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz)
  → THREE.Vector3
```

Use the standard parametric closest-point algorithm (Ericson "Real-Time Collision Detection" §5.1.5 — barycentric-coordinate clamping via dot products). Return the closest point on the filled triangle (edges and vertices included) to the query point P. No external dependencies — pure arithmetic on scalars, return a `new THREE.Vector3`.

Implementation outline (all variable names lowercase scalars to avoid confusion with Three.js Vector3):

```
ab = B−A, ac = C−A, ap = P−A
d1 = dot(ab,ap), d2 = dot(ac,ap)
if d1<=0 and d2<=0 → return A           (vertex A region)

bp = P−B
d3 = dot(ab,bp), d4 = dot(ac,bp)
if d3>=0 and d4<=d3 → return B          (vertex B region)

cp = P−C
d5 = dot(ab,cp), d6 = dot(ac,cp)
if d6>=0 and d5<=d6 → return C          (vertex C region)

vc = d1*d4 − d3*d2
if vc<=0 and d1>=0 and d3<=0:
  v = d1/(d1−d3); return A + v*ab       (edge AB region)

vb = d5*d2 − d1*d6
if vb<=0 and d2>=0 and d6<=0:
  w = d2/(d2−d6); return A + w*ac       (edge AC region)

va = d3*d6 − d5*d4
if va<=0 and (d4−d3)>=0 and (d5−d6)>=0:
  w = (d4−d3)/((d4−d3)+(d5−d6)); return B + w*(C−B)  (edge BC region)

denom = 1/(va+vb+vc)
v = vb*denom; w = vc*denom
return A + v*ab + w*ac                  (interior)
```

### Step 2 — Build ramp triangle list

Replace the ramp-face half-space block with a static triangle list. Define it once after the existing ramp constants using the six corner coordinates derived from the constants (do not hard-code numbers — reference `RAMP_START_Z`, `RAMP_END_Z`, `RAMP_MAX_H`, `RAMP_WIDTH`):

```js
const hw = RAMP_WIDTH / 2
// Corners: [x, y, z]
const TL = [-hw, 0,          RAMP_START_Z]
const TR = [ hw, 0,          RAMP_START_Z]
const CL = [-hw, RAMP_MAX_H, RAMP_END_Z ]
const CR = [ hw, RAMP_MAX_H, RAMP_END_Z ]
const BL = [-hw, 0,          RAMP_END_Z ]
const BR = [ hw, 0,          RAMP_END_Z ]

// Each entry: [A, B, C] — vertices as [x,y,z] arrays
const RAMP_TRIS = [
  [TL, TR, CR],   // top incline tri 1
  [TL, CR, CL],   // top incline tri 2
  [CL, CR, BR],   // back wall tri 1
  [CL, BR, BL],   // back wall tri 2
  [TL, CL, BL],   // left side (single tri)
  [TR, BR, CR],   // right side (single tri)
]
```

Name the array `RAMP_TRIS` at module scope (alongside the existing ramp constants).

### Step 3 — Rewrite `queryContacts`

Replace the body of `queryContacts` (lines 225–279) with:

```
function queryContacts(cx, cy, cz, r) {
  const hits = []

  // Ground half-space (y = 0, normal +Y) — unchanged
  const gd = r - cy
  if (gd > 0) hits.push({
    normal: _flatNormal.clone(),
    depth: gd,
    contactPoint: new THREE.Vector3(cx, 0, cz)
  })

  // Triangle mesh contacts
  for (const [[ax,ay,az],[bx,by,bz],[ex,ey,ez]] of RAMP_TRIS) {
    const cp = closestPointOnTriangle(cx,cy,cz, ax,ay,az, bx,by,bz, ex,ey,ez)
    const dx = cx - cp.x, dy = cy - cp.y, dz = cz - cp.z
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz)
    const depth = r - dist
    if (depth <= 0) continue
    const inv = dist < 1e-8 ? 0 : 1 / dist
    hits.push({
      normal: new THREE.Vector3(dx * inv, dy * inv, dz * inv),
      depth,
      contactPoint: cp
    })
  }

  return hits
}
```

Notes:
- The degenerate case (`dist < 1e-8`, sphere center exactly on triangle) uses a zero normal. This is harmless in practice — `computeNormalForce` will still fire but the torque arm is zero. If desired, a fallback to the triangle's face normal can be added later.
- Remove the now-unused `cosA`, `sinA`, `_rampNormal` local variables. `_rampNormal` constant at module scope can stay (used by `terrain()`) or be removed if `terrain()` is also updated — leave `terrain()` and `_rampNormal` unchanged since they are on a separate code path (`window.terrain`).
- Remove the unused `RAMP_MAX_H` reference inside `queryContacts` (it moves to `RAMP_TRIS` definition).

### Step 4 — Smoke test

Manually verify in browser:
1. Drive forward onto the ramp — car rides up the incline smoothly without tunnelling.
2. Drive off the crest at speed — no phantom contact fires mid-air.
3. Drive into the side of the ramp from the left and right — car is pushed away laterally.
4. Back into the back face of the ramp (approach from z < RAMP_END_Z) — car is pushed in +Z.
5. Drive slowly along the ramp edge (wheel overlapping the top corner) — no jitter or double-impulse spike.
6. Park on flat ground — car settles, no ramp contacts fire at spawn position (z=0, well away from z=−15).

Also run the debug overlay: confirm `contacts` counter per wheel matches expectations (0 on flat ground, 1 on ramp face, possibly 2 near edges — both are correct behavior now).

## Files Changed
- `src/main.js` — `closestPointOnTriangle` helper added, `RAMP_TRIS` array added, `queryContacts` body replaced. No changes to `queryContacts` signature. No changes to `terrain()`. No changes outside this function group.
