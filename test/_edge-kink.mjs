import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { readFileSync } from 'node:fs'
const cap = JSON.parse(readFileSync(process.argv[2],'utf8'))
const { seed, params } = cap.world
const mark = cap.place.mark, targetKey = cap.place.observed.runKey
const devCaps = process.argv.slice(3).map(Number)
for (const dc of devCaps) {
  const P = { ...params, roadNetworkMode:'graph', roadGraphDeviationCap: dc }
  const r = new RoadSystem(seed, P); r.setRadius(1200); r.update(new THREE.Vector3(mark.x,0,mark.z))
  let edge=null; for (const [k,e] of r._network) if (k===targetKey){edge=e;break}
  if(!edge){console.log('cap',dc,'edge not found');continue}
  const pts=edge.points
  // grade per segment, then kink = |grade[i]-grade[i-1]|
  const s=[0]; for(let i=1;i<pts.length;i++)s[i]=s[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].z-pts[i-1].z)
  const g=[]; for(let i=1;i<pts.length;i++)g[i]=(pts[i].y-pts[i-1].y)/((s[i]-s[i-1])||1)
  let kinks=0, maxKink=0, sumAbsKink=0, nk=0
  for(let i=2;i<g.length;i++){ const dk=Math.abs(g[i]-g[i-1]); sumAbsKink+=dk; nk++; if(dk>maxKink)maxKink=dk; if(dk>0.10)kinks++ }
  // flat-patch count: runs where |grade|<0.03 for >=6m bracketed by |grade|>0.10
  let flats=0
  for(let i=2;i<g.length;i++){ if(Math.abs(g[i])<0.03 && (Math.abs(g[i-1])>0.10||Math.abs(g[i+1]||0)>0.10)) flats++ }
  console.log(`cap=${String(dc).padStart(4)}  kinks(>10%/seg)=${String(kinks).padStart(3)}  maxKink=${(maxKink*100).toFixed(1)}%  avgKink=${(sumAbsKink/nk*100).toFixed(2)}%  flatEdges=${flats}`)
}
