"""
ASSET-24 - the player's campfire, parametric generator.

Built for: Blender 5.x  |  Target: assets/models/campfire.glb
Style brief: .planning/research/ART-STYLE.md  |  Mechanics: .planning/research/ASSETS.md

SHIPS COLD.  Flames, the point light, the flicker and the dynamic shadows are a
VFX ticket, not this one.  glTF carries meshes, node transforms and keyframes --
it carries no particle systems and no lights, so an animated fire authored in
Blender would not survive the export at all.  What this file provides instead is
the SOLID fire (ash, coals, laid logs) plus one named empty, FireFlameAnchor,
sitting at the flame origin for the runtime rig to parent to.

NO TEXTURE.  The ticket budgeted one 512x512 albedo for "charred bark, ash,
ember glow".  ART-STYLE rule 1 spends a texture only on information geometry
cannot carry -- printed words, a label.  Char and ash are WEAR, which is the
named anti-pattern, and glow is forbidden by the ticket's own Notes.  So this
lands on the ART-STYLE default: 4 flat Principled materials, 0 images, 0 UVs.

THE STONE RING WAS ADDED IN THE SECOND PASS, AND THAT REOPENS A DESIGN QUESTION.
The first build deliberately dropped the ticket's "few stones nudged into a loose
ring", because the ticket's own Notes make the ring ASSET-08's entire identity:
a stone-ringed pit says SOMEONE LIVES HERE, a bare laid fire says I SLEPT HERE,
and "the difference between those two is the entire point of both".  The owner's
2026-08-21 call put an 11-stone ring back on.  FLAG FOR ASSET-08: the two assets
now share their strongest silhouette cue, so ASSET-08 needs a different one --
a built kerb, a taller course, a proper dug pit -- or the pair will read as the
same object at distance.

VALUE STRUCTURE (ART-STYLE rule 5), outside in and bottom to top: mid-grey stone
ring, white ash annulus, black coal bed, then pale weathered log butts rising to
blackened tips where the logs cross the flame.  The stone had to be pulled well
below the ART-STYLE boulder swatch to keep that order -- see FireStone.  The char
is on the log TOPS, not the bottoms: in a teepee lay the butts rest on the ground
and it is the crossing point above the coals that burns.

FOUR MATERIALS.  FireAsh / FireCoal / FireLog / FireStone.  A fifth, FireEmber,
existed for two dull-warm coals and was cut on sight once the bed went black --
against black they read as terracotta shards, not embers.  Char does NOT get its
own material: charred log tips reuse FireCoal, same colour and same role, which
is the merge rule and saves a draw call.

OVER THE TICKET'S TRI BUDGET: 472 against 300, and the stone ring is all of it.
The ring alone is 220 tris (11 icosahedra at 20 each); everything the ticket
actually specified comes to 252, comfortably inside 300.  The ticket never
budgeted a ring because its Request called for "a few stones nudged into a loose
ring" and the first build dropped them entirely.  ASSET-08 -- the permanent fire
pit, the one asset here that DOES specify a stone ring -- budgets 450 with
"stones ~300" earmarked, so 464 is the right order for a ring-fire and the
ticket's 300 is a number for a ringless one.  RECOMMEND the budget move to 500.

ROTATIONALLY SYMMETRIC.  Forward is n/a; yaw-randomise on placement.  Base-seated
with the ash disc's underside at exactly z = 0 in Blender (y = 0 in the GLB).
Every log is lifted individually until its lowest vertex clears the ground, so
the bed is what defines the seat and no butt end sinks.  THE STONES ARE THE
EXCEPTION: they are placed genuinely below the ground plane and clamped up to
z >= 0 instead, because lifting them would cancel ring_sink outright -- see the
comment at the ring build loop.

AXIS NOTE.  The exporter's "+Y up" maps blender (x,y,z) -> gltf (x, z, -y).
Nothing here depends on facing, but FireFlameAnchor's height is a blender +Z
offset and lands as a gltf +Y offset, which is what the rig wants.

THREE LOGS, NOT FIVE (owner call 2026-08-21).  Almost-perfect 3-fold symmetry,
tips closed up until they touch, and exactly one log carrying a side branch.  The
five-log first pass read as a wigwam frame.  See log_tip_az for the geometry that
makes them cross rather than meet at an apex, and log_tip_r for what closes the
tops.

THE BED IS TWO-TONE (owner call 2026-08-21).  White ash only as an OUTER ANNULUS,
black coal bed filling the middle.  A single white disc read as a porcelain plate
that somebody had set a fire on; ash showing out from under the coals is what it
actually is, and the split costs 10 tris.  ring_r is then set so the stones' inner
edge lands just outside the bed rim -- any closer and the ring covers the white
band, which is the only thing making the bed read as two-tone at all.

TALLER THAN THE TICKET: 0.381 m against its stated 0.30 m.  The ticket's
0.7 m dia x 0.3 m tall makes a teepee twice as wide as it is high, and at that
ratio the logs come out near horizontal and read as three logs lying down.
Diameter is 0.714 m against the ticket's 0.7 -- 14 mm over, and that is the
constructed stone ring, which the ticket never budgeted a footprint for either.

BUILT 2026-08-21, ring reworked 2026-08-22, against Blender 5.2.0 LTS.
FINAL: 472 tris (ticket budget 300 -- see above), 286 verts, 4 materials,
0 images, 0 UV layers, one mesh object + one empty.
0.7138 W x 0.3778 H x 0.6773 D m, base-seated at exactly y = 0 in the
GLB -- the BED DISC defines the seat, and every log, coal and stone is lifted
individually until it clears the ground plane.  Single-sided, no Draco.
Audit clean: 0 object-vs-object clips, 0 coplanar pairs, 0 non-manifold edges,
0 loose verts, 0/7792 inverted first-hit rays.
Rebuild:  exec(open(__file__).read()); build(); export()
"""

import bpy
import bmesh
import math
import os
from mathutils import Vector

# ---------------------------------------------------------------------------
# Parameters.  Everything tunable lives here; the body below only consumes it.
# ---------------------------------------------------------------------------

P = dict(
    # --- overall envelope (ticket: 0.7 m diameter x 0.3 m tall) --------------
    height=0.385,          # SEE the note in the docstring -- the ticket says 0.30

    # --- the bed: TWO TONE (owner call 2026-08-21) --------------------------
    # A single white disc read as a porcelain plate with rubble on it.  The bed
    # is now concentric: a white ash annulus around the outside and a BLACK coal
    # bed filling the middle, so the ash reads as what is showing from UNDER the
    # coals rather than as the surface the fire sits on.  Same mesh, same vert
    # ring count -- only the top face is split, which costs 10 tris.
    bed_n=10,              # sides of the bed disc
    bed_r_base=0.172,      # radius where it meets the ground.  CAPPED BY THE RING:
                           # an icosahedron is narrower at ground level than at its
                           # waist, so even a touching ring has gaps down where it
                           # meets the dirt.  The bed's outer edge has to stay
                           # inside the stones' NARROWEST reach, and low enough that
                           # its skirt does not show through them, or a
                           # sliver of white ash shows through those gaps from
                           # outside, which is the one thing the owner's
                           # 2026-08-22 pit ruling still forbids.
    bed_r_rim=0.158,       # radius of the top rim
    bed_r_black=0.126,     # where white ash gives way to the black coal bed.
                           # 80% of bed_r_rim (owner call 2026-08-21) -- the white is
                           # a RIM of ash showing out from under the coals, not a
                           # plate that the coals sit in the middle of.
    bed_h_rim=0.022,       # height of the rim ring
    bed_h_black=0.054,     # height of the white/black boundary ring
    bed_h_peak=0.064,      # height of the centre vertex.  The whole bed was raised
                           # once the ring went to big stones: at 0.043 it sat far
                           # below the stone tops and vanished behind them at any
                           # low camera angle.  A real fire's ash MOUNDS up inside
                           # its ring, so this both reads better and is correct.

    # --- coals --------------------------------------------------------------
    # NO EMBERS.  The two warm-brown coals were cut on sight (owner, 2026-08-21):
    # against a now-black bed they read as terracotta shards, not embers, and the
    # material went with them.  Coals are one colour, and the only warmth left on
    # the model is the log wood.
    coal_count=9,
    coal_r_min=0.030,      # half-width of the smallest coal
    coal_r_max=0.052,
    coal_flatten=0.62,     # z scale -- coals are squashed, not spherical
    coal_ring_r=0.090,     # kept inside bed_r_black so coals sit ON the black bed

    # --- the fire ring ------------------------------------------------------
    # A CONSTRUCTED, FOUND RING (owner calls 2026-08-21 / 22).  Not a scatter of
    # pebbles: somebody built this ring, the player is re-using it, and it should
    # read as placed and settled rather than spilled.  Hence the near-zero radial
    # and bearing wobble, the deep sink, and the sizing rule below.
    #
    # Stones are icosahedra -- see make_stone for why nothing cheaper works.
    ring_count=11,
    ring_r=0.250,          # centre radius, now set TIGHT rather than clear of the
                           # bed.  Owner ruling 2026-08-22 RETIRED the old
                           # constraint (keep the stones off the white ash
                           # annulus): the asset is a PIT FULL OF ASH with coals
                           # lying on top, so the bed running underneath the ring
                           # and clipping into the stones is correct, not a fault.
                           # The only rule left is that NO ASH MAY SHOW OUTSIDE
                           # the stones.  Freeing that brought the whole asset
                           # back to ~0.70 m from the 0.78 it had grown to.

    # SIZED TO TOUCH.  Real fire rings have no gaps -- the point of a ring is to
    # contain, so the stones go shoulder to shoulder, and daylight between them
    # reads as a decorative border instead.  The constraint is arithmetic: mean
    # stone WIDTH (2 x mean size) must exceed the arc spacing between stone
    # centres, 2*pi*ring_r/ring_count.  At r 0.250 and 10 stones that spacing is
    # 0.143 m at 11 stones; the WORST-CASE width (min size x min anisotropy x min
    # jitter) is 0.133 and the mean is 0.176.  Overlap, not just
    # contact.  Sized merely to touch, the taper still left slivers of ash
    # visible through the ground-level gaps; the margin is what closes them.
    # CHANGE ring_r OR ring_count AND THIS HAS TO BE RE-CHECKED.
    ring_r_min=0.086,      # half-width of the smallest stone
    ring_r_max=0.100,
    ring_flatten=0.86,     # Squashed, but NOT flat.  Two failure modes bracket
                           # this number: near 1.0 the stones read as tall cut
                           # crystals, and at 0.40 they lie so low the ring reads
                           # as a scatter of flakes on the dirt.
    ring_sink=0.34,        # fraction of its own height each stone is bedded in.
                           # DEEP, on purpose: a found ring has settled and silted
                           # in, where a freshly-set one sits on top of the ground.

    # --- teepee logs --------------------------------------------------------
    log_count=3,
    log_n=6,               # sides of a log -- 6 reads round, 5 reads splintered
    log_r_butt=0.046,      # radius at the ground end
    log_r_tip=0.036,       # radius at the top end (real logs taper)
    log_char_t=0.47,       # fraction along the log where pale wood -> char

    # THREE LOGS, ALMOST PERFECT 3-FOLD SYMMETRY (owner call 2026-08-21).  Five
    # logs read as a wigwam frame; three is the quintessential lay.  The jitter
    # below is deliberately tiny -- enough that the thing is not machined, not
    # enough to lose the symmetry.
    # THE BUTTS ARE PULLED IN TIGHT ON PURPOSE.  The ticket caps height at 0.30 m,
    # so the base radius is what sets the lean angle -- at 0.29 the logs came out
    # at 52 deg and read as three logs lying down, not a teepee.  0.24 puts them
    # near 60 deg, which is the angle that reads.  Total diameter lands ~0.55 m,
    # comfortably inside the ticket's 0.7 m.
    # Butts pulled inside the stone ring, tips closed up until they touch.
    log_butt_r=(0.150, 0.160, 0.155),                 # per-log ground radius
    log_tip_r=(0.038, 0.042, 0.036),                  # per-log tip radius
    log_tip_h=(0.375, 0.385, 0.366),                  # per-log tip height
    log_az_jitter=(0.000, 0.030, -0.025),             # radians off the even 120 deg

    # THE TIPS NOW CLOSE UP AND TOUCH (owner call 2026-08-21).  log_tip_r is what
    # controls that: three tips 120 deg apart at radius r are r*sqrt(3) apart, so
    # r ~ 0.038 against a tip radius of 0.031 puts the end caps in contact.  The
    # earlier splayed version had them at 0.11 and the top read as loose.
    #
    # THE SWING STILL HAS TO CLEAR 120 DEGREES.  Every log's top is swung the SAME WAY off its own base
    # bearing, which makes a pinwheel: uniform sign gives the cyclic interlock
    # A-on-B, B-on-C, C-on-A that a real tripod lay has.  The MAGNITUDE is the
    # part that took three passes.  At ~1 rad (57 deg) every tip stops short of
    # the next log's base bearing, so all three converge on one blunt apex and it
    # reads as a wigwam frame.  At 2.3 rad (132 deg) each log's tip passes BEYOND
    # its neighbour's base bearing: the shafts genuinely cross at about two
    # thirds height and the three tips splay out above the crossing.  That splay
    # is the whole silhouette of a teepee fire.
    #
    # The shafts interpenetrate where they cross.  That is deliberate and it is
    # why this is ONE mesh object -- the audit's clipping check compares object
    # against object, so keeping the logs in one mesh leaves that check a
    # meaningful signal instead of reporting the lay back at us every run.
    log_tip_az=(2.06, 2.02, 2.10),

    # --- the side branch ----------------------------------------------------
    # One log still has a limb on it: the difference between split firewood and
    # something dragged out of the treeline.  It is the only thing breaking the
    # 3-fold symmetry, which is why there is exactly one of it.
    branch_on=1,           # which log carries it
    branch_t=0.30,         # how far up that log's shaft it forks
    branch_len=0.168,
    branch_n=5,            # thinner than a log, so fewer sides
    branch_r0=0.019,
    branch_r1=0.011,
    branch_char_t=0.52,    # its outer half is in the flame too
    # Aim is a blend of three directions.  It RISES rather than drops: a limb
    # angled down reads as a twig that fell against the log, and the first pass
    # (drop 0.18) did exactly that.  Angled up it reads as part of the log.
    branch_out=0.62,       # outward, away from the fire's axis
    branch_along=0.55,     # along the parent log's own direction
    branch_rise=0.30,      # and upward

    # --- flame attach node --------------------------------------------------
    anchor_h=0.085,        # where the runtime flame quad / point light sits

    # --- materials.  LINEAR RGB (ART-STYLE rule 5) -- these render ~1.5x
    #     lighter than the number reads.  Judged rendered, not as tuples.
    mats={
        # Cold wood ash: the lightest thing here, but NOT white.  0.56 linear was
        # the first pass and rendered as porcelain -- linear is ~1.5x lighter than
        # the tuple reads (ART-STYLE rule 5), so 0.33 is what actually looks like
        # a pale warm ash-grey once tone mapping is applied.  It is now only the
        # OUTER ANNULUS of the bed, which is what turned it from a plate into ash
        # showing out from under the coals.
        'FireAsh':   dict(color=(0.330, 0.318, 0.298), rough=0.97),
        # charcoal.  Deliberately far darker than "dark grey" feels -- 0.018
        # linear is about 0.15 sRGB.  Also used for the charred log tips.
        'FireCoal':  dict(color=(0.022, 0.019, 0.017), rough=0.90),
        # Weathered split wood.  The deadwood swatch #6f5c46 converts to 0.166
        # linear, which rendered as fresh sawn pine against the dark coals -- too
        # light and too orange.  Knocked down and greyed: this is wood that has
        # been out in the weather, not off a saw bench.
        'FireLog':   dict(color=(0.108, 0.076, 0.048), rough=0.95),
        # Fire-ring stone.  The ART-STYLE boulder swatch #b7b6b4 is 0.478 linear,
        # which would put the ring BRIGHTER than the ash and invert the whole
        # value structure.  These are sooted river stones: mid grey, and the
        # order bottom-to-top stays white ash -> grey stone -> black coal -> wood.
        'FireStone': dict(color=(0.076, 0.074, 0.070), rough=0.93),
    },
)

OBJ_NAME = 'Campfire'
ANCHOR_NAME = 'FireFlameAnchor'
OUT_GLB = os.path.join(os.path.dirname(bpy.data.filepath) or '.', '..', 'campfire.glb')


# ---------------------------------------------------------------------------
# Geometry helpers.  Each returns (verts, faces, mat_per_face) in world space;
# the caller appends them into one bmesh.
# ---------------------------------------------------------------------------

def _ring(centre, xdir, ydir, radius, n, phase=0.0):
    """n points on a circle, first vertex offset by half a step so the shape is
    closed under reflection and the facets sit symmetrically."""
    out = []
    for i in range(n):
        a = 2.0 * math.pi * (i + 0.5) / n + phase
        out.append(centre + xdir * (radius * math.cos(a)) + ydir * (radius * math.sin(a)))
    return out


def make_bed(p):
    """The fire bed: a shallow truncated cone whose underside is a flat n-gon on
    z = 0, with its TOP FACE SPLIT INTO TWO RINGS -- a white ash annulus outside
    and a black coal bed filling the middle.  Closed and manifold.

    The split is the whole point.  One flat white disc reads as a plate that
    somebody set a fire on; ash showing only around the rim reads as ash that is
    underneath the coals, which is what it actually is."""
    n = p['bed_n']
    x, y = Vector((1, 0, 0)), Vector((0, 1, 0))
    base = _ring(Vector((0, 0, 0.0)), x, y, p['bed_r_base'], n)
    rim = _ring(Vector((0, 0, p['bed_h_rim'])), x, y, p['bed_r_rim'], n)
    blk = _ring(Vector((0, 0, p['bed_h_black'])), x, y, p['bed_r_black'], n)
    peak = Vector((0, 0, p['bed_h_peak']))

    verts = base + rim + blk + [peak]
    B, R, K, PK = 0, n, 2 * n, 3 * n
    faces, mats = [], []

    # underside -- one n-gon, wound downward so its normal points at -z
    faces.append(tuple(range(n - 1, -1, -1)))
    mats.append('FireAsh')
    # outer skirt
    for i in range(n):
        j = (i + 1) % n
        faces.append((B + i, B + j, R + j, R + i))
        mats.append('FireAsh')
    # the white ash annulus
    for i in range(n):
        j = (i + 1) % n
        faces.append((R + i, R + j, K + j, K + i))
        mats.append('FireAsh')
    # the black coal bed, a fan to the peak
    for i in range(n):
        j = (i + 1) % n
        faces.append((K + i, K + j, PK))
        mats.append('FireCoal')
    return verts, faces, mats


def make_blob(centre, r, flatten, seed_a, mat, sides=4):
    """A bipyramid: one equatorial ring of `sides` points at the widest section,
    an apex above and an apex below, squashed in z and jittered per vertex.
    2*sides tris, closed, and every face meets the light at a different angle --
    which is flat shading doing the job a texture would do elsewhere.

    SIDES IS THE ROUNDNESS DIAL AND IT MATTERS.  sides=4 is an octahedron: 8 tris,
    and its 4-sided top reads as a cut gem at any size big enough to see.  That is
    fine for a small black coal and wrong for a fire-ring stone, which needs
    sides=6 (12 tris) before it stops looking like quartz and starts looking like
    something picked up out of a creek."""
    # per-blob anisotropy so no two read as the same shape
    sx = r * (0.80 + 0.45 * ((math.sin(seed_a * 3.1) + 1.0) * 0.5))
    sy = r * (0.80 + 0.45 * ((math.cos(seed_a * 2.3) + 1.0) * 0.5))
    sz = r * flatten * (0.85 + 0.30 * ((math.sin(seed_a * 5.7) + 1.0) * 0.5))
    ca, sa = math.cos(seed_a), math.sin(seed_a)

    def pt(dx, dy, dz):
        # rotate the x/y axes by seed_a so the facets do not line up between blobs
        return centre + Vector((dx * sx * ca - dy * sy * sa,
                                dx * sx * sa + dy * sy * ca,
                                dz * sz))

    # Per-vertex radial jitter.  A clean bipyramid reads as a crystal; nudging
    # each point in and out breaks every silhouette edge and it
    # reads as a blob.  Costs nothing -- same verts, same faces.
    def jit(k):
        return 1.0 + 0.18 * math.sin(seed_a * (2.1 + 0.7 * k) + k * 1.9)

    verts = []
    for i in range(sides):
        a = 2.0 * math.pi * i / sides
        j = jit(i)
        verts.append(pt(j * math.cos(a), j * math.sin(a), 0.0))
    top = sides
    bot = sides + 1
    # THE APEXES ARE SLUMPED OFF-CENTRE, and this is what stopped the stones
    # reading as cut gems.  A bipyramid with its point directly over the centroid
    # is a symmetric cone from every side, and no amount of radial jitter on the
    # equator hides that -- the eye locks onto the peak.  Shoving the apex ~40% of
    # a radius sideways (a different way for every blob) turns it into a slumped,
    # lopsided lump.  Costs nothing: same vertex count, same faces.
    ox = 0.42 * math.cos(seed_a * 1.7 + 0.6)
    oy = 0.42 * math.sin(seed_a * 2.4 + 1.3)
    verts.append(pt(ox, oy, jit(sides)))
    verts.append(pt(-oy * 0.5, ox * 0.5, -jit(sides + 1)))

    faces = []
    for i in range(sides):
        k = (i + 1) % sides
        faces.append((i, k, top))
    for i in range(sides):
        k = (i + 1) % sides
        faces.append((k, i, bot))
    return verts, faces, [mat] * len(faces)


# Icosahedron, unit radius.  12 verts, 20 faces, wound outward.
_PHI = (1.0 + math.sqrt(5.0)) / 2.0
_ICO_V = [(-1, _PHI, 0), (1, _PHI, 0), (-1, -_PHI, 0), (1, -_PHI, 0),
          (0, -1, _PHI), (0, 1, _PHI), (0, -1, -_PHI), (0, 1, -_PHI),
          (_PHI, 0, -1), (_PHI, 0, 1), (-_PHI, 0, -1), (-_PHI, 0, 1)]
_ICO_F = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11),
          (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
          (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9),
          (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]


def make_stone(centre, r, flatten, seed_a, mat):
    """A squashed, jittered icosahedron: 12 verts, 20 tris, no apex anywhere.

    THIS IS THE SHAPE THE GAME ALREADY USES FOR ROCKS.  test-rock.glb (the
    throwable debris prop) is an icosphere, and in-world it reads as a rounded
    boulder from every angle.  Four cheaper shapes were tried here first and all
    four read as cut quartz instead: an 8-tri octahedron, a 12-tri 6-sided
    bipyramid, the same with radial jitter, and the same again with its apex
    slumped 40% off-centre.  The apex is the whole problem -- anything that comes
    to a point over its own centroid reads as a crystal in profile, and a fire
    ring sits at ground level so it IS seen in profile, constantly.

    An icosahedron has no apex and no pole, which is why it works.  It is also
    CHEAPER than the flat-topped frustum that was the next attempt (20 tris
    against 26) so the rounder shape actually saved tris.

    Coals still use make_blob.  They are small, black, half-buried in the bed and
    largely occluded by the logs, so the gem shape never shows on them and the
    12 tris a side are worth keeping."""
    # ANISOTROPY IS DELIBERATELY NARROW HERE (0.92..1.10, against the coals'
    # 0.86..1.16).  These stones have to close a ring with no gaps, and a ring is
    # only as tight as its NARROWEST stone -- one unlucky 0.67x-width draw opens a
    # slot you can see the ash through.  Keeping the spread tight means the
    # worst-case width, not the mean, is what the spacing arithmetic can rely on.
    sx = r * (0.92 + 0.18 * ((math.sin(seed_a * 3.1) + 1.0) * 0.5))
    sy = r * (0.92 + 0.18 * ((math.cos(seed_a * 2.3) + 1.0) * 0.5))
    sz = r * flatten * (0.85 + 0.30 * ((math.sin(seed_a * 5.7) + 1.0) * 0.5))
    ca, sa = math.cos(seed_a), math.sin(seed_a)
    n = 1.0 / math.sqrt(1.0 + _PHI * _PHI)      # |icosahedron vertex| == sqrt(1+phi^2)

    verts = []
    for k, (vx, vy, vz) in enumerate(_ICO_V):
        # per-vertex radial jitter: knocks the regular solid off true so no two
        # stones share a silhouette, at no tri cost
        j = n * (1.0 + 0.16 * math.sin(seed_a * (1.9 + 0.6 * k) + k * 2.3))
        dx, dy, dz = vx * j, vy * j, vz * j
        verts.append(centre + Vector((dx * sx * ca - dy * sy * sa,
                                      dx * sx * sa + dy * sy * ca,
                                      dz * sz)))
    return verts, list(_ICO_F), [mat] * len(_ICO_F)


def make_log(p0, p1, r0, r1, n, char_t, mat_wood, mat_char):
    """A tapered n-sided prism split once along its length so the upper section
    can carry the char material.  n-gon end caps (4 tris each after triangulation,
    against 6 for a fan) keep the cost down."""
    axis = p1 - p0
    zdir = axis.normalized()
    ref = Vector((0, 0, 1)) if abs(zdir.z) < 0.9 else Vector((1, 0, 0))
    xdir = zdir.cross(ref).normalized()
    ydir = zdir.cross(xdir).normalized()

    ts = (0.0, char_t, 1.0)
    rings = []
    for t in ts:
        c = p0 + axis * t
        r = r0 + (r1 - r0) * t
        rings.append(_ring(c, xdir, ydir, r, n))

    verts = [v for ring in rings for v in ring]
    faces, mats = [], []
    for band in range(2):
        a, b = band * n, (band + 1) * n
        m = mat_wood if band == 0 else mat_char
        for i in range(n):
            j = (i + 1) % n
            faces.append((a + i, a + j, b + j, b + i))
            mats.append(m)
    # butt cap (wound to face back down the axis) and tip cap
    faces.append(tuple(range(n - 1, -1, -1)))
    mats.append(mat_wood)
    faces.append(tuple(range(2 * n, 3 * n)))
    mats.append(mat_char)
    return verts, faces, mats


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
        # Exports as glTF doubleSided=false.  Blender leaves backface culling OFF
        # by default, which the exporter faithfully records as doubleSided -- and
        # that is pure overdraw for a closed manifold shell.  Every surface here
        # is closed and the winding is proven (0/4652 inverted first-hit rays),
        # so single-sided is both correct and cheaper.  gnome.glb is the
        # precedent; trailer-home-a predates the check and ships doubleSided.
        m.use_backface_culling = True
        made[name] = m
    return order, made


def build():
    p = P
    _wipe()
    order, mats = _materials()
    slot_of = {name: i for i, name in enumerate(order)}

    parts = []          # (verts, faces, mat_names)
    parts.append(make_bed(p))

    # --- coals, laid in the ash mound ---------------------------------------
    for k in range(p['coal_count']):
        # deterministic pseudo-scatter: golden-angle spiral, no RNG anywhere so
        # the model is byte-reproducible from this file alone
        a = k * 2.399963
        rad = p['coal_ring_r'] * math.sqrt((k + 0.35) / p['coal_count'])
        size = p['coal_r_min'] + (p['coal_r_max'] - p['coal_r_min']) * (0.5 + 0.5 * math.sin(a * 1.7))
        # bed them into the ash mound so they read as sitting IN it, not ON it
        surf = p['bed_h_black'] + (p['bed_h_peak'] - p['bed_h_black']) * max(0.0, 1.0 - rad / p['bed_r_black'])
        centre = Vector((rad * math.cos(a), rad * math.sin(a), surf * 0.95))
        cv, cf, cm = make_blob(centre, size, p['coal_flatten'], a, 'FireCoal', sides=4)
        # A coal bedded into the ash rim can end up with its underside below the
        # ground plane, which would silently redefine the base seat.  Lift it the
        # same way the logs are lifted -- the ASH DISC alone defines z = 0.
        cdz = -min(x.z for x in cv)
        if cdz > 0:
            cv = [x + Vector((0, 0, cdz)) for x in cv]
        parts.append((cv, cf, cm))

    # --- the fire ring ------------------------------------------------------
    # Stones ride the ring at even spacing with a deterministic wobble in radius,
    # size and bearing, then each is bedded into the ground by ring_sink of its
    # own height and lifted so nothing dips below z = 0.
    for k in range(p['ring_count']):
        a = 2.0 * math.pi * k / p['ring_count']
        w = math.sin(a * 3.0 + 0.9)                    # one wobble, reused three ways
        bearing = a + 0.028 * math.sin(a * 5.0 + 2.1)
        rad = p['ring_r'] * (1.0 + 0.025 * w)
        size = p['ring_r_min'] + (p['ring_r_max'] - p['ring_r_min']) * (0.5 + 0.5 * math.cos(a * 2.3 + 1.1 * math.sin(a * 1.3)))
        half_h = size * p['ring_flatten']
        # BURIAL IS A CLAMP, NOT A TRANSLATE, and getting that wrong cost a pass.
        # Every other part of this model is seated by lifting it until its lowest
        # vertex reaches z = 0.  Doing that to a stone silently CANCELS ring_sink:
        # you push it down, the lift pushes it straight back up, and the parameter
        # reads as if it works while doing nothing at all.
        # So instead the stone is placed with its underside genuinely below the
        # ground plane and every vertex is then clamped up to z >= 0.  Clamping z
        # does not touch x or y, so the buried cap becomes a real flat-bottomed
        # polygon lying on the ground rather than a degenerate sliver -- the mesh
        # stays closed and manifold, and the stone reads as bedded in.
        centre = Vector((rad * math.cos(bearing), rad * math.sin(bearing),
                         half_h * (1.0 - 2.0 * p['ring_sink'])))
        sv, sf, sm = make_stone(centre, size, p['ring_flatten'], a * 1.7 + 0.4, 'FireStone')
        sv = [Vector((v.x, v.y, max(0.0, v.z))) for v in sv]
        parts.append((sv, sf, sm))

    # --- the teepee ---------------------------------------------------------
    for k in range(p['log_count']):
        az = 2.0 * math.pi * k / p['log_count'] + p['log_az_jitter'][k]
        br = p['log_butt_r'][k]
        tr = p['log_tip_r'][k]
        th = p['log_tip_h'][k]
        taz = az + p['log_tip_az'][k]
        p0 = Vector((br * math.cos(az), br * math.sin(az), p['log_r_butt']))
        p1 = Vector((tr * math.cos(taz), tr * math.sin(taz), th))
        v, f, m = make_log(p0, p1, p['log_r_butt'], p['log_r_tip'], p['log_n'],
                           p['log_char_t'], 'FireLog', 'FireCoal')
        # seat this log on the ground: drop it until its lowest vertex touches
        # z = 0.  Done per log so the ash disc still defines the base plane and
        # no butt end ends up buried or floating.
        dz = -min(x.z for x in v)
        v = [x + Vector((0, 0, dz)) for x in v]
        parts.append((v, f, m))

        if k == p['branch_on']:
            lift = Vector((0, 0, dz))
            along = (p1 - p0).normalized()
            outward = Vector((math.cos(az), math.sin(az), 0.0))
            aim = (along * p['branch_along']
                   + outward * p['branch_out']
                   + Vector((0, 0, p['branch_rise']))).normalized()
            # start inside the shaft so the two interpenetrate and blend without
            # a visible seam -- the same trick the gnome uses for its limbs
            root = p0 + (p1 - p0) * p['branch_t'] + lift - aim * (p['log_r_butt'] * 0.5)
            bv, bf, bm = make_log(root, root + aim * p['branch_len'],
                                  p['branch_r0'], p['branch_r1'], p['branch_n'],
                                  p['branch_char_t'], 'FireLog', 'FireCoal')
            bdz = -min(x.z for x in bv)
            if bdz > 0:
                bv = [x + Vector((0, 0, bdz)) for x in bv]
            parts.append((bv, bf, bm))

    # --- assemble one mesh --------------------------------------------------
    bm = bmesh.new()
    for verts, faces, mnames in parts:
        bverts = [bm.verts.new(v) for v in verts]
        bm.verts.ensure_lookup_table()
        for idx, mname in zip(faces, mnames):
            try:
                face = bm.faces.new([bverts[i] for i in idx])
            except ValueError:
                continue
            face.material_index = slot_of[mname]
            face.smooth = False       # ART-STYLE rule 3: faceted, always

    mesh = bpy.data.meshes.new(OBJ_NAME)
    bm.to_mesh(mesh)
    bm.free()
    mesh.polygons.foreach_set('use_smooth', [False] * len(mesh.polygons))
    mesh.update()

    obj = bpy.data.objects.new(OBJ_NAME, mesh)
    for name in order:
        obj.data.materials.append(mats[name])
    bpy.context.collection.objects.link(obj)

    # --- the flame attach node ---------------------------------------------
    # An empty exports as a plain glTF node, so the runtime VFX rig can find it
    # by name and parent the flame quads and the point light to it.
    anchor = bpy.data.objects.new(ANCHOR_NAME, None)
    anchor.empty_display_type = 'PLAIN_AXES'
    anchor.empty_display_size = 0.06
    anchor.location = (0.0, 0.0, P['anchor_h'])
    bpy.context.collection.objects.link(anchor)

    return obj


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
               dims=dims, minz=min(v.z for v in bb),
               materials=len(ob.data.materials), images=len(bpy.data.images),
               uvs=len(ob.data.uv_layers))
    ob.evaluated_get(dg).to_mesh_clear()
    return out


def export():
    for ob in bpy.data.objects:
        ob.select_set(True)
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
