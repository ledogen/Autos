// test/calibrate-par.mjs — FEAT-30 rainy-day script: fit PAR_REF to recorded human drives.
//
// NOT a gate. Usage:  node test/calibrate-par.mjs [runsDir]     (default: runs/)
//
// Input: rangersim-run-export/2 blobs (the mission result card's export), each carrying the
// driver's SUBJECTIVE read ("felt": very_slow · slow · par · fast · very_fast) plus the full
// route topology par was priced on (s/x/z/elev/heading/curv @ 2 m). The felt labels are the
// ground truth PAR_REF is fitted to (FEAT-30 method): a drive that FELT like par should land at
// ratio 1.0.
//
// Method:
//   1. Rebuild each run's par input from its topology (duck-typed centerline over the flat
//      arrays). The export lost the segment JOINS, so junction caps can't be re-derived — instead
//      each run gets a correction factor c = par_recorded / par_recomputed(exported ref), and
//      candidate pars are c × recomputed(candidate). c is ~mu-invariant (caps scale with √mu like
//      every other corner) and folds in any other reconstruction residual too.
//   2. Sweep PAR_REF candidates (mu × accel × brake; vMax/vCeil/junction* held), score each by
//      weighted log-error of per-run ratios against felt-class targets.
//   3. mu is OWNER-SET (0.80) as of the 2026-08-16 re-anchor, not fitted. The old `mu ≤ 0.72`
//      constraint existed because ratio 1.0 had to stay attainable while par WAS the standard;
//      PAR_SLACK now guarantees that by construction, so the constraint is retired and this
//      script's recommendation is advisory only.
//
// RE-ANCHORED 2026-08-16. The felt-class targets below were written when par sat mid-B and a
// felt-par drive was supposed to land at ratio ~1.00. Par is now the C/D boundary — the slowest
// PASS — so the whole target table shifted down: a felt-par drive is a comfortable pass (~0.85,
// mid-C), and only a genuinely bad drive should reach 1.0. Leaving the old targets in place would
// have kept this script recommending mu ~0.90 forever.
//
// Health warning that has not changed: the felt labels carry ±1 class of noise and are partly
// INVERTED against the clock in the current corpus — median "fast" 0.926 vs median "par" 0.909
// under the pre-re-anchor scale. Treat any recommendation from 20 runs as a hint, not a fit.
//
// The sweep MUTATES PAR_REF in place (sampleRoute's junction caps read the module constant, not
// the ref argument) and restores it after. Pure node, no worldgen.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { computePar, PAR_REF, PAR_SLACK } from '../src/par.js'

const DIR = process.argv[2] || 'runs'

// ── load + dedup ────────────────────────────────────────────────────────────────────────────
const seen = new Set()
const runs = []
for (const f of readdirSync(DIR).sort()) {
    if (!f.endsWith('.json')) continue
    let d
    try { d = JSON.parse(readFileSync(join(DIR, f), 'utf8')) } catch { continue }
    if (d.format !== 'rangersim-run-export/2') continue
    if (!d.felt || !d.result || !d.topology?.rows?.length) { console.log(`  (skip ${f} — no felt/result/topology)`); continue }
    const key = `${d.result.elapsed_s}|${d.result.par_s}|${d.route?.distance_m}`
    if (seen.has(key)) continue      // the 000N-*.json files duplicate their rangersim-run-* originals
    seen.add(key)
    runs.push({ file: f, ...d })
}
console.log(`${runs.length} unique runs from ${DIR}/\n`)

// ── rebuild a par input from the flat topology ──────────────────────────────────────────────
// columns: s_m x z elev_m heading_rad curv_1pm grade quality par_ms
function toSegments(run) {
    const col = Object.fromEntries(run.topology.columns.map((c, i) => [c, i]))
    const rows = run.topology.rows
    const S = rows.map(r => r[col.s_m])
    const CURV = rows.map(r => r[col.curv_1pm])
    const ELEV = rows.map(r => r[col.elev_m])
    const len = S[S.length - 1]
    const at = (arr, s) => {
        if (s <= S[0]) return arr[0]
        if (s >= len) return arr[arr.length - 1]
        // rows are ~uniform (spacing_m) — index guess then local walk
        let i = Math.min(arr.length - 2, Math.max(0, Math.floor(s / run.topology.spacing_m)))
        while (i > 0 && S[i] > s) i--
        while (i < S.length - 2 && S[i + 1] < s) i++
        const t = (s - S[i]) / Math.max(1e-9, S[i + 1] - S[i])
        return arr[i] + (arr[i + 1] - arr[i]) * t
    }
    const centerline = {
        length: len,
        curvatureAt: (s) => at(CURV, s),
        tangentAt: () => ({ x: 1, z: 0 }),   // single segment ⇒ no joins ⇒ tangents unused
    }
    return [{ centerline, gradeAt: (s) => at(ELEV, s), s0: 0, s1: len }]
}

// ── PAR_REF mutation helpers ────────────────────────────────────────────────────────────────
const BASE = { ...PAR_REF }
function setRef(r) { Object.assign(PAR_REF, r) }
function parWith(segments, r) { setRef(r); const p = computePar(segments); setRef(BASE); return p.time }

// ── 1. reconstruction check: recompute under each run's own exported ref ───────────────────
console.log('── reconstruction (recomputed par under the exported ref vs recorded) ──')
for (const r of runs) {
    r.segments = toSegments(r)
    // parWith returns par = referenceTime × PAR_SLACK, but `par_s` in the corpus was recorded
    // BEFORE the 2026-08-16 re-anchor, i.e. slack-free. Divide it back out so `corr` stays what it
    // claims to be — a pure reconstruction residual. Skipping this is silent and total: corr would
    // absorb 1/PAR_SLACK, the slack would cancel again at line ~110, and every ratio printed below
    // would be the OLD anchoring wearing new labels.
    r.parRecon = parWith(r.segments, r.par_ref) / PAR_SLACK
    r.corr = r.result.par_s / r.parRecon        // junction caps + residuals, assumed ref-invariant
}
const corrs = runs.map(r => r.corr).sort((a, b) => a - b)
console.log(`correction factors: min ${corrs[0].toFixed(3)} · median ${corrs[Math.floor(corrs.length / 2)].toFixed(3)} · max ${corrs[corrs.length - 1].toFixed(3)}`)
const suspect = runs.filter(r => r.corr < 0.9 || r.corr > 1.15)
for (const r of suspect) console.log(`  ⚠ ${r.file}: corr ${r.corr.toFixed(3)} — reconstruction poor, run downweighted`)

// ── 2. the sweep ────────────────────────────────────────────────────────────────────────────
// Felt targets, RE-ANCHORED 2026-08-16 (see header). par-felt is still the anchor (w 2), but it
// now targets mid-C rather than ratio 1.0, because ratio 1.0 is the C/D boundary — a bare pass —
// and "I drove at a normal pace" should clear it comfortably. The tails stay one-sided: a "very
// slow" drive can be arbitrarily far over and a "very fast" one arbitrarily under; only the wrong
// SIDE is an error. Targets are the MIDDLE of each intended band, not the boundary.
const TARGET = {
    very_fast: { t: 0.62, w: 0.5, side: 'below' },   // S band
    fast:      { t: 0.72, w: 1.0 },                  // A band
    par:       { t: 0.88, w: 2.0 },                  // B/C — a normal pace passes with room
    slow:      { t: 0.97, w: 1.0 },                  // deep C, still a pass
    very_slow: { t: 1.10, w: 0.5, side: 'above' },   // D — failed the standard
}
function score(mu, accel, brake) {
    const ref = { ...BASE, mu, accel, brake }
    let loss = 0
    const ratios = { very_fast: [], fast: [], par: [], slow: [], very_slow: [] }
    for (const r of runs) {
        const par = r.corr * parWith(r.segments, ref)
        const ratio = r.result.elapsed_s / par
        ratios[r.felt]?.push(ratio)
        const tg = TARGET[r.felt]
        if (!tg) continue
        let e = Math.log(ratio / tg.t)
        if (tg.side === 'below' && e < 0) e = 0     // under the very_fast bar is fine
        if (tg.side === 'above' && e > 0) e = 0     // over the very_slow bar is fine
        const w = tg.w * (r.corr < 0.9 || r.corr > 1.15 ? 0.25 : 1)
        loss += w * e * e
    }
    return { loss, ratios }
}

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN }
// mu sweeps well past the skidpad ceiling (0.72–0.74) ON PURPOSE: the reference is centerline-
// bound, a human cuts the line with the full road width, so the EFFECTIVE centerline mu of a
// committed drive exceeds physical grip. (The old ×0.85 "realization fraction" had the sign
// backwards — the data says line freedom multiplies up, not down.)
let best = null
for (const accel of [2.8, 3.0, 3.2]) {
    for (const brake of [5.5, 6.5, 7.0]) {
        for (let mu = 0.58; mu <= 0.9501; mu += 0.005) {
            const { loss } = score(mu, accel, brake)
            if (!best || loss < best.loss) best = { mu: +mu.toFixed(3), accel, brake, loss }
        }
    }
}

// ── 3. report ───────────────────────────────────────────────────────────────────────────────
console.log('\n── candidates (per-felt MEDIAN ratio; par-felt → 1.00 is the goal) ──')
console.log('   mu  accel brake |  v.fast   fast    par    slow  v.slow |  loss')
const show = (mu, accel, brake, mark = ' ') => {
    const { loss, ratios } = score(mu, accel, brake)
    const f = (k) => { const m = med(ratios[k]); return isNaN(m) ? '  --  ' : m.toFixed(3).padStart(6) }
    console.log(`${mark} ${mu.toFixed(3)} ${accel.toFixed(1)}  ${brake.toFixed(1)}  | ${f('very_fast')} ${f('fast')} ${f('par')} ${f('slow')} ${f('very_slow')} | ${loss.toFixed(4)}`)
}
show(BASE.mu, BASE.accel, BASE.brake)            // shipped, for contrast
for (const mu of [0.66, 0.70, 0.74, 0.78, 0.82, 0.86, 0.90]) show(mu, best.accel, best.brake)
console.log('   ── best ──')
show(best.mu, best.accel, best.brake, '*')

// residual bias by route character under the winner
console.log('\n── residuals under the winner (ratio vs felt target; + = slower than target) ──')
const refBest = { ...BASE, mu: best.mu, accel: best.accel, brake: best.brake }
const rows = runs.map(r => {
    const par = r.corr * parWith(r.segments, refBest)
    const ratio = r.result.elapsed_s / par
    const col = Object.fromEntries(r.topology.columns.map((c, i) => [c, i]))
    const curvAvg = r.topology.rows.reduce((a, w) => a + Math.abs(w[col.curv_1pm]), 0) / r.topology.rows.length
    return { file: r.file, felt: r.felt, ratio, resid: Math.log(ratio / (TARGET[r.felt]?.t ?? 1)), curvAvg, dist: r.route.distance_m }
}).sort((a, b) => a.curvAvg - b.curvAvg)
for (const r of rows) {
    console.log(`  ${r.felt.padEnd(9)} ratio ${r.ratio.toFixed(3)}  resid ${(r.resid >= 0 ? '+' : '') + r.resid.toFixed(3)}  `
        + `avg|κ| ${(r.curvAvg * 1000).toFixed(1)}/km  ${(r.dist / 1000).toFixed(1)} km  ${r.file}`)
}
const lo = rows.slice(0, Math.floor(rows.length / 2)), hi = rows.slice(Math.floor(rows.length / 2))
const avg = (a) => a.reduce((x, y) => x + y.resid, 0) / a.length
console.log(`\nbias: straighter half avg resid ${avg(lo).toFixed(3)} · twistier half ${avg(hi).toFixed(3)} `
    + `(a gap ⇒ mu vs accel/vMax imbalance)`)

console.log(`\nRECOMMENDED PAR_REF: mu ${best.mu} · accel ${best.accel} · brake ${best.brake} `
    + `(vMax/vCeil/junction* unchanged)`)
