// test/story-entry-time.mjs — PERF-31 instrument (rainy-day script, NOT a gate): how long does
// STORY ENTRY take on a slow machine?
//
// The owner's binding requirement for PERF-31 is absolute cost on slow hardware ("a player on a
// slow device will have their experience hampered by a >30 s loading screen"), not the headless
// three-window bench. `--cpu=4` is the established slow-device proxy (the same throttle
// test/hitch-report.mjs uses). This times the real thing end to end, in a real browser, with the
// real worker ladder: from storySystem.enter(seed) to the region going LIVE — every phase the
// player watches the loading screen for (settle, region build, POI placement, carve re-bake).
//
// COLD vs WARM: run 1 of an invocation is the COLD entry a player actually experiences. Later
// runs in the same invocation re-enter the SAME seed/epoch, so the network worker reuses its warm
// instance and the number collapses to the non-network cost (terrain, POI placement, carve
// re-bake). For an A/B, compare run 1 across separate invocations — each one is a fresh page.
//
// Measured (seed 6, cpu x4, M4, four cold samples per side):
//   before PERF-31 W1+W2 (9863058): 18.0 / 18.1 / 19.1 / 20.6 s  — median ~18.6
//   after  PERF-31 W1+W2 (894c9b9): 15.4 / 15.5 / 15.7 / 15.7 s  — median ~15.6, and far tighter
//   152 registered runs on both sides (identical region), warm re-entry 11.3 s on both
//
// Needs the dev server: `npm run dev` (or --port=<P> for a worktree server).
// Run: node test/story-entry-time.mjs [--cpu=4] [--seed=6] [--port=8000] [--cdp=9222] [--runs=1]

import { launchChrome, connect, sleep } from './lib/cdp.mjs'

const argv = process.argv.slice(2)
const flag = (k, d) => { const f = argv.find(a => a.startsWith(`--${k}=`)); return f ? f.split('=')[1] : d }
const CPU  = Number(flag('cpu', 4))
const SEED = flag('seed', '6')
const PORT = Number(flag('port', 8000))
const CDP  = Number(flag('cdp', 9222))
const RUNS = Number(flag('runs', 1))

const url = `http://localhost:${PORT}/index.html?prof=1`
const { cleanup } = launchChrome(url, { port: CDP })
const client = await connect({ port: CDP })

const evalOr = async (expr, what) => {
  const r = await client.evalJS(expr)
  if (r.err) throw new Error(`${what}: ${r.err}`)
  return r.val
}

// Boot: wait for the dev handles AND for the free-roam spawn to seat (the loading screen the
// player sees before ever touching story mode — not part of the number we report).
let booted = false
for (let i = 0; i < 240; i++) {
  // Defensive INSIDE the page: the dev handles are module-scope closures, so calling one before
  // its system initialises throws a TDZ ReferenceError rather than returning undefined.
  const ok = await evalOr(`(() => { try { return !!(window.__story && window.__story() && window.__car && window.__car().y > -1e3) } catch { return false } })()`, 'boot probe')
  if (ok) { booted = true; break }
  await sleep(500)
}
if (!booted) { console.error('game never booted — is the dev server up on :' + PORT + '?'); cleanup(); process.exit(1) }
await sleep(3000)   // let the spawn ring settle so entry starts from a quiet frame loop

const results = []
for (let run = 0; run < RUNS; run++) {
  if (run > 0) { await evalOr(`window.__story().exit(), true`, 'exit'); await sleep(5000) }
  await client.cmd('Emulation.setCPUThrottlingRate', { rate: CPU })
  await sleep(500)
  const t0 = Date.now()
  await evalOr(`window.__story().enter(${JSON.stringify(SEED)}), true`, 'enter')
  let phase = 'idle', live = false
  for (let i = 0; i < 1200; i++) {          // 10 min ceiling at 500 ms
    phase = await evalOr(`window.__story()._phase`, 'phase probe')
    if (phase === 'live' || phase === 'rejected') { live = phase === 'live'; break }
    await sleep(500)
  }
  const secs = (Date.now() - t0) / 1000
  await client.cmd('Emulation.setCPUThrottlingRate', { rate: 1 })
  const runs = await evalOr(`(window.__roadSys() && window.__roadSys()._network.size) || 0`, 'run count')
  results.push({ secs, phase, live, runs })
  console.log(`run ${run + 1}: ${secs.toFixed(1)} s to phase '${phase}' · ${runs} registered runs`)
}

const best = Math.min(...results.map(r => r.secs)), worst = Math.max(...results.map(r => r.secs))
console.log(`\nstory entry at cpu x${CPU}, seed ${SEED}: ${results.length > 1 ? `${best.toFixed(1)}-${worst.toFixed(1)} s` : `${best.toFixed(1)} s`}`)
console.log(`owner bar: > 30 s FAILS the real requirement regardless of the headless bench — ${worst > 30 ? 'OVER' : 'under'}`)
await client.close()
cleanup()
process.exit(0)
