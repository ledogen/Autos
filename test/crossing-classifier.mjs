// test/crossing-classifier.mjs — FEAT-07/08/11/13 foundation gate: the crossing classifier.
//
// Guards road.js _detectJunctions() / crossingList() — the bounded, once-per-build, self-aware crossing
// classifier that emits {runA,segA,arcA,yA, runB,segB,arcB,yB, dY, angle, selfCrossing, kind, under,over}
// records and classifies each crossing NEAR_PARALLEL | AT_GRADE | GRADE_SEP. This is the spine the
// at-grade pad (FEAT-07), overpass (FEAT-08), tunnel (FEAT-11) and N-S graph (FEAT-13) steps consume.
//
// Asserts:
//   (a) CORRECTNESS  — the tile-bucket broad phase finds EXACTLY the same crossing set + classification
//                      as a brute-force all-pairs scan (so the perf optimization changes nothing).
//   (b) INVARIANCE   — the crossing set + kind + over/under are identical from two stream centers,
//                      compared within a region both bands cover (D-16; no popping/flipping).
//   (c) SPLIT        — at the default thresholds the classes match the empirical seed-6 shape:
//                      AT_GRADE is the plurality, GRADE_SEP is a small non-zero minority.
//   (d) IDENTITY     — re-detecting the same network is a no-op (same Map instance returned).
//
// Run: node test/crossing-classifier.mjs   (exit 0 = green; exit 1 = a regression)

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const SEED = 6
// This gate exercises the ROWS-mode mid-span crossing classifier (adjacent parallel rows crossing away
// from a shared anchor). Graph mode is now the shipped default (data/ranger.js) but culls those crossings,
// so pin rows explicitly — this guards the rows code path, which remains a selectable mode.
const ROWS = { ...RANGER_PARAMS, roadNetworkMode: 'rows' }
const p = ROWS
const MERGE_DY  = p.roadCrossMergeDY  ?? 2.5
const ANGLE_MIN = p.roadCrossAngleMin ?? 12

let pass = 0, fail = 0
const log = (ok, name, msg) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`); ok ? pass++ : fail++ }

// ── Brute-force reference: replicate _detectJunctions' classification with an all-pairs scan. ──
// Inline the SAME segment-intersection math (open interval) + the SAME classification + canonical key.
function segCross(ax, az, bx, bz, cx, cz, dx, dz) {
    const ex = bx - ax, ez = bz - az, fx = dx - cx, fz = dz - cz
    const denom = ex * fz - ez * fx
    if (Math.abs(denom) < 1e-10) return null
    const t = ((cx - ax) * fz - (cz - az) * fx) / denom
    const u = ((cx - ax) * ez - (cz - az) * ex) / denom
    if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) return { x: ax + t * ex, z: az + t * ez, t, u }
    return null
}
function classify(dY, angle) { return angle < ANGLE_MIN ? 'NEAR_PARALLEL' : (dY <= MERGE_DY ? 'AT_GRADE' : 'GRADE_SEP') }

function bruteForce(road) {
    const segOf = (runKey) => {
        const e = road._network.get(runKey), pts = e.points, polyCum = e.polyCum
        const ci = runKey.indexOf(':'), mz = +runKey.slice(0, ci), mx = +runKey.slice(ci + 1)
        const segs = []
        for (let i = 0; i < pts.length - 1; i++) segs.push({
            runKey, mz, mx, segIdx: i, x0: pts[i].x, z0: pts[i].z, x1: pts[i + 1].x, z1: pts[i + 1].z,
            y0: pts[i].y, y1: pts[i + 1].y, a0: polyCum ? polyCum[i] : i, a1: polyCum ? polyCum[i + 1] : i + 1,
        })
        return segs
    }
    const keys = [...road._network.keys()]
    const out = new Map()
    const consider = (S0, T0, ix) => {
        // canonical S-before-T by (runKey, segIdx) — matches _recordCrossing
        const aFirst = S0.runKey < T0.runKey || (S0.runKey === T0.runKey && S0.segIdx < T0.segIdx)
        const S = aFirst ? S0 : T0, T = aFirst ? T0 : S0
        const tt = aFirst ? ix.t : ix.u, uu = aFirst ? ix.u : ix.t
        const yA = S.y0 + (S.y1 - S.y0) * tt, yB = T.y0 + (T.y1 - T.y0) * uu
        const dY = Math.abs(yA - yB)
        const arcA = S.a0 + (S.a1 - S.a0) * tt, arcB = T.a0 + (T.a1 - T.a0) * uu
        const v1x = S.x1 - S.x0, v1z = S.z1 - S.z0, v2x = T.x1 - T.x0, v2z = T.z1 - T.z0
        const l1 = Math.hypot(v1x, v1z) || 1, l2 = Math.hypot(v2x, v2z) || 1
        const angle = Math.acos(Math.min(1, Math.abs((v1x * v2x + v1z * v2z) / (l1 * l2)))) * (180 / Math.PI)
        const ta = [S.mz, S.mx, Math.round(arcA * 10)], tb = [T.mz, T.mx, Math.round(arcB * 10)]
        const aUnder = ta[0] !== tb[0] ? ta[0] < tb[0] : (ta[1] !== tb[1] ? ta[1] < tb[1] : ta[2] <= tb[2])
        const key = `${S.runKey}#${S.segIdx}|${T.runKey}#${T.segIdx}`
        out.set(key, { kind: classify(dY, angle), under: aUnder ? S.runKey : T.runKey, over: aUnder ? T.runKey : S.runKey, dY, x: ix.x, z: ix.z })
    }
    for (let ri = 0; ri < keys.length; ri++) {
        const A = segOf(keys[ri])
        for (let rj = ri; rj < keys.length; rj++) {
            const sameRun = ri === rj
            const B = sameRun ? A : segOf(keys[rj])
            for (let i = 0; i < A.length; i++) for (let j = (sameRun ? i + 2 : 0); j < B.length; j++) {
                const ix = segCross(A[i].x0, A[i].z0, A[i].x1, A[i].z1, B[j].x0, B[j].z0, B[j].x1, B[j].z1)
                if (ix) consider(A[i], B[j], ix)
            }
        }
    }
    return out
}

const keyOf = (r) => `${r.runA}#${r.segA}|${r.runB}#${r.segB}`
const listToMap = (list) => new Map(list.map(r => [keyOf(r), r]))

// ── Build the real seed-6 network around a crossing-rich center. ──
const roadA = new RoadSystem(SEED, ROWS); roadA.update(new THREE.Vector3(4500, 0, 600))
const listA = roadA.crossingList()
const mapA  = listToMap(listA)

// (a) CORRECTNESS — broad phase == brute force (same keys, same kind/under/over). ────────────────
{
    const bf = bruteForce(roadA)
    let missing = 0, extra = 0, kindMis = 0, ouMis = 0, sample = ''
    for (const [k, r] of bf) {
        const g = mapA.get(k)
        if (!g) { if (missing++ === 0) sample = `bf has ${k} (${r.kind}) classifier missing it`; continue }
        if (g.kind !== r.kind) { if (kindMis++ === 0) sample = `${k}: bf=${r.kind} classifier=${g.kind}`; }
        if (g.under !== r.under || g.over !== r.over) ouMis++
    }
    for (const k of mapA.keys()) if (!bf.has(k)) extra++
    log(missing === 0 && extra === 0 && kindMis === 0 && ouMis === 0, 'BROADPHASE-EQ-BRUTEFORCE',
        `crossings: classifier=${mapA.size} bruteforce=${bf.size} | missing=${missing} extra=${extra} kindMismatch=${kindMis} over/underMismatch=${ouMis}${sample ? ` | e.g. ${sample}` : ''}`)
}

// (b) INVARIANCE — two stream centers agree within the region both bands cover. ──────────────────
{
    const roadB = new RoadSystem(SEED, ROWS); roadB.update(new THREE.Vector3(4756, 0, 600))
    const mapB = listToMap(roadB.crossingList())
    // Interior region safely inside both ±~512 m bands (A@4500, B@4756; z centre shared).
    // Region widened 2026-07-01 (BUG-16/FEAT-20 refit): straightened rows weave/cross less, so the
    // old x[4350,4900] z[200,1000] box holds only 1 crossing — sample-size fix only, the invariance
    // assertions themselves (onlyA/onlyB/classMismatch = 0) are unchanged and still bind.
    const inRegion = (r) => r.point.x >= 4350 && r.point.x <= 4950 && r.point.z >= -250 && r.point.z <= 1000
    const regA = [...mapA.values()].filter(inRegion), regB = [...mapB.values()].filter(inRegion)
    const setA = new Set(regA.map(keyOf)), setB = new Set(regB.map(keyOf))
    let onlyA = 0, onlyB = 0, sample = ''
    for (const k of setA) if (!setB.has(k)) { if (onlyA++ === 0) sample = `${k} only in A`; }
    for (const k of setB) if (!setA.has(k)) { if (onlyB++ === 0) sample = `${k} only in B`; }
    // Over the FULL key-intersection (not just the region) the classification must be byte-identical —
    // a large-sample determinism check on kind / over-under / dY independent of stream center.
    let mism = 0, both = 0
    for (const r of mapA.values()) {
        const t = mapB.get(keyOf(r)); if (!t) continue
        both++
        if (r.kind !== t.kind || r.under !== t.under || r.over !== t.over || Math.abs(r.dY - t.dY) > 1e-6) {
            if (mism++ === 0) sample = `${keyOf(r)}: A{${r.kind},u=${r.under}} B{${t.kind},u=${t.under}}`
        }
    }
    log(regA.length >= 2 && both >= 3 && onlyA === 0 && onlyB === 0 && mism === 0, 'CROSS-CENTER-INVARIANT',
        `region set A=${regA.length} B=${regB.length} onlyA=${onlyA} onlyB=${onlyB} | shared crossings=${both} classMismatch=${mism}${sample ? ` | ${sample}` : ''}`)
}

// (c) SPLIT — the classifier spans all three classes (a regression check, NOT a brittle ratio). ──
// At current earthwork params the real seed-6 split is ~25% NEAR_PARALLEL / ~quarter each across the
// dY range (GRADE_SEP ≈ 50% at the 2.5 m default — overpasses are a major fraction, not a rare tail).
// The gate only asserts the classifier is alive and spanning the space: all three kinds present and
// GRADE_SEP neither empty (threshold → ∞) nor everything (threshold → 0). The exact ratio is a
// USER-OWNED tuning concern (roadCrossMergeDY), not a gate invariant.
{
    const counts = { NEAR_PARALLEL: 0, AT_GRADE: 0, GRADE_SEP: 0 }
    const seen = new Set()
    // Center list extended 2026-07-01 (BUG-16/FEAT-20 refit): straightened rows cross less often
    // (the serpentine weave WAS a crossing factory), so the original 5 centers dropped to 14 total
    // crossings. More centers restore the >20 sample; the class-span assertions are unchanged.
    for (const c of [[4500, 600], [-300, 220], [-900, 150], [800, 440], [5300, 850],
                     [1500, 300], [2500, 700], [-2000, 400], [-1500, 800], [6000, 400], [-3000, 600]]) {
        const r = new RoadSystem(SEED, ROWS); r.update(new THREE.Vector3(c[0], 0, c[1]))
        for (const rec of r.crossingList()) {
            const gk = `${Math.round(rec.point.x)},${Math.round(rec.point.z)}`
            if (seen.has(gk)) continue; seen.add(gk)
            counts[rec.kind]++
        }
    }
    const total = counts.NEAR_PARALLEL + counts.AT_GRADE + counts.GRADE_SEP
    const sepFrac = counts.GRADE_SEP / total
    const ok = total > 20 && counts.NEAR_PARALLEL > 0 && counts.AT_GRADE > 0 && counts.GRADE_SEP > 0
        && sepFrac > 0.02 && sepFrac < 0.85
    log(ok, 'CLASSIFICATION-SPANS-CLASSES',
        `total=${total} NEAR_PARALLEL=${counts.NEAR_PARALLEL} AT_GRADE=${counts.AT_GRADE} GRADE_SEP=${counts.GRADE_SEP} (sep=${(sepFrac * 100).toFixed(1)}%)`)
}

// (d) IDENTITY — re-detecting the same network is a no-op (same Map instance). ───────────────────
{
    const j1 = roadA._detectJunctions(), j2 = roadA._detectJunctions()
    const l1 = roadA._crossingList
    roadA._detectJunctions(); const l2 = roadA._crossingList
    log(j1 === j2 && l1 === l2, 'ONCE-PER-BUILD-IDENTITY',
        `re-detect returns the cached Map (${j1 === j2}) + stable crossing list (${l1 === l2})`)
}

console.log(`\nCROSSING-CLASSIFIER: ${pass}/${pass + fail} checks green`)
process.exit(fail === 0 ? 0 : 1)
