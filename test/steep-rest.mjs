// RAINY-DAY (not in run-all): node test/steep-rest.mjs [slopeDeg] [headingDeg]
// Isolates the "car won't rest on steep terrain" bug on a CLEAN INFINITE PLANE (no road, no cut bank,
// no heightfield discontinuity) using the game's EXACT contact model (vertical-overlap depth + plane
// normal, verbatim from src/main.js queryContacts). The car is seated flush on the slope, oriented to
// the plane, zero input. A correct sim: rest (speed→~0) when slopeDeg < friction angle atan(mu)≈42°,
// or slide SMOOTHLY downhill above it — never chatter (wheels slamming 0↔high Fn) while nearly still.

import * as THREE from 'three'
import { stepPhysics } from '../src/physics.js'
import { getWheelPosition } from '../src/suspension.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'

const slopeDeg   = Number(process.argv[2] ?? 18)
const headingDeg = Number(process.argv[3] ?? 0)   // 0 = facing downhill (+z), 90 = across slope
const brake      = Number(process.argv[4] ?? 0)   // 0..1 brake hold (parks the wheels)
const theta = slopeDeg * Math.PI / 180

// Scratch arrays the suspension substep expects on params (main.js:85-94).
P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
P._hubNormalXZ = [{x:0,y:0,z:0},{x:0,y:0,z:0},{x:0,y:0,z:0},{x:0,y:0,z:0}]

// Infinite plane sloping in +z (downhill toward +z): surfaceY = -tan(theta)*z. Outward normal (y>0).
const tanT = Math.tan(theta)
const surfaceY = (x, z) => -tanT * z
const N = new THREE.Vector3(0, Math.cos(theta), Math.sin(theta))   // unit normal of that plane

// queryContacts — verbatim shape of src/main.js Sierra branch (vertical-overlap depth + plane normal).
const queryContacts = (cx, cy, cz, r) => {
  const h = surfaceY(cx, cz)
  const gd = h + r - cy
  if (gd > 0) return [{ normal: N.clone(), depth: gd, contactPoint: new THREE.Vector3(cx, h, cz) }]
  return []
}
const queryVertexContacts = (px, py, pz) => {
  const h = surfaceY(px, pz)
  if (py < h) return [{ normal: N.clone(), depth: h - py }]
  return []
}

// Static equilibrium (verbatim from main.js computeStaticEquilibrium).
function eqOf (p) {
  const g = 9.81, strutComp = [0,0,0,0], bodyYCorner = [0,0,0,0]
  for (let i=0;i<4;i++){const f=i<2;const cm=p.mass*(f?p.weightFront:p.weightRear)/2+p.wheelMass;
    const kS=f?p.suspensionStiffnessFront:p.suspensionStiffnessRear;const LS=f?p.suspensionRestLengthFront:p.suspensionRestLengthRear;
    const spr=p.mass*(f?p.weightFront:p.weightRear)/2;strutComp[i]=spr*g/kS;
    const tc=cm*g/p.tireStiffness;const hubY=p.wheelRadius-tc;const bo=f?(p.suspensionBodyOffsetFront||0):(p.suspensionBodyOffsetRear||0);
    bodyYCorner[i]=hubY+(LS-strutComp[i])+(p.cgHeight-p.wheelRadius)-bo}
  return { bodyY:(bodyYCorner[0]+bodyYCorner[1])/2, strutComp }
}
const eq = eqOf(P)

// Orient the body: align body-up (0,1,0) to the plane normal N, then yaw by heading about N.
const qTilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), N)
const qYaw  = new THREE.Quaternion().setFromAxisAngle(N, headingDeg * Math.PI/180)
const quat  = qYaw.multiply(qTilt)

// Seat the CG above the surface along the normal by the equilibrium ride height.
const cg0 = new THREE.Vector3(0, surfaceY(0,0), 0).addScaledVector(N, eq.bodyY)
const vs = {
  position: cg0.clone(), velocity: new THREE.Vector3(),
  quaternion: quat.clone(), angularVelocity: new THREE.Vector3(),
  steerAngle:0, throttle:0, brake:brake, smoothThrottle:0, smoothBrake:brake,
  wheelAngles:[0,0,0,0], wheelSteerAngles:[0,0,0,0],
  wheelDebug:[0,1,2,3].map(()=>({fn:0,fy:0,sa:0,c:0,omega:0,fz:0})),
  wheelOmega:[0,0,0,0], slipLong:[0,0,0,0], slipLat:[0,0,0,0],
  strutComp:[...eq.strutComp], strutCompVel:[0,0,0,0], handbrake:false,
}

const DT = 1/60, STEPS = 360
console.log(`slope ${slopeDeg}°  heading ${headingDeg}°  mu=${P.frictionCoeff}  friction-angle ${(Math.atan(P.frictionCoeff)*180/Math.PI).toFixed(1)}°`)
console.log(`  t    speed   downhillV |  FL_fn  FR_fn  RL_fn  RR_fn  | airborne-wheels | maxDepth`)
let chatterSteps = 0
for (let s=1; s<=STEPS; s++){
  stepPhysics(vs, P, DT, queryContacts, queryVertexContacts)
  // downhill direction on the plane = projection of -gravity-tangent = (0,0,1) flattened; use +z comp.
  const speed = vs.velocity.length()
  const downhillV = vs.velocity.z
  const fn = vs.wheelDebug.map(w=>w.fn||0)
  const air = fn.filter(f=>f<1e-3).length
  const maxDepth = Math.max(...vs.wheelDebug.map(w=>w.c||0))
  // chatter = at least one wheel airborne AND at least one loaded hard, while nearly stationary
  if (air>0 && air<4 && Math.max(...fn)>P.mass*9.81*0.4 && speed<2) chatterSteps++
  if (s%30===0){
    const F=(v,w=6,d=2)=>String(v.toFixed(d)).padStart(w)
    console.log(F(s*DT,5),F(speed),F(downhillV),"|",fn.map(f=>String(Math.round(f)).padStart(6)).join(" "),"|",String(air).padStart(8),"        ",F(maxDepth,7,4))
  }
}
console.log(`\nfinal speed ${vs.velocity.length().toFixed(3)} m/s,  chatter-frames ${chatterSteps}/${STEPS}`)
console.log(chatterSteps>STEPS*0.1 ? "  → CHATTER: wheels slamming in/out while nearly stationary (contact-model bug)."
  : (vs.velocity.length()<0.3 ? "  → RESTS cleanly." : "  → slides (check if smooth)."))
