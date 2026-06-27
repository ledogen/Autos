// test/carve-surface-agreement.mjs — QUAL-07 carve unification gate.
//
// GUARDS "THE TRUCK FLOATS ABOVE THE DRAWN BANK ON A FILL." The terrain MESH carve
// (terrain.js _buildCarveTable) used to resolve "where is the road" per vertex by the EUCLIDEAN
// distance to the nearest discrete ~1.5 m spline sample (always ≥ the true perpendicular distance,
// and quantized), while physics (road.js _sampleCarveWorld) projects PERPENDICULARLY. On a curved
// fill embankment the mesh therefore ramped to terrain sooner/narrower than the collision surface →
// the collision apron sat higher/wider than the drawn bank and the truck floated above it.
//
// QUAL-07 unifies both onto ONE cross-section function (RoadSystem._carveCrossSection) resolved by the
// SAME continuous perpendicular projection. This gate proves it on real-noise fill AND cut banks:
//   (1) AGREEMENT — the mesh surface (continuous resolve → _carveCrossSection) == the physics surface
//                   (_sampleCarveWorld) within ε across the off-ribbon bank.
//   (2) TEETH     — the OLD Euclidean-discrete resolve disagrees with physics by ≥ the new one (the
//                   continuous resolve is never worse; on curves it is strictly better). So the gate
//                   would go RED if the mesh regressed to the discrete metric.
//   (3) NO STAIRCASE — the mesh bank has no per-cell vertical wall (bounded Δheight per lateral step).
//
// This drives the REAL RoadSystem (real _carveCrossSection + collectChunkSplinePoints); only the small
// nearest-sample→(signedLat,arcS) projection is replicated here, exactly as _buildCarveTable does it.
//
// Run: node test/carve-surface-agreement.mjs   (exit 0 = mesh == collision surface)

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const SEEDS = [6, 7]
const hw = RANGER_PARAMS.roadHalfWidth ?? 5
const sw = RANGER_PARAMS.roadShoulderWidth ?? 2.5
const carveHW = Math.min(hw + (RANGER_PARAMS.roadCarveExtraWidth ?? 3.0), RANGER_PARAMS.roadMinTurnRadius ?? 12)
const MESH_EXT = carveHW + sw
const DLAT = 0.25
// m — mesh continuous resolve must match physics within this off-ribbon. Real gaps are ≤0.01 m; set
// well below the Euclidean-discrete control gaps (~0.03–0.10 m) so a revert to that metric goes RED.
const THRESH_AGREE = 0.05
const STAIRCASE_TOL = 1.0   // m — max mesh Δheight per DLAT step (no vertical wall); slope ≤ ~4:1

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}

// Replicate _buildCarveTable's per-vertex resolve: nearest sample → point-to-SEGMENT projection onto
// its in-seg neighbours → continuous (signedLat, arcS). Returns the new (continuous) and old (Euclidean-
// discrete) lateral metrics so we can drive the shared _carveCrossSection both ways.
// `runKeys`/`targetRun` pin the nearest-sample search to ONE run (matching the physics nr0 pin), so
// the gate measures the carve CROSS-SECTION, not run-selection at parallel/stacked overlaps (a separate
// FEAT-10 defect — same reasoning road-fill-support.mjs uses).
function resolveMesh(samples, sampleArcS, sampleSegStart, runKeys, targetRun, wx, wz) {
    const STR = 5, n = sampleArcS.length
    let bestD2 = Infinity, bi = 0
    for (let si = 0; si < samples.length; si += STR) {
        if (runKeys[si / STR] !== targetRun) continue
        const dx = samples[si] - wx, dz = samples[si + 2] - wz
        const d2 = dx * dx + dz * dz
        if (d2 < bestD2) { bestD2 = d2; bi = si }
    }
    const biIdx = bi / STR
    // NEW: continuous perpendicular projection onto ≤2 in-seg adjacent segments.
    let bestPerp2 = Infinity, signedLatN = 0, arcSN = sampleArcS[biIdx]
    const proj = (aIdx, bIdx) => {
        const a = aIdx * STR, b = bIdx * STR
        const ax = samples[a], az = samples[a + 2]
        const ex = samples[b] - ax, ez = samples[b + 2] - az
        const segLen2 = ex * ex + ez * ez
        let t = segLen2 > 1e-12 ? ((wx - ax) * ex + (wz - az) * ez) / segLen2 : 0
        if (t < 0) t = 0; else if (t > 1) t = 1
        const fx = ax + t * ex, fz = az + t * ez
        const ddx = wx - fx, ddz = wz - fz
        const perp2 = ddx * ddx + ddz * ddz
        if (perp2 < bestPerp2) {
            const segLen = Math.sqrt(segLen2) || 1e-8
            bestPerp2 = perp2
            signedLatN = ddx * (ez / segLen) - ddz * (ex / segLen)
            arcSN = sampleArcS[aIdx] + t * (sampleArcS[bIdx] - sampleArcS[aIdx])
        }
    }
    if (biIdx - 1 >= 0 && sampleSegStart[biIdx] === 0) proj(biIdx - 1, biIdx)
    if (biIdx + 1 < n && sampleSegStart[biIdx + 1] === 0) proj(biIdx, biIdx + 1)
    // OLD: Euclidean nearest-discrete-sample distance + discrete arcS (the pre-QUAL-07 bug).
    const sdx = samples[bi] - wx, sdz = samples[bi + 2] - wz
    const signedLatDiscrete = (-sdx) * samples[bi + 4] - (-sdz) * samples[bi + 3]
    const latDistOld = Math.sqrt(bestD2)
    return {
        signedLatN, arcSN, runKey: undefined, biIdx,
        // Old lateral magnitude is the (larger, quantized) Euclidean distance; keep the sign.
        signedLatOld: (signedLatDiscrete >= 0 ? 1 : -1) * latDistOld,
        arcSOld: sampleArcS[biIdx],
    }
}

for (const seed of SEEDS) {
    const road = new RoadSystem(seed, RANGER_PARAMS)
    road.update(new THREE.Vector3(0, 0, 0))
    const terr = makeTerrainHeadless(seed, RANGER_PARAMS, road)

    // Strongest fill (road grade above terrain) and strongest cut (terrain above grade) spots, on a
    // locally STRAIGHT run section. Switchback/hairpin stations are excluded: there two arms of the run
    // overlap, the D3 cross-arm max-floor + interior-arm pick dominate, and run-selection (FEAT-10), not
    // the cross-section, drives the surface — outside QUAL-07's clean fill/cut-bank scope.
    let fill = null, cut = null
    for (const [runKey, entry] of road._network) {
        const pts = entry.points
        for (let i = 2; i < pts.length - 2; i += 3) {
            // Local straightness: heading of (i-1→i) vs (i→i+1) nearly aligned (dot > 0.985 ≈ <10°).
            const ax = pts[i].x - pts[i - 1].x, az = pts[i].z - pts[i - 1].z
            const bx = pts[i + 1].x - pts[i].x, bz = pts[i + 1].z - pts[i].z
            const la = Math.hypot(ax, az) || 1e-9, lb = Math.hypot(bx, bz) || 1e-9
            if ((ax * bx + az * bz) / (la * lb) < 0.985) continue   // curved → skip
            const d = pts[i].y - terr.rawHeightWorld(pts[i].x, pts[i].z)
            if (d > (fill?.d ?? 1.5)) fill = { d, x: pts[i].x, z: pts[i].z, runKey }
            if (-d > (cut?.d ?? 1.5)) cut = { d: -d, x: pts[i].x, z: pts[i].z, runKey }
        }
    }

    for (const [kind, spot] of [['FILL', fill], ['CUT', cut]]) {
        if (!spot) { log(true, `${kind}-AGREEMENT seed=${seed}`, `no ${kind.toLowerCase()} ≥1.5 m — skipped`); continue }
        const nr0 = road._resolveRoadSurface(spot.x, spot.z)
        if (!nr0) { log(true, `${kind}-AGREEMENT seed=${seed}`, 'no run resolved — skipped'); continue }
        const tx = nr0.tangent.x, tz = nr0.tangent.z, fx = nr0.point.x, fz = nr0.point.z
        const R = MESH_EXT + 64
        const sp = road.collectChunkSplinePoints(fx, fz, R)
        const netEntry = road._network.get(nr0.runKey)

        let worstNew = 0, worstOld = 0, worstStair = 0, prevMesh = null
        for (let lat = hw + 0.3; lat <= MESH_EXT; lat += DLAT) {
            const wx = fx + tz * lat, wz = fz - tx * lat   // march off-ribbon to one side
            const raw = terr.rawHeightWorld(wx, wz)

            // Physics surface: project onto nr0's RUN at the TRUE nearest point (continuous arc — not a
            // fixed station, which would mismatch the mesh's true-arc on curves), then the real
            // _sampleCarveWorld. Pins the run (no overlap run-jump) without pinning the station.
            const pr = road._projectOntoRun(netEntry, wx, wz)
            const hint = {
                point: new THREE.Vector3(pr.fx, road.runProfile(pr.arcS, nr0.runKey).gradeY, pr.fz),
                tangent: new THREE.Vector3(pr.tx, 0, pr.tz),
                runKey: nr0.runKey, arcS: pr.arcS, camberSign: 1,
            }
            const cP = road._sampleCarveWorld(wx, wz, raw, hint)
            const physY = (cP && cP.blendW > 1e-6) ? raw + cP.blendW * (cP.gradeY - raw) : raw

            // Mesh surface: continuous resolve (pinned to nr0's run) → the SAME _carveCrossSection.
            const m = resolveMesh(sp.pts, sp.sampleArcS, sp.sampleSegStart, sp.sampleRunKeys, nr0.runKey, wx, wz)
            const rk = sp.sampleRunKeys[m.biIdx], cs = sp.sampleCamberSign ? sp.sampleCamberSign[m.biIdx] : 1
            const csN = road._carveCrossSection(m.signedLatN, m.arcSN, rk, cs, raw)
            const meshY = (csN && csN.blendW > 1e-6) ? raw + csN.blendW * (csN.gradeY - raw) : raw

            // Control: the OLD Euclidean-discrete lateral fed to the same fn (the pre-QUAL-07 metric).
            const csO = road._carveCrossSection(m.signedLatOld, m.arcSOld, rk, cs, raw)
            const oldY = (csO && csO.blendW > 1e-6) ? raw + csO.blendW * (csO.gradeY - raw) : raw

            worstNew = Math.max(worstNew, Math.abs(meshY - physY))
            worstOld = Math.max(worstOld, Math.abs(oldY - physY))
            if (prevMesh !== null) worstStair = Math.max(worstStair, Math.abs(meshY - prevMesh))
            prevMesh = meshY
        }

        const agreeOk = worstNew < THRESH_AGREE
        const teethOk = worstNew <= worstOld + 1e-6           // continuous is never worse than discrete
        const stairOk = worstStair < STAIRCASE_TOL
        log(agreeOk && teethOk && stairOk, `${kind}-AGREEMENT seed=${seed}`,
            `${kind} ${spot.d.toFixed(1)} m @(${spot.x.toFixed(0)},${spot.z.toFixed(0)}); mesh↔collision gap ` +
            `${worstNew.toFixed(3)} m (<${THRESH_AGREE}); old-discrete gap ${worstOld.toFixed(3)} m ` +
            `(new ≤ old: ${teethOk}); worst mesh step ${worstStair.toFixed(3)} m (<${STAIRCASE_TOL})`)
    }
}

console.log('\n' + '='.repeat(64))
console.log(`CARVE-SURFACE-AGREEMENT GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
