// Shared helpers for Phase 4 log-assertion scripts.
// Read a logger JSON file produced by src/logger.js and expose a typed-ish API.

import { readFileSync } from 'node:fs'

export function loadLog (path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  if (!raw.fields || !raw.frames) throw new Error(`Not a logger JSON: ${path}`)
  const idx = Object.fromEntries(raw.fields.map((n, i) => [n, i]))
  return {
    path,
    fields: raw.fields,
    frames: raw.frames,
    idx,
    get: (frame, name) => frame[idx[name]],
    col: (name) => raw.frames.map(fr => fr[idx[name]]),
  }
}

export function assertNoNaN (log) {
  for (let i = 0; i < log.frames.length; i++) {
    for (let j = 0; j < log.fields.length; j++) {
      const v = log.frames[i][j]
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        return `NaN/Inf at frame ${i} field ${log.fields[j]} = ${v}`
      }
    }
  }
  return null
}

export function totalFz (log, frameIdx) {
  const f = log.frames[frameIdx]
  return log.get(f, 'fl_fz') + log.get(f, 'fr_fz') + log.get(f, 'rl_fz') + log.get(f, 'rr_fz')
}

export function run (assertFn) {
  const path = process.argv[2]
  if (!path) {
    console.error(`Usage: node ${process.argv[1]} <log.json>`)
    process.exit(2)
  }
  const log = loadLog(path)
  const failures = []
  const ctx = {
    log,
    fail: (msg) => failures.push(msg),
    pass: (msg) => console.log('  ✓', msg),
  }
  try {
    assertFn(ctx)
  } catch (e) {
    failures.push(`Assertion threw: ${e.message}`)
  }
  if (failures.length) {
    console.error(`FAIL ${path}`)
    for (const f of failures) console.error('  ✗', f)
    process.exit(1)
  }
  console.log(`OK ${path}`)
}
