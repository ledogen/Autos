// test/lib/cdp.mjs — shared Chrome DevTools Protocol client for RangerSim tools (PERF-08 harness).
//
// Extracted from test/screenshot.mjs so screenshot + profiling drivers share one scaffold:
// launch headless Chrome (node's built-in WebSocket + fetch — no playwright), a promise-based
// cmd() channel, Runtime.evaluate helper, event subscription (needed for Tracing.dataCollected),
// Chrome trace capture, and scripted keyboard input.
//
// WebGL renders headless via --use-angle=metal on macOS. Callers own the HTTP server prereq
// (`npx serve .` on :8000 — file:// breaks ES modules). Not a gate — never run by `npm test`.

import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export const sleep = ms => new Promise(r => setTimeout(r, ms))

// Launch Chrome at `url` with a throwaway profile dir. `headed: true` opens a real window —
// headless compositing differs from real compositing, so perf runs may want both.
// Returns { chrome, cleanup }; cleanup kills the process and removes the profile dir
// (also wired to process exit/SIGINT so orphans don't accumulate).
export function launchChrome (url, { port = 9222, headed = false, windowSize = '1400,900', extraArgs = [] } = {}) {
  const userDir = mkdtempSync(join(tmpdir(), 'rangersim-cdp-'))
  const args = [
    ...(headed ? [] : ['--headless=new']),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDir}`,
    '--use-angle=metal',
    `--window-size=${windowSize}`,
    ...extraArgs,
    url,
  ]
  const chrome = spawn(CHROME, args, { stdio: 'ignore' })
  const cleanup = () => { try { chrome.kill() } catch {} try { rmSync(userDir, { recursive: true, force: true }) } catch {} }
  process.on('exit', cleanup)
  process.on('SIGINT', () => { cleanup(); process.exit(1) })
  return { chrome, cleanup }
}

// Poll the CDP HTTP endpoint until the page target appears (Chrome takes a moment to boot).
async function pageWs (port) {
  for (let i = 0; i < 60; i++) {
    try {
      const t = await (await fetch(`http://localhost:${port}/json/list`)).json()
      const p = t.find(x => x.type === 'page' && x.webSocketDebuggerUrl)
      if (p) return p.webSocketDebuggerUrl
    } catch {}
    await sleep(250)
  }
  throw new Error('no page target')
}

// Connect to the page target. Returns a client:
//   cmd(method, params)  — send a command, resolve with the raw response message
//   evalJS(expr)         — Runtime.evaluate returnByValue; resolves { val } or { err }
//   on(method, cb)       — subscribe to a CDP event (e.g. 'Tracing.dataCollected')
//   close()              — close the socket
export async function connect ({ port = 9222, cmdTimeoutMs = 60000 } = {}) {
  const ws = new WebSocket(await pageWs(port))
  await new Promise(r => ws.onopen = r)
  let _id = 0
  const pend = new Map()        // id -> { res, rej, timer }
  const listeners = new Map()   // method -> Set<cb>
  // A dropped socket or a lost response must REJECT, never hang — an unattended profiling run
  // once sat on a pending cmd() for 3 hours. Every command carries a deadline; socket
  // close/error rejects everything in flight.
  const failAll = why => { for (const [, p] of pend) { clearTimeout(p.timer); p.rej(new Error(why)) } pend.clear() }
  ws.onclose = () => failAll('CDP socket closed')
  ws.onerror = () => failAll('CDP socket error')
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); clearTimeout(p.timer); pend.delete(m.id); p.res(m); return }
    if (m.method && listeners.has(m.method)) for (const cb of listeners.get(m.method)) cb(m.params)
  }
  const cmd = (method, params = {}, { timeoutMs = cmdTimeoutMs } = {}) => new Promise((res, rej) => {
    const id = ++_id
    const timer = setTimeout(() => { pend.delete(id); rej(new Error(`CDP timeout: ${method} after ${timeoutMs} ms`)) }, timeoutMs)
    pend.set(id, { res, rej, timer })
    ws.send(JSON.stringify({ id, method, params }))
  })
  // CDP nests the payload: message.result = { result: {type,value}, exceptionDetails }.
  const evalJS = async expr => {
    const m = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true })
    const R = m.result || {}
    if (R.exceptionDetails) return { err: R.exceptionDetails.text || JSON.stringify(R.exceptionDetails) }
    return { val: R.result?.value }
  }
  const on = (method, cb) => {
    if (!listeners.has(method)) listeners.set(method, new Set())
    listeners.get(method).add(cb)
    return () => listeners.get(method).delete(cb)
  }
  const client = { ws, cmd, evalJS, on, close: () => ws.close() }
  await cmd('Page.enable')
  await cmd('Runtime.enable')
  return client
}

// ── Chrome trace capture ─────────────────────────────────────────────────────
// Categories chosen for perf attribution: frame pipeline + user_timing (src/perf.js mirror)
// + GPU process activity. Trace JSON can be tens of MB — events are appended to `outPath`
// incrementally as Tracing.dataCollected batches arrive, not buffered whole.
export const TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'blink.user_timing',
  'toplevel',
  'gpu',
  'disabled-by-default-gpu.service',
  '__metadata',
].join(',')

// Start tracing. Returns a handle; call handle.stop() to end and write the trace file.
export async function startTracing (client, outPath, { categories = TRACE_CATEGORIES } = {}) {
  const events = []
  const off = client.on('Tracing.dataCollected', p => { events.push(...p.value) })
  await client.cmd('Tracing.start', { categories, transferMode: 'ReportEvents' })
  return {
    async stop () {
      // Big traces take a while to flush; give the end+complete handshake its own generous
      // deadline rather than the default cmd timeout, and never wait forever on the complete event.
      const done = new Promise((r, rej) => {
        const offEnd = client.on('Tracing.tracingComplete', () => { offEnd(); clearTimeout(t); r() })
        const t = setTimeout(() => { offEnd(); rej(new Error('Tracing.tracingComplete never arrived (180 s)')) }, 180000)
      })
      await client.cmd('Tracing.end', {}, { timeoutMs: 120000 })
      await done
      off()
      writeFileSync(outPath, JSON.stringify({ traceEvents: events }))
      return { outPath, eventCount: events.length }
    },
  }
}

// ── Scripted keyboard input ──────────────────────────────────────────────────
// Raw down/up dispatch for driving scenarios. `key` is a DOM key value ('w', 'ArrowUp', ' ').
const KEY_CODES = { w: 'KeyW', a: 'KeyA', s: 'KeyS', d: 'KeyD', ' ': 'Space', Shift: 'ShiftLeft', c: 'KeyC' }
export async function keyEvent (client, key, down) {
  const code = KEY_CODES[key] ?? key
  await client.cmd('Input.dispatchKeyEvent', {
    type: down ? 'keyDown' : 'keyUp',
    key, code,
    windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
  })
}

// Hold a key for `ms` (fire-and-forget friendly: returns after the up event).
export async function holdKey (client, key, ms) {
  await keyEvent(client, key, true)
  await sleep(ms)
  await keyEvent(client, key, false)
}
