// scratch: population + feasibility survey of deg-2 kink nodes.
// For each: plan deflection, VERTICAL deflection (the thing that launches you), leg lengths,
// and the pullback a single tangent arc would need at various radii.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const seeds = (process.argv[2] ?? '6,0,3,42').split(',').map(Number)
const R = Number(process.argv[3] ?? 1200)
const p = RANGER_PARAMS
const rows = []
for (const seed of seeds) {
    const road = new RoadSystem(seed, p)
    for (const c of [[0,0],[R,0],[0,R],[-R,0],[0,-R],[0,0]]) road.update(new THREE.Vector3(c[0],0,c[1]))
    if (road._nodeJunctionsRev !== road._networkRev) road._detectNodeJunctions()
    let deg2 = 0, allNodes = 0
    for (const n of road._nodeJunctions.values()) {
        allNodes++
        if (n.legs.length !== 2) continue
        deg2++
        const L = []
        for (const leg of n.legs) {
            const e = road._network.get(leg.runKey); if (!e) { L.push(null); continue }
            const len = e.polyCum.at(-1)
            const atStart = leg.arc < len / 2
            const s = leg.arc
            const pr = road.runProfile(s, leg.runKey)
            // outgoing direction = away from the node
            const sgn = atStart ? +1 : -1
            const ox = sgn * pr.tx, oz = sgn * pr.tz
            // grade measured walking AWAY from the node
            const g = sgn * (road.runProfile(s + sgn*8, leg.runKey).gradeY - road.runProfile(s, leg.runKey).gradeY) / 8
            L.push({ len, avail: atStart ? len - s : s, ox, oz, g, key: leg.runKey })
        }
        if (!L[0] || !L[1]) continue
        const dot = Math.max(-1, Math.min(1, L[0].ox*L[1].ox + L[0].oz*L[1].oz))
        const between = Math.acos(dot)                 // angle between the two OUTGOING dirs
        const deflect = Math.PI - between              // 0 = straight through, large = sharp kink
        // vertical: walking A→node→B, grade goes from (−gA) to (+gB). The break is their sum.
        const vBreak = L[0].g + L[1].g
        rows.push({ seed, pos: `${n.pos.x.toFixed(0)},${n.pos.z.toFixed(0)}`,
            defDeg: deflect*180/Math.PI, vBreak,
            availA: L[0].avail, availB: L[1].avail,
            t15: 15*Math.tan(Math.min(deflect,3.0)/2), t35: 35*Math.tan(Math.min(deflect,3.0)/2), t75: 75*Math.tan(Math.min(deflect,3.0)/2) })
    }
    console.log(`seed ${seed}: ${road._network.size} runs, ${allNodes} nodes, ${deg2} deg-2`)
}
rows.sort((a,b)=>b.defDeg-a.defDeg)
console.log('\nseed  position        plan-defl   vert-break   avail A / B      pullback needed @R=15 / 35 / 75    fits?')
for (const r of rows) {
    const cap = 0.45   // the existing mouth cap: min(..., len*0.45)
    const fit = (t) => (t <= r.availA*cap && t <= r.availB*cap) ? 'y' : 'n'
    console.log(`${String(r.seed).padStart(4)}  ${r.pos.padEnd(14)} ${r.defDeg.toFixed(1).padStart(7)}°  ${(r.vBreak*100).toFixed(1).padStart(8)}%  ${r.availA.toFixed(0).padStart(5)} /${r.availB.toFixed(0).padStart(5)}   ${r.t15.toFixed(1).padStart(7)} ${r.t35.toFixed(1).padStart(7)} ${r.t75.toFixed(1).padStart(7)}      ${fit(r.t15)}${fit(r.t35)}${fit(r.t75)}`)
}
const q=(a,f)=>{const b=a.map(f).sort((x,y)=>x-y);return{med:b[b.length>>1],max:b.at(-1)}}
console.log(`\nplan deflection: median ${q(rows,r=>r.defDeg).med.toFixed(1)}°  max ${q(rows,r=>r.defDeg).max.toFixed(1)}°`)
console.log(`|vertical break|: median ${(q(rows,r=>Math.abs(r.vBreak)).med*100).toFixed(1)}%  max ${(q(rows,r=>Math.abs(r.vBreak)).max*100).toFixed(1)}%`)
