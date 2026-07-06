// src/road-worker.js — QUAL-08: dedicated road-network routing Worker (BUG-26 long-term fix).
//
// A SECOND Blob classic worker, separate from the terrain heightfield worker. It is a PURE ROUTE-JOB
// SERVER: given route jobs {key, ax, az, bx, bz, opts} it runs arcPrimitiveConnect and posts back the
// arc-primitive descriptors. It holds no network — only the seeded COARSE noise closure the router
// samples. Moving routing off the terrain worker is the real BUG-26 cure: terrain 'generate' can no
// longer be starved by a flood of route jobs in a shared FIFO.
//
// TWO CONSUMERS, ONE CONTRACT (both are RoadSystem instances):
//   - the play network (main.js) — client 'play'
//   - the Map2D read-only network (map2d.js) — client 'map'
// The 'client' tag rides the envelope both ways so RoadRouteWorker.onmessage forwards each reply to the
// right instance's ingestRoutedConnections (which rejects stale epochs PER INSTANCE).
//
// SYNC: the ROUTE SYNC region below is the verbatim mirror of src/road-carve.js — test/route-worker-sync.mjs
// enforces byte-equality. Edit the canonical ROUTE SYNC region in road-carve.js and regenerate this file
// (scratchpad gen-road-worker.mjs) in the same commit. The seed helpers (src/seed.js) and coarseHeight
// (src/terrain.js) copies follow the same SYNC RULE as the terrain worker's copies. This file is NOT a
// module for the worker context — the string below is; the class at the bottom IS a module export.

const ROAD_WORKER_SOURCE = `
// Classic Blob worker source for the road-network router (embedded as ROAD_WORKER_SOURCE in src/road-worker.js).
// Responsibilities:
//  - {type:'init', worldSeed, params} — build the seeded COARSE noise closure the router samples
//  - {type:'route', client, jobs, epoch} — run arcPrimitiveConnect per job, post {routed, client, epoch, results}
// NOT an ES6 module (Blob classic worker) — no import/export.

// ── Seed utilities (copied verbatim from src/seed.js — no export keyword) ──
// SYNC: keep byte-identical with seed.js function bodies (no export).

function djb2(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0
  }
  return h >>> 0
}

function parseWorldSeed(input) {
  if (typeof input === 'number') return (input | 0) >>> 0
  const s = String(input)
  if (/^-?\d+$/.test(s)) return (parseInt(s, 10) | 0) >>> 0
  return djb2(s)
}

function seedFor(worldSeed, domainTag, ...coords) {
  let h = djb2(domainTag)
  h = (Math.imul(h ^ (worldSeed >>> 0), 0x9e3779b9) >>> 0)
  for (const coord of coords) {
    h = (Math.imul(h ^ ((coord | 0) >>> 0), 0x85ebca6b) >>> 0)
  }
  return h >>> 0
}

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Minimal simplex-noise@4.0.3 subset (2D only) ──────────────────────────

const SQRT3 = Math.sqrt(3.0);
const F2 = 0.5 * (SQRT3 - 1.0);
const G2 = (3.0 - SQRT3) / 6.0;

const fastFloor = (x) => Math.floor(x) | 0;

const grad2 = new Float64Array([
    1, 1, -1, 1,  1, -1, -1, -1,
    1, 0, -1,  0,  1,  0, -1,  0,
    0, 1,  0, -1,  0,  1,  0, -1
]);

function buildPermutationTable(random) {
    const tableSize = 512;
    const p = new Uint8Array(tableSize);
    for (let i = 0; i < tableSize / 2; i++) {
        p[i] = i;
    }
    for (let i = 0; i < tableSize / 2 - 1; i++) {
        const r = i + ~~(random() * (256 - i));
        const aux = p[i];
        p[i] = p[r];
        p[r] = aux;
    }
    for (let i = 256; i < tableSize; i++) {
        p[i] = p[i - 256];
    }
    return p;
}

function createNoise2D(random) {
    if (random === undefined) random = Math.random;
    const perm = buildPermutationTable(random);
    const permGrad2x = new Float64Array(perm).map(function(v) { return grad2[(v % 12) * 2]; });
    const permGrad2y = new Float64Array(perm).map(function(v) { return grad2[(v % 12) * 2 + 1]; });

    return function noise2D(x, y) {
        let n0 = 0;
        let n1 = 0;
        let n2 = 0;
        const s = (x + y) * F2;
        const i = fastFloor(x + s);
        const j = fastFloor(y + s);
        const t = (i + j) * G2;
        const X0 = i - t;
        const Y0 = j - t;
        const x0 = x - X0;
        const y0 = y - Y0;
        let i1, j1;
        if (x0 > y0) { i1 = 1; j1 = 0; }
        else          { i1 = 0; j1 = 1; }
        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1.0 + 2.0 * G2;
        const y2 = y0 - 1.0 + 2.0 * G2;
        const ii = i & 255;
        const jj = j & 255;
        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 >= 0) {
            const gi0 = ii + perm[jj];
            t0 *= t0;
            n0 = t0 * t0 * (permGrad2x[gi0] * x0 + permGrad2y[gi0] * y0);
        }
        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 >= 0) {
            const gi1 = ii + i1 + perm[jj + j1];
            t1 *= t1;
            n1 = t1 * t1 * (permGrad2x[gi1] * x1 + permGrad2y[gi1] * y1);
        }
        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 >= 0) {
            const gi2 = ii + 1 + perm[jj + 1];
            t2 *= t2;
            n2 = t2 * t2 * (permGrad2x[gi2] * x2 + permGrad2y[gi2] * y2);
        }
        return 70.0 * (n0 + n1 + n2);
    };
}

// ── Coarse height (routing height field — SYNC with src/terrain.js coarseHeight) ──
function coarseHeight(wx, wz, noiseCoarse, params) {
    const { coarseAmplitude, coarseFreq, coarseOctaves, ridgeSharpness } = params
    let h = 0
    let freq = coarseFreq
    let amp  = coarseAmplitude
    const gain = 0.5
    const lacunarity = 2.0
    for (let o = 0; o < coarseOctaves; o++) {
        const n = noiseCoarse(wx * freq, wz * freq)
        const ridged = 1.0 - Math.abs(n)
        const shaped = Math.pow(ridged, ridgeSharpness)
        h += shaped * amp
        freq *= lacunarity
        amp  *= gain
    }
    return h
}

// ── Router worker state ──────────────────────────────────────────────────────
// Only the coarse noise closure is needed (arcPrimitiveConnect samples coarse height).
let noiseCoarse
let _workerParams = null

// ── arcPrimitiveConnect search scratch (module-scope, reused + generation-stamped) ──────────────
// The cold network stream routes ~80 connections at once (spawn lag). Per-call Map/Set/object-per-node
// allocation + hashing + GC dominated that. These typed arrays are indexed by state id and allocated
// ONCE (grown as needed), reused across every call. A per-call generation stamp (_apcGen) marks which
// entries are live this call, so we never memset the (large) arrays between calls.
let _apcCap = 0
let _apcG, _apcGStamp, _apcClosed, _apcX, _apcZ, _apcTh, _apcSh, _apcRf, _apcKi, _apcParent
let _apcLen, _apcMx, _apcMz   // QUAL-14 perf: cumulative arc length + entering-primitive midpoint per state (self-proximity walk)
let _apcGen = 0
const _apcHPri = [], _apcHSt = []   // heap as parallel arrays (reset length each call; no per-node alloc)
const _scNX = [], _scNZ = [], _scNS = []   // per-expansion nearby-ancestor scratch (self-clearance prefilter)
function _apcEnsure(n) {
    if (n <= _apcCap) return
    _apcCap = n
    _apcG = new Float64Array(n); _apcGStamp = new Uint32Array(n); _apcClosed = new Uint32Array(n)
    _apcX = new Float64Array(n); _apcZ = new Float64Array(n); _apcTh = new Float64Array(n)
    _apcSh = new Float64Array(n); _apcRf = new Float64Array(n); _apcKi = new Int8Array(n); _apcParent = new Int32Array(n)
    _apcLen = new Float64Array(n); _apcMx = new Float64Array(n); _apcMz = new Float64Array(n)
}

// ── QUAL-14 self-clearance (route may not graze/cross ITSELF) ───────────────────────────────────
// The hybrid-A* state is (cell, heading-bin) — it has no memory of its own path, so a route
// crossing or hugging itself (lollipop loop, pigtail hairpin, legs sharing a carve wall) is free.
// PRIMARY enforcement is IN-SEARCH (QUAL-14 perf phase): expansion rejects a primitive whose
// endpoint/midpoint lands within selfClearDist of the candidate's OWN ancestor chain more than
// selfClearGap back along the path (see the selfHit block inside arcPrimitiveConnect) — pigtails
// become illegal moves and the topology re-forms in the SAME pass. The wrapper below is the thin
// BACKSTOP for what the ancestor walk cannot see: violations the refit passes introduce (shortcut/
// terminal are not ancestor-checked) and mid-arc grazes finer than its half-primitive sampling.
// Backstop = ITERATIVE NO-GO REPAIR riding the existing pondDiscs hard-rejection: drop a small
// no-go disc on each (clustered) violation midpoint and re-route (same philosophy as the pond
// route-around: hard-forbid the artifact site, never inject geometry). Repeat until clean or
// SELF_CLEAR_MAX_REPAIR, accepting the fewest-violations attempt if never clean (never fail to
// emit a road). Deterministic pure fn of the edge + opts → cache/window-invariant. History: a
// wCurv/maxGrade retry ladder was whack-a-mole; repair-only converged (1–13 iterations) but each
// iteration is a FULL re-search — a few mountain edges paying ≤16×2 searches were ~80% of the
// 26 s cold load. In-search prevention deletes that multiplier: clean edges (the vast majority)
// never enter this loop, so the cap only prices the rare corridor-congested edge (measured seed 6:
// one edge, ≤9 iterations to clean). Do NOT lower the cap below ~10 — a cap-4 experiment shipped
// fewest-violations chains and flipped GRAPH-SELF-CLEARANCE red.
const SELF_CLEAR_MAX_REPAIR = 16  // backstop re-route attempts before accepting fewest-violations
const SELF_CLEAR_DS = 4           // m — chain sampling spacing for the clearance check
const SELF_CLEAR_DISC_R = 0.6    // × selfClearDist — repair no-go disc radius

// Scan an emitted primitive chain for clearance violations: pairs of samples with arc-separation
// > gap that lie closer than D in XZ. Samples the descriptors (const-κ arcs AND refit clothoids)
// at SELF_CLEAR_DS; spatial hash with cell = D compares only the 3×3 neighbourhood, and only
// against EARLIER samples (each pair counted once) → O(n). Returns { v, mids }: the violation
// count and the violation midpoints clustered to one per D-sized cell (the repair disc sites) —
// each cluster is the CENTROID of its cell's midpoints, so the disc site is independent of the
// pair visit order. Pure.
function _selfClearScan(prims, D, gap) {
    if (!prims || prims.length === 0) return { v: 0, mids: [] }
    const xs = [], zs = [], ss = []
    let s0 = 0
    for (const p of prims) {
        const n = Math.max(1, Math.ceil(p.length / SELF_CLEAR_DS))
        if (Math.abs(p.kappa1 - p.kappa0) < 1e-9) {
            const k = p.kappa0
            for (let j = 1; j <= n; j++) {
                const t = p.length * j / n
                if (Math.abs(k) < 1e-12) { xs.push(p.x0 + t * Math.cos(p.theta0)); zs.push(p.z0 + t * Math.sin(p.theta0)) }
                else { const th2 = p.theta0 + k * t; xs.push(p.x0 + (Math.sin(th2) - Math.sin(p.theta0)) / k); zs.push(p.z0 - (Math.cos(th2) - Math.cos(p.theta0)) / k) }
                ss.push(s0 + t)
            }
        } else {
            // Clothoid: same 0.5·(cos+cos) trapezoid pose integration as the refit validator.
            const hstep = p.length / n, dk = (p.kappa1 - p.kappa0) / p.length
            let x = p.x0, z = p.z0
            let cP = Math.cos(p.theta0), sP = Math.sin(p.theta0)
            for (let q = 1; q <= n; q++) {
                const s = q * hstep
                const t2 = p.theta0 + p.kappa0 * s + 0.5 * dk * s * s
                const c = Math.cos(t2), sn = Math.sin(t2)
                x += 0.5 * (cP + c) * hstep
                z += 0.5 * (sP + sn) * hstep
                cP = c; sP = sn
                xs.push(x); zs.push(z); ss.push(s0 + s)
            }
        }
        s0 += p.length
    }
    const inv = 1 / D, D2 = D * D
    const grid = new Map()
    let viol = 0
    const mids = new Map()   // violation midpoints, clustered one per D-sized cell
    for (let i = 0; i < xs.length; i++) {
        const cx = Math.floor(xs[i] * inv), cz = Math.floor(zs[i] * inv)
        for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
            const bucket = grid.get((cx + ox) * 73856093 ^ (cz + oz) * 19349663)
            if (!bucket) continue
            for (const j of bucket) {
                if (ss[i] - ss[j] <= gap) continue   // same stretch of road (ss is monotone: i > j)
                const dx = xs[i] - xs[j], dz = zs[i] - zs[j]
                if (dx * dx + dz * dz < D2) {
                    viol++
                    const mx = (xs[i] + xs[j]) * 0.5, mz = (zs[i] + zs[j]) * 0.5
                    const mk = Math.round(mx * inv) * 73856093 ^ Math.round(mz * inv) * 19349663
                    const acc = mids.get(mk)
                    if (acc) { acc[0] += mx; acc[1] += mz; acc[2]++ }
                    else mids.set(mk, [mx, mz, 1])
                }
            }
        }
        const hk = cx * 73856093 ^ cz * 19349663
        const bucket = grid.get(hk)
        if (bucket) bucket.push(i); else grid.set(hk, [i])
    }
    const out = []
    for (const acc of mids.values()) out.push([acc[0] / acc[2], acc[1] / acc[2]])
    return { v: viol, mids: out }
}

// ── Dubins shortest path (BUG-12 terminal connector) ───────────────────────────────────────────
// Returns dense [x,z] points (excluding the start, including the exact goal) from pose (x0,z0,th0)
// to pose (x1,z1,th1) using arcs of radius \`rho\` (left/right) and straights — so curvature is
// piecewise-constant and EVERYWHERE ≥ rho. Used to terminate an arc-router segment exactly at the
// canonical anchor pose: unlike a cubic Hermite (whose curvature spikes for large heading changes),
// this rounds even a switchback-apex turn into a valid-radius hairpin (≥ rho), never a fold. Pure.
const _DUBmod = (x) => { const t = x % (Math.PI * 2); return t < 0 ? t + Math.PI * 2 : t }

// Shortest Dubins word from pose (x0,z0,th0) to (x1,z1,th1) at radius rho. Returns the chosen
// { len, segs:[[kSign,lenR],...] } (segs in rho units; kSign: +1 left, −1 right, 0 straight) or null.
// Shared by dubinsPath (dense points) and dubinsPrimitives (typed primitives) so the geometry agrees.
function _dubinsBest(x0, z0, th0, x1, z1, th1, rho) {
    const dx = x1 - x0, dz = z1 - z0
    const D = Math.hypot(dx, dz)
    const d = D / rho
    const theta = _DUBmod(Math.atan2(dz, dx))
    const a = _DUBmod(th0 - theta), b = _DUBmod(th1 - theta)
    const sa = Math.sin(a), ca = Math.cos(a), sb = Math.sin(b), cb = Math.cos(b), cab = Math.cos(a - b)
    const words = []
    // LSL
    { const p2 = 2 + d * d - 2 * cab + 2 * d * (sa - sb)
      if (p2 >= 0) { const tmp = d + sa - sb, t = _DUBmod(-a + Math.atan2(cb - ca, tmp)), p = Math.sqrt(p2), q = _DUBmod(b - Math.atan2(cb - ca, tmp)); words.push({ len: t + p + q, segs: [[1, t], [0, p], [1, q]] }) } }
    // RSR
    { const p2 = 2 + d * d - 2 * cab + 2 * d * (sb - sa)
      if (p2 >= 0) { const tmp = d - sa + sb, t = _DUBmod(a - Math.atan2(ca - cb, tmp)), p = Math.sqrt(p2), q = _DUBmod(-b + Math.atan2(ca - cb, tmp)); words.push({ len: t + p + q, segs: [[-1, t], [0, p], [-1, q]] }) } }
    // LSR
    { const p2 = -2 + d * d + 2 * cab + 2 * d * (sa + sb)
      if (p2 >= 0) { const p = Math.sqrt(p2), tmp = Math.atan2(-ca - cb, d + sa + sb) - Math.atan2(-2, p), t = _DUBmod(-a + tmp), q = _DUBmod(-b + tmp); words.push({ len: t + p + q, segs: [[1, t], [0, p], [-1, q]] }) } }
    // RSL
    { const p2 = -2 + d * d + 2 * cab - 2 * d * (sa + sb)
      if (p2 >= 0) { const p = Math.sqrt(p2), tmp = Math.atan2(ca + cb, d - sa - sb) - Math.atan2(2, p), t = _DUBmod(a - tmp), q = _DUBmod(b - tmp); words.push({ len: t + p + q, segs: [[-1, t], [0, p], [1, q]] }) } }
    // RLR
    { const tmp = (6 - d * d + 2 * cab + 2 * d * (sa - sb)) / 8
      if (Math.abs(tmp) <= 1) { const p = _DUBmod(2 * Math.PI - Math.acos(tmp)), t = _DUBmod(a - Math.atan2(ca - cb, d - sa + sb) + p / 2), q = _DUBmod(a - b - t + p); words.push({ len: t + p + q, segs: [[-1, t], [1, p], [-1, q]] }) } }
    // LRL
    { const tmp = (6 - d * d + 2 * cab + 2 * d * (sb - sa)) / 8
      if (Math.abs(tmp) <= 1) { const p = _DUBmod(2 * Math.PI - Math.acos(tmp)), t = _DUBmod(-a + Math.atan2(-ca + cb, d + sa - sb) + p / 2), q = _DUBmod(b - a - t + p); words.push({ len: t + p + q, segs: [[1, t], [-1, p], [1, q]] }) } }
    if (!words.length) return null
    let best = words[0]; for (const w of words) if (w.len < best.len) best = w
    return best
}

// Dense [x,z] points (excluding start, including exact goal) for the shortest Dubins path. Pure.
function dubinsPath(x0, z0, th0, x1, z1, th1, rho, ds) {
    const best = _dubinsBest(x0, z0, th0, x1, z1, th1, rho)
    if (!best) return null
    const out = []
    let x = x0, z = z0, th = th0
    for (const [kSign, lenR] of best.segs) {
        const L = lenR * rho
        if (L < 1e-9) continue
        const k = kSign / rho
        const n = Math.max(1, Math.ceil(L / ds))
        for (let i = 1; i <= n; i++) {
            const s = L * i / n
            if (kSign === 0) { out.push([x + s * Math.cos(th), z + s * Math.sin(th)]) }
            else { const th2 = th + k * s; out.push([x + (Math.sin(th2) - Math.sin(th)) / k, z - (Math.cos(th2) - Math.cos(th)) / k]) }
        }
        if (kSign === 0) { x += L * Math.cos(th); z += L * Math.sin(th) }
        else { const th2 = th + k * L; x += (Math.sin(th2) - Math.sin(th)) / k; z -= (Math.cos(th2) - Math.cos(th)) / k; th = th2 }
    }
    return out
}

// Typed primitive descriptors {x0,z0,theta0,length,kappa0,kappa1} for the shortest Dubins path —
// the exact same arcs/straights as dubinsPath, carried as primitives (curvature ≥ 1/rho by
// construction) instead of flattened points. Used by arcPrimitiveConnect's primitive terminal.
// Plain descriptors (no Centerline import) keep road-carve dependency-free for the CARVE-SYNC copy.
function dubinsPrimitives(x0, z0, th0, x1, z1, th1, rho) {
    const best = _dubinsBest(x0, z0, th0, x1, z1, th1, rho)
    if (!best) return null
    const prims = []
    let x = x0, z = z0, th = th0
    for (const [kSign, lenR] of best.segs) {
        const L = lenR * rho
        if (L < 1e-9) continue
        const k = kSign === 0 ? 0 : kSign / rho
        prims.push({ x0: x, z0: z, theta0: th, length: L, kappa0: k, kappa1: k })
        if (kSign === 0) { x += L * Math.cos(th); z += L * Math.sin(th) }
        else { const th2 = th + k * L; x += (Math.sin(th2) - Math.sin(th)) / k; z -= (Math.cos(th2) - Math.cos(th)) / k; th = th2 }
    }
    return prims
}

/**
 * arcPrimitiveConnect — hybrid-A* router between two anchors using ARC MOTION PRIMITIVES.
 *
 * Replaces the 8-grid cell A* whose 45°-per-cell turns produced sub-floor corners that the
 * post-hoc fillet/cleanup stack could not repair (folds). Here every search expansion is a
 * fixed-length ARC at a curvature in {0 (straight), ±1/gentleR, ±1/hardR}. Because the hardest
 * primitive has radius hardR and consecutive primitives are G1-continuous (each starts at the
 * previous arc's end heading), the emitted centerline is min-turn-radius-VALID BY CONSTRUCTION:
 * dense XZ radius ≥ hardR everywhere except short endpoint stubs. No fillet/relaxation needed.
 *
 * State = (position-cell, heading-bin). Cost mirrors _protoEdgeCost semantics:
 *   wDist·L + wGrade·grade² + wOver·max(0,grade−maxGrade) + wAlt·height + wCurv·κ²·L
 * The wCurv·κ²·L term (curvature SQUARED — QUAL-05) makes the straight primitive (κ=0) cheapest and,
 * integrated over a turn, costs wCurv·Δθ/R → a TIGHTER radius costs MORE for the same heading change,
 * so the router prefers gentle sweeps and only spends a tight radius where the grade terms make it
 * worth it (terrain-driven). Long near-straights on
 * gentle ground; the grade terms make tight switchbacks worth their curvature cost up a steep
 * pass → variety is TERRAIN-DRIVEN and deterministic (no Math.random). Heuristic = wDist·‖·→b‖.
 *
 * Pure/deterministic (D-16): lattice search, stable heap tie-break, no random/Date/session state.
 * Window-invariant by construction when called per anchor-pair (independent of stream center).
 * NOT part of CARVE SYNC — main-thread centerline geometry only.
 *
 * @param {number} ax @param {number} az — start anchor (XZ)
 * @param {number} bx @param {number} bz — goal anchor (XZ)
 * @param {(x:number,z:number)=>number} heightFn — terrain height sampler (coarseHeight)
 * @param {object} [opts] — hardR, gentleR, stepLen, hbins, cell, margin, emitDs, maxNodes + cost weights
 * @returns {Array<{x:number,y:number,z:number}>} dense valid-radius centerline from a to b (y = heightFn)
 */
function arcPrimitiveConnect(ax, az, bx, bz, heightFn, opts = {}) {
    // ── QUAL-14 self-clearance repair loop (wrapper; the single-attempt search starts below) ──
    // Contract: on the FINAL emitted chain (post-refit, incl. the Dubins tail), no two centerline
    // samples with arc-separation > selfClearGap may lie closer than selfClearDist in XZ — a route
    // may not cross itself or run its own legs closer than the carve footprint. Violations drop
    // no-go discs on the violation sites and re-route (see the SELF_CLEAR_MAX_REPAIR header).
    // opts.selfClearDist undefined/0 → wrapper inert (bare router byte-identical —
    // arc-router.mjs). Primitive emission only: the dense-point legacy path has no game consumers
    // that carve.
    if (opts.emitPrimitives && (opts.selfClearDist ?? 0) > 0 && !opts._scPass) {
        const D = opts.selfClearDist, gap = opts.selfClearGap ?? 80
        const run = (discs) => arcPrimitiveConnect(ax, az, bx, bz, heightFn,
            Object.assign({}, opts, { _scPass: true }, discs ? { pondDiscs: discs } : null))
        const discs = (opts.pondDiscs && opts.pondDiscs.length) ? opts.pondDiscs.slice() : []
        let best = null, bestV = Infinity
        for (let it = 0; it < SELF_CLEAR_MAX_REPAIR; it++) {
            const cand = run(it === 0 ? null : discs)
            const { v, mids } = _selfClearScan(cand, D, gap)
            if (v < bestV) { best = cand; bestV = v }
            if (v === 0) break
            // Escalating disc radius: if the search keeps re-threading near earlier repair sites
            // (thrash), later discs blockade a wider area and force a genuinely different topology.
            // Steeper than the pre-prevention 0.25/it: with only 4 backstop attempts each one must
            // move the topology decisively.
            const rr = D * SELF_CLEAR_DISC_R * (1 + 0.5 * it)
            for (const m of mids) discs.push(m[0], m[1], rr)
        }
        return best
    }
    const hardR    = opts.hardR    ?? 8       // m — tightest turn (hardest primitive); ≥ geometric floor
    const gentleR  = opts.gentleR  ?? 30      // m — gentle turn radius (fallback palette member)
    const stepLen  = opts.stepLen  ?? 8       // m — STRAIGHT primitive length (turn primitives are fixed-ANGLE; see below)
    const hbins    = opts.hbins    ?? 24      // heading discretization — fewer states = faster cold route
    const cell     = opts.cell     ?? 8       // m — position lattice cell
    const margin   = opts.margin   ?? 200     // m — detour room around the a–b bbox (wrap a peak)
    const emitDs   = opts.emitDs   ?? 4       // m — arc emission spacing (≥ this keeps 3-pt circumradius on the floor circle; finer just multiplies downstream slice/ribbon/carve cost)
    const maxNodes = opts.maxNodes ?? 200000  // expansion cap (never hang)
    // ── FIXED-ANGLE motion primitives (QUAL-05 follow-up: large sweeping radii) ──────────────────────
    // Each TURN primitive turns a FIXED angle \`turnAngle\` at radius R, so its arc length = R·turnAngle
    // (large R → long gentle arc, small R → short tight arc) — and every turn lands exactly one heading
    // step away, so even a 200 m sweep is representable in the lattice (a fixed-LENGTH step at 200 m would
    // turn <1° and be invisible). \`radii\` (largest→smallest) is the curvature palette; the router prefers
    // the largest radius that fits the heading change + grade, giving sweeping turns on mild ground and
    // tight switchbacks only where grade forces them. gradeSamples>1 samples grade ALONG the (long) arc
    // so the search isn't blind to intra-arc steepness. Falls back to the old [gentleR,hardR] behaviour.
    const radii        = opts.radii        ?? [gentleR, hardR]
    const turnAngle    = opts.turnAngle    ?? (2 * Math.PI / hbins)   // one heading bin per turn primitive
    const gradeSamples = opts.gradeSamples ?? 1
    const wDist    = opts.wDist    ?? 1
    const wAlt     = opts.wAlt     ?? 0.85
    const wGrade   = opts.wGrade   ?? 400
    const wOver    = opts.wOver    ?? 8000
    const maxGrade = opts.maxGrade ?? 0.15
    const wCurv    = opts.wCurv    ?? 120      // QUAL-05: curvature penalty weight; cost = wCurv·κ²·L (squared → tighter radius costs more). Bare fallback only; the game passes roadWTurn (8000).
    const wHeur    = opts.wHeur    ?? 1.5       // weighted-A* heuristic inflation (>1 = greedier, far
                                               // fewer node expansions → faster streaming; paths stay near-optimal)
    // FEAT-10 earthwork routing. earthworkWindow>0 switches the grade/altitude cost from RAW terrain to a
    // spatially LOW-PASSED terrain (box-blur radius ~earthworkWindow) — the design grade line the carve
    // smooths to — so the router stops spiralling to follow bumps it will fill/cut anyway, and adds a
    // per-metre wDev·|lowpass − raw| EARTHWORK penalty so a path through rough ground (lots of fill/cut)
    // costs more than one through smooth ground. The three weighted levers the design calls for then are:
    // wCurv (tight turns), wOver (grade violation, now of the SMOOTH grade), wDev (deviation/earthwork).
    const earthworkWindow = opts.earthworkWindow ?? 0
    const wDev            = opts.wDev            ?? 0
    const deviationCap    = opts.deviationCap    ?? Infinity   // m — max |design − terrain| the carve will build
    const gradeWindow     = opts.gradeWindow     ?? 50         // m — narrow reference blur for the cap clamp (must match the builder's designGradeWindow)
    const earthwork       = earthworkWindow > 1e-6 && wDev > 0
    // BUG-12: canonical join headings. The segment STARTS along startHeading (so its DEPARTURE from
    // the anchor is the canonical heading) and, when goalHeading is set, its ARRIVAL is blended into
    // the canonical heading over the last \`goalBlend\` metres (terminal Hermite below). Two segments
    // sharing an anchor each target the SAME canonical H there → they meet G1, no sharp corner. The
    // search itself runs FREE (undistorted, valley-true); only the start heading + terminal blend are
    // canonical. undefined → legacy straight-to-goal, no blend (byte-identical to pre-BUG-12).
    const startHeading = opts.startHeading
    const goalHeading  = opts.goalHeading
    const goalBlend    = opts.goalBlend ?? 20   // m — distance over which the arrival is blended into goalHeading
    // FEAT-17: pond route-around. opts.pondDiscs = flat [cx, cz, r, ...] no-go discs (pond + skirt,
    // world XZ) attached to the route spec by road.js as pure DATA — never code — so the Worker mirror
    // and the synchronous fallback read the SAME array and pre-warmed routes stay byte-identical to
    // the fallback. Rejection must be HARD (not a cost): ponds sit at valley floors — the wAlt
    // valley-seeking term's lowest-cost cells — so the router is actively drawn through them, and the
    // Dubins terminal can't repair a centerline that entered water. Same per-primitive rejection
    // pattern as the lattice bounds / hardR floor. undefined/empty → no exclusion (headless gates).
    // QUAL-14 Part B: opts.avoidDiscs = corridor-avoidance discs (same flat format) sampled from
    // higher-priority sibling edges' final centerlines — concatenated into the SAME rejection array
    // so search sampling AND refit badXZ cover them for free. Kept as a separate opts name because
    // the escape hatch below drops corridor discs (advisory relative to connectivity) while ponds
    // (physical) are never dropped.
    const avoidDiscs = (opts.avoidDiscs && opts.avoidDiscs.length) ? opts.avoidDiscs : null
    const pondOnly = (opts.pondDiscs && opts.pondDiscs.length) ? opts.pondDiscs : null
    const pondDiscs = avoidDiscs ? (pondOnly ? pondOnly.concat(avoidDiscs) : avoidDiscs) : pondOnly
    // Spatial hash over the discs when there are many — corridor discs number in the hundreds, and
    // the linear scan per primitive/refit sample would dominate the search. Cell = max disc radius,
    // so any disc containing a point is registered in the 3×3 neighbourhood of that point's cell.
    let discGrid = null, discCell = 0
    if (pondDiscs && pondDiscs.length > 72) {
        let maxR = 0
        for (let i = 2; i < pondDiscs.length; i += 3) if (pondDiscs[i] > maxR) maxR = pondDiscs[i]
        discCell = Math.max(1, maxR)
        discGrid = new Map()
        for (let i = 0; i < pondDiscs.length; i += 3) {
            const hk = Math.floor(pondDiscs[i] / discCell) * 73856093 ^ Math.floor(pondDiscs[i + 1] / discCell) * 19349663
            const bkt = discGrid.get(hk)
            if (bkt) bkt.push(i); else discGrid.set(hk, [i])
        }
    }
    const discHit = (x, z, i) => {
        const dx = x - pondDiscs[i], dz = z - pondDiscs[i + 1], r = pondDiscs[i + 2]
        return dx * dx + dz * dz <= r * r
    }
    const inPondNoGo = (x, z) => {
        if (discGrid) {
            const cx = Math.floor(x / discCell), cz = Math.floor(z / discCell)
            for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
                const bkt = discGrid.get((cx + ox) * 73856093 ^ (cz + oz) * 19349663)
                if (bkt) for (const i of bkt) if (discHit(x, z, i)) return true
            }
            return false
        }
        for (let i = 0; i < pondDiscs.length; i += 3) if (discHit(x, z, i)) return true
        return false
    }

    const minX = Math.min(ax, bx) - margin, maxX = Math.max(ax, bx) + margin
    const minZ = Math.min(az, bz) - margin, maxZ = Math.max(az, bz) + margin
    const NX = Math.max(2, Math.ceil((maxX - minX) / cell)) + 1
    const NZ = Math.max(2, Math.ceil((maxZ - minZ) / cell)) + 1
    const TAU = Math.PI * 2
    const binOf = (th) => ((Math.round(th / TAU * hbins) % hbins) + hbins) % hbins
    const cxOf  = (x) => Math.max(0, Math.min(NX - 1, Math.round((x - minX) / cell)))
    const czOf  = (z) => Math.max(0, Math.min(NZ - 1, Math.round((z - minZ) / cell)))
    const cellOf = (x, z) => czOf(z) * NX + cxOf(x)
    const stateOf = (x, z, th) => cellOf(x, z) * hbins + binOf(th)

    // PERF: cache terrain height per lattice cell (compute heightFn once per cell, not per node
    // expansion). _coarseHeight is multi-octave ridged noise — recomputing it for every one of the
    // hundreds of thousands of node expansions was the streaming-stutter cost. Search cost uses the
    // cell-center height (same approach as the old grid A*); emitted point Y stays exact (heightFn).
    const hH = new Float64Array(NX * NZ), hSeen = new Uint8Array(NX * NZ)
    const hAt = (x, z) => {
        const ci = cellOf(x, z)
        if (!hSeen[ci]) { hH[ci] = heightFn(minX + (ci % NX) * cell, minZ + ((ci / NX) | 0) * cell); hSeen[ci] = 1 }
        return hH[ci]
    }

    // (FEAT-10's 2-D summed-area-table low-pass — loSAT/loBox/designH — is GONE. Both the search
    // and the refit now price grade/deviation on the 1-D ALONG-PATH design profile (the causal EMA
    // construction below), which is what road.js _gradeEdgeInPlace actually builds. The 2-D field
    // under-read along-path grade — a box mean includes a ridge's low flanks, and clamping to raw
    // ±cap hid short tall pitches — which is how dead-straight max-earthwork climbs routed as
    // nearly free and the Max Grade slider was powerless. See the emaW/emaR block.)

    // Bounded valley-seeking altitude cost (D-arc REVISED²). Reference = the straight a→b altitude
    // baseline (linear height interp along the chord). δ = nH − baseline; cost = wAlt·max(0, δ +
    // valleyCap). So:
    //   • ABOVE baseline (δ>0): cost grows → route AROUND ridges (peak avoidance / pass-crossing).
    //   • BELOW baseline, down to valleyCap (−valleyCap ≤ δ ≤ 0): cost shrinks → SEEK the low ground
    //     (the valley-following "spine" / personality).
    //   • DEEPER than valleyCap (δ < −valleyCap): cost saturates at 0 — the CAP. No further reward,
    //     so a far/deep basin can't pull the search into a kilometre detour the way the old absolute
    //     \`wAlt·nH\` global magnet did (the wander that forced the now-deleted cleanup stack).
    // Cost stays ≥ 0 (A*-safe — a true negative "reward" edge would break the priority queue).
    // For equal-height anchors baseline≡ha, so DETOURS-AROUND-PEAK (arc-router.mjs) is unchanged.
    // Pure fn of the anchor pair (+ valleyCap) → window-invariant.
    const valleyCap = opts.valleyDepthCap ?? 40   // m — depth below baseline that still earns reward
    const ha = hAt(ax, az), hb = hAt(bx, bz)
    const _abx = bx - ax, _abz = bz - az
    const _abLen2 = _abx * _abx + _abz * _abz || 1
    const baselineAt = (x, z) => {
        let t = ((x - ax) * _abx + (z - az) * _abz) / _abLen2
        if (t < 0) t = 0; else if (t > 1) t = 1
        return ha + t * (hb - ha)
    }

    // Curvature palette: straight (κ=0) + ± each radius. primLen(k): straight = stepLen; turns = the
    // fixed-angle arc length R·turnAngle = turnAngle/|k| (so larger radius ⇒ longer, gentler arc).
    const kappas = [0]
    for (const R of radii) { kappas.push(1 / R, -1 / R) }
    const primLen = (k) => (Math.abs(k) < 1e-12) ? stepLen : (turnAngle / Math.abs(k))

    // ── Along-path design profile (the honest grade — earthwork mode) ───────────────────────────
    // road.js _gradeEdgeInPlace builds the run profile in 1-D ALONG the polyline: wide smooth of raw
    // → design, clamped to ±deviationCap of the designGradeWindow smooth reference. The search
    // replicates that construction CAUSALLY per candidate path with two running exponential averages
    // of raw height (τ = the two window widths), carried in the state (SSh = wide, SRf = narrow):
    //     design = clamp(EMA_wide, EMA_narrow ± deviationCap);  grade = |Δdesign| / L
    // so the grade/deviation priced is the grade/deviation of the road that would be BUILT along
    // that path. The old form (2-D blur clamped to RAW ± cap at each sample) hid short tall pitches —
    // a step of height h over length L read as (h − 2·cap)/L, a 74% coarse pitch priced as ~8% — so
    // maxGrade/wOver never fired, wDev saw ≤ cap where the carve then built 30 m+ of fill/cut, and
    // dead-straight max-earthwork climbs were nearly free (the Max Grade slider was powerless).
    // Per-κ EMA blend factors (primitive lengths are fixed per κ): α = 1 − exp(−L/τ).
    const emaW = new Float64Array(kappas.length), emaR = new Float64Array(kappas.length)
    if (earthwork) for (let ki = 0; ki < kappas.length; ki++) {
        const L = primLen(kappas[ki])
        emaW[ki] = 1 - Math.exp(-L / earthworkWindow)
        emaR[ki] = 1 - Math.exp(-L / gradeWindow)
    }
    const dClamp = (w, r) => w > r + deviationCap ? r + deviationCap : (w < r - deviationCap ? r - deviationCap : w)

    const arcEnd = (x, z, th, k, L) => {
        if (Math.abs(k) < 1e-12) return [x + L * Math.cos(th), z + L * Math.sin(th), th]
        const th2 = th + k * L
        return [x + (Math.sin(th2) - Math.sin(th)) / k, z - (Math.cos(th2) - Math.cos(th)) / k, th2]
    }
    // Dense points along an arc (excludes the start point, includes the end) → push [x,z] to \`out\`.
    const arcPoints = (x, z, th, k, L, out) => {
        const n = Math.max(1, Math.ceil(L / emitDs))
        for (let i = 1; i <= n; i++) {
            const s = L * i / n
            if (Math.abs(k) < 1e-12) { out.push([x + s * Math.cos(th), z + s * Math.sin(th)]); continue }
            const th2 = th + k * s
            out.push([x + (Math.sin(th2) - Math.sin(th)) / k, z - (Math.cos(th2) - Math.cos(th)) / k])
        }
    }

    // Typed-array lattice with a generation stamp — same algorithm as a Map/Set/heap-of-arrays A*,
    // but no per-call allocation/clears (this is the cold-stream speedup). State id = cellOf*hbins+binOf.
    // Heap comparison is PRIORITY-ONLY (matches the prior implementation exactly → identical routes).
    const NSTATES = NX * NZ * hbins
    _apcEnsure(NSTATES)
    const gen = ++_apcGen
    const G = _apcG, GS = _apcGStamp, CL = _apcClosed
    const SX = _apcX, SZ = _apcZ, STh = _apcTh, SSh = _apcSh, SRf = _apcRf, SKi = _apcKi, SP = _apcParent
    const SL = _apcLen, SMx = _apcMx, SMz = _apcMz
    const HP = _apcHPri, HS = _apcHSt
    HP.length = 0; HS.length = 0
    let hlen = 0
    const hpush = (pri, st) => {
        let i = hlen++
        HP[i] = pri; HS[i] = st
        while (i > 0) { const p = (i - 1) >> 1; if (HP[p] <= HP[i]) break
            const tp = HP[p], ts = HS[p]; HP[p] = HP[i]; HS[p] = HS[i]; HP[i] = tp; HS[i] = ts; i = p }
    }
    const hpopState = () => {
        const top = HS[0]; hlen--
        if (hlen > 0) {
            HP[0] = HP[hlen]; HS[0] = HS[hlen]; let i = 0
            for (;;) { let l = 2 * i + 1, r = 2 * i + 2, m = i
                if (l < hlen && HP[l] < HP[m]) m = l
                if (r < hlen && HP[r] < HP[m]) m = r
                if (m === i) break
                const tp = HP[m], ts = HS[m]; HP[m] = HP[i]; HS[m] = HS[i]; HP[i] = tp; HS[i] = ts; i = m }
        }
        return top
    }

    // ── QUAL-14 perf: IN-SEARCH SELF-PROXIMITY REJECTION (prevention; the wrapper is a backstop) ──
    // Reject a primitive whose endpoint or midpoint lands within selfClearDist of the candidate's
    // OWN ancestor chain more than selfClearGap back along the path — a pigtail (looping >270° to
    // gain elevation in place) becomes an illegal move and the search routes around it in the SAME
    // pass, instead of the emitted chain failing the post-hoc scan and paying a full re-search per
    // repair iteration (≤16×: the old 26 s cold load). Ancestor endpoints + entering-primitive
    // midpoints are stored per state (SL/SMx/SMz) so the walk is pure array reads — no trig.
    // Sample spacing is one point per half-primitive (≤ ~26 m for the largest palette arc), coarser
    // than the emitted-chain scan's 4 m — residual fine grazes fall to the backstop. The walk gates
    // on the MIDPOINT's arc position (the smaller), so pairs within (gap, gap+L/2] of the endpoint
    // are permissively skipped — also backstop territory. Deterministic pure fn of the candidate
    // path → cache/window-invariant. Only candidates that would actually be stored pay the walk.
    const scD = (opts.emitPrimitives && (opts.selfClearDist ?? 0) > 0) ? opts.selfClearDist : 0
    const scD2 = scD * scD, scGap = opts.selfClearGap ?? 80
    // Longest primitive in the palette bounds how far any candidate sample can land from the
    // expanded node — the prefilter radius below. Ancestors outside (scMaxL + scD) of the node, or
    // within scGap of the SHORTEST candidate's midpoint arc position, can never reject a candidate.
    let scMaxL = stepLen
    if (scD > 0) for (const kk of kappas) if (Math.abs(kk) >= 1e-12) { const LL = turnAngle / Math.abs(kk); if (LL > scMaxL) scMaxL = LL }
    const scReach2 = (scMaxL + scD) * (scMaxL + scD)
    // Per-EXPANSION prefilter (the perf shape that makes this affordable): walk the ancestor chain
    // ONCE per popped node — not once per stored candidate — collecting endpoint + entering-midpoint
    // samples within reach into _scN*. Candidates then check only that (usually EMPTY) short list,
    // so the naive per-candidate O(chain) walk collapses to O(chain)/expansion + O(near)/candidate
    // with an IDENTICAL rejection set (both filters are supersets of the exact per-sample test).
    let scN = 0
    // Per-pair EXACT arc-separation gating (entries carry their true arc position — midpoint
    // entries at (SL[st]+SL[parent])/2): a conservative per-entry gate left a (gap, gap+L/2]
    // slop band that admitted tight curls just past the exemption window (measured: a radius-14
    // turnaround at arcSep 85–105 slid through and cost the backstop 9 repair searches). Tight
    // curls are built from the SHORT palette primitives, so sampling there is dense and exact
    // gating closes the band; only long-arc between-sample grazes remain for the backstop.
    const selfHit = (ex, ez, eLen, mx, mz, mLen) => {
        for (let i = 0; i < scN; i++) {
            const pos = _scNS[i], px = _scNX[i], pz = _scNZ[i]
            if (eLen - pos > scGap) {
                const dx = ex - px, dz = ez - pz
                if (dx * dx + dz * dz < scD2) return true
            }
            if (mLen - pos > scGap) {
                const dx = mx - px, dz = mz - pz
                if (dx * dx + dz * dz < scD2) return true
            }
        }
        return false
    }

    const heur = (x, z) => wHeur * wDist * Math.hypot(bx - x, bz - z)
    const th0 = startHeading ?? Math.atan2(bz - az, bx - ax)
    const goalR = Math.max(cell, stepLen), goalR2 = goalR * goalR
    const startState = stateOf(ax, az, th0)
    G[startState] = 0; GS[startState] = gen
    // Earthwork: SSh/SRf seed both profile EMAs at the raw anchor height (design ≡ raw at the start,
    // like the builder's window collapsing at the polyline end). Off-earthwork: SSh = raw height chain.
    SX[startState] = ax; SZ[startState] = az; STh[startState] = th0; SSh[startState] = hAt(ax, az); SRf[startState] = SSh[startState]
    SP[startState] = -1; SKi[startState] = 0
    SL[startState] = 0; SMx[startState] = ax; SMz[startState] = az
    hpush(heur(ax, az), startState)

    let goalState = -1, expanded = 0
    let bestState = startState, bestD2 = (bx - ax) * (bx - ax) + (bz - az) * (bz - az)
    while (hlen > 0 && expanded < maxNodes) {
        const sid = hpopState()
        if (CL[sid] === gen) continue
        CL[sid] = gen
        const cx = SX[sid], cz = SZ[sid], cth = STh[sid], csh = SSh[sid], crf = SRf[sid], cg = G[sid], cLen = SL[sid]
        const dgx = bx - cx, dgz = bz - cz, d2 = dgx * dgx + dgz * dgz
        if (d2 < bestD2) { bestD2 = d2; bestState = sid }
        if (d2 <= goalR2) { goalState = sid; break }
        expanded++
        // Self-clearance prefilter: gather this node's conflict-relevant ancestors (see selfHit).
        scN = 0
        if (scD > 0 && cLen + scMaxL - scGap > 0) {
            const lim = cLen + scMaxL - scGap
            for (let st = sid; st !== -1; st = SP[st]) {
                const sl = SL[st], par = SP[st]
                const mpos = par === -1 ? 0 : (sl + SL[par]) * 0.5   // exact entering-midpoint arc position
                if (mpos >= lim) continue   // within one bend of every candidate sample (mpos ≤ sl)
                let dx = cx - SMx[st], dz = cz - SMz[st]
                if (dx * dx + dz * dz < scReach2) { _scNX[scN] = SMx[st]; _scNZ[scN] = SMz[st]; _scNS[scN] = mpos; scN++ }
                if (sl < lim) {
                    dx = cx - SX[st]; dz = cz - SZ[st]
                    if (dx * dx + dz * dz < scReach2) { _scNX[scN] = SX[st]; _scNZ[scN] = SZ[st]; _scNS[scN] = sl; scN++ }
                }
            }
        }
        for (let ki = 0; ki < kappas.length; ki++) {
            const k = kappas[ki]
            const L = primLen(k)   // fixed-angle: straight = stepLen, turns = turnAngle/|k| (∝ radius)
            const [nx, nz, nth] = arcEnd(cx, cz, cth, k, L)
            if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue
            // FEAT-17: reject primitives entering a pond+skirt disc. Endpoint + midpoint samples
            // suffice: the longest primitive (largest radius × turnAngle) is shorter than any pond
            // diameter, so a ≤ L/2 sample spacing cannot tunnel a disc — worst case is a metre-scale
            // graze of the skirt edge, which the skirt buffer absorbs. (Midpoint hoisted: the
            // self-proximity walk below samples the same two points per primitive.)
            let mx = 0, mz = 0
            if (pondDiscs || scD > 0) {
                const mid = arcEnd(cx, cz, cth, k, L * 0.5)
                mx = mid[0]; mz = mid[1]
            }
            if (pondDiscs) {
                if (inPondNoGo(nx, nz)) continue
                if (inPondNoGo(mx, mz)) continue
            }
            const nst = stateOf(nx, nz, nth)
            if (CL[nst] === gen) continue
            const nHraw = hAt(nx, nz)
            // FEAT-10 earthwork (honest form): extend the two along-path raw-height EMAs and take
            // grade/altitude/deviation from the clamped 1-D design profile — the road the builder
            // would actually construct along this candidate path (see the block above emaW/emaR).
            let grade, nSh, nRf, nHc
            if (earthwork) {
                nSh = csh + emaW[ki] * (nHraw - csh)          // wide design EMA
                nRf = crf + emaR[ki] * (nHraw - crf)          // narrow reference EMA
                nHc = dClamp(nSh, nRf)                        // built design height here
                grade = Math.abs(nHc - dClamp(csh, crf)) / L
            } else {
                nSh = nHraw; nRf = nHraw; nHc = nHraw
                // Grade along the primitive. Endpoint-to-endpoint by default; multi-point MAX along the
                // arc when gradeSamples>1, so a long large-radius arc isn't blind to intra-arc steepness.
                if (gradeSamples > 1 && Math.abs(k) >= 1e-12) {
                    let prevH = csh, gm = 0
                    const nseg = Math.max(1, Math.min(gradeSamples, Math.ceil(L / 8)))
                    for (let gi = 1; gi <= nseg; gi++) {
                        const ss = L * gi / nseg
                        const th2 = cth + k * ss
                        const gx = cx + (Math.sin(th2) - Math.sin(cth)) / k
                        const gz = cz - (Math.cos(th2) - Math.cos(cth)) / k
                        const gh = hAt(gx, gz)
                        const seg = Math.abs(gh - prevH) / (L / nseg)
                        if (seg > gm) gm = seg
                        prevH = gh
                    }
                    grade = gm
                } else {
                    grade = Math.abs(nHraw - csh) / L
                }
            }
            // Per-METRE accrual × L (primitives now vary in length) so cost is length-consistent.
            // earthwork adds wDev·|design − raw| (the fill/cut depth) per metre — the deviation penalty,
            // now the TRUE depth (no longer bounded by deviationCap: the builder clamps against the
            // smooth reference, so real fill/cut can far exceed the cap and must be priced as such).
            let perM = wDist + wGrade * grade * grade + wOver * Math.max(0, grade - maxGrade)
                     + wAlt * Math.max(0, nHc - baselineAt(nx, nz) + valleyCap) + wCurv * k * k
            if (earthwork) perM += wDev * Math.abs(nHc - nHraw)
            const ng = cg + L * perM
            if (GS[nst] !== gen || ng < G[nst]) {
                // Self-proximity: checked only for candidates that would actually be stored.
                if (scN > 0 && selfHit(nx, nz, cLen + L, mx, mz, cLen + L * 0.5)) continue
                G[nst] = ng; GS[nst] = gen
                SX[nst] = nx; SZ[nst] = nz; STh[nst] = nth; SSh[nst] = nSh; SRf[nst] = nRf; SP[nst] = sid; SKi[nst] = ki
                SL[nst] = cLen + L; SMx[nst] = mx; SMz[nst] = mz
                hpush(ng + heur(nx, nz), nst)
            }
        }
    }

    // QUAL-14 Part B ESCAPE HATCH: corridor discs are advisory relative to CONNECTIVITY — if they
    // (unlike ponds) walled off the goal, retry once with the corridor discs dropped (ponds and
    // self-clearance repair discs are kept): a real crossing then forms and the existing crossing
    // classifier/culler owns it. Deterministic (pure retry of the same inputs minus avoidDiscs).
    if (goalState === -1 && avoidDiscs) {
        return arcPrimitiveConnect(ax, az, bx, bz, heightFn, Object.assign({}, opts, { avoidDiscs: undefined }))
    }

    // Fallback: if the goal was never captured (capped/blocked), end at the closest expanded node.
    const endState = goalState !== -1 ? goalState : bestState
    // Walk the parent chain, then re-integrate each primitive from its parent's stored pose so the
    // emitted polyline lies exactly on the valid-radius arcs (G1 across joints).
    const chain = []
    for (let st = endState; st !== -1; st = SP[st]) chain.push(st)
    chain.reverse()

    // ── Primitive emission (Road Overhaul, Phase A) ────────────────────────────────────────────
    // Return the search result as TYPED PRIMITIVES instead of dense points. Each chain step IS an
    // arc primitive (start pose = parent's stored pose, curvature = kappas[SKi], length = stepLen),
    // so curvature is ≥ 1/hardR by construction — no Catmull-Rom re-fit downstream, no fold. The
    // terminal mirrors the dense path: legacy → a straight line stub to the anchor (C0); heading-
    // continuous → cut back ~goalBlend of whole arcs and replace with a Dubins primitive run into
    // the canonical goalHeading. Window-invariant: a pure fn of this anchor-pair's search + the
    // anchor-derived headings (independent of stream center / emission density).
    if (opts.emitPrimitives) {
        const prims = []
        const pushArc = (x, z, th, k, L) => { if (L > 1e-6) prims.push({ x0: x, z0: z, theta0: th, length: L, kappa0: k, kappa1: k }) }
        if (goalHeading == null) {
            for (let i = 1; i < chain.length; i++) {
                const par = chain[i - 1]
                const kc = kappas[SKi[chain[i]]]
                pushArc(SX[par], SZ[par], STh[par], kc, primLen(kc))
            }
            // C0 straight stub to the exact anchor (matches legacy points terminal).
            const ex = SX[endState], ez = SZ[endState]
            const dx = bx - ex, dz = bz - ez, L = Math.hypot(dx, dz)
            pushArc(ex, ez, Math.atan2(dz, dx), 0, L)
        } else {
            // Drop trailing whole arcs until ≥ goalBlend is freed, then Dubins from the cut pose.
            let acc = 0, cutIdx = chain.length - 1
            while (cutIdx > 0 && acc < goalBlend) { acc += primLen(kappas[SKi[chain[cutIdx]]]); cutIdx-- }
            for (let i = 1; i <= cutIdx; i++) {
                const par = chain[i - 1]
                const kc = kappas[SKi[chain[i]]]
                pushArc(SX[par], SZ[par], STh[par], kc, primLen(kc))
            }
            const cs = chain[cutIdx]
            const cx = SX[cs], cz = SZ[cs], cth = STh[cs]
            const dub = dubinsPrimitives(cx, cz, cth, bx, bz, goalHeading, hardR)
            if (dub) for (const p of dub) pushArc(p.x0, p.z0, p.theta0, p.kappa0, p.length)
            else { const dx = bx - cx, dz = bz - cz, L = Math.hypot(dx, dz); pushArc(cx, cz, Math.atan2(dz, dx), 0, L) }
        }

        // ── De-quantize refit (BUG-16 + FEAT-20) ──────────────────────────────────────────────
        // Two deterministic post-passes over the routed chain, both OFF unless opted in (bare
        // router stays byte-identical — arc-router.mjs). Pure fns of the chain + opts + heightFn
        // → window-invariant; the Worker pre-warm and the sync fallback refit identically.
        //   1. Corridor Dubins SHORTCUT (opts.refitShortcut — BUG-16): the greedy weighted-A*
        //      holds a quantized heading when startHeading is off the chord bearing and defers
        //      correction → a long-wavelength bow (~22–36 m lateral / 500 m connection) that reads
        //      as a serpentine across consecutive connections. Divide-and-conquer: replace a span
        //      with the shortest Dubins word at DESCENDING rho (0.8/0.4/0.2·chord → hardR —
        //      continuous chord-derived radii, FEAT-20 variety) iff it is not longer (≤ raw·1.02),
        //      not steeper (max sampled grade ≤ raw + slack AND grade-EXCESS ∫max(0, g−maxGrade)ds
        //      ≤ raw + 1 m — the integral is what actually protects switchback stacks: a short
        //      steep stub in the raw span must not license a long steep cut-through the hillside),
        //      pond-clear and in-bounds; else split at the span's arc-length midpoint and recurse
        //      (spans < MIN_SPAN keep their raw primitives).
        //   2. κ BOX-FILTER re-emitted as clothoids (opts.refitWindow m — FEAT-20 smoothness):
        //      sample κ(s), average with a shrinking symmetric half-window h_i = min(H, i, N−1−i)
        //      (endpoint κ exact; NO replicate padding — padding biases ∫κ → heading drift),
        //      re-integrate from the EXACT original start pose, emit merged clothoid/arc
        //      descriptors. Averaging can only shrink max |κ| ⇒ |κ̄| ≤ 1/hardR everywhere:
        //      min-radius stays valid BY CONSTRUCTION.
        //   3. TERMINAL: re-integration drifts the far end (~0.5 m at W=30, superlinear in W —
        //      keep W small; the shortcut owns BUG-16). Cut back max(goalBlend, 40) m and Dubins
        //      at ADAPTIVE rho (C, C/2, C/4, hardR — first word ≤ 1.25× the gap; fallback hardR)
        //      to the EXACT original end pose, so adjacent connections still join G1 at shared
        //      anchors. Adaptive rho also erases the κ=1/hardR blip a fixed-hardR terminal leaves
        //      visible on near-straight roads.
        //   4. VALIDATE the refit chain (pond/bounds per ≤refitDs sample); any violation → the
        //      span-checked post-shortcut chain, else the raw chain (deterministic fallback).
        if ((opts.refitShortcut || (opts.refitWindow ?? 0) > 0) && prims.length > 1) {
            const refitDs = opts.refitDs ?? 2       // m — refit sampling spacing
            const refitW  = opts.refitWindow ?? 0   // m — κ box-filter window (0 = shortcut only)
            const GRADE_SLACK  = 0.02               // a shortcut may steepen max grade by ≤ this
            const EXCESS_SLACK = 1.0                // m — allowed growth of ∫max(0, g−maxGrade)ds
            const MIN_SPAN     = 24                 // m — spans shorter than this keep raw prims
            // Refit grade measure: the SAME 1-D causal EMA design profile the search prices (see
            // the emaW/emaR block) — raw heights fed along the span, design = clamp(EMA_wide,
            // EMA_narrow ± deviationCap), grade = |Δdesign|/ds. Sampled with the EXACT heightFn,
            // NOT hAt: its 8 m cell staircase makes sampled grade pure aliasing noise (0 within a
            // cell, Δcell/ds at crossings), so a raw-vs-candidate comparison on it is meaningless.
            // A 2-D FIELD measure (the old designH sampling) cannot represent switchback legality
            // either: a stack traversing a steep field band repeatedly collects more field "excess"
            // than a straight cut crossing it once, so the shortcut licensed dead-straight cliff
            // cuts that erased 1000°+ of intentional switchbacks (the straight-climb bug's second
            // head — the search routed the alpine stack, the refit flattened it).
            // Non-earthwork: design ≡ raw heightFn (legacy semantics).
            const badXZ = (x, z) => x < minX || x > maxX || z < minZ || z > maxZ
                                 || (pondDiscs !== null && inPondNoGo(x, z))
            // QUAL-14 perf: the shortcut/terminal rewrites are not ancestor-checked, so in a
            // corridor-congested field a Dubins span can slice across another part of the route
            // (measured: 216 violating pairs on a chain whose search output had 7) — and every such
            // chain costs the backstop wrapper a full repair re-search. Cheap guard: if the refit
            // INTRODUCED self-clearance violations, ship the pre-refit chain instead (one O(n) scan
            // per side; losing the serpentine-bow polish on these rare congested edges is invisible
            // next to their corridor detours). scD=0 → inert (bare router byte-identical).
            const scPick = (cand) => {
                if (scD <= 0 || cand === prims) return cand
                return _selfClearScan(cand, scD, scGap).v <= _selfClearScan(prims, scD, scGap).v ? cand : prims
            }
            const primEndPose = (p) => arcEnd(p.x0, p.z0, p.theta0, p.kappa0, p.length)  // const-κ only
            const startPose = prims[0]                          // exact original start pose (G1 contract)
            const rawEnd = primEndPose(prims[prims.length - 1]) // exact original end pose (G1 contract)

            // Raw grade stats per primitive, ONE sequential pass (≤refitDs sampling, profile state
            // carried across prim boundaries): primG[i] = max grade, primEx[i] = grade EXCESS
            // ∫max(0, g−maxGrade)ds within prims[i]. Span stats combine as max/sum, so the
            // divide-and-conquer never re-samples the raw chain. PW/PR/PD snapshot the profile
            // state at each primitive boundary so a CANDIDATE span seeds from the exact state the
            // raw span had there — raw vs candidate stay measured by one construction. The excess
            // integral is the real switchback guard — the raw route's short steep terminal stub
            // gives it a nonzero max grade, and max-grade alone would license a LONG cut-through
            // at that same grade.
            const primG = new Float64Array(prims.length), primEx = new Float64Array(prims.length)
            const PW = new Float64Array(prims.length + 1), PR = new Float64Array(prims.length + 1),
                  PD = new Float64Array(prims.length + 1)
            {
                const h0 = heightFn(prims[0].x0, prims[0].z0)
                let w = h0, r = h0, d = h0
                for (let i = 0; i < prims.length; i++) {
                    PW[i] = w; PR[i] = r; PD[i] = d
                    const p = prims[i]
                    const n = Math.max(1, Math.ceil(p.length / refitDs)), dsp = p.length / n
                    const aW2 = earthwork ? 1 - Math.exp(-dsp / earthworkWindow) : 0
                    const aR2 = earthwork ? 1 - Math.exp(-dsp / gradeWindow) : 0
                    let g = 0, ex = 0
                    for (let j = 1; j <= n; j++) {
                        const e = arcEnd(p.x0, p.z0, p.theta0, p.kappa0, dsp * j)
                        const h2 = heightFn(e[0], e[1])
                        let d2
                        if (earthwork) { w += aW2 * (h2 - w); r += aR2 * (h2 - r); d2 = dClamp(w, r) }
                        else d2 = h2
                        const gg = Math.abs(d2 - d) / dsp
                        if (gg > g) g = gg
                        if (gg > maxGrade) ex += (gg - maxGrade) * dsp
                        d = d2
                    }
                    primG[i] = g; primEx[i] = ex
                }
                PW[prims.length] = w; PR[prims.length] = r; PD[prims.length] = d
            }
            const spanGrade = (a, b) => {
                let g = 0, ex = 0
                for (let i = a; i < b; i++) { if (primG[i] > g) g = primG[i]; ex += primEx[i] }
                return [g, ex]
            }
            // Shortest Dubins replacement for one span, or null. Acceptance = length + grade +
            // excess + pond + bounds (see pass-1 header note); first passing rho (largest) wins.
            const dubinsSpan = (a, x0, z0, th0, x1, z1, th1, rawLen, rawG, rawEx) => {
                const chord = Math.hypot(x1 - x0, z1 - z0)
                if (chord < 1e-6) return null
                let prevRho = -1
                for (const rr of [0.8 * chord, 0.4 * chord, 0.2 * chord, hardR]) {
                    const rho = Math.max(hardR, rr)
                    if (rho === prevRho) continue
                    prevRho = rho
                    const best = _dubinsBest(x0, z0, th0, x1, z1, th1, rho)
                    if (!best || best.len * rho > rawLen * 1.02) continue
                    // Candidate profile seeds from the raw chain's snapshot at the span start (PW/PR/PD)
                    // so both spans carry the same upstream profile memory into the comparison.
                    let ok = true, g = 0, ex = 0, sx = x0, sz = z0, sth = th0
                    let w = PW[a], r = PR[a], d = PD[a]
                    for (const [kSign, lenR] of best.segs) {
                        const L2 = lenR * rho
                        if (L2 < 1e-9) continue
                        const k = kSign / rho
                        const n = Math.max(1, Math.ceil(L2 / refitDs)), dsp = L2 / n
                        const aW2 = earthwork ? 1 - Math.exp(-dsp / earthworkWindow) : 0
                        const aR2 = earthwork ? 1 - Math.exp(-dsp / gradeWindow) : 0
                        for (let j = 1; j <= n; j++) {
                            const e = arcEnd(sx, sz, sth, k, dsp * j)
                            if (badXZ(e[0], e[1])) { ok = false; break }
                            const h2 = heightFn(e[0], e[1])
                            let d2
                            if (earthwork) { w += aW2 * (h2 - w); r += aR2 * (h2 - r); d2 = dClamp(w, r) }
                            else d2 = h2
                            const gg = Math.abs(d2 - d) / dsp
                            if (gg > g) g = gg
                            if (gg > maxGrade) ex += (gg - maxGrade) * dsp
                            d = d2
                        }
                        if (!ok) break
                        const e = arcEnd(sx, sz, sth, k, L2)
                        sx = e[0]; sz = e[1]; sth = e[2]
                    }
                    if (!ok || g > rawG + GRADE_SLACK || ex > rawEx + EXCESS_SLACK) continue
                    return dubinsPrimitives(x0, z0, th0, x1, z1, th1, rho)
                }
                return null
            }
            // Divide-and-conquer over PRIMITIVE indices (splits land on primitive boundaries, so
            // kept spans are the raw primitives verbatim). Pure fn of the chain → deterministic.
            const shortcutSpan = (a, b, out) => {
                let rawLen = 0
                for (let i = a; i < b; i++) rawLen += prims[i].length
                if (b - a >= 2 && rawLen >= MIN_SPAN) {
                    const p0 = prims[a], pe = primEndPose(prims[b - 1])
                    const [rawG, rawEx] = spanGrade(a, b)
                    const dub = dubinsSpan(a, p0.x0, p0.z0, p0.theta0, pe[0], pe[1], pe[2], rawLen, rawG, rawEx)
                    if (dub) { for (const d of dub) out.push(d); return }
                    let acc = 0, mid = a + 1
                    for (let i = a; i < b - 1; i++) { acc += prims[i].length; if (acc >= rawLen * 0.5) { mid = i + 1; break } }
                    shortcutSpan(a, mid, out)
                    shortcutSpan(mid, b, out)
                    return
                }
                for (let i = a; i < b; i++) out.push(prims[i])
            }

            let refChain = prims
            if (opts.refitShortcut) {
                const out = []
                shortcutSpan(0, prims.length, out)
                if (out.length) refChain = out
            }
            const shortcutChain = refChain   // validation-fallback tier (spans already pond/bounds-checked)

            // Pass 2 — κ box-filter → clothoid re-emit.
            if (refitW > 0) {
                let Ltot = 0
                for (const p of refChain) Ltot += p.length
                if (Ltot > refitDs * 4) {
                    const N = Math.max(3, Math.round(Ltot / refitDs) + 1)
                    const ds = Ltot / (N - 1)
                    // κ(s) samples (refChain is const-κ per prim here) + prefix sums.
                    const ks = new Float64Array(N)
                    {
                        let pi = 0, s0 = 0
                        for (let i = 0; i < N; i++) {
                            const s = ds * i
                            while (pi < refChain.length - 1 && s > s0 + refChain[pi].length + 1e-9) { s0 += refChain[pi].length; pi++ }
                            ks[i] = refChain[pi].kappa0
                        }
                    }
                    const pre = new Float64Array(N + 1)
                    for (let i = 0; i < N; i++) pre[i + 1] = pre[i] + ks[i]
                    const H = Math.max(1, Math.round(refitW / (2 * ds)))   // half-window: 2H+1 samples ≈ refitW
                    const kb = new Float64Array(N)
                    for (let i = 0; i < N; i++) {
                        const h = Math.min(H, Math.min(i, N - 1 - i))     // shrinking symmetric half-window
                        kb[i] = (pre[i + h + 1] - pre[i - h]) / (2 * h + 1)
                    }
                    // Re-integrate from the EXACT original start pose; emit descriptors at ~8 m
                    // granularity, greedy-merging near-constant-κ runs (bounds the clothoid-table
                    // count downstream). Clothoid end poses use the same 0.5 m trapezoid quadrature
                    // as centerline.js buildClothoidTable, so descriptor joins are seamless there.
                    const MERGE_LEN = 8, MERGE_TOL = 1e-4
                    const stepN = Math.max(1, Math.round(MERGE_LEN / ds))
                    const out = []
                    let x = startPose.x0, z = startPose.z0, th = startPose.theta0
                    let i = 0
                    while (i < N - 1) {
                        let j = Math.min(N - 1, i + stepN)
                        while (j < N - 1 && Math.abs(kb[j + 1] - kb[i]) < MERGE_TOL) j++
                        const segL = (j - i) * ds, k0 = kb[i], k1 = kb[j]
                        out.push({ x0: x, z0: z, theta0: th, length: segL, kappa0: k0, kappa1: k1 })
                        if (Math.abs(k1 - k0) < 1e-9) {
                            const e = arcEnd(x, z, th, k0, segL); x = e[0]; z = e[1]; th = e[2]
                        } else {
                            const n = Math.max(1, Math.ceil(segL / 0.5)), hstep = segL / n
                            const dk = (k1 - k0) / segL
                            let cP = Math.cos(th), sP = Math.sin(th)
                            for (let q = 1; q <= n; q++) {
                                const s = q * hstep
                                const t2 = th + k0 * s + 0.5 * dk * s * s
                                const c = Math.cos(t2), sn = Math.sin(t2)
                                x += 0.5 * (cP + c) * hstep
                                z += 0.5 * (sP + sn) * hstep
                                cP = c; sP = sn
                            }
                            th = th + k0 * segL + 0.5 * (k1 - k0) * segL
                        }
                        i = j
                    }
                    if (out.length) refChain = out
                }
            }

            // Pass 3 — terminal: cut back C whole descriptors and re-target the EXACT original end
            // pose. The cut pose is the stored start pose of the first dropped descriptor (always
            // exists: C > 0 drops at least one), so no re-integration is needed here.
            const C = Math.max(goalBlend, 40)
            let cut = refChain.length, freed = 0
            while (cut > 0 && freed < C) { freed += refChain[cut - 1].length; cut-- }
            const cp = refChain[cut]
            const gap = Math.hypot(rawEnd[0] - cp.x0, rawEnd[1] - cp.z0)
            let term = null, prevRho = -1
            for (const rr of [C, C * 0.5, C * 0.25, hardR]) {
                const rho = Math.max(hardR, rr)
                if (rho === prevRho) continue
                prevRho = rho
                const best = _dubinsBest(cp.x0, cp.z0, cp.theta0, rawEnd[0], rawEnd[1], rawEnd[2], rho)
                if (best && best.len * rho <= gap * 1.25) {
                    term = dubinsPrimitives(cp.x0, cp.z0, cp.theta0, rawEnd[0], rawEnd[1], rawEnd[2], rho)
                    break
                }
            }
            if (!term) term = dubinsPrimitives(cp.x0, cp.z0, cp.theta0, rawEnd[0], rawEnd[1], rawEnd[2], hardR)
            const refit = refChain.slice(0, cut)
            if (term) { for (const p of term) refit.push(p) }
            else if (gap > 1e-6) refit.push({ x0: cp.x0, z0: cp.z0, theta0: Math.atan2(rawEnd[1] - cp.z0, rawEnd[0] - cp.x0), length: gap, kappa0: 0, kappa1: 0 })

            // Pass 4 — final validation (pond/bounds; grade+length were span-checked in pass 1).
            let valid = refit.length > 0
            for (const p of refit) {
                if (!valid) break
                const n = Math.max(1, Math.ceil(p.length / refitDs))
                if (Math.abs(p.kappa1 - p.kappa0) < 1e-9) {
                    for (let j = 1; j <= n; j++) {
                        const e = arcEnd(p.x0, p.z0, p.theta0, p.kappa0, p.length * j / n)
                        if (badXZ(e[0], e[1])) { valid = false; break }
                    }
                } else {
                    const hstep = p.length / n, dk = (p.kappa1 - p.kappa0) / p.length
                    let vx = p.x0, vz = p.z0
                    let cP = Math.cos(p.theta0), sP = Math.sin(p.theta0)
                    for (let q = 1; q <= n; q++) {
                        const s = q * hstep
                        const t2 = p.theta0 + p.kappa0 * s + 0.5 * dk * s * s
                        const c = Math.cos(t2), sn = Math.sin(t2)
                        vx += 0.5 * (cP + c) * hstep
                        vz += 0.5 * (sP + sn) * hstep
                        cP = c; sP = sn
                        if (badXZ(vx, vz)) { valid = false; break }
                    }
                }
            }
            return scPick(valid ? refit : shortcutChain)
        }
        return prims
    }

    const pts2d = [[ax, az]]
    for (let i = 1; i < chain.length; i++) {
        const par = chain[i - 1]
        const kc = kappas[SKi[chain[i]]]
        arcPoints(SX[par], SZ[par], STh[par], kc, primLen(kc), pts2d)
    }
    // BUG-12 terminal. Legacy (no goalHeading): pin the exact anchor with a straight stub (C0 only).
    // Heading-continuous: the free search arrives near the anchor at its valley-true (uncontrolled)
    // heading; pinning it straight to the anchor hairpins (a sub-floor cusp that centripetal-CR then
    // amplifies), and a cubic-Hermite blend spikes its curvature on a big heading change. Instead,
    // cut back \`goalBlend\` metres of arc and replace that tail with a DUBINS path (radius hardR) from
    // the cut pose to the EXACT anchor at the canonical goalHeading. Dubins curvature is piecewise
    // constant and everywhere ≥ hardR, so even a switchback-apex turn becomes a valid-radius hairpin,
    // never a fold. The next segment starts at the same anchor with startHeading == this goalHeading
    // → G1 join. Window-invariant: a pure function of this segment's own (per-anchor-pair) search +
    // the anchor-derived canonical headings.
    if (goalHeading == null) {
        pts2d.push([bx, bz])
    } else {
        let acc = 0, cut = pts2d.length - 1
        while (cut > 0) {
            acc += Math.hypot(pts2d[cut][0] - pts2d[cut - 1][0], pts2d[cut][1] - pts2d[cut - 1][1])
            cut--
            if (acc >= goalBlend) break
        }
        const p0 = pts2d[cut]
        const t0 = cut > 0
            ? Math.atan2(p0[1] - pts2d[cut - 1][1], p0[0] - pts2d[cut - 1][0])
            : th0   // whole-segment terminal → leave along the canonical start heading
        pts2d.length = cut + 1   // drop the tail we are about to replace
        const dub = dubinsPath(p0[0], p0[1], t0, bx, bz, goalHeading, hardR, emitDs)
        if (dub) for (const q of dub) pts2d.push(q)
        else pts2d.push([bx, bz])
    }

    const out = []
    for (let i = 0; i < pts2d.length; i++) {
        const x = pts2d[i][0], z = pts2d[i][1]
        if (out.length) { const lp = out[out.length - 1]; if ((x - lp.x) ** 2 + (z - lp.z) ** 2 < 1e-6) continue }
        out.push({ x, y: heightFn(x, z), z })
    }
    return out
}
// ROUTE SYNC END (verbatim mirror of road-carve.js — route-worker-sync.mjs enforces)
// (PERF-03 Workstream A: the road-carve.js ROUTE SYNC region — arcPrimitiveConnect + dubins helpers
//  + search scratch — is spliced in here VERBATIM. Do not hand-edit; mirror road-carve.js and the
//  route-worker-sync.mjs gate enforces byte-equality.)

// ── Message handler ────────────────────────────────────────────────────────
self.onmessage = function(e) {
    if (e.data.type === 'init') {
        const { worldSeed, params } = e.data
        _workerParams = params
        noiseCoarse   = createNoise2D(mulberry32(seedFor(worldSeed, 'coarse')))
        return
    }
    if (e.data.type !== 'route') return

    // Not initialized yet (route raced ahead of 'init'): echo the keys with prims:null so the client
    // RELEASES them from _pendingRoutes and re-warms after init (same pattern the terrain worker used).
    if (!noiseCoarse) {
        self.postMessage({ routed: true, client: e.data.client, epoch: e.data.epoch, results: e.data.jobs.map(function (j) { return { key: j.key, prims: null } }) })
        return
    }
    const _hf = function (x, z) { return coarseHeight(x, z, noiseCoarse, _workerParams) }
    const results = []
    for (const job of e.data.jobs) {
        const prims = arcPrimitiveConnect(job.ax, job.az, job.bx, job.bz, _hf, job.opts)
        results.push({ key: job.key, prims })
    }
    self.postMessage({ routed: true, client: e.data.client, epoch: e.data.epoch, results })
}
`

/**
 * Main-thread transport for the dedicated road-network routing Workers. Owns a small POOL of Blob
 * workers (QUAL-14 perf: route jobs are pure and independent — the two-phase dependency-aware
 * dispatch in warmRoutes only ships a job once its corridor-disc inputs are already cached data —
 * so batches split round-robin across workers for near-linear pre-warm/cold-load scaling) and a
 * registry of route CLIENTS (RoadSystem instances keyed by id). Each client dispatches through
 * postRouteJobs(id, jobs, epoch); replies are routed back to that client's ingestRoutedConnections
 * (which tolerates any reply order: results are keyed, stale epochs rejected per instance).
 */
export class RoadRouteWorker {
    constructor(size) {
        const n = size ?? RoadRouteWorker.defaultPoolSize()
        const blob   = new Blob([ROAD_WORKER_SOURCE], { type: 'application/javascript' })
        this._url    = URL.createObjectURL(blob)
        this._clients = new Map()   // clientId -> RoadSystem
        this._next    = 0           // round-robin cursor (rotates across calls so small batches spread)
        this._workers = []
        const onmessage = (e) => {
            if (!e.data || !e.data.routed) return
            const client = this._clients.get(e.data.client)
            client?.ingestRoutedConnections(e.data.results, e.data.epoch)
        }
        for (let i = 0; i < n; i++) {
            const w = new Worker(this._url)
            w.onmessage = onmessage
            this._workers.push(w)
        }
    }

    /** 2–4 workers: leave headroom for the terrain worker + main thread on small machines. */
    static defaultPoolSize() {
        const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4
        return Math.max(2, Math.min(4, hc - 2))
    }

    /** Register (or replace) a route client. The dispatcher closure passes this id in postRouteJobs. */
    registerClient(id, roadSystem) { this._clients.set(id, roadSystem) }

    /**
     * (Re-)initialize the worker's seeded coarse-noise closure. Sends a PLAIN coarse-params subset —
     * never the whole RANGER_PARAMS (functions/typed arrays throw DataCloneError; see
     * project_terrain_worker_constraints). Routing only reads the coarse fields.
     */
    init(worldSeed, params) {
        const msg = {
            type: 'init',
            worldSeed,
            params: {
                coarseAmplitude: params.coarseAmplitude,
                coarseFreq:      params.coarseFreq,
                coarseOctaves:   params.coarseOctaves,
                ridgeSharpness:  params.ridgeSharpness,
            },
        }
        for (const w of this._workers) w.postMessage(msg)
    }

    /** Dispatch route jobs for a client, split round-robin across the pool. jobs = [{key, ax, az, bx, bz, opts}]. */
    postRouteJobs(client, jobs, epoch) {
        const n = this._workers.length
        if (n === 1 || jobs.length === 1) {
            this._workers[this._next++ % n].postMessage({ type: 'route', client, jobs, epoch })
            this._next %= n
            return
        }
        const buckets = []
        for (let i = 0; i < jobs.length; i++) {
            const wi = (this._next + i) % n
            ;(buckets[wi] ??= []).push(jobs[i])
        }
        this._next = (this._next + jobs.length) % n
        for (let wi = 0; wi < n; wi++) {
            if (buckets[wi]?.length) this._workers[wi].postMessage({ type: 'route', client, jobs: buckets[wi], epoch })
        }
    }

    dispose() {
        for (const w of this._workers) w.terminate()
        this._workers.length = 0
        URL.revokeObjectURL(this._url)
        this._clients.clear()
    }
}
