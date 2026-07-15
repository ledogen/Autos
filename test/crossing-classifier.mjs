// test/crossing-classifier.mjs — FEAT-07/08/11/13 foundation gate: the crossing classifier.
//
// Guards road.js _detectJunctions() / crossingList() — the bounded, once-per-build, self-aware crossing
// classifier that emits {runA,segA,arcA,yA, runB,segB,arcB,yB, angle, selfCrossing, kind}
// records and classifies each crossing NEAR_PARALLEL | AT_GRADE. This is the spine the at-grade pad
// (FEAT-07) and the graph junction blend (FEAT-13) consume — it still runs on every re-stream in the
// shipped graph topology (feeds the cull + the junction reconciliation). Overpasses were descoped:
// every crossing merges at grade, so GRADE_SEP never appears (only the angle picks the pad style).
//
// QUAL-12 (rows removed): exercised in graph mode with the crossing CULL OFF so the routed crossings
// survive to be classified (the cull would otherwise prune them to a handful). Asserts:
//   (a) CORRECTNESS  — the tile-bucket broad phase finds EXACTLY the same crossing set + classification
//                      as a brute-force all-pairs scan (so the perf optimization changes nothing).
//   (b) IDENTITY     — re-detecting the same network is a no-op (same Map instance returned).
// (Window-invariance of the crossing set is covered by graph-topology.mjs.)
//
// Run: node test/crossing-classifier.mjs   (exit 0 = green; exit 1 = a regression)

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const SEED = 6
// Graph is the sole topology. Cull OFF so routed crossings survive for the classifier to be tested on.
const P = { ...RANGER_PARAMS, roadGraphCullCrossings: false }
const ANGLE_MIN  = P.roadCrossAngleMin ?? 12

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
// Overpasses descoped → never GRADE_SEP; the angle only separates a real crossing from a near-parallel graze.
function classify(angle) { return angle < ANGLE_MIN ? 'NEAR_PARALLEL' : 'AT_GRADE' }

function bruteForce(road) {
    // (mz,mx) = the run's start node id (entry.cellA) — the per-run identity for the deterministic
    // over/under order (matches road.js _detectJunctions; no runKey parsing, works for graph site ids).
    const segOf = (runKey) => {
        const e = road._network.get(runKey), pts = e.points, polyCum = e.polyCum
        const segs = []
        for (let i = 0; i < pts.length - 1; i++) segs.push({
            runKey, segIdx: i, x0: pts[i].x, z0: pts[i].z, x1: pts[i + 1].x, z1: pts[i + 1].z,
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
        const v1x = S.x1 - S.x0, v1z = S.z1 - S.z0, v2x = T.x1 - T.x0, v2z = T.z1 - T.z0
        const l1 = Math.hypot(v1x, v1z) || 1, l2 = Math.hypot(v2x, v2z) || 1
        const angle = Math.acos(Math.min(1, Math.abs((v1x * v2x + v1z * v2z) / (l1 * l2)))) * (180 / Math.PI)
        const key = `${S.runKey}#${S.segIdx}|${T.runKey}#${T.segIdx}`
        out.set(key, { kind: classify(angle), x: ix.x, z: ix.z })
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

// ── Build the real seed-6 graph network around a crossing-rich center (the sparse blue-noise graph
// needs a wide radius + cull OFF for routed crossings to survive; this center carries ~8). ──
const roadA = new RoadSystem(SEED, P); roadA.setRadius(1600); roadA.update(new THREE.Vector3(-900, 0, 150))
const listA = roadA.crossingList()
const mapA  = listToMap(listA)

// (a) CORRECTNESS — broad phase == brute force (same keys, same kind). ────────────────
{
    const bf = bruteForce(roadA)
    let missing = 0, extra = 0, kindMis = 0, sample = ''
    for (const [k, r] of bf) {
        const g = mapA.get(k)
        if (!g) { if (missing++ === 0) sample = `bf has ${k} (${r.kind}) classifier missing it`; continue }
        if (g.kind !== r.kind) { if (kindMis++ === 0) sample = `${k}: bf=${r.kind} classifier=${g.kind}`; }
    }
    for (const k of mapA.keys()) if (!bf.has(k)) extra++
    log(mapA.size >= 1 && missing === 0 && extra === 0 && kindMis === 0, 'BROADPHASE-EQ-BRUTEFORCE',
        `crossings: classifier=${mapA.size} bruteforce=${bf.size} | missing=${missing} extra=${extra} kindMismatch=${kindMis}${sample ? ` | e.g. ${sample}` : ''}`)
}

// (b) IDENTITY — re-detecting the same network is a no-op (same Map instance). ───────────────────
{
    const j1 = roadA._detectJunctions(), j2 = roadA._detectJunctions()
    const l1 = roadA._crossingList
    roadA._detectJunctions(); const l2 = roadA._crossingList
    log(j1 === j2 && l1 === l2, 'ONCE-PER-BUILD-IDENTITY',
        `re-detect returns the cached Map (${j1 === j2}) + stable crossing list (${l1 === l2})`)
}

console.log(`\nCROSSING-CLASSIFIER: ${pass}/${pass + fail} checks green`)
process.exit(fail === 0 ? 0 : 1)
