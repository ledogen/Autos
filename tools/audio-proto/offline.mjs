// tools/audio-proto/offline.mjs — render one src/*-audio.js one-shot OFFLINE in headless Chrome and
// write it as a WAV (+ a spectrogram PNG via ffmpeg), so a synthesized sound can be checked without
// speakers. Tracked; its renders land in wip/audio-render/out (git-invisible).
//
//   node tools/audio-proto/offline.mjs <module.js> <export> [seconds=1.5] [args JSON] [out dir]
//   e.g. node tools/audio-proto/offline.mjs pump-audio.js playRegister 1
//
// Needs the worktree's Vite up (:3774). How: window.AudioContext is swapped, before the game's
// getAudioContext() first runs, for an OfflineAudioContext behind a Proxy that reports
// state 'running' (the modules stay silent otherwise) and binds every method to the real context.

import { launchChrome, connect, sleep } from '../../test/lib/cdp.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const [mod, fn, secs = '1.5', argJson = '[]', outDir = 'wip/audio-render/out'] = process.argv.slice(2)
if (!mod || !fn) { console.error('usage: offline.mjs <module.js> <export> [seconds] [args JSON] [out dir]'); process.exit(2) }
const SR = 48000
const { cleanup } = launchChrome('http://localhost:3774/package.json', { port: 9374 })
try {
    const c = await connect({ port: 9374 })
    await sleep(500)
    const ev = async expr => {   // evalJS does not await a promise; this does
        const m = await c.cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
        const R = m.result || {}
        return R.exceptionDetails ? { err: R.exceptionDetails.exception?.description || R.exceptionDetails.text } : { val: R.result?.value }
    }
    const r = await ev(`(async () => {
        const off = new OfflineAudioContext(2, Math.ceil(${SR} * ${+secs}), ${SR})
        const prox = new Proxy(off, { get: (t, k) => k === 'state' ? 'running'
            : typeof t[k] === 'function' ? t[k].bind(t) : t[k] })
        window.AudioContext = function () { return prox }
        const m = await import('${mod.startsWith('/') ? mod : '/src/' + mod}')
        m.${fn}(...${argJson})
        const buf = await off.startRendering()
        const L = buf.getChannelData(0)
        let peak = 0, sum = 0, nan = 0
        for (const v of L) { if (!Number.isFinite(v)) nan++; else { peak = Math.max(peak, Math.abs(v)); sum += v * v } }
        // 16-bit PCM WAV, mono (channel 0), as base64.
        const n = L.length, b = new DataView(new ArrayBuffer(44 + n * 2))
        const w = (o, s) => [...s].forEach((ch, i) => b.setUint8(o + i, ch.charCodeAt(0)))
        w(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); b.setUint32(16, 16, true)
        b.setUint16(20, 1, true); b.setUint16(22, 1, true); b.setUint32(24, ${SR}, true)
        b.setUint32(28, ${SR} * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true)
        w(36, 'data'); b.setUint32(40, n * 2, true)
        for (let i = 0; i < n; i++) b.setInt16(44 + i * 2, Math.max(-1, Math.min(1, L[i])) * 32767, true)
        let s = ''; const u = new Uint8Array(b.buffer)
        for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
        return { peak, rms: Math.sqrt(sum / n), nan, wav: btoa(s) }
    })()`)
    if (r.err) { console.error('render failed:', r.err); process.exitCode = 1 }
    else {
        mkdirSync(outDir, { recursive: true })
        const base = join(outDir, fn), wav = base + '.wav'
        writeFileSync(wav, Buffer.from(r.val.wav, 'base64'))
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-lavfi',
            'showspectrumpic=s=1200x500:legend=1:scale=log:fscale=lin:stop=8000', base + '.png'])
        console.log(`${fn}: peak ${r.val.peak.toFixed(3)} (${(20 * Math.log10(r.val.peak)).toFixed(1)} dBFS), ` +
            `rms ${r.val.rms.toFixed(4)}, non-finite ${r.val.nan} → ${wav}, ${base}.png`)
    }
    c.close()
} finally { cleanup() }
