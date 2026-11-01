// test/bug73-gpu-probe.mjs — BUG-73 rainy-day tool, NOT a gate: wrap WebGL draws; for every draw whose program uses `aSurf`, check in the
// BOUND VAO that the attribute array is enabled and has a buffer. Then churn the terrain pool with fast
// teleport hops along the owner's route on seed "w", auditing every resident chunk's aSurf + geometry
// identity per hop. Needs a running dev server.  Usage: node test/bug73-gpu-probe.mjs [hops=40] [port=3885]
import { launchChrome, connect, sleep } from './lib/cdp.mjs'
const HOPS = +(process.argv[2] ?? 40), PORT = +(process.argv[3] ?? 3885)
const { cleanup } = launchChrome('about:blank', { port: 9336 })
const client = await connect({ port: 9336 })
const js = async (e) => { const r = await client.evalJS(e); if (r.err) throw new Error(r.err); return r.val }
const until = async (fn, ms) => { const t = Date.now() + ms; while (Date.now() < t) { if (await fn().catch(() => false)) return true; await sleep(250) } return false }
await client.cmd('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__b73 = { draws: 0, terrainDraws: 0, bad: [], progs: new WeakMap() }
  for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) {
    const orig = C.prototype.drawElements
    C.prototype.drawElements = function (mode, count, type, off) {
      const s = window.__b73; s.draws++
      const prog = this.getParameter(this.CURRENT_PROGRAM)
      if (prog) {
        let loc = s.progs.get(prog)
        if (loc === undefined) { loc = this.getAttribLocation(prog, 'aSurf'); s.progs.set(prog, loc) }
        if (loc >= 0) {
          s.terrainDraws++
          const en = this.getVertexAttrib(loc, this.VERTEX_ATTRIB_ARRAY_ENABLED)
          const buf = this.getVertexAttrib(loc, this.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING)
          const size = this.getVertexAttrib(loc, this.VERTEX_ATTRIB_ARRAY_SIZE)
          if (!en || !buf || size !== 4) { if (s.bad.length < 50) s.bad.push({ t: performance.now() | 0, en, buf: !!buf, size, count }) }
        }
      }
      return orig.call(this, mode, count, type, off)
    }
  }` })
try {
  await client.cmd('Page.navigate', { url: `http://localhost:${PORT}/` })
  await until(() => js('!!window.__vs && document.getElementById("mm-new")?.offsetParent !== null'), 60000); await sleep(15000)
  await js('document.getElementById("mm-new").click()')
  await js('document.querySelector("[data-key=gameMode] .sel-next").click(); document.querySelector("[data-key=gameMode] .sel-next").click()')
  await js('document.getElementById("su-seed").value = "w"; document.getElementById("su-start").click()')
  await until(() => js('!document.body.classList.contains("stage-on")'), 90000); await sleep(3000)
  // The owner's route: out to (-1244,787) and (-1569,1173), then onward, hopping fast (no wait for ground).
  const way = [[-300, 200], [-700, 450], [-1000, 650], [-1244, 787], [-1400, 980], [-1569, 1173], [-1800, 1400], [-2100, 1600], [-1569, 1173], [-1244, 787], [-600, 300], [0, 0]]
  for (let h = 0; h < HOPS; h++) {
    const a = way[h % way.length], b = way[(h + 1) % way.length], f = (h % 3) / 3
    const x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f
    await js(`window.__teleport(${x}, ${z}, 0)`)
    await sleep(h % 4 === 3 ? 4000 : 1200)
    const s = await js(`(() => { const T = window.__terrain(), seen = new Map(); let cpu = []
      for (const [k, c] of T._chunkMap) {
        const g = c.mesh.geometry, a = g.attributes.aSurf
        if (seen.has(g)) cpu.push('shared geometry ' + k + ' & ' + seen.get(g)); seen.set(g, k)
        if (!a || a.itemSize !== 4 || a.count !== g.attributes.position.count) { cpu.push('aSurf missing/bad ' + k); continue }
        let zero = 0; for (let i = 0; i < a.count; i++) { const o = i * 4; if (a.array[o] + a.array[o + 1] + a.array[o + 2] + a.array[o + 3] < 1e-6) zero++ }
        if (zero > a.count * 0.5) cpu.push('aSurf mostly zero ' + k + ' (' + zero + ')')
        if (!c.heights || !c.heights.some((h) => h !== 0)) cpu.push('heights empty ' + k)
      }
      return { d: __b73.draws, t: __b73.terrainDraws, bad: __b73.bad.length, chunks: T._chunkMap.size, pool: T._geomPool.length, cpu: cpu.slice(0, 5) } })()`)
    if (h % 10 === 0 || s.bad || s.cpu.length) console.log(`hop ${h} (${x.toFixed(0)},${z.toFixed(0)}) terrain draws ${s.t} · GPU bad ${s.bad} · chunks ${s.chunks} · pool ${s.pool} · CPU ${s.cpu.length ? s.cpu.join('; ') : 'ok'}`)
    if (s.bad || s.cpu.length) { console.log(JSON.stringify(await js('__b73.bad'))); break }
  }
  console.log('final', JSON.stringify(await js('({ d: __b73.draws, t: __b73.terrainDraws, bad: __b73.bad })')))
} finally { cleanup(); client.close() }
