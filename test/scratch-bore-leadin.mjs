// test/scratch-bore-leadin.mjs — rainy-day: how far inside a portal does the deck take to settle to
// bore grade? The class boundary and the profile's station grid are in different arc domains (the
// spliced-run clip shifts spans off the station grid), so the first stations inside a span can still
// carry the surface-road approach grade. This measures that transition band so a grace rule can be
// sized from data instead of guessed.
// USAGE: node test/scratch-bore-leadin.mjs [cutMax] [seed ...]
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'

if (process.argv[2]) P.roadV2.cutMax = Number(process.argv[2])
const SEEDS = process.argv.slice(3).length ? process.argv.slice(3) : ['6', '11', '3', '7', '20', '1']
const rows = []
for (const seed of SEEDS) {
    const road = new RoadSystem(seed, P)
    road.setRadius(1400)
    road.update(new THREE.Vector3(0, 0, 0))
    for (const [runKey, e] of road._network) {
        if (!e.tunnelSpans) continue
        const L = e.polyCum[e.points.length - 1]
        const allow = 0.5 / (2 * (L / Math.max(2, Math.round(L / 10))))
        const capBore = P.roadV2.gMaxBore + allow
        for (const sp of e.tunnelSpans) {
            const len = sp.s1 - sp.s0
            // Samples fully inside the span, in arc order.
            const S = []
            for (let i = 1; i < e.points.length; i++) {
                if (e.polyCum[i - 1] < sp.s0 || e.polyCum[i] > sp.s1) continue
                const d = e.polyCum[i] - e.polyCum[i - 1]
                if (d > 1e-6) S.push({ s0: e.polyCum[i - 1], s1: e.polyCum[i], g: Math.abs(e.points[i].y - e.points[i - 1].y) / d })
            }
            if (S.length < 3) continue
            // Lead-in: distance from s0 past which NO sample (to mid-span) exceeds capBore.
            let lead = 0
            for (let k = 0; k < S.length && S[k].s0 < sp.s0 + len / 2; k++) if (S[k].g > capBore) lead = S[k].s1 - sp.s0
            let tail = 0
            for (let k = S.length - 1; k >= 0 && S[k].s1 > sp.s1 - len / 2; k--) if (S[k].g > capBore) tail = sp.s1 - S[k].s0
            const worstMid = S.filter(x => x.s0 >= sp.s0 + lead && x.s1 <= sp.s1 - tail).reduce((m, x) => Math.max(m, x.g), 0)
            rows.push({ seed, len, lead, tail, worstMid, capBore, runKey })
        }
    }
}
const bad = rows.filter(r => r.lead > 0 || r.tail > 0)
console.log(`cutMax=${P.roadV2.cutMax}  ${rows.length} bores over ${SEEDS.length} seeds; ${bad.length} need any grace at all\n`)
console.log('  len(m)   lead-in(m)  tail(m)   lead as % of len   worst INTERIOR grade   cap')
for (const r of bad.sort((a, b) => Math.max(b.lead, b.tail) - Math.max(a.lead, a.tail))) {
    const pct = 100 * Math.max(r.lead, r.tail) / r.len
    console.log(`  ${r.len.toFixed(0).padStart(6)}   ${r.lead.toFixed(1).padStart(8)}  ${r.tail.toFixed(1).padStart(7)}   ${pct.toFixed(1).padStart(14)} %   ${(r.worstMid*100).toFixed(1).padStart(16)} %   ${(r.capBore*100).toFixed(1)} %  seed ${r.seed}`)
}
const maxLead = Math.max(0, ...bad.map(r => Math.max(r.lead, r.tail)))
const maxPct = Math.max(0, ...bad.map(r => 100 * Math.max(r.lead, r.tail) / r.len))
console.log(`\n  worst grace needed: ${maxLead.toFixed(1)} m  (${maxPct.toFixed(1)} % of its span)`)
console.log(`  worst INTERIOR grade once graced: ${(100 * Math.max(0, ...rows.map(r => r.worstMid))).toFixed(1)} %`)
