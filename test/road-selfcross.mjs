// test/road-selfcross.mjs — FEAT-10 Priority 2 self-overlap METRIC (measure before/after).
//
// The road has ~zero EXACT centerline self-crossings, but it still LOOKS knotted because the ribbon
// has WIDTH (~10 m): where a run curls into a tight teardrop/lollipop loop the two strands of the neck
// pass within a road-width of each other and the ribbons (+ embankments) merge into a blob. So the
// metric that matches the eye is self-PROXIMITY + loop turning, not segment intersection:
//
//   (A) INTRA-run self-overlap — two points of the SAME run that are far apart ALONG the run
//       (arc-sep > ARC_MIN) yet within PROX_D in XZ → the ribbon overlaps itself (the loop neck).
//   (B) Tight LOOPS — a run whose signed heading turns more than LOOP_DEG total (a near-complete
//       circle): the spiral/lollipop the grade relaxation reduced but didn't remove.
//   (C) INTER-run overlap — two DIFFERENT runs that run within PROX_D of each other over a length
//       (parallel duplicates) and exact crossings (for context / overpass candidates).
//
// Measurement harness, not a pass/fail gate (yet). Run before/after a routing change.
// Run: node test/road-selfcross.mjs            (all seeds)
//      node test/road-selfcross.mjs 6          (one seed, verbose)

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const SEEDS  = process.argv[2] ? [Number(process.argv[2])] : [6, 7, 8, 42]
const VERBOSE = !!process.argv[2]
const HW      = RANGER_PARAMS.roadHalfWidth ?? 5
const PROX_D  = 2 * HW          // 10 m — ribbons overlap when centerlines are within this
const ARC_MIN = 6 * HW          // 30 m — only count strands that are genuinely far apart along the run
const LOOP_DEG = 270            // a run that turns this much total is a near-loop

function segCross(ax,az,bx,bz,cx,cz,dx,dz){
  const ex=bx-ax,ez=bz-az,fx=dx-cx,fz=dz-cz,den=ex*fz-ez*fx
  if(Math.abs(den)<1e-10)return false
  const t=((cx-ax)*fz-(cz-az)*fx)/den,u=((cx-ax)*ez-(cz-az)*ex)/den
  return t>1e-6&&t<1-1e-6&&u>1e-6&&u<1-1e-6
}

// cumulative XZ arc length per point
function arcOf(pts){
  const a=[0]; for(let i=1;i<pts.length;i++) a[i]=a[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].z-pts[i-1].z)
  return a
}

// total absolute heading turn along a run (degrees)
function turnDeg(pts){
  let total=0
  for(let i=1;i<pts.length-1;i++){
    const ax=pts[i].x-pts[i-1].x, az=pts[i].z-pts[i-1].z
    const bx=pts[i+1].x-pts[i].x, bz=pts[i+1].z-pts[i].z
    const la=Math.hypot(ax,az)||1, lb=Math.hypot(bx,bz)||1
    let d=(ax*bx+az*bz)/(la*lb); d=Math.max(-1,Math.min(1,d))
    total+=Math.acos(d)
  }
  return total*180/Math.PI
}

// count self-overlap EVENTS (distinct clusters of arc-distant near-approaches)
function selfOverlap(pts,arc){
  const hits=[]
  for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
    if(arc[j]-arc[i] < ARC_MIN) continue
    const d=Math.hypot(pts[i].x-pts[j].x,pts[i].z-pts[j].z)
    if(d<PROX_D) hits.push({i,j,d})
  }
  // collapse to distinct events: group by i within 20m arc
  let events=0,lastI=-1e9
  hits.sort((a,b)=>a.i-b.i)
  for(const h of hits){ if(arc[h.i]-lastI>20){events++; lastI=arc[h.i]} }
  return {events, minD: hits.reduce((m,h)=>Math.min(m,h.d), Infinity)}
}

for(const seed of SEEDS){
  const road=new RoadSystem(seed,RANGER_PARAMS); road.update(new THREE.Vector3(0,0,0))
  const runs=[...road._network.entries()]
  let selfEvents=0, loopRuns=0; const worst=[]
  for(const [rk,e] of runs){
    const pts=e.points; if(!pts||pts.length<4)continue
    const arc=arcOf(pts)
    const {events,minD}=selfOverlap(pts,arc)
    const td=turnDeg(pts)
    if(events>0){selfEvents+=events; worst.push({rk,events,minD:+minD.toFixed(1),turn:+td.toFixed(0),len:+arc[arc.length-1].toFixed(0)})}
    if(td>=LOOP_DEG)loopRuns++
  }
  // inter-run exact crossings (context)
  let inter=0
  for(let a=0;a<runs.length;a++){const pa=runs[a][1].points;if(!pa)continue
   for(let b=a+1;b<runs.length;b++){const pb=runs[b][1].points;if(!pb)continue
    for(let i=0;i<pa.length-1;i++)for(let j=0;j<pb.length-1;j++)
     if(segCross(pa[i].x,pa[i].z,pa[i+1].x,pa[i+1].z,pb[j].x,pb[j].z,pb[j+1].x,pb[j+1].z))inter++}}
  worst.sort((x,y)=>y.events-x.events)
  console.log(`seed ${seed}: ${runs.length} runs | SELF-OVERLAP events=${selfEvents} (ribbon within ${PROX_D}m of itself) | tight LOOPS(>${LOOP_DEG}°)=${loopRuns} | inter-run crossings=${inter}`)
  if(VERBOSE){
    console.log('  worst self-overlapping runs (rk: events, minDist, totalTurn°, length):')
    for(const w of worst.slice(0,12)) console.log(`    ${w.rk}: ${w.events} ev, min ${w.minD}m, turn ${w.turn}°, len ${w.len}m`)
  }
}
