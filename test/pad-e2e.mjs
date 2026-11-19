// test/pad-e2e.mjs — FEAT-125 rainy-day script (NOT a gate): drives the REAL app with a scripted fake
// gamepad and checks the pad → vehicle contract (analog pedals, position steering + assist toggle,
// last-moved-wins, unplug safety, the Forza button layout incl. View tap/hold), then FEAT-41's menus
// pad-only: main menu → new game (the setup page: mode → free roam, Casual + manual) → start, Start →
// pause → settings, and the choices surviving a reload.
//
//   node test/pad-e2e.mjs [--port=3775] [--headed]     (no --port: starts its OWN Vite on a free port, like cdp-smoke;
//                                                      registered `browser: true` in gates.mjs, so run-all --browser runs it)
//
// The fake pad replaces navigator.getGamepads AFTER boot (gamepad.js looks it up every frame) and is
// driven through window.__fp. PAD_PARAMS is reached by importing the exact module URL the app loaded:
// after an edit Vite serves it as /src/gamepad.js?t=…, and a bare import would load a SECOND
// instance — whose own poll loop then double-fires every button.
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHROME, launchChrome, connect, sleep, keyEvent } from './lib/cdp.mjs'
if (!existsSync(CHROME)) { console.log(`SKIP (no Chrome at ${CHROME})`); process.exit(0) }
const freePort = () => new Promise(r => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const given = process.argv.find(a => a.startsWith('--port='))?.slice(7)
const PORT = given ?? await freePort()
const CDP = await freePort()
if (!given) {
  const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
  const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' })
  process.on('exit', () => { try { vite.kill() } catch {} })
}
const { cleanup } = launchChrome('about:blank', { port: CDP, headed: process.argv.includes('--headed') })
await sleep(1500)
const c = await connect({ port: CDP })
const errs = []
c.on('Runtime.exceptionThrown', (e) => errs.push(e.exceptionDetails.exception?.description))
c.on('Runtime.consoleAPICalled', (e) => e.type === 'error' && errs.push(e.args.map(a => a.value).join(' ')))
const js = async (e) => { const r = await c.evalJS(e); if (r.err) throw new Error(r.err); return r.val }
let fails = 0
const check = (ok, msg) => { console.log(ok ? '  ok  ' : '  FAIL', msg); if (!ok) fails++ }
await c.cmd('Page.navigate', { url: `http://localhost:${PORT}/index.html?nomenu=1&seed=6` })
for (let t = 0; t < 120 && !(await js('window.__rsReady === true')); t++) await sleep(250)
await js(`window.__fp = { on: true, axes: [0, 0, 0, 0], b: new Array(17).fill(0) }
  navigator.getGamepads = () => __fp.on ? [{ index: 0, id: 'fake', mapping: 'standard', axes: __fp.axes,
    buttons: __fp.b.map(v => ({ value: v, pressed: v > 0.5, touched: v > 0 })) }] : [null]`)
const vs = () => js('({ thr: __vs.throttle, brk: __vs.brake, steer: __vs.steerAngle, parked: __vs.parked, hb: __vs.handbrake, v: Math.hypot(__vs.velocity.x, __vs.velocity.z) })')

await js('__fp.b[7] = 0.4'); await sleep(500)
let s = await vs()
check(Math.abs(s.thr - (0.4 - 0.03) / 0.97) < 0.01, `partial RT 0.4 -> throttle ${s.thr.toFixed(3)} (want 0.381, unramped)`)
check(!s.parked, `trigger released the park latch (parked=${s.parked})`)

await js('__fp.b[7] = 1'); await sleep(3000)
await js('__fp.axes[0] = -1'); await sleep(600)
s = await vs()
const dyn = 0.52 / (1 + s.v / 15)
check(Math.abs(s.steer - dyn) < 0.03, `assist ON, full left stick at ${s.v.toFixed(1)} m/s -> steer ${s.steer.toFixed(3)} (want speed-scaled ${dyn.toFixed(3)})`)
await js('(async () => { const m = await import(performance.getEntriesByType("resource").map(r => r.name).find(n => n.includes("/src/gamepad.js"))); m.PAD_PARAMS.steerAssist = false })()'); await sleep(400)
s = await vs()
check(Math.abs(s.steer - 0.52) < 0.03, `assist OFF -> steer ${s.steer.toFixed(3)} (want full lock 0.52)`)
await js('(async () => { const m = await import(performance.getEntriesByType("resource").map(r => r.name).find(n => n.includes("/src/gamepad.js"))); m.PAD_PARAMS.steerAssist = true })()')
await js('__fp.axes[0] = 0.5'); await sleep(600)
s = await vs()
const dz = (0.5 - 0.08) / 0.92
check(Math.abs(s.steer + dz * 0.52 / (1 + s.v / 15)) < 0.03, `half right stick -> steer ${s.steer.toFixed(3)} (want ${(-dz * 0.52 / (1 + s.v / 15)).toFixed(3)})`)

// Keyboard takeover: a real W press while the pad is resting.
await js('__fp.axes[0] = 0; __fp.b[7] = 0'); await sleep(200)
// Rolling, unparked, nothing else up (free roam: no camp, no recovery): the park zone's icons are off
// the B menu (owner, 2026-10-21), so there is no menu — the PARK stencil pulses instead.
await js('__fp.b[1] = 1'); await sleep(200)
check(!await js('document.body.classList.contains("hud-menu-on")') && await js('document.querySelector("#park-zone .pz-badge").classList.contains("hint")'),
      'unparked, B held opens no menu (park-gated icons are not on it) and pulses PARK')
await js('__fp.b[1] = 0'); await sleep(200)
await keyEvent(c, 'w', true); await sleep(1500)
s = await vs(); check(s.thr > 0.95, `keyboard W takes over from a resting pad -> throttle ${s.thr.toFixed(2)}`)
await keyEvent(c, 'w', false); await sleep(300)

// Unplug with the trigger floored.
await js('__fp.b[7] = 1'); await sleep(500)
await js('__fp.on = false'); await sleep(300)
s = await vs(); check(s.thr === 0, `unplug with RT floored -> throttle ${s.thr} (want 0, no stick)`)

// Button replay: hold A = momentary handbrake, then a tap near rest latches park.
await js('__fp.b[7] = 0; __fp.on = true; __fp.b[5] = 1'); await sleep(300)
s = await vs(); check(s.hb, `RB held -> handbrake on (hb=${s.hb})`)
await js('__fp.b[5] = 0'); await sleep(200)
// D-pad → held 1 s = reset (DEC-362: View's hold no longer resets).
await js('__fp.b[15] = 1'); await sleep(1300); await js('__fp.b[15] = 0'); await sleep(2500)
s = await vs(); check(s.parked && s.v < 0.2, `D-pad → hold resets the truck, parked at rest (parked=${s.parked}, v=${s.v.toFixed(2)})`)
await js('__fp.b[5] = 1'); await sleep(150); await js('__fp.b[5] = 0'); await sleep(300)
s = await vs(); check(!s.parked, `RB tap while parked unlatches (parked=${s.parked})`)
await js('__fp.b[5] = 1'); await sleep(150); await js('__fp.b[5] = 0'); await sleep(300)
s = await vs(); check(s.parked, `RB tap near rest re-latches (parked=${s.parked}, v=${s.v.toFixed(2)})`)
// View tap -> map (M); a second tap closes it.
const mapShown = () => js('getComputedStyle(document.getElementById("map-window")).display !== "none"')
const mapBefore = await mapShown()
await js('__fp.b[8] = 1'); await sleep(200); await js('__fp.b[8] = 0'); await sleep(500)
check(!mapBefore && await mapShown(), `View tap opens the map (${mapBefore} -> ${await mapShown()})`)
await js('__fp.b[8] = 1'); await sleep(200); await js('__fp.b[8] = 0'); await sleep(500)
check(!await mapShown(), 'a second View tap closes it')
// FEAT-133: on the map the cursor stays at the centre, the left stick pans (FEAT-175), and LB / RB flip offers as the arrows, X is the tab (Q) — FEAT-239.
// The window spy registers before the map opens, so it sees keys ahead of the map's capture handler;
// the document spy sits where vehicle.js listens, so a stopped Q / E never reaches the gearbox.
await js(`window.__win = []; window.__doc = []
  window.addEventListener('keydown', e => __win.push(e.key), true); document.addEventListener('keydown', e => __doc.push(e.key))`)
await js('__fp.b[8] = 1'); await sleep(200); await js('__fp.b[8] = 0'); await sleep(500)
const mc = () => js('(() => { const m = __map2d(), s = m._sheet(); return { on: m._padCursor, x: m._hoverX, y: m._hoverY, cx: s.cx, cy: s.cy, x1: s.x1, px: m._panX } })()')
let m = await mc()
check(m.on && m.x === m.cx && m.y === m.cy, `pad cursor shows at the sheet centre (${m.on}, ${m.x?.toFixed(0)},${m.y?.toFixed(0)})`)
await js('__fp.axes[0] = 1'); await sleep(300)
const steerOnMap = (await vs()).steer
await js('__fp.axes[0] = 0'); await sleep(100)
const m2 = await mc()
check(m2.x === m2.cx && m2.y === m2.cy && m2.px > m.px && Math.abs(steerOnMap) < 1e-3, `left stick pans the map under a fixed cursor and steers nothing (pan +${(m2.px - m.px).toFixed(0)} m, steer ${steerOnMap})`)
await js('__win.length = 0; __doc.length = 0')   // drop the View tap's m
await js('__fp.b[4] = 1'); await sleep(150); await js('__fp.b[4] = 0'); await sleep(150)
await js('__fp.b[5] = 1'); await sleep(150); await js('__fp.b[5] = 0'); await sleep(150)
await js('__fp.b[2] = 1'); await sleep(150); await js('__fp.b[2] = 0'); await sleep(150)
await js('__fp.b[14] = 1'); await sleep(150); await js('__fp.b[14] = 0'); await sleep(150)
await js('__fp.b[0] = 1'); await sleep(150); await js('__fp.b[0] = 0'); await sleep(150)
const wk = await js('__win.join()'), dk = await js('__doc.join()')
check(wk === 'ArrowLeft,ArrowRight,q,Enter', `LB / RB send the arrows, X sends Q, D-pad ← sends nothing and A sends Enter on the map (window saw "${wk}")`)
check(!/\b[qe]\b/.test(dk), `Q / E stop at the map, never reaching the gearbox (document saw "${dk}")`)
check(await js('__map2d()._tab') === 'shopping', 'X swaps the list to Shopping; LB / RB leave the tab alone')
await js('__fp.b[2] = 1'); await sleep(150); await js('__fp.b[2] = 0'); await sleep(150)   // back to Missions for the steps below
check(await js('__map2d()._tab') === 'missions', 'X again swaps back to Missions')
// FEAT-211: the Missions list on the pad. Free roam has no board, so two places with work are stubbed onto the map:
// D-pad ↓ lands on the nearest and the map snaps there (tracking let go), ↓ again walks to the next, B leaves the list
// with the map still open and where it was, the left stick's click puts it back on the truck, tracking.
await js(`(() => { const m = __map2d(), c = __car(); window.__mapStub = [m._getPois, m._getBoard]
  m._getPois = () => [{ id: 'near', type: 'gasPump', x: c.x + 300, z: c.z }, { id: 'far', type: 'foodVendor', x: c.x - 700, z: c.z + 100 }]
  m._getBoard = () => ({ status: () => ({ source: true, families: ['delivery'], nextText: null }), view: () => null, name: (id) => id,
    shop: (q, open) => q.id === 'near' ? { price: '$3.00/gal', next: null, opens: false, items: null }
      : { price: null, next: 'new stock in 2 h', opens: true, items: open ? [{ name: 'Old tire', price: '$20.00', cond: 0.5, color: '#888', left: 'gone in 5 h', desc: 'Flavour.' },
                                                                          { name: 'Coffee', price: '$3.00', cond: null, color: null, left: 'always in stock', desc: 'Hot.' }] : null } })
  m._listT = 0 })()`)
await sleep(400)
const ls = () => js('(() => { const m = __map2d(), c = __car(); return { id: m._listId, tr: m._tracking, dx: m._panX - c.x, dz: m._panZ - c.z, open: m.isOpen(), html: document.getElementById("map-list").textContent } })()')
await js('__fp.b[13] = 1'); await sleep(150); await js('__fp.b[13] = 0'); await sleep(300)
let l = await ls()
check(l.id === 'near' && !l.tr && Math.abs(l.dx - 300) < 1 && Math.abs(l.dz) < 1 && /Near/.test(l.html), `D-pad ↓ picks the nearest row and snaps the map to it (${l.id}, pan +${l.dx.toFixed(0)},${l.dz.toFixed(0)}, tracking ${l.tr})`)
await js('__fp.b[13] = 1'); await sleep(150); await js('__fp.b[13] = 0'); await sleep(300)
l = await ls(); check(l.id === 'far' && Math.abs(l.dx + 700) < 1, `D-pad ↓ again walks to the next row (${l.id}, pan ${l.dx.toFixed(0)})`)
await js('__fp.b[1] = 1'); await sleep(150); await js('__fp.b[1] = 0'); await sleep(300)
l = await ls(); check(l.open && l.id === null && Math.abs(l.dx + 700) < 1, `B leaves the list: the map stays open where it was (open ${l.open}, row ${l.id}, pan ${l.dx.toFixed(0)})`)
await js('__fp.b[10] = 1'); await sleep(150); await js('__fp.b[10] = 0'); await sleep(300)
l = await ls(); check(l.tr && Math.hypot(l.dx, l.dz) < 1, `the left stick click centres the map on the truck and tracks it (tracking ${l.tr}, off ${Math.hypot(l.dx, l.dz).toFixed(1)} m)`)
// FEAT-211 landing 2: the Shopping list on the pad. RB swaps to it; the stub's 'near' is a pump (a price, nothing to open),
// 'far' a shop: A opens its two items in line, the D-pad walks onto them, B closes the shop (the highlight back on it),
// B again leaves the list, LB swaps back to Missions.
const btnS = async (b) => { await js(`__fp.b[${b}] = 1`); await sleep(150); await js(`__fp.b[${b}] = 0`); await sleep(350) }
const ss = () => js('(() => { const m = __map2d(); return { tab: m._tab, id: m._listId, open: m._openShop, open2: m.isOpen(), rows: m._rows.map(r => r.id).join(), html: document.getElementById("map-list").textContent } })()')
await btnS(2); let sh = await ss()
check(sh.tab === 'shopping' && /3\.00\/gal/.test(sh.html) && /new stock in 2 h/.test(sh.html), `X swaps to the Shopping list: the pump's price, the shop's stock timer (${sh.tab}: "${sh.html}")`)
await btnS(13); await btnS(0); sh = await ss()
check(sh.id === 'near' && sh.open === null && sh.rows === 'near,far', `A on a pump opens nothing (${sh.id}, open ${sh.open}, rows ${sh.rows})`)
await btnS(13); await btnS(0); sh = await ss()
check(sh.open === 'far' && sh.rows === 'near,far,far#0,far#1' && /Old tire\$20\.00/.test(sh.html) && /gone in 5 h/.test(sh.html) && /always in stock/.test(sh.html),
  `A on a shop opens its items in line (rows ${sh.rows}: "${sh.html}")`)
await btnS(13); sh = await ss(); check(sh.id === 'far#0', `the D-pad walks onto the open shop's items (${sh.id})`)
await btnS(1); sh = await ss()
check(sh.open === null && sh.id === 'far' && sh.rows === 'near,far' && sh.open2, `the first B closes the shop, its header highlighted, the map open (${sh.id}, rows ${sh.rows})`)
await btnS(13); await btnS(13); await btnS(0); await btnS(0); sh = await ss()
check(sh.id === 'far' && sh.open === null, `A on the open shop's header again closes it (${sh.id}, open ${sh.open})`)
await btnS(1); sh = await ss(); check(sh.id === null && sh.open2, `the next B leaves the list, the map still open (${sh.id})`)
await btnS(2); sh = await ss(); check(sh.tab === 'missions', `X swaps back to Missions (${sh.tab})`)
// FEAT-211 landing 3: the waypoint on the pad. Free roam has no run, so main.js's side is stubbed (it records the drop and
// says yes). Y sends n and drops it at the pad cursor (the sheet centre) without touching the ignition; Y again, on the pin,
// clears it. DEC-319 / FEAT-234: A (and Enter) no longer drop it; A on a highlighted shop still opens the shop.
await js(`(() => { const m = __map2d(); window.__wpStub = [m._getWaypoint, m._onWaypoint]; window.__wp = { at: null, calls: 0 }
  m._getWaypoint = () => __wp.at && { ...__wp.at, poly: null }
  m._onWaypoint = (p) => { __wp.calls++; __wp.at = p; return true } })()`)
const wp = () => js('(() => { const m = __map2d(); return { at: __wp.at, calls: __wp.calls, px: m._panX, pz: m._panZ, ign: __vs.ignition.state, win: __win.join() } })()')
await js('__win.length = 0')
const ign0 = await js('__vs.ignition.state')
await js('__fp.b[3] = 1'); await sleep(1500); await js('__fp.b[3] = 0'); await sleep(300)   // held past any ignition hold
let wq = await wp()
check(wq.win === 'n' && wq.calls === 1 && Math.abs(wq.at?.x - wq.px) < 0.5 && Math.abs(wq.at?.z - wq.pz) < 0.5 && wq.ign === ign0,
  `Y sends n: a waypoint at the sheet centre (${wq.at?.x.toFixed(0)},${wq.at?.z.toFixed(0)} vs ${wq.px.toFixed(0)},${wq.pz.toFixed(0)}), ignition untouched (${ign0} → ${wq.ign}; window saw "${wq.win}")`)
await btnS(3); wq = await wp(); check(wq.calls === 2 && wq.at === null, `Y on the pin clears it (calls ${wq.calls}, at ${JSON.stringify(wq.at)})`)
await btnS(0); wq = await wp(); check(wq.calls === 2 && wq.at === null, `DEC-319: A with nothing highlighted drops nothing (calls ${wq.calls})`)
await btnS(2); await btnS(13); await btnS(13); await btnS(0); sh = await ss(); wq = await wp()
check(sh.open === 'far' && wq.calls === 2, `A on a highlighted shop opens the shop and drops nothing (open ${sh.open}, calls ${wq.calls})`)
await btnS(1); await btnS(1); await btnS(2)
await js('(() => { const m = __map2d(); [m._getWaypoint, m._onWaypoint] = __wpStub })()')
await js('(() => { const m = __map2d(); [m._getPois, m._getBoard] = __mapStub; m._listT = 0 })()')
// FEAT-175: the right stick's vertical zooms about the cursor (up in, down out); the triggers stay the pedals and
// zoom nothing; the camera does not orbit behind the map.
const zm = () => js('__map2d()._zoom'), camXZ = () => js('(() => { const p = __cam().position; return [p.x, p.z] })()')
const z0 = await zm(), c0 = await camXZ()
await js('__fp.axes[3] = -1'); await sleep(400); await js('__fp.axes[3] = 0'); await sleep(100)
const z1 = await zm()
await js('__fp.axes[3] = 1'); await sleep(400); await js('__fp.axes[3] = 0'); await sleep(100)
const z2 = await zm()
check(z1 > z0 * 1.5 && z2 < z1 / 1.5, `right stick up zooms in, down out (${z0.toFixed(3)} → ${z1.toFixed(3)} → ${z2.toFixed(3)})`)
await js('__fp.axes[2] = -1'); await sleep(600); await js('__fp.axes[2] = 0'); await sleep(100)
const c1 = await camXZ()
check(Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) < 0.5, `the right stick does not orbit the camera behind the map (moved ${Math.hypot(c1[0] - c0[0], c1[1] - c0[1]).toFixed(2)} m)`)
// Last: RT is still the throttle on the map, but the map was opened at rest, so the park lock holds the truck
// (FEAT-194 part 2): the latch stays set and the handbrake on.
await js('__fp.b[7] = 0.5'); await sleep(300)
const onMap = await vs(), z3 = await zm()
await js('__fp.b[7] = 0'); await sleep(100)
check(onMap.thr > 0 && z3 === z2, `RT is still the throttle on the map and zooms nothing (thr ${onMap.thr}, zoom ${z2.toFixed(3)} → ${z3.toFixed(3)})`)
check(onMap.parked && onMap.hb && onMap.v < 0.3, `FEAT-194: RT on a map opened at rest does not release the parking brake (parked=${onMap.parked}, hb=${onMap.hb}, v=${onMap.v.toFixed(2)})`)
await js('__fp.b[8] = 1'); await sleep(200); await js('__fp.b[8] = 0'); await sleep(500)
check(!await mapShown(), 'View closes the map again')
// B is the general back (owner, 2026-10-20): it closes the map too.
await js('__fp.b[8] = 1'); await sleep(200); await js('__fp.b[8] = 0'); await sleep(500)
await js('__fp.b[1] = 1'); await sleep(150); await js('__fp.b[1] = 0'); await sleep(300)
check(!await mapShown(), 'B closes the map')
// D-pad → held resets the truck, parked at rest, as the checks below found it.
await js('__fp.b[15] = 1'); await sleep(1300); await js('__fp.b[15] = 0'); await sleep(2500)
s = await vs(); check(s.parked && s.v < 0.2, `after the map, D-pad → held puts the truck back parked at rest (parked=${s.parked}, v=${s.v.toFixed(2)})`)
// Right stick = orbit RATE. Stopped, the view LINGERS where it was pointed (owner, 2026-10-20) until a
// pedal is pressed; then the chase swings back behind.
// Bearing of the camera around the truck, relative to directly behind it (deg).
const off = () => js(`(() => { const c = __cam().position, p = __vs.position, q = __vs.quaternion
  const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y))   // body -Z in world
  const cb = Math.atan2(c.x - p.x, c.z - p.z), behind = Math.atan2(-fx, -fz)
  return Math.atan2(Math.sin(cb - behind), Math.cos(cb - behind)) * 180 / Math.PI })()`)
await js('__fp.axes[2] = 1'); await sleep(600); await js('__fp.axes[2] = 0')
const o1 = await off(); check(Math.abs(o1) > 45, `0.6 s full right stick orbits the view (${o1.toFixed(0)} deg off behind)`)
await sleep(1500); const o2 = await off(); check(Math.abs(o2 - o1) < 3, `1.5 s after release it HOLDS (${o2.toFixed(0)} deg)`)
await sleep(2500); const o3 = await off(); check(Math.abs(o3 - o1) < 3, `stopped, ~4 s after release it still lingers (${o3.toFixed(0)} deg)`)
// FEAT-194 part 1 + DEC-255: on the AUTOMATIC (this truck) LT at rest is the reverse pedal and releases the park
// latch like gas (the manual keeps it a pure brake: test/park-brake.mjs). The LT hold backs the truck out, so the
// D-pad → hold below puts it back parked at rest for the checks after.
await js('__fp.b[6] = 0.6'); await sleep(150); await js('__fp.b[6] = 0'); await sleep(100)
check(!(await vs()).parked, 'DEC-255: an LT tap while parked on the automatic releases the parking brake (reverse pedal)')
await js('__fp.b[6] = 0.6'); await sleep(1500); await js('__fp.b[6] = 0'); await sleep(100)
check(!(await vs()).parked, 'DEC-255: LT held 1.5 s on the automatic keeps it released (backing out)')
await sleep(2000); const o4 = await off(); check(Math.abs(Math.abs(o4) - 180) < 15, `a brake pull from a stop (automatic: reverse, DEC-255) swings the view round to the front, camera.js reverseView (${o4.toFixed(0)} deg)`)
await js('__fp.b[15] = 1'); await sleep(1300); await js('__fp.b[15] = 0'); await sleep(2500)   // D-pad → hold: parked at rest again
s = await vs(); check(s.parked && s.v < 0.2, `D-pad → hold re-parks the truck at rest after the reverse (parked=${s.parked}, v=${s.v.toFixed(2)})`)
// B no longer aims (owner, 2026-10-21): held in the drive layout it is the icon menu. Off a route the
// pad has no practice throw now; on one, the right stick aims and RB taps (checked below).
const reticle = () => js('getComputedStyle(document.getElementById("aim-reticle")).display !== "none"')
const menuOn = () => js('document.body.classList.contains("hud-menu-on")')
await js('__fp.b[1] = 1'); await sleep(400)
const aimed = await reticle(), lit = await menuOn()
await js('__fp.b[1] = 0'); await sleep(300)
check(!aimed && lit && !await menuOn(), `B held lights the icon menu, not the aim reticle (reticle ${aimed}, menu ${lit}); release drops it`)
await js('document.querySelector("#inv-screen.open") && document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }))')
await sleep(300)
// FEAT-133 RB split while aiming on a route (throwReady forced on — a route needs a whole story run):
// a tap under throwTapMs throws (F down + up) and sends no Space; a hold becomes Space (handbrake).
// Spied at key level: the truck sits parked on a slope here, and parked reads as handbrake on.
await js(`(async () => { const m = await import(performance.getEntriesByType("resource").map(r => r.name).find(n => n.includes("/src/gamepad.js")))
  window.__padMod = m; window.__tr0 = m.pad.throwReady; m.pad.throwReady = () => true
  window.__fk = 0; window.__sk = 0
  window.addEventListener('keydown', e => { if (e.key === 'f') __fk++; if (e.key === ' ') __sk++ }, true) })()`)
await sleep(200)
await js('__fp.b[5] = 1'); await sleep(100); await js('__fp.b[5] = 0'); await sleep(200)
check(await js('__fk') === 1 && await js('__sk') === 0, `aiming: RB tap throws (F ${await js('__fk')}x), no handbrake blip (Space ${await js('__sk')}x)`)
await js('__fp.b[5] = 1'); await sleep(400)
const hbHold = (await vs()).hb
await js('__fp.b[5] = 0; __padMod.pad.throwReady = __tr0'); await sleep(60)
check(hbHold && await js('__sk') === 1 && await js('__fk') === 1, `aiming: RB held past the tap is the handbrake, no throw (Space ${await js('__sk')}x, F ${await js('__fk')}x)`)
// The hold's Space edge released the park latch; tap straight back in before the slope rolls it.
await js('__fp.b[5] = 1'); await sleep(100); await js('__fp.b[5] = 0'); await sleep(300)
check((await vs()).parked, 'a plain RB tap re-parks it')
// BUG-193: LB held while the map layout is up (forced), then back to drive with LB still down — the clutch (Shift) engages.
await js('window.__shk = 0; window.addEventListener("keydown", e => { if (e.key === "Shift") __shk++ }, true); window.__ma0 = __padMod.pad.mapActive; __padMod.pad.mapActive = () => true')
await js('__fp.b[4] = 1'); await sleep(200)
const shMap = await js('__shk')
await js('__padMod.pad.mapActive = __ma0'); await sleep(200)
check(shMap === 0 && await js('__shk') === 1, `LB held through the map's close: clutch down on the close (Shift in map ${shMap}x, after ${await js('__shk')}x)`)
await js('__fp.b[4] = 0'); await sleep(150)
// FEAT-255: a pad press ends hover; only a real mouse move gives it back.
await js('__fp.b[13] = 1'); await sleep(100); await js('__fp.b[13] = 0'); await sleep(100)
const mlPad = await js('__padMod.pad.mouseLive')
await c.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300, y: 300 }); await c.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 340, y: 320 }); await sleep(150)
check(mlPad === false && await js('__padMod.pad.mouseLive') === true, `pad input sets pad mode (mouseLive ${mlPad}); a mouse move ends it (${await js('__padMod.pad.mouseLive')})`)
// The pump has A (owner, 2026-10-21): while it is open (pumpActive forced), A is F held, not the upshift.
// Off the pump F also aims a practice throw, so let that view hold run out after.
await js('window.__pa0 = __padMod.pad.pumpActive; __padMod.pad.pumpActive = () => true; __fk = 0')
await js('__fp.b[0] = 1'); await sleep(150); await js('__fp.b[0] = 0'); await sleep(150)
await js('__padMod.pad.pumpActive = __pa0')
check(await js('__fk') === 1, `pump open: A sends F (${await js('__fk')}x)`)
await sleep(4000)
// The icon menu (owner, 2026-10-21): hold B, the column lights with a pick; D-pad ↑/↓ under B walks
// it; releasing B opens the pick. Parked here, so the inventory opens.
const inv = () => js(`!!document.querySelector("#inv-screen.open")`)
const pick = () => js('document.querySelector("#hud-icons .menu-sel")?.id ?? null')
const before = await inv()
await js('__fp.b[1] = 1'); await sleep(200)
const tag = () => js('document.getElementById("hud-menu-label").textContent')
check(await menuOn() && await pick() === 'inv-icon' && await tag() === 'inventory', `B held: icon menu up on the inventory, named (${await pick()} · ${await tag()})`)
await js('__fp.b[13] = 1'); await sleep(150); await js('__fp.b[13] = 0'); await sleep(150)
check(await pick() === 'dmg-icon' && await tag() === 'vehicle condition', `D-pad down under B walks to the damage icon, the label follows (${await pick()} · ${await tag()})`)
await js('__fp.b[12] = 1'); await sleep(150); await js('__fp.b[12] = 0'); await sleep(150)
// FEAT-254: the left stick walks the B menu too, one step per deflection.
await js('__fp.axes[1] = 1'); await sleep(200); await js('__fp.axes[1] = 0'); await sleep(150)
const stDown = await pick()
await js('__fp.axes[1] = -1'); await sleep(200); await js('__fp.axes[1] = 0'); await sleep(150)
check(stDown === 'dmg-icon' && await pick() === 'inv-icon', `left stick down / up under B walks the icon menu (${stDown} then ${await pick()})`)
await js('__fp.b[1] = 0'); await sleep(500)
check(!before && await inv() && !await menuOn(), `releasing B opens the pick, the inventory (${before} -> ${await inv()})`)
// FEAT-133: a card — the D-pad moves a highlight over it (first press places it), B backs out.
await js('__fp.b[15] = 1'); await sleep(150); await js('__fp.b[15] = 0'); await sleep(150)
await js('__fp.b[15] = 1'); await sleep(150); await js('__fp.b[15] = 0'); await sleep(150)
check(await js('!!document.querySelector("#inv-screen .nav-focus")') && await inv(), 'D-pad highlights inside the inventory and does not close it')
await js('__fp.b[1] = 1'); await sleep(150); await js('__fp.b[1] = 0'); await sleep(300)
check(!await inv() && !await menuOn(), 'B closes the inventory, and that back never opens the icon menu')
await js('__fp.b[1] = 1'); await sleep(100); await js('__fp.b[1] = 0'); await sleep(500)
check(await inv(), 'a B tap opens the top pick (the inventory)')
// FEAT-196: on the damage diagram the D-pad walks each axle inside out — damper, spring, body, brake, tire, wheel —
// the front tire included (a tire and its wheel share a centre, so the nearest-item step never reached one of them).
await js('__fp.b[1] = 1'); await sleep(150); await js('__fp.b[1] = 0'); await sleep(300)   // B closes the inventory
await js('document.getElementById("dmg-icon").click()'); await sleep(300)
const walk = async (track, side, dir, n) => {
  await js('__padMod.pad.mouseLive = true')   // FEAT-255: the synthetic pointerover below stands for a real mouse move
  await js(`document.querySelectorAll('#dmg-screen .ds-part[data-track="${track}"]')[${side}].dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))`)
  const seen = []
  for (let k = 0; k < n; k++) {
    await js(`__fp.b[${dir}] = 1`); await sleep(120); await js(`__fp.b[${dir}] = 0`); await sleep(200)
    seen.push(await js('document.querySelector("#dmg-screen .nav-focus")?.dataset.track ?? null'))
  }
  return seen.join(' ')
}
let w = await walk('damperFront', 0, 14, 5)
check(w === 'springFront armorLeft brakeFront tireFL wheelFL', `front left, D-pad ←: ${w}`)
w = await walk('damperRear', 0, 14, 5)
check(w === 'springRear armorLeft brakeRear tireRL wheelRL', `rear left, D-pad ← (the body side stays on this axle): ${w}`)
w = await walk('damperFront', 1, 15, 5)
check(w === 'springFront armorRight brakeFront tireFR wheelFR', `front right, D-pad →: ${w}`)
await js('__fp.b[1] = 1'); await sleep(150); await js('__fp.b[1] = 0'); await sleep(300)
check(!await js('document.getElementById("dmg-screen").classList.contains("open")'), 'B closes the damage screen')
// FEAT-288 P2: the tutorial gate (src/tut-gate.js) under the flat's card (data/dialogue.js tut-flat, V's lesson). A free-roam
// page has no tutorial, so the gate is handed that card as its step, on the app's own module instances: B held offers the
// damage screen ALONE (ringed, the inventory dimmed), the D-pad cannot walk off it, release opens it; the step gone, the
// whole menu is back.
const mod = (path) => `await import(performance.getEntriesByType("resource").map(r => r.name).find(n => n.includes("${path}")))`
await js(`(async () => { const g = ${mod('/src/tut-gate.js')}, d = ${mod('/data/dialogue.js')}
  window.__tutStep = d.TUT['tut-flat'][0]; g.initTutGate(() => window.__tutStep) })()`)
await sleep(300)
await js('__fp.b[1] = 1'); await sleep(250)
const flatPick = await pick(), flatSolo = await js('document.getElementById("hud-menu-label").classList.contains("solo")')
await js('__fp.b[13] = 1'); await sleep(150); await js('__fp.b[13] = 0'); await sleep(150)
const flatWalk = await pick(), marks = await js('({ hi: document.getElementById("dmg-icon").classList.contains("tut-hi"), locked: document.getElementById("inv-icon").classList.contains("tut-locked") })')
await js('__fp.b[1] = 0'); await sleep(500)
check(flatPick === 'dmg-icon' && flatSolo && flatWalk === 'dmg-icon' && marks.hi && marks.locked,
  `FEAT-288: the flat's card — B held offers the damage screen alone (${flatPick}, solo ${flatSolo}), D-pad ↓ stays (${flatWalk}), ringed / inventory dimmed ${JSON.stringify(marks)}`)
check(await js('document.getElementById("dmg-screen").classList.contains("open")') && !await inv(), 'FEAT-288: releasing B opens the one entry, the damage screen; the inventory stays shut')
await js('__fp.b[1] = 1'); await sleep(150); await js('__fp.b[1] = 0'); await sleep(300)   // B closes it
await js('window.__tutStep = null'); await sleep(300)
await js('__fp.b[1] = 1'); await sleep(250)
const freePick = await pick(), freeMarks = await js('document.querySelectorAll(".tut-hi, .tut-locked").length')
await js('__fp.b[1] = 0'); await sleep(500)
if (await inv()) { await js('__fp.b[1] = 1'); await sleep(150); await js('__fp.b[1] = 0'); await sleep(300) }
check(freePick === 'inv-icon' && freeMarks === 0, `FEAT-288: the step gone, the whole menu is back on its top pick (${freePick}) and no mark is left (${freeMarks})`)
// FEAT-126 manual gearbox through the pad: A up, X down, LB clutch. Swapped in the way the debug
// selector does it, on the app's own module instances.
const appMod = (path) => `await import(performance.getEntriesByType("resource").map(r => r.name).find(n => n.includes("${path}")))`
await js(`(async () => { const R = (${appMod('/data/ranger.js')}).RANGER_PARAMS, T = (${appMod('/data/transmissions.js')}).TRANSMISSIONS
  Object.assign(R, T.m5odr1); Object.assign(__vs.drivetrain, { mGear: 0, shiftT: 0, locked: false }); window.__R = R })()`)
await sleep(300)
await js('document.querySelector("#inv-screen.open") && document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }))')
await js('__fp.b[5] = 1'); await sleep(150); await js('__fp.b[5] = 0'); await sleep(300)   // RB: release the park latch
const gear = () => js('__vs.drivetrain.mGear')
await js('__fp.b[0] = 1'); await sleep(120); await js('__fp.b[0] = 0'); await sleep(600)
check(await gear() === 1, `manual, assist ON: A alone shifts N → 1 (gear ${await gear()})`)
// Since BUG-141's free-roam seat (968cd1a4) seed 6 parks the truck on an up-grade: the RB release lets it roll BACK,
// ~1 m/s by the time RT goes down, and RT then reaches ~2.9 m/s forward in 2.5 s (on the old flat seat it was 9.7 m/s,
// and `|v| > 3` passed with room). So read the FORWARD speed (body −Z), not |v| — a clutch that never bit rolls back
// past 3 m/s and would pass a magnitude check — and time it in SIM seconds (INFRA-08: under load the sim runs slow).
// Healthy: about −1 → +3 m/s in 2.5 sim-s; 2 m/s leaves ~0.6 s of launch as margin.
const fwd = () => js(`(() => { const q = __vs.quaternion, v = __vs.velocity
  return -(v.x * 2 * (q.x * q.z + q.w * q.y) + v.y * 2 * (q.y * q.z - q.w * q.x) + v.z * (1 - 2 * (q.x * q.x + q.y * q.y))) })()`)
const vf0 = await fwd()
await js('__fp.b[7] = 0.6')
{ const t0 = await js('__simT()'), w0 = Date.now(); while (await js('__simT()') - t0 < 2.5 && Date.now() - w0 < 15000) await sleep(50) }
const vf = await fwd()
check(vf > 2 && (await js('__vs.ignition.state')) === 'running', `RT launches it on the assist (${vf0.toFixed(1)} → ${vf.toFixed(1)} m/s forward in 2.5 sim-s, no stall)`)
await js('__R.clutchAssist = false')
await js('__fp.b[0] = 1'); await sleep(120); await js('__fp.b[0] = 0'); await sleep(600)
check(await gear() === 1, `assist OFF: A without LB is rejected (gear ${await gear()})`)
check(await js('document.getElementById("dmg-icon").classList.contains("on")'),
      'the missed shift raises the damage alert (icon lit)')
await js('__fp.b[4] = 1'); await sleep(200); await js('__fp.b[0] = 1'); await sleep(120); await js('__fp.b[0] = 0'); await sleep(600); await js('__fp.b[4] = 0')
check(await gear() === 2, `assist OFF: LB + A shifts 1 → 2 (gear ${await gear()})`)
await js('__fp.b[7] = 0; __R.clutchAssist = true')

// ── FEAT-41: the menus, pad only ────────────────────────────────────────────────────────────────
const fakePad = `window.__fp = { on: true, axes: [0, 0, 0, 0], b: new Array(17).fill(0) }
  navigator.getGamepads = () => __fp.on ? [{ index: 0, id: 'fake', mapping: 'standard', axes: __fp.axes,
    buttons: __fp.b.map(v => ({ value: v, pressed: v > 0.5, touched: v > 0 })) }] : [null]`
const press = async (i, n = 1) => { for (let k = 0; k < n; k++) { await js(`__fp.b[${i}] = 1`); await sleep(120); await js(`__fp.b[${i}] = 0`); await sleep(220) } }
const A = 0, B = 1, START = 9, UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15
const navText = () => js('document.querySelector(".nav-focus")?.textContent ?? null')
const selVal = (key) => js(`document.querySelector('#mm-setup-panel .mm-sel[data-key="${key}"] .sel-val').textContent`)
await c.cmd('Page.navigate', { url: `http://localhost:${PORT}/index.html` })
// Wait out worldgen: a main thread stalled past NAV_DELAY_MS with a button down reads as a held
// (repeating) press, which is right for a player and noise for a scripted single press.
for (let t = 0; t < 160 && !(await js('window.__rsReady === true')); t++) await sleep(250)
await sleep(500)
await js(fakePad)
// FEAT-156 + DEC-160: the menu is new game / settings (the tutorial button retired), and it opens with new game highlighted.
await press(DOWN)
// DEC-160: the menu's tutorial button retired with the intro card, so the list is new game / settings.
check(await navText() === 'settings', `the menu opens on new game: D-pad down reaches settings (${await navText()})`)
await press(UP)
check(await navText() === 'new game', `up returns to new game (${await navText()})`)
await press(A)
check(await js('document.getElementById("main-menu").classList.contains("setup")'), 'A opens the run setup page')
check(await js('!document.querySelector("#mm-setup-panel [data-key=steerAssist]")'), 'no assist rows on the setup page (they are settings)')
check(await navText() === 'start', `the setup page opens on start, its default (${await navText()})`)
await press(DOWN, 2); await press(RIGHT, 2)   // past back to the mode row: story → scenarios → free roam
check((await selVal('gameMode')).includes('free roam'), `mode ▸▸ → free roam (${await selVal('gameMode')})`)
await press(DOWN); await press(LEFT)
check((await selVal('worldPreset')).includes('casual'), `difficulty ◂ → casual (${await selVal('worldPreset')})`)
const codeLine = () => js('document.getElementById("su-code").textContent')
await press(DOWN); await press(RIGHT)   // terrain relief 80 → 90 %
check((await selVal('worldPreset')).includes('custom') && await codeLine() === 'world code: random/T90P80R290',
      `one terrain notch off Casual reads custom, code spelled out (${await selVal('worldPreset')} · ${await codeLine()})`)
await press(LEFT)
check((await selVal('worldPreset')).includes('casual') && await codeLine() === 'world code: random/C', `back to 80 % is Casual again (${await codeLine()})`)
await press(DOWN, 3); await press(RIGHT)   // past POI spacing and road climbs to the gearbox
check((await selVal('gearbox')).includes('manual'), `gearbox ▸ → manual (${await selVal('gearbox')})`)
check(await js('document.getElementById("su-code").textContent') === 'world code: random/C', `code line follows (${await js('document.getElementById("su-code").textContent')})`)
await press(UP, 8)   // back up past the knobs, the mode row and back (up meets one more stop than down)
check(await navText() === 'start', `D-pad up returns to start at the top (${await navText()})`)
await press(A)
let live = false
for (let t = 0; t < 240 && !(live = await js('!document.body.classList.contains("stage-on") && window.__rsReady === true')); t++) await sleep(250)
check(live, 'A on start builds the world and drops the stage')
await js(`(async () => { const R = (${appMod('/data/ranger.js')}).RANGER_PARAMS; window.__o = { amp: R.coarseAmplitude, box: R.transmission, wG: R.roadV2.wGrade } })()`)
await sleep(200)
const R = await js('window.__o')
check(R.amp === 120 && R.wG === 290 && R.box === 'm5odr1', `casual + manual applied (coarse ${R.amp}, wGrade ${R.wG}, box ${R.box})`)
const saved = await js('localStorage.getItem("autos-settings/1")')
check(saved && JSON.parse(saved).worldTerrain === 80 && JSON.parse(saved).worldRoads === 290 && JSON.parse(saved).gearbox === 'manual', `saved: ${saved}`)
// Start = pause; the pad then walks the pause list into settings and flips the steering assist.
const shown = (id) => js(`getComputedStyle(document.getElementById("${id}")).display !== "none"`)
await press(START)
check(await shown('pause-menu'), 'Start pauses')
await press(DOWN, 3)   // the pause list opens on resume (no placing press any more)
check(await navText() === 'settings', `pause list: down ×3 from resume reaches settings (${await navText()})`)
await press(A)
check(await shown('mm-settings-panel'), 'A opens settings inside the pause box')
check(await js('!document.querySelector("#mm-settings-panel [data-key=gearbox]")'), 'no gearbox row in the in-game settings (pre-game only)')
check(!await js('document.querySelector("#mm-settings-panel [data-key=steerShape]").offsetParent'), 'center softening is hidden while the steering assist is on')
await press(RIGHT)   // settings opens on its first row, the steering assist
await js(`(async () => { window.__o = (${appMod('/src/gamepad.js')}).PAD_PARAMS.steerAssist })()`)
await sleep(200)
const pp = await js('window.__o')
check(pp === false && JSON.parse(await js('localStorage.getItem("autos-settings/1")')).steerAssist === false, `steering assist → off, live and saved (${pp})`)
await press(DOWN); await press(RIGHT, 2)   // assist off revealed center softening: 0 → 20 %
await js(`(async () => { window.__o = (${appMod('/src/gamepad.js')}).PAD_PARAMS.steerShape })()`)
await sleep(200)
const shape = await js('window.__o')
check(shape === 0.2 && JSON.parse(await js('localStorage.getItem("autos-settings/1")')).steerShape === 0.2, `center softening → 20 %, live and saved (${shape})`)
await press(LEFT, 4)
check((await js(`document.querySelector('#mm-settings-panel [data-key="steerShape"] .sel-val').textContent`)).includes('0 %'), 'the slider stops at 0 %, never wraps')
await press(DOWN, 5); await press(RIGHT)   // past clutch assist, ABS, throttle assist and traction control to the stick deadzone: 8 → 12 %
await js(`(async () => { window.__o = (${appMod('/src/gamepad.js')}).PAD_PARAMS.stickDeadzone })()`)
await sleep(200)
const dzSet = await js('window.__o')
check(dzSet === 0.12 && JSON.parse(await js('localStorage.getItem("autos-settings/1")')).stickDeadzone === 0.12, `stick deadzone → 12 %, live and saved (${dzSet})`)
// FEAT-294 (DEC-431): the pad layout row, past controller vibration: Professor → Ventura Highway, live and saved, and the
// binding chart and the side menu's "hold" line name its buttons.
await press(DOWN, 2); await press(RIGHT)
await js(`(async () => { window.__o = (${appMod('/src/gamepad.js')}).PAD_PARAMS.padLayout })()`)
await sleep(200)
const lay = await js('window.__o')
check(lay === 'Ventura Highway' && JSON.parse(await js('localStorage.getItem("autos-settings/1")')).padLayout === 'Ventura Highway', `pad layout → Ventura Highway, live and saved (${lay})`)
const chart = () => js(`Object.fromEntries([...document.querySelectorAll('#cs-bindings tr')].map(r => [r.cells[0].textContent, r.cells[2].textContent]))`)
let ch = await chart()
check(ch['handbrake / park (tap)'] === 'A' && ch['upshift (manual)'] === 'B' && ch['downshift (manual)'] === 'X' && ch['clutch (manual)'] === 'LB'
  && ch.inventory === 'RB (hold, ↑/↓, release)' && ch['abandon job (parked; twice)'] === 'RB + ↑ (hold RB, ↑, release)'
  && ch['back (menus, cards, map)'] === 'B' && ch['throw paper (aiming)'] === 'right stick aims, RB tap' && ch['cards: pick / press'] === 'D-pad / A (card up)',
  `the binding chart shows Ventura Highway's buttons: ${JSON.stringify(ch)}`)
check(await js('document.querySelector("#hud-b-hint > .kc-pad").textContent') === 'RB', 'the side menu\'s "hold" line reads RB')
await press(B)
check(!await shown('mm-settings-panel') && await shown('pm-resume'), 'B steps back to the pause list')
await press(START)
check(!await shown('pause-menu'), 'Start resumes')
// Reload: the choices persist.
await c.cmd('Page.navigate', { url: `http://localhost:${PORT}/index.html` })
// Wait out worldgen: a main thread stalled past NAV_DELAY_MS with a button down reads as a held
// (repeating) press, which is right for a player and noise for a scripted single press.
for (let t = 0; t < 160 && !(await js('window.__rsReady === true')); t++) await sleep(250)
await sleep(500)
await js(fakePad)
await press(A)   // the menu opens on new game
check((await selVal('worldPreset')).includes('casual') && (await selVal('gearbox')).includes('manual'),
      'after a reload the setup page shows casual / manual')
await press(B)
check(!await js('document.getElementById("main-menu").classList.contains("setup")'), 'B backs out of the setup page')
await js(`(async () => { window.__o = (${appMod('/src/gamepad.js')}).PAD_PARAMS.padLayout })()`)
await sleep(200)
ch = await chart()
check(await js('window.__o') === 'Ventura Highway' && ch['handbrake / park (tap)'] === 'A', `FEAT-294: after a reload the pad layout is still Ventura Highway, chart too (${await js('window.__o')})`)

// ── FEAT-294 (DEC-431): Ventura Highway, driving. A handbrake / park tap, B up, X down, LB clutch, RB held the side menu
// (RB tap still throws while aiming). Every parked screen: A selects, B closes, then the gas rolls the truck away; a press
// that selected or backed never acts as a driving button when its screen closes under it. Free roam, the automatic first.
await c.cmd('Page.navigate', { url: `http://localhost:${PORT}/index.html?nomenu=1&seed=6` })
for (let t = 0; t < 160 && !(await js('window.__rsReady === true')); t++) await sleep(250)
await sleep(500)
await js(fakePad)
await js(`(async () => { const m = ${appMod('/src/gamepad.js')}; window.__padMod = m; window.__vhKeys = []
  addEventListener('keydown', e => __vhKeys.push(e.key), true) })()`)
await sleep(200)
check(await js('__padMod.PAD_PARAMS.padLayout') === 'Ventura Highway', 'the free-roam boot reads the saved layout')
const keysSeen = () => js('__vhKeys.splice(0).join()')
const reset = async () => { await js('__fp.b[7] = 0; __fp.b[15] = 1'); await sleep(1300); await js('__fp.b[15] = 0'); await sleep(2500) }
await js('__fp.b[7] = 0.5'); await sleep(400); await js('__fp.b[7] = 0'); await sleep(200)   // the pad drives; the boot's latch let go
await reset()
s = await vs(); check(s.parked && s.v < 0.2, `VH: D-pad → hold parks the truck at rest (parked=${s.parked})`)
await keysSeen()
await press(A); s = await vs()
const aUn = !s.parked, aKeys = await keysSeen()
await press(A); s = await vs()
check(aUn && s.parked && aKeys === ' ' && await keysSeen() === ' ', `VH: an A tap lets the parking brake go, the next latches it (Space only: "${aKeys}")`)
await js('__fp.b[0] = 1'); await sleep(300); s = await vs(); await js('__fp.b[0] = 0'); await sleep(200)
check(s.hb, `VH: A held is the handbrake (hb=${s.hb})`)
if (!(await vs()).parked) await press(A)
await keysSeen()
// RB held: the side menu, D-pad ↓ walks it, release opens the pick. Parked, so the park zone's icons are on it.
await js(`window.__inv.grant('chiliDog')`)   // a slot for A to select (free roam's inventory is empty)
await js('__fp.b[5] = 1'); await sleep(250)
const vhPick = await pick(), vhOn = await menuOn()
await js('__fp.b[13] = 1'); await sleep(150); await js('__fp.b[13] = 0'); await sleep(150)
const vhWalk = await pick()
await js('__fp.b[12] = 1'); await sleep(150); await js('__fp.b[12] = 0'); await sleep(150)
await js('__fp.b[5] = 0'); await sleep(500)
check(vhOn && vhPick === 'inv-icon' && vhWalk === 'dmg-icon' && await inv() && !await menuOn(), `VH: RB held opens the side menu (${vhPick}), ↓ walks it (${vhWalk}), release opens the pick (inventory ${await inv()})`)
check(!/ /.test(await keysSeen()), 'VH: the RB hold sent no Space (RB is not the handbrake)')
// The inventory: A selects a slot, B closes, the gas rolls away. (It wakes on its first button, the back: walk to a slot.)
for (let i = 0; i < 8 && !await js('!!document.querySelector("#inv-screen .nav-focus.inv-slot")'); i++) await press(UP)
await keysSeen()
await press(A); s = await vs()
check(await inv() && s.parked && !/ /.test(await keysSeen()), `VH inventory: A on a slot selects it and stays a select (open ${await inv()}, parked ${s.parked}, on ${await js('document.querySelector("#inv-screen .nav-focus")?.className')})`)
await js('__fp.b[1] = 1'); await sleep(300); await js('__fp.b[1] = 0'); await sleep(300)   // held past the close: the drive layout comes up under it
check(!await inv() && (await vs()).parked && !/\be\b/.test(await keysSeen()), 'VH inventory: B closes it, the truck still parked, and that back never upshifts')
await js(`window.__inv.consume('chiliDog')`)
const rolls = async (what) => {
  await js('__fp.b[7] = 0.6'); await sleep(1200); s = await vs(); await js('__fp.b[7] = 0'); await sleep(200)
  check(!s.parked && s.v > 0.5, `VH ${what}: after B the gas lets the parking brake go and rolls the truck (parked ${s.parked}, v ${s.v.toFixed(2)})`)
}
await rolls('inventory'); await reset(); await keysSeen()
// An A press that CLOSES a screen is the screen's: the inventory's back button, held past the close, never pulls the handbrake.
await js('__fp.b[5] = 1'); await sleep(250); await js('__fp.b[5] = 0'); await sleep(500)
for (let i = 0; i < 14 && !await js('!!document.querySelector("#inv-screen .nav-focus[data-act=close]")'); i++) await press(DOWN)
check(await js('!!document.querySelector("#inv-screen .nav-focus[data-act=close]")'), `VH: the D-pad reaches the inventory's back button (open ${await inv()}, on ${await js('(e => e && (e.dataset.act || e.className))(document.querySelector(".nav-focus"))')}, parked ${(await vs()).parked}, items ${await js('JSON.stringify(window.__inv.list())')})`)
await keysSeen()
await js('__fp.b[0] = 1'); await sleep(400); await js('__fp.b[0] = 0'); await sleep(300)
s = await vs()
check(!await inv() && s.parked && !/ /.test(await keysSeen()), `VH: A on the back button closes the inventory and never toggles the handbrake (parked ${s.parked})`)
// The damage screen: RB menu ↓, A selects a part, B closes, the gas rolls away.
await js('__fp.b[5] = 1'); await sleep(250); await js('__fp.b[13] = 1'); await sleep(150); await js('__fp.b[13] = 0'); await sleep(150); await js('__fp.b[5] = 0'); await sleep(500)
const dmgOpen = () => js('document.getElementById("dmg-screen").classList.contains("open")')
check(await dmgOpen(), 'VH: RB menu ↓ release opens the damage screen')
await press(DOWN); await press(A)
check(await dmgOpen() && (await vs()).parked && !/ /.test(await keysSeen()), 'VH damage screen: A selects, the screen stays, no handbrake')
await press(B)
check(!await dmgOpen() && (await vs()).parked && !/\be\b/.test(await keysSeen()), 'VH damage screen: B closes it, parked, no upshift')
await rolls('damage screen'); await reset(); await keysSeen()
// The map opened at rest (FEAT-194: it holds the truck): A selects (Enter), B closes it, the gas rolls away.
await js('__fp.b[8] = 1'); await sleep(200); await js('__fp.b[8] = 0'); await sleep(500)
await press(A); await js('__fp.b[7] = 0.5'); await sleep(300); s = await vs(); await js('__fp.b[7] = 0'); await sleep(100)
check(await mapShown() && s.parked && /Enter/.test(await keysSeen()), `VH map at rest: A is Enter, the gas does not release it (parked ${s.parked})`)
await press(B)
check(!await mapShown() && (await vs()).parked, 'VH map: B closes it, still parked')
await rolls('map'); await reset(); await keysSeen()
// RB while aiming (throwReady forced): a tap throws (F, no menu); held past the tap it is the side menu, not the handbrake.
await js('window.__tr0 = __padMod.pad.throwReady; __padMod.pad.throwReady = () => true')
await js('__fp.b[5] = 1'); await sleep(100); await js('__fp.b[5] = 0'); await sleep(200)
const tapKeys = await keysSeen()
check(tapKeys === 'f' && !await menuOn(), `VH aiming: an RB tap throws (keys "${tapKeys}"), no menu`)
await js('__fp.b[5] = 1'); await sleep(450)
const heldMenu = await menuOn(), heldKeys = await keysSeen()
await js('__fp.b[5] = 0; __padMod.pad.throwReady = __tr0'); await sleep(500)
check(heldMenu && !/[f ]/.test(heldKeys) && await inv(), `VH aiming: RB held past the tap is the side menu (menu ${heldMenu}, keys "${heldKeys}"), its release opens the pick`)
await press(B); await sleep(4000)   // the F tap's practice-throw view runs out
// FEAT-126 manual through Ventura Highway: B up, X down, LB clutch.
await js(`(async () => { const R = (${appMod('/data/ranger.js')}).RANGER_PARAMS, T = (${appMod('/data/transmissions.js')}).TRANSMISSIONS
  Object.assign(R, T.m5odr1); Object.assign(__vs.drivetrain, { mGear: 0, shiftT: 0, locked: false }); window.__R = R })()`)
await sleep(300)
// B backing out of a screen never shifts: the inventory over neutral, B held past its close.
await js('__fp.b[5] = 1'); await sleep(250); await js('__fp.b[5] = 0'); await sleep(500)
await js('__fp.b[1] = 1'); await sleep(400); await js('__fp.b[1] = 0'); await sleep(400)
check(!await inv() && await gear() === 0 && (await vs()).parked, `VH manual: B closes the inventory and stays in neutral (gear ${await gear()})`)
await press(A)   // A: let the parking brake go
await press(B); await sleep(400)
check(await gear() === 1, `VH manual, assist ON: B shifts N → 1 (gear ${await gear()})`)
await press(2); await sleep(400)
check(await gear() === 0, `VH manual: X shifts 1 → N (gear ${await gear()})`)
await js('__R.clutchAssist = false')
await press(B); await sleep(400)
check(await gear() === 0, `VH manual, assist OFF: B without LB is rejected (gear ${await gear()})`)
await js('__fp.b[4] = 1'); await sleep(200); await press(B); await sleep(400); await js('__fp.b[4] = 0')
check(await gear() === 1, `VH manual, assist OFF: LB + B shifts N → 1 (gear ${await gear()})`)
await js('__R.clutchAssist = true')
console.log(fails ? `${fails} FAILED` : 'ALL OK', '| console errors:', errs.length ? errs : 'none')
c.close(); cleanup(); process.exit(fails ? 1 : 0)
