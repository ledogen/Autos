import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
for (const mode of ['rows','graph']) {
  const r = new RoadSystem(6, { ...RANGER_PARAMS, roadNetworkMode: mode })
  r.setRadius(1600); r.update(new THREE.Vector3(4500,0,600))
  let n=0, sumAbs=0, maxAbs=0, sumMaxPerEdge=0, nearZero=0, samp=0
  for (const [k,e] of r._network) {
    const pts=e.points; if(pts.length<3) continue
    // arc positions match camberProfile domain (arcOrigin)
    let s=-(e.arcOrigin||0)
    let edgeMax=0, edgeSampZero=0, edgeSamp=0
    for (let i=0;i<pts.length;i++){
      if(i>0) s+=Math.hypot(pts[i].x-pts[i-1].x, pts[i].z-pts[i-1].z)
      const c = Math.abs(r.camberProfile(s, k))*180/Math.PI  // deg
      sumAbs+=c; samp++; if(c>maxAbs)maxAbs=c; if(c>edgeMax)edgeMax=c
      if(c<0.3) edgeSampZero++; edgeSamp++
    }
    sumMaxPerEdge+=edgeMax; n++; nearZero+=edgeSampZero/edgeSamp
  }
  console.log(`${mode.padEnd(6)} edges=${n}  avg|camber|=${(sumAbs/samp).toFixed(2)}°  max=${maxAbs.toFixed(2)}°  avgEdgePeak=${(sumMaxPerEdge/n).toFixed(2)}°  frac<0.3°=${(100*nearZero/n).toFixed(0)}%`)
}
