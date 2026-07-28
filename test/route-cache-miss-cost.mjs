// test/route-cache-miss-cost.mjs — PERF-27: what a MISSED route-cache costs.
//
// route-store.js's loadRouteCacheAsset downloads, gunzips and JSON.parses the whole asset BEFORE it
// can compare `rec.sig` — the signature lives inside the file. So a player on any non-default seed
// pays the full main-thread inflate + parse of both assets purely to discover they do not match.
// This probe times that wasted work in isolation, under a CPU throttle, so the fix (a sidecar sig
// manifest, or the sig in the filename) can be costed against a real number instead of a guess.
//
// USAGE: node test/route-cache-miss-cost.mjs --port=8001 --cpu=4

import { launchChrome, connect, sleep } from './lib/cdp.mjs'

const argv = process.argv.slice(2)
const flag = (k, d) => { const f = argv.find(a => a.startsWith(`--${k}=`)); return f ? f.split('=').slice(1).join('=') : d }
const CPU  = Number(flag('cpu', 4))
const PORT = Number(flag('port', 8001)), CDP_PORT = Number(flag('cdp', 9222))

launchChrome(`http://localhost:${PORT}/index.html?prof=1`, { port: CDP_PORT })
const client = await connect({ port: CDP_PORT, cmdTimeoutMs: 180000 })
// cdp.mjs's evalJS does not await promises; this probe is entirely async, so go direct.
const evalOk = async e => {
  const m = await client.cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, { timeoutMs: 300000 })
  const R = m.result || {}
  if (R.exceptionDetails) throw new Error(R.exceptionDetails.text || JSON.stringify(R.exceptionDetails))
  return R.result?.value
}

for (let i = 0; i < 240; i++) { const r = await client.evalJS('window.__rsReady === true'); if (!r.err && r.val) break; await sleep(250) }
await sleep(2000)
if (CPU > 1) { await client.cmd('Emulation.setCPUThrottlingRate', { rate: CPU }); await sleep(1000) }

// The steps loadRouteCacheAsset takes, timed separately.
//
// NOTE on inflate: `vite preview` (and any server that sets content-encoding: gzip on a .gz)
// makes Chrome decompress transparently, so the app's own DecompressionStream branch never runs
// there — its gzip-magic check sees plain JSON bytes. GitHub Pages serves the file raw, so the
// deployed app DOES pay an inflate on top of everything below. The parse is the portable cost and
// the one that is unavoidably main-thread, so it is what this probe pins down.
const probe = async (file) => evalOk(`(async () => {
  const t0 = performance.now()
  const res = await fetch(${JSON.stringify(file)}, { cache: 'no-store' })
  const text = await res.text()
  const t1 = performance.now()
  const rec = JSON.parse(text)
  const t2 = performance.now()
  return { file: ${JSON.stringify(file)}, jsonMB: +(text.length / 1048576).toFixed(2),
           fetchMs: Math.round(t1 - t0), parseMs: Math.round(t2 - t1), totalMs: Math.round(t2 - t0),
           transparentlyInflated: !(text.charCodeAt(0) === 0x1f), sigLen: (rec.sig || '').length }
})()`)

console.log(`\n▶ route-cache miss cost — cpu ${CPU}×\n`)
let total = 0
for (const f of ['data/route-cache-default.json.gz', 'data/route-cache-region.json.gz']) {
  const r = await probe(f)
  total += r.totalMs
  console.log(`  ${r.file.split('/').pop().padEnd(30)} ${String(r.jsonMB).padStart(6)} MB JSON${r.transparentlyInflated ? ' (server pre-inflated)' : ' (raw gzip)'}`)
  console.log(`    fetch+read ${String(r.fetchMs).padStart(5)} ms · JSON.parse ${String(r.parseMs).padStart(5)} ms · total ${r.totalMs} ms`)
}
console.log(`\n  BOTH assets: ${total} ms of work a non-default seed does purely to learn the sig does not match.\n`)

if (CPU > 1) await client.cmd('Emulation.setCPUThrottlingRate', { rate: 1 })
client.close(); process.exit(0)
