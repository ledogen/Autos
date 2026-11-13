// test/audio-clock-guard.mjs — PERF-47: the per-frame audio updates stop scheduling AudioParam events
// while the context's clock stands still, and start again when it moves.
//
// A wedged host audio daemon stops a running AudioContext's clock; the browser then never retires the
// setTargetAtTime events the game queues every frame, and main-thread cost climbs without bound. This
// drives every per-frame entry main.js calls, against a fake AudioContext whose currentTime we hold,
// and counts the events scheduled: live → every frame schedules; stalled → none after the guard's
// window; live again → scheduling resumes; a hidden-tab gap (wall jumps, clock suspended) costs no hold.
let wall = 1000, clock = 0, events = 0
Object.defineProperty(globalThis, 'performance', { value: { now: () => wall }, configurable: true, writable: true })
globalThis.fetch = () => Promise.reject(new Error('no network in the gate'))
const warn = console.warn; console.warn = (...a) => { if (!String(a[0]).includes('audio')) warn(...a) }

// An AudioParam (or any node method): callable as a no-op, and every method read off it counts one scheduled event.
const param = () => new Proxy(Object.assign(function () {}, { value: 0 }), { get: (o, k) => k in o ? o[k] : () => { events++ } })
const node = () => {
  const o = { connect () {}, disconnect () {}, start () {}, stop () {}, getChannelData: () => new Float32Array(16), duration: 1 }
  return new Proxy(o, { get: (t, k) => k in t ? t[k] : (t[k] = param()), set: (t, k, v) => { t[k] = v; return true } })
}
class FakeCtx {
  constructor () { this.state = 'running'; this.sampleRate = 48000; this.destination = node() }
  get currentTime () { return clock }
  resume () { return Promise.resolve() }
  suspend () { return Promise.resolve() }
  decodeAudioData () { return Promise.reject(new Error('no decode in the gate')) }
}
for (const m of ['createGain', 'createOscillator', 'createBiquadFilter', 'createBufferSource', 'createBuffer', 'createConvolver',
  'createDelay', 'createDynamicsCompressor', 'createPeriodicWave']) FakeCtx.prototype[m] = function () { const n = node(); n.context = this; return n }
globalThis.window = globalThis
globalThis.AudioContext = FakeCtx

const E = await import('../src/engine-audio.js')
const T = await import('../src/tire-audio.js')
const W = await import('../src/wind-audio.js')
const A = await import('../src/ambient-audio.js')
const K = await import('../src/knock-audio.js')
const R = await import('../src/rank-music.js')
E.ensureEngineAudio(); K.ensureKnockAudio(); T.ensureTireAudio(); W.ensureWindAudio(); A.ensureAmbientAudio(); R.startRankMusic()
A.setAmbientAudio(true, 0.5, 0.5); K.setKnockAudio(true, 0.5)

const vs = { position: { x: 0, y: 0, z: 0 }, velocity: { x: 12, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } }
const params = { wheelbase: 2.85, trackFront: 1.5, trackRear: 1.5, wheelRadius: 0.36, cgHeight: 0.6, mass: 1500, weightFront: 0.55, weightRear: 0.45 }
const DT = 1 / 60
// One frame of main.js's audio block (the frame loop's per-frame calls), then the wall moves on.
function frame (clockRuns) {
  const before = events
  E.updateEngineAudio(1500, 0.3, true, 6, null)
  K.updateKnockAudio(0.1, 1500, 0.3, true)
  E.startCrankAudio(200)
  T.updateTireAudio(vs, params, () => 1)
  W.updateWindAudio(vs)
  E.setCabView(false)
  E.setInTunnel(true)
  A.updateAmbientAudio(4, 1, 0.5, DT)
  R.updateRankMusic(0.5, 0)
  wall += DT * 1000
  if (clockRuns) clock += DT
  return events - before
}
const run = (n, clockRuns) => Array.from({ length: n }, () => frame(clockRuns))
const sum = a => a.reduce((s, x) => s + x, 0)

let fail = 0
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail++ }

const live = run(120, true)
check(Math.min(...live) >= 20, `live clock: every frame schedules (min ${Math.min(...live)}, mean ${(sum(live) / live.length).toFixed(0)} events/frame)`)

const stalled = run(600, false)   // 10 s with the clock held
const tail = sum(stalled.slice(30))
check(tail === 0, `stalled clock: 0 events after the first 0.5 s (got ${tail}; ${sum(stalled)} over 10 s, ${sum(live) / 2} per second when live)`)

const back = run(60, true)
const firstLive = back.findIndex(x => x > 0)
check(firstLive >= 0 && firstLive * DT <= 0.5 && Math.min(...back.slice(firstLive)) >= 20, `clock moves again: scheduling resumes after ${(firstLive * DT).toFixed(2)} s and stays on`)

wall += 5000   // a hidden tab: rAF stops, the context is suspended, then both come back together
const shown = run(30, true)
check(Math.min(...shown) >= 20, `after a 5 s hidden-tab gap the live clock schedules from the first frame (min ${Math.min(...shown)})`)

console.warn = warn
console.log(fail ? `\n${fail} FAILED` : '\nALL PASS')
process.exit(fail ? 1 : 0)
