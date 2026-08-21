// test/lab-wear-drive.mjs — SM-3 wear-rate measurement on the FEAT-31 lab rig. RAINY-DAY, not a gate.
//
// The wear rates cannot be fitted from pure maths, because the question is not "what does the model
// integrate" but "how long should a part last given the roughest thing the player can actually
// drive on". So this drives the real game, in the real lab, over the real rig, and reports each
// track's %/min alongside the raw signal that produced it.
//
//   COARSE RUMBLE LANE (z=86, 200 mm crests @ 1 m) — the damper track's worst case. The owner's tip
//     (2026-08-20): there is a resonant sweet spot around 20 mph where suspension displacement and
//     velocity peak. The truck struggles to hold that ON the lane — it scrubs speed off — so the
//     controller below asks for a target and reports what it actually held.
//   FLAT STRIP — the control. A well-placed damper floor reads exactly ZERO here.
//   REPEATED DROPS from 0.9 m — the spring track. Bump stops are the only thing that wears a
//     spring, and the rumble lane never engages them, so a drop is the only clean way to load one.
//
// Requires: dev server running, and the page loaded with ?prof=1 — window.__tp (the teleport
// harness handle) only exists under that flag, and calling it without one fails SILENTLY, which
// costs an afternoon of measuring the flat strip and calling it a rumble lane.
//
//   node test/lab-wear-drive.mjs [port] [cdpPort]

import { spawn } from 'child_process'

const PORT = process.argv[2] || 3686
const CDP  = process.argv[3] || 9240
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`,
  `--user-data-dir=/tmp/lab-wear-${CDP}`, '--use-angle=metal', '--window-size=900,600',
  `http://localhost:${PORT}/index.html?prof=1`], { stdio: 'ignore', detached: true })
await sleep(3000)

const list = await (await fetch(`http://localhost:${CDP}/json/list`)).json()
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
/** Evaluate in the page. THROWS on a page-side exception — the silent-undefined version of this
 *  helper is what hid the missing ?prof=1 for three measurement runs. */
async function ev (expression) {
  const m = await send('Runtime.evaluate', { expression, returnByValue: true })
  if (m.result?.exceptionDetails) throw new Error(`page: ${m.result.exceptionDetails.text} — ${expression.slice(0, 60)}`)
  return m.result?.result?.value
}
const key = (t, k, c, v) => send('Input.dispatchKeyEvent', { type: t, key: k, code: c, windowsVirtualKeyCode: v, nativeVirtualKeyCode: v })

await send('Page.enable'); await send('Runtime.enable')
console.log('booting the world…'); await sleep(20000)
await ev(`document.getElementById('pm-lab').click(); true`); await sleep(7000)
await ev(`document.querySelector('canvas').focus(); true`)
if (await ev('typeof window.__tp') !== 'function') throw new Error('window.__tp missing — load with ?prof=1')

// Sample at the PHYSICS step, never on a timer: the rumble input is ~9 Hz and a 16 ms setInterval
// aliases it into noise (measured strut peaks came out 10x low). damageModel.step runs once per
// fixed step, so wrapping it sees every one.
await ev(`(() => { const d = window.__damage, orig = d.step.bind(d)
  window.__pk = { strut: 0, bump: 0, comp: 0, n: 0, sum: 0 }
  d.step = (vs, p, dt) => { const P = window.__pk
    for (let i = 0; i < 4; i++) {
      const s = Math.abs(vs.strutCompVel?.[i] || 0); P.n++; P.sum += s; if (s > P.strut) P.strut = s
      const c = Math.abs(vs.strutComp?.[i] || 0);    if (c > P.comp)  P.comp  = c
      const b = Math.abs(vs.bumpForce?.[i] || 0);    if (b > P.bump)  P.bump  = b
    }
    return orig(vs, p, dt) }
  return true })()`)

const cond  = async () => JSON.parse(await ev('JSON.stringify(window.__damage.condition)'))
const peaks = async () => JSON.parse(await ev('JSON.stringify(window.__pk)'))
const reset = () => ev(`window.__damage.setAll(1); window.__damage.publish(window.__damage.params)
  window.__pk = { strut: 0, bump: 0, comp: 0, n: 0, sum: 0 }; true`)
const speedMph = () => ev(`(() => { const v = window.__vehicleState().velocity
  return Math.hypot(v.x, v.z) / 0.44704 })()`)

const W = ['w', 'KeyW', 87]; let wDown = false
const setW = async on => { if (on !== wDown) { await key(on ? 'keyDown' : 'keyUp', ...W); wDown = on } }
const TRACKS = ['damperFront', 'damperRear', 'springFront', 'springRear', 'wheelFL', 'tireFL']

/** Hold a target speed (throttle on/off — never S, which is reverse) and report the wear it cost. */
async function hold (label, targetMph, secs) {
  await reset()
  const a = await cond(), t0 = Date.now(), seen = []
  while ((Date.now() - t0) / 1000 < secs) {
    const v = await speedMph(); seen.push(v || 0)
    await setW(v < targetMph)
    await sleep(60)
  }
  await setW(false); await sleep(400)
  const b = await cond(), pk = await peaks()
  const rate = k => (a[k] - b[k]) / secs * 60 * 100
  console.log(`\n=== ${label} — asked ${targetMph} mph, held ${(seen.reduce((s, x) => s + x, 0) / seen.length).toFixed(1)} ===`)
  for (const k of TRACKS) {
    const r = rate(k)
    console.log(`  ${k.padEnd(12)} ${r.toFixed(3)} %/min` + (r > 1e-5 ? ` → dead in ${(100 / r).toFixed(0)} min` : ''))
  }
  console.log(`  strut |v| mean ${(pk.sum / pk.n).toFixed(3)} peak ${pk.strut.toFixed(2)} m/s`)
  console.log(`  strutComp peak ${(pk.comp * 1000).toFixed(0)} mm · bump peak ${(pk.bump / 1000).toFixed(1)} kN`)
}

/** Teleport onto a lane and refuse to measure if it did not land — see the ?prof=1 note above. */
async function placeOn (x, z) {
  await ev(`window.__tp(${x}, ${z}, -Math.PI / 2); true`); await sleep(3500)
  const p = JSON.parse(await ev('JSON.stringify(window.__vehicleState().position)'))
  if (Math.abs(p.z - z) > 3) throw new Error(`teleport failed — truck at z=${p.z.toFixed(1)}, wanted ${z}`)
}

for (const mph of [15, 20, 25]) { await placeOn(3, 86); await hold('COARSE RUMBLE 200 mm @ 1 m', mph, 16) }
await placeOn(3, 40); await hold('FLAT strip — the control', 20, 16)

// Drops: the only clean bump-stop load. 0.9 m is the owner's height (2026-08-20).
await reset()
const a = await cond(), DROPS = 6
for (let i = 0; i < DROPS; i++) { await ev(`window.__tp(60, 40, -Math.PI / 2, 0.9); true`); await sleep(2600) }
const b = await cond(), pk = await peaks()
console.log(`\n=== ${DROPS} x 0.9 m DROP onto flat ===`)
for (const k of ['springFront', 'springRear', 'damperFront', 'wheelFL']) {
  const lost = a[k] - b[k]
  console.log(`  ${k.padEnd(12)} ${(lost * 100).toFixed(3)}% total → ${(lost * 100 / DROPS).toFixed(4)}%/drop`
    + (lost > 0 ? ` ⇒ ${Math.round(DROPS / lost)} drops to destroy` : ''))
}
console.log(`  bump peak ${(pk.bump / 1000).toFixed(1)} kN · strut peak ${pk.strut.toFixed(2)} m/s · strutComp peak ${(pk.comp * 1000).toFixed(0)} mm`)

ws.close(); process.kill(-chrome.pid, 'SIGKILL'); process.exit(0)
