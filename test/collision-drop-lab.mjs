// test/collision-drop-lab.mjs — SM-3 collision + drop instrument. RAINY-DAY, not a gate.
//
// Two questions this answers, both of which cost a session each when guessed at:
//
//   COLLISION  Is the impact the damage model prices the impact the truck actually had? The model
//              converts contact impulse to an equivalent speed (v_eq = J/mass, "the speed this hit
//              would have shed had it stopped the truck dead"). The only honest check is against
//              the vehicle's OWN velocity across the hit — measure Δv, compare. A 30 mph strike
//              reading 90 is a 3x conversion error, not an opinion.
//
//   DROP       What each drop height actually produces at every stage of the chain: tire
//              compression, bump-stop force, rim load, and the damage each of those causes. The
//              chain matters because the stages are coupled — stiffening the tire moved the
//              bump-stop forces 5x and silently destroyed the springs.
//
// The collision target is the lab ramp's BACK WALL: approach the ramp from behind (−Z) and it is a
// solid vertical face, not a ramp. Repeatable, flat-on, and no props needed.
//
// Requires the dev server, and ?prof=1 for window.__tp / window.__vehicleState.
//   node test/collision-drop-lab.mjs [port] [cdpPort]

import { spawn } from 'child_process'

const PORT = process.argv[2] || 3686
const CDP  = process.argv[3] || 9431
const sleep = ms => new Promise(r => setTimeout(r, ms))
const MPH = 0.44704

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=/tmp/cdl-${CDP}`,
   '--use-angle=metal', '--window-size=900,600', `http://localhost:${PORT}/index.html?prof=1`],
  { stdio: 'ignore', detached: true })
await sleep(3500)
const list = await (await fetch(`http://localhost:${CDP}/json/list`)).json()
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
async function ev (x) {
  const m = await send('Runtime.evaluate', { expression: x, returnByValue: true })
  if (m.result?.exceptionDetails) throw new Error(m.result.exceptionDetails.text + ' :: ' + x.slice(0, 60))
  return m.result?.result?.value
}
const key = (t, k, c, v) => send('Input.dispatchKeyEvent', { type: t, key: k, code: c, windowsVirtualKeyCode: v, nativeVirtualKeyCode: v })

await send('Page.enable'); await send('Runtime.enable')
console.log('booting…'); await sleep(20000)
await ev(`document.getElementById('pm-lab').click(); true`); await sleep(7000)
await ev(`document.querySelector('canvas').focus(); true`)
if (await ev('typeof window.__tp') !== 'function') throw new Error('need ?prof=1')

// Instrument every stage of the chain, at the PHYSICS step. Speed history is kept so the collision
// test can read the truck's own velocity either side of the hit rather than trusting the model.
await ev(`(() => {
  const d = window.__damage, os = d.step.bind(d), of_ = d.feedContact.bind(d)
  window.__T = { reset () { Object.assign(window.__T, {
    bump: 0, rimDeb: 0, rimRoad: 0, tireFz: 0, maxNs: 0, landed: [], spd: [] }) } }
  window.__T.reset()
  d.step = (vs, p, dt) => {
    const T = window.__T
    for (let i = 0; i < 4; i++) {
      const b = Math.abs(vs.bumpForce?.[i] || 0);      if (b > T.bump) T.bump = b
      const r = vs.rimForce?.[i] || 0;                 if (r > T.rimDeb) T.rimDeb = r
      const q = vs.rimForceRoad?.[i] || 0;             if (q > T.rimRoad) T.rimRoad = q
      const f = vs.wheelDebug?.[i]?.fz || 0;           if (f > T.tireFz) T.tireFz = f
    }
    const v = vs.velocity
    T.spd.push(Math.hypot(v.x, v.z) / 0.44704)
    if (T.spd.length > 4000) T.spd.shift()
    return os(vs, p, dt)
  }
  // FORWARD EVERY ARGUMENT. A hook with a fixed arity silently drops later parameters, and this
  // one dropped the velocity feedContact prices the hit on — so the instrument exercised the old
  // impulse path and reported collisions healthy while they were dead in the game.
  d.feedContact = (...a) => {
    if (a[1] > window.__T.maxNs) window.__T.maxNs = a[1]
    const res = of_(...a)
    if (res) window.__T.landed.push({ region: res.region, mph: +(res.v / 0.44704).toFixed(1) })
    return res
  }
  return true })()`)

const cond = async () => JSON.parse(await ev('JSON.stringify(window.__damage.condition)'))
const trace = async () => JSON.parse(await ev('JSON.stringify(window.__T)'))
const fresh = () => ev(`window.__damage.setAll(1); window.__damage.publish(window.__damage.params); window.__T.reset(); true`)
const lost = (a, b, k) => (a[k] - b[k]) * 100

// ── COLLISION ────────────────────────────────────────────────────────────────────────────────
// Ramp crest is z=-20; approach from -Z so the back wall is a flat vertical face.
if (process.env.SKIP_COLL) { console.log('(collision pass skipped)') } else {
console.log('\n═══ COLLISION into the ramp back wall ═══')
console.log('  impact   actual Δv    impulse      model says    ratio   armorFront')
console.log('  ' + '─'.repeat(68))
// Open-loop on purpose: closed-loop speed control over CDP costs a round trip every 50 ms and
// turns a four-point sweep into ten minutes. Hold the throttle for a fixed time, let it hit, and
// read the speed the truck ACTUALLY had out of the trace — which is the number that matters here.
for (const holdS of [1.2, 2.0, 3.0, 4.5]) {
  await ev(`window.__tp(0, -60, Math.PI); true`); await sleep(2600)
  await fresh()
  const a = await cond()
  await key('keyDown', 'w', 'KeyW', 87)
  await sleep(holdS * 1000)
  await key('keyUp', 'w', 'KeyW', 87)
  await sleep(3500)                      // coast into the wall and settle
  const b = await cond(); const T = await trace()
  const pk = T.spd.indexOf(Math.max(...T.spd))
  const after = Math.min(...T.spd.slice(pk, pk + 250))
  const dv = T.spd[pk] - after
  const modelled = T.landed.length ? Math.max(...T.landed.map(x => x.mph)) : 0
  console.log(`  ${T.spd[pk].toFixed(0).padStart(3)} mph  ${dv.toFixed(1).padStart(7)} mph  ${(T.maxNs).toFixed(0).padStart(8)} N·s  `
    + `${modelled.toFixed(1).padStart(8)} mph  ${(modelled / (dv || 1)).toFixed(2).padStart(6)}x  ${lost(a, b, 'armorFront').toFixed(2)}%`)
}

}
// ── DROPS ────────────────────────────────────────────────────────────────────────────────────
console.log('\n═══ DROP: the whole chain, stage by stage ═══')
console.log('  height   tire Fz    bump      rim(road)  rim(deb)   spring%   wheel%   camberFL')
console.log('  ' + '─'.repeat(68))
for (const h of [0.5, 1.0, 2.0, 3.0]) {
  await ev(`window.__tp(60, 40, -Math.PI/2); true`); await sleep(2200)
  await fresh()
  const a = await cond()
  await ev(`window.__tp(60, 40, -Math.PI/2, ${h}); true`); await sleep(3000)
  const b = await cond(); const T = await trace()
  console.log(`  ${h.toFixed(1)} m  ${(T.tireFz / 1000).toFixed(1).padStart(8)} kN ${(T.bump / 1000).toFixed(1).padStart(8)} kN`
    + ` ${(T.rimRoad / 1000).toFixed(1).padStart(9)} kN ${(T.rimDeb / 1000).toFixed(1).padStart(8)} kN`
    + ` ${lost(a, b, 'springFront').toFixed(1).padStart(8)}% ${lost(a, b, 'wheelFL').toFixed(1).padStart(7)}%`
    + ` ${(await ev('window.__damage.camberOffsetDeg[0]')).toFixed(3).padStart(9)}°`)
}
const TH = JSON.parse(await ev(`(() => { const p = window.__damage.params, D = window.__damage.constructor
  return JSON.stringify({ sw: D.staticWheelLoad(p) }) })()`))
console.log('\n  target shape (owner): 1 m damages SPRINGS only; 2 m damages springs AND rim;'
  + ' alignment only on REALLY hard bumps.')

ws.close(); process.kill(-chrome.pid, 'SIGKILL'); process.exit(0)
