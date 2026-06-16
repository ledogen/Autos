/**
 * diag-minradius-pipeline.mjs — BUG-12 root-cause harness (headless, zero-install).
 *
 * VERIFIED FINDING (2026-06-16): the road centerline's post-hoc min-radius pass
 * (`filletMinRadius`, src/road-carve.js — iterative midpoint relaxation) FAILS to open
 * tight coils. A raw 180° hairpin (apex radius ~1.4 m) comes out at ~2 m even with a 15 m
 * target — nowhere near. A ~2 m-radius switchback apex with a ±5 m ribbon folds (BUG-12).
 * This is an OPEN-ROAD generation bug, independent of junctions.
 *
 * This harness is the spec for the fix (QUAL-03 / VBC-01..06): a valid-by-construction
 * generator must satisfy BOTH gates below. It is a DIAGNOSTIC (does not gate CI) — run with
 * `node test/diag-minradius-pipeline.mjs` and read the table. The morning fix iterates here
 * BEFORE touching the live pipeline, then wires the proven function into src/road.js.
 *
 * The two properties any fix MUST satisfy:
 *   (A) ENFORCE: every output corner has XZ turn radius >= minRadius (kills folds).
 *   (B) PRESERVE: curves already gentler than minRadius are NOT tightened — a naive
 *       pure-pursuit resampler FAILS (B): it dragged an R=40 m curve down to R=15 m
 *       (uniformly twitchy roads). The fix must modify ONLY tight spans, splicing into
 *       preserved geometry. See `pursue()` below — kept as a cautionary baseline.
 */

import { filletMinRadius, circumradiusXZ } from '../src/road-carve.js'

const HALF_WIDTH = 5      // roadHalfWidth — fold threshold is ~halfWidth
const MIN_RADIUS = 15     // roadMinTurnRadius (data/ranger.js)

// ── helpers ──────────────────────────────────────────────────────────────────
function densify(a, b, step) {
    const out = []
    const L = Math.hypot(b.x - a.x, b.z - a.z)
    const n = Math.max(1, Math.round(L / step))
    for (let i = 0; i < n; i++) { const t = i / n; out.push({ x: a.x + (b.x - a.x) * t, y: 0, z: a.z + (b.z - a.z) * t }) }
    return out
}
function minR(p) {
    let m = Infinity
    for (let i = 1; i < p.length - 1; i++) {
        const r = circumradiusXZ(p[i - 1].x, p[i - 1].z, p[i].x, p[i].z, p[i + 1].x, p[i + 1].z)
        if (r < m) m = r
    }
    return m
}

// Cautionary baseline — bounded-heading pursuit. Satisfies (A) but VIOLATES (B): it tightens
// gentle curves to the cap. Kept so the fix author sees the failure mode and avoids it.
function pursue(points, R, { step = 2, LA = R } = {}) {
    const s = [0]; for (let i = 1; i < points.length; i++) s.push(s[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z))
    const total = s[s.length - 1]
    const at = d => { if (d <= 0) return points[0]; if (d >= total) return points[points.length - 1]; let i = 1; while (s[i] < d) i++; const t = (d - s[i - 1]) / (s[i] - s[i - 1] || 1); return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * t, z: points[i - 1].z + (points[i].z - points[i - 1].z) * t } }
    let pos = { x: points[0].x, z: points[0].z }, hd = Math.atan2(points[1].z - points[0].z, points[1].x - points[0].x), d = 0
    const out = [{ x: pos.x, y: 0, z: pos.z }], maxSteps = Math.ceil(total / step) * 3 + 50
    for (let k = 0; k < maxSteps; k++) {
        d = Math.min(total, d + step); const tgt = at(d + LA)
        let dh = Math.atan2(tgt.z - pos.z, tgt.x - pos.x) - hd; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI
        const md = step / R; dh = Math.max(-md, Math.min(md, dh)); hd += dh
        pos = { x: pos.x + step * Math.cos(hd), z: pos.z + step * Math.sin(hd) }; out.push({ x: pos.x, y: 0, z: pos.z })
        if (d >= total && Math.hypot(pos.x - points[points.length - 1].x, pos.z - points[points.length - 1].z) < step * 1.5) break
    }
    return out
}

// ── fixtures ───────────────────────────────────────────────────────────────────
const H = [...densify({ x: -60, z: 0 }, { x: 0, z: 0 }, 2), ...densify({ x: 0, z: 0 }, { x: 0, z: 8 }, 2), ...densify({ x: 0, z: 8 }, { x: -60, z: 8 }, 2), { x: -60, y: 0, z: 8 }]
const C = [...densify({ x: -60, z: 0 }, { x: 0, z: 0 }, 2), ...densify({ x: 0, z: 0 }, { x: 0, z: 60 }, 2), { x: 0, y: 0, z: 60 }]
const G = []; for (let a = 0; a <= Math.PI / 2; a += 0.05) G.push({ x: 40 * Math.cos(a), y: 0, z: 40 * Math.sin(a) })  // gentle R=40
const fixtures = [['180-hairpin', H], ['90-corner', C], ['gentle-R40', G]]

console.log(`\nBUG-12 min-radius pipeline diagnostic — halfWidth=${HALF_WIDTH} m, minRadius target=${MIN_RADIUS} m`)
console.log('fold threshold ≈ halfWidth; (A) ENFORCE: out minR ≥ minRadius ; (B) PRESERVE: gentle stays gentle\n')
console.log('fixture        | in minR | filletMinRadius out | pursue out (cautionary)')
console.log('-'.repeat(78))
for (const [name, p] of fixtures) {
    const fil = minR(filletMinRadius(p, MIN_RADIUS))
    const pur = minR(pursue(p, MIN_RADIUS))
    const filV = fil < HALF_WIDTH ? `${fil.toFixed(2)} ✗ FOLDS` : `${fil.toFixed(2)}`
    console.log(`${name.padEnd(14)} | ${minR(p).toFixed(2).padStart(7)} | ${filV.padStart(19)} | ${pur.toFixed(2).padStart(8)}`)
}
console.log('\nCURRENT STATE: filletMinRadius leaves the hairpin folding (✗). The fix must make that')
console.log('column ≥ minRadius for hairpin/corner WHILE leaving gentle-R40 ≥ ~40 (pursue fails the latter).')
