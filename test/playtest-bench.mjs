// test/playtest-bench.mjs — PERF-40: an unattended playtest that measures what a session costs, in watts. NOT a gate.
//
// It plays the real game (its own Vite on the checkout, Chrome at the owner's canvas: 2090 × 1226 device px at dpr 2, the
// Normal tier) the way PERF-37's owner sessions did, with an autopilot on a VIRTUAL GAMEPAD — a page script answers
// navigator.getGamepads(), which src/gamepad.js polls every frame, so the game's own input path drives (no src/ change).
// Per seed, ~6 min:
//   drive  story mode from Larry's, a route over the road network at play speeds (drive-soak's pure pursuit: steer at
//          a point a look-ahead ahead), one off-road leg
//   map    stopped, the map open, the left stick panning and the right stick zooming (30 s)
//   park   stopped, the map shut (30 s) — the GPU-only cost
// Measured per phase: fps, p95, worst frame; main-thread ms/s per __perfData bucket; CPU % per Chrome process (`ps`
// cumulative CPU time — the renderer minus the main thread is the workers); CPU / GPU / DRAM watts and GPU ACTIVE
// cycles (busy % × MHz) from test/lib/ioreport.py, no root; triangles and draw calls.
//
// GPU load is compared by active cycles (gpuMcyc = Mcycles/s). Not GPU ms (the GPU lowers its clock as load drops, so ms
// per frame stays near the frame budget) and not raw watts (±50 % over 6 s at a steady state) — PERF-40 ticket.
//
// THE OWNER'S RULE (2026-11-12): an autopilot that crashes stops streaming, and the run would report a cheap world. So the
// autopilot RECOVERS — stuck, flipped or lost, it re-seats on the route AHEAD (window.__teleport) — and every recovery
// is counted. A drive that did not cover MIN_KM or build MIN_CHUNKS new terrain chunks is INVALID: reported as such, never
// as a number.
//
//   node test/playtest-bench.mjs                         this checkout, the three pinned seeds, 1 rep
//   node test/playtest-bench.mjs --b=../CarGame          A/B: this checkout vs another, alternating A-B-A-B (heat drift)
//   node test/playtest-bench.mjs --reps=2 --seeds=1 --drive=120 --headed
//   node test/playtest-bench.mjs --record                append the result to .planning/perf/history.jsonl (health check)
//
// Flags: --a=<checkout> (default this one) --b=<checkout> --reps=N --seeds=K (first K pinned) | --seed=N
//        --drive=S --map=S --park=S --headed --out=DIR (default perf-runs/bench-<stamp>) --record
// A run is ~7 min per seed per build per rep. Wants a quiet machine: one bench at a time, not while lanes run heavy
// gates (the shared-CPU rule). The load average is printed with every session.
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadavg, cpus } from 'node:os'
import { CHROME, launchChrome, connect, sleep } from './lib/cdp.mjs'

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = dirname(HERE)
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d }
const has = k => process.argv.includes(`--${k}`)
// Three seeds drawn at random once (2026-11-12) and pinned so runs compare. Not a default world (CLAUDE.md § Seeds).
const PINNED = [1768572700, 17535907, 711969014]
const SEEDS = arg('seed') ? [+arg('seed')] : PINNED.slice(0, +arg('seeds', PINNED.length))
const REPS = +arg('reps', 1), DRIVE_S = +arg('drive', 240), MAP_S = +arg('map', 30), PARK_S = +arg('park', 30)
const MIN_KM = DRIVE_S * 0.0125, MIN_CHUNKS = Math.round(DRIVE_S / 8)   // 3 km and 30 chunks at the default 240 s
const BUILDS = [{ name: 'A', dir: resolve(arg('a', ROOT)) }, ...(arg('b') ? [{ name: 'B', dir: resolve(arg('b')) }] : [])]
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const OUT = resolve(arg('out', join(ROOT, 'perf-runs', `bench-${stamp}`)))
if (!existsSync(CHROME)) { console.log(`SKIP (no Chrome at ${CHROME})`); process.exit(0) }
for (const b of BUILDS) if (!existsSync(join(b.dir, 'node_modules/vite/bin/vite.js'))) { console.error(`no vite in ${b.dir}`); process.exit(1) }
mkdirSync(OUT, { recursive: true })

const freePort = () => new Promise(r => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const until = async (fn, ms, every = 200) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn().catch(() => null); if (v) return v; await sleep(every) } return null }
const git = (dir, ...a) => { try { return execFileSync('git', ['-C', dir, ...a]).toString().trim() } catch { return '?' } }

// ── the samplers that run beside the page: power (ioreport.py) and CPU per process (ps) ───────────────────────────────
const power = []
const io = spawn('python3', ['-I', join(HERE, 'lib/ioreport.py'), '0.5'])
io.stdout.on('data', b => { for (const l of String(b).trim().split('\n')) try { power.push(JSON.parse(l)) } catch {} })
const procs = []
const secs = t => t.split(':').reduce((s, x) => s * 60 + Number(x), 0)
let psPrev = null, psRoot = 0
function psSample () {
  if (!psRoot) return
  const rows = execFileSync('ps', ['-Ao', 'pid=,ppid=,time=,command=']).toString().trim().split('\n').map(l => {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(l); return m && { pid: +m[1], ppid: +m[2], cpu: secs(m[3]), cmd: m[4] }
  }).filter(Boolean)
  const kids = new Set([psRoot]); for (let grew = true; grew;) { grew = false; for (const r of rows) if (!kids.has(r.pid) && kids.has(r.ppid)) { kids.add(r.pid); grew = true } }
  const t = Date.now(), now = {}
  for (const r of rows) if (kids.has(r.pid)) now[r.pid] = { type: /--type=([\w-]+)/.exec(r.cmd)?.[1] ?? 'browser', cpu: r.cpu }
  if (psPrev) {
    const dt = (t - psPrev.t) / 1000, by = { renderer: 0, gpu: 0, other: 0 }
    for (const [pid, p] of Object.entries(now)) {
      const q = psPrev.now[pid]; if (!q) continue
      const pct = (p.cpu - q.cpu) / dt * 100
      if (p.type === 'renderer') by.renderer = Math.max(by.renderer, pct)   // the game's renderer is the busy one
      else if (p.type === 'gpu-process') by.gpu += pct
      else by.other += pct
    }
    procs.push({ t, ...by })
  }
  psPrev = { t, now }
}
const psTimer = setInterval(psSample, 2000)

const vites = []
const shutdown = () => { clearInterval(psTimer); try { io.kill() } catch {} for (const v of vites) try { v.kill() } catch {} }
process.on('exit', shutdown)
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { shutdown(); process.exit(1) })
for (const b of BUILDS) {
  b.port = await freePort()
  const v = spawn(process.execPath, [join(b.dir, 'node_modules/vite/bin/vite.js'), '--port', String(b.port), '--strictPort'], { cwd: b.dir, stdio: 'ignore' })
  vites.push(v)
  if (!await until(() => fetch(`http://localhost:${b.port}/`).then(r => r.ok), 20000)) { console.error(`vite never served ${b.dir}`); process.exit(1) }
  b.commit = git(b.dir, 'rev-parse', '--short', 'HEAD'); b.branch = git(b.dir, 'rev-parse', '--abbrev-ref', 'HEAD')
  b.dirty = git(b.dir, 'status', '--porcelain', '--', 'src', 'data') !== ''
}

// ── the page side: the virtual pad, the autopilot, the 1 Hz probe ─────────────────────────────────────────────────────
// Injected once a story run is live. window.__bench.phase drives it: 'drive' (pursuit), 'stop' (brake to rest), 'map'
// (stick pan/zoom), 'idle' (hands off). Everything it records is read back by the harness per phase.
const PAGE = String.raw`(async () => {
  const { RANGER_PARAMS: P } = await import('/data/ranger.js')
  const road = window.__road(), seed = window.__seed ?? 1
  const axes = [0, 0, 0, 0], buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }))
  const gp = { id: 'perf-40 bench', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes, buttons, vibrationActuator: null }
  Object.defineProperty(navigator, 'getGamepads', { value: () => [gp], configurable: true })
  const B = window.__bench = { phase: 'idle', dist: 0, recov: [], samples: [], frames: [], chunks0: null, chunks: new Set(), log: [], seatAt: null }
  const setPad = (steer, thr, brk, lx = 0, ly = 0) => {
    axes[0] = steer; axes[1] = ly; axes[2] = 0; axes[3] = lx
    buttons[7].value = thr; buttons[7].pressed = thr > 0.05; buttons[6].value = brk; buttons[6].pressed = brk > 0.05
  }
  // ── the route (drive-soak's makeRouter): a walk over the network's edges, junctions by end proximity ──
  let s = seed >>> 0
  const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const edges = [...road._network.values()].filter(e => e.points?.length >= 2)
  const ends = [], node = new Map(), nodes = []
  for (const e of edges) ends.push({ e, end: 0, p: e.points[0] }, { e, end: 1, p: e.points.at(-1) })
  for (const en of ends) { let n = nodes.find(m => Math.hypot(m.x - en.p.x, m.z - en.p.z) < 6); if (!n) { n = { x: en.p.x, z: en.p.z, ends: [] }; nodes.push(n) } n.ends.push(en); node.set(en, n) }
  const endOf = (e, end) => ends.find(x => x.e === e && x.end === end)
  const heading = (a, b) => Math.atan2(b.z - a.z, b.x - a.x)
  const leaving = (en) => { const pts = en.e.points, k = Math.min(3, pts.length - 1); return en.end === 0 ? heading(pts[0], pts[k]) : heading(pts.at(-1), pts.at(-1 - k)) }
  const path = []
  const push = (en, jump = false) => { const pts = en.end === 0 ? en.e.points : [...en.e.points].reverse(); pts.forEach((q, i) => path.push(i === 0 && jump ? { x: q.x, z: q.z, jump: true } : { x: q.x, z: q.z })) }
  // Start on the edge nearest the truck, heading the way the truck points.
  const v0 = window.__vs.position
  let cur = null, bd = Infinity
  for (const en of ends) { const d = Math.min(...en.e.points.map(q => Math.hypot(q.x - v0.x, q.z - v0.z))); if (d < bd) { bd = d; cur = en } }
  push(cur)
  const extend = () => {
    const far = endOf(cur.e, 1 - cur.end), n = node.get(far)
    const arrive = heading(path.at(-Math.min(4, path.length)), path.at(-1))
    const next = n.ends.filter(x => x.e !== cur.e && Math.abs(Math.atan2(Math.sin(leaving(x) - arrive), Math.cos(leaving(x) - arrive))) < 100 * Math.PI / 180)
    if (next.length) { cur = next[Math.floor(rng() * next.length)]; push(cur) }
    else { cur = endOf(edges[Math.floor(rng() * edges.length)], rng() < 0.5 ? 0 : 1); push(cur, true) }
  }
  let idx = 0
  { let bi = 0, bdd = Infinity; path.forEach((q, i) => { const d = Math.hypot(q.x - v0.x, q.z - v0.z); if (d < bdd) { bdd = d; bi = i } }); idx = bi }
  // ── recovery: seat on the route AHEAD (the streaming front keeps moving), counted ──
  let settle = 0
  const seat = (i, why) => {
    idx = Math.min(i, path.length - 2)
    const a = path[idx], b = path[Math.min(idx + 3, path.length - 1)]
    B.recov.push({ why, t: +(performance.now() / 1000).toFixed(1), at: [Math.round(window.__vs.position.x), Math.round(window.__vs.position.z)] })
    setPad(0, 0, 0)
    window.__teleport(a.x, a.z, Math.atan2(-(b.x - a.x), -(b.z - a.z)))
    settle = 2.5
  }
  const V_MAX = 24, A_LAT = 3.5, A_BRAKE = 3
  let stuckT = 0, flipT = 0, lostT = 0, offroad = null, offDone = false, last = performance.now()
  const tick = () => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now
    const vs = window.__vs, p = vs.position, v = Math.hypot(vs.velocity.x, vs.velocity.z), q = vs.quaternion
    if (B.phase === 'drive') {
      if (settle > 0) { settle -= dt; setPad(0, 0, 0) }
      else {
        B.dist += v * dt
        while (idx < path.length - 2 && !path[idx + 1].jump && Math.hypot(path[idx + 1].x - p.x, path[idx + 1].z - p.z) <= Math.hypot(path[idx].x - p.x, path[idx].z - p.z)) idx++
        while (path.length - idx < 80) extend()
        if (path[idx + 1]?.jump && Math.hypot(path[idx].x - p.x, path[idx].z - p.z) < 6) { seat(idx + 1, 'route jump'); requestAnimationFrame(tick); return }
        let target, vT
        if (offroad) {
          target = offroad.to; vT = 9
          if (Math.hypot(target.x - p.x, target.z - p.z) < 8 || now - offroad.t0 > 40000) {
            let bi = idx, b2 = Infinity
            for (let j = Math.max(0, idx - 200); j < path.length; j++) { const d = Math.hypot(path[j].x - p.x, path[j].z - p.z); if (d < b2) { b2 = d; bi = j } }
            idx = bi; offroad = null
          }
        }
        let inBore = false
        if (!offroad) {
          const nr = road.queryNearest(p.x, p.z, 15)
          inBore = !!nr && !!road.tunnelSpanAt?.(nr.runKey ?? '', nr.arcS ?? 0, -20)
          const L = inBore ? Math.max(4, 0.6 * v) : Math.max(6, 0.9 * v)
          let j = idx, acc = 0
          while (j < path.length - 1 && acc < L && !path[j + 1].jump) { acc += Math.hypot(path[j + 1].x - path[j].x, path[j + 1].z - path[j].z); j++ }
          target = path[j]
          const ahead = []
          for (let a = idx, arc = 0, lst = path[idx]; a < path.length - 1 && arc < 90; a++) {
            const qq = path[a + 1]; if (qq.jump) break
            const ds = Math.hypot(qq.x - lst.x, qq.z - lst.z)
            if (ds >= 8 || !ahead.length) { arc += ds; ahead.push({ ...qq, s: arc }); lst = qq }
          }
          let vPlan = V_MAX
          for (let a = 0; a + 2 < ahead.length; a++) {
            const A = ahead[a], Bp = ahead[a + 1], C = ahead[a + 2]
            const ab = Math.hypot(Bp.x - A.x, Bp.z - A.z), bc = Math.hypot(C.x - Bp.x, C.z - Bp.z), ca = Math.hypot(A.x - C.x, A.z - C.z)
            const cross = Math.abs((Bp.x - A.x) * (C.z - A.z) - (Bp.z - A.z) * (C.x - A.x))
            if (cross > 1e-6) vPlan = Math.min(vPlan, Math.sqrt(A_LAT * ab * bc * ca / (2 * cross) + 2 * A_BRAKE * Bp.s))
          }
          vT = Math.min(inBore ? 10 : V_MAX, vPlan)
          // One off-road leg, halfway: 120–200 m out to one side over whatever is there, then back to the route.
          if (!offDone && B.dist > B.legAt && !inBore) {
            offDone = true
            const hx = target.x - p.x, hz = target.z - p.z, hl = Math.hypot(hx, hz) || 1, side = rng() < 0.5 ? -1 : 1, d = 120 + rng() * 80
            offroad = { t0: now, to: { x: p.x + (hx / hl) * 40 + (-hz / hl) * side * d, z: p.z + (hz / hl) * 40 + (hx / hl) * side * d } }
          }
        }
        // Pure pursuit on the body's heading. Forward is −Z rotated by q.
        const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y))
        const hdg = Math.atan2(fx, fz), want = Math.atan2(target.x - p.x, target.z - p.z)
        const alpha = Math.atan2(Math.sin(want - hdg), Math.cos(want - hdg))
        const Ld = Math.max(4, Math.hypot(target.x - p.x, target.z - p.z))
        const lim = P.maxSteerAngle / (1 + v / P.speedSteerRef)      // full stick = this, with the steering assist on
        const desired = Math.atan2(2 * P.wheelbase * Math.sin(alpha), Ld)
        if (Math.abs(desired) > 0.95 * lim) vT = Math.min(vT, 0.7 * v)
        const e = vT - v
        setPad(Math.max(-1, Math.min(1, desired / lim)), e > 0 ? Math.min(1, 0.25 + 0.35 * e) : 0, e < -1.5 ? Math.min(1, -0.15 * e) : 0)
        // Recovery triggers.
        const upY = 1 - 2 * (q.x * q.x + q.z * q.z)
        stuckT = v < 1 && buttons[7].value > 0 ? stuckT + dt : 0
        flipT = upY < 0.3 ? flipT + dt : 0
        let lat = Infinity; for (let j = Math.max(0, idx - 5); j < Math.min(path.length, idx + 5); j++) lat = Math.min(lat, Math.hypot(path[j].x - p.x, path[j].z - p.z))
        lostT = !offroad && lat > 15 ? lostT + dt : 0
        if (stuckT > 4) seat(idx + 12, 'stuck'); else if (flipT > 2) seat(idx + 12, 'flipped'); else if (lostT > 3) seat(idx + 12, 'off the route')
      }
    } else if (B.phase === 'stop') setPad(0, 0, v > 0.3 ? 0.8 : 0)
    else if (B.phase === 'map') { const k = Math.floor(now / 5000) % 6; setPad(0, 0, 0, [0, -0.8, 0, 0.8, 0, 0][k], [0.8, 0, -0.8, 0, 0.6, -0.6][k] * (k < 4 ? 1 : 0)); if (k >= 4) axes[3] = k === 4 ? 0.7 : -0.7 }
    else setPad(0, 0, 0)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  // 1 Hz probe: per-bucket main-thread ms (deltas), the frames since the last probe, renderer info, new terrain chunks.
  const S = { n: 0, b: {} }
  setInterval(() => {
    const D = window.__perfData(), n = D.buckets['frame.render']?.n ?? 0, dn = n - S.n
    const cpu = {}; for (const k in D.buckets) { const d = D.buckets[k].ms - (S.b[k] ?? 0); if (k.startsWith('frame.') && d > 0) cpu[k] = d; S.b[k] = D.buckets[k].ms }
    S.n = n
    const fr = D.frames.slice(-Math.max(0, Math.min(dn, D.frames.length)))
    const ri = window.__ri()
    const keys = [...window.__terrain()._chunkMap.keys()]
    if (B.phase === 'drive') { if (!B.chunks0) B.chunks0 = new Set(keys); for (const k of keys) if (!B.chunks0.has(k)) B.chunks.add(k) }
    B.samples.push({ t: Date.now(), phase: B.phase, frames: dn, cpu, tris: ri.triangles, calls: ri.calls, map: window.__map2d().isOpen(), v: Math.hypot(window.__vs.velocity.x, window.__vs.velocity.z) })
    B.frames.push(...fr.map(f => [B.phase, f]))
  }, 1000)
  return { edges: edges.length, path: path.length }
})()`

// ── one session: boot, story, the three phases ────────────────────────────────────────────────────────────────────
async function session (build, seed, rep) {
  const cdp = await freePort()
  const { chrome, cleanup } = launchChrome('about:blank', { port: cdp, headed: has('headed'), windowSize: '1045,700', extraArgs: ['--force-device-scale-factor=2'] })
  psRoot = chrome.pid; psPrev = null
  const client = await connect({ port: cdp, cmdTimeoutMs: 120000 })
  await client.cmd('Runtime.enable')
  const errors = []
  client.on('Runtime.exceptionThrown', p => errors.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text))
  const js = async e => { const m = await client.cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (m.result?.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 400)); return m.result?.result?.value }
  const key = (k, down) => client.cmd('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', key: k, code: k === ' ' ? 'Space' : k.length === 1 ? `Key${k.toUpperCase()}` : k, windowsVirtualKeyCode: k === ' ' ? 32 : k === 'Enter' ? 13 : k.toUpperCase().charCodeAt(0) })
  const tap = async k => { await key(k, true); await sleep(150); await key(k, false) }
  const load = +(loadavg()[0] / cpus().length).toFixed(2)
  const tag = `${build.name} seed ${seed} rep ${rep + 1}`
  try {
    await client.cmd('Page.navigate', { url: `http://localhost:${build.port}/index.html?prof=1` })
    if (!await until(() => js('!!document.getElementById("pm-story") && window.__rsReady === true'), 90000)) throw new Error('the menu never came up')
    await js('document.getElementById("pm-story").click()')
    await js(`document.getElementById("su-seed").value = "${seed}"; document.getElementById("su-start").click()`)
    const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
    if (!await until(() => js(live), 180000)) throw new Error('story never went live')
    const dlg = () => js('getComputedStyle(document.getElementById("dialogue-panel")).display !== "none"')
    for (let i = 0; i < 30 && await dlg(); i++) { await tap('Enter'); await sleep(300) }
    await sleep(2000)
    if (await js('window.__vs.ignition?.state') !== 'running') { await key('i', true); await until(() => js('window.__vs.ignition?.state === "running"'), 8000); await key('i', false) }
    if (await js('!!window.__vs.parked')) await tap(' ')
    await js(`window.__seed = ${seed}`)
    const info = await js(PAGE)
    await js(`window.__bench.legAt = ${MIN_KM * 500}`)   // the off-road leg halfway through the minimum distance
    const phase = async (name, s) => { const t0 = Date.now(); await js(`window.__bench.phase = '${name}'`); await sleep(s * 1000); return [t0, Date.now()] }
    const win = {}
    win.drive = await phase('drive', DRIVE_S)
    await phase('stop', 6); await tap(' ')                  // at rest, latch the park brake
    await tap('m'); await until(() => js('window.__map2d().isOpen()'), 3000)
    win.map = await phase('map', MAP_S)
    await js(`window.__bench.phase = 'idle'`); await tap('m'); await until(() => js('!window.__map2d().isOpen()'), 3000)
    await sleep(2000)
    win.park = await phase('idle', PARK_S)
    const B = await js(`(() => { const B = window.__bench; return { dist: B.dist, recov: B.recov, chunks: B.chunks.size, samples: B.samples, frames: B.frames } })()`)
    const r = summarise(B, win)
    r.drive = { km: +(B.dist / 1000).toFixed(2), newChunks: B.chunks, recoveries: B.recov, edges: info.edges }
    r.valid = r.drive.km >= MIN_KM && r.drive.newChunks >= MIN_CHUNKS
    r.errors = errors.slice(0, 5)
    Object.assign(r, { build: build.name, dir: build.dir, commit: build.commit, branch: build.branch, dirty: build.dirty, seed, rep, load })
    console.log(`${tag}: ${r.valid ? 'ok' : 'INVALID'} — ${r.drive.km} km, ${r.drive.newChunks} new chunks, ${r.drive.recoveries.length} recoveries · load ${load}/core`)
    for (const ph of ['drive', 'map', 'park']) console.log('   ' + line(ph, r.phases[ph]))
    return r
  } catch (e) {
    console.log(`${tag}: FAILED — ${e.message}`)
    return { build: build.name, seed, rep, valid: false, failed: e.message, load }
  } finally { client.close(); cleanup(); psRoot = 0 }
}

const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN
const pct = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] }
function summarise (B, win) {
  const phases = {}
  for (const [ph, [t0, t1]] of Object.entries(win)) {
    const lo = t0 + 3000   // the phase's first 3 s are the transition (map open, braking)
    const S = B.samples.filter(s => s.t >= lo && s.t <= t1)
    const pname = { drive: 'drive', map: 'map', park: 'idle' }[ph]
    const fr = B.frames.filter(f => f[0] === pname).map(f => f[1])
    const W = power.filter(p => p.t >= lo && p.t <= t1), Pr = procs.filter(p => p.t >= lo && p.t <= t1)
    const buckets = {}
    for (const s of S) for (const [k, v] of Object.entries(s.cpu)) buckets[k] = (buckets[k] ?? 0) + v / S.length
    const main = Object.values(buckets).reduce((a, b) => a + b, 0)
    phases[ph] = {
      fps: +mean(S.map(s => s.frames)).toFixed(1), p95: +pct(fr, 0.95).toFixed(1), worst: +Math.max(...fr, 0).toFixed(1),
      mainMs: +main.toFixed(0), buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k.slice(6), +v.toFixed(1)]).sort((a, b) => b[1] - a[1])),
      cpuW: +mean(W.map(p => p.cpuW)).toFixed(2), gpuW: +mean(W.map(p => p.gpuW)).toFixed(2), dramW: +mean(W.map(p => p.dramW)).toFixed(2),
      gpuMcyc: +mean(W.map(p => (p.gpuBusy ?? 0) / 100 * (p.gpuMHz ?? 0))).toFixed(0), gpuMHz: +mean(W.map(p => p.gpuMHz ?? 0)).toFixed(0),
      rendererPct: +mean(Pr.map(p => p.renderer)).toFixed(0), gpuProcPct: +mean(Pr.map(p => p.gpu)).toFixed(0), otherPct: +mean(Pr.map(p => p.other)).toFixed(0),
      workersPct: +(mean(Pr.map(p => p.renderer)) - main / 10).toFixed(0),   // renderer − main thread (ms/s ÷ 10 = % of a core)
      ktris: +(mean(S.map(s => s.tris)) / 1000).toFixed(0), calls: +mean(S.map(s => s.calls)).toFixed(0),
    }
  }
  return { phases }
}
const line = (ph, x) => `${ph.padEnd(5)} ${String(x.fps).padStart(4)} fps p95 ${String(x.p95).padStart(5)} worst ${String(x.worst).padStart(5)} | main ${String(x.mainMs).padStart(4)} ms/s | `
  + `rend ${x.rendererPct}% (workers ~${x.workersPct}%) gpuP ${x.gpuProcPct}% | CPU ${x.cpuW} W GPU ${x.gpuW} W DRAM ${x.dramW} W | GPU ${x.gpuMcyc} Mcyc/s @ ${x.gpuMHz} MHz | ${x.ktris}k tris`

// ── run: A-B-A-B per rep and seed ─────────────────────────────────────────────────────────────────────────────────────
console.log(`PERF-40 bench → ${OUT}`)
for (const b of BUILDS) console.log(`  ${b.name}: ${b.dir} ${b.branch}@${b.commit}${b.dirty ? ' (uncommitted src/data changes)' : ''}`)
console.log(`  seeds ${SEEDS.join(', ')} · reps ${REPS} · drive ${DRIVE_S} s (valid ≥ ${MIN_KM} km, ≥ ${MIN_CHUNKS} new chunks) · map ${MAP_S} s · park ${PARK_S} s\n`)
const results = []
for (let rep = 0; rep < REPS; rep++) for (const seed of SEEDS) {
  const order = rep % 2 ? [...BUILDS].reverse() : BUILDS
  for (const b of order) { const r = await session(b, seed, rep); results.push(r); writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1)) }
}

// ── report: per build and phase, the mean over valid sessions; the noise band is the spread between reps ─────────────
const KEYS = ['fps', 'p95', 'mainMs', 'workersPct', 'cpuW', 'gpuW', 'gpuMcyc', 'dramW']
const agg = {}
for (const b of BUILDS) for (const ph of ['drive', 'map', 'park']) {
  const rs = results.filter(r => r.build === b.name && r.valid)
  const o = agg[`${b.name}.${ph}`] = {}
  for (const k of KEYS) {
    o[k] = mean(rs.map(r => r.phases[ph][k]))
    // Noise: per seed, the spread between its reps; the band is the mean of those spreads (n/a with one rep).
    const spreads = SEEDS.map(sd => rs.filter(r => r.seed === sd).map(r => r.phases[ph][k])).filter(a => a.length > 1).map(a => Math.max(...a) - Math.min(...a))
    o[k + '±'] = spreads.length ? mean(spreads) : null
  }
}
const invalid = results.filter(r => !r.valid)
console.log(`\n═══ ${results.length - invalid.length} of ${results.length} sessions valid${invalid.length ? ' — INVALID: ' + invalid.map(r => `${r.build}/${r.seed}/${r.rep + 1} (${r.failed ?? `${r.drive?.km} km, ${r.drive?.newChunks} chunks`})`).join(', ') : ''}`)
const fmt = (v, b) => isNaN(v) ? '   –  ' : (b == null ? v.toFixed(v < 10 ? 2 : 0) : `${v.toFixed(v < 10 ? 2 : 0)}±${b.toFixed(b < 10 ? 2 : 0)}`)
console.log('phase build ' + KEYS.map(k => k.padStart(12)).join(''))
for (const ph of ['drive', 'map', 'park']) {
  for (const b of BUILDS) { const o = agg[`${b.name}.${ph}`]; console.log(`${ph.padEnd(5)} ${b.name.padEnd(5)} ` + KEYS.map(k => fmt(o[k], o[k + '±']).padStart(12)).join('')) }
  if (BUILDS.length === 2) {
    const a = agg[`A.${ph}`], b = agg[`B.${ph}`]
    console.log(`${''.padEnd(5)} B−A   ` + KEYS.map(k => { const d = b[k] - a[k], band = Math.max(a[k + '±'] ?? 0, b[k + '±'] ?? 0); return (isNaN(d) ? '–' : `${d >= 0 ? '+' : ''}${d.toFixed(Math.abs(d) < 10 ? 2 : 0)}${band && Math.abs(d) <= band ? '~' : ''}`).padStart(12) }).join(''))
  }
}
if (BUILDS.length === 2) console.log('(~ = within the noise band)')
writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ builds: BUILDS.map(({ name, dir, commit, branch, dirty }) => ({ name, dir, commit, branch, dirty })), seeds: SEEDS, reps: REPS, agg }, null, 1))

// ── health check: one line per build into the committed history, compared with the last line for that branch ──────────
if (has('record')) {
  const H = join(ROOT, '.planning/perf/history.jsonl')
  mkdirSync(dirname(H), { recursive: true })
  const prev = existsSync(H) ? readFileSync(H, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []
  for (const b of BUILDS) {
    const rec = { t: new Date().toISOString(), commit: b.commit, branch: b.branch, dirty: b.dirty, seeds: SEEDS, reps: REPS, drive: DRIVE_S,
      valid: results.filter(r => r.build === b.name && r.valid).length, of: results.filter(r => r.build === b.name).length,
      phases: Object.fromEntries(['drive', 'map', 'park'].map(ph => [ph, Object.fromEntries(KEYS.map(k => [k, +(agg[`${b.name}.${ph}`][k] ?? NaN).toFixed(2)]))])) }
    const last = prev.filter(p => p.drive === DRIVE_S && p.valid > 0).at(-1)
    if (last) {
      const worse = []
      for (const ph of ['drive', 'map', 'park']) for (const k of ['mainMs', 'cpuW', 'gpuW', 'gpuMcyc']) {
        const a = last.phases[ph][k], c = rec.phases[ph][k]
        if (a > 0 && c > a * 1.15) worse.push(`${ph} ${k} ${a} → ${c} (+${Math.round((c / a - 1) * 100)} %)`)
      }
      console.log(`\nvs the last record (${last.commit}, ${last.t.slice(0, 10)}): ${worse.length ? 'WORSE by > 15 %: ' + worse.join(' · ') : 'nothing worse by > 15 %'}`)
    }
    appendFileSync(H, JSON.stringify(rec) + '\n')
  }
  console.log(`recorded → ${H}`)
}
process.exit(invalid.length ? 2 : 0)
