// test/gpu-reset.mjs — BUG-182 rainy-day check, NOT a gate (needs Chrome + a dev server).
// Forces a GPU reset in the running game and fails if a baked picture stays blank afterwards.
//   node test/gpu-reset.mjs [port=3885] [--mode=webgl|crash|none] [--canvases]   (run it through tools/chrome-slot.sh)
// webgl: WEBGL_lose_context on the renderer (loseContext, then restoreContext), the cheap repeatable case.
// crash: CDP Browser.crashGpuProcess, the real GPU-process reset the owner hit (2D canvases lose theirs too).
// none:  no reset, the control (the day clock moves between the two measures; its drift is the noise floor).
// Measures, before and after: a freecam shot down at ground 420 m from the truck (all of it drawn from the terrain
// bake), one level at the fogged horizon (the fog cube), the gauge cluster's canvas, the open map's canvas and the
// far-prop impostor atlas. Blank = the share of near-black / transparent pixels jumps, or luminance falls > 35 %.
// Any page error fails it too. --canvases lists every 2D canvas with its blank share before → after.
import { launchChrome, connect, sleep } from './lib/cdp.mjs'
const PORT = +(process.argv.find(a => /^\d+$/.test(a)) ?? 3885)
const MODE = (process.argv.find(a => a.startsWith('--mode=')) ?? '--mode=webgl').slice(7)
const CDP = 9341
const { cleanup } = launchChrome('about:blank', { port: CDP })
const client = await connect({ port: CDP })
const js = async (e) => {
  const m = await client.cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })
  const R = m.result || {}
  if (R.exceptionDetails) throw new Error(R.exceptionDetails.exception?.description || R.exceptionDetails.text)
  return R.result?.value
}
const until = async (fn, ms) => { const t = Date.now() + ms; while (Date.now() < t) { if (await fn().catch(() => false)) return true; await sleep(500) } return false }
const errors = []
client.on('Runtime.exceptionThrown', (p) => { const d = p.exceptionDetails, x = d?.exception; errors.push(String(x?.description ?? x?.value ?? JSON.stringify(x)).split('\n')[0] + (d?.url ? ' @ ' + d.url.split('/').pop() + ':' + d.lineNumber : '')) })
client.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') errors.push(p.args.map(a => a.value ?? a.description).join(' ').slice(0, 200)) })
// Log every canvas context event, so the report says which canvases the browser told about the loss.
await client.cmd('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__ctxEv = []
  const get = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, ...a) {
    if (!this.__ctxHooked) {
      this.__ctxHooked = true; (window.__cvs ??= []).push(this); this.__stack = new Error().stack.split('\\n')[2]?.trim()
      const tag = type + ' ' + this.width + 'x' + this.height + (this.id ? ' #' + this.id : '')
      for (const ev of ['contextlost', 'contextrestored', 'webglcontextlost', 'webglcontextrestored']) this.addEventListener(ev, () => window.__ctxEv.push(ev + ' ' + tag))
    }
    return get.call(this, type, ...a)
  }` })

// The share of "blank" pixels (alpha 0 or every channel < 10) in a canvas, and its mean luminance.
const STATS = `(c) => { const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let blank = 0, lum = 0
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] === 0 || (d[i] < 10 && d[i + 1] < 10 && d[i + 2] < 10)) blank++; lum += d[i] + d[i + 1] + d[i + 2] }
  const n = d.length / 4; return { blank: +(blank / n).toFixed(3), lum: +(lum / n / 3).toFixed(1) } }`
const shotStats = async () => {
  const s = await client.cmd('Page.captureScreenshot', { format: 'png' })
  return js(`new Promise((res) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height
    c.getContext('2d').drawImage(im, 0, 0); res((${STATS})(c)) }; im.src = 'data:image/png;base64,${s.result.data}' })`)
}
const measure = async () => {
  // Straight down from 60 m over ground 420 m from the truck: all of it drawn from the terrain bake, too near to fog.
  await js('window.__map2d().hide(), window.__view(300, window.__terrain().analyticHeight(300, 300) + 60, 300, 0.8, -1.4), true')
  await sleep(3000)
  const ground = await shotStats()
  // Level at the horizon: far terrain under fog, whose colour is read from the fog cube.
  await js('window.__view(300, window.__terrain().analyticHeight(300, 300) + 25, 300, 0.8, -0.02), true')
  await sleep(2000)
  const fog = await shotStats()
  const cluster = await js(`(${STATS})(document.getElementById('cluster'))`)
  // The far-prop billboard atlas, read back by its own dev handle: tiles holding no prop.
  const impEmpty = await js(`(() => { const s = window.__impAtlasStats?.(); return s ? Object.values(s.tiles).filter(t => t === 'EMPTY').length : null })()`)
  await js('window.__map2d().show(), true')
  await sleep(4000)
  const map = await js(`(${STATS})(window.__map2d()._canvas ?? document.querySelector('#map2d canvas, canvas#map2d'))`)
  return { ground, fog, cluster, map, impEmpty }
}

let fail = 0
try {
  await client.cmd('Page.navigate', { url: `http://localhost:${PORT}/?nomenu=1&seed=6` })
  if (!await until(() => js('window.__rsReady === true && typeof window.__view === "function"'), 120000)) throw new Error('game never became ready')
  await sleep(15000)   // the terrain bake fills a few tiles a frame
  const before = await measure()
  await js(`window.__cvs.forEach(c => { if (!c.getContext('webgl2') && c.width) c.__pre = (${STATS})(c).blank }), true`)
  console.log('before ', JSON.stringify(before))
  if (MODE === 'crash') {
    const ver = await (await fetch(`http://localhost:${CDP}/json/version`)).json()
    const bws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise(r => bws.onopen = r)
    bws.send(JSON.stringify({ id: 1, method: 'Browser.crashGpuProcess' }))
    await sleep(500); bws.close()
  } else if (MODE === 'webgl') {
    await js('window.__renderer().forceContextLoss(), true')
    await sleep(1000)
    await js('window.__renderer().forceContextRestore(), true')
  }
  await sleep(8000)
  const after = await measure()
  console.log('after  ', JSON.stringify(after))
  console.log('events ', JSON.stringify(await js('window.__ctxEv')))
  if (process.argv.includes('--canvases')) console.log('canvases', JSON.stringify(await js(`window.__cvs.filter(c => !c.getContext('webgl2') && c.width).map(c => [c.width + 'x' + c.height + (c.id ? ' #' + c.id : ''), c.__stack, c.__pre, (${STATS})(c).blank])`), null, 1))
  for (const k of ['ground', 'fog', 'cluster', 'map']) {
    const jump = after[k].blank - before[k].blank, dl = after[k].lum - before[k].lum
    const bad = jump > 0.15 || dl < -0.35 * before[k].lum
    if (bad) fail++
    console.log(`${bad ? 'FAIL' : 'ok  '} ${k}: blank ${before[k].blank} → ${after[k].blank}, luminance ${before[k].lum} → ${after[k].lum}`)
  }
  const impBad = after.impEmpty === null || after.impEmpty > before.impEmpty
  if (impBad) fail++
  console.log(`${impBad ? 'FAIL' : 'ok  '} impostor atlas: empty tiles ${before.impEmpty} → ${after.impEmpty}`)
  if (errors.length) fail++
  if (errors.length) console.log('page errors:', errors.slice(0, 8))
} finally { cleanup(); client.close() }
console.log(fail ? `FAIL (${MODE}): ${fail} picture(s) stayed blank after the reset` : `PASS (${MODE})`)
process.exit(fail ? 1 : 0)
