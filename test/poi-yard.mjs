// test/poi-yard.mjs — FEAT-71: lawn furniture / yard clutter around residence and farm POIs.
//
// FAST: no worldgen. A synthetic pad pool (real pad-record shape, random yaws) goes through the
// REAL PoiSystem._assignRoster, so what is gated is the shipped stamping path — model pick, seat,
// model origin, yard solve — not a re-implementation of it. Every geometric check below is
// recomputed here from the registry, independently of dressYard's own tests.
//
// Asserts: only yard classes are dressed (nothing on bare ground) · 3–6 props per yard · every
// prop wholly on the carved pad (rounded rectangle, padSd) · clear of the POI model's collision
// boxes · clear of every other prop · on the ROAD side of the model (owner, 2026-10-07: a yard
// behind the house is never seen) · deterministic in (seed, pad id) · every seated model still on
// its graded ground, never past the pad toward the road · and padSd's default branch is still the exact stadium the carve always used.

import fs from 'node:fs'
import { PoiSystem, POI_PARAMS, POI_ROSTER, YARD_POOLS, padKinds } from '../src/poi.js'
import { PROP_MODELS, modelsTagged } from '../data/prop-models.js'
import { padSd, PAD_RIM_HOLD } from '../src/road-carve.js'
import { mulberry32 } from '../src/seed.js'

let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
    if (!ok) fails++
}

const P = { ...POI_PARAMS }
let SEED = 0   // _pickStable reads the seed off the system, so build() sets it
const poi = new PoiSystem({ getParams: () => ({}), getSeed: () => SEED })

/**
 * 36 pads on a 6 x 6 grid 600 m apart, each at its own yaw, in the record shape _padsOnEdge emits —
 * 30 lay-bys plus `farmPads` of every bigger kind (padKinds: the barn's 22 x 11.2), each on an edge
 * of its own so nothing clashes. farmPads 0 is a region with no spot for a farm pad.
 */
function pool (seed, farmPads = 6) {
    const rnd = mulberry32(seed * 7919 + 1)
    const big = padKinds(P).filter(k => k.key !== 'std')
    const out = []
    for (let i = 0; i < 36; i++) {
        const th = rnd() * Math.PI * 2
        const tx = Math.cos(th), tz = Math.sin(th)
        const nx = tz, nz = -tx
        const kind = i >= 36 - farmPads ? big[i % big.length] : { key: 'std', halfLen: P.poiPadHalfLen, halfWid: P.poiPadHalfWid }
        out.push({
            id: `poi:e${i}@0`, edge: `e${i}`, s: 100, padKind: kind.key,
            x: (i % 6) * 600, z: Math.floor(i / 6) * 600, y: 100, tx, tz, nx, nz,
            yaw: Math.atan2(nx, nz), halfLen: kind.halfLen, halfWid: kind.halfWid,
            cornerR: P.poiPadCornerR, cut: 0,
        })
    }
    return out
}
const build = (seed, farmPads) => (SEED = seed, poi._assignRoster(pool(seed, farmPads), { x: 1500, z: 1500 }, seed, P))
const radius = key => { const c = PROP_MODELS[key].collision; return c.radius ?? Math.hypot(c.size[0], c.size[2]) * 0.5 }

// ── the pools ───────────────────────────────────────────────────────────────────────────────────
for (const tag of new Set(Object.values(YARD_POOLS))) {
    const keys = modelsTagged(tag)
    check(`pool '${tag}' has members, each with a collision footprint and a file on disk`,
        keys.length > 1 && keys.every(k => PROP_MODELS[k].collision?.size?.length === 3
            && fs.existsSync(new URL('../' + PROP_MODELS[k].url, import.meta.url))), keys.join(', '))
}
check('no satellite pool member is also a POI model (a flamingo is not a home)',
    [...new Set(Object.values(YARD_POOLS))].flatMap(modelsTagged).every(k => !PROP_MODELS[k].tags.includes('residence')))

// ── padSd: the default branch is still the old stadium, bit for bit ────────────────────────────
{
    const rnd = mulberry32(42)
    let same = true
    for (let i = 0; i < 2000 && same; i++) {
        const th = rnd() * 6.283, q = { tx: Math.cos(th), tz: Math.sin(th), halfLen: 2 + rnd() * 8, halfWid: 2 + rnd() * 5 }
        const dx = (rnd() * 2 - 1) * 15, dz = (rnd() * 2 - 1) * 15
        const a = Math.max(0, q.halfLen - q.halfWid)
        let t = dx * q.tx + dz * q.tz
        t = t < -a ? -a : t > a ? a : t
        same = padSd(q, dx, dz) === Math.hypot(dx - q.tx * t, dz - q.tz * t) - q.halfWid
    }
    check('padSd without cornerR is the exact pre-FEAT-71 stadium (camp pads, every other carve)', same)
    const q = { tx: 1, tz: 0, halfLen: 7, halfWid: 4, cornerR: 1.5 }
    check('a POI pad is a rounded rectangle: the corner region is pad, the corner itself is not',
        padSd(q, 6.0, 3.0) < 0 && padSd(q, 6.95, 3.95) > 0 && Math.abs(padSd(q, 7, 0)) < 1e-12 && Math.abs(padSd(q, 0, -4)) < 1e-12)
}

// ── the yards, over many seeds ──────────────────────────────────────────────────────────────────
// Which POIs SHOULD have a yard: a yard class standing on a model (or slot) that authors one. A farm
// on the broadside barn has none — the barn fills its pad (owner, 2026-10-08) — so it must be bare.
const yardOf = q => PROP_MODELS[q.modelKey]?.yard ?? POI_ROSTER.find(s => s.type === q.type)?.yard
const SEEDS = 150
let dressed = 0, props = 0
const hist = [0, 0, 0, 0, 0, 0, 0]
const bad = { bareGround: [], count: [], offPad: [], inModel: [], overlap: [], backYard: [], modelOffPad: [], modelRoadSide: [] }
const keysSeen = new Set()
const modelsSeen = new Set()

/** Every geometric check on one POI and its props. */
function checkYard (seed, q, sats) {
    dressed++; props += sats.length
    hist[Math.min(sats.length, 6)]++
    const [cMin, cMax] = PROP_MODELS[q.modelKey]?.yardCount ?? [3, 6]
    if (sats.length < cMin || sats.length > cMax) bad.count.push(`${seed}:${q.type}/${q.modelKey}=${sats.length}`)
    const cs = Math.cos(q.modelYaw), sn = Math.sin(q.modelYaw)
    const toModel = (x, z) => { const wx = x - q.modelX, wz = z - q.modelZ; return [cs * wx - sn * wz, sn * wx + cs * wz] }
    const boxes = solidsOf(q)
    for (const [i, s] of sats.entries()) {
        keysSeen.add(s.key)
        const r = radius(s.key)
        if (padSd(q, s.x - q.x, s.z - q.z) + r > 1e-9) bad.offPad.push(`${seed}:${s.key}`)
        const [mx, mz] = toModel(s.x, s.z)
        for (const b of boxes) {
            const ex = Math.max(Math.abs(mx - (b.c?.[0] ?? 0)) - b.s[0] * 0.5, 0)
            const ez = Math.max(Math.abs(mz - (b.c?.[2] ?? 0)) - b.s[2] * 0.5, 0)
            if (Math.hypot(ex, ez) < r) bad.inModel.push(`${seed}:${q.modelKey}/${s.key}`)
        }
        for (const o of sats.slice(i + 1)) {
            if (Math.hypot(s.x - o.x, s.z - o.z) < r + radius(o.key) - 1e-9) bad.overlap.push(`${seed}:${s.key}/${o.key}`)
        }
        // Road side of the model: nearer the road than the model's own origin (n points away).
        if ((s.x - q.modelX) * q.nx + (s.z - q.modelZ) * q.nz >= 0) bad.backYard.push(`${seed}:${q.modelKey}/${s.key}`)
        if (!Number.isInteger(s.variant) || !Number.isFinite(s.yaw)) bad.count.push(`${seed}:${s.key} variant/yaw`)
    }
}
const solidsOf = q => { const c = P.poiCubeSize; return q.collision?.boxes ?? [{ c: [0, 0, 0], s: q.collision?.size ?? [c, c, c] }] }

for (let seed = 1; seed <= SEEDS; seed++) {
    for (const q of build(seed)) {
        // The model itself, every corner of every collision box: on graded ground — inside the pad,
        // or past it by less than the carve's full-depth rim band (the broadside barn hangs 1.15 m
        // off the back) — and NEVER past the pad's road-side edge, toward the shoulder.
        modelsSeen.add(q.modelKey)
        const cs = Math.cos(q.modelYaw), sn = Math.sin(q.modelYaw)
        for (const b of solidsOf(q)) for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const lx = (b.c?.[0] ?? 0) + sx * b.s[0] * 0.5, lz = (b.c?.[2] ?? 0) + sz * b.s[2] * 0.5
            const dx = q.modelX + lx * cs + lz * sn - q.x, dz = q.modelZ - lx * sn + lz * cs - q.z
            if (padSd(q, dx, dz) > PAD_RIM_HOLD - 0.25) bad.modelOffPad.push(`${q.modelKey}`)
            if (dx * q.nx + dz * q.nz < -q.halfWid - 1e-9) bad.modelRoadSide.push(`${q.modelKey}`)
        }
        const sats = q.satellites
        if (!q.tags.some(t => YARD_POOLS[t]) || !yardOf(q)) {
            if (sats.length) bad.bareGround.push(`${seed}:${q.type}/${q.modelKey}`)
            continue
        }
        checkYard(seed, q, sats)
    }
}
console.log(`       ${dressed} yards over ${SEEDS} seeds, ${props} props (${(props / dressed).toFixed(2)} each); ` +
    `count histogram 0..6: ${hist.join(' ')}`)
const list = a => `${a.length}: ${a.slice(0, 6).join(', ')}`
check('every residence and every farm on its farm pad is dressed (10 a region), nothing without a yard is',
    dressed === SEEDS * 10 && bad.bareGround.length === 0, `${dressed} dressed; bare ${list(bad.bareGround)}`)
check('3–6 props per house yard, 5–9 per farm yard (the model\'s yardCount)', bad.count.length === 0, list(bad.count))
check('every prop stands wholly on the carved pad', bad.offPad.length === 0, list(bad.offPad))
check('no prop overlaps the POI model\'s collision boxes', bad.inModel.length === 0, list(bad.inModel))
check('no two props overlap', bad.overlap.length === 0, list(bad.overlap))
check('every prop is on the road side of its model', bad.backYard.length === 0, list(bad.backYard))
check('every POI model stands on graded ground (pad + the carve\'s rim band)', bad.modelOffPad.length === 0, list([...new Set(bad.modelOffPad)]))
check('…and none reaches past the pad toward the road', bad.modelRoadSide.length === 0, list([...new Set(bad.modelRoadSide)]))
check('the barn is on the board (the farm model)', modelsSeen.has('barn'))

// ── FEAT-105: farms take farm pads; a region without one falls back to the broadside barn ─────────
{
    let onBig = true, fallback = true, bare = true, full = true
    for (let seed = 1; seed <= 40; seed++) {
        const farms = build(seed).filter(q => q.type === 'farm')
        onBig &&= farms.length === 3 && farms.every(q => q.padKind === 'barn' && q.modelKey === 'barn')
        const none = build(seed, 0)
        const f0 = none.filter(q => q.type === 'farm')
        full &&= none.length === POI_ROSTER.reduce((n, s) => n + s.count, 0)
        fallback &&= f0.length === 3 && f0.every(q => q.padKind === 'std' && q.modelKey === 'barnBroadside')
        bare &&= f0.every(q => q.satellites.length === 0)
    }
    check('with farm pads in the pool, every farm stands on one, wearing the gable-to-road barn', onBig)
    check('with none, every farm falls back to a lay-by and the broadside barn — the roster stays full', fallback && full)
    check('…and a fallback barn has no yard, so no clutter', bare)
    const lay = build(3).filter(q => q.type !== 'farm')
    check('no other class ever takes a farm pad', lay.every(q => q.padKind === 'std'))
}
const allKeys = [...new Set(Object.values(YARD_POOLS))].flatMap(modelsTagged)
check('every pool member actually appears somewhere', allKeys.every(k => keysSeen.has(k)),
    allKeys.filter(k => !keysSeen.has(k)).join(', '))

// ── determinism ─────────────────────────────────────────────────────────────────────────────────
const snap = seed => JSON.stringify(build(seed).map(q => [q.id, q.satellites]))
check('same seed + same pads ⇒ the identical yard set (a re-stream rebuilds it exactly)', snap(7) === snap(7))
check('a different seed dresses differently', snap(7) !== snap(8))

if (fails) { console.log(`\n${fails} FAILED`); process.exit(1) }
console.log('\nall poi-yard checks passed')
