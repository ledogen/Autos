// RAINY-DAY (FEAT-299, DEC-437): what a camping area IS, measured over many random story regions.
// Not a gate (not in gates.mjs): each region routes ~15 s, so the routing is paid ONCE into a cache.
//
//   node test/camp-area-census.mjs --dump --n=400 --part=0/2    route regions, write wip/feat-299/cache/<seed>.json
//   node test/camp-area-census.mjs --missing                    the seeds not in the cache yet, one a line
//   node test/camp-area-census.mjs --report                     read the cache: today's discs vs camp.js now
//   node test/camp-area-census.mjs --sheet                      wip/feat-299/sheet.html: the first 6 seeds, before | after
//
//   --only=<seed>   dump that one seed (a driver loop runs each seed under its own hard time cap)
//   --camp=<path>   the camp.js module the dump records zones with (default ../src/camp.js)
// --dump records the zones of the camp.js it runs with: the cache in wip/ is the disc code before FEAT-299
// (7692391b's src/camp.js, passed with --camp), so its `grid` / `all` ARE "today".
//
// The cache holds, per seed: the region centre (spawnDecision, as story entry), the planners' graph (main piece,
// inside the wall: the roads camping grows over), each road's polyline + arc + bores, and the camp zones the code
// of the DUMP made (`grid` from build, `all` after fillReach). --report then measures two things off it:
//   TODAY (the `all` discs of the dump): per zone, the road inside the disc split into PIECES — stretches joined
//          along the road and through junctions (the map's casing rule: a segment counts when both ends are in).
//   NOW   (camp.js as checked out, run on the cached graph through a stand-in road): per area, its pieces and road.
// Seeds are random (a fixed draw, so a re-run measures the same 400); seed 6 is never one of them.
import fs from 'node:fs'
import path from 'node:path'
import { hash32, mulberry32 } from '../src/seed.js'
import { CampSystem } from '../src/camp.js'

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1]
const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '../wip/feat-299/cache')
const N = +(arg('n') ?? 400)
const rnd = mulberry32(hash32('feat-299 census'))
const SEEDS = Array.from({ length: N }, () => Math.floor(rnd() * 4294967296)).filter((s) => s !== 6)


async function dump () {
    const THREE = await import('three')
    const { RoadSystem } = await import('../src/road.js')
    const { RANGER_PARAMS: P } = await import('../data/ranger.js')
    const { validateArea, discArea } = await import('../src/world-validate.js')
    const { REGION_MARGIN } = await import('../src/mission.js')
    const { REGION_RADIUS_M, REGION_WARM_RADIUS_M } = await import('../src/story.js')
    const { spawnDecision } = await import('./lib/spawn-decision.mjs')
    const { wirePondNoGo } = await import('./lib/pond-no-go.mjs')
    const { CampSystem: Camp } = await import(arg('camp') ?? '../src/camp.js')
    const [part, parts] = (arg('part') ?? '0/1').split('/').map(Number)
    fs.mkdirSync(DIR, { recursive: true })
    for (let i = part; i < SEEDS.length; i += parts) {
        if (arg('only') && String(SEEDS[i]) !== arg('only')) continue
        const seed = SEEDS[i], file = path.join(DIR, `${seed}.json`)
        if (fs.existsSync(file)) continue
        const t0 = Date.now()
        try {
            const sp = spawnDecision(seed, P), C = { x: sp.x, z: sp.z }
            const road = new RoadSystem(seed, P)
            wirePondNoGo(road, seed, P)
            road.setRadius(REGION_WARM_RADIUS_M)
            road.update(new THREE.Vector3(C.x, 0, C.z))
            const rep = validateArea(road, C, discArea(REGION_RADIUS_M, REGION_MARGIN), P)
            const wall = REGION_RADIUS_M - REGION_MARGIN
            const inWall = (p) => Math.hypot(p.x - C.x, p.z - C.z) <= wall
            const g = road.networkGraph(), nodes = {}, edges = [], runs = {}
            for (const [a, b, runKey] of g.edges) {
                if (!rep.mainNodes.has(g.key(a)) || !rep.mainNodes.has(g.key(b)) || !inWall(g.pos(a)) || !inWall(g.pos(b))) continue
                for (const id of [a, b]) nodes[g.key(id)] = [+g.pos(id).x.toFixed(2), +g.pos(id).z.toFixed(2)]
                const e = road._network.get(runKey)
                edges.push([g.key(a), g.key(b), runKey])
                runs[runKey] = { p: e.points.flatMap((q) => [+q.x.toFixed(2), +q.z.toFixed(2)]),
                    c: Array.from(e.polyCum, (s) => +s.toFixed(3)), t: (e.tunnelSpans ?? []).map((t) => [t.s0, t.s1]) }
            }
            const camp = new Camp({ getSeed: () => seed, getParams: () => ({}), getRoad: () => road })
            const grid = [...camp.build(C, REGION_RADIUS_M)]
            const all = [...camp.fillReach(rep.mainNodes, inWall)]
            fs.writeFileSync(file, JSON.stringify({ seed, C, nodes, edges, runs, grid, all }))
            console.log(`${i} seed ${seed}: ${edges.length} roads, ${all.length} zones, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
        } catch (err) {
            console.log(`${i} seed ${seed}: THREW ${err?.stack?.split('\n').slice(0, 2).join(' ')}`)
        }
    }
}

/** The cached region as the slice of RoadSystem camp.js reads: networkGraph() and _network. */
export function standInRoad (d) {
    const _network = new Map()
    for (const [k, r] of Object.entries(d.runs)) {
        const points = []
        for (let i = 0; i < r.p.length; i += 2) points.push({ x: r.p[i], z: r.p[i + 1] })
        _network.set(k, { points, polyCum: r.c, tunnelSpans: r.t.map(([s0, s1]) => ({ s0, s1 })) })
    }
    const graph = { edges: d.edges.map(([a, b, k]) => [a, b, k]), key: (id) => id, pos: (id) => ({ x: d.nodes[id][0], z: d.nodes[id][1] }) }
    return { _network, networkGraph: () => graph }
}

/** Pieces of a set of road stretches `[{ka, kb, L, s0, s1}]` joined through shared ends and junctions. */
function pieces (raw) {
    // One road's stretches from several zones: canonical orientation, overlaps merged.
    const by = new Map()
    for (const s of raw) {
        const f = s.ka < s.kb, k = f ? s.ka + '|' + s.kb : s.kb + '|' + s.ka
        if (!by.has(k)) by.set(k, { ka: f ? s.ka : s.kb, kb: f ? s.kb : s.ka, L: s.L, iv: [] })
        by.get(k).iv.push(f ? [s.s0, s.s1] : [s.L - s.s1, s.L - s.s0])
    }
    const spans = []
    for (const r of by.values()) {
        let cur = null
        for (const [a, b] of r.iv.sort((p, q) => p[0] - q[0])) {
            if (cur && a <= cur.s1) cur.s1 = Math.max(cur.s1, b)
            else spans.push(cur = { ka: r.ka, kb: r.kb, L: r.L, s0: a, s1: b })
        }
    }
    const par = spans.map((_, i) => i), find = (i) => (par[i] === i ? i : (par[i] = find(par[i])))
    const at = new Map()   // node key → span indices touching it
    const touch = (k, i) => { if (!at.has(k)) at.set(k, []); at.get(k).push(i) }
    spans.forEach((s, i) => { if (s.s0 <= 1e-3) touch(s.ka, i); if (s.s1 >= s.L - 1e-3) touch(s.kb, i) })
    for (const ids of at.values()) for (const j of ids) par[find(j)] = find(ids[0])
    const len = new Map()
    spans.forEach((s, i) => len.set(find(i), (len.get(find(i)) ?? 0) + s.s1 - s.s0))
    return [...len.values()].sort((a, b) => b - a)
}

/** TODAY's zone on the cached graph: the in-disc stretches of every road (both segment ends in the disc). */
function discSpans (d, q) {
    const out = []
    for (const [ka, kb, k] of d.edges) {
        const { p, c } = d.runs[k], L = c[c.length - 1]
        // orient a → b like camp.js (first point on node a)
        const [ax, az] = d.nodes[ka], fwd = Math.hypot(p[0] - ax, p[1] - az) <= Math.hypot(p.at(-2) - ax, p.at(-1) - az)
        const inD = (i) => (p[2 * i] - q.x) ** 2 + (p[2 * i + 1] - q.z) ** 2 <= q.r * q.r
        let s0 = null
        for (let i = 1; i <= c.length; i++) {
            const seg = i < c.length && inD(i - 1) && inD(i)
            if (seg && s0 === null) s0 = c[i - 1]
            if (!seg && s0 !== null) {
                const s1 = c[i - 1]
                out.push(fwd ? { ka, kb, L, s0, s1, k, r0: s0, r1: s1 } : { ka: kb, kb: ka, L, s0: L - s1, s1: L - s0, k, r0: s0, r1: s1 })
                s0 = null
            }
        }
    }
    return out
}

/** Metres of road in the union of `spans` (several zones may cover one stretch). */
function union (spans) {
    const by = new Map()
    for (const s of spans) { const k = s.ka < s.kb ? s.ka + '|' + s.kb : s.kb + '|' + s.ka, f = s.ka < s.kb
        if (!by.has(k)) by.set(k, []); by.get(k).push(f ? [s.s0, s.s1] : [s.L - s.s1, s.L - s.s0]) }
    let m = 0
    for (const iv of by.values()) {
        let end = -Infinity
        for (const [a, b] of iv.sort((p, q) => p[0] - q[0])) { if (b > end) { m += b - Math.max(a, end); end = b } }
    }
    return m
}

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN }
const dist = (xs) => `median ${pct(xs, 0.5).toFixed(0)} · p10 ${pct(xs, 0.1).toFixed(0)} · p90 ${pct(xs, 0.9).toFixed(0)} · mean ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(0)}`
const hist = (xs) => { const h = {}; for (const x of xs) h[x >= 6 ? '6+' : x] = (h[x >= 6 ? '6+' : x] ?? 0) + 1; return JSON.stringify(h) }

function report () {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))
    const today = { seen: [], share: [], n: 0, multi: 0, pc: [], len: [], gridLen: [], fillLen: [], none: 0, regionsMulti: 0, perRegion: [] }
    const now = { bored: 0, seen: [], share: [], n: 0, multi: 0, pc: [], len: [], target: [], perRegion: [], overlap: 0, reach: [] }
    for (const f of files) {
        const d = JSON.parse(fs.readFileSync(path.join(DIR, f)))
        let rm = false
        for (const q of d.all) {
            const pcs = pieces(discSpans(d, q)), L = pcs.reduce((a, b) => a + b, 0)
            if (!pcs.length) { today.none++; continue }
            today.n++; today.pc.push(pcs.length); today.len.push(L); (q.fill ? today.fillLen : today.gridLen).push(L)
            if (pcs.length > 1) { today.multi++; rm = true }
        }
        today.perRegion.push(d.all.length)
        if (rm) today.regionsMulti++
        // NOW: camp.js as checked out, on the same graph.
        const runOf = new Map(d.edges.flatMap(([x, y, k]) => [[x + '|' + y, k], [y + '|' + x, k]]))
        const road = standInRoad(d)
        const camp = new CampSystem({ getSeed: () => d.seed, getParams: () => ({}), getRoad: () => road })
        camp.build(d.C, 2500)
        const areas = camp.growAreas(new Set(Object.keys(d.nodes)), () => true)
        now.perRegion.push(areas.length)
        for (const a of areas) {
            if (!a.spans) continue   // camp.js still on discs: nothing to report for NOW
            const pcs = pieces(a.spans.map((s) => ({ ...s, L: s.L })))
            now.n++; now.pc.push(pcs.length); now.len.push(pcs.reduce((x, y) => x + y, 0)); now.target.push(a.L)
            if (pcs.length > 1) now.multi++
            if (a.spans.some((sp) => d.runs[runOf.get(sp.ka + '|' + sp.kb)].t.some(([t0, t1]) => t0 < sp.s1 && sp.s0 < t1))) now.bored++
        }
        const seen = new Map()
        let shared = false
        for (const a of areas) for (const s of a.spans ?? []) {
            const k = s.ka + '|' + s.kb, prev = seen.get(k) ?? []
            if (prev.some((p) => p.a !== a && p.s0 < s.s1 && s.s0 < p.s1)) shared = true
            prev.push({ a, s0: s.s0, s1: s.s1 }); seen.set(k, prev)
        }
        if (shared) now.overlap++
        // The share of the region's road inside any zone, today vs now.
        const roadM = d.edges.reduce((t, [, , k]) => t + d.runs[k].c.at(-1), 0)
        // What the map shows: every zone's road together, in pieces (overlapping or touching zones read as one).
        today.seen.push(...pieces(d.all.flatMap((q) => discSpans(d, q))))
        if (areas[0]?.spans) now.seen.push(...pieces(areas.flatMap((a) => a.spans)))
        today.share.push(union(d.all.flatMap((q) => discSpans(d, q))) / roadM)
        if (areas[0]?.spans) now.share.push(union(areas.flatMap((a) => a.spans)) / roadM)
    }
    console.log(`${files.length} regions (random seeds)`)
    console.log(`TODAY (circle ∩ roads): ${today.n} zones on road (${today.none} touch none of the planners' roads), ${today.perRegion.reduce((a, b) => a + b, 0) / files.length} zones a region`)
    console.log(`  in more than one piece: ${today.multi} = ${(100 * today.multi / today.n).toFixed(1)} %; regions with at least one broken zone: ${today.regionsMulti} = ${(100 * today.regionsMulti / files.length).toFixed(0)} %`)
    console.log(`  pieces per zone: ${hist(today.pc)}`)
    console.log(`  road in a zone, m: ${dist(today.len)}`)
    console.log(`  share of the region's road in a zone: ${dist(today.share.map((x) => 100 * x))} %`)
    console.log(`  as the map shows them (all zones together, joined where they touch): ${(today.seen.length / files.length).toFixed(1)} pieces a region, ${dist(today.seen)} m`)
    console.log(`    grid zones: ${dist(today.gridLen)} (n ${today.gridLen.length}) · fill zones: ${dist(today.fillLen)} (n ${today.fillLen.length})`)
    if (!now.n) return console.log('NOW: camp.js has no road runs yet')
    console.log(`NOW (camp.js): ${now.n} areas, ${now.perRegion.reduce((a, b) => a + b, 0) / files.length} a region`)
    console.log(`  in more than one piece: ${now.multi}; pieces per area: ${hist(now.pc)}`)
    console.log(`  road in an area, m: ${dist(now.len)}`)
    console.log(`  areas with a tunnel inside (a gap in the map's casing): ${now.bored} = ${(100 * now.bored / now.n).toFixed(0)} %`)
    console.log(`  target, m: ${dist(now.target)}`)
    console.log(`  share of the region's road in a zone: ${dist(now.share.map((x) => 100 * x))} %`)
    console.log(`  as the map shows them: ${(now.seen.length / files.length).toFixed(1)} pieces a region, ${dist(now.seen)} m`)
    console.log(`  regions where two areas share road: ${now.overlap} = ${(100 * now.overlap / files.length).toFixed(0)} %`)
}

/** Today's zones and camp.js's areas on one cached region. */
function both (d) {
    const before = d.all.map((q) => { const sp = discSpans(d, q), pcs = pieces(sp); return { q, sp, n: pcs.length, len: pcs.reduce((a, b) => a + b, 0) } })
    const road = standInRoad(d)
    const camp = new CampSystem({ getSeed: () => d.seed, getParams: () => ({}), getRoad: () => road })
    camp.build(d.C, 2500)
    return { before, after: camp.growAreas(new Set(Object.keys(d.nodes)), () => true) }
}

function sheet () {
    const COL = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#9a6324', '#469990', '#808000', '#000075', '#bfef45']
    const W = 620, R = 2600, files = SEEDS.slice(0, 6).filter((sd) => fs.existsSync(path.join(DIR, `${sd}.json`)))
    const rows = files.map((sd) => {
        const d = JSON.parse(fs.readFileSync(path.join(DIR, `${sd}.json`))), { before, after } = both(d)
        const X = (x) => ((x - d.C.x + R) / (2 * R) * W).toFixed(1), Z = (z) => ((z - d.C.z + R) / (2 * R) * W).toFixed(1)
        const poly = (pts, st) => `<polyline fill="none" ${st} points="${pts.map((p) => X(p.x) + ',' + Z(p.z)).join(' ')}"/>`
        const pts = (k, a = 0, b = Infinity) => { const { p, c } = d.runs[k], o = []; for (let i = 0; i < c.length; i++) if (c[i] >= a - 1e-6 && c[i] <= b + 1e-6) o.push({ x: p[2 * i], z: p[2 * i + 1] }); return o }
        const roads = d.edges.map(([, , k]) => poly(pts(k), 'stroke="#9a9a9a" stroke-width="1.6"')).join('')
        // Bores as the map draws them: lighter, so a gap in a zone's colour there reads as the tunnel it is.
        const bores = d.edges.flatMap(([, , k]) => d.runs[k].t.map(([a, b]) => poly(pts(k, a, b), 'stroke="#fff" stroke-width="7" stroke-opacity="0.9"')
            + poly(pts(k, a, b), 'stroke="#9a9a9a" stroke-width="1.6" stroke-dasharray="4 3"'))).join('')
        const ring = `<circle cx="${X(d.C.x)}" cy="${Z(d.C.z)}" r="${(2500 / (2 * R) * W).toFixed(1)}" fill="none" stroke="#333" stroke-dasharray="6 4"/>`
        const label = (x, z, t, c) => `<text x="${X(x)}" y="${Z(z)}" fill="${c}" stroke="#fff" stroke-width="3" paint-order="stroke" font="bold 13px monospace" font-size="13" font-weight="bold" font-family="monospace" text-anchor="middle">${t}</text>`
        let b = '', bl = '', a = '', al = ''
        before.forEach((z, i) => {
            const c = COL[i % COL.length]
            b += `<circle cx="${X(z.q.x)}" cy="${Z(z.q.z)}" r="${(z.q.r / (2 * R) * W).toFixed(1)}" fill="${c}" fill-opacity="0.06" stroke="${c}" stroke-width="1" stroke-dasharray="3 3"/>`
            b += z.sp.map((s) => poly(pts(s.k, s.r0, s.r1), `stroke="${c}" stroke-width="5" stroke-linecap="round"`)).join('')
            bl += label(z.q.x, z.q.z, z.n ? `${z.n > 1 ? z.n + ' pieces · ' : ''}${z.len.toFixed(0)} m` : 'no road', c)
        })
        after.forEach((q, i) => {
            const c = COL[i % COL.length]
            a += q.lines.map((l) => poly(l, `stroke="${c}" stroke-width="5" stroke-linecap="round"`)).join('')
            al += label(q.x, q.z - 30, `${q.len.toFixed(0)} m`, c)
        })
        const nb = before.filter((z) => z.n > 1).length, med = (xs) => pct(xs, 0.5).toFixed(0)
        const tile = (title, body) => `<div class="t"><div class="h">${title}</div><svg width="${W}" height="${W}">${ring}${roads}${body}${bores}</svg></div>`
        return `<div class="row">${tile(`seed ${sd} · BEFORE: circle ∩ roads · ${before.length} zones, ${nb} in more than one piece · median ${med(before.filter((z) => z.n).map((z) => z.len))} m`, b + bl)}`
            + `${tile(`seed ${sd} · AFTER: one run of road · ${after.length} areas, all one piece · median ${med(after.map((q) => q.len))} m`, a + al)}</div>`
    })
    const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fff;font:14px monospace}.row{display:flex}.t{margin:6px}.h{padding:4px 6px;background:#222;color:#fff;font-size:13px}svg{background:#f4f1e8}</style>`
        + `<div class="h" style="margin:6px;font-size:15px">FEAT-299 camping areas · 6 random seeds (the census's first 6) · grey: the planners' roads · dashed ring: the region wall · one colour per zone · dashed circle: today's disc · white with a dashed line: a tunnel (no camping inside, so no colour) · label: pieces, road in the zone</div>${rows.join('')}`
    fs.writeFileSync(path.join(DIR, '../sheet.html'), html)
    console.log(`wrote ${path.join(DIR, '../sheet.html')} (${rows.length} rows)`)
}

if (process.argv.includes('--missing')) console.log(SEEDS.filter((sd) => !fs.existsSync(path.join(DIR, `${sd}.json`))).join('\n'))
else if (process.argv.includes('--dump')) await dump()
else if (process.argv.includes('--sheet')) sheet()
else report()
