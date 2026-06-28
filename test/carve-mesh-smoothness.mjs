// test/carve-mesh-smoothness.mjs — QUAL-07 carve-mesh whole-surface smoothness gate.
//
// GUARDS CATASTROPHIC CARVE TEARING (spikes / cliffs / holes in the terrain mesh). Earlier QUAL-07
// attempts passed a point-sample agreement gate yet shredded the mesh in-browser, because a point gate
// can't see vertex-to-vertex tearing across the FULL surface. This gate runs the REAL
// TerrainSystem._buildCarveTable (via the prototype + a fake `this` — no Worker) over every chunk that
// carries road carve, reconstructs the mesh surface the renderer draws (raw + blendW·(gradeY − raw)),
// and asserts the surface is BOUNDED and SMOOTH — no extreme spikes, no per-cell wall blow-ups.
//
// It is the regression net the prior attempt lacked: GREEN on the shipped carve, RED on a carve that
// tears. Calibrate thresholds generously (this catches CATASTROPHE — metres of spike — not the subtle
// QUAL-06 staircase, which is a separate, tighter metric).
//
// Run: node test/carve-mesh-smoothness.mjs   (exit 0 = mesh surface is intact)

import * as THREE from 'three'
import { TerrainSystem } from '../src/terrain.js'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { makeTerrainHeadless, makeNoise } from './lib/terrain-headless.mjs'

const SEEDS = [6, 7]
const N = 65, CS = 64, amp = RANGER_PARAMS.terrainAmplitude ?? 1
// Thresholds (catastrophe-scale): a real carve bank can be steep, but adjacent 1 m cells never jump by
// more than a few metres of SECOND difference, and the carve never lifts/sinks a vertex tens of metres
// off where raw+road-grade could plausibly put it. The broken attempt spiked by 10s–100s of metres.
// Calibrated GOOD (shipped) vs BROKEN (the torn QUAL-07 attempt), 2026-06-27:
//   worst 2nd-diff   GOOD 40–45 m   BROKEN 144–147 m
//   spike edges >6 m GOOD ~1.0%     BROKEN ~3.1%
// Thresholds sit between, with margin: a correct change stays ≤ shipped; a tear blows past. (These
// catch CATASTROPHE — the residual ~45 m switchback shards are a separate FEAT-10/D3 problem, tolerated.)
const SPIKE = 6.0              // m — per-edge 2nd-difference above this = a "spike" edge
const SPIKE_PCT_TOL = 1.8      // % of edges allowed to spike (shipped ~1.0; broken ~3.1)
const SECOND_DIFF_TOL = 80     // m — worst single 2nd-difference (shipped ~45; broken ~146)

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}

for (const seed of SEEDS) {
    const road = new RoadSystem(seed, RANGER_PARAMS)
    road.update(new THREE.Vector3(0, 0, 0))
    const terr = makeTerrainHeadless(seed, RANGER_PARAMS, road)
    const noise = makeNoise(seed)
    // Fake `this` carrying exactly what _buildCarveTable reads (road + params + the 3 noise closures).
    const fakeT = {
        _roadSystem: road, _params: RANGER_PARAMS,
        _noiseCoarse: noise.noiseCoarse, _noiseFine: noise.noiseFine, _noiseRegional: noise.noiseRegional,
    }

    // Chunks that carry carve: the chunk of every Kth network point (dedup).
    const chunks = new Set()
    for (const [, entry] of road._network) {
        const pts = entry.points
        for (let i = 0; i < pts.length; i += 4) chunks.add(`${Math.floor(pts[i].x / CS)},${Math.floor(pts[i].z / CS)}`)
    }

    let worstSD = 0, worstSDat = '', worstAbs = 0, carvedChunks = 0
    let spikeCount = 0, totalV = 0, worstAgree = 0, agreeSamples = 0
    for (const ck of chunks) {
        const [cx, cz] = ck.split(',').map(Number)
        // Pre-amplitude raw 65×65 (row-major zi*N+xi), matching terrain.js's rawHeights input.
        const rawPre = new Float32Array(N * N)
        for (let zi = 0; zi < N; zi++) for (let xi = 0; xi < N; xi++) {
            const wx = cx * CS + xi, wz = cz * CS + zi
            rawPre[zi * N + xi] = terr.rawHeightWorld(wx, wz) / amp
        }
        const table = TerrainSystem.prototype._buildCarveTable.call(fakeT, cx, cz, rawPre)
        if (!table) continue
        carvedChunks++

        const surf = new Float64Array(N * N)
        for (let i = 0; i < N * N; i++) {
            const raw = rawPre[i] * amp
            const blendW = table[i * 2], gradeY = table[i * 2 + 1] * amp
            surf[i] = raw + blendW * (gradeY - raw)
            if (Math.abs(surf[i] - raw) > worstAbs) worstAbs = Math.abs(surf[i] - raw)
        }
        // Whole-surface 2nd difference + spike count (rows + cols).
        const sd = (a, b, c) => Math.abs(surf[a] - 2 * surf[b] + surf[c])
        for (let zi = 0; zi < N; zi++) for (let xi = 1; xi < N - 1; xi++) {
            const d = sd(zi * N + xi - 1, zi * N + xi, zi * N + xi + 1); totalV++
            if (d > SPIKE) spikeCount++
            if (d > worstSD) { worstSD = d; worstSDat = `chunk ${ck} (${xi},${zi})r` }
        }
        for (let xi = 0; xi < N; xi++) for (let zi = 1; zi < N - 1; zi++) {
            const d = sd((zi - 1) * N + xi, zi * N + xi, (zi + 1) * N + xi); totalV++
            if (d > SPIKE) spikeCount++
            if (d > worstSD) { worstSD = d; worstSDat = `chunk ${ck} (${xi},${zi})c` }
        }
        // Mesh-vs-physics agreement, subsampled (every 4th vertex — analyticHeight is a tile scan).
        for (let zi = 0; zi < N; zi += 4) for (let xi = 0; xi < N; xi += 4) {
            const wx = cx * CS + xi, wz = cz * CS + zi
            const physY = terr.analyticHeight(wx, wz)
            const d = Math.abs(surf[zi * N + xi] - physY)
            agreeSamples++
            if (d > worstAgree) worstAgree = d
        }
    }

    const spikePct = 100 * spikeCount / totalV
    const ok = spikePct < SPIKE_PCT_TOL && worstSD < SECOND_DIFF_TOL
    log(ok, `MESH-SMOOTH seed=${seed}`,
        `${carvedChunks} carved chunks, ${totalV} edges; worst 2nd-diff ${worstSD.toFixed(1)} m @${worstSDat} ` +
        `(<${SECOND_DIFF_TOL}); spikes>${SPIKE}m: ${spikePct.toFixed(3)}% (<${SPIKE_PCT_TOL}%); worst carve dev ` +
        `${worstAbs.toFixed(1)} m; worst mesh↔phys ${worstAgree.toFixed(1)} m over ${agreeSamples} samples`)
}

console.log('\n' + '='.repeat(64))
console.log(`CARVE-MESH-SMOOTHNESS GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
