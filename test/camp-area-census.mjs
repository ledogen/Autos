// RAINY-DAY (FEAT-299, DEC-437): what a camping area IS, measured over many random story regions.
// Not a gate (not in gates.mjs): each region routes ~15 s, so the routing is paid ONCE into a cache.
//
//   node test/camp-area-census.mjs --dump --n=400 --part=0/2    route regions, write wip/feat-299/cache/<seed>.json
//   node test/camp-area-census.mjs --report                     read the cache: today's discs vs camp.js now
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

if (process.argv.includes('--dump')) await dump()
else report()

async function dump () {
    const THREE = await import('three')
    const { RoadSystem } = await import('../src/road.js')
    const { RANGER_PARAMS: P } = await import('../data/ranger.js')
    const { validateArea, discArea } = await import('../src/world-validate.js')
    const { REGION_MARGIN } = await import('../src/mission.js')
    const { REGION_RADIUS_M, REGION_WARM_RADIUS_M } = await import('../src/story.js')
    const { spawnDecision } = await import('./lib/spawn-decision.mjs')
    const { wirePondNoGo } = await import('./lib/pond-no-go.mjs')
    const [part, parts] = (arg('part') ?? '0/1').split('/').map(Number)
    fs.mkdirSync(DIR, { recursive: true })
    for (let i = part; i < SEEDS.length; i += parts) {
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
            const camp = new CampSystem({ getSeed: () => seed, getParams: () => ({}), getRoad: () => road })
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
function pieces (spans) {
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
                out.push(fwd ? { ka, kb, L, s0, s1 } : { ka: kb, kb: ka, L, s0: L - s1, s1: L - s0 })
                s0 = null
            }
        }
    }
    return out
}

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN }
const dist = (xs) => `median ${pct(xs, 0.5).toFixed(0)} · p10 ${pct(xs, 0.1).toFixed(0)} · p90 ${pct(xs, 0.9).toFixed(0)} · mean ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(0)}`
const hist = (xs) => { const h = {}; for (const x of xs) h[x >= 6 ? '6+' : x] = (h[x >= 6 ? '6+' : x] ?? 0) + 1; return JSON.stringify(h) }

function report () {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))
    const today = { n: 0, multi: 0, pc: [], len: [], gridLen: [], fillLen: [], none: 0, regionsMulti: 0, perRegion: [] }
    const now = { n: 0, multi: 0, pc: [], len: [], target: [], perRegion: [], overlap: 0, reach: [] }
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
        const road = standInRoad(d)
        const camp = new CampSystem({ getSeed: () => d.seed, getParams: () => ({}), getRoad: () => road })
        camp.build(d.C, 2500)
        const areas = camp.fillReach(new Set(Object.keys(d.nodes)), () => true)
        now.perRegion.push(areas.length)
        for (const a of areas) {
            if (!a.spans) continue   // camp.js still on discs: nothing to report for NOW
            const pcs = pieces(a.spans.map((s) => ({ ...s, L: s.L })))
            now.n++; now.pc.push(pcs.length); now.len.push(pcs.reduce((x, y) => x + y, 0)); now.target.push(a.L)
            if (pcs.length > 1) now.multi++
        }
        const seen = new Map()
        for (const a of areas) for (const s of a.spans ?? []) {
            const k = s.ka + '|' + s.kb, prev = seen.get(k) ?? []
            if (prev.some((p) => p.a !== a && p.s0 < s.s1 && s.s0 < p.s1)) { now.overlap++; break }
            prev.push({ a, s0: s.s0, s1: s.s1 }); seen.set(k, prev)
        }
    }
    console.log(`${files.length} regions (random seeds)`)
    console.log(`TODAY (circle ∩ roads): ${today.n} zones on road (${today.none} touch none of the planners' roads), ${today.perRegion.reduce((a, b) => a + b, 0) / files.length} zones a region`)
    console.log(`  in more than one piece: ${today.multi} = ${(100 * today.multi / today.n).toFixed(1)} %; regions with at least one broken zone: ${today.regionsMulti} = ${(100 * today.regionsMulti / files.length).toFixed(0)} %`)
    console.log(`  pieces per zone: ${hist(today.pc)}`)
    console.log(`  road in a zone, m: ${dist(today.len)}`)
    console.log(`    grid zones: ${dist(today.gridLen)} (n ${today.gridLen.length}) · fill zones: ${dist(today.fillLen)} (n ${today.fillLen.length})`)
    if (!now.n) return console.log('NOW: camp.js has no road runs yet')
    console.log(`NOW (camp.js): ${now.n} areas, ${now.perRegion.reduce((a, b) => a + b, 0) / files.length} a region`)
    console.log(`  in more than one piece: ${now.multi}; pieces per area: ${hist(now.pc)}`)
    console.log(`  road in an area, m: ${dist(now.len)}`)
    console.log(`  target, m: ${dist(now.target)}`)
    console.log(`  regions where two areas share road: ${now.overlap}`)
}
