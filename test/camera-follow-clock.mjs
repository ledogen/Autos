// test/camera-follow-clock.mjs — BUG-102: the chase camera trails the truck by the same distance at any load.
//
// The real updateCamera (src/camera.js) behind a truck holding 25 m/s, on four frame schedules:
//   a. 60 fps — the signed-off feel, the band every other schedule is held to;
//   b. PERF-32 slow motion — 15 fps of wall time carrying one physics step each (the sim at a quarter speed);
//   c. slow motion and recovery, alternating every 2 s — the trail must not jump when the frame rate comes back;
//   d. bursty — 16 ms frames with a clamped 250 ms frame every half second, the sim catching up in full: both clocks
//      agree, so the follow is bit-identical to the old one (a long frame lands the camera nearer, never behind).
// The chase follow runs on the DRAWN truck's sim clock (main.js passes it); on the wall clock (the old call,
// updateCamera(cam, vs, dt)) schedule b pulls in tight around the slow-motion truck and c drops back behind it
// on every recovery — the owner's "the camera drops behind the truck when the game lags". Printed for contrast.
//
// Pure node: three + a one-line `document` stub (camera.js registers its input listeners at load).
globalThis.document ??= { addEventListener () {} }
const THREE = await import('three')
const { updateCamera, snapCamera } = await import('../src/camera.js')

let fails = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fails++ }
const V = 25, STEP = 1 / 60

/** Drive `secs` of frames from `schedule(i) → { wall, sim }`; returns the horizontal trail per frame. */
function run (schedule, secs, { wallClock = false } = {}) {
  const cam = new THREE.PerspectiveCamera()
  const vs = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), velocity: new THREE.Vector3(0, 0, -V),
    angularVelocity: new THREE.Vector3(), throttle: 0.5, brake: 0 }
  snapCamera(); updateCamera(cam, vs, STEP, STEP)
  const trail = [], still = []
  for (let i = 0, t = 0; t < secs; i++) {
    const { wall, sim } = schedule(i)
    vs.position.z -= V * sim
    const before = cam.position.clone()
    updateCamera(cam, vs, wall, wallClock ? wall : sim)
    trail.push(Math.hypot(cam.position.x - vs.position.x, cam.position.z - vs.position.z))
    if (sim > 0 && cam.position.distanceTo(before) < 1e-4) still.push(i)
    t += wall
  }
  return { trail, still }
}
const settled = (r) => { const s = r.trail.slice(Math.floor(r.trail.length / 2)); return { lo: Math.min(...s), hi: Math.max(...s) } }

const SCHED = {
  '60 fps': () => ({ wall: STEP, sim: STEP }),
  'PERF-32 slow motion (15 fps wall, one step each)': () => ({ wall: 1 / 15, sim: STEP }),
  'slow motion ↔ recovery every 2 s': (i) => (Math.floor(i / 60) % 2 ? { wall: 1 / 15, sim: STEP } : { wall: STEP, sim: STEP }),
  'bursty (a clamped 250 ms frame every 0.5 s)': (i) => (i % 30 === 29 ? { wall: 0.25, sim: 0.25 } : { wall: STEP, sim: STEP }),
}
const base = settled(run(SCHED['60 fps'], 10))
console.log(`60 fps trail: ${base.lo.toFixed(2)}–${base.hi.toFixed(2)} m behind the truck at ${V} m/s`)
const band = (r) => r.lo > base.lo * 0.97 && r.hi < base.hi * 1.03

for (const [name, sched] of Object.entries(SCHED).slice(1)) {
  const now = run(sched, 16), old = run(sched, 16, { wallClock: true }), n = settled(now), o = settled(old)
  if (name.startsWith('bursty')) {
    // The sim keeps up with wall time here, so both clocks are the same number and the follow is bit-identical. The
    // dip on each 250 ms frame is the exponential's own step (it takes the goal's END position for the whole frame,
    // so a long frame lands nearer) — load-independent, and the signed-off feel at 60 fps depends on that same lerp.
    ok(!now.still.length && n.lo === o.lo && n.hi === o.hi, `${name}: ${n.lo.toFixed(2)}–${n.hi.toFixed(2)} m, identical to the`
      + ` wall-clock follow, never still (a long frame lands the camera nearer for a frame, never behind)`)
    continue
  }
  ok(band(n) && !now.still.length, `${name}: ${n.lo.toFixed(2)}–${n.hi.toFixed(2)} m, never still while the truck moves`
    + ` (the wall-clock follow: ${o.lo.toFixed(2)}–${o.hi.toFixed(2)} m)`)
  ok(!band(o), `…the wall-clock follow leaves the band there, as the owner saw`)   // the gate has teeth
}

console.log(fails ? `\n${fails} FAILED` : '\ncamera-follow-clock: ALL OK')
process.exit(fails ? 1 : 0)
