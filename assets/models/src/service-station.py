"""
ASSET-82 — the SERVICE STATION.  Parametric generator.

Built for: Blender 5.2  |  Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

The autoShop POI, the service center (src/poi.js): a painted-block two-car service bay with a small
office on its +X end.  Two roll-up doors (rolled up) face the road under a blue fascia and one sign
board, AUTO SERVICE (generic: the shop's name rolls per seed).  Bay A, the player's, has a FLUSH scissor
lift, lowered: its runways are tiled into the slab, so the truck drives straight onto it and the wheels
need nothing new (they ride the analytic pad surface, physics.js).  Bay B has the same lift RAISED with
its scissor arms showing: that is what tells you the flat yellow plates in bay A are a lift.
FEAT-178 (Lane B) snaps the camera to bay B's back corner while the service screen is open: across the
raised lift to the parked truck's driver-side front corner (owner, 2026-11-07: "move it to the other front
corner ... in the bay next to the one you park in").

    ServiceStation   one mesh, 9 materials, 1 image (the 1024 x 256 sign atlas)

AXES.  Blender +Y = glTF -Z = forward = the ROAD face (doors, sign).  Width runs along X = along the
road.  Base-seated (z = 0), centred on the wall footprint (bay block + office, x -6.3..6.3, y -4..4).
Three.js model frame = (x, z, -y): every registry number below is printed in that frame.

ON THE 14 x 8 LAY-BY, seat 1.3 + seatAlong 0.5 (pad x = x + SEAT_ALONG, pad z = SEAT - y).  Two limits
squeeze the 8 m depth:
  - test/poi-yard.mjs: every collision-box corner within PAD_RIM_HOLD - 0.25 = 1.35 m of the pad's rounded
    outline.  The back wall at seat 1.3 stands 1.3 m past the far edge.  seatAlong slides the building
    0.5 m toward the office end so the -X back corner clears the 1.5 m pad-corner rounding (1.32 m).
  - The pad is fully flat only from 1.4 m in from its road edge (road.js POI_ROAD_FEATHER 2.0 starts at the
    shoulder, 0.6 m outside the pad).  The front wall stands 0.1 m short of that, at pad z -2.7, where the
    feather's smoothstep already gives the pad 99.3 % authority.
At seat 1.4 the front was exactly on the flat line, but the back wall broke poi-yard's 1.35 m (Lane B,
2026-11-07).  pad_check() proves both limits.

WINDING.  Every face goes through face(), which takes the direction the face must point and flips the
polygon to suit.  check_facing() proves it by ray cast.  NOTHING IS STACKED: decals (lift plates, base
strip, wainscot, light lenses, drawer lines) are cut into their backing plane by tile().

Headless (never the owner's GUI Blender):
    /Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 \\
        --python assets/models/src/service-station.py -- export render
`export` writes the .glb and saves the .blend (model only); `render` then adds the pad, the road and
the Ranger parked on lift A and writes the review renders to RENDER_DIR (under wip/, git-invisible).
"""

import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

# ---------------------------------------------------------------------------
# PARAMETERS
# ---------------------------------------------------------------------------
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))   # this checkout
NAME = "service-station"
OUT_DIR = f"{REPO}/assets/models"
OUT_BLEND = f"{OUT_DIR}/src/{NAME}.blend"
RENDER_DIR = f"{REPO}/wip/{NAME}/out"
TRI_BUDGET = 2500
RANGER_GLB = f"{REPO}/assets/models/ranger.glb"   # render scenery only, never exported

# --- the lay-by (pad frame: x along the road, pad z = SEAT - y, -z = road side) ---
SEAT = 1.3                  # registry `seat`
SEAT_ALONG = 0.5            # registry `seatAlong`: the model slides this far along its own +X
PAD_HX, PAD_HZ, PAD_R = 7.0, 4.0, 1.5   # poi.js poiPadHalfLen / HalfWid / CornerR
FLAT_Z = -2.6               # the pad is flat from here back (1.4 m in from its road edge)
FEATHER_SLACK = 0.1         # ground contact may stand this far into the feather (smoothstep: >= 99.3 % pad)
RIM = 1.6                   # road-carve.js PAD_RIM_HOLD: graded flat this far beyond the pad
RIM_KEEP = RIM - 0.25       # test/poi-yard.mjs: every collision-box corner within this of the pad

# --- the Ranger (data/ranger.js), for the lift and the clearance print ---
TRACK, WHEEL_R = 1.43, 0.368
AXLE_F, AXLE_R = 1.2825, 1.5675     # front / rear axle from the CG (vehicle-models.js)
BODY_L, SHIFT_REAR = 4.705, 0.299   # model length; its bbox centre sits this far behind the CG
HALF_W = 1.00                       # half width over the mirrors

# --- envelope ---
BAY_X = (-6.3, 2.7)         # the bay block along the road
OFF_X = (2.7, 6.3)          # the office
HY = 4.0                    # bay block y -4..4
OFF_Y0 = -1.0               # office y -1..4
WT = 0.20                   # wall thickness
BASE_H = 0.30               # dark base strip, flush in the wall plane
FASCIA_Z, OFF_FASCIA_Z, FASCIA_OUT = (3.55, 4.60), (2.95, 3.40), 0.04
PARAPET_T = 0.10
DECK, OFF_DECK = 4.35, 3.20  # roof decks, sunk behind the parapets
CEIL = 4.0
SLAB_Z = 0.005              # Lane B: <= 5 mm above the pad or the tyre draws sunk
IX0, IX1, IY0, IY1 = BAY_X[0] + WT, BAY_X[1] - WT, -HY + WT, HY - WT   # interior

# --- the doors (rolled up) ---
DOORS = ((-5.55, -2.35), (-1.25, 1.95))
DOOR_H = 3.30
GUARD = (0.06, 1.20)        # yellow jamb guards inside the reveal: width, height

# --- the lifts ---
LIFT_A, LIFT_B = -3.95, 0.35        # bay centre lines
LIFT_Y = 0.20               # where the truck's centre parks (runways centred here)
RUN_W, RUN_L = 0.66, 4.60   # each runway
PIT = 0.03                  # dark gap round the lift
RAISE = 0.90                # lift B's deck top: low enough to clear the camera's view of the truck, still raised
RUN_T = 0.12

# --- the office front ---
ODOOR_X, ODOOR_H = (3.05, 3.95), 2.15
OWIN_X, OWIN_Z = (4.35, 5.95), (0.95, 2.15)
OREC = 0.10                 # office opening reveal depth

# --- the sign (4:1 = the atlas) ---
SIGN_X, SIGN_Z, SIGN_T = (-3.6, 0.0), (3.63, 4.53), 0.06
TEX_W, TEX_H = 1024, 256
SIGN_FONT = "/System/Library/Fonts/Supplemental/Arial Black.ttf"

# --- the FEAT-178 camera: bay B's back corner, partition side (Blender frame) ---
CAM_EYE = (2.3, -3.6, 3.0)
CAM_LOOK_Z = 0.9
CAM_FOV = 60                # main.js's camera (the registry's fov is for the render only)

MATS = {
    #  name             base colour (linear)        rough  emissive
    "ShopWall":     ((0.600, 0.585, 0.540), 0.90, None),   # painted block, ceiling, blinds
    "ShopBlue":     ((0.025, 0.090, 0.330), 0.70, None),   # the brand: fascia, wainscot, office door, compressor
    "ShopDark":     ((0.030, 0.030, 0.034), 0.85, None),   # base strip, roof, pits, tyres, pegboard
    "ShopSteel":    ((0.380, 0.390, 0.400), 0.45, None),   # coping, frames, doors' coils, bench, fixtures
    "ShopConcrete": ((0.290, 0.280, 0.262), 0.95, None),   # the slab
    "ShopYellow":   ((0.800, 0.500, 0.020), 0.70, None),   # lifts, jamb guards, console, drain caddy
    "ShopRed":      ((0.430, 0.035, 0.025), 0.70, None),   # tool chest, extinguisher
    "ShopLight":    ((0.600, 0.660, 0.640), 0.50, (0.700, 0.770, 0.750)),   # the fluorescent strips
    "ShopSign":     (None, 0.80, None),                    # the atlas
}
INK = {  # atlas colours (linear; the Standard view transform writes them through unchanged)
    "white": (0.780, 0.790, 0.780),
    "blue":  MATS["ShopBlue"][0],
    "red":   MATS["ShopRed"][0],
}

X_, Y_, Z_ = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


# ---------------------------------------------------------------------------
# Geometry accumulator (burger-joint.py's, plus a per-face UV for the sign)
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name, self.v, self.f, self.m, self.uv = name, [], [], [], []

    def face(self, pts, mat, out, uv=None):
        """One polygon, wound so its normal points along `out`.  `uv`: per-vertex, sign faces only."""
        pts = [Vector(p) for p in pts]
        uvs = list(uv) if uv else [(0.0, 0.0)] * len(pts)
        n = Vector()
        for i, a in enumerate(pts):          # Newell normal: robust for any planar polygon
            b = pts[(i + 1) % len(pts)]
            n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x),
                         (a.x - b.x) * (a.y + b.y)))
        if n.dot(Vector(out)) < 0:
            pts.reverse()
            uvs.reverse()
        o = len(self.v)
        self.v.extend(tuple(p) for p in pts)
        self.f.append(list(range(o, o + len(pts))))
        self.m.append(mat)
        self.uv.append(uvs)


def solid(p, bot, top, mat, skip=()):
    """Convex prism between two matching rings; each face points away from the centroid."""
    bot, top = [Vector(v) for v in bot], [Vector(v) for v in top]
    c = sum(bot + top, Vector()) / (2 * len(bot))
    n = len(bot)
    for i in range(n):
        if i in skip:
            continue
        q = [bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]]
        p.face(q, mat, sum(q, Vector()) / 4 - c)
    if "bot" not in skip:
        p.face(bot, mat, sum(bot, Vector()) / n - c)
    if "top" not in skip:
        p.face(top, mat, sum(top, Vector()) / n - c)


def box(p, lo, hi, mat, skip=()):
    """Axis box.  Side order: 0 -Y, 1 +X, 2 +Y (front), 3 -X."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    ring = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    solid(p, [(x, y, z0) for x, y in ring], [(x, y, z1) for x, y in ring], mat, skip)


def ngon(r, n, cx=0.0, cz=0.0, a0=math.pi / 2):
    return [(cx + r * math.cos(a0 + 2 * math.pi * k / n), cz + r * math.sin(a0 + 2 * math.pi * k / n))
            for k in range(n)]


def poly_area(pts):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1])) / 2


def relief(p, pts, y0, y1, mat, cx=0.0, cz=0.0):
    """A flat (x, z) outline extruded from the plane y0 out to y1 (+Y): front face + side walls, no back."""
    ccw = poly_area(pts) > 0
    P = lambda x, z, y: (cx + x, y, cz + z)
    p.face([P(x, z, y1) for x, z in pts], mat, Y_)
    for (ax, az), (bx, bz) in zip(pts, pts[1:] + pts[:1]):
        dx, dz = bx - ax, bz - az
        out = Vector((dz, 0, -dx)) if ccw else Vector((-dz, 0, dx))
        p.face([P(ax, az, y0), P(bx, bz, y0), P(bx, bz, y1), P(ax, az, y1)], mat, out)


def tile(p, rects, P, out):
    """Coplanar rectangles (u0, u1, v0, v1, mat), later ones on top, cut into non-overlapping quads in
    ONE plane (a decal stacked a few mm over its backing z-fights at range).  mat None = a hole."""
    sw = lambda rs: [(v0, v1, u0, u1, m) for u0, u1, v0, v1, m in rs]
    for u0, u1, v0, v1, m in min(_greedy(rects), sw(_greedy(sw(rects))), key=len):
        p.face([P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], m, out)


def _greedy(rects):
    us = sorted({e for r in rects for e in r[:2]})
    vs = sorted({e for r in rects for e in r[2:4]})
    grid = {}
    for i in range(len(us) - 1):
        for j in range(len(vs) - 1):
            u, v = (us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2
            hit = [m for u0, u1, v0, v1, m in rects if u0 < u < u1 and v0 < v < v1]
            grid[i, j] = hit[-1] if hit else None
    quads = []
    for j in range(len(vs) - 1):
        for i in range(len(us) - 1):
            m = grid[i, j]
            if m is None:
                continue
            i1, j1 = i, j
            while grid.get((i1 + 1, j)) == m:
                i1 += 1
            while all(grid.get((k, j1 + 1)) == m for k in range(i, i1 + 1)):
                j1 += 1
            for k in range(i, i1 + 1):
                for l in range(j, j1 + 1):
                    grid[k, l] = None
            quads.append((us[i], us[i1 + 1], vs[j], vs[j1 + 1], m))
    return quads


def offset_line(pts, d, closed):
    """Plan polyline moved d along each edge's right-hand normal (outward for a CCW outline), mitred.
    Axis-aligned runs only."""
    n = len(pts)
    nrm = lambda a, b: Vector((b[1] - a[1], -(b[0] - a[0]))).normalized()
    out = []
    for i in range(n):
        ns = []
        if closed or i > 0:
            ns.append(nrm(pts[i - 1], pts[i]))
        if closed or i < n - 1:
            ns.append(nrm(pts[i], pts[(i + 1) % n]))
        m = sum(ns, Vector((0, 0)))
        out.append((pts[i][0] + m.x * d, pts[i][1] + m.y * d))
    return out


def edges(pts, closed):
    return list(zip(pts, pts[1:] + pts[:1])) if closed else list(zip(pts, pts[1:]))


def band(p, pts, closed, z0, z1, out, mat):
    """A band standing `out` proud of the plan outline, z0..z1, with its underside ledge (the coping
    covers its top)."""
    o = offset_line(pts, out, closed)
    for (a, b), (c, d) in zip(edges(pts, closed), edges(o, closed)):
        mid = Vector(((c[0] + d[0]) / 2 - (a[0] + b[0]) / 2, (c[1] + d[1]) / 2 - (a[1] + b[1]) / 2, 0))
        p.face([(c[0], c[1], z0), (d[0], d[1], z0), (d[0], d[1], z1), (c[0], c[1], z1)], mat, mid)
        p.face([(a[0], a[1], z0), (b[0], b[1], z0), (d[0], d[1], z0), (c[0], c[1], z0)], mat, -Z_)


def parapet(p, pts, closed, top, deck, out):
    """Steel coping from the band's face to PARAPET_T inside the wall, the parapet's inner faces down
    to the sunk deck, and the deck."""
    o, i = offset_line(pts, out, closed), offset_line(pts, -PARAPET_T, closed)
    for (a, b), (c, d) in zip(edges(o, closed), edges(i, closed)):
        p.face([(a[0], a[1], top), (b[0], b[1], top), (d[0], d[1], top), (c[0], c[1], top)], "ShopSteel", Z_)
        inward = Vector((c[0] - a[0], c[1] - a[1], 0))
        p.face([(c[0], c[1], deck), (d[0], d[1], deck), (d[0], d[1], top), (c[0], c[1], top)], "ShopWall", inward)
    p.face([(x, y, deck) for x, y in i], "ShopDark", Z_)


def tyre(p, c, axis, r=0.33, w=0.22, bore=0.19, n=8, caps=(True, True)):
    """A tyre with no rim: tread, bore, and the two sidewall rings.  axis 'x' or 'z'."""
    cx, cy, cz = c
    if axis == "x":
        P = lambda u, v, s: (cx + s, cy + u, cz + v)
        ax = X_
    else:
        P = lambda u, v, s: (cx + u, cy + v, cz + s)
        ax = Z_
    o, i = ngon(r, n, a0=math.pi / n), ngon(bore, n, a0=math.pi / n)
    for k in range(n):
        a, b = o[k], o[(k + 1) % n]
        mid = Vector(P((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0)) - Vector(c)
        p.face([P(*a, -w / 2), P(*b, -w / 2), P(*b, w / 2), P(*a, w / 2)], "ShopDark", mid)
        a, b = i[k], i[(k + 1) % n]
        mid = Vector(P((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0)) - Vector(c)
        p.face([P(*a, -w / 2), P(*b, -w / 2), P(*b, w / 2), P(*a, w / 2)], "ShopDark", -mid)
        for s, on in ((-1, caps[0]), (1, caps[1])):
            if on:
                p.face([P(*o[k], s * w / 2), P(*o[(k + 1) % n], s * w / 2),
                        P(*i[(k + 1) % n], s * w / 2), P(*i[k], s * w / 2)], "ShopDark", ax * s)


# ---------------------------------------------------------------------------
# Shell
# ---------------------------------------------------------------------------
BAY = [(BAY_X[0], -HY), (BAY_X[1], -HY), (BAY_X[1], HY), (BAY_X[0], HY)]           # CCW
OFFICE = [(OFF_X[0], OFF_Y0), (OFF_X[1], OFF_Y0), (OFF_X[1], HY), (OFF_X[0], HY)]  # open: butts the bay


def outer_walls(p):
    (bx0, bx1), (ox0, ox1), f0, of0 = BAY_X, OFF_X, FASCIA_Z[0], OFF_FASCIA_Z[0]
    D = "ShopDark"
    # front: both blocks in one plane, the doors and the office openings cut out
    holes = [(a, b, 0, DOOR_H, None) for a, b in DOORS]
    holes += [(*ODOOR_X, 0, ODOOR_H, None), (*OWIN_X, *OWIN_Z, None)]
    tile(p, [(bx0, bx1, 0, f0, "ShopWall"), (ox0, ox1, 0, of0, "ShopWall"), (bx0, ox1, 0, BASE_H, D)] + holes,
         lambda x, z: (x, HY, z), Y_)
    tile(p, [(bx0, bx1, 0, f0, "ShopWall"), (bx0, bx1, 0, BASE_H, D)], lambda x, z: (x, -HY, z), -Y_)
    tile(p, [(-HY, HY, 0, f0, "ShopWall"), (-HY, HY, 0, BASE_H, D)], lambda y, z: (bx0, y, z), -X_)
    # the bay's +X wall shows behind the office and above its roof deck
    tile(p, [(-HY, HY, 0, f0, "ShopWall"), (-HY, HY, 0, BASE_H, D), (OFF_Y0, HY, 0, OFF_DECK, None)],
         lambda y, z: (bx1, y, z), X_)
    tile(p, [(ox0, ox1, 0, of0, "ShopWall"), (ox0, ox1, 0, BASE_H, D)], lambda x, z: (x, OFF_Y0, z), -Y_)
    tile(p, [(OFF_Y0, HY, 0, of0, "ShopWall"), (OFF_Y0, HY, 0, BASE_H, D)], lambda y, z: (ox1, y, z), X_)
    band(p, BAY, True, *FASCIA_Z, FASCIA_OUT, "ShopBlue")
    band(p, OFFICE, False, *OFF_FASCIA_Z, FASCIA_OUT, "ShopBlue")
    z0, z1 = OFF_FASCIA_Z          # the office band's front end stands proud of the bay's wall: cap it
    p.face([(ox0, HY, z0), (ox0, HY + FASCIA_OUT, z0), (ox0, HY + FASCIA_OUT, z1), (ox0, HY, z1)], "ShopBlue", -X_)
    parapet(p, BAY, True, FASCIA_Z[1], DECK, FASCIA_OUT)
    parapet(p, OFFICE, False, OFF_FASCIA_Z[1], OFF_DECK, FASCIA_OUT)


def interior(p):
    """The bays' inside: walls blue to 1.2 m, the ceiling, the reveals, and the slab with both lift pits
    tiled into it."""
    W, B = "ShopWall", "ShopBlue"
    tile(p, [(IX0, IX1, 0, CEIL, W), (IX0, IX1, 0, 1.2, B)], lambda x, z: (x, IY0, z), Y_)
    tile(p, [(IY0, IY1, 0, CEIL, W), (IY0, IY1, 0, 1.2, B)], lambda y, z: (IX0, y, z), X_)
    tile(p, [(IY0, IY1, 0, CEIL, W), (IY0, IY1, 0, 1.2, B)], lambda y, z: (IX1, y, z), -X_)
    tile(p, [(IX0, IX1, 0, CEIL, W), (IX0, IX1, 0, 1.2, B)] + [(a, b, 0, DOOR_H, None) for a, b in DOORS],
         lambda x, z: (x, IY1, z), -Y_)
    p.face([(IX0, IY0, CEIL), (IX1, IY0, CEIL), (IX1, IY1, CEIL), (IX0, IY1, CEIL)], W, -Z_)
    for a, b in DOORS:
        p.face([(a, IY1, 0), (a, HY, 0), (a, HY, DOOR_H), (a, IY1, DOOR_H)], W, X_)
        p.face([(b, IY1, 0), (b, HY, 0), (b, HY, DOOR_H), (b, IY1, DOOR_H)], W, -X_)
        p.face([(a, IY1, DOOR_H), (b, IY1, DOOR_H), (b, HY, DOOR_H), (a, HY, DOOR_H)], W, -Z_)
    # the slab: concrete, lift A's plates flush in it, lift B's pit open (its runways are up)
    hx, ry0, ry1 = TRACK / 2 + RUN_W / 2, LIFT_Y - RUN_L / 2, LIFT_Y + RUN_L / 2
    rects = [(IX0, IX1, IY0, IY1, "ShopConcrete")] + [(a, b, IY1, HY, "ShopConcrete") for a, b in DOORS]
    for c, raised in ((LIFT_A, False), (LIFT_B, True)):
        rects.append((c - hx - PIT, c + hx + PIT, ry0 - PIT, ry1 + PIT, "ShopDark"))
        if raised:   # the base rails the scissor feet run in
            rects += [(c + s * TRACK / 2 - 0.10, c + s * TRACK / 2 + 0.10, ry0 + 0.3, ry1 - 0.3, "ShopSteel")
                      for s in (-1, 1)]
            continue
        for s in (-1, 1):
            x = c + s * TRACK / 2
            rects.append((x - RUN_W / 2, x + RUN_W / 2, ry0, ry1, "ShopYellow"))
        rects.append((c - TRACK / 2 + RUN_W / 2 + PIT, c + TRACK / 2 - RUN_W / 2 - PIT, ry0, ry1, "ShopSteel"))
    tile(p, rects, lambda x, y: (x, y, SLAB_Z), Z_)


def roll_doors(p):
    """Each door rolled up: the coil housing under the header inside, the two guide tracks, the bottom
    bar showing under the header, and the yellow guards on the jambs."""
    for a, b in DOORS:
        coil = ngon(0.22, 8, IY1 - 0.24, DOOR_H + 0.30)
        solid(p, [(a - 0.12, y, z) for y, z in coil], [(b + 0.12, y, z) for y, z in coil], "ShopSteel")
        for x0, x1 in ((a - 0.10, a), (b, b + 0.10)):
            box(p, (x0, IY1 - 0.10, 0), (x1, IY1, DOOR_H + 0.08), "ShopSteel", skip={2, "bot"})
        box(p, (a, IY1 - 0.07, DOOR_H - 0.07), (b, IY1 - 0.01, DOOR_H), "ShopSteel", skip={1, 3, "top"})
        gw, gh = GUARD
        box(p, (a, IY1, 0), (a + gw, HY, gh), "ShopYellow", skip={3, "bot"})
        box(p, (b - gw, IY1, 0), (b, HY, gh), "ShopYellow", skip={1, "bot"})


def office_front(p):
    """Office: a blue door with a dark pane, and a window with its pleated blinds drawn (no glass)."""
    yb = HY - OREC
    (dx0, dx1), (wx0, wx1), (wz0, wz1) = ODOOR_X, OWIN_X, OWIN_Z
    for x0, x1, z0, z1 in ((dx0, dx1, 0, ODOOR_H), (wx0, wx1, wz0, wz1)):
        p.face([(x0, yb, z0), (x0, HY, z0), (x0, HY, z1), (x0, yb, z1)], "ShopSteel", X_)
        p.face([(x1, yb, z0), (x1, HY, z0), (x1, HY, z1), (x1, yb, z1)], "ShopSteel", -X_)
        p.face([(x0, yb, z1), (x1, yb, z1), (x1, HY, z1), (x0, HY, z1)], "ShopSteel", -Z_)
    tile(p, [(dx0, dx1, 0, ODOOR_H, "ShopBlue"), (dx0 + 0.18, dx1 - 0.18, 1.15, 1.95, "ShopDark")],
         lambda x, z: (x, yb, z), Y_)
    box(p, (dx1 - 0.16, yb, 0.98), (dx1 - 0.10, yb + 0.06, 1.10), "ShopSteel", skip={0})   # the handle
    p.face([(wx0, yb, wz0), (wx1, yb, wz0), (wx1, HY, wz0), (wx0, HY, wz0)], "ShopSteel", Z_)   # sill
    box(p, (wx0 - 0.06, HY, wz0 - 0.06), (wx1 + 0.06, HY + 0.05, wz0), "ShopSteel", skip={0})
    n, d = 12, 0.03                       # the blinds: horizontal V-pleats across the opening
    for k in range(n):
        za = wz0 + (wz1 - wz0) * k / n
        zb = wz0 + (wz1 - wz0) * (k + 1) / n
        zm = (za + zb) / 2
        for z0, z1, y0, y1 in ((za, zm, yb, yb + d), (zm, zb, yb + d, yb)):
            p.face([(wx0, y0, z0), (wx1, y0, z0), (wx1, y1, z1), (wx0, y1, z1)], "ShopWall",
                   Vector((0, z1 - z0, y0 - y1)))


# ---------------------------------------------------------------------------
# The lifts
# ---------------------------------------------------------------------------
def lift_b(p):
    """Bay B's lift, raised and empty: two runways on scissor arms, the end stops flipped up."""
    ry0, ry1 = LIFT_Y - RUN_L / 2, LIFT_Y + RUN_L / 2
    zt, zb = RAISE, RAISE - RUN_T
    for s in (-1, 1):
        x = LIFT_B + s * TRACK / 2
        box(p, (x - RUN_W / 2, ry0, zb), (x + RUN_W / 2, ry1, zt), "ShopYellow")
        for y0, y1 in ((ry0, ry0 + 0.04), (ry1 - 0.04, ry1)):         # wheel stops / roll-off flaps
            box(p, (x - RUN_W / 2 + 0.03, y0, zt), (x + RUN_W / 2 - 0.03, y1, zt + 0.20), "ShopYellow",
                skip={"bot"})
        # the scissor: two arms crossing in the runway's own plane, a pin through the crossing
        ya, yb = ry0 + 0.45, ry1 - 0.45
        for k, (xa, xb) in enumerate(((x - 0.13, x - 0.04), (x + 0.04, x + 0.13))):
            y_lo, y_hi = (ya, yb) if k == 0 else (yb, ya)
            sq = lambda y, z0, z1: [(xa, y, z0), (xb, y, z0), (xb, y, z1), (xa, y, z1)]
            solid(p, sq(y_lo, SLAB_Z, SLAB_Z + 0.16), sq(y_hi, zb - 0.16, zb), "ShopSteel")
        ym, zm = (ya + yb) / 2, (SLAB_Z + zb) / 2
        box(p, (x - 0.17, ym - 0.04, zm - 0.04), (x + 0.17, ym + 0.04, zm + 0.04), "ShopDark")


# ---------------------------------------------------------------------------
# Dressing
# ---------------------------------------------------------------------------
def bench(p):
    """Bay A's back wall: a steel bench and a pegboard of tools over it, ahead of the truck's nose."""
    x0, x1, y0, y1 = -5.6, -3.0, IY0, IY0 + 0.60
    box(p, (x0, y0, 0.86), (x1, y1, 0.92), "ShopSteel", skip={0})
    for xa, xb in ((x0, x0 + 0.05), (x1 - 0.05, x1)):
        box(p, (xa, y0, 0), (xb, y1, 0.86), "ShopSteel", skip={0, "bot", "top"})
    box(p, (x0 + 0.05, y0, 0.18), (x1 - 0.05, y1, 0.22), "ShopSteel", skip={0, 1, 3})
    box(p, (x1 - 0.95, y0, 0.22), (x1 - 0.05, y0 + 0.55, 0.86), "ShopRed", skip={0, 1, 2, "bot", "top"})  # drawers
    tile(p, [(x1 - 0.95, x1 - 0.05, 0.22, 0.86, "ShopRed")] +
         [(x1 - 0.70, x1 - 0.30, z, z + 0.025, "ShopSteel") for z in (0.33, 0.53, 0.73)],
         lambda x, z: (x, y0 + 0.55, z), Y_)
    # pegboard + tools as relief
    pb = (-5.5, -3.1, 1.15, 2.25)
    box(p, (pb[0], y0, pb[2]), (pb[1], y0 + 0.02, pb[3]), "ShopDark", skip={0})
    yt = y0 + 0.02
    for k, (h, w) in enumerate(((0.42, 0.045), (0.36, 0.04), (0.31, 0.035), (0.26, 0.03), (0.22, 0.03))):
        x = pb[0] + 0.25 + k * 0.13
        relief(p, [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2 - 0.05), (w * 1.6, h / 2), (-w * 1.6, h / 2),
                   (-w / 2, h / 2 - 0.05)], yt, yt + 0.02, "ShopSteel", x, 1.75)                # wrenches
    relief(p, [(-0.02, -0.18), (0.02, -0.18), (0.02, 0.12), (0.10, 0.12), (0.10, 0.18), (-0.10, 0.18),
               (-0.10, 0.12), (-0.02, 0.12)], yt, yt + 0.03, "ShopSteel", -4.45, 1.75)            # hammer
    for k in range(4):                                                                             # screwdrivers
        relief(p, [(-0.015, -0.14), (0.015, -0.14), (0.015, 0.14), (-0.015, 0.14)], yt, yt + 0.02,
               "ShopRed" if k % 2 else "ShopYellow", -4.1 + k * 0.08, 1.80)
    relief(p, [(-0.28, -0.05), (0.28, -0.05), (0.28, 0.05), (-0.28, 0.05)], yt, yt + 0.03, "ShopRed",
           -3.5, 1.95)                                                                             # a level


def tyre_rack(p):
    """Bay A's end wall: a steel rack, three tyres on each of two shelves (behind the truck in the camera's view)."""
    x0, x1, y0, y1 = IX0, IX0 + 0.45, -0.6, 1.2
    for z in (0.08, 0.86):
        box(p, (x0, y0, z), (x1, y1, z + 0.04), "ShopSteel", skip={3})
    for y in (y0, y1 - 0.04):
        box(p, (x1 - 0.04, y, 0), (x1, y + 0.04, 1.70), "ShopSteel", skip={"bot"})
    for zc in (0.12 + 0.33, 0.90 + 0.33):
        for y in (y0 + 0.30, y0 + 0.90, y0 + 1.50):
            tyre(p, (x0 + 0.24, y, zc), "x", caps=(False, True))


def bay_kit(p):
    """The lift console, the ceiling strips, the extinguisher, bay B's chest, compressor and drain caddy."""
    # lift console: behind the centre pier, out of bay A's path
    box(p, (-2.02, 3.25, 0), (-1.82, 3.45, 1.05), "ShopYellow", skip={"bot"})
    box(p, (-2.08, 3.20, 1.05), (-1.76, 3.50, 1.38), "ShopDark", skip={3})
    tile(p, [(3.20, 3.50, 1.05, 1.38, "ShopDark"), (3.24, 3.46, 1.10, 1.33, "ShopSteel"),
             (3.28, 3.35, 1.25, 1.30, "ShopYellow"), (3.38, 3.42, 1.25, 1.30, "ShopRed")],
         lambda y, z: (-2.08, y, z), -X_)
    # four fluorescent strips, two over each bay
    for c in (LIFT_A, LIFT_B):
        for dx in (-0.9, 0.9):
            x0, x1, y0, y1 = c + dx - 0.15, c + dx + 0.15, -1.3, 1.7
            box(p, (x0, y0, CEIL - 0.08), (x1, y1, CEIL), "ShopSteel", skip={"top", "bot"})
            tile(p, [(x0, x1, y0, y1, "ShopSteel"), (x0 + 0.04, x1 - 0.04, y0 + 0.05, y1 - 0.05, "ShopLight")],
                 lambda x, y: (x, y, CEIL - 0.08), -Z_)
    # extinguisher on the centre pier's inside face
    e = ngon(0.085, 6, -1.55, IY1 - 0.10)
    solid(p, [(x, y, 1.00) for x, y in e], [(x, y, 1.52) for x, y in e], "ShopRed")
    box(p, (-1.58, IY1 - 0.13, 1.52), (-1.52, IY1 - 0.07, 1.62), "ShopDark", skip={"bot"})
    # bay B: red rollaway + top chest, drawer lines and pulls tiled in its face
    cx0, cx1, cy0, cy1 = 1.55, 2.40, IY0 + 0.05, IY0 + 0.65
    box(p, (cx0, cy0, 0), (cx1, cy1, 0.10), "ShopDark", skip={"bot", "top"})
    box(p, (cx0, cy0, 0.10), (cx1, cy1, 1.05), "ShopRed", skip={2, "bot"})
    box(p, (cx0 + 0.04, cy0 + 0.05, 1.05), (cx1 - 0.04, cy1 - 0.08, 1.45), "ShopRed", skip={2, "bot"})
    pulls = lambda zs: [(cx0 + 0.20, cx1 - 0.20, z, z + 0.025, "ShopSteel") for z in zs]
    tile(p, [(cx0, cx1, 0.10, 1.05, "ShopRed")] + pulls((0.30, 0.55, 0.75, 0.92)),
         lambda x, z: (x, cy1, z), Y_)
    tile(p, [(cx0 + 0.04, cx1 - 0.04, 1.05, 1.45, "ShopRed")] + pulls((1.18, 1.32)),
         lambda x, z: (x, cy1 - 0.08, z), Y_)
    # upright compressor: a blue tank, the pump and motor on top
    t = ngon(0.24, 8, -1.20, IY0 + 0.32)
    solid(p, [(x, y, 0.05) for x, y in t], [(x, y, 1.25) for x, y in t], "ShopBlue", skip={"bot"})
    box(p, (-1.38, IY0 + 0.16, 1.25), (-1.02, IY0 + 0.48, 1.55), "ShopSteel", skip={"bot"})
    # oil-drain caddy beside lift B: a yellow tank, a steel mast, a wide funnel
    d = ngon(0.22, 8, -1.20, 0.90)
    solid(p, [(x, y, 0) for x, y in d], [(x, y, 0.45) for x, y in d], "ShopYellow", skip={"bot"})
    box(p, (-1.22, 0.88, 0.45), (-1.18, 0.92, 1.20), "ShopSteel", skip={"bot", "top"})
    f0, f1 = ngon(0.06, 8, -1.20, 0.90), ngon(0.28, 8, -1.20, 0.90)
    solid(p, [(x, y, 1.20) for x, y in f0], [(x, y, 1.36) for x, y in f1], "ShopYellow", skip={"top"})
    p.face([(x, y, 1.36) for x, y in f1], "ShopDark", Z_)          # full of old oil to the rim


def outside_kit(p):
    """The rooftop unit, the meter on the -X wall, and a stack of tyres beside the office."""
    ax0, ax1, ay0, ay1 = -1.2, 0.4, -2.6, -1.4
    box(p, (ax0, ay0, DECK), (ax1, ay1, DECK + 0.75), "ShopSteel", skip={"bot"})
    sh = ngon(0.34, 8, (ax0 + ax1) / 2, (ay0 + ay1) / 2)
    solid(p, [(x, y, DECK + 0.75) for x, y in sh], [(x, y, DECK + 0.83) for x, y in sh], "ShopSteel",
          skip={"bot", "top"})
    p.face([(x, y, DECK + 0.83) for x, y in sh], "ShopDark", Z_)
    bx0 = BAY_X[0]
    box(p, (bx0 - 0.14, -2.00, 1.30), (bx0, -1.72, 1.68), "ShopSteel", skip={1})
    box(p, (bx0 - 0.04, -1.89, 1.68), (bx0, -1.83, FASCIA_Z[0]), "ShopSteel", skip={1, "bot", "top"})
    for k in range(3):
        tyre(p, (OFF_X[1] + 0.40, 1.6, 0.11 + 0.22 * k), "z", caps=(False, k == 2))


def sign(p):
    """The board on the fascia over the doors: steel edges, the atlas on its face."""
    (x0, x1), (z0, z1) = SIGN_X, SIGN_Z
    yb = HY + FASCIA_OUT
    yf = yb + SIGN_T
    box(p, (x0, yb, z0), (x1, yf, z1), "ShopSteel", skip={0, 2})
    sw, sh = x1 - x0, z1 - z0
    uv = lambda x, z: ((x1 - x) / sw, (z - z0) / sh)     # faces +Y: the viewer's right is -X
    pts = [(x0, yf, z0), (x1, yf, z0), (x1, yf, z1), (x0, yf, z1)]
    p.face(pts, "ShopSign", Y_, [uv(x, z) for x, _, z in pts])


def build_part():
    p = Part("ServiceStation")
    outer_walls(p)
    interior(p)
    roll_doors(p)
    office_front(p)
    lift_b(p)
    bench(p)
    tyre_rack(p)
    bay_kit(p)
    outside_kit(p)
    sign(p)
    return p


# ---------------------------------------------------------------------------
# Registry numbers (three.js model frame: x, height, -y)
# ---------------------------------------------------------------------------
def collider_boxes():
    """(name, Blender lo, Blender hi) for every solid part; doors' headers, the slab and lift A are not."""
    bx0, bx1 = BAY_X
    hx = TRACK / 2 + RUN_W / 2
    ry0, ry1 = LIFT_Y - RUN_L / 2, LIFT_Y + RUN_L / 2
    top = FASCIA_Z[1]
    return [
        ("back wall", (bx0, -HY, 0), (bx1, IY0, top)),
        ("-X end wall", (bx0, IY0, 0), (IX0, HY, top)),
        ("partition (bay | office)", (IX1, IY0, 0), (bx1, HY, top)),
        ("pier, -X", (IX0, IY1, 0), (DOORS[0][0], HY, top)),
        ("pier, centre", (DOORS[0][1], IY1, 0), (DOORS[1][0], HY, top)),
        ("pier, +X", (DOORS[1][1], IY1, 0), (IX1, HY, top)),
        ("office", (OFF_X[0], OFF_Y0, 0), (OFF_X[1], HY, OFF_FASCIA_Z[1])),
        ("lift B, raised", (LIFT_B - hx, ry0, 0), (LIFT_B + hx, ry1, RAISE + 0.20)),
        ("bench", (-5.6, IY0, 0), (-3.0, IY0 + 0.60, 0.92)),
        ("tool chest", (1.55, IY0 + 0.05, 0), (2.40, IY0 + 0.65, 1.45)),
        ("compressor", (-1.44, IY0 + 0.08, 0), (-0.96, IY0 + 0.56, 1.55)),
        ("tyre rack", (IX0, -0.6, 0), (IX0 + 0.45, 1.2, 1.70)),
        ("lift console", (-2.08, 3.20, 0), (-1.76, 3.50, 1.38)),
        ("tyre stack", (OFF_X[1] + 0.07, 1.27, 0), (OFF_X[1] + 0.73, 1.93, 0.66)),
    ]


def three(lo, hi):
    """Blender lo/hi -> three.js { c, s }."""
    c = [(lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2, -(lo[1] + hi[1]) / 2]
    s = [hi[0] - lo[0], hi[2] - lo[2], hi[1] - lo[1]]
    return c, s


def truck_box():
    """The Ranger's footprint parked with its centre (the CG) on the lift centre, nose to -y."""
    cy = LIFT_Y + SHIFT_REAR                  # bbox centre: SHIFT_REAR behind the CG, i.e. toward +y
    return (LIFT_A - HALF_W, cy - BODY_L / 2), (LIFT_A + HALF_W, cy + BODY_L / 2), cy


def registry():
    f = lambda v: f"{v:.3f}".rstrip("0").rstrip(".") if abs(v) > 1e-9 else "0"
    lines = []
    for name, lo, hi in collider_boxes():
        c, s = three(lo, hi)
        lines.append(f"        {{ c: [{', '.join(map(f, c))}], s: [{', '.join(map(f, s))}] }},"
                     f"{' ' * max(1, 44 - len(', '.join(map(f, c + s))))}// {name}")
    hx = TRACK / 2 + RUN_W / 2
    _, _, tcy = truck_box()
    look = (LIFT_A, CAM_LOOK_Z, -tcy)
    eye = (CAM_EYE[0], CAM_EYE[2], -CAM_EYE[1])
    # FEAT-178 triggers on `park` (Lane B, 2026-11-07): parked inside it = on bay A's lift
    return lines, (f"park: {{ x: {f(LIFT_A)}, z: {f(-LIFT_Y)}, halfX: {f(hx)}, halfZ: {f(RUN_L / 2)} }},",
                   f"camera: {{ eye: [{', '.join(map(f, eye))}], look: [{', '.join(map(f, look))}], fov: {CAM_FOV} }},")


# ---------------------------------------------------------------------------
# Blender side
# ---------------------------------------------------------------------------
def _emission(name, col):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs[0].default_value = (*col, 1.0)
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


def bake_atlas():
    """The sign: an orthographic render of flat emitters laid out in board metres (general-store.py's
    method; dither and render stamps off so a re-export is byte-identical)."""
    sw, sh = SIGN_X[1] - SIGN_X[0], SIGN_Z[1] - SIGN_Z[0]
    sc = bpy.data.scenes.new("AtlasBake")
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = TEX_W, TEX_H
    sc.render.resolution_percentage = 100
    sc.render.dither_intensity = 0.0
    for k in dir(sc.render):
        if k.startswith("use_stamp_"):
            setattr(sc.render, k, False)
    sc.view_settings.view_transform = "Standard"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    cd = bpy.data.cameras.new("AtlasCam")
    cd.type, cd.ortho_scale = "ORTHO", sw
    cam = bpy.data.objects.new("AtlasCam", cd)
    cam.location = (sw / 2, sh / 2, 5.0)
    sc.collection.objects.link(cam)
    sc.camera = cam
    junk, mats, layer = [], [], [0]

    def z():
        layer[0] += 1
        return layer[0] * 0.01

    def rect(u0, v0, u1, v1, col):
        me = bpy.data.meshes.new("a")
        h = z()
        me.from_pydata([(u0, v0, h), (u1, v0, h), (u1, v1, h), (u0, v1, h)], [], [[0, 1, 2, 3]])
        o = bpy.data.objects.new("a", me)
        m = _emission("a", INK[col])
        mats.append(m)
        me.materials.append(m)
        sc.collection.objects.link(o)
        junk.append(o)

    def text(body, uc, vc, w, h, col):
        """Fit `body` inside w x h board metres, its glyph box centred on (uc, vc)."""
        cu = bpy.data.curves.new("t", type="FONT")
        cu.body = body
        try:
            cu.font = bpy.data.fonts.load(SIGN_FONT, check_existing=True)
        except (RuntimeError, OSError):
            print("WARN: font not found, falling back to Bfont:", SIGN_FONT)
        o = bpy.data.objects.new("t", cu)
        m = _emission("t", INK[col])
        mats.append(m)
        cu.materials.append(m)
        sc.collection.objects.link(o)
        junk.append(o)
        me = o.to_mesh()
        xs, ys = [v.co.x for v in me.vertices], [v.co.y for v in me.vertices]
        o.to_mesh_clear()
        k = min(w / (max(xs) - min(xs)), h / (max(ys) - min(ys)))
        o.scale = (k, k, 1)
        o.location = (uc - k * (max(xs) + min(xs)) / 2, vc - k * (max(ys) + min(ys)) / 2, z())

    rect(0, 0, sw, sh, "blue")                         # the frame
    rect(0.05, 0.05, sw - 0.05, sh - 0.05, "white")
    rect(0.40, 0.335, sw - 0.40, 0.355, "red")         # the rule between the lines
    text("AUTO SERVICE", sw / 2, 0.61, sw - 0.36, 0.40, "blue")
    text("TIRES · BRAKES · OIL", sw / 2, 0.20, sw - 1.0, 0.17, "red")
    path = os.path.join(bpy.app.tempdir, f"{NAME}-atlas.png")
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=sc.name)   # no window swap: runs under blender -b too
    img = bpy.data.images.load(path, check_existing=False)
    img.name = "ServiceStationSign"
    img.pack()
    img.filepath_raw = ""
    for o in junk + [cam]:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)
        elif isinstance(data, bpy.types.Curve):
            bpy.data.curves.remove(data)
    bpy.data.cameras.remove(cd)
    bpy.data.scenes.remove(sc)
    for m in mats:
        bpy.data.materials.remove(m)
    return img


def get_material(name, img):
    col, rough, emit = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    if col is None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    else:
        b.inputs["Base Color"].default_value = (*col, 1.0)
        m.diffuse_color = (*col, 1.0)
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1.0)
        b.inputs["Emission Strength"].default_value = 1.0
    m.roughness = rough
    m.use_backface_culling = True
    return m


def bake(part, img):
    me = bpy.data.meshes.new(part.name)
    me.from_pydata(part.v, [], part.f)
    me.update()
    used = list(dict.fromkeys(part.m))
    idx = {n: i for i, n in enumerate(used)}
    for n in used:
        me.materials.append(get_material(n, img))
    uvl = me.uv_layers.new(name="UVMap")
    for i, poly in enumerate(me.polygons):
        poly.material_index = idx[part.m[i]]
        for li, uv in zip(poly.loop_indices, part.uv[i]):
            uvl.data[li].uv = uv
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)   # welds only; winding authored
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = False
    ob = bpy.data.objects.new(part.name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def evaluated_tris(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    m = ev.to_mesh()
    m.calc_loop_triangles()
    per = {}
    for t in m.loop_triangles:
        k = m.materials[t.material_index].name
        per[k] = per.get(k, 0) + 1
    ev.to_mesh_clear()
    return sum(per.values()), per


def check_facing(ob, n=24):
    """Ray-cast from a ring of eyes at the model (some low enough to see in through the doors); every
    first hit must face back at the ray."""
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    bad, hits = [], 0
    # off the round numbers: a ray through an exact edge (eye z 9 -> target z 1.4 crosses the door
    # header's edge exactly) may report either face
    targets = [Vector((x + 0.013, y + 0.017, z + 0.011)) for x in (-5, -3.5, -1.5, 0.5, 4, 6)
               for y in (-3, 0, 2.5, 4.5) for z in (0.4, 1.4, 2.8, 4.4)]
    eyes = [Vector((math.cos(a) * 25, math.sin(a) * 25, h))
            for a in [2 * math.pi * k / n for k in range(n)] for h in (1.2, 4, 9, 18)]
    eyes += [Vector(CAM_EYE), Vector((LIFT_B, 3.0, 1.6)), Vector((LIFT_A, 3.0, 2.2))]   # inside
    for e in eyes:
        for t in targets:
            d = (t - e).normalized()
            loc, nrm, i, dist = tree.ray_cast(e, d)
            if loc is None:
                continue
            hits += 1
            if nrm.dot(d) > 0:
                bad.append((loc, ob.data.materials[ob.data.polygons[i].material_index].name))
    for loc, m in bad[:8]:
        print(f"    inverted hit: {m} at ({loc.x:.2f}, {loc.y:.2f}, {loc.z:.2f})")
    return len(bad), hits


def check_uv_handedness(ob):
    """Every lettered face must map image-right to the viewer's right: (dP/du x dP/dv) . n > 0."""
    me = ob.data
    uvl = me.uv_layers.active.data
    sign_idx = [i for i, m in enumerate(me.materials) if m.name.startswith("ShopSign")]
    bad = n = 0
    for poly in me.polygons:
        if poly.material_index not in sign_idx:
            continue
        li = list(poly.loop_indices)[:3]
        p0, p1, p2 = (me.vertices[me.loops[i].vertex_index].co for i in li)
        t0, t1, t2 = (uvl[i].uv for i in li)
        du1, du2 = t1 - t0, t2 - t0
        det = du1.x * du2.y - du1.y * du2.x
        e1, e2 = p1 - p0, p2 - p0
        dpdu = (e1 * du2.y - e2 * du1.y) / det
        dpdv = (e2 * du1.x - e1 * du2.x) / det
        n += 1
        bad += dpdu.cross(dpdv).dot(poly.normal) <= 0
    return bad, n


def pad_check(ob):
    """Pad frame: px = x + SEAT_ALONG, pz = SEAT - y.  Everything within 0.35 m of the ground stands no
    nearer the road than FLAT_Z - FEATHER_SLACK and inside the pad's rounded outline grown by RIM; every
    collision-box corner within RIM_KEEP (test/poi-yard.mjs's rule)."""
    def outside(x, pz):          # road-carve.js padSd: signed distance outside the rounded rectangle
        qx, qz = abs(x) - (PAD_HX - PAD_R), abs(pz) - (PAD_HZ - PAD_R)
        return math.hypot(max(qx, 0), max(qz, 0)) + min(max(qx, qz), 0) - PAD_R
    low = [v.co for v in ob.data.vertices if v.co.z < 0.35]
    front = min(SEAT - v.y for v in low)
    worst = max(outside(v.x + SEAT_ALONG, SEAT - v.y) for v in low)
    corners = max(outside(x + SEAT_ALONG, SEAT - y) for _, lo, hi in collider_boxes()
                  for x in (lo[0], hi[0]) for y in (lo[1], hi[1]))
    ok = front >= FLAT_Z - FEATHER_SLACK - 1e-6 and worst <= RIM and corners <= RIM_KEEP
    return ok, front, worst, corners


def truck_check():
    """The parked Ranger against bay A's walls, bench, rack, console and the door line."""
    (x0, y0), (x1, y1), _ = truck_box()
    ry0, ry1 = LIFT_Y - RUN_L / 2, LIFT_Y + RUN_L / 2
    fa, ra = LIFT_Y - AXLE_F, LIFT_Y + AXLE_R
    return {
        "nose to bench": y0 - (IY0 + 0.60),
        "tail inside the door line": IY1 - y1,
        "side to tyre rack": x0 - (IX0 + 0.45),
        "side to console": -2.08 - x1,
        "jamb guards, each side": (DOORS[0][1] - GUARD[0] - x1, x0 - DOORS[0][0] - GUARD[0]),
        "front tyre on the runway (ends)": (fa - WHEEL_R - ry0, ry1 - (fa + WHEEL_R)),
        "rear tyre on the runway (ends)": (ra - WHEEL_R - ry0, ry1 - (ra + WHEEL_R)),
    }


def fresh_scene():
    bpy.ops.wm.read_homefile(use_empty=True)
    for d in (bpy.data.materials, bpy.data.meshes, bpy.data.images):
        for x in list(d):
            d.remove(x)


def build():
    fresh_scene()
    img = bake_atlas()
    ob = bake(build_part(), img)
    t, per = evaluated_tris(ob)
    bad, hits = check_facing(ob)
    mir, tex = check_uv_handedness(ob)
    ok_pad, front, worst, corners = pad_check(ob)
    lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
    boxes, (park, camera) = registry()
    clear = truck_check()
    ok_truck = all(min(v) > 0.3 if isinstance(v, tuple) else v > 0.3 for v in clear.values())
    print("=" * 72)
    print(f"  ServiceStation  {t} tris (budget {TRI_BUDGET}, floor ~1000)  materials {len(ob.data.materials)}"
          f"  images {len(bpy.data.images)}")
    print("  per material: " + ", ".join(f"{k} {v}" for k, v in sorted(per.items(), key=lambda kv: -kv[1])))
    print(f"  bbox  x {lo[0]:.2f}..{hi[0]:.2f}  y {lo[1]:.2f}..{hi[1]:.2f}  z {lo[2]:.2f}..{hi[2]:.2f}")
    print(f"  pad: nearest the road at ground pz {front:.2f} (flat from {FLAT_Z}, slack {FEATHER_SLACK}), worst"
          f" {worst:.2f} m past the pad edge (rim {RIM}), collider corners {corners:.3f} (poi-yard {RIM_KEEP})"
          f"  -> {'OK' if ok_pad else 'FAIL'}")
    print(f"  facing: {bad} inverted first-hits of {hits}   uv handedness: {mir} mirrored of {tex} sign faces")
    print("  truck on lift A: " + ", ".join(
        f"{k} {'/'.join(f'{x:.2f}' for x in v) if isinstance(v, tuple) else f'{v:.2f}'}" for k, v in clear.items())
        + f"  -> {'OK' if ok_truck else 'FAIL'}")
    print("  ---- data/prop-models.js (three.js frame) ----")
    print(f"      shape: 'box', size: [{BAY_X[1] - BAY_X[0] + OFF_X[1] - OFF_X[0]:.1f}, {FASCIA_Z[1]}, {2 * HY:.1f}],")
    print("      boxes: [")
    for ln in boxes:
        print(ln)
    print("      ],")
    print(f"    seat: {SEAT},")
    print(f"    seatAlong: {SEAT_ALONG},")
    print(f"    {park}")
    print(f"    {camera}")
    print("=" * 72)
    return ob, ok_pad and ok_truck and bad == 0 and mir == 0 and t <= TRI_BUDGET * 1.1


def export():
    ob, ok = build()
    bpy.ops.export_scene.gltf(
        filepath=f"{OUT_DIR}/{NAME}.glb", export_format="GLB",
        export_draco_mesh_compression_enable=False, export_yup=True,
        export_apply=True, export_materials="EXPORT", export_texcoords=True,
        export_normals=True, export_cameras=False, export_lights=False,
        export_image_format="AUTO", use_selection=False)
    print(f"  wrote {OUT_DIR}/{NAME}.glb")
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"  wrote {OUT_BLEND}")
    return ok


# ---------------------------------------------------------------------------
# Review renders (scenery never reaches the .glb or the .blend)
# ---------------------------------------------------------------------------
VIEWS = {
    # name: (eye, target, vertical fov deg), Blender frame
    "road":         ((-1.0, 12.5, 1.5), (-0.5, 0.0, 2.0), 50),
    "three-quarter": ((13.0, 15.0, 6.0), (0.0, 0.0, 1.8), 42),
    "rear":         ((-13.0, -13.0, 7.0), (0.0, 0.0, 2.0), 45),
    "service-cam":  (CAM_EYE, (LIFT_A, LIFT_Y + SHIFT_REAR, CAM_LOOK_Z), CAM_FOV),
    "inside-b":     ((LIFT_B + 0.4, 3.4, 1.7), (-4.6, -1.5, 0.9), 70),
}


def _flat(name, col, rough=0.95):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*col, 1.0)
    b.inputs["Roughness"].default_value = rough
    return m


def _plane(name, x0, x1, y0, y1, z, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [], [[0, 1, 2, 3]])
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)


def scenery():
    sc = bpy.context.scene
    _plane("Ground", -60, 60, -60, 60, -0.03, _flat("Ground", (0.16, 0.17, 0.10)))
    _plane("Pad", -PAD_HX - SEAT_ALONG, PAD_HX - SEAT_ALONG, SEAT - PAD_HZ, SEAT + PAD_HZ, -0.005,
           _flat("Pad", (0.24, 0.20, 0.15)))
    ry = SEAT + PAD_HZ + 0.6
    _plane("Road", -60, 60, ry, ry + 7.0, -0.01, _flat("Road", (0.05, 0.05, 0.055), 0.8))
    # the Ranger on lift A, nose away from the road, its CG on the lift centre
    if os.path.exists(RANGER_GLB):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=RANGER_GLB)
        parts = [o for o in bpy.data.objects if o not in before]
        rig = bpy.data.objects.new("Truck", None)
        bpy.context.collection.objects.link(rig)
        for o in parts:
            if o.parent is None:
                o.parent = rig
        bpy.context.view_layer.update()
        pts = [o.matrix_world @ Vector(c) for o in parts if o.type == "MESH" for c in o.bound_box]
        lo = Vector([min(v[i] for v in pts) for i in range(3)])
        hi = Vector([max(v[i] for v in pts) for i in range(3)])
        rig.location = (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, 0.146 - 0.101 - lo.z)   # vehicle-models shiftDown
        bpy.context.view_layer.update()
        wheel = _flat("Tire", (0.02, 0.02, 0.02), 0.9)
        cg = SHIFT_REAR                       # the CG, local: SHIFT_REAR ahead of the bbox centre (+y = nose)
        for ax in (cg + AXLE_F, cg - AXLE_R):
            for sx in (-1, 1):
                bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=WHEEL_R, depth=0.24,
                                                    location=(sx * TRACK / 2, ax, WHEEL_R + SLAB_Z),
                                                    rotation=(0, math.pi / 2, 0))
                w = bpy.context.active_object
                w.data.materials.append(wheel)
                w.parent = rig
                w.matrix_parent_inverse = rig.matrix_world.inverted()
        seat = bpy.data.objects.new("TruckSeat", None)
        bpy.context.collection.objects.link(seat)
        rig.parent = seat
        seat.rotation_euler = (0, 0, math.pi)          # nose to -y, away from the road
        seat.location = (LIFT_A, LIFT_Y + SHIFT_REAR, 0)
    else:
        print("WARN: no ranger.glb, rendering without the truck")
    w = bpy.data.worlds.new("Sky")
    sc.world = w
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.50, 0.60, 0.72, 1)
    bg.inputs[1].default_value = 0.9
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.6
    sun.data.angle = math.radians(4)
    sun.data.color = (1.0, 0.94, 0.84)
    sun.rotation_euler = (math.radians(50), 0, math.radians(-150))
    sc.collection.objects.link(sun)
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "AgX"
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    return sc, cam


def render():
    sc, cam = scenery()
    os.makedirs(RENDER_DIR, exist_ok=True)
    paths = []
    for name, (eye, target, fov) in VIEWS.items():
        eye, target = Vector(eye), Vector(target)
        cam.location = eye
        cam.rotation_mode = "QUATERNION"
        cam.rotation_quaternion = (target - eye).to_track_quat("-Z", "Y")
        cam.data.sensor_fit = "VERTICAL"
        cam.data.angle_y = math.radians(fov)
        cam.data.clip_start = 0.05
        cam.data.clip_end = 400
        sc.render.filepath = f"{RENDER_DIR}/{name}.png"
        bpy.ops.render.render(write_still=True)
        paths.append(sc.render.filepath)
        print(f"  rendered {sc.render.filepath}")
    contact_sheet(paths, f"{RENDER_DIR}/sheet.png")


def contact_sheet(paths, dest, cols=2):
    """Stitch the renders into one image, row-major from the top (numpy ships with Blender)."""
    import numpy as np
    imgs = [bpy.data.images.load(p) for p in paths]
    w, h = imgs[0].size
    rows = -(-len(imgs) // cols)
    sheet = np.ones((rows * h, cols * w, 4), dtype=np.float32)
    for k, im in enumerate(imgs):
        px = np.empty(w * h * 4, dtype=np.float32)
        im.pixels.foreach_get(px)
        r, c = divmod(k, cols)
        y0 = (rows - 1 - r) * h                 # Blender pixel rows run bottom-up
        sheet[y0:y0 + h, c * w:(c + 1) * w] = px.reshape(h, w, 4)
    out = bpy.data.images.new("Sheet", cols * w, rows * h, alpha=True)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = dest
    out.file_format = "PNG"
    out.save()
    print(f"  sheet {dest}")


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ok = export() if "export" in args else build()[1]
    if "render" in args:
        render()
    if not ok:
        sys.exit(1)
