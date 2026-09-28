// test/scratch-deep-cut-census.mjs — rainy-day, NOT a gate.
// How much open cut sits deep enough to be a bore? For every non-bore stretch whose deck is more than
// BLO below ground: length, max depth, whether it abuts an existing bore span (the "extend the portal"
// post-pass would absorb it) or stands alone (only an optional-bore band in the search would catch
// it), and what boring it would save at V2_COSTS prices with the deck held fixed.
// Also reports what share of the router's search work falls in the (BLO, cutMax] band — the part of
// the state space an optional bore bit would double. Needs the instrumented router copy (INST=1 +
// a resolve hook); without it only the census runs.
// USAGE: node test/scratch-deep-cut-census.mjs [nSeeds] [radius] [BLO]
import * as THREE from 'three'
globalThis.__S = { pop: 0, popBand: 0, succ: 0, succBand: 0, dp: 0, dpOne: 0, dpBoth: 0 }
const N = Number(process.argv[2] || 20), RADIUS = Number(process.argv[3] || 1400)
globalThis.__BLO = Number(process.argv[4] || 10)
const BLO = globalThis.__BLO
const { RoadSystem } = await import('../src/road.js')
const { RANGER_PARAMS: P } = await import('../data/ranger.js')
const C = P.roadV2
const cutRate = d => 1 + C.cCutM * d + C.cCut2 * d * d
const DS = 2, ADJ = 12, BORE_GMAX = C.gMaxBore + 0.01

const stretches = []
let totRoad = 0, totBore = 0, nBores = 0, tBuild = 0
const portalDepth = []
for (let si = 0; si < N; si++) {
    const seed = String(si)
    const t0 = performance.now()
    const road = new RoadSystem(seed, P)
    road.setRadius(RADIUS); road.update(new THREE.Vector3(0, 0, 0))
    tBuild += performance.now() - t0
    for (const [runKey, e] of road._network) {
        const L = e.polyCum[e.points.length - 1]
        totRoad += L
        const spans = e.tunnelSpans || []
        for (const sp of spans) { totBore += sp.s1 - sp.s0; nBores++ }
        const inSpan = s => spans.some(sp => s >= sp.s0 && s <= sp.s1)
        const samp = []
        for (let s = 0; s <= L; s += DS) {
            const q = road.runPointAt(runKey, s); if (!q) continue
            const y = road.runProfile(s, runKey).gradeY
            samp.push({ s, d: road._coarseH(q.x, q.z) - y, y, bore: inSpan(s) })
        }
        for (const sp of spans) for (const s of [sp.s0, sp.s1]) {
            if (s < 1 || s > L - 1) continue
            const q = road.runPointAt(runKey, s); if (q) portalDepth.push(road._coarseH(q.x, q.z) - road.runProfile(s, runKey).gradeY)
        }
        let cur = null
        const close = () => {
            if (!cur) return
            const adj = spans.some(sp => Math.abs(sp.s0 - cur.s1) <= ADJ || Math.abs(sp.s1 - cur.s0) <= ADJ)
            cur.adj = adj
            cur.len = cur.s1 - cur.s0 + DS
            cur.save = cur.saveM - (adj ? 0 : 2 * C.cPortal)
            stretches.push(cur); cur = null
        }
        for (let i = 0; i < samp.length; i++) {
            const p = samp[i]
            if (!p.bore && p.d > BLO) {
                if (!cur) cur = { seed, runKey, s0: p.s, s1: p.s, dMax: 0, saveM: 0, gMax: 0 }
                cur.s1 = p.s; cur.dMax = Math.max(cur.dMax, p.d)
                cur.saveM += DS * (cutRate(p.d) - C.cBoreM)
                if (i > 0) cur.gMax = Math.max(cur.gMax, Math.abs(p.y - samp[i - 1].y) / DS)
            } else close()
        }
        close()
    }
    process.stderr.write(`seed ${seed}\n`)
}
const q = (a, f) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(f * b.length))] }
const sum = (a, f) => a.reduce((t, x) => t + f(x), 0)
console.log(`\n===== ${N} seeds, r=${RADIUS} m, band (${BLO}, ${C.cutMax}] m, cutMax ${C.cutMax} =====`)
console.log(`road ${(totRoad / 1000).toFixed(1)} km   bores ${nBores} (${(totBore / 1000).toFixed(2)} km)   build ${(tBuild / 1000).toFixed(1)} s total`)
console.log(`portal cover depth (ground - deck at the span end, non-node): p10 ${q(portalDepth, .1).toFixed(1)}  median ${q(portalDepth, .5).toFixed(1)}  p90 ${q(portalDepth, .9).toFixed(1)} m  (n=${portalDepth.length})`)
for (const [lab, set] of [['ABUTS a bore (post-pass absorbs)', stretches.filter(s => s.adj)], ['STANDALONE (band only)', stretches.filter(s => !s.adj)]]) {
    const long = set.filter(s => s.len >= 30)
    const pays = set.filter(s => s.save > 0)
    const payable = pays.filter(s => s.gMax <= BORE_GMAX)
    console.log(`\n${lab}: ${set.length} stretches, ${(sum(set, s => s.len) / 1000).toFixed(2)} km of cut deeper than ${BLO} m`)
    console.log(`   >= 30 m long: ${long.length}   max depth p50 ${set.length ? q(set.map(s => s.dMax), .5).toFixed(1) : '-'} / max ${set.length ? Math.max(...set.map(s => s.dMax)).toFixed(1) : '-'} m`)
    console.log(`   boring is CHEAPER (deck held): ${pays.length} (${(sum(pays, s => s.len) / 1000).toFixed(2)} km), of which within the 18% bore cap: ${payable.length} (${(sum(payable, s => s.len) / 1000).toFixed(2)} km)`)
    console.log(`   saving if bored: ${sum(pays, s => s.save).toFixed(0)} cost units`)
    for (const s of pays.sort((a, b) => b.len - a.len).slice(0, 8))
        console.log(`     seed ${s.seed.padStart(2)} ${s.runKey.padEnd(24)} len ${s.len.toFixed(0).padStart(4)} m  maxDepth ${s.dMax.toFixed(1).padStart(5)} m  save ${s.save.toFixed(0).padStart(6)}  gMax ${(100 * s.gMax).toFixed(0)}%`)
}
const S = globalThis.__S
if (S.pop) {
    console.log(`\n--- search work in the band (INST) ---`)
    console.log(`corridor A*: pops ${S.pop}  in band ${(100 * S.popBand / S.pop).toFixed(1)}%   successors ${S.succ}  in band ${(100 * S.succBand / S.succ).toFixed(1)}%`)
    console.log(`profile DP: transitions ${S.dp}  one end in band ${(100 * S.dpOne / S.dp).toFixed(1)}%  both ${(100 * S.dpBoth / S.dp).toFixed(1)}%   => bore-bit DP work x${((S.dp + S.dpOne + 3 * S.dpBoth) / S.dp).toFixed(2)}`)
    console.log(`time: corridorSearch ${(S.t_corridorSearch / 1000).toFixed(1)} s  profileSolve ${(S.t_profileSolve / 1000).toFixed(1)} s  profileSolveBundle ${((S.t_profileSolveBundle || 0) / 1000).toFixed(1)} s  of build ${(tBuild / 1000).toFixed(1)} s`)
}
