/**
 * src/demolition.js — FEAT-65: where a demolition job's targets stand (owner, 2026-11-01).
 *
 * A demolition job is an ordinary roadside job whose LAST siteM OF ROUTE is the site: its targets
 * stand on the shoulder there, off the deck. It does NOT settle on arrival (slice 2, owner 2026-11-03):
 * it settles when the last target falls, so the player can turn back for a missed one, and the GPS
 * goes to the nearest one standing (nearestTarget / guideTo). The letter is the share smashed (economy.js RANK_TABLE.demolition). main.js stands each target as a
 * plain model far from the truck and, within onM, as a debris body put to SLEEP at once — a sleeping
 * body cannot slide off a sloped shoulder and costs nothing, and the truck touching it wakes it:
 * "static until the truck collides with them" (owner).
 *
 * PURE and headless: the placement is a function of (seed, offer, planned route) — SM-INV-12 — so a
 * gate pins it (test/demolition-site.mjs) and a resumed job re-places the same targets. No engine,
 * no THREE.
 */

import { PROP_MODELS } from '../data/prop-models.js'
import { djb2, mulberry32 } from './seed.js'

export const DEMOLITION_PARAMS = {
    siteM: 1000,         // m of road before the job's end the targets stand along (owner: "approximately one kilometer")
    shoulderOff: 1.25,   // m past the deck edge: the middle of the 2.5 m shoulder (data/ranger.js roadShoulderWidth)
    nodeClearM: 30,      // m along the route from a junction (degree ≥ 3): its mouth, and the crossing road's own shoulder
    maxSlope: 0.5,       // rise / run across a target's footprint; steeper reads as falling down the embankment
    maxDeckDy: 1.0,      // m between the ground and the deck — past it this is a bridge, a causeway or a cut, not a shoulder
    minGapM: 1.0,        // m clear between two targets' footprints
    tries: 12,           // draws per target before it is dropped (the site comes out short; scoring uses what stood)
    smashMoveM: 0.3,     // m a body has moved from where it stood …
    smashTiltRad: 25 * Math.PI / 180,   // … or how far it has tilted: either is smashed. A graze that only wakes it is not.
    onM: 120,            // m from the truck at which a target's model becomes a sleeping body (FEAT-154's rows)
    offM: 200,           // …and back (hysteresis); a smashed target is simply gone
    // The site window (owner 2026-11-05, option b: "reset the timer on every object hit so the timer runs out
    // faster once you start hitting them"): the first smash starts it, every smash refills it, and when it
    // runs out the job settles with what is smashed. Seconds of the job's clock [DEFAULT].
    // 40 s: the widest gap between two targets on the gated seeds is 341 m — 23 s at 54 km/h, 34 s at 36.
    hitWindowS: 40,
}

/**
 * The target kinds. `model` is the static stand-in's data/prop-models.js key. A row with a mass is
 * not a DEBRIS_TYPES kind: main.js hands it to debris.js load(kind, spec) on first use, so a cold boot
 * never fetches a sign it may not need. barrel and roadBarrier are DEBRIS_TYPES already.
 * Masses: the drums are ASSET-30's 18 kg empty; a road sign is a 4x4 timber post (~10 kg) and its
 * aluminium blank (~3 kg); a turn-back board (ASSET-77) is 12 mm ply (~3.9 kg) on two 2x2 stakes (~1.9 kg).
 */
const SIGN = { massKg: 13, friction: 0.6, restitution: 0.1 }
const BOARD = { massKg: 6, friction: 0.6, restitution: 0.1 }
export const TARGET_TYPES = {
    barrel:        { model: 'drumClosed' },
    roadBarrier:   { model: 'roadBarrier' },
    drumOpen:      { model: 'drumOpen', massKg: 18, friction: 0.5, restitution: 0.3 },
    smallCrate:    { model: 'smallCrate', massKg: 18, friction: 0.6, restitution: 0.1 },
    signGrade:     { model: 'signGrade', ...SIGN },
    signCurves:    { model: 'signCurves', ...SIGN },
    signRockslide: { model: 'signRockslide', ...SIGN },
    signTee:       { model: 'signTee', ...SIGN },
    signCross:     { model: 'signCross', ...SIGN },
    signStop:      { model: 'signStop', ...SIGN },
    signIcy:       { model: 'signIcy', ...SIGN },
    turnBackSign:        { model: 'turnBackSign', ...BOARD },
    turnBackSignKeepOut: { model: 'turnBackSignKeepOut', ...BOARD },
    turnBackSignBeware:  { model: 'turnBackSignBeware', ...BOARD },
    turnBackSignNoEntry: { model: 'turnBackSignNoEntry', ...BOARD },
}

/** Footprint radius [m] of a kind on the ground: half its collision box's diagonal in plan. */
function footR (kind) {
    const s = PROP_MODELS[TARGET_TYPES[kind].model].collision.size
    return Math.hypot(s[0], s[2]) / 2
}

/**
 * The route walked BACKWARDS from its end: at(u) is the centreline point u metres before the end and
 * the travel direction there; `junctions` are the u of every node of degree ≥ 3 the route passes.
 * `route.segments` carry the road's own centreline over [s0, s1] (mission.js), exact on a curve —
 * the 25 m map polyline is not.
 */
function walkBack (route) {
    const segs = route.segments, spans = []
    let u = 0
    const junctions = []
    for (let i = segs.length - 1; i >= 0; i--) {
        const g = segs[i], len = Math.abs(g.s1 - g.s0)
        // A segment's END is a node of degree endDeg — except the route's last, which ends mid-edge.
        if (i < segs.length - 1 && g.endDeg >= 3) junctions.push(u)
        spans.push({ g, u0: u, u1: u + len })
        u += len
    }
    const at = (uu) => {
        const sp = spans.find(x => uu <= x.u1) ?? spans[spans.length - 1]
        const dir = sp.g.s1 >= sp.g.s0 ? 1 : -1
        const s = sp.g.s1 - dir * (uu - sp.u0)
        const p = sp.g.centerline.pointAt(s), t = sp.g.centerline.tangentAt(s)
        const tl = Math.hypot(t.x, t.z) || 1
        return { x: p.x, z: p.z, tx: dir * t.x / tl, tz: dir * t.z / tl }
    }
    return { at, junctions, length: u }
}

/**
 * The site's targets: [{ kind, x, y, z, yaw, u }], y the ground under the target's lowest footprint point
 * (it stands upright — a post is planted plumb), yaw in the model convention (−Z → (−sin, −cos)), u the
 * metres of route before its end (siteGuide reads it).
 *
 * `dressing` is a THINGS / REQUISITION row's `targets`: groups of
 *   { kinds, n: [lo, hi], cluster: [lo, hi], side?: 'right', face?: 'traffic' | 'road' }
 * placed group by group, each on its own stream. `side: 'right'` stands every target on the travel-
 * right shoulder (a sign line faces the traffic it warns); otherwise a side per cluster. `face:
 * 'traffic'` turns the model's −Z (a sign's face) back down the road at the oncoming truck; 'road'
 * lays the model's X along the road with −Z toward the deck (a 3 m barricade fits the shoulder only
 * lengthwise); none is a random yaw.
 *
 * @param {object} route   the planned mission (segments, from mission.js)
 * @param {object[]} dressing
 * @param {string} key     e.g. `demo:${seed}:${offerId}`
 * @param {{ road, height: (x,z)=>number, isWater: (x,z)=>boolean, halfWidth: number }} world
 */
export function siteTargets (route, dressing, key, { road, height, isWater, halfWidth }) {
    const D = DEMOLITION_PARAMS
    if (!route?.segments?.length || !dressing?.length) return []
    const { at, junctions, length } = walkBack(route)
    const siteM = Math.min(D.siteM, length - D.nodeClearM)   // never into the giver's own pad
    const out = []
    dressing.forEach((grp, gi) => {
        const r = mulberry32(djb2(`${key}:g${gi}`))
        const n = grp.n[0] + Math.floor(r() * (grp.n[1] - grp.n[0] + 1))
        const sizes = []
        for (let left = n; left > 0;) {
            const c = Math.min(left, grp.cluster[0] + Math.floor(r() * (grp.cluster[1] - grp.cluster[0] + 1)))
            sizes.push(c); left -= c
        }
        sizes.forEach((size, ci) => {
            // Clusters spread evenly down the site, each jittered within its own share of it.
            const uc = siteM * (ci + 0.2 + 0.6 * r()) / sizes.length
            const side = grp.side === 'right' ? 1 : r() < 0.5 ? 1 : -1
            for (let k = 0; k < size; k++) {
                const kind = grp.kinds[Math.floor(r() * grp.kinds.length)]
                const yawRoll = r(), fr = footR(kind)
                for (let t = 0; t < D.tries; t++) {
                    // Members a footprint and a gap apart along the road; a retry steps 6 m further out,
                    // alternating either side of the spot.
                    const u = uc + k * (2 * fr + D.minGapM) + (t ? (t % 2 ? 1 : -1) * Math.ceil(t / 2) * 6 : 0)
                    if (u < 2 || u > siteM || junctions.some(j => Math.abs(u - j) < D.nodeClearM)) continue
                    const c = at(u)
                    const rx = -c.tz, rz = c.tx                   // travel-right, in plan
                    const off = side * (halfWidth + D.shoulderOff)
                    const x = c.x + rx * off, z = c.z + rz * off
                    // Another road nearer than its own is a crossing deck or a junction mouth. (sampleRoadTopY
                    // can't tell: it answers across the whole carve footprint, shoulder included.)
                    const nr = road.queryNearest(x, z, halfWidth + D.shoulderOff)
                    if ((nr && Math.hypot(nr.point.x - x, nr.point.z - z) < halfWidth + D.shoulderOff - 0.25) || isWater(x, z)) continue
                    const deck = road.sampleRoadTopY(c.x, c.z)
                    const hs = [height(x, z), height(x + c.tx * fr, z + c.tz * fr), height(x - c.tx * fr, z - c.tz * fr),
                                height(x + rx * fr, z + rz * fr), height(x - rx * fr, z - rz * fr)]
                    const lo = Math.min(...hs), hi = Math.max(...hs)
                    if ((hi - lo) / (2 * fr) > D.maxSlope || deck == null || Math.abs(hs[0] - deck) > D.maxDeckDy) continue
                    if (out.some(o => Math.hypot(o.x - x, o.z - z) < o.r + fr + D.minGapM)) continue
                    const yaw = grp.face === 'traffic' ? Math.atan2(c.tx, c.tz)
                        : grp.face === 'road' ? Math.atan2(-c.tz, c.tx) + (side > 0 ? 0 : Math.PI)
                        : yawRoll * 2 * Math.PI
                    out.push({ kind, x, y: lo, z, yaw, u, r: fr })
                    break
                }
            }
        })
    })
    return out.map(({ r: _, ...t }) => t)
}

/**
 * Slice 2 (owner, 2026-11-03: "too easy to miss targets, gps should always route to the nearest one"):
 * the target still standing that is nearest the truck ALONG THE ROAD — back the way it came for one it
 * missed. `standing` lists the indices not yet smashed; `togo` is mission.routeRemaining(), the truck's
 * own u while it is still short of the site — so a route that loops past the site cannot pull the guide
 * onto it early. Returns { i, back, dist } (back: the target is behind the truck; dist: metres to it along
 * the road), or null.
 */
export function nearestTarget (route, x, z, standing, togo) {
    if (!standing.length) return null
    const { at, length } = walkBack(route)
    const U = Math.min(length, DEMOLITION_PARAMS.siteM)
    let uT = togo, bd = Infinity
    // On the site the truck's own u is the nearest centreline point, every 2 m. It clamps at both ends,
    // so a truck past the route's end reads 0 — every target behind it.
    if (togo < U + 100) for (let u = 0; u <= U; u += 2) {
        const c = at(u), d = (c.x - x) ** 2 + (c.z - z) ** 2
        if (d < bd) { bd = d; uT = u }
    }
    let i = standing[0]
    for (const k of standing) if (Math.abs(route.targets[k].u - uT) < Math.abs(route.targets[i].u - uT)) i = k
    return { i, back: route.targets[i].u > uT, dist: Math.abs(route.targets[i].u - uT) }
}

/**
 * The GPS route (gps.js reads only `segments`) to the point u metres before the route's end: the route
 * up to it, or, `back`, the route from its end walked back to it. A segment with s1 < s0 is driven
 * backwards (mission.js), and one driven backwards ends at the node it started from — the previous
 * segment's end, whose degree gps.js reads for its junction arrows.
 */
export function guideTo (route, u, back) {
    const segs = route.segments, rev = []
    for (let i = segs.length - 1, u0 = 0; i >= 0; i--) {
        const g = segs[i], len = Math.abs(g.s1 - g.s0), s = g.s1 - Math.sign(g.s1 - g.s0) * (u - u0)
        if (u <= u0 + len || i === 0) return { segments: back ? [...rev, { ...g, s0: g.s1, s1: s }] : [...segs.slice(0, i), { ...g, s1: s }] }
        rev.push({ ...g, s0: g.s1, s1: g.s0, endDeg: segs[i - 1].endDeg })
        u0 += len
    }
}
