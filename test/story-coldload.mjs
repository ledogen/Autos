// test/story-coldload.mjs — PERF-27 item 2: cold boot → DRIVING IN STORY MODE.
//
// The number this tool exists to produce: how long a player waits, on a cold browser, before they
// are driving in story mode — the mode the intended audience actually enters. Free-roam boot
// (perf-runs/boot-diag.mjs, ?prof=1) only measures the first half.
//
// Unlike test/hitch-report.mjs, the CPU throttle is applied BEFORE navigation: hitch-report asks
// about steady-state play on a slow machine and throttles after settling, whereas here the load
// IS the measurement. --cpu=N stands in for an older machine (CDP Emulation.setCPUThrottlingRate).
//
// Phases reported (all measured from Page.navigate):
//   ready       window.__rsReady — free-roam boot done; BASE route cache awaited (QUAL-14)
//   ring        the chunk ring around spawn is full — the honest "could drive away" moment
//   enter       story entry called (script-side; the human cost before it is menu navigation)
//   live        __story()._phase === 'live' — region pre-routed, router frozen, wall armed
//
// --mode=reseed reports two extra things (PERF-27 item 3): `rebuild`, the moment the awaitable
// Path-B rebuild promise settles, and a per-step wall breakdown of _rebuildFullNow read back from
// the perf.js buckets. Between them they answer "which part of the world rebuild owns the ~25 s".
//
// Chrome gets a throwaway profile every launch, so the HTTP cache is always cold: both route-cache
// assets are re-downloaded per run. Serve the BUILT app (npm run build && npx vite preview), not
// the dev server — players get the bundle, and dev-server module serving is a different cost.
//
// USAGE:
//   npx vite preview --port 8001 &
//   node test/story-coldload.mjs --port=8001 --cpu=1
//   node test/story-coldload.mjs --port=8001 --cpu=4 --seed=811   # uncached region
//
// FLAGS: --cpu=N (1 = off) --seed=S (story seed; 6 = the pre-baked one) --port --cdp --headed
//        --mode=story|reseed  (reseed = free-roam seed change only — attributes entry cost)
//        --out=FILE --timeout=SECONDS (per phase; scaled by --cpu automatically)
// Not a gate. Never run by npm test.

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { launchChrome, connect, sleep } from './lib/cdp.mjs'

const argv = process.argv.slice(2)
const flag = (k, d) => { const f = argv.find(a => a.startsWith(`--${k}=`)); return f ? f.split('=').slice(1).join('=') : d }
const has = k => argv.includes(`--${k}`)
const CPU     = Number(flag('cpu', 1))
const SEED    = flag('seed', '6')
const PORT    = Number(flag('port', 8001)), CDP_PORT = Number(flag('cdp', 9222))
const HEADED  = has('headed')
const OUT     = flag('out', '')
const MODE    = flag('mode', 'story')   // story | reseed (reseed = seed change only, no story entry)
// Boot the world ALREADY on this seed. Entering story on the SAME seed skips the world rebuild, so
// `enter → live` is then the region warm ALONE — the only clean way to split entry cost between the
// cold-world rebuild and the region routing.
const BOOTSEED = flag('bootseed', '')
const BASE_TIMEOUT = Number(flag('timeout', 180)) * 1000 * Math.max(1, CPU)

try { const r = await fetch(`http://localhost:${PORT}/index.html`); if (!r.ok) throw 0 }
catch { console.error(`No server on :${PORT}. Run \`npm run build && npx vite preview --port ${PORT}\` first.`); process.exit(1) }

// about:blank first — the throttle has to be live before the app's first byte.
launchChrome('about:blank', { port: CDP_PORT, headed: HEADED })
const client = await connect({ port: CDP_PORT, cmdTimeoutMs: 120000 })

const exceptions = []
client.on('Runtime.exceptionThrown', p => exceptions.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text))

const evalOk = async expr => { const r = await client.evalJS(expr); if (r.err) throw new Error(`eval: ${r.err}`); return r.val }
const waitFor = async (expr, timeoutMs, label, pollMs = 100) => {
  const t = Date.now()
  while (Date.now() - t < timeoutMs) {
    const r = await client.evalJS(expr)
    if (!r.err && r.val) return Date.now() - T0
    await sleep(pollMs)
  }
  throw new Error(`timeout (${(timeoutMs / 1000) | 0}s) waiting for ${label}`)
}

if (CPU > 1) { await client.cmd('Emulation.setCPUThrottlingRate', { rate: CPU }); await sleep(500) }

const url = `http://localhost:${PORT}/index.html?prof=1${BOOTSEED ? `&seed=${BOOTSEED}` : ''}`
console.log(`\n▶ story cold load — mode ${MODE} · cpu ${CPU}× · seed ${SEED} · ${url}`)
console.log(`  (fresh Chrome profile ⇒ HTTP cache cold; route-cache assets re-downloaded)\n`)

const T0 = Date.now()
await client.cmd('Page.navigate', { url })

const tReady = await waitFor('window.__rsReady === true', BASE_TIMEOUT, '__rsReady')
console.log(`  ready       ${(tReady / 1000).toFixed(2)} s   free-roam boot (BASE cache awaited)`)

const RING = `(()=>{ const w = window.__world && window.__world(); if (!w) return false; const n = 2*(w.ring+w.warm)+1; return w.chunks >= n*n })()`
let tRing = null
try { tRing = await waitFor(RING, BASE_TIMEOUT, 'ring complete', 200) }
catch { console.log('  ring        (never completed — reported as null)') }
if (tRing) console.log(`  ring        ${(tRing / 1000).toFixed(2)} s   chunk ring full around spawn`)

// Story entry via the profiling handle — same call the seed modal's start button makes.
const hasStory = await evalOk('typeof (window.__story && window.__story()) === "object"')
if (!hasStory) { console.error('no window.__story handle — is ?prof=1 set and the build current?'); process.exit(1) }
const tEnter = Date.now() - T0
// --mode=reseed enters NOTHING: it just changes the world seed, which is the FIRST half of what
// story entry does. Story entry on an unbaked seed = this reseed (cold spawn-band routing, the
// cost QUAL-14's cache exists to hide) + the region warm. Measuring reseed alone is the only way
// to attribute the entry cost between them.
// PERF-27 item 3: `changeSeed` returns the awaitable Path-B rebuild promise (main.js __lever passes
// promises through), so the reseed is timed by AWAITING it — not by watching for an observable edge.
// The old teardown probe polled for the chunk ring to dip, which can never fire before the rebuild
// completes: rebuildAllChunksFromWorker is the last line of _rebuildFullNow.
// Stamped IN THE PAGE rather than awaited over CDP: the rebuild runs tens of seconds with the main
// thread starved, and a held-open Runtime.evaluate is exactly the thing that times out under that.
// Bucket snapshot immediately before the reseed. Diffed against the post-rebuild snapshot below,
// this attributes the MAIN-THREAD work that runs concurrently with the rebuild — which is the real
// question once you know routeImport is mostly a starved await, not loader work.
const bucketsBefore = MODE === 'reseed'
  ? await evalOk(`(()=>{ const p = window.__perfData(); const o = {};
      for (const k of Object.keys(p.buckets)) o[k] = p.buckets[k].ms; return o })()`)
  : null
if (MODE === 'reseed') {
  await evalOk(`(window.__reseedDone = null,
                 window.__lever('changeSeed', ${JSON.stringify(SEED)})
                   .then(() => { window.__reseedDone = performance.now() }), true)`)
}
else await evalOk(`(window.__story().enter(${JSON.stringify(SEED)}), true)`)
console.log(`  ${MODE === 'reseed' ? 'reseed' : 'enter '}      ${(tEnter / 1000).toFixed(2)} s   ${MODE === 'reseed' ? 'free-roam seed change called' : 'story entry called'}`)

// The reseed is async: the rebuild has not started on the tick the lever returns, so waiting
// straight for "ring full + warm drained" passes instantly against the OLD world. Wait for the
// rebuild promise to settle first, then for the new world to finish streaming in.
let tRebuild = null
if (MODE === 'reseed') {
  tRebuild = await waitFor('window.__reseedDone != null', BASE_TIMEOUT * 3, 'reseed rebuild', 100)
  console.log(`  rebuild     ${(tRebuild / 1000).toFixed(2)} s   Path-B rebuild resolved (${((tRebuild - tEnter) / 1000).toFixed(2)} s of work)`)
}
// Main-thread work DURING the rebuild window: the per-frame buckets, differenced. Requires ?prof=1
// (which suppresses the frame-180 perfReset that would otherwise truncate the baseline).
let frameDelta = null
if (MODE === 'reseed' && bucketsBefore) {
  const after = await evalOk(`(()=>{ const p = window.__perfData(); const o = {};
    for (const k of Object.keys(p.buckets)) o[k] = p.buckets[k].ms; return o })()`)
  frameDelta = {}
  for (const k of Object.keys(after)) {
    // frame.* is the top-level split; road.*/warm.* are existing sub-buckets INSIDE frame.road.*,
    // so they double-count against it on purpose — they say what the road step spent its time on.
    if (!/^(frame|road|warm)\./.test(k)) continue
    const d = Math.round(after[k] - (bucketsBefore[k] ?? 0))
    if (d > 5) frameDelta[k] = d
  }
  const rows = Object.entries(frameDelta).sort((a, b) => b[1] - a[1])
  const busy = rows.filter(([k]) => k.startsWith("frame.")).reduce((a, [, v]) => a + v, 0)
  const window = tRebuild - tEnter
  console.log(`\n  main-thread work during the rebuild (${(busy / 1000).toFixed(1)} s busy of ${(window / 1000).toFixed(1)} s wall = ${(100 * busy / window).toFixed(0)}%):`)
  for (const [k, v] of rows.slice(0, 10)) console.log(`    ${k.padEnd(22)} ${String(v).padStart(6)} ms`)
}
const LIVE = MODE === 'reseed'
  // Route warm drained AND ring full: the reseed equivalent of story's `live`.
  ? `(()=>{ const r = window.__road && window.__road(); const w = window.__world && window.__world();
            if (!r || !w) return false; const n = 2*(w.ring+w.warm)+1;
            return r.pending === 0 && r.lastWarm && w.chunks >= n*n })()`
  : `window.__story()._phase === 'live'`
const tLive = await waitFor(LIVE, BASE_TIMEOUT * 3, MODE === 'reseed' ? 'route warm drained' : 'story live', 200)
console.log(`  live        ${(tLive / 1000).toFixed(2)} s   ${MODE === 'reseed' ? 'route warm drained' : 'region routed + frozen'}`)

// `live` is NOT yet drivable: entry reseats/reseeds, which drops the chunk ring and rebuilds it
// around the region spawn. The honest time-to-drive is when that ring is full again.
let tDrivable = null
try { tDrivable = await waitFor(RING, BASE_TIMEOUT, 'ring refilled after entry', 200) }
catch { console.log('  drivable    (ring never refilled — reported as null)') }
if (tDrivable) console.log(`  drivable    ${(tDrivable / 1000).toFixed(2)} s   terrain ring refilled — DRIVING\n`)

// ── state at live: prove the mode is actually in its intended shape ─────────────────────────
const state = await evalOk(`(()=>{ const s = window.__story(); const w = window.__world && window.__world();
  return { frozen: s.isRoutingFrozen(), entering: s.isEntering(), region: s.region(),
           chunks: w && w.chunks, ring: w && w.ring, seed: w && w.seed } })()`)
// Resource timing for the two route-cache assets — download is only part of their cost; the
// main-thread inflate + JSON.parse is the rest (PERF-27 item 1's finding).
const assets = await evalOk(`performance.getEntriesByType('resource')
  .filter(r => r.name.includes('route-cache'))
  .map(r => ({ name: r.name.split('/').pop(), startMs: Math.round(r.startTime), durMs: Math.round(r.duration),
               kb: Math.round((r.encodedBodySize || r.transferSize || 0) / 1024) }))`)

// PERF-27 item 3: the per-step wall spans _rebuildFullNow records. This is the breakdown the
// reseed mode exists to produce — which step of the world rebuild owns the time.
const reseedSteps = await evalOk(`(()=>{ const p = window.__perfData && window.__perfData();
  if (!p || !p.buckets) return null; const out = {};
  for (const k of Object.keys(p.buckets)) if (k.startsWith('reseed.')) out[k] = Math.round(p.buckets[k].ms);
  return Object.keys(out).length ? out : null })()`)
if (reseedSteps) {
  const total = Object.entries(reseedSteps).filter(([k]) => k.startsWith("reseed.")).reduce((a, [, v]) => a + v, 0)
  console.log(`\n  rebuild breakdown (wall ms, sums to ${(total / 1000).toFixed(2)} s):`)
  for (const [k, v] of Object.entries(reseedSteps).sort((a, b) => b[1] - a[1]))
    console.log(`    ${k.padEnd(14)} ${String(v).padStart(6)} ms   ${(100 * v / total).toFixed(1)}%`)
}

const regionAsset = assets.find(a => a.name.includes('region'))
if (regionAsset) console.log(`  region prefetch ${regionAsset.startMs + regionAsset.durMs <= tEnter ? 'COMPLETE before entry (realistic: player took a moment to click)' : 'STILL IN FLIGHT at entry (pessimistic: instant click)'}`)
console.log('  state at live:', JSON.stringify(state))
for (const a of assets) console.log(`  asset  ${a.name}  ${a.kb} KB  start ${a.startMs} ms  transfer ${a.durMs} ms`)
if (exceptions.length) console.log(`\n  ⚠ ${exceptions.length} page exception(s):\n   ${exceptions.slice(0, 5).join('\n   ')}`)

const result = {
  meta: { cpu: CPU, seed: SEED, mode: MODE, url, headed: HEADED, at: new Date().toISOString() },
  ms: { ready: tReady, ring: tRing, enter: tEnter, live: tLive, drivable: tDrivable, rebuild: tRebuild,
        storyEntry: tLive - tEnter, entryToDrivable: tDrivable ? tDrivable - tEnter : null,
        rebuildWork: tRebuild ? tRebuild - tEnter : null },
  state, reseedSteps, frameDelta, assets, exceptions,
}
const tDrive = tDrivable || tLive
console.log(`\n  TOTAL cold → driving in story mode: ${(tDrive / 1000).toFixed(2)} s` +
            `  (boot ${(tReady / 1000).toFixed(2)} + entry ${((tDrive - tEnter) / 1000).toFixed(2)})\n`)
if (OUT) { mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(OUT, JSON.stringify(result, null, 2)); console.log(`  wrote ${OUT}`) }

if (CPU > 1) await client.cmd('Emulation.setCPUThrottlingRate', { rate: 1 })
client.close()
process.exit(0)
