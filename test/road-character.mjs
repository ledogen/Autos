// test/road-character.mjs — the "feels good" score report (Road-Feel Overhaul, Phase 1).
//
// Builds a headless RoadSystem (same harness pattern as windiness-metrics.mjs), walks every
// streamed _network run and reports the character numbers the overhaul tunes against:
//
//   STRAIGHTNESS  straight-span length histogram (|κ| < 1/2000 sustained), % of network length
//                 in straights > 200 m (PRIMARY number — target 0), worst spans with x/z coords
//   RHYTHM        length-weighted turn-radius distribution (sweep/gentle/medium/hairpin bands)
//   GRADE         max / p95 (length-weighted), % of length over the soft grade target
//   EARTHWORK     mean/max |designY − rawTerrainY| (the fill/cut the carve must build)
//   CREST         max |Δgrade/Δs| → implied vertical radius → vertical accel at 25 m/s in g
//                 (target ≤ ~0.25 g — above that a crest reads as a launch ramp)
//   SWITCHBACKS   ≥150° net heading reversals within a 300 m window, split gentle vs steep terrain
//
// Every "worst" entry carries x/z world coords so screenshots / in-game teleports correlate
// (pairs with the HUD seed/x/z OSD).
//
//   node test/road-character.mjs                    # seed 6, landmark window, defaults
//   node test/road-character.mjs seed=11 r=1200     # other seed / stream radius
//   node test/road-character.mjs roadWGrade=400 roadGraphMaxGrade=0.12   # param overrides
//   node test/road-character.mjs --json             # machine-readable (sweep driver)
//
// Reserved keys: seed, cx, cz, r (stream window). Everything else k=v is a RANGER_PARAMS override
// (numbers/bools). Default window (cx=-975, cz=765, r=1400) covers the seed-6 landmark set:
// bad climb (−202,−7), junctions (−1135,669)/(−1845,385), stream source (−1633,570),
// lateral jog (−164,1131), stream end (−347,1536), crests (−989,560), spawn (−102,178).

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const JSON_OUT = argv.includes('--json')
const reserved = { seed: 6, cx: -975, cz: 765, r: 1400 }
const overrides = {}
for (const a of argv) {
    const m = a.match(/^([A-Za-z][A-Za-z0-9]*)=(.+)$/)
    if (!m) continue
    const v = m[2] === 'true' ? true : m[2] === 'false' ? false : Number(m[2])
    if (m[1] in reserved) reserved[m[1]] = v
    else overrides[m[1]] = v
}
const { seed: SEED, cx: CX, cz: CZ, r: RADIUS } = reserved

// ── build the network ────────────────────────────────────────────────────────
const P = { ...RANGER_PARAMS, ...overrides }
const road = new RoadSystem(SEED, P)
road.setRadius(RADIUS)
road.update(new THREE.Vector3(CX, 0, CZ))

// ── shared helpers ───────────────────────────────────────────────────────────
const STRAIGHT_R   = 2000        // m — |κ| below 1/this counts as straight
const SMOOTH_HALF  = 10          // m — box half-window for κ / vertical-curvature smoothing
const LONG_STRAIGHT = 200        // m — the "never longer than this" target
const SB_WINDOW    = 300         // m — switchback detection window
const SB_TURN      = 150 * Math.PI / 180   // rad — net heading change that counts as a reversal
const STEEP_TERRAIN = 0.10       // raw-terrain grade that classifies a switchback as "alpine"
const V_REF        = 25          // m/s — crest vertical-g reference speed
const maxGradeTarget = P.roadGraphMaxGrade ?? 0.15

// Arc-length box smooth (two-pointer, mirrors smoothGradeInPlace's window semantics).
function boxSmooth(vals, arc, half) {
    const N = vals.length, out = new Float64Array(N)
    let lo = 0, hi = 0, sum = 0
    for (let i = 0; i < N; i++) {
        while (hi < N && arc[hi] <= arc[i] + half) { sum += vals[hi]; hi++ }
        while (lo < hi && arc[lo] < arc[i] - half) { sum -= vals[lo]; lo++ }
        out[i] = sum / (hi - lo)
    }
    return out
}
const pctl = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0
const r1 = (x) => Number(x.toFixed(1))
const r2 = (x) => Number(x.toFixed(2))
const r3 = (x) => Number(x.toFixed(3))
const pctOf = (part, whole) => r1(100 * part / (whole || 1))

// ── accumulate over every run ────────────────────────────────────────────────
const RADIUS_BANDS = [
    { name: '<30 (hairpin)',      lo: 0,    hi: 30 },
    { name: '30–80 (tight)',      lo: 30,   hi: 80 },
    { name: '80–150 (medium)',    lo: 80,   hi: 150 },
    { name: '150–400 (sweeper)',  lo: 150,  hi: 400 },
    { name: '400–2000 (gentle)',  lo: 400,  hi: 2000 },
    { name: '≥2000 (straight)',   lo: 2000, hi: Infinity },
]
const STRAIGHT_BUCKETS = [50, 100, 150, 200, 300, 500, Infinity]

let totalLen = 0, runCount = 0
const bandLen = new Array(RADIUS_BANDS.length).fill(0)
const straightHist = new Array(STRAIGHT_BUCKETS.length).fill(0)   // total LENGTH per bucket
let straightSpanCount = 0, longStraightLen = 0
const worstStraights = []            // { len, x, z, runKey }
const gradeSamples = []              // [g, segLen] length-weighted
let gradeOverLen = 0, gradeMax = 0, gradeMaxAt = null
let earthSum = 0, earthMax = 0, earthMaxAt = null
const crests = []                    // { dgds, x, z }
const switchbacks = []               // { x, z, steep }

for (const [runKey, e] of road._network) {
    const pts = e.points
    if (!pts || pts.length < 3) continue

    // arc positions + per-segment heading/length/grade
    const N = pts.length
    const arc = new Float64Array(N)
    for (let i = 1; i < N; i++) arc[i] = arc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
    const runLen = arc[N - 1]
    if (runLen < 30) continue
    runCount++; totalLen += runLen

    const segTh = new Float64Array(N - 1), segG = new Float64Array(N - 1), segL = new Float64Array(N - 1)
    for (let i = 0; i < N - 1; i++) {
        const dx = pts[i + 1].x - pts[i].x, dz = pts[i + 1].z - pts[i].z
        segL[i] = Math.hypot(dx, dz) || 1e-9
        segTh[i] = Math.atan2(dz, dx)
        segG[i] = (pts[i + 1].y - pts[i].y) / segL[i]
    }
    // unwrap headings so Δθ across segments is continuous
    for (let i = 1; i < N - 1; i++) {
        let d = segTh[i] - segTh[i - 1]
        while (d > Math.PI) d -= 2 * Math.PI
        while (d < -Math.PI) d += 2 * Math.PI
        segTh[i] = segTh[i - 1] + d
    }

    // vertex-level curvature κ = Δθ/Δs and vertical curvature dg/ds, box-smoothed over ±SMOOTH_HALF
    const M = N - 2                     // interior vertices 1..N-2
    const vArc = new Float64Array(M), vKap = new Float64Array(M), vDg = new Float64Array(M)
    for (let i = 0; i < M; i++) {
        const ds = 0.5 * (segL[i] + segL[i + 1])
        vArc[i] = arc[i + 1]
        vKap[i] = (segTh[i + 1] - segTh[i]) / ds
        vDg[i]  = (segG[i + 1] - segG[i]) / ds
    }
    const kSm  = boxSmooth(vKap, vArc, SMOOTH_HALF)
    const dgSm = boxSmooth(vDg,  vArc, SMOOTH_HALF)

    // RHYTHM: length-weighted radius bands (per interior vertex, weight = local ds)
    for (let i = 0; i < M; i++) {
        const w = 0.5 * (segL[i] + segL[i + 1])
        const R = 1 / Math.max(Math.abs(kSm[i]), 1e-9)
        for (let b = 0; b < RADIUS_BANDS.length; b++) {
            if (R >= RADIUS_BANDS[b].lo && R < RADIUS_BANDS[b].hi) { bandLen[b] += w; break }
        }
    }

    // STRAIGHTNESS: contiguous |κ| < 1/STRAIGHT_R spans by arc length
    let spanStart = -1
    const closeSpan = (endArc) => {
        if (spanStart < 0) return
        const len = endArc - spanStart
        spanStart = -1
        if (len < 5) return
        straightSpanCount++
        for (let b = 0; b < STRAIGHT_BUCKETS.length; b++) {
            if (len < STRAIGHT_BUCKETS[b]) { straightHist[b] += len; break }
        }
        if (len > LONG_STRAIGHT) {
            longStraightLen += len
            // mid-span coords for screenshots
            const midArc = (endArc + (endArc - len)) / 2
            let j = 1; while (j < N - 1 && arc[j] < midArc) j++
            worstStraights.push({ len: r1(len), x: r1(pts[j].x), z: r1(pts[j].z), runKey })
        }
    }
    for (let i = 0; i < M; i++) {
        if (Math.abs(kSm[i]) < 1 / STRAIGHT_R) { if (spanStart < 0) spanStart = vArc[i] }
        else closeSpan(vArc[i])
    }
    closeSpan(vArc[M - 1] ?? 0)

    // GRADE + EARTHWORK per segment
    for (let i = 0; i < N - 1; i++) {
        const g = Math.abs(segG[i])
        gradeSamples.push([g, segL[i]])
        if (g > maxGradeTarget) gradeOverLen += segL[i]
        if (g > gradeMax) { gradeMax = g; gradeMaxAt = { x: r1(pts[i].x), z: r1(pts[i].z) } }
        const raw = road._coarseH(pts[i].x, pts[i].z)
        const dev = Math.abs(pts[i].y - raw)
        earthSum += dev * segL[i]
        if (dev > earthMax) { earthMax = dev; earthMaxAt = { x: r1(pts[i].x), z: r1(pts[i].z) } }
    }

    // CREST: worst smoothed |dg/ds| per run (collect all interior samples for percentiles)
    for (let i = 0; i < M; i++) {
        const a = Math.abs(dgSm[i])
        if (a > 1 / 20000) crests.push({ dgds: a, x: r1(pts[i + 1].x), z: r1(pts[i + 1].z) })
    }

    // SWITCHBACKS: net heading change ≥ SB_TURN within SB_WINDOW (two-pointer, skip past hits)
    let i = 0
    while (i < N - 1) {
        let j = i
        while (j < N - 1 && arc[j] - arc[i] <= SB_WINDOW) {
            if (Math.abs(segTh[j] - segTh[i]) >= SB_TURN) {
                // raw-terrain steepness over the window classifies gentle vs alpine
                const rawA = road._coarseH(pts[i].x, pts[i].z), rawB = road._coarseH(pts[j].x, pts[j].z)
                const steep = Math.abs(rawB - rawA) / Math.max(1, arc[j] - arc[i]) > STEEP_TERRAIN
                const mid = (i + j) >> 1
                switchbacks.push({ x: r1(pts[mid].x), z: r1(pts[mid].z), steep })
                i = j
                break
            }
            j++
        }
        i++
    }
}

// ── aggregate ────────────────────────────────────────────────────────────────
gradeSamples.sort((a, b) => a[0] - b[0])
let acc = 0
const gradeTotalLen = gradeSamples.reduce((s, v) => s + v[1], 0) || 1
let gradeP95 = 0
for (const [g, w] of gradeSamples) { acc += w; if (acc >= gradeTotalLen * 0.95) { gradeP95 = g; break } }

crests.sort((a, b) => a.dgds - b.dgds)
const crestMax = crests.length ? crests[crests.length - 1] : { dgds: 0, x: 0, z: 0 }
const crestP99 = crests.length ? pctl(crests.map(c => c.dgds), 0.99) : 0
const vertG = (dgds) => V_REF * V_REF * dgds / 9.81

worstStraights.sort((a, b) => b.len - a.len)
const sbSteep = switchbacks.filter(s => s.steep).length

const report = {
    seed: SEED, window: { cx: CX, cz: CZ, r: RADIUS }, overrides,
    network: { runs: runCount, totalKm: r1(totalLen / 1000) },
    straightness: {
        pctOver200m: pctOf(longStraightLen, totalLen),                             // % network length
        spans: straightSpanCount,
        histogramLenM: Object.fromEntries(STRAIGHT_BUCKETS.map((b, i) =>
            [b === Infinity ? '500+' : `<${b}`, Math.round(straightHist[i])])),
        worst: worstStraights.slice(0, 5),
    },
    rhythm: Object.fromEntries(RADIUS_BANDS.map((b, i) => [b.name, pctOf(bandLen[i], totalLen)])),  // % length per band
    grade: {
        max: r3(gradeMax), maxAt: gradeMaxAt,
        p95: r3(gradeP95),
        pctOverTarget: pctOf(gradeOverLen, totalLen),
        target: maxGradeTarget,
    },
    earthwork: {
        meanM: r2(earthSum / (totalLen || 1)),
        maxM: r1(earthMax), maxAt: earthMaxAt,
    },
    crest: {
        maxDgds: Number(crestMax.dgds.toFixed(4)), maxAt: { x: crestMax.x, z: crestMax.z },
        impliedVRadiusM: Math.round(1 / Math.max(crestMax.dgds, 1e-9)),
        gAt25ms: r2(vertG(crestMax.dgds)),
        p99gAt25ms: r2(vertG(crestP99)),
    },
    switchbacks: { total: switchbacks.length, steepTerrain: sbSteep, gentleTerrain: switchbacks.length - sbSteep },
}

// ── output ───────────────────────────────────────────────────────────────────
if (JSON_OUT) {
    console.log(JSON.stringify(report))
} else {
    const f = (x, d = 1) => Number(x).toFixed(d)
    console.log(`\n=== road-character  seed=${SEED}  window=(${CX},${CZ}) r=${RADIUS}  ${JSON.stringify(overrides)} ===`)
    console.log(`network: ${runCount} runs, ${f(totalLen / 1000, 2)} km`)
    console.log(`\nSTRAIGHTNESS  (R ≥ ${STRAIGHT_R} m sustained)`)
    console.log(`  % length in straights > ${LONG_STRAIGHT} m: ${report.straightness.pctOver200m}%   (PRIMARY — target 0)`)
    console.log(`  span-length histogram (m of length): ${JSON.stringify(report.straightness.histogramLenM)}`)
    for (const w of report.straightness.worst) console.log(`  worst: ${w.len} m @ (${w.x}, ${w.z})`)
    console.log(`\nRHYTHM  (% length by turn radius)`)
    for (const [k, v] of Object.entries(report.rhythm)) console.log(`  ${k.padEnd(20)} ${v}%`)
    console.log(`\nGRADE   max=${f(report.grade.max * 100)}% @ (${gradeMaxAt?.x}, ${gradeMaxAt?.z})   p95=${f(report.grade.p95 * 100)}%   over ${f(maxGradeTarget * 100, 0)}% target: ${report.grade.pctOverTarget}% of length`)
    console.log(`EARTHWORK   mean=${report.earthwork.meanM} m   max=${report.earthwork.maxM} m @ (${earthMaxAt?.x}, ${earthMaxAt?.z})`)
    console.log(`CREST   vertical accel @25 m/s: max=${report.crest.gAt25ms} g (Rv≈${report.crest.impliedVRadiusM} m) @ (${crestMax.x}, ${crestMax.z})   p99=${report.crest.p99gAt25ms} g   (target ≤ 0.25 g)`)
    console.log(`SWITCHBACKS   ${report.switchbacks.total} total — ${sbSteep} on steep terrain, ${report.switchbacks.gentleTerrain} on gentle`)
}
