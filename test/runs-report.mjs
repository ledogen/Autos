// test/runs-report.mjs — read the run library and say where par disagrees with the driver.
//
// The calibration question is never "is par fast or slow" in the abstract; it is "does par agree
// with how the drive FELT". So the headline is the mean ratio inside each `felt` group:
// a well-calibrated par puts `felt: par` near ratio 1.00, `fast` below, `slow` above.
// Everything else here exists to say WHICH knob is wrong — correlating the residual against route
// features separates a bad `mu` (error tracks corner density) from a bad grade/drag response
// (error tracks descent fraction) from a bad accel/vMax (error tracks straight fraction).
//
//   npm run runs:report            npm run runs:report -- --verbose
//
// Not a gate.
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PAR_REF } from '../src/par.js'

const RUNS = resolve(new URL('..', import.meta.url).pathname, 'runs')
const VERBOSE = process.argv.includes('--verbose')
const runs = readdirSync(RUNS).filter(f => f.endsWith('.json'))
  .map(f => ({ file: f, ...JSON.parse(readFileSync(join(RUNS, f), 'utf8')) }))

if (!runs.length) {
  console.log('run library is empty — drive a mission, hit "export run as", then `npm run runs:add`.')
  process.exit(0)
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const pearson = (xs, ys) => {
  if (xs.length < 3) return null
  const mx = mean(xs), my = mean(ys)
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < xs.length; i++) { const a = xs[i] - mx, b = ys[i] - my; num += a * b; dx += a * a; dy += b * b }
  return (dx && dy) ? num / Math.sqrt(dx * dy) : null
}
const f2 = (v) => (v == null ? '  n/a' : (v >= 0 ? ' ' : '') + v.toFixed(2))

console.log(`RUN LIBRARY — ${runs.length} run${runs.length === 1 ? '' : 's'}\n`)

// Ratios are recomputed nowhere: each run's stored ratio is against the PAR_REF in force AT THE
// TIME. Flag runs taken under different constants rather than silently mixing them.
const refKey = (r) => `mu ${r.par_ref?.mu} a ${r.par_ref?.accel} b ${r.par_ref?.brake} v ${r.par_ref?.vMax}`
const refs = [...new Set(runs.map(refKey))]
const current = refKey({ par_ref: PAR_REF })
if (refs.length > 1 || refs[0] !== current) {
  console.log('⚠ runs span more than one PAR_REF — group means below MIX calibrations:')
  for (const k of refs) console.log(`    ${k}   (${runs.filter(r => refKey(r) === k).length} runs)${k === current ? '  ← current' : ''}`)
  console.log(`    current: ${current}\n`)
}

// ── the headline: does par agree with how it felt? ───────────────────────────────────────────────
const GROUPS = [
  ['very_fast', 'felt VERY FAST — well below 1.00'],
  ['fast',      'felt FAST      — below 1.00'],
  ['par',       'felt ON PAR    — near  1.00'],
  ['slow',      'felt SLOW      — above 1.00'],
  ['very_slow', 'felt VERY SLOW — well above 1.00'],
]
console.log('ratio = your time / par     (lower = you beat par)\n')
for (const [key, label] of GROUPS) {
  const g = runs.filter(r => r.felt === key)
  if (!g.length) { console.log(`  ${label.padEnd(32)}  no runs yet`); continue }
  const rs = g.map(r => r.result.ratio)
  console.log(`  ${label.padEnd(32)}  n=${String(g.length).padStart(2)}  mean ${mean(rs).toFixed(3)}  range ${Math.min(...rs).toFixed(2)}–${Math.max(...rs).toFixed(2)}`)
}
const unlabelled = runs.filter(r => !GROUPS.some(([k]) => r.felt === k))
if (unlabelled.length) console.log(`  (${unlabelled.length} run(s) with no felt label — not usable for calibration)`)

// ── verdict + which knob ─────────────────────────────────────────────────────────────────────────
const onPar = runs.filter(r => r.felt === 'par').map(r => r.result.ratio)
console.log('')
if (onPar.length >= 3) {
  const m = mean(onPar)
  if (m < 0.95)      console.log(`VERDICT: par is TOO SLOW — an on-par drive beats it by ${((1 - m) * 100).toFixed(0)}%. Tighten PAR_REF.`)
  else if (m > 1.05) console.log(`VERDICT: par is TOO FAST — an on-par drive misses it by ${((m - 1) * 100).toFixed(0)}%. Loosen PAR_REF.`)
  else               console.log(`VERDICT: par is well calibrated on "felt on par" runs (mean ${m.toFixed(3)}).`)
} else {
  console.log(`VERDICT: need ≥3 runs labelled "on par" to call it (have ${onPar.length}).`)
}

// ── which knob: correlate the residual against route features ────────────────────────────────────
const usable = runs.filter(r => GROUPS.some(([k]) => r.felt === k))
if (usable.length >= 3) {
  // Residual: how much par disagreed, sign-corrected for what the driver expected.
  const expect = { very_fast: 0.82, fast: 0.91, par: 1.00, slow: 1.10, very_slow: 1.25 }
  const resid = usable.map(r => r.result.ratio - expect[r.felt])
  const feats = {
    'descent fraction   → grade/drag response': usable.map(r => r.terrain.pct_downhill),
    'net elevation /km  → grade/drag response': usable.map(r => 1000 * r.terrain.net_m / r.route.distance_m),
    'mean curvature     → mu':                   usable.map(r => r.corners.mean_curvature_per_m),
    'tight+hairpin %    → mu at small radius':   usable.map(r => r.corners.pct_by_radius.hairpin_lt25 + r.corners.pct_by_radius.tight_25_60),
    'straight %         → accel / vMax / drag':  usable.map(r => r.corners.pct_by_radius.straight_gt400),
    'distance           → (should be ~0)':       usable.map(r => r.route.distance_m),
  }
  console.log('\nwhere the error comes from (corr of residual vs feature; |r| > 0.6 with n ≥ 6 is worth acting on)')
  for (const [name, xs] of Object.entries(feats)) {
    const c = pearson(xs, resid)
    const bar = c == null ? '' : '█'.repeat(Math.round(Math.abs(c) * 12))
    console.log(`  ${name.padEnd(44)} ${f2(c)}  ${bar}`)
  }
  console.log(`  (n=${usable.length}${usable.length < 6 ? ' — too few to trust these; keep driving' : ''})`)
}

if (VERBOSE) {
  console.log('\nper-run:')
  for (const r of runs.sort((a, b) => a.file.localeCompare(b.file))) {
    console.log(`  ${r.file}`)
    console.log(`    ${r.result.elapsed_s}s vs par ${r.result.par_s}s = ${r.result.ratio} (${r.result.letter}) · felt ${r.felt ?? '—'}`)
    console.log(`    ${(r.route.distance_m / 1000).toFixed(2)} km · ${r.terrain.pct_downhill}% down / ${r.terrain.pct_uphill}% up · net ${r.terrain.net_m} m · straight ${r.corners.pct_by_radius.straight_gt400}%`)
    if (r.note) console.log(`    note: ${r.note}`)
  }
}
