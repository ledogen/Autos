// src/route-store.js — QUAL-14 perf: bundled DEFAULT-WORLD route cache.
//
// Routed centerlines are pure functions of (worldSeed, routing-relevant params) — the QUAL-08
// worker-cache invariant — so the shipped default world's routes are baked at commit time into a
// static asset (data/route-cache-default.json) and imported on boot: the first world never routes
// at all. Nothing is persisted on the player's machine (user decision 2026-07-06: no per-world
// IndexedDB hoard — other seeds cache in in-session Maps only; save files may come later).
//
// STALENESS GUARD: `sig` (below) covers every routing-relevant PARAM, and the
// route-bundle-parity gate re-routes bundle edges with the live router and asserts byte-parity —
// so a router CODE change that alters geometry fails npm test until the asset is regenerated
// (scratchpad gen-default-route-cache.mjs pattern). A sig mismatch at load time simply MISSES —
// a stale record can never inject routes the current build wouldn't produce.
export const BUNDLED_ROUTE_CACHE_URL = 'data/route-cache-default.json.gz'

/**
 * Signature over everything a routed centerline is a function of: the seed plus road* (router
 * weights/geometry), water* (pond no-go discs), coarse noise + ridgeSharpness (the terrain
 * heightFn the router samples), the proto cost weights, and the design-grade window. Arrays
 * (roadArcRadii) are JSON-encoded. Pure — shared by the browser loader and the node bake script.
 */
export function routeCacheSig(worldSeed, params) {
    let s = 'v1|seed=' + worldSeed
    for (const k of Object.keys(params).sort()) {
        const v = params[k]
        if (typeof v === 'function') continue
        if (/^road|^water|^pond|^stream|^coarse|^w[A-Z]|^ridgeSharpness$|^designGradeWindow$|^maxGrade$/.test(k)) {
            s += '|' + k + '=' + (typeof v === 'object' ? JSON.stringify(v) : v)
        }
    }
    return s
}

/**
 * Fetch the bundled default-world cache; null unless its signature matches (worldSeed, params)
 * exactly — any other seed, or drifted params, just misses. Fire-and-forget on failure: the game
 * degrades to routing as usual.
 */
export async function loadBundledRouteCache(worldSeed, params) {
    try {
        const res = await fetch(BUNDLED_ROUTE_CACHE_URL)
        if (!res.ok) return null
        // The asset is committed gzipped. Some servers transparently Content-Encoding-decompress
        // .gz files, others serve raw bytes — detect the gzip magic and decompress ourselves only
        // when it's actually still compressed.
        const buf = new Uint8Array(await res.arrayBuffer())
        let text
        if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
            if (typeof DecompressionStream === 'undefined') return null
            text = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
        } else {
            text = new TextDecoder().decode(buf)
        }
        const rec = JSON.parse(text)
        return rec && rec.sig === routeCacheSig(worldSeed, params) ? rec.data : null
    } catch { return null }
}
