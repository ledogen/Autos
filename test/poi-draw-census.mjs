// test/poi-draw-census.mjs — BUG-164: what the POI markers cost the renderer, by distance from the truck.
//
// Boots story mode on each seed (the menu, like playtest-bench), parks at the run's start, and then:
//   1. CENSUS — every top-level child of the 'poi-markers' group: what it is, how far from the truck, whether
//      it is drawn (visible), its meshes and triangles. Binned near / far at the drawn-terrain radius
//      ((terrain ring + 1) · 64 m, main.js poiRingShowR — the reach the rings already burn out to).
//   2. COST — renderer.render() is wrapped from outside (a timer and renderer.info read per call, shadow pass
//      included), the freecam is set at the truck at +3 m and turned through four headings, 5 s each, under three
//      configs: AS-IS, FAR-HIDDEN (every marker child past the radius forced hidden), NONE (the whole group
//      hidden). Per-second render ms/s (median / p99 / worst), draw calls and triangles per frame (median).
//   3. SHOTS — one PNG per seed toward the nearest far POI model, as-is and far-hidden, into --out.
// Not a gate. Needs a dev server: node test/poi-draw-census.mjs --port=8043 [--seeds=a,b,c] [--out=wip/bug-164]
// Run under tools/chrome-slot.sh.
import { writeFileSync, mkdirSync } from 'node:fs'
import { launchChrome, connect, sleep } from './lib/cdp.mjs'

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d }
const PORT = +arg('port', 8043), CDP = +arg('cdp', 9351), OUT = arg('out', 'wip/bug-164')
const SEEDS = arg('seeds', '1768572700,17535907,759313244').split(',').map(Number)   // playtest-bench's pinned random seeds
const TAG = arg('tag', 'run')
mkdirSync(OUT, { recursive: true })
const until = async (fn, ms, every = 250) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn().catch(() => null); if (v) return v; await sleep(every) } return null }

const PAGE_INIT = String.raw`(() => {
  const r = window.__renderer(), scene = window.__terrain()._scene, grp = scene.getObjectByName('poi-markers')
  const P = window.__probe = { grp, rec: null }
  const orig = r.render.bind(r)
  r.render = (s, c) => {
    const t0 = performance.now(); orig(s, c); const ms = performance.now() - t0
    if (P.rec) P.rec.push([t0, ms, r.info.render.calls, r.info.render.triangles])
  }
  P.R = () => ((window.__terrain()._ringRadius ?? 2) + 1) * 64
  P.tris = (o) => { let n = 0, m = 0; o.traverseVisible(x => { if (x.isMesh) { m++; const g = x.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3 } }); return [m, n] }
  // a top-level child is a marker, a ring, or (BUG-164 on) a per-POI yard Group at the origin carrying its anchor
  P.at = (c) => c.userData.x !== undefined ? { x: c.userData.x, z: c.userData.z, o: c.children[0] ?? c } : { x: c.position.x, z: c.position.z, o: c }
  P.census = () => {
    const v = window.__vs.position, R = P.R(), rows = []
    for (const c of grp.children) {
      const a = P.at(c), d = Math.hypot(a.x - v.x, a.z - v.z), o = a.o
      const kind = o.name.startsWith('model:') ? o.name : o.geometry ? (o.geometry.type === 'BoxGeometry' ? 'cube' : o.geometry.type) : 'group'
      const [meshes, tris] = P.tris(c)
      rows.push({ kind, d: Math.round(d), far: d > R, visible: c.visible, meshes, tris })
    }
    return { R, rows }
  }
  P.setFar = (hide) => { const v = window.__vs.position, R = P.R(); for (const c of grp.children) {
    if (hide) { c.userData._v = c.visible; const a = P.at(c); if (Math.hypot(a.x - v.x, a.z - v.z) > R) c.visible = false }
    else if (c.userData._v !== undefined) { c.visible = c.userData._v; delete c.userData._v } } }
  return true
})()`

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] }
const r2 = x => Math.round(x * 100) / 100

async function seedRun (client, js, seed) {
  await client.cmd('Page.navigate', { url: `http://localhost:${PORT}/index.html` })
  if (!await until(() => js('!!document.getElementById("pm-story") && window.__rsReady === true'), 90000)) throw new Error('menu never came up')
  await js('document.getElementById("pm-story").click()')
  await js(`document.getElementById("su-seed").value = "${seed}"; document.getElementById("su-start").click()`)
  const live = 'getComputedStyle(document.getElementById("run-hud")).display !== "none" && !document.body.classList.contains("stage-on") && window.__map2d()._getPois().length > 0'
  if (!await until(() => js(live), 180000)) throw new Error('story never went live')
  for (let i = 0; i < 30 && await js('getComputedStyle(document.getElementById("dialogue-panel")).display !== "none"'); i++) {
    await client.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await client.cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await sleep(300)
  }
  await sleep(8000)   // ring fill + the model loads
  await js(PAGE_INIT)
  await js(`(() => { const s = document.createElement('style'); s.textContent = '#hud,#cluster,#teleport-btn,#run-hud{display:none!important}'; document.head.appendChild(s) })()`)
  const census = await js('window.__probe.census()')
  const v = await js('({ x: window.__vs.position.x, y: window.__vs.position.y, z: window.__vs.position.z })')
  const eye = v.y + 3
  const cost = {}
  for (const cfg of ['asis', 'far', 'none']) {
    await js(cfg === 'far' ? 'window.__probe.setFar(true)' : cfg === 'none' ? 'window.__probe.grp.visible = false' : 'true')
    const rec = []
    for (let h = 0; h < 4; h++) {
      await js(`window.__view(${v.x}, ${eye}, ${v.z}, ${h * Math.PI / 2}, -0.05)`)
      await sleep(1500)
      await js('window.__probe.rec = []')
      await sleep(5000)
      rec.push(...await js('window.__probe.rec'))
    }
    await js('window.__probe.rec = null; window.__probe.setFar(false); window.__probe.grp.visible = true')
    const bySec = new Map()
    for (const [t, ms] of rec) { const k = Math.floor(t / 1000); bySec.set(k, (bySec.get(k) ?? 0) + ms) }
    const secs = [...bySec.values()].slice(1, -1)   // whole seconds only
    cost[cfg] = {
      frames: rec.length, msPerS: { med: r2(pct(secs, 0.5)), p99: r2(pct(secs, 0.99)), worst: r2(Math.max(...secs)) },
      msPerFrame: { med: r2(pct(rec.map(x => x[1]), 0.5)), p99: r2(pct(rec.map(x => x[1]), 0.99)) },
      calls: pct(rec.map(x => x[2]), 0.5), tris: pct(rec.map(x => x[3]), 0.5),
    }
  }
  // the shot: toward the nearest far POI model (a building beyond the drawn terrain), as-is vs far-hidden
  const tgt = await js(`(() => { const v = window.__vs.position, R = window.__probe.R(); let best = null
    for (const c of window.__probe.grp.children) { const a = window.__probe.at(c); if (!a.o.name.startsWith('model:')) continue
      const d = Math.hypot(a.x - v.x, a.z - v.z); if (d > R && (!best || d < best.d)) best = { d, x: a.x, y: a.o.position.y, z: a.z, name: a.o.name } }
    return best })()`)
  const shots = []
  if (tgt) {
    const dx = tgt.x - v.x, dz = tgt.z - v.z, yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(tgt.y + 4 - eye, Math.hypot(dx, dz))
    await js(`window.__view(${v.x}, ${eye}, ${v.z}, ${yaw}, ${pitch})`)
    for (const cfg of ['asis', 'far']) {
      await js(cfg === 'far' ? 'window.__probe.setFar(true)' : 'true')
      await sleep(2500)
      const shot = await client.cmd('Page.captureScreenshot', { format: 'png' })
      const f = `${OUT}/${TAG}-${seed}-${cfg}.png`
      writeFileSync(f, Buffer.from(shot.result.data, 'base64')); shots.push(f)
      await js('window.__probe.setFar(false)')
    }
  }
  return { seed, census, cost, target: tgt && { name: tgt.name, d: Math.round(tgt.d) }, shots }
}

const { cleanup } = launchChrome('about:blank', { port: CDP })
const client = await connect({ port: CDP, cmdTimeoutMs: 120000 })
await client.cmd('Runtime.enable')
const js = async e => { const m = await client.cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (m.result?.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 400)); return m.result?.result?.value }
const out = []
for (const seed of SEEDS) {
  try {
    const r = await seedRun(client, js, seed); out.push(r)
    const rows = r.census.rows, sum = (f) => rows.filter(f).reduce((a, x) => [a[0] + 1, a[1] + x.meshes, a[2] + x.tris], [0, 0, 0])
    const [nN, mN, tN] = sum(x => !x.far && x.visible), [nF, mF, tF] = sum(x => x.far && x.visible)
    console.log(`seed ${seed}  R=${r.census.R} m  drawn near: ${nN} objs ${mN} meshes ${tN} tris  |  drawn far: ${nF} objs ${mF} meshes ${tF} tris  (models far: ${rows.filter(x => x.far && x.kind.startsWith('model:')).length}, farthest ${Math.max(...rows.map(x => x.d))} m)`)
    for (const [k, c] of Object.entries(r.cost)) console.log(`  ${k.padEnd(5)} render ms/s med ${c.msPerS.med} p99 ${c.msPerS.p99} worst ${c.msPerS.worst} | ms/frame med ${c.msPerFrame.med} p99 ${c.msPerFrame.p99} | calls ${c.calls} tris ${c.tris} (${c.frames} frames)`)
    console.log(`  shot target ${r.target?.name} @ ${r.target?.d} m  ${r.shots.join(' ')}`)
  } catch (e) { console.log(`seed ${seed} FAILED: ${e.message}`) }
}
writeFileSync(`${OUT}/${TAG}-census.json`, JSON.stringify(out, null, 1))
client.close(); cleanup?.(); process.exit(0)
