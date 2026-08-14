# ASSET-23: tent — parametric generator (v2)
#
# Built 2026-08-11 against Blender 5.2.0 LTS. Final counts (evaluated):
#   TentInner 96 + TentFlaps 16 + TentFly 36 + TentGuys 52 = 200 tris
# Export: assets/models/tent.glb — 0 images, 5 flat-colour materials
# (TentFly / TentInner / TentBase / TentInterior / TentGuy), all metalness 0.
# Footprint 1.4 x 2.2 m (fly corners pulled ~10 cm toward their stakes), height
# 1.10 m (inner 1.06 + fly stand-off). Stakes bite ~2 cm below z=0 on purpose.
# Modern 2-person tent read as a TRIANGULAR PRISM with a rounded ridge:
# straight walls sloping in from a wide base to a narrow rounded crown,
# tilted end faces, arched door at +Y, rain fly floating above the walls
# on guy lines. Flat colours, zero textures, flat-shaded (ART-STYLE.md).
#
# Axes: built Z-up, door faces +Y (Blender) -> glTF -Z with the default
# +Y-up export. Origin base-seated, centred on the footprint.
#
# Run inside Blender:  exec(open('assets/models/src/tent.py').read())

import bpy
import bmesh
import math
from mathutils import Vector

# ---------------------------------------------------------------- parameters
LENGTH = 2.2        # footprint along Y (door end at +Y)
WIDTH = 1.4         # footprint along X
HEIGHT = 1.06       # inner ridge height (fly rides FLY_OFF above; total stays <= 1.1)

W_TOP = 0.30        # crown half-width (narrow top = triangular read)
Z_TOP = 0.78        # height where the walls end and the crown arc starts
Z_BAND = 0.14       # bathtub base band height (TentBase material below this)
CROWN_SEGS = 4      # facets across the rounded ridge

BODY_T = (-1.0, -0.60, 0.60, 1.0)   # stations along the length (t of L/2)
END_SX = 0.74       # end-station width scale (plan taper)
END_SZ = 0.82       # end-station height scale (ridge rounds down at the ends)
LEAN = 0.16         # end faces lean inward with height (m of y per m of z)

DOOR_SCALE = 0.58   # door arch scale on the front face (about ground centre)
DOOR_RECESS = 0.20  # dark interior recess behind the door plane
DOOR_GAP = 0.10     # half-width of the parted flap gap at ground
GAP_EXP = 1.2       # gap narrows with height (higher = slimmer triangle)

FLY_HEM = 0.42      # fly hem height amidships (high = stretched taut)
FLY_OFF = 0.05      # fly stand-off from the inner walls
FLY_FRONT_HEM = 0.50  # front fly hem fraction of HEIGHT (V opening over door)
FLY_LIFT_OUT = 0.16 # hem corners pulled horizontally toward their stake
FLY_LIFT_UP = 0.12  # ...and lifted, where the guy line takes the load
FLY_LIFT_BLEND = (1.0, 0.55, 0.25)  # pull falloff up the arch: hem, crown base,
                                    # upper shoulder — blending into the crest
FLY_LIFT_NBR = 0.35 # fraction of the pull echoed on the neighbouring station
FLY_OVERHANG = 0.09 # front ring shifted forward: fly overhangs the entrance

GUY_R = 0.008
GUY_OUT = 0.55      # stake distance beyond the footprint
STAKE_R = 0.030
STAKE_H = 0.10

BUILD = {'inner', 'fly', 'guys'}   # stages to build

# linear-space colours (ART-STYLE rule 5: judge rendered, not as tuples)
COLORS = {
    'TentFly':      (0.028, 0.135, 0.032, 1.0),  # saturated dark green
    'TentInner':    (0.240, 0.410, 0.105, 1.0),  # lighter leaf green
    'TentBase':     (0.022, 0.042, 0.020, 1.0),  # near-black green bathtub
    'TentInterior': (0.022, 0.026, 0.018, 1.0),  # near-black inside
    'TentGuy':      (0.350, 0.280, 0.180, 1.0),  # tan cord + stakes
}
ROUGH = {'TentFly': 0.92, 'TentInner': 0.95, 'TentBase': 0.9,
         'TentInterior': 1.0, 'TentGuy': 0.85}


# ---------------------------------------------------------------- section
def section_points():
    """Cross-section polyline (x, z), left hem -> crown -> right hem."""
    pts = [(-WIDTH / 2, 0.0), (-WIDTH / 2 * 0.98, Z_BAND)]
    for i in range(CROWN_SEGS + 1):
        phi = math.pi - math.pi * i / CROWN_SEGS
        pts.append((W_TOP * math.cos(phi), Z_TOP + (HEIGHT - Z_TOP) * math.sin(phi)))
    pts += [(WIDTH / 2 * 0.98, Z_BAND), (WIDTH / 2, 0.0)]
    return pts


def station_ring(t, pts=None):
    """Section placed at station t with end taper + lean applied."""
    if pts is None:
        pts = section_points()
    at_end = abs(t) > 0.99
    sx = END_SX if at_end else 1.0
    sz = END_SZ if at_end else 1.0
    yb = t * LENGTH / 2
    ring = []
    for x, z in pts:
        zz = z * sz
        yy = yb - math.copysign(LEAN, t) * zz if at_end else yb
        ring.append(Vector((x * sx, yy, zz)))
    return ring


def loft_rings(bm, rings, close_quads=True):
    rows = [[bm.verts.new(p) for p in ring] for ring in rings]
    faces = []
    for a, b in zip(rows, rows[1:]):
        for i in range(len(a) - 1):
            faces.append(bm.faces.new((a[i], a[i + 1], b[i + 1], b[i])))
    return rows, faces


def make_obj(name, bm, mat_names):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    for mn in mat_names:
        obj.data.materials.append(bpy.data.materials[mn])
    for poly in me.polygons:
        poly.use_smooth = False
    return obj


def band_mat(faces, lo_mat, hi_mat, z_split):
    for f in faces:
        zc = sum(v.co.z for v in f.verts) / len(f.verts)
        f.material_index = lo_mat if zc < z_split else hi_mat


# ---------------------------------------------------------------- scene reset
for obj in [o for o in bpy.data.objects if o.name.startswith('Tent')]:
    bpy.data.objects.remove(obj, do_unlink=True)
for blk in (bpy.data.meshes, bpy.data.materials):
    for d in [d for d in blk if d.users == 0]:
        blk.remove(d)

for name, col in COLORS.items():
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = col
    bsdf.inputs['Roughness'].default_value = ROUGH[name]
    bsdf.inputs['Metallic'].default_value = 0.0
    mat.use_backface_culling = False

built = []

# ---------------------------------------------------------------- inner tent
if 'inner' in BUILD:
    bm = bmesh.new()
    rings = [station_ring(t) for t in BODY_T]
    rows, body_faces = loft_rings(bm, rings)
    band_mat(body_faces, 1, 0, Z_BAND * 1.05)   # 0=TentInner 1=TentBase 2=TentInterior
    n = len(rows[0])

    # rear cap: fan to a bottom-centre point
    rear = rows[0]
    c_rear = bm.verts.new(Vector((0, rear[0].co.y, 0)))
    for i in range(n - 1):
        f = bm.faces.new((rear[i + 1], rear[i], c_rear))
        f.material_index = 1 if sum(v.co.z for v in f.verts) / 3 < Z_BAND else 0

    # front cap: bridge the face ring to a door arch (scaled about ground centre),
    # recess the doorway and close it dark
    front = rows[-1]
    yc = front[0].co.y          # ground-level y of the door face
    door_ring = []
    for v in front:
        p = v.co
        door_ring.append(bm.verts.new(Vector((p.x * DOOR_SCALE,
                                              yc + (p.y - yc) * DOOR_SCALE,
                                              p.z * DOOR_SCALE))))
    for i in range(n - 1):
        f = bm.faces.new((front[i], front[i + 1], door_ring[i + 1], door_ring[i]))
        f.material_index = 1 if sum(v.co.z for v in f.verts) / 4 < Z_BAND else 0
    back_ring = [bm.verts.new(v.co + Vector((0, -DOOR_RECESS, 0))) for v in door_ring]
    for i in range(n - 1):
        f = bm.faces.new((door_ring[i], door_ring[i + 1], back_ring[i + 1], back_ring[i]))
        f.material_index = 2
    c_door = bm.verts.new(Vector((0, yc - DOOR_RECESS, 0.01)))
    for i in range(n - 1):
        f = bm.faces.new((back_ring[i], back_ring[i + 1], c_door))
        f.material_index = 2

    door_arch = [v.co.copy() for v in door_ring]
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.004)
    built.append(make_obj('TentInner', bm, ['TentInner', 'TentBase', 'TentInterior']))

    # door flaps: two panels parted around a dark centre gap
    bm = bmesh.new()
    half = len(door_arch) // 2
    apex_p = door_arch[half]
    for side in (-1, 1):
        outer = door_arch[:half + 1] if side < 0 else list(reversed(door_arch[half:]))
        m = len(outer)
        row_o, row_i = [], []
        for k in range(m):
            fk = k / (m - 1)
            po = outer[k].copy()   # outer edge sits exactly on the door arch — no seam
            pi = Vector((side * DOOR_GAP * (1 - fk) ** GAP_EXP,
                         yc + (apex_p.y - yc) * fk,
                         apex_p.z * fk))
            pi.y += 0.015 + 0.03 * math.sin(math.pi * fk)
            row_o.append(bm.verts.new(po))
            row_i.append(bm.verts.new(pi))
        for k in range(m - 1):
            vs = (row_o[k], row_o[k + 1], row_i[k + 1], row_i[k])
            bm.faces.new(vs if side > 0 else tuple(reversed(vs)))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.004)
    built.append(make_obj('TentFlaps', bm, ['TentInner']))

# ---------------------------------------------------------------- rain fly
def wall_x(z):
    """x of the (right) inner wall at height z."""
    return WIDTH / 2 + (W_TOP - WIDTH / 2) * min(z / Z_TOP, 1.0)


def fly_ring(t, hem):
    """Fly section at station t: wall-at-hem up over an offset crown arc."""
    at_end = abs(t) > 0.99
    sx = END_SX if at_end else 1.0
    sz = END_SZ if at_end else 1.0
    yb = t * LENGTH / 2
    pts = [(-(wall_x(hem) + FLY_OFF), hem)]
    for i in range(CROWN_SEGS + 1):
        phi = math.pi - math.pi * i / CROWN_SEGS
        pts.append(((W_TOP + FLY_OFF) * math.cos(phi),
                    Z_TOP + (HEIGHT + FLY_OFF * 0.8 - Z_TOP) * math.sin(phi)))
    pts.append((wall_x(hem) + FLY_OFF, hem))
    ring = []
    for x, z in pts:
        zz = z * sz
        yy = yb - math.copysign(LEAN, t) * zz if at_end else yb
        ring.append(Vector((x * sx, yy, zz)))
    return ring


fly_anchors = []   # (fabric corner, stake ground point) — consumed by the guys stage
if 'fly' in BUILD:
    rings = [fly_ring(-1.0, FLY_HEM),
             fly_ring(-0.60, FLY_HEM),
             fly_ring(0.60, FLY_HEM),
             fly_ring(1.0, FLY_FRONT_HEM * HEIGHT)]
    for p in rings[-1]:
        p.y += FLY_OVERHANG   # overhang the entrance
    # pull each corner toward its stake, the pull carried up the arch from the
    # hem to just under the crest and echoed on the neighbouring station, so
    # the whole flank of fabric stretches taut off the tent
    for ring, nbr, y_sign, reach in ((rings[0], rings[1], -1, 0.85),
                                     (rings[-1], rings[2], 1, 0.9)):
        for corner in (0, len(ring) - 1):
            p = ring[corner]
            side = math.copysign(1, p.x)
            stake = Vector((side * (WIDTH / 2 + GUY_OUT * reach),
                            p.y + y_sign * GUY_OUT * reach, 0))
            d = stake - p
            d.z = 0
            d.normalize()
            disp = d * FLY_LIFT_OUT + Vector((0, 0, FLY_LIFT_UP))
            step = 1 if corner == 0 else -1
            for k, w in enumerate(FLY_LIFT_BLEND):
                ring[corner + step * k] += disp * w
                nbr[corner + step * k] += disp * (w * FLY_LIFT_NBR)
            fly_anchors.append((ring[corner].copy(), stake))
    bm = bmesh.new()
    loft_rings(bm, rings)
    built.append(make_obj('TentFly', bm, ['TentFly']))

# ---------------------------------------------------------------- guy lines + stakes
if 'guys' in BUILD and fly_anchors:
    bm = bmesh.new()
    for a, s in fly_anchors:
        # 3-sided prism from anchor to just above the stake
        d = (s + Vector((0, 0, STAKE_H * 0.6)) - a)
        axis = d.normalized()
        ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
        u = axis.cross(ref).normalized() * GUY_R
        v = axis.cross(u).normalized() * GUY_R
        ra, rb = [], []
        for k in range(3):
            ang = k * 2 * math.pi / 3
            off = u * math.cos(ang) + v * math.sin(ang)
            ra.append(bm.verts.new(a + off))
            rb.append(bm.verts.new(a + d + off))
        for k in range(3):
            bm.faces.new((ra[k], ra[(k + 1) % 3], rb[(k + 1) % 3], rb[k]))
        # stake: 3-sided prism tilted away from the tent, capped top
        tilt = (a - s).normalized() * 0.35
        tip = s + Vector((tilt.x * STAKE_H, tilt.y * STAKE_H, STAKE_H))
        ax2 = (tip - s).normalized()
        u2 = ax2.cross(Vector((1, 0, 0))).normalized() * STAKE_R
        v2 = ax2.cross(u2).normalized() * STAKE_R
        sa, sb = [], []
        for k in range(3):
            ang = k * 2 * math.pi / 3
            off = u2 * math.cos(ang) + v2 * math.sin(ang)
            sa.append(bm.verts.new(s + off - ax2 * 0.01))
            sb.append(bm.verts.new(tip + off))
        for k in range(3):
            bm.faces.new((sa[k], sa[(k + 1) % 3], sb[(k + 1) % 3], sb[k]))
        bm.faces.new(tuple(reversed(sb)))
    built.append(make_obj('TentGuys', bm, ['TentGuy']))

# ---------------------------------------------------------------- report
dg = bpy.context.evaluated_depsgraph_get()
total = 0
for obj in built:
    me = obj.evaluated_get(dg).to_mesh()
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    total += tris
    print(f'{obj.name}: {tris} tris')
print(f'TOTAL: {total} tris')
