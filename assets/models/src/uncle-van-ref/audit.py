"""audit.py — numeric audit of the generator's van (no screenshot can make these checks).

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python uncle-van-ref/audit.py

1. WINDING by ray cast: rays from a sphere around the van and from inside the cargo bay; the FIRST
   face each ray hits must face the ray (dot(n, dir) < 0).  Counts visible inverted faces.
2. Z-FIGHTING: same-facing coplanar triangles (planes < 1 mm apart) of DIFFERENT materials whose
   areas still overlap after each is shrunk 3 mm.  Butted seams touch; only area overlap fights.
3. FLOATING: every island (connected piece) must lie within 2 mm of another island or the ground.
4. GROUND: lowest point at z = 0 (base-seated)."""
import importlib.util
import math
import os
import random
import sys
from collections import defaultdict
import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def load_generator():
    spec = importlib.util.spec_from_file_location("uncle_van", os.path.join(ROOT, "uncle-van.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def world_tris(obs):
    """[(a, b, c, normal, material, object)] in world space."""
    out = []
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in obs:
        me = ob.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        mw = ob.matrix_world
        for t in me.loop_triangles:
            a, b, c = (mw @ me.vertices[i].co for i in t.vertices)
            n = (b - a).cross(c - a)
            if n.length < 1e-12:
                continue
            mat = me.materials[t.material_index].name if me.materials else "-"
            out.append((a, b, c, n.normalized(), mat, ob.name))
        ob.evaluated_get(dg).to_mesh_clear()
    return out


def check_winding(tris, n_rays=40000, seed=1):
    verts = [v for t in tris for v in t[:3]]
    polys = [(3 * i, 3 * i + 1, 3 * i + 2) for i in range(len(tris))]
    bvh = BVHTree.FromPolygons(verts, polys)
    rng = random.Random(seed)
    lo = Vector([min(v[i] for v in verts) for i in range(3)])
    hi = Vector([max(v[i] for v in verts) for i in range(3)])
    ctr, rad = (lo + hi) / 2, (hi - lo).length
    bad = defaultdict(int)
    global where
    where = []
    hits = 0
    sources = [("outside", None)] * n_rays + [("cargo", Vector((0.0, -1.2, 1.25)))] * (n_rays // 4)
    for kind, o in sources:
        d = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized()
        if kind == "outside":
            target = Vector((rng.uniform(lo.x, hi.x), rng.uniform(lo.y, hi.y), rng.uniform(lo.z, hi.z)))
            o, d = ctr + d * rad, (target - (ctr + d * rad)).normalized()
        loc, n, idx, dist = bvh.ray_cast(o, d)
        if idx is None:
            continue
        hits += 1
        if tris[idx][3].dot(d) > 0:
            bad[(tris[idx][5], tris[idx][4])] += 1
            t = tris[idx]
            where.append((t[5], t[4], tuple(round(c, 3) for c in (t[0] + t[1] + t[2]) / 3),
                          tuple(round(c, 2) for c in t[3]), round(t[3].dot(d), 3)))
    return hits, bad


def shrink(tri, d):
    a, b, c = tri
    la, lb, lc = (b - c).length, (c - a).length, (a - b).length
    p = la + lb + lc
    inc = (a * la + b * lb + c * lc) / p
    area = (b - a).cross(c - a).length / 2
    r = 2 * area / p
    if r <= d:
        return None
    k = (r - d) / r
    return [inc + (v - inc) * k for v in tri]


def clip_area(P, Q, n):
    """Area of the intersection of two coplanar triangles (convex clip, Sutherland-Hodgman)."""
    u = (P[1] - P[0]).normalized()
    w = n.cross(u)
    to2 = lambda v: (v.dot(u), v.dot(w))
    poly = [to2(v) for v in P]
    clip = [to2(v) for v in Q]
    if sum((clip[i][0] * clip[(i + 1) % 3][1] - clip[(i + 1) % 3][0] * clip[i][1]) for i in range(3)) < 0:
        clip.reverse()
    for i in range(3):
        a, b = clip[i], clip[(i + 1) % 3]
        inside = lambda q: (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) >= 0
        out = []
        for j in range(len(poly)):
            cur, prv = poly[j], poly[j - 1]
            if inside(cur):
                if not inside(prv):
                    out.append(isect(prv, cur, a, b))
                out.append(cur)
            elif inside(prv):
                out.append(isect(prv, cur, a, b))
        poly = out
        if not poly:
            return 0.0
    return abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
                   for i in range(len(poly)))) / 2


def isect(p, q, a, b):
    x1, y1, x2, y2, x3, y3, x4, y4 = *p, *q, *a, *b
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(den) < 1e-15:
        return q
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
    return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))


def check_zfight(tris, gap=0.001, shrink_by=0.003):
    buckets = defaultdict(list)
    for i, t in enumerate(tris):
        n = t[3]
        key = (round(n.x, 2), round(n.y, 2), round(n.z, 2), round(n.dot(t[0]) / gap))
        buckets[key].append(i)
    out = []
    seen = set()
    for key, idx in buckets.items():
        cand = list(idx)
        for dk in (-1, 1):
            cand += buckets.get(key[:3] + (key[3] + dk,), [])
        for i in idx:
            ti = tris[i]
            si = shrink(ti[:3], shrink_by)
            if si is None:
                continue
            for j in cand:
                if j <= i or (i, j) in seen:
                    continue
                tj = tris[j]
                if tj[4] == ti[4] or ti[3].dot(tj[3]) < 0.999 or abs(ti[3].dot(tj[0] - ti[0])) > gap:
                    continue
                seen.add((i, j))
                sj = shrink(tj[:3], shrink_by)
                if sj is None:
                    continue
                a = clip_area(si, sj, ti[3])
                if a > 1e-6:
                    out.append((ti[5], ti[4], tj[5], tj[4], a, (ti[0] + ti[1] + ti[2]) / 3))
    return out


def islands(tris, tol=1e-5):
    """Connected pieces of the merged triangle soup (vertices welded at tol)."""
    key = lambda v: (round(v.x / tol), round(v.y / tol), round(v.z / tol))
    parent = list(range(len(tris)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    owner = {}
    for i, t in enumerate(tris):
        for v in t[:3]:
            k = key(v)
            if k in owner:
                a, b = find(i), find(owner[k])
                if a != b:
                    parent[a] = b
            else:
                owner[k] = i
    groups = defaultdict(list)
    for i in range(len(tris)):
        groups[find(i)].append(i)
    return list(groups.values())


def check_floating(tris, groups, tol=0.002):
    out = []
    for g in groups:
        gs = set(g)
        others = [t for i, t in enumerate(tris) if i not in gs]
        verts = [v for t in others for v in t[:3]]
        bvh = BVHTree.FromPolygons(verts, [(3 * i, 3 * i + 1, 3 * i + 2) for i in range(len(others))])
        best = min(tris[i][k].z for i in g for k in range(3))     # distance to the ground plane
        mine = [v for i in g for v in tris[i][:3]]
        own = BVHTree.FromPolygons(mine, [(3 * k, 3 * k + 1, 3 * k + 2) for k in range(len(g))])
        if own.overlap(bvh):
            continue                                 # passes through something: mounted, not floating
        for i in g:
            for k in range(3):
                hit = bvh.find_nearest(tris[i][k])
                if hit[0] is not None:
                    best = min(best, hit[3])
        if best > tol:
            c = sum((tris[i][0] for i in g), Vector()) / len(g)
            out.append((tris[g[0]][5], len(g), best, c))
    return out


def main():
    gen = load_generator()
    obs = gen.build()
    tris = world_tris(obs)
    print(f"AUDIT  {len(tris)} triangles, {len(obs)} objects")
    zmin = min(v.z for t in tris for v in t[:3])
    print(f"  ground: lowest point z = {zmin:+.4f} m  {'clean' if abs(zmin) < 1e-4 else 'NOT SEATED'}")
    hits, bad = check_winding(tris)
    nbad = sum(bad.values())
    print(f"  winding: {hits} ray hits, {nbad} on a back face  {'clean' if not nbad else ''}")
    for (o, m), n in sorted(bad.items(), key=lambda kv: -kv[1])[:12]:
        print(f"     inverted: {o}/{m}: {n}")
    for w in where[:12]:
        print(f"       at {w}")
    zf = check_zfight(tris)
    print(f"  z-fighting: {len(zf)} overlapping coplanar pairs  {'clean' if not zf else ''}")
    for oa, ma, ob, mb, a, c in zf[:15]:
        print(f"     {oa}/{ma} vs {ob}/{mb}: {a * 1e4:.1f} cm2 at ({c.x:+.3f}, {c.y:+.3f}, {c.z:.3f})")
    groups = islands(tris)
    fl = check_floating(tris, groups)
    print(f"  floating: {len(groups)} islands, {len(fl)} more than 2 mm from anything  {'clean' if not fl else ''}")
    for o, n, d, c in fl[:15]:
        print(f"     {o} ({n} tris) {d * 1000:.1f} mm away at ({c.x:+.3f}, {c.y:+.3f}, {c.z:.3f})")


main()
