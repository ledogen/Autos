// test/scratch-bore-prevalence.mjs — rainy-day, NOT a gate.
// How often do the three bore hazards actually occur? Sweeps seeds and reports:
//   A. bore CYLINDERS overlapping (< 2R apart), split share-node vs parallel
//   B. portals inside the junction apron
//   C. node BURIAL — how far _v2NodeHeight sank a node below its own spot height
// USAGE: node test/scratch-bore-prevalence.mjs [nSeeds] [radius]
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'

const N = Number(process.argv[2] || 20)
const RADIUS = Number(process.argv[3] || 1400)
const R = P.tunnelBoreRadius ?? 8
const PAD = (P.roadJunctionBlendLength ?? 30) + 10

function segSegDist (p0, p1, q0, q1) {
    const ux=p1.x-p0.x, uy=p1.y-p0.y, uz=p1.z-p0.z
    const vx=q1.x-q0.x, vy=q1.y-q0.y, vz=q1.z-q0.z
    const wx=p0.x-q0.x, wy=p0.y-q0.y, wz=p0.z-q0.z
    const a=ux*ux+uy*uy+uz*uz, b=ux*vx+uy*vy+uz*vz, c=vx*vx+vy*vy+vz*vz
    const d=ux*wx+uy*wy+uz*wz, e=vx*wx+vy*wy+vz*wz
    const D=a*c-b*b; let s,t
    if (D<1e-9){s=0;t=(b>c?d/b:e/c)} else {s=(b*e-c*d)/D;t=(a*e-b*d)/D}
    s=Math.max(0,Math.min(1,s)); t=Math.max(0,Math.min(1,t))
    return Math.hypot(wx+s*ux-t*vx, wy+s*uy-t*vy, wz+s*uz-t*vz)
}
const shareNode = (a,b) => { const [,a1,a2]=a.split(':'), [,b1,b2]=b.split(':')
    return a1===b1||a1===b2||a2===b1||a2===b2 }

let totBores=0, totEdges=0, ovlShare=0, ovlPar=0, nearShare=0, nearPar=0
let portalInPad=0, portalAtNode=0
const burial=[], ovlRows=[], padRows=[]
for (let si=0; si<N; si++) {
    const seed = String(si)
    const road = new RoadSystem(seed, P)
    road.setRadius(RADIUS); road.update(new THREE.Vector3(0,0,0))
    totEdges += road._network.size
    const bores=[]
    for (const [runKey,e] of road._network) {
        // C. node burial, both ends of every edge
        for (const idx of [0, e.points.length-1]) {
            const p = e.points[idx]
            burial.push({ seed, d: road._coarseH(p.x,p.z) - p.y, x:p.x, z:p.z })
        }
        if (!e.tunnelSpans) continue
        const L = e.polyCum[e.points.length-1]
        for (const sp of e.tunnelSpans) {
            const pts=[]
            for (let s=sp.s0; s<=sp.s1+1e-6; s+=4) {
                const ss=Math.min(s,sp.s1); const q=road.runPointAt(runKey,ss)
                if (q) pts.push({x:q.x,z:q.z,y:road.runProfile(ss,runKey).gradeY})
            }
            if (pts.length<2) continue
            totBores++
            const dNode = Math.min(sp.s0, L-sp.s1)
            if (dNode < PAD) { portalInPad++; padRows.push({seed,runKey,dNode,len:sp.s1-sp.s0}) }
            if (dNode < 12) portalAtNode++
            bores.push({runKey,pts,s0:sp.s0,s1:sp.s1})
        }
    }
    for (let i=0;i<bores.length;i++) for (let j=i+1;j<bores.length;j++) {
        const A=bores[i],B=bores[j]; if (A.runKey===B.runKey) continue
        let best=Infinity, bp=null
        for (let a=1;a<A.pts.length;a++) for (let c=1;c<B.pts.length;c++) {
            const dd=segSegDist(A.pts[a-1],A.pts[a],B.pts[c-1],B.pts[c])
            if (dd<best){best=dd;bp=A.pts[a]}
        }
        const sh = shareNode(A.runKey,B.runKey)
        if (best < 2*R) { sh?ovlShare++:ovlPar++; ovlRows.push({seed,A:A.runKey,B:B.runKey,d:best,sh,p:bp}) }
        else if (best < 4*R) { sh?nearShare++:nearPar++ }
    }
    process.stderr.write(`seed ${seed} done\n`)
}
burial.sort((a,b)=>b.d-a.d)
console.log(`\n===== ${N} seeds, r=${RADIUS} m, boreR ${R} m, apron ${PAD} m =====`)
console.log(`edges ${totEdges}   bores ${totBores}`)
console.log(`\nA. bore-vs-bore`)
console.log(`   OVERLAPPING (< ${2*R} m): share-node ${ovlShare}   parallel ${ovlPar}`)
console.log(`   close      (< ${4*R} m): share-node ${nearShare}   parallel ${nearPar}`)
for (const r of ovlRows.sort((a,b)=>a.d-b.d).slice(0,20))
    console.log(`     seed ${r.seed.padStart(3)}  ${r.d.toFixed(1).padStart(5)} m  ${r.sh?'SHARE':'par  '}  ${r.A} x ${r.B}  at (${r.p.x.toFixed(0)}, ${r.p.z.toFixed(0)})`)
console.log(`\nB. portal inside the junction apron (< ${PAD} m of a node): ${portalInPad} / ${totBores}  (${(100*portalInPad/totBores).toFixed(0)}%)`)
console.log(`   portal essentially AT the node (< 12 m): ${portalAtNode}`)
for (const r of padRows.sort((a,b)=>a.dNode-b.dNode).slice(0,20))
    console.log(`     seed ${r.seed.padStart(3)}  ${r.dNode.toFixed(1).padStart(5)} m from node  len ${r.len.toFixed(0).padStart(4)} m  ${r.runKey}`)
console.log(`\nC. node burial (ground - deck at an edge endpoint), ${burial.length} endpoints`)
for (const t of [5,10,15,20,25,30]) console.log(`   > ${String(t).padStart(2)} m: ${burial.filter(b=>b.d>t).length}`)
for (const b of burial.slice(0,15)) console.log(`     seed ${b.seed.padStart(3)}  ${b.d.toFixed(1).padStart(6)} m  at (${b.x.toFixed(0)}, ${b.z.toFixed(0)})`)
