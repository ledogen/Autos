"""
ASSET-04 - the kettle barbecue, parametric generator.

Built for: Blender 5.x  |  Target: assets/models/bbq-grill.glb
Style brief: .planning/research/ART-STYLE.md  |  Mechanics: .planning/research/ASSETS.md

WEBER-STYLE KETTLE, not the ticket's generic "kettle on three legs" and not the
Coleman box grill first asked for (owner correction, 2026-08-23).

SHAPE MEASURED OFF A PHOTO REFERENCE, second pass, same day.  The first pass was
built from memory and got three things wrong that the photo settles:

  1. THE BALL WAS TOO SQUAT.  Measured off the reference (ball width 315 px sets
     the scale), the lid-plus-bowl mass is 0.825 as tall as it is wide.  The first
     pass was 0.70 and read as a flying saucer.  Both halves got deeper.
  2. THE BOWL'S WIDEST POINT IS BELOW THE LID JOINT, not at it.  The lid drops
     down OVER the bowl and the bowl keeps bulging for another ~7 cm underneath
     before it turns under.  That undercut is why a kettle reads as a ball rather
     than as two bowls face to face, and it is the single most valuable 28 tris
     on the model.
  3. HANDLE AND DAMPER WERE SWAPPED.  The chunky bar handle owns the APEX; the
     damper is a small disc offset onto the shoulder beside it.  The first pass
     had it the other way round.

The read at 20 m is: a black ball, a bright bar across the top of it, three thin
splayed legs, two big wheels, and a bright pan slung between the legs.  Nothing
else on a real kettle survives fog.

NO TEXTURE.  Four flat Principled materials, 0 images, 0 UVs -- the ART-STYLE
default.  Nothing on a barbecue is printed information.

RECOLOURABLE BODY (owner call 2026-08-23).  Bowl and lid share ONE material,
GrillEnamel, because on a real kettle they are the same porcelain coat and must
recolour in lockstep.  Authored BLACK; the curated pool in data/prop-models.js
adds Weber red as variant 1 and bottle green as variant 2.  Index 0 must equal
the colour authored here or test/model-palette.mjs fails -- change one, change
both.  The other two live only in prop-models.js, WITH the reasoning for their
exact values; do not re-derive them here.

VALUE STRUCTURE (ART-STYLE rule 5), bottom to top: black wheels and feet, pale
steel legs and ash catcher carrying the light, then the dark enamel mass above
them.  The legs are the only bright thing on the model and they are what stops a
black kettle from reading as a hole in the world at dusk.  In the red variant the
enamel takes over as the eye-catcher and the legs drop to support.

FOUR MATERIALS.  GrillEnamel (bowl + lid) / GrillSteel (legs, damper, ash
catcher) / GrillGrate (cooking grate) / GrillTrim (handles, wheels).  The grate
is split off GrillSteel deliberately: it is the one bright, cool surface and it
sits in shadow under the lid, so it wants its own value.  Trim and enamel are
both near-black but must NOT merge -- trim is fixed and enamel is recoloured, and
merging them would turn the handles and wheels red with the body.

LID CLOSED, ONE PIECE (ticket).  No hinge, no interior, no coals.  The grate is
authored per the ticket but is invisible with the lid on; it costs 10 tris and
exists so a future lid-off variant is a parameter, not a remodel.

THE ASH CATCHER IS TWO OBJECTS, not one (owner: "the ashtray is floating").  The
reference has a small dark vent housing bolted UNDER the bowl, and separately a
wide bright pan slung down at leg height on a wire frame.  The first pass merged
them into one pale cone hanging in space with nothing holding it.  Now the housing
sits against the bowl and the pan is tied to all three legs by short radial
struts, so every bright part of the model is visibly supported by something.

OVER THE TICKET'S 0.95 m HEIGHT.  This lands at ~1.06 m to the top of the handle,
which is the real 22" Weber (1.00 m to the lid crown) and what the reference
measures.  The ticket's 0.95 was an estimate for a kettle with shorter legs.

BASE-SEATED: the front leg tip and both wheel bottoms sit at exactly z = 0.
FORWARD is -Z in glTF, which is +Y in Blender (the exporter maps blender
(x,y,z) -> gltf (x, z, -y)).  So the single front leg and the lid handle face
blender +Y, and the two wheels trail at blender -Y.
"""

import math
import os

import bpy
import bmesh
from mathutils import Vector

OBJ_NAME = 'BBQGrill'
_HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in dir() else \
    '/Users/ledogen/CodeShit/CarGame/assets/models/src'
OUT_GLB = os.path.join(_HERE, '..', 'bbq-grill.glb')
OUT_BLEND = os.path.join(_HERE, 'bbq-grill.blend')

# ---------------------------------------------------------------------------
# Parameters.  Everything tunable lives here; the body below only consumes it.
# ---------------------------------------------------------------------------

P = dict(
    # --- roundness ----------------------------------------------------------
    # 14 sides on the body.  12 reads as a lantern at close range; 16 costs
    # another 60 tris for a difference nothing at 20 m can see.
    n_body=14,
    n_small=8,          # damper, handle bar, wheels, vent housing
    n_pan=10,           # the slung ash pan

    # --- the ball -----------------------------------------------------------
    # ALL FIVE OF THESE COME OFF THE REFERENCE PHOTO, scaled by setting the ball's
    # measured 315 px width to the real 0.57 m of a 22" kettle (1 px = 1.81 mm):
    #   crown            y 155
    #   lid / bowl joint y 255   -> lid is 100 px = 0.181 m tall
    #   widest point     y 295   ->  40 px = 0.072 m BELOW the joint
    #   underside pole   y 415   -> 120 px = 0.217 m below the widest point
    #   ground           y 710   -> 295 px = 0.534 m of leg under the bowl
    # Ball height 0.470 / width 0.570 = 0.825, which is the number the first pass
    # missed.  CHANGE ANY OF THESE AND RE-CHECK THE RATIO.
    bowl_r=0.285,       # radius at the bowl's OWN equator, the widest point
    bowl_eq_z=0.751,    # height of that equator
    bowl_depth=0.217,   # equator down to the underside pole
    bowl_rim_r=0.272,   # the bowl necks back IN above its equator...
    bowl_rim_z=0.823,   # ...to the rim the lid sits on, 0.072 higher

    # --- lid ----------------------------------------------------------------
    lid_r=0.279,        # stands 7 mm proud of the rim, so the joint casts a line
    lid_lip=0.030,      # depth of the vertical skirt below the rim.  THE signature
                        # cue: without it lid and bowl fuse into one egg.  2n tris.
    lid_h=0.181,
    lid_top_r=0.045,    # flat crown

    # --- lid handle: ON THE APEX (reference), a bar on two posts -------------
    handle_span=0.150,  # centre-to-centre of the posts
    handle_lift=0.048,  # bar centre above the lid surface at the post feet
    handle_r=0.016,
    post=0.013,

    # --- damper: OFF-AXIS on the shoulder, beside the handle -----------------
    damper_r=0.050,
    damper_at=0.105,    # radius on the lid it sits at, pushed to the front (+Y)
    damper_sink=0.021,  # how far its cylinder reaches down into the dome
    damper_rise=0.015,  # ...and up out of it
    damper_tab=(0.012, 0.040, 0.006),   # the lever, half-extents; it MUST overhang
                                        # the cap or the vent reads as a plain disc
    damper_tab_lift=0.004,              # the lever's top ABOVE the damper's own cap.
                                        # Sitting the two flush made the model's only
                                        # z-fighting pair -- two coplanar faces at
                                        # exactly z 1.0111, invisible in the viewport
                                        # and a flickering seam under engine lighting.
    # --- bowl vent housing (the dark box under the bowl) --------------------
    vent_r=0.085,
    vent_z_lo=0.470,
    vent_z_hi=0.548,    # buried into the bowl's underside pole at 0.534

    # --- bowl side grips ----------------------------------------------------
    bowl_handle=(0.020, 0.042, 0.013),  # half-extents, before the radial push
    bowl_handle_z=0.782,

    # --- legs ---------------------------------------------------------------
    leg_r=0.016,        # half-width of the square leg tube ("low-sided tubes",
                        # ASSET-01 convention -- 4 sides, not a cylinder)
    leg_top_r=0.165,    # radius where the leg meets the bowl underside
    leg_top_z=0.600,    # pushed UP INTO the shell so no gap can open
    leg_foot_r=0.340,   # 0.68 m stance under a 0.57 m bowl, per the reference --
                        # the feet are outside the ball, which is what stops a
                        # kettle looking like it is about to tip.
    leg_bearings=(90.0, 210.0, 330.0),   # degrees CCW from +X.  90 = front (+Y).

    # --- wheels -------------------------------------------------------------
    # 8 inch, which is the real part and much bigger than the first pass guessed.
    # They are a third of the ball's diameter and they matter to the silhouette.
    wheel_r=0.100,
    wheel_w=0.040,

    # --- the slung ash pan --------------------------------------------------
    # A wide shallow dish hanging at leg height, NOT tucked under the bowl.  It is
    # the brightest thing on the model, so it has to be visibly held up: three
    # radial struts run from its rim out to whatever the legs are doing at that
    # height (computed, not hand-placed, so moving a leg moves the struts).
    pan_r=0.165,
    pan_z_lo=0.300,
    pan_z_hi=0.400,
    strut_r=0.010,

    # --- cooking grate ------------------------------------------------------
    grate_r=0.258,
    grate_drop=0.040,   # below the rim

    # --- materials.  LINEAR RGB (ART-STYLE rule 5 -- these render ~1.5x
    # lighter than the number reads).  Metalness is 0 everywhere; roughness
    # carries the surface difference.
    mats={
        # Porcelain enamel.  0.014 linear is about 0.12 sRGB -- near-black but
        # not crushed, so the facets still separate.  PALETTE INDEX 0.
        'GrillEnamel': dict(color=(0.014, 0.014, 0.015), rough=0.42),
        # Plated steel: legs, damper, ash pan, struts.  The light in the value
        # structure, and after the reshape it is also the widest thing on the
        # model -- the pan and the stance are what the eye lands on first.
        'GrillSteel':  dict(color=(0.155, 0.158, 0.165), rough=0.50),
        # The cooking grate, brighter and cooler than the legs.
        'GrillGrate':  dict(color=(0.230, 0.235, 0.245), rough=0.38),
        # Nylon handles, rubber wheels, the bowl's vent housing.  FIXED -- never
        # recoloured, so it must not merge with GrillEnamel despite both being
        # near-black, or a red kettle would grow red handles and red tyres.
        'GrillTrim':   dict(color=(0.022, 0.021, 0.020), rough=0.72),
    },
)

# ---------------------------------------------------------------------------
# Geometry helpers.  Everything returns (verts, faces, mat_name) in world space.
# ---------------------------------------------------------------------------


def lathe(profile, n, mat, phase=0.0, cx=0.0, cy=0.0):
    """Revolve a (radius, z) profile, bottom to top, around the z axis.

    A profile endpoint with radius 0 becomes a pole and is fanned; a non-zero
    endpoint is capped with an n-gon.  Winding is fixed up by the caller's
    recalc pass, so the loop below only has to be consistent, not correct.
    """
    verts, faces = [], []
    ring_start = []
    for r, z in profile:
        if r <= 1e-9:
            ring_start.append(('pole', len(verts)))
            verts.append((cx, cy, z))
        else:
            ring_start.append(('ring', len(verts)))
            for i in range(n):
                a = phase + 2.0 * math.pi * i / n
                verts.append((cx + r * math.cos(a), cy + r * math.sin(a), z))

    for k in range(len(profile) - 1):
        (ka, ia), (kb, ib) = ring_start[k], ring_start[k + 1]
        if ka == 'pole':
            faces += [(ia, ib + i, ib + (i + 1) % n) for i in range(n)]
        elif kb == 'pole':
            faces += [(ia + i, ib, ia + (i + 1) % n) for i in range(n)]
        else:
            faces += [(ia + i, ia + (i + 1) % n, ib + (i + 1) % n, ib + i)
                      for i in range(n)]

    # Cap the open ends.  An n-gon here is one face; the triangulate step at
    # export turns it into n-2 tris, which is cheaper than a fan through a
    # centre vertex (n tris) and identical to look at on a flat cap.
    ka, ia = ring_start[0]
    if ka == 'ring':
        faces.append(tuple(range(ia, ia + n)))
    kb, ib = ring_start[-1]
    if kb == 'ring':
        faces.append(tuple(range(ib, ib + n)))

    return verts, faces, mat


def box(centre, half, mat, yaw=0.0):
    """Axis-aligned box, optionally yawed about z."""
    cx, cy, cz = centre
    hx, hy, hz = half
    c, s = math.cos(yaw), math.sin(yaw)
    verts = []
    for sz in (-1, 1):
        for sy in (-1, 1):
            for sx in (-1, 1):
                x, y = sx * hx, sy * hy
                verts.append((cx + x * c - y * s, cy + x * s + y * c, cz + sz * hz))
    # index layout: 0..3 bottom, 4..7 top, x fastest then y
    faces = [(0, 1, 3, 2), (4, 5, 7, 6),
             (0, 1, 5, 4), (2, 3, 7, 6),
             (0, 2, 6, 4), (1, 3, 7, 5)]
    return verts, faces, mat


def tube(p0, p1, half, n, mat, up=(0.0, 0.0, 1.0)):
    """Closed n-sided tube from p0 to p1.  n=4 gives the square leg section."""
    p0, p1 = Vector(p0), Vector(p1)
    axis = (p1 - p0).normalized()
    ref = Vector(up)
    if abs(ref.dot(axis)) > 0.95:
        ref = Vector((1.0, 0.0, 0.0))
    u = (ref - axis * ref.dot(axis)).normalized()
    v = axis.cross(u)
    verts, faces = [], []
    phase = math.pi / n          # flat side facing out, not a corner
    for p in (p0, p1):
        for i in range(n):
            a = phase + 2.0 * math.pi * i / n
            verts.append(tuple(p + u * (half * math.cos(a)) + v * (half * math.sin(a))))
    faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    faces.append(tuple(range(n)))
    faces.append(tuple(range(n, 2 * n)))
    return verts, faces, mat


def disc(centre, r, n, mat, phase=0.0):
    """One flat, upward-facing n-gon.  Used only for the grate."""
    cx, cy, cz = centre
    verts = [(cx + r * math.cos(phase + 2.0 * math.pi * i / n),
              cy + r * math.sin(phase + 2.0 * math.pi * i / n), cz)
             for i in range(n)]
    return verts, [tuple(range(n))], mat


# ---------------------------------------------------------------------------
# The two lathe profiles
# ---------------------------------------------------------------------------


def bowl_profile(p):
    """Underside pole -> the bowl's own equator -> back IN to the rim.

    The last entry is the undercut: above its widest point the bowl necks back in
    by 13 mm before the lid takes over.  Sampled on the SPHERE ANGLE rather than
    on z, so the rings bunch where the curvature is and spread across the flat
    underside; sampling on z puts three rings in the last 4 cm and facets the
    bottom.
    """
    out = [(0.0, p['bowl_eq_z'] - p['bowl_depth'])]
    for t in (0.45, 0.78, 1.0):
        a = t * math.pi / 2.0
        out.append((p['bowl_r'] * math.sin(a),
                    p['bowl_eq_z'] - p['bowl_depth'] * math.cos(a)))
    out.append((p['bowl_rim_r'], p['bowl_rim_z']))
    return out


def _lid_bmax(p):
    return math.acos(p['lid_top_r'] / p['lid_r'])


def lid_profile(p):
    """The vertical lip skirt, then the dome up to the flat crown."""
    bmax = _lid_bmax(p)
    zk = math.sin(bmax)
    out = [(p['lid_r'], p['bowl_rim_z'] - p['lid_lip'])]
    for b in (0.0, 0.55, 1.0, bmax):
        out.append((p['lid_r'] * math.cos(b),
                    p['bowl_rim_z'] + p['lid_h'] * math.sin(b) / zk))
    return out


def lid_surface_z(p, radius):
    """Height of the lid dome at a given radius -- where things bolt onto it."""
    bmax = _lid_bmax(p)
    b = math.acos(min(1.0, radius / p['lid_r']))
    return p['bowl_rim_z'] + p['lid_h'] * math.sin(b) / math.sin(bmax)


def leg_point(p, bearing, z):
    """Where a leg is at height z.  The pan struts are aimed with this rather
    than hand-placed, so moving a leg drags its strut along with it."""
    a = math.radians(bearing)
    front = abs(bearing - 90.0) < 1.0
    z_foot = 0.0 if front else p['wheel_r']
    t = (p['leg_top_z'] - z) / (p['leg_top_z'] - z_foot)
    t = max(0.0, min(1.0, t))
    r = p['leg_top_r'] + t * (p['leg_foot_r'] - p['leg_top_r'])
    return (r * math.cos(a), r * math.sin(a), z), r


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------


def _wipe():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for it in list(blk):
            blk.remove(it)


def _materials():
    order = list(P['mats'].keys())
    made = {}
    for name in order:
        spec = P['mats'][name]
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = (*spec['color'], 1.0)
        bsdf.inputs['Roughness'].default_value = spec['rough']
        bsdf.inputs['Metallic'].default_value = 0.0   # ART-STYLE: metalness is always 0
        # Closed shells with proven winding do not need doubleSided; that is pure
        # overdraw.  gnome.glb / campfire.glb precedent.
        m.use_backface_culling = True
        made[name] = m
    return order, made


def build():
    p = P
    _wipe()
    order, mats = _materials()
    slot_of = {name: i for i, name in enumerate(order)}

    parts = []

    # -- bowl and lid -------------------------------------------------------
    parts.append(lathe(bowl_profile(p), p['n_body'], 'GrillEnamel'))
    parts.append(lathe(lid_profile(p), p['n_body'], 'GrillEnamel'))
    crown_z = p['bowl_rim_z'] + p['lid_h']

    # -- lid handle: a bar across the APEX, on two posts ---------------------
    hs = p['handle_span'] / 2.0
    foot_z = lid_surface_z(p, hs)
    bar_z = foot_z + p['handle_lift']
    for sx in (-1, 1):
        parts.append(box((sx * hs, 0.0, (foot_z + bar_z) / 2.0 - 0.010),
                         (p['post'], p['post'], (bar_z - foot_z) / 2.0 + 0.014),
                         'GrillTrim'))
    parts.append(tube((-hs - 0.026, 0.0, bar_z), (hs + 0.026, 0.0, bar_z),
                      p['handle_r'], p['n_small'], 'GrillTrim'))

    # -- damper: a disc on the SHOULDER, offset to the front ------------------
    # Vertical cylinder sunk into a sloped dome, which is what the real part is:
    # a flat plate clamped onto a curve.  Sinking it 21 mm is enough that the
    # dome never shows through the low side of the cap.
    dz = lid_surface_z(p, p['damper_at'])
    parts.append(lathe([(p['damper_r'], dz - p['damper_sink']),
                        (p['damper_r'], dz + p['damper_rise'])],
                       p['n_small'], 'GrillSteel', cy=p['damper_at']))
    tx, ty, tz = p['damper_tab']
    parts.append(box((0.0, p['damper_at'] + p['damper_r'] * 0.35,
                      dz + p['damper_rise'] + p['damper_tab_lift'] - tz),
                     (tx, ty, tz), 'GrillSteel'))

    # -- bowl vent housing: the dark box bolted UNDER the bowl ---------------
    parts.append(lathe([(p['vent_r'], p['vent_z_lo']),
                        (p['vent_r'], p['vent_z_hi'])],
                       p['n_small'], 'GrillTrim'))

    # -- bowl side grips, at +/-X (90 degrees off the front) -----------------
    bhx, bhy, bhz = p['bowl_handle']
    grip_r = p['bowl_r'] - (p['bowl_r'] - p['bowl_rim_r']) * \
        (p['bowl_handle_z'] - p['bowl_eq_z']) / (p['bowl_rim_z'] - p['bowl_eq_z'])
    for sx in (-1, 1):
        parts.append(box((sx * (grip_r - 0.004 + bhx * 0.55), 0.0,
                          p['bowl_handle_z']), (bhx, bhy, bhz), 'GrillTrim'))

    # -- legs ---------------------------------------------------------------
    # The two rear legs stop at the wheel hub; the front one runs to the ground.
    for bearing in p['leg_bearings']:
        top, _ = leg_point(p, bearing, p['leg_top_z'])
        z_foot = 0.0 if abs(bearing - 90.0) < 1.0 else p['wheel_r']
        bot, _ = leg_point(p, bearing, z_foot)
        parts.append(tube(top, bot, p['leg_r'], 4, 'GrillSteel'))

    # -- wheels on the two rear legs ----------------------------------------
    # lathe() revolves about z; the (x,y,z) -> (z,y,x) remap below tips each
    # wheel onto an X axis, which is what the reference shows -- the rear pair
    # shares a notional axle line even though each wheel is on its own leg.
    for bearing in p['leg_bearings']:
        if abs(bearing - 90.0) < 1.0:
            continue
        (fx, fy, fz), _ = leg_point(p, bearing, p['wheel_r'])
        sx = 1.0 if fx > 0 else -1.0
        verts, faces, mat = lathe([(p['wheel_r'], -p['wheel_w'] / 2.0),
                                   (p['wheel_r'], p['wheel_w'] / 2.0)],
                                  p['n_small'], 'GrillTrim')
        parts.append(([(fx + sx * z, fy + y, fz + x) for (x, y, z) in verts],
                      faces, mat))

    # -- the slung ash pan, and the struts that hold it up -------------------
    # Capped at the top: ART-STYLE caps every opening, and an open dish under a
    # closed kettle is an interior nobody can see paying for backface overdraw.
    parts.append(lathe([(0.0, p['pan_z_lo']),
                        (p['pan_r'] * 0.62, p['pan_z_lo'] + 0.022),
                        (p['pan_r'], p['pan_z_hi'])],
                       p['n_pan'], 'GrillSteel'))
    for bearing in p['leg_bearings']:
        a = math.radians(bearing)
        anchor, _ = leg_point(p, bearing, p['pan_z_hi'])
        inner = ((p['pan_r'] - 0.020) * math.cos(a),
                 (p['pan_r'] - 0.020) * math.sin(a), p['pan_z_hi'] - 0.012)
        parts.append(tube(inner, anchor, p['strut_r'], 4, 'GrillSteel'))

    # -- cooking grate (authored per the ticket; invisible with the lid on) --
    parts.append(disc((0.0, 0.0, p['bowl_rim_z'] - p['grate_drop']),
                      p['grate_r'], 12, 'GrillGrate'))

    # -- assemble -----------------------------------------------------------
    me = bpy.data.meshes.new(OBJ_NAME)
    ob = bpy.data.objects.new(OBJ_NAME, me)
    bpy.context.collection.objects.link(ob)
    for name in order:
        ob.data.materials.append(mats[name])

    bm = bmesh.new()
    flipped = 0
    for verts, faces, mat_name in parts:
        sub = bmesh.new()
        bvs = [sub.verts.new(v) for v in verts]
        sub.verts.index_update()
        made = []
        for f in faces:
            try:
                made.append(sub.faces.new([bvs[i] for i in f]))
            except ValueError:
                pass
        sub.faces.index_update()
        # THE WINDING TRAP (gas-pump, 2026-08-22): a bmesh face normal is
        # meaningless until normal_update(), and a helper built on a left-handed
        # frame exports inside-out faces the viewport never shows.  So: update,
        # recalc, and COUNT what moved.  A non-zero count on a closed part is
        # information -- it says that helper's winding disagrees with outward.
        sub.normal_update()
        before = [f.normal.copy() for f in sub.faces]
        if len(made) > 1:
            bmesh.ops.recalc_face_normals(sub, faces=sub.faces[:])
            sub.normal_update()
            flipped += sum(1 for f, n0 in zip(sub.faces, before)
                           if f.normal.dot(n0) < 0.0)
        slot = slot_of[mat_name]
        for f in sub.faces:
            f.material_index = slot
            f.smooth = False          # ART-STYLE rule 3: faceted, always
        tmp = bpy.data.meshes.new('tmp')
        sub.to_mesh(tmp)
        sub.free()
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)

    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = False

    # Seat the model: the lowest vertex goes to exactly z = 0.
    minz = min(v.co.z for v in me.vertices)
    for v in me.vertices:
        v.co.z -= minz

    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    print('recalc flipped %d faces' % flipped)
    return ob


def stats():
    dg = bpy.context.evaluated_depsgraph_get()
    ob = bpy.data.objects[OBJ_NAME]
    me = ob.evaluated_get(dg).to_mesh()
    tris = sum(len(f.vertices) - 2 for f in me.polygons)
    per = {}
    for f in me.polygons:
        n = ob.data.materials[f.material_index].name
        per[n] = per.get(n, 0) + len(f.vertices) - 2
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    dims = (max(v.x for v in bb) - min(v.x for v in bb),
            max(v.y for v in bb) - min(v.y for v in bb),
            max(v.z for v in bb) - min(v.z for v in bb))
    out = dict(tris=tris, verts=len(me.vertices), per_material=per,
               dims=tuple(round(d, 4) for d in dims),
               minz=round(min(v.z for v in bb), 5),
               materials=len(ob.data.materials), images=len(bpy.data.images),
               uvs=len(ob.data.uv_layers))
    ob.evaluated_get(dg).to_mesh_clear()
    return out


def export():
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(OUT_GLB),
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_draco_mesh_compression_enable=False,
        use_selection=False,
        export_cameras=False,
        export_lights=False,
    )
    return os.path.abspath(OUT_GLB)
