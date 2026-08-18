// src/route-store.js — QUAL-14 perf: bundled DEFAULT-WORLD route cache.
//
// Routed centerlines are pure functions of (worldSeed, routing-relevant params) — the QUAL-08
// worker-cache invariant — so the shipped default world's routes are baked at commit time into a
// static asset (data/route-cache-default.json) and imported on boot: the first world never routes
// at all. Nothing is persisted on the player's machine (user decision 2026-07-06: no per-world
// IndexedDB hoard — other seeds cache in in-session Maps only; save files may come later).
//
// WHAT THIS IS FOR (owner framing 2026-07-26 — PERF-26): a DEV convenience. It makes the owner's
// dev/playtest cycles on the default seed instant. It is NOT a cold-load optimization for players:
// it covers ONE seed. So do not reason about player load time from these assets being here — story
// mode on any other seed is the honest case, and story mode is the audience's actual entry point.
//
// TWO ASSETS, SPLIT BY WHEN THEY ARE NEEDED (PERF-26):
//   BASE   — spawn band + Quick Job planning radius. Awaited at boot; this is the QUAL-14 win that
//            makes the default world start without routing. Kept small on purpose.
//   REGION — the delta the FEAT-43 story region needs on top. Fetched in the BACKGROUND after boot
//            and awaited only by story entry, so free roam never pays for it.
// The split exists because the download is not the main cost: gzip is ~⅓ of the story, and the
// decompress + JSON.parse runs on the MAIN THREAD (the combined 8.31 MB asset was 24.85 MB of JSON,
// ~100 ms to inflate+parse on a fast machine and several hundred on an old one, plus the allocation
// spike) — and that is paid on EVERY load, cached or not. Keeping BASE small is what bounds it.
//
// STALENESS GUARD: `sig` (below) covers every routing-relevant PARAM, and the
// route-bundle-parity gate re-routes bundle edges with the live router and asserts byte-parity —
// so a router CODE change that alters geometry fails npm test until the asset is regenerated
// (scratchpad gen-default-route-cache.mjs pattern). A sig mismatch at load time simply MISSES —
// a stale record can never inject routes the current build wouldn't produce.
export const BUNDLED_ROUTE_CACHE_URL = 'data/route-cache-default.json.gz'
export const REGION_ROUTE_CACHE_URL = 'data/route-cache-region.json.gz'

/**
 * Signature over everything a routed centerline is a function of: the seed plus road* (router
 * weights/geometry), water* (pond no-go discs), coarse noise + ridgeSharpness (the terrain
 * heightFn the router samples), the proto cost weights, and the design-grade window. Arrays
 * (roadArcRadii) are JSON-encoded. Pure — shared by the browser loader and the node bake script.
 */
export function routeCacheSig(worldSeed, params) {
    let s = 'v2|seed=' + worldSeed   // FEAT-68: corridor router — every v1 bundle/IDB record must mismatch
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
 * Fetch one route-cache asset; null unless its signature matches (worldSeed, params) exactly — any
 * other seed, or drifted params, just misses. Fire-and-forget on failure: the game degrades to
 * routing as usual, which is also what every non-default seed already does.
 */
async function loadRouteCacheAsset(url, worldSeed, params) {
    try {
        const res = await fetch(url)
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

/** BASE: spawn band + Quick Job planning radius. Awaited at boot. */
export function loadBundledRouteCache(worldSeed, params) {
    return loadRouteCacheAsset(BUNDLED_ROUTE_CACHE_URL, worldSeed, params)
}

/**
 * REGION: the story-region delta on top of BASE. Fetched in the background after boot and awaited
 * only by story entry (PERF-26) — free roam never touches it. Merges into whatever BASE already
 * loaded, since importRouteCache loads INTO the live maps rather than replacing them.
 */
export function loadRegionRouteCache(worldSeed, params) {
    return loadRouteCacheAsset(REGION_ROUTE_CACHE_URL, worldSeed, params)
}
