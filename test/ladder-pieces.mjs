// BUG-85 diagnostic (rainy-day, not a gate): the fixed north–south region ladder's connected PIECES.
//   node test/ladder-pieces.mjs <seed> [seed ...]
// Routes the whole ladder footprint around the world origin ONCE, then for R1, R1∪R2 and R1∪R2∪R3
// reports every piece of road that reaches 500 m inside the wall, roads CUT at the wall (owner
// ruling 2026-10-15: strict, 500 m). The biggest piece is the playable network; the rest are
// stranded (no POIs / destinations). Shapes are DESIGN.md's ratified ladder (2026-10-12): R3 the
// 1.5 km centre disc · R2 a 3.2 km-wide band 1.5–3.3 km out on the R1 side · R1 a 50° sector
// 3.3–5.1 km out at six o'clock. Six o'clock = +z (the 2D map draws +z downward, src/map2d.js _sy).
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { parseWorldSeed } from '../src/seed.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'

const INSET = 500, UX = 0, UZ = 1               // ladder axis: origin → R1, due south
const inR1 = (x, z) => { const r = Math.hypot(x, z); return r >= 3300 && r <= 5100 && (x * UX + z * UZ) / r >= Math.cos(25 * Math.PI / 180) }
const inR2 = (x, z) => { const r = Math.hypot(x, z); return r >= 1500 && r <= 3300 && x * UX + z * UZ >= 0 && Math.abs(x * UZ - z * UX) <= 1600 }
const inR3 = (x, z) => x * x + z * z <= 1500 * 1500
const SHAPES = { R1: (x, z) => inR1(x, z), R12: (x, z) => inR1(x, z) || inR2(x, z), R123: (x, z) => inR1(x, z) || inR2(x, z) || inR3(x, z) }
const RING = [...Array(16)].map((_, i) => [Math.cos(i * Math.PI / 8), Math.sin(i * Math.PI / 8)])

function pieces (runs, S) {
    const inCore = (x, z) => S(x, z) && RING.every(([c, s]) => S(x + c * INSET, z + s * INSET))
    const par = new Map(), f = (a) => { while (par.get(a) !== a) { par.set(a, par.get(par.get(a))); a = par.get(a) } return a }
    const add = (a) => { if (!par.has(a)) par.set(a, a) }
    const join = (a, b) => { add(a); add(b); const ra = f(a), rb = f(b); if (ra !== rb) par.set(ra, rb) }
    const segs = []                              // { id, km, core }
    for (const [k, e] of runs) {
        const pts = e.points, n = pts.length, ins = pts.map((p) => S(p.x, p.z))
        let i = 0, seg = 0
        while (i < n) {                          // each maximal in-area stretch is one piece of road
            if (!ins[i]) { i++; continue }
            let j = i; while (j + 1 < n && ins[j + 1]) j++
            const id = `${k}#${seg++}`; add(id)
            if (i === 0) join(id, e.cellA.join()); if (j === n - 1) join(id, e.cellB.join())
            let core = false
            for (let q = i; q <= j && !core; q++) core = inCore(pts[q].x, pts[q].z)
            segs.push({ id, km: (e.polyCum[j] - e.polyCum[i]) / 1000, core })
            i = j + 1
        }
    }
    const by = new Map()
    for (const s of segs) { const r = f(s.id), o = by.get(r) ?? { km: 0, core: false }; o.km += s.km; o.core ||= s.core; by.set(r, o) }
    return [...by.values()].filter((o) => o.core).map((o) => o.km).sort((a, b) => b - a)
}

for (const s of process.argv.slice(2)) {
    const t0 = Date.now(), road = new RoadSystem(parseWorldSeed(s), P)
    road.setRadius(5500); road.update(new THREE.Vector3(0, 0, 0))
    const runs = [...road._network].filter(([, e]) => e.cellA && e.cellB && e.points?.length > 1)
    const out = Object.entries(SHAPES).map(([name, S]) => {
        const km = pieces(runs, S), tot = km.reduce((a, b) => a + b, 0)
        const strand = tot ? (100 * (tot - (km[0] ?? 0)) / tot).toFixed(1) : '—'
        return `${name} pieces ${km.length} km ${km.map((v) => v.toFixed(1)).join('/')} stranded ${strand}%`
    })
    console.log(`seed ${s} (${Date.now() - t0} ms)  ` + out.join('  |  '))
}
