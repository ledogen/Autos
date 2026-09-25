// test/teleport-fill.mjs — PERF-33 rainy-day probe (not a gate): jump the free-cam 2 km, repeatedly,
// and time how long the ground and the props around the arrival point take to fill. Needs `npm run dev`.
//   node test/teleport-fill.mjs --port=8000 --cpu=4 --jumps=4
import { launchChrome, connect, sleep } from './lib/cdp.mjs'
const arg = (k, d) => { const f = process.argv.find(a => a.startsWith(`--${k}=`)); return f ? f.split('=')[1] : d }
const PORT = Number(arg('port', 8000)), CDP = Number(arg('cdp', 9222)), CPU = Number(arg('cpu', 4)), JUMPS = Number(arg('jumps', 4))
launchChrome(`http://localhost:${PORT}/index.html?prof=1&nomenu=1`, { port: CDP })
const c = await connect({ port: CDP })
const ev = async e => { const r = await c.evalJS(e); if (r.err) throw new Error(r.err); return r.val }
const wait = async (e, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const r = await c.evalJS(e); if (!r.err && r.val) return Date.now() - t0; await sleep(100) } return -1 }
await wait('window.__rsReady === true', 120000)
await sleep(6000)
if (CPU > 1) await c.cmd('Emulation.setCPUThrottlingRate', { rate: CPU })
const w0 = await ev('window.__world()')
const res = []
for (let j = 1; j <= JUMPS; j++) {
  const x = w0.pos.x + 2000 * j, z = w0.pos.z + 700 * j
  await ev(`(()=>{ const y=(typeof window.terrain==='function')? window.terrain(${x},${z}):100; window.__view(${x}, y+45, ${z}, 0, -0.55); return true })()`)
  const cx = Math.floor(x / 64), cz = Math.floor(z / 64)
  const near = (fn, r) => `(()=>{ const w=window.__world(); for(let dx=-${r};dx<=${r};dx++) for(let dz=-${r};dz<=${r};dz++) if(!w.${fn}(${cx}+dx, ${cz}+dz)) return false; return true })()`
  const t0 = Date.now()
  const g1 = wait(near('hasGround', 1), 60000), p1 = wait(near('hasProps', 1), 60000)
  const g2 = wait(near('hasGround', 2), 60000), p2 = wait(near('hasProps', 2), 60000)
  const r = await Promise.all([g1, p1, g2, p2])
  res.push(r)
  console.log(`jump ${j}: ground3x3 ${r[0]} ms · props3x3 ${r[1]} ms · ground5x5 ${r[2]} ms · props5x5 ${r[3]} ms`)
  await sleep(3000)
}
const med = i => { const a = res.map(r => r[i]).sort((a, b) => a - b); return a[Math.floor(a.length / 2)] }
console.log(`MEDIAN ground3x3 ${med(0)} · props3x3 ${med(1)} · ground5x5 ${med(2)} · props5x5 ${med(3)} ms`)
process.exit(0)
