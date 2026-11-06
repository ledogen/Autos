// test/run-soak.mjs — THE RUN SOAK (orchestrator, 2026-11-06): plays WHOLE story runs through the real app
// over CDP on random seeds, the way cdp-smoke boots it (its own Vite on a free port, rooted at this checkout).
// Not a gate: a run is many minutes. A rainy-day script, like the smoke's heavier cousins.
//
// Each run: a new story run → hold M (skip the opening; the casserole is in hand at mom's) → each day take
// board jobs and teleport through each leg, finishing at a MID rank (the clock is advanced to the middle of
// the A/B lines before the last arrival) → refuel when low, eat what the inventory holds when hungry → sleep
// at mom's when tired or late → save & exit + reload + continue once a night → until the deeds gate opens the
// requisition and its five lines are delivered (the win card).
//
// TELEPORTS COST NO GAME TIME, a drive does. So every move to a giver advances the clock by the crow distance
// × ROAD_FACTOR at the speed the jobs' own pars imply (route length / par, running mean) — the day counts are
// the soak's honest estimate of a player who drives straight to the next job. Report them, never tune to them.
//
// FAILS (exit 1) on any console error, any stuck state (no takeable job all day, a card that will not close,
// a sleep that does not move the clock), or a run that never reaches the win.
// Writes wip/run-soak/<stamp>.json + .txt (wip/ is git-invisible).
//
// USAGE: node test/run-soak.mjs [--n=3] [--seeds=a,b,c] [--max-days=30] [--headed]

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { cpus, loadavg } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHROME, launchChrome, connect, sleep } from './lib/cdp.mjs'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
if (!existsSync(CHROME)) { console.log(`SKIP (no Chrome at ${CHROME})`); process.exit(0) }
const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const N = +arg('n', 3), MAX_DAYS = +arg('max-days', 30)
const SEEDS = arg('seeds', null)?.split(',') ?? Array.from({ length: N }, () => {
  let s; do s = String((Math.random() * 2 ** 32) >>> 0); while (s === '6'); return s   // never the test seed
})
const ROAD_FACTOR = 1.3   // road distance ÷ crow distance for the drive to a giver [DEFAULT]
const MID = 0.5           // where between the A and B lines a job lands (0 = on A, 1 = on B)

// ── boot (cdp-smoke's) ───────────────────────────────────────────────────────────────────────────
const freePort = () => new Promise(r => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const [HTTP, CDP] = [await freePort(), await freePort()]
const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(HTTP), '--strictPort'], { cwd: ROOT, stdio: 'ignore' })
process.on('exit', () => { try { vite.kill() } catch {} })
const stretch = () => Math.max(1, loadavg()[0] / cpus().length)
async function until (fn, ms, every = 100) {
  const t0 = performance.now()
  while (performance.now() - t0 < ms * stretch()) { const v = await fn(); if (v) return v; await sleep(every) }
  return null
}
if (!await until(() => fetch(`http://localhost:${HTTP}/`).then(r => r.ok, () => false), 15000, 200)) { console.error('FAIL: vite never served'); process.exit(1) }
const { cleanup } = launchChrome('about:blank', { port: CDP, headed: process.argv.includes('--headed') })
const client = await connect({ port: CDP, cmdTimeoutMs: 120000 })
process.on('exit', () => { try { cleanup() } catch {} })

let step = 'boot', run = null
const errors = []
client.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') errors.push({ seed: run?.seed, day: run?.day, step, msg: p.args.map(a => a.value ?? a.description ?? a.type).join(' ') }) })
client.on('Runtime.exceptionThrown', p => errors.push({ seed: run?.seed, day: run?.day, step, msg: p.exceptionDetails.exception?.description ?? p.exceptionDetails.text }))
const js = async expr => {
  const r = await client.evalJS(expr).catch(e => { throw new Error(`${e.message} — in: ${expr.replace(/\s+/g, ' ').slice(0, 120)}`) })
  if (r.err) throw new Error(`eval ${expr.replace(/\s+/g, ' ').slice(0, 80)}: ${r.err}`)
  return r.val
}
async function key (k, down) {
  const code = k.length === 1 && /[a-z]/i.test(k) ? `Key${k.toUpperCase()}` : ({ ' ': 'Space' })[k] ?? k
  await client.cmd('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', key: k, code })
}
const frames = async (n, ms) => {
  await js(`window.__frOk = false; { let k = 0; const t0 = performance.now()
    const f = () => (++k >= ${n} && performance.now() - t0 >= ${ms}) ? (window.__frOk = true) : requestAnimationFrame(f); requestAnimationFrame(f) }`)
  await until(() => js('window.__frOk'), 5000, 30)
}
const tap = async k => { await key(k, true); await frames(2, 60); await key(k, false) }
class Stuck extends Error {}
const check = (ok, what) => { if (!ok) throw new Stuck(what) }
async function simFor (s) {
  const t0 = await js('window.__simT()')
  let last = t0, seen = performance.now()
  for (;;) {
    const t = await js('window.__simT()')
    if (t - t0 >= s) return
    if (t > last) { last = t; seen = performance.now() }
    check(performance.now() - seen < 10000 * stretch(), `the sim stopped stepping, ${(t - t0).toFixed(2)} of ${s} sim-s in`)
    await sleep(50)
  }
}
const vis = id => js(`!!document.getElementById("${id}")?.checkVisibility()`)
const dlgUp = () => js('getComputedStyle(document.getElementById("dialogue-panel")).display !== "none"')
async function readCards () { for (let i = 0; i < 40 && await dlgUp(); i++) { await tap('Enter'); await sleep(150) } check(!await dlgUp(), 'a dialogue card would not close') }

// Page-side helpers, re-installed after every navigation (a resume reloads the page).
const HELPERS = `window.__soak = {
  pois: () => window.__map2d()._getPois(),
  poi: (id) => window.__map2d()._getPois().find(q => q.id === id),
  // cdp-smoke PAD_SEAT: the marker, or the first point toward the road a truck-sized circle clears.
  pad (q) { const P = window.__poi(), y = (q.y ?? 0) + 0.8
    const dx = q.roadX - q.x, dz = q.roadZ - q.z, L = Math.hypot(dx, dz) || 1
    for (let t = 0; t <= Math.min(9, L); t += 0.5) { const x = q.x + dx / L * t, z = q.z + dz / L * t; if (!P.queryContact(x, y, z, 3)) return { x, z, h: Math.atan2(-q.tx, -q.tz) } }
    return { x: q.x, z: q.z, h: Math.atan2(-q.tx, -q.tz) } },
  // poi.js towSeat's pump branch: alongside the island, in its first zone.
  pump (q) { const b = q.pumpZones[0], yaw = q.modelYaw ?? q.yaw ?? 0, cs = Math.cos(yaw), sn = Math.sin(yaw), ox = q.modelX ?? q.x, oz = q.modelZ ?? q.z
    return { x: ox + b.x * cs + b.z * sn, z: oz - b.x * sn + b.z * cs, h: yaw - Math.PI / 2 } },
  // A point of the job's polyline and the heading along it there.
  along (i) { const p = window.__mission().mission.poly, k = Math.max(1, Math.min(p.length - 1, i)), a = p[k - 1], b = p[k]
    return { x: p[k].x, z: p[k].z, h: Math.atan2(-(b.x - a.x), -(b.z - a.z)) } },
  state () { const d = window.__day(), e = window.__econ, m = window.__mission(), b = window.__board(), v = window.__vs
    return { day: d.day(), h: d.clockH(), hour: d.hour(), energy: d.energyH(), hungry: d.hungry(), money: e.money, half: e.halfPoints,
      ms: m.state, fuel: v.fuel.gal, first: b?.firstState(), lines: b?.lines().map(l => l.state) ?? [], pos: window.__car(),
      ended: document.getElementById('run-end')?.style.display === 'block' && document.getElementById('re-title').textContent } },
}`
const S = () => js('window.__soak.state()')

// ── one run ──────────────────────────────────────────────────────────────────────────────────────
const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
async function gotoMenu () {
  await client.cmd('Page.navigate', { url: `http://localhost:${HTTP}/index.html` })
  check(await until(() => js('window.__rsReady === true && !!document.getElementById("mm-new")?.offsetParent'), 120000, 250), 'the main menu never came up')
}
async function startRun (seed) {
  step = 'start'
  await gotoMenu()
  await js('document.getElementById("mm-new").click()')
  await js(`document.getElementById("su-seed").value = ${JSON.stringify(seed)}; document.getElementById("su-start").click()`)
  check(await until(() => js(live), 180000, 250), 'the run never went live')
  await js(HELPERS)
  // Skip the opening: hold M a second over the firing (FEAT-170 stage 2).
  check(await until(dlgUp, 5000), 'the run did not open on the firing')
  await key('m', true); await sleep(1300); await key('m', false)
  check(await until(() => js('window.__board().firstState() === "taken"'), 15000), 'holding M did not skip to the casserole')
  await js('window.__autosave()')
  return await js('JSON.parse(localStorage.getItem("autos-run/1")).data.seed')
}

/** Resume after save & exit: reload, continue, close the resume card. */
async function saveAndResume () {
  step = 'save'
  const before = await S()
  for (let i = 0; i < 4 && !await js('document.getElementById("pause-menu").style.display === "flex"'); i++) { await tap('Escape'); await sleep(300) }
  check(await js('!document.getElementById("pm-save").disabled && document.getElementById("pm-save").offsetParent !== null'),
    `save & exit not offered: "${await js('document.getElementById("pm-save-why")?.textContent')}"`)
  await js('document.getElementById("pm-save").click()')
  check(await until(() => js('document.getElementById("mm-continue").offsetParent !== null'), 10000), 'no continue after save & exit')
  await client.cmd('Page.navigate', { url: `http://localhost:${HTTP}/index.html` })
  check(await until(() => js('window.__rsReady === true && document.getElementById("mm-continue")?.offsetParent != null'), 120000, 250), 'no continue after the reload')
  await js('document.getElementById("mm-continue").click()')
  check(await until(() => js(live), 180000, 250), 'the resumed run never went live')
  await js(HELPERS)
  if (await until(() => js('document.getElementById("resume-card").style.display === "flex"'), 3000)) await tap('Escape')
  await until(async () => !await js('document.getElementById("resume-card").style.display === "flex"'), 3000)
  const after = await S()
  check(after.day === before.day && Math.abs(after.money - before.money) < 0.005 && Math.abs(after.h - before.h) < 0.2,
    `the resume changed the run: ${JSON.stringify({ day: before.day, money: before.money, h: before.h })} → ${JSON.stringify({ day: after.day, money: after.money, h: after.h })}`)
}

async function seat (p) {
  await js(`window.__seated = false; window.__teleport(${p.x}, ${p.z}, ${p.h}).then(() => { window.__seated = true })`)
  check(await until(() => js('window.__seated'), 60000, 100), `the teleport to (${p.x.toFixed(0)}, ${p.z.toFixed(0)}) never seated`)
  await simFor(0.6)
}
async function park (fresh = true) {
  if (fresh && await js('window.__vs.parked')) { await tap(' '); await frames(4, 200) }
  await key(' ', true); await frames(4, 200)
  await until(() => js('window.__vs.velocity.length() < 0.5'), 20000)
  await key(' ', false); await frames(2, 60)
  if (!await js('window.__vs.parked')) await tap(' ')
  check(await until(() => js('window.__vs.parked'), 3000), 'the truck would not park')
}

/** A drive to (x, z) costs game time even though the soak teleports. */
async function drive (to) {
  const c = await js('window.__car()'), d = Math.hypot(to.x - c.x, to.z - c.z) * ROAD_FACTOR
  const sec = d / run.speed   // real seconds = game minutes (DAY_PARAMS: 24 real minutes a day)
  if (sec > 1) await js(`window.__day().advanceMinutes(${sec})`)
  run.driveMin += sec
  await seat(to)
}

const FAMILY_ORDER = ['delivery', 'fetch', 'freight', 'fragile', 'haul', 'demolition']   // papers (Larry) skipped
/** Every live board offer the soak can try now, best first: requisition lines, then the plainer families. */
async function offers () {
  return await js(`(() => { const b = window.__board(), h = window.__day().clockH(), c = window.__car(), out = []
    for (const q of window.__soak.pois()) {
      if (!q.jobs || q.hidden || q.type === 'larrysHouse') continue
      for (const o of b.offers(q.id, h)) { const s = b.spec(o); if (!s) continue
        out.push({ poi: q.id, type: q.type, id: o.id, family: s.family, line: s.line?.id ?? null, d: Math.hypot(q.x - c.x, q.z - c.z) }) }
    }
    return out })()`)
}
function pick (list) {
  const rank = o => (o.line ? -1000 : FAMILY_ORDER.indexOf(o.family) * 100) + o.d / 1000
  return list.filter(o => FAMILY_ORDER.includes(o.family) && !run.skip.has(o.id)).sort((a, b) => rank(a) - rank(b))[0] ?? null
}

/** Put an open offer card down: its decline button, else Esc; a panel that will not go is a soft-lock. */
async function decline () {
  if (await vis('mp-decline')) await js('document.getElementById("mp-decline").click()')
  else await tap('Escape')
  check(await until(() => js('!["offer", "generating"].includes(window.__mission().state)'), 3000), `an offer card would not close (state ${await js('window.__mission().state')})`)
}

/** Park at the giver, open its card, take offer `o`. False when the card refuses it. */
async function take (o) {
  step = `take ${o.family}${o.line ? ' line ' + o.line : ''} at ${o.type}`
  await drive(await js(`window.__soak.pad(window.__soak.poi(${JSON.stringify(o.poi)}))`))
  await park()
  if (o.type === 'autoShop' && await until(() => vis('svc-screen'), 3000)) await js('document.querySelector("#svc-screen [data-tab=jobs]")?.click(); document.querySelector("#svc-screen [data-act=jobs]")?.click()')
  if (!await until(() => vis('mp-accept'), 5000)) { run.skip.add(o.id); return false }
  await readCards()
  for (let i = 0; i < 12 && await js(`window.__mission().offer?.id !== ${JSON.stringify(o.id)}`); i++) { await js('window.__mission().cycle(1)'); await sleep(100) }
  if (!await js(`window.__mission().offer?.id === ${JSON.stringify(o.id)} && !document.getElementById("mp-accept").disabled`)) {
    run.skip.add(o.id); await decline(); return false
  }
  await js('document.getElementById("mp-accept").click()')
  check(await until(() => js('["staging", "loading", "running"].includes(window.__mission().state)'), 10000), `accepting did not start the job (state ${await js('window.__mission().state')})`)
  await until(() => js('window.__mission().state !== "loading"'), 30000)   // a haul's load drops into the bed
  return true
}

/** Drive the job in hand to its end at a mid rank. Returns the result row. */
async function finish (o) {
  step = `job ${o.family}${o.line ? ' line ' + o.line : ''}`
  const m0 = await js(`(() => { const m = window.__mission().mission, p = m.poly, cum = m.polyCum
    return { par: m.par, th: m.terms?.thresholds, legs: m.legs?.map(l => ({ poi: l.poiId })) ?? null, targets: !!m.targets, len: cum?.at(-1) ?? 0, n: p.length, zone: m.startZone, cargo: window.__cargo() && { freight: window.__cargo().freight?.key ?? null, loose: window.__cargo().loose, haul: window.__cargo().haul } } })()`)
  if (m0.len > 0 && m0.par > 0) run.speed = run.speed * 0.8 + 0.2 * (m0.len / m0.par)
  // Out of the start zone along the route: the job starts.
  const out = await js(`(() => { const p = window.__mission().mission.poly, z = window.__mission().mission.startZone
    for (let i = 1; i < p.length; i++) if (!z || Math.hypot(p[i].x - z.x, p[i].z - z.z) > z.r + 15) return i
    return p.length - 1 })()`)
  await seat(await js(`window.__soak.along(${out})`))
  check(await until(() => js('window.__mission().state === "running"'), 10000), `leaving the start zone did not start the job (state ${await js('window.__mission().state')})`)
  // The stops short of the last (a fetch's pickup, a multi-drop's hand-overs) each end with a park.
  for (let i = 0; m0.legs && i < m0.legs.length - 1; i++) {
    await drive(await js(`window.__soak.pad(window.__soak.poi(${JSON.stringify(m0.legs[i].poi)}))`))
    await park()
    check(await until(() => js(`window.__mission().leg > ${i}`), 5000), `parking at stop ${i + 1} did not hand over (leg ${await js('window.__mission().leg')})`)
  }
  // The clock to the middle of the A/B lines, then the last arrival.
  const th = m0.th ?? { A: 1.135, B: 1.187 }
  const want = m0.par * (th.A + MID * (th.B - th.A)), el = await js('window.__mission().elapsed')
  if (want > el) await js(`window.__day().advanceMinutes(${want - el})`)   // a job second is a game minute
  if (m0.targets) await js('window.__site()?.targets.forEach(t => { t.smashed = true })')
  else {
    const end = await js(`(() => { const m = window.__mission().mission, e = m.legs ? m.legs.at(-1).end : m.end
      const q = window.__soak.pois().find(q => Math.hypot(q.x - e.x, q.z - e.z) < 30)
      return q ? window.__soak.pad(q) : { ...window.__soak.along(window.__mission().mission.poly.length - 1) } })()`)
    await seat(end)
  }
  if (!await until(() => js('window.__mission().state === "done"'), 15000)) {
    const why = await js(`(() => { const m = window.__mission(); return { s: m.state, d: m.distanceToGo(), failed: !!m.mission?.failed, cargoOut: !!m.mission?.cargoOut, expired: !!m.mission?.expired, cargo: window.__cargo() && { freight: window.__cargo().freight, loose: window.__cargo().loose, haul: window.__cargo().haul } } })()`)
    throw new Stuck(`the job did not finish at its end: ${JSON.stringify(why)} (taken with ${JSON.stringify(m0.cargo)})`)
  }
  const r = await js(`(() => { const r = window.__mission().result; return { letter: r.letter, ratio: r.ratio, pay: r.payout ?? 0, points: r.points ?? 0, award: r.award?.id ?? null, stowed: r.award?.stowed ?? null } })()`)
  // Put the result card away (the dinner invitation's "stay" is the same button: it feeds the driver).
  await js('document.getElementById("mp-accept").click()')
  check(await until(() => js('window.__mission().state === "idle"'), 5000), 'the result card would not close')
  await readCards()   // Larry after the casserole, the camp's lines opening…
  return r
}

async function refuel () {
  step = 'fuel'
  const q = await js(`(() => { const c = window.__car(); return window.__soak.pois().filter(q => q.pumpZones && !q.hidden).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0]?.id ?? null })()`)
  if (!q) return run.notes.push('no gas station in the region')
  const g0 = await js('window.__vs.fuel.gal')
  await drive(await js(`window.__soak.pump(window.__soak.poi(${JSON.stringify(q)}))`))
  await park()
  check(await until(() => vis('pump-display'), 3000), 'parked at a pump, no pump face')
  // Hold F until the tank stops taking fuel (full, or the wallet ran out): two flat reads 1 s apart.
  await key('f', true)
  let last = -1
  for (let i = 0; i < 90; i++) { await sleep(1000); const g = await js('window.__vs.fuel.gal'); if (g <= last + 0.001) break; last = g }
  await key('f', false)
  await tap(' ')   // the handbrake off pays
  await sleep(500)
  run.fuelBuys.push({ day: run.day, gal: +(await js('window.__vs.fuel.gal') - g0).toFixed(2), money: await js('window.__econ.money') })
}

async function eat () {
  const i = await js(`window.__inv.list().findIndex(r => ['chiliDog', 'schoolLunch'].includes(r.id))`)   // data/items.js use: 'eat'
  if (i < 0) return false
  await js(`window.__inv.use(window.__inv.list()[${i}].id, ${i})`)
  run.meals++
  return true
}

/** Sleep at mom's: park at her door, her sleep card, a full night, leave. */
async function sleepNight () {
  step = 'sleep'
  const s0 = await S()
  await drive(await js(`window.__soak.pad(window.__soak.pois().find(q => q.type === 'momsHouse'))`))
  await park()
  check(await until(() => vis('camp-panel'), 3000), "parking at mom's opened no sleep card")
  await readCards()
  await js('document.getElementById("cp-sleep").click()')
  // To 07:00 (a player's night), 4–14 h on the timer.
  const hours = Math.max(4, Math.min(14, Math.round(((7 - s0.hour) % 24 + 24) % 24)))
  await js(`(() => { const s = document.getElementById("cp-hours"); s.value = ${hours}; s.dispatchEvent(new Event("input")) })()`)
  await js('document.getElementById("cp-sleep-go").click()')
  check(await until(async () => (await S()).h > s0.h + hours - 0.5, 15000), `a ${hours} h night did not move the clock (${s0.h.toFixed(2)} → ${(await S()).h.toFixed(2)})`)
  await readCards()
  await js('document.getElementById("cp-break")?.click()')
  check(await until(async () => !await vis('camp-panel'), 3000), "mom's sleep card would not close")
  const s1 = await S()
  run.wakes.push({ day: s1.day, hour: +s1.hour.toFixed(2), money: +s1.money.toFixed(2), energy: +s1.energy.toFixed(1), deeds: s1.half / 2 })
}

async function playRun (seedIn) {
  run = { seed: seedIn, day: 0, speed: 12, driveMin: 0, jobs: [], wakes: [], fuelBuys: [], meals: 0, hungryDays: [], skip: new Set(), notes: [], softlocks: [],
          gateDay: null, winDay: null, result: null }
  const t0 = performance.now()
  run.seed = await startRun(seedIn)
  let idleH = 0
  for (;;) {
    const s = await S()
    run.day = s.day
    if (s.ended) { run.result = s.ended; if (/beat the alpha/.test(s.ended)) run.winDay = s.day; break }
    if (s.day > MAX_DAYS) { run.result = `no win by day ${MAX_DAYS}`; break }
    if (run.gateDay == null && s.lines.some(l => l !== 'closed')) run.gateDay = s.day
    try {
      if (s.ms === 'offer' || s.ms === 'generating') { await decline(); continue }
      if (s.ms !== 'idle') {   // the casserole (in hand from the skip), or a job a resume brought back
        const o = await js('(() => { const m = window.__mission(), sp = window.__board().spec(m.offer ?? {}); return { family: sp?.family ?? "?", line: sp?.line?.id ?? null, type: sp?.first ? "momsHouse (casserole)" : "in hand" } })()')
        const r = await finish(o)
        run.jobs.push({ day: s.day, family: o.family, line: o.line, giver: o.type, ...r })
        continue
      }
      if (s.energy < 3 || s.hour >= 21 || s.hour < 4) { await sleepNight(); await saveAndResume(); continue }
      if (s.hungry && !run.hungryDays.includes(s.day)) run.hungryDays.push(s.day)
      if (s.hungry && await eat()) continue
      if (s.fuel < 5 && s.money > 2) { await refuel(); continue }
      const o = pick(await offers())
      if (!o) {   // nothing takeable: wait an hour for the board to turn over
        idleH++
        check(idleH < 16, `no takeable job for ${idleH} game hours`)
        await js('window.__day().advanceMinutes(60)')
        continue
      }
      if (!await take(o)) continue
      const r = await finish(o)
      idleH = 0
      run.jobs.push({ day: s.day, family: o.family, line: o.line, giver: o.type, ...r })
      console.log(`  [${run.seed}] day ${s.day} ${s.hour.toFixed(1)}h ${o.line ?? o.family} @${o.type}: ${r.letter} $${r.pay.toFixed(2)} +${r.points} deed · wallet $${(await S()).money.toFixed(2)}`)
    } catch (e) {
      if (!(e instanceof Stuck)) throw e
      const st = await S().catch(() => null)
      const lock = { seed: run.seed, day: st?.day, clockH: st?.h, pos: st?.pos, step, why: e.message,
        mission: await js('(() => { const m = window.__mission(); return { state: m.state, offer: m.offer?.id ?? null, end: m.mission?.end ?? null, leg: m.leg } })()').catch(() => null) }
      run.softlocks.push(lock)
      console.log(`  [${run.seed}] SOFT-LOCK day ${lock.day} in "${step}": ${e.message}`)
      if (run.softlocks.length >= 8) { run.result = 'too many soft-locks'; break }
      // Recover: abandon any job in hand (parked, two clicks, the result card), close whatever card is up.
      await readCards().catch(() => {})
      await tap('Escape').catch(() => {})
      if (await js('window.__mission().isOnJob()').catch(() => false)) {
        await park().catch(() => {})
        await js('document.getElementById("job-cancel")?.click(); document.getElementById("job-cancel")?.click()').catch(() => {})
        await until(() => js('window.__mission().state === "done"'), 3000)
        await js('document.getElementById("mp-accept")?.click()').catch(() => {})
      }
      if (await js('window.__mission().state').catch(() => 'idle') !== 'idle') await js('window.__mission().exit()').catch(() => {})
    }
  }
  run.minutes = +((performance.now() - t0) / 60000).toFixed(1)
  run.skip = run.skip.size
  return run
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────────
const runs = []
for (const seed of SEEDS) {
  console.log(`run seed ${seed}…`)
  try { runs.push(await playRun(seed)) } catch (e) { runs.push({ ...run, skip: run?.skip?.size ?? 0, result: `crashed: ${e.message}` }); console.log(`  crashed: ${e.message}`) }
  const r = runs.at(-1)
  console.log(`  → ${r.result} · deeds gate day ${r.gateDay ?? '—'} · win day ${r.winDay ?? '—'} · ${r.jobs?.length ?? 0} jobs · ${r.softlocks?.length ?? 0} soft-locks · ${r.minutes ?? '?'} min`)
}
client.close(); cleanup()

const perDay = r => { const n = {}; for (const j of r.jobs ?? []) n[j.day] = (n[j.day] ?? 0) + 1; return n }
const lines = runs.map(r => `seed ${r.seed}: ${r.result} · deeds gate day ${r.gateDay ?? '—'} · win day ${r.winDay ?? '—'} · jobs/day ${JSON.stringify(perDay(r))}`
  + ` · wallet at wakes ${(r.wakes ?? []).map(w => `d${w.day} $${w.money}`).join(' ')} · soft-locks ${r.softlocks?.length ?? 0}`)
const out = join(ROOT, 'wip/run-soak'); mkdirSync(out, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
writeFileSync(join(out, `${stamp}.json`), JSON.stringify({ runs, errors }, null, 2))
writeFileSync(join(out, `${stamp}.txt`), [...lines, '', ...errors.map(e => `console error · seed ${e.seed} day ${e.day} in ${e.step}: ${e.msg}`)].join('\n') + '\n')
console.log(lines.join('\n'))
console.log(`report: wip/run-soak/${stamp}.{json,txt}`)
const ok = !errors.length && runs.every(r => r.winDay != null && !r.softlocks?.length)
console.log(ok ? `PASS: ${runs.length} runs reached the win` : `FAIL: ${errors.length} console error(s), ${runs.filter(r => r.winDay == null).length} run(s) without a win, ${runs.reduce((n, r) => n + (r.softlocks?.length ?? 0), 0)} soft-lock(s)`)
process.exit(ok ? 0 : 1)
