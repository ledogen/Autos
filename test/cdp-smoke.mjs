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
const PAD_SEAT = `((q) => { const P = window.__poi(), y = (q.y ?? 0) + 0.8
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
    await client.cmd('Page.navigate', { url: `http://localhost:${HTTP}/index.html?nomenu=1` })
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
    // FEAT-147: a fresh profile plays the opening. This flow is the SKIPPED run — RUN_INTRO at go-live and no
    // first-use card holding the sim under the steps below (the choice is saved, so every later run skips too);
    // the 'opening' step at the end plays it.
    await js('const b = document.querySelector("[data-key=opening]"); if (/play/.test(b.textContent)) b.querySelector(".sel-next").click()')
    await js('document.getElementById("su-seed").value = "6"; document.getElementById("su-start").click()')
    // Live = the loading stage is down, the run HUD is up and the region has POIs (__story is ?prof-only).
    const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
    check(await until(() => js(live), 45000, 250), 'story never went live (45 s × load): no run HUD / POIs, or the load stage stayed up')
    // R-11 (game-feel review): the run opens on Uncle Larry's intro cards, and while a card is up every
    // key advances it and goes nowhere else — so the brake taps below would only turn pages. Read them off.
    const dlg = () => js('getComputedStyle(document.getElementById("dialogue-panel")).display !== "none"')
    check(await until(dlg, 3000), 'the run opened with no intro cards (R-11)')
    // FEAT-103: the uncle names the camp's true compass direction — filled in, never the raw token.
    const intro = await js('document.getElementById("dialogue-panel").textContent')
    check(/expedition camped up at the (north|south)?(east|west)? road/.test(intro) && !intro.includes('{dir}'),
      `the intro does not name the camp's direction: "${intro.slice(0, 120)}"`)
    for (let i = 0; i < 8 && await dlg(); i++) { await tap('Enter'); await sleep(250) }
    check(!await dlg(), 'the intro cards did not close after 8 presses')
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
      return q ? { ...${PAD_SEAT}(q), h: Math.atan2(-q.tx, -q.tz) } : null })()`)
    if (!p) { console.log('  service: no auto shop in this region — step skipped'); return }
    await seat(p.x, p.z, p.h)
    await park(true)
    const open = () => js('document.getElementById("svc-screen").checkVisibility()')
    check(await until(open, 2000), `parking at the auto shop opened no service screen: ${JSON.stringify(await js(`(() => { const c = window.__car()
      return { parked: window.__vs.parked, v: +c.v.toFixed(2), d: +Math.hypot(c.x - ${p.x}, c.z - ${p.z}).toFixed(1), prompt: document.getElementById('poi-prompt')?.textContent.trim().slice(0, 80),
        promptShown: document.getElementById('poi-prompt')?.style.display, mission: window.__mission().state } })()`))}`)
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
    // unlocked rungs. Unlock the 9, park at Larry's, read his briefing, and walk the size row.
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
    check(top.n === 9 && top.sizes === '4 9*' && top.deadline, `Larry's offer: ${JSON.stringify(top)} — want 9 customers, sizes "4 9*" and a time limit`)
    // FEAT-133: a card's first D-pad / arrow press lands on its main action, not the size row above it.
    await tap('ArrowDown')
    check(await js('document.querySelector("#paper-panel .nav-focus")?.id') === 'pp-accept',
      `the first arrow press on Larry's card highlighted "${await js('document.querySelector("#paper-panel .nav-focus")?.textContent')}", not "start the route"`)
    await js('document.querySelector("#pp-sizes button[data-size=\'0\']").click()')
    const small = await view()
    check(small.n === 4 && small.sizes === '4* 9', `picking the 4: ${JSON.stringify(small)}`)
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
      return q ? { ...${PAD_SEAT}(q), rx: q.roadX, rz: q.roadZ, h: Math.atan2(-q.tx, -q.tz), id: q.id, type: q.type } : null })()`)
    if (!p) { console.log('  offer: no plain delivery giver with a live offer — step skipped'); return }
    await seat(p.x, p.z, p.h)
    await park(true)
    // checkVisibility, not the element's own display: while the job is still planning the button
    // has no display of its own but its #mp-actions row is hidden, and a click there is lost.
    const vis = id => js(`document.getElementById("${id}").checkVisibility()`)
    // SM-3: an auto shop's brake opens the service center; its jobs button hands over to the offer.
    if (p.type === 'autoShop') {
      check(await until(() => vis('svc-screen'), 2000), 'parking at the auto shop opened no service screen')
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
    const c0 = await car(); await hold('w', 6000); const c1 = await car()
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
    await js('document.getElementById("pm-save").click()')
    check(await until(() => js('document.getElementById("mm-continue").offsetParent !== null'), 5000), 'no continue button after save & exit')
    const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
    const paused = 'document.getElementById("resume-card").style.display === "flex"'
    const resume = async (what) => {
      await client.cmd('Page.navigate', { url: `http://localhost:${HTTP}/index.html` })
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
        if (o) return { ...${PAD_SEAT}(q), rx: q.roadX, rz: q.roadZ, h: Math.atan2(-q.tx, -q.tz), id: o.id, type: q.type }
      }
      return null })()`)
    let load = null
    if (fr) {
      await seat(fr.x, fr.z, fr.h)
      await park(true)
      const vis = id => js(`document.getElementById("${id}").checkVisibility()`)
      if (fr.type === 'autoShop' && await until(() => vis('svc-screen'), 2000)) await js('document.querySelector("#svc-screen [data-tab=jobs]")?.click(); document.querySelector("#svc-screen [data-act=jobs]")?.click()')
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
      check(await js('!document.querySelector("canvas").style.filter'), `${t}: the world stayed black and white`)
      check(await js('window.__stage._dragYaw === 0 && window.__stage._dragPitch === 0'), `${t}: the menu truck kept the last orbit (BUG-109: back to the resting shot)`)
      console.log(`  endings: "${t}" — ${body.replace(/\s+/g, ' ').slice(0, 100)}`)
    }
    const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
    let menuSeen = false
    const newRun = async () => {
      // FEAT-156 (once): the root is continue (only with a save) · new game · settings, and the
      // new-game page's mode row swaps what is below it — opening on story, never remembered.
      if (!menuSeen) {
        menuSeen = true
        const rootItems = await js('[...document.querySelectorAll("#mm-root button")].filter(b => b.offsetParent !== null).map(b => b.textContent.trim()).join(" · ")')
        check(rootItems === 'new game · settings', `main menu root reads "${rootItems}", want "new game · settings"`)
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
      const dlg = () => js('getComputedStyle(document.getElementById("dialogue-panel")).display !== "none"')
      await until(dlg, 3000)
      for (let i = 0; i < 8 && await dlg(); i++) { await tap('Enter'); await sleep(250) }
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
    // Broke down: an empty tank, no gas can, no money for a tow → the Recovery card's "end run".
    await newRun()
    // 60 m down the camp's road, away from its barricades: out of every POI's ring, inside the wall.
    const away = await js(`(() => { const q = window.__map2d()._getPois().find(q => q.type === 'expeditionCamp'), b = window.__poi().barricades()[1]
      const ux = q.roadX - b.x, uz = q.roadZ - b.z, l = Math.hypot(ux, uz)
      return { x: q.roadX + ux / l * 60, z: q.roadZ + uz / l * 60, h: Math.atan2(-ux, -uz) } })()`)
    await seat(away.x, away.z, away.h)
    await js(`(() => { const inv = window.__inv; for (const r of [...inv.list()].reverse()) if (r.id === 'emergencyGas' || r.gal > 0.05) inv.drop(r.index)
      window.__econ.money = 0 })()`)
    await crank()
    await js('window.__vs.fuel.gal = 0')   // the running engine's next step finds it empty: dry, stalled
    check(await until(() => js('window.__vs.fuel.dry'), 3000), 'the emptied tank never ran dry')
    await park(true)
    await tap('x')
    check(await until(() => js('!!document.querySelector("#recovery-card .rc-end")'), 3000),
      `no "end run" on the Recovery card: "${await js('document.getElementById("recovery-card").textContent')}"`)
    // BUG-113: pad B is the general back on the Recovery card too — it closes the card, it does not pause.
    await padOn(); await btn(1); await padOff()
    check(await until(() => js('document.getElementById("recovery-card").style.display === "none"'), 2000), 'pad B left the Recovery card open (BUG-113)')
    check(await js('document.getElementById("pause-menu").style.display !== "flex"'), 'pad B on the Recovery card opened the pause menu (BUG-113)')
    await tap('x')
    check(await until(() => js('!!document.querySelector("#recovery-card .rc-end")'), 3000), 'X did not reopen the Recovery card after B closed it')
    await js('document.querySelector("#recovery-card .rc-end").click()')
    await ended(/truck is dead/, /(the tow was \$[\d,.]+|no tow could reach you) — you had \$0\b/)
    // The win: campDeeds deeds open the requisition; all five lines delivered → the win card.
    await newRun()
    await js(`window.__econ.halfPoints = ${2 * ECONOMY_PARAMS.campDeeds}`)
    check(await until(() => js('/requisition 0 \\/ 5/.test(document.getElementById("run-hud").textContent)'), 2000), `${ECONOMY_PARAMS.campDeeds} deeds opened no requisition`)
    await js(`(() => { const b = window.__board(), h = window.__day().clockH()
      const camp = window.__map2d()._getPois().find(q => q.type === 'expeditionCamp')
      for (const o of b.offers(camp.id, h)) { b.take(o.id, h, 300); b.complete(o.id, h) } })()`)
    await ended(/beat the alpha/)
  }],
  ['opening', async () => {
    // FEAT-147: a new run with the opening on starts PARKED AT THE BURGER JOINT, the firing's cards over a slow
    // orbit of it with the sim held, then mom's call, which ends with her first job in hand.
    await js('document.getElementById("mm-new").click()')
    await js('const b = document.querySelector("[data-key=opening]"); if (/skip/.test(b.textContent)) b.querySelector(".sel-next").click()')
    await js('document.getElementById("su-seed").value = "6"; document.getElementById("su-start").click()')
    const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
    check(await until(() => js(live), 45000, 250), 'the opening run never went live (45 s × load)')
    const speaker = () => js('getComputedStyle(document.getElementById("dialogue-panel")).display !== "none" && document.getElementById("dlg-speaker").textContent')
    check(await until(async () => await speaker() === 'The manager', 3000), `the run did not open on the firing (speaker "${await speaker()}")`)
    const at = () => js(`(() => { const q = window.__poi().list().find(q => q.type === 'foodVendor'), v = window.__vs.position, c = window.__cam().position
      return { truck: Math.hypot(v.x - q.x, v.z - q.z), cam: Math.hypot(c.x - v.x, c.z - v.z), h: window.__day().clockH() } })()`)
    const a = await at(); await sleep(1000); const b = await at()
    check(a.truck < 8, `the truck is ${a.truck.toFixed(1)} m from the burger joint's pad, want < 8`)
    check(b.cam > 9, `the camera is ${b.cam.toFixed(1)} m from the truck — not on the joint's orbit`)
    check(b.h === a.h, `the day clock ran under the firing (${a.h} → ${b.h})`)
    for (let i = 0; i < 4 && await speaker() === 'The manager'; i++) { await tap('Enter'); await sleep(250) }
    check(await speaker() === 'Mom', `the firing was not followed by mom's call (speaker "${await speaker()}")`)
    check(await js('window.__board().firstState()') === 'live', "mom's first job is not on offer after her call")
    for (let i = 0; i < 4 && await speaker() === 'Mom'; i++) { await tap('Enter'); await sleep(250) }
    check(!await speaker(), "mom's call did not close")
    check(await until(async () => (await at()).cam < 9, 3000), 'the camera never came back to the truck')
    // Owner 11-05 ("i didnt have a job after the opening"): her call ends with her job IN HAND — taken at the
    // joint, untimed until you park at hers, the HUD and the GPS pointing there. Parked at hers, it starts.
    const job = () => js(`(() => { const m = window.__mission(), j = m.mission
      return { s: m.state, a: !!j?.approach, guide: j?.approachGuide?.segments?.length ?? 0, first: window.__board().firstState(),
        hud: document.getElementById('mission-hud').textContent.trim() } })()`)
    const j0 = await job()
    check(j0.first === 'taken' && j0.s === 'staging' && j0.a, `mom's job is not in hand after her call: ${JSON.stringify(j0)}`)
    check(/to Mom's · park there to start/.test(j0.hud), `the job HUD does not point to mom's ("${j0.hud}")`)
    check(j0.guide > 0, "the GPS has no way to mom's (no approachGuide)")
    const mom = await js(`(() => { const q = window.__map2d()._getPois().find(q => q.type === 'momsHouse')
      return { ...${PAD_SEAT}(q), h: Math.atan2(-q.tx, -q.tz) } })()`)
    await seat(mom.x, mom.z, mom.h)
    await park(true)
    check(await until(async () => { const b = await job(); return b.s === 'staging' && !b.a }, 3000), `parking at mom's did not start her job: ${JSON.stringify(await job())}`)
    // FEAT-148: midnight drops its overlay over the road, then clears it (every clock path counts).
    await js('{ const d = window.__day(); d.advanceMinutes((24 - d.clockH() % 24) * 60 + 1) }')
    const mn = () => js('document.getElementById("midnight-card").classList.contains("on") && document.getElementById("mn-main").textContent')
    check(await until(async () => await mn() === 'Supplies are drying up', 1500), `midnight showed no overlay ("${await mn()}")`)
    check(await until(async () => !await mn(), 6000), 'the midnight overlay never cleared')
    // FEAT-169: that jump was past the run's first meal — the meter says hungry, in words; a chili dog
    // from the inventory feeds the driver.
    const stage = () => js('document.getElementById("em-stage").textContent')
    check(await until(async () => /· hungry$/.test(await stage()), 1000), `the energy meter does not say hungry ("${await stage()}")`)
    await js('window.__inv.grant("chiliDog"); window.__inv.use("chiliDog")')
    check(await until(async () => !/hungry/.test(await stage()), 1000), `a chili dog did not feed the driver ("${await stage()}")`)
  }],
]

const times = []
let failed = null
for (const [name, fn] of STEPS) {
  step = name
  const t0 = performance.now()
  try { await fn() } catch (e) { failed = { step: name, msg: e.message } }
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
