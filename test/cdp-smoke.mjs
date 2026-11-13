// test/cdp-smoke.mjs — INFRA-07: the in-browser behaviour gate for the code no other gate imports.
//
// main.js (frame loop, fixed-step accumulator, every mode transition, HUD, debug panel) is glue no
// headless gate reaches: review-2's `_hintAt` ReferenceError threw on every wheel query, froze the
// truck, and every affected gate stayed green (facb92d). This boots the real app in Chrome over
// CDP (Chrome DevTools Protocol — Chrome's remote-control channel), drives it through each mode,
// and fails on ANY console error or uncaught exception, naming the step it happened in.
//
// It starts its OWN Vite dev server on a free port, rooted at THIS checkout — never the :8000 that
// is usually up, because that one may be serving a different worktree than the code under test.
// No Chrome at $CHROME_BIN → SKIP (exit 0), so a box without it stays green.
// Registered as `browser: true` in gates.mjs: run-all only runs it with --browser or CDP_SMOKE=1.
//
// USAGE: node test/cdp-smoke.mjs [--headed]

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { cpus, loadavg } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHROME, launchChrome, connect, sleep } from './lib/cdp.mjs'
import { ECONOMY_PARAMS } from '../src/economy.js'
import { DAY_PARAMS } from '../src/day.js'
import { SHOP_TYPES } from '../src/shop-stock.js'   // FEAT-104: the brake at any of these opens its shop screen

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
if (!existsSync(CHROME)) { console.log(`SKIP (no Chrome at ${CHROME})`); process.exit(0) }

const freePort = () => new Promise(r => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const [HTTP, CDP] = [await freePort(), await freePort()]

const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(HTTP), '--strictPort'],
  { cwd: ROOT, stdio: 'ignore' })
const shutdown = () => { try { vite.kill() } catch {} }
process.on('exit', shutdown)

// INFRA-08: every wall-clock ceiling in here is a HANG GUARD, never a speed test, and a loaded box (other lanes'
// suites, the owner's game on the same machine) runs the page slower — the region warm on a contended pool, the
// sim in slow motion. The 2026-11-05 landing smokes failed on exactly that, never on code. So every ceiling
// stretches by how slow the box is right now: the boot step's own time over an idle boot, or the 1-min load
// average per core if that climbs higher later. The boot is the right yardstick because it is built the way a
// story load is, a slice per rendered frame (a 13 s boot went with a 4.1× story load), so it also feels the GPU.
// The load average alone cannot: with the owner's game on the GPU the page drew 12–14 fps and booted 17× idle
// at 1.8/core. An idle box keeps the base ceilings; past TOO_SLOW× the run stops at boot (an hour-long smoke
// speaks for nothing).
const BOOT_IDLE_S = 3.5, TOO_SLOW = 10   // this Mac's idle boot: 3.3–3.5 s
let bootX = 0, peakX = 1   // bootX: 0 until the boot step has measured it · peakX: the summary line's worst stretch
const stretch = () => { const x = bootX ? Math.max(1, bootX, loadavg()[0] / cpus().length) : 1; peakX = Math.max(peakX, x); return x }
// Poll fn until it returns truthy (resolves with that value) or ms × stretch() elapse (resolves null).
async function until (fn, ms, every = 100) {
  const t0 = performance.now()
  for (let x = stretch(); performance.now() - t0 < ms * x; x = Math.max(x, stretch())) { const v = await fn(); if (v) return v; await sleep(every) }
  return null
}
if (!await until(() => fetch(`http://localhost:${HTTP}/`).then(r => r.ok, () => false), 15000, 200)) {
  console.error(`FAIL: vite never served :${HTTP}`); process.exit(1)
}

const { cleanup } = launchChrome('about:blank', { port: CDP, headed: process.argv.includes('--headed') })
const client = await connect({ port: CDP })
// SMOKE_CPU_THROTTLE=4: this Chrome runs its page 4× slower (CDP Emulation) — a loaded machine's timing, repeatably,
// without loading the machine. For chasing load-only flakes; a landing never sets it.
if (process.env.SMOKE_CPU_THROTTLE) await client.cmd('Emulation.setCPUThrottlingRate', { rate: +process.env.SMOKE_CPU_THROTTLE })

// Every console error / uncaught exception, tagged with the step that was running.
let step = 'boot'
const errors = []
client.on('Runtime.consoleAPICalled', p => {
  if (p.type === 'error') errors.push({ step, msg: p.args.map(a => a.value ?? a.description ?? a.type).join(' ') })
})
client.on('Runtime.exceptionThrown', p => {
  const d = p.exceptionDetails
  errors.push({ step, msg: d.exception?.description ?? d.text })
})

const js = async expr => {
  // A CDP timeout names the call that hung — "Runtime.evaluate after 60000 ms" alone does not say where.
  const r = await client.evalJS(expr).catch(e => { throw new Error(`${e.message} — in: ${expr.replace(/\s+/g, ' ').slice(0, 120)}`) })
  if (r.err) throw new Error(`eval ${expr.slice(0, 60)}: ${r.err}`)
  return r.val
}
async function key (k, down, { shift = false } = {}) {
  const code = k.length === 1 && /[a-z]/i.test(k) ? `Key${k.toUpperCase()}` : ({ ' ': 'Space', '`': 'Backquote' })[k] ?? k
  await client.cmd('Input.dispatchKeyEvent', {
    type: down ? 'keyDown' : 'keyUp', key: shift && k.length === 1 ? k.toUpperCase() : k, code,
    modifiers: shift ? 8 : 0,   // CDP modifier bit 8 = Shift windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0,
  })
}
// Wait until the page has rendered ≥ n frames AND ≥ ms has passed (5 s cap: never hang the run).
const frames = async (n, ms) => {
  await js(`window.__frOk = false; { let k = 0; const t0 = performance.now()
    const f = () => (++k >= ${n} && performance.now() - t0 >= ${ms}) ? (window.__frOk = true) : requestAnimationFrame(f)
    requestAnimationFrame(f) }`)
  await until(() => js('window.__frOk'), 5000, 30)
}
// Held for ≥ 2 RENDERED frames, not a wall-clock 60 ms: key state is POLLED (vehicle.js keys[], read
// per physics step), so under load (another lane's suite) a 60 ms tap fell wholly between two frames
// and never happened — the brake/park flakes in service, offer and save. A player's tap is ~6 frames.
const tap = async (k, opts) => { await key(k, true, opts); await frames(2, 60); await key(k, false, opts) }
// INFRA-08: wait on the SIM, not the wall. Under load main.js abandons its catch-up debt and the sim runs in
// slow motion, so 8 s of wall-clock W bought 24.8 m. Poll fn until truthy (resolves with it) or the sim has
// run s seconds (resolves null). A sim that stops stepping for 10 s (× stretch) is a hang and fails right
// there, not at a ceiling — so only wait on the sim where it should be running.
async function untilSim (fn, s) {
  const t0 = await js('window.__simT()')
  let last = t0, seen = performance.now()
  for (;;) {
    const v = await fn(); if (v) return v
    const t = await js('window.__simT()')
    if (t - t0 >= s) return null
    if (t > last) { last = t; seen = performance.now() }
    check(performance.now() - seen < 10000 * stretch(), `the sim stopped stepping, ${(t - t0).toFixed(2)} of ${s} sim-s in`)
    await sleep(50)
  }
}
const simFor = s => untilSim(() => false, s)
// Teleport and wait for the SEAT, not a fixed sleep: the reseat awaits a network build, which under
// load outlasted 2.5 s — it then latched park after the step had already toggled the brake.
// Where a player parks at a giver (in-page, given a POI record): its marker — or, when the marker's own
// model reaches over it, the first point toward the road a truck-sized circle clears, inside the 10 m
// reach. Measured 2026-11-01: seated ON the farm's marker at (-936.5, 668.6) the truck starts inside the
// barn and is thrown out at 21 m/s, on main as on any branch; the save step stalled whenever the clock
// happened to post that farm's freight (it rolled 70–88 m off the pad, never taking the offer).
// A POI with a PARK box (FEAT-178: the shop's lift; ASSET-74: the store's lot) answers the brake only inside it: seat
// where a tow would (poi.js towSeat — its centre, along its long side), heading included. Callers spread this LAST.
const PAD_SEAT = `((q) => { const P = window.__poi(), y = (q.y ?? 0) + 0.8
  if (q.park) { const s = window.__towSeat(q); return { x: s.x, z: s.z, h: s.heading } }
  const dx = q.roadX - q.x, dz = q.roadZ - q.z, L = Math.hypot(dx, dz) || 1
  for (let t = 0; t <= Math.min(9, L); t += 0.5) {
    const x = q.x + dx / L * t, z = q.z + dz / L * t
    if (!P.queryContact(x, y, z, 3)) return { x, z }
  }
  return { x: q.x, z: q.z } })`
const seat = async (x, z, h) => {
  await js(`window.__seated = false; window.__teleport(${x}, ${z}, ${h}).then(() => { window.__seated = true })`)
  check(await until(() => js('window.__seated'), 30000, 250), `teleport to (${x.toFixed(0)}, ${z.toFixed(0)}) never seated`)
  await simFor(1)   // the 0.5 m drop lands
}
// Park the way the owner does: hold Space (the handbrake — never reverse throttle, as S is past rest)
// until roughly at rest, then tap to latch. `fresh` first RELEASES a latched brake so the page sees a
// new parked EDGE (its park trigger is a ~10 Hz poll on that edge). A bare release-then-tap lost
// both ways under load: the truck rolled off the shop's slope (2.2 m/s, 7 m) before the re-tap, too
// fast to latch.
// At speed, the service brake (S) sheds it first: the handbrake is rear-wheels only, and on a steep
// descent a locked rear axle slides at an equilibrium speed instead of stopping (measured: 6.2 m/s
// after 30 s of Space on the papers step's road, and 15 → 23 m/s on seed 6's spawn hill). S lets go
// at 1.2 m/s — above REV_THRESHOLD (0.56 m/s, below it S is reverse) and under PARK_SPEED (1.39 m/s),
// so the Space press that follows latches the park brake (all four wheels) at once.
const park = async (fresh = false) => {
  if (fresh && await js('window.__vs.parked')) { await tap(' '); await frames(4, 250) }
  if (await js('window.__vs.velocity.length() > 1.2')) {
    await key('s', true)
    await until(() => js('window.__vs.velocity.length() < 1.2'), 15000)
    await key('s', false)
  }
  await key(' ', true)
  await frames(4, 250)
  await until(() => js('window.__vs.velocity.length() < 0.5'), 30000)
  await key(' ', false); await frames(2, 60)
  if (!await js('window.__vs.parked')) await tap(' ')
}
const hold = async (k, s) => { await key(k, true); await simFor(s); await key(k, false) }   // s SIM seconds
// BUG-118: way off the tutorial's line (45 m for 2 s, paper-route.js RR_PARAMS), the GPS re-plans from the truck
// to the same door. It seats the truck ON THE ROAD at the nearest POI 150 m off the line and no nearer the door than
// it is now, so the halfway lesson does not land early. On the road, not the pad: from a pad ~12 m off its road
// (outside every footprint) queryNearest can answer a point up to ~160 m along the road, which the re-plan would
// start from (a road.js D4 issue of its own, reported 11-07; a driver who has strayed is on a road).
const strayCheck = async (what) => {
  const far = await js(`(() => { const g = window.__gps(), e = g.poly.at(-1), v = window.__vs.position
    const d0 = Math.hypot(e.x - v.x, e.z - v.z), dv = q => Math.hypot(q.x - v.x, q.z - v.z)
    const qs = window.__map2d()._getPois().map(q => ({ x: q.roadX, z: q.roadZ, h: Math.atan2(-q.tx, -q.tz) }))
      .filter(q => Math.hypot(e.x - q.x, e.z - q.z) > d0 && g.poly.every(p => Math.hypot(p.x - q.x, p.z - q.z) > 150))
    const q = qs.reduce((a, b) => (!a || dv(b) < dv(a) ? b : a), null)
    window.__g0 = g
    return q ? { ...q, ex: e.x, ez: e.z } : null })()`)
  check(far, `no POI far off the line ${what} to stray to`)
  if (!far) return
  await seat(far.x, far.z, far.h)
  check(await until(() => js('window.__gps() !== window.__g0'), 6000), `way off the line ${what}, the GPS did not re-plan (BUG-118)`)
  const g = await js(`(() => { const p = window.__gps().poly, v = window.__vs.position, nr = window.__roadSys().queryNearest(v.x, v.z, 200)
    return { start: Math.round(Math.hypot(p[0].x - v.x, p[0].z - v.z)), end: Math.round(Math.hypot(p.at(-1).x - ${far.ex}, p.at(-1).z - ${far.ez})),
      seat: [${Math.round(far.x)}, ${Math.round(far.z)}], truck: [Math.round(v.x), Math.round(v.z)], p0: [Math.round(p[0].x), Math.round(p[0].z)],
      road: nr?.point ? Math.round(Math.hypot(nr.point.x - v.x, nr.point.z - v.z)) : null } })()`)
  check(g.start < 20 && g.end < 30, `the re-planned line ${what} does not run from the truck to the same door: ${JSON.stringify(g)}`)
}
// FEAT-170: every new run opens on the firing; holding M a second (the prompt says so) skips it. FEAT-184 (owner,
// 2026-11-07): it lands at Larry's at 07:00, the casserole DELIVERED (no job in hand). Wall-clock: the hold is a
// real-time timer, not sim time.
const skipDone = () => js('window.__board().firstState() === "done" && window.__mission().state === "idle"')
const skipPeek = () => js('JSON.stringify({ first: window.__board().firstState(), ms: window.__mission().state })')
const skipOpening = async () => {
  check(await until(() => js('getComputedStyle(document.getElementById("dialogue-panel")).display !== "none"'), 3000), 'the run did not open on the firing')
  check(await js('getComputedStyle(document.getElementById("skip-hint")).display !== "none"'), 'no "hold M to skip" prompt over the firing')
  await key('m', true); await sleep(1300); await key('m', false)
  check(await until(skipDone, 8000), `holding M did not skip to the casserole delivered: ${await skipPeek()}`)
}
// FEAT-184: with "always skip the tutorial" on (the first skip turns it on), a new run starts where a skip lands — the
// casserole delivered at Larry's, no firing card. His welcome is up; read it off.
const autoSkipped = async () => {
  check(await until(skipDone, 8000), `"always skip the tutorial" did not start the run with the casserole delivered: ${await skipPeek()}`)
  const dlg = () => js('getComputedStyle(document.getElementById("dialogue-panel")).display !== "none"')
  check(await until(dlg, 3000), "no Larry's welcome on a run that skips the tutorial")
  check(/Casserole/.test(await js('document.getElementById("dialogue-panel").textContent')), "Larry's welcome is not the first card on a skipped run")
  for (let i = 0; i < 16 && await dlg(); i++) { await tap('Enter'); await sleep(250) }
  check(!await dlg(), "Larry's welcome did not close after 16 presses")
}
const car = () => js('window.__car()')
// A fake pad: navigator.getGamepads stubbed to one standard-mapping pad whose buttons and sticks are
// window.__fp.b / .axes (gamepad.js polls it every frame). padOff hands back the real one.
const padOn = () => js(`window.__realPads ??= navigator.getGamepads.bind(navigator)
  window.__fp = { axes: [0, 0, 0, 0], b: new Array(17).fill(0) }
  navigator.getGamepads = () => [{ index: 0, id: 'fake', mapping: 'standard', axes: __fp.axes,
    buttons: __fp.b.map(v => ({ value: v, pressed: v > 0.5, touched: v > 0 })) }]`)
const padOff = () => js('navigator.getGamepads = window.__realPads')
// A press of pad button i (standard mapping: 0 A · 2 X · 4 LB · 5 RB · 12–15 D-pad ↑ ↓ ← →), held 3 rendered frames.
const btn = async (i) => { await js(`__fp.b[${i}] = 1`); await frames(3, 80); await js(`__fp.b[${i}] = 0`); await frames(2, 60) }
const navFocus = () => js('(e => e && (e.id || e.dataset.track || e.dataset.tab || e.textContent.trim().slice(0, 30)))(document.querySelector(".nav-focus"))')
// Hold I (the ignition key) until the engine catches.
async function crank () {
  if (await js('window.__vs.ignition?.state') === 'running') return
  await key('i', true)
  const ok = await until(() => js('window.__vs.ignition?.state === "running"'), 6000)
  await key('i', false)
  check(ok, `engine never caught (ignition ${await js('window.__vs.ignition?.state')})`)
}
const fin = (...xs) => xs.every(Number.isFinite)

function check (cond, what) { if (!cond) throw new Error(what) }

// ── Scenarios: run in order, one Chrome session ─────────────────────────────
let home = null
const STEPS = [
  ['boot', async () => {
    // INFRA-08: the boot is the box's speed test (see stretch). Past TOO_SLOW × an idle boot this run cannot
    // speak for the code — it says so now, rather than failing on whichever step the load lands on.
    const t0 = performance.now()
    await client.cmd('Page.navigate', { url: `http://localhost:${HTTP}/index.html?nomenu=1&seed=6` })
    const ready = await until(() => js('window.__rsReady === true'), TOO_SLOW * BOOT_IDLE_S * 1000, 250)
    const s = (performance.now() - t0) / 1000
    check(ready, `__rsReady never set in ${s.toFixed(0)} s (${TOO_SLOW}× an idle boot, load ${(loadavg()[0] / cpus().length).toFixed(1)}/core): `
      + 'a hang, or a box too loaded to judge the code — rerun alone')
    bootX = s / BOOT_IDLE_S
    home = await car()
    check(fin(home.x, home.y, home.z), `truck position not finite: ${JSON.stringify(home)}`)
  }],
  ['drive', async () => {
    const c0 = await car()
    await hold('w', 8)
    const c1 = await car()
    const moved = Math.hypot(c1.x - c0.x, c1.z - c0.z)
    const fz = await js('[...window.__vs.strutComp]')
    check(moved >= 40, `truck moved ${moved.toFixed(1)} m in 8 sim-s of W (need ≥ 40)`)
    check(fz.every(Number.isFinite), `strut state not finite: ${fz}`)
  }],
  ['reset', async () => {
    await js('window.__damage.setAll(0.5)')   // so "fresh" is a change R made, not the boot state
    await tap('r')
    const c = await until(async () => { const c = await car(); return c.v < 0.2 && Math.hypot(c.x - home.x, c.z - home.z) < 5 && c }, 5000)
    check(c, `R did not re-seat at the spawn: ${JSON.stringify(await car())} vs ${JSON.stringify(home)}`)
    const cond = await js('Object.values(window.__damage.condition)')
    check(cond.every(v => v > 0.99), `free-roam R left the injected 0.5 damage: ${cond.map(v => v.toFixed(2))}`)
  }],
  ['teleport', async () => {
    // A network point ~600 m out: streaming has to build ground there before the truck lands.
    const p = await js(`(() => { const c = window.__car(); let best = null, bd = 1e9
      for (const e of window.__roadSys()._network.values()) for (const q of e.points) {
        const d = Math.abs(Math.hypot(q.x - c.x, q.z - c.z) - 600); if (d < bd) { bd = d; best = { x: q.x, z: q.z } } }
      return best })()`)
    check(p, 'no road network to teleport along')
    await seat(p.x, p.z, 0)
    await simFor(3)
    const a = await car(); await simFor(1); const b = await car()
    const ground = await js(`window.terrain(${b.x}, ${b.z})`)
    check(b.y > ground - 1, `truck below the ground after teleport: y ${b.y.toFixed(1)} vs terrain ${ground.toFixed(1)}`)
    check(Math.abs(b.y - a.y) < 0.5, `truck still falling 5 sim-s after the seat: dy ${(b.y - a.y).toFixed(2)} m/s`)
  }],
  ['map', async () => {
    await tap('m')
    check(await until(() => js('window.__map2d().isOpen() && document.getElementById("map2d").style.display !== "none"'), 2000), 'M did not open the map')
    const mouse = (type, x, y) => client.cmd('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 })
    await mouse('mousePressed', 600, 400); await mouse('mouseMoved', 700, 450); await mouse('mouseReleased', 700, 450)
    await sleep(200)
    const cur = await js('document.getElementById("map2d").style.cursor')
    check(cur === 'grab', `map cursor stuck at "${cur}" after the drag`)
    await tap('m')
    check(await until(() => js('!window.__map2d().isOpen()'), 2000), 'M did not close the map')
  }],
  ['freecam', async () => {
    // R-11: WASD drives the truck under a flying camera, so turn it while flying — leaving freecam
    // must land behind the truck's NEW heading, not orbit round to it.
    await tap('c', { shift: true })
    await key('w', true); await key('a', true); await sleep(3000); await key('a', false); await key('w', false)
    await tap('c', { shift: true })
    await sleep(1000)
    const off = await js(`(() => { const p = window.__vs.position, q = window.__vs.quaternion, c = window.__cam().position
      const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y))   // body -Z in world
      const bx = c.x - p.x, bz = c.z - p.z                                               // truck → camera
      return Math.acos(Math.max(-1, Math.min(1, -(fx * bx + fz * bz) / Math.hypot(fx, fz) / Math.hypot(bx, bz)))) * 180 / Math.PI })()`)
    check(off < 10, `chase camera ${off.toFixed(0)}° off the truck's tail 1 s after leaving freecam (need < 10°)`)
  }],
  ['settings', async () => {
    // FEAT-41: Controls & Assists opens inside the pause box; Esc steps back to the list, Esc resumes.
    const shown = (id) => js(`getComputedStyle(document.getElementById("${id}")).display !== "none"`)
    await tap('Escape')
    check(await until(() => shown('pause-menu'), 1000), 'Esc did not pause')
    const code = await js('document.getElementById("pm-code").textContent')
    check(code === 'world 6/K', `pause menu shows the world code (got "${code}", want "world 6/K")`)
    await js('document.getElementById("pm-settings").click()')
    check(await shown('mm-settings-panel') && !await shown('pm-resume'), 'settings did not open in the pause box')
    check(await js('document.querySelectorAll("#cs-bindings tr").length') > 10, 'binding chart is empty')
    // The chart is a sub-page (owner, 2026-10-20): hidden on settings, opened by "bindings", Esc steps back.
    // offsetParent, not display: the chart's own display never changes, its page's does.
    const seen = (id) => js(`document.getElementById("${id}").offsetParent !== null`)
    check(!await seen('cs-bindings'), 'the binding chart shows on the settings page itself')
    await js('document.getElementById("mm-bindings").click()')
    check(await seen('cs-bindings') && !await seen('mm-settings-back'), 'bindings did not open its own page')
    await tap('Escape')
    check(await until(async () => !await seen('cs-bindings') && await seen('mm-settings-back'), 1000), 'Esc did not step back from bindings to settings')
    // FEAT-41 (owner, 2026-10-19): the world preset and the gearbox are pre-game only — never in here.
    check(await js('!document.querySelector("#mm-settings-panel [data-key=gearbox], #mm-settings-panel [data-key=worldPreset]")'),
      'the in-game settings page offers a pre-game choice (gearbox / difficulty)')
    await tap('Escape')
    check(!await shown('mm-settings-panel') && await shown('pm-resume'), 'Esc did not step back to the pause list')
    await tap('Escape')
    check(await until(async () => !await shown('pause-menu'), 1000), 'Esc did not resume')
  }],
  ['lab', async () => {
    await js('document.getElementById("pm-lab").click()')
    await simFor(3)
    check(await js('document.getElementById("pm-lab").textContent') === 'exit testing lab', 'lab did not enter')
    const a = await car(); await simFor(1); const b = await car()
    check(Math.abs(b.y - a.y) < 0.05 && b.y > -1 && b.y < 3, `truck not resting on the lab slab: y ${a.y.toFixed(2)} → ${b.y.toFixed(2)}`)
    await js('document.getElementById("pm-lab").click()')
    check(await js('document.getElementById("pm-lab").textContent') === 'testing lab', 'lab did not exit')
    await sleep(3000)
    const c = await car()
    check(c.y > await js(`window.terrain(${c.x}, ${c.z})`) - 1, `truck under the world after leaving the lab: y ${c.y.toFixed(1)}`)
  }],
  ['story', async () => {
    // FEAT-41: pm-story opens the run setup page (the seed modal is left with the refusal only).
    await js('document.getElementById("pm-story").click()')
    check(await js('document.getElementById("main-menu").classList.contains("setup")'), 'story did not open the setup page')
    // FEAT-147/170: every run opens on the firing. This flow HOLDS M to skip it — so no first-use card holds the
    // sim under the steps below; the 'opening' step at the end plays it. FEAT-184 (owner, 2026-11-08): the tutorial flag
    // starts complete, so a new game would land at Larry's with nothing to hold — turn it off to test the hold.
    await js('window.__settings.skipTutorial = false')
    await js('document.getElementById("su-seed").value = "6"; document.getElementById("su-start").click()')
    // Live = the loading stage is down, the run HUD is up and the region has POIs (__story is ?prof-only).
    const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
    check(await until(() => js(live), 45000, 250), 'story never went live (45 s × load): no run HUD / POIs, or the load stage stayed up')
    // FEAT-184 (owner, 2026-11-07): the skip lands at Larry's, 07:00 on day 1, the casserole DELIVERED (no job in
    // hand) — then Larry's welcome, then his intro (R-11), as after a driven casserole.
    await skipOpening()
    check(await js('window.__settings.skipTutorial') === true, 'skipping the tutorial did not turn "always skip the tutorial" on (FEAT-184)')
    const dlg = () => js('getComputedStyle(document.getElementById("dialogue-panel")).display !== "none"')
    const a = await js(`(() => { const q = window.__poi().list().find(q => q.type === 'larrysHouse'), v = window.__vs.position
      return { d: Math.hypot(v.x - q.x, v.z - q.z), h: window.__day().clockH() } })()`)
    // BUG-135: on the road in front of his (25 m) — never on his pad, which is his yard.
    check(a.d < 25 && Math.abs(a.h - 7) < 0.1, `the skip is not at Larry's at 07:00: ${JSON.stringify(a)}`)
    const hudClock = () => js('document.querySelector("#run-hud .rh-clock")?.textContent')
    check(await until(async () => await hudClock() === 'Day 1, 7 am', 3000), `the HUD clock after the skip reads "${await hudClock()}", want "Day 1, 7 am" (BUG-136)`)
    // FEAT-173: the skip ends fed (the evening's end serves mom's breakfast), and the run starts with her three lunches.
    const food = await js('({ fed: window.__day().snapshot().fedUntilH - window.__day().clockH(), lunch: window.__inv.list().find(e => e.id === "packedLunch")?.n ?? 0 })')
    check(food.fed > 7.9 && food.lunch === 3, `the skip did not wake fed with mom's three packed lunches (FEAT-173): ${JSON.stringify(food)}`)
    check(await js('getComputedStyle(document.getElementById("skip-hint")).display === "none"'), 'the skip prompt outlived the skip')
    check(await until(dlg, 3000), 'no Larry after the skip (R-11 / FEAT-170)')
    const dlgText = () => js('document.getElementById("dialogue-panel").textContent')
    check(/Casserole/.test(await dlgText()), "Larry's welcome is not the first card")
    for (let i = 0; i < 4 && /Casserole/.test(await dlgText()); i++) { await tap('Enter'); await sleep(100) }
    // The owner's word stream (feat120-blip): a card fills a word at a time (the intro's 33 words take ~2.6 s);
    // a press fills it in place, the next turns it.
    const shown = () => js('[...document.querySelectorAll("#dlg-text span")].filter(w => !w.children.length && w.style.visibility !== "hidden").length')
    const all = () => js('[...document.querySelectorAll("#dlg-text span")].filter(w => !w.children.length).length')
    check(await shown() < await all(), `the intro card did not stream in (${await shown()} of ${await all()} words at once)`)
    await tap('Enter'); await sleep(150)
    check(await shown() === await all(), 'the first press did not fill the card')
    // FEAT-103: the uncle names the camp's true compass direction — filled in, never the raw token.
    const intro = await dlgText()
    check(/expedition camped up at the (north|south)?(east|west)? road/.test(intro) && !intro.includes('{dir}'),
      `the intro does not name the camp's direction (or the fill turned the card): "${intro.slice(0, 120)}"`)
    for (let i = 0; i < 16 && await dlg(); i++) { await tap('Enter'); await sleep(250) }   // two presses a card: fill, turn
    check(!await dlg(), 'the intro cards did not close after 16 presses')
    // BUG-135 (owner, 2026-11-07: the skip parked the truck over mom's fire pit, "completely immobilized"): it drives off.
    await crank()
    if (await js('window.__vs.parked')) await tap(' ')
    const c0 = await car(); await hold('w', 5); const c1 = await car(), off = Math.hypot(c1.x - c0.x, c1.z - c0.z)
    check(off > 10, `the truck did not drive off from Larry's: ${off.toFixed(1)} m in 5 s of throttle`)
  }],
  ['camp', async () => {
    // Mom's doorstep is the one camp face reachable without a zone hunt: pull the brake there.
    const p = await js(`(() => { const m = window.__map2d()._getPois().find(q => q.type === 'momsHouse'); if (!m) return null
      let best = null, bd = 25
      for (const e of window.__roadSys()._network.values()) for (const q of e.points) {
        const d = Math.hypot(q.x - m.x, q.z - m.z); if (d < bd && d > 8) { bd = d; best = { x: q.x, z: q.z } } }
      return best })()`)
    check(p, "no road point within 25 m of mom's house")
    await seat(p.x, p.z, 0)
    const panel = () => js('getComputedStyle(document.getElementById("camp-panel")).display !== "none"')
    if (await js('window.__vs.parked')) { await tap(' '); await sleep(400) }   // a teleport seats latched
    await tap(' ')
    check(await until(panel, 2000), "parking at mom's opened no camp panel")
    const clock = () => js('document.querySelector("#run-hud .rh-clock").textContent')
    const h0 = await clock(); await sleep(3000)
    check(await clock() === h0, `clock ran while at mom's (FEAT-118 hold): ${h0} → ${await clock()}`)
    await tap('r')   // R-12: R closes the camp before the re-seat
    check(await until(async () => !await panel(), 2000), 'R left the camp panel up')
    const h1 = await clock(); await simFor(3)
    check(await clock() !== h1, 'clock did not resume after R closed the camp')

    // The truck (owner, 2026-10-19): Z always opens the card, and the brake sleeps you in the cab
    // anywhere — straight to the truck face off camping ground, via "sleep in the truck" on a site.
    // q: a centreline point 300 m from mom's, and off: 9 m out to its side — past the 5 m ribbon and the
    // 2.5 m shoulder (owner, 2026-10-20: the cab needs the truck's centre off the ribbon).
    const q = await js(`(() => { const m = window.__map2d()._getPois().find(q => q.type === 'momsHouse')
      for (const e of window.__roadSys()._network.values()) for (let i = 0; i + 1 < e.points.length; i++) {
        const q = e.points[i], n = e.points[i + 1]
        if (Math.hypot(q.x - m.x, q.z - m.z) < 300) continue
        const tx = n.x - q.x, tz = n.z - q.z, l = Math.hypot(tx, tz) || 1
        return { x: q.x, z: q.z, ox: q.x + tz / l * 9, oz: q.z - tx / l * 9 } }
      return null })()`)
    check(q, "no road point 300 m from mom's house")
    await seat(q.x, q.z, 0)
    await tap('z')
    const card = () => js('getComputedStyle(document.getElementById("camp-prompt")).display !== "none" && document.getElementById("camp-prompt-text").textContent')
    const text = await until(card, 2000)
    check(text, 'Z opened no camp card')
    if (await js('window.__vs.parked')) { await tap(' '); await sleep(400) }
    await tap(' ')
    await sleep(600)
    if (await panel()) {   // a campable site beside the road: its truck fallback must refuse on the ribbon
      check(await js('document.getElementById("cp-truck").disabled'), 'on the ribbon, the site card still offered the truck')
      await js('document.getElementById("cp-cancel").click()')
    } else check(text.includes('park on the shoulder'), `on the ribbon the card does not say "park on the shoulder" ("${text}")`)
    await seat(q.ox, q.oz, 0)
    const text2 = await until(card, 2000)
    if (await js('window.__vs.parked')) { await tap(' '); await sleep(400) }
    await tap(' ')
    check(await until(panel, 2000), `parking off the ribbon with the card up ("${text2}") opened no camp panel`)
    const title = () => js('document.getElementById("cp-title").textContent')
    if (await title() === 'camp') await js('document.getElementById("cp-truck").click()')
    check(await title() === 'sleep in the truck', `no truck face (title "${await title()}")`)
    await js('document.getElementById("cp-sleep").click()')
    check(await js('document.getElementById("cp-body").textContent.includes("campsites provide more rest")'),
      'the truck sleep face is missing its disclaimer')
    await js('document.getElementById("cp-sleep-back").click()')
    // Owner, 2026-10-27: an unmade card keeps the tent up and lit, and Z there closes the card and
    // calls the hunt off — so later parks open nothing.
    const lit = () => js('document.getElementById("camp-row").style.display === "flex" && document.getElementById("camp-icon").classList.contains("on")')
    check(await until(lit, 1000), 'the tent is not up and lit beside the truck face')
    await tap('z')
    check(await until(async () => !await panel(), 2000), 'Z did not close the truck face')
    check(!await lit(), 'Z closed the truck face but left the hunt on')
    // BUG-142 (owner, 2026-11-07: "Camping menu should default to off when you break camp"): "leave", the break-camp
    // button, calls the hunt off too. Armed again while parked, the truck face opens at once (BUG-95).
    await tap('z')
    check(await until(panel, 2000), 'Z while parked did not reopen the truck face')
    await js('document.getElementById("cp-break").click()')
    check(await until(async () => !await panel(), 2000), '"leave" did not close the truck face')
    check(!await lit(), 'breaking camp left the hunt on (BUG-142)')
  }],
  ['inventory', async () => {
    // FEAT-122: parked only (like V) — Tab driving pulses the park sign and opens nothing; parked,
    // Tab toggles the screen and Esc closes it. The grid draws every slot, and the run starts with
    // the Pack holding the bedroll.
    const open = () => js('document.getElementById("inv-screen").classList.contains("open")')
    check(await js('!!document.querySelector("#park-zone #inv-icon") && !!document.querySelector("#park-zone #dmg-icon")'),
      'inventory + damage icons are not both inside the park zone')
    if (await js('window.__vs.parked')) { await tap(' '); await sleep(400) }
    await tap('Tab'); await sleep(300)
    check(!await open(), 'Tab opened the inventory while not parked')
    check(await js('document.getElementById("park-zone").classList.contains("locked")'), 'park zone not locked while unparked')
    await tap(' ')
    check(await until(() => js('window.__vs.parked'), 1000), 'Space did not park')
    await tap('Tab')
    check(await until(open, 1000), 'Tab opened no inventory screen while parked')
    const slots = await js('document.querySelectorAll("#inv-screen .is-grid .inv-slot").length')
    check(slots === 8, `grid shows ${slots} slots, want 8`)
    check(await js('document.querySelector("#inv-screen .inv-slot[data-slot=\'0\'] .sl-name")?.textContent') === 'Pack',
      'slot 1 does not hold the starting Pack')
    await tap('Tab')
    check(await until(async () => !await open(), 1000), 'second Tab left the inventory open')
    await tap('Tab'); await until(open, 1000)
    await tap('Escape')
    check(await until(async () => !await open(), 1000), 'Esc left the inventory open')
    // Parking at the spawn can open mom's camp face, which holds the truck — R closes it (R-12).
    const camp = () => js('getComputedStyle(document.getElementById("camp-panel")).display !== "none"')
    if (await camp()) { await tap('r'); check(await until(async () => !await camp(), 2000), 'R left the camp panel up') }
  }],
  ['campGear', async () => {
    // FEAT-66: what is packed is what stands at camp. A pad at the truck, a packed tent → the tent
    // loads at its slot, beside the starter bedroll (ASSET-78); repacking while the camp is up re-dresses it (tent out, awning in); hiding
    // clears it. Leaves the inventory as it found it.
    const names = () => js('window.__campGear.root.children.filter(c => c.children.length).map(c => c.name).join()')
    const pack = (id) => js(`(() => { const i = window.__inv; i.grant('${id}'); return i.packItem(i.list().findIndex(r => r.id === '${id}')) })()`)
    const unpack = (id) => js(`(() => { const i = window.__inv; i.unpackItem(i.equippedIndex(), i.packed().indexOf('${id}'))
      return i.consume('${id}') })()`)   // not drop(): since FEAT-143 that lays it behind the tailgate
    check(await pack('tent'), 'the tent did not pack')
    await js(`(() => { const c = window.__car(); window.__campGear.show({ x: c.x, z: c.z, tx: 1, tz: 0, nx: 0, nz: 1 },
      window.__inv.packed(), () => c.y) })()`)
    check(await until(async () => await names() === 'model:bedroll,model:tent', 5000), `a packed tent is not at camp (got "${await names()}")`)
    check(await unpack('tent') && await pack('awning'), 'could not swap the tent for the awning')
    check(await until(async () => await names() === 'model:bedroll,model:awning', 5000), `repacking at camp did not re-dress it (got "${await names()}")`)
    await js('window.__campGear.hide()')
    check(await js('window.__campGear.root.children.length') === 0, 'hide left gear on the pad')
    check(await unpack('awning'), 'could not put the awning back')
    // FEAT-155: a camp up (the debug panel's shortcut runs the real _enterCampScene) hides the truck's gauge
    // cluster, and breaking it brings the cluster back.
    const cluster = () => js('getComputedStyle(document.getElementById("cluster")).display')
    await js(`[...document.querySelectorAll('.lil-gui .controller')].find(c => c.textContent.trim() === 'skip to camp dialogue')?.querySelector('button')?.click()`)
    const up = await js('document.body.classList.contains("camp-on")')
    if (up) check(await cluster() === 'none', `the gauge cluster shows at camp (${await cluster()})`)
    else console.log('  campGear: no pad at the truck for the camp shortcut — FEAT-155 check skipped')
    await js('document.getElementById("cp-break")?.click()')
    if (up) check(await until(async () => await cluster() !== 'none', 2000), 'breaking camp did not bring the gauge cluster back')
  }],
  ['tires', async () => {
    // SM-3 roadside tire work (owner, 2026-10-22): using the spare or the plug kit opens the damage
    // screen's picker; nothing happens until a tire is picked and the timed button confirmed. The
    // recovery chip lives in the park zone.
    check(await js('!!document.querySelector("#park-zone #recovery-row")'), 'recovery chip is not in the park zone')
    const inv = () => js('document.getElementById("inv-screen").classList.contains("open")')
    const picking = () => js('document.getElementById("dmg-screen").classList.contains("picking")')
    if (!await js('window.__vs.parked')) await tap(' ')
    check(await until(() => js('window.__vs.parked'), 1000), 'Space did not park')
    await js('window.__inv.grant("spareTire"); window.__inv.grant("tirePlugKit"); window.__damage.flat[1] = true')
    const useItem = async (id) => {
      if (!await inv()) { await tap('Tab'); await until(inv, 1000) }
      const i = await js(`window.__inv.list().findIndex(r => r.id === "${id}")`)
      await js(`document.querySelector('#inv-screen .inv-slot[data-slot="${i}"]').click()`)
      await js('document.querySelector("#inv-screen [data-act=use], #inv-screen [data-act=action]").click()')
      check(await until(picking, 1000), `using ${id} opened no tire picker`)
    }
    await useItem('spareTire')
    check(await js('document.querySelectorAll("#dmg-screen .ds-pbtn[data-track]:not(:disabled)").length') === 4, 'the spare cannot go on every corner')
    check(await js('!document.querySelector("#dmg-screen [data-act=pick-do]")'), 'a confirm showed before a tire was picked')
    // BUG-109: the D-pad reaches the pictogram's parts and the list's rows (not only the buttons), lights
    // the part as the mouse's hover would, and A picks it.
    await padOn()
    const onPart = 'document.querySelector("#dmg-screen .nav-focus")?.matches(".ds-part[data-track^=tire], .ds-row[data-track^=tire]")'
    for (let i = 0; i < 24 && !await js(onPart); i++) await btn(i < 12 ? 13 : 14)
    const part = await navFocus()
    check(await js(onPart), `the D-pad on the damage screen never reached a tire's part or row (stuck on "${part}")`)
    check(await js(`!!document.querySelector('#dmg-screen .hot[data-track="${part}"]')`), `the D-pad on ${part} lit no hover`)
    await btn(0)
    check(await until(() => js('!!document.querySelector("#dmg-screen [data-act=pick-do]")'), 1000), `A on ${part} picked nothing`)
    await padOff()
    await js('document.querySelector("#dmg-screen .ds-pbtn[data-track=tireFR]").click()')
    await js('document.querySelector("#dmg-screen [data-act=pick-do]").click()')
    check(await until(inv, 1000), 'the picker did not hand back to the inventory')
    check(await js('!window.__damage.flat[1] && window.__inv.list().some(r => r.id === "spareTire" && r.flat)'), 'the spare did not swap onto the flat corner')
    await useItem('tirePlugKit')
    check(await js('document.querySelectorAll("#dmg-screen .ds-pbtn[data-track]:not(:disabled)").length') === 0, 'a plug was offered for a tire holding air')
    await js('document.querySelector("#dmg-screen .ds-pbtn[data-inv]:not(:disabled)").click()')
    await js('document.querySelector("#dmg-screen [data-act=pick-do]").click()')
    check(await js('window.__inv.list().every(r => !r.flat && r.id !== "tirePlugKit")'), 'the plug did not fix the flat spare, or the kit was not spent')
    // Field repairs: zip ties pick a PART (a dented panel), a confirm patches it and spends one use.
    await js('window.__inv.grant("zipTies"); window.__damage.set("armorLeft", 0.4)')
    await useItem('zipTies')
    await js('document.querySelector("#dmg-screen .ds-pbtn[data-track=armorLeft]").click()')
    await js('document.querySelector("#dmg-screen [data-act=pick-do]").click()')
    check(await js('Math.abs(window.__damage.get("armorLeft") - 0.5) < 1e-6 && window.__inv.list().find(r => r.id === "zipTies")?.left === 4'),
      'zip ties did not patch the panel, or no use was spent')
    // The jerry can pours what the tank takes and stays aboard.
    await js('window.__inv.grant("jerryCan"); window.__vs.fuel.gal = 1')
    if (!await inv()) { await tap('Tab'); await until(inv, 1000) }
    await js(`window.__inv.use("jerryCan", window.__inv.list().findIndex(r => r.id === "jerryCan"))`)
    check(await until(() => js('window.__vs.fuel.gal === 6 && window.__inv.list().find(r => r.id === "jerryCan")?.gal === 0'), 1000),
      'the jerry can did not pour into the tank, or did not stay aboard')
    // FEAT-143: a drop goes down behind the tailgate, shows under "Nearby on the ground", and picking it up
    // puts the same entry back — the zip ties keep the 4 uses they had.
    const zt = () => js('window.__inv.list().find(r => r.id === "zipTies")?.left ?? null')
    const ground = '#inv-screen .inv-slot[data-ground]'
    await js('window.__inv.drop(window.__inv.list().findIndex(r => r.id === "zipTies"))')
    check(await zt() === null, 'dropping the zip ties left them in the inventory')
    check(await until(() => js(`!!document.querySelector('${ground}')`), 3000), 'the dropped zip ties are not under "Nearby on the ground"')
    await sleep(1000)   // the model loads, the body lands
    await js(`document.querySelector('${ground}').click()`)
    await js('document.querySelector("#inv-screen [data-act=pick]").click()')
    check(await until(async () => await zt() === 4, 1000), `picking the zip ties up gave back ${await zt()} uses, want 4`)
    check(await js(`!document.querySelector('${ground}')`), 'the picked-up zip ties are still on the ground')
    await tap('Escape')
    check(await until(async () => !await inv(), 1000), 'Esc left the inventory open')
  }],
  ['backtick', async () => {
    // R-13: one gate for the panel and the wireframes — they flip together, and flip back.
    const st = () => js('[document.querySelector(".lil-gui.root").style.display === "none", window.__physWireframes.enabled]')
    const [h0, w0] = await st()
    await tap('`'); const [h1, w1] = await st()
    await tap('`'); const [h2, w2] = await st()
    check(h1 !== h0 && w1 !== w0, `backtick flipped panel ${h0}→${h1}, wireframes ${w0}→${w1} (must flip both)`)
    check(h2 === h0 && w2 === w0, 'second backtick did not restore the panel and wireframes')
  }],
  ['service', async () => {
    // SM-3: park at an auto shop → the service screen; both tabs render; Esc closes it.
    const p = await js(`(() => { const q = window.__map2d()._getPois().find(q => q.type === 'autoShop' && !q.hidden)
      return q ? { h: Math.atan2(-q.tx, -q.tz), ...${PAD_SEAT}(q) } : null })()`)
    if (!p) { console.log('  service: no auto shop in this region — step skipped'); return }
    await seat(p.x, p.z, p.h)
    await park(true)
    const open = () => js('document.getElementById("svc-screen").checkVisibility()')
    check(await until(open, 2000), `parking at the auto shop opened no service screen: ${JSON.stringify(await js(`(() => { const c = window.__car()
      return { parked: window.__vs.parked, v: +c.v.toFixed(2), d: +Math.hypot(c.x - ${p.x}, c.z - ${p.z}).toFixed(1), prompt: document.getElementById('poi-prompt')?.textContent.trim().slice(0, 80),
        promptShown: document.getElementById('poi-prompt')?.style.display, mission: window.__mission().state } })()`))}`)
    // FEAT-178: parked on the service station's lift, the view snaps to the bay's inside corner — the model's camera eye.
    await frames(3, 80)
    const camOff = await js(`(() => { const q = window.__map2d()._getPois().find(q => q.type === 'autoShop' && !q.hidden), c = q.camera
      if (!c) return null
      const cs = Math.cos(q.modelYaw), sn = Math.sin(q.modelYaw), [ex, ey, ez] = c.eye, p = window.__cam().position
      return Math.hypot(p.x - (q.modelX + ex * cs + ez * sn), p.y - (q.baseY + ey), p.z - (q.modelZ - ex * sn + ez * cs)) })()`)
    check(camOff !== null && camOff < 0.3, `the service view is not the bay's camera corner (${camOff?.toFixed(2)} m off its eye)`)
    // …and the truck stands on its wheels there: the seat once sampled the road's sideways-extrapolated grade under the
    // lift (up to 1 m below the floor) and the truck was launched onto its roof (world 2764955649/K).
    const upY = await js('(q => 1 - 2 * (q.x * q.x + q.z * q.z))(window.__vs.quaternion)')
    check(upY > 0.99, `the truck is not upright on the lift (up.y ${upY.toFixed(3)})`)
    // FEAT-167: no HUD behind the shop.
    check(await js('!document.getElementById("hud-dock").checkVisibility({ visibilityProperty: true })'), 'the HUD shows behind the service screen')
    // My Vehicle lists every corner's tire under a collapsed Tires; selecting one opens its repair / exchange panel.
    await js('document.querySelector("#svc-screen [data-group=Tires]")?.click()')
    await js('document.querySelector("#svc-screen [data-act=sel][data-key=tireRR]")?.click()')
    check(await js('!!document.querySelector("#svc-screen .sv-panel")'), 'selecting a My Vehicle row opened no panel')
    // The Parts Shop is the shop's four-slot shelf (items or empty slots) and My Items.
    await js('document.querySelector("#svc-screen [data-tab=shop]")?.click()')
    check(await js('/For sale/i.test(document.querySelector("#svc-screen").textContent) && /My items/i.test(document.querySelector("#svc-screen").textContent)'),
      'the Parts Shop tab shows no shelf')
    // BUG-109: the pad's LB / RB step the tabs, wrapping at the ends.
    const tabOn = () => js('document.querySelector("#svc-screen [data-act=tab].on")?.dataset.tab')
    await padOn()
    const t0 = await tabOn(); await btn(5); const t1 = await tabOn(); await btn(4)
    check(t1 && t1 !== t0 && await tabOn() === t0, `RB then LB on the service screen: tab ${t0} → ${t1} → ${await tabOn()}`)
    await padOff()
    await tap('Escape')
    check(await until(async () => !await open(), 1000), 'Esc left the service screen open')
    await tap(' ')   // brake off: the next step parks fresh
    await sleep(300)
  }],
  ['store', async () => {
    // FEAT-104: park at a general store → its shop, buy only: the Shop tab alone (no My Vehicle, no My Items),
    // coffee on the list; a buy takes its listed price off the wallet and lands in the inventory, the clock
    // holds while the shop is open, and Esc closes it.
    const p = await js(`(() => { const q = window.__map2d()._getPois().find(q => q.type === 'generalStore' && !q.hidden)
      return q ? { h: Math.atan2(-q.tx, -q.tz), ...${PAD_SEAT}(q) } : null })()`)
    if (!p) { console.log('  store: no general store in this region — step skipped'); return }
    await seat(p.x, p.z, p.h)
    await park(true)
    const open = () => js('document.getElementById("svc-screen").checkVisibility()')
    check(await until(open, 2000), `parking at the general store opened no shop (prompt "${await js('document.getElementById("poi-prompt")?.textContent.trim()')}")`)
    const txt = await js('document.querySelector("#svc-screen").textContent')
    check(/Coffee/.test(txt) && !/My Vehicle|My items|Parts Shop/.test(txt), `the store's shop reads: "${txt.slice(0, 200)}"`)
    await js('window.__econ.money = 50')
    await js('document.querySelector("#svc-screen [data-tab=shop]")?.click()')   // repaints with the new wallet
    const coffees = () => js('window.__inv.list().filter(r => r.id === "coffee").reduce((a, r) => a + r.n, 0) + (window.__inv.pending()?.id === "coffee" ? 1 : 0)')
    const row = 'Array.from(document.querySelectorAll("#svc-screen .sv-shelf")).find(r => /Coffee/.test(r.textContent))'
    const price = await js(`+${row}.querySelector(".sv-price").textContent.replace(/[^0-9.]/g, "")`)
    const [m0, n0, h0] = [await js('window.__econ.money'), await coffees(), await js('window.__day().clockH()')]
    await js(`${row}.querySelector("[data-act=stow]").click()`)
    const [m1, n1] = [await js('window.__econ.money'), await coffees()]
    check(price > 0 && Math.abs(m0 - m1 - price) < 0.005, `buying a coffee listed at $${price} took $${(m0 - m1).toFixed(2)}`)
    check(n1 === n0 + 1, `buying a coffee left ${n1} coffees (had ${n0})`)
    await sleep(1000)
    check(await js('window.__day().clockH()') === h0, 'the clock ran while the shop was open')
    await tap('Escape')
    check(await until(async () => !await open(), 1000), 'Esc left the shop open')
    await tap(' ')   // brake off: the next step parks fresh
    await sleep(300)
  }],
  ['expedition', async () => {
    // FEAT-103: the camp's gate prompt, the requisition opening at campDeeds, the five lines at the
    // camp, and a line taken THERE waiting, untimed, until the truck parks at its source. FEAT-157: the
    // line taken is the fuel drum, strapped in at the source and not before.
    const pois = 'window.__map2d()._getPois()'
    const camp = await js(`(() => { const q = ${pois}.find(q => q.type === 'expeditionCamp')
      return q ? { x: q.x - q.nx * 3, z: q.z - q.nz * 3, h: Math.atan2(-q.tx, -q.tz) } : null })()`)
    check(camp, 'no expedition camp in the region')
    const prompt = () => js('document.getElementById("poi-prompt").checkVisibility() && document.getElementById("poi-prompt").textContent')
    await seat(camp.x, camp.z, camp.h)
    check(/good deeds/.test(await until(prompt, 2000) || ''), `the closed camp's prompt: "${await prompt()}"`)
    await js(`window.__econ.halfPoints = ${2 * ECONOMY_PARAMS.campDeeds}`)
    check(await until(() => js('/requisition 0 \\/ 5/.test(document.getElementById("run-hud").textContent)'), 1000), `${ECONOMY_PARAMS.campDeeds} deeds opened no requisition on the run HUD`)
    if (await js('window.__vs.parked')) { await tap(' '); await sleep(400) }
    await tap(' ')
    const vis = id => js(`document.getElementById("${id}").checkVisibility()`)
    check(await until(() => vis('mp-accept'), 3000), 'parking at the open camp opened no lines')
    check(await js('window.__mission().offers.length') === 5, `the camp shows ${await js('window.__mission().offers.length')} lines, want 5`)
    for (let i = 0; i < 5 && await js('window.__mission().offer._spec.line') !== 'reqFuel'; i++) await js('window.__mission().cycle(1)')
    await js('document.getElementById("mp-accept").click()')
    const st = () => js('(() => { const m = window.__mission(); return { s: m.state, a: !!m.mission?.approach, from: m.mission?.fromPoi } })()')
    const a = await st()
    check(a.s === 'staging' && a.a, `a line taken at the camp is not an untimed approach: ${JSON.stringify(a)}`)
    await sleep(500)
    check(!await js('window.__cargo().freight'), `the fuel line strapped its drum at the camp: ${JSON.stringify(await js('window.__cargo().freight'))}`)
    // A source with a park box (the gas station's storefront bays) is parked IN it — poi.js dropZoneWorld's
    // mapping, the truck's long axis along the bay.
    const src = await js(`(() => { const q = ${pois}.find(q => q.id === ${JSON.stringify(a.from)}), b = q.park
      if (!b) return { x: q.x - q.nx * 3, z: q.z - q.nz * 3, h: Math.atan2(-q.tx, -q.tz) }
      const yaw = q.modelYaw ?? q.yaw ?? 0, cs = Math.cos(yaw), sn = Math.sin(yaw), ox = q.modelX ?? q.x, oz = q.modelZ ?? q.z
      return { x: ox + b.x * cs + b.z * sn, z: oz - b.x * sn + b.z * cs, h: yaw } })()`)
    await seat(src.x, src.z, src.h)
    check((await st()).a, 'arriving at the source started the line before the brake')
    if (await js('window.__vs.parked')) { await tap(' '); await sleep(400) }
    await tap(' ')
    check(await until(async () => { const b = await st(); return b.s === 'staging' && !b.a }, 2000), `parking at the source did not start the line: ${JSON.stringify(await st())}`)
    check(await until(() => js('window.__cargo().freight?.key === "drum"'), 5000), `parking at the source strapped no drum: ${JSON.stringify(await js('window.__cargo().freight'))}`)
    // Cancel (parked, two clicks) → the line goes back on the camp's list.
    await js('document.getElementById("job-cancel").click()'); await js('document.getElementById("job-cancel").click()')
    check(await until(() => js('window.__mission().state === "done"'), 2000), 'cancel did not end the line')
    check(await until(() => js('!window.__cargo().freight'), 2000), 'the cancelled line left its drum in the bed')
    await js('document.getElementById("mp-accept").click()')
    check(await js(`window.__map2d()._getBoard().status(${JSON.stringify((await js(`${pois}.find(q => q.type === 'expeditionCamp').id`)))}).family !== null`)
      && await js('window.__mission().state === "idle"'), 'the cancelled line is not back at the camp')
    await tap(' ')   // brake off: the next step parks fresh
    await sleep(300)
  }],
  // FEAT-65: the camp's own demolition line (the requisition is open from the step above). Taken at the
  // camp it starts there (no approach); its targets stand as models along the route's last km; near
  // the truck they are bodies, ASLEEP until touched; a kicked one counts smashed on the HUD. Slice 2:
  // arriving at the site's end with targets standing settles nothing and the GPS turns back to the
  // nearest one; it moves on as each falls, and the last one down settles the line wherever the truck is.
  ['demolition', async () => {
    const pois = 'window.__map2d()._getPois()'
    const camp = await js(`(() => { const q = ${pois}.find(q => q.type === 'expeditionCamp')
      return { x: q.x - q.nx * 3, z: q.z - q.nz * 3, h: Math.atan2(-q.tx, -q.tz) } })()`)
    await seat(camp.x, camp.z, camp.h)
    await park(true)
    const vis = id => js(`document.getElementById("${id}").checkVisibility()`)
    check(await until(() => vis('mp-accept'), 3000), 'parking at the camp opened no lines')
    for (let i = 0; i < 5 && await js('window.__mission().offer._spec.line') !== 'reqSigns'; i++) await js('window.__mission().cycle(1)')
    check(await js('window.__mission().offer._spec.line') === 'reqSigns', 'the camp lists no demolition line')
    await js('document.getElementById("mp-accept").click()')
    const st = await js('(() => { const m = window.__mission(); return { s: m.state, a: !!m.mission?.approach, n: m.mission?.targets?.length } })()')
    check(st.s === 'staging' && !st.a && st.n > 0, `the camp's line did not start at the camp with a site: ${JSON.stringify(st)}`)
    check((await js('window.__cargo().site'))?.length === st.n, 'the site does not stand from accept')
    // Seat on the route's centreline beside the first target: within onM its targets become bodies.
    const at = await js(`(() => { const m = window.__mission().mission, t = window.__cargo().site[0]
      let bi = 0, bd = Infinity
      m.poly.forEach((p, i) => { const d = Math.hypot(p.x - t.x, p.z - t.z); if (d < bd) { bd = d; bi = i } })
      const a = m.poly[Math.max(0, bi - 1)], b = m.poly[Math.min(m.poly.length - 1, bi + 1)]
      return { x: m.poly[bi].x, z: m.poly[bi].z, h: Math.atan2(-(b.x - a.x), -(b.z - a.z)) } })()`)
    await seat(at.x, at.z, at.h)
    const bodies = 'window.__cargo().site.filter(t => t.body != null)'
    check(await until(() => js(`${bodies}.length > 0`), 3000), 'no target near the truck became a body')
    // FEAT-187: beside the site, a cluster's paper-style halo is lit, and the GPS draws no destination circle in the road.
    check(await until(() => js('window.__site().halos?.some(h => h.ring.visible)'), 2000), 'no cluster halo lit beside the site (FEAT-187)')
    check(await js('window.__gps()?.noRing === true'), `the demolition GPS route still carries a destination circle (FEAT-187): ${await js('JSON.stringify(Object.keys(window.__gps() ?? {}))')}`)
    await sleep(2000)
    const awake = await js(`${bodies}.filter(t => window.__physicsEngine.isAwake(t.body)).length`)
    check(awake === 0 && await js('window.__cargo().site.every(t => !t.smashed)'), `untouched targets did not stay asleep and standing: ${awake} awake`)
    // Kick one: the engine wakes it, it moves, the poll latches it smashed.
    await js(`(() => { const t = ${bodies}[0], p = new (window.__vs.position.constructor)(), q = new (window.__vs.quaternion.constructor)()
      window.__physicsEngine.getTransform(t.body, p, q); window.__physicsEngine.applyImpulse(t.body, { x: 200, y: 100, z: 0 }, p) })()`)
    check(await until(() => js('window.__cargo().site.filter(t => t.smashed).length === 1'), 3000), 'a kicked target did not count smashed')
    check(await until(() => js('/1 \\/ \\d+ smashed/.test(document.getElementById("job-promise")?.textContent ?? "")'), 2000),
      `the HUD does not count it: "${await js('document.getElementById("job-promise")?.textContent')}"`)
    // 11-05 (owner, option b): the first smash starts the site window; the job line counts it down.
    check(await until(() => js('/next hit within \\d+ s/.test(document.getElementById("mission-hud").textContent)'), 2000),
      `the job line shows no site window: "${await js('document.getElementById("mission-hud").textContent')}"`)
    // Arrive with the rest standing: nothing settles, and the GPS goes BACK to the nearest one standing.
    const end = await js('(() => { const m = window.__mission().mission, a = m.poly.at(-2), b = m.poly.at(-1); return { x: b.x, z: b.z, h: Math.atan2(-(b.x - a.x), -(b.z - a.z)) } })()')
    await seat(end.x, end.z, end.h)
    check(await until(() => js('window.__site().next?.back === true && window.__site().gps === window.__site().guide.route'), 3000),
      `past the end the GPS does not turn back to a target: ${await js('JSON.stringify(window.__site().next)')}`)
    check(await js('window.__mission().state') === 'running', `arriving with targets standing settled the line: ${await js('window.__mission().state')}`)
    // Fell the GPS's target: it moves on to another standing one. Then the rest: the line settles where it is.
    const i0 = await js('window.__site().next.i')
    await js(`window.__site().targets[${i0}].smashed = true`)
    check(await until(() => js(`(n => n && n.i !== ${i0} && !window.__site().targets[n.i].smashed)(window.__site().next)`), 2000), 'the GPS did not move on when its target fell')
    // That smash refilled the window; let it run out (a game minute is a second of the job's clock) and the line
    // settles where it is, with the two that fell. (The last one down settling it is the same `cleared` line.)
    check(await js('window.__mission().state') === 'running', 'the line settled before its window ran out')
    await js('window.__day().advanceMinutes(41)')
    check(await until(() => js('window.__mission().state === "done"'), 5000), `the site window ran out and the line did not settle: ${await js('window.__mission().state')}`)
    check(await js('(n => new RegExp(`Smashed\\\\s*2 \\\\/ ${n}`).test(document.getElementById("mp-body")?.textContent ?? ""))(window.__mission().mission.targets.length)'),
      `the result card does not count the two smashed: "${await js('document.getElementById("mp-body")?.textContent')}"`)
    await js('document.getElementById("mp-accept").click()')
    await tap(' ')   // brake off: the next step parks fresh
    await sleep(300)
  }],
  // FEAT-154: a road out of the area. Full throttle at its barricade row: the loose barricades get
  // smashed aside, past the fade line the screen goes black, and the truck comes back on a road inside
  // the return radius facing in, with every barricade back where it stood.
  ['edge', async () => {
    const P = await js('(() => { const p = window.__poi(), b = p.barricades()[4], c = p._built; return { b, c } })()')
    const f = { x: -Math.sin(P.b.yaw), z: -Math.cos(P.b.yaw) }   // the striped face: back into the area
    // A row far off is plain models; near the truck its three barricades are loose bodies (main.js).
    const row = `window.__debris._live.filter(r => r.kind === "roadBarrier" && Math.hypot(r.mesh.position.x - ${P.b.x}, r.mesh.position.z - ${P.b.z}) < 8)`
    check(await js(`${row}.length`) === 0, 'a row 2 km from the truck already has bodies (they would fall through the world)')
    await seat(P.b.x + f.x * 30, P.b.z + f.z * 30, Math.atan2(f.x, f.z))   // 30 m inside, nose at the row
    check(await until(() => js(`(window.__edgeRow = ${row}).length === 3`), 2000), `the row near the truck has ${await js(`${row}.length`)} bodies, want 3`)
    await simFor(1)   // settled on the deck
    const pos = 'window.__edgeRow.map(r => r.mesh.position.toArray())'
    const before = await js(pos)
    await crank()
    if (await js('window.__vs.parked')) await tap(' ')
    const black = 'document.getElementById("camp-fade").classList.contains("on")'
    await key('w', true)
    const went = await untilSim(() => js(black), 20)
    const smashed = went && (await js(pos)).some((p, i) => Math.hypot(p[0] - before[i][0], p[2] - before[i][2]) > 0.5)
    await key('w', false)
    check(went, `the edge never faded: the truck at ${(await js(`Math.hypot(window.__car().x - ${P.c.x}, window.__car().z - ${P.c.z})`)).toFixed(0)} m`)
    check(smashed, 'the truck reached the fade line without moving a barricade')
    check(await until(async () => !await js(black), 5000, 100), 'the screen stayed black')
    const back = await js(`(() => { const p = window.__car(), q = window.__vs.quaternion
      const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y))   // the truck's nose, (0, 0, -1) rotated
      return { r: Math.hypot(p.x - ${P.c.x}, p.z - ${P.c.z}), inward: (${P.c.x} - p.x) * fx + (${P.c.z} - p.z) * fz } })()`)
    check(back.r <= P.c.r - 100 - 9 && back.inward > 0, `came back at ${back.r.toFixed(0)} m, ${back.inward > 0 ? 'facing in' : 'facing OUT'}`)
    // The row stands again as models and the 10 Hz poll makes it bodies once more, dropped 1 cm onto the deck: read
    // it the way `before` was — three bodies, then a sim second to settle (INFRA-08: under load the respawn lags the
    // fade, and a read a wall second after it caught the new bodies mid-settle, 5–7 cm off; idle reads 0.0 cm).
    await until(() => js(`${row}.length === 3`), 2000)
    await simFor(1)
    const after = await js(`${row}.map(r => r.mesh.position.toArray())`)
    const off = after.length === 3 ? Math.max(...after.map((p, i) => Math.hypot(p[0] - before[i][0], p[1] - before[i][1], p[2] - before[i][2]))) : Infinity
    // 15 cm, not 5: a 1 cm drop onto the sloped deck rocks to rest a few cm from where it landed, and under load that
    // landing is not repeatable — Box3D orders contacts by body creation, and streaming creates terrain/prop bodies in
    // another order (measured 11-06 at 6×: the first row's rest scatters 1–2 cm run to run, the reset row lands 1–6 cm
    // from it, both at rest 3 sim-s later; idle, 0.0 cm). Not reset at all is metres: a knock is > 0.5 m above.
    check(off < 0.15, `the barricades are not back: ${after.length}/3, worst ${off.toFixed(2)} m off`)
    console.log(`  edge: smashed through, back at ${back.r.toFixed(0)} m facing in, the row reset (worst ${(off * 100).toFixed(1)} cm)`)
  }],
  ['papers', async () => {
    // FEAT-141: Larry's round — any N of the customers against a deadline, the size chosen among the
    // unlocked rungs. Unlock the 7, park at Larry's, read his briefing, and walk the size row.
    const larry = await js(`(() => { const q = window.__map2d()._getPois().find(q => q.type === 'larrysHouse')
      return q ? { x: q.x - q.nx * 5, z: q.z - q.nz * 5, h: Math.atan2(-q.tx, -q.tz) } : null })()`)   // his yard: the marker stands at the house
    if (!larry) { console.log('  papers: no Larry in this region — step skipped'); return }
    await js('window.__paper.runPaper.tier = 1')
    await seat(larry.x, larry.z, larry.h)
    const state = () => js('window.__paper.system.state')
    // Releasing the brake on Larry's pad can let the truck roll before it latches again; while the
    // prompt still asks for the brake, pull it again.
    for (let i = 0; i < 3 && await state() === 'idle'; i++) {
      await park(true)
      await until(async () => await state() !== 'idle', 1500)
    }
    const dlg = () => js('getComputedStyle(document.getElementById("dialogue-panel")).display !== "none"')
    for (let i = 0; i < 20 && await state() !== 'offer'; i++) { if (await dlg()) await tap('Enter'); await sleep(300) }
    check(await until(async () => await state() === 'offer', 5000), `Larry offered no round: state ${await state()} · ${JSON.stringify(await js(`(() => {
      const q = window.__map2d()._getPois().find(q => q.type === 'larrysHouse'), c = window.__car(), b = window.__map2d()._getBoard()
      return { prompt: document.getElementById('poi-prompt').textContent.slice(0, 80), parked: window.__vs.parked, mission: window.__mission().state,
               d: Math.hypot(c.x - q.x, c.z - q.z).toFixed(1), slot: b?.status(q.id), park: !!q.park, drop: !!q.drop } })()`))}`)
    const view = () => js(`(() => { const p = window.__paper.system
      return { n: p.route?.customers.length, sizes: [...document.querySelectorAll('#pp-sizes button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join(' '),
               deadline: /time limit/.test(document.getElementById('pp-body').textContent) } })()`)
    const top = await view()
    check(top.n === 7 && top.sizes === '4 7*' && top.deadline, `Larry's offer: ${JSON.stringify(top)} — want 7 customers, sizes "4 7*" and a time limit`)   // BUG-134: the ladder 4 / 7 / 9 / 11
    // FEAT-133: a card's first D-pad / arrow press lands on its main action, not the size row above it.
    await tap('ArrowDown')
    check(await js('document.querySelector("#paper-panel .nav-focus")?.id') === 'pp-accept',
      `the first arrow press on Larry's card highlighted "${await js('document.querySelector("#paper-panel .nav-focus")?.textContent')}", not "start the route"`)
    await js('document.querySelector("#pp-sizes button[data-size=\'0\']").click()')
    const small = await view()
    check(small.n === 4 && small.sizes === '4* 7', `picking the 4: ${JSON.stringify(small)}`)
    console.log(`  papers: Larry offers ${top.sizes.replace('*', '')} — plotted ${top.n}, then ${small.n}`)
    // FEAT-133 on a LIVE round (until now only with throwReady forced): take the 4, leave Larry's
    // circle, get rolling on a fake pad, aim with the right stick and TAP RB — a paper leaves the truck.
    await js('document.getElementById("pp-accept").click()')
    check(await until(async () => await state() === 'staging', 2000), `accepting did not stage the round: ${await state()}`)
    const out = await js(`(() => { const q = window.__map2d()._getPois().find(q => q.type === 'larrysHouse')
      return { x: q.roadX + q.tx * 40, z: q.roadZ + q.tz * 40, h: Math.atan2(-q.tx, -q.tz) } })()`)
    await seat(out.x, out.z, out.h)
    await crank()
    await padOn()
    await js('__fp.b[7] = 0.7')   // RT: rolling past the 5 mph throw floor
    check(await untilSim(() => js('window.__vs.velocity.length() > 3'), 8), `the fake pad did not get the truck rolling: ${(await js('window.__vs.velocity.length()')).toFixed(1)} m/s`)
    check(await until(async () => await state() === 'running', 3000), `leaving Larry's circle did not start the round: ${await state()}`)
    const stock0 = await js('window.__paper.system.stock()')
    await js('__fp.axes[2] = 0.7'); await frames(4, 150)          // aim: the right stick
    // A TAP of RB: pressed for ONE pad poll and let go in-page on the next frame. gamepad.js times the tap in
    // WALL ms (throwTapMs 200) and a longer press becomes the handbrake — under load, 3 frames + 80 ms + a CDP
    // round trip ran past it and no paper flew (INFRA-08). The poll's rAF callback (requestAnimationFrame, the
    // browser's once-per-frame hook) was queued in the last frame, ahead of this one, so it sees the press first.
    await js('__fp.b[5] = 1; requestAnimationFrame(() => { __fp.b[5] = 0 })')
    check(await until(async () => await js('window.__paper.system.stock()') === stock0 - 1, 2000),
      `an RB tap while aiming on a live round threw no paper: stock ${stock0} → ${await js('window.__paper.system.stock()')}`)
    await js('__fp.b[7] = 0; __fp.axes[2] = 0'); await frames(2, 60)
    console.log(`  papers: a pad RB tap threw a paper on the live round (stock ${stock0} → ${stock0 - 1})`)
    // Put the round down: parked, two clicks of the abandon button, then continue off the card.
    await park()
    // The abandon button reads "parked" off the ~10 Hz HUD poll; a click right after the latch can
    // land before the poll has seen it, so the two clicks are retried until the round ends.
    for (let i = 0; i < 4 && await state() !== 'done'; i++) {
      await frames(4, 250)
      await js('document.getElementById("job-cancel").click()'); await js('document.getElementById("job-cancel").click()')
      await until(async () => await state() === 'done', 600)
    }
    check(await state() === 'done', `abandoning did not end the round: ${await state()} · ${JSON.stringify(await js(`(() => { const b = document.getElementById('job-cancel')
      return { parked: window.__vs.parked, v: +window.__vs.velocity.length().toFixed(2), label: b.textContent, armed: b.classList.contains('armed'), hud: b.parentElement?.id, shown: b.style.display } })()`))}`)
    // BUG-109: a RESULT card lets the pad drive through it — A / X shift, LB clutch, RB handbrake — until
    // the D-pad puts its highlight on it; then A presses continue.
    await js('window.__padKeys = []; addEventListener("keydown", e => window.__padKeys?.push(e.key), true)')
    for (const i of [0, 2, 4]) await btn(i)
    const sent = await js('window.__padKeys.join(" ")')
    check(sent === 'e q Shift' && await state() === 'done', `A, X, LB on the result card sent "${sent}" (want "e q Shift"), round ${await state()}`)
    await btn(5); const rb1 = await js('window.__vs.parked'); await btn(5)
    check(!rb1 && await until(() => js('window.__vs.parked'), 1000), `RB on the result card did not work the handbrake: parked → ${rb1} → ${await js('window.__vs.parked')}`)
    await btn(13)
    check(await navFocus() === 'pp-accept', `the D-pad on the result card highlighted "${await navFocus()}", not continue`)
    await btn(0)
    check(await until(async () => await state() === 'idle', 2000), `A on the highlighted continue left the round card up: ${await state()}`)
    await js('window.__padKeys = null')
    await padOff()
    console.log('  papers: the result card drove through on the pad (A/X/LB/RB), then D-pad + A continued')
    await js('window.__paper.runPaper.tier = 0')
    await tap(' ')   // brake off: the next step parks fresh
    await sleep(300)
  }],
  ['offer', async () => {
    // A plain delivery giver (no bed-over-drop or park-box rule) with a live offer: seat the truck on
    // its pad (q.x/z — the solid model stands off it at modelX/Z), pull the brake, accept, drive.
    const p = await js(`(() => { const b = window.__map2d()._getBoard(); if (!b) return null
      const q = window.__map2d()._getPois().find(q => q.jobs && !q.hidden && !q.drop && !q.park && q.type !== 'expeditionCamp'
        && b.status(q.id)?.family === 'delivery' && b.view(q.id, 0)?.count > 0)
      return q ? { rx: q.roadX, rz: q.roadZ, h: Math.atan2(-q.tx, -q.tz), id: q.id, type: q.type, ...${PAD_SEAT}(q) } : null })()`)
    if (!p) { console.log('  offer: no plain delivery giver with a live offer — step skipped'); return }
    await seat(p.x, p.z, p.h)
    await park(true)
    // checkVisibility, not the element's own display: while the job is still planning the button
    // has no display of its own but its #mp-actions row is hidden, and a click there is lost.
    const vis = id => js(`document.getElementById("${id}").checkVisibility()`)
    // SM-3: an auto shop's brake opens the service center (FEAT-104: a storefront's, its shop); its jobs button hands
    // over to the offer.
    if (SHOP_TYPES.has(p.type)) {
      check(await until(() => vis('svc-screen'), 2000), `parking at the ${p.type} opened no shop screen`)
      await js('document.querySelector("#svc-screen [data-tab=jobs]")?.click(); document.querySelector("#svc-screen [data-act=jobs]")?.click()')
    }
    check(await until(() => vis('mp-accept'), 2000), `parking at the ${p.type} pad opened no offer`)
    await js('document.getElementById("mp-accept").click()')
    const hudText = () => js('document.querySelector("#mission-hud .hud-text").textContent.trim()')
    check(await until(async () => await vis('mission-hud') && await hudText(), 5000), `no mission HUD after accept: ${JSON.stringify(await js('[document.getElementById("mission-hud").style.display, document.getElementById("mission-hud").textContent.trim(), document.getElementById("mission-panel")?.style.display, document.getElementById("mission-panel")?.textContent.trim().slice(0, 200)]'))}`)
    check(await vis('job-cancel'), 'abandon-job button not shown on a job')
    const staged = await hudText()
    // Pull away from the road beside the pad, facing along it: the pad itself is boxed in by the
    // shop and its yard clutter, which pinned the truck at full throttle.
    await seat(p.rx, p.rz, p.h)
    await crank()   // story seats the truck with the engine OFF (FEAT-33)
    if (await js('window.__vs.parked')) await tap(' ')   // and latched
    const c0 = await car(); await hold('w', 6); const c1 = await car()
    const moved = Math.hypot(c1.x - c0.x, c1.z - c0.z)
    check(moved > 15, `truck moved ${moved.toFixed(0)} m on the job (need > 15)`)
    check(await until(async () => await hudText() !== staged, 3000), `job never started: HUD still "${staged}" after ${moved.toFixed(0)} m`)
    console.log(`  offer: ${p.type} job running after ${moved.toFixed(0)} m — HUD "${await hudText()}"`)
    check(await vis('mission-hud'), 'mission HUD vanished mid-job')
  }],
  // FEAT-42: the rolling run save. (1) save & exit → a real reload → continue puts the run back,
  // paused, with the offer step's courier job still in hand (part 2). (2) The crash: take a freight
  // job, kill the page mid-drive with no save & exit at all → continue resumes the truck at the speed
  // it had, the strapped load still in the bed, held in the pause menu until it is closed.
  ['save', async () => {
    const jobNow = () => js(`(() => { const ms = window.__mission(), m = ms.mission
      return { id: m?.offerId ?? null, state: ms.state, ex: m?.end.x, ez: m?.end.z, par: m?.par } })()`)
    const job0 = await jobNow()
    check(job0.id && job0.state === 'running', `the offer step left no running board job: ${JSON.stringify(job0)}`)
    await park()   // the offer step left it driving
    check(await until(() => js('window.__vs.velocity.length() < 0.2'), 8000),
      `the truck never came to rest (${(await js('window.__vs.velocity.length()')).toFixed(2)} m/s, parked ${await js('window.__vs.parked')})`)
    await js('window.__econ.money = 123.45')
    const cost = await js(`(() => { let ok = 0; const t = performance.now(); for (let i = 0; i < 20; i++) ok += window.__autosave()
      return { ok, ms: (performance.now() - t) / 20, kb: localStorage.getItem("autos-run/1").length / 1024 } })()`)
    check(cost.ok === 20, `only ${cost.ok}/20 autosaves wrote`)
    console.log(`  autosave: ${cost.ms.toFixed(2)} ms per write, ${cost.kb.toFixed(1)} KB`)
    // Esc steps back out of any card first, then pauses.
    for (let i = 0; i < 4 && !await js('document.getElementById("pause-menu").style.display === "flex"'); i++) { await tap('Escape'); await sleep(300) }
    check(await js('document.getElementById("pause-menu").style.display === "flex"'), 'Esc did not pause')
    check(await js('!document.getElementById("pm-save").disabled && document.getElementById("pm-save").offsetParent !== null'),
      `save & exit not offered: "${await js('document.getElementById("pm-save-why").textContent')}"`)
    const before = await js(`({ p: window.__car(), h: window.__day().clockH(), cond: window.__damage.get("armorLeft"), inv: window.__inv.list().length })`)
    const roster = () => js('({ first: window.__board().firstState(), ids: window.__poi().list().map(q => q.id) })')
    const roster0 = await roster()
    await js('document.getElementById("pm-save").click()')
    check(await until(() => js('document.getElementById("mm-continue").offsetParent !== null'), 5000), 'no continue button after save & exit')
    // The warning lives on the new-game page beside story's start (02c92535), so it is shown/hidden by style, not visibility here.
    check(await js('(n => n.style.display !== "none" && n.previousElementSibling.id === "su-start")(document.getElementById("mm-save-note"))'), 'with a run saved, no save warning beside story\'s start')
    const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
    const paused = 'document.getElementById("resume-card").style.display === "flex"'
    const resume = async (what) => {
      await client.cmd('Page.navigate', { url: `http://localhost:${HTTP}/index.html?seed=6` })
      check(await until(() => js('window.__rsReady === true && document.getElementById("mm-continue")?.offsetParent != null'), 30000, 250),
        `${what}: no continue button after the reload`)
      // What the dying page actually wrote (pagehide), read before continue can rewrite it.
      const saved = await js(`(() => { const d = JSON.parse(localStorage.getItem("autos-run/1")).data
        return { p: { x: d.pose.p[0], z: d.pose.p[2] }, v: Math.hypot(...d.motion.v) } })()`)
      await js('document.getElementById("mm-continue").click()')
      check(await until(() => js(live), 45000, 250), `${what}: the resumed run never went live (45 s × load)`)
      check(await until(() => js(paused), 2000), `${what}: the resumed run did not open paused`)
      return saved
    }
    await resume('save & exit')
    check(await js('getComputedStyle(document.getElementById("dialogue-panel")).display === "none"'), 'the run intro replayed on resume')
    const after = await js(`({ p: window.__car(), h: window.__day().clockH(), cond: window.__damage.get("armorLeft"), inv: window.__inv.list().length, money: window.__econ.money })`)
    const dm = Math.hypot(after.p.x - before.p.x, after.p.z - before.p.z)
    check(dm < 0.5, `resumed ${dm.toFixed(2)} m from where it was saved`)
    check(after.money === 123.45, `wallet ${after.money}, saved 123.45`)
    check(after.h >= before.h && after.h - before.h < 0.1, `clock ${before.h.toFixed(3)} h → ${after.h.toFixed(3)} h`)
    check(after.cond === before.cond && after.inv === before.inv, `truck/kit changed: ${JSON.stringify(before)} → ${JSON.stringify(after)}`)
    console.log(`  save & exit: resumed at ${dm.toFixed(2)} m, clock +${((after.h - before.h) * 60).toFixed(1)} game min`)
    // BUG-152: the board's history is keyed on POI ids, so the resumed session must site the SAME roster. A re-sited one
    // dropped the opening's first-job events and mom's casserole came back 'live' over the skip's 'done'. One resume
    // cannot catch a 1-in-10 race; this pins the contract, and the run-soak's resume check is the statistical net.
    const roster1 = await roster()
    const lost = roster0.ids.filter(id => !roster1.ids.includes(id)).length
    check(!lost && roster1.ids.length === roster0.ids.length,
      `the POI roster changed across the resume: ${lost} of ${roster0.ids.length} ids gone (${roster0.ids.length} → ${roster1.ids.length})`)
    check(roster1.first === roster0.first, `the first job went '${roster0.first}' → '${roster1.first}' across the resume`)
    const job1 = await jobNow()
    check(JSON.stringify(job1) === JSON.stringify(job0), `the courier job did not survive the save: ${JSON.stringify(job0)} → ${JSON.stringify(job1)}`)
    console.log(`  save & exit: courier job ${job1.id} still ${job1.state}`)
    // A strapped load for the crash: put the courier down (test-only; its slot stays taken) and take
    // a freight offer wherever one is live, the way the offer step takes its job.
    await tap('Shift')
    check(await js(paused), 'a bare modifier ended the resume card')
    await tap('w')
    check(await until(async () => !await js(paused), 1000), 'a key did not end the resume card')
    await js('window.__mission().exit()')
    const fr = await js(`(() => { const b = window.__cargo().board, now = window.__day().clockH()
      for (const q of window.__map2d()._getPois()) {
        if (!q.jobs || q.hidden || q.drop || q.park || q.type === 'expeditionCamp') continue
        const o = b.offers(q.id, now).find(o => b.spec(o)?.family === 'freight')
        if (o) return { rx: q.roadX, rz: q.roadZ, h: Math.atan2(-q.tx, -q.tz), id: o.id, type: q.type, ...${PAD_SEAT}(q) }
      }
      return null })()`)
    let load = null
    if (fr) {
      await seat(fr.x, fr.z, fr.h)
      await park(true)
      const vis = id => js(`document.getElementById("${id}").checkVisibility()`)
      if (SHOP_TYPES.has(fr.type) && await until(() => vis('svc-screen'), 2000)) await js('document.querySelector("#svc-screen [data-tab=jobs]")?.click(); document.querySelector("#svc-screen [data-act=jobs]")?.click()')
      if (await until(() => vis('mp-accept'), 2000)) {
        for (let i = 0; i < 8 && await js(`window.__mission().offer?.id !== ${JSON.stringify(fr.id)}`); i++) await js('document.getElementById("mp-next")?.click()')
        if (await js(`window.__mission().offer?.id === ${JSON.stringify(fr.id)} && !document.getElementById("mp-accept").disabled`)) {
          await js('document.getElementById("mp-accept").click()')
          load = await until(() => js('window.__cargo().freight?.key'), 5000) && await js('window.__cargo().freight')
        }
      }
    }
    if (!load) console.log(`  save: no takeable freight offer in this region — crash runs with the courier's empty bed`)
    else {
      check(await js('window.__mission().isOnJob()'), 'the freight job is not in hand after accept')
      await seat(fr.rx, fr.rz, fr.h)   // off the pad: its yard clutter pins a truck at full throttle
      console.log(`  save: freight ${load.key} strapped from ${fr.type}`)
    }
    const jobF = await jobNow()
    // (2) the crash. Drive off, and kill the page with the throttle still down.
    await crank()
    if (await js('window.__vs.parked')) await tap(' ')
    // Throttle until it is MOVING, not for a fixed 4 s: under load the sim runs slower than the wall
    // clock (frames past MAX_FRAME_TIME), and 4 s once bought only 1.3 m/s.
    await key('w', true); await until(() => js('window.__vs.velocity.length() > 5'), 30000)
    const kill = await js('({ v: window.__vs.velocity.length(), p: window.__car() })')
    check(kill.v > 3, `the truck was not moving when the page was killed (${kill.v.toFixed(1)} m/s at (${kill.p.x.toFixed(1)}, ${kill.p.z.toFixed(1)})${load ? `, ${load.key} from ${fr.type}` : ', no freight'}): ${JSON.stringify(await js('({ parked: window.__vs.parked, ign: window.__vs.ignition?.state, card: document.getElementById("resume-card").style.display, pause: document.getElementById("pause-menu").style.display })'))}`)
    // Compare against what the page SAVED, not the kill read: W stays down through the reload and the
    // pagehide write lands after it — under load ~0.8 s / 5.7 m later, which failed a correct resume.
    const saved = await resume('crash')
    await key('w', false)
    check(saved.v > 3, `the crash save caught the truck at ${saved.v.toFixed(1)} m/s (killed at ${kill.v.toFixed(1)})`)
    const held = await js('({ v: window.__vs.velocity.length(), p: window.__car() })')
    const dk = Math.hypot(held.p.x - saved.p.x, held.p.z - saved.p.z)
    check(Math.abs(held.v - saved.v) < 2 && dk < 3, `crash resume: ${held.v.toFixed(1)} m/s ${dk.toFixed(1)} m from the save (${saved.v.toFixed(1)} m/s)`)
    if (load) {
      const jobC = await jobNow(), loadC = await until(() => js('window.__cargo().freight?.key'), 5000) && await js('window.__cargo().freight')
      check(jobC.id === jobF.id && jobC.ex === jobF.ex && jobC.par === jobF.par, `the freight job did not survive the crash: ${JSON.stringify(jobF)} → ${JSON.stringify(jobC)}`)
      check(loadC?.key === load.key, `the strapped load did not survive the crash: ${JSON.stringify(load)} → ${JSON.stringify(loadC)}`)
      console.log(`  crash: freight job ${jobC.id} ${jobC.state}, ${loadC.key} back in the bed`)
    }
    await sleep(1000)
    const still = await js('window.__car()')
    check(Math.hypot(still.x - held.p.x, still.z - held.p.z) < 0.05, 'the resume card did not hold the sim')
    await key('w', true)
    check(!await js(paused), 'W did not end the resume card')
    await simFor(1)
    await key('w', false)
    const rolled = await js('window.__car()')
    check(Math.hypot(rolled.x - held.p.x, rolled.z - held.p.z) > 1, 'the key that ended the resume card did not hand the moving truck back')
    console.log(`  crash: killed at ${kill.v.toFixed(1)} m/s, saved at ${saved.v.toFixed(1)}, resumed at ${held.v.toFixed(1)} m/s ${dk.toFixed(2)} m from the save`)
  }],
  // FEAT-62: the paper-route scenario runs in story mode under a guard and must never touch the player's run
  // (orchestrator, 2026-11-06): save this run, play the scenario — a crash and a restart in it — quit to the
  // menu, and Continue still resumes the run, byte-identical in the slot until then.
  ['paperScenario', async () => {
    const slot = () => js('localStorage.getItem("autos-run/1")')
    await park()
    check(await until(() => js('window.__vs.velocity.length() < 0.2'), 8000), 'paper scenario: the run never came to rest to save')
    const money0 = await js('window.__econ.money')
    for (let i = 0; i < 4 && !await js('document.getElementById("pause-menu").style.display === "flex"'); i++) { await tap('Escape'); await sleep(300) }
    await js('document.getElementById("pm-save").click()')
    check(await until(() => js('document.getElementById("mm-continue").offsetParent !== null'), 5000), 'paper scenario: no continue button after save & exit')
    const before = await slot()
    const pose = JSON.parse(before).data.pose.p
    // From the real menu: new game → mode "scenarios" → the paper route.
    await js('document.getElementById("mm-new").click()')
    await js('document.querySelector(\'button.mm-sel[data-key="gameMode"]\').click()')
    const pick = await js(`(() => { const b = [...document.querySelectorAll('#mm-scenario-list button')].find(b => b.textContent.startsWith('the paper route'))
      if (b) b.click(); return !!b })()`)
    check(pick, 'paper scenario: not on the scenarios page')
    const state = () => js('window.__paper.system.state')
    const dlg = () => js('getComputedStyle(document.getElementById("dialogue-panel")).display !== "none"')
    const offered = async (what, ms) => {
      const t0 = Date.now()
      while (Date.now() - t0 < ms && await state() !== 'offer') { if (await dlg()) await tap('Enter'); await sleep(300) }
      check(await state() === 'offer', `paper scenario ${what}: Larry offered no round (state ${await state()})`)
    }
    await offered('entry', 60000)
    const at = await js(`(() => { const q = window.__map2d()._getPois().find(q => q.type === 'larrysHouse'), c = window.__car()
      return { d: Math.hypot(c.x - q.x, c.z - q.z), sizes: [...document.querySelectorAll('#pp-sizes button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join(' '),
               deadline: /time limit/.test(document.getElementById('pp-body').textContent), decline: document.getElementById('pp-decline').style.display } })()`)
    check(at.d < 40, `paper scenario: seated ${at.d.toFixed(0)} m from Larry's`)
    check(at.sizes === '4* 7 9 11' && !at.deadline && at.decline === 'none', `paper scenario offer: ${JSON.stringify(at)} — want "4* 7 9 11" (BUG-134), no time limit, no decline`)
    check(await js('window.__autosave()') === false, 'paper scenario: the autosave wrote')
    check(await slot() === before, 'paper scenario: the run save changed on entry')
    // A fatal crash: the scenario's card, never the run's end.
    await js('window.__damage.fatalImpact = { kmh: 99 }')
    check(await until(() => js('document.getElementById("scenario-panel").style.display === "block"'), 5000), 'paper scenario: a crash showed no scenario card')
    check(await js('document.getElementById("run-end").style.display !== "block"'), 'paper scenario: a crash reached the run-end card')
    check(await slot() === before, 'paper scenario: the crash touched the run save')
    await js('document.getElementById("sp-restart").click()')
    await offered('restart', 20000)
    check(!await dlg(), 'paper scenario: the briefing replayed on restart')
    check(await slot() === before, 'paper scenario: the restart touched the run save')
    // The result card and the per-rung board: a finished 4-customer round (a B, 3:20 against par 4:10).
    await js(`(() => { const p = window.__paper.system
      p.result = { customers: 4, delivered: 4, letter: 'B', elapsed: 200, par: 250 }; p.state = 'done'; p._onChange() })()`)
    const card = await js(`({ shown: document.getElementById('scenario-panel').style.display, title: document.getElementById('sp-title').textContent,
      body: document.getElementById('sp-body').textContent, board: localStorage.getItem('autos-scenario-times/1:paper-90:4') })`)
    check(card.shown === 'block' && /4 customers/.test(card.title) && /3:20/.test(card.body) && /B\s+par 4:10/.test(card.body) && JSON.parse(card.board ?? '[]')[0]?.elapsed === 200,
      `paper scenario result card: ${JSON.stringify(card)}`)
    check(await slot() === before, 'paper scenario: the result touched the run save')
    await js('document.getElementById("sp-restart").click()')
    await offered('restart after a result', 20000)
    // Out through the pause menu, then Continue resumes the run that was saved.
    for (let i = 0; i < 4 && !await js('document.getElementById("pause-menu").style.display === "flex"'); i++) { await tap('Escape'); await sleep(300) }
    await js('document.getElementById("pm-menu").click()')
    check(await until(() => js('document.getElementById("mm-continue").offsetParent !== null'), 10000), 'paper scenario: no continue button back at the menu')
    check(await slot() === before, 'paper scenario: the run save is not byte-identical after the scenario')
    await js('document.getElementById("mm-continue").click()')
    const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
    check(await until(() => js(live), 45000, 250), 'paper scenario: Continue never went live')
    const c = await js('window.__car()')
    const dm = Math.hypot(c.x - pose[0], c.z - pose[2])
    check(dm < 0.5 && await js('window.__econ.money') === money0, `paper scenario: Continue resumed ${dm.toFixed(2)} m from the saved run, wallet ${await js('window.__econ.money')} (saved ${money0})`)
    if (await js('document.getElementById("resume-card").style.display === "flex"')) await tap('w')   // hand the run back, as the save step leaves it
    console.log(`  paper scenario: Larry's offer "${at.sizes}", crash → card → restart, the run save untouched, Continue resumed at ${dm.toFixed(2)} m`)
  }],
  // FEAT-146: every way a run ends reaches the one summary card, deletes the run save, and the card's
  // button goes back to the main menu. The towel on this run, then a fresh run for each of the others.
  ['endings', async () => {
    const card = () => js('document.getElementById("run-end").style.display === "block" && document.getElementById("re-title").textContent')
    const saved = () => js('localStorage.getItem("autos-run/1") !== null')
    const ended = async (want, why) => {
      const t = await until(card, 5000)
      check(t && want.test(t), `the run-end card reads "${t}", want ${want}`)
      const body = await js('document.getElementById("re-body").textContent')
      if (why) check(why.test(body), `${t}: the card does not say why (FEAT-160), want ${why}: "${body.slice(0, 200)}"`)
      check(/playtime\s*\d+h \d\dm/.test(body) && /jobs completed/.test(body) && /wallet/.test(body) && /truck/.test(body),
        `${t}: the summary is missing rows: "${body.slice(0, 200)}"`)
      await sleep(1500)   // past an autosave tick
      check(!await saved(), `${t}: the run save outlived the run`)
      await js('document.getElementById("re-menu").click()')
      check(await until(() => js('document.getElementById("main-menu").style.display === "flex"'), 3000), `${t}: no main menu after the card`)
      check(await js('document.getElementById("mm-continue").offsetParent === null'), `${t}: "continue" offers an ended run`)
      check(await js('document.getElementById("mm-save-note").style.display === "none"'), `${t}: the save warning outlived the save`)
      check(await js('!document.querySelector("canvas").style.filter'), `${t}: the world stayed black and white`)
      check(await js('window.__stage._dragYaw === 0 && window.__stage._dragPitch === 0'), `${t}: the menu truck kept the last orbit (BUG-109: back to the resting shot)`)
      console.log(`  endings: "${t}" — ${body.replace(/\s+/g, ' ').slice(0, 100)}`)
    }
    const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
    let menuSeen = false
    const newRun = async () => {
      // FEAT-156 (once): the root is continue (only with a save) · new game · tutorial (FEAT-184) · settings, and the
      // new-game page's mode row swaps what is below it — opening on story, never remembered.
      if (!menuSeen) {
        menuSeen = true
        const rootItems = await js('[...document.querySelectorAll("#mm-root button")].filter(b => b.offsetParent !== null).map(b => b.textContent.trim()).join(" · ")')
        check(rootItems === 'new game · tutorial · settings', `main menu root reads "${rootItems}", want "new game · tutorial · settings"`)
      }
      await js('document.getElementById("mm-new").click()')
      const modeView = () => js(`(() => { const v = id => document.getElementById(id).offsetParent !== null
        return { mode: document.querySelector('[data-key=gameMode] .sel-val').textContent.replace(/[◂▸]/g, '').trim(),
                 start: v('su-start'), world: v('su-seed'), list: v('mm-scenario-list') && document.querySelectorAll('#mm-scenario-list button').length } })()`)
      const steps = []
      for (let i = 0; i < 5; i++) {
        steps.push(await modeView())
        if (i < 4) await js('document.querySelector("[data-key=gameMode] .sel-next").click()')
      }
      const want = [['story', true, true, false], ['scenarios', false, false, true], ['free roam', true, true, false], ['testing lab', true, false, false], ['story', true, true, false]]
      check(steps.every((v, i) => v.mode === want[i][0] && v.start === want[i][1] && v.world === want[i][2] && !!v.list === want[i][3]),
        `new-game mode row: ${JSON.stringify(steps)}`)
      await js('document.getElementById("su-seed").value = "6"; document.getElementById("su-start").click()')
      check(await until(() => js(live), 45000, 250), 'a new run never went live (45 s × load)')
      await autoSkipped()   // FEAT-184: the story step's skip turned "always skip the tutorial" on
      check(await until(saved, 3000), 'the new run wrote no save to end')
    }
    const playedS = () => js('JSON.parse(localStorage.getItem("autos-run/1")).data.playedS')
    // The towel: a confirm card (owner, 2026-10-31) — back restores the menu, end ends the run.
    for (let i = 0; i < 4 && await js('document.getElementById("pause-menu").style.display !== "flex"'); i++) { await tap('Escape'); await sleep(300) }
    check(await js('document.getElementById("pm-towel").offsetParent !== null'), 'no "give up" in a story run\'s pause menu')
    // BUG-109: on the pad — the D-pad walks to the towel, A opens its card, the D-pad walks to back, A.
    await padOn()
    const padTo = async (id) => { for (let i = 0; i < 12 && await navFocus() !== id; i++) await btn(13); check(await navFocus() === id, `the D-pad never reached #${id} (stuck on "${await navFocus()}")`); await btn(0) }
    await padTo('pm-towel')
    check(!await card(), 'one press of the towel ended the run')
    check(await until(() => js('document.getElementById("towel-card").style.display === "flex"'), 1000), 'A on the towel opened no confirm card')
    await padTo('tc-back')
    check(await until(() => js('document.getElementById("towel-card").style.display !== "flex" && document.getElementById("pause-menu").style.display === "flex"'), 1000), 'back did not restore the pause menu')
    await js('document.getElementById("pm-towel").click(); document.getElementById("tc-end").click()')
    await ended(/gave up/)
    // BUG-109: the right stick orbits the menu truck (and the next return to the menu re-centres it: ended()).
    await js('__fp.axes[2] = 1'); await frames(10, 300); await js('__fp.axes[2] = 0')
    check(await js('Math.abs(window.__stage._dragYaw) > 0.1'), `the right stick did not orbit the menu truck: yaw ${await js('window.__stage._dragYaw')}`)
    await padOff()
    // The crash: black and white at once, the card after the beat. First, the playtime counts (the save
    // carries it, a second at a time) and stops while paused.
    await newRun()
    const p0 = await playedS(); await sleep(3000); const p1 = await playedS()
    check(p1 - p0 > 1.5 && p1 - p0 < 4.5, `playtime counted ${(p1 - p0).toFixed(1)} s of a 3 s drive`)
    await tap('Escape'); await sleep(1300)   // a whole save tick inside the pause before the first read
    const q0 = await playedS(); await sleep(2500); const q1 = await playedS()
    check(q1 - q0 < 0.2, `playtime counted ${(q1 - q0).toFixed(1)} s behind the pause menu`)
    await tap('Escape'); await sleep(300)
    await js('window.__damage.fatalImpact = { region: "front", v: 40, mph: 90, armor: 0.3 }')
    check(await until(() => js('/grayscale/.test(document.querySelector("canvas").style.filter)'), 1000), 'a fatal hit did not turn the world black and white')
    check(!await card(), 'the crash card skipped the beat')
    await ended(/died/, /hit at 90 mph — front · at 30 % armor the front could take 72 mph; fresh it takes 100/)
    // Broke down (FEAT-162): an empty tank, no gas can — the Recovery card offers the tows while there
    // is money; at $0 the run ends by itself once the truck has sat still a few seconds.
    await newRun()
    // 60 m down the camp's road, away from its barricades: out of every POI's ring, inside the wall.
    const away = await js(`(() => { const q = window.__map2d()._getPois().find(q => q.type === 'expeditionCamp'), b = window.__poi().barricades()[1]
      const ux = q.roadX - b.x, uz = q.roadZ - b.z, l = Math.hypot(ux, uz)
      return { x: q.roadX + ux / l * 60, z: q.roadZ + uz / l * 60, h: Math.atan2(-ux, -uz) } })()`)
    await seat(away.x, away.z, away.h)
    await js(`(() => { const inv = window.__inv; for (const r of [...inv.list()].reverse()) if (r.id === 'emergencyGas' || r.gal > 0.05) inv.drop(r.index)
      window.__econ.money = 1000 })()`)
    await crank()
    // FEAT-162 P3: worn below the line, the engine says so.
    await js("window.__damage.set('engine', 0.1)")
    check(await until(() => js('/the engine is knocking/.test(document.getElementById("machine-word").textContent)'), 2000),
      `no "the engine is knocking" at 10 %: "${await js('document.getElementById("machine-word").textContent')}"`)
    await js('window.__vs.fuel.gal = 0')   // the running engine's next step finds it empty: dry, stalled
    check(await until(() => js('window.__vs.fuel.dry'), 3000), 'the emptied tank never ran dry')
    await park(true)
    // FEAT-172: stuck with money for the tow, the truck says so and points at it — until the card opens.
    const hint = () => js('getComputedStyle(document.getElementById("stranded-hint")).opacity === "1" && document.getElementById("stranded-hint").textContent')
    check(await until(async () => /out of fuel — .*to call a tow/.test(await hint()), 2000),
      `no stranded hint on a dry truck with money: "${await js('document.getElementById("stranded-hint").textContent')}"`)
    await tap('x')
    check(await until(async () => !await hint(), 2000), 'the stranded hint stayed up over the open Recovery card')
    check(await until(() => js('!!document.querySelector("#recovery-card [data-act=towFuel]:not([disabled])")'), 3000),
      `no fuel tow on the Recovery card: "${await js('document.getElementById("recovery-card").textContent')}"`)
    // BUG-113: pad B is the general back on the Recovery card too — it closes the card, it does not pause.
    await padOn(); await btn(1); await padOff()
    check(await until(() => js('document.getElementById("recovery-card").style.display === "none"'), 2000), 'pad B left the Recovery card open (BUG-113)')
    check(await js('document.getElementById("pause-menu").style.display !== "flex"'), 'pad B on the Recovery card opened the pause menu (BUG-113)')
    await tap('x')
    check(await until(() => js('!!document.querySelector("#recovery-card [data-act=towFuel]")'), 3000), 'X did not reopen the Recovery card after B closed it')
    check(!await card(), 'a dry truck with money for a tow ended the run')
    await js('window.__econ.money = 0')
    await ended(/broke down/, /out of fuel — (the tow was \$[\d,.]+|no tow could reach you), you had \$0\b/)
    // FEAT-172: giving up while stranded is breaking down — a seized engine, then the towel.
    await newRun()
    await js("window.__damage.set('engine', 0); window.__econ.money = 1000")   // stuck, and the tow is affordable
    check(await until(() => js('window.__vs.engineHealth <= 0'), 2000), 'a 0 % engine never reached the truck')
    await js('document.getElementById("pm-towel").click(); document.getElementById("tc-end").click()')
    await ended(/broke down/, /the engine seized — (the tow was \$[\d,.]+, and you gave up|no tow could reach you, you had)/)
    // The win: campDeeds deeds open the requisition; all five lines delivered → the win card.
    await newRun()
    // FEAT-184: the skipped run starts with the casserole delivered and Larry read off (autoSkipped), so no job is active.
    await js(`window.__econ.halfPoints = ${2 * ECONOMY_PARAMS.campDeeds}`)
    check(await until(() => js('/requisition 0 \\/ 5/.test(document.getElementById("run-hud").textContent)'), 2000), `${ECONOMY_PARAMS.campDeeds} deeds opened no requisition`)
    await js(`(() => { const b = window.__board(), h = window.__day().clockH()
      const camp = window.__map2d()._getPois().find(q => q.type === 'expeditionCamp')
      for (const o of b.offers(camp.id, h)) { b.take(o.id, h, 300); b.complete(o.id, h) } })()`)
    await ended(/beat the alpha/)
  }],
  ['opening', async () => {
    // FEAT-147: a new run with the opening on starts PARKED AT THE BURGER JOINT, the firing's cards over a slow
    // orbit of it with the sim held, then mom's call. FEAT-170: then the evening at mom's, and her casserole.
    // FEAT-184 (owner, 2026-11-08): it is played from the main menu's "tutorial", with the tutorial flag left COMPLETE,
    // on the URL's ?seed=6. It must never touch the career save: a stand-in record is planted and has to come back as is.
    check(await js('window.__settings.skipTutorial') === true, 'the tutorial flag is not complete (FEAT-184: it starts complete)')
    const career = JSON.stringify({ v: 1, data: { smoke: 'the career run' } })
    await js(`localStorage.setItem("autos-run/1", ${JSON.stringify(career)})`)
    await js('document.getElementById("mm-tutorial").click()')
    const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
    check(await until(() => js(live), 45000, 250), 'the opening run never went live (45 s × load)')
    const code = await js('window.__worldCode()')
    check(code.split('/')[0] === '6', `the tutorial is not on the URL's seed 6: world ${code}`)
    check(await js('window.__autosave()') === false, 'the tutorial run autosaved')
    check(await js('localStorage.getItem("autos-run/1")') === career, 'the tutorial touched the career save')
    const speaker = () => js('getComputedStyle(document.getElementById("dialogue-panel")).display !== "none" && document.getElementById("dlg-speaker").textContent')
    // FEAT-170 stage 4: mom's lessons queue up and hold the sim (and every key) while they are up — read off
    // whatever comes, waiting a beat for a queued one to appear. Returns the speakers' card count.
    const readCards = async (beatMs = 800) => {
      let n = 0
      for (let i = 0; i < 40; i++) {
        if (!await speaker()) { await sleep(beatMs); if (!await speaker()) return n }
        n++; await tap('Enter'); await sleep(200)
      }
      throw new Error('cards never stopped coming')
    }
    check(await until(async () => await speaker() === 'The manager', 3000), `the run did not open on the firing (speaker "${await speaker()}")`)
    const at = () => js(`(() => { const q = window.__poi().list().find(q => q.type === 'foodVendor'), v = window.__vs.position, c = window.__cam().position
      return { truck: Math.hypot(v.x - q.x, v.z - q.z), cam: Math.hypot(c.x - v.x, c.z - v.z), h: window.__day().clockH() } })()`)
    const a = await at(); await sleep(1000); const b = await at()
    check(a.truck < 8, `the truck is ${a.truck.toFixed(1)} m from the burger joint's pad, want < 8`)
    check(b.cam > 9, `the camera is ${b.cam.toFixed(1)} m from the truck — not on the joint's orbit`)
    check(b.h === a.h, `the day clock ran under the firing (${a.h} → ${b.h})`)
    check(Math.abs(a.h + 4.5) < 0.1, `the firing is not at 19:30 on day 0 (clockH ${a.h})`)   // FEAT-170, FEAT-180's 8 pm sun
    // BUG-136: day 0 sits before the clock's zero; the HUD read it as "Day 0, -6 am".
    const hudClock = () => js('document.querySelector("#run-hud .rh-clock")?.textContent')
    check(await until(async () => await hudClock() === 'Day 0, 7:30 pm', 3000), `the HUD clock at the firing reads "${await hudClock()}", want "Day 0, 7:30 pm" (BUG-136)`)
    for (let i = 0; i < 8 && await speaker() === 'The manager'; i++) { await tap('Enter'); await sleep(250) }
    check(await speaker() === 'Mom', `the firing was not followed by mom's call (speaker "${await speaker()}")`)
    for (let i = 0; i < 8 && await speaker() === 'Mom'; i++) { await tap('Enter'); await sleep(250) }
    await readCards()   // stage 4: the driving lesson follows her call
    check(!await speaker(), "mom's call did not close")
    check(await until(async () => (await at()).cam < 9, 3000), 'the camera never came back to the truck')
    // FEAT-170: the EVENING LEG — no job (the casserole is the morning's), the HUD and the GPS to mom's.
    const eve = () => js(`(() => ({ s: window.__mission().state, first: window.__board().firstState(), gps: !!window.__gps(),
      hud: getComputedStyle(document.getElementById('mission-hud')).display !== 'none' && document.getElementById('mission-hud').textContent.trim() }))()`)
    const e0 = await eve()
    check(e0.s === 'idle' && e0.first === 'closed', `the evening is not job-free: ${JSON.stringify(e0)}`)
    // FEAT-184 stage 3: the line goes by the nearest station first when the tank starts near empty (a short detour).
    const fill = /fill up at a pump/.test(e0.hud)
    check(fill ? await js('window.__vs.fuel.gal < 0.2 * 16.5') : /to Mom's · park there to sleep/.test(e0.hud),
      `the evening's HUD points neither to a station on a near-empty tank nor to mom's ("${e0.hud}", ${await js('window.__vs.fuel.gal.toFixed(2)')} gal)`)
    check(await until(async () => (await eve()).gps, 5000), "the GPS has no way to mom's in the evening")
    // BUG-135: the played run's start, the joint's lay-by, drives off too.
    await crank()
    await readCards()   // FEAT-184 stage 3: the pedals' card (and the gauge's) once the key has caught
    if (await js('window.__vs.parked')) await tap(' ')
    { const c0 = await car(); await hold('w', 5); const c1 = await car(), d = Math.hypot(c1.x - c0.x, c1.z - c0.z)
      check(d > 10, `the truck did not drive off from the burger joint: ${d.toFixed(1)} m in 5 s of throttle`) }
    const evePeek = () => js('JSON.stringify({ first: window.__board().firstState(), h: window.__day().clockH(), dlg: getComputedStyle(document.getElementById("dialogue-panel")).display })')
    check(await js('window.__board().firstState() === "closed"'), `the evening ended before the map taps: ${await evePeek()}`)
    // Stage 2: M is the skip's hold now, but a TAP still opens the map (on the release) and closes it.
    await tap('m')
    check(await until(() => js('window.__map2d().isOpen()'), 2000), `a tap of M in the evening did not open the map: ${await evePeek()}`)
    check(await js('window.__board().firstState() === "closed"'), `the first tap of M skipped the evening: ${await evePeek()}`)
    await tap('m')
    check(await until(() => js('!window.__map2d().isOpen()'), 2000), 'a tap of M in the evening did not close the map')
    check(await js('window.__board().firstState() === "closed"'), `a tap of M skipped the evening: ${await js('JSON.stringify({ first: window.__board().firstState(), wd: window.__worstDay(), h: window.__day().clockH(), dlg: document.getElementById("dlg-text")?.textContent.slice(0, 60), map: window.__map2d().isOpen() })')}`)
    // Stage 3, the safe drive: the clock holds on the way home, and off the road R puts the truck back on it.
    const h0 = await js('window.__day().clockH()'); await simFor(2)
    check(await js('window.__day().clockH()') === h0, `the clock ran on the evening's drive (${h0} → ${await js('window.__day().clockH()')})`)
    const lat = (x, z) => `(() => { const q = window.__roadSys().queryNearest(${x}, ${z}, 200); return q?.point ? Math.hypot(q.point.x - ${x}, q.point.z - ${z}) : 999 })()`
    const off = await js(`(() => { const v = window.__vs.position, nr = window.__roadSys().queryNearest(v.x, v.z, 500)
      const t = nr.tangent, l = Math.hypot(t.x, t.z), nx = t.z / l, nz = -t.x / l
      for (const d of [25, -25, 35, -35, 45, -45]) { const x = nr.point.x + nx * d, z = nr.point.z + nz * d
        const q = window.__roadSys().queryNearest(x, z, 100); if (!q?.point || Math.hypot(q.point.x - x, q.point.z - z) > 15) return { x, z } }
      return null })()`)
    check(off, 'no off-road spot beside the joint')
    await seat(off.x, off.z, 0)
    check(await until(async () => /off the road/.test((await eve()).hud), 2000), `off the road, the evening's HUD offers no way back ("${(await eve()).hud}")`)
    await readCards(300)   // a lesson landing here would take the R
    await tap('r')
    check(await until(async () => { const v = await car(); return await js(lat(v.x, v.z)) < 5 }, 8000), 'R in the evening did not put the truck back on the road')
    check(await until(async () => !/off the road/.test((await eve()).hud), 2000), 'the HUD still says off the road on the road')
    await strayCheck('in the evening')
    // FEAT-184 stage 6, THE WORST DAY: the station (when one is due), the flat halfway home, V, the spare that's flat too,
    // the recovery menu's free tow to the auto shop, a tire there, and the night's headlights — then mom's, as before.
    const wd = () => js('window.__worstDay()')
    const tp = async (x, z, h) => {   // not seat(): its settle waits on the sim, and a lesson landing holds it
      await js(`window.__seated = false; window.__teleport(${x}, ${z}, ${h}).then(() => { window.__seated = true })`)
      check(await until(() => js('window.__seated'), 30000, 250), `the teleport to (${x.toFixed(0)}, ${z.toFixed(0)}) never seated`)
      await readCards(); await simFor(1)
    }
    console.log(`  worst day: ${JSON.stringify(await wd())}`)
    if ((await wd()).pump) {
      const pz = await js(`(() => { const q = window.__poi().list().find(q => q.id === window.__worstDay().pump.id); return window.__towSeat(q) })()`)
      await tp(pz.x, pz.z, pz.heading); await park(true)
      check(await until(() => js('document.getElementById("pump-display").classList.contains("on")'), 3000), "the evening's station: parking at its pump opened no pump")
      await readCards()   // the pump's first-use card
      await hold('f', 3); await tap(' ')   // pump, then the brake off pays
      check(await until(async () => (await wd()).pump.done, 3000), `filling up did not end the station's beat: ${JSON.stringify(await wd())}`)
    }
    console.log('  worst day: halfway')
    // Halfway home: a road point at 40 % of the crow distance from mom's, once the home leg is measured.
    await simFor(0.5)
    const half = await js(`(() => { const q = window.__map2d()._getPois().find(q => q.type === 'momsHouse'), v = window.__vs.position
      const x = q.x + (v.x - q.x) * 0.4, z = q.z + (v.z - q.z) * 0.4, nr = window.__roadSys().queryNearest(x, z, 400)
      return nr?.point ? { x: nr.point.x, z: nr.point.z, h: Math.atan2(-nr.tangent.x, -nr.tangent.z) } : null })()`)
    check(half, 'no road halfway home')
    await tp(half.x, half.z, half.h)
    check(await until(async () => (await wd()).flat && await js('window.__damage.flat[0]'), 3000), `halfway home, no flat: ${JSON.stringify(await wd())}`)
    console.log('  worst day: the flat')
    await park(true)
    await tap('v'); await readCards()   // the damage screen's card
    await tap('Escape')
    await js('window.__inv.use("spareTire")'); await readCards()   // the spare: flat too
    await tap('Escape')   // the spare's picker; closing it reopens the inventory (parked)
    if (await until(() => js('document.getElementById("inv-screen").classList.contains("open")'), 1000)) await tap('Escape')
    await js('window.__econ.money = Math.max(window.__econ.money, 100)')   // the tire at the shop is real money
    console.log('  worst day: the tow')
    await tap('x'); await readCards()   // the recovery menu's card
    check(await until(() => js('!!document.querySelector("#recovery-card button[data-act=towShop]:not([disabled])")'), 2000), 'the recovery menu offers no tow to a shop')
    await js('document.querySelector("#recovery-card button[data-act=towShop]").click()')
    check(await until(() => js('document.getElementById("svc-screen").checkVisibility()'), 8000), 'the tow did not land at an open shop')
    check((await wd()).towed, 'the tow was not counted (the night beat)')
    console.log('  worst day: the shop')
    await readCards()   // the shop's cards
    await js('document.querySelector("#svc-screen [data-tab=shop]")?.click()')
    const fit = 'document.querySelector("#svc-screen button[data-act=buy][data-socket=tireFL]:not([disabled])")'
    check(await until(() => js(`!!${fit}`), 2000), 'the shop offers no tire for the front left')
    await js(`${fit}.click()`)
    check(await until(() => js('!window.__damage.flat[0]'), 2000), 'buying a tire for the flat corner did not fix it')
    await tap('Escape'); await tap(' ')   // off the brake: the night drive, whose card holds the sim
    check(await until(async () => /headlights/.test(await js('document.getElementById("dlg-text")?.textContent ?? ""')), 3000), 'no headlights card on the night drive')
    await readCards()
    // Parked at hers: her sleep card, the timer preset to wake at 07:00 — and sleeping posts the casserole.
    const mom = await js(`(() => { const q = window.__map2d()._getPois().find(q => q.type === 'momsHouse')
      return { h: Math.atan2(-q.tx, -q.tz), ...${PAD_SEAT}(q) } })()`)
    // Not seat(): its settle waits on the sim, and the lessons that land on arrival hold it — read them first.
    await js(`window.__seated = false; window.__teleport(${mom.x}, ${mom.z}, ${mom.h}).then(() => { window.__seated = true })`)
    check(await until(() => js('window.__seated'), 30000, 250), "the teleport to mom's never seated")
    // FEAT-184: the flat's lessons were read on the way. The truck seats latched, and after the tow that counts as a pull:
    // her sleep card (and its lessons) may already be open on arrival — then no second park, whose Space would turn them.
    const panel = () => js('getComputedStyle(document.getElementById("camp-panel")).display !== "none"')
    let lessons = await readCards()
    if (!await panel()) { await simFor(1); await park(true) }   // the 0.5 m drop lands, then a fresh pull
    check(await until(panel, 3000), "parking at mom's in the evening opened no sleep card")
    lessons += await readCards()
    check(lessons >= 4, `no parking and sleep lessons at hers (${lessons} read, want her parking card and her three sleep cards)`)
    await js('document.getElementById("cp-sleep").click()')
    const want = await js('Math.round(7 - window.__day().clockH())')
    check(await js('+document.getElementById("cp-hours").value') === want, `the evening's sleep timer is not preset to 07:00 (${await js('document.getElementById("cp-hours").value')} h, want ${want})`)
    await js('document.getElementById("cp-sleep-go").click()')
    check(await until(() => js('window.__day().clockH() >= 6.99'), 6000), `the night did not reach 07:00 (clockH ${await js('window.__day().clockH()')})`)
    check(Math.abs(await js('window.__day().clockH()') - 7) < 0.02, `the evening's night did not wake at 07:00 sharp (clockH ${await js('window.__day().clockH()')})`)
    check(!await js('document.getElementById("midnight-card").classList.contains("on")'), "the tutorial's night dropped the midnight overlay")
    const e1 = await eve()
    check(e1.first === 'live' && !e1.hud && !e1.gps, `waking did not end the evening and post the casserole: ${JSON.stringify(e1)}`)
    // Stage 4, the morning: breakfast, then her card. FEAT-184 stage 5: breakfast is the player's to eat now (her card asks
    // for a packed lunch); the evening held the clock and the night holds the hunger clock, so you wake fed either way.
    const stage = () => js('document.getElementById("hm-stage").textContent')   // FEAT-198: hunger's own line
    check(await readCards() >= 2, 'no breakfast and no "look at my card" in the morning')
    check(!/hungry/.test(await stage()), `the tutorial's morning woke the driver hungry ("${await stage()}")`)
    // Woken at hers, her card opens as the lesson ends — no second park — and the sleep card is gone.
    check(await until(() => js('getComputedStyle(document.getElementById("mp-accept")).display !== "none"'), 3000), "her card did not open after the morning's lesson")
    check(!await panel(), 'the sleep card stayed up under her job card')
    await readCards()   // the job card's lessons: what a card is, and the map line
    await js('document.getElementById("mp-accept").click()')
    const job = () => js(`(() => { const m = window.__mission(); return { s: m.state, a: !!m.mission?.approach, first: window.__board().firstState() } })()`)
    check(await until(async () => { const b = await job(); return b.first === 'taken' && b.s === 'staging' && !b.a }, 3000), `taking mom's casserole did not stage it: ${JSON.stringify(await job())}`)
    for (let i = 0; i < 8 && await speaker(); i++) { await tap('Enter'); await sleep(250) }   // the job card's first-use card
    // FEAT-148: midnight drops its overlay over the road, then clears it (every clock path counts).
    await js('{ const d = window.__day(); d.advanceMinutes((24 - d.clockH() % 24) * 60 + 1) }')
    const mn = () => js('document.getElementById("midnight-card").classList.contains("on") && document.getElementById("mn-main").textContent')
    check(await until(async () => await mn() === 'Supplies are drying up', 1500), `midnight showed no overlay ("${await mn()}")`)
    check(await until(async () => !await mn(), 6000), 'the midnight overlay never cleared')
    // FEAT-169: that jump was past the run's first meal — the meter says hungry, in words; a chili dog
    // from the inventory feeds the driver.
    // (Skipped while hunger is switched off — DAY_PARAMS.hungerOn, off for the 2026-11-06 playtest.)
    if (DAY_PARAMS.hungerOn) {
      check(await until(async () => /^hungry$/.test(await stage()), 1000), `the hunger line does not say hungry ("${await stage()}")`)
      await js('window.__inv.grant("chiliDog"); window.__inv.use("chiliDog")')
      check(await until(async () => !/hungry/.test(await stage()), 1000), `a chili dog did not feed the driver ("${await stage()}")`)
    }
    // The played casserole (the story step's skip delivers it outright, FEAT-184): no deadline and no abandon (BUG-117),
    // its GPS follows a stray truck (BUG-118), and it ends at Larry's — its result card, then his welcome (R-11).
    check(await js('window.__mission().mission?.dueH === Infinity && !document.getElementById("job-cancel").offsetParent'),
      `the casserole has a deadline or an abandon (BUG-117): ${await js('JSON.stringify({ due: String(window.__mission().mission?.dueH), cancel: !!document.getElementById("job-cancel").offsetParent })')}`)
    await strayCheck('on the casserole')
    await readCards()   // a first-use card the stray raised (the rank bar)
    const e = await js('(() => { const p = window.__mission().mission.poly, a = p.at(-2), b = p.at(-1); return { x: b.x, z: b.z, h: Math.atan2(-(b.x - a.x), -(b.z - a.z)) } })()')
    await js(`window.__seated = false; window.__teleport(${e.x}, ${e.z}, ${e.h}).then(() => { window.__seated = true })`)
    check(await until(() => js('window.__seated'), 30000, 250), "the teleport to Larry's never seated")
    for (let i = 0; i < 20 && await js('window.__mission().state !== "done"'); i++) { await readCards(300); await simFor(0.5) }
    check(await js('window.__mission().state === "done"'), `seated at Larry's, the casserole did not arrive: ${await js('window.__mission().state')}`)
    await readCards(300)
    await js('document.getElementById("mp-accept").click()')
    check(await until(async () => await speaker() === 'Uncle Larry', 3000), `no Larry's welcome after the played casserole (speaker "${await speaker()}")`)
    await readCards()
  }],
  ['pad', async () => {
    // FEAT-125 pad audit (2026-11-06): a run end to end on the pad alone — every screen the other steps drive with
    // clicks and keys, here by buttons only (Spare's BUG-109 steps already drive the damage screen, the shop's tabs,
    // the paper route, the give-up card and the menu truck). gamepad.js replays buttons as the keys the screens take.
    await padOn()
    const hold = async (i, ms) => { await js(`__fp.b[${i}] = 1`); await sleep(ms); await frames(2, 30); await js(`__fp.b[${i}] = 0`); await frames(3, 80) }
    const padTo = async (id, dir = 13, n = 12) => { for (let i = 0; i < n && await navFocus() !== id; i++) await btn(dir); check(await navFocus() === id, `the D-pad never reached #${id} (on "${await navFocus()}")`) }
    const dlg = () => js('getComputedStyle(document.getElementById("dialogue-panel")).display !== "none"')
    const readCards = async () => { for (let i = 0; i < 40; i++) { if (!await dlg()) { await sleep(800); if (!await dlg()) return } await btn(0); await sleep(150) } throw new Error('the cards never stopped coming (A)') }
    // Park as a pad player does: LT to a crawl, RB held to rest, a tap to latch.
    const padPark = async () => {
      if (await js('window.__vs.parked')) { await btn(5); await frames(4, 200) }
      if (await js('window.__vs.velocity.length() > 1.2')) { await js('__fp.b[6] = 1'); await until(() => js('window.__vs.velocity.length() < 1.2'), 15000); await js('__fp.b[6] = 0') }
      await js('__fp.b[5] = 1'); await until(() => js('window.__vs.velocity.length() < 0.4'), 15000); await frames(2, 60); await js('__fp.b[5] = 0'); await frames(3, 100)
      if (!await js('window.__vs.parked')) await btn(5)
      check(await js('window.__vs.parked'), 'the pad could not park the truck (LT, RB held, RB tap)')
    }
    // Not seat(): lessons that land on arrival hold the sim, so its settle would wait on nothing — read them, then settle.
    const seatRead = async (x, z, h) => {
      await js(`window.__seated = false; window.__teleport(${x}, ${z}, ${h}).then(() => { window.__seated = true })`)
      check(await until(() => js('window.__seated'), 30000, 250), `teleport to (${x.toFixed(0)}, ${z.toFixed(0)}) never seated`)
      await readCards(); await simFor(1)
    }
    const seatPoi = async (test) => { const p = await js(`(() => { const q = window.__map2d()._getPois().find(${test}); return { h: Math.atan2(-q.tx, -q.tz), ...${PAD_SEAT}(q) } })()`); await seatRead(p.x, p.z, p.h) }

    // The run the opening step left: Start → pause → give up → its confirm → the summary → the main menu.
    await js('window.__settings.skipTutorial = false')   // FEAT-184: this step's new run holds View at the firing
    const inRun = await js('getComputedStyle(document.getElementById("run-hud")).display !== "none"')
    if (!inRun) await js('document.getElementById("pm-story").click()')   // SMOKE_STEPS=boot,pad: free roam, no run to end — the setup page
    else {
    await btn(9)
    check(await until(() => js('document.getElementById("pause-menu").style.display === "flex"'), 2000), 'Start did not pause')
    await padTo('pm-towel'); await btn(0)
    check(await until(() => js('document.getElementById("towel-card").style.display === "flex"'), 2000), 'A on "give up" opened no confirm')
    // BUG-119: the confirm DRAWS its highlight (it had no .nav-focus style: the D-pad moved an invisible one)…
    check(await js(`(() => { const [a, b] = document.querySelectorAll('#towel-card button'), bg = el => getComputedStyle(el).backgroundColor
      return a.classList.contains('nav-focus') !== b.classList.contains('nav-focus') && bg(a) !== bg(b) })()`), 'the give-up confirm draws no highlight (BUG-119)')
    // …and B is its back: the pause menu alone (it opened the menu OVER the card, and the pad kept driving the card).
    await btn(1)
    check(await until(() => js('document.getElementById("towel-card").style.display !== "flex" && document.getElementById("pause-menu").style.display === "flex"'), 2000),
      'B on the give-up confirm did not step back to the pause menu alone (BUG-119)')
    await padTo('pm-towel'); await btn(0)
    check(await until(() => js('document.getElementById("towel-card").style.display === "flex"'), 2000), 'A on "give up" opened no confirm the second time')
    await padTo('tc-end'); await btn(0)
    check(await until(() => js('document.getElementById("run-end").style.display === "block"'), 3000), 'the give-up confirm ended nothing')
    await padTo('re-menu'); await btn(0)
    check(await until(() => js('document.getElementById("main-menu").style.display === "flex"'), 3000), 'A on the summary did not reach the main menu')
    }
    // A new story run from the menu, the seed left blank (a pad cannot type one: blank is Random).
    if (inRun) { await padTo('mm-new'); await btn(0) }
    // SMOKE_PAD_SEED=<seed>: repeat a failed pad step's world (its world code's number) — a development aid.
    if (process.env.SMOKE_PAD_SEED) await js(`document.getElementById("su-seed").value = ${JSON.stringify(process.env.SMOKE_PAD_SEED)}`)
    await padTo('su-start'); await btn(0)
    const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
    check(await until(() => js(live), 45000, 250), 'the pad\'s new run never went live')
    if (process.env.SMOKE_PAD_SEED) console.log(`  pad: world ${await js('window.__worldCode?.()')}`)
    // The firing: A fills a card, A turns it; View held skips the opening (FEAT-170, pad.skipHold).
    check(await until(dlg, 3000), 'the pad\'s run did not open on the firing')
    const txt = () => js('document.getElementById("dlg-text").textContent.slice(0, 40)')
    const t0 = await txt(); await btn(0); await btn(0); await sleep(200)
    check(await txt() !== t0, 'A did not turn the firing\'s card')
    // Read on to mom's first lesson naming a key (her call's M, the drive's W / S): it reads the pad's button, not the keyboard's.
    const lessonCap = () => js('(k => k && JSON.stringify({ kb: getComputedStyle(k.querySelector(".kc-kb")).display, pad: getComputedStyle(k.querySelector(".kc-pad")).display, key: k.querySelector(".kc-kb").textContent, text: k.querySelector(".kc-pad").textContent }))(document.querySelector("#dlg-text .dlg-key .keycap"))')
    for (let i = 0; i < 30 && await dlg() && !await lessonCap(); i++) { await btn(0); await sleep(150) }
    const cap = JSON.parse(await lessonCap() ?? 'null')
    check(cap && cap.kb === 'none' && cap.pad !== 'none' && /^(RT|LT|View|B|RB)$/.test(cap.text), `a lesson's key does not read the pad's button: ${JSON.stringify(cap)}`)
    // FEAT-174: a line that differs by input says it once, for the device driving, and swaps live. The drive lesson
    // reads "the left stick" on the pad; one keyboard press (Shift alone: hands the keyboard control, turns no card)
    // re-reads it as "A and D".
    // FEAT-184 stage 3: the key's card comes first and the pedals' card only once the engine runs — with no card up and
    // the engine off, hold Y (the ignition) until it catches.
    for (let i = 0; i < 16 && !/^Drive safe/.test(await txt()); i++) {
      if (!await dlg() && await js('window.__vs.ignition?.state !== "running"')) await hold(3, 2000)
      else { await btn(0); await sleep(150) }
    }
    const steerWords = () => js('[...document.querySelectorAll("#dlg-text > .kc-kb, #dlg-text > .kc-pad")].filter(e => getComputedStyle(e).display !== "none").map(e => e.textContent).join("|")')
    const onPad = await steerWords()
    await key('Shift', true); await frames(3, 80); await key('Shift', false); await frames(3, 80)
    const onKb = await steerWords()
    check(onPad === 'the left stick' && onKb === 'A and D', `the drive lesson does not name one input's steering, live: pad "${onPad}", keyboard "${onKb}"`)
    await hold(8, 1400)
    check(await until(skipDone, 8000), `holding View did not skip the opening: ${await skipPeek()}`)
    // The glyphs: the pad drove last, so every keycap reads its button.
    check(await js('document.body.classList.contains("pad-on")'), 'body.pad-on is off while the pad drives')
    // The B menu's "abandon job": its LAST entry, never the pre-selection (no B tap can arm it), labelled by its words;
    // ↑ wraps to it, the release arms it, and armed it IS the pre-selection: one B press confirms (BUG-120). Driven at
    // the giver below, on a job taken there.
    const pick = async () => {
      await js('__fp.b[1] = 1'); await frames(4, 200)
      const first = await js('document.querySelector(".menu-sel")?.id')
      await btn(12)
      const r = { first, sel: await js('document.querySelector(".menu-sel")?.id'), label: await js('document.getElementById("hud-menu-label").textContent') }
      await js('__fp.b[1] = 0'); await frames(4, 200)
      return r
    }
    // FEAT-184: the skip lands at Larry's with the casserole delivered — his welcome is up, and A reads it off.
    check(await until(dlg, 3000), 'no Larry after the View skip')
    await readCards()
    // The inventory through the B menu (its first entry), parked on an open road — at a POI, mom's door included, its
    // card or pump owns the brake and the park zone's icons are off the menu by design. The quick-slot numbers are
    // keyboard-only, so they hide.
    const open = await js(`(() => { const pois = window.__map2d()._getPois()   // the map's list: mom's house included
      for (const e of window.__roadSys()._network.values()) for (const q of e.points)
        if (Math.hypot(q.x, q.z) < 1200 && pois.every(o => Math.hypot(o.x - q.x, o.z - q.z) > 150)) return { x: q.x, z: q.z }
      return null })()`)
    check(open, 'no open road 150 m from every POI')
    await seatRead(open.x, open.z, 0); await padPark()
    const modes = (await client.cmd('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
      const m = await import(performance.getEntriesByType("resource").map(r => r.name).find(n => /\\/src\\/gamepad\\.js(\\?|$)/.test(n)))
      const p = m.pad; return JSON.stringify({ menu: p.menuActive(), card: p.cardActive(), map: p.mapActive(), pump: p.pumpActive(), skip: p.skipHold(), hud: !!p.hudMenu, active: p.active, gp: navigator.getGamepads()[0]?.id,
        before: ["inv-screen","dmg-screen","svc-screen"].filter(i => document.getElementById(i)?.classList.contains("open")).concat(["camp-panel","mission-panel","paper-panel","scenario-panel","recovery-card"].filter(i => document.getElementById(i)?.style.display === "block")).map(i => i + ": " + document.getElementById(i).innerText.replace(/\\s+/g, " ").slice(0, 100)) }) })()` })).result.result.value
    await js('__fp.b[1] = 1'); await frames(4, 200)
    const menu = modes + await js('JSON.stringify({ on: document.body.classList.contains("hud-menu-on"), sel: document.querySelector(".menu-sel")?.id, zone: document.getElementById("park-zone").className, parked: window.__vs.parked, icons: [...document.querySelectorAll("#hud-icons .hud-icon")].map(e => e.id + (e.offsetParent ? "" : "·hidden")), dlg: getComputedStyle(document.getElementById("dialogue-panel")).display, cards: ["inv-screen","dmg-screen","svc-screen"].filter(i => document.getElementById(i)?.classList.contains("open")).concat(["camp-panel","mission-panel","paper-panel","scenario-panel","recovery-card"].filter(i => document.getElementById(i)?.style.display === "block")).map(i => i + ": " + document.getElementById(i).innerText.replace(/\\s+/g, " ").slice(0, 80)) })')
    await js('__fp.b[1] = 0'); await frames(4, 250)
    check(await until(() => js('document.getElementById("inv-screen").classList.contains("open")'), 2000), `a B tap did not open the inventory: ${menu}`)
    check(await js('[...document.querySelectorAll("#inv-screen .inv-slot .keycap")].every(k => getComputedStyle(k).display === "none")'), 'the inventory shows quick-slot keys while the pad drives')
    await btn(1); check(await until(() => js('!document.getElementById("inv-screen").classList.contains("open")'), 2000), 'B did not close the inventory')
    // The map (View tap): a giver centred under the pad's cursor pages its offers on LB / RB; B closes it.
    await btn(8)
    check(await until(() => js('window.__map2d().isOpen()'), 2000), 'a View tap did not open the map')
    // Not a shop (SHOP_TYPES: its brake opens the shop screen; the jobs are a button in it, FEAT-104) nor Larry's (the paper route):
    // the flake that hit A, Spare and B was a random world whose busiest giver was a shop. Nor a giver with pump zones:
    // parked there the brake opens the pump (world 1505891932, prompt "to use the pump"). Nor a haul giver (BUG-157):
    // its offers open with the BED over its drop zone (FEAT-88, main.js _inPoiSpot), which PAD_SEAT does not seat
    // (world 3397198020: the firewood yard, seated 5.5 m off its marker, answered nothing).
    const giver = await js(`(() => { const m = window.__map2d(), b = m._getBoard()
      return m._getPois().filter(q => !q.hidden && b.status(q.id)?.source && !${JSON.stringify(['larrysHouse', ...SHOP_TYPES])}.includes(q.type) && !q.pumpZones?.length && !q.drop).map(q => ({ id: q.id, x: q.x, z: q.z, n: b.view(q.id, 0)?.count ?? 0 })).sort((a, b) => b.n - a.n)[0] })()`)
    // The paging needs two offers; the rest of the step needs one. A random world can have no plain giver with two at
    // this point (2927182058/K, 11-08: the busiest had one, on main before and after that day's merges) — page there
    // only when it can, and say so when it can't.
    check(giver?.n > 0, `no giver with an offer: ${JSON.stringify(giver)}`)
    await js(`(() => { const m = window.__map2d(), s = m._sheet(); for (let i = 0; i < 6; i++) { m._panX += (m._sx(${giver.x}) - s.cx) / m._zoom; m._panZ += (m._sy(${giver.z}) - s.cy) / m._zoom } })()`)
    await js('__fp.axes[2] = 0.09'); await frames(3, 60); await js('__fp.axes[2] = 0'); await frames(3, 60)
    const hov = () => js('window.__map2d()._hoverPoi === ' + JSON.stringify(giver.id) + ' && window.__map2d()._hoverIdx')
    check(await hov() === 0, `the pad cursor is not on the giver (${await js('window.__map2d()._hoverPoi')})`)
    if (giver.n > 1) { await btn(5); check(await hov() === 1, 'RB did not page the giver\'s offers'); await btn(4); check(await hov() === 0, 'LB did not page back') }
    else console.log(`  pad: no plain giver with two offers in ${await js('window.__worldCode?.()')}; LB/RB paging unchecked this run`)
    await btn(1); check(await until(() => js('!window.__map2d().isOpen()'), 2000), 'B did not close the map')
    // At the giver, a LONG RB press: the offer card opens under it, and the brake must stay latched (FEAT-125: the
    // card layout re-sent RB's Space, so the park latched and let go).
    await seatPoi(`q => q.id === ${JSON.stringify(giver.id)}`)
    // The seat lands parked and its reseat lets the next poll answer that brake, so the offer may be up already (under
    // load it raced the presses below): decline it, let go of the brake, and give the 10 Hz poll time to see that.
    const offerUp = () => js('document.getElementById("mission-panel").style.display === "block"')
    if (await until(offerUp, 1500)) { await padTo('mp-decline'); await btn(0); await until(async () => !await offerUp(), 2000) }
    if (await js('window.__vs.parked')) await btn(5)
    check(await until(() => js('!window.__vs.parked'), 2000), 'RB did not let go of the brake at the giver')
    await frames(6, 300)
    // A miss under heavy load (main, load 10–14, world 1994461851/K; 6/6 pass there at CPU throttle 1–12): log every Space
    // down/up during the press, so the next one shows whether a second Space edge (the latch toggles on each) came.
    await js(`window.__spaceLog = []; window.__spaceSpy ??= (e => { if (e.key === ' ') __spaceLog.push(e.type.slice(3) + '@' + (performance.now() | 0)) })
      addEventListener('keydown', __spaceSpy, true); addEventListener('keyup', __spaceSpy, true)`)
    await hold(5, 450)
    if (!await js('window.__vs.parked')) check(false, 'a long RB at the giver latched the brake and let it go again (the card opened under the press): '
      + await js(`JSON.stringify({ space: __spaceLog, hb: __vs.handbrake, v: +__vs.velocity.length().toFixed(2), mission: window.__mission().state,
        offerUp: document.getElementById('mission-panel').style.display === 'block', map: window.__map2d().isOpen(),
        open: [...document.querySelectorAll('.open, [style*="display: block"]')].map(e => e.id).filter(Boolean).slice(0, 8) })`))
    // The flake (A, Spare and B under load): say what the park trigger saw, so the next miss names its cause.
    if (!await until(offerUp, 6000)) check(false, 'parking at the giver opened no offer card: ' + await js(`JSON.stringify((() => {
      const v = __vs, q = window.__map2d()._getPois().find(p => p.id === ${JSON.stringify(giver.id)}), m = window.__mission()
      return { parked: v.parked, hb: v.handbrake, v: +v.velocity.length().toFixed(2), m: m.state, onJob: m.isOnJob(),
        offers: window.__map2d()._getBoard().view(q.id, 0)?.count ?? 0, d: +Math.hypot(q.x - v.position.x, q.z - v.position.z).toFixed(1),
        prompt: document.getElementById('poi-prompt')?.innerText.slice(0, 60), promptShown: document.getElementById('poi-prompt')?.style.display === 'block', hudMenu: document.body.classList.contains('hud-menu-on'),
        open: [...document.querySelectorAll('.open, [style*="display: block"], [style*="display: flex"]')].map(e => e.id).filter(Boolean).slice(0, 8) }
    })())`))
    // Take it (A on accept), then put it down through the B menu: the abandon entry, armed, confirmed, and its result card.
    await padTo('mp-accept'); await btn(0)
    check(await until(() => js('window.__mission().isOnJob() && !!document.getElementById("job-cancel").offsetParent'), 3000), 'A on accept took no job with an abandon button')
    check(await js('getComputedStyle(document.querySelector("#job-cancel .kc-pad")).display !== "none" && getComputedStyle(document.querySelector("#job-cancel .kc-kb")).display === "none"'),
      `the abandon button does not show its pad glyph: "${await js('document.getElementById("job-cancel").innerHTML')}"`)
    // FEAT-195: the binding is printed — B + ↑ on the button's keycap and "↑ abandon job" on the menu's "hold B" line;
    // armed, the keycap reads plain B (the confirm) and the line drops it.
    const padCap = () => js('[...document.querySelectorAll("#job-cancel .kc-pad")].map(e => e.textContent).join("")')
    const hintOn = () => js('getComputedStyle(document.querySelector("#hud-b-hint .bh-abandon")).display !== "none"')
    check(await padCap() === 'B+↑' && await hintOn(), `the abandon's B + ↑ is not printed (keycap "${await padCap()}", hint line ${await hintOn()})`)
    const a1 = await pick()
    check(a1.first !== 'job-cancel' && a1.sel === 'job-cancel' && /abandon job/.test(a1.label), `the B menu's abandon entry: ${JSON.stringify(a1)}`)
    check(/confirm\?/.test(await js('document.getElementById("job-cancel").textContent')), 'picking "abandon job" did not arm it')
    check(await padCap() === 'B' && !await hintOn(), `armed, the abandon does not print its plain-B confirm (keycap "${await padCap()}", hint line ${await hintOn()})`)
    // BUG-120: a second trip down the menu ran the 3 s arm out on a real pad — B held, released, nothing walked.
    await js('__fp.b[1] = 1'); await frames(4, 200)
    check(await js('document.querySelector(".menu-sel")?.id') === 'job-cancel', 'the armed abandon is not the B menu\'s pre-selection (BUG-120)')
    await js('__fp.b[1] = 0'); await frames(4, 200)
    check(await until(() => js('window.__mission().state === "done"'), 3000), 'one B press on the armed abandon did not abandon the job')
    await btn(13); await btn(0)
    check(await until(() => js('!window.__mission().isActive()'), 2000), 'A on the abandoned job\'s result card left it up')
    // The pump: A held pumps, RB lets go of the brake and pays.
    const pz = (await client.cmd('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
      const m = await import(performance.getEntriesByType("resource").map(r => r.name).find(n => n.includes("/src/poi.js")))
      return m.towSeat(window.__poi().list().find(q => q.pumpZones?.length)) })()` })).result.result.value
    await js('window.__vs.fuel.gal = 4')
    await seatRead(pz.x, pz.z, pz.heading); await padPark()
    check(await until(() => js('document.getElementById("pump-display").classList.contains("on")'), 3000), 'parking at the pump on the pad opened no pump')
    const g0 = await js('window.__vs.fuel.gal'), m0 = await js('window.__econ.money')
    await hold(0, 2500)
    const g1 = await js('window.__vs.fuel.gal')
    check(g1 - g0 > 1, `A held 2.5 s pumped ${(g1 - g0).toFixed(2)} gal`)
    await btn(5)
    check(await until(() => js(`window.__econ.money < ${m0} - 0.01`), 2000), 'RB at the pump did not pay')
    // Mom's doorstep: its camp card on the D-pad, the sleep timer's slider on ←/→, B back out of both.
    await seatPoi("q => q.type === 'momsHouse'"); await padPark(); await readCards()
    check(await until(() => js('document.getElementById("camp-panel").style.display === "block"'), 3000), 'parking at mom\'s on the pad opened no card')
    await padTo('cp-sleep'); await btn(0); await padTo('cp-hours')
    const h0 = await js('+document.getElementById("cp-hours").value'); await btn(15)
    // > h0, not h0 + 1: a slow page holds btn()'s 3 frames past the D-pad's 400 ms auto-repeat, which steps it again.
    check(await until(() => js(`+document.getElementById("cp-hours").value > ${h0}`), 2000), 'D-pad → did not step the sleep slider')
    await btn(1); await btn(1)
    check(await until(() => js('document.getElementById("camp-panel").style.display !== "block"'), 2000), 'B twice did not back out of the camp card')
    await padOff()
  }],
]

const times = []
let failed = null
// SMOKE_STEPS=boot,pad runs only those steps (a development aid; a landing runs them all).
const ONLY = process.env.SMOKE_STEPS?.split(',')
for (const [name, fn] of STEPS) {
  if (ONLY && !ONLY.includes(name)) continue
  step = name
  const t0 = performance.now()
  // A step on a random world (the pad step's blank seed box) names it, so a miss can be replayed (Lane A, 2026-11-06).
  try { await fn() } catch (e) { failed = { step: name, msg: `${e.message} · ${await js('window.__worldCode?.()').catch(() => 'world code unreadable')}` } }
  times.push(`${name} ${((performance.now() - t0) / 1000).toFixed(1)}s`)
  if (failed || errors.length) break
}
client.close(); cleanup(); shutdown()

console.log(`steps: ${times.join(' · ')} · ceilings stretched up to ×${peakX.toFixed(1)} (boot ×${bootX.toFixed(1)} idle)`)
if (errors.length) {
  console.log(`FAIL: ${errors.length} console error(s); first in step "${errors[0].step}":\n  ${errors[0].msg}`)
  process.exit(1)
}
if (failed) { console.log(`FAIL in step "${failed.step}": ${failed.msg}`); process.exit(1) }
console.log(`PASS: ${STEPS.length} steps, zero console errors`)
process.exit(0)
