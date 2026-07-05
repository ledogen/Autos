/**
 * src/capture.js — the game↔harness capture schema (plan 09 INVARIANCE-HARNESS, Phase 4/5).
 *
 * A capture is the single artifact that turns an in-sim "this is fucked up HERE / THIS happened"
 * observation into a deterministic, replayable bug report. `test/replay.mjs` consumes it headlessly:
 * it rebuilds the EXACT scenario from `world` (the road is a pure fn of seed+params+coords) and
 * recomputes what the game `observed`, then DIFFS — match = reproduced + a ready regression gate;
 * mismatch = the bug is environment/timing-specific (still diagnostic).
 *
 * One envelope, discriminated by `kind`:
 *   kind:"place" — a spatial bug (kink, fold, grade bump, the freecam tear). Reproduced by building
 *                  the road at `place.region` and probing — no time, no physics. (Phase 4, live now.)
 *   kind:"event" — a temporal bug (launch, bad drift). Reproduced by replaying `event.inputTimeline`
 *                  through a headless physics loop from `event.initialState`. (Phase 5.)
 *
 * Pure module (no DOM / no THREE construction) so the harness can BUILD captures too (fixtures /
 * self-tests). The browser side adds only the download (Blob) in main.js.
 */

export const CAPTURE_VERSION = 1

// Default half-extent (m) of the probe region a place-mark builds around itself. Covers the road
// footprint + a few tiles of approach so the gate sees the run through the marked spot, not just a point.
export const PLACE_REGION_HALF = 100

/**
 * Copy the finite-number fields of a params object into a plain JSON-safe record. RANGER_PARAMS holds
 * the road-routing + terrain-noise scalars the reproduction reads; functions / THREE objects (if any)
 * are dropped so the capture serialises cleanly (and never trips the worker DataCloneError class of
 * issue). Order-independent — replay reads by key.
 */
export function serializableParams(params) {
    const out = {}
    for (const k of Object.keys(params || {})) {
        const v = params[k]
        if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
        // BOOLEAN toggles must survive too — e.g. roadSiteValleySnap / roadRefitShortcut / roadGraph*.
        // replay.mjs does `new RoadSystem(seed, params)` with NO merge over RANGER_PARAMS, so a dropped
        // boolean falls back to road.js's inline `?? default` — which does NOT match the game (valley
        // snap: game false / fallback true; refit shortcut: game true / fallback false). Dropping them
        // replayed a DIFFERENT node field + centerline than the game ran (same class of bug as the
        // roadArcRadii array drop below).
        else if (typeof v === 'boolean') out[k] = v
        // Number ARRAYS must survive too — e.g. roadArcRadii (the fixed-angle curvature palette).
        // Dropping it made replay.mjs route with arcPrimitiveConnect's [gentleR,hardR] fallback, i.e.
        // a DIFFERENT road than the game ran, so every road capture replayed against the wrong surface.
        else if (Array.isArray(v) && v.every(x => typeof x === 'number' && Number.isFinite(x))) {
            out[k] = v.slice()
        }
    }
    return out
}

/** Axis-aligned probe box of half-extent `half` around (x,z). */
export function regionAround(x, z, half = PLACE_REGION_HALF) {
    return { x0: x - half, x1: x + half, z0: z - half, z1: z + half }
}

/**
 * Build a kind:"place" capture — a spatial bug report at world (mark.x, mark.z).
 *
 * `observed` records what the LIVE game resolved at the mark so replay can assert reproduction:
 *   road side  (always; replay recomputes from RoadSystem) — runKey, arcS, gradeY, camber, minRadius
 *   terrain side (optional; replay verifies once terrain-headless exists, Phase 5) — groundY, wheelGroundY
 *
 * @param {object} a
 * @param {RoadSystem} a.roadSystem
 * @param {number} a.worldSeed                 — uint32 (RoadSystem rebuilds the real coarse height from this)
 * @param {string} [a.seedString]              — human seed (e.g. "lone-pine"), reference only
 * @param {object} a.params                    — RANGER_PARAMS (serialised via serializableParams)
 * @param {{x:number,z:number}} a.mark         — the marked world position
 * @param {string} [a.complaint]               — free-text "what's wrong" (human/LLM signal)
 * @param {Array<{t:number,x:number,z:number}>} [a.streamCenterHistory] — recent stream centers (tear repro;
 *                                               NOT required for place repro now that the road is window-invariant)
 * @param {object} [a.terrainSample]           — { groundY, wheelGroundY:[fl,fr,rl,rr] } from the live terrain
 * @returns {object} capture envelope
 */
export function buildPlaceCapture(a) {
    const s = a.roadSystem.debugSampleAt(a.mark.x, a.mark.z)
    const observed = {
        hit:       s.hit,
        runKey:    s.runKey ?? '',
        arcS:      s.arcS,
        gradeY:    s.gradeY,
        camber:    s.camber,
        minRadius: s.minR,
    }
    if (a.terrainSample) {
        observed.groundY      = a.terrainSample.groundY
        observed.wheelGroundY = a.terrainSample.wheelGroundY
    }
    return {
        rangersimCapture: CAPTURE_VERSION,
        kind:      'place',
        complaint: a.complaint ?? '',
        world: {
            seed:       a.worldSeed,
            seedString: a.seedString ?? '',
            params:     serializableParams(a.params),
        },
        place: {
            mark:                a.mark,
            region:              regionAround(a.mark.x, a.mark.z),
            streamCenterHistory: a.streamCenterHistory ?? [],
            observed,
        },
    }
}

/**
 * Build a kind:"event" capture — a temporal bug report from a recorded telemetry section.
 * The `\` recorder's columnar log is the `frames` block almost verbatim; `inputTimeline` and
 * `initialState` are derived so a headless physics loop (Phase 5) can re-run it and diff the trajectory.
 *
 * @param {object} a
 * @param {number} a.worldSeed
 * @param {string} [a.seedString]
 * @param {object} a.params
 * @param {string} [a.complaint]
 * @param {string[]} a.fields                  — the telemetry FIELDS header
 * @param {number[][]} a.frames                — the telemetry rows (one per physics tick)
 * @param {Array<{t,x,z}>} [a.streamCenterHistory]
 * @returns {object} capture envelope
 */
export function buildEventCapture(a) {
    const ix = Object.fromEntries(a.fields.map((f, i) => [f, i]))
    const f0 = a.frames[0] || []
    const at = (row, k) => (ix[k] != null ? row[ix[k]] : 0)
    const initialState = a.frames.length ? {
        position:        { x: at(f0, 'px'), y: at(f0, 'py'), z: at(f0, 'pz') },
        velocity:        { x: at(f0, 'vx'), y: at(f0, 'vy'), z: at(f0, 'vz') },
        quaternion:      { x: at(f0, 'qx'), y: at(f0, 'qy'), z: at(f0, 'qz'), w: at(f0, 'qw') },
        angularVelocity: { x: at(f0, 'wx'), y: at(f0, 'wy'), z: at(f0, 'wz') },
    } : null
    const inputTimeline = a.frames.map(r => ({
        t: at(r, 't'), steer: at(r, 'steer'), thr: at(r, 'thr'), brk: at(r, 'brk'),
    }))
    return {
        rangersimCapture: CAPTURE_VERSION,
        kind:      'event',
        complaint: a.complaint ?? '',
        world: {
            seed:       a.worldSeed,
            seedString: a.seedString ?? '',
            params:     serializableParams(a.params),
        },
        event: {
            t0: inputTimeline.length ? inputTimeline[0].t : 0,
            t1: inputTimeline.length ? inputTimeline[inputTimeline.length - 1].t : 0,
            initialState,
            streamCenterHistory: a.streamCenterHistory ?? [],
            inputTimeline,
            fields: a.fields,
            frames: a.frames,
        },
    }
}

/**
 * Validate a parsed capture envelope. Returns { ok, errors[] }. Used by replay.mjs before it trusts
 * a file (T-02-01 spirit: no eval, defensive on shape).
 */
export function validateCapture(c) {
    const errors = []
    if (!c || typeof c !== 'object') return { ok: false, errors: ['not an object'] }
    if (c.rangersimCapture !== CAPTURE_VERSION) errors.push(`version: expected ${CAPTURE_VERSION}, got ${c.rangersimCapture}`)
    if (c.kind !== 'place' && c.kind !== 'event') errors.push(`kind: expected place|event, got ${c.kind}`)
    if (!c.world || typeof c.world.seed !== 'number') errors.push('world.seed missing/not a number')
    if (!c.world || typeof c.world.params !== 'object') errors.push('world.params missing')
    if (c.kind === 'place') {
        if (!c.place?.mark || typeof c.place.mark.x !== 'number') errors.push('place.mark missing')
        if (!c.place?.region) errors.push('place.region missing')
        if (!c.place?.observed) errors.push('place.observed missing')
    }
    if (c.kind === 'event') {
        if (!Array.isArray(c.event?.frames)) errors.push('event.frames missing')
        if (!Array.isArray(c.event?.inputTimeline)) errors.push('event.inputTimeline missing')
    }
    return { ok: errors.length === 0, errors }
}
