// test/pad-e2e.mjs — FEAT-125 rainy-day script (NOT a gate): drives the REAL app with a scripted fake
// gamepad and checks the pad → vehicle contract (analog pedals, position steering + assist toggle,
// last-moved-wins, unplug safety, the Forza button layout incl. View tap/hold), then FEAT-41's menus
// pad-only: main menu → run setup (Casual + manual) → free roam, Start → pause → settings, and the
// choices surviving a reload.
//
//   node test/pad-e2e.mjs [--port=3775] [--headed]     (needs a dev server already serving that port)
//
// The fake pad replaces navigator.getGamepads AFTER boot (gamepad.js looks it up every frame) and is
// driven through window.__fp. PAD_PARAMS is reached by importing the exact module URL the app loaded:
// after an edit Vite serves it as /src/gamepad.js?t=…, and a bare import would load a SECOND
// instance — whose own poll loop then double-fires every button.
import { launchChrome, connect, sleep, keyEvent } from './lib/cdp.mjs'
const PORT = process.argv.find(a => a.startsWith('--port='))?.slice(7) ?? '3775'
const { cleanup } = launchChrome('about:blank', { port: 9334, headed: process.argv.includes('--headed') })
await sleep(1500)
const c = await connect({ port: 9334 })
const errs = []
c.on('Runtime.exceptionThrown', (e) => errs.push(e.exceptionDetails.exception?.description))
c.on('Runtime.consoleAPICalled', (e) => e.type === 'error' && errs.push(e.args.map(a => a.value).join(' ')))
const js = async (e) => { const r = await c.evalJS(e); if (r.err) throw new Error(r.err); return r.val }
let fails = 0
const check = (ok, msg) => { console.log(ok ? '  ok  ' : '  FAIL', msg); if (!ok) fails++ }
await c.cmd('Page.navigate', { url: `http://localhost:${PORT}/index.html?nomenu=1` })
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
// View held 1 s = reset.
await js('__fp.b[8] = 1'); await sleep(1300); await js('__fp.b[8] = 0'); await sleep(2500)
s = await vs(); check(s.parked && s.v < 0.2, `View hold resets the truck, parked at rest (parked=${s.parked}, v=${s.v.toFixed(2)})`)
await js('__fp.b[5] = 1'); await sleep(150); await js('__fp.b[5] = 0'); await sleep(300)
s = await vs(); check(!s.parked, `RB tap while parked unlatches (parked=${s.parked})`)
await js('__fp.b[5] = 1'); await sleep(150); await js('__fp.b[5] = 0'); await sleep(300)
s = await vs(); check(s.parked, `RB tap near rest re-latches (parked=${s.parked}, v=${s.v.toFixed(2)})`)
// View tap -> map (M); a second tap closes it.
const mapShown = () => js('getComputedStyle(document.getElementById("map2d")).display !== "none"')
const mapBefore = await mapShown()
await js('__fp.b[8] = 1'); await sleep(200); await js('__fp.b[8] = 0'); await sleep(500)
check(!mapBefore && await mapShown(), `View tap opens the map (${mapBefore} -> ${await mapShown()})`)
await js('__fp.b[8] = 1'); await sleep(200); await js('__fp.b[8] = 0'); await sleep(500)
check(!await mapShown(), 'a second View tap closes it')
// FEAT-133: on the map the cursor stays at the centre, the right stick pans, and LB / RB page offers as Q / E.
// The window spy registers before the map opens, so it sees keys ahead of the map's capture handler;
// the document spy sits where vehicle.js listens, so a stopped Q / E never reaches the gearbox.
await js(`window.__win = []; window.__doc = []
  window.addEventListener('keydown', e => __win.push(e.key), true); document.addEventListener('keydown', e => __doc.push(e.key))`)
await js('__fp.b[8] = 1'); await sleep(200); await js('__fp.b[8] = 0'); await sleep(500)
const mc = () => js('(() => { const m = __map2d(), s = m._sheet(); return { on: m._padCursor, x: m._hoverX, y: m._hoverY, cx: s.cx, cy: s.cy, x1: s.x1, px: m._panX } })()')
let m = await mc()
check(m.on && m.x === m.cx && m.y === m.cy, `pad cursor shows at the sheet centre (${m.on}, ${m.x?.toFixed(0)},${m.y?.toFixed(0)})`)
await js('__fp.axes[2] = 1'); await sleep(300); await js('__fp.axes[2] = 0'); await sleep(100)
const m2 = await mc()
check(m2.x === m2.cx && m2.y === m2.cy && m2.px > m.px, `right stick pans the map under a fixed cursor (pan +${(m2.px - m.px).toFixed(0)} m)`)
await js('__win.length = 0; __doc.length = 0')   // drop the View tap's m
await js('__fp.b[4] = 1'); await sleep(150); await js('__fp.b[4] = 0'); await sleep(150)
await js('__fp.b[5] = 1'); await sleep(150); await js('__fp.b[5] = 0'); await sleep(150)
await js('__fp.b[0] = 1'); await sleep(150); await js('__fp.b[0] = 0'); await sleep(150)
const wk = await js('__win.join()'), dk = await js('__doc.join()')
check(wk === 'q,e', `LB / RB send Q / E on the map, A is silent (window saw "${wk}")`)
check(!/[qe]/.test(dk), `Q / E stop at the map, never reaching the gearbox (document saw "${dk}")`)
// Triggers zoom about the cursor (RT in, LT out) and drive nothing; the camera does not orbit behind the map.
const zm = () => js('__map2d()._zoom'), camXZ = () => js('(() => { const p = __cam().position; return [p.x, p.z] })()')
const z0 = await zm(), c0 = await camXZ()
await js('__fp.b[7] = 1'); await sleep(400)
const thrOnMap = (await vs()).thr
await js('__fp.b[7] = 0'); await sleep(100)
const z1 = await zm()
await js('__fp.b[6] = 1'); await sleep(400); await js('__fp.b[6] = 0'); await sleep(100)
const z2 = await zm()
check(z1 > z0 * 1.5 && z2 < z1 / 1.5 && thrOnMap === 0, `RT zooms in, LT out, no throttle (${z0.toFixed(3)} → ${z1.toFixed(3)} → ${z2.toFixed(3)}, thr ${thrOnMap})`)
await js('__fp.axes[2] = -1'); await sleep(600); await js('__fp.axes[2] = 0'); await sleep(100)
const c1 = await camXZ()
check(Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) < 0.5, `the right stick does not orbit the camera behind the map (moved ${Math.hypot(c1[0] - c0[0], c1[1] - c0[1]).toFixed(2)} m)`)
await js('__fp.b[8] = 1'); await sleep(200); await js('__fp.b[8] = 0'); await sleep(500)
check(!await mapShown(), 'View closes the map again')
// Right stick = orbit RATE; the view holds orbitHold (2 s) after release, then chase swings back.
// Bearing of the camera around the truck, relative to directly behind it (deg).
const off = () => js(`(() => { const c = __cam().position, p = __vs.position, q = __vs.quaternion
  const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y))   // body -Z in world
  const cb = Math.atan2(c.x - p.x, c.z - p.z), behind = Math.atan2(-fx, -fz)
  return Math.atan2(Math.sin(cb - behind), Math.cos(cb - behind)) * 180 / Math.PI })()`)
await js('__fp.axes[2] = 1'); await sleep(600); await js('__fp.axes[2] = 0')
const o1 = await off(); check(Math.abs(o1) > 45, `0.6 s full right stick orbits the view (${o1.toFixed(0)} deg off behind)`)
await sleep(1500); const o2 = await off(); check(Math.abs(o2 - o1) < 3, `1.5 s after release it HOLDS (${o2.toFixed(0)} deg)`)
await sleep(2500); const o3 = await off(); check(Math.abs(o3) < 10, `~4 s after release it is back behind (${o3.toFixed(0)} deg)`)
// Paper throw: hold B (= F) aims — the reticle shows — and releasing it throws (free roam: a practice throw).
const reticle = () => js('getComputedStyle(document.getElementById("aim-reticle")).display !== "none"')
await js('__fp.b[1] = 1'); await sleep(400)
const aimed = await reticle()
await js('__fp.b[1] = 0'); await sleep(300)
check(aimed && !await reticle(), `B held aims (reticle ${aimed}), release throws (reticle gone)`)
await sleep(4000)   // let the post-throw view hold run out before the next checks
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
// D-pad up = inventory (Tab); A does nothing in the automatic.
const inv = () => js(`!!document.querySelector("#inv-screen.open")`)
const before = await inv()
await js('__fp.b[12] = 1'); await sleep(200); await js('__fp.b[12] = 0'); await sleep(500)
check(!before && await inv(), `D-pad up opens the inventory (${before} -> ${await inv()})`)
// FEAT-133: a card — the D-pad moves a highlight over it (first press places it), B backs out.
await js('__fp.b[15] = 1'); await sleep(150); await js('__fp.b[15] = 0'); await sleep(150)
await js('__fp.b[15] = 1'); await sleep(150); await js('__fp.b[15] = 0'); await sleep(150)
check(await js('!!document.querySelector("#inv-screen .nav-focus")') && await inv(), 'D-pad highlights inside the inventory and does not close it')
await js('__fp.b[1] = 1'); await sleep(150); await js('__fp.b[1] = 0'); await sleep(300)
check(!await inv(), 'B closes the inventory')
await js('__fp.b[12] = 1'); await sleep(200); await js('__fp.b[12] = 0'); await sleep(500)
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
await js('__fp.b[7] = 0.6'); await sleep(2500)
s = await vs(); check(s.v > 3 && (await js('__vs.ignition.state')) === 'running', `RT launches it on the assist (${s.v.toFixed(1)} m/s, no stall)`)
await js('__R.clutchAssist = false')
await js('__fp.b[0] = 1'); await sleep(120); await js('__fp.b[0] = 0'); await sleep(600)
check(await gear() === 1, `assist OFF: A without LB is rejected (gear ${await gear()})`)
check(await js('document.getElementById("dmg-icon").classList.contains("on") && getComputedStyle(document.getElementById("dmg-alert")).display !== "none"'),
      'the missed shift raises the damage alert (icon lit, alert card up)')
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
await press(DOWN)
check(await navText() === 'new game', `first D-pad press highlights the first item (${await navText()})`)
await press(DOWN)
check(await navText() === 'free roam', `second reaches free roam (${await navText()})`)
await press(A)
check(await js('document.getElementById("main-menu").classList.contains("setup")'), 'A opens the run setup page')
check(await js('!document.querySelector("#mm-setup-panel [data-key=steerAssist]")'), 'no assist rows on the setup page (they are settings)')
await press(DOWN)   // lands on the seed field
check(await js('document.activeElement?.id') === 'su-seed', 'the seed field takes the highlight AND focus')
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
await press(DOWN)
check(await navText() === 'start', `one more D-pad down lands on start (${await navText()})`)
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
await press(DOWN); await press(DOWN, 3)
check(await navText() === 'settings', `pause list: down ×3 from resume reaches settings (${await navText()})`)
await press(A)
check(await shown('mm-settings-panel'), 'A opens settings inside the pause box')
check(await js('!document.querySelector("#mm-settings-panel [data-key=gearbox]")'), 'no gearbox row in the in-game settings (pre-game only)')
check(!await js('document.querySelector("#mm-settings-panel [data-key=steerShape]").offsetParent'), 'center softening is hidden while the steering assist is on')
await press(DOWN); await press(RIGHT)
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
await press(DOWN, 2); await press(RIGHT)   // past clutch assist to the stick deadzone: 8 → 12 %
await js(`(async () => { window.__o = (${appMod('/src/gamepad.js')}).PAD_PARAMS.stickDeadzone })()`)
await sleep(200)
const dzSet = await js('window.__o')
check(dzSet === 0.12 && JSON.parse(await js('localStorage.getItem("autos-settings/1")')).stickDeadzone === 0.12, `stick deadzone → 12 %, live and saved (${dzSet})`)
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
await press(DOWN); await press(A)
check((await selVal('worldPreset')).includes('casual') && (await selVal('gearbox')).includes('manual'),
      'after a reload the setup page shows casual / manual')
await press(B)
check(!await js('document.getElementById("main-menu").classList.contains("setup")'), 'B backs out of the setup page')
console.log(fails ? `${fails} FAILED` : 'ALL OK', '| console errors:', errs.length ? errs : 'none')
c.close(); cleanup(); process.exit(fails ? 1 : 0)
