// test/rockslide-study-sum.mjs — FEAT-26: summarise `test/rockslide-study.mjs --real` JSON lines (census + trial tables + the arrival fit).
// Run: node test/rockslide-study-sum.mjs <file.jsonl…> [--shape=scatter] [--v0=4]
import fs from 'node:fs'
const files = process.argv.slice(2).filter(a => !a.startsWith('--'))
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) ?? `=${d}`).split('=')[1]
const rows = files.flatMap(f => fs.readFileSync(f, 'utf8').split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l)))
const pct = (a, q) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))] }
const f1 = (v) => Number.isFinite(v) ? v.toFixed(1) : '-', f2 = (v) => Number.isFinite(v) ? v.toFixed(2) : '-'
const km = rows.reduce((a, r) => a + r.km, 0), eM = rows.reduce((a, r) => a + r.candEitherM, 0), dM = rows.reduce((a, r) => a + r.candPerDirM, 0)
console.log(`census: ${rows.length} seeds, ${km.toFixed(0)} km of road; candidate stations (5 m) in either direction ${(eM / km).toFixed(0)} m per km of road, per travel direction ${(dM / km / 2).toFixed(0)} m per km`)
const perSeed = rows.map(r => r.candEitherM / r.km).sort((a, b) => a - b)
console.log(`  per seed (m/km): min ${f1(perSeed[0])} p10 ${f1(pct(perSeed, 0.1))} median ${f1(pct(perSeed, 0.5))} p90 ${f1(pct(perSeed, 0.9))} max ${f1(perSeed.at(-1))}`)
const tri = rows.flatMap(r => r.trials.map(t => ({ ...t, seed: r.seed })))
const LANE = 2.5, EDGE = 5
const groups = {}
for (const t of tri) (groups[`${t.shape} v0=${t.v0}`] ??= []).push(t)
console.log(`\ntrials: ${tri.length / Object.keys(groups).length} slides × ${Object.keys(groups).length} configs. Per rock: lane = crossed the face-side lane centre; short = rests off the deck on the face side; over = rests past the far deck edge`)
console.log('  config          | rocks | lane%  short%  over% | slides with ≥1 / ≥3 in lane | t_lane p10/p50/p90 [s] | along-road p90 [m]')
for (const [g, ts] of Object.entries(groups)) {
  const rocks = ts.flatMap(t => t.rocks.map(r => ({ ...r, toeD: t.toeD, dropM: t.dropM })))
  const ln = rocks.filter(r => r.t != null)
  const s1 = ts.filter(t => t.rocks.some(r => r.t != null)).length / ts.length, s3 = ts.filter(t => t.rocks.filter(r => r.t != null).length >= 3).length / ts.length
  console.log(`  ${g.padEnd(15)} | ${String(rocks.length).padStart(5)} | ${(100 * ln.length / rocks.length).toFixed(0).padStart(5)} ${(100 * rocks.filter(r => r.lat > EDGE).length / rocks.length).toFixed(0).padStart(6)} ${(100 * rocks.filter(r => r.lat < -EDGE).length / rocks.length).toFixed(0).padStart(5)} | ${(100 * s1).toFixed(0).padStart(5)}% / ${(100 * s3).toFixed(0)}% | ${[0.1, 0.5, 0.9].map(q => f2(pct(ln.map(r => r.t), q))).join(' / ')} | ${f1(pct(ln.map(r => Math.abs(r.a)), 0.9))}`)
}
const shape = arg('shape', 'scatter'), v0 = +arg('v0', 4)
const sel = groups[`${shape} v0=${v0}`] ?? []
console.log(`\n${shape} v0=${v0} by face height (drop above the toe) and toe distance from the deck edge:`)
const bins = [[0, 6], [6, 8], [8, 10], [10, 99]]
for (const [a, b] of bins) for (const [ta, tb] of [[0, 4], [4, 9]]) {
  const ts = sel.filter(t => t.dropM >= a && t.dropM < b && t.toeD >= ta && t.toeD < tb)
  if (!ts.length) continue
  const rocks = ts.flatMap(t => t.rocks), ln = rocks.filter(r => r.t != null)
  console.log(`  drop ${a}–${b === 99 ? '+' : b} m, toe ${ta}–${tb - 1} m: ${ts.length} slides, lane ${(100 * ln.length / rocks.length).toFixed(0)}%, slides ≥1 ${(100 * ts.filter(t => t.rocks.some(r => r.t != null)).length / ts.length).toFixed(0)}%, t50 ${f2(pct(ln.map(r => r.t), 0.5))} s`)
}
// Least squares: t = a + b·√drop + c·lat (lat = toe → lane centre, m), per rock that crossed.
const X = [], Y = []
for (const t of sel) for (const r of t.rocks) if (r.t != null) { X.push([1, Math.sqrt(t.dropM), EDGE + t.toeD - LANE]); Y.push(r.t) }
if (X.length > 5) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], B = [0, 0, 0]
  for (let i = 0; i < X.length; i++) for (let j = 0; j < 3; j++) { B[j] += X[i][j] * Y[i]; for (let k = 0; k < 3; k++) A[j][k] += X[i][j] * X[i][k] }
  // Gauss
  for (let i = 0; i < 3; i++) { const p = A[i][i]; for (let k = i + 1; k < 3; k++) { const f = A[k][i] / p; for (let j = i; j < 3; j++) A[k][j] -= f * A[i][j]; B[k] -= f * B[i] } }
  const c = [0, 0, 0]; for (let i = 2; i >= 0; i--) { let s = B[i]; for (let j = i + 1; j < 3; j++) s -= A[i][j] * c[j]; c[i] = s / A[i][i] }
  const res = X.map((x, i) => Y[i] - (c[0] + c[1] * x[1] + c[2] * x[2])).map(Math.abs)
  console.log(`\narrival fit (${X.length} rocks): t = ${c[0].toFixed(2)} + ${c[1].toFixed(2)}·√drop + lat/${(1 / c[2]).toFixed(1)}  — |residual| p50 ${f2(pct(res, 0.5))} s, p80 ${f2(pct(res, 0.8))} s, p90 ${f2(pct(res, 0.9))} s`)
}
