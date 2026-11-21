// test/drive-ai-soak.mjs — FEAT-293's soak: the driving AI (src/autopilot.js) at the wheel of the real physics
// (stepPhysics, the damage model) on the real world (test/lib/world-rig.mjs), as many km as asked, counting what it cannot
// drive through. NOT a gate (the gate is `--gate`, below) — a rainy-day measurement. Random seeds only for claims about
// the world (seed 6 is a test seed).
//
//   node test/drive-ai-soak.mjs [--seeds=4 | --seed=1234] [--km=5] [--radius=1500] [--out=wip/feat-293/soak.jsonl]
//
// The controls go on vehicleState the way src/vehicle.js puts the player's pad on it (pedals unramped, the steer slewed at
// the pad's rate inside the game's speed envelope, the handbrake), on the default box (the 4R44E automatic).
// The route is fenced 150 m inside the built region (a story region's wall does the same); a turn-round at the fence is a
// manoeuvre, not an intervention. An INTERVENTION is the AI giving up (its `trouble`): each is logged with its cause,
// position, speed, the road's grade and bend radius there; the truck is then re-seated 40 m on (a tow) and drives on.
// Per seed one JSON line; the last line of the run is the table: km and interventions per grade band (|grade| of the
// road under the truck: < 8 %, 8–15 %, 15–24 %, > 24 %), speeds, lateral error from its lane, time off the deck, tire
// wear per km, the cost of one autopilot step (µs, median / worst).
//
// --gate, or run as test/drive-ai.mjs (the gate registered in test/gates.mjs): ONE fixed short drive on a gentle stretch (seed and start below),
// 600 m: it must finish with no trouble, never off the deck, the lateral error from its lane under 3.5 m p99 (the
// near-hairpin junction runs ~3 m wide of its lane at full lock, on the deck); then the autopilot's own
// kinematic self-check must pass.

import * as THREE from 'three'
import { mkdirSync, appendFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { stepPhysics, readRimStrikes, classifyImpactRegion } from '../src/physics.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { DamageModel, TIRE_IDS } from '../src/damage.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { buildWorld } from './lib/world-rig.mjs'
import { ackermann } from './lib/physics-replay.mjs'
import { makeRoute, createAutopilot } from '../src/autopilot.js'
import { makeClutchAssist, stepClutchAssist } from '../src/clutch-assist.js'
import { fitTransmission } from '../src/drivetrain.js'

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d }
const GATE = process.argv.includes('--gate') || process.argv[1]?.endsWith('drive-ai.mjs')
// Run as test/drive-ai-manual.mjs (BUG-240's gate): the same 2 km drive on two pinned random seeds, on the automatic and
// on the manual with the clutch assistant OFF (the AI's own clutch foot alone) and, on the first seed, ON (both feet).
const MGATE = process.argv[1]?.endsWith('drive-ai-manual.mjs')
const MSEEDS = [220671609, 1385724447], MKM = 2, MTOL = 0.10   // mean-speed tolerance, manual vs automatic
const BOX = arg('box', null)   // --box=m5odr1: the manual (data/transmissions.js), driven through the clutch assistant as vehicle.js does
const ASSIST = arg('assist', 'on') !== 'off'   // --assist=off: the manual with the clutch assistant off (the player's setting), the AI's own clutch foot
const DT = 1 / 60, SLEW = 4.8   // rad/s — PAD_PARAMS.steerSlewRate
// The gate's stretch: seed 909892992 [DEFAULT], 600 m from the network edge nearest the origin in an 800 m region: 480 m
// of it under 8 %, two junctions (one a near-hairpin turn taken at full lock), a short 15 % descent.
const KM = GATE ? 0.6 : MGATE ? MKM : +arg('km', 5), RADIUS = GATE ? 800 : +arg('radius', 1500), OUT = arg('out', GATE ? null : 'wip/feat-293/soak.jsonl')
const seeds = GATE ? [+arg('seed', 909892992)] : arg('seed') ? arg('seed').split(',').map(Number) : Array.from({ length: +arg('seeds', 4) }, () => (Math.random() * 2 ** 31) >>> 0)
const BANDS = [0.08, 0.15, 0.24, Infinity], BAND_NAMES = ['<8%', '8-15%', '15-24%', '>24%']
const band = g => BANDS.findIndex(b => Math.abs(g) < b)

function freshState (P, x, y, z, heading) {
  const eq = computeStaticEquilibrium(P)
  return {
    position: new THREE.Vector3(x, y, z), velocity: new THREE.Vector3(),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading), angularVelocity: new THREE.Vector3(),
    steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0, handbrake: false,
    wheelSteerAngles: [0, 0, 0, 0], wheelOmega: [0, 0, 0, 0], wheelPhase: [0, 0, 0, 0], slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0],
    drivetrain: { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },
    rimForce: [0, 0, 0, 0], rimHazard: [0, 0, 0, 0], slipVel: [0, 0, 0, 0], tireFlat: [0, 0, 0, 0], bumpForce: [0, 0, 0, 0], brakeTorque: [0, 0, 0, 0],   // the damage model reads these (wear)
  }
}
const pct = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))] }

async function soakSeed (seed, { box = BOX, assist = ASSIST } = {}) {
  const P = { ...RANGER_PARAMS, clutchAssist: assist }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]; P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  let s = seed >>> 0
  const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const vs = freshState(P, 0, 0, 0, 0)
  const t0 = performance.now()
  const w = await buildWorld(seed, P, vs, { radius: RADIUS })
  const buildS = (performance.now() - t0) / 1000
  const damage = new DamageModel({ params: P }); damage.setAll(1); damage.publish(P)
  const keep = (x, z) => Math.hypot(x, z) < RADIUS - 150
  const clutch = makeClutchAssist()
  const route = makeRoute(() => w.road._network.values(), rng, { x: 0, z: 0 }, { keep })
  const inBore = (x, z) => { const nr = w.road.queryNearest(x, z, 15); return !!nr && !!w.road.tunnelSpanAt?.(nr.runKey ?? '', nr.arcS ?? 0, -20) }
  const ap = createAutopilot({ car: P, route, inBore, flat: () => damage.flat.some(Boolean) })
  const seat = (i) => {
    const a = route.path[i], b = route.path[Math.min(i + 3, route.path.length - 1)]
    const top = w.road.sampleRoadTopY(a.x, a.z) ?? w.terr.analyticHeight(a.x, a.z)
    const f = freshState(P, a.x, top + 1.0, a.z, Math.atan2(-(b.x - a.x), -(b.z - a.z)))
    for (const k in f) if (vs[k]?.isVector3 || vs[k]?.isQuaternion) vs[k].copy(f[k]); else vs[k] = f[k]   // the rig holds the vectors
    if (box) fitTransmission(P, vs, box)
    vs.engineHealth = 1   // the damage model writes it each step; a tow comes back running
    w.stream(a.x, a.z)
    ap.locate(a)
  }
  seat(0)
  const rec = { seed, km: 0, buildS: +buildS.toFixed(1), bandKm: [0, 0, 0, 0], bandInt: [0, 0, 0, 0], interventions: [], manoeuvres: {}, junctions: 0,
    reseats: 0, reseatWhy: {}, missShift: 0, stalls: 0, latWorst: { lat: 0 }, topV: 0, vSum: 0, vTSum: 0, n: 0, lat: [], offDeckS: 0, stepUs: [], tireWear: 0, yErr: [] }
  let t = 0, lastStream = 0, settle = 1.5, prevState = 'drive'
  const simCap = KM * 1000 / 3 + 120
  const halfW = P.roadHalfWidth ?? 5
  const tire0 = TIRE_IDS.reduce((a, id) => a + damage.condition[id], 0)
  while (ap.dist < KM * 1000 && t < simCap) {
    const t1 = performance.now(), j0 = route.junctions
    const c = ap.step(vs, DT)
    const us = (performance.now() - t1) * 1000
    if (rec.stepUs.length < 2e5) rec.stepUs.push(us)
    if (us > (rec.worstStep?.us ?? 0)) rec.worstStep = { us: Math.round(us), t: +t.toFixed(1), junction: route.junctions !== j0, state: c.state }
    const v = Math.hypot(vs.velocity.x, vs.velocity.z), i = ap.idx, path = route.path
    const a = path[Math.max(0, i - 3)], b = path[Math.min(path.length - 1, i + 3)]
    const grade = (b.y - a.y) / Math.max(1, b.s - a.s)
    if (c.state !== prevState) { if (c.state !== 'drive' && c.state !== 'stopped') rec.manoeuvres[c.state] = (rec.manoeuvres[c.state] ?? 0) + 1; prevState = c.state }
    if (process.env.SOAK_LOG && Math.round(t * 60) % (t > +(process.env.SOAK_T0 ?? 1e9) && t < +(process.env.SOAK_T1 ?? 0) ? 6 : 60) === 0) console.log(`  t ${t.toFixed(0)} ${c.state} v ${v.toFixed(1)}/${ap.vT.toFixed(1)} lat ${ap.lat.toFixed(2)} lane ${ap.lane} steer ${c.steer.toFixed(3)}/${vs.steerAngle.toFixed(3)} yawr ${vs.angularVelocity.y.toFixed(3)} thr ${c.throttle.toFixed(2)} brk ${c.brake.toFixed(2)} grade ${(grade * 100).toFixed(1)} R ${ap.dbg?.rNear?.toFixed(0)} at (${vs.position.x.toFixed(0)}, ${vs.position.z.toFixed(0)})`)
    if (c.trouble && settle <= 0) {
      const R = ap.dbg?.rNear
      rec.interventions.push({ why: c.trouble, at: [Math.round(vs.position.x), Math.round(vs.position.z)], v: +v.toFixed(1), grade: +(grade * 100).toFixed(1), R: R && isFinite(R) ? Math.round(R) : null, t: +t.toFixed(0) })
      rec.bandInt[band(grade)]++
      ap.resume(40); seat(ap.idx); settle = 1.5; damage.setAll(1); damage.flat.fill(false); damage.publish(P)
      continue
    }
    // Trouble straight off a seat is the seat's, not the driver's: move on 40 m more (sim time still runs, so a spot that
    // keeps failing cannot spin this loop for ever).
    if (c.trouble) { rec.reseats++; rec.reseatWhy[c.trouble] = (rec.reseatWhy[c.trouble] ?? 0) + 1; t += 0.5; ap.resume(40); seat(ap.idx); damage.setAll(1); damage.flat.fill(false); damage.publish(P); continue }
    // the player's control path (src/vehicle.js, the pad branch)
    vs.throttle = vs.smoothThrottle = c.throttle; vs.brake = vs.smoothBrake = c.brake; vs.handbrake = c.hand
    const lim = P.maxSteerAngle / (1 + v / P.speedSteerRef)
    vs.steerAngle = Math.max(-lim, Math.min(lim, vs.steerAngle + Math.max(-SLEW * DT, Math.min(SLEW * DT, c.steer - vs.steerAngle))))
    vs.wheelSteerAngles = ackermann(vs.steerAngle, P)
    if (P.transmissionType === 'manual') {
      const o = stepClutchAssist(clutch, { pedal: c.clutch, shift: c.shift, throttle: c.throttle }, { rpm: vs.drivetrain.engineRPM ?? 0, shifting: !!vs.drivetrain.shifting }, P, DT)
      vs.clutch = o.clutch; if (o.shiftRequest) vs.shiftRequest = o.shiftRequest
    }
    const pos = vs.position, vel = vs.velocity
    const f = w.props.bushDragForce(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, { x: 0, y: 0, z: 0 })
    if (f.x || f.y || f.z) { const k = DT / P.mass; vel.x += f.x * k; vel.y += f.y * k; vel.z += f.z * k }
    stepPhysics(vs, P, DT, w.queryContacts, w.ctx)
    const hit = readRimStrikes(w.engine, w.chassis, vs.rimForce, DT, vs.rimHazard)
    damage.step(vs, P, DT)
    damage.feedContact(classifyImpactRegion(hit.point, hit.normal), hit.impulse, P.mass, DT, vs.velocity)
    t += DT; settle -= DT
    if (vs.drivetrain.missShift) rec.missShift++
    if (vs.drivetrain.stalled) rec.stalls++
    if (!Number.isFinite(vs.position.x + vs.position.y + vs.position.z)) { rec.interventions.push({ why: 'nan', at: null, t }); ap.resume(40); seat(ap.idx); continue }
    if (t - lastStream > 1) { w.stream(vs.position.x, vs.position.z); lastStream = t }
    // book-keeping
    rec.bandKm[band(grade)] += v * DT / 1000
    rec.topV = Math.max(rec.topV, v)
    if (c.state === 'drive' && !ap.detouring) {
      rec.vSum += v; rec.vTSum += ap.vT; rec.n++
      if (rec.n % 6 === 0) rec.lat.push(Math.abs(ap.lat))
      if (Math.abs(ap.lat) > rec.latWorst.lat) rec.latWorst = { lat: +Math.abs(ap.lat).toFixed(2), at: [Math.round(vs.position.x), Math.round(vs.position.z)], v: +v.toFixed(1), R: Math.round(ap.dbg?.rNear ?? 0), grade: +(grade * 100).toFixed(1), t: Math.round(t) }
    }
    if (Math.abs(ap.lat + ap.offset) > halfW) rec.offDeckS += DT
    if (rec.n % 600 === 1) { const top = w.road.sampleRoadTopY(path[i].x, path[i].z); if (top != null) rec.yErr.push(Math.abs(top - path[i].y)) }
  }
  rec.km = +(ap.dist / 1000).toFixed(2); rec.simS = +t.toFixed(0); rec.junctions = route.junctions
  rec.tireWear = +((tire0 - TIRE_IDS.reduce((a, id) => a + damage.condition[id], 0)) / 4 / Math.max(0.01, rec.km) * 100).toFixed(3)   // % of a tire per km
  w.dispose()
  return rec
}

if (MGATE) {
  let bad = 0
  for (const [k, seed] of MSEEDS.entries()) {
    const runs = [['automatic', {}], ['manual, assist off', { box: 'm5odr1', assist: false }], ...(k === 0 ? [['manual, assist on', { box: 'm5odr1', assist: true }]] : [])]
    let vAuto = null
    for (const [name, cfg] of runs) {
      const r = await soakSeed(seed, cfg), meanV = r.vSum / Math.max(1, r.n)
      vAuto ??= meanV
      const dv = Math.abs(meanV - vAuto) / vAuto
      const ok = r.km >= MKM - 0.01 && !r.interventions.length && !r.reseats && !r.stalls && !r.missShift && dv <= MTOL
      if (!ok) bad++
      console.log(`  ${ok ? '✓' : '✗'} seed ${seed} ${name}: ${r.km.toFixed(2)} km in ${r.simS} s, mean ${(meanV * 3.6).toFixed(1)} km/h (${(dv * 100).toFixed(1)} % off the automatic, ≤ ${MTOL * 100} %), ` +
        `${r.interventions.length} interventions${r.interventions.length ? ` (${r.interventions.map(i => i.why).join(', ')})` : ''}, ${r.reseats} reseats, ${r.stalls} stall steps, ${r.missShift} missed shifts`)
    }
  }
  console.log(`drive-ai-manual gate: ${bad ? `${bad} FAILURE(S)` : 'PASS'}`)
  process.exit(bad ? 1 : 0)
}
const all = []
for (const seed of seeds) {
  const r = await soakSeed(seed)
  const lat = r.lat, us = r.stepUs
  const line = { seed, km: r.km, simS: r.simS, buildS: r.buildS, junctions: r.junctions, bandKm: r.bandKm.map(x => +x.toFixed(2)), bandInt: r.bandInt,
    interventions: r.interventions, manoeuvres: r.manoeuvres, reseats: r.reseats, reseatWhy: r.reseatWhy, missShift: r.missShift, stalls: r.stalls, topV: +r.topV.toFixed(1), meanV: +(r.vSum / Math.max(1, r.n)).toFixed(1), meanPlan: +(r.vTSum / Math.max(1, r.n)).toFixed(1),
    lat: { med: +pct(lat, 0.5).toFixed(2), p99: +pct(lat, 0.99).toFixed(2), worst: +Math.max(0, ...lat).toFixed(2) }, offDeckS: +r.offDeckS.toFixed(1), latWorst: r.latWorst,
    tireWearPctPerKm: r.tireWear, stepUs: { med: +pct(us, 0.5).toFixed(1), p99: +pct(us, 0.99).toFixed(1), worst: r.worstStep },
    pathYErr: +pct(r.yErr, 0.5).toFixed(2) }
  all.push(line)
  console.log(JSON.stringify(line))
  if (OUT) { mkdirSync(dirname(OUT), { recursive: true }); appendFileSync(OUT, JSON.stringify(line) + '\n') }
}
if (GATE) {
  const r = all[0], ok = r.interventions.length === 0 && r.lat.p99 < 3.5 && r.offDeckS === 0 && r.km >= KM - 0.01
  console.log(`drive-ai gate: ${r.km} km, ${r.interventions.length} interventions, lateral p99 ${r.lat.p99} m (worst ${r.lat.worst}), ${r.offDeckS} s off the deck, step ${r.stepUs.med} µs median — ${ok ? 'PASS' : 'FAIL'}`)
  let self = ''
  try { self = execFileSync('node', [fileURLToPath(new URL('../src/autopilot.js', import.meta.url))], { encoding: 'utf8' }) } catch (e) { self = (e.stdout ?? '') + 'FAIL' }
  console.log(self.trim())
  process.exit(ok && /PASS$/.test(self.trim()) ? 0 : 1)
}
const sum = (k, i) => all.reduce((a, r) => a + r[k][i], 0)
console.log('band       km     interventions  km/intervention')
for (let i = 0; i < 4; i++) { const km = sum('bandKm', i), n = sum('bandInt', i); console.log(`${BAND_NAMES[i].padEnd(8)} ${km.toFixed(1).padStart(6)}  ${String(n).padStart(6)}         ${n ? (km / n).toFixed(1) : '∞ (none)'}`) }
