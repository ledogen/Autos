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

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { cpus, loadavg } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHROME, launchChrome, connect, sleep } from './lib/cdp.mjs'
import { ECONOMY_PARAMS } from '../src/economy.js'
import { DAY_PARAMS } from '../src/day.js'
import { summarize, parseLines, report } from '../tools/run-log-summary.mjs'   // the runlog step reads its real log back
import { TUTORIAL } from '../data/tutorial.js'   // FEAT-184: the tutorial seed's world (DEC-402)
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
// SMOKE_THROTTLE=4 (or SMOKE_CPU_THROTTLE): this Chrome runs its page 4× slower (CDP Emulation) — a loaded machine's
// timing, repeatably, without loading the machine. For chasing load-only flakes; a landing never sets it. INFRA-15:
// the full smoke passes at 4×.
const THROTTLE = +(process.env.SMOKE_THROTTLE ?? process.env.SMOKE_CPU_THROTTLE ?? 0)
if (THROTTLE > 1) await client.cmd('Emulation.setCPUThrottlingRate', { rate: THROTTLE })

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
// 2026-11-14, DEC-152, DEC-159, DEC-299): it lands outside the burger joint at 07:00 on day 0, free will (no job in hand). Wall-clock:
// the hold is a real-time timer, not sim time.
const skipDone = () => js('window.__tutorial().phase === "free" && window.__mission().state === "idle" && window.__day().clockH() > 6.9')
const skipPeek = () => js('JSON.stringify({ tut: window.__tutorial(), ms: window.__mission().state, h: window.__day().clockH() })')
// FEAT-184 (DEC-148): the prompt reads "hold M to skip tutorial"; `confirm` (the first playthrough ever, or a chosen
// tutorial): the first hold only asks "are you sure you want to skip the tutorial", and a second hold skips.
const skipHint = () => js('document.getElementById("skip-hint").textContent')
const skipOpening = async (confirm = false) => {
  check(await until(() => js('getComputedStyle(document.getElementById("dialogue-panel")).display !== "none"'), 3000), 'the run did not open on the firing')
  check(await js('getComputedStyle(document.getElementById("skip-hint")).display !== "none"'), 'no "hold M to skip" prompt over the firing')
  // the keycap carries the pad's glyph too, hence the `.*`
  check(/^hold M.* to skip tutorial$/.test(await skipHint()), `the skip prompt reads "${await skipHint()}" (FEAT-184: "hold M to skip tutorial")`)
  await key('m', true); await sleep(1300); await key('m', false)
  if (confirm) {
    check(await until(async () => /are you sure you want to skip the tutorial/.test(await skipHint()), 2000), `the first hold asked nothing: "${await skipHint()}"`)
    check(await js('window.__tutorial().phase !== "free"'), `the first hold skipped without the confirmation: ${await skipPeek()}`)
    await key('m', true); await sleep(1300); await key('m', false)
  }
  check(await until(skipDone, 8000), `holding M did not skip the tutorial: ${await skipPeek()}`)
}
// FEAT-184 (DEC-148: no setting, no "always skip"): every new run opens on the firing; skip it and read the manager's
// check, Larry's call and the intro off.
const skipAndReadLarry = async () => {
  await skipOpening()
  const dlg = () => js('getComputedStyle(document.getElementById("dialogue-panel")).display !== "none"')
  check(await until(dlg, 3000), "no manager's check on a run that skips the tutorial")
  check(/last check/.test(await js('document.getElementById("dialogue-panel").textContent')), "the manager's check is not the first card on a skipped run")
  for (let i = 0; i < 24 && (await dlg() || await until(dlg, 600)); i++) { await tap('Enter'); await sleep(250) }
  check(!await dlg(), "the skip's cards did not close after 24 presses")
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
  ['boreCam', async () => {
    // FEAT-246: seed 6's nomenu spawn is in a bore (a test seed). The right stick swings the chase camera a full turn
    // round the truck; at every sample it must stay INSIDE the bore (nothing of the road group, the lining and crown, or
    // the static solids between truck and camera) and out of the truck. Also times the probe at that pose (makeBoomProbe;
    // GROUP_STATIC | GROUP_ROAD = 24n, the old static-only ray = 8n). ASSET90_SHOTS=1 then steers the truck up against the
    // lining and swings the camera into it: a picture with the old ray, then the new one.
    const under = await js('(p => window.__terrain().analyticHeight(p.x, p.z) > p.y + 3)(window.__vs.position)')
    if (!under) { console.log('  boreCam: spawn not under the heightfield, skipped'); return }
    const jsa = async (expr) => (await client.cmd('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: expr })).result?.result?.value
    const setMask = (m) => jsa(`(async () => { const { makeBoomProbe } = await import('/src/camera-boom.js'); const { setCameraBoomProbe } = await import('/src/camera.js')
      setCameraBoomProbe(makeBoomProbe(window.__physicsEngine, (x, z) => window.__terrain().analyticHeight(x, z), ${m})) })()`)
    const los = () => js(`(() => { const p = window.__vs.position, c = window.__cam().position, d = c.clone().sub(p), l = d.length()
      return { blocked: !!window.__physicsEngine.castRay(p, d.normalize(), l, { collidesWith: 24n }), boom: +l.toFixed(2) } })()`)
    const probeUs = (m) => jsa(`(async () => { const { makeBoomProbe } = await import('/src/camera-boom.js')
      const pr = makeBoomProbe(window.__physicsEngine, (x, z) => window.__terrain().analyticHeight(x, z), ${m})
      const p = window.__vs.position.clone(), c = window.__cam().position.clone(), t = []
      for (let k = 0; k < 21; k++) { const t0 = performance.now(); for (let i = 0; i < 500; i++) pr(p, c); t.push((performance.now() - t0) / 500) }
      return t.sort((a, b) => a - b)[10] * 1000 })()`)
    await frames(60, 2000)   // the boot's camera settles behind the truck first
    const us = await probeUs('24n'), us8 = await probeUs('8n')
    await padOn()
    let minBoom = 1e9
    for (let k = 0; k < 24; k++) {
      await js('__fp.axes[2] = 1'); await frames(3, 100)
      const q = await los(); minBoom = Math.min(minBoom, q.boom)
      check(!q.blocked && q.boom > 1, `the chase camera swung round in the bore is behind the lining or the crown, or in the truck: ${JSON.stringify(q)}`)
    }
    await js('__fp.axes[2] = 0')
    let old = null, now = null
    if (process.env.ASSET90_SHOTS) {
      mkdirSync('wip/asset-90', { recursive: true })
      const shot = async (f) => { await frames(20, 700); writeFileSync(`wip/asset-90/${f}`, Buffer.from((await client.cmd('Page.captureScreenshot', { format: 'png' })).result.data, 'base64')) }
      await padOff(); await key('d', true); await hold('w', 4); await key('d', false); await hold(' ', 2); await padOn()   // steered into the lining
      await setMask('8n')
      for (let k = 0; k < 60 && !(await los()).blocked; k++) { await js('__fp.axes[2] = 1'); await frames(2, 60) }
      await js('__fp.axes[2] = 0'); await shot('bore-before.png'); old = await los()
      await setMask('24n'); await shot('bore-after.png'); now = await los()
    }
    await padOff(); await frames(10, 300)
    console.log(`  boreCam: a full swing, boom ≥ ${minBoom} m, never behind the lining; probe ${us?.toFixed(1)} us median (static-only ray ${us8?.toFixed(1)} us)`
      + (old ? `; pictures: old ray ${JSON.stringify(old)}, new ${JSON.stringify(now)}` : ''))
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
    check(await until(() => js('window.__map2d().isOpen() && document.getElementById("map-window").style.display !== "none"'), 2000), 'M did not open the map')
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
    // sim under the steps below; the 'opening' step at the end plays it. FEAT-184 (DEC-148): this browser has not played
    // before, so the skip asks for a confirmation first.
    await js('window.__settings.playedBefore = false')
    await js('document.getElementById("su-seed").value = "6"; document.getElementById("su-start").click()')
    // Live = the loading stage is down, the run HUD is up and the region has POIs (__story is ?prof-only).
    const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
    check(await until(() => js(live), 45000, 250), 'story never went live (45 s × load): no run HUD / POIs, or the load stage stayed up')
    // FEAT-184 (DEC-152, DEC-155, DEC-159, DEC-299): the skip lands outside the burger joint at 07:00 on day 0, 24 h after the
    // firing, no job in hand — then the manager's last check, Larry's call, then his intro (R-11).
    await skipOpening(true)
    check(await js('window.__settings.playedBefore') === true, 'skipping did not mark this browser as played before (FEAT-184)')
    const dlg = () => js('getComputedStyle(document.getElementById("dialogue-panel")).display !== "none"')
    const a = await js(`(() => { const q = window.__poi().list().find(q => q.type === 'foodVendor'), v = window.__vs.position
      return { d: Math.hypot(v.x - q.x, v.z - q.z), h: window.__day().clockH() } })()`)
    // BUG-135: on the road in front of it (25 m) — never on its pad.
    check(a.d < 25 && Math.abs(a.h - 7) < 0.1, `the skip is not at the burger joint at 07:00 on day 1: ${JSON.stringify(a)}`)
    // FEAT-173: fed from the run's start, with mom's three lunches.
    const food = await js('({ fed: window.__day().snapshot().fedUntilH - window.__day().clockH(), lunch: window.__inv.list().find(e => e.id === "packedLunch")?.n ?? 0 })')
    check(food.fed > 0 && food.lunch === 3, `the skip is not fed with mom's three packed lunches (FEAT-173): ${JSON.stringify(food)}`)
    check(await js('getComputedStyle(document.getElementById("skip-hint")).display === "none"'), 'the skip prompt outlived the skip')
    check(await until(dlg, 3000), 'no card after the skip (FEAT-184: the last check, then Larry)')
    const dlgText = () => js('document.getElementById("dialogue-panel").textContent')
    check(/last check/.test(await dlgText()), "the manager's last check is not the first card")
    for (let i = 0; i < 8 && /last check|Ring ring ring/.test(await dlgText()); i++) { await tap('Enter'); await sleep(100) }   // DEC-354: Larry's call rings first
    // The owner's word stream (feat120-blip): a card fills a word at a time (the intro's 33 words take ~2.6 s);
    // a press fills it in place, the next turns it.
    const shown = () => js('[...document.querySelectorAll("#dlg-text span")].filter(w => !w.children.length && w.style.visibility !== "hidden").length')
    const all = () => js('[...document.querySelectorAll("#dlg-text span")].filter(w => !w.children.length).length')
    check(await shown() < await all(), `the intro card did not stream in (${await shown()} of ${await all()} words at once)`)
    await tap('Enter'); await sleep(150)
    check(await shown() === await all(), 'the first press did not fill the card')
    // FEAT-103: the uncle names the camp's true compass direction — filled in, never the raw token.
    // DEC-236 (owner's four cards, 2026-11-15): the direction is on card 2 — turn card 1, fill card 2, then read.
    await tap('Enter'); await sleep(250); await tap('Enter'); await sleep(150)
    const intro = await dlgText()
    check(/expedition camp up at the old (north|south)?(east|west)? road/.test(intro) && !intro.includes('{dir}') && !intro.includes('[DIRECTION]'),
      `the intro does not name the camp's direction (or the fill turned the card): "${intro.slice(0, 120)}"`)
    for (let i = 0; i < 16 && await dlg(); i++) { await tap('Enter'); await sleep(250) }   // two presses a card: fill, turn
    check(!await dlg(), 'the intro cards did not close after 16 presses')
    // BUG-135 (owner, 2026-11-07: the skip parked the truck over mom's fire pit, "completely immobilized"): it drives off.
    await crank()
    if (await js('window.__vs.parked')) await tap(' ')
    const c0 = await car(); await hold('w', 5); const c1 = await car(), off = Math.hypot(c1.x - c0.x, c1.z - c0.z)
    check(off > 10, `the truck did not drive off from Larry's: ${off.toFixed(1)} m in 5 s of throttle`)
  }],
  ['runlog', async () => {
    // FEAT-242 (DEC-358): the run logger, switched on mid-run by its dev handle. The download is intercepted (the anchor
    // click is stubbed, so nothing lands in Downloads): an oil change checked out at the auto shop and a night's sleep
    // must both be in the ONE file "Save log now" downloads (BUG-199: nothing downloads per day), with the header and the 1 s route samples around them.
    await js(`(() => { const A = HTMLAnchorElement.prototype; window.__rlClick = A.click; window.__rlSaved = []
      A.click = function () { if (this.download?.startsWith('autos-run-')) window.__rlSaved.push({ name: this.download, href: this.href }); else window.__rlClick.call(this) } })()`)
    await js('window.__runLog.setOn(true)')
    const p = await js(`(() => { const q = window.__map2d()._getPois().find(q => q.type === 'autoShop' && !q.hidden)
      return q ? { h: Math.atan2(-q.tx, -q.tz), ...${PAD_SEAT}(q) } : null })()`)
    check(p, 'runlog: no auto shop in this region')
    await seat(p.x, p.z, p.h)
    await simFor(2)
    await park(true)
    const open = () => js('document.getElementById("svc-screen").checkVisibility()')
    check(await until(open, 2000), 'runlog: parking at the auto shop opened no service screen')
    // The oil change's button sits deep in the Maintenance tree; the screen handles clicks by delegation, so a button
    // carrying its data-act is the same press.
    await js(`(() => { window.__damage.set('oil', 0.5); window.__econ.money = 500
      const b = document.createElement('button'); b.dataset.act = 'oil'; document.getElementById('svc-screen').appendChild(b); b.click(); b.remove() })()`)
    await js('document.querySelector("#svc-screen [data-act=checkout]")?.click()')
    check(await js('window.__econ.money') < 500, 'runlog: the oil change did not check out')
    await tap('Escape')
    await until(async () => !await open(), 2000)
    await js('window.__day().sleep(8, 0.5)')
    check(await js('window.__rlSaved.length') === 0, 'runlog: something downloaded before the save button was pressed')
    await js('window.__runLog.setOn(false)')
    await js('void window.__runLog.saveNow()')   // async (IndexedDB): wait for its one download
    await until(() => js('window.__rlSaved.length > 0'), 3000)
    const saved = await js('window.__rlSaved.map(s => s.name)')
    check(saved.length === 1 && /^autos-run-6-[\dT-]+Z\.jsonl$/.test(saved[0]), `runlog: the files downloaded are ${JSON.stringify(saved)}`)
    await js('void (window.__rlText = null, Promise.all(window.__rlSaved.map(s => fetch(s.href).then(r => r.text()))).then(t => { window.__rlText = t.join("") }))')
    check(await until(() => js('window.__rlText !== null'), 3000), 'runlog: the downloaded file could not be read back')
    const got = await js(`(() => { const ev = window.__rlText.trim().split('\\n').map(l => JSON.parse(l))
      const by = (e) => ev.filter(x => x.e === e)
      return { n: ev.length, header: by('header').length, route: by('route').length, buy: by('purchase').map(x => x.lines.map(l => l.label).join()),
        sleep: by('sleep').map(x => x.hours), stamped: ev.filter(x => x.e !== 'part').every(x => x.day != null && x.pos?.length === 3) } })()`)
    check(got.header === 1 && got.route >= 2 && got.buy.includes('Oil change') && got.sleep.includes(8) && got.stamped,
      `runlog: the log is missing its header, route samples, the purchase or the sleep: ${JSON.stringify(got)}`)
    // The real one-file log through tools/run-log-summary.mjs (BUG-199's header handling x FEAT-69's SHOP TIME block).
    const { events, bad } = parseLines(await js('window.__rlText')), rep = report(summarize(events), bad)
    check(!bad && /Oil change/.test(rep) && /SHOP TIME[^\n]*\n  day \d+: maintenance (?!0\.00)/.test(rep), `runlog: the summary of the real log lacks the oil change or its shop time:\n${rep}`)
    await js('HTMLAnchorElement.prototype.click = window.__rlClick; delete window.__rlSaved; delete window.__rlText')
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
    // FEAT-245: her menu has an inventory button; it opens the inventory, and closing it leaves her menu up.
    mkdirSync('wip/small-1117', { recursive: true })
    const shot = async (n) => writeFileSync(`wip/small-1117/${n}.png`, Buffer.from((await client.cmd('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))
    await sleep(500); await shot('moms-menu')
    check(await js('getComputedStyle(document.getElementById("cp-item")).display !== "none"'), "mom's menu has no inventory button (FEAT-245)")
    await js('document.getElementById("cp-item").click()')
    check(await until(() => js('document.getElementById("inv-screen").classList.contains("open")'), 2000), "mom's inventory button opened no inventory")
    await tap('Tab')
    check(await until(() => js('!document.getElementById("inv-screen").classList.contains("open")'), 2000) && await panel(), "closing the inventory did not return to mom's menu")
    const clock = () => js('document.querySelector("#run-hud .rh-clock").textContent')
    const h0 = await clock(); await sleep(3000)
    check(await clock() === h0, `clock ran while at mom's (FEAT-118 hold): ${h0} → ${await clock()}`)
    await tap('r')   // R-12: R closes the camp before the re-seat
    check(await until(async () => !await panel(), 2000), 'R left the camp panel up')
    // FEAT-194 part 3: the re-seat latches the parking brake, and no time passes while it is latched.
    check(await js('window.__vs.parked'), 'the re-seat after R did not latch the parking brake')
    const h1 = await clock(); await simFor(3)
    check(await clock() === h1, `clock ran with the parking brake latched (FEAT-194): ${h1} → ${await clock()}`)
    await tap(' '); await simFor(3)
    check(await clock() !== h1, 'clock did not resume after R closed the camp and the brake was released')

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
  ['boltons', async () => {
    // FEAT-204: the roof rack, bull bar and light bar fitted straight onto the truck (window.__parts, no shop, no
    // inventory row): each model in the scene and shown, the light bar's rack-mount model only with the rack (DEC-340,
    // swapped live both ways), the rack's +4 slots, the light bar's longer head beams on high beam only (DEC-373). Back to stock at
    // the end, lamps as found. The newRun step fits them too and checks a new run clears them. Runs after story:
    // SMOKE_STEPS=boot,story,boltons. FEAT204_SHOTS=1 also takes the day / night pictures into wip/feat-204-wire/
    // (it moves the run clock: run it on its own).
    const fit = (id) => js(`(window.__parts.fit('${id}'), true)`)
    const shown = (stem) => js(`(() => { let o = window.sky.scene.getObjectByName('mod:${stem}'); if (!o) return false
      for (; o; o = o.parent) if (!o.visible) return false; return true })()`)
    const models = ['mod-roof-rack', 'mod-bull-bar', 'mod-light-bar-rack', 'mod-light-bar-solo']
    const state = async () => { const r = {}; for (const m of models) r[m] = await shown(m); return JSON.stringify(r) }
    const want = async (on) => until(async () => { for (const m of models) if (await shown(m) !== on.includes(m)) return false; return true }, 8000)
    check(await js('window.__inv.slotCap()') === 8, 'the stock truck does not have 8 slots')
    await fit('lightBar')
    check(await want(['mod-light-bar-solo']), `the light bar alone does not show the solo bar: ${await state()}`)
    await fit('roofRack')
    check(await want(['mod-roof-rack', 'mod-light-bar-rack']), `rack + light bar do not show the rack-mount bar: ${await state()}`)
    await fit('bullBar')
    const all = ['mod-roof-rack', 'mod-light-bar-rack', 'mod-bull-bar']
    check(await want(all), `the three bolt-ons are not all shown: ${await state()}`)
    check(await js('window.__inv.slotCap()') === 12, `the roof rack did not raise the slot cap to 12 (${await js('window.__inv.slotCap()')})`)
    await fit('roofRackNone')
    check(await want(['mod-light-bar-solo', 'mod-bull-bar']), `the rack off did not swap back to the solo bar: ${await state()}`)
    check(await js('window.__inv.slotCap()') === 8, 'the rack off did not take its slots away')
    await fit('roofRack')
    check(await want(all), `the rack back on did not swap to the rack-mount bar: ${await state()}`)
    // The head spots (the two with a cookie map) reach headlightReach × their base range with the bar on.
    const heads = () => js(`JSON.stringify((() => { const r = []; window.sky.scene.traverse(o => { if (o.isSpotLight && o.map) r.push({ d: +o.distance.toFixed(1), on: o.visible }) }); return r })())`)
    const lit = async () => JSON.parse(await heads()).every(h => h.on)
    for (let i = 0; i < 3 && !await lit(); i++) { await tap('l'); await frames(3, 100) }
    // DEC-373 (FEAT-204): the bar burns on HIGH beam only. Low beam: the same range with or without it; high: × 1.47.
    const withAndWithout = async () => { const a = JSON.parse(await heads()); await fit('lightBarNone'); await frames(3, 100)
      const b = JSON.parse(await heads()); await fit('lightBar'); await frames(3, 100); return [a, b] }
    const reflectorsLit = () => js(`(() => { let n = 0; window.sky.scene.getObjectByName('mod:mod-light-bar-rack').traverse(o => { if (o.isMesh && /LightBarReflector/.test(o.material.name) && o.material.emissiveIntensity > 0) n++ }); return n > 0 })()`)
    const [lowBar, lowBare] = await withAndWithout()
    check(lowBar.length === 2 && lowBar.every((h, i) => h.on && h.d === lowBare[i].d), `the light bar changed the LOW beams (DEC-373: high only): ${JSON.stringify({ lowBar, lowBare })}`)
    check(!await reflectorsLit(), 'the light bar\'s reflectors burn on low beam (DEC-373: high only)')
    await tap('l'); await frames(3, 100)   // low → high
    const [barred, bare] = await withAndWithout()
    console.log(`  boltons: high-beam head spots with the bar ${JSON.stringify(barred)} · without ${JSON.stringify(bare)}`)
    check(barred.length === 2 && barred.every((h, i) => h.on && Math.abs(h.d / bare[i].d - 1.47) < 0.01), `the light bar did not lengthen the high beams: ${JSON.stringify({ barred, bare })}`)
    check(await reflectorsLit(), 'the light bar\'s reflectors are dark on high beam')
    await tap('l'); await frames(3, 100); await tap('l'); await frames(3, 100)   // high → off → low, as before the check
    if (process.env.FEAT204_SHOTS) {
      mkdirSync('wip/feat-204-wire', { recursive: true })
      const snap = async (f) => { await frames(20, 1500); writeFileSync(`wip/feat-204-wire/${f}`, Buffer.from((await client.cmd('Page.captureScreenshot', { format: 'png' })).result.data, 'base64')) }
      const toHour = (h) => js(`window.__day().advanceMinutes(Math.round((((${h} - window.__day().clockH()) % 24 + 24) % 24) * 60))`)
      // Front-left three-quarter view, 7 m out, eye 2.2 m up, aimed at the cab.
      const look = (side, back, up) => js(`(() => { const p = window.__vs.position, q = window.__vs.quaternion
        const r = (x, z) => { const c = 1 - 2 * (q.y * q.y + q.z * q.z), s = 2 * (q.x * q.z + q.w * q.y), c2 = 2 * (q.x * q.z - q.w * q.y), c3 = 1 - 2 * (q.x * q.x + q.y * q.y); return [x * c + z * s, x * c2 + z * c3] }
        const [ox, oz] = r(${side}, ${back}), cx = p.x + ox, cy = p.y + ${up}, cz = p.z + oz, dx = p.x - cx, dy = p.y + 0.4 - cy, dz = p.z - cz
        window.__view(cx, cy, cz, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))) })()`)
      for (let i = 0; i < 3 && await lit(); i++) { await tap('l'); await frames(3, 100) }
      await toHour(12); await look(4.5, -6, 2.4); await snap('day-front.png')
      await look(4.5, 5.5, 2.6); await snap('day-rear.png')
      await toHour(23)
      for (let i = 0; i < 3 && !await lit(); i++) { await tap('l'); await frames(3, 100) }
      await look(0, 9, 6); await snap('night-bar.png')
      await fit('lightBarNone'); await snap('night-nobar.png'); await fit('lightBar')
    }
    // FEAT-231 (DEC-352): the bed mat and the bedliner show in the bed only while owned; the liner covers the mat.
    // FEAT231_SHOTS=1 takes the pictures into wip/feat-231-looks/ (from above the bed).
    const bedShown = (n) => js(`(() => { let o = window.sky.scene.getObjectByName('${n}'); if (!o) return false
      for (; o; o = o.parent) if (!o.visible) return false; return true })()`)
    const bedLook = async (mat, liner, why) => check(await until(async () => await bedShown('bed-mat') === mat && await bedShown('bed-liner') === liner, 8000), why)
    const shot = async (f) => { if (!process.env.FEAT231_SHOTS) return; mkdirSync('wip/feat-231-looks', { recursive: true })
      await js(`(() => { const p = window.__vs.position, q = window.__vs.quaternion
        const c = 1 - 2 * (q.y * q.y + q.z * q.z), s = 2 * (q.x * q.z + q.w * q.y), c2 = 2 * (q.x * q.z - q.w * q.y), c3 = 1 - 2 * (q.x * q.x + q.y * q.y)
        const r = (x, z) => [x * c + z * s, x * c2 + z * c3], [ox, oz] = r(0, 3.4), cx = p.x + ox, cy = p.y + 2.6, cz = p.z + oz
        const [tx, tz] = r(0, 1.5), dx = p.x + tx - cx, dy = p.y + 0.1 - cy, dz = p.z + tz - cz
        window.__view(cx, cy, cz, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))) })()`)
      await frames(20, 1500); writeFileSync(`wip/feat-231-looks/${f}`, Buffer.from((await client.cmd('Page.captureScreenshot', { format: 'png' })).result.data, 'base64')) }
    await bedLook(false, false, 'a bare bed shows a mat or a liner'); await shot('bare.png')
    await js(`window.__inv.grant('rubberBedMat')`)
    await bedLook(true, false, 'the owned mat does not show alone'); await shot('mat.png')
    await js(`window.__inv.grant('bedliner')`)
    await bedLook(false, true, 'mat + liner owned does not show the liner alone (it covers the mat)'); await shot('liner.png')
    if (process.env.FEAT231_SHOTS) { await js(`(() => { const d = window.__debris, k = Object.keys(d._types).find(n => /barrel|drum|crate/i.test(n)) || Object.keys(d._types)[0]
        const p = window.__vs.position, q = window.__vs.quaternion, c = 1 - 2 * (q.y * q.y + q.z * q.z), s = 2 * (q.x * q.z + q.w * q.y), c2 = 2 * (q.x * q.z - q.w * q.y), c3 = 1 - 2 * (q.x * q.x + q.y * q.y)
        d.spawn(k, { x: p.x + 1.5 * s, y: p.y + 0.8, z: p.z + 1.5 * c3 }, { x: 0, y: 0, z: 0 }, { pinned: true, noDamage: true }) })()`); await frames(120, 1500); await shot('liner-load.png'); await js('window.__debris.clear()') }
    for (const id of ['rubberBedMat', 'bedliner']) await js(`window.__inv.consume('${id}')`)
    await bedLook(false, false, 'the mat / liner still show with neither owned')
    for (let i = 0; i < 3 && await lit(); i++) { await tap('l'); await frames(3, 100) }
    for (const id of ['roofRackNone', 'bullBarNone', 'lightBarNone']) await fit(id)
    check(await want([]), `stock again, yet a bolt-on still shows: ${await state()}`)
    check(await js('window.__inv.slotCap()') === 8 && await js('window.__openMenus().length') === 0, 'the step left the slot cap raised or a menu open')
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
  ['freshBar', async () => {
    // FEAT-230 slice 2 (DEC-338): a chili dog's freshness bar sits at 6 o'clock over its thumbnail and shortens as the clock
    // runs (2 h of its 16: 100 % → 87.5 %). Runs after inventory: SMOKE_STEPS=boot,story,inventory,freshBar. Picture:
    // wip/fresh/bar.png. Leaves no row, no screen open, and the energy as it found it.
    const open = () => js('document.getElementById("inv-screen").classList.contains("open")')
    const wasParked = await js('window.__vs.parked')
    if (!wasParked) { await tap(' '); check(await until(() => js('window.__vs.parked'), 1000), 'Space did not park') }
    await js(`window.__inv.grant('chiliDog')`)
    await sleep(100)   // a fixed step: the fresh clock seats the new unit
    const bar = () => js(`(() => { const i = window.__inv.list().findIndex(r => r.id === 'chiliDog')
      const s = document.querySelector('#inv-screen .inv-slot[data-slot="' + i + '"]'), b = s?.querySelector('.sl-fresh'), f = b?.firstChild
      if (!f) return null
      const S = s.getBoundingClientRect(), B = b.getBoundingClientRect()
      return { w: f.getBoundingClientRect().width / b.clientWidth, dx: (B.left + B.right) / 2 - (S.left + S.right) / 2, dy: S.bottom - B.bottom } })()`)
    await tap('Tab'); check(await until(open, 1000), 'Tab opened no inventory screen while parked')
    const b0 = await bar()
    check(b0 && b0.w > 0.99, `no full freshness bar on a new chili dog: ${JSON.stringify(b0)}`)
    check(b0 && Math.abs(b0.dx) < 1.5 && b0.dy >= 0 && b0.dy < 8, `the bar is not at 6 o'clock over the thumbnail: ${JSON.stringify(b0)}`)
    check(await js(`document.querySelector('#inv-screen .inv-slot[data-slot="0"] .sl-fresh') === null`), 'the Pack (no fresh time) shows a bar')
    await tap('Escape'); await until(async () => !await open(), 1000)
    const e0 = await js('window.__day().energyH()')
    await js('window.__day().advanceMinutes(120)')
    await sleep(100)
    await tap('Tab'); await until(open, 1000)
    const b1 = await bar()
    check(b1 && Math.abs(b1.w - 0.875) < 0.02, `after 2 h the bar is ${b1 && (b1.w * 100).toFixed(1)} %, not 87.5 %`)
    await sleep(200)
    const shot = await client.cmd('Page.captureScreenshot', { format: 'png' })
    mkdirSync('wip/fresh', { recursive: true }); writeFileSync('wip/fresh/bar.png', Buffer.from(shot.result.data, 'base64'))
    await tap('Escape')
    check(await until(async () => !await open(), 1000), 'Esc left the inventory open')
    await js(`(() => { window.__inv.consume('chiliDog'); window.__day().setEnergy(${e0}) })()`)
    check(!await js(`window.__inv.list().some(r => r.id === 'chiliDog')`), 'the chili dog row is left behind')
    if (!wasParked) await tap(' ')
    const camp = () => js('getComputedStyle(document.getElementById("camp-panel")).display !== "none"')
    if (await camp()) { await tap('r'); check(await until(async () => !await camp(), 2000), 'R left the camp panel up') }
    console.log(`  freshBar: ${(b0.w * 100).toFixed(1)} % → ${(b1.w * 100).toFixed(1)} % after 2 h; centred ${b0.dx.toFixed(1)} px, ${b0.dy.toFixed(1)} px off the bottom`)
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
  ['cook', async () => {
    // FEAT-230 slice 1 + DEC-310: the camp card's cook button, the kit's +20 % on a meal eaten at camp, and a save
    // with potatoes aboard. Runs after the story step: SMOKE_STEPS=boot,story,cook. Leaves camp broken.
    const day = (e) => js(`window.__day().${e}`)
    const n = (id) => js(`(window.__inv.list().find(r => r.id === '${id}')?.n ?? 0)`)
    const fedLeft = () => js('window.__day().snapshot().fedUntilH - window.__day().clockH()')
    const camp = () => js('getComputedStyle(document.getElementById("camp-panel")).display !== "none"')
    const openCamp = async () => {
      await js(`[...document.querySelectorAll('.lil-gui .controller')].find(c => c.textContent.trim() === 'skip to camp dialogue')?.querySelector('button')?.click()`)
      check(await js('document.body.classList.contains("camp-on")'), 'no camp pad at the truck for the camp shortcut')
    }
    await js(`(() => { const i = window.__inv; i.grant('potato', 2); i.grant('cookingKit'); i.packItem(i.list().findIndex(r => r.id === 'cookingKit')) })()`)
    check(await n('potato') === 2 && await n('potatoCooked') === 0, 'the grant did not leave 2 raw, 0 cooked')
    check(await js('window.__inv.use("potato")') === false, 'a raw potato was eaten')
    await openCamp()
    const cook = () => js('(b => b && b.style.display !== "none" && b.textContent)(document.getElementById("cp-cook"))')
    check(await until(async () => /cook a potato/.test(await cook() || ''), 2000), 'no cook button at camp with a raw potato aboard')
    await sleep(600)   // the camp scene's fade-in; the card is up
    const shot = await client.cmd('Page.captureScreenshot', { format: 'png' })
    mkdirSync('wip/feat-230', { recursive: true }); writeFileSync('wip/feat-230/camp-card.png', Buffer.from(shot.result.data, 'base64'))
    const h0 = await day('clockH()')
    await js('document.getElementById("cp-cook").click()')
    check(await until(async () => await n('potatoCooked') === 1, 5000), 'cooking made no cooked potato')
    await until(async () => !(await js('document.getElementById("camp-fade").classList.contains("on")')), 5000)
    const dh = (await day('clockH()')) - h0
    check(await n('potato') === 1 && await n('potatoCooked') === 1, `raw/cooked after one cook: ${await n('potato')}/${await n('potatoCooked')}`)
    check(Math.abs(dh * 60 - 30) < 0.5, `cooking took ${(dh * 60).toFixed(2)} game min, not 30`)
    // Eating at camp with the kit packed: 4 h × 1.2. The day's standing meal is cleared first (a hold never shortens).
    await js('window.__day()._fedUntilH = window.__day().clockH() - 1')
    check(await js('window.__inv.use("potatoCooked")'), 'the cooked potato could not be eaten')
    const withKit = await fedLeft()
    check(Math.abs(withKit - 4.8) < 0.01, `kit at camp: held ${withKit.toFixed(3)} h, not 4.8`)
    // FEAT-230 slice 3: groceries, cooked with the kit deployed (the kit is packed and the camp card is up). 10 h, no +20 % on top.
    await js(`window.__inv.grant('groceries', 2)`)
    const gcook = () => js('(b => b && b.style.display !== "none" && b.textContent)(document.getElementById("cp-cook-groceries"))')
    check(await until(async () => /cook groceries/.test(await gcook() || ''), 2000), 'no groceries line on the camp card with the kit deployed')
    await sleep(400)
    const gshot = await client.cmd('Page.captureScreenshot', { format: 'png' })
    mkdirSync('wip/groceries', { recursive: true }); writeFileSync('wip/groceries/camp-card.png', Buffer.from(gshot.result.data, 'base64'))
    const g0 = await day('clockH()')
    await js('document.getElementById("cp-cook-groceries").click()')
    check(await until(async () => await n('groceriesCooked') === 1, 5000), 'cooking made no cooked groceries')
    await until(async () => !(await js('document.getElementById("camp-fade").classList.contains("on")')), 5000)
    check(Math.abs(((await day('clockH()')) - g0) * 60 - 30) < 0.5, 'cooking groceries did not take 30 game min')
    check(await n('groceries') === 1, `raw groceries after one cook: ${await n('groceries')}`)
    await js('window.__day()._fedUntilH = window.__day().clockH() - 1')
    check(await js('window.__inv.use("groceriesCooked")'), 'the cooked groceries could not be eaten')
    const gHeld = await fedLeft()
    check(Math.abs(gHeld - 10) < 0.01, `cooked groceries at camp with the kit: held ${gHeld.toFixed(3)} h, not 10 (no x1.2)`)
    // The same meal without the kit packed.
    await js(`(() => { const i = window.__inv; i.unpackItem(i.equippedIndex(), i.packed().indexOf('cookingKit')); i.consume('cookingKit')
      i.grant('potatoCooked'); window.__day()._fedUntilH = window.__day().clockH() - 1 })()`)
    check(await js('window.__inv.use("potatoCooked")'), 'the second cooked potato could not be eaten')
    const noKit = await fedLeft()
    check(Math.abs(noKit - 4) < 0.01, `no kit: held ${noKit.toFixed(3)} h, not 4`)
    // No kit deployed: the camp card offers no groceries line (one bag is still aboard).
    check(await until(async () => !(await gcook()), 2000), 'the camp card offers a groceries line without the cooking kit')
    await js(`window.__inv.consume('groceries')`)   // consumed, not dropped: a dropped bag would sit under "Nearby on the ground" for the tires step
    // And away from camp, with the kit packed again: no bonus.
    await js('document.getElementById("cp-break")?.click()')
    check(await until(async () => !await camp(), 3000), 'break camp left the card up')
    await js(`(() => { const i = window.__inv; i.grant('cookingKit'); i.packItem(i.list().findIndex(r => r.id === 'cookingKit'))
      i.grant('potatoCooked'); window.__day()._fedUntilH = window.__day().clockH() - 1 })()`)
    check(await js('window.__inv.use("potatoCooked")'), 'the third cooked potato could not be eaten')
    const away = await fedLeft()
    check(Math.abs(away - 4) < 0.01, `kit packed but away from camp: held ${away.toFixed(3)} h, not 4`)
    // A save with potatoes aboard: 3 raw, 2 cooked → save & exit → reload → Continue → same counts.
    await js(`window.__inv.grant('potato', 2); window.__inv.grant('potatoCooked', 2)`)
    const have = `${await n('potato')}/${await n('potatoCooked')}`
    check(have === '3/2', `expected 3 raw / 2 cooked before the save, got ${have}`)
    await park()   // save & exit is offered parked only
    check(await until(() => js('window.__vs.velocity.length() < 0.2'), 8000), 'the truck never came to rest')
    for (let i = 0; i < 4 && !await js('document.getElementById("pause-menu").style.display === "flex"'); i++) { await tap('Escape'); await sleep(300) }
    check(await js('!document.getElementById("pm-save").disabled'), `save & exit not offered: "${await js('document.getElementById("pm-save-why").textContent')}"`)
    await js('document.getElementById("pm-save").click()')
    check(await until(() => js('document.getElementById("mm-continue").offsetParent !== null'), 5000), 'no continue button after save & exit')
    await client.cmd('Page.navigate', { url: `http://localhost:${HTTP}/index.html?seed=6` })
    check(await until(() => js('window.__rsReady === true && document.getElementById("mm-continue")?.offsetParent != null'), 30000, 250), 'no continue button after the reload')
    await js('document.getElementById("mm-continue").click()')
    const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
    check(await until(() => js(live), 45000, 250), 'the resumed run never went live')
    const back = `${await n('potato')}/${await n('potatoCooked')}`
    check(back === have, `potatoes across save → reload → Continue: ${have} → ${back}`)
    console.log(`  cook: 2→1 raw, 0→1 cooked, +${(dh * 60).toFixed(1)} min; hold kit ${withKit.toFixed(2)} h / none ${noKit.toFixed(2)} h / away ${away.toFixed(2)} h; save ${have} → ${back}`)
  }],
  ['deadFire', async () => {
    // FEAT-264 + ASSET-90 (DEC-393, DEC-397): a camp sleep over two hours swaps the live fire for the ashes-only model,
    // which smokes; cooking at it relights it; a new camp lights it again. Runs after story: SMOKE_STEPS=boot,story,deadFire.
    // ASSET90_SHOTS=1 also takes the dead fire's smoke (day / dusk / night, wide and close, two frames 1 s apart) and the
    // relit fire into wip/asset-90/.
    const fire = () => js(`(() => { const r = window.sky.scene.getObjectByName('campfire'); if (!r || !r.visible) return null
      const has = (c, m) => { let f = false; c.traverse(o => { if (o.isMesh && [].concat(o.material).some(x => x.name.includes(m))) f = true }); return f }
      return { live: r.children.some(c => c.visible && has(c, 'FireLog')), dead: r.children.some(c => c.visible && has(c, 'FireCinder')) } })()`)
    const openCamp = async () => {
      await js(`[...document.querySelectorAll('.lil-gui .controller')].find(c => c.textContent.trim() === 'skip to camp dialogue')?.querySelector('button')?.click()`)
      check(await js('document.body.classList.contains("camp-on")'), 'no camp pad at the truck for the camp shortcut')
    }
    await openCamp()
    check(await until(async () => (await fire())?.live === true && !(await fire()).dead, 8000), `a fresh camp does not show the live fire: ${JSON.stringify(await fire())}`)
    const shots = !!process.env.ASSET90_SHOTS
    const snap = async (f, settle = 1500) => { if (!shots) return; mkdirSync('wip/asset-90', { recursive: true }); await frames(settle ? 20 : 1, settle)
      writeFileSync(`wip/asset-90/${f}`, Buffer.from((await client.cmd('Page.captureScreenshot', { format: 'png' })).result.data, 'base64')) }
    const toHour = (h) => js(`window.__day().advanceMinutes(Math.round((((${h} - window.__day().clockH()) % 24 + 24) % 24) * 60))`)
    // wide: 5 m out and 2.6 m up, the truck behind the fire; close: 1.6 m out, 1.0 m up, looking down into the ring
    const look = (d, up, aim = 0.05) => js(`(() => { const p = new window.__vs.position.constructor(); window.sky.scene.getObjectByName('campfire').getWorldPosition(p)
      const v = window.__vs.position, a = Math.atan2(p.x - v.x, p.z - v.z), cx = p.x + Math.sin(a) * ${d}, cz = p.z + Math.cos(a) * ${d}, cy = p.y + ${up}
      const dx = p.x - cx, dy = p.y + ${aim} - cy, dz = p.z - cz
      window.__view(cx, cy, cz, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))) })()`)
    await js(`window.__inv.grant('potato', 1)`)   // for the relight below (DEC-397)
    if (await js('document.getElementById("resume-card").style.display === "flex"')) await tap('F8')   // a resumed run opens frozen (FEAT-42); any key but a bare modifier lifts it
    const shown = (id) => js(`(b => b && getComputedStyle(b).display !== "none")(document.getElementById("${id}"))`)
    check(await until(() => shown('cp-sleep'), 3000), 'the camp card offers no sleep')
    await js('document.getElementById("cp-sleep").click()')
    await js('document.getElementById("cp-hours").value = "8"; document.getElementById("cp-hours").dispatchEvent(new Event("input"))')
    const h0 = await js('window.__day().clockH()')
    await js('document.getElementById("cp-sleep-go").click()')
    check(await until(async () => (await js('window.__day().clockH()')) > h0 + 2.5, 8000), 'the 8 h camp sleep did not run')
    check(await until(async () => (await fire())?.dead === true && !(await fire()).live, 8000), `after an 8 h camp sleep the fire is not the dead model: ${JSON.stringify(await fire())}`)
    // DEC-397: the dead fire smokes — puffs of the shared smoke pool alive within 3 m of it, rising above the heap.
    const puffs = () => js(`(() => { const p = new window.__vs.position.constructor(); window.sky.scene.getObjectByName('campfire').getWorldPosition(p)
      let n = 0, top = -1e9; window.sky.scene.traverse(o => { const a = o.geometry?.attributes?.aPos; if (!a) return
        for (let i = 0; i < o.geometry.instanceCount; i++) if (Math.hypot(a.getX(i) - p.x, a.getZ(i) - p.z) < 3) { n++; top = Math.max(top, a.getY(i) - p.y) } })
      return { n, top } })()`)
    check(await until(async () => { const q = await puffs(); return q.n >= 4 && q.top > 0.5 }, 8000), `the dead fire does not smoke: ${JSON.stringify(await puffs())}`)
    if (shots) {
      for (const [h, t] of [[13, 'day'], [19.6, 'dusk'], [23.5, 'night']]) {
        await toHour(h); await until(() => js('!document.getElementById("midnight-card").classList.contains("on")'), 8000)
        await look(5, 1.8, 0.8); await snap(`smoke-${t}-wide-a.png`); await sleep(1000); await snap(`smoke-${t}-wide-b.png`, 0)
        await look(2.2, 0.9, 0.6); await snap(`smoke-${t}-close-a.png`); await sleep(1000); await snap(`smoke-${t}-close-b.png`, 0)
      }
      await toHour(13); await until(() => js('!document.getElementById("midnight-card").classList.contains("on")'), 8000)
      await tap('c', { shift: true })   // back to the camp camera so the card's buttons are live
    }
    // DEC-397: the cook buttons show at the dead fire, and a cook relights it at once.
    check(await until(() => shown('cp-cook'), 3000), 'no cook button at the dead fire with a raw potato aboard')
    await until(async () => !(await js('document.getElementById("camp-fade").classList.contains("on") || document.getElementById("midnight-card").classList.contains("on")')), 8000); await sleep(300)   // the night's fade is over (the card ignores clicks until then)
    await js('document.getElementById("cp-cook").click()')
    check(await until(async () => (await fire())?.live === true && !(await fire()).dead, 2000), `cooking at the dead fire did not relight it: ${JSON.stringify(await fire())}`)
    await until(async () => !(await js('document.getElementById("camp-fade").classList.contains("on")')), 5000)
    check(await js('(() => { let l = false; window.sky.scene.getObjectByName("campfire").traverse(o => { if (o.isPointLight && o.visible) l = true }); return l })()'), 'the relit fire has no light')
    if (shots) { await look(5, 2.6); await snap('relit-day-wide.png'); await look(1.6, 1.0); await snap('relit-day-close.png'); await tap('c', { shift: true }) }
    await js('document.getElementById("cp-break")?.click()')
    check(await until(async () => !await js('document.body.classList.contains("camp-on")'), 3000), 'break camp left the camp scene up')
    await openCamp()
    check(await until(async () => (await fire())?.live === true && !(await fire()).dead, 4000), `a new camp after the dead one does not relight: ${JSON.stringify(await fire())}`)
    await js('document.getElementById("cp-break")?.click()')
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
  ['uibatch', async () => {
    // FEAT-216 / FEAT-237 / BUG-188 pictures + checks. Runs after story: SMOKE_STEPS=boot,story,uibatch. Pictures: wip/ui-batch/.
    mkdirSync('wip/ui-batch', { recursive: true })
    const snap = async (name) => { const sh = await client.cmd('Page.captureScreenshot', { format: 'png' }); writeFileSync(`wip/ui-batch/${name}.png`, Buffer.from(sh.result.data, 'base64')) }
    const word = () => js('document.getElementById("machine-word").textContent')
    // two criticals: a failed front-left tire and a flat rear-right one stay up and cycle (DEC-327)
    await js('window.__damage.set("tireFL", 0); window.__damage.flat[3] = true')
    await frames(10, 60)
    const w1 = await word(); await snap('alert-1'); await sleep(2200); const w2 = await word(); await snap('alert-2')
    check(w1 !== w2 && /tire/.test(w1 + w2), `two critical alerts did not cycle: "${w1}" / "${w2}"`)
    await sleep(6000)   // past the old 4 s fade: they are still true, so still up
    check(/tire/.test(await word()) && await js('document.getElementById("machine-word").style.opacity') === '1', `a critical alert faded while still true: ${await js('JSON.stringify({ w: document.getElementById("machine-word").textContent, o: document.getElementById("machine-word").style.opacity, t: window.__damage.get("tireFL"), f: window.__damage.flat })')}`)
    await js('window.__damage.setAll(1); window.__damage.flat.fill(false)')
    await frames(10, 60)
    // the fragile G meter: the real markup, the old linear mapping beside the new logarithmic one
    await js(`(async () => {
      const { meterPos, tenPctG, onePctG } = await import('/src/fragile.js')
      const row = { shockFloorG: 1.2, breakG: 7.1, onePctG: 1.555 }, top = row.breakG * 1.2, root = document.getElementById('job-g')
      const clone = root.cloneNode(true); root.after(clone)
      for (const [r, f, label] of [[root, g => 100 * meterPos(g, top), 'log'], [clone, g => 100 * g / top, 'linear (before)']]) {
        r.style.display = 'flex'; r.style.position = 'fixed'; r.style.left = label === 'log' ? '40px' : '200px'; r.style.top = '120px'; r.style.zIndex = 9999
        r.querySelector('.jg-floor').style.bottom = f(onePctG(row)) + '%'; r.querySelector('.jg-break').style.bottom = f(row.breakG) + '%'
        r.querySelector('.jg-ten').style.bottom = f(tenPctG(row)) + '%'
        r.querySelector('.jg-fill:not(.jg-health)').style.transform = 'scaleY(' + f(3) / 100 + ')'; r.querySelector('.jg-health').style.transform = 'scaleY(0.8)'
        r.querySelector('.rt-label').textContent = label
        if (label !== 'log') r.querySelector('.jg-ten').style.display = 'none'
      }
    })()`)
    await frames(5, 60); await snap('g-meter-before-after')
    // BUG-188: at the auto shop with a cart, B shows the message, it hides itself, and a press never hides it early
    const p = await js(`(() => { const q = window.__map2d()._getPois().find(q => q.type === 'autoShop' && !q.hidden)
      return q ? { h: Math.atan2(-q.tx, -q.tz), ...${PAD_SEAT}(q) } : null })()`)
    if (!p) { console.log('  uibatch: no auto shop in this region — cart half skipped'); return }
    await seat(p.x, p.z, p.h); await park(true)
    check(await until(() => js('document.getElementById("svc-screen").checkVisibility()'), 2000), 'no service screen at the shop')
    await js('document.querySelector("#svc-screen [data-tab=shop]")?.click()')
    await js('document.querySelector("#svc-screen [data-act=node][data-slot]")?.click()')
    await js('document.querySelector("#svc-screen .sv-kids [data-act=stow]")?.click()')
    const msg = () => js('/before you leave/.test(document.querySelector("#svc-screen")?.textContent ?? "")')
    check(!await msg(), 'the cart message showed before any B press')
    await tap('Escape'); check(await msg(), 'B with a full cart did not show the message')
    await snap('cart-message')
    await sleep(500); await tap('Escape'); check(await msg(), 'a second B press hid the message')
    await sleep(700); check(await msg(), 'the message hid before 1 s after the last press')
    await sleep(700); check(!await msg(), 'the message did not hide itself')
    await js('document.querySelector("#svc-screen [data-act=discard]")?.click()')
  }],
  ['uiscale', async () => {
    // FEAT-248: the UI size setting (Small = today, Big = a TV). Each screen opens once, then is shot at Small and Big on 1920x1080
    // and 1280x720; at Big NO visible top-level 2D element may leave the viewport. Runs after story: SMOKE_STEPS=boot,story,uiscale.
    // Pictures: wip/ui-1117/<small|big>-<screen>-<w>.png (the contact sheet is composed from them by hand).
    mkdirSync('wip/ui-1117', { recursive: true })
    const VPS = [[1920, 1080], [1280, 720]]
    const each = async (name) => {
      for (const [w, h] of VPS) {
        await client.cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
        for (const sc of ['small', 'big']) {
          await js(`document.documentElement.dataset.uiScale = '${sc}'`); await sleep(500)
          const sh = await client.cmd('Page.captureScreenshot', { format: 'png' })
          writeFileSync(`wip/ui-1117/${sc}-${name}-${w}.png`, Buffer.from(sh.result.data, 'base64'))
          if (sc !== 'big') continue
          const out = await js(`Array.from(document.body.children).filter(e => e.tagName !== 'CANVAS' && e.id !== 'hud' && e.id !== 'lab-hud' && e.checkVisibility()
            && getComputedStyle(e).position === 'fixed').map(e => [e.id, e.getBoundingClientRect()])
            .filter(([, r]) => r.width > 0 && r.height > 0 && (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1))
            .map(([id, r]) => id + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round))`)
          check(out.length === 0, `Big ${name} ${w}x${h}: leaves the screen: ${out.join('; ')}`)
        }
      }
      await client.cmd('Emulation.clearDeviceMetricsOverride')
    }
    const vis = id => js(`document.getElementById("${id}").checkVisibility()`)
    const nodePoi = (type) => js(`(() => { const q = window.__map2d()._getPois().find(q => q.type === '${type}' && !q.hidden)
      return q ? { h: Math.atan2(-q.tx, -q.tz), ...${PAD_SEAT}(q) } : null })()`)
    for (let i = 0; i < 6 && await js('document.getElementById("dialogue-panel").checkVisibility()'); i++) { await tap('Enter'); await sleep(150) }
    await each('hud')
    // the offer card: a farm that has a job up, its jobs button
    const live = await js(`(() => { const b = window.__map2d()._getBoard(); if (!b) return null
      const q = window.__map2d()._getPois().find(q => q.type === 'farm' && !q.hidden && !q.drop && !q.park && b.view(q.id, 0)?.count > 0)
      return q ? { h: Math.atan2(-q.tx, -q.tz), ...${PAD_SEAT}(q) } : null })()`)
    if (live) {
      await seat(live.x, live.z, live.h); await park(true)
      if (await until(() => vis('svc-screen'), 2000)) {
        await js('document.querySelector("#svc-screen [data-act=jobs]")?.click()')
        if (await until(() => vis('mp-accept'), 2000)) await each('offer')
        await tap('Escape'); await sleep(300); await tap(' '); await sleep(300)
      }
    } else console.log('  uiscale: no farm with an offer — the offer card skipped')
    const shop = await nodePoi('autoShop')
    if (shop) {
      await seat(shop.x, shop.z, shop.h); await park(true)
      check(await until(() => vis('svc-screen'), 2000), 'no service screen at the auto shop')
      await js('document.querySelector("#svc-screen [data-tab=shop]")?.click()'); await sleep(200)
      await each('shop')
      await js('document.querySelector("#svc-screen [data-tab=maint]")?.click()')
      for (const id of ['twbs', 'tw', 'RR', 'tire']) await js(`document.querySelector('#svc-screen [data-act=node][data-id="${id}"]')?.click()`)
      await each('maint')
      // FEAT-263: Maintenance's first row opens the diagnostic screen; B / Esc closes it and the shop is still there, on the same tab.
      await js('document.querySelector("#svc-screen [data-act=diag]").click()'); await sleep(300)
      check(await js('document.getElementById("dmg-screen").classList.contains("open")'), 'FEAT-263: Vehicle Diagnostics opened no damage screen')
      await tap('Escape'); await sleep(300)
      check(await js('!document.getElementById("dmg-screen").classList.contains("open") && document.getElementById("svc-screen").checkVisibility() && !!document.querySelector("#svc-screen [data-act=diag]")'),
        'FEAT-263: closing the diagnostics did not return to Maintenance')
      await tap('Escape'); await sleep(300); await tap(' '); await sleep(300)
    }
    if (await js('window.__vs.parked') === false) await park(true)
    await tap('Tab'); await sleep(300)
    if (await js('document.getElementById("inv-screen").classList.contains("open")')) { await each('inventory'); await tap('Tab') }
    await js('document.documentElement.dataset.uiScale = "small"')
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
    // FEAT-212: Maintenance is a tree, one item open per level — Tires, Wheels… → Tires and Wheels → Rear right → Tire
    // shows its swap; selecting the top level again collapses everything.
    await js('window.__damage.flat[3] = true; document.querySelector("#svc-screen [data-tab=maint]")?.click()')   // FEAT-244: a flat on RR, drawn
    for (const id of ['twbs', 'tw', 'RR', 'tire']) await js(`document.querySelector('#svc-screen [data-act=node][data-id="${id}"]')?.click()`)
    check(await js('/Swap with inventory/.test(document.querySelector("#svc-screen .sv-kids .sv-kids .sv-kids .sv-kids")?.textContent ?? "")'),
      'Maintenance: the rear-right tire opened no swap')
    // FEAT-244: the flat tire is the failing band at every level down to it: category, group, corner, the tire row.
    const red = await js(`['twbs', 'tw', 'RR', 'tire'].map(id => getComputedStyle(document.querySelector('#svc-screen [data-act=node][data-id="' + id + '"] .sv-name')).color)`)
    mkdirSync('wip/small-1117', { recursive: true })
    writeFileSync('wip/small-1117/repair-flat.png', Buffer.from((await client.cmd('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))
    check(red.every(c => c === 'rgb(229, 87, 74)'), `FEAT-244: a flat rear-right tire is not red at every level: ${JSON.stringify(red)}`)
    await js('window.__damage.flat[3] = false; document.querySelector("#svc-screen [data-tab=maint]")?.click()')
    // FEAT-213: an open part's (i) button shows the owner's text, names coloured.
    for (const id of ['brakes']) await js(`document.querySelector('#svc-screen [data-act=node][data-id="${id}"]')?.click()`)
    await js('document.querySelector("#svc-screen [data-act=info]")?.click()')
    check(await js('/below 50% they get weaker/.test(document.querySelector("#svc-screen .sv-info")?.textContent ?? "") && !!document.querySelector("#svc-screen .sv-info .info-part")'),
      'Maintenance: the (i) on Brakes showed no info text')
    await js('document.querySelector("#svc-screen [data-act=node][data-id=twbs]")?.click()')
    check(await js('!document.querySelector("#svc-screen .sv-kids")'), 'Maintenance: selecting the top level again left items open')
    // …and the keys (the pad's D-pad and A arrive as the same keys, menu-nav.js): ↓ walks the list in order, Enter opens.
    const focusId = () => js('document.querySelector("#svc-screen .nav-focus")?.dataset.id ?? null')
    for (let i = 0; i < 6 && await focusId() !== 'twbs'; i++) await tap('ArrowDown')
    await tap('Enter')
    check(await js('!!document.querySelector("#svc-screen [data-act=node][data-id=twbs].on")'), 'Maintenance: ↓ and Enter did not open the first section')
    // The Shop tab is the shop's shelf, one row per item (FEAT-212), and My Items.
    await js('document.querySelector("#svc-screen [data-tab=shop]")?.click()')
    check(await js('/For sale/i.test(document.querySelector("#svc-screen").textContent) && /My items/i.test(document.querySelector("#svc-screen").textContent)'),
      'the Parts Shop tab shows no shelf')
    // BUG-109: the pad's LB / RB step the tabs, wrapping at the ends.
    const tabOn = () => js('document.querySelector("#svc-screen [data-act=tab].on")?.dataset.tab')
    await padOn()
    const t0 = await tabOn(); await btn(5); const t1 = await tabOn(); await btn(4)
    check(t1 && t1 !== t0 && await tabOn() === t0, `RB then LB on the service screen: tab ${t0} → ${t1} → ${await tabOn()}`)
    await padOff()
    // FEAT-212: the cart. A corner swap queues: the truck shows it at once, the wallet waits. With work in the cart Esc
    // and the brake both ask (check out or discard) and the brake holds; discard puts the corners back and lets it go.
    // FR is pinned too (a new game starts with one old front tire, FEAT-201), and an item already open is left open
    // (selecting it again would close it: the key walk above leaves the first section open).
    // FEAT-254: the Shop tab wakes with a highlighted shelf row, which previews on the truck; leaving the tab lifts the preview a
    // frame later and restores the snapshot taken BEFORE a poke. So leave the tab, let the frames run, then poke.
    await js('document.querySelector("#svc-screen [data-tab=maint]")?.click()')
    await frames(3, 50)
    await js('window.__damage.set("tireFL", 0.5); window.__damage.set("tireFR", 1)')
    for (const id of ['twbs', 'tw', 'FL', 'corner']) await js(`(e => e && !e.classList.contains('on') && e.click())(document.querySelector('#svc-screen [data-act=node][data-id="${id}"]'))`)
    const cm0 = await js('window.__econ.money')
    await js(`document.querySelector('#svc-screen [data-act=swap][data-a="0"][data-b="1"]')?.click()`)
    const corners = () => js('[window.__damage.get("tireFL"), window.__damage.get("tireFR")].map(v => +v.toFixed(3)).join()')   // rounded: the tires wear a hair while the bay runs
    const cartLines = () => js('document.querySelectorAll("#svc-screen [data-act=unqueue]").length')
    check(await cartLines() === 1 && await corners() === '1,0.5' && await js('window.__econ.money') === cm0,
      `the corner swap did not queue on the cart (lines ${await cartLines()}, corners ${await corners()}, $${cm0} → $${await js('window.__econ.money')})`)
    await tap('Escape')
    check(await open() && /Check out or discard/.test(await js('document.querySelector("#svc-screen").textContent')), 'Esc with a full cart did not ask')
    await tap(' ')
    await frames(3, 50)
    check(await open() && await js('window.__vs.parked'), 'the brake let go of a truck with a full cart')
    await js('document.querySelector("#svc-screen [data-act=discard]").click()')
    check(await until(async () => !await open(), 1000) && await corners() === '0.5,1' && !await js('window.__vs.parked') && await js('window.__econ.money') === cm0,
      `discard did not put the corners back and let the truck go (corners ${await corners()}, parked ${await js('window.__vs.parked')})`)
    await js('window.__damage.set("tireFL", 1)')
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
    // FEAT-121: the camp-gear rows are on the shelf; picture in wip/camp-gear-shelf/
    check(['Blanket', 'Air mattress', 'Sleeping pad', 'Sleeping bag'].every(n => txt.includes(n)), `the store's shelf lacks the camp gear: "${txt.slice(0, 300)}"`)
    mkdirSync('wip/camp-gear-shelf', { recursive: true })
    writeFileSync('wip/camp-gear-shelf/general-store-shelf.png', Buffer.from((await client.cmd('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))
    await js('window.__econ.money = 50')
    await js('document.querySelector("#svc-screen [data-tab=shop]")?.click()')   // repaints with the new wallet
    const coffees = () => js('window.__inv.list().filter(r => r.id === "coffee").reduce((a, r) => a + r.n, 0) + (window.__inv.pending()?.id === "coffee" ? 1 : 0)')
    const row = 'Array.from(document.querySelectorAll("#svc-screen [data-act=node][data-slot]")).find(r => /Coffee/.test(r.textContent))'
    const price = await js(`+${row}.querySelector(".sv-each").textContent.replace(/[^0-9.]/g, "")`)   // FEAT-212: the closed row's price
    const [m0, n0, h0] = [await js('window.__econ.money'), await coffees(), await js('window.__day().clockH()')]
    await js(`${row}.click()`)   // FEAT-196: select the row, then its options show
    await js('document.querySelector("#svc-screen .sv-kids [data-act=stow]").click()')
    check(await coffees() === n0 + 1 && await js('window.__econ.money') === m0, 'a coffee in the cart is not in the inventory yet, or is already paid for')   // FEAT-212
    await js('document.querySelector("#svc-screen [data-act=checkout]").click()')
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
  ['farm', async () => {
    // FEAT-230 slice 3: a farm sells for the first time (groceries, $5). Parking at one opens the same buy screen as the
    // general store, its jobs a button inside it ("go to jobs", FEAT-197) that appears only while the farm has an offer up.
    // A farm with NO offer: the shop, no jobs button. A farm WITH one: the button, the farm's own offer card, accept, a mission.
    // Pictures: wip/groceries/farm-shop.png (no offer), farm-shop-jobs.png (the jobs button).
    const vis = id => js(`document.getElementById("${id}").checkVisibility()`)
    const find = (want) => js(`(() => { const b = window.__map2d()._getBoard(); if (!b) return null
      const q = window.__map2d()._getPois().find(q => q.type === 'farm' && !q.hidden && !q.drop && !q.park && ((b.view(q.id, 0)?.count > 0) === ${want}))
      return q ? { h: Math.atan2(-q.tx, -q.tz), id: q.id, ...${PAD_SEAT}(q) } : null })()`)
    const shot = async (f) => { await sleep(600); const r = await client.cmd('Page.captureScreenshot', { format: 'png' }); mkdirSync('wip/groceries', { recursive: true }); writeFileSync(`wip/groceries/${f}`, Buffer.from(r.result.data, 'base64')) }
    const leave = async () => { await tap('Escape'); await until(async () => !await vis('svc-screen'), 1500); await tap(' '); await sleep(300) }
    const bare = await find(false)
    if (bare) {
      await seat(bare.x, bare.z, bare.h); await park(true)
      check(await until(() => vis('svc-screen'), 2000), 'parking at a farm with no offer opened no shop')
      const txt = await js('document.querySelector("#svc-screen").textContent')
      check(/Groceries/.test(txt) && !/My Vehicle|Parts Shop/.test(txt), `the farm's shop reads: "${txt.slice(0, 200)}"`)
      check(await js('!document.querySelector("#svc-screen [data-act=jobs]")'), 'a farm with no offer shows a dead Jobs button')
      await shot('farm-shop.png')
      await leave()
    } else console.log('  farm: no farm without an offer — the no-offer half skipped')
    const live = await find(true)
    if (!live) { console.log('  farm: no farm with an offer up — the jobs half skipped'); return }
    await seat(live.x, live.z, live.h); await park(true)
    check(await until(() => vis('svc-screen'), 2000), 'parking at a farm with an offer opened no shop')
    check(await js('!!document.querySelector("#svc-screen [data-act=jobs]") && !document.querySelector("#svc-screen [data-tab=jobs]")'), 'the farm shop has no top Jobs button although an offer is up (or still has a Jobs tab)')   // FEAT-252
    await shot('farm-shop-jobs.png')
    await js('document.querySelector("#svc-screen [data-act=jobs]").click()')
    check(await until(() => vis('mp-accept'), 2000), "the farm's jobs button did not bring up the farm's own offer card")
    await js('document.getElementById("mp-accept").click()')
    check(await until(async () => await vis('mission-hud') && await js('document.querySelector("#mission-hud .hud-text").textContent.trim()'), 5000), 'accepting the farm offer started no mission')
    console.log(`  farm: shop, jobs button, offer card, accepted → mission ${await js('window.__mission().state')}`)
    await js('document.getElementById("job-cancel").click()'); await js('document.getElementById("job-cancel").click()')   // abandon: two clicks (the confirm)
    check(await until(async () => !await js('window.__mission().isOnJob()'), 3000), 'abandoning the farm job did not end it')
    await js('window.__mission().exit()')   // the abandoned job's result card hides every POI prompt: close it for the steps that follow
  }],
  ['vendor', async () => {
    // FEAT-232: the food vendor's shop — the burger on its shelf and the dinner meal's "Eat here" line (paid, 30 min, holds
    // hunger 8 h, never stowed; a discarded cart eats and charges nothing), then a burger (8 h) and gummy worms (2 h) eaten
    // from the inventory. Runs after story: SMOKE_STEPS=boot,story,vendor. Picture: wip/feat-232/vendor-shop.png.
    const park1 = async (type) => {
      const p = await js(`(() => { const q = window.__map2d()._getPois().find(q => q.type === '${type}' && !q.hidden)
        return q ? { h: Math.atan2(-q.tx, -q.tz), ...${PAD_SEAT}(q) } : null })()`)
      if (!p) return false
      await seat(p.x, p.z, p.h); await park(true)
      return await until(() => js('document.getElementById("svc-screen").checkVisibility()'), 2000)
    }
    const leave = async () => { await tap('Escape'); await sleep(300); await tap(' '); await sleep(300) }
    const row = (re) => `Array.from(document.querySelectorAll("#svc-screen [data-act=node][data-slot]")).find(r => /${re}/.test(r.textContent))`
    const day = (e) => js(`window.__day().${e}`)
    const held = async () => (await day('_fedUntilH')) - (await day('clockH()'))
    const n = (id) => js(`window.__inv.list().filter(r => r.id === "${id}").reduce((a, r) => a + r.n, 0)`)
    const money = () => js('window.__econ.money')
    const click = (sel) => js(`document.querySelector('${sel}').click()`)
    if (!await park1('foodVendor')) { console.log('  vendor: no food vendor in this region — step skipped'); return }
    await js('window.__econ.money = 50')
    await click('#svc-screen [data-tab=shop]')
    const txt = await js('document.querySelector("#svc-screen").textContent')
    check(/Burger/.test(txt) && /Dinner meal/.test(txt), 'the food vendor lists no burger and dinner meal')
    await js(`${row('Dinner meal')}.click()`)
    await sleep(300)
    const shot = await client.cmd('Page.captureScreenshot', { format: 'png' })
    mkdirSync('wip/feat-232', { recursive: true }); writeFileSync('wip/feat-232/vendor-shop.png', Buffer.from(shot.result.data, 'base64'))
    const [m0, i0, h0] = [await money(), await js('window.__inv.list().length'), await day('clockH()')]
    const fed0 = await day('_fedUntilH')
    await click('#svc-screen .sv-kids [data-act=eat]')
    check(await money() === m0 && await day('_fedUntilH') === fed0, 'a dinner meal in the cart was paid or eaten before checkout')
    await click('#svc-screen [data-act=discard]')
    check(await money() === m0 && await day('_fedUntilH') === fed0 && await day('clockH()') === h0, 'a discarded dinner meal charged, ate or ran the clock')
    await js('window.__day()._fedUntilH = window.__day().clockH() - 1')
    await js(`${row('Dinner meal')}.click()`); await sleep(200)
    await click('#svc-screen .sv-kids [data-act=eat]')
    await click('#svc-screen [data-act=checkout]')
    await sleep(300)
    const dh = (await day('clockH()')) - h0
    check(Math.abs(m0 - await money() - 5) < 0.005, `the dinner meal took $${(m0 - await money()).toFixed(2)}, not $5`)
    check(Math.abs(dh - 0.5) < 0.02, `the dinner meal ran ${(dh * 60).toFixed(1)} min, not 30`)
    check(Math.abs(await held() - 8) < 0.02, `the dinner meal holds hunger ${(await held()).toFixed(2)} h, not 8`)
    check(await js('window.__inv.list().length') === i0, 'the dinner meal was stowed in the inventory')
    await js('window.__econ.money = 50')
    await click('#svc-screen [data-tab=shop]')
    // After the full run's earlier steps every slot is taken (a bought item would wait on the swap prompt): free the potatoes' slots.
    for (const id of ['potatoCooked', 'potato']) await js(`(() => { const i = window.__inv.list().findIndex(r => r.id === '${id}'); if (i >= 0) window.__inv.drop(i) })()`)
    await js(`${row('Burger')}.click()`); await sleep(200)
    await click('#svc-screen .sv-kids [data-act=stow]')
    await click('#svc-screen [data-act=checkout]')
    check(await n('burger') === 1, `the burger bought at the vendor is not in the inventory (${await js('JSON.stringify([window.__inv.list().map(r => r.id + "x" + r.n), window.__inv.pending])')})`)
    await leave()
    await js('window.__day()._fedUntilH = window.__day().clockH() - 1')
    check(await js('window.__inv.use("burger")') && Math.abs(await held() - 8) < 0.02, `the burger holds ${(await held()).toFixed(2)} h, not 8`)
    if (!await park1('gasStation')) { console.log('  vendor: no gas station storefront — snack half skipped'); return }
    await js('window.__econ.money = 50')
    await click('#svc-screen [data-tab=shop]')
    await js(`${row('Gummy worms')}.click()`); await sleep(200)
    await click('#svc-screen .sv-kids [data-act=stow]')
    await click('#svc-screen [data-act=checkout]')
    check(await n('gummyWorms') === 1, 'the gummy worms bought at the gas station are not in the inventory')
    await leave()
    await js('window.__day()._fedUntilH = window.__day().clockH() - 1')
    check(await js('window.__inv.use("gummyWorms")') && Math.abs(await held() - 2) < 0.02, `the gummy worms hold ${(await held()).toFixed(2)} h, not 2`)
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
  // arriving at the site's end with targets standing settles nothing; FEAT-267: the rank bar shows, the GPS
  // leg turns back to a standing cluster and moves on as each falls, and the last one down settles the
  // line wherever the truck is, lettered on time.
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
    const w0 = await js('window.__econ.money')   // DEC-403: a requisition line's hits pay nothing (FEAT-103)
    // Kick one: the engine wakes it, it moves, the poll latches it smashed.
    await js(`(() => { const t = ${bodies}[0], p = new (window.__vs.position.constructor)(), q = new (window.__vs.quaternion.constructor)()
      window.__physicsEngine.getTransform(t.body, p, q); window.__physicsEngine.applyImpulse(t.body, { x: 200, y: 100, z: 0 }, p) })()`)
    check(await until(() => js('window.__cargo().site.filter(t => t.smashed).length === 1'), 3000), 'a kicked target did not count smashed')
    // FEAT-267 (DEC-399): the job line counts the site like the paper round ("1 / N smashed"); no hit window.
    const hud = 'document.getElementById("mission-hud").textContent'
    check(await until(() => js(`/1 \\/ \\d+ smashed/.test(${hud})`), 2000), `the job line does not count it: "${await js(hud)}"`)
    check(!/within/.test(await js(hud)), `the job line still shows a hit window: "${await js(hud)}"`)
    // Arrive with the rest standing: nothing settles, the rank bar shows (a hurried job), and the GPS leg goes BACK to a
    // cluster still standing — the remaining tour from the truck (paper-route.js planGuideJob, re-planned every tourS).
    const end = await js('(() => { const m = window.__mission().mission, a = m.poly.at(-2), b = m.poly.at(-1); return { x: b.x, z: b.z, h: Math.atan2(-(b.x - a.x), -(b.z - a.z)), fx: b.x - a.x, fz: b.z - a.z } })()')
    await seat(end.x, end.z, end.h)
    const legEnd = '(s => s.guide?.customers?.[0])(window.__site())'
    const behind = `(c => c && (c.x - ${end.x}) * ${end.fx} + (c.z - ${end.z}) * ${end.fz} < 0 && c.members.some(i => !window.__site().targets[i].smashed))(${legEnd})`
    check(await until(() => js(`${behind} && window.__site().gps === window.__site().guide`), 4000),
      `past the end the GPS leg does not turn back to a standing cluster: ${await js(`JSON.stringify(${legEnd} && { x: ${legEnd}.x, z: ${legEnd}.z, members: ${legEnd}.members })`)}`)
    check(await js('window.__site().gps?.noRing === true'), 'the demolition GPS leg carries a destination circle (FEAT-187)')
    check(await js('window.__mission().state') === 'running', `arriving with targets standing settled the line: ${await js('window.__mission().state')}`)
    check(await until(() => js('document.getElementById("rank-timer").checkVisibility()'), 3000), 'no rank bar on the demolition job at its site (DEC-399: hurried)')
    // Fell the leg's cluster: the next plan moves the leg on to another standing one.
    const c0 = await js(`${legEnd}.id`)
    await js(`${legEnd}.members.forEach(i => { window.__site().targets[i].smashed = true })`)
    check(await until(() => js(`(c => c && c.id !== ${JSON.stringify(c0)} && c.members.some(i => !window.__site().targets[i].smashed))(${legEnd})`), 4000)
      || await js('window.__site().targets.every(t => t.smashed)'), 'the GPS leg did not move on when its cluster fell')
    // The letter is TIME (courier's and the paper round's rule), not the share: burn the job's clock to ~0.85 par (a game
    // minute is a second of it; the camp's line has no deadline), then fell the rest — the line settles with every target
    // down, lettered on its par ratio.
    await js('(m => window.__day().advanceMinutes(Math.max(0, Math.ceil(0.85 * m.mission.par - m.elapsed))))(window.__mission())')
    check(await js('window.__mission().state') === 'running', 'the line settled before its last target fell')
    await js('window.__site().targets.forEach(t => { t.smashed = true })')
    check(await until(() => js('window.__mission().state === "done"'), 5000), `felling the last target did not settle the line: ${await js('window.__mission().state')}`)
    const res = await js(`(m => { const r = m.result, th = m.mission.terms?.thresholds ?? { S: 0.652, A: 0.707, B: 0.794, C: 1 }
      return { letter: r.letter, want: 'SABC'.split('').find(l => r.ratio <= th[l]) ?? 'D', ratio: r.ratio } })(window.__mission())`)
    check(res.letter === res.want && res.letter !== 'S', `the line is not lettered on time: ${JSON.stringify(res)}`)
    check(await js('(n => new RegExp(`Smashed\\\\s*${n} \\\\/ ${n}`).test(document.getElementById("mp-body")?.textContent ?? ""))(window.__mission().mission.targets.length)'),
      `the result card does not count every target smashed: "${await js('document.getElementById("mp-body")?.textContent')}"`)
    check(await js('window.__econ.money') === w0, `the requisition line paid for its targets: $${w0} → $${await js('window.__econ.money')}`)
    await js('document.getElementById("mp-accept").click()')
    await tap(' ')   // brake off: the next step parks fresh
    await sleep(300)
    // DEC-403: a BOARD demolition job (a farm's or a work site's, wherever one is live, the way the save step takes its
    // freight) pays its base a share per target the moment each falls, quoted like a paper's money; past the deadline
    // with targets standing it ends on what the hits paid, no tip.
    const dj = await js(`(() => { const b = window.__cargo().board, now = window.__day().clockH()
      for (const q of window.__map2d()._getPois()) {
        if (!q.jobs || q.hidden || q.drop || q.park || q.type === 'expeditionCamp') continue
        const o = b.offers(q.id, now).find(o => b.spec(o)?.family === 'demolition' && !b.spec(o).line)
        if (o) return { h: Math.atan2(-q.tx, -q.tz), id: o.id, type: q.type, ...${PAD_SEAT}(q) }
      }
      return null })()`)
    let took = false
    if (dj) {
      await seat(dj.x, dj.z, dj.h)
      await park(true)
      if (SHOP_TYPES.has(dj.type) && await until(() => vis('svc-screen'), 2000)) await js('document.querySelector("#svc-screen [data-act=jobs]")?.click()')
      if (await until(() => vis('mp-accept'), 2000)) {
        for (let i = 0; i < 8 && await js(`window.__mission().offer?.id !== ${JSON.stringify(dj.id)}`); i++) await js('document.getElementById("mp-next")?.click()')
        if (await js(`window.__mission().offer?.id === ${JSON.stringify(dj.id)} && !document.getElementById("mp-accept").disabled`)) {
          await js('document.getElementById("mp-accept").click()')
          took = !!await until(() => js('window.__site()?.mission === window.__mission().mission'), 5000)
        }
      }
    }
    if (!took) console.log('  demolition: no takeable board demolition offer in this region — the per-target pay is proven on the sheet run only')
    else {
      const n = await js('window.__mission().mission.targets.length'), w1 = await js('window.__econ.money')
      await js('window.__site().targets[0].smashed = true')
      check(await until(() => js(`window.__econ.money > ${w1}`), 2000), 'DEC-403: a board demolition target fell and paid nothing')
      const share = Math.round((await js('window.__econ.money') - w1) * 100) / 100
      const ro = 'document.getElementById("throw-readout")'
      check(await until(() => js(`/smashed .*\\+\\$/.test(${ro}.textContent) && ${ro}.checkVisibility()`), 1000),
        `DEC-403: the hit's pay is not quoted: "${await js(`${ro}.textContent`)}"`)
      await js('window.__site().targets[1].smashed = true')
      check(await until(() => js(`window.__econ.money > ${w1 + share}`), 2000), 'DEC-403: the second target paid nothing')
      const w2 = await js('window.__econ.money')
      // The deadline passes with the rest standing: the job is over, the two shares stay, no tip.
      // (Pulled to now, not slept to: the deadline is hours of game clock, and a skip that long crashes the driver.)
      await js('window.__mission().mission.dueH = window.__day().clockH()')
      check(await until(() => js('window.__mission().mission.expired'), 2000), 'the board demolition job did not expire at its deadline')
      await js('window.__site() && window.__site().targets[2] && (window.__site().targets[2].smashed = true)')
      await sleep(400)
      check(await js('window.__econ.money') === w2, 'DEC-403: a target felled past the deadline paid')
      await park(true)
      await js('document.getElementById("job-cancel").click()')
      check(await until(() => js('window.__mission().result?.expired'), 2000), 'signing off the expired demolition job did not end it')
      const txt = await js('document.getElementById("mp-body").textContent')
      check(/no tip/.test(txt) && new RegExp(`Smashed\\s*2 / ${n}`).test(txt) && txt.includes('$' + (w2 - w1).toFixed(2)) && await js('window.__econ.money') === w2,
        `DEC-403: the expired card does not keep the two shares: "${txt}" (wallet $${w1} → $${await js('window.__econ.money')})`)
      console.log(`  demolition: board job ${dj.id} (${dj.type}), ${n} targets, $${share} a share, expired on 2 down: "${txt}"`)
      await js('document.getElementById("mp-accept").click()')
      await tap(' ')
      await sleep(300)
    }
  }],
  // FEAT-154: a road out of the area. Full throttle at its barricade row: the loose barricades get
  // smashed aside, past the fade line the screen goes black, and the truck comes back on a road inside
  // the return radius facing in, with every barricade back where it stood.
  ['edge', async () => {
    const P = await js('(() => { const p = window.__poi(), b = p.barricades()[4], c = p._built; return { b, c } })()')
    // Steps share one session and build on each other (INFRA-15): the rows exist only in the run the "story" step starts.
    check(P.b, 'no barricade row: the edge step needs the run the "story" step starts — SMOKE_STEPS=boot,story,edge')
    const f = { x: -Math.sin(P.b.yaw), z: -Math.cos(P.b.yaw) }   // the striped face: back into the area
    // A row far off is plain models; near the truck its three barricades are loose bodies (main.js).
    const row = `window.__debris._live.filter(r => r.kind === "roadBarrier" && Math.hypot(r.mesh.position.x - ${P.b.x}, r.mesh.position.z - ${P.b.z}) < 8)`
    check(await js(`${row}.length`) === 0, 'a row 2 km from the truck already has bodies (they would fall through the world)')
    await seat(P.b.x + f.x * 150, P.b.z + f.z * 150, Math.atan2(f.x, f.z))   // first OUTSIDE the bodies' 120 m, to let the ground stream (INFRA-15)
    await simFor(5)
    await seat(P.b.x + f.x * 30, P.b.z + f.z * 30, Math.atan2(f.x, f.z))   // 30 m inside, nose at the row
    check(await until(() => js(`(window.__edgeRow = ${row}).length === 3`), 2000), `the row near the truck has ${await js(`${row}.length`)} bodies, want 3`)
    await simFor(1)   // settled on the deck
    const pos = 'window.__edgeRow.map(r => r.mesh.position.toArray())'
    const before = await js(pos)
    await crank()
    if (await js('window.__vs.parked')) await tap(' ')
    const black = 'document.getElementById("camp-fade").classList.contains("on")'
    // Moved is latched in-page, every rendered frame: the fade stands the row again EDGE_FADE_S (wall) after it goes
    // black, and under load the poll below saw black only after that, reading a row already back (INFRA-15).
    await js(`window.__edgeMoved = false; { const rows = window.__edgeRow, b0 = ${JSON.stringify(before)}
      const f = () => { if (rows.some((r, i) => Math.hypot(r.mesh.position.x - b0[i][0], r.mesh.position.z - b0[i][2]) > 0.5)) window.__edgeMoved = true
        else if (rows.every(r => window.__debris._live.includes(r))) requestAnimationFrame(f) }
      requestAnimationFrame(f) }`)
    await key('w', true)
    const went = await untilSim(() => js(black), 20)
    const smashed = went && await js('window.__edgeMoved')
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
    const after = await js(`${row}.map(r => r.mesh.position.toArray())`)
    const off = after.length === 3 ? Math.max(...after.map((p, i) => Math.hypot(p[0] - before[i][0], p[1] - before[i][1], p[2] - before[i][2]))) : Infinity
    // 15 cm, not 5: a 1 cm drop onto the sloped deck rocks to rest a few cm from where it landed, and under load that
    // landing is not repeatable — Box3D orders contacts by body creation, and streaming creates terrain/prop bodies in
    // another order (measured 11-06 at 6×: the first row's rest scatters 1–2 cm run to run, the reset row lands 1–6 cm
    // from it, both at rest 3 sim-s later; idle, 0.0 cm). Not reset at all is metres: a knock is > 0.5 m above.
    check(off < 0.15, `the barricades are not back: ${after.length}/3, worst ${off.toFixed(2)} m off · Δxyz ${JSON.stringify(after.map((p, i) => p.map((v, k) => +(v - before[i][k]).toFixed(2))))}`)
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
      await js('document.querySelector("#svc-screen [data-act=jobs]")?.click()')
    }
    check(await until(() => vis('mp-accept'), 2000), `parking at the ${p.type} pad opened no offer`)
    // BUG-187: the player's own map (M) shuts the parked card; the card comes back on the next brake pull.
    await js('window.__map2d().hide()')   // the offer opened the map as its backdrop; M below is then an OPEN
    await tap('m')
    check(await until(async () => !await vis('mp-accept') && await js('window.__map2d().isOpen()'), 2000), 'M at the POI left the offer card up over the map')
    if (process.env.SMOKE_SHOT) writeFileSync(process.env.SMOKE_SHOT, Buffer.from((await client.cmd('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))
    await tap('m')
    await tap(' '); await sleep(1500); await park()   // the 10 Hz poll sees the unparked frame, then the new pull
    if (SHOP_TYPES.has(p.type)) {
      check(await until(() => vis('svc-screen'), 3000), `parking again at the ${p.type} opened no shop screen`)
      await js('document.querySelector("#svc-screen [data-act=jobs]")?.click()')
    }
    check(await until(() => vis('mp-accept'), 2000), `the offer card did not come back on the next brake pull after the map (mission ${await js('window.__mission().state')}, parked ${await js('window.__vs.parked')}, map ${await js('window.__map2d().isOpen()')})`)
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
    const roster = () => js('({ tut: window.__tutorial().phase, ids: window.__poi().list().map(q => q.id) })')
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
    // dropped the board's events (it once brought mom's retired casserole back 'live' over the skip's 'done'). One resume
    // cannot catch a 1-in-10 race; this pins the contract, and the run-soak's resume check is the statistical net.
    const roster1 = await roster()
    const lost = roster0.ids.filter(id => !roster1.ids.includes(id)).length
    check(!lost && roster1.ids.length === roster0.ids.length,
      `the POI roster changed across the resume: ${lost} of ${roster0.ids.length} ids gone (${roster0.ids.length} → ${roster1.ids.length})`)
    check(roster1.tut === roster0.tut, `the tutorial went '${roster0.tut}' → '${roster1.tut}' across the resume`)
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
      if (SHOP_TYPES.has(fr.type) && await until(() => vis('svc-screen'), 2000)) await js('document.querySelector("#svc-screen [data-act=jobs]")?.click()')
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
      // FEAT-156 (once): the root is continue (only with a save) · new game · settings (FEAT-184, DEC-160: no tutorial), and the
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
      await skipAndReadLarry()   // FEAT-184: played before (the story step's skip), so one hold
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
    // FEAT-217 (wggu): the run's state does not outlive it. Free cam left up 300 m away; giving up, then a new run, starts in chase.
    await js('(() => { const v = window.__vs.position; window.__view(v.x + 300, v.y + 20, v.z, 0, 0) })()')
    await js('document.getElementById("pm-towel").click(); document.getElementById("tc-end").click()')
    await ended(/gave up/)
    // BUG-109: the right stick orbits the menu truck (and the next return to the menu re-centres it: ended()).
    await js('__fp.axes[2] = 1'); await frames(10, 300); await js('__fp.axes[2] = 0')
    check(await js('Math.abs(window.__stage._dragYaw) > 0.1'), `the right stick did not orbit the menu truck: yaw ${await js('window.__stage._dragYaw')}`)
    await padOff()
    // The crash: black and white at once, the card after the beat. First, the playtime counts (the save
    // carries it, a second at a time) and stops while paused.
    await newRun()
    check(await js('(() => { const v = window.__vs.position, c = window.__cam().position; return Math.hypot(c.x - v.x, c.z - v.z) < 30 })()'), 'FEAT-217: a new run after a give-up started in the last run\'s free cam')
    check(await js('!document.getElementById("pump-display").classList.contains("on")'), 'FEAT-217: a pump UI outlived the run')
    const p0 = await playedS(); await sleep(3000); const p1 = await playedS()
    check(p1 - p0 > 1.5 && p1 - p0 < 4.5, `playtime counted ${(p1 - p0).toFixed(1)} s of a 3 s drive`)
    await tap('Escape'); await sleep(1300)   // a whole save tick inside the pause before the first read
    const q0 = await playedS(); await sleep(2500); const q1 = await playedS()
    check(q1 - q0 < 0.2, `playtime counted ${(q1 - q0).toFixed(1)} s behind the pause menu`)
    await tap('Escape'); await sleep(300)
    await js('window.__damage.fatalImpact = { region: "front", v: 40, mph: 90, armor: 0.3 }')
    check(await until(() => js('/grayscale/.test(document.querySelector("canvas").style.filter)'), 1000), 'a fatal hit did not turn the world black and white')
    check(!await card(), 'the crash card skipped the beat')
    await ended(/died/, /hit at 90 mph — front · at 30 % armor the front could take 48 mph; fresh it takes 65/)
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
    // FEAT-184: the skipped run starts in free will with Larry read off (skipAndReadLarry), so no job is active.
    await js(`window.__econ.halfPoints = ${2 * ECONOMY_PARAMS.campDeeds}`)
    check(await until(() => js('/requisition 0 \\/ 5/.test(document.getElementById("run-hud").textContent)'), 2000), `${ECONOMY_PARAMS.campDeeds} deeds opened no requisition`)
    await js(`(() => { const b = window.__board(), h = window.__day().clockH()
      const camp = window.__map2d()._getPois().find(q => q.type === 'expeditionCamp')
      for (const o of b.offers(camp.id, h)) { b.take(o.id, h, 300); b.complete(o.id, h) } })()`)
    await ended(/beat the alpha/)
  }],
  ['opening', async () => {
    // FEAT-147: a new run starts PARKED AT THE BURGER JOINT, the firing's cards over a slow orbit of it with the sim held.
    // FEAT-184 (DEC-147): the intro ends on a card, play the tutorial or skip it. A later run (this browser played before,
    // the story step's skip) on seed 6: "play" loads the tutorial seed (DEC-157), the firing day's stops in DEC-304's order
    // (mom's, Larry's, the station, a camping area, the trouble on the way home, her bed), the morning back to the joint
    // for the last paycheck (DEC-153), and the run's own seed 6 loaded back outside its joint (DEC-158).
    await js('document.getElementById("mm-new").click()')
    await js('document.getElementById("su-seed").value = "6"; document.getElementById("su-start").click()')
    const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
    check(await until(() => js(live), 45000, 250), 'the opening run never went live (45 s × load)')
    const world = () => js('window.__worldCode().split("/")[0]')
    check(await world() === '6', `the run is not on seed 6: world ${await world()}`)
    const tut = () => js('window.__tutorial()')
    const speaker = () => js('getComputedStyle(document.getElementById("dialogue-panel")).display !== "none" && document.getElementById("dlg-speaker").textContent')
    // FEAT-170 stage 4: mom's lessons queue up and hold the sim (and every key) while they are up — read off
    // whatever comes (a card that waits for an action, DEC-359, is left up for the caller to do), waiting a beat for a queued one to appear. Returns the speakers' card count.
    const said = []   // every card readCards read, as "speaker: text" (DEC-345: the calls are checked by their words)
    const saidAny = re => said.some(t => re.test(t))
    const readCards = async (beatMs = 800, stopAt = null) => {   // stopAt: leave that speaker's card up, unread
      let n = 0
      for (let i = 0; i < 40; i++) {
        if (!await speaker()) { await sleep(beatMs); if (!await speaker()) return n }
        if (stopAt && await speaker() === stopAt) return n
        if (await js('window.__tutorial().until')) { await sleep(1500)   // typed out, then recorded once
          const w = `${await speaker()}: ${await js('document.getElementById("dlg-text")?.textContent ?? ""')}`; if (w !== said[said.length - 1]) said.push(w)
          return n }   // DEC-359: a card that waits for an action stays up (the game runs under it); the caller does the action, which clears it
        // A press on a card still streaming in only fills it (main.js `_dlgFill`), so the same card can be read twice:
        // it counts, and is recorded, once.
        const line = `${await speaker()}: ${await js('document.getElementById("dlg-text")?.textContent ?? ""')}`
        if (line === said[said.length - 1]) { await tap('Enter'); await sleep(200); continue }
        said.push(line)
        // CARD_SHOTS=<dir>: a screenshot of every card read, for a look at new lines' layout (UI-STYLE)
        if (process.env.CARD_SHOTS) { mkdirSync(process.env.CARD_SHOTS, { recursive: true })
          for (let t = null, k = 0; k < 20; k++) { const u = await js('document.getElementById("dlg-text")?.innerHTML'); if (u === t) break; t = u; await sleep(400) }   // typed out
          writeFileSync(join(process.env.CARD_SHOTS, `${String(said.length).padStart(2, '0')}.png`), Buffer.from((await client.cmd('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))
          writeFileSync(join(process.env.CARD_SHOTS, 'said.json'), JSON.stringify(said, null, 1)) }
        n++; await tap('Enter'); await sleep(200)
      }
      throw new Error('cards never stopped coming')
    }
    // DEC-320: the firing opens on Katie's call, wrapping up as Billy arrives; then the manager.
    check(await until(async () => await speaker() === 'Katie', 3000), `the run did not open on the firing's call (speaker "${await speaker()}")`)
    const at = () => js(`(() => { const q = window.__poi().list().find(q => q.type === 'foodVendor'), v = window.__vs.position, c = window.__cam().position
      return { truck: Math.hypot(v.x - q.x, v.z - q.z), cam: Math.hypot(c.x - v.x, c.z - v.z), h: window.__day().clockH() } })()`)
    const a = await at(); await sleep(1000); const b = await at()
    check(a.truck < 8, `the truck is ${a.truck.toFixed(1)} m from the burger joint's pad, want < 8`)
    check(b.cam > 9, `the camera is ${b.cam.toFixed(1)} m from the truck — not on the joint's orbit`)
    check(b.h === a.h, `the day clock ran under the firing (${a.h} → ${b.h})`)
    // DEC-299: about 07:00; FEAT-184 (DEC-159): day −1, so a played tutorial enters free will on day 0
    check(Math.abs(a.h + 17) < 0.1, `the firing is not at 07:00 on day 0 (clockH ${a.h})`)
    // BUG-136: the days before the clock's zero; the HUD read day 0 as "Day 0, -6 am".
    const hudClock = () => js('document.querySelector("#run-hud .rh-clock")?.textContent')
    check(await until(async () => await hudClock() === 'Day 0, 7 am', 3000), `the HUD clock at the firing reads "${await hudClock()}", want "Day 0, 7 am" (BUG-136)`)
    let boss = false, hung = false
    for (let i = 0; i < 8 && ['Katie', 'The manager'].includes(await speaker()); i++) {
      boss ||= await speaker() === 'The manager'; hung ||= !boss && await js('document.getElementById("dlg-text").textContent') === '<click>'
      await tap('Enter'); await sleep(250) }
    check(boss, 'the firing had no card from the manager')
    check(hung, "the firing's call did not hang up (<click>) before the manager (DEC-354)")
    // The card: up, the sim held under it; "play" on seed 6 loads the tutorial seed with seed 6 to come back to.
    check(await until(() => js('document.getElementById("tut-card").style.display === "flex"'), 3000), `the firing did not end on the tutorial card: ${JSON.stringify(await tut())}`)
    check((await tut()).phase === 'card', `the card is up but the tutorial reads ${JSON.stringify(await tut())}`)
    { const h0 = await js('window.__day().clockH()'), c0 = await car(); await sleep(800)
      const c1 = await car(); check(await js('window.__day().clockH()') === h0 && Math.hypot(c1.x - c0.x, c1.z - c0.z) < 0.01, 'the sim ran under the tutorial card') }
    await js('document.getElementById("tc-play").click()')
    check(await until(async () => await js(live) && await world() === TUTORIAL.seed, 60000, 250), `"play" did not load the tutorial seed (world ${await world()}, ${JSON.stringify(await tut())})`)
    check((await tut()).returnSeed === '6', `the tutorial's world does not carry seed 6 back: ${JSON.stringify(await tut())}`)
    check(Math.abs(await js('window.__day().clockH()') + 17) < 0.1, `the tutorial's day is not 07:00 on day 0 (clockH ${await js('window.__day().clockH()')})`)
    // DEC-160: the tutorial saves as part of the run, the way back in it.
    check(await until(() => js('window.__autosave()'), 3000) && await js('JSON.parse(localStorage.getItem("autos-run/1")).data.returnSeed') === '6',
      'the tutorial did not save with its way back to seed 6')
    check(await until(async () => await speaker() === 'Phone', 5000), `the tutorial seed did not open on mom's call ringing (speaker "${await speaker()}")`)
    await readCards()   // her call, up to the key card (DEC-359: it waits for the key, the game runs under it)
    check(await js('window.__tutorial().until') === 'engine', `mom's call did not stop at the key card: ${JSON.stringify(await js('window.__tutorial()'))}`)
    await crank(); await readCards()   // the key catches: her <click>, then the driving lesson
    // DEC-354: a call rings first and hangs up last — the key card (FEAT-184) inside it.
    { const r = said.findIndex(t => /^Phone: Ring ring ring/.test(t)), k = said.findIndex(t => /^Mom: And honey .* the truck won't start itself/.test(t))
      check(r === 0 && k > r && said[k + 1] === 'Mom: <click>', `mom's call is not ring, her cards, the key, <click>: ${JSON.stringify(said.slice(0, 7))}`) }
    // (the call closes on <click>; the pedals' card follows at once, so no 'speaker is gone' check here)
    check(await until(async () => (await at()).cam < 9, 3000), 'the camera never came back to the truck')
    // FEAT-229: the FIRING DAY — no job (free will is after the paycheck), the HUD and the GPS to mom's first.
    const eve = () => js(`(() => ({ s: window.__mission().state, tut: window.__tutorial().phase, gps: !!window.__gps(),
      hud: getComputedStyle(document.getElementById('mission-hud')).display !== 'none' && document.getElementById('mission-hud').textContent.trim() }))()`)
    const e0 = await eve()
    check(e0.s === 'idle' && e0.tut === 'day', `the firing day is not job-free: ${JSON.stringify(e0)}`)
    // FEAT-184 stage 3 (DEC-306): the tank starts near empty, for the station's pump later; the line goes to mom's.
    check(/to Mom's · park at her door/.test(e0.hud) && await js('window.__vs.fuel.gal < 0.2 * 16.5') && await js('window.__econ.money') === 0,
      `the day does not open on mom's line, a near-empty tank and an empty wallet ("${e0.hud}", ${await js('window.__vs.fuel.gal.toFixed(2)')} gal, $${await js('window.__econ.money')})`)
    check(await until(async () => (await eve()).gps, 5000), "the GPS has no way to mom's")
    // BUG-135: the played run's start, the joint's lay-by, drives off too.
    await readCards()   // FEAT-184 stage 3: the pedals' card (and the gauge's)
    if (await js('window.__vs.parked')) await tap(' ')
    { const c0 = await car(); await hold('w', 5); const c1 = await car(), d = Math.hypot(c1.x - c0.x, c1.z - c0.z)
      check(d > 10, `the truck did not drive off from the burger joint: ${d.toFixed(1)} m in 5 s of throttle`) }
    const evePeek = () => js('JSON.stringify({ tut: window.__tutorial().phase, h: window.__day().clockH(), dlg: getComputedStyle(document.getElementById("dialogue-panel")).display })')
    const evening = () => js('window.__tutorial().phase === "day"')
    check(await evening(), `the evening ended before the map taps: ${await evePeek()}`)
    // Stage 2: M is the skip's hold now, but a TAP still opens the map (on the release) and closes it.
    // M is heard on its key events, not polled per step, so tap it as a player does (~100 ms of wall time): tap()'s two
    // RENDERED frames ran past the 1 s hold behind the map's first build, and the second tap armed the skip instead.
    const tapM = async () => { await key('m', true); await sleep(100); await key('m', false) }
    await tapM()
    check(await until(() => js('window.__map2d().isOpen()'), 2000), `a tap of M in the evening did not open the map: ${await evePeek()}`)
    check(await evening(), `the first tap of M skipped the evening: ${await evePeek()}`)
    await tapM()
    check(await until(() => js('!window.__map2d().isOpen()'), 2000), `a tap of M in the evening did not close the map: ${await evePeek()}`)
    check(await evening(), `a tap of M skipped the evening: ${await js('JSON.stringify({ tut: window.__tutorial().phase, wd: window.__worstDay(), h: window.__day().clockH(), dlg: document.getElementById("dlg-text")?.textContent.slice(0, 60), map: window.__map2d().isOpen() })')}`)
    // Stage 3, the safe drive: the clock holds on the way home, and off the road R puts the truck back on it.
    const h0 = await js('window.__day().clockH()'); await simFor(2)
    check(await js('window.__worstDay().held'), 'the tutorial does not hold the truck: a crash would cost damage (FEAT-184, DEC-151)')
    check(await js('window.__day().clockH()') === h0, `the clock ran on the evening's drive (${h0} → ${await js('window.__day().clockH()')})`)
    const lat = (x, z) => `(() => { const q = window.__roadSys().queryNearest(${x}, ${z}, 200); return q?.point ? Math.hypot(q.point.x - ${x}, q.point.z - ${z}) : 999 })()`
    const off = await js(`(() => { const v = window.__vs.position, nr = window.__roadSys().queryNearest(v.x, v.z, 500)
      const t = nr.tangent, l = Math.hypot(t.x, t.z), nx = t.z / l, nz = -t.x / l
      for (const along of [0, 100, -100, 160, -160]) for (const d of [25, -25, 35, -35, 45, -45]) { const x = nr.point.x + nx * d + t.x / l * along, z = nr.point.z + nz * d + t.z / l * along
        // FEAT-217: past the 20 m no-reset radius of every place (TUT_PARAMS.safeNearPoiM, DEC-281), and 15+ m from the road (10 m past its side)
        if (window.__poi().list().some(p => Math.hypot(p.x - x, p.z - z) < 90)) continue
        const q = window.__roadSys().queryNearest(x, z, 100); if (!q?.point || Math.hypot(q.point.x - x, q.point.z - z) > 15) return { x, z } }
      return null })()`)
    check(off, 'no off-road spot beside the joint')
    await seat(off.x, off.z, 0)
    // DEC-321: no reset is taught — off the road the HUD names no key; R still works, untaught.
    await simFor(0.5)
    check(!/puts you back/.test((await eve()).hud), `off the road, the tutorial's HUD still teaches a reset ("${(await eve()).hud}")`)
    await readCards(300)   // a lesson landing here would take the R
    await tap('r')
    check(await until(async () => { const v = await car(); return await js(lat(v.x, v.z)) < 5 }, 8000), 'R in the evening did not put the truck back on the road')
    check(await until(async () => !/off the road/.test((await eve()).hud), 2000), 'the HUD still says off the road on the road')
    // FEAT-184 (DEC-151): off the road with the brake off, the evening puts the truck back on it by itself.
    await seat(off.x, off.z, 0); await readCards(300)
    if (await js('window.__vs.parked')) await tap(' ')
    check(await until(() => js('document.getElementById("reset-countdown").style.opacity === "1" && /back on it in \\d/.test(document.getElementById("reset-countdown").textContent)'), 3000), 'FEAT-217: off the road, no reset countdown showed')
    // The reset counts 4 s of PLAY time (_playedS: real frame seconds while live, each frame clamped to 0.25 s), not wall
    // time, so a loaded box under 4 fps accrues it slower than the clock: poll long (a pass costs nothing extra).
    check(await until(async () => { const v = await car(); return await js(lat(v.x, v.z)) < 5 }, 45000), 'off the road with the brake off, the evening did not put the truck back on it')
    await strayCheck('in the evening')
    // FEAT-217 (of3s, DEC-219): the shoulder (≤ 10 m past the road's side) is safe to sit on with the brake off — no countdown, no reset.
    // BUG-173 (DEC-230): the spot is the flattest point within 300 m that is on the shoulder (11–14 m from the centreline:
    // all four wheels past the road mesh and its 2.5 m shoulder, inside DEC-219's 15 m), graded under 1.5 % (under the
    // rolling resistance, so a truck with the brake off stays put), clear of hard props within 6 m, and 90 m from every
    // place. The old pick (the first ±9 m point beside the joint) sat on a 13–35 % cross-slope 2.3 m from a trunk: the
    // truck perched or rolled, by frame timing. The old tutorial seed 822480141 had no such point within 250 m along the joint's road.
    // The check below is unchanged. FEAT-229 (DEC-402): on 1872706826 the only such spot within 400 m is one ~10 m patch
    // 264 m north of the joint, so the search centres on the joint (not wherever R left the truck) on a 2 m grid (the 4 m
    // one stepped over the 3 m band; ~1 s).
    const sh = await js(`(() => { const v = window.__poi().list().find(p => p.type === 'foodVendor'), H = window.terrain; let best = null
      for (let dx = -300; dx <= 300; dx += 2) for (let dz = -300; dz <= 300; dz += 2) { const x = v.x + dx, z = v.z + dz
        const g = Math.hypot(H(x + 1, z) - H(x - 1, z), H(x, z + 1) - H(x, z - 1)) / 2
        if (g >= 0.015 || g < 1e-9 || (best && g >= best.g)) continue   // g === 0: height not streamed in yet (3590618618 read a flat 0 at a 35 % slope), not a flat spot
        const q = window.__roadSys().queryNearest(x, z, 100), lt = q?.point ? Math.hypot(q.point.x - x, q.point.z - z) : 0
        if (lt < 11 || lt > 14 || window.__poi().list().some(p => Math.hypot(p.x - x, p.z - z) < 90)) continue
        if (!window.__props()?.queryProps(x, H(x, z) + 1, z, 6).length) best = { x, z, g } }
      return best })()`)
    check(sh, 'FEAT-217: no shoulder spot found')
    await seat(sh.x, sh.z, 0); await readCards(300)
    if (await js('window.__vs.parked')) await tap(' ')
    await sleep(9000)   // > the 4 s of play it takes off the road
    { const v = await car(), d = await js(lat(v.x, v.z)), cd = await js('document.getElementById("reset-countdown").style.opacity')
      check(d > 5.5 && cd !== "1", `FEAT-217: the truck was reset (or counted down) on the shoulder: ${d.toFixed(1)} m off the road, ${Math.hypot(v.x - sh.x, v.z - sh.z).toFixed(1)} m from its seat, countdown "${cd}", parked ${await js('window.__vs.parked')}`) }
    // FEAT-229 (DEC-304), THE FIRING DAY's stops in turn: mom's door (her hand-over, DEC-305), the pack, Larry's, the
    // station nearest his (the peanuts from a shopping spot, the pumps shut till then, DEC-323; then the pump, DEC-306), a
    // camp made in the camping area (DEC-304/308), Katie's call at 17:00 (DEC-324), then the worst day on the way home — the flat halfway, V, the spare that's flat too, the recovery
    // menu's free tow to the auto shop, a tire there, the night's headlights — and her bed. Each stop stamps the clock.
    const wd = () => js('window.__worstDay()')
    const tp = async (x, z, h) => {   // not seat(): its settle waits on the sim, and a lesson landing holds it
      await js(`window.__seated = false; window.__teleport(${x}, ${z}, ${h}).then(() => { window.__seated = true })`)
      check(await until(() => js('window.__seated'), 30000, 250), `the teleport to (${x.toFixed(0)}, ${z.toFixed(0)}) never seated`)
      await readCards(); await simFor(1)
    }
    const clock = () => js('window.__day().clockH()')
    const stamped = async (h, what) => check(await until(async () => Math.abs(await clock() - (h - 24)) < 0.6, 2000), `${what}: the clock is not stamped ${h}:00 on day 0 (clockH ${await clock()})`)
    console.log(`  firing day: ${JSON.stringify(await wd())}`)
    // Mom's door: parked there, her hand-over (the owner's line) and her money — the peanuts' $3 and the unspoken $3 of gas.
    const mom = await js(`(() => { const q = window.__map2d()._getPois().find(q => q.type === 'momsHouse')
      return { h: Math.atan2(-q.tx, -q.tz), ...${PAD_SEAT}(q) } })()`)
    await js(`window.__seated = false; window.__teleport(${mom.x}, ${mom.z}, ${mom.h}).then(() => { window.__seated = true })`)
    check(await until(() => js('window.__seated'), 30000, 250), "the teleport to mom's never seated")
    // The parking lesson lands near hers; read up to her hand-over, parking when no card is up.
    const handover = () => js('/Take this pack over to your uncle/.test(document.getElementById("dlg-text")?.textContent ?? "")')
    let heard = false
    for (let i = 0; i < 40 && (await speaker() || (await tut()).stop === 'mom'); i++) {
      if (await speaker()) { heard ||= await handover(); await tap('Enter'); await sleep(200) }
      else { await sleep(800); if (!await speaker() && (await tut()).stop === 'mom') { await park(true); await sleep(800) } }
    }
    await readCards()   // the stop can flip to 'pack' a beat before her card shows: then it is read here
    check((heard || saidAny(/^Mom: Take this pack over to your uncle/)) && (await tut()).stop === 'pack', `parked at mom's door, no hand-over in the owner's words: ${JSON.stringify(await tut())}`)
    check(await js('window.__econ.money') === 6, `mom's hand-over did not put $6 in the wallet: $${await js('window.__econ.money')}`)
    check(!await js('getComputedStyle(document.getElementById("camp-panel")).display !== "none"'), "her door offered her bed in the morning (DEC-308)")
    await stamped(8, "mom's hand-over")
    // DEC-305 (DEC-238's errand): the pack lands by her steps; parked beside it, G loads it; parked at Larry's, he gives it you.
    check(await until(async () => !!(await tut()).pack, 3000), `mom's toss put no pack on the ground: ${JSON.stringify(await tut())}`)
    await readCards()   // the pick-up lesson
    const pk = (await tut()).pack, mq = await js(`(() => { const q = window.__poi().list().find(q => q.type === 'momsHouse'); return { x: q.roadX, z: q.roadZ } })()`)
    const toRoad = Math.atan2(mq.x - pk.x, mq.z - pk.z)   // the truck 3 m out from the pack, nose to the road
    await js(`window.__seated = false; window.__teleport(${pk.x + 3 * Math.sin(toRoad)}, ${pk.z + 3 * Math.cos(toRoad)}, ${toRoad + Math.PI}).then(() => { window.__seated = true })`)
    check(await until(() => js('window.__seated'), 30000, 250), 'the teleport to the pack never seated')
    await simFor(2); await park(true); await tap('g')
    check(await until(async () => (await tut()).stop === 'larry', 3000), `G beside the pack did not load it: ${JSON.stringify(await tut())}`)
    check(await until(async () => (await eve()).gps, 3000), `the pack loaded, no GPS to Larry's: ${JSON.stringify(await eve())}`)
    const lq = await js(`(() => { const q = window.__poi().list().find(q => q.type === 'larrysHouse'); return { h: Math.atan2(-q.tx, -q.tz), ...${PAD_SEAT}(q) } })()`)
    await js(`window.__seated = false; window.__teleport(${lq.x}, ${lq.z}, ${lq.h}).then(() => { window.__seated = true })`)
    check(await until(() => js('window.__seated'), 30000, 250), "the teleport to Larry's never seated")
    // The truck seats latched, which counts as parked: his hand-over may open a beat after the seat (as the joint's paycheck).
    await readCards(800, 'Uncle Larry')
    if (await speaker() !== 'Uncle Larry') { await simFor(1); await park(true) }
    check(await until(async () => await speaker() === 'Uncle Larry', 5000), `parked at Larry's with his pack, no hand-over (speaker "${await speaker()}", ${JSON.stringify(await tut())})`)
    await readCards()
    check((await tut()).stop === 'snack' && await js("window.__inv.list().some(r => r.id === 'pack')"), `Larry's hand-over did not leave the pack on board and send the day for the snack: ${JSON.stringify(await tut())}`)
    // DEC-345: his cards over, Katie calls — the picnic at the old McGill ranch, a snack from the station on the way.
    check(saidAny(/^Katie: .*picnic out at the old McGill ranch/) && saidAny(/^Katie: You know where to go, I'll see you there!/),
      `at Larry's, no picnic call from Katie in the owner's words: ${JSON.stringify(said.slice(-4))}`)
    // DEC-355: her call opens on the owner's line and names the peanuts; DEC-354: it rings and hangs up.
    { const h = said.findIndex(t => t === 'Katie: Hey Billy! How you doing? Sorry about yesterday…'), e = said.findIndex(t => /^Katie: You know where to go/.test(t))
      check(h > 0 && said[h - 1] === 'Phone: Ring ring ring' && said[e + 1] === 'Katie: <click>' && saidAny(/^Katie: .*bag of peanuts/),
        `Katie's picnic call is not ring, "Hey Billy!…", the peanuts, <click>: ${JSON.stringify(said.slice(-7))}`) }
    await stamped(9, "Larry's")
    // The station nearest Larry's: a bag of peanuts at its store, then (mom's card) its pump, filled until broke.
    const gs = await js(`(() => { const L = window.__poi().list().find(q => q.type === 'larrysHouse'), d = q => Math.hypot(q.x - L.x, q.z - L.z)
      const q = window.__poi().list().filter(q => q.type === 'gasStation').sort((a, b) => d(a) - d(b))[0]
      const s = window.__towSeat({ ...q, pumpZones: null })   // its storefront bays, not the pump a tow would seat at
      return { x: s.x, z: s.z, h: s.heading } })()`)
    await js(`window.__seated = false; window.__teleport(${gs.x}, ${gs.z}, ${gs.h}).then(() => { window.__seated = true })`)
    check(await until(() => js('window.__seated'), 30000, 250), 'the teleport to the gas station never seated')
    await readCards()
    check(await js('window.__worstDay().pumpsShut'), `the snack stop left the pumps open (DEC-323): ${JSON.stringify(await wd())}`)
    const shopUp = () => js('document.getElementById("svc-screen").checkVisibility()')
    if (!await shopUp()) { await simFor(1); await park(true) }
    check(await until(shopUp, 3000), `parked at the gas station for the snack, no shop: ${JSON.stringify(await tut())}`)
    await js('document.querySelector("#svc-screen [data-tab=shop]")?.click()')
    const nut = 'Array.from(document.querySelectorAll("#svc-screen [data-act=node][data-slot]")).find(r => /Bag of peanuts/.test(r.textContent))'
    check(await js(`!!${nut}`), `the gas station sells no peanuts: "${(await js('document.querySelector("#svc-screen").textContent')).slice(0, 200)}"`)
    // DEC-356: the snack stop's shelf sells the peanuts alone — any other row says why and its buttons are off.
    { const other = 'Array.from(document.querySelectorAll("#svc-screen [data-act=node][data-slot]")).find(r => !/Bag of peanuts/.test(r.textContent))'
      await js(`${other}.click()`)
      const lk = await js('({ why: /Katie asked for the peanuts/.test(document.querySelector("#svc-screen .sv-kids")?.textContent ?? ""), on: [...document.querySelectorAll("#svc-screen .sv-kids [data-act=stow], #svc-screen .sv-kids [data-act=buy], #svc-screen .sv-kids [data-act=eat]")].filter(b => !b.disabled).length })')
      check(lk.why && lk.on === 0, `at the snack stop another row is for sale (DEC-356): ${JSON.stringify(lk)}`) }
    await js(`${nut}.click()`)
    await js('document.querySelector("#svc-screen .sv-kids [data-act=stow]").click()')
    await js('document.querySelector("#svc-screen [data-act=checkout]").click()')
    check(await until(async () => (await tut()).stop === 'pump', 3000), `buying the peanuts did not send the day to the pump: ${JSON.stringify(await tut())}`)
    { await js(`${nut}.click()`)   // a second bag: refused, so the gas money stays (DEC-356)
      check(await js('/one bag will do/.test(document.querySelector("#svc-screen .sv-kids")?.textContent ?? "") && !!document.querySelector("#svc-screen .sv-kids [data-act=stow]")?.disabled'),
        'the peanuts bought, the shop sells a second bag (DEC-356)') }
    check(!await js('window.__worstDay().pumpsShut'), 'the peanuts bought, the pumps stayed shut (DEC-323)')
    if (await shopUp()) await tap('Escape')
    check(await until(async () => !await shopUp(), 2000), 'Escape did not close the gas station shop')
    // DEC-323: pulling away from the store, mom sends you to a pump.
    check(!await js('/pump/.test(document.getElementById("dlg-text")?.textContent ?? "") && document.getElementById("dialogue-panel").checkVisibility()'), "mom's pump card came before pulling away")
    if (await js('window.__vs.parked')) await tap(' ')
    check(await until(() => js('/Ring ring ring|plumb outta gas/.test(document.getElementById("dlg-text")?.textContent ?? "")'), 3000), "pulling away from the store, no call from mom about the gas (DEC-345)")
    await readCards()
    check(saidAny(/^Mom: .*plumb outta gas/) && saidAny(/^Mom: .*pull up at a pump/), `mom's call did not go on to the gas lesson: ${JSON.stringify(said.slice(-3))}`)
    { const g = said.findLastIndex(t => /pull up at a pump/.test(t))
      check(said[g + 1] !== 'Mom: <click>', `mom hung up before the fill-up (DEC-354: she stays on the line): ${JSON.stringify(said.slice(g - 2, g + 2))}`) }
    check(await js('window.__econ.money') === 3, `the peanuts did not leave mom's $3 of gas money: $${await js('window.__econ.money')}`)
    const pz = await js(`(() => { const q = window.__poi().list().find(q => q.id === window.__worstDay().pump.id); return window.__towSeat(q) })()`)
    await tp(pz.x, pz.z, pz.heading); await park(true)
    check(await until(() => js('document.getElementById("pump-display").classList.contains("on")'), 3000), "the station: parking at its pump opened no pump")
    await readCards()   // the pump's first-use card
    // FEAT-184 (DEC-151): mom makes you fill until her money is gone — the brake does not let go before (her card says so).
    await hold('f', 1); await tap(' '); await readCards()
    check(await js('document.getElementById("pump-display").classList.contains("on") && !window.__worstDay().pump.done'),
      `the brake let go at the pump with money left: ${JSON.stringify(await wd())}, $${await js('window.__econ.money')}`)
    await hold('f', 6); await tap(' ')   // pump till the money runs out, then the brake off pays
    check(await until(async () => (await wd()).pump.done, 3000), `filling up did not end the station's beat: ${JSON.stringify(await wd())}`)
    check(await js('window.__econ.money < 0.05'), `the fill-up left money in the wallet: $${await js('window.__econ.money')}`)
    check(await until(async () => (await tut()).stop === 'camp', 3000), `the fill-up did not send the day to the camping area: ${JSON.stringify(await tut())}`)
    await stamped(10, 'the station')
    // DEC-346: the camping area, the old McGill ranch — mom's send-off, the waypoint already on its door and the HUD's
    // guiding text; at the waypoint Katie calls (DEC-345) and walks you through it: Z looks for a site (the vibe bar's card),
    // a re-park asks, "make camp" makes it (no sleep on offer, DEC-308; the snack's card), the peanuts eaten in camp bring
    // her talk (DEC-347) and the 17:00 stamp; then break camp.
    await readCards()   // mom's send-off
    { const f = said.findLastIndex(t => /have fun with Katie/.test(t))
      check(f >= 0 && said[f + 1] === 'Mom: <click>', `mom's send-off did not hang up her gas call (DEC-354): ${JSON.stringify(said.slice(-3))}`) }
    const ranch = await js('({ w: window.__map2d()._getWaypoint(), d: window.__tutorial().camp })')
    check(ranch.w && ranch.d && Math.hypot(ranch.w.x - ranch.d.x, ranch.w.z - ranch.d.z) < 1, `the tank filled, no waypoint on the camping area: ${JSON.stringify(ranch)}`)
    check(/^drive out to the old McGill ranch · /.test((await eve()).hud), `the drive to the camping area does not read "drive out to the old McGill ranch" ("${(await eve()).hud}")`)
    const door = await js(`(() => { const d = window.__tutorial().camp, nr = window.__roadSys().queryNearest(d.x, d.z, 30)
      return { x: nr.point.x, z: nr.point.z, h: Math.atan2(-nr.tangent.x, -nr.tangent.z) } })()`)
    await js(`window.__seated = false; window.__teleport(${door.x}, ${door.z}, ${door.h}).then(() => { window.__seated = true })`)
    check(await until(() => js('window.__seated'), 30000, 250), 'the teleport to the waypoint never seated')
    check(await until(() => js('/Ring ring ring|already there/.test(document.getElementById("dlg-text")?.textContent ?? "")'), 5000), `at the waypoint, no call from Katie: ${JSON.stringify(await tut())}`)
    await readCards()
    check(saidAny(/^Katie: .*Hold B and select the camping menu to look for a campsite\. Then drive slowly down the road to find the best site nearby\. Anything flat enough will do!$/)
      && said[said.length - 1] !== 'Katie: <click>', `Katie's camp instruction is not the owner's words, or she hung up before the hunt (DEC-355): ${JSON.stringify(said.slice(-3))}`)
    check(saidAny(/^Katie: Oh, you're already there\? I'm just a couple minutes out\. Go ahead and find a good spot\. I'll just pull over where I see your truck\./),
      `Katie's arrival call is not the owner's words: ${JSON.stringify(said.slice(-3))}`)
    check(!await js('window.__map2d()._getWaypoint()'), 'arrived, the waypoint stayed on the map')
    await simFor(0.5)
    // Graded from the road, as the prompt grades (camp.js evaluate). A pick graded before its chunk streamed in can read
    // otherwise once the truck is there, so each is re-graded from the seat and the next taken if it no longer holds.
    const sites = await js(`(() => { const C = window.__campSys(), R = window.__roadSys(), d = window.__tutorial().camp, out = []
      for (let r = 0; r <= 300 && out.length < 6; r += 12) for (let a = 0; a < 6.28 && out.length < 6; a += r ? 12 / r : 7) {
        const nr = R.queryNearest(d.x + r * Math.cos(a), d.z + r * Math.sin(a), 30); if (!nr?.point) continue
        if (out.some(o => Math.hypot(o.x - nr.point.x, o.z - nr.point.z) < 25)) continue
        const g = C.evaluate(nr.point.x, nr.point.z)
        if (g.inZone && g.withinTether && g.flat && g.pad) out.push({ x: nr.point.x, z: nr.point.z, h: Math.atan2(-nr.tangent.x, -nr.tangent.z) }) }
      return out })()`)
    check(sites.length, `no campsite in the camping area at ${JSON.stringify((await tut()).camp)}`)
    const holds = () => js('(() => { const v = window.__vs.position, g = window.__campSys().evaluate(v.x, v.z); return g.inZone && g.withinTether && g.flat && !!g.pad })()')
    let site = null
    for (const c of sites) { await tp(c.x, c.z, c.h); if (await holds()) { site = c; break } }
    check(site, `no campsite in the camping area holds once the truck is there: ${JSON.stringify(sites)}`)
    const campPanel = () => js('getComputedStyle(document.getElementById("camp-panel")).display !== "none"')
    const shown = id => js(`getComputedStyle(document.getElementById("${id}")).display !== "none"`)
    check(await until(() => js('document.getElementById("camp-row")?.style.display === "flex"'), 3000), 'no tent at the camping area')
    await tap('z')
    check(await until(() => js('/That.s the vibe/.test(document.getElementById("dlg-text")?.textContent ?? "")'), 5000), 'looking for a campsite, Katie did not explain the vibe bar')
    await readCards()
    check(said[said.length - 1] === 'Katie: <click>', `the vibe cards did not hang up Katie's call (DEC-354): ${JSON.stringify(said.slice(-2))}`)
    const makeUp = async () => await campPanel() && await shown('cp-make')
    for (let i = 0; i < 4 && !await makeUp(); i++) { await park(true); await until(makeUp, 1500) }   // the re-park the hunt asks for
    if (!await makeUp()) console.log('  camp: ' + await js(`JSON.stringify((() => { const v = window.__vs.position, g = window.__campSys().evaluate(v.x, v.z)
      return { site: ${JSON.stringify(site)}, v: [v.x, v.z], parked: window.__vs.parked, speed: window.__vs.velocity.length(), inZone: g.inZone, tether: g.withinTether, flat: g.flat, pad: !!g.pad, lateral: g.lateral,
        row: document.getElementById("camp-row")?.style.display, rowText: document.getElementById("camp-row")?.textContent.trim().slice(0, 80), panel: document.getElementById("camp-panel").style.display } })())`))
    check(await makeUp(), `Z and a park at the campsite opened no "make camp": ${JSON.stringify(await tut())}`)
    check(!await shown('cp-truck'), 'the camping area offers the truck as a bed (DEC-308)')
    await js('document.getElementById("cp-make").click()')
    check(await until(() => shown('cp-break'), 6000), 'making camp did not make it')
    check(await until(() => js('/break out that snack: select inventory and eat the peanuts/.test(document.getElementById("dlg-text")?.textContent ?? "")'), 5000), 'camp made, Katie did not send you to the inventory for the snack (DEC-355)')
    check(!await js('!!window.__map2d()._getWaypoint()') && !/McGill/.test((await eve()).hud || ''), 'camped, the ranch pin or its line is still up (DEC-356)')
    await readCards()
    check(!await shown('cp-sleep'), 'the camp offers sleep on the firing day (DEC-308)')
    check(await js("window.__inv.use('bagOfPeanuts')"), 'the peanuts could not be eaten')
    check(await until(() => js('/now that you don.t have a job/.test(document.getElementById("dlg-text")?.textContent ?? "")'), 5000), `eating in camp brought no call from Katie: ${JSON.stringify(await tut())}`)
    await stamped(17, "Katie's call")
    check(await js('!/\\{dir\\}|\\{deeds\\}/.test(document.getElementById("dialogue-panel").textContent)'), "Katie's call left a fill unfilled")
    check(await readCards() >= 6, "Katie's call is not her six cards")
    { const w = said.findLastIndex(t => /now that you don.t have a job/.test(t))
      check(said[w] === "Katie: So what are you gonna do now that you don't have a job?" && said[w - 1] !== 'Phone: Ring ring ring' && !said.slice(w).includes('Katie: <click>'),
        `Katie's talk at the camp is not in person (no "Hey, it's me.", no ring, no click, DEC-355): ${JSON.stringify(said.slice(w - 1, w + 1))}`) }
    if (await js('document.getElementById("inv-screen").classList.contains("open")')) await tap('Escape')
    // BUG-189: in camp no menu hint to start the truck, and no pedal latches. W held in camp: no hint; focus lost with W
    // down: W is up (vehicle.js blur). A pad whose trigger reads half-pressed before its first report (the standard
    // mapping's axis at 0): no throttle until the trigger has been seen at rest, then it drives.
    { const hint = () => js('document.getElementById("ignition-hint").style.opacity')
      await key('w', true); await simFor(0.5)
      check(await hint() !== '1', 'BUG-189: in camp, W raised the "start the truck" hint')
      await js('window.dispatchEvent(new Event("blur"))'); await simFor(0.5)
      check(await js('window.__vs.throttle') === 0, `BUG-189: focus lost with W down, the throttle stayed ${await js('window.__vs.throttle')}`)
      await key('w', false)
      await padOn(); await btn(4)   // LB (the clutch, inert here) puts the pad in charge
      await js('__fp.b[7] = 0.5; window.dispatchEvent(Object.assign(new Event("gamepadconnected"), { gamepad: { index: 0 } }))'); await simFor(0.5)
      check(await js('window.__vs.throttle') === 0 && await hint() !== '1', `BUG-189: a trigger never seen at rest drove: throttle ${await js('window.__vs.throttle')}, hint ${await hint()}`)
      await js('__fp.b[7] = 0'); await simFor(0.2); await js('__fp.b[7] = 1'); await simFor(0.3)
      check(await js('window.__vs.throttle') > 0.5, `BUG-189: the trigger seen at rest then pressed did not drive: ${await js('window.__vs.throttle')}`)
      await js('__fp.b[7] = 0'); await simFor(0.3); await padOff() }
    await js('document.getElementById("cp-break").click()')
    check(await until(async () => !await campPanel(), 3000), 'break camp did not close the camp')
    check((await tut()).stop === 'home', `Katie's call did not send the day home: ${JSON.stringify(await tut())}`)
    await crank(); await readCards()   // making camp turned the key off
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
    // FEAT-217 (DEC-271/272): the line says pull over, and the accelerator is cut — W neither drives nor lets the brake go.
    await readCards()   // the flat's card holds the sim
    check(/pull over and check your tire/.test((await eve()).hud), `after the flat the HUD does not say pull over ("${(await eve()).hud}")`)
    await hold('w', 1)
    check(await js('window.__vs.parked && window.__vs.throttle === 0'), `after the flat W still drove: parked ${await js('window.__vs.parked')}, throttle ${await js('window.__vs.throttle')}`)
    await readCards()   // up to the flat's card: it waits for V (DEC-359)
    check(await js('window.__tutorial().until') === 'damage', `the flat's card does not wait for V: ${JSON.stringify(await js('window.__tutorial()'))}`)
    await js('window.__inv.use("spareTire")'); await sleep(300)   // DEC-359: tire work before V is locked (silent)
    check(await js('!document.getElementById("dmg-screen").classList.contains("picking")'), 'the spare picker opened before the damage screen was looked at (DEC-359)')
    await tap('v'); await readCards()   // the damage screen's card: it waits for the spare to be tried
    check(await js('window.__tutorial().until') === 'spare', `the damage card does not wait for the spare: ${JSON.stringify(await js('window.__tutorial()'))}`)
    await tap('Escape')
    await js('window.__inv.use("spareTire")')
    check(await until(() => js('document.getElementById("dmg-screen").classList.contains("picking")'), 1000), 'the spare opened no tire picker')
    await js('document.querySelector("#dmg-screen .ds-pbtn[data-track=tireFL]").click()')
    await js('document.querySelector("#dmg-screen [data-act=pick-do]").click()'); await readCards()   // the spare: flat too (waits for X)
    check(await js('window.__tutorial().until') === 'recovery', `the spare's card does not wait for the recovery menu: ${JSON.stringify(await js('window.__tutorial()'))}`)
    await tap('Escape')   // the spare's picker; closing it reopens the inventory (parked)
    if (await until(() => js('document.getElementById("inv-screen").classList.contains("open")'), 1000)) await tap('Escape')
    console.log('  worst day: the tow')
    await tap('x')
    // BUG-181: the tow's card is up — and the menu with the tow is not — before the tow can be taken; the menu opens as it ends.
    check(await until(() => js('/nearest auto shop/.test(document.getElementById("dlg-text").textContent) && !document.getElementById("recovery-card").checkVisibility()'), 3000),
      `X did not put the tow card up ahead of the recovery menu: ${await js('JSON.stringify({ card: document.getElementById("dlg-text").textContent, menu: document.getElementById("recovery-card").checkVisibility() })')}`)
    await readCards()   // the recovery menu's card
    check(await until(() => js('!!document.querySelector("#recovery-card button[data-act=towShop]:not([disabled])")'), 2000), 'the recovery menu offers no tow to a shop')
    // BUG-178: a 4 s state trace (20 Hz) from the click, printed only if the shop never opens.
    await js(`window.__towTrace = []; (() => { const t0 = performance.now(), id = setInterval(() => { const p = window.__vs.position, q = window.__poi().nearest(p.x, p.z), pe = document.getElementById("poi-prompt")
      window.__towTrace.push([Math.round(performance.now() - t0), window.__vs.parked, +p.x.toFixed(1), +p.z.toFixed(1), q && q.type, q && +Math.hypot(q.x - p.x, q.z - p.z).toFixed(1), window.__mission()?.state, window.__story?.()?.isEntering(),
        document.getElementById("svc-screen").checkVisibility(), window.__tutorial().phase, pe.style.display, pe.textContent.slice(0, 40), +window.__day().clockH().toFixed(2), document.getElementById("inv-screen")?.classList.contains("open"), document.getElementById("recovery-card")?.checkVisibility(), document.getElementById("svc-screen").className, document.getElementById("pump-display").classList.contains("on")])
      if (window.__towTrace.length > 80) clearInterval(id) }, 50) })()`)
    await js('document.querySelector("#recovery-card button[data-act=towShop]").click()')
    // The shop opens on the parked edge after the tow's reseat, which awaits the seat like a teleport: seat()'s ceiling.
    check(await until(() => js('document.getElementById("svc-screen").checkVisibility()'), 30000), `the tow did not land at an open shop: ${await js(`JSON.stringify({ parked: window.__vs.parked,
      v: +window.__vs.velocity.length().toFixed(2), card: document.getElementById("dialogue-panel").checkVisibility() && document.getElementById("dlg-speaker").textContent,
      shop: (() => { const p = window.__vs.position, q = window.__poi().list().filter(q => q.type === 'autoShop').sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0], s = q && window.__towSeat(q)
        return s && { fromSeat: +Math.hypot(p.x - s.x, p.z - s.z).toFixed(1), fromMarker: +Math.hypot(p.x - q.x, p.z - q.z).toFixed(1) } })(), h: window.__day().clockH(), trace: window.__towTrace })`)}`)
    check((await wd()).towed, 'the tow was not counted (the night beat)')
    console.log('  worst day: the shop')
    await readCards()   // the shop's cards
    await js('document.querySelector("#svc-screen [data-tab=shop]")?.click()')
    const fit = 'document.querySelector("#svc-screen button[data-act=buy][data-socket=tireFL]:not([disabled])")'
    // FEAT-196: a shelf row's options show only while it is selected — select each in turn until one fits the front left.
    await js(`(() => { const lines = () => [...document.querySelectorAll("#svc-screen button[data-act=node][data-slot]")]
      for (let i = 0; i < lines().length && !${fit}; i++) lines()[i].click() })()`)
    check(await until(() => js(`!!${fit}`), 2000), 'the shop offers no tire for the front left')
    const m0 = await js('window.__econ.money')
    await js(`${fit}.click()`)
    check(await until(() => js('!window.__damage.flat[0]'), 2000), 'buying a tire for the flat corner did not fix it')
    await js('document.querySelector("#svc-screen [data-act=checkout]").click()')   // FEAT-212: the cart
    check(await js('window.__econ.money') === m0, `the tire was not on mom (FEAT-184): $${m0} → $${await js('window.__econ.money')}`)
    console.log(`  the fix: energy ${(await js('window.__day().energyH()')).toFixed(2)} h before (${await js('window.__day().stage()')})`)
    await tap('Escape'); await tap(' ')   // off the brake: the night drive, whose card holds the sim
    check(await until(async () => /headlights/.test(await js('document.getElementById("dlg-text")?.textContent ?? ""')), 3000), 'no headlights card on the night drive')
    await readCards()   // up to the lights' card, which waits for L (DEC-359)
    check(await js('window.__tutorial().until') === 'lights', `the headlights card does not wait for L: ${JSON.stringify(await js('window.__tutorial()'))}`)
    await tap('l'); await readCards()   // it clears on the lights; her slow-down card follows
    // DEC-357: the tire fixed, the driver is SLEEPY, and blinks on the held clock's drive (day.js blinkOnly).
    check(await js('window.__day().stage()') === 'sleepy', `the tire fixed, the driver is not sleepy (DEC-357): ${await js('window.__day().energyH()')} h`)
    { const h1 = await clock(); await js('window.__day()._nextBlinkH = 1e-4')
      const ok = await until(() => js('!!window.__day()._blink'), 2000) && await clock() === h1
      check(ok, ok || `DEC-357: no blink on the sleepy night drive, or the clock ran: clock ${h1} → ${await clock()} ${await js('JSON.stringify({ parked: window.__vs.parked, stage: window.__day().stage(), next: window.__day()._nextBlinkH, tut: window.__tutorial(), dlg: document.getElementById("dlg-text")?.textContent })')}`) }
    // Parked at hers: home safe (DEC-325), her hunger line, her sleep card, the timer preset to wake at 07:00 on
    // day 0 — and sleeping ends the firing day.
    // Not seat(): its settle waits on the sim, and the lessons that land on arrival hold it — read them first.
    await js(`window.__seated = false; window.__teleport(${mom.x}, ${mom.z}, ${mom.h}).then(() => { window.__seated = true })`)
    check(await until(() => js('window.__seated'), 30000, 250), "the teleport to mom's never seated")
    // FEAT-184: the flat's lessons were read on the way. The truck seats latched, and after the tow that counts as a pull:
    // her sleep card (and its lessons) may already be open on arrival — then no second park, whose Space would turn them.
    const panel = () => js('getComputedStyle(document.getElementById("camp-panel")).display !== "none"')
    let lessons = await readCards()
    if (await js('window.__tutorial().until') === 'park') { await simFor(1); await park(true); lessons += await readCards() }   // DEC-359: her park card waits for the full stop + handbrake
    if (!await panel()) { await simFor(1); await park(true) }   // the 0.5 m drop lands, then a fresh pull
    check(await until(panel, 3000), "parking at mom's that night opened no sleep card")
    lessons += await readCards()
    check(lessons >= 5, `no welcome, hunger and sleep lessons at hers (${lessons} read, want her welcome, her hunger card and her three sleep cards)`)
    check(await clock() >= -2.51, `her door that night did not stamp 21:30 (clockH ${await clock()})`)
    check(saidAny(/^Mom: .*Set your alarm clock for 06:30/), `mom's sleep card does not say to set the alarm clock (DEC-357): ${JSON.stringify(said.slice(-3))}`)
    await js('document.getElementById("cp-sleep").click()')
    const want = await js('Math.round(6.5 - window.__day().clockH())')   // 06:30 on day 1 is clockH 6.5 (DEC-357's alarm)
    { const bed = await clock()   // DEC-357: another wake time is refused, "Set this time instead"
      await js(`document.getElementById("cp-hours").value = "${want + 1}"; document.getElementById("cp-hours").dispatchEvent(new Event("input"))`)
      await js('document.getElementById("cp-sleep-go").click()'); await sleep(800)
      check(await clock() === bed && /Set this time instead: wake 06:30/.test(await js('document.getElementById("cp-hours-text").textContent')),
        `the tutorial's night took another wake time than the alarm (DEC-357): clockH ${await clock()}, "${await js('document.getElementById("cp-hours-text").textContent')}"`) }
    await js(`document.getElementById("cp-hours").value = "${want}"; document.getElementById("cp-hours").dispatchEvent(new Event("input"))`)
    await js('document.getElementById("cp-sleep-go").click()')
    check(await until(() => js('window.__day().clockH() >= 6.49'), 6000), `the night did not reach 06:30 (clockH ${await js('window.__day().clockH()')})`)
    check(Math.abs(await js('window.__day().clockH()') - 6.5) < 0.02, `the evening's night did not wake at 06:30 sharp on day 1 (clockH ${await js('window.__day().clockH()')})`)
    check(!await js('document.getElementById("midnight-card").classList.contains("on")'), "the tutorial's night dropped the midnight overlay")
    const e1 = await eve()
    check(e1.tut === 'morning' && /to work · park there for your last check/.test(e1.hud), `waking did not end the firing day and send the morning to "work" for the check (DEC-357): ${JSON.stringify(e1)}`)
    // The morning: breakfast, then mom's reminder (DEC-326, DEC-422), the last drive on rails. FEAT-184 stage 5: breakfast is the
    // player's to eat now (her card asks for a packed lunch). FEAT-229: the day's stamps are lived hours (energy and hunger
    // pay for them), so the driver may wake hungry; the lunch she asks for feeds him.
    const stage = () => js('document.getElementById("hm-stage").textContent')   // FEAT-198: hunger's own line
    let morn = await readCards()   // up to her breakfast card, which waits for a lunch eaten (DEC-359)
    // (her breakfast card clears itself the moment a lunch is gone; this run ate two at night, so it may already be down: DEC-359)
    check(await js('window.__inv.use("packedLunch")'), 'no packed lunch for breakfast')
    morn += await readCards()   // mom's reminder (DEC-422)
    // her card is recorded by whichever read meets it: readCards' wait branch records the card on screen after 1.5 s, and
    // the breakfast card (until: lunch) can clear itself inside that wait, so the morning card is the one recorded, uncounted
    for (let i = 0; i < 10 && !saidAny(/^Mom: Now go get that paycheck, honey/); i++) { morn += await readCards(); await sleep(500) }
    check(saidAny(/^Mom: Now go get that paycheck, honey/), `no reminder in the morning: ${JSON.stringify(said.slice(-3))}`)
    check(await until(async () => !/hungry/.test(await stage()), 1000), `breakfast did not feed the driver ("${await stage()}")`)
    if (await panel()) await tap('Escape')   // her sleep card, if it is still up over the morning
    await strayCheck('on the way to the paycheck')
    await readCards()
    // Parked at the joint: the paycheck at 07:00 on day 0 (DEC-159, DEC-299: the clock held since the wake), and seed 6
    // loaded back (DEC-158).
    const jt = await js(`(() => { const q = window.__map2d()._getPois().find(q => q.type === 'foodVendor')
      return { h: Math.atan2(-q.tx, -q.tz), ...${PAD_SEAT}(q) } })()`)
    await js(`window.__seated = false; window.__teleport(${jt.x}, ${jt.z}, ${jt.h}).then(() => { window.__seated = true })`)
    check(await until(() => js('window.__seated'), 30000, 250), 'the teleport to the joint never seated')
    // The truck seats latched, which counts as parked: the paycheck may open on arrival, and reading it loads seed 6
    // (the sim held under the load and Larry's call) — so stop at the manager, and park only when he is not up yet.
    await readCards(800, 'The manager')
    if (await speaker() !== 'The manager') { await simFor(1); await park(true) }
    check(await until(async () => await speaker() === 'The manager', 5000), `parked at the joint in the morning, no paycheck card (speaker "${await speaker()}", ${JSON.stringify(await tut())})`)
    const cash0 = await js('window.__econ.money')
    await readCards()
    check(await until(async () => await js(live) && await world() === '6', 60000, 250), `the paycheck did not load seed 6 back (world ${await world()}, ${JSON.stringify(await tut())})`)
    const back = await js(`(() => { const q = window.__poi().list().find(q => q.type === 'foodVendor'), v = window.__vs.position
      return { d: Math.hypot(v.x - q.x, v.z - q.z), h: window.__day().clockH(), money: window.__econ.money, tut: window.__tutorial() } })()`)
    check(back.d < 25 && Math.abs(back.h - 7) < 0.1 && back.tut.phase === 'free' && back.tut.returnSeed === null,
      `seed 6 is not back outside its joint at 07:00 on day 1 in free will: ${JSON.stringify(back)}`)
    check(back.money > cash0, `the last paycheck did not land: $${cash0} → $${back.money}`)
    check(await until(async () => await speaker() === 'Phone', 5000), `no Larry's call ringing after the paycheck (speaker "${await speaker()}")`)
    await readCards()
    check(saidAny(/^Uncle Larry: .*find yourself some work/) && said[said.length - 1] === 'Uncle Larry: <click>', `Larry's call after a played tutorial is not DEC-326's, rung and hung up: ${JSON.stringify(said.slice(-3))}`)
    // FEAT-148: midnight drops its overlay over the road, then clears it (every clock path counts). Day 0 → 1 is the run's
    // first midnight, adopted silently; day 1 → 2 is the first the overlay marks.
    const toMidnight = '{ const d = window.__day(); d.advanceMinutes((24 - (d.clockH() % 24 + 24) % 24) * 60 + 1) }'
    await js(toMidnight); await sleep(500); await js(toMidnight)
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
  }],
  ['skipMenus', async () => {
    // BUG-183 (owner, 2026-11-16: skipped mid-pump, "the fuel dialogue was still open and I was able to continue pumping"):
    // a played tutorial on the tutorial seed, skipped from inside each menu that can be up in it. Nothing may be left
    // open (main.js's menu list, __openMenus, and each menu's own DOM), the pump may not pump on, and the wallet and the
    // tank are a clean skip's. One new run per case. Runs alone: SMOKE_STEPS=boot,skipMenus.
    const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
    const speaker = () => js('getComputedStyle(document.getElementById("dialogue-panel")).display !== "none" && document.getElementById("dlg-speaker").textContent')
    const readCards = async (beatMs = 800) => {
      for (let i = 0; i < 40; i++) {
        if (!await speaker()) { await sleep(beatMs); if (!await speaker()) return }
        const u = await js('window.__tutorial().until')   // DEC-359: a card that waits for an action: the key is turned, any other is left up (the skip below ends it)
        if (u === 'engine') { await crank(); await sleep(500); continue }   // the HUD poll clears the card
        if (u) return
        await tap('Enter'); await sleep(200)
      }
      throw new Error(`cards never stopped coming: ${await speaker()}: ${await js('document.getElementById("dlg-text")?.textContent')} ${await js('JSON.stringify({ ign: window.__vs.ignition?.state, t: window.__tutorial(), q: window.__mission().state })')}`)
    }
    const tp = async (x, z, h) => {
      await js(`window.__seated = false; window.__teleport(${x}, ${z}, ${h}).then(() => { window.__seated = true })`)
      check(await until(() => js('window.__seated'), 30000, 250), `the teleport to (${x.toFixed(0)}, ${z.toFixed(0)}) never seated`)
      await readCards(); await simFor(1)
    }
    const seatAt = async (pick) => {   // a tow's seat at the POI `pick` (an in-page expression) names
      const s = await js(`(() => { const q = ${pick}; return q ? window.__towSeat(q) : null })()`)
      check(s, `no POI for ${pick}`)
      await tp(s.x, s.z, s.heading); await park(true); await readCards()
    }
    const nearest = type => `window.__poi().list().filter(q => q.type === '${type}').sort((a, b) => { const v = window.__vs.position
      return Math.hypot(a.x - v.x, a.z - v.z) - Math.hypot(b.x - v.x, b.z - v.z) })[0]`
    const opened = () => js(`JSON.stringify({ list: window.__openMenus?.() ?? [], pump: document.getElementById("pump-display").classList.contains("on"),
      svc: document.getElementById("svc-screen").checkVisibility(), inv: document.getElementById("inv-screen").classList.contains("open"),
      dmg: document.getElementById("dmg-screen").classList.contains("open"), rc: document.getElementById("recovery-card").checkVisibility(),
      map: window.__map2d().isOpen(), camp: document.getElementById("camp-panel").style.display === "block" })`)
    // Each case opens its menu and returns true when the skip may honestly cost money (a pump that is not the worst day's).
    // Mom's sleep card is not a case: her door offers nothing until the firing day's errands are done (DEC-308), and the
    // skip closed her card before BUG-183 too; the menu list closes it now like the rest.
    const CASES = {
      clean: null,
      pump: async () => {
        // The wallet starts empty (DEC-306): mom's hand-over at her door first, so the pump has money to take — and the
        // skip must take her money back too (a clean skip's wallet below).
        const ms = await js(`(() => { const q = window.__map2d()._getPois().find(q => q.type === 'momsHouse')
          return { h: Math.atan2(-q.tx, -q.tz), ...${PAD_SEAT}(q) } })()`)
        await tp(ms.x, ms.z, ms.h); await park(true); await readCards()
        check(await until(async () => await js('window.__econ.money') > 0, 3000), `mom's hand-over put no money in the wallet: ${JSON.stringify(await js('window.__tutorial()'))}`)
        const due = await js('window.__worstDay().pump?.id ?? null')   // the snack station's pump, when there is one
        await seatAt(due ? `window.__poi().list().find(q => q.id === ${JSON.stringify(due)})` : nearest('gasStation'))
        check(await until(() => js('document.getElementById("pump-display").classList.contains("on")'), 3000), 'parking at a pump opened no pump')
        await readCards()
        const g0 = await js('window.__vs.fuel.gal'); await hold('f', 1)
        check(await js(`window.__vs.fuel.gal > ${g0} + 0.1`), 'F at the pump pumped nothing')
        if (!due) console.log('  skipMenus: no station due on the worst day — the pump case pays its counter, wallet not compared')
        return !due
      },
      shop: async () => {
        await seatAt(nearest('autoShop'))
        check(await until(() => js('document.getElementById("svc-screen").checkVisibility()'), 3000), 'parking at the auto shop opened no service screen')
        await readCards()
        // something in the cart, so the skip's close takes the discard path (FEAT-212): the wallet below proves no charge
        await js('document.querySelector("#svc-screen [data-tab=shop]")?.click()')
        await js(`(() => { const lines = () => [...document.querySelectorAll("#svc-screen button[data-act=node][data-slot]")], buy = () => document.querySelector("#svc-screen button[data-act=buy]:not([disabled])")
          for (let i = 0; i < lines().length && !buy(); i++) lines()[i].click(); buy()?.click() })()`)
        console.log(`  skipMenus shop: cart ${await js('document.querySelector("#svc-screen [data-act=checkout]") ? "filled" : "empty"')}`)
      },
      damage: async () => {
        await tap('v')
        check(await until(() => js('document.getElementById("dmg-screen").classList.contains("open")'), 2000), 'V opened no damage screen')
        await readCards()
      },
      inventory: async () => {
        await tap('Tab')
        check(await until(() => js('document.getElementById("inv-screen").classList.contains("open")'), 2000), 'Tab opened no inventory')
      },
      map: async () => {
        await key('m', true); await sleep(100); await key('m', false)
        check(await until(() => js('window.__map2d().isOpen()'), 2000), 'a tap of M opened no map')
      },
      recovery: async () => {
        // the chip hides in a place's ring: a road point well clear of every POI
        const r = await js(`(() => { const v = window.__vs.position, P = window.__poi().list()
          for (let d = 150; d <= 600; d += 50) for (let a = 0; a < 6.28; a += 0.4) {
            const nr = window.__roadSys().queryNearest(v.x + d * Math.cos(a), v.z + d * Math.sin(a), 100)
            if (nr?.point && !P.some(q => Math.hypot(q.x - nr.point.x, q.z - nr.point.z) < 80)) return { x: nr.point.x, z: nr.point.z, h: Math.atan2(-nr.tangent.x, -nr.tangent.z) } }
          return null })()`)
        check(r, 'no road clear of every POI near the joint')
        await tp(r.x, r.z, r.h); await park(true); await readCards()
        await tap('x'); await readCards()   // BUG-181: in the tutorial the tow's card goes first
        check(await until(() => js('document.getElementById("recovery-card").checkVisibility()'), 3000), 'X opened no recovery menu')
      },
    }
    let clean = null
    for (const [name, open] of Object.entries(CASES)) {
      await js('document.getElementById("pm-menu").click()')   // out of the last run (or free roam) to the main menu
      await js('document.getElementById("mm-new").click()')
      await js(`document.getElementById("su-seed").value = "${TUTORIAL.seed}"; document.getElementById("su-start").click()`)   // data/tutorial.js
      check(await until(() => js(live), 45000, 250), `${name}: the tutorial run never went live`)
      for (let i = 0; i < 12 && !await js('document.getElementById("tut-card").style.display === "flex"'); i++) { await tap('Enter'); await sleep(250) }
      check(await until(() => js('document.getElementById("tut-card").style.display === "flex"'), 3000), `${name}: the firing did not end on the tutorial card`)
      await js('document.getElementById("tc-play").click()')
      check(await until(async () => await speaker() === 'Phone', 5000), `${name}: "play" did not open on mom's call (DEC-354: its ring)`)
      await readCards()
      const pays = open ? await open() : false
      const before = await opened()
      // a played tutorial asks once more (DEC-148): two holds
      for (let i = 0; i < 2 && await js('window.__tutorial().phase !== "free"'); i++) { await key('m', true); await sleep(1300); await key('m', false); await sleep(300) }
      check(await until(() => js('/last check/.test(document.getElementById("dialogue-panel").textContent)'), 8000), `${name}: the skip did not reach the manager's check: ${JSON.stringify(await js('window.__tutorial()'))}`)
      const got = { money: await js('window.__econ.money'), gal: +(await js('window.__vs.fuel.gal')).toFixed(3) }
      await readCards()
      await sleep(3000)   // past a settled pump's 2.5 s receipt
      const after = await opened(), a = JSON.parse(after)
      console.log(`  skipMenus ${name}: open ${before} → ${after} · $${got.money} · ${got.gal} gal`)
      check(!a.list.length && !Object.entries(a).some(([k, v]) => k !== 'list' && v), `${name}: the skip left a menu open: ${after}`)
      if (await js('window.__vs.parked')) {
        const g0 = await js('window.__vs.fuel.gal'); await hold('f', 1)
        check(await js(`window.__vs.fuel.gal <= ${g0} + 1e-6`), `${name}: F still pumps after the skip`)
      }
      if (!clean) clean = got
      else if (!pays) check(got.money === clean.money && Math.abs(got.gal - clean.gal) < 0.01, `${name}: the skip's wallet and tank differ from a clean skip's: ${JSON.stringify(got)} vs ${JSON.stringify(clean)}`)
    }
  }],
  ['newRun', async () => {
    // BUG-184 (owner, 2026-11-16: gave up with a destroyed wheel, a new game with the tutorial played — sparks and the
    // rim's grind on a healthy tire, and the map flashed the last world): a run wrecks the rear-right wheel down to its
    // rim and opens its map, gives up, and each next start — the tutorial played, skipped, free roam — must hand over a
    // whole truck (the damage model AND the rim signal the sparks and the grind read) and a map whose first frame is its
    // own world. Runs alone: SMOKE_STEPS=boot,newRun.
    const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
    const truck = () => js(`JSON.stringify({ wheel: +window.__damage.get('wheelRR').toFixed(2), tire: +window.__damage.get('tireRR').toFixed(2),
      flat: window.__damage.flat[3], collapsed: window.__damage.collapsed(3), rim: !!window.__vs.rimOnRoad?.[3],
      alert: document.getElementById('dmg-icon')?.classList.contains('on') ?? null,
      boltons: ['roofRack', 'bullBar', 'lightBar'].filter(k => !window.__parts.fitted(k).endsWith('None')).length, slots: window.__inv.slotCap() })`)
    const whole = s => { const t = JSON.parse(s); return !t.flat && !t.collapsed && !t.rim && !t.alert && t.wheel > 0 && t.tire > 0 && t.boltons === 0 && t.slots === 8 }
    // The map's first frame on open: show() then one render(). A sheet rebuilt in slices (a budget, not Infinity) blits
    // the bitmap it already holds until it is done, which after a world change is the last world's. The window's size is
    // held (_sizeStale), as a player's is: a resize wipes the bitmap, and headless the map's width moves between opens.
    const mapFirst = (held = true) => js(`(() => { const m = window.__map2d(), step = m._stepBackground; let budget = Infinity
      m._stepBackground = b => { budget = b; return step.call(m, b) }
      if (${held}) m._sizeStale = () => false
      try { m.show(); m.render() } finally { m._stepBackground = step; delete m._sizeStale; m.hide() }
      return budget === Infinity || m.__fresh === true })()`)
    // PERF-52: the loading screen's preload() may already have built the new world's sheet whole, so the first open
    // then blits it in slices. "Its own" = a whole build has run since the last _buildRoad (the world change).
    await js(`(() => { const m = window.__map2d(), build = m._buildRoad, step = m._stepBackground
      m._buildRoad = function () { m.__fresh = false; return build.apply(m, arguments) }
      m._stepBackground = function (b) { const r = step.apply(m, arguments); if (b === Infinity) m.__fresh = true; return r } })()`)
    const toMenu = async () => {
      for (let i = 0; i < 4 && await js('document.getElementById("pause-menu").style.display !== "flex"'); i++) { await tap('Escape'); await sleep(300) }
      await js('document.getElementById("pm-towel").click(); document.getElementById("tc-end").click()')
      check(await until(() => js('document.getElementById("run-end").style.display === "block"'), 5000), 'the give-up ended nothing')
      await js('document.getElementById("re-menu").click()')
      check(await until(() => js('document.getElementById("main-menu").style.display === "flex"'), 3000), 'no main menu after the give-up')
    }
    const wreck = async () => {
      await js('window.__settings.playedBefore = true')   // one hold skips (the confirmation is the story step's)
      await js('document.getElementById("pm-menu").click()')
      await js('document.getElementById("mm-new").click()')
      await js('document.getElementById("su-seed").value = "6"; document.getElementById("su-start").click()')
      check(await until(() => js(live), 45000, 250), 'the wrecked run never went live')
      await skipAndReadLarry()
      await js("['roofRack', 'bullBar', 'lightBar'].forEach(id => window.__parts.fit(id))")   // FEAT-204: bolt-ons die with the run
      await js(`window.__damage.set('tireRR', 0); window.__damage.set('wheelRR', 0); window.__damage.flat[3] = true
        document.getElementById('dmg-icon').classList.add('on')`)   // the damage alert, unread
      await simFor(0.5)
      check(await js('!!window.__vs.rimOnRoad?.[3]'), `the wreck is not on its rim: ${await truck()}`)
      await mapFirst(false)   // the map's sheet now holds this world
      await toMenu()
    }
    const newGame = async (seed) => {
      await js('document.getElementById("mm-new").click()')
      await js(`document.getElementById("su-seed").value = "${seed}"; document.getElementById("su-start").click()`)
    }
    const starts = {
      played: async () => {
        await newGame(7)
        check(await until(() => js(live), 45000, 250), 'played: the run never went live')
        for (let i = 0; i < 12 && !await js('document.getElementById("tut-card").style.display === "flex"'); i++) { await tap('Enter'); await sleep(250) }
        await js('document.getElementById("tc-play").click()')   // the tutorial seed loads (DEC-157)
        check(await until(async () => await js(live) && await js('document.getElementById("dlg-speaker").textContent') === 'Phone', 45000, 250), 'played: no mom\'s call on the tutorial seed (DEC-354: its ring)')
        for (let i = 0; i < 40 && await js('getComputedStyle(document.getElementById("dialogue-panel")).display !== "none"'); i++) { await tap('Enter'); await sleep(250) }
      },
      skipped: async () => { await newGame(7); check(await until(() => js(live), 45000, 250), 'skipped: the run never went live'); await skipAndReadLarry() },
      freeRoam: async () => {
        await js('document.getElementById("mm-new").click()')
        for (let i = 0; i < 4 && !/free roam/.test(await js('document.querySelector("[data-key=gameMode] .sel-val").textContent')); i++) await js('document.querySelector("[data-key=gameMode] .sel-next").click()')
        await js('document.getElementById("su-seed").value = "7"; document.getElementById("su-start").click()')
        check(await until(() => js('getComputedStyle(document.getElementById("main-menu")).display === "none" && !document.body.classList.contains("stage-on")'), 45000, 250), 'free roam never went live')
      },
    }
    for (const [name, start] of Object.entries(starts)) {
      await wreck()
      await start()
      await simFor(0.5)   // a step of the new run's own: a held step (the tutorial) publishes too
      const t = await truck(), map = await mapFirst()
      console.log(`  newRun ${name}: truck ${t} · map's first frame its own: ${map}`)
      check(whole(t), `${name}: the last run's wreck came along: ${t}`)
      check(map, `${name}: the map's first frame is the last world's sheet`)
    }
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
    await js('window.__settings.playedBefore = true')   // FEAT-184: one View hold skips (the confirmation is the story step's)
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
    // FEAT-184 (DEC-147): the firing ends on the card; the D-pad to "play", A — a random seed, so the tutorial seed loads
    // (DEC-157) and mom's call opens it.
    for (let i = 0; i < 12 && await js('document.getElementById("tut-card").style.display !== "flex"'); i++) { await btn(0); await sleep(150) }
    check(await js('document.getElementById("tut-card").style.display === "flex"'), 'the pad never reached the tutorial card')
    check(await navFocus() === 'tc-skip', `FEAT-289: the tutorial card does not open on skip (on "${await navFocus()}")`)
    await padTo('tc-play'); await btn(0)   // deliberately the tutorial: the D-pad steps down from skip
    check(await until(async () => await js(live) && await js('window.__worldCode().split("/")[0]') === TUTORIAL.seed && await dlg(), 60000, 250),
      `A on "play" did not load the tutorial seed with mom's call up: ${JSON.stringify(await js('window.__tutorial()'))}`)
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
      if ((!await dlg() || await js('window.__tutorial().until') === 'engine') && await js('window.__vs.ignition?.state !== "running"')) await hold(3, 2000)   // DEC-359: the key card waits for the key
      else { await btn(0); await sleep(150) }
    }
    const steerWords = () => js('[...document.querySelectorAll("#dlg-text > .kc-kb, #dlg-text > .kc-pad")].filter(e => getComputedStyle(e).display !== "none").map(e => e.textContent).join("|")')
    const onPad = await steerWords()
    await key('Shift', true); await frames(3, 80); await key('Shift', false); await frames(3, 80)
    const onKb = await steerWords()
    check(onPad === 'the left stick' && onKb === 'A and D', `the drive lesson does not name one input's steering, live: pad "${onPad}", keyboard "${onKb}"`)
    // A chosen tutorial asks once more (DEC-148): View held twice. The skip on the tutorial seed loads the run's own world back.
    await hold(8, 1400); await sleep(300); await hold(8, 1400)
    check(await until(async () => await skipDone() && await js(live), 60000, 250), `holding View did not skip the opening: ${await skipPeek()}`)
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
    // FEAT-184: the skip lands outside the run's own joint — the manager's check, then Larry's call, and A reads them off.
    check(await until(dlg, 5000), 'no manager\'s check after the View skip')
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
    // The map (View tap), FEAT-211's approved controls: the D-pad walks the Missions list to a giver (the map snaps to it
    // and its card shows), LB / RB page its offers (D-pad ← / → are spare), the first B leaves the list with the map still open, the second closes it.
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
    const lid = () => js('window.__map2d()._listId')
    await until(() => js('window.__map2d()._rows.length > 0'), 2000)
    for (let i = 0; i < 60 && await lid() !== giver.id; i++) await btn(13)
    check(await lid() === giver.id, `the D-pad never reached the giver in the Missions list (${await lid()} · rows ${await js('JSON.stringify(window.__map2d()._rows.map(r => r.id))')})`)
    const hov = () => js('window.__map2d()._hoverPoi === ' + JSON.stringify(giver.id) + ' && window.__map2d()._hoverIdx')
    check(await until(async () => await hov() === 0, 1000), `the list pick did not show the giver's card (${await js('window.__map2d()._hoverPoi')})`)
    // FEAT-239 (owner, 2026-11-16, DEC-337): the shoulders flip the cards as at a POI, D-pad ← / → bind nothing on the map.
    if (giver.n > 1) { await btn(5); check(await hov() === 1, 'RB did not page the giver\'s offers'); await btn(15); await btn(14); check(await hov() === 1, 'D-pad ← / → moved the map\'s card (they are spare)'); await btn(4); check(await hov() === 0, 'LB did not page back') }
    else console.log(`  pad: no plain giver with two offers in ${await js('window.__worldCode?.()')}; LB / RB paging unchecked this run`)
    await btn(15); await btn(14); check(await js('window.__map2d()._tab') === 'missions', 'D-pad ← / → switched the tab')
    await btn(1); check(await js('window.__map2d().isOpen() && window.__map2d()._listId === null'), 'the first B did not leave the list with the map still open')
    await btn(2); check(await js('window.__map2d()._tab') === 'shopping', 'X did not switch to the Shopping tab')
    await btn(4); await btn(5); check(await js('window.__map2d()._tab') === 'shopping', 'LB / RB switched the tab (they flip cards)')
    await btn(2); check(await js('window.__map2d()._tab') === 'missions', 'X did not switch back to Missions')
    await btn(1); check(await until(() => js('!window.__map2d().isOpen()'), 2000), 'the second B did not close the map')
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
