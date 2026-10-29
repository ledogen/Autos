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
    // FEAT-41: pm-story opens the run setup page (the seed modal is left with the refusal only).
    await js('document.getElementById("pm-story").click()')
    check(await js('document.getElementById("main-menu").classList.contains("setup")'), 'story did not open the setup page')
    await js('document.getElementById("su-seed").value = "6"; document.getElementById("su-start").click()')
    // Live = the loading stage is down, the run HUD is up and the region has POIs (__story is ?prof-only).
    const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
    check(await until(() => js(live), 45000, 250), 'story never went live (45 s): no run HUD / POIs, or the load stage stayed up')
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
    await js(`window.__teleport(${q.x}, ${q.z}, 0)`)
    await sleep(2500)
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
    await js(`window.__teleport(${q.ox}, ${q.oz}, 0)`)
    await sleep(2500)
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
      return q ? { x: q.x, z: q.z, h: Math.atan2(-q.tx, -q.tz) } : null })()`)
    if (!p) { console.log('  service: no auto shop in this region — step skipped'); return }
    await js(`window.__teleport(${p.x}, ${p.z}, ${p.h})`)
    await sleep(2500)
    if (await js('window.__vs.parked')) { await tap(' '); await sleep(400) }
    await tap(' ')
    const open = () => js('document.getElementById("svc-screen").checkVisibility()')
    check(await until(open, 2000), 'parking at the auto shop opened no service screen')
    // My Vehicle lists every corner's tire; selecting one opens its repair / exchange panel.
    await js('document.querySelector("#svc-screen [data-act=sel][data-key=tireRR]")?.click()')
    check(await js('!!document.querySelector("#svc-screen .sv-panel")'), 'selecting a My Vehicle row opened no panel')
    // The Parts Shop is the shop's four-slot shelf (items or empty slots) and My Items.
    await js('document.querySelector("#svc-screen [data-tab=shop]")?.click()')
    check(await js('/For sale/i.test(document.querySelector("#svc-screen").textContent) && /My items/i.test(document.querySelector("#svc-screen").textContent)'),
      'the Parts Shop tab shows no shelf')
    await tap('Escape')
    check(await until(async () => !await open(), 1000), 'Esc left the service screen open')
    await tap(' ')   // brake off: the next step parks fresh
    await sleep(300)
  }],
  ['expedition', async () => {
    // FEAT-103: the camp's gate prompt, the requisition opening at campDeeds, the five lines at the
    // camp, and a line taken THERE waiting, untimed, until the truck parks at its source.
    const pois = 'window.__map2d()._getPois()'
    const camp = await js(`(() => { const q = ${pois}.find(q => q.type === 'expeditionCamp')
      return q ? { x: q.x - q.nx * 3, z: q.z - q.nz * 3, h: Math.atan2(-q.tx, -q.tz) } : null })()`)
    check(camp, 'no expedition camp in the region')
    const prompt = () => js('document.getElementById("poi-prompt").checkVisibility() && document.getElementById("poi-prompt").textContent')
    await js(`window.__teleport(${camp.x}, ${camp.z}, ${camp.h})`)
    await sleep(2500)
    check(/good deeds/.test(await until(prompt, 2000) || ''), `the closed camp's prompt: "${await prompt()}"`)
    await js('window.__econ.halfPoints = 12')
    check(await until(() => js('/requisition 0 \\/ 5/.test(document.getElementById("run-hud").textContent)'), 1000), 'six deeds opened no requisition on the run HUD')
    if (await js('window.__vs.parked')) { await tap(' '); await sleep(400) }
    await tap(' ')
    const vis = id => js(`document.getElementById("${id}").checkVisibility()`)
    check(await until(() => vis('mp-accept'), 3000), 'parking at the open camp opened no lines')
    check(await js('window.__mission().offers.length') === 5, `the camp shows ${await js('window.__mission().offers.length')} lines, want 5`)
    for (let i = 0; i < 5 && await js('window.__mission().offer._spec.line') !== 'reqCrew'; i++) await js('window.__mission().cycle(1)')
    await js('document.getElementById("mp-accept").click()')
    const st = () => js('(() => { const m = window.__mission(); return { s: m.state, a: !!m.mission?.approach, from: m.mission?.fromPoi } })()')
    const a = await st()
    check(a.s === 'staging' && a.a, `a line taken at the camp is not an untimed approach: ${JSON.stringify(a)}`)
    const src = await js(`(() => { const q = ${pois}.find(q => q.id === ${JSON.stringify(a.from)})
      return { x: q.x - q.nx * 3, z: q.z - q.nz * 3, h: Math.atan2(-q.tx, -q.tz) } })()`)
    await js(`window.__teleport(${src.x}, ${src.z}, ${src.h})`)
    await sleep(2500)
    check((await st()).a, 'arriving at the source started the line before the brake')
    if (await js('window.__vs.parked')) { await tap(' '); await sleep(400) }
    await tap(' ')
    check(await until(async () => { const b = await st(); return b.s === 'staging' && !b.a }, 2000), `parking at the source did not start the line: ${JSON.stringify(await st())}`)
    // Cancel (parked, two clicks) → the line goes back on the camp's list.
    await js('document.getElementById("job-cancel").click()'); await js('document.getElementById("job-cancel").click()')
    check(await until(() => js('window.__mission().state === "done"'), 2000), 'cancel did not end the line')
    await js('document.getElementById("mp-accept").click()')
    check(await js(`window.__map2d()._getBoard().status(${JSON.stringify((await js(`${pois}.find(q => q.type === 'expeditionCamp').id`)))}).family !== null`)
      && await js('window.__mission().state === "idle"'), 'the cancelled line is not back at the camp')
    await tap(' ')   // brake off: the next step parks fresh
    await sleep(300)
  }],
  ['offer', async () => {
    // A plain delivery giver (no bed-over-drop or park-box rule) with a live offer: seat the truck on
    // its pad (q.x/z — the solid model stands off it at modelX/Z), pull the brake, accept, drive.
    const p = await js(`(() => { const b = window.__map2d()._getBoard(); if (!b) return null
      const q = window.__map2d()._getPois().find(q => q.jobs && !q.hidden && !q.drop && !q.park && q.type !== 'expeditionCamp'
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
    // SM-3: an auto shop's brake opens the service center; its jobs button hands over to the offer.
    if (p.type === 'autoShop') {
      check(await until(() => vis('svc-screen'), 2000), 'parking at the auto shop opened no service screen')
      await js('document.querySelector("#svc-screen [data-act=jobs]")?.click()')
    }
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
  // FEAT-42: the rolling run save. (1) save & exit → a real reload → continue puts the run back,
  // paused. (2) The crash: kill the page mid-drive with no save & exit at all → continue resumes the
  // truck at the speed it had, held in the pause menu until it is closed.
  ['save', async () => {
    await js('window.__mission().exit()')   // a job in hand holds the save (carrying one is FEAT-42 part 2)
    // The offer step left it driving: brake (S) in short pulses — held past rest S reverses — then latch park.
    for (let k = 0; k < 3 && !await js('window.__vs.parked'); k++) {
      for (let i = 0; i < 60 && await js('window.__vs.velocity.length() > 0.3'); i++) await hold('s', 150)
      await tap(' ')   // the handbrake tap latches park near rest
    }
    check(await until(() => js('window.__vs.velocity.length() < 0.2'), 8000),
      `the truck never came to rest (${(await js('window.__vs.velocity.length()')).toFixed(2)} m/s)`)
    await js('window.__econ.money = 123.45')
    const cost = await js(`(() => { let ok = 0; const t = performance.now(); for (let i = 0; i < 20; i++) ok += window.__autosave()
      return { ok, ms: (performance.now() - t) / 20, kb: localStorage.getItem("autos-run/1").length / 1024 } })()`)
    check(cost.ok === 20, `only ${cost.ok}/20 autosaves wrote`)
    console.log(`  autosave: ${cost.ms.toFixed(2)} ms per write, ${cost.kb.toFixed(1)} KB`)
    // Esc steps back out of any card first (the job panel the exit left behind), then pauses.
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
      await js('document.getElementById("mm-continue").click()')
      check(await until(() => js(live), 45000, 250), `${what}: the resumed run never went live (45 s)`)
      check(await until(() => js(paused), 2000), `${what}: the resumed run did not open paused`)
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
    // (2) the crash. Any key ends the resume card; drive off, and kill the page with the throttle still down.
    await tap('Shift')
    check(await js(paused), 'a bare modifier ended the resume card')
    await tap('w')
    check(await until(async () => !await js(paused), 1000), 'a key did not end the resume card')
    await crank()
    if (await js('window.__vs.parked')) await tap(' ')
    await key('w', true); await sleep(4000)
    const kill = await js('({ v: window.__vs.velocity.length(), p: window.__car() })')
    check(kill.v > 3, `the truck was not moving when the page was killed (${kill.v.toFixed(1)} m/s)`)
    await resume('crash')
    await key('w', false)
    const held = await js('({ v: window.__vs.velocity.length(), p: window.__car() })')
    const dk = Math.hypot(held.p.x - kill.p.x, held.p.z - kill.p.z)
    check(Math.abs(held.v - kill.v) < 2 && dk < 3, `crash resume: ${held.v.toFixed(1)} m/s ${dk.toFixed(1)} m from the kill (${kill.v.toFixed(1)} m/s)`)
    await sleep(1000)
    const still = await js('window.__car()')
    check(Math.hypot(still.x - held.p.x, still.z - held.p.z) < 0.05, 'the resume card did not hold the sim')
    await key('w', true)
    check(!await js(paused), 'W did not end the resume card')
    await sleep(1000)
    await key('w', false)
    const rolled = await js('window.__car()')
    check(Math.hypot(rolled.x - held.p.x, rolled.z - held.p.z) > 1, 'the key that ended the resume card did not hand the moving truck back')
    console.log(`  crash: killed at ${kill.v.toFixed(1)} m/s, resumed at ${held.v.toFixed(1)} m/s ${dk.toFixed(2)} m away`)
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
