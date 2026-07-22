// GATE (run-all): node test/road-tunnel.mjs
// FEAT-40 tunnels: the taut-string summit cut (applyTunnelPassInPlace at edge assembly) must
// (1) actually fire on seed 6's mountainous spawn region (run 0004's −27 % summit-plunge pathology
//     is the motivating case: the profile should bore through summits, not crest them),
// (2) keep every tunneled edge's profile driveable: |grade| along a bore ≤ tunnelMaxGrade + slack
//     and no vertical step (the chord is C0 with the profile at its touch points),
// (3) diverge physics from the terrain skin ONLY inside bore spans: a below-apex probe rides the
//     floor while the Y-less call returns the raw hill ≥ portalDepth overhead (mesh keeps the hill),
// (4) be window-invariant: the same edge streamed from two centers reports identical spans.

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { parseWorldSeed } from '../src/seed.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'

const CS = 64
const SEED = '6'
// Centers spanning the run-0004 mission region (start ~(2140,1682) → dump ~(1476,2585)).
const CENTERS = [[1808, 2133], [2140, 1682]]

function streamAt (cx, cz) {
  const ws = parseWorldSeed(SEED)
  const road = new RoadSystem(ws, P)
  road.ensureTile(Math.floor(cx / CS), Math.floor(cz / CS))
  const terr = makeTerrainHeadless(ws, P, road)
  road.update(new THREE.Vector3(cx, 0, cz))
  return { road, terr }
}

let fail = 0
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail++ }

const { road, terr } = streamAt(...CENTERS[0])

// ── (1) the pass fires in this region ──────────────────────────────────────────────────────────
const tunneled = []
for (const [runKey, e] of road._network) {
  if (e.tunnelSpans && e.tunnelSpans.length) tunneled.push([runKey, e])
}
const nSpans = tunneled.reduce((n, [, e]) => n + e.tunnelSpans.length, 0)
check(tunneled.length >= 1, `seed ${SEED} region has tunneled edges: ${tunneled.length} edges / ${nSpans} bores`)

// ── (2) tunneled profiles stay driveable ───────────────────────────────────────────────────────
const maxGrade = (P.tunnelMaxGrade ?? 0.12) + 0.02
let worstG = 0, worstStep = 0
for (const [, e] of tunneled) {
  const pts = e.points, cum = e.polyCum
  for (let i = 1; i < pts.length; i++) {
    const ds = cum[i] - cum[i - 1]
    if (ds < 1e-6) continue
    const mid = (cum[i] + cum[i - 1]) / 2
    if (!e.tunnelSpans.some(s => mid >= s.s0 && mid <= s.s1)) continue
    const dy = Math.abs(pts[i].y - pts[i - 1].y)
    worstG = Math.max(worstG, dy / ds)
    worstStep = Math.max(worstStep, dy)
  }
}
check(worstG <= maxGrade, `bore grade ≤ ${(maxGrade * 100).toFixed(0)}%: worst ${(worstG * 100).toFixed(1)}%`)
check(worstStep <= 1.0, `no vertical step inside a bore: worst ${worstStep.toFixed(2)} m/sample`)

// ── (3) physics floor vs terrain skin diverge inside a bore, agree at the portals ──────────────
let sampled = 0, coverOK = 0, floorOK = 0
for (const [runKey, e] of tunneled) {
  for (const sp of e.tunnelSpans) {
    const s = (sp.s0 + sp.s1) / 2
    const c = road.runPointAt(runKey, s)
    if (!c) continue
    const floorY = road.runProfile(s, runKey).gradeY
    const skin  = terr.analyticHeight(c.x, c.z)                          // Y-less → raw hill
    const floor = terr.analyticHeight(c.x, c.z, undefined, floorY + 1)   // in-bore probe
    sampled++
    // Hill overhead: portalDepth of cover minus the deviation-cap slack the pass's proxy allows.
    if (skin - floor >= (P.tunnelPortalDepth ?? 4) - 2.5) coverOK++
    if (Math.abs(floor - (floorY + (P.roadClearanceMargin ?? 0.25))) < 1.5) floorOK++
  }
}
check(sampled > 0 && coverOK === sampled, `raw hill stays overhead mid-bore: ${coverOK}/${sampled}`)
check(floorOK === sampled, `in-bore probe rides the road floor: ${floorOK}/${sampled}`)

// ── (4) window invariance of the spans ─────────────────────────────────────────────────────────
const { road: road2 } = streamAt(...CENTERS[1])
let shared = 0, mismatched = 0
for (const [runKey, e] of tunneled) {
  const e2 = road2._network.get(runKey)
  if (!e2) continue
  shared++
  const a = JSON.stringify(e.tunnelSpans.map(s => [s.s0.toFixed(3), s.s1.toFixed(3)]))
  const b = JSON.stringify((e2.tunnelSpans ?? []).map(s => [s.s0.toFixed(3), s.s1.toFixed(3)]))
  if (a !== b) mismatched++
}
check(shared > 0 && mismatched === 0, `two-center span invariance: ${shared - mismatched}/${shared} shared tunneled edges identical`)

process.exit(fail ? 1 : 0)
