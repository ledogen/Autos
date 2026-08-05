"""
trailer-home-a - parametric generator for the first POI: a single-wide mobile home.

    TrailerHomeA    one mesh, 7 material slots
    exterior only - NO interior. Window openings are recessed and backed by a curtain
    plane so the missing interior never reads as a hole.

Built against Blender 5.2 LTS. Ships at 1188 tris (budget 1200), no texture, 7 materials.

    blender --background --python trailer-home-a.py -- --export

All dimensions are metres. Change a PARAM and re-run; do not hand-edit the mesh.

CONVENTIONS (.planning/research/ASSETS.md)
  * Base-seated: lowest point at z=0.
  * Long axis along Blender +X; the entry door faces Blender +Y, which becomes glTF -Z
    after the +Y-up export - i.e. the door is the "forward" face, so placement code can
    turn it toward a road.
  * FLAT COLOURS, NO TEXTURE. There are deliberately no UVs - every material is an
    untextured Principled BSDF. Do not add a texture without re-reading the recolour note.

RECOLOUR (the point of the asset)
  Two material names are the runtime API, matched by substring exactly like the vehicle
  loader does for paint (`src/vehicle-model.js`):

      TrailerBody     main siding   - the cyan -> yellow -> white parameter
      TrailerAccent   stripe band   - the second, independent parameter

  Both are flat Base Color, so a recolour is one `material.color.set()` per material with
  no texture multiply. Keep these names stable - renaming silently drops the hookup.
  The other five materials are fixed and must NOT be recoloured.
"""

import bpy, bmesh, math, os, sys
from mathutils import Vector

# ---------------------------------------------------------------------------
# PARAMS
# ---------------------------------------------------------------------------
NAME = "trailer-home-a"

# --- overall envelope ---
LENGTH   = 12.0     # along X
WIDTH    = 3.5      # along Y
SKIRT_H  = 0.55     # ground -> underside of the body
BODY_H   = 2.15     # skirt top -> eaves          (eaves at 2.70)
ROOF_RISE = 0.35    # eaves -> ridge
ROOF_OVER = 0.18    # roof overhang on all sides
ROOF_THK  = 0.10    # roof slab thickness
SKIRT_INSET = 0.06  # skirting sits inset from the body footprint

# --- horizontal lap siding ---
# Courses are cut INWARD from the wall plane as shallow V-grooves: the offset is 0 on every
# course line and -SIDING_DEPTH on the mid-line between them. Two rules keep the wall
# watertight, and both matter - a single-sided wall that gaps open is a see-through hole:
#
#   1. INWARD ONLY, and SIDING_DEPTH << WIN_DEPTH / DOOR_DEPTH. An opening's reveal is a
#      plane running from the wall plane back to -DEPTH, so a grooved wall edge lands
#      *inside* that plane instead of short of it. The surfaces meet and the reveals need
#      no per-course splitting, which would have cost more tris than the siding itself.
#   2. Offset is 0 on course lines, and every critical height (stripe, sills, heads) is
#      SNAPPED onto one - so the wall still meets the roof, skirt and openings flush.
#
# The vertical building corners are the one seam this cannot close: two receded walls miss
# each other by SIDING_DEPTH. CORNER_W posts cover it, and corner trim is on the reference
# anyway. Set SIDING_DEPTH = 0 to get the old flat walls back.
SIDING_COURSE_H = 0.16     # nominal course height; the fitted value divides the wall evenly
SIDING_DEPTH    = 0.020    # groove depth, inward
CORNER_W        = 0.080    # corner post width, into the corner
CORNER_OUT      = 0.010    # how far the post stands proud of the wall plane

# --- accent stripe (second recolourable material) ---
STRIPE_Z0, STRIPE_Z1 = 0.95, 1.25

# --- windows ---
WIN_W, WIN_H   = 1.10, 0.85
WIN_Z0         = 1.45          # sill height
WIN_DEPTH      = 0.09          # recess depth; the curtain sits at the back of this
SIDE_WIN_X     = (-4.1, -1.2, 3.4)    # window centres along X on each long side
END_WIN_W      = 0.85          # the end windows are narrower

# --- opening detail (frames + mullions) ---
# Every opening gets a proud picture frame: the recess now STARTS at +FRAME_OUT instead of
# on the wall plane, so the frame's inner edge and the reveal are the same surface and no
# gap can open between them. Cost is the frame front ring (4 quads) + its outer edge wall
# (4 quads) = 16 tris per opening; the reveal quads were already being paid for.
FRAME_W        = 0.07          # how far the frame stands out from the opening, in-plane
FRAME_OUT      = 0.035         # how far it stands proud of the wall plane
MULLION_W      = 0.045         # vertical glazing bar across each window
MULLION_INSET  = 0.015         # its front face, inward from the wall plane

# The curtain behind the glass. A flat plane at the back of the recess reads as a void, so
# it is folded into vertical pleats: the banding is facet normals under flat shading, the
# same trick the siding uses, and it costs 2 tris a fold. Folds recede AWAY from the
# viewer, never toward - a forward bulge would interpenetrate the mullion. An EVEN fold
# count is required so both outer edges land back on the recess plane and meet the reveal.
CURTAIN_PLEATS      = 6        # per window; must be even
CURTAIN_PLEAT_D     = 0.07     # how far a fold valley sits behind the recess back
DOOR_CURTAIN_PLEATS = 4        # the door window is narrow; must be even
# Fold valleys are not all the same depth - an even zigzag reads as corrugated metal, not
# cloth. Odd fold lines (the valleys) cycle through these fractions of CURTAIN_PLEAT_D and
# the interior peaks pull back slightly, so the hang looks gathered by hand. Free: the
# quad count is unchanged.
CURTAIN_VALLEY_MIX  = (1.0, 0.72, 0.90, 0.62)
CURTAIN_PEAK_MIX    = 0.18

# --- door + steps ---
DOOR_W, DOOR_H = 0.90, 2.00
DOOR_X         = 1.05          # centre along X, on the +Y face
DOOR_DEPTH     = 0.10
DOOR_WIN_W     = 0.42          # window let into the upper door slab
DOOR_WIN_H     = 0.75
DOOR_WIN_Z0    = 1.05          # above the door bottom, i.e. above SKIRT_H
DOOR_WIN_DEPTH = 0.03
KNOB_W, KNOB_H, KNOB_OUT = 0.10, 0.06, 0.05    # latch-side knob, on the door slab

# --- stoop: open tubular-metal stair + handrails, all TrailerTrim ---
# Not a solid masonry stoop - square-section bar stock, treads spanning between legs, and
# a rail each side. Everything here is built from tube(), so a fatter or thinner stock is
# one param, not a remodel.
STEP_N         = 3
STEP_W         = 1.05          # tread width
STEP_RUN       = 0.30          # tread depth, and the outward step per tread
STEP_THK       = 0.05          # tread slab thickness
STEP_LEG_R     = 0.030         # leg bar half-width
RAIL_R         = 0.026         # handrail bar half-width
RAIL_GAP       = 0.035         # rail posts stand outboard of the treads, so they miss them
RAIL_H         = 0.88          # rail height above the tread it serves

# --- woodburner flue ---
CHIM_X         = 3.80          # along the ridge
CHIM_R         = 0.070         # pipe half-width
CHIM_H         = 0.50          # above the roof
CHIM_CAP_R     = 0.105         # rain cap
CHIM_CAP_T     = 0.055

# --- skirting detail ---
# Battened skirting: vertical ribs at a regular pitch, a ground rail at the bottom, and one
# crawl-space vent. The ribs stand less proud than SKIRT_INSET, so they stay tucked under
# the body overhang and their top faces are never seen (hence the '+z' skip).
SKIRT_RIB_PITCH = 2.40         # nominal spacing; the fitted value divides each run evenly
SKIRT_RIB_W     = 0.10
SKIRT_RIB_OUT   = 0.045        # < SKIRT_INSET, so ribs stay under the body
SKIRT_RAIL_H    = 0.10         # ground rail at the bottom of the skirt
SKIRT_RAIL_OUT  = 0.045
VENT_X, VENT_W, VENT_H = -3.20, 0.55, 0.26     # crawl-space vent, on the -Y flank
VENT_DEPTH      = 0.090        # deep enough that the reveal shades - a shallow one is
                               # invisible, since every skirt colour is within 0.06 of the
                               # others and there is no AO to hint the recess

# --- palette ---
# Shipped defaults only - both are overwritten at runtime. Verified across the range:
#   cyan   (0.28,0.72,0.76) / (0.10,0.34,0.40)
#   yellow (0.88,0.76,0.28) / (0.46,0.34,0.12)
#   white  (0.90,0.90,0.88) / (0.55,0.56,0.58)
COL_BODY    = (0.28, 0.72, 0.76, 1)
COL_ACCENT  = (0.10, 0.34, 0.40, 1)
COL_ROOF    = (0.34, 0.34, 0.35, 1)
COL_SKIRT   = (0.28, 0.26, 0.24, 1)
COL_TRIM    = (0.82, 0.82, 0.80, 1)
COL_DOOR    = (0.45, 0.33, 0.24, 1)
COL_CURTAIN = (0.82, 0.65, 0.52, 1)    # warm - it is the only colour seen through a window

MATS = [("TrailerBody", COL_BODY, 0.85), ("TrailerAccent", COL_ACCENT, 0.85),
        ("TrailerRoof", COL_ROOF, 0.80), ("TrailerSkirt", COL_SKIRT, 0.90),
        ("TrailerTrim", COL_TRIM, 0.70), ("TrailerDoor", COL_DOOR, 0.60),
        ("TrailerCurtain", COL_CURTAIN, 0.95)]
MI = {n: i for i, (n, _, _) in enumerate(MATS)}

EAVE  = SKIRT_H + BODY_H
RIDGE = EAVE + ROOF_RISE

# --- derived siding lattice ---
N_COURSE = max(1, round(BODY_H / SIDING_COURSE_H))
COURSE_H = BODY_H / N_COURSE                                    # fitted, divides evenly
COURSE_LINES = [SKIRT_H + COURSE_H * k for k in range(N_COURSE + 1)]


def snap_course(v):
    """Snap a height onto the nearest course line, so the wall stays flush there."""
    if v <= SKIRT_H or v >= EAVE:
        return v
    return min(COURSE_LINES, key=lambda c: abs(c - v))


def siding_off(v):
    """Inward offset of the wall surface at height v. 0 on course lines, -SIDING_DEPTH
    at the mid-lines, linear between - a shallow V-groove per course."""
    if SIDING_DEPTH <= 0 or v <= SKIRT_H or v >= EAVE:
        return 0.0
    t = (v - SKIRT_H) / COURSE_H
    return -SIDING_DEPTH * (1.0 - abs((t % 1.0) * 2.0 - 1.0))


# snapped heights - everything the wall grid must meet flush
WIN_Z0_S,  WIN_Z1_S  = snap_course(WIN_Z0), snap_course(WIN_Z0 + WIN_H)
STRIPE_S0, STRIPE_S1 = snap_course(STRIPE_Z0), snap_course(STRIPE_Z1)
DOOR_Z1_S            = snap_course(SKIRT_H + DOOR_H)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def quad(bm, pts, mat):
    """Add a quad; pts must be ordered so the winding faces outward."""
    f = bm.faces.new([bm.verts.new(p) for p in pts])
    f.material_index = mat
    f.smooth = False
    return f


def box(bm, x0, x1, y0, y1, z0, z1, mat, skip=()):
    """Axis-aligned box, outward-facing. `skip` drops hidden faces to save tris."""
    P = lambda x, y, z: (x, y, z)
    faces = {
        '-x': [P(x0,y1,z0), P(x0,y0,z0), P(x0,y0,z1), P(x0,y1,z1)],
        '+x': [P(x1,y0,z0), P(x1,y1,z0), P(x1,y1,z1), P(x1,y0,z1)],
        '-y': [P(x0,y0,z0), P(x1,y0,z0), P(x1,y0,z1), P(x0,y0,z1)],
        '+y': [P(x1,y1,z0), P(x0,y1,z0), P(x0,y1,z1), P(x1,y1,z1)],
        '-z': [P(x0,y0,z0), P(x0,y1,z0), P(x1,y1,z0), P(x1,y0,z0)],
        '+z': [P(x0,y0,z1), P(x1,y0,z1), P(x1,y1,z1), P(x0,y1,z1)],
    }
    for k, v in faces.items():
        if k not in skip:
            quad(bm, v, mat)


def tube(bm, p0, p1, r, mat, sides=4, cap0=False, cap1=False, phase=math.pi / 4):
    """Straight bar of square (sides=4) or n-gon section from p0 to p1, `r` half-width.

    Winding is derived, not guessed. Build a right-handed frame (u, v, axis) with
    v = axis x u, so u x v = axis. A ring point is c + r(cos T u + sin T v), and its
    tangent is -sin T u + cos T v; tangent x axis = cos T u + sin T v, i.e. the outward
    radial. So walking the ring in increasing T and then along +axis gives outward faces.
    The p1 cap keeps that order (normal +axis); the p0 cap reverses it.

    Costs 2 tris a side, plus (sides - 2) per cap. Default phase puts a square bar's faces
    on the frame axes rather than on its diagonals.
    """
    p0, p1 = Vector(p0), Vector(p1)
    axis = (p1 - p0).normalized()
    ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    u = axis.cross(ref).normalized()
    v = axis.cross(u)
    ring = lambda c: [c + (u * math.cos(t) + v * math.sin(t)) * r
                      for t in (phase + 2 * math.pi * k / sides for k in range(sides))]
    r0, r1 = ring(p0), ring(p1)
    for k in range(sides):
        k2 = (k + 1) % sides
        quad(bm, [tuple(r0[k]), tuple(r0[k2]), tuple(r1[k2]), tuple(r1[k])], mat)
    for pts, use in ((r1, cap1), (r0[::-1], cap0)):
        if use:
            f = bm.faces.new([bm.verts.new(tuple(p)) for p in pts])
            f.material_index = mat
            f.smooth = False


# wall frames: (origin, u_axis, v_axis, normal, length). cross(u, v) == n, so the quad
# order (u0,v0) (u1,v0) (u1,v1) (u0,v1) faces outward.
def wall_frame(side):
    hw, hl = WIDTH / 2, LENGTH / 2
    return {
        '+y': (Vector((0,  hw, 0)), Vector((-1, 0, 0)), Vector((0, 0, 1)), Vector((0,  1, 0)), LENGTH),
        '-y': (Vector((0, -hw, 0)), Vector(( 1, 0, 0)), Vector((0, 0, 1)), Vector((0, -1, 0)), LENGTH),
        '+x': (Vector(( hl, 0, 0)), Vector(( 0, 1, 0)), Vector((0, 0, 1)), Vector(( 1, 0, 0)), WIDTH),
        '-x': (Vector((-hl, 0, 0)), Vector(( 0,-1, 0)), Vector((0, 0, 1)), Vector((-1, 0, 0)), WIDTH),
    }[side]


def build_wall(bm, side, holes):
    """One wall panel with rectangular openings, as a guillotine grid with greedy
    horizontal merging (so a plain row is ONE quad, not one per grid column).

    Rows are split at every siding course line AND mid-line, so the V-groove profile is
    carried by the wall quads themselves rather than by extra geometry. Rows also split at
    the stripe band, which gets its own material.

    holes: list of (u0, u1, v0, v1) in wall-local coords.
    """
    org, U, V, N, L = wall_frame(side)
    P = lambda u, v: tuple(org + U * u + V * v + N * siding_off(v))

    lattice = set(COURSE_LINES)
    if SIDING_DEPTH > 0:
        lattice |= {c + COURSE_H / 2 for c in COURSE_LINES[:-1]}
    us = sorted({-L / 2, L / 2} | {h[i] for h in holes for i in (0, 1)})
    vs = sorted(lattice | {SKIRT_H, EAVE, STRIPE_S0, STRIPE_S1}
                | {h[i] for h in holes for i in (2, 3)})

    for r in range(len(vs) - 1):
        v0, v1 = vs[r], vs[r + 1]
        vm = (v0 + v1) / 2
        mat = MI["TrailerAccent"] if STRIPE_S0 <= vm <= STRIPE_S1 else MI["TrailerBody"]
        run = None                                   # greedy merge across this row
        for c in range(len(us) - 1):
            u0, u1 = us[c], us[c + 1]
            um = (u0 + u1) / 2
            solid = not any(h[0] < um < h[1] and h[2] < vm < h[3] for h in holes)
            if solid:
                run = (run[0], u1) if run else (u0, u1)
            elif run:
                quad(bm, [P(run[0], v0), P(run[1], v0), P(run[1], v1), P(run[0], v1)], mat)
                run = None
        if run:
            quad(bm, [P(run[0], v0), P(run[1], v0), P(run[1], v1), P(run[0], v1)], mat)


def build_corners(bm):
    """Vertical corner posts. The siding recedes each wall by up to SIDING_DEPTH, so the
    two walls meeting at a corner no longer share an edge; these cover that seam."""
    if SIDING_DEPTH <= 0:
        return
    hx, hy = LENGTH / 2, WIDTH / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            x0, x1 = sorted((sx * (hx + CORNER_OUT), sx * (hx - CORNER_W)))
            y0, y1 = sorted((sy * (hy + CORNER_OUT), sy * (hy - CORNER_W)))
            box(bm, x0, x1, y0, y1, SKIRT_H, EAVE, MI["TrailerTrim"], skip=('-z', '+z'))


def flat_ring(bm, side, outer, inner, n, mat):
    """A mitred flat ring at normal offset `n`, facing outward - a rectangle with a
    rectangular hole in it, in 4 quads."""
    org, U, V, N, L = wall_frame(side)
    ou0, ou1, ov0, ov1 = outer
    iu0, iu1, iv0, iv1 = inner
    P = lambda u, v: tuple(org + U * u + V * v + N * n)
    quad(bm, [P(ou0, ov0), P(ou1, ov0), P(iu1, iv0), P(iu0, iv0)], mat)
    quad(bm, [P(iu0, iv1), P(iu1, iv1), P(ou1, ov1), P(ou0, ov1)], mat)
    quad(bm, [P(ou0, ov0), P(iu0, iv0), P(iu0, iv1), P(ou0, ov1)], mat)
    quad(bm, [P(iu1, iv0), P(ou1, ov0), P(ou1, ov1), P(iu1, iv1)], mat)


def build_curtain(bm, side, rect, n, pleats, mat):
    """Pleated curtain filling `rect` at normal offset `n`. A zigzag across u: alternate
    fold lines sit CURTAIN_PLEAT_D further back, so consecutive quads slant opposite ways
    and flat shading bands them light/dark. `pleats` must be even, so both outer edges
    return to `n` and meet the reveal flush."""
    org, U, V, N, _ = wall_frame(side)
    u0, u1, v0, v1 = rect
    P = lambda u, v, d: tuple(org + U * u + V * v + N * d)

    def fold_d(i):
        """Depth of fold line i. The two outer lines MUST be 0 - that is what makes the
        curtain meet the reveal flush - which is why an even `pleats` is required."""
        if i == 0 or i == pleats:
            return 0.0
        if i % 2:                                      # valley
            return CURTAIN_PLEAT_D * CURTAIN_VALLEY_MIX[(i // 2) % len(CURTAIN_VALLEY_MIX)]
        return CURTAIN_PLEAT_D * CURTAIN_PEAK_MIX      # interior peak, pulled back a little

    for i in range(pleats):
        ua = u0 + (u1 - u0) * i / pleats
        ub = u0 + (u1 - u0) * (i + 1) / pleats
        da, db = n - fold_d(i), n - fold_d(i + 1)
        quad(bm, [P(ua, v0, da), P(ub, v0, db), P(ub, v1, db), P(ua, v1, da)], mat)


def flat_ring_z(bm, outer, inner, z, mat, down=True):
    """Horizontal mitred ring at height z - a rectangle with a rectangular hole. Rects are
    (x0, x1, y0, y1). CCW seen from above is +Z; `down` reverses each quad for -Z."""
    X0, X1, Y0, Y1 = outer
    x0, x1, y0, y1 = inner
    P = lambda x, y: (x, y, z)
    for pts in ([P(X0, Y0), P(X1, Y0), P(x1, y0), P(x0, y0)],
                [P(x0, y1), P(x1, y1), P(X1, Y1), P(X0, Y1)],
                [P(X0, Y0), P(x0, y0), P(x0, y1), P(X0, Y1)],
                [P(x1, y0), P(X1, Y0), P(X1, Y1), P(x1, y1)]):
        quad(bm, pts[::-1] if down else pts, mat)


def build_recess(bm, side, hole, depth, back_mat, reveal_mat=None, start=0.0,
                 back_hole=None, pleats=0):
    """Sink an opening in by `depth` and cap the back. The cap is the curtain (windows)
    or the door slab - either way the missing interior is never visible.

    The outer ring sits at `start` along the wall normal - 0 is the wall plane, FRAME_OUT
    puts it at the front face of a picture frame so the reveal continues that frame's inner
    edge with no gap. Because the siding only ever cuts inward and by much less than
    `depth`, the grooved wall edges land inside these reveal planes - the surfaces meet,
    with no gap to see through."""
    org, U, V, N, L = wall_frame(side)
    u0, u1, v0, v1 = hole
    P = lambda u, v: org + U * u + V * v + N * start
    outer = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)]     # CCW seen from outside
    inner = [p - N * depth for p in outer]
    rm = MI["TrailerTrim"] if reveal_mat is None else reveal_mat
    for k in range(4):
        k2 = (k + 1) % 4
        quad(bm, [tuple(outer[k]), tuple(outer[k2]), tuple(inner[k2]), tuple(inner[k])], rm)
    if back_hole is None and pleats:
        build_curtain(bm, side, hole, start - depth, pleats, back_mat)
    elif back_hole is None:
        quad(bm, [tuple(p) for p in inner], back_mat)
    else:
        # The door slab is a ring, not a solid cap - otherwise it covers the window let
        # into it and the window is never seen.
        flat_ring(bm, side, hole, back_hole, start - depth, back_mat)


def build_frame(bm, side, hole, mat=None, skip_bottom=False):
    """Proud picture frame around an opening: a mitred front ring standing FRAME_OUT off
    the wall, plus the outer edge wall that closes it back down to the wall plane.

    `skip_bottom` drops the bottom member for the door, whose sill IS the wall bottom -
    that member would be degenerate. Its edge wall is still emitted, so the frame has an
    underside rather than an open slot above the stoop.
    """
    org, U, V, N, L = wall_frame(side)
    m = MI["TrailerTrim"] if mat is None else mat
    iu0, iu1, iv0, iv1 = hole
    ou0, ou1 = iu0 - FRAME_W, iu1 + FRAME_W
    ov0, ov1 = (iv0 if skip_bottom else iv0 - FRAME_W), iv1 + FRAME_W
    P = lambda u, v, n: tuple(org + U * u + V * v + N * n)

    F = FRAME_OUT
    if not skip_bottom:                                            # front ring, mitred
        quad(bm, [P(ou0, ov0, F), P(ou1, ov0, F), P(iu1, iv0, F), P(iu0, iv0, F)], m)
    quad(bm, [P(iu0, iv1, F), P(iu1, iv1, F), P(ou1, ov1, F), P(ou0, ov1, F)], m)
    quad(bm, [P(ou0, ov0, F), P(iu0, iv0, F), P(iu0, iv1, F), P(ou0, ov1, F)], m)
    quad(bm, [P(iu1, iv0, F), P(ou1, ov0, F), P(ou1, ov1, F), P(iu1, iv1, F)], m)

    # outer edge wall, FRAME_OUT -> wall plane. Windings give outward-in-plane normals:
    # cross(U,N) = -V, cross(V,N) = +U (the frame is right-handed in (U,V,N)).
    quad(bm, [P(ou0, ov0, 0), P(ou1, ov0, 0), P(ou1, ov0, F), P(ou0, ov0, F)], m)
    quad(bm, [P(ou1, ov1, 0), P(ou0, ov1, 0), P(ou0, ov1, F), P(ou1, ov1, F)], m)
    quad(bm, [P(ou0, ov0, 0), P(ou0, ov0, F), P(ou0, ov1, F), P(ou0, ov1, 0)], m)
    quad(bm, [P(ou1, ov0, 0), P(ou1, ov1, 0), P(ou1, ov1, F), P(ou1, ov0, F)], m)


def build_mullion(bm, side, hole):
    """One vertical glazing bar across a window, from just inside the wall plane back to
    the curtain. Top and bottom butt into the reveal and the back into the curtain, so
    only the front and two sides are emitted - 6 tris a window."""
    if MULLION_W <= 0:
        return
    org, U, V, N, L = wall_frame(side)
    m = MI["TrailerTrim"]
    _, _, v0, v1 = hole
    uc = (hole[0] + hole[1]) / 2
    u0, u1 = uc - MULLION_W / 2, uc + MULLION_W / 2
    nf, nb = -MULLION_INSET, -WIN_DEPTH
    P = lambda u, v, n: tuple(org + U * u + V * v + N * n)
    quad(bm, [P(u0, v0, nf), P(u1, v0, nf), P(u1, v1, nf), P(u0, v1, nf)], m)
    quad(bm, [P(u0, v0, nb), P(u0, v0, nf), P(u0, v1, nf), P(u0, v1, nb)], m)
    quad(bm, [P(u1, v0, nb), P(u1, v1, nb), P(u1, v1, nf), P(u1, v0, nf)], m)


def door_window_rect(hole):
    """The window let into the upper door slab, in wall-local coords. The door's back cap
    is punched with this same rect, so the two must be derived from one place."""
    u0, u1, v0, _ = hole
    uc = (u0 + u1) / 2
    return (uc - DOOR_WIN_W / 2, uc + DOOR_WIN_W / 2,
            v0 + DOOR_WIN_Z0, v0 + DOOR_WIN_Z0 + DOOR_WIN_H)


def build_door_detail(bm, side, hole):
    """The two things that stop the door reading as a painted rectangle: a window let into
    the upper slab, and a latch-side knob."""
    # sunk from the door slab, not the wall - so it starts at -DOOR_DEPTH.
    build_recess(bm, side, door_window_rect(hole), DOOR_WIN_DEPTH, MI["TrailerCurtain"],
                 reveal_mat=MI["TrailerDoor"], start=-DOOR_DEPTH,
                 pleats=DOOR_CURTAIN_PLEATS)

    # knob. The door is on +y, where the wall u-axis is -X, so u = -x.
    y0 = WIDTH / 2 - DOOR_DEPTH
    kx = DOOR_X + DOOR_W / 2 - 0.14
    kz = SKIRT_H + 1.00
    box(bm, kx - KNOB_W / 2, kx + KNOB_W / 2, y0, y0 + KNOB_OUT,
        kz - KNOB_H / 2, kz + KNOB_H / 2, MI["TrailerTrim"], skip=('-y',))


def _under_z(y):
    """Roof UNDERSIDE height at a given y.

    The slope is pinned so the underside meets the wall top exactly at y = +-WIDTH/2,
    i.e. at EAVE. Deriving it from the overhang width instead leaves the underside below
    the wall top and the walls poke through the roof.
    """
    return EAVE + ROOF_RISE * (1.0 - abs(y) / (WIDTH / 2))


def build_roof(bm):
    """Shallow gable slab with overhang: a closed prism, so it has thickness at the eaves."""
    hx = LENGTH / 2 + ROOF_OVER
    hy = WIDTH / 2 + ROOF_OVER
    m = MI["TrailerRoof"]
    und = [(-hy, _under_z(-hy)), (0.0, _under_z(0.0)), (hy, _under_z(hy))]
    top = [(y, z + ROOF_THK) for y, z in und]

    for i in range(2):
        (ya, za), (yb, zb) = top[i], top[i + 1]                      # top slopes, face up
        quad(bm, [(-hx, ya, za), (hx, ya, za), (hx, yb, zb), (-hx, yb, zb)], m)
        (ya, za), (yb, zb) = und[i], und[i + 1]                      # undersides, face down
        quad(bm, [(-hx, yb, zb), (hx, yb, zb), (hx, ya, za), (-hx, ya, za)], m)

    for idx, sgn in ((0, -1), (2, 1)):                               # eave fascia, +-Y
        y, uz = und[idx]
        tz = uz + ROOF_THK
        pts = [(-hx, y, uz), (hx, y, uz), (hx, y, tz), (-hx, y, tz)]
        quad(bm, pts if sgn > 0 else pts[::-1], m)

    for x, sgn in ((hx, 1), (-hx, -1)):                              # end caps, +-X
        ring = [(x, y, z) for y, z in und] + [(x, y, z) for y, z in reversed(top)]
        f = bm.faces.new([bm.verts.new(p) for p in (ring if sgn > 0 else ring[::-1])])
        f.material_index = m
        f.smooth = False


def build_gables(bm):
    """Triangular infill between the wall top and the roof underside at each end.

    Without these the attic void is open: you look straight through the gable and see the
    inside of the far wall - exactly the missing-interior tell this asset must avoid.
    """
    hw = WIDTH / 2
    for side in ('+x', '-x'):
        org, U, V, N, L = wall_frame(side)
        P = lambda u, v: tuple(org + U * u + V * v)
        f = bm.faces.new([bm.verts.new(p) for p in
                          (P(-hw, EAVE), P(hw, EAVE), P(0.0, EAVE + ROOF_RISE))])
        f.material_index = MI["TrailerBody"]
        f.smooth = False


def _tread(i):
    """(z of the tread top, y of its outer edge) for tread i, 0 = bottom. Treads march
    OUTWARD as they descend, so tread N-1 lands at the door threshold."""
    y0 = WIDTH / 2
    return SKIRT_H * (i + 1) / STEP_N, y0 + STEP_RUN * (STEP_N - i)


def build_steps(bm):
    """Open tubular-metal stair under the door on the +Y face, plus a rail each side.

    Nothing here is solid: treads are slabs spanning between four leg bars, so you can see
    daylight through the flight the way you can on the reference. The rail posts stand
    RAIL_GAP outboard of the tread width, which is what lets them run ground-to-rail in one
    bar without punching through a tread.
    """
    m = MI["TrailerTrim"]
    y0 = WIDTH / 2
    hw = STEP_W / 2

    for i in range(STEP_N):                                    # treads
        z, ye = _tread(i)
        box(bm, DOOR_X - hw, DOOR_X + hw, ye - STEP_RUN, ye, z - STEP_THK, z, m,
            skip=('-z',))

    z_bot, y_bot = _tread(0)                                   # legs: outer pair, inner pair
    z_top, y_top = _tread(STEP_N - 1)
    for sx in (-1, 1):
        lx = DOOR_X + sx * (hw - STEP_LEG_R * 2)
        tube(bm, (lx, y_bot - STEP_RUN + STEP_LEG_R, 0.0),
                 (lx, y_bot - STEP_RUN + STEP_LEG_R, z_bot), STEP_LEG_R, m)
        tube(bm, (lx, y_top - STEP_LEG_R, 0.0),
                 (lx, y_top - STEP_LEG_R, z_top), STEP_LEG_R, m)

    for sx in (-1, 1):                                         # handrails
        rx = DOOR_X + sx * (hw + RAIL_GAP)
        yb, zb = y_bot - STEP_RUN + RAIL_R, z_bot + RAIL_H
        yt, zt = y_top - RAIL_R, z_top + RAIL_H
        tube(bm, (rx, yb, 0.0), (rx, yb, zb), RAIL_R, m, cap1=True)
        tube(bm, (rx, yt, 0.0), (rx, yt, zt), RAIL_R, m, cap1=True)
        tube(bm, (rx, yb, zb), (rx, yt, zt), RAIL_R, m, cap0=True, cap1=True)


def build_chimney(bm):
    """Woodburner flue: a pipe off the ridge with a rain cap. Deliberately tiny - it is the
    one thing on the model that says somebody heats this place."""
    m = MI["TrailerTrim"]
    z0 = RIDGE + ROOF_THK
    tube(bm, (CHIM_X, 0.0, z0 - 0.06), (CHIM_X, 0.0, z0 + CHIM_H), CHIM_R, m, cap1=True)
    box(bm, CHIM_X - CHIM_CAP_R, CHIM_X + CHIM_CAP_R, -CHIM_CAP_R, CHIM_CAP_R,
        z0 + CHIM_H, z0 + CHIM_H + CHIM_CAP_T, m, skip=('-z',))


def build_skirt_detail(bm):
    """Battened skirting: vertical ribs, a ground rail, and one crawl-space vent.

    The plain box the skirt used to be read as a plinth. Ribs stand SKIRT_RIB_OUT proud -
    less than SKIRT_INSET, so they stay tucked under the body overhang and their top faces
    are never visible, which is what lets the '+z' skip be free rather than a hole.
    """
    m = MI["TrailerSkirt"]
    hx, hy = LENGTH / 2 - SKIRT_INSET, WIDTH / 2 - SKIRT_INSET
    vz = SKIRT_H * 0.55
    vent = (VENT_X - VENT_W / 2, VENT_X + VENT_W / 2, vz - VENT_H / 2, vz + VENT_H / 2)

    # The skirt box, with its -Y face left out and rebuilt as a ring around the vent.
    # build_recess() SINKS an opening, it does not PUNCH one - the walls get their holes
    # from build_wall()'s grid, and a plain box() has none. Skip that step and the vent is
    # a sealed pocket behind an intact face, invisible from outside.
    box(bm, -hx, hx, -hy, hy, 0.0, SKIRT_H, m, skip=('-z', '+z', '-y'))
    flat_ring(bm, '-y', (-hx, hx, 0.0, SKIRT_H), vent, -SKIRT_INSET, m)

    # Close the ledge between the inset skirt and the wider body. This was an OPEN RING -
    # the skirt box has no top face and the wall starts SKIRT_INSET further out, so there
    # was a 0.06 m slot you could see into from below. It also covers the rib tops, which
    # is what makes their '+z' skip safe.
    flat_ring_z(bm, (-LENGTH / 2, LENGTH / 2, -WIDTH / 2, WIDTH / 2),
                (-hx, hx, -hy, hy), SKIRT_H, m, down=True)

    for sy in (-1, 1):                                         # ribs, long flanks
        n = max(1, round(LENGTH / SKIRT_RIB_PITCH))
        for k in range(n + 1):
            x = -hx + (2 * hx) * k / n
            x = min(max(x, -hx + SKIRT_RIB_W / 2), hx - SKIRT_RIB_W / 2)
            y0, y1 = sorted((sy * hy, sy * (hy + SKIRT_RIB_OUT)))
            box(bm, x - SKIRT_RIB_W / 2, x + SKIRT_RIB_W / 2, y0, y1,
                0.0, SKIRT_H, m, skip=('-z', '+z', '-y' if sy > 0 else '+y'))

    for sx in (-1, 1):                                         # ribs, ends
        x0, x1 = sorted((sx * hx, sx * (hx + SKIRT_RIB_OUT)))
        box(bm, x0, x1, -SKIRT_RIB_W / 2, SKIRT_RIB_W / 2, 0.0, SKIRT_H, m,
            skip=('-z', '+z', '-x' if sx > 0 else '+x'))

    for sy in (-1, 1):                                         # ground rail, long flanks
        y0, y1 = sorted((sy * hy, sy * (hy + SKIRT_RAIL_OUT)))
        box(bm, -hx, hx, y0, y1, 0.0, SKIRT_RAIL_H, m,
            skip=('-z', '-y' if sy > 0 else '+y'))
    for sx in (-1, 1):
        x0, x1 = sorted((sx * hx, sx * (hx + SKIRT_RAIL_OUT)))
        box(bm, x0, x1, -hy, hy, 0.0, SKIRT_RAIL_H, m,
            skip=('-z', '-x' if sx > 0 else '+x'))

    # Sink the vent through the hole punched above. start = -SKIRT_INSET because
    # wall_frame() is the BODY plane and the skirt sits inside it - without that the vent
    # would float proud of the skirting.
    build_recess(bm, '-y', vent, VENT_DEPTH, MI["TrailerRoof"], reveal_mat=m,
                 start=-SKIRT_INSET)


# ---------------------------------------------------------------------------
def build():
    bm = bmesh.new()

    # walls + openings
    win_v = (WIN_Z0_S, WIN_Z1_S)
    door_hole = (-(DOOR_X + DOOR_W / 2), -(DOOR_X - DOOR_W / 2), SKIRT_H, DOOR_Z1_S)
    plan = {}
    # NOTE: on +y the wall u-axis is -X, so an X centre maps to u = -x.
    plan['+y'] = [(-x - WIN_W / 2, -x + WIN_W / 2, *win_v) for x in SIDE_WIN_X
                  if abs(-x - (-DOOR_X)) > (DOOR_W + WIN_W) / 2 + 0.2] + [door_hole]
    plan['-y'] = [(x - WIN_W / 2, x + WIN_W / 2, *win_v) for x in SIDE_WIN_X]
    plan['+x'] = [(-END_WIN_W / 2, END_WIN_W / 2, *win_v)]
    plan['-x'] = [(-END_WIN_W / 2, END_WIN_W / 2, *win_v)]

    for side, holes in plan.items():
        build_wall(bm, side, holes)
        for h in holes:
            is_door = (h == door_hole and side == '+y')
            # The recess starts at the frame's front face, so the two share an edge.
            build_recess(bm, side, h, (DOOR_DEPTH if is_door else WIN_DEPTH) + FRAME_OUT,
                         MI["TrailerDoor"] if is_door else MI["TrailerCurtain"],
                         start=FRAME_OUT,
                         back_hole=door_window_rect(h) if is_door else None,
                         pleats=0 if is_door else CURTAIN_PLEATS)
            build_frame(bm, side, h, skip_bottom=is_door)
            if is_door:
                build_door_detail(bm, side, h)
            else:
                build_mullion(bm, side, h)

    build_corners(bm)
    build_roof(bm)
    build_gables(bm)
    build_skirt_detail(bm)
    build_steps(bm)
    build_chimney(bm)

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.normal_update()
    me = bpy.data.meshes.new("TrailerHomeA")
    bm.to_mesh(me)
    bm.free()

    obj = bpy.data.objects.new("TrailerHomeA", me)
    bpy.context.collection.objects.link(obj)
    for name, col, rough in MATS:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        b = mat.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = col
        b.inputs["Roughness"].default_value = rough
        me.materials.append(mat)
    return obj


def tri_count(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    return sum(len(p.vertices) - 2 for p in obj.evaluated_get(dg).to_mesh().polygons)


def tris_by_material(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    m = obj.evaluated_get(dg).to_mesh()
    out = {}
    for p in m.polygons:
        n = obj.data.materials[p.material_index].name
        out[n] = out.get(n, 0) + len(p.vertices) - 2
    return out


def export_glb(path, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True,
        export_yup=True, export_draco_mesh_compression_enable=False,
        export_materials='EXPORT')


def main():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)

    obj = build()
    bpy.context.view_layer.update()
    print("TrailerHomeA: %d tris" % tri_count(obj))
    for k, v in sorted(tris_by_material(obj).items(), key=lambda kv: -kv[1]):
        print("   %-16s %4d" % (k, v))
    print("siding: %d courses of %.4f m, groove %.3f m" % (N_COURSE, COURSE_H, SIDING_DEPTH))
    print("dims: %.3f x %.3f x %.3f m" % tuple(obj.dimensions))

    here = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else "/tmp"
    if "--export" in sys.argv:
        export_glb(os.path.normpath(os.path.join(here, "..", NAME + ".glb")), [obj])
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(here, NAME + ".blend"))


if __name__ == "__main__":
    main()
