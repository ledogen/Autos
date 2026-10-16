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
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHROME, launchChrome, connect, sleep } from './lib/cdp.mjs'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
if (!existsSync(CHROME)) { console.log(`SKIP (no Chrome at ${CHROME})`); process.exit(0) }

const freePort = () => new Promise(r => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const [HTTP, CDP] = [await freePort(), await freePort()]

const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(HTTP), '--strictPort'],
  { cwd: ROOT, stdio: 'ignore' })
const shutdown = () => { try { vite.kill() } catch {} }
process.on('exit', shutdown)

// Poll fn until it returns truthy (resolves with that value) or ms elapse (resolves null).
async function until (fn, ms, every = 100) {
  const t1 = performance.now() + ms
  while (performance.now() < t1) { const v = await fn(); if (v) return v; await sleep(every) }
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
  const r = await client.evalJS(expr)
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
const tap = async (k, opts) => { await key(k, true, opts); await sleep(60); await key(k, false, opts) }
const hold = async (k, ms) => { await key(k, true); await sleep(ms); await key(k, false) }
const car = () => js('window.__car()')
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
    await client.cmd('Page.navigate', { url: `http://localhost:${HTTP}/index.html?nomenu=1` })
    check(await until(() => js('window.__rsReady === true'), 30000, 250), '__rsReady never set (30 s)')
    home = await car()
    check(fin(home.x, home.y, home.z), `truck position not finite: ${JSON.stringify(home)}`)
  }],
  ['drive', async () => {
    const c0 = await car()
    await hold('w', 8000)
    const c1 = await car()
    const moved = Math.hypot(c1.x - c0.x, c1.z - c0.z)
    const fz = await js('[...window.__vs.strutComp]')
    check(moved >= 40, `truck moved ${moved.toFixed(1)} m in 8 s of W (need ≥ 40)`)
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
    await js(`window.__teleport(${p.x}, ${p.z}, 0)`)
    await sleep(4000)
    const a = await car(); await sleep(1000); const b = await car()
    const ground = await js(`window.terrain(${b.x}, ${b.z})`)
    check(b.y > ground - 1, `truck below the ground after teleport: y ${b.y.toFixed(1)} vs terrain ${ground.toFixed(1)}`)
    check(Math.abs(b.y - a.y) < 0.5, `truck still falling 5 s after teleport: dy ${(b.y - a.y).toFixed(2)} m/s`)
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
  ['lab', async () => {
    await js('document.getElementById("pm-lab").click()')
    await sleep(3000)
    check(await js('document.getElementById("pm-lab").textContent') === 'exit testing lab', 'lab did not enter')
    const a = await car(); await sleep(1000); const b = await car()
    check(Math.abs(b.y - a.y) < 0.05 && b.y > -1 && b.y < 3, `truck not resting on the lab slab: y ${a.y.toFixed(2)} → ${b.y.toFixed(2)}`)
    await js('document.getElementById("pm-lab").click()')
    check(await js('document.getElementById("pm-lab").textContent') === 'testing lab', 'lab did not exit')
    await sleep(3000)
    const c = await car()
    check(c.y > await js(`window.terrain(${c.x}, ${c.z})`) - 1, `truck under the world after leaving the lab: y ${c.y.toFixed(1)}`)
  }],
  ['story', async () => {
    await js('document.getElementById("pm-story").click()')
    await js('document.getElementById("ss-seed").value = "6"; document.getElementById("ss-start").click()')
    // Live = the loading stage is down, the run HUD is up and the region has POIs (__story is ?prof-only).
    const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
    check(await until(() => js(live), 45000, 250), 'story never went live (45 s): no run HUD / POIs, or the load stage stayed up')
  }],
  ['camp', async () => {
    // Mom's doorstep is the one camp face reachable without a zone hunt: pull the brake there.
    const p = await js(`(() => { const m = window.__map2d()._getPois().find(q => q.type === 'momsHouse'); if (!m) return null
      let best = null, bd = 25
      for (const e of window.__roadSys()._network.values()) for (const q of e.points) {
        const d = Math.hypot(q.x - m.x, q.z - m.z); if (d < bd && d > 8) { bd = d; best = { x: q.x, z: q.z } } }
      return best })()`)
    check(p, "no road point within 25 m of mom's house")
    await js(`window.__teleport(${p.x}, ${p.z}, 0)`)
    await sleep(2500)
    const panel = () => js('getComputedStyle(document.getElementById("camp-panel")).display !== "none"')
    if (await js('window.__vs.parked')) { await tap(' '); await sleep(400) }   // a teleport seats latched
    await tap(' ')
    check(await until(panel, 2000), "parking at mom's opened no camp panel")
    const clock = () => js('document.querySelector("#run-hud .rh-clock").textContent')
    const h0 = await clock(); await sleep(3000)
    check(await clock() === h0, `clock ran while at mom's (FEAT-118 hold): ${h0} → ${await clock()}`)
    await tap('r')   // R-12: R closes the camp before the re-seat
    check(await until(async () => !await panel(), 2000), 'R left the camp panel up')
    const h1 = await clock(); await sleep(3000)
    check(await clock() !== h1, 'clock did not resume after R closed the camp')
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
  ['backtick', async () => {
    // R-13: one gate for the panel and the wireframes — they flip together, and flip back.
    const st = () => js('[document.querySelector(".lil-gui.root").style.display === "none", window.__physWireframes.enabled]')
    const [h0, w0] = await st()
    await tap('`'); const [h1, w1] = await st()
    await tap('`'); const [h2, w2] = await st()
    check(h1 !== h0 && w1 !== w0, `backtick flipped panel ${h0}→${h1}, wireframes ${w0}→${w1} (must flip both)`)
    check(h2 === h0 && w2 === w0, 'second backtick did not restore the panel and wireframes')
  }],
  ['offer', async () => {
    // A plain delivery giver (no bed-over-drop or park-box rule) with a live offer: seat the truck on
    // its pad (q.x/z — the solid model stands off it at modelX/Z), pull the brake, accept, drive.
    const p = await js(`(() => { const b = window.__map2d()._getBoard(); if (!b) return null
      const q = window.__map2d()._getPois().find(q => q.jobs && !q.hidden && !q.drop && !q.park
        && b.status(q.id)?.family === 'delivery' && b.view(q.id, 0)?.count > 0)
      return q ? { x: q.x, z: q.z, rx: q.roadX, rz: q.roadZ, h: Math.atan2(-q.tx, -q.tz), id: q.id, type: q.type } : null })()`)
    if (!p) { console.log('  offer: no plain delivery giver with a live offer — step skipped'); return }
    await js(`window.__teleport(${p.x}, ${p.z}, ${p.h})`)
    await sleep(2500)
    if (await js('window.__vs.parked')) { await tap(' '); await sleep(400) }
    await tap(' ')
    // checkVisibility, not the element's own display: while the job is still planning the button
    // has no display of its own but its #mp-actions row is hidden, and a click there is lost.
    const vis = id => js(`document.getElementById("${id}").checkVisibility()`)
    check(await until(() => vis('mp-accept'), 2000), `parking at the ${p.type} pad opened no offer`)
    await js('document.getElementById("mp-accept").click()')
    const hudText = () => js('document.querySelector("#mission-hud .hud-text").textContent.trim()')
    check(await until(async () => await vis('mission-hud') && await hudText(), 5000), `no mission HUD after accept: ${JSON.stringify(await js('[document.getElementById("mission-hud").style.display, document.getElementById("mission-hud").textContent.trim(), document.getElementById("mission-panel")?.style.display, document.getElementById("mission-panel")?.textContent.trim().slice(0, 200)]'))}`)
    check(await vis('job-cancel'), 'abandon-job button not shown on a job')
    const staged = await hudText()
    // Pull away from the road beside the pad, facing along it: the pad itself is boxed in by the
    // shop and its yard clutter, which pinned the truck at full throttle.
    await js(`window.__teleport(${p.rx}, ${p.rz}, ${p.h})`)
    await sleep(2000)
    await crank()   // story seats the truck with the engine OFF (FEAT-33)
    if (await js('window.__vs.parked')) await tap(' ')   // and latched
    const c0 = await car(); await hold('w', 6000); const c1 = await car()
    const moved = Math.hypot(c1.x - c0.x, c1.z - c0.z)
    check(moved > 15, `truck moved ${moved.toFixed(0)} m on the job (need > 15)`)
    check(await until(async () => await hudText() !== staged, 3000), `job never started: HUD still "${staged}" after ${moved.toFixed(0)} m`)
    console.log(`  offer: ${p.type} job running after ${moved.toFixed(0)} m — HUD "${await hudText()}"`)
    check(await vis('mission-hud'), 'mission HUD vanished mid-job')
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

console.log(`steps: ${times.join(' · ')}`)
if (errors.length) {
  console.log(`FAIL: ${errors.length} console error(s); first in step "${errors[0].step}":\n  ${errors[0].msg}`)
  process.exit(1)
}
if (failed) { console.log(`FAIL in step "${failed.step}": ${failed.msg}`); process.exit(1) }
console.log(`PASS: ${STEPS.length} steps, zero console errors`)
process.exit(0)
