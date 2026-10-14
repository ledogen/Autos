// test/bench-barrels.mjs — how many barrels hold 60 fps? Measures the lab's barrel cube.
//
// Drives the real game over CDP (test/lib/cdp.mjs). Headless by default: new-headless Chrome still
// renders on the GPU (--use-angle=metal) and paces rAF at a steady 60 Hz (measured: p50 16.7 ms), so
// a missed frame shows as a 33 ms period exactly as on a 60 Hz panel — and it runs with the screen
// locked, which a headed window cannot. --headed for a real window. For each count: enter the lab, build the cube
// (window.__barrelCube → _buildBarrelCube in main.js, the same code the menu runs), let it settle,
// then floor the truck into it and record every rAF period through the impact and the aftermath.
//
// A count PASSES when no 1-second window of the crash drops below 59 frames (a 60 Hz display; one
// frame of slack for timer jitter). The settle window — the first seconds after the spawn, every
// drum awake — is reported too; it plays behind no loading screen, so it should hold as well.
//
// PREREQ: the dev server (`npm run dev`, default :8000; --port= for a worktree). Not a gate.
//
// USAGE: node test/bench-barrels.mjs 343 512 729 1000 [--port=8000] [--hold=9]
//        a bare `S^3` arg (e.g. 9^3) is a full cube of side S; a plain N fills the cube of side
//        ceil(∛N) bottom-first.

import { launchChrome, connect, keyEvent, sleep } from './lib/cdp.mjs'

const argv = process.argv.slice(2)
const flag = (k, d) => { const f = argv.find(a => a.startsWith(`--${k}=`)); return f ? f.split('=')[1] : d }
const PORT = Number(flag('port', 8000)), HOLD = Number(flag('hold', 9)), HEADED = argv.includes('--headed')
// The FIRST crash of a session stalls one frame 50–70 ms on GPU-side first-use work (cpu ~2 ms) —
// independent of the barrel count, and gone on every later crash. A small unreported warm-up crash
// takes it out of the measurement.
const runs = [{ side: 4, count: 64, warmup: true }, ...argv.filter(a => !a.startsWith('--')).map(a => {
  const [s, e] = a.split('^').map(Number)
  if (e === 3) return { side: s, count: s ** 3 }
  return { side: Math.ceil(Math.cbrt(a) - 1e-9), count: Number(a) }
})]

const { cleanup } = launchChrome(`http://localhost:${PORT}/index.html?prof=1&nomenu=1`, { headed: HEADED, windowSize: '1440,900' })
const c = await connect()
const ev = async e => { const r = await c.evalJS(e); if (r.err) throw new Error(`${e}: ${r.err}`); return r.val }
const waitFor = async (e, ms) => { const t = Date.now(); while (!(await ev(e))) { if (Date.now() - t > ms) throw new Error(`timeout: ${e}`); await sleep(250) } }
await waitFor('window.__rsReady === true', 120000)
await sleep(5000)

// rAF period recorder, independent of the game's own loop.
await ev(`(() => { window.__fr = []; let l = performance.now(); const f = t => { window.__fr.push([t, t - l]); l = t; requestAnimationFrame(f) }; requestAnimationFrame(f); return 1 })()`)
const mark = () => ev('performance.now()')
const frames = async (a, b) => (await ev(`window.__fr.filter(f => f[0] > ${a} && f[0] <= ${b})`))

function stats (fr) {
  const d = fr.map(f => f[1]).sort((x, y) => x - y)
  let worst = Infinity
  for (let i = 0; i < fr.length; i++) {            // worst 1 s window: frames presented in (t, t+1000]
    let n = 0
    for (let j = i; j < fr.length && fr[j][0] <= fr[i][0] + 1000; j++) n++
    if (fr[i][0] + 1000 <= fr.at(-1)[0]) worst = Math.min(worst, n)
  }
  return { p50: d[d.length >> 1], p99: d[Math.floor(d.length * 0.99)], max: d.at(-1), over20: d.filter(x => x > 20).length, worst1s: worst }
}
const fmt = s => `p50 ${s.p50.toFixed(1)} p99 ${s.p99.toFixed(1)} max ${s.max.toFixed(1)} ms · ${s.over20} frames >20 ms · worst 1 s ${s.worst1s} fps`

console.log('count  side | settle (spawn → +4 s)                                  | crash (W held → +' + (HOLD + 4) + ' s)')
for (const { side, count, warmup } of runs) {
  await ev(`window.__barrelCube(${side}, ${count})`)
  const t0 = await mark()
  await sleep(4000)
  const t1 = await mark()
  await sleep(2000)                                  // let the cube sleep; the truck has seated
  const t2 = await mark()
  const b0 = (await ev('window.__perfData()')).buckets
  await keyEvent(c, 'w', true)
  let vMax = 0, awakeMax = 0
  const tEnd = Date.now() + (HOLD + 4) * 1000
  while (Date.now() < tEnd) {
    if (Date.now() > tEnd - 4000) await keyEvent(c, 'w', false)
    const s = await ev('[Math.hypot(window.__vs.velocity.x, window.__vs.velocity.z), window.__debris.awakeCount]')
    vMax = Math.max(vMax, s[0]); awakeMax = Math.max(awakeMax, s[1])
    await sleep(200)
  }
  await keyEvent(c, 'w', false)
  const t3 = await mark()
  const b1 = (await ev('window.__perfData()')).buckets
  const settle = stats(await frames(t0 + 250, t1)), crash = stats(await frames(t2, t3))
  const pass = crash.worst1s >= 59 && settle.worst1s >= 59
  if (argv.includes('--hitches')) for (const h of (await ev('window.__hitches().hitches')).slice(-6)) console.log('   hitch', JSON.stringify(h).slice(0, 400))
  await ev('window.__hitchReset()')
  if (warmup) continue
  const nFr = (await frames(t2, t3)).length
  const split = Object.entries(b1).filter(([k]) => /^frame\.[a-zA-Z]+$/.test(k))
    .map(([k, b]) => [k.slice(6), (b.ms - (b0[k]?.ms ?? 0)) / nFr]).sort((a, b) => b[1] - a[1]).slice(0, 4)
  console.log(`${String(count).padStart(5)} ${String(side).padStart(4)}  | ${fmt(settle)} | ${fmt(crash)} · peak ${(vMax * 2.237).toFixed(0)} mph, ${awakeMax} awake  ${pass ? 'PASS' : 'FAIL'}`)
  console.log(`             crash cpu/frame: ${split.map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ')} ms`)
}
cleanup()
process.exit(0)
