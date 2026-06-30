import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
const seed = Number(process.env.SEED ?? 6)
const cx = Number(process.env.CX ?? 4500), cz = Number(process.env.CZ ?? 600)
const P = { ...RANGER_PARAMS, roadNetworkMode:'graph' }
const build = (R) => { const r=new RoadSystem(seed,P); r.setRadius(R); r.update(new THREE.Vector3(cx,0,cz)); return r }
const posKey=(p)=>`${p.x.toFixed(1)},${p.z.toFixed(1)}`
const edgeKey=(r,e)=>{const a=posKey(r._nodePos(e.cellA)),b=posKey(r._nodePos(e.cellB));return a<b?`${a}|${b}`:`${b}|${a}`}
// interior box well inside the SMALLER (320) band
const HB=Number(process.env.HB ?? 300)
const inBox=(p)=>p.x>=cx-HB&&p.x<=cx+HB&&p.z>=cz-HB&&p.z<=cz+HB
const collect=(r)=>{const m=new Set();for(const[,e]of r._network){const a=r._nodePos(e.cellA),b=r._nodePos(e.cellB);if(inBox(a)||inBox(b))m.add(edgeKey(r,e));}return m}
for (const R of [320,1500]) { /* warm */ }
const A=collect(build(320)), B=collect(build(1500))
let onlyA=0,onlyB=0
for(const k of A) if(!B.has(k)) onlyA++
for(const k of B) if(!A.has(k)) onlyB++
console.log(`seed=${seed} center=(${cx},${cz}) interior box ±${HB}m`)
console.log(`  edges touching box:  R320=${A.size}  R1500=${B.size}`)
console.log(`  in R320 only (kept by world, culled by map?)=${onlyA}`)
console.log(`  in R1500 only (culled by world, kept by map?)=${onlyB}`)
console.log(onlyA||onlyB ? '  ✗ CULL/STREAM DESYNC: edge set depends on radius' : '  ✓ edge set radius-invariant')
