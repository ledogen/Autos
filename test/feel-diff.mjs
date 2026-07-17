// test/feel-diff.mjs — objective "road feel" comparison between two dump-network.mjs dumps.
//
// The feel contract for routing-perf experiments: a candidate change (params or router code)
// is compared against the shipped baseline on THREE layers, most- to least-sensitive:
//
//   TOPOLOGY   which runs exist (runKey set): added / removed / kept. A changed edge set means
//              the culler saw different crossings — a real network-character change.
//   GEOMETRY   for each kept run, lateral deviation between the two centerlines (directed
//              sample→nearest-segment distance, both directions, mean + max). This is "did the
//              road move on the hillside", in metres.
//   CHARACTER  aggregate stats recomputed per dump from the polylines: length, curvature-band
//              share (sweep/gentle/medium/hairpin — length-weighted), straight-span share,
//              grade p95/max. These are the road-character.mjs numbers the feel was tuned on
//              (approximated from the dumped polylines rather than run profiles).
//
// Verdict guidance (not enforced): topology identical + max lateral < ~1 m ≈ byte-equivalent
// feel; topology identical + max lateral < ~15 m with character deltas < ~2 pt = "same feel,
// different metal" (present to the user with map2d screenshots); topology changed = new world
// character — needs explicit user sign-off.
//
//   node test/feel-diff.mjs /tmp/a.json /tmp/b.json [--per-run]
//
// Not a gate — the routing-perf workbench comparator (pairs with test/dump-network.mjs).

import { readFileSync } from 'node:fs'

const [fa, fb] = process.argv.slice(2).filter(a => !a.startsWith('--'))
const PER_RUN = process.argv.includes('--per-run')
if (!fa || !fb) { console.error('usage: node test/feel-diff.mjs a.json b.json [--per-run]'); process.exit(2) }
const A = JSON.parse(readFileSync(fa, 'utf8')), B = JSON.parse(readFileSync(fb, 'utf8'))

// ── TOPOLOGY ─────────────────────────────────────────────────────────────────
const keysA = new Set(Object.keys(A.runs)), keysB = new Set(Object.keys(B.runs))
const kept = [...keysA].filter(k => keysB.has(k))
const removed = [...keysA].filter(k => !keysB.has(k))
const added = [...keysB].filter(k => !keysA.has(k))
console.log(`── topology ──`)
console.log(`  A: ${keysA.size} runs ${(A.summary.totalLen / 1000).toFixed(1)} km | B: ${keysB.size} runs ${(B.summary.totalLen / 1000).toFixed(1)} km`)
console.log(`  kept ${kept.length} | removed ${removed.length} | added ${added.length}${removed.length + added.length ? '   ← TOPOLOGY CHANGED' : '   (identical edge set)'}`)
for (const k of removed.slice(0, 6)) console.log(`    − ${k}`)
for (const k of added.slice(0, 6)) console.log(`    + ${k}`)

// ── GEOMETRY: directed point→polyline distance, sampled every ~10 m ──────────
function toPts(flat) { const p = []; for (let i = 0; i < flat.length; i += 3) p.push([flat[i], flat[i + 1], flat[i + 2]]); return p }
function segDist2(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1
    let t = ((px - ax) * dx + (pz - az) * dz) / L2
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const qx = ax + t * dx, qz = az + t * dz
    return (px - qx) * (px - qx) + (pz - qz) * (pz - qz)
}
// coarse spatial grid over B's segments so kept-run comparison is O(n) not O(n²)
function dirDev(pa, pb, step = 10) {
    // grid over pb segments
    const CELL = 64, grid = new Map()
    const gk = (x, z) => Math.floor(x / CELL) * 73856093 ^ Math.floor(z / CELL) * 19349663
    for (let i = 1; i < pb.length; i++) {
        const [ax, , az] = pb[i - 1], [bx, , bz] = pb[i]
        const x0 = Math.floor(Math.min(ax, bx) / CELL), x1 = Math.floor(Math.max(ax, bx) / CELL)
        const z0 = Math.floor(Math.min(az, bz) / CELL), z1 = Math.floor(Math.max(az, bz) / CELL)
        for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
            const key = gx * 73856093 ^ gz * 19349663
            const b = grid.get(key); if (b) b.push(i); else grid.set(key, [i])
        }
    }
    let sum = 0, max = 0, n = 0, acc = 0
    for (let i = 1; i < pa.length; i++) {
        const [ax, , az] = pa[i - 1], [bx, , bz] = pa[i]
        const L = Math.hypot(bx - ax, bz - az)
        acc += L
        if (acc < step) continue
        acc = 0
        let best = Infinity
        const cx = Math.floor(bx / CELL), cz = Math.floor(bz / CELL)
        for (let r = 0; r <= 8 && best === Infinity; r++) {   // expand rings until a segment found
            for (let gx = cx - r; gx <= cx + r; gx++) for (let gz = cz - r; gz <= cz + r; gz++) {
                if (Math.max(Math.abs(gx - cx), Math.abs(gz - cz)) !== r) continue
                const bkt = grid.get(gx * 73856093 ^ gz * 19349663)
                if (bkt) for (const si of bkt) {
                    const d2 = segDist2(bx, bz, pb[si - 1][0], pb[si - 1][2], pb[si][0], pb[si][2])
                    if (d2 < best) best = d2
                }
            }
            if (best !== Infinity && r < 8) {   // one extra ring: nearest seg may sit in next ring
                const rr = r + 1
                for (let gx = cx - rr; gx <= cx + rr; gx++) for (let gz = cz - rr; gz <= cz + rr; gz++) {
                    if (Math.max(Math.abs(gx - cx), Math.abs(gz - cz)) !== rr) continue
                    const bkt = grid.get(gx * 73856093 ^ gz * 19349663)
                    if (bkt) for (const si of bkt) {
                        const d2 = segDist2(bx, bz, pb[si - 1][0], pb[si - 1][2], pb[si][0], pb[si][2])
                        if (d2 < best) best = d2
                    }
                }
                break
            }
        }
        if (best === Infinity) continue
        const d = Math.sqrt(best)
        sum += d; if (d > max) max = d; n++
    }
    return { mean: n ? sum / n : 0, max, n }
}

let worst = [], meanAcc = 0, meanN = 0, identical = 0
for (const k of kept) {
    const pa = toPts(A.runs[k].pts), pb = toPts(B.runs[k].pts)
    const d1 = dirDev(pa, pb), d2 = dirDev(pb, pa)
    const mean = (d1.mean + d2.mean) / 2, max = Math.max(d1.max, d2.max)
    if (max < 0.05) identical++
    meanAcc += mean; meanN++
    worst.push({ k, mean, max })
    if (PER_RUN) console.log(`    ${k}: mean ${mean.toFixed(2)} m, max ${max.toFixed(2)} m`)
}
worst.sort((a, b) => b.max - a.max)
console.log(`── geometry (kept runs) ──`)
console.log(`  identical (<5 cm): ${identical}/${kept.length} | mean lateral ${meanN ? (meanAcc / meanN).toFixed(2) : 0} m`)
for (const w of worst.slice(0, 5)) if (w.max >= 0.05) console.log(`    worst: ${w.k} mean ${w.mean.toFixed(1)} m max ${w.max.toFixed(1)} m`)

// ── CHARACTER: aggregate stats per dump from polylines ───────────────────────
const BANDS = [[0, 1 / 200, 'sweep(>200m)'], [1 / 200, 1 / 90, 'gentle(90-200)'], [1 / 90, 1 / 35, 'medium(35-90)'], [1 / 35, Infinity, 'hairpin(<35)']]
function charStats(runs) {
    let straightLen = 0, total = 0
    const bandLen = new Array(BANDS.length).fill(0)
    const grades = []
    for (const k of Object.keys(runs)) {
        const p = toPts(runs[k].pts)
        for (let i = 1; i < p.length - 1; i++) {
            const [x0, , z0] = p[i - 1], [x1, y1, z1] = p[i], [x2, y2, z2] = p[i + 1]
            const l1 = Math.hypot(x1 - x0, z1 - z0), l2 = Math.hypot(x2 - x1, z2 - z1)
            const L = (l1 + l2) / 2
            if (L < 1e-6) continue
            total += L
            // circumradius curvature (3-pt)
            const a = Math.hypot(x1 - x0, z1 - z0), b = Math.hypot(x2 - x1, z2 - z1), c = Math.hypot(x2 - x0, z2 - z0)
            const area2 = Math.abs((x1 - x0) * (z2 - z0) - (x2 - x0) * (z1 - z0))
            const kappa = (a * b * c) > 1e-9 ? (2 * area2) / (a * b * c) : 0
            if (kappa < 1 / 2000) straightLen += L
            for (let bi = 0; bi < BANDS.length; bi++) if (kappa >= BANDS[bi][0] && kappa < BANDS[bi][1]) { bandLen[bi] += L; break }
            grades.push(Math.abs(y2 - y1) / (l2 || 1))
        }
    }
    grades.sort((x, y) => x - y)
    const p95 = grades.length ? grades[Math.floor(0.95 * grades.length)] : 0
    return { total, straightPct: 100 * straightLen / (total || 1), bandPct: bandLen.map(v => 100 * v / (total || 1)), gradeP95: p95, gradeMax: grades[grades.length - 1] ?? 0 }
}
const ca = charStats(A.runs), cb = charStats(B.runs)
console.log(`── character (length-weighted) ──`)
console.log(`                      A        B        Δ`)
const row = (name, va, vb, unit = '') => console.log(`  ${name.padEnd(16)} ${va.toFixed(1).padStart(7)} ${vb.toFixed(1).padStart(8)} ${(vb - va >= 0 ? '+' : '') + (vb - va).toFixed(1).padStart(7)}${unit}`)
row('total km', ca.total / 1000, cb.total / 1000)
row('straight %', ca.straightPct, cb.straightPct)
BANDS.forEach(([, , name], i) => row(name + ' %', ca.bandPct[i], cb.bandPct[i]))
row('grade p95 %', 100 * ca.gradeP95, 100 * cb.gradeP95)
row('grade max %', 100 * ca.gradeMax, 100 * cb.gradeMax)
console.log(`── build time ──\n  A ${A.meta.buildMs} ms | B ${B.meta.buildMs} ms | speedup ×${(A.meta.buildMs / (B.meta.buildMs || 1)).toFixed(2)}`)
