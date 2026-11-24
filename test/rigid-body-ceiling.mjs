// test/rigid-body-ceiling.mjs — FEAT-326 rainy-day study (NOT a gate): what a pile of N slide rocks costs per physics step.
//
// One real world (test/lib/rockslide-hit.mjs hitWorld: the terrain heightfield, road trimesh and props the game mirrors),
// the real DebrisSystem and the slide rocks (src/rockslide.js slideRockGeos: 42-vertex hulls, granite, 25–300 kg). A pile
// of N rocks is dropped on a straight road stretch (9 across, 4 layers, 0.75 m grid) and settled; the truck is parked
// 40 m short of it. Each step runs what main.js runs: debris.beforeStep → stepPhysics (8 engine substeps) → debris.update.
// States, each timed per step (ms, median and p99):
//   rest   — 300 steps of the settled pile;
//   blast  — every rock kicked 6 m/s out from the pile centre + 3 m/s up, then 15 s (the awake share every 0.5 s);
//   plough — the pile re-settled, the truck driven through it at 30 km/h by pure pursuit, 8 s.
// The engine's own profile (b3World_GetProfile: broad phase `pairs`, narrow phase `collide`, `solve`) is read through a
// module hook that adds one getter to physics-engine.js AS IT LOADS (src/ is not edited; the game never sees it).
//
// Lever mode (--lever): no truck, engine.step alone, N rocks, rest + blast: shape (hull42/hull12/sphere/box), substeps,
// sleep threshold, disabled vs asleep.
//
// Run: node test/rigid-body-ceiling.mjs --n=400 [--reps=3] [--seed=1828043085] [--json]
//      node test/rigid-body-ceiling.mjs --lever [--n=400]

import { registerHooks } from 'node:module'
registerHooks({
  load (url, ctx, next) {
    const r = next(url, ctx)
    if (url.endsWith('/src/physics-engine.js')) r.source = String(r.source) + '\nexport const __b3 = () => _b3\n'
    return r
  },
})

const THREE = await import('three')
const { hitWorld } = await import('./lib/rockslide-hit.mjs')
const { __b3, GROUP_DEBRIS } = await import('../src/physics-engine.js')
const { stepPhysics } = await import('../src/physics.js')
const { computeStaticEquilibrium } = await import('../src/suspension.js')
const { RockslideDirector, slideRockGeos, rockGeo, runAt, SLIDE } = await import('../src/rockslide.js')
const { makeBlob } = await import('../src/props/prop-geometry.js')
const { FLORA_PARAMS } = await import('../data/flora.js')
const { DEFAULT_VEHICLE_MODEL } = await import('../data/vehicle-models.js')
const { ackermann } = await import('./lib/physics-replay.mjs')
const { mulberry32 } = await import('../src/seed.js')

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const N = +arg('n', 400), REPS = +arg('reps', 3), SEED = +arg('seed', 1828043085)
const LEVER = process.argv.includes('--lever'), JSON_OUT = process.argv.includes('--json')
// Owner, 2026-11-23: the blasting rocks are bigger and oblong ("somewhat stackable"). --shape=round|oblong, --mix=today|seven.
const SHAPE = arg('shape', 'round'), MIX = arg('mix', 'today')
const DT = 1 / 60, SUB = 8, COLS = 9, LAYERS = 4, PITCH = 0.75
const BED = DEFAULT_VEHICLE_MODEL.bed ?? null

const q = (a, f) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(f * b.length))] : NaN }
const stat = a => ({ p50: +q(a, 0.5).toFixed(3), p99: +q(a, 0.99).toFixed(3), max: +q(a, 1).toFixed(3) })

const T0 = performance.now(), log = m => console.error(`[${((performance.now() - T0) / 1000).toFixed(0)} s] ${m}`)
const { w, debris, heightAt } = await hitWorld(SEED)
log('world built')
const b3 = __b3(), E = w.engine, P = w.P, vs = w.vs
const prof = () => b3.b3World_GetProfile(E._world)
const bodyId = h => E._bodies.get(h).id

// A straight road stretch near the origin: heading change < 6° over the pile + the approach.
let run = null
for (const [, e] of w.road._network) {
  if (!e.points || e.points.length < 2 || !e.polyCum) continue
  const L = e.polyCum.at(-1)
  if (L < 160) continue
  for (let s = 60; s < L - 60 && !run; s += 10) {
    const a = runAt(e.points, e.polyCum, s - 50), b = runAt(e.points, e.polyCum, s + 40), c = runAt(e.points, e.polyCum, s)
    if (Math.hypot(c.x, c.z) > 1000) continue
    if (Math.acos(Math.min(1, a.tx * b.tx + a.tz * b.tz)) < 6 * Math.PI / 180) run = { e, s }
  }
  if (run) break
}
if (!run) throw new Error('no straight road stretch found')
const at = s => runAt(run.e.points, run.e.polyCum, s)
const c0 = at(run.s)
w.stream(c0.x, c0.z)
const deckY = (x, z) => w.road.sampleRoadTopY(x, z) ?? heightAt(x, z)

// Rock kinds: the director's own (round, today's sizes), or built here the same way (rockGeo, the slide's blob).
//   oblong — axes 2 : 1 : 1.3 (long, tall, wide), the owner's "oblong, somewhat stackable";
//   seven  — long semi-axis 0.25 → 1.2 m in a ×1.30 ladder, drawn 30:24:18:12:8:5:3 (fewer big ones).
const dir0 = new RockslideDirector({ debris, road: () => w.road, heightAt })
await Promise.all(dir0._kinds.map(k => debris.load(k)))
const OBLONG = [1, 0.5, 0.65]
const SEVEN_R = Array.from({ length: 7 }, (_, i) => 0.25 * (1.2 / 0.25) ** (i / 6)), SEVEN_W = [30, 24, 18, 12, 8, 5, 3]
let kinds = dir0._kinds.map(k => ({ kind: k, w: 1 }))
if (SHAPE !== 'round' || MIX !== 'today') {
  const rs = MIX === 'seven' ? SEVEN_R : Array.from({ length: 6 }, (_, i) => SLIDE.rockR[0] + (SLIDE.rockR[1] - SLIDE.rockR[0]) * i / 5)
  const ax = SHAPE === 'oblong' ? OBLONG : SLIDE.axisScale, rng = mulberry32(0x51ade)
  kinds = await Promise.all(rs.map(async (r, i) => {
    const kind = `ceil-${SHAPE}-${MIX}-${i}`
    const template = new THREE.Mesh(rockGeo(r, rng, ax), new THREE.MeshLambertMaterial({ flatShading: true }))
    await debris.load(kind, { template, density: SLIDE.density, friction: SLIDE.friction, restitution: SLIDE.restitution, hazard: true })
    template.geometry.computeBoundingSphere()
    return { kind, w: MIX === 'seven' ? SEVEN_W[i] : 1, r: template.geometry.boundingSphere.radius }
  }))
}
const pickKind = rng => { const tot = kinds.reduce((a, k) => a + k.w, 0); let u = rng() * tot; for (const k of kinds) if ((u -= k.w) < 0) return k; return kinds.at(-1) }
const geos = slideRockGeos(), radii = geos.map(g => (g.computeBoundingSphere(), g.boundingSphere.radius))
const hull42 = geos.map(g => Float32Array.from(g.attributes.position.array))
const hull12 = radii.map((r, i) => {
  const B = FLORA_PARAMS.medRock.blob
  const g = makeBlob({ radius: SLIDE.rockR[0] + (SLIDE.rockR[1] - SLIDE.rockR[0]) * i / 5, axisScale: SLIDE.axisScale, irregularity: B.irregularity, noiseFreq: B.noiseFreq, subdiv: 0 }, mulberry32(i + 1))
  g.computeBoundingBox(); const c = g.boundingBox.getCenter(new THREE.Vector3()); g.translate(-c.x, -c.y, -c.z)
  return Float32Array.from(g.attributes.position.array)
})
const hullOb = radii.map((_, i) => Float32Array.from(rockGeo(SLIDE.rockR[0] + (SLIDE.rockR[1] - SLIDE.rockR[0]) * i / 5, mulberry32(i + 7), [1, 0.5, 0.65]).attributes.position.array))
const halfExt = hull42.map(h => { const e = { x: 0, y: 0, z: 0 }; for (let i = 0; i < h.length; i += 3) { e.x = Math.max(e.x, Math.abs(h[i])); e.y = Math.max(e.y, Math.abs(h[i + 1])); e.z = Math.max(e.z, Math.abs(h[i + 2])) } return e })

/** Pile slots: 9 across the lane pair, 4 layers, rows along the road from run.s. */
function slots (n, rng) {
  const out = []
  for (let i = 0; out.length < n; i++) {
    const row = Math.floor(i / (COLS * LAYERS)), k = i % (COLS * LAYERS), layer = Math.floor(k / COLS), col = k % COLS
    const p = at(run.s + row * PITCH), off = (col - (COLS - 1) / 2) * PITCH + (layer % 2) * PITCH / 2
    const x = p.x - p.tz * off, z = p.z + p.tx * off
    out.push({ x, y: deckY(x, z) + 0.4 + layer * PITCH, z, variant: Math.floor(rng() * geos.length) })
  }
  return out
}

/** A condensed heap for the size mix: sphere-stacked drops (bounding spheres) on a 7 m wide footprint, ~1.5 m mean
 *  fill height, so the length grows with the rocks' volume. Big rocks drawn first per slot order is random. */
function heap (n, rng) {
  const picks = Array.from({ length: n }, () => pickKind(rng))
  const vol = picks.reduce((a, k) => a + 4.19 * k.r ** 3, 0), len = Math.max(3, vol / (7 * 1.5))
  const placed = [], out = []
  for (const k of picks) {
    const along = rng() * len, across = (rng() - 0.5) * (7 - 2 * k.r)
    const p = at(run.s + along), x = p.x - p.tz * across, z = p.z + p.tx * across
    let y = deckY(x, z) + k.r + 0.02
    for (const o of placed) {
      const d2 = (o.x - x) ** 2 + (o.z - z) ** 2, rr = o.r + k.r + 0.02
      if (d2 < rr * rr) y = Math.max(y, o.y + Math.sqrt(rr * rr - d2))
    }
    placed.push({ x, y, z, r: k.r })
    out.push({ x, y, z, kind: k.kind })
  }
  return out
}
const pileSlots = (n, rng) => MIX === 'seven' ? heap(n, rng)
  : slots(n, rng).map(s => ({ ...s, kind: kinds[s.variant % kinds.length].kind }))
// Touching contacts per rock (the engine's contact data: manifolds that touch; a rock-rock pair counts at both rocks).
const touching = hs => {
  E._contactsBuf ??= b3.createContactsBuffer()
  let n = 0; for (const h of hs) n += b3.getNumContacts(b3.getBodyContactData(E._contactsBuf, bodyId(h)))
  return +(n / Math.max(1, hs.length)).toFixed(2)
}
// The wheels' debris query (physics-engine.js contactSphere: a walk over EVERY dynamic body), 20 calls a step as
// stepPhysics makes them, at the four hub spots of the truck where it stands. Returns ms per step.
const _hub = new THREE.Vector3()
function wheelWalkMs () {
  const t = performance.now()
  for (let k = 0; k < 5; k++) for (const [a, b] of [[1.4, 0.75], [1.4, -0.75], [-1.4, 0.75], [-1.4, -0.75]]) {
    _hub.set(b, -0.4, -a).applyQuaternion(vs.quaternion).add(vs.position)
    E.contactSphere(_hub, 0.37, { collidesWith: GROUP_DEBRIS, dynamicOnly: true, skipWeldedTo: w.chassis })
  }
  return performance.now() - t
}

function parkTruck (sBack) {
  const eq = computeStaticEquilibrium(P), p = at(run.s - sBack)
  vs.position.set(p.x, deckY(p.x, p.z) + eq.bodyY + 0.05, p.z)
  vs.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-p.tx, -p.tz))
  vs.velocity.set(0, 0, 0); vs.angularVelocity.set(0, 0, 0)
  vs.strutComp = [...eq.strutComp]; vs.strutCompVel = [0, 0, 0, 0]; vs.wheelOmega = [0, 0, 0, 0]
  vs.steerAngle = 0; vs.wheelSteerAngles = ackermann(0, P); vs.throttle = 0; vs.brake = 1
}

const fwd = new THREE.Vector3()
let sNear = 0
function pursue (v) {
  let best = Infinity, sb = sNear
  for (let ds = -6; ds <= 6; ds++) { const p = at(sNear + ds); const d = Math.hypot(p.x - vs.position.x, p.z - vs.position.z); if (d < best) { best = d; sb = sNear + ds } }
  sNear = sb
  const look = Math.max(8, 0.9 * v), tg = at(sNear + look)
  const fw = fwd.set(0, 0, -1).applyQuaternion(vs.quaternion)
  const al = Math.atan2(tg.x - vs.position.x, tg.z - vs.position.z) - Math.atan2(fw.x, fw.z)
  const a = Math.atan2(Math.sin(al), Math.cos(al))
  const want = Math.max(-P.maxSteerAngle, Math.min(P.maxSteerAngle, Math.atan2(2 * P.wheelbase * Math.sin(a), look)))
  vs.steerAngle += Math.max(-4.8 * DT, Math.min(4.8 * DT, want - vs.steerAngle)); vs.wheelSteerAngles = ackermann(vs.steerAngle, P)
  const vf = vs.velocity.dot(fw)
  vs.throttle = Math.max(0, Math.min(1, (v - vf) * 0.5)); vs.brake = Math.max(0, Math.min(1, (vf - v) * 0.5))
}

/** One game step as main.js runs it. Returns { total, eng, debrisJs, profile }. */
function gameStep () {
  const t0 = performance.now()
  debris.beforeStep(w.chassis, BED)
  const t1 = performance.now()
  stepPhysics(vs, P, DT, w.queryContacts, w.ctx)
  const t2 = performance.now()
  debris.update(1)
  const t3 = performance.now()
  return { total: t3 - t0, phys: t2 - t1, debrisJs: (t1 - t0) + (t3 - t2), pr: prof() }
}

const awakeShare = hs => hs.length ? hs.reduce((n, h) => n + (E.isAwake(h) ? 1 : 0), 0) / hs.length : 0

function record (steps, fn, sample = null) {
  const r = { total: [], phys: [], eng: [], pairs: [], collide: [], solve: [], debrisJs: [], walk: [], awake: [] }
  for (let k = 0; k < steps; k++) {
    fn?.(k)
    const s = gameStep()
    r.total.push(s.total); r.phys.push(s.phys); r.debrisJs.push(s.debrisJs)
    r.walk.push(wheelWalkMs()); r.eng.push(s.pr.step); r.pairs.push(s.pr.pairs); r.collide.push(s.pr.collide); r.solve.push(s.pr.solve)
    if (sample && k % 30 === 29) r.awake.push(+awakeShare(sample).toFixed(2))
  }
  return r
}
const summ = r => ({ total: stat(r.total), phys: stat(r.phys), eng: stat(r.eng), pairs: stat(r.pairs), collide: stat(r.collide), solve: stat(r.solve), debrisJs: stat(r.debrisJs), walk: stat(r.walk), slide: stat(r.eng.map((e, i) => e + r.debrisJs[i] + r.walk[i])) })

function settle (hs, maxS = 30) {
  let k = 0
  for (; k < maxS * 60; k++) { gameStep(); if (k % 30 === 29 && awakeShare(hs) === 0) break }
  return +((k + 1) / 60).toFixed(1)
}

function blast (hs) {
  // Centre: the pile's middle, 0.5 m under the deck. Δv 6 m/s radial (XZ) + 3 m/s up, as an impulse m·Δv.
  const mid = at(run.s + Math.ceil(hs.length / (COLS * LAYERS)) * PITCH / 2), cy = deckY(mid.x, mid.z) - 0.5
  const p = new THREE.Vector3(), qq = new THREE.Quaternion()
  for (const h of hs) {
    E.getTransform(h, p, qq)
    const dx = p.x - mid.x, dz = p.z - mid.z, l = Math.hypot(dx, dz) || 1, m = E.getMass(h)
    E.applyImpulse(h, { x: m * 6 * dx / l, y: m * 3, z: m * 6 * dz / l }, { x: p.x, y: p.y, z: p.z })
  }
  return cy
}

function mainRun (rep) {
  const rng = mulberry32(1000 + rep)
  parkTruck(40)
  for (let k = 0; k < 60; k++) gameStep()   // the truck seats
  const base = summ(record(120))
  const t0 = performance.now()
  const hs = pileSlots(N, rng).map(s => debris.spawn(s.kind, s, { x: 0, y: 0, z: 0 }, { spin: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, pinned: true }))
  const spawnMs = performance.now() - t0
  log(`spawned ${hs.length}`)
  const settleS = settle(hs)
  log(`settled ${settleS} s`)
  const cRest = E.counters(), touchRest = touching(hs), massKg = hs.map(h => E.getMass(h))
  const restR = record(300, null, hs), rest = summ(restR)
  blast(hs)
  const bl = record(900, null, hs)
  const blastAwake = bl.awake
  log('blast done')
  const resettleS = settle(hs, 20), touchResettle = touching(hs)
  // Plough: the truck from 25 m back at 30 km/h, through the pile, 8 s.
  parkTruck(25); sNear = run.s - 25
  for (let k = 0; k < 30; k++) gameStep()
  const v = 30 / 3.6
  vs.velocity.copy(fwd.set(0, 0, -1).applyQuaternion(vs.quaternion).multiplyScalar(v)); vs.wheelOmega = [0, 1, 2, 3].map(() => v / P.wheelRadius)
  let cPl = null
  const pl = record(480, k => { pursue(v); if (k === 240) cPl = E.counters() }, hs)
  const out = { N, shape: SHAPE, mix: MIX, rep, massKg: { min: +Math.min(...massKg).toFixed(0), p50: +q(massKg, 0.5).toFixed(0), max: +Math.max(...massKg).toFixed(0), sum: +massKg.reduce((a, b) => a + b, 0).toFixed(0) },
    touchRest, touchResettle, restAwake: restR.awake, spawnMs: +spawnMs.toFixed(1), settleS, resettleS, contactsRest: cRest.contacts, awakeContactsRest: cRest.awakeContacts,
    contactsPlough: cPl.contacts, awakeContactsPlough: cPl.awakeContacts, base, rest, blast: summ(bl), blastFirst2s: summ({ ...bl, ...Object.fromEntries(Object.entries(bl).map(([k, a]) => [k, a.slice(0, 120)])) }),
    blastAwake, plough: summ(pl), ploughAwake: pl.awake }
  debris.remove(hs)
  for (let k = 0; k < 10; k++) gameStep()
  return out
}

// ── Lever mode: engine.step alone (the truck disabled), same pile ─────────────────────────────────────────────────
function leverRun ({ shape = 'hull42', sub = SUB, sleepT = null, rep = 0 }) {
  const rng = mulberry32(2000 + rep)
  const hs = slots(N, rng).map(s => {
    const h = E.createBody({ type: 'dynamic', position: s })
    const mat = { density: SLIDE.density, friction: SLIDE.friction, restitution: SLIDE.restitution, group: GROUP_DEBRIS }
    if (shape === 'hull42') E.addHull(h, hull42[s.variant], mat)
    else if (shape === 'oblong') E.addHull(h, hullOb[s.variant], mat)
    else if (shape === 'hull12') E.addHull(h, hull12[s.variant], mat)
    else if (shape === 'sphere') E.addSphere(h, radii[s.variant] * 0.8, mat)
    else E.addBox(h, halfExt[s.variant], mat)
    if (sleepT != null) b3.b3Body_SetSleepThreshold(bodyId(h), sleepT)
    return h
  })
  const st = () => { const t = performance.now(); E.step(DT, sub); return [performance.now() - t, prof()] }
  let k = 0
  for (; k < 30 * 60; k++) { st(); if (k % 30 === 29 && awakeShare(hs) === 0) break }
  const settleS = +((k + 1) / 60).toFixed(1)
  const c = E.counters(), touch = touching(hs)
  const rest = []; for (let i = 0; i < 300; i++) rest.push(st()[0])
  const restAwake = +awakeShare(hs).toFixed(2)
  blast(hs)
  const bl = [], aw = []
  for (let i = 0; i < 900; i++) { bl.push(st()[0]); if (i % 30 === 29) aw.push(+awakeShare(hs).toFixed(2)) }
  const blSum = bl.reduce((a, b) => a + b, 0)
  // Asleep vs disabled: the same pile frozen out of the world.
  for (let i = 0; i < 20 * 60 && awakeShare(hs) > 0; i++) st()
  const asleep = []; for (let i = 0; i < 300; i++) asleep.push(st()[0])
  for (const h of hs) E.setEnabled(h, false)
  const off = []; for (let i = 0; i < 300; i++) off.push(st()[0])
  for (const h of hs) E.destroyBody(h)
  const none = []; for (let i = 0; i < 300; i++) none.push(st()[0])
  return { shape, sub, sleepT, rep, settleS, contacts: c.contacts, touch, restAwake, rest: stat(rest), blast: stat(bl), blast15sSumMs: +blSum.toFixed(0),
    asleep: stat(asleep), disabled: stat(off), empty: stat(none),
    awakeAt: { '1s': aw[1], '3s': aw[5], '5s': aw[9], '10s': aw[19], '15s': aw[29] } }
}

const dflt = b3.b3DefaultWorldDef(), bdef = b3.b3DefaultBodyDef()
console.error(`world def: enableSleep ${dflt.enableSleep} enableContinuous ${dflt.enableContinuous} contactHertz ${dflt.contactHertz} damping ${dflt.contactDampingRatio} contactSpeed ${dflt.contactSpeed} maxLinSpeed ${dflt.maximumLinearSpeed} · body def: sleepThreshold ${bdef.sleepThreshold} enableSleep ${bdef.enableSleep}`)
console.error(`road stretch at (${c0.x.toFixed(0)}, ${c0.z.toFixed(0)}), N ${N}, ${LEVER ? 'lever mode' : `reps ${REPS}`}`)

if (!LEVER) {
  for (let rep = 0; rep < REPS; rep++) {
    const r = mainRun(rep)
    if (JSON_OUT) console.log(JSON.stringify(r))
    else console.log(`${SHAPE}/${MIX} N ${N} rep ${rep} | mass ${JSON.stringify(r.massKg)} touch/rock ${r.touchRest}→${r.touchResettle} restAwake ${r.restAwake.at(-1)} walk ${r.rest.walk.p50}/${r.plough.walk.p50} slide rest ${r.rest.slide.p50}/${r.rest.slide.p99} blast2s ${r.blastFirst2s.slide.p50}/${r.blastFirst2s.slide.p99} plough ${r.plough.slide.p50}/${r.plough.slide.p99} | spawn ${r.spawnMs} ms settle ${r.settleS} s contacts ${r.contactsRest} | base ${r.base.total.p50}/${r.base.total.p99} | rest ${r.rest.total.p50}/${r.rest.total.p99} (eng ${r.rest.eng.p50}, debrisJs ${r.rest.debrisJs.p50}) | blast2s ${r.blastFirst2s.total.p50}/${r.blastFirst2s.total.p99} (pairs ${r.blastFirst2s.pairs.p50} collide ${r.blastFirst2s.collide.p50} solve ${r.blastFirst2s.solve.p50}) awake ${r.blastAwake.join(' ')} | plough ${r.plough.total.p50}/${r.plough.total.p99} (eng ${r.plough.eng.p50})`)
  }
} else {
  E.setEnabled(w.chassis, false)
  const cases = [{ shape: 'hull42' }, { shape: 'oblong' }, { shape: 'hull12' }, { shape: 'sphere' }, { shape: 'box' }, { shape: 'hull42', sub: 4 }, { shape: 'hull42', sleepT: 0.15 }, { shape: 'hull42', sleepT: 0.3 }]
  for (const c of cases) for (let rep = 0; rep < REPS; rep++) {
    const r = leverRun({ ...c, rep })
    console.log(JSON_OUT ? JSON.stringify(r) : `${r.shape} sub ${r.sub} sleepT ${r.sleepT ?? 'dflt'} rep ${rep} | settle ${r.settleS} s contacts ${r.contacts} touch/rock ${r.touch} awake after rest ${r.restAwake} | rest ${r.rest.p50}/${r.rest.p99} | blast ${r.blast.p50}/${r.blast.p99} sum15s ${r.blast15sSumMs} ms awake ${JSON.stringify(r.awakeAt)} | asleep ${r.asleep.p50} disabled ${r.disabled.p50} empty ${r.empty.p50}`)
  }
}
w.dispose()
process.exit(0)
