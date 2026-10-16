// test/chunk-audit.mjs — BUG-73 hunting tool: load the app fresh, park the freecam, then audit
// every resident terrain chunk from INSIDE the page — geometry mean Y vs the stored raw heights,
// mean grass / rock / carve share from aSurf, mean colour greenness — and flag any chunk that is
// high (above the treeline) yet vegetated, which the biome ladder cannot legitimately produce.
// Usage: node test/chunk-audit.mjs [port=3754] [seed=w] [x=197] [z=634] [camY=190]
// Writes a screenshot next to the report. Not a gate.
import { writeFileSync } from 'node:fs'
import { launchChrome, connect, sleep } from './lib/cdp.mjs'
const [PORT = '3754', SEED = 'w', X = '197', Z = '634', CAMY = '190'] = process.argv.slice(2)
const S = process.cwd()
launchChrome(`http://localhost:${PORT}/index.html?nomenu=1&seed=${SEED}&nofog=1`, { port: 9555 })
await sleep(2500)
const c = await connect({ port: 9555 })
await sleep(9000)
for (let i = 0; i < 30; i++) { const r = await c.evalJS(`typeof window.__view==='function'`); if (r.val) break; await sleep(500) }
await c.evalJS(`window.__view(${X}, ${CAMY}, ${Z}, 0, -1.0)`)
await sleep(7000)
const r = await c.evalJS(`(() => {
  const ts = window.__terrain && window.__terrain(); if (!ts) return 'no ts'
  const p = ts._params; const out = { treeLo: p.terrainTreelineLo, treeHi: p.terrainTreelineHi, chunks: [] }
  for (const [key, ch] of ts._chunkMap) {
    const g = ch.mesh && ch.mesh.geometry; if (!g) { out.chunks.push({ key, nogeo: true }); continue }
    const pos = g.attributes.position, col = g.attributes.color, sf = g.attributes.aSurf
    let y = 0, gr = 0, sx = 0, sz = 0, sw = 0, n = pos.count, hh = 0, hmin = 1e9, hmax = -1e9
    for (let i = 0; i < n; i++) { y += pos.getY(i); if (col) gr += col.getY(i) - col.getX(i); if (sf) { sx += sf.getX(i); sz += sf.getZ(i); sw += sf.getW(i) } }
    if (ch.heights) for (let i = 0; i < ch.heights.length; i++) { const v = ch.heights[i]; hh += v; if (v < hmin) hmin = v; if (v > hmax) hmax = v }
    out.chunks.push({ key, meanY: +(y / n).toFixed(1), meanH: ch.heights ? +(hh / ch.heights.length).toFixed(1) : null, hSpan: ch.heights ? +(hmax - hmin).toFixed(1) : null, green: +(gr / n).toFixed(3), grass: +(sx / n).toFixed(2), rock: +(sz / n).toFixed(2), carve: +(sw / n).toFixed(2), hasCol: !!col, hasSurf: !!sf })
  }
  return JSON.stringify(out)
})()`)
const d = JSON.parse(r.val)
console.log('treeline', d.treeLo, d.treeHi, 'chunks', d.chunks.length)
const bad = d.chunks.filter(k => k.meanY > 150 && k.grass > 0.4)
console.log('HIGH-BUT-GREEN chunks:', bad.length); for (const k of bad) console.log(' ', JSON.stringify(k))
console.log('sample of normal chunks:'); for (const k of d.chunks.slice(0, 6)) console.log(' ', JSON.stringify(k))
const shot = await c.cmd('Page.captureScreenshot', { format: 'jpeg', quality: 70 })
writeFileSync(`${S}/chunk-audit.jpg`, Buffer.from(shot.result.data, 'base64')); console.log('screenshot: chunk-audit.jpg')
c.close(); process.exit(0)
