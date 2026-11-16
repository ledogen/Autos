// FEAT-34 round 3: real headless-Chrome shots of the cluster harness in each state, then one sheet.
//   tools/chrome-slot.sh node wip/feat-34/cluster-shots.mjs <outDir>
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { launchChrome, connect, sleep } from '../../test/lib/cdp.mjs'
const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(process.argv[2]); mkdirSync(OUT, { recursive: true })
const HTTP = 3292, CDP = 9335
const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(HTTP), '--strictPort'], { cwd: ROOT, stdio: 'ignore' })
process.on('exit', () => { try { vite.kill() } catch {} })
for (let i = 0; i < 100; i++) { if (await fetch(`http://localhost:${HTTP}/`).then(r => r.ok, () => false)) break; await sleep(150) }
const SHOTS = [
  ['after', '', 'mph=55&rpm=2400&gear=5&fuel=0.55&temp=0.5'],
  ['after-lamps', '', 'mph=55&rpm=2400&gear=5&fuel=0.04&temp=1&lights=2&lit=lowFuel,flat,parkBrake,checkEngine,overheat'],
]
launchChrome('about:blank', { port: CDP, windowSize: '600,340' })
const c = await connect({ port: CDP })
await c.cmd('Emulation.setDeviceMetricsOverride', { width: 640, height: 340, deviceScaleFactor: 2, mobile: false })
for (const [name, , q] of SHOTS) {
  await c.cmd('Page.navigate', { url: `http://localhost:${HTTP}/wip/feat-34/cluster-shot.html?${q}` })
  for (let i = 0; i < 100; i++) { const r = await c.evalJS('window.__done === true'); if (r.val) break; await sleep(100) }
  const b = (await c.evalJS(`(() => { const b = document.getElementById('cluster').getBoundingClientRect(); return [b.x, b.y, b.width, b.height] })()`)).val
  const shot = await c.cmd('Page.captureScreenshot', { format: 'png', clip: { x: b[0] - 8, y: b[1] - 8, width: b[2] + 16, height: b[3] + 16, scale: 1 } })
  writeFileSync(join(OUT, name + '.png'), Buffer.from(shot.result.data, 'base64'))
  console.log('wrote', name, b.map(Math.round).join(' '))
}
process.exit(0)
